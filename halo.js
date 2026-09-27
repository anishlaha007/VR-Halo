// The display's visual language. Each sound is a living wave that grows out of the edge of the
// view, only on the stretch of edge that faces the sound.
//
// The edge is a ring around you:
//
//                 top = behind you
//        ┌──────────────────────────────┐
//   left │                              │ right
//        └──────────────────────────────┘
//      bottom = in front of you (a sound you can see sits right below it)
//
// The corners are the diagonals, so a sound ahead-right lives in the bottom-right corner.
//
// How a sound looks comes from its `form` in common.js:
//   size   0–1  loudness → how tall and wide the wave is (an alert's `level` overrides it)
//   sharp  0–1  round bumps → pointed spikes
//   grain  0–1  solid → dotted spray
//   freq   0–1  a few broad swells (low pitch) → many tight ripples (high pitch)
//   flow   0–1  separate bumps → one continuous band
//   blob   0–1  size of the bump that marks the exact direction
//   beat        rhythm it breathes with: breathe, alarm, wail, honk, blast, ring, rumble, chime, crackle
//   bars        speech: a row of bars either side of the marker, like a voice waveform
//   hazard      bigger surge on arrival
//   omni        no single source (ambient): a soft band around the whole edge, fuller on its side
// A sound's `icon` (icons.js) sits upright inside the marker, which grows into a dome big enough to hold it.
import { wrap } from '/common.js';
import { iconPath } from '/icons.js';

const D2R = Math.PI / 180;
const FADE = 900;                     // ms a wave takes to sink back into the edge
const AMAX = 130;                     // px, tallest a wave gets on a big screen

const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const backOut = (x, c) => { x -= 1; return 1 + (c + 1) * x * x * x + c * x * x; };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const noise = (x, seed = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i + seed * 57.31), hash(i + 1 + seed * 57.31), u); };
// max() with a rounded crease, so bumps melt into each other instead of meeting at a corner
const smax = (a, b, r) => { const d = Math.max(r - Math.abs(a - b), 0); return Math.max(a, b) + d * d / (4 * r); };
const rgb = (c) => {
  const m = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(c || '');
  if (!m) return [166, 107, 255];
  const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1], n = parseInt(h, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a < 0 ? 0 : a > 1 ? 1 : a.toFixed(3)})`;

// Rhythms: loudness over time, roughly 0.4–1.2. t = seconds since the sound arrived.
const BEATS = {
  breathe: (t) => 0.9 + 0.1 * Math.sin(t * 2.1),
  alarm: (t) => {                     // three beeps, then a pause (the fire-alarm pattern)
    const c = t % 3.6; let b = 0;
    for (const s of [0, 0.9, 1.8]) b = Math.max(b, sstep(s, s + 0.05, c) * (1 - sstep(s + 0.45, s + 0.6, c)));
    return 0.5 + 0.62 * b;
  },
  wail: (t) => 0.86 + 0.14 * Math.sin(t * 2.6),
  honk: (t) => { const c = t % 3.2; return 0.5 + 0.65 * Math.max(sstep(0, 0.04, c) * (1 - sstep(0.3, 0.4, c)), sstep(0.5, 0.54, c) * (1 - sstep(1.1, 1.3, c))); },
  blast: (t) => { const c = t % 4; return 0.5 + 0.7 * sstep(0, 0.06, c) * (1 - sstep(1.5, 1.8, c)); },          // one long air-horn blast
  ring: (t) => {                      // bike bell: two quick trills
    const c = t % 2.4, on = Math.max(sstep(0, 0.02, c) * (1 - sstep(0.35, 0.45, c)), sstep(0.55, 0.57, c) * (1 - sstep(0.9, 1, c)));
    return 0.45 + 0.7 * on * (0.85 + 0.15 * Math.sin(t * 55));
  },
  rumble: (t, s) => 0.8 + 0.2 * noise(t * 1.6, s),
  chime: (t) => { const c = t % 2.8; return 0.42 + 0.7 * sstep(0, 0.03, c) * Math.max(Math.exp(-c * 2.6), c > 0.55 ? 0.85 * Math.exp(-(c - 0.55) * 2.6) : 0); },
  crackle: (t, s) => 0.6 + 0.4 * noise(t * 6, s),
  speech: (t, s) => noise(t * 4.6, s) * sstep(0.28, 0.5, noise(t * 0.6, s + 7)),   // syllables, with pauses between phrases
};

// The screen edge as a loop, measured in px along the edge.
// u = 0 is the bottom centre, positive u runs right and up the right side, ±half is the top centre.
// Distances are measured along a rounded-corner path so the direction waves grow in turns smoothly
// round each corner (towards the corner's centre, so tall waves never fold over themselves), but every
// point is pushed out onto the real screen edge, so waves still rise from the very corner of the screen.
// In a corner the normal is stretched by however far it was pushed, so a wave keeps its shape there.
class Rim {
  constructor(W, H, R) {
    const a = W / 2 - R, q = R * Math.PI / 2, c = H - 2 * R;
    Object.assign(this, { W, H, R, a, ends: [a, a + q, a + q + c, a + 2 * q + c], half: 2 * a + 2 * q + c });
    this.corner = a + q / 2;          // bottom-right corner (ahead-right)
    this.side = a + q + c / 2;        // middle of the right edge (right)
    this.back = a + 1.5 * q + c;      // top-right corner (behind-right)
  }
  wrapU(u) { const L = 2 * this.half; return ((u + this.half) % L + L) % L - this.half; }

  // Point on the screen edge at u, plus the normal pointing into the screen (1 px of wave height).
  at(u, p) {
    const { W, H, R, a, ends } = this;
    u = this.wrapU(u);
    const flip = u < 0; u = Math.abs(u);
    const arc = (cx, cy, th) => { const c = Math.cos(th), s = Math.sin(th), k = 1 / Math.max(Math.abs(c), Math.abs(s)); p.x = cx + R * k * c; p.y = cy + R * k * s; p.nx = -c * k; p.ny = -s * k; };
    if (u <= ends[0]) { p.x = W / 2 + u; p.y = H; p.nx = 0; p.ny = -1; }
    else if (u <= ends[1]) arc(W - R, H - R, Math.PI / 2 - (u - a) / R);
    else if (u <= ends[2]) { p.x = W; p.y = H - R - (u - ends[1]); p.nx = -1; p.ny = 0; }
    else if (u <= ends[3]) arc(W - R, R, -(u - ends[2]) / R);
    else { p.x = W - R - (u - ends[3]); p.y = 0; p.nx = 0; p.ny = 1; }
    if (flip) { p.x = W - p.x; p.nx = -p.nx; }
    return p;
  }

  // Direction (degrees, 0 = where you look, + = right) → place on the edge.
  // Inside the field of view it sits under the sound, so it lines up with what you see;
  // outside, it runs through the corner, up the side and round to the top as the sound goes behind.
  toU(rel, fov) {
    const r = Math.abs(rel), h = clamp(fov / 2, 10, 80), { W, a } = this;
    let u;
    if (r <= h) { const x = (W / 2) * Math.tan(r * D2R) / Math.tan(h * D2R); u = x <= a ? x : a + this.R * (Math.PI / 2 - Math.atan2(this.R, x - a)); }
    else if (r <= 90) u = lerp(this.corner, this.side, (r - h) / (90 - h));
    else if (r <= 135) u = lerp(this.side, this.back, (r - 90) / 45);
    else u = lerp(this.back, this.half, (r - 135) / 45);
    return rel < 0 ? -u : u;
  }
}

export class Halo {
  constructor(canvas, size, dpr) {
    this.voices = []; this.last = 0; this.p = { x: 0, y: 0, nx: 0, ny: 0 };
    this.buf = { x: new Float32Array(0) };
    this.use(canvas, size, dpr);
  }

  // Draw onto `canvas`. Pass `size` ([w, h]) for a fixed-size canvas (the Quest texture, the forms page);
  // otherwise it fills the window.
  use(canvas, size = null, dpr = 1) { this.cv = canvas; this.g = canvas.getContext('2d'); this.size = size; this.fixedDpr = dpr; this.W = 0; }

  // a: { key, color, core, form, yaw, ttl, level, alert }. yaw = world direction in degrees.
  // The same sound again from about the same direction keeps the wave alive instead of stacking a second one.
  add(a, now = performance.now()) {
    const f = a.form || {}, ttl = a.ttl || 6000;
    const same = this.voices.find(v => v.key === a.key && v.end - now > FADE && (f.omni || Math.abs(wrap(v.yaw - a.yaw)) < 30));
    if (same) { Object.assign(same, { yaw: a.yaw, end: now + ttl, fadeLen: FADE, kick: now }); if (a.alert) same.sweep = now; return same; }
    const v = {
      key: a.key, form: f, yaw: a.yaw, size: clamp(+(a.level ?? f.size ?? 0.6) || 0.6, 0, 1),
      c1: rgb(a.color), c2: rgb(a.core || a.color), icon: iconPath(a.icon), born: now, end: now + ttl, fadeLen: FADE,
      kick: 0, sweep: a.alert ? now : 0, seed: Math.random() * 100, u: null, vel: 0, dots: [], acc: 0,
    };
    this.voices.push(v);
    return v;
  }

  clear(now = performance.now()) { for (const v of this.voices) if (v.end > now + 450) { v.end = now + 450; v.fadeLen = 450; } }

  fit() {
    const [W, H] = this.size || [innerWidth, innerHeight];
    const dpr = this.size ? this.fixedDpr : Math.min(devicePixelRatio || 1, 2);
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    Object.assign(this, { W, H, dpr, U: Math.min(W, H) });
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    // corner radius ≥ the tallest wave, so waves bend round a corner without folding over themselves
    this.rim = new Rim(W, H, Math.min(clamp(this.U * 0.2, 20, AMAX) * 1.35, this.U / 2 - 1));
  }

  // heading = where you're looking (same degrees as yaw); fov = horizontal field of view on screen.
  draw(now, heading = 0, fov = 60) {
    this.fit();
    const { g, dpr, W, H } = this, dt = this.last ? clamp((now - this.last) / 1000, 0, 0.05) : 0;
    this.last = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    this.voices = this.voices.filter(v => now < v.end);
    this.voices.sort((a, b) => !!b.form.omni - !!a.form.omni);   // ambient underneath
    for (const v of this.voices) this.step(v, now, dt, heading, fov);
    for (const v of this.voices) if (!v.form.omni) this.scrim(v);
    g.globalCompositeOperation = 'screen';                         // overlapping sounds mix their colours
    for (const v of this.voices) {
      if (v.form.omni) { this.omni(v); continue; }
      if (v.form.bars) this.speech(v);
      else { this.body(v, -v.k.spread, v.k.spread); this.grain(v, now, dt); }
      if (v.icon) this.badge(v);
    }
    for (const v of this.voices) if (v.sweep) this.sweep(v, now);
    g.globalCompositeOperation = 'source-over'; g.shadowBlur = 0;
  }

  // Everything about a voice for this frame: where it sits, how big, how far through its life.
  step(v, now, dt, heading, fov) {
    const { rim, U } = this, f = v.form, age = Math.max(0, now - v.born), t = age / 1000;
    const rise = backOut(Math.min(1, age / 650), f.hazard ? 2.4 : 1.5);
    const fall = sstep(0, v.fadeLen, v.end - now);
    const kick = v.kick ? 0.3 * Math.exp(-(now - v.kick) / 280) : 0;
    const level = f.bars ? 1 : (BEATS[f.beat] || BEATS.breathe)(t, v.seed);
    const life = rise * fall;

    const rel = wrap(v.yaw - heading), target = rim.toU(rel, fov);
    if (v.u == null) v.u = target;
    const d = rim.wrapU(target - v.u) * (1 - Math.exp(-dt * 12));   // glide, don't jump, when you turn
    v.u = rim.wrapU(v.u + d); v.vel = dt ? d / dt : 0;
    const stretch = Math.min(0.5, Math.abs(v.vel) / 2600);            // smears a little when moving fast
    const off = sstep(fov / 2 - 2, fov / 2 + 14, Math.abs(rel));      // off-screen: flattens against the side

    const A0 = clamp(U * (0.08 + 0.12 * v.size), 20, AMAX) * life, A = A0 * (level + kick);
    const rd = v.icon ? A0 * (f.hazard ? 0.72 : 0.6) : 0;            // smallest dome that holds the icon (bigger when it matters)
    const spread = clamp(U * (0.16 + 0.22 * v.size), 60, 300) * (1 + stretch) * (0.75 + 0.25 * Math.min(1, life));
    let lam = clamp(U * (0.19 - 0.145 * (f.freq ?? 0.5)), 9, 110);
    if (f.beat === 'wail') lam *= 1 + 0.3 * Math.sin(t * 2.6 + 1);   // the siren's pitch sweeping up and down
    const blob = f.blob ?? 0.8, sharp = f.sharp || 0;
    v.k = {
      t, A, spread, lam, sharp, level, life, off, flow: f.flow || 0,
      speed: (0.25 + 0.6 * (f.freq ?? 0.5)) * (f.hazard ? 1.3 : 1),
      alpha: Math.min(1, age / 180) * Math.sqrt(fall),
      bh: Math.max(A * blob * (1 + 0.25 * sharp) * (1 - 0.3 * off), rd),
      bw: Math.max(A * blob * (0.85 - 0.35 * sharp) * (1 + 0.7 * off), rd),
      bs: v.icon ? Math.min(sharp, 0.2) : sharp,                       // an icon needs a dome, not a spike
      rd,
    };
  }

  // Wave height (px, into the screen) at s px along the edge from the voice's centre.
  h(v, s) {
    const k = v.k, x = s / k.spread;
    if (!(x > -1 && x < 1)) return 0;
    let h = 0;
    if (!v.form.bars) {
      // ripples that travel outward from the source; each bump has its own slow wobble
      const p = Math.abs(s) / k.lam - k.t * k.speed, i = Math.floor(p), fr = p - i;
      const round = Math.sin(Math.PI * fr) ** 0.55, tri = 1 - Math.abs(2 * fr - 1);
      const b = round + (tri * tri * Math.sqrt(tri) - round) * k.sharp;
      const wob = 0.7 + 0.3 * Math.sin(i * 2.39 + k.t * (1.1 + hash(i + v.seed)) + v.seed);
      h = k.A * 0.62 * (1 - x * x) ** 1.3 * (k.flow + (1 - k.flow) * b * wob);
    }
    const m = this.dome(v, s);
    if (m > 0) h = smax(h, m, k.A * 0.12 + 0.01);
    return Math.min(h, this.rim.R * 0.97);
  }

  // The marker that points at the sound: a dome when soft, a spike when sharp.
  dome(v, s) {
    const k = v.k, y = Math.abs(s) / k.bw;
    if (!(y < 1)) return 0;
    const round = Math.sqrt(1 - y * y), spike = (1 - y) ** 1.6;
    return Math.min(k.bh * (round + (spike - round) * k.bs), this.rim.R * 0.97);
  }

  // A dark, faintly tinted shadow behind a wave so it reads over a bright camera image.
  scrim(v) {
    const { g, p } = this, k = v.k, r = k.spread * 0.9 + k.A;
    if (r < 1) return;
    this.rim.at(v.u, p);
    const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    gr.addColorStop(0, rgba(v.c1.map(c => c * 0.12 | 0), 0.3 * k.alpha)); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(p.x - r, p.y - r, 2 * r, 2 * r);
  }

  // The solid shape between s = from and s = to: an echo of its outline that swells outward and
  // fades (the sound travelling), then the glowing core.
  body(v, from, to) {
    const { g, rim, p, U, dpr } = this, k = v.k;
    if (k.alpha < 0.004 || k.A < 0.5) return;
    const ds = clamp(k.lam / 12, 1.25, 3), n = Math.ceil((to - from) / ds) + 1;
    if (this.buf.x.length < n) for (const key of ['x', 'y', 'nx', 'ny', 'h', 'e']) this.buf[key] = new Float32Array(n * 2);
    const { x: X, y: Y, nx: NX, ny: NY, h: Hs, e: E } = this.buf;
    for (let i = 0; i < n; i++) {
      const s = Math.min(to, from + i * ds), q = s / k.spread;
      rim.at(v.u + s, p); X[i] = p.x; Y[i] = p.y; NX[i] = p.nx; NY[i] = p.ny;
      Hs[i] = this.h(v, s); E[i] = q > -1 && q < 1 ? (1 - q * q) ** 2 : 0;
    }
    const out = 8;                     // the base runs just outside the screen, so the wave rises out of the edge
    const trace = (mul, add, closed) => {
      g.beginPath();
      for (let i = 0; i < n; i++) { const h = Math.min(Hs[i] * mul + add * E[i], rim.R * 0.99); g.lineTo(X[i] + NX[i] * h, Y[i] + NY[i] * h); }
      if (closed) { for (let i = n - 1; i >= 0; i--) g.lineTo(X[i] - NX[i] * out, Y[i] - NY[i] * out); g.closePath(); }
    };
    const solid = 1 - 0.86 * (v.form.grain || 0), grown = Math.min(1, k.life);
    const e = (k.t * (0.45 + 0.5 * k.speed) + v.seed) % 1;
    trace(1 + 0.4 * e, U * 0.06 * e * grown, false);
    g.lineWidth = 1.5; g.strokeStyle = rgba(v.c2, 0.45 * (1 - e) ** 2 * k.alpha * (0.3 + 0.7 * solid)); g.stroke();

    trace(1, 0, true);
    rim.at(v.u, p);
    const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(k.spread, k.bh, 1));
    gr.addColorStop(0, rgba(v.c2, k.alpha * solid)); gr.addColorStop(0.28, rgba(v.c1, k.alpha * solid)); gr.addColorStop(1, rgba(v.c1, 0.88 * k.alpha * solid));
    g.shadowColor = rgba(v.c1, 0.6 * k.alpha); g.shadowBlur = clamp(k.A * 0.3, 6, 28) * dpr;
    g.fillStyle = gr; g.fill();
    g.shadowBlur = 0;
  }

  // Dotted texture: sparks that pop in over the wave, drift away from the edge and fade.
  // Crackle spawns them in little clusters.
  grain(v, now, dt) {
    const k = v.k, f = v.form, gr = f.grain || 0, crackle = f.beat === 'crackle', { g, rim, p, U } = this;
    if (gr > 0.02 && now < v.end - v.fadeLen) {
      v.acc += dt * gr * (crackle ? 34 : 60) * k.level;
      while (v.acc >= 1) {
        v.acc -= 1;
        let s0 = 0;
        for (let j = 0; j < 6; j++) { s0 = (Math.random() * 2 - 1) * k.spread; const x = s0 / k.spread; if (Math.random() < (1 - x * x) ** 2 + 0.05) break; }
        const m = crackle ? 3 + (Math.random() * 6 | 0) : 1;
        for (let j = 0; j < m; j++) v.dots.push({
          s: s0 + (crackle ? (Math.random() - 0.5) * U * 0.09 : 0), f: Math.random() ** 0.7 * (crackle ? 2.2 : 1.3), drift: Math.random(), hot: Math.random() < 0.5,
          r: (0.8 + Math.random() * (crackle ? 3.2 : 2.2)) * clamp(U / 400, 0.8, 1.4), born: now, life: crackle ? 180 + Math.random() * 420 : 300 + Math.random() * 600,
        });
      }
    }
    v.dots = v.dots.filter(d => now - d.born < d.life);
    for (const d of v.dots) {
      const q = (now - d.born) / d.life, h = this.h(v, d.s) * d.f + U * (0.012 + 0.06 * d.drift * q);
      rim.at(v.u + d.s, p);
      g.fillStyle = rgba(d.hot ? v.c2 : v.c1, k.alpha * Math.sin(Math.PI * q) ** 0.6);
      g.beginPath(); g.arc(p.x + p.nx * h, p.y + p.ny * h, d.r * (crackle ? 1 + 0.7 * (1 - q) ** 3 : 1), 0, 7); g.fill();
    }
  }

  // The icon, upright in the marker dome. Dotted sounds get a solid dome first so the icon has
  // something to sit on. The icon is a dark cut of the sound's own colour, so it reads on any dome.
  badge(v) {
    const { g, rim, p } = this, k = v.k, size = k.rd * 0.92;
    if (k.alpha < 0.01 || size < 4) return;
    const grain = v.form.grain || 0;
    if (grain > 0.1) {
      g.beginPath();
      for (let s = -k.bw; s <= k.bw; s += 1.5) { const h = this.dome(v, s); rim.at(v.u + s, p); g.lineTo(p.x + p.nx * h, p.y + p.ny * h); }
      for (const s of [k.bw, -k.bw]) { rim.at(v.u + s, p); g.lineTo(p.x - p.nx * 8, p.y - p.ny * 8); }
      g.closePath(); g.fillStyle = rgba(v.c1, 0.9 * grain * k.alpha); g.fill();
    }
    rim.at(v.u, p);
    const up = Math.max(k.bh * 0.46, size * 0.55), cx = p.x + p.nx * up, cy = p.y + p.ny * up;
    g.globalCompositeOperation = 'source-over';
    g.save(); g.translate(cx - size / 2, cy - size / 2); g.scale(size / 24, size / 24);
    g.fillStyle = rgba(v.c1.map(c => c * 0.14 | 0), 0.92 * k.alpha); g.fill(v.icon, 'evenodd');
    g.restore();
    g.globalCompositeOperation = 'screen';
  }

  // Conversation: the marker dome swells with the voice, and bars either side flicker like a waveform
  // while someone is talking, dropping to dots in the pauses.
  speech(v) {
    const { g, rim, p, U, dpr } = this, k = v.k, E = BEATS.speech(k.t, v.seed);
    const r = k.A * (0.55 + 0.35 * E) * (v.form.blob ?? 0.8);
    k.bh = Math.max(r * (1 - 0.3 * k.off), k.rd); k.bw = Math.max(r * 0.95 * (1 + 0.6 * k.off), k.rd);
    this.body(v, -k.bw, k.bw);
    const gap = clamp(U * 0.026, 7, 15), w = gap * 0.5, base = w / 2 + 2;
    g.beginPath();
    for (let i = 1; ; i++) {
      const s = k.bw + gap * (i - 0.2);
      if (s > k.spread) break;
      const x = s / k.spread, env = (1 - x * x) ** 1.5;
      for (const side of [1, -1]) {
        const lv = 0.1 + 0.9 * E * (0.3 + 0.7 * noise(k.t * 8.5 + i * 1.93, v.seed + i * 3 + (side < 0 ? 40 : 0)));
        const len = Math.max(0.5, k.A * 0.8 * env * lv);
        rim.at(v.u + side * s, p);
        g.moveTo(p.x + p.nx * base, p.y + p.ny * base); g.lineTo(p.x + p.nx * (base + len), p.y + p.ny * (base + len));
      }
    }
    rim.at(v.u, p);
    const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(k.spread, 1));
    gr.addColorStop(0, rgba(v.c2, k.alpha)); gr.addColorStop(0.35, rgba(v.c1, k.alpha)); gr.addColorStop(1, rgba(v.c1, 0.8 * k.alpha));
    g.lineWidth = w; g.lineCap = 'round'; g.strokeStyle = gr;
    g.shadowColor = rgba(v.c1, 0.6 * k.alpha); g.shadowBlur = 8 * dpr;
    g.stroke(); g.shadowBlur = 0;
  }

  // Ambient: a soft band all the way round, lumpy and slowly shifting, fuller on the side it comes from.
  omni(v) {
    const { g, rim, p, W, H, dpr } = this, k = v.k, half = rim.half, n = Math.ceil(half / 2);
    if (k.alpha < 0.004) return;
    g.beginPath(); g.rect(-80, -80, W + 160, H + 160);
    for (let i = 0; i <= n; i++) {
      const u = -half + (2 * half * i) / n, phi = (u / half) * Math.PI;
      const near = 0.5 + 0.5 * Math.cos((rim.wrapU(u - v.u) / half) * Math.PI);
      const lump = clamp(0.45 + 0.3 * Math.sin(3 * phi + k.t * 0.7 + v.seed) + 0.22 * Math.sin(5 * phi - k.t * 0.9 + v.seed * 2) + 0.14 * Math.sin(9 * phi + k.t * 1.3), 0.06, 1.2) ** 1.4;
      const h = Math.min(k.A * (0.06 + 0.5 * near ** 1.5) * lump + 2, rim.R * 0.97);
      rim.at(u, p);
      if (i) g.lineTo(p.x + p.nx * h, p.y + p.ny * h); else g.moveTo(p.x + p.nx * h, p.y + p.ny * h);
    }
    g.closePath();
    g.fillStyle = rgba(v.c1, 0.28 * k.alpha); g.shadowColor = rgba(v.c2, 0.4 * k.alpha); g.shadowBlur = 16 * dpr;
    g.fill('evenodd'); g.shadowBlur = 0;
  }

  // Attention: a light runs both ways round the edge from the sound, and the whole rim flashes its colour once.
  sweep(v, now) {
    const q = (now - v.sweep) / 1200;
    if (q >= 1) { v.sweep = 0; return; }
    const { g, rim, p } = this, e = 1 - (1 - q) ** 3, fade = (1 - q) ** 1.3 * v.k.alpha, step = 12, inset = 3;
    g.lineCap = 'round';
    if (q < 0.45) {
      g.beginPath();
      for (let u = -rim.half; u <= rim.half; u += 24) { rim.at(u, p); g.lineTo(p.x + p.nx * inset, p.y + p.ny * inset); }
      g.closePath(); g.lineWidth = 10; g.strokeStyle = rgba(v.c1, 0.3 * (1 - q / 0.45) * v.k.alpha); g.stroke();
    }
    for (const side of [1, -1]) {
      const head = v.u + side * e * rim.half;
      for (let j = 0; j < 12; j++) {
        g.beginPath();
        rim.at(head - side * j * step, p); g.moveTo(p.x + p.nx * inset, p.y + p.ny * inset);
        rim.at(head - side * (j + 1) * step, p); g.lineTo(p.x + p.nx * inset, p.y + p.ny * inset);
        g.lineWidth = 6 - j * 0.4; g.strokeStyle = rgba(j < 2 ? v.c2 : v.c1, fade * (1 - j / 12)); g.stroke();
      }
    }
  }
}
