# Synesthesia — start here

Tap a direction on one phone, and the sound appears on another device as a living wave that grows out of the edge of the view, on the side the sound "came from". The remote phone plays the sound too, and when you look toward it, a beacon marks where it came from. 55 sounds, from alarms and traffic to people, home, nature and music. The display can also listen for itself (a test mode, off by default): its microphone recognises the same sounds and shows them without anyone tapping.

```
Remote phone (/remote) ──┐
Mic detector  (/mic)   ──┼──► laptop: server.py ──► AR display (/display) ◄── its own microphone (listen.js)
Any script (POST /alert)─┘                          Android · iPhone · Quest · laptop
```

| File | What it is | Edit it when… |
|---|---|---|
| `server.py` | The hub. Serves the pages and passes every alert to every display. | You add a new input (e.g. a Python mic script). |
| `remote.html` | The remote: three screens you swipe between (Aim, Sounds, Ambience). Any phone or the laptop browser. | Changing the remote. |
| `sfx.js` | Every sound, synthesised on the device (no audio files), so the remote can play it. | **Changing how a sound sounds.** |
| `brand.css` | The Synesthesia look: colours, the backdrop, the wordmark and its font. Shared by every page. | Changing colours or the wordmark. |
| `display.html` | The AR view. One page, four modes (below), plus the start screen and settings. | Changing modes, chrome or the start screen. |
| `halo.js` | The visual language: draws every sound as a wave on the edge of the view. | **Changing how sounds look or move.** |
| `icons.js` | The icons that sit inside the waves and beacons (also used on the remote). | Adding or redrawing an icon. |
| `listen.js` | Sound recognition on the display: its microphone → YAMNet → the sounds in `common.js`. | Changing how often it listens or how detections are filtered. |
| `common.js` | Sound list (name, icon, colour, shape, what the microphone listens for) + connection code, shared by all pages. | Adding a sound, tuning its shape or its detection. |
| `forms.html` | Every sound's wave side by side, at `/forms`. | — (reload it after tuning a shape) |
| `mic.html` | Your stereo-mic "behind" detector, pointed at this hub. | — |
| `vendor/` | three.js, MediaPipe Tasks Audio, the YAMNet model and the Ultra font, stored locally so everything works without internet (see `vendor/NOTICES.md`). | Never. |

## 1. Run the hub (laptop)

```bash
cd "sound-ar-demo"
pip3 install aiohttp
python3 server.py
```

It prints the links to open. The page at `http://<laptop-ip>:8000/` lists them too.

## 2. Try it on the laptop alone (2 minutes)

1. Open `http://localhost:8000/display` → **Preview**.
2. Open `http://localhost:8000/remote` in a second window (or on your phone).
3. Pick a sound, then tap the dial. A wave grows out of the edge of the display on that side, and the remote plays the sound. Tap the bottom of the dial and it appears on the top edge (behind you), with a flash of light running round the edge. Drag or use ← → to turn toward it: the wave slides round to the bottom, and a beacon appears where the sound came from.
4. Keyboard in the preview: **T** = test sound, **1–9** and **0** = the first ten sounds, **C** = clear. Settings has a button for every sound.
5. Open `http://localhost:8000/display?demo` to watch it run through the conversation scenario and a few other sounds on its own.

### The remote's three screens

Swipe left and right, or tap the tabs at the top.

- **Aim:** pick a group (Danger, Traffic, People, Home, Nature, Low & music), pick a sound, and tap where it comes from. The display shows it there, and this phone plays it, panned left or right (on headphones) and muffled when it's behind. **Phone** turns the phone's sound off and on. **Snap 45°**, **Again** and **Clear** work as before.
- **Sounds:** every sound, to play on the phone only. Nothing is sent to the display. Tap again to stop.
- **Ambience:** sounds that go on (rain, a stream, waves, wind, birds, crickets, a fire, a crowd, music, children playing, typing, a clock, a washing machine, a vacuum, snoring, a storm), each a switch. Mix as many as you like. With **Show on the display** on, each one circles the display's edge while it plays and goes away when you switch it off.

The phone's sounds are made on the phone from a recipe each (in `sfx.js`), not recordings. They're sketches of the real thing. Talking, your name and shouting use the phone's own text-to-speech voice. On recent iPhones they play even with the ring switch on silent.

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
- **Camera view** (any phone, including iPhone): camera + gyro. This is the safe demo mode. It uses the **ultra-wide (0.5×) lens** when the phone offers one, so more of the room is in view. Change it in settings: **Normal 1×** or **Wide 0.5×**. If Wide can't find the lens, **Next camera** steps through every back camera (some Android phones list the ultra-wide as a separate camera). Each camera remembers its own field of view. AR mode always uses the normal lens (ARCore chooses the camera).
- **Preview**: no camera.

Before you start, point the phone the way you're facing. Each sound is placed relative to where you're facing when it arrives.

## 4. Quest later

Open `https://…/display` (or `/quest`) in the Quest Browser, then tap **Start AR**. It's the same page with passthrough. The Quest can't show normal web page elements over AR, so the halo is drawn onto a frame fixed 1 m in front of your eyes, 70° wide (`QUEST_FOV` in `display.html`).

## 5. Plugging in real detection

Anything that can send an HTTP request can trigger an alert:

```bash
curl -X POST http://localhost:8000/alert -d '{"sound":"siren","angle":150}'
# angle: 0 ahead, 90 right, -90 left, 180 behind
# angle null = all around (no direction), like an ambience
# sound: any key in SOUNDS in common.js (fire, siren, glass, dog, rain, …). See /forms for all 55.
# optional level: 0-1 loudness, sets how big the wave is (defaults to the sound's own size)
curl -X POST http://localhost:8000/send -d '{"type":"clear","sound":"rain"}'   # clear one sound (or leave out sound: all)
```

From Python: `requests.post("http://localhost:8000/alert", json={"sound": "name", "angle": -120})`

The stereo-mic page (`/mic`) already connects to the hub. Any "behind" detection becomes a violet wave on the top edge (behind you), limited to one every 1.5 s. Repeats of the same sound from about the same direction keep one wave alive instead of stacking new ones.

## 6. Listening: the display recognises sounds itself

The display can hear sounds with its own microphone and show them with no remote. This is a browser port of the listener in the [Synesthesia Android app](https://github.com/RishabhK12/synesthesia/tree/audio_classification). It uses the same YAMNet model (Google's 521-sound classifier) through the same MediaPipe Tasks Audio 0.10.21, maps the same YAMNet labels to sounds, and applies the same event filter. It all runs on the device. About a second of audio is kept in memory and is never recorded or sent.

- **Turn it on or off:** it's a test mode, **off by default** (the remote is the main way to test). Use the **Listen with the microphone** switch on the start screen, the mic button in the top bar, or **L**. The first time, the browser asks for the microphone.
- **What it hears:** almost every sound in the catalogue, from alarms, sirens and breaking glass to dogs, rain and music: 259 of YAMNet's labels, each mapped to one sound in `common.js`. "Your name" needs a name-spotting model, so only the remote can send it for now (the Android app uses sherpa-onnx for names). The washing machine has no YAMNet label. A general sound gives way to a more specific one heard with it (`yields` in `common.js`): a smoke alarm's beeps also score as a timer, so the timer steps aside.
- **It can't tell where a sound is yet,** so a heard sound doesn't grow from one side. Its ripples circle the whole edge instead, in the sound's own shape and colour, and move with how loud it is right now. A chip above the bottom edge shows the sound's icon and name. The wave stays while the sound goes on and fades about 3 s after it stops. Hazards still flash the edge and buzz.
- **How it decides:** every 0.5 s it classifies the last second of audio. A sound alerts at once when its score passes its `strong` threshold. Above `weak`, it needs a second window within 1.1 s. Hearings less than 1.5 s apart count as one event. Thresholds for horn, siren, alarm, doorbell and knock are the Android app's. The rest are provisional. They live in each sound's `hear` in `common.js`.
- **Sensitivity** in settings (low, normal, high) scales every threshold. Settings also shows the model's top three guesses live, which helps when tuning.
- **Known mistakes:** YAMNet scores someone whistling as "Alarm" as well as whistling, so whistling can trigger an alarm. The Android app does the same. Recorded or synthetic sounds are recognised less well than real ones. Of the remote's own synthesised sounds, 20 score above their threshold when fed straight to the model (alarm, siren, glass, crash, horn, car, bike bell, applause, whistling, doorbell, phone, timer, stream, waves, wind, birds, crickets, music, plane, clock). Played through a speaker into a microphone, expect fewer. The rest are for people to hear, not the model.
- **Quest:** tap **Allow the microphone now** on the start screen before **Start AR**. The browser can't ask once you're in the headset view.

## 7. The visual language

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

Also: `beat` (the rhythm it breathes with, taken from the sound itself: the alarm's three beeps, the siren's wail, a knock's three raps, a dog's woof-woof, a clock's tick-tock, waves rolling in… 52 of them, in `BEATS` in `halo.js`), `bars` (a voice: a waveform of bars either side of the marker; with a beat, the bars follow it), `hazard` (bigger surge on arrival) and `omni` (no single source, so a soft band all round the edge, fuller on its side).

**The beacon.** When the place a sound came from is in view, a beacon marks it: a soft glow in the sound's colours (soft, because the place is approximate), its ripples spreading out in its own form (spiky or round, dotted or solid, a ring of bars for a voice), its icon in a dome and its name. It fades as it nears the edge of the screen, where the wave takes over. Preview and camera view put it at eye height in the sound's direction, on the horizon (camera view follows the phone tilting up and down). In AR it's pinned to a spot in the room, 2.2 m away in the sound's direction at head height, so it stays put as you move. On Quest it's drawn on the same head-locked frame as the halo.

**Colour controls attention** (colour psychology). Warm sounds pull your eye and cool ones stay calm:

| Colour | Means | Sounds |
|---|---|---|
| Red | Danger | Alarm, siren, glass breaking, crash, scream |
| Orange → amber → gold | Look now: traffic and other warnings, hottest first | Truck horn, car horn, tyres screeching, train, reversing, bus, motorbike, car, bike bell |
| Pink | Someone needs you | Baby crying, shouting |
| Blue | People | Your name, talking, laughter, applause, cheering, singing, whistling, coughing, footsteps, children playing |
| Teal | Home | Doorbell, knocking, door, phone ringing, timer, kettle, running tap, toilet flush, dishes, keys, typing |
| Green (gold for fire) | Nature | Rain, stream, waves, wind, birdsong, crickets, dog barking, cat, crackling |
| Purple | A low hum or tone | Music, crowd (ambient), thunder, plane, vacuum, washing machine, snoring, clock ticking, unknown |

Each sound has a `color` (its body) and a `core` (the hot colour at its heart), a `group` (how the remote sorts it) and, if it goes on, `loop`. `SOUNDS` in `common.js` is in group order.

**Icons** tell you what the sound is: one for every sound, 55 in all. A sound's `icon` names a shape in `icons.js`, drawn dark and upright inside the dome that marks its direction, in its beacon, and on the remote. The dome grows to fit the icon, and icons are bigger for hazards. Spiky sounds keep their spikes around a rounder dome. Each is drawn on a 24×24 grid, either as a hand-written SVG path or built from parts (ellipses, rounded boxes, bars, arcs) that merge where they overlap and cut where they're holes. To add one, draw it there, add it to `ICONS`, and name it as a sound's `icon`.

**The look around the waves** (the start screen, the remote, `/forms`) is `brand.css`: a warm near-black, hot pink, coral and red swirling into violet-blue under film grain, and the SYNESTHESIA wordmark in Ultra with a red/blue fringe.

## 8. Where to change the look

- **Sounds, colours, shapes, icons:** `SOUNDS` in `common.js`, and the icon drawings in `icons.js`. Open `/forms` to see every sound side by side, in front, in the corner, off-screen and behind, and ▶ to hear it.
- **How a sound sounds on the remote:** its recipe in `R` in `sfx.js`. `tone`, `hiss` (filtered noise), `strike` (bells, glass, metal), `voice` (a vowel-shaped voice), `drop` (water) and `every` (repeats, for loops) are the building blocks.
- **How waves are drawn and move:** `halo.js`. `Halo.step()` sets size and placement, `Halo.h()` is the wave's outline, `dome()` is the direction marker, and `body()`, `grain()`, `badge()` (the icon), `speech()`, `omni()`, `sweep()` and `beacon()` draw each part.
- **Where a direction lands on the edge:** `Rim.toU()` in `halo.js`.
- **Colours, backdrop, wordmark:** `brand.css`. **Start screen, buttons, settings:** the CSS at the top of `display.html`.
- **Timing:** `ttl` (default 6000 ms) per alert. `FADE` at the top of `halo.js`.

## Troubleshooting

- **Listening says "mic blocked":** allow the microphone for this site in the browser's settings, then tap the mic button. Camera view and AR need https (see step 3). The laptop preview works on `localhost`.
- **Listening says "tap to start":** the browser wants a tap before it plays audio. Tap anywhere.
- **Nothing is heard:** open settings and look at the live guesses. If the level stays near the bottom, the browser is getting silence (another app may have the microphone). If the sound shows but under its threshold, try **high** sensitivity.

- **Remote says "no display":** the display page isn't open, or it's on a different network.
- **Remote says "reconnecting":** the Wi-Fi is blocking device-to-device traffic. Use a hotspot or the tunnel.
- **Start AR is greyed out:** the page isn't on https/localhost, or (on Android) you need Google Play Services for AR. Use camera view instead.
- **Waves reach the corner before the sound leaves the screen, or after (or the beacon sits beside the thing, not on it):** open settings on the display and adjust the field-of-view slider. The phone remembers the setting for each camera.
- **The remote plays nothing:** tap once first (browsers only play sound after a tap), check **Phone** is on, and turn the volume up. On older iPhones, the ring switch must be off silent.
- **Wide 0.5× says no lens was found:** the browser doesn't offer it. Try **Next camera**, or use Normal and a field of view to match.
- **Camera view drifts slowly:** that's normal gyro drift. Tap ✕ and start again, facing forward.
- **Debugging a phone:** for Android, plug it in by USB and open `chrome://inspect` on the laptop. For iPhone, use Safari → Develop menu. In the console, `__sar` shows the live state, `__sar.halo.voices` the waves, and `__sar.add('fire', 90)` draws a test sound.
