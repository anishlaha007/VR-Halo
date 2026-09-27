# Sound AR demo — start here

Tap a direction on one phone, and the sound appears on another device as a living wave that grows out of the edge of the view, on the side the sound "came from".

```
Remote phone (/remote) ──┐
Mic detector  (/mic)   ──┼──► laptop: server.py ──► AR display (/display)
Any script (POST /alert)─┘                          Android · iPhone · Quest · laptop
```

| File | What it is | Edit it when… |
|---|---|---|
| `server.py` | The hub. Serves the pages and passes every alert to every display. | You add a new input (e.g. a Python mic script). |
| `remote.html` | The tap dial. Any phone or the laptop browser. | Changing the remote's look. |
| `display.html` | The AR view. One page, four modes (below), plus the start screen and settings. | Changing modes, chrome or the start screen. |
| `halo.js` | The visual language: draws every sound as a wave on the edge of the view. | **Changing how sounds look or move.** |
| `common.js` | Sound list (name, icon, colour, shape) + connection code, shared by all pages. | Adding a sound or tuning its shape. |
| `forms.html` | Every sound's wave side by side, at `/forms`. | — (reload it after tuning a shape) |
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
3. Tap the dial. A wave grows out of the edge of the display on that side. Tap the bottom of the dial and it appears on the top edge (behind you), with a flash of light running round the edge. Drag or use ← → to turn toward it and watch it slide round to the bottom.
4. Keyboard in the preview: **T** = test sound, **1–9** = each sound, **C** = clear.
5. Open `http://localhost:8000/display?demo` to watch it run through the conversation scenario and a few other sounds on its own.

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

- **Start AR** (Android Chrome with ARCore, or Quest Browser): real AR over the camera, tracked by ARCore.
- **Camera view** (any phone, including iPhone): camera + gyro. This is the safe demo mode.
- **Preview**: no camera.

Before you start, point the phone the way you're facing. Each sound is placed relative to where you're facing when it arrives.

## 4. Quest later

Open `https://…/display` (or `/quest`) in the Quest Browser, then tap **Start AR**. It's the same page with passthrough. The Quest can't show normal web page elements over AR, so the halo is drawn onto a frame fixed 1 m in front of your eyes, 70° wide (`QUEST_FOV` in `display.html`).

## 5. Plugging in real detection

Anything that can send an HTTP request can trigger an alert:

```bash
curl -X POST http://localhost:8000/alert -d '{"sound":"siren","angle":150}'
# angle: 0 ahead, 90 right, -90 left, 180 behind
# sound: fire, siren, horn, bus, name, doorbell, crackle, ambient, behind
# optional level: 0-1 loudness, sets how big the wave is (defaults to the sound's own size)
```

From Python: `requests.post("http://localhost:8000/alert", json={"sound": "name", "angle": -120})`

The stereo-mic page (`/mic`) already connects to the hub. Any "behind" detection becomes a violet wave on the top edge (behind you), limited to one every 1.5 s. Repeats of the same sound from about the same direction keep one wave alive instead of stacking new ones.

## 6. The visual language

Each sound is a wave that grows out of the edge of the view, only on the stretch of edge that faces the sound. The edge is a ring around you:

```
              top edge = behind you
     ┌─────────────────────────────────┐
left │                                 │ right
     └─────────────────────────────────┘
        bottom edge = in front of you
```

- **In view:** the wave sits on the bottom edge, right under the sound, and slides along it as you turn.
- **Leaving the view:** it slides into the bottom corner, then flattens against the side edge.
- **Behind you:** it climbs to the top corners and the top edge. Hazards and anything behind you also send a flash of light running round the whole edge.

A sound's shape says what kind of sound it is. Each sound's `form` in `common.js` sets it:

| Setting | 0 | 1 | Used for |
|---|---|---|---|
| `size` | small, quiet | large, loud | loudness (an alert's `level` overrides it) |
| `sharp` | soft round bumps | pointed spikes | harsh or urgent sounds |
| `grain` | solid | dotted spray | crackling, rustling |
| `freq` | a few broad swells | many tight ripples | low vs high pitch |
| `flow` | separate bumps | one continuous band | steady rumbles |
| `blob` | no marker | big marker | the bump that marks the exact direction |

Also: `beat` (the rhythm it breathes with: `breathe`, `alarm`, `wail`, `honk`, `rumble`, `chime`, `crackle`), `bars` (speech: a waveform of bars either side of the marker), `hazard` (bigger surge on arrival) and `omni` (no single source, so a soft band all round the edge, fuller on its side). Colour is the category, and red means danger.

## 7. Where to change the look

- **Sounds, colours, shapes:** `SOUNDS` in `common.js`. Open `/forms` to see every sound side by side, in front, in the corner, off-screen and behind.
- **How waves are drawn and move:** `halo.js`. `Halo.step()` sets size and placement, `Halo.h()` is the wave's outline, and `body()`, `grain()`, `speech()`, `omni()` and `sweep()` draw each kind.
- **Where a direction lands on the edge:** `Rim.toU()` in `halo.js`.
- **Start screen, buttons, settings:** the CSS at the top of `display.html`.
- **Timing:** `ttl` (default 6000 ms) per alert. `FADE` at the top of `halo.js`.

## Troubleshooting

- **Remote says "no display":** the display page isn't open, or it's on a different network.
- **Remote says "reconnecting":** the Wi-Fi is blocking device-to-device traffic. Use a hotspot or the tunnel.
- **Start AR is greyed out:** the page isn't on https/localhost, or (on Android) you need Google Play Services for AR. Use camera view instead.
- **Waves reach the corner before the sound leaves the screen, or after:** open settings on the display and adjust the field-of-view slider. The phone remembers the setting.
- **Camera view drifts slowly:** that's normal gyro drift. Tap ✕ and start again, facing forward.
- **Debugging a phone:** for Android, plug it in by USB and open `chrome://inspect` on the laptop. For iPhone, use Safari → Develop menu. In the console, `__sar` shows the live state, `__sar.halo.voices` the waves, and `__sar.add('fire', 90)` draws a test sound.
