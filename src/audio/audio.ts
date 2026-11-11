/**
 * Silnik audio (Web Audio API):
 *  - efekty dźwiękowe: wbudowane (syntezowane) albo własne pliki przypisane do zdarzeń,
 *  - blipy głosów postaci przy pisaniu tekstu,
 *  - muzyka z punktami pętli (loop start / loop end), głośnością i płynnym przejściem między fazami.
 *
 * Przeglądarki pozwalają odtwarzać dźwięk dopiero po geście użytkownika, dlatego
 * AudioContext powstaje w unlock(), wywoływanym przy pierwszym kliknięciu / klawiszu.
 */
import type { MusicDef, SfxEvent, SoundDef, VoiceDef } from '../battle/types';
import { BUILTIN_SONGS, renderSong } from './chiptune';
import { renderBlip, renderTones, SAMPLE_RATE, SFX_TONES } from './synth';

type VolumeKind = 'master' | 'music' | 'sfx';

interface PlayingMusic {
  key: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

function dataUrlToArrayBuffer(url: string): ArrayBuffer {
  const comma = url.indexOf(',');
  const meta = url.slice(0, comma);
  const body = url.slice(comma + 1);
  if (/;base64/i.test(meta)) {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  const text = decodeURIComponent(body);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes.buffer;
}

/** Punkty pętli wbudowanego utworu (bez renderowania go). */
export function builtinSongLoop(name: string): { loopStart: number; loopEnd: number } | null {
  const song = BUILTIN_SONGS[name];
  if (!song) return null;
  const stepDur = 60 / song.bpm / 4;
  return { loopStart: song.introBars * 16 * stepDur, loopEnd: song.drums.length * 16 * stepDur };
}

export class AudioEngine {
  readonly volume: Record<VolumeKind, number> = { master: 0.8, music: 0.55, sfx: 0.9 };
  muted = false;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;

  private readonly builtinSfx = new Map<string, AudioBuffer>();
  private readonly blips = new Map<string, AudioBuffer>();
  private readonly sounds = new Map<string, AudioBuffer>();
  private readonly builtinLoops = new Map<string, { loopStart: number; loopEnd: number }>();
  private customSfx: Partial<Record<SfxEvent, string>> = {};
  private music: PlayingMusic | null = null;
  private readonly lastPlayed = new Map<string, number>();

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Czas zegara audio (s) — 0, gdy audio nie działa. */
  get time(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Tworzy/wznawia AudioContext. Wywołuj z obsługi kliknięcia lub klawisza. */
  async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.applyVolumes();
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return this.ctx.state === 'running';
    } catch {
      return false;
    }
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume.master, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.volume.music, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.volume.sfx, t, 0.02);
  }

  setVolume(kind: VolumeKind, value: number): void {
    this.volume[kind] = Math.max(0, Math.min(1, value));
    this.applyVolumes();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  private toBuffer(samples: Float32Array, sampleRate = SAMPLE_RATE): AudioBuffer | null {
    if (!this.ctx) return null;
    const buf = this.ctx.createBuffer(1, samples.length, sampleRate);
    buf.getChannelData(0).set(samples);
    return buf;
  }

  /**
   * Wczytuje dźwięki projektu (muzykę i własne efekty). Zwraca listę błędów (pusta = wszystko OK).
   * Wymaga wcześniejszego unlock().
   */
  async loadProject(sounds: Record<string, SoundDef>, sfx: Partial<Record<SfxEvent, string>>): Promise<string[]> {
    this.customSfx = { ...sfx };
    const errors: string[] = [];
    const ctx = this.ctx;
    if (!ctx) return errors;
    this.sounds.clear();
    this.builtinLoops.clear();
    await Promise.all(
      Object.entries(sounds).map(async ([id, def]) => {
        try {
          if (def.src.startsWith('builtin:')) {
            const name = def.src.slice('builtin:'.length);
            const song = BUILTIN_SONGS[name];
            if (!song) throw new Error(`nieznany wbudowany dźwięk "${name}"`);
            const r = renderSong(song);
            const buf = this.toBuffer(r.samples, r.sampleRate);
            if (buf) this.sounds.set(id, buf);
            this.builtinLoops.set(id, { loopStart: r.loopStart, loopEnd: r.loopEnd });
            return;
          }
          const data = def.src.startsWith('data:') ? dataUrlToArrayBuffer(def.src) : await (await fetch(def.src)).arrayBuffer();
          this.sounds.set(id, await ctx.decodeAudioData(data));
        } catch (e) {
          errors.push(`${def.name ?? id}: ${(e as Error).message}`);
        }
      }),
    );
    return errors;
  }

  /** Długość wczytanego dźwięku w sekundach (0, gdy nie istnieje). */
  duration(soundId: string): number {
    return this.sounds.get(soundId)?.duration ?? 0;
  }

  private play(buffer: AudioBuffer, volume: number, rate: number): void {
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    if (volume === 1) src.connect(this.sfxBus);
    else {
      const g = this.ctx.createGain();
      g.gain.value = volume;
      src.connect(g);
      g.connect(this.sfxBus);
    }
    src.start();
  }

  /** Odtwarza efekt przypisany do zdarzenia (własny plik, a jeśli go nie ma — wbudowany). */
  sfx(event: SfxEvent, opts: { volume?: number; rate?: number } = {}): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(event);
    if (last !== undefined && now - last < 0.03) return; // nie sklejamy identycznych dźwięków
    this.lastPlayed.set(event, now);
    const customId = this.customSfx[event];
    let buf = customId ? this.sounds.get(customId) : undefined;
    if (!buf) {
      buf = this.builtinSfx.get(event);
      if (!buf) {
        const b = this.toBuffer(renderTones(SFX_TONES[event]));
        if (!b) return;
        this.builtinSfx.set(event, b);
        buf = b;
      }
    }
    this.play(buf, opts.volume ?? 1, opts.rate ?? 1);
  }

  /** Blip głosu postaci (przy pisaniu tekstu). */
  blip(voice?: VoiceDef): void {
    if (!this.ctx) return;
    if (voice?.sound) {
      const custom = this.sounds.get(voice.sound);
      if (custom) {
        this.play(custom, 1, 1);
        return;
      }
    }
    const customText = this.customSfx.text ? this.sounds.get(this.customSfx.text) : undefined;
    if (customText && !voice) {
      this.play(customText, 1, 1);
      return;
    }
    const key = `${voice?.wave ?? 'square'}:${voice?.pitch ?? 440}`;
    let buf = this.blips.get(key);
    if (!buf) {
      const b = this.toBuffer(renderBlip(voice));
      if (!b) return;
      this.blips.set(key, b);
      buf = b;
    }
    this.play(buf, 1, 1);
  }

  /** Uruchamia muzykę (albo płynnie przechodzi do innego utworu). null = cisza. */
  playMusic(def: MusicDef | null | undefined, fade = 0.5): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    if (!def) {
      this.stopMusic(fade);
      return;
    }
    const buf = this.sounds.get(def.sound);
    if (!buf) {
      this.stopMusic(fade);
      return;
    }
    const key = `${def.sound}|${def.loopStart ?? ''}|${def.loopEnd ?? ''}|${def.loop ?? ''}`;
    const vol = def.volume ?? 1;
    const now = ctx.currentTime;
    if (this.music && this.music.key === key) {
      this.music.gain.gain.setTargetAtTime(vol, now, 0.1);
      return;
    }
    this.stopMusic(fade);
    const source = ctx.createBufferSource();
    source.buffer = buf;
    if (def.loop !== false) {
      const builtin = this.builtinLoops.get(def.sound);
      const loopStart = Math.max(0, Math.min(buf.duration, def.loopStart ?? builtin?.loopStart ?? 0));
      let loopEnd = def.loopEnd ?? builtin?.loopEnd ?? 0;
      if (!(loopEnd > loopStart)) loopEnd = buf.duration;
      source.loop = true;
      source.loopStart = loopStart;
      source.loopEnd = Math.min(buf.duration, loopEnd);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + Math.max(0.03, fade * 0.5));
    source.connect(gain);
    gain.connect(this.musicBus);
    source.start();
    this.music = { key, source, gain };
  }

  stopMusic(fade = 0.6): void {
    const m = this.music;
    if (!m || !this.ctx) return;
    this.music = null;
    const now = this.ctx.currentTime;
    m.gain.gain.cancelScheduledValues(now);
    m.gain.gain.setValueAtTime(Math.max(0.0001, m.gain.gain.value), now);
    m.gain.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.02, fade));
    try {
      m.source.stop(now + Math.max(0.02, fade) + 0.05);
    } catch {
      /* źródło już zatrzymane */
    }
  }

  /** Chwilowe przyciszenie muzyki (np. w pauzie). */
  duckMusic(factor: number): void {
    if (!this.ctx || !this.musicBus) return;
    this.musicBus.gain.setTargetAtTime(this.volume.music * factor, this.ctx.currentTime, 0.05);
  }

  /** Czy aktualnie gra jakaś muzyka. */
  get musicPlaying(): boolean {
    return !!this.music;
  }
}
