/**
 * Mini-tracker: zamienia zapis nutowy (tekst) na próbki audio.
 * Służy do wbudowanej, oryginalnej muzyki przykładowej walki — bez żadnych plików dźwiękowych.
 * Każdy utwór ma wstęp (grany raz) i pętlę, więc pokazuje działanie punktów loop start / loop end.
 *
 * Zapis: takt = 16 kroków (szesnastek) oddzielonych spacjami:
 *   "A4", "C#5"  – nuta,   "-" – przedłużenie poprzedniej nuty,   "." – pauza
 * Perkusja:  k = stopa, s = werbel, h = hi-hat, o = otwarty hi-hat, t = "tik" (klik zegara)
 */
import { SAMPLE_RATE, type Wave } from './synth';

export interface SongChannel {
  wave: Wave;
  vol: number;
  duty?: number;
  /** Jaką część kroku brzmi nuta (1 = legato, 0.5 = staccato). */
  gate?: number;
  /** Głębokość vibrato w procentach częstotliwości. */
  vibrato?: number;
  bars: string[];
}

export interface Song {
  name: string;
  bpm: number;
  /** Liczba taktów wstępu (granych tylko raz). */
  introBars: number;
  channels: SongChannel[];
  drums: string[];
}

export interface RenderedSong {
  samples: Float32Array;
  sampleRate: number;
  loopStart: number;
  loopEnd: number;
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteFreq(name: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error(`Zła nuta: ${name}`);
  let semi = NOTE_INDEX[m[1]];
  if (m[2] === '#') semi++;
  if (m[2] === 'b') semi--;
  const midi = (parseInt(m[3], 10) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function osc(wave: Wave, p: number, duty: number): number {
  switch (wave) {
    case 'square':
      return p < duty ? 1 : -1;
    case 'saw':
      return 2 * p - 1;
    case 'triangle':
      return 4 * Math.abs(p - 0.5) - 1;
    default:
      return Math.sin(p * Math.PI * 2);
  }
}

export function renderSong(song: Song, sampleRate = SAMPLE_RATE): RenderedSong {
  const stepDur = 60 / song.bpm / 4;
  const bars = song.drums.length;
  const totalSteps = bars * 16;
  const total = Math.round(totalSteps * stepDur * sampleRate);
  const out = new Float32Array(total);
  const stepSample = (s: number) => Math.round(s * stepDur * sampleRate);

  for (const ch of song.channels) {
    if (ch.bars.length !== bars) throw new Error(`Kanał utworu "${song.name}" ma ${ch.bars.length} taktów zamiast ${bars}`);
    const tokens = ch.bars.flatMap((b) => b.trim().split(/\s+/));
    if (tokens.length !== totalSteps) throw new Error(`Utwór "${song.name}": zła liczba kroków (${tokens.length} / ${totalSteps})`);
    const gate = ch.gate ?? 0.88;
    const duty = ch.duty ?? 0.5;
    for (let s = 0; s < totalSteps; s++) {
      const tk = tokens[s];
      if (tk === '.' || tk === '-') continue;
      let len = 1;
      while (s + len < totalSteps && tokens[s + len] === '-') len++;
      const freq = noteFreq(tk);
      const start = stepSample(s);
      const n = Math.min(total - start, Math.round((len - 1 + gate) * stepDur * sampleRate));
      const attack = Math.round(0.004 * sampleRate);
      const decay = Math.round(0.06 * sampleRate);
      const release = Math.min(n, Math.round(0.025 * sampleRate));
      let phase = 0;
      for (let i = 0; i < n; i++) {
        let f = freq;
        if (ch.vibrato && i > 0.12 * sampleRate) f *= 1 + Math.sin((i / sampleRate) * Math.PI * 2 * 5.5) * ch.vibrato * 0.01;
        phase += f / sampleRate;
        const p = phase - Math.floor(phase);
        let env = i < attack ? i / attack : i < attack + decay ? 1 - 0.28 * ((i - attack) / decay) : 0.72;
        if (i > n - release) env *= (n - i) / release;
        out[start + i] += osc(ch.wave, p, duty) * env * ch.vol;
      }
    }
  }

  // perkusja
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
  const drumTokens = song.drums.flatMap((b) => b.trim().split(/\s+/));
  if (drumTokens.length !== totalSteps) throw new Error(`Utwór "${song.name}": zła liczba kroków perkusji`);
  for (let s = 0; s < totalSteps; s++) {
    const tk = drumTokens[s];
    if (tk === '.') continue;
    const start = stepSample(s);
    if (tk === 'k') {
      const n = Math.min(total - start, Math.round(0.13 * sampleRate));
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        phase += (150 * Math.pow(45 / 150, k)) / sampleRate;
        out[start + i] += Math.sin(phase * Math.PI * 2) * Math.pow(1 - k, 1.5) * 0.55;
      }
    } else if (tk === 's') {
      const n = Math.min(total - start, Math.round(0.12 * sampleRate));
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        phase += (190 - 50 * k) / sampleRate;
        const tone = 4 * Math.abs((phase % 1) - 0.5) - 1;
        out[start + i] += (rand() * 0.34 + tone * 0.16) * Math.pow(1 - k, 1.8);
      }
    } else if (tk === 'h' || tk === 'o') {
      const n = Math.min(total - start, Math.round((tk === 'o' ? 0.13 : 0.035) * sampleRate));
      let prev = 0;
      for (let i = 0; i < n; i++) {
        const r = rand();
        out[start + i] += (r - prev) * 0.5 * Math.pow(1 - i / n, 2) * 0.22;
        prev = r;
      }
    } else if (tk === 't') {
      const n = Math.min(total - start, Math.round(0.03 * sampleRate));
      let phase = 0;
      for (let i = 0; i < n; i++) {
        phase += 2100 / sampleRate;
        out[start + i] += (phase % 1 < 0.5 ? 1 : -1) * Math.pow(1 - i / n, 2.5) * 0.14;
      }
    }
  }

  // miękkie ograniczenie szczytów i normalizacja
  let peak = 0;
  for (let i = 0; i < total; i++) {
    out[i] = Math.tanh(out[i] * 1.1);
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0) {
    const g = 0.8 / peak;
    for (let i = 0; i < total; i++) out[i] *= g;
  }
  return { samples: out, sampleRate, loopStart: song.introBars * 16 * stepDur, loopEnd: totalSteps * stepDur };
}

// ---------------------------------------------------------------------------------------------
//  Utwory wbudowane (kompozycje własne przygotowane dla przykładowej walki)
// ---------------------------------------------------------------------------------------------

const REST = '. . . . . . . . . . . . . . . .';

/** Faza 1 — "Tik-Tak Tango": spokojniejszy, tykający motyw w a-moll. */
const TIK_TAK: Song = {
  name: 'Tik-Tak Tango',
  bpm: 132,
  introBars: 2,
  channels: [
    {
      // melodia
      wave: 'square',
      duty: 0.25,
      vol: 0.2,
      gate: 0.8,
      vibrato: 0.5,
      bars: [
        'E6 . . . E5 . . . E6 . . . E5 . . .',
        'E6 . . . E5 . . . E6 . E5 . E6 . E5 .',
        'E5 . E5 . A5 - G5 . E5 - . . C5 . D5 .',
        'E5 - - . D5 . C5 . B4 - . . A4 - - .',
        'F5 . F5 . A5 - G5 . F5 - . . A4 . C5 .',
        'F5 - E5 . D5 - C5 . D5 - - . E5 - - .',
        'G5 . G5 . C6 - B5 . G5 - . . E5 . G5 .',
        'B5 - A5 . G5 - D5 . G5 - - . B4 . D5 .',
        'E5 . A5 . C6 - B5 . A5 - . . E5 - C5 .',
        'B4 . E5 . G#5 - B5 . E5 - G#5 - B5 - - .',
      ],
    },
    {
      // arpeggio akordów
      wave: 'square',
      duty: 0.5,
      vol: 0.075,
      gate: 0.55,
      bars: [
        REST,
        REST,
        'A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4',
        'A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4',
        'F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3',
        'F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3',
        'C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4',
        'G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3',
        'A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4',
        'E3 G#3 B3 G#3 E3 G#3 B3 G#3 E3 G#3 B3 G#3 E3 G#3 B3 G#3',
      ],
    },
    {
      // bas
      wave: 'triangle',
      vol: 0.42,
      gate: 0.9,
      bars: [
        REST,
        'A2 - - . . . . . A2 - - . . . E2 .',
        'A2 . A2 . A3 . A2 . A2 . A2 . A3 . E3 .',
        'A2 . A2 . A3 . A2 . A2 . A2 . A3 . E3 .',
        'F2 . F2 . F3 . F2 . F2 . F2 . F3 . C3 .',
        'F2 . F2 . F3 . F2 . F2 . F2 . F3 . C3 .',
        'C3 . C3 . C4 . C3 . C3 . C3 . C4 . G2 .',
        'G2 . G2 . G3 . G2 . G2 . G2 . G3 . D3 .',
        'A2 . A2 . A3 . A2 . A2 . A2 . A3 . E3 .',
        'E2 . E2 . E3 . E2 . E2 . E3 . G#2 . B2 .',
      ],
    },
  ],
  drums: [
    't . . . t . . . t . . . t . . .',
    't . . . t . . . t . t . s . s s',
    'k . h . s . h . k k h . s . h .',
    'k . h . s . h . k k h . s . h h',
    'k . h . s . h . k k h . s . h .',
    'k . h . s . h . k . h . s s s s',
    'k . h . s . h . k k h . s . h .',
    'k . h . s . h . k k h . s . h h',
    'k . h . s . h . k k h . s . h .',
    'k . h . s . o . k . s . s s s s',
  ],
};

/** Faza 2 — "Burza w Budziku": szybszy, bardziej nerwowy wariant. */
const BURZA: Song = {
  name: 'Burza w Budziku',
  bpm: 168,
  introBars: 1,
  channels: [
    {
      wave: 'square',
      duty: 0.25,
      vol: 0.2,
      gate: 0.8,
      vibrato: 0.5,
      bars: [
        '. . . . . . . . . . . . E5 . G#5 B5',
        'A5 . E5 A5 . E5 A5 . C6 . B5 A5 . E5 . .',
        'G5 . D5 G5 . D5 G5 . B5 . A5 G5 . D5 . .',
        'F5 . C5 F5 . C5 F5 . A5 . G5 F5 . C5 . .',
        'E5 . G#5 B5 . G#5 E5 . G#5 - B5 - E6 - - .',
        'A5 - C6 . E6 - C6 . A5 - C6 . E6 . D6 C6',
        'B5 - D6 . G5 - B5 . D6 - B5 . G5 . A5 B5',
        'A5 - C6 . F5 - A5 . C6 - A5 . F5 . G5 A5',
        'G#5 - B5 . E5 - G#5 . B5 . E6 . G#5 . B5 .',
      ],
    },
    {
      wave: 'square',
      duty: 0.5,
      vol: 0.075,
      gate: 0.55,
      bars: [
        REST,
        'A3 E4 A4 E4 A3 E4 A4 E4 A3 E4 A4 E4 A3 E4 A4 E4',
        'G3 D4 G4 D4 G3 D4 G4 D4 G3 D4 G4 D4 G3 D4 G4 D4',
        'F3 C4 F4 C4 F3 C4 F4 C4 F3 C4 F4 C4 F3 C4 F4 C4',
        'E3 B3 E4 B3 E3 B3 E4 B3 E3 B3 E4 B3 E3 B3 E4 B3',
        'A3 E4 A4 E4 A3 E4 A4 E4 A3 E4 A4 E4 A3 E4 A4 E4',
        'G3 D4 G4 D4 G3 D4 G4 D4 G3 D4 G4 D4 G3 D4 G4 D4',
        'F3 C4 F4 C4 F3 C4 F4 C4 F3 C4 F4 C4 F3 C4 F4 C4',
        'E3 B3 E4 B3 E3 B3 E4 B3 E3 G#3 B3 G#3 E3 G#3 B3 G#3',
      ],
    },
    {
      wave: 'triangle',
      vol: 0.42,
      gate: 0.9,
      bars: [
        'E2 - - - - - - . E2 - - . E2 . E2 .',
        'A2 . A2 . A2 . A2 . A2 . A2 . A3 . A2 .',
        'G2 . G2 . G2 . G2 . G2 . G2 . G3 . G2 .',
        'F2 . F2 . F2 . F2 . F2 . F2 . F3 . F2 .',
        'E2 . E2 . E2 . E2 . E2 . E2 . E3 . G#2 .',
        'A2 . A2 . A2 . A2 . A2 . A2 . A3 . A2 .',
        'G2 . G2 . G2 . G2 . G2 . G2 . G3 . G2 .',
        'F2 . F2 . F2 . F2 . F2 . F2 . F3 . F2 .',
        'E2 . E2 . E2 . E2 . E2 . E3 . G#2 . B2 .',
      ],
    },
  ],
  drums: [
    's . . . s . . . s . s . s s s s',
    'k . h . s . h k k . h . s . h .',
    'k . h . s . h k k . h . s . h h',
    'k . h . s . h k k . h . s . h .',
    'k . h . s . h k k . s . s s s s',
    'k . h . s . h k k . h . s . h .',
    'k . h . s . h k k . h . s . h h',
    'k . h . s . h k k . h . s . h .',
    'k . h . s . o . k . s . s s s s',
  ],
};

export const BUILTIN_SONGS: Record<string, Song> = {
  'music-tik-tak': TIK_TAK,
  'music-burza': BURZA,
};
