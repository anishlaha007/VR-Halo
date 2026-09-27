# Sound AR demo — start here

Tap a direction on one phone, and a card pops up in AR on another device, pinned where the sound "came from".

```
Remote phone (/remote) ──┐
Mic detector  (/mic)   ──┼──► laptop: server.py ──► AR display (/display)
Any script (POST /alert)─┘                          Android · iPhone · Quest · laptop
```

| File | What it is | Edit it when… |
|---|---|---|
| `server.py` | The hub. Serves the pages and passes every alert to every display. | You add a new input (e.g. a Python mic script). |
| `remote.html` | The tap dial. Any phone or the laptop browser. | Changing the remote's look. |
| `display.html` | The AR view. One page, four modes (below). | **All AR UI and animation work happens here.** |
| `common.js` | Sound list (name, icon, colour) + connection code, shared by both pages. | Adding or renaming a sound. |
| `mic.html` | Your stereo-mic "behind" detector, pointed at this hub. | — |
| `vendor/three.module.min.js` | three.js, stored locally so it works without internet. | Never. |

## 1. Run the hub (laptop)

```bash
cd "sound-ar-demo"
pip3 install aiohttp
python3 server.py
```

It prints the links to open. The page at `http://<laptop-ip>:8000/` lists them too.

## 2. Try it on the laptop alone (2 minutes)

1. Open `http://localhost:8000/display` → **Laptop preview**.
2. Open `http://localhost:8000/remote` in a second window (or on your phone).
3. Tap the dial. A card appears. Tap the bottom of the dial and you get an edge arrow + "Sound behind you". Drag or use ← → to turn toward it.
4. Keyboard in the preview: **T** = test sound, **C** = clear.

## 3. Two phones

All devices on the **same Wi-Fi or a phone hotspot**. Campus Wi-Fi usually blocks device-to-device traffic, so use a hotspot.

**Remote phone:** open `http://<laptop-ip>:8000/remote`. It works on plain http. The pill should say "1 display".

**Display phone:** needs **https** for the camera, motion sensors and AR. Pick one:

| Option | How | Best for |
|---|---|---|
| USB (Android) | `adb reverse tcp:8000 tcp:8000`, then open `http://localhost:8000/display` | Most reliable on Android |
| Self-signed | `python3 server.py --https`, then open `https://<laptop-ip>:8000/display` and tap **Advanced → Proceed** (iPhone: **Show details → visit this website**). Do the same for `/remote`. | Offline, iPhone |
| Tunnel | `cloudflared tunnel --url http://localhost:8000`, then open `<trycloudflare link>/display` | When devices can't reach each other |

Then choose a mode:

- **Start AR** (Android Chrome with ARCore, or Quest Browser): real AR. Cards are pinned in the room, so you can walk around them.
- **Start camera view** (any phone, including iPhone): camera + gyro. Cards follow your turning but not your walking. This is the safe demo mode.
- **Laptop preview**: no camera.

Before you start, point the phone the way you're facing. Each sound is placed relative to where you're facing when it arrives.

## 4. Quest later

Open `https://…/display` (or `/quest`) in the Quest Browser, then tap **Start AR**. It's the same page with passthrough. The Quest can't show normal web page elements over AR, so off-screen arrows are drawn in 3D and stay fixed in your view.

## 5. Plugging in real detection

Anything that can send an HTTP request can trigger an alert:

```bash
curl -X POST http://localhost:8000/alert -d '{"sound":"siren","angle":150}'
# angle: 0 ahead, 90 right, -90 left, 180 behind. sound: fire, siren, horn, bus, name, doorbell, behind
```

From Python: `requests.post("http://localhost:8000/alert", json={"sound": "name", "angle": -120})`

The stereo-mic page (`/mic`) already connects to the hub. Any "behind" detection becomes a purple 👂 card behind you, limited to one every 1.5 s.

## 6. Where to change the look

- **Sounds, icons, colours:** `SOUNDS` in `common.js`.
- **Phone cards, arrows, banner, radar:** the CSS at the top of `display.html` (`.card`, `.hint`, `#banner`, `#behindBar`), and `drawRadar()`.
- **AR/Quest cards:** `drawCard()` in `common.js` draws the texture. `xrPlace()` and `arFrame()` in `display.html` handle position, pop-in, ping ring and fade.
- **Timing:** `ttl` (default 6000 ms) per alert. `FADE_MS`, `CARD_DIST` and `CARD_W` are at the top of the script in `display.html`.

## Troubleshooting

- **Remote says "no display":** the display page isn't open, or it's on a different network.
- **Remote says "reconnecting":** the Wi-Fi is blocking device-to-device traffic. Use a hotspot or the tunnel.
- **Start AR is greyed out:** the page isn't on https/localhost, or (on Android) you need Google Play Services for AR. Use camera view instead.
- **Cards slide off-screen too early or too late:** open ⚙ on the display and adjust the field-of-view slider. The phone remembers the setting.
- **Camera view drifts slowly:** that's normal gyro drift. Tap ✕ and start again, facing forward.
- **Debugging a phone:** for Android, plug it in by USB and open `chrome://inspect` on the laptop. For iPhone, use Safari → Develop menu. In the console, `__sar` shows the live state.
