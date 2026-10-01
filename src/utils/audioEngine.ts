/**
 * Ambient Data Sonification Engine
 * =================================
 * A tiny Web Audio singleton that turns dataset health into an ambient
 * harmonic drone, and query lifecycle events into tactile glass/depth cues.
 *
 * - Ambient drone: two detuned sine oscillators + slow LFO breathing.
 *   A perfect unison = pristine data. Progressive detune + wobble = noise,
 *   missing values and statistical anomalies — perceptible subconsciously
 *   before the user ever reads the quality score.
 * - Interaction cues: crystalline "glass" chime for light queries, a deep
 *   resonant boom for heavy ones, a soft buzz for failures, and rising
 *   quantum blips for the 9-layer security gate.
 *
 * Everything is opt-in (muted by default, persisted in localStorage) and
 * only ever synthesized locally — zero assets, zero network.
 */

type AmbientVoices = {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  gainA: GainNode;
  gainB: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
};

const STORAGE_KEY = 'carbon_sonification_enabled';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: AmbientVoices | null = null;
  private ambientQuality = 100;
  private listeners = new Set<(enabled: boolean) => void>();

  enabled = false;

  constructor() {
    try {
      this.enabled = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      this.enabled = false;
    }
  }

  onEnabledChange(cb: (enabled: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.enabled));
  }

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  setEnabled(next: boolean, qualityScore?: number) {
    this.enabled = next;
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* private mode */
    }
    if (next) {
      this.ensureCtx();
      if (qualityScore !== undefined) this.startAmbient(qualityScore);
    } else {
      this.stopAmbient();
    }
    this.notify();
  }

  /** Start (or retune) the ambient drone for a dataset quality score (0-100). */
  startAmbient(qualityScore: number) {
    if (!this.enabled) return;
    const ctx = this.ensureCtx();
    if (!ctx || !this.master) return;
    this.ambientQuality = qualityScore;

    if (this.ambient) {
      this.retuneAmbient(qualityScore);
      return;
    }

    const now = ctx.currentTime;
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const gainA = ctx.createGain();
    const gainB = ctx.createGain();

    oscA.type = 'sine';
    oscB.type = 'sine';
    oscA.frequency.value = 110; // A2 — calm analytical root
    oscB.frequency.value = 165; // E3 — pure fifth above (3:2 ratio)

    gainA.gain.value = 0.035;
    gainB.gain.value = 0.022;

    // Slow breathing LFO on the master ambient bed
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.06; // one breath every ~16s
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain);
    lfoGain.connect(gainA.gain);

    oscA.connect(gainA).connect(this.master);
    oscB.connect(gainB).connect(this.master);
    oscA.start(now);
    oscB.start(now);
    lfo.start(now);

    this.ambient = { oscA, oscB, gainA, gainB, lfo, lfoGain };
    this.retuneAmbient(qualityScore);
  }

  /** Retune detune/wobble to reflect data quality (100 = pure harmonic). */
  retuneAmbient(qualityScore: number) {
    if (!this.ambient || !this.ctx) return;
    const now = this.ctx.currentTime;
    const noiseAmount = Math.max(0, Math.min(1, (100 - qualityScore) / 100));
    // Up to ~14 cents of detune for badly degraded data
    this.ambient.oscB.detune.setTargetAtTime(noiseAmount * 14, now, 1.2);
    // Wobble speed rises with data decay
    this.ambient.lfo.frequency.setTargetAtTime(0.06 + noiseAmount * 0.22, now, 1.2);
  }

  updateAmbientQuality(qualityScore: number) {
    this.ambientQuality = qualityScore;
    if (this.ambient) this.retuneAmbient(qualityScore);
  }

  stopAmbient() {
    if (!this.ambient || !this.ctx) return;
    const { oscA, oscB, lfo } = this.ambient;
    const now = this.ctx.currentTime;
    [oscA, oscB, lfo].forEach(o => {
      try {
        o.stop(now + 0.4);
      } catch {
        /* already stopped */
      }
    });
    this.ambient = null;
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, when = 0) {
    if (!this.enabled) return;
    const ctx = this.ensureCtx();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Glass chime for light queries / successful gate passage. */
  chimeSuccess() {
    this.blip(1318.5, 0.35, 'sine', 0.10); // E6
    this.blip(1975.5, 0.45, 'sine', 0.06, 0.06); // B6 sparkle
  }

  /** Deep boom for heavy (long-running) queries. */
  chimeHeavy() {
    if (!this.enabled) return;
    const ctx = this.ensureCtx();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.9);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 1.5);
  }

  chimeError() {
    this.blip(196, 0.28, 'triangle', 0.09); // G3 — warm, not alarming
    this.blip(185, 0.3, 'triangle', 0.07, 0.09); // minor second beat
  }

  /** Rising quantum blip as the photon crosses each security layer. */
  gateLayer(index: number) {
    const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1108.73, 1174.66];
    this.blip(scale[index % scale.length], 0.16, 'sine', 0.07);
  }

  /** Low reflective buzz when a security layer blocks the photon. */
  gateBlocked() {
    if (!this.enabled) return;
    const ctx = this.ensureCtx();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(98, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.5);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    osc.connect(lp).connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  /** Magnetic snap "pluck" for the ERD canvas. */
  magneticSnap() {
    this.blip(880, 0.12, 'sine', 0.08);
    this.blip(1174.66, 0.18, 'sine', 0.05, 0.03);
  }
}

export const audio = new AudioEngine();
