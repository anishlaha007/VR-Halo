// Shared by remote.html and display.html.
// Change a sound's name, icon or colour here and both sides update.

// Colour = category, so users learn it at a glance:
//   red = danger, amber = vehicle, blue = person, teal = home, purple = unknown/mic
export const SOUNDS = {
  fire:     { label: 'Fire alarm',  icon: '🔥', color: '#ff4d4f' },
  siren:    { label: 'Siren',       icon: '🚨', color: '#ff4d4f' },
  horn:     { label: 'Car horn',    icon: '📯', color: '#f5a524' },
  bus:      { label: 'Bus',         icon: '🚌', color: '#f5a524' },
  name:     { label: 'Your name',   icon: '🗣️', color: '#5b9dff' },
  doorbell: { label: 'Doorbell',    icon: '🔔', color: '#2fd1b5' },
  behind:   { label: 'Sound',       icon: '👂', color: '#b98cff' },   // used by the real mic detector
};

// Fill in label/icon/colour from the catalogue unless the message overrides them.
export function resolve(a) {
  const s = SOUNDS[a.sound] || SOUNDS.behind;
  return { ...a, label: a.label || s.label, icon: a.icon || s.icon, color: a.color || s.color };
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

// Draws an alert card onto a canvas. The Quest/Android AR mode uses it as a texture.
export function drawCard(a, { sub = '', w = 640, h = 220 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), r = 44, pad = 10;
  const rr = (x, y, ww, hh, rad) => { g.beginPath(); g.roundRect(x, y, ww, hh, rad); };
  // glow + body
  g.shadowColor = a.color; g.shadowBlur = 26;
  rr(pad, pad, w - 2 * pad, h - 2 * pad, r); g.fillStyle = 'rgba(12,16,22,0.86)'; g.fill();
  g.shadowBlur = 0; g.lineWidth = 6; g.strokeStyle = a.color; g.stroke();
  // icon disc
  const cx = pad + 100, cy = h / 2;
  g.beginPath(); g.arc(cx, cy, 70, 0, Math.PI * 2); g.fillStyle = a.color + '33'; g.fill();
  g.font = '84px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(a.icon, cx, cy + 4);
  // text
  g.textAlign = 'left'; g.fillStyle = '#fff';
  g.font = '700 62px system-ui,-apple-system,Roboto,sans-serif'; g.fillText(a.label, cx + 100, sub ? cy - 26 : cy, w - cx - 130);
  if (sub) { g.fillStyle = '#aab4c2'; g.font = '500 40px system-ui,-apple-system,Roboto,sans-serif'; g.fillText(sub, cx + 100, cy + 42, w - cx - 130); }
  return c;
}
