// Every sound in common.js, played on this device's speaker, so the remote can make the sound it shows.
//
// Nothing is recorded: each sound is synthesised with Web Audio from a small recipe (oscillators, filtered
// noise, bell partials, a vowel-shaped voice), so it works offline and costs no download. They're
// sketches of the real thing, loud and clear enough to test with, and most are recognised by the display's
// listener too. Talking, your name and shouting use the phone's own text-to-speech voice when it has one.
//
//   const sfx = createSfx();
//   sfx.play('dog', { angle: 90 })   // once, placed right (heard on headphones; behind = muffled)
//   const h = sfx.loop('rain')       // until h.stop()
//   sfx.stopAll()
//
// Pass an OfflineAudioContext to render a sound to a buffer instead (tests do this).
import { SOUNDS } from '/common.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.random() * a.length | 0];
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

// Vowel formants (Hz, gain, bandwidth ratio), an adult voice; children and babies scale them up.
const VOWELS = {
  a: [[800, 1], [1150, 0.5], [2900, 0.25]],
  e: [[530, 1], [1840, 0.45], [2480, 0.25]],
  i: [[300, 1], [2300, 0.35], [3000, 0.25]],
  o: [[480, 1], [820, 0.6], [2830, 0.15]],
  u: [[330, 1], [700, 0.45], [2530, 0.12]],
  ae: [[660, 1], [1720, 0.5], [2410, 0.25]],
};
const SAYINGS = {
  speech: ['So I was thinking we could get lunch after this.', 'Did you hear what happened this morning?', 'Honestly, that was the best part of the whole day.',
           'Wait, where did you park the car?', 'I’ll send it to you tonight, promise.', 'Okay, so here’s the plan.'],
  name: ['Hey! Over here!', 'Excuse me! Hi!', 'Hey, wait up!'],
  shout: ['Hey! Watch out!', 'Stop!', 'Look out!'],
};

export function createSfx(given) {
  const ctx = given || new (window.AudioContext || window.webkitAudioContext)();
  const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
  const SR = ctx.sampleRate;

  // master: everything → compressor → out; a shared room reverb on a send
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
  const master = ctx.createGain(); master.gain.value = 0.9;
  comp.connect(master); master.connect(ctx.destination);
  const verb = ctx.createConvolver(); verb.buffer = impulse(2.2, 2.6); verb.connect(comp);

  // noise, made once: white, pink and brown, 3 s each, played from a random point so they never repeat audibly
  const NOISE = {};
  for (const kind of ['white', 'pink', 'brown']) {
    const n = SR * 3, b = ctx.createBuffer(1, n, SR), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12; }
      else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    }
    NOISE[kind] = b;
  }

  function impulse(sec, decay) {
    const n = Math.round(SR * sec), b = ctx.createBuffer(2, n, SR);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay; }
    return b;
  }

  // ---------- voices: one playing sound ----------
  const live = new Set();
  let pumpTimer = 0;
  const pumpAll = () => {
    for (const v of live) if (v.done) live.delete(v); else v.pump();
    if (![...live].some(v => v.loop)) { clearInterval(pumpTimer); pumpTimer = 0; }
  };

  class Voice {
    constructor(key, { angle = null, gain = 1, loop = false, dur }) {
      this.key = key; this.loop = loop; this.nodes = []; this.pumps = []; this.speech = null; this.stopped = false;
      this.t = ctx.currentTime + 0.03;
      this.dur = loop ? Infinity : dur;
      this.end = this.t + this.dur;
      // out (its envelope and fades) → level (how near, while it's moved) → muffle (behind) → pan (left/right)
      this.out = ctx.createGain(); this.out.gain.value = gain;
      this.level = ctx.createGain();
      this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000;
      this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      this.out.connect(this.level); this.level.connect(this.muffle);
      const last = this.pan ? (this.muffle.connect(this.pan), this.pan) : this.muffle;
      this.dry = ctx.createGain(); this.wet = ctx.createGain(); this.wet.gain.value = 0.16;
      last.connect(this.dry); last.connect(this.wet); this.dry.connect(comp); this.wet.connect(verb);
      this.aim(angle, 1, true);
    }
    // Where it is: angle (0 ahead, 90 right, 180 behind; null = everywhere) and how near (gain, 1 = as made).
    // Left/right by pan (on headphones), behind by muffling. Glides unless `jump`.
    aim(angle, gain = 1, jump = false) {
      const t = ctx.currentTime, set = (p, v) => jump ? p.setValueAtTime(v, t) : p.setTargetAtTime(v, t, 0.04);
      const a = angle == null ? 0 : ((angle % 360) + 540) % 360 - 180;
      set(this.muffle.frequency, angle != null && Math.abs(a) > 95 ? 9000 - 6000 * (Math.abs(a) - 95) / 85 : 20000);
      if (this.pan) set(this.pan.pan, angle == null ? 0 : clamp(Math.sin(a * Math.PI / 180), -1, 1) * 0.85);
      set(this.level.gain, gain);
    }
    space(w) { this.wet.gain.value = w; return this; }   // how much room: 0 outdoors, ~0.35 a hall
    keep(node, t0 = 0, len = null) {                     // start a source; one-shots stop on their own
      node.start(this.t + t0, ...(node.buffer ? [rnd(0, 2)] : []));
      const stopAt = len != null ? this.t + t0 + len : this.end + 0.6;
      if (isFinite(stopAt)) node.stop(stopAt);
      this.nodes.push(node);
      node.onended = () => { const i = this.nodes.indexOf(node); if (i >= 0) this.nodes.splice(i, 1); };
      return node;
    }
    // call fn(time, i) every `gap` seconds (a number, or a function giving the next gap) from `from`
    // until the sound ends. Loops are scheduled a little ahead as they play; everything else at once.
    every(gap, fn, from = 0) {
      let i = 0, next = this.t + from;
      const pump = () => {
        const horizon = offline || !this.loop ? this.end : ctx.currentTime + 0.7;
        while (!this.stopped && next < Math.min(horizon, this.end)) { fn(next - this.t, i++); next += typeof gap === 'function' ? gap(i) : gap; }
      };
      pump();
      if (this.loop && !offline) { this.pumps.push(pump); if (!pumpTimer) pumpTimer = setInterval(pumpAll, 120); }
    }
    pump() { for (const p of this.pumps) p(); }
    stop(fade = 0.25) {
      if (this.stopped) return;
      this.stopped = true; live.delete(this);
      const now = ctx.currentTime;
      this.out.gain.cancelScheduledValues(now); this.out.gain.setValueAtTime(this.out.gain.value, now); this.out.gain.linearRampToValueAtTime(0, now + fade);
      for (const n of this.nodes) try { n.stop(now + fade + 0.05); } catch {}
      if (this.speech) speechSynthesis.cancel();
      setTimeout(() => { this.out.disconnect(); this.level.disconnect(); this.muffle.disconnect(); this.pan?.disconnect(); this.dry.disconnect(); this.wet.disconnect(); }, (fade + 3) * 1000);
    }
    get done() { return this.stopped || (!this.loop && ctx.currentTime > this.end + 2.5); }
  }

  // ---------- building blocks (times in s from the voice's start) ----------
  // A gain envelope from [time, level] points, into `to`. A loop's sound has no end, so it just holds.
  function env(v, to, pts) {
    const g = ctx.createGain(), p = g.gain;
    p.setValueAtTime(0, v.t + pts[0][0]);
    for (const [t, l] of pts) if (isFinite(t)) p.linearRampToValueAtTime(l, v.t + t);
    g.connect(to);
    return g;
  }
  // Frequency path: a number, or [[t, f], …] (glides between).
  function glide(param, v, f, t0, how = 'exp') {
    if (typeof f === 'number') { param.setValueAtTime(f, v.t + t0); return; }
    param.setValueAtTime(f[0][1], v.t + t0 + f[0][0]);
    for (const [t, x] of f.slice(1)) how === 'exp' ? param.exponentialRampToValueAtTime(x, v.t + t0 + t) : param.linearRampToValueAtTime(x, v.t + t0 + t);
  }
  // A plain tone. a = attack, d = length, r = release (s); g = level; f = Hz or a glide.
  function tone(v, { type = 'sine', f, t = 0, d, a = 0.005, r = 0.05, g = 0.3, vib, to = v.out, filter }) {
    const o = ctx.createOscillator(); o.type = type; glide(o.frequency, v, f, t);
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vib[0]; lg.gain.value = vib[1]; l.connect(lg); lg.connect(o.frequency); v.keep(l, t, d + r + 0.05); }
    let dest = env(v, to, [[t, 0], [t + a, g], [t + Math.max(a, d - r), g * 0.9], [t + d, 0]]);
    if (filter) { const bq = biquad(...filter); bq.connect(dest); dest = bq; }
    o.connect(dest); v.keep(o, t, d + 0.05);
    return o;
  }
  // A struck, decaying tone (bells, glass, metal): partials [[ratio, level, decay s], …].
  function strike(v, { f, t = 0, g = 0.3, parts = [[1, 1, 0.8]], to = v.out }) {
    for (const [ratio, lvl, dec] of parts) {
      const o = ctx.createOscillator(); o.frequency.value = f * ratio;
      const e = ctx.createGain(); e.gain.setValueAtTime(0, v.t + t); e.gain.linearRampToValueAtTime(g * lvl, v.t + t + 0.002);
      e.gain.setTargetAtTime(0, v.t + t + 0.002, dec / 4);
      o.connect(e); e.connect(to); v.keep(o, t, dec * 1.3 + 0.02);
    }
  }
  function biquad(type, f, q = 0.7, gain) {
    const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (gain != null) b.gain.value = gain;
    return b;
  }
  // Filtered noise: color white|pink|brown, filter [type, Hz, Q] (Hz may glide), envelope from a/d/r or pts.
  function hiss(v, { color = 'white', t = 0, d, a = 0.005, r = 0.05, g = 0.3, filter, sweep, pts, to = v.out }) {
    const s = ctx.createBufferSource(); s.buffer = NOISE[color]; s.loop = true;
    const e = env(v, to, pts ? pts.map(([pt, l]) => [t + pt, l * g]) : [[t, 0], [t + a, g], [t + Math.max(a, d - r), g * 0.9], [t + d, 0]]);
    let into = e;
    for (const fl of filter ? (Array.isArray(filter[0]) ? filter : [filter]) : []) {
      const b = biquad(fl[0], typeof fl[1] === 'number' ? fl[1] : fl[1][0][1], fl[2] ?? 0.7);
      if (typeof fl[1] !== 'number') glide(b.frequency, v, fl[1], t, sweep || 'exp');
      b.connect(into); into = b;
    }
    s.connect(into); v.keep(s, t, isFinite(d) ? d + 0.05 : null);
    return e;
  }
  // A short noise tick: clicks, raps, drops.
  function tick(v, t, { g = 0.3, f = 3000, q = 1, type = 'bandpass', dec = 0.012, color = 'white', to = v.out }) {
    const s = ctx.createBufferSource(); s.buffer = NOISE[color];
    const b = biquad(type, f, q), e = ctx.createGain();
    e.gain.setValueAtTime(0, v.t + t); e.gain.linearRampToValueAtTime(g, v.t + t + 0.001); e.gain.setTargetAtTime(0, v.t + t + 0.001, dec);
    s.connect(b); b.connect(e); e.connect(to); v.keep(s, t, dec * 6 + 0.01);
  }
  // A water droplet or bubble: a short sine chirping upward.
  function drop(v, t, { f = 900, up = 1.9, len = 0.04, g = 0.12, to = v.out }) {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(f, v.t + t); o.frequency.exponentialRampToValueAtTime(f * up, v.t + t + len);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, v.t + t); e.gain.linearRampToValueAtTime(g, v.t + t + 0.003); e.gain.exponentialRampToValueAtTime(1e-4, v.t + t + len);
    o.connect(e); e.connect(to); v.keep(o, t, len + 0.01);
  }
  // A voice: a buzzy source through three vowel formants. f0 = pitch (Hz or glide), vowel = one or [[t, v], …].
  // scale raises the formants (1.25 child, 1.45 baby, 1.7 cat); breath adds air; rough adds a growl;
  // jitter wobbles the pitch at random, the way a real throat does (without it a voice sounds like a synth).
  function voice(v, { t = 0, d, f0, vowel = 'a', g = 0.3, a = 0.04, r = 0.08, scale = 1, breath = 0.08, vib, rough = 0, jitter = 0.015, to = v.out, pts }) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; glide(o.frequency, v, f0, t);
    if (jitter) {
      const n = ctx.createBufferSource(); n.buffer = NOISE.white; n.loop = true;
      const lp = biquad('lowpass', 25), jg = ctx.createGain(); jg.gain.value = (typeof f0 === 'number' ? f0 : f0[0][1]) * jitter * 80;
      n.connect(lp); lp.connect(jg); jg.connect(o.frequency); v.keep(n, t, d + 0.05);
    }
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vib[0]; lg.gain.value = vib[1]; l.connect(lg); lg.connect(o.frequency); v.keep(l, t, d + 0.1); }
    const e = env(v, to, pts ? pts.map(([pt, l]) => [t + pt, l * g]) : [[t, 0], [t + a, g], [t + Math.max(a, d - r), g * 0.85], [t + d, 0]]);
    const src = ctx.createGain(); o.connect(src);
    if (rough) { const m = ctx.createOscillator(), mg = ctx.createGain(); m.frequency.value = 38; mg.gain.value = rough; m.connect(mg); mg.connect(src.gain); v.keep(m, t, d + 0.05); }
    const vs = typeof vowel === 'string' ? [[0, vowel]] : vowel;
    for (let i = 0; i < 3; i++) {
      const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 6 + i * 3;
      const [f, lvl] = VOWELS[vs[0][1]][i];
      b.frequency.setValueAtTime(f * scale, v.t + t);
      for (const [vt, vw] of vs.slice(1)) b.frequency.linearRampToValueAtTime(VOWELS[vw][i][0] * scale, v.t + t + vt);
      const bg = ctx.createGain(); bg.gain.value = lvl * 2.2;
      src.connect(b); b.connect(bg); bg.connect(e);
    }
    v.keep(o, t, d + 0.05);
    if (breath) hiss(v, { t, d, g: g * breath, filter: ['bandpass', 1800 * scale, 0.8], a, r, to });
  }
  // The phone's own text-to-speech, when there is one (not offline). Returns false if it can't.
  function say(v, text, { pitch = 1, rate = 1, volume = 1 } = {}) {
    if (offline || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
    const u = new SpeechSynthesisUtterance(text); u.pitch = pitch; u.rate = rate; u.volume = volume;
    const en = speechSynthesis.getVoices().filter(x => /^en/i.test(x.lang));
    if (en.length) u.voice = en.find(x => /samantha|daniel|karen|google us|google uk/i.test(x.name)) || en[0];
    speechSynthesis.cancel(); speechSynthesis.speak(u); v.speech = u;
    return true;
  }
  // Babble: syllables from a voice, for when there's no text-to-speech (and for crowds).
  function babble(v, { t = 0, d, f0 = 150, scale = 1, g = 0.2, rate = 5, to = v.out }) {
    let x = t;
    while (x < t + d) {
      const len = rnd(0.08, 0.2), p = f0 * rnd(0.85, 1.25), vw = pick(['a', 'e', 'i', 'o', 'u', 'ae']);
      voice(v, { t: x, d: len, f0: [[0, p], [len, p * rnd(0.85, 1.1)]], vowel: [[0, vw], [len, pick(['a', 'e', 'o'])]], g: g * rnd(0.6, 1), a: 0.02, r: 0.04, scale, breath: 0, to });
      x += len + (Math.random() < 0.15 ? rnd(0.2, 0.5) : rnd(0.01, 0.06)) * 5 / rate;
    }
  }
  // A thud: a falling sine for weight plus a noise burst for texture.
  function thud(v, t, { f = 90, g = 0.5, dec = 0.12, noise = 0.3, nf = 400 } = {}) {
    tone(v, { f: [[0, f * 1.6], [dec, f * 0.7]], t, d: dec * 1.5, a: 0.002, r: dec, g });
    tick(v, t, { g: noise, f: nf, q: 0.8, dec: dec / 3, type: 'lowpass', color: 'pink' });
  }
  const bell = (v, t, f, g = 0.25, dec = 1.2) => strike(v, { f, t, g, parts: [[1, 1, dec], [2, 0.45, dec * 0.7], [2.76, 0.35, dec * 0.5], [5.4, 0.18, dec * 0.3], [8.9, 0.08, dec * 0.15]] });
  const ping = (v, t, f, g = 0.1, dec = 0.2) => strike(v, { f, t, g, parts: [[1, 1, dec], [2.71, 0.5, dec * 0.6], [5.12, 0.3, dec * 0.35]] });

  // ---------- the sounds ----------
  // Each recipe gets a Voice; it plays from v.t (0 s) to v.dur (or forever for loops, when v.every keeps going).
  // `len` is how long a one-shot plays. Loops that play once (not toggled) play `len` seconds of themselves.
  const R = {
    fire: { len: 4, gain: 1.5, make(v) {            // smoke alarm: the T3 pattern, 3.1 kHz
      v.space(0.12);
      v.every(4, (t) => { for (const s of [0, 1, 2]) tone(v, { type: 'square', f: 3100, t: t + s * 1, d: 0.5, g: 0.1, filter: ['lowpass', 7000] }); });
    } },
    siren: { len: 5, make(v) {           // wail, up and down
      v.space(0.2);
      const pts = []; for (let i = 0; i <= 5; i++) pts.push([i, i % 2 ? 1500 : 650]);
      tone(v, { type: 'sawtooth', f: pts.map(([t, f]) => [t * 1.2, f]), d: 5, a: 0.2, r: 0.3, g: 0.16, filter: ['lowpass', 3200, 0.8], vib: [7, 12] });
      tone(v, { f: pts.map(([t, f]) => [t * 1.2, f]), d: 5, a: 0.2, r: 0.3, g: 0.18 });
    } },
    glass: { len: 2.5, gain: 1.4, make(v) {         // a crack, then shards falling
      v.space(0.25);
      hiss(v, { d: 0.6, g: 0.7, pts: [[0, 0], [0.002, 1], [0.08, 0.5], [0.6, 0]], filter: ['highpass', 1800, 0.7] });
      thud(v, 0, { f: 180, g: 0.25, dec: 0.06, nf: 2000 });
      for (let i = 0; i < 30; i++) { const t = 0.02 + Math.random() ** 1.8 * 1.8; ping(v, t, rnd(2600, 8200), rnd(0.03, 0.09) * (1 - t / 2.2), rnd(0.03, 0.12)); }
      for (let i = 0; i < 60; i++) { const t = 0.03 + Math.random() ** 1.6 * 1.6; tick(v, t, { g: rnd(0.08, 0.3) * (1 - t / 2), f: rnd(3000, 8000), q: 1.5, dec: rnd(0.003, 0.01) }); }
    } },
    crash: { len: 3, make(v) {           // a heavy impact, crumpling metal, debris
      v.space(0.3);
      thud(v, 0, { f: 60, g: 0.9, dec: 0.4, noise: 0.8, nf: 900 });
      hiss(v, { color: 'brown', d: 1.6, g: 0.9, a: 0.002, pts: [[0, 0], [0.005, 1], [0.3, 0.4], [1.6, 0]], filter: ['lowpass', 1200] });
      hiss(v, { d: 0.6, g: 0.25, a: 0.001, pts: [[0, 0], [0.002, 1], [0.6, 0]], filter: ['highpass', 2000] });
      for (const f of [310, 470, 820, 1330]) strike(v, { f: f * rnd(0.95, 1.05), t: rnd(0, 0.05), g: 0.08, parts: [[1, 1, 0.9], [1.51, 0.6, 0.6], [2.23, 0.4, 0.4]] });
      for (let i = 0; i < 16; i++) { const t = 0.15 + Math.random() ** 1.5 * 2; tick(v, t, { g: rnd(0.05, 0.3) * (1 - t / 2.4), f: rnd(600, 4000), q: 1.5, dec: rnd(0.005, 0.03) }); }
    } },
    scream: { len: 3, make(v) {
      v.space(0.25);
      for (const [t, p] of [[0, 820], [1.7, 900]]) {
        voice(v, { t, d: 1.3, f0: [[0, p * 0.8], [0.15, p], [1, p * 1.05], [1.3, p * 0.7]], vowel: [[0, 'a'], [0.8, 'ae'], [1.3, 'a']], g: 0.35, a: 0.06, r: 0.3, scale: 1.3, breath: 0.4, vib: [6.5, 30], rough: 0.6, jitter: 0.04 });
      }
    } },
    truck: { len: 2.5, make(v) {         // air horn: a loud chord
      v.space(0.1);
      for (const f of [311, 370, 466]) tone(v, { type: 'sawtooth', f: [[0, f * 0.94], [0.08, f], [2, f * 0.99]], d: 2, a: 0.04, r: 0.25, g: 0.1, filter: ['lowpass', 2600] });
      hiss(v, { d: 0.5, t: 2, g: 0.12, a: 0.01, r: 0.4, filter: ['highpass', 3000] });
    } },
    horn: { len: 2.2, make(v) {          // beep… beeeep
      v.space(0.08);
      for (const [t, d] of [[0, 0.28], [0.45, 0.8]]) for (const f of [415, 500]) tone(v, { type: 'sawtooth', f, t, d, a: 0.01, r: 0.03, g: 0.12, filter: ['lowpass', 3500] });
    } },
    skid: { len: 2.4, make(v) {          // tyres: a squealing whine that wanders, and road noise
      v.space(0.1);
      const pts = [[0, 1150]]; for (let t = 0.15; t < 2; t += 0.15) pts.push([t, rnd(1050, 1350)]);
      tone(v, { type: 'sawtooth', f: pts, d: 2, a: 0.03, r: 0.5, g: 0.08, filter: ['bandpass', 1300, 2], vib: [23, 30] });
      hiss(v, { d: 2, g: 0.25, a: 0.03, r: 0.5, filter: ['bandpass', 1250, 7] });
      hiss(v, { color: 'pink', d: 2.2, g: 0.2, a: 0.1, r: 0.6, filter: ['lowpass', 900] });
    } },
    train: { len: 5, make(v) {           // horn, then wheels on the rails over a rumble
      v.space(0.15);
      for (const f of [277, 349, 415]) tone(v, { type: 'sawtooth', f, d: 1.6, a: 0.08, r: 0.3, g: 0.07, filter: ['lowpass', 1800] });
      hiss(v, { color: 'brown', d: 5, g: 0.6, a: 0.8, r: 1, filter: ['lowpass', 260] });
      v.every(0.55, (t) => { thud(v, t, { f: 70, g: 0.25, dec: 0.06, noise: 0.35, nf: 1200 }); thud(v, t + 0.14, { f: 65, g: 0.3, dec: 0.06, noise: 0.4, nf: 1200 }); }, 0.6);
    } },
    reverse: { len: 4, gain: 1.5, make(v) {         // reversing beeps
      v.space(0.05);
      v.every(1, (t) => tone(v, { type: 'square', f: 1040, t, d: 0.5, a: 0.005, r: 0.01, g: 0.08, filter: ['lowpass', 3000] }));
    } },
    bus: { len: 4.5, make(v) {           // a diesel idling, then the air brakes: psssh
      v.space(0.1);
      const o = tone(v, { type: 'sawtooth', f: 48, d: 3.5, a: 0.3, r: 0.4, g: 0.3, filter: ['lowpass', 380] });
      const am = ctx.createOscillator(), ag = ctx.createGain(); am.frequency.value = 13; ag.gain.value = 10; am.connect(ag); ag.connect(o.frequency); v.keep(am, 0, 3.6);
      hiss(v, { color: 'brown', d: 3.5, g: 0.5, a: 0.3, r: 0.4, filter: ['lowpass', 200] });
      hiss(v, { t: 3.2, d: 1.2, g: 0.35, a: 0.01, r: 0.9, filter: ['highpass', 2500] });
    } },
    motorbike: { len: 3.5, make(v) {     // two revs
      v.space(0.08);
      const f = [[0, 40], [0.3, 120], [0.9, 55], [1.4, 45], [1.7, 140], [2.4, 60], [3.2, 42]];
      for (const m of [1, 2.02]) tone(v, { type: 'sawtooth', f: f.map(([t, x]) => [t, x * m]), d: 3.3, a: 0.05, r: 0.3, g: 0.14 / m, filter: ['lowpass', 1400, 1.5] });
      hiss(v, { color: 'pink', d: 3.3, g: 0.15, a: 0.05, r: 0.3, filter: ['bandpass', 900, 1] });
    } },
    car: { len: 4, make(v) {             // passing by: engine and tyres swell up and away, pitch dropping
      v.space(0.05);
      tone(v, { type: 'sawtooth', f: [[0, 120], [1.6, 118], [2.2, 92], [4, 88]], d: 4, a: 1.4, r: 1.8, g: 0.12, filter: ['lowpass', 900] });
      hiss(v, { color: 'pink', d: 4, g: 0.6, pts: [[0, 0.05], [1.8, 1], [2.3, 0.8], [4, 0]], filter: ['bandpass', [[0, 900], [1.8, 800], [2.4, 500]], 0.8] });
    } },
    bike: { len: 2, gain: 1.6, make(v) {            // ring-ring: a quick trill on a bell, twice
      v.space(0.1);
      for (const s of [0, 0.55]) for (let i = 0; i < 6; i++) strike(v, { f: 2150, t: s + i * 0.055, g: 0.08, parts: [[1, 1, 0.5], [2.32, 0.5, 0.35], [3.9, 0.3, 0.2]] });
    } },
    baby: { len: 4, make(v) {            // waah… (gasp) waah…
      v.space(0.15);
      for (const t of [0, 1.45, 2.9]) {
        const p = rnd(430, 480);
        voice(v, { t, d: 1.1, f0: [[0, p * 0.9], [0.2, p * 1.12], [0.8, p], [1.1, p * 0.75]], vowel: [[0, 'ae'], [0.4, 'a'], [1.1, 'u']], g: 0.35, a: 0.08, r: 0.25, scale: 1.3, breath: 0.04, vib: [7, 14], rough: 0.3, jitter: 0.03 });
        voice(v, { t: t + 1.18, d: 0.18, f0: p * 1.4, vowel: 'i', g: 0.06, a: 0.05, r: 0.08, scale: 1.3, breath: 1 });   // the gasp
      }
    } },
    shout: { len: 2, make(v) {
      v.space(0.2);
      if (!say(v, pick(SAYINGS.shout), { pitch: 1.25, rate: 1.1 })) voice(v, { d: 0.6, f0: [[0, 260], [0.2, 300], [0.6, 220]], vowel: [[0, 'e'], [0.3, 'i']], g: 0.4, breath: 0.2, rough: 0.2 });
    } },
    name: { len: 2, make(v) {
      v.space(0.15);
      if (!say(v, pick(SAYINGS.name), { pitch: 1.1 })) { voice(v, { d: 0.35, f0: [[0, 200], [0.35, 240]], vowel: [[0, 'e'], [0.3, 'i']], g: 0.3 }); voice(v, { t: 0.5, d: 0.5, f0: [[0, 240], [0.5, 180]], vowel: 'o', g: 0.3 }); }
    } },
    speech: { len: 3.5, make(v) {
      v.space(0.15);
      if (!say(v, pick(SAYINGS.speech))) babble(v, { d: 3, f0: 140, g: 0.22 });
    } },
    laugh: { len: 2.5, gain: 1.4, make(v) {         // ha-ha-ha-ha, from two people
      v.space(0.2);
      for (const [p, s, st] of [[230, 1, 0.05], [330, 1.2, 0.4]]) for (let i = 0; i < 7; i++) {
        const t = st + i * 0.17 + rnd(-0.01, 0.01), f = p * (1.15 - i * 0.04);
        hiss(v, { t: t - 0.035, d: 0.06, g: 0.12 * (1 - i * 0.08), a: 0.01, r: 0.03, filter: ['bandpass', 1400 * s, 0.9] });   // the h
        voice(v, { t, d: 0.11, f0: [[0, f], [0.11, f * 0.88]], vowel: 'a', g: 0.3 * (1 - i * 0.08), a: 0.012, r: 0.05, scale: s, breath: 0.5, jitter: 0.03 });
      }
    } },
    applause: { len: 3.5, gain: 2, make(v) {      // many hands clapping, swelling then dying down
      v.space(0.3);
      for (let i = 0; i < 520; i++) {
        const t = Math.random() * 3.2, lvl = Math.min(1, t / 0.4) * Math.min(1, (3.3 - t) / 1.2);
        tick(v, t, { g: rnd(0.03, 0.1) * lvl, f: rnd(900, 2600), q: rnd(0.8, 1.6), dec: rnd(0.005, 0.012) });
      }
      hiss(v, { color: 'pink', d: 3.3, g: 0.12, pts: [[0, 0], [0.4, 1], [2.1, 1], [3.3, 0]], filter: ['bandpass', 1600, 0.8] });
    } },
    cheer: { len: 3.5, make(v) {        // a crowd shouting yeah and woo, clapping
      v.space(0.35);
      for (let i = 0; i < 9; i++) {
        const p = rnd(170, 420), t = rnd(0, 0.5), d = rnd(1.2, 2.6);
        voice(v, { t, d, f0: [[0, p * 0.85], [0.3, p * 1.15], [d, p * 0.9]], vowel: [[0, pick(['e', 'u', 'ae'])], [0.3, 'a'], [d, pick(['o', 'a'])]], g: 0.08, a: 0.15, r: 0.5, scale: p > 280 ? 1.2 : 1, breath: 0.3, vib: [5, 8] });
      }
      tone(v, { f: [[0, 1800], [0.25, 2600], [0.5, 1600]], t: 1, d: 0.55, g: 0.05 });   // someone whistles
      for (let i = 0; i < 90; i++) tick(v, Math.random() * 3.2, { g: rnd(0.04, 0.12), f: rnd(900, 2600), q: 1, dec: 0.01 });
    } },
    sing: { len: 4, make(v) {           // a short phrase, la la laa
      v.space(0.35);
      const notes = [[392, 0.45], [440, 0.45], [494, 0.45], [523, 1], [494, 0.45], [440, 1.1]];
      let t = 0;
      for (const [f, d] of notes) { voice(v, { t, d: d + 0.05, f0: f, vowel: [[0, 'e'], [0.06, 'a']], g: 0.2, a: 0.05, r: 0.12, scale: 1.1, breath: 0.05, vib: [5.5, f * 0.012] }); t += d; }
    } },
    whistle: { len: 3, make(v) {        // a whistled tune
      v.space(0.25);
      const notes = [[1568, 0.3], [1760, 0.3], [1976, 0.3], [2093, 0.6], [1760, 0.3], [1568, 0.7]];
      let t = 0;
      for (const [f, d] of notes) { tone(v, { f: [[0, f * 0.97], [0.04, f]], t, d, a: 0.03, r: 0.06, g: 0.14, vib: [5, f * 0.008] }); hiss(v, { t, d, g: 0.01, filter: ['bandpass', f, 4] }); t += d + 0.03; }
    } },
    cough: { len: 2.2, gain: 1.8, make(v) {
      v.space(0.2);
      for (const t of [0, 0.42, 1.3]) {
        hiss(v, { t, d: 0.28, g: 0.5, a: 0.008, pts: [[0, 0], [0.008, 1], [0.08, 0.5], [0.28, 0]], filter: ['bandpass', 700, 0.9], color: 'pink' });
        voice(v, { t, d: 0.18, f0: [[0, 170], [0.18, 120]], vowel: 'a', g: 0.18, a: 0.005, r: 0.1, breath: 0.4, rough: 0.4 });
      }
    } },
    steps: { len: 3.5, make(v) {        // walking on a hard floor: heel, then toe
      v.space(0.25);
      v.every(0.52, (t, i) => { thud(v, t, { f: 80, g: 0.3, dec: 0.05, noise: 0.4, nf: 700 }); tick(v, t + 0.06, { g: 0.12, f: 2400, q: 1.2, dec: 0.01 }); if (i % 2) tick(v, t + 0.02, { g: 0.06, f: 4200, q: 3, dec: 0.004 }); });
    } },
    kids: { len: 5, gain: 2, make(v) {           // children playing: chatter, shrieks, laughs
      v.space(0.3);
      v.every(() => rnd(0.4, 1.2), (t) => {
        const r = Math.random();
        if (r < 0.55) babble(v, { t, d: rnd(0.4, 1), f0: rnd(280, 380), scale: 1.3, g: 0.1 });
        else if (r < 0.8) voice(v, { t, d: rnd(0.3, 0.6), f0: [[0, 600], [0.2, 900], [0.5, 700]], vowel: [[0, 'e'], [0.3, 'i']], g: 0.07, scale: 1.35, breath: 0.2 });
        else for (let i = 0; i < 4; i++) voice(v, { t: t + i * 0.14, d: 0.1, f0: 420 - i * 15, vowel: 'a', g: 0.08, scale: 1.35, breath: 0.5 });
      });
    } },
    doorbell: { len: 3, make(v) {       // ding… dong
      v.space(0.3);
      bell(v, 0, 659.3, 0.25, 1.8); bell(v, 0.7, 523.3, 0.25, 2.2);
    } },
    knock: { len: 2.5, make(v) {        // knock knock knock, twice
      v.space(0.25);
      for (const s of [0, 1.3]) for (const k of [0, 0.22, 0.44]) {
        strike(v, { f: rnd(175, 190), t: s + k, g: 0.5, parts: [[1, 1, 0.09], [1.58, 0.7, 0.07], [2.63, 0.45, 0.05], [3.9, 0.25, 0.03]] });
        tick(v, s + k, { g: 0.45, f: 900, q: 0.9, dec: 0.006, color: 'pink' }); tick(v, s + k, { g: 0.15, f: 2600, q: 1.5, dec: 0.003 });
      }
    } },
    door: { len: 2.6, make(v) {         // creaks open… and bangs shut
      v.space(0.3);
      const pts = []; for (let t = 0; t <= 1.3; t += 0.1) pts.push([t, rnd(22, 40)]);
      tone(v, { type: 'sawtooth', f: pts, d: 1.3, a: 0.1, r: 0.2, g: 0.35, filter: ['bandpass', 1100, 6] });
      tone(v, { type: 'sawtooth', f: pts.map(([t, f]) => [t, f * 1.5]), d: 1.3, a: 0.1, r: 0.2, g: 0.2, filter: ['bandpass', 2300, 8] });
      tick(v, 1.55, { g: 0.2, f: 3000, q: 3, dec: 0.004 });
      thud(v, 1.6, { f: 70, g: 0.9, dec: 0.18, noise: 0.7, nf: 800 });
      tick(v, 1.61, { g: 0.35, f: 1500, q: 1, dec: 0.02 });
    } },
    phone: { len: 3.5, make(v) {        // ring-ring… ring-ring: a bell struck fast
      v.space(0.2);
      for (const s of [0, 2]) for (const b of [0, 0.6]) for (let i = 0; i < 8; i++) strike(v, { f: i % 2 ? 1400 : 1250, t: s + b + i * 0.05, g: 0.07, parts: [[1, 1, 0.25], [2.1, 0.5, 0.15], [3.3, 0.3, 0.1]] });
    } },
    timer: { len: 3.5, gain: 1.6, make(v) {        // beep-beep-beep-beep
      v.space(0.12);
      v.every(2, (t) => { for (let i = 0; i < 4; i++) tone(v, { type: 'square', f: 2600, t: t + i * 0.25, d: 0.13, a: 0.003, r: 0.01, g: 0.07, filter: ['lowpass', 6000] }); });
    } },
    kettle: { len: 4.5, make(v) {       // rumbling, bubbling, then the whistle
      v.space(0.15);
      hiss(v, { color: 'brown', d: 4.5, g: 0.35, pts: [[0, 0.2], [2, 0.8], [4.5, 0.5]], filter: ['lowpass', 400] });
      for (let i = 0; i < 110; i++) { const t = Math.random() * 3.8; drop(v, t, { f: rnd(180, 520) * (1 + t / 4), up: rnd(1.4, 2.2), len: rnd(0.02, 0.05), g: 0.06 * (0.4 + t / 4) }); }
      tone(v, { f: [[0, 1700], [0.6, 2200], [1.5, 2250]], t: 2.8, d: 1.7, a: 0.4, r: 0.2, g: 0.1, vib: [9, 25] });
      hiss(v, { t: 2.8, d: 1.7, g: 0.05, a: 0.4, r: 0.2, filter: ['bandpass', 2200, 3] });
    } },
    tap: { len: 4, make(v) {            // running water into a sink
      v.space(0.25);
      hiss(v, { d: 4, g: 0.3, a: 0.15, r: 0.3, filter: [['bandpass', 2400, 0.6], ['highshelf', 5000]] });
      for (let i = 0; i < 180; i++) drop(v, Math.random() * 3.8, { f: rnd(600, 2200), up: rnd(1.3, 2.4), len: rnd(0.015, 0.04), g: rnd(0.02, 0.07) });
    } },
    toilet: { len: 5, make(v) {         // flush: a roaring whoosh, gurgles, then the tank filling
      v.space(0.3);
      tick(v, 0, { g: 0.3, f: 1200, q: 2, dec: 0.01 });                                         // the handle
      hiss(v, { color: 'pink', d: 3.4, g: 0.8, pts: [[0, 0], [0.7, 1], [1.8, 0.8], [3.4, 0]], filter: ['lowpass', [[0, 300], [0.8, 2000], [3.4, 600]]] });
      for (let i = 0; i < 90; i++) { const t = 0.8 + Math.random() * 2.8; drop(v, t, { f: rnd(140, 420), up: rnd(1.5, 2.5), len: rnd(0.04, 0.09), g: 0.1 }); }
      hiss(v, { t: 3, d: 2, g: 0.12, a: 0.3, r: 0.4, filter: ['bandpass', 3200, 1] });
    } },
    dishes: { len: 3, gain: 1.6, make(v) {         // clinking plates, cups and cutlery
      v.space(0.22);
      for (let i = 0; i < 12; i++) { const t = Math.random() * 2.6; strike(v, { f: rnd(1800, 4200), t, g: rnd(0.04, 0.1), parts: [[1, 1, 0.25], [2.63, 0.6, 0.15], [4.9, 0.3, 0.08]] }); tick(v, t, { g: 0.1, f: 3500, q: 1, dec: 0.004 }); }
      for (let i = 0; i < 4; i++) { const t = Math.random() * 2.4; strike(v, { f: rnd(700, 1100), t, g: 0.08, parts: [[1, 1, 0.3], [1.72, 0.7, 0.2], [2.9, 0.4, 0.1]] }); tick(v, t, { g: 0.15, f: 1500, q: 1, dec: 0.006 }); }
    } },
    keys: { len: 2.5, gain: 2.4, make(v) {         // a bunch of keys, shaken
      v.space(0.15);
      for (const s of [0, 0.7, 1.3]) for (let i = 0; i < 16; i++) { const t = s + Math.random() * 0.35; ping(v, t, rnd(3500, 9000), rnd(0.02, 0.07), rnd(0.03, 0.12)); tick(v, t, { g: 0.05, f: 6000, q: 2, dec: 0.003 }); }
    } },
    typing: { len: 4, gain: 3.5, make(v) {         // keys clicking, the odd space bar
      v.space(0.15);
      v.every(() => Math.random() < 0.15 ? rnd(0.25, 0.6) : rnd(0.08, 0.16), (t, i) => {
        const space = Math.random() < 0.12, f = space ? 1100 : rnd(2600, 4200);
        tick(v, t, { g: space ? 0.35 : rnd(0.2, 0.35), f, q: 3, dec: space ? 0.008 : 0.004 });          // down
        tick(v, t + rnd(0.05, 0.09), { g: rnd(0.08, 0.15), f: f * 1.2, q: 3, dec: 0.003 });            // and up
      });
    } },
    rain: { len: 5, make(v) {           // a steady hiss and drops close by
      v.space(0.05);
      hiss(v, { color: 'pink', d: v.dur, g: 0.35, a: 0.8, r: 1, filter: [['highpass', 600], ['lowpass', 7000]] });
      v.every(() => rnd(0.01, 0.05), (t) => Math.random() < 0.5 ? drop(v, t, { f: rnd(1500, 4000), up: 1.3, len: 0.012, g: rnd(0.02, 0.06) }) : tick(v, t, { g: rnd(0.03, 0.1), f: rnd(2500, 6000), q: 1, dec: 0.003 }));
    } },
    stream: { len: 5, make(v) {         // babbling water: bubbles over a soft rush
      v.space(0.05);
      hiss(v, { color: 'pink', d: v.dur, g: 0.25, a: 0.8, r: 1, filter: ['bandpass', 900, 0.5] });
      v.every(() => rnd(0.008, 0.035), (t) => drop(v, t, { f: rnd(350, 1300), up: rnd(1.4, 2.4), len: rnd(0.02, 0.06), g: rnd(0.03, 0.09) }));
    } },
    ocean: { len: 7, make(v) {          // a wave rolls in, breaks, and draws back
      v.space(0.05);
      v.every(6.5, (t) => {
        hiss(v, { color: 'pink', t, d: 6.4, g: 0.8, pts: [[0, 0.1], [2, 0.7], [2.5, 1], [5.5, 0.25], [6.4, 0.1]], filter: ['lowpass', [[0, 300], [2.4, 2600], [6.4, 400]]] });
        hiss(v, { t: t + 2.3, d: 3.5, g: 0.18, pts: [[0, 0], [0.2, 1], [3.5, 0]], filter: ['highpass', 3000] });
      });
      hiss(v, { color: 'brown', d: v.dur, g: 0.3, a: 1, r: 1, filter: ['lowpass', 180] });
    } },
    wind: { len: 6, gain: 1.8, make(v) {           // gusts that rise and fall, and a whistle in them
      v.space(0.05);
      v.every(2, (t) => {
        const f = rnd(250, 700), g = rnd(0.4, 1);
        hiss(v, { color: 'pink', t, d: 3.2, g: 0.6 * g, pts: [[0, 0], [1.2, 1], [3.2, 0]], filter: ['bandpass', [[0, f], [1.2, f * 1.8], [3.2, f]], 1.2] });
        hiss(v, { t, d: 3.2, g: 0.035 * g, pts: [[0, 0], [1.4, 1], [3.2, 0]], filter: ['bandpass', [[0, f * 3], [1.4, f * 4], [3.2, f * 3]], 25] });
      });
    } },
    bird: { len: 5, make(v) {           // two birds singing
      v.space(0.1);
      v.every(() => rnd(0.6, 1.6), (t) => {
        const base = rnd(2500, 4200), n = 2 + (Math.random() * 6 | 0), kind = Math.random();
        for (let i = 0; i < n; i++) {
          const s = t + i * rnd(0.09, 0.14), f = base * rnd(0.85, 1.2);
          const path = kind < 0.4 ? [[0, f], [0.07, f * 1.5]] : kind < 0.7 ? [[0, f * 1.4], [0.08, f * 0.8]] : [[0, f], [0.04, f * 1.3], [0.08, f]];
          tone(v, { f: path, t: s, d: 0.08, a: 0.005, r: 0.03, g: 0.09, vib: [45, f * 0.04] });
        }
      });
    } },
    crickets: { len: 5, gain: 1.6, make(v) {       // several crickets trilling
      v.space(0.1);
      for (const [f, rate, off] of [[4300, 0.62, 0], [4700, 0.8, 0.27], [4050, 1.1, 0.5]]) v.every(rate, (t) => {
        for (let i = 0; i < 4; i++) tone(v, { f, t: t + i * 0.035, d: 0.025, a: 0.002, r: 0.01, g: 0.05 });
      }, off);
    } },
    dog: { len: 2.8, make(v) {          // woof woof … woof
      v.space(0.15);
      for (const t of [0, 0.35, 1.5]) {
        voice(v, { t, d: 0.17, f0: [[0, 420], [0.04, 520], [0.17, 300]], vowel: [[0, 'o'], [0.06, 'a'], [0.17, 'o']], g: 0.5, a: 0.006, r: 0.07, scale: 1.1, breath: 0.7, rough: 0.8, jitter: 0.04 });
        hiss(v, { t, d: 0.14, g: 0.35, a: 0.003, r: 0.09, filter: ['bandpass', 1300, 1.2], color: 'pink' });
      }
    } },
    cat: { len: 2.5, make(v) {          // mi-aa-ow
      v.space(0.15);
      voice(v, { d: 0.85, f0: [[0, 560], [0.25, 720], [0.6, 640], [0.85, 470]], vowel: [[0, 'i'], [0.3, 'ae'], [0.6, 'a'], [0.85, 'u']], g: 0.3, a: 0.05, r: 0.2, scale: 1.7, breath: 0.1, vib: [6, 12] });
      voice(v, { t: 1.4, d: 0.6, f0: [[0, 600], [0.2, 700], [0.6, 500]], vowel: [[0, 'e'], [0.3, 'a'], [0.6, 'u']], g: 0.22, a: 0.05, r: 0.2, scale: 1.7, breath: 0.1 });
    } },
    crackle: { len: 5, make(v) {        // a fire: a low roar and pops
      v.space(0.08);
      hiss(v, { color: 'brown', d: v.dur, g: 0.35, a: 0.6, r: 0.8, filter: ['lowpass', 350] });
      hiss(v, { d: v.dur, g: 0.03, a: 0.6, r: 0.8, filter: ['bandpass', 3500, 1] });
      v.every(() => Math.random() < 0.35 ? rnd(0.004, 0.02) : rnd(0.03, 0.18), (t) => tick(v, t, { g: rnd(0.03, 0.22) ** 1.2, f: rnd(1500, 7000), q: rnd(0.8, 3), dec: rnd(0.001, 0.006) }));
    } },
    music: { len: 8, make(v) {          // a little groove: drums, bass, chords and a tune
      v.space(0.2);
      const beat = 60 / 108, chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
      const tune = [659, 587, 523, 587, 659, 659, 659, 0, 587, 587, 587, 0, 659, 784, 784, 0];
      v.every(beat * 4, (t, bar) => {
        const c = chords[bar % 4];
        for (const f of c) tone(v, { type: 'triangle', f, t, d: beat * 4, a: 0.05, r: 0.3, g: 0.035 });
        for (let b = 0; b < 4; b++) {
          const tb = t + b * beat;
          if (b % 2 === 0) tone(v, { f: [[0, 150], [0.12, 45]], t: tb, d: 0.25, a: 0.002, r: 0.2, g: 0.5 });           // kick
          else { tick(v, tb, { g: 0.28, f: 1800, q: 0.7, dec: 0.05 }); tone(v, { f: 190, t: tb, d: 0.1, g: 0.12, a: 0.001, r: 0.08 }); }   // snare
          for (const h of [0, 0.5]) tick(v, tb + h * beat, { g: 0.08, f: 8000, q: 1, type: 'highpass', dec: 0.012 });
          tone(v, { type: 'sawtooth', f: c[0] / 2, t: tb, d: beat * 0.9, a: 0.01, r: 0.1, g: 0.07, filter: ['lowpass', 600] });
          for (const hh of [0, 0.5]) { const n = tune[((bar % 2) * 8 + b * 2 + hh * 2) % 16]; if (n) tone(v, { type: 'square', f: n, t: tb + hh * beat, d: beat * 0.45, a: 0.01, r: 0.08, g: 0.03, filter: ['lowpass', 2500] }); }
        }
      });
    } },
    ambient: { len: 6, gain: 2, make(v) {        // a busy room: many people talking, the odd laugh and clink
      v.space(0.45);
      hiss(v, { color: 'pink', d: v.dur, g: 0.1, a: 1, r: 1, filter: ['bandpass', 600, 0.6] });
      v.every(() => rnd(0.1, 0.35), (t) => {
        const r = Math.random();
        if (r < 0.85) babble(v, { t, d: rnd(0.4, 1.4), f0: pick([110, 130, 190, 220, 240]) * rnd(0.9, 1.1), scale: rnd(0.95, 1.2), g: rnd(0.03, 0.07) });
        else if (r < 0.93) for (let i = 0; i < 4; i++) voice(v, { t: t + i * 0.16, d: 0.1, f0: 260, vowel: 'a', g: 0.04, breath: 0.5 });
        else ping(v, t, rnd(2500, 4000), 0.03, 0.2);
      });
    } },
    thunder: { len: 7, make(v) {        // a crack, then the long rolling rumble (and a storm in between)
      v.space(0.2);
      v.every(() => rnd(9, 14), (t) => {
        hiss(v, { t, d: 0.5, g: 0.6, a: 0.002, pts: [[0, 0], [0.003, 1], [0.1, 0.4], [0.5, 0]], filter: ['lowpass', 5000] });
        hiss(v, { color: 'brown', t, d: 6, g: 1, pts: [[0, 0], [0.2, 0.9], [0.8, 0.6], [1.5, 1], [2.5, 0.5], [4, 0.6], [6, 0]], filter: ['lowpass', [[0, 800], [1, 300], [6, 120]]] });
        thud(v, t + 0.05, { f: 45, g: 0.6, dec: 0.8, noise: 0.3, nf: 200 });
      });
      if (v.loop) hiss(v, { color: 'brown', d: v.dur, g: 0.25, a: 2, r: 1, filter: ['lowpass', 150] });
    } },
    plane: { len: 7, make(v) {          // a jet overhead: roar and whine swell and fade
      v.space(0.05);
      hiss(v, { color: 'pink', d: 7, g: 0.8, pts: [[0, 0.02], [3.5, 1], [7, 0.02]], filter: ['lowpass', [[0, 600], [3.5, 2200], [7, 500]]] });
      hiss(v, { color: 'brown', d: 7, g: 0.5, pts: [[0, 0.05], [3.8, 1], [7, 0.05]], filter: ['lowpass', 250] });
      tone(v, { f: [[0, 3400], [3.5, 3300], [7, 2900]], d: 7, a: 3, r: 3.2, g: 0.018 });
    } },
    vacuum: { len: 4, make(v) {         // motor spins up to a whine, air rushing
      v.space(0.15);
      tone(v, { type: 'sawtooth', f: [[0, 60], [0.8, 190]], d: v.dur, a: 0.4, r: 0.6, g: 0.1, filter: ['lowpass', 2500] });
      tone(v, { f: [[0, 400], [0.8, 1520]], d: v.dur, a: 0.6, r: 0.6, g: 0.02 });
      hiss(v, { d: v.dur, g: 0.25, a: 0.8, r: 0.6, filter: ['bandpass', 2200, 0.9] });
    } },
    washer: { len: 5, make(v) {         // the drum turning: sloshing, a low hum, clothes tumbling
      v.space(0.2);
      tone(v, { type: 'sawtooth', f: 50, d: v.dur, a: 1, r: 0.6, g: 0.05, filter: ['lowpass', 200] });
      v.every(1.6, (t) => {
        hiss(v, { color: 'pink', t, d: 1.5, g: 0.35, pts: [[0, 0], [0.5, 1], [1.5, 0]], filter: ['lowpass', [[0, 300], [0.5, 900], [1.5, 300]]] });
        thud(v, t + 0.9, { f: 70, g: 0.2, dec: 0.1, noise: 0.25, nf: 500 });
      });
    } },
    snore: { len: 4.5, make(v) {        // a rattling breath in, a sigh out
      v.space(0.15);
      v.every(4.2, (t) => {
        voice(v, { t, d: 1.7, f0: 62, vowel: 'o', g: 0.3, a: 0.6, r: 0.3, scale: 0.8, breath: 0.6, rough: 0.9 });
        hiss(v, { t: t + 2.1, d: 1.4, g: 0.1, a: 0.3, r: 0.8, filter: ['bandpass', 900, 0.8] });
      });
    } },
    clock: { len: 4, gain: 2.5, make(v) {          // tick… tock…
      v.space(0.25);
      v.every(0.5, (t, i) => { tick(v, t, { g: 0.35, f: i % 2 ? 2300 : 3100, q: 5, dec: 0.004 }); tick(v, t + 0.012, { g: 0.12, f: i % 2 ? 1500 : 1900, q: 6, dec: 0.006 }); });
    } },
    behind: { len: 2.5, make(v) {       // something unclear: a muffled thump and a shuffle
      v.space(0.35);
      thud(v, 0.1, { f: 70, g: 0.5, dec: 0.15, noise: 0.3, nf: 300 });
      hiss(v, { color: 'pink', t: 0.4, d: 1.4, g: 0.25, pts: [[0, 0], [0.4, 1], [1.4, 0]], filter: ['bandpass', [[0, 400], [0.7, 1200], [1.4, 500]], 1] });
    } },
  };

  // ---------- public ----------
  function start(key, opts, loop) {
    const r = R[key] || R.behind;
    for (const old of live) if (old.done) live.delete(old);
    const v = new Voice(key, { ...opts, loop, dur: opts.dur ?? r.len, gain: (opts.gain ?? 1) * (r.gain ?? 1) });
    r.make(v);
    if (!offline) live.add(v);
    return v;
  }
  return {
    ctx,
    has: (key) => !!R[key],
    length: (key) => (R[key] || R.behind).len,
    // Browsers only let a page play sound after a tap: call this from one (the remote does on every tap).
    unlock() {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}   // iPhone: play even with the ring switch on silent
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, SR); b.connect(ctx.destination); b.start();
      if (window.speechSynthesis) speechSynthesis.getVoices();
    },
    play: (key, opts = {}) => start(key, opts, false),       // once, for its usual length (or opts.dur seconds)
    loop: (key, opts = {}) => start(key, opts, true),        // until .stop()
    // For as long as it's held (a sound being moved around): the sound again and again, back to back.
    // .aim(angle, gain) moves it, .stop() ends it. `adopt`: a voice already playing (the tap that began it).
    hold(key, { angle = null, gain = 1, adopt = null } = {}) {
      const len = (R[key] || R.behind).len, vs = new Set();
      let stopped = false, timer = 0;
      const again = (after) => { timer = setTimeout(() => {
        if (stopped) return;
        const v = start(key, { angle }, false); v.aim(angle, gain, true); vs.add(v);
        again(len + 0.25);
      }, after * 1000); };
      if (adopt && !adopt.done) { vs.add(adopt); adopt.aim(angle, gain); again(Math.max(0, adopt.end - ctx.currentTime) + 0.25); }
      else again(0);
      return {
        aim(a, g = 1) { angle = a; gain = g; for (const v of vs) v.done ? vs.delete(v) : v.aim(a, g); },
        stop(fade = 0.35) { stopped = true; clearTimeout(timer); for (const v of vs) v.stop(fade); vs.clear(); },
      };
    },
    stopAll() { for (const v of [...live]) v.stop(); if (window.speechSynthesis) speechSynthesis.cancel(); },
    playing: () => [...live].filter(v => !v.done),
    volume(x) { master.gain.value = x; },
  };
}

export const loopable = (key) => !!SOUNDS[key]?.loop;
