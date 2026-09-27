// Shared by remote.html and display.html.
// Change a sound's name, icon, colour or shape here and both sides update.

// Colour is attention (colour psychology). Warm = less calm, look now; cool = calm; purple = a low hum.
//   red = danger · orange → amber → gold = traffic and other warnings, hottest first
//   blue / teal = people and home · purple = low tones, ambient, unknown
// Sounds are listed hottest first. `core` is the hot colour at the heart of the wave.
// `icon` names a shape in icons.js, drawn inside the dome that marks the sound's direction.
// `form` is the wave's shape; halo.js explains each number.
//   spiky ↔ soft (sharp) · dotted ↔ solid (grain) · large ↔ small (size) · tight ↔ broad waves (freq)
// `hear` is what the microphone listener (listen.js) listens for: YAMNet labels, plus the score one window
// needs to count (`weak`, confirmed by a second window) or to alert on its own (`strong`). Horn, siren,
// alarm, doorbell and knock use the Synesthesia app's thresholds; the rest are provisional.
export const SOUNDS = {
  fire:     { label: 'Alarm',      icon: 'alarm',    color: '#ff2e4d', core: '#ffb03a',
              form: { size: 1,   sharp: .95, grain: .08, freq: .85, flow: .1,  blob: 1,   beat: 'alarm', hazard: true },
              hear: { weak: .30, strong: .65, labels: ['Alarm', 'Fire alarm', 'Smoke detector, smoke alarm', 'Car alarm', 'Alarm clock', 'Buzzer'] } },
  siren:    { label: 'Siren',      icon: 'siren',    color: '#ff2e63', core: '#6f8bff',   // red and blue, like the lights
              form: { size: 1,   sharp: .7,  grain: 0,   freq: .7,  flow: .25, blob: .9,  beat: 'wail', hazard: true },
              hear: { weak: .25, strong: .60, labels: ['Siren', 'Police car (siren)', 'Ambulance (siren)', 'Fire engine, fire truck (siren)', 'Civil defense siren'] } },
  truck:    { label: 'Truck horn', icon: 'airhorn',  color: '#ff4a2e', core: '#ffb347',
              form: { size: 1,   sharp: .8,  grain: 0,   freq: .3,  flow: .15, blob: 1,   beat: 'blast', hazard: true },
              hear: { weak: .25, strong: .55, labels: ['Air horn, truck horn'] } },
  horn:     { label: 'Car horn',   icon: 'horn',     color: '#ff6a1a', core: '#ffe14d',
              form: { size: .9,  sharp: .85, grain: 0,   freq: .55, flow: .05, blob: 1,   beat: 'honk', hazard: true },
              hear: { weak: .25, strong: .55, labels: ['Vehicle horn, car horn, honking', 'Toot'] } },
  bus:      { label: 'Bus',        icon: 'bus',      color: '#ff8c1a', core: '#ff4f3a',
              form: { size: .95, sharp: .1,  grain: .05, freq: .08, flow: .5,  blob: .75, beat: 'rumble', hazard: true },
              hear: { weak: .35, strong: .65, labels: ['Bus'] } },
  bike:     { label: 'Bike bell',  icon: 'bikebell', color: '#ffb21f', core: '#fff07a',
              form: { size: .6,  sharp: .6,  grain: 0,   freq: .95, flow: 0,   blob: .8,  beat: 'ring', hazard: true },
              hear: { weak: .25, strong: .55, labels: ['Bicycle bell'] } },
  crackle:  { label: 'Crackling',  icon: 'leaf',     color: '#f5c542', core: '#fff2b0',
              form: { size: .5,  sharp: .5,  grain: .95, freq: .6,  flow: 0,   blob: .3,  beat: 'crackle' },
              hear: { weak: .30, strong: .60, labels: ['Crackle', 'Rustling leaves', 'Crumpling, crinkling'] } },
  name:     { label: 'Your name',  icon: 'person',   color: '#3d7bff', core: '#7ce8ff',   // not heard yet: needs a name-spotting model
              form: { size: .7,  blob: .8, bars: true } },
  speech:   { label: 'Talking',    icon: 'speech',   color: '#4f9dff', core: '#c2e4ff',
              form: { size: .55, blob: .7, bars: true },
              hear: { weak: .30, strong: .60, labels: ['Speech', 'Conversation', 'Narration, monologue'] } },
  doorbell: { label: 'Doorbell',   icon: 'bell',     color: '#14d2b9', core: '#8dffd9',
              form: { size: .6,  sharp: 0,   grain: .15, freq: .4,  flow: 0,   blob: .9,  beat: 'chime' },
              hear: { weak: .20, strong: .50, labels: ['Doorbell', 'Ding-dong'] } },
  knock:    { label: 'Knocking',   icon: 'door',     color: '#22b8e0', core: '#aef0ff',
              form: { size: .55, sharp: .45, grain: .1,  freq: .45, flow: 0,   blob: .85, beat: 'knock' },
              hear: { weak: .20, strong: .50, labels: ['Knock'] } },
  ambient:  { label: 'Ambient',    icon: 'music',    color: '#7b5cff', core: '#e08cff',
              form: { size: .4,  freq: .15, beat: 'breathe', omni: true },
              hear: { weak: .35, strong: .60, labels: ['Music', 'Hubbub, speech noise, speech babble', 'Crowd', 'Chatter'] } },
  behind:   { label: 'Unknown',    icon: 'ear',      color: '#a66bff', core: '#6b7bff',   // used by the real mic detector
              form: { size: .6,  sharp: .2,  grain: .3,  freq: .5,  flow: .2,  blob: .8,  beat: 'breathe' } },
};

// Fill in label/icon/colour/form from the catalogue unless the message overrides them.
export function resolve(a) {
  const s = SOUNDS[a.sound] || SOUNDS.behind;
  return { ...a, label: a.label || s.label, icon: a.icon || s.icon, color: a.color || s.color, core: a.core || s.core, form: s.form };
}

// Angles everywhere: degrees, 0 = ahead, +90 = right, -90 = left, 180 = behind.
export const wrap = (d) => { d = ((d + 180) % 360 + 360) % 360 - 180; return d === -180 ? 180 : d; };

export function dirWord(d) {
  d = wrap(d); const a = Math.abs(d), side = d > 0 ? 'right' : 'left';
  if (a <= 22.5) return 'ahead';
  if (a <= 67.5) return `ahead-${side}`;
  if (a <= 112.5) return side;
  if (a <= 157.5) return `behind-${side}`;
  return 'behind';
}

// Live connection to the laptop hub, with automatic reconnect.
// First tries a WebSocket. If that never manages to open (iPhone/iPad Safari refuses WebSockets to a
// self-signed certificate, and some networks block them), it switches to a fallback that uses plain
// https requests: Server-Sent Events to receive, a POST per message to send. Slightly slower, same messages.
// onState(state, transport): state = 'connecting' | 'open' | 'closed', transport = 'ws' | 'fallback'
export function connect(role, { onMessage, onState } = {}) {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?role=${role}`;
  const deliver = (text) => { let m; try { m = JSON.parse(text); } catch { return; } onMessage?.(m); };
  let ws, es, tries = 0, everOpened = false, failedOpens = 0, mode = 'ws';

  const openWS = () => {
    onState?.('connecting', 'ws');
    ws = new WebSocket(url);
    const guard = setTimeout(() => { if (ws.readyState !== 1) ws.close(); }, 3000);
    ws.onopen = () => { clearTimeout(guard); tries = 0; everOpened = true; onState?.('open', 'ws'); };
    ws.onmessage = (e) => deliver(e.data);
    ws.onclose = () => {
      clearTimeout(guard);
      if (!everOpened && ++failedOpens >= 2) return openFallback();   // WebSockets aren't getting through
      onState?.('closed', 'ws'); setTimeout(openWS, Math.min(4000, 400 * 2 ** tries++));
    };
    ws.onerror = () => ws.close();
  };

  const openFallback = () => {
    mode = 'fallback';
    console.warn('[hub] WebSocket blocked, using the https fallback');
    onState?.('connecting', 'fallback');
    es = new EventSource(`/events?role=${role}`);       // reconnects by itself
    es.onopen = () => onState?.('open', 'fallback');
    es.onmessage = (e) => deliver(e.data);
    es.onerror = () => onState?.(es.readyState === 2 ? 'closed' : 'connecting', 'fallback');
  };

  openWS();
  return {
    send(obj) {
      if (mode === 'fallback') {
        if (!es || es.readyState !== 1) return false;
        fetch(`/send?role=${role}`, { method: 'POST', body: JSON.stringify(obj) }).catch(() => {});
        return true;
      }
      if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
      return false;
    },
    get ready() { return mode === 'fallback' ? !!es && es.readyState === 1 : !!ws && ws.readyState === 1; },
    get transport() { return mode; },
  };
}
