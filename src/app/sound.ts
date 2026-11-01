// Zvuky živého utkání – syntéza přes Web Audio (bez souborů): zajásání davu, zahučení, potlesk.
// Prohlížeč pustí zvuk až po první interakci se stránkou, proto se AudioContext odemyká při prvním klepnutí.

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC() as AudioContext;
  return ctx;
}

const listeners = new Set<() => void>();
/** Zavolá se, když se zvuk odemkne (první klepnutí na stránku). */
export function onSoundUnlock(cb: () => void) { listeners.add(cb); }
/** Smí stránka teď hrát zvuk? (AudioContext běží – po prvním klepnutí od načtení) */
export function soundUnlocked(): boolean { return !!ctx && ctx.state === "running"; }
/** Odemkne zvuk (volat z klepnutí uživatele). */
export function unlockSound() {
  const c = ac();
  if (!c) return;
  const done = () => listeners.forEach((l) => l());
  if (c.state === "suspended") c.resume().then(done, () => {}); else done();
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlockSound, { passive: true });
  window.addEventListener("keydown", unlockSound);
  // pokus o povolení bez klepnutí (např. nainstalovaná aplikace v Chromu na Androidu); jinak čeká na první klepnutí
  try {
    const c = ac();
    if (c) {
      const done = () => { if (c.state === "running") listeners.forEach((l) => l()); };
      c.addEventListener?.("statechange", done);
      if (c.state === "running") setTimeout(done, 0);
      else c.resume().then(done, () => {});
    }
  } catch { /* prohlížeč bez Web Audio */ }
}

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const b = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf = b);
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function master(c: AudioContext, vol: number): GainNode {
  const comp = c.createDynamicsCompressor();
  comp.connect(c.destination);
  const g = c.createGain();
  g.gain.value = vol;
  g.connect(comp);
  return g;
}

/** Hlasy davu: pásmově filtrovaný šum s formanty „é/á“, kolísající hlasitost, náběh a doznění. */
function crowd(c: AudioContext, out: AudioNode, t0: number, dur: number, voices: number, lo: number, hi: number, level: number) {
  for (let v = 0; v < voices; v++) {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = rnd(lo, hi);
    bp.Q.value = rnd(2, 6);
    const g = c.createGain();
    const start = t0 + rnd(0, 0.25), peak = rnd(0.7, 1) * level, end = t0 + dur * rnd(0.75, 1);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + rnd(0.08, 0.25));
    // „vlny“ jásotu
    const steps = Math.floor((end - start) / 0.12);
    for (let i = 2; i < steps; i++) g.gain.linearRampToValueAtTime(peak * rnd(0.55, 1), start + i * 0.12);
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(start, rnd(0, 3)); src.stop(end + 0.05);
  }
}

/** Tlesknutí: krátký šumový impulz s výškovým filtrem. */
function claps(c: AudioContext, out: AudioNode, t0: number, dur: number, perSec: number, level: number) {
  const n = Math.floor(dur * perSec);
  for (let i = 0; i < n; i++) {
    const t = t0 + Math.random() * dur;
    const fade = 1 - Math.max(0, (t - t0) / dur - 0.6) / 0.4; // ke konci řidne
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = rnd(900, 2600); bp.Q.value = rnd(0.7, 1.6);
    const g = c.createGain();
    g.gain.setValueAtTime(level * rnd(0.4, 1) * fade, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + rnd(0.03, 0.07));
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(t, rnd(0, 3)); src.stop(t + 0.1);
  }
}

/** Krátké zajásání davu (~1,6 s). */
function cheer(c: AudioContext, t0: number, long = false) {
  const out = master(c, 0.9);
  const dur = long ? 3.2 : 1.6;
  crowd(c, out, t0, dur, 26, 700, 2600, 0.5);
  crowd(c, out, t0, dur, 10, 300, 700, 0.35);
  // pár výkřiků „hej“: tón s rychlým vzestupem
  for (let i = 0; i < 6; i++) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    const t = t0 + rnd(0, 0.4), f = rnd(220, 420);
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * rnd(1.15, 1.35), t + 0.25);
    o.frequency.linearRampToValueAtTime(f * 1.05, t + 0.7);
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = rnd(800, 1400); bp.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.06); g.gain.linearRampToValueAtTime(0, t + rnd(0.5, 0.9));
    o.connect(bp); bp.connect(g); g.connect(out);
    o.start(t); o.stop(t + 1);
  }
  claps(c, out, t0 + 0.1, dur, long ? 45 : 22, 0.5);
}

/** Smutné zahučení davu „óóó…“ (~1,8 s): hluboké hlasy s klesající výškou přes formant „ó“. */
function groan(c: AudioContext, t0: number) {
  const out = master(c, 0.9);
  const f1 = c.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = 480; f1.Q.value = 2.5;
  const f2 = c.createBiquadFilter(); f2.type = "bandpass"; f2.frequency.value = 850; f2.Q.value = 3;
  const g2 = c.createGain(); g2.gain.value = 0.5;
  f1.connect(out); f2.connect(g2); g2.connect(out);
  const dur = 1.9;
  for (let v = 0; v < 14; v++) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    const t = t0 + rnd(0, 0.15), f = rnd(105, 210);
    o.frequency.setValueAtTime(f * 1.04, t);
    o.frequency.linearRampToValueAtTime(f, t + 0.3);
    o.frequency.linearRampToValueAtTime(f * rnd(0.72, 0.8), t + dur);
    const lfo = c.createOscillator(); lfo.frequency.value = rnd(4, 6.5);
    const lg = c.createGain(); lg.gain.value = f * 0.012;
    lfo.connect(lg); lg.connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + rnd(0.15, 0.3));
    g.gain.linearRampToValueAtTime(0.07, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(f1); g.connect(f2);
    o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  crowd(c, out, t0, dur, 8, 250, 600, 0.18);
}

export type LiveSound = "win" | "loss" | "victory";

// zvuky davu z MP3 (public/sounds), načtené až při prvním použití; při chybě syntéza
const buffers = new Map<string, AudioBuffer | null>();
async function mp3(c: AudioContext, name: string): Promise<AudioBuffer | null> {
  if (buffers.has(name)) return buffers.get(name)!;
  try {
    const r = await fetch(`sounds/${name}.mp3`);
    const b = await c.decodeAudioData(await r.arrayBuffer());
    buffers.set(name, b);
    return b;
  } catch { buffers.set(name, null); return null; }
}
function playBuf(c: AudioContext, b: AudioBuffer, at: number, gain = 1) {
  const s = c.createBufferSource(); s.buffer = b;
  const g = c.createGain(); g.gain.value = gain;
  s.connect(g); g.connect(c.destination); s.start(at);
}

export function playSound(kind: LiveSound) {
  const c = ac();
  if (!c) return;
  const go = async () => {
    const b = await mp3(c, kind === "loss" ? "loss" : "win");
    const t = c.currentTime + 0.05;
    if (b) {
      playBuf(c, b, t);
      if (kind === "victory") playBuf(c, b, t + Math.max(0.5, b.duration - 0.25)); // konec utkání: zajásání 2× (~4 s)
      return;
    }
    if (kind === "win") cheer(c, t);
    else if (kind === "loss") groan(c, t);
    else cheer(c, t, true);
  };
  if (c.state === "suspended") c.resume().then(go, () => {}); else void go();
}
