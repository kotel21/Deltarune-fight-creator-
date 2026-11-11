/**
 * Minigra FIGHT: dla każdej atakującej postaci po pasku przesuwa się kreska.
 * Naciśnij Z, gdy jest jak najbliżej środka — im bliżej, tym więcej obrażeń.
 * Jeśli atakuje kilka postaci, ich kreski startują jedna po drugiej.
 */
import type { AudioEngine } from '../audio/audio';
import { type Ctx, rect } from '../core/gfx';
import type { Input } from '../core/input';
import type { BitmapFont } from '../core/text';
import { type Rng, shade } from '../core/util';
import { PERFECT_ZONE, timingPower, type TimingRating } from './formulas';

export interface TimingLane {
  memberIndex: number;
  name: string;
  color: string;
  /** Ile sekund zostało do startu kreski. */
  delay: number;
  /** Pozycja kreski 0..1 wzdłuż paska (0.5 = środek). */
  pos: number;
  state: 'waiting' | 'moving' | 'stopped' | 'missed';
  power: number;
  rating: TimingRating;
  /** Czas od zatrzymania (do animacji błysku). */
  since: number;
}

/** Czas przejazdu kreski przez cały pasek (s). */
const SWEEP_TIME = 1.05;

export const RATING_LABEL: Record<TimingRating, string> = {
  perfect: 'IDEALNIE!',
  good: 'DOBRZE',
  ok: 'SŁABO',
  miss: 'PUDŁO',
};

export class TimingGame {
  readonly lanes: TimingLane[];
  done = false;
  private endTimer = 0;

  constructor(members: { index: number; name: string; color: string }[], rng: Rng) {
    this.lanes = members.map((m, i) => ({
      memberIndex: m.index,
      name: m.name,
      color: m.color,
      delay: 0.35 + i * 0.5 + rng.range(0, 0.18),
      pos: 0,
      state: 'waiting',
      power: 0,
      rating: 'miss',
      since: 0,
    }));
  }

  update(dt: number, input: Input, audio: AudioEngine): void {
    if (this.done) return;
    let press = input.pressed('confirm');
    let active = 0;
    for (const lane of this.lanes) {
      if (lane.state === 'waiting') {
        lane.delay -= dt;
        if (lane.delay <= 0) lane.state = 'moving';
        active++;
      } else if (lane.state === 'moving') {
        active++;
        if (press) {
          // jedno naciśnięcie zatrzymuje jedną (najwcześniejszą) kreskę
          press = false;
          const r = timingPower((lane.pos - 0.5) / 0.5);
          lane.state = 'stopped';
          lane.power = r.power;
          lane.rating = r.rating;
          audio.sfx(r.rating === 'perfect' ? 'crit' : 'menuSelect', { volume: 0.6 });
          continue;
        }
        lane.pos += dt / SWEEP_TIME;
        if (lane.pos >= 1) {
          lane.pos = 1;
          lane.state = 'missed';
          lane.power = 0;
          lane.rating = 'miss';
          audio.sfx('miss');
        }
      } else {
        lane.since += dt;
      }
    }
    if (active === 0) {
      this.endTimer += dt;
      if (this.endTimer >= 0.45) this.done = true;
    }
  }

  /** Rysuje paski w obszarze okna dialogowego. */
  render(ctx: Ctx, font: BitmapFont, x: number, y: number, w: number, colors: { panel: string; border: string; dim: string }): void {
    const laneH = 30;
    const gap = 6;
    const labelW = 96;
    const trackX = x + labelW + 8;
    const trackW = w - labelW - 8 - 96;
    this.lanes.forEach((lane, i) => {
      const ly = y + i * (laneH + gap);
      // etykieta postaci
      rect(ctx, x, ly, labelW, laneH, shade(lane.color, -0.72));
      rect(ctx, x, ly, 4, laneH, lane.color);
      font.draw(ctx, lane.name.toUpperCase(), x + 12, ly + 10, lane.color);
      // pasek
      rect(ctx, trackX, ly, trackW, laneH, '#05060f');
      rect(ctx, trackX, ly, trackW, 2, colors.dim);
      rect(ctx, trackX, ly + laneH - 2, trackW, 2, colors.dim);
      // strefy: dobra i idealna
      const mid = trackX + trackW / 2;
      const good = trackW * 0.5 * 0.35;
      rect(ctx, mid - good, ly + 2, good * 2, laneH - 4, shade(lane.color, -0.7));
      const perfect = Math.max(3, trackW * 0.5 * PERFECT_ZONE);
      rect(ctx, mid - perfect, ly + 2, perfect * 2, laneH - 4, shade(lane.color, -0.25));
      rect(ctx, mid - 1, ly - 3, 2, laneH + 6, '#ffffff');
      // kreska
      if (lane.state !== 'waiting') {
        const cx = trackX + lane.pos * trackW;
        if (lane.state === 'moving') {
          rect(ctx, cx - 10, ly + 4, 8, laneH - 8, lane.color, 0.25);
          rect(ctx, cx - 3, ly - 2, 6, laneH + 4, lane.color);
          rect(ctx, cx - 1, ly - 2, 2, laneH + 4, '#ffffff');
        } else if (lane.state === 'stopped') {
          const flash = Math.max(0, 1 - lane.since * 5);
          rect(ctx, cx - 3 - flash * 6, ly - 2 - flash * 4, 6 + flash * 12, laneH + 4 + flash * 8, '#ffffff', 0.35 + flash * 0.65);
          rect(ctx, cx - 2, ly - 2, 4, laneH + 4, lane.rating === 'perfect' ? '#ffe45c' : '#ffffff');
        }
      }
      // ocena
      if (lane.state === 'stopped' || lane.state === 'missed') {
        const label = RATING_LABEL[lane.rating];
        const c = lane.rating === 'perfect' ? '#ffe45c' : lane.rating === 'miss' ? '#9aa0c8' : lane.rating === 'good' ? '#ffffff' : '#c8cbe6';
        font.draw(ctx, label, trackX + trackW + 10, ly + 10, c);
      }
    });
  }

  results(): { memberIndex: number; power: number; rating: TimingRating }[] {
    return this.lanes.map((l) => ({ memberIndex: l.memberIndex, power: l.power, rating: l.rating }));
  }
}
