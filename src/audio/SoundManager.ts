import type { SimEvent } from '../engine/types';
import { soundForEvent, SoundThrottle, type SoundKind } from './sounds';

export type { SoundKind };

/**
 * Efectos de sonido sintetizados con Web Audio (doc 04, Fase 4): sin archivos de audio, con
 * *throttling* para altas velocidades. Cada categoría tiene un enfriamiento de 45–60 ms y nunca
 * suenan más de 8 voces a la vez, así 32 drones cosechando a toda velocidad no saturan la mezcla.
 * El contexto de audio se crea con el primer gesto del jugador (política de autoplay).
 */
interface Tone {
  /** Hz al empezar (y al terminar si hay barrido). */
  freq: number;
  to?: number;
  type: OscillatorType | 'noise';
  /** Segundos. */
  dur: number;
  gain: number;
  delay?: number;
  /** Filtro paso banda para el ruido. */
  band?: number;
}

const SOUNDS: Record<SoundKind, readonly Tone[]> = {
  harvest: [
    { freq: 660, to: 990, type: 'triangle', dur: 0.09, gain: 0.32 },
    { freq: 2400, type: 'noise', dur: 0.05, gain: 0.12, band: 2400 },
  ],
  thud: [{ freq: 180, to: 90, type: 'sine', dur: 0.1, gain: 0.3 }],
  plant: [{ freq: 240, to: 150, type: 'sine', dur: 0.08, gain: 0.32 }],
  till: [
    { freq: 900, type: 'noise', dur: 0.09, gain: 0.22, band: 900 },
    { freq: 120, to: 80, type: 'square', dur: 0.06, gain: 0.08 },
  ],
  water: [{ freq: 1400, to: 500, type: 'sine', dur: 0.14, gain: 0.2 }],
  fertilize: [
    { freq: 520, to: 780, type: 'sine', dur: 0.12, gain: 0.18 },
    { freq: 780, to: 1040, type: 'sine', dur: 0.1, gain: 0.12, delay: 0.05 },
  ],
  swap: [{ freq: 440, to: 330, type: 'triangle', dur: 0.08, gain: 0.22 }],
  spawn: [
    { freq: 220, to: 660, type: 'sawtooth', dur: 0.18, gain: 0.1 },
    { freq: 1200, type: 'noise', dur: 0.12, gain: 0.08, band: 1600 },
  ],
  flip: [{ freq: 300, to: 900, type: 'triangle', dur: 0.32, gain: 0.2 }],
  unlock: [
    { freq: 523, type: 'triangle', dur: 0.12, gain: 0.25 },
    { freq: 784, type: 'triangle', dur: 0.18, gain: 0.25, delay: 0.09 },
  ],
  treasure: [
    { freq: 880, type: 'triangle', dur: 0.1, gain: 0.22 },
    { freq: 1175, type: 'triangle', dur: 0.1, gain: 0.22, delay: 0.07 },
    { freq: 1568, type: 'triangle', dur: 0.16, gain: 0.22, delay: 0.14 },
  ],
  mega: [{ freq: 110, to: 70, type: 'sine', dur: 0.25, gain: 0.4 }],
  eat: [{ freq: 380, to: 520, type: 'square', dur: 0.06, gain: 0.08 }],
  pet: [
    { freq: 700, to: 900, type: 'sine', dur: 0.08, gain: 0.18 },
    { freq: 900, to: 760, type: 'sine', dur: 0.08, gain: 0.16, delay: 0.1 },
  ],
  hat: [{ freq: 1800, type: 'noise', dur: 0.08, gain: 0.12, band: 3000 }],
  achievement: [
    { freq: 523, type: 'triangle', dur: 0.14, gain: 0.25 },
    { freq: 659, type: 'triangle', dur: 0.14, gain: 0.25, delay: 0.1 },
    { freq: 1047, type: 'triangle', dur: 0.3, gain: 0.25, delay: 0.2 },
  ],
  record: [
    { freq: 392, type: 'square', dur: 0.12, gain: 0.1 },
    { freq: 523, type: 'square', dur: 0.12, gain: 0.1, delay: 0.1 },
    { freq: 784, type: 'square', dur: 0.32, gain: 0.1, delay: 0.2 },
  ],
  error: [{ freq: 196, to: 147, type: 'square', dur: 0.2, gain: 0.08 }],
};

const MASTER_GAIN = 0.35;

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.5;
  private unlocked = false;
  private readonly throttle = new SoundThrottle();

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = () => this.resume();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master) this.master.gain.value = this.volume * MASTER_GAIN;
  }

  /** Primer gesto del jugador: crea o reanuda el contexto de audio. */
  resume(): void {
    this.unlocked = true;
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  onEvents(events: readonly SimEvent[]): void {
    if (this.volume <= 0 || !this.unlocked || events.length === 0) return;
    for (const event of events) {
      const kind = soundForEvent(event);
      if (kind) this.play(kind);
    }
  }

  play(kind: SoundKind): void {
    if (this.volume <= 0 || !this.unlocked) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running' || !this.master) return;
    const tones = SOUNDS[kind];
    if (!this.throttle.allow(kind, performance.now(), tones.length)) return;
    const now = ctx.currentTime;
    for (const tone of tones) this.voice(ctx, this.master, tone, now);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined' || this.volume <= 0) return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.volume * MASTER_GAIN;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
    } catch {
      return null;
    }
    return this.ctx;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const length = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Ruido pseudoaleatorio fijo (no forma parte de la simulación, pero así es reproducible).
    let seed = 0x9e3779b9;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    this.noise = buffer;
    return buffer;
  }

  private voice(ctx: AudioContext, out: AudioNode, tone: Tone, now: number): void {
    const start = now + (tone.delay ?? 0);
    const end = start + tone.dur;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.gain, start + Math.min(0.01, tone.dur / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    let source: AudioScheduledSourceNode;
    let filter: BiquadFilterNode | null = null;
    if (tone.type === 'noise') {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer(ctx);
      filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = tone.band ?? tone.freq;
      filter.Q.value = 1.2;
      noise.connect(filter).connect(gain);
      source = noise;
    } else {
      const osc = ctx.createOscillator();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.freq, start);
      if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, end);
      osc.connect(gain);
      source = osc;
    }
    gain.connect(out);
    this.throttle.active++;
    source.onended = () => {
      this.throttle.active = Math.max(0, this.throttle.active - 1);
      source.disconnect();
      filter?.disconnect();
      gain.disconnect();
    };
    source.start(start);
    source.stop(end + 0.02);
  }
}

export const soundManager = new SoundManager();
