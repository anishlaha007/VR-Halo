#!/usr/bin/env python3
"""
Sound AR demo hub. Runs on the laptop.

Every other device connects here. Nothing talks to anything else directly.

    phone remote (/remote)  ─┐
    mic detector (/mic)     ─┼─►  this server  ─►  AR display (/display)
    any script (POST /alert)─┘                     (Android, iPhone, Quest, laptop)

Setup:
    pip install aiohttp
    python3 server.py              # plain http (use adb reverse or cloudflared for AR)
    python3 server.py --https      # self-signed https, works offline on a hotspot

Send an alert from any script or terminal:
    curl -X POST http://localhost:8000/alert -d '{"sound":"fire","angle":180}'
    (angle: 0 = ahead, 90 = right, -90 = left, 180 = behind; optional level: 0-1 loudness)
"""
import argparse
import asyncio
import itertools
import json
import os
import shutil
import socket
import ssl
import subprocess
import time

from aiohttp import WSMsgType, web

HERE = os.path.dirname(os.path.abspath(__file__))
CLIENTS: dict = {}            # websocket -> role ("remote", "display", "mic", ...)
IDS = itertools.count(1)
LAST_MIC_ALERT = 0.0
MIC_COOLDOWN_S = 1.5          # stops one clap/siren from firing ten alerts


# ---------- helpers ----------
def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # no packet is sent; this just picks the Wi-Fi interface
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def wrap_angle(a: float) -> float:
    """Any angle -> (-180, 180]. 0 = ahead, +90 = right, 180 = behind."""
    a = (a + 180.0) % 360.0 - 180.0
    return 180.0 if a == -180.0 else a


def make_alert(src: dict, source: str) -> dict:
    """Clean up an incoming alert so every display receives the same shape."""
    try:
        angle = float(src.get("angle", 180))
    except (TypeError, ValueError):
        angle = 180.0
    alert = {
        "type": "alert",
        "id": next(IDS),
        "sound": str(src.get("sound", ""))[:32],
        "angle": round(wrap_angle(angle), 1),
        "ttl": int(src.get("ttl", 6000)),
        "source": source,
        "ts": int(time.time() * 1000),
    }
    for k in ("label", "icon", "color", "cid"):   # optional overrides; display fills in the rest
        if src.get(k):
            alert[k] = str(src[k])[:40]
    try:                                            # optional loudness 0-1: sets how big the wave is
        if src.get("level") is not None:
            alert["level"] = round(min(1.0, max(0.0, float(src["level"]))), 3)
    except (TypeError, ValueError):
        pass
    return alert


def counts() -> dict:
    roles = list(CLIENTS.values())
    return {"type": "status", "displays": roles.count("display"),
            "remotes": roles.count("remote"), "mics": roles.count("mic")}


async def broadcast(msg: dict, exclude=None) -> None:
    data = json.dumps(msg)
    for c in list(CLIENTS):
        if c is exclude or c.closed:
            continue
        try:
            if isinstance(c, SSEClient):
                c.queue.put_nowait(data)
            else:
                await c.send_str(data)
        except (ConnectionError, RuntimeError, asyncio.QueueFull):
            pass


def log_alert(a: dict) -> None:
    side = "behind" if abs(a["angle"]) > 135 else "right" if a["angle"] > 45 else "left" if a["angle"] < -45 else "ahead"
    name = a.get("label") or a["sound"] or "sound"
    print(f"  alert #{a['id']:<4} {name:<14} {a['angle']:>7.1f}°  ({side})  from {a['source']}  -> {counts()['displays']} display(s)")


# ---------- handlers ----------
class SSEClient:
    """A browser on the fallback connection (Server-Sent Events). Used when WebSockets are blocked,
    e.g. iPhone/iPad Safari with the self-signed certificate."""
    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=200)
        self.closed = False


async def handle(data: dict, role: str) -> None:
    """One message from any device, over WebSocket or the fallback. Same rules either way."""
    global LAST_MIC_ALERT
    kind = data.get("type")
    if kind == "alert":
        a = make_alert(data, source=role)
        log_alert(a)
        await broadcast(a)            # sender gets it too, as delivery confirmation
    elif kind == "clear":
        print("  clear all")
        await broadcast({"type": "clear"})
    elif kind == "sound":             # your existing stereo-mic detector page
        if data.get("zone") == "behind" and time.time() - LAST_MIC_ALERT > MIC_COOLDOWN_S:
            LAST_MIC_ALERT = time.time()
            a = make_alert({"sound": "behind", "angle": 180}, source="mic")
            log_alert(a)
            await broadcast(a)


async def ws_handler(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse(heartbeat=15)
    await ws.prepare(request)
    role = request.query.get("role", "mic")   # the old mic page doesn't say, so default to mic
    CLIENTS[ws] = role
    print(f"+ {role} connected ({request.remote})")
    await broadcast(counts())
    try:
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                continue
            try:
                data = json.loads(msg.data)
            except ValueError:
                continue
            if isinstance(data, dict):
                await handle(data, role)
    finally:
        CLIENTS.pop(ws, None)
        print(f"- {role} disconnected")
        await broadcast(counts())
    return ws


async def sse_handler(request: web.Request) -> web.StreamResponse:
    """Fallback receive channel: a long-lived https response the server keeps writing to."""
    role = request.query.get("role", "display")
    resp = web.StreamResponse(headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache",
                                       "X-Accel-Buffering": "no"})
    await resp.prepare(request)
    client = SSEClient()
    CLIENTS[client] = role
    print(f"+ {role} connected ({request.remote}, fallback)")
    await broadcast(counts())
    try:
        await resp.write(b": hello\n\n")
        while True:
            try:
                msg = await asyncio.wait_for(client.queue.get(), timeout=15)
                await resp.write(f"data: {msg}\n\n".encode())
            except asyncio.TimeoutError:
                await resp.write(b": keepalive\n\n")   # stops Wi-Fi/tunnels from closing an idle line
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        client.closed = True
        CLIENTS.pop(client, None)
        print(f"- {role} disconnected (fallback)")
        await broadcast(counts())
    return resp


async def send_handler(request: web.Request) -> web.Response:
    """Fallback send channel: each tap is one small https POST."""
    try:
        data = json.loads(await request.text())
    except ValueError:
        return web.json_response({"error": "send JSON"}, status=400)
    if isinstance(data, dict):
        await handle(data, request.query.get("role", "remote"))
    return web.json_response({"ok": True})


async def post_alert(request: web.Request) -> web.Response:
    """For detector scripts: POST JSON, or GET /alert?sound=fire&angle=180 from a browser."""
    if request.method == "POST":
        try:
            data = json.loads(await request.text())
            if not isinstance(data, dict):
                raise ValueError
        except ValueError:
            return web.json_response({"error": "send JSON"}, status=400)
    else:
        data = dict(request.query)
    a = make_alert(data, source=data.get("source", "script"))
    log_alert(a)
    await broadcast(a)
    return web.json_response(a)


def page(name: str):
    async def handler(_request):
        return web.FileResponse(os.path.join(HERE, name), headers={"Cache-Control": "no-store"})
    return handler


async def index(request: web.Request) -> web.Response:
    base = f"{request.scheme}://{request.host}"
    links = [("remote", "Tap remote — pick a sound, tap a direction"),
             ("display", "AR display — Android, iPhone, Quest or laptop preview")]
    if os.path.exists(os.path.join(HERE, "mic.html")):
        links.append(("mic", "Stereo mic detector — real sounds from behind"))
    links.append(("forms", "Forms — every sound's wave side by side"))
    items = "".join(f'<a href="/{p}"><b>/{p}</b><span>{d}</span></a>' for p, d in links)
    html = f"""<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<title>Sound AR hub</title><style>
body{{margin:0;background:#0b0e13;color:#e8ecf1;font:16px/1.4 system-ui,sans-serif;padding:24px 16px;max-width:520px;margin:auto}}
a{{display:block;background:#161b23;border-radius:14px;padding:16px;margin:10px 0;color:inherit;text-decoration:none}}
b{{display:block;font-size:19px;color:#7fb2ff}} span{{color:#8b95a3;font-size:14px}} code{{color:#8b95a3}}
</style><h1>Sound AR hub</h1><p>Open these on each device:</p>{items}
<p><code>{base}</code></p>"""
    return web.Response(text=html, content_type="text/html")


# ---------- https (optional) ----------
def self_signed_ctx(ip: str) -> ssl.SSLContext:
    cert_dir = os.path.join(HERE, "certs")
    crt, key = os.path.join(cert_dir, "cert.pem"), os.path.join(cert_dir, "key.pem")
    stamp = os.path.join(cert_dir, "ip.txt")
    if not (os.path.exists(crt) and os.path.exists(stamp) and open(stamp).read() == ip):
        if not shutil.which("openssl"):
            raise SystemExit("--https needs the openssl command (built into macOS).")
        os.makedirs(cert_dir, exist_ok=True)
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30",
                        "-keyout", key, "-out", crt, "-subj", "/CN=sound-ar-demo",
                        "-addext", f"subjectAltName=IP:{ip},IP:127.0.0.1,DNS:localhost"],
                       check=True, capture_output=True)
        open(stamp, "w").write(ip)
    ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ctx.load_cert_chain(crt, key)
    return ctx


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--https", action="store_true", help="serve over self-signed https (offline AR)")
    args = ap.parse_args()

    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/ws", ws_handler)
    app.router.add_get("/events", sse_handler)
    app.router.add_post("/send", send_handler)
    app.router.add_route("*", "/alert", post_alert)
    for route, name in [("/remote", "remote.html"), ("/display", "display.html"),
                        ("/phone", "display.html"), ("/quest", "display.html"), ("/mic", "mic.html"),
                        ("/forms", "forms.html")]:
        app.router.add_get(route, page(name))
    app.router.add_get("/common.js", page("common.js"))
    app.router.add_get("/halo.js", page("halo.js"))
    app.router.add_get("/icons.js", page("icons.js"))
    app.router.add_static("/vendor", os.path.join(HERE, "vendor"))

    ip = lan_ip()
    ctx = self_signed_ctx(ip) if args.https else None
    scheme = "https" if ctx else "http"
    print("\n  Sound AR hub is running\n")
    print(f"  Remote   (tap phone)  : {scheme}://{ip}:{args.port}/remote")
    print(f"  Display  (AR phone)   : {scheme}://{ip}:{args.port}/display")
    print(f"  Laptop preview        : {scheme}://localhost:{args.port}/display")
    if not ctx:
        print("\n  AR/camera need https. Pick one:")
        print(f"    Android over USB : adb reverse tcp:{args.port} tcp:{args.port}  ->  http://localhost:{args.port}/display")
        print(f"    Any network      : cloudflared tunnel --url http://localhost:{args.port}  ->  <link>/display")
        print("    Offline hotspot  : python3 server.py --https  (tap through the certificate warning once)")
    else:
        print("\n  Self-signed cert: on each phone, open the link, tap Advanced/Show details -> proceed.")
    print("\n  Ctrl+C to stop.\n")
    web.run_app(app, host="0.0.0.0", port=args.port, ssl_context=ctx, print=None, access_log=None)


if __name__ == "__main__":
    main()
