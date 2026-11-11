/**
 * Synteza prostych dźwięków "chiptune" bez plików audio.
 * Wszystkie domyślne efekty (blipy tekstu, trafienia, grazing...) powstają tutaj z opisu tonów,
 * dzięki czemu gra działa od razu po uruchomieniu, a każdy dźwięk można potem podmienić własnym plikiem.
 */
import type { SfxEvent, VoiceDef } from '../battle/types';

export const SAMPLE_RATE = 44100;

export type Wave = 'square' | 'triangle' | 'saw' | 'sine' | 'noise';

export interface Tone {
  wave: Wave;
  /** Częstotliwość początkowa (Hz). */
  from: number;
  /** Częstotliwość końcowa (płynne przejście); domyślnie stała. */
  to?: number;
  /** Czas trwania (s). */
  dur: number;
  /** Opóźnienie startu (s). */
  at?: number;
  /** Głośność 0..1. */
  vol?: number;
  /** Wypełnienie fali prostokątnej 0..1. */
  duty?: number;
  /** Głębokość vibrato (Hz). */
  vibrato?: number;
  /** Kształt wybrzmiewania: większa wartość = szybsze wyciszenie. */
  decay?: number;
}

/** Renderuje listę tonów do jednej ścieżki mono. */
export function renderTones(tones: Tone[], sampleRate = SAMPLE_RATE): Float32Array {
  let total = 0;
  for (const t of tones) total = Math.max(total, (t.at ?? 0) + t.dur);
  const out = new Float32Array(Math.ceil(total * sampleRate) + 64);
  let seed = 0x2f6e2b1;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
  for (const t of tones) {
    const start = Math.floor((t.at ?? 0) * sampleRate);
    const n = Math.floor(t.dur * sampleRate);
    const vol = t.vol ?? 0.25;
    const to = t.to ?? t.from;
    const duty = t.duty ?? 0.5;
    const decay = t.decay ?? 1.6;
    const attack = Math.min(n, Math.floor(0.003 * sampleRate));
    const release = Math.min(n, Math.floor(0.006 * sampleRate));
    let phase = 0;
    let held = 0;
    let holdPhase = 1;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      let f = t.from * Math.pow(to / t.from, k);
      if (t.vibrato) f += Math.sin((i / sampleRate) * Math.PI * 2 * 7) * t.vibrato;
      let s: number;
      if (t.wave === 'noise') {
        // szum próbkowany z częstotliwością f — im niższa, tym "grubszy" dźwięk
        holdPhase += f / sampleRate;
        if (holdPhase >= 1) {
          holdPhase -= Math.floor(holdPhase);
          held = rand();
        }
        s = held;
      } else {
        phase += f / sampleRate;
        const p = phase - Math.floor(phase);
        if (t.wave === 'square') s = p < duty ? 1 : -1;
        else if (t.wave === 'saw') s = 2 * p - 1;
        else if (t.wave === 'triangle') s = 4 * Math.abs(p - 0.5) - 1;
        else s = Math.sin(p * Math.PI * 2);
      }
      let env = Math.pow(1 - k, decay);
      if (i < attack) env *= i / attack;
      if (i > n - release) env *= (n - i) / release;
      out[start + i] += s * env * vol;
    }
  }
  return out;
}

const NOTE = (semitonesFromA4: number): number => 440 * Math.pow(2, semitonesFromA4 / 12);
const C4 = NOTE(-9), D4 = NOTE(-7), E4 = NOTE(-5), G4 = NOTE(-2), A3 = NOTE(-12);
const C5 = NOTE(3), E5 = NOTE(7), G5 = NOTE(10), GS5 = NOTE(11), B5 = NOTE(14), C6 = NOTE(15), E6 = NOTE(19);

/** Domyślne brzmienia zdarzeń. */
export const SFX_TONES: Record<SfxEvent, Tone[]> = {
  menuMove: [{ wave: 'square', from: 620, dur: 0.045, vol: 0.2, duty: 0.25 }],
  menuSelect: [
    { wave: 'square', from: 740, dur: 0.05, vol: 0.2, duty: 0.25 },
    { wave: 'square', from: 1110, at: 0.05, dur: 0.1, vol: 0.2, duty: 0.25 },
  ],
  menuCancel: [{ wave: 'square', from: 520, to: 300, dur: 0.1, vol: 0.18 }],
  menuDeny: [
    { wave: 'saw', from: 160, to: 118, dur: 0.15, vol: 0.24 },
    { wave: 'square', from: 110, dur: 0.15, vol: 0.1 },
  ],
  text: [{ wave: 'square', from: 440, dur: 0.035, vol: 0.18, duty: 0.25 }],
  swing: [{ wave: 'noise', from: 7000, to: 900, dur: 0.14, vol: 0.3 }],
  hit: [
    { wave: 'noise', from: 3200, to: 380, dur: 0.15, vol: 0.42 },
    { wave: 'sine', from: 190, to: 55, dur: 0.17, vol: 0.5 },
  ],
  crit: [
    { wave: 'noise', from: 5200, to: 500, dur: 0.17, vol: 0.42 },
    { wave: 'sine', from: 230, to: 50, dur: 0.2, vol: 0.5 },
    { wave: 'square', from: 1320, at: 0.02, dur: 0.07, vol: 0.18, duty: 0.25 },
    { wave: 'square', from: 1980, at: 0.08, dur: 0.2, vol: 0.18, duty: 0.25 },
  ],
  miss: [{ wave: 'square', from: 300, to: 170, dur: 0.13, vol: 0.14 }],
  hurt: [
    { wave: 'saw', from: 440, to: 95, dur: 0.25, vol: 0.3 },
    { wave: 'noise', from: 2400, to: 300, dur: 0.13, vol: 0.3 },
  ],
  graze: [{ wave: 'square', from: 1760, to: 2640, dur: 0.05, vol: 0.13, duty: 0.25 }],
  heal: [
    { wave: 'triangle', from: C5, dur: 0.1, vol: 0.32, decay: 1 },
    { wave: 'triangle', from: E5, at: 0.07, dur: 0.1, vol: 0.32, decay: 1 },
    { wave: 'triangle', from: G5, at: 0.14, dur: 0.1, vol: 0.32, decay: 1 },
    { wave: 'triangle', from: C6, at: 0.21, dur: 0.26, vol: 0.32 },
  ],
  mercy: [
    { wave: 'sine', from: 880, dur: 0.1, vol: 0.24 },
    { wave: 'sine', from: 1175, at: 0.08, dur: 0.2, vol: 0.24 },
  ],
  spare: [
    { wave: 'triangle', from: E5, dur: 0.11, vol: 0.3, decay: 1 },
    { wave: 'triangle', from: GS5, at: 0.09, dur: 0.11, vol: 0.3, decay: 1 },
    { wave: 'triangle', from: B5, at: 0.18, dur: 0.11, vol: 0.3, decay: 1 },
    { wave: 'triangle', from: E6, at: 0.27, dur: 0.4, vol: 0.3 },
    { wave: 'sine', from: E6 * 2, at: 0.27, dur: 0.4, vol: 0.09 },
  ],
  defend: [
    { wave: 'square', from: 330, to: 494, dur: 0.09, vol: 0.18 },
    { wave: 'noise', from: 1500, to: 800, dur: 0.06, vol: 0.1 },
  ],
  magic: [
    { wave: 'triangle', from: 392, to: 1568, dur: 0.28, vol: 0.28, vibrato: 12, decay: 0.8 },
    { wave: 'sine', from: 1568, at: 0.26, dur: 0.3, vol: 0.18 },
    { wave: 'sine', from: 2093, at: 0.32, dur: 0.3, vol: 0.12 },
  ],
  item: [
    { wave: 'sine', from: 660, to: 990, dur: 0.1, vol: 0.28, decay: 1 },
    { wave: 'sine', from: 990, to: 1320, at: 0.1, dur: 0.14, vol: 0.22 },
  ],
  enemyDefeat: [
    { wave: 'noise', from: 4000, to: 200, dur: 0.42, vol: 0.32 },
    { wave: 'square', from: 330, to: 60, dur: 0.42, vol: 0.2 },
  ],
  boxOpen: [
    { wave: 'triangle', from: 180, to: 520, dur: 0.16, vol: 0.28, decay: 1 },
    { wave: 'noise', from: 800, to: 3000, dur: 0.12, vol: 0.08 },
  ],
  phase: [
    { wave: 'saw', from: 110, to: 55, dur: 0.7, vol: 0.3, vibrato: 6, decay: 0.8 },
    { wave: 'noise', from: 300, to: 2400, dur: 0.6, vol: 0.18, decay: 0.6 },
    { wave: 'square', from: 220, to: 880, at: 0.35, dur: 0.4, vol: 0.15, duty: 0.25 },
  ],
  win: [
    { wave: 'square', from: G4, dur: 0.1, vol: 0.2, duty: 0.25, decay: 0.8 },
    { wave: 'square', from: C5, at: 0.1, dur: 0.1, vol: 0.2, duty: 0.25, decay: 0.8 },
    { wave: 'square', from: E5, at: 0.2, dur: 0.1, vol: 0.2, duty: 0.25, decay: 0.8 },
    { wave: 'square', from: G5, at: 0.3, dur: 0.15, vol: 0.2, duty: 0.25, decay: 0.8 },
    { wave: 'square', from: E5, at: 0.46, dur: 0.08, vol: 0.2, duty: 0.25, decay: 0.8 },
    { wave: 'square', from: G5, at: 0.54, dur: 0.6, vol: 0.2, duty: 0.25 },
    { wave: 'triangle', from: C4, at: 0.3, dur: 0.85, vol: 0.28, decay: 0.8 },
    { wave: 'triangle', from: E4, at: 0.54, dur: 0.6, vol: 0.18 },
  ],
  lose: [
    { wave: 'triangle', from: E4, dur: 0.3, vol: 0.3, decay: 0.7 },
    { wave: 'triangle', from: D4, at: 0.28, dur: 0.3, vol: 0.3, decay: 0.7 },
    { wave: 'triangle', from: C4, at: 0.56, dur: 0.3, vol: 0.3, decay: 0.7 },
    { wave: 'triangle', from: A3, at: 0.84, dur: 0.8, vol: 0.3 },
    { wave: 'saw', from: A3 / 2, at: 0.84, dur: 0.8, vol: 0.12 },
  ],
  downed: [
    { wave: 'saw', from: 300, to: 70, dur: 0.45, vol: 0.28 },
    { wave: 'noise', from: 1200, to: 200, dur: 0.3, vol: 0.18 },
  ],
  revive: [
    { wave: 'triangle', from: 392, to: 784, dur: 0.2, vol: 0.28, decay: 0.8 },
    { wave: 'sine', from: 1175, at: 0.18, dur: 0.28, vol: 0.2 },
  ],
  bubble: [{ wave: 'sine', from: 520, to: 780, dur: 0.06, vol: 0.2 }],
  warn: [
    { wave: 'square', from: 988, dur: 0.06, vol: 0.12 },
    { wave: 'square', from: 988, at: 0.1, dur: 0.06, vol: 0.12 },
  ],
  tick: [{ wave: 'square', from: 1500, dur: 0.02, vol: 0.1, duty: 0.25 }],
};

/** Pojedynczy "blip" głosu postaci. */
export function renderBlip(voice: VoiceDef | undefined): Float32Array {
  const wave: Wave = voice?.wave ?? 'square';
  const pitch = voice?.pitch ?? 440;
  if (wave === 'noise') return renderTones([{ wave: 'noise', from: pitch * 6, to: pitch * 3, dur: 0.035, vol: 0.2 }]);
  return renderTones([{ wave, from: pitch, to: pitch * 0.97, dur: wave === 'sine' || wave === 'triangle' ? 0.05 : 0.036, vol: wave === 'square' ? 0.16 : 0.26, duty: 0.25, decay: 1.2 }]);
}
