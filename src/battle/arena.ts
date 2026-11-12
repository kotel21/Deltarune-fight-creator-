/**
 * Bullet box: pudełko walki z serduszkiem (SOUL) i pociskami.
 * Odpowiada za ruch serduszka, wypuszczanie pocisków według osi czasu ataku,
 * kolizje (trafienie + i-frames) oraz grazing (ocieranie się o pociski).
 */
import type { Input } from '../core/input';
import { type Ctx, drawSprite, rect, type SpriteRes } from '../core/gfx';
import { clamp, easeInCubic, easeOutBack, rad, type Rng } from '../core/util';
import { type Bullet, emit, type EmitContext, type Emission, expandSpawns, hitDistance, stepBullet } from './patterns';
import type { AttackDef, BoxDef, BulletTypeDef, RulesDef } from './types';

/** Domyślny środek pudełka na ekranie. */
export const BOX_CX = 320;
export const BOX_CY = 158;

const BORDER = 4;
const SOUL_HALF = 8;
const OPEN_TIME = 0.32;
const CLOSE_TIME = 0.22;
const GRAZE_INTERVAL = 0.25;

export interface ArenaEvents {
  /** Serduszko zostało trafione pociskiem. */
  onHit(b: Bullet): void;
  /** Otarcie o pocisk; first = pierwsze otarcie o ten pocisk. */
  onGraze(b: Bullet, first: boolean): void;
}

export interface ArenaStart {
  types: Map<string, BulletTypeDef>;
  rng: Rng;
  speedMult: number;
  enemyX: number;
  enemyY: number;
}

export type ArenaPhase = 'closed' | 'opening' | 'active' | 'closing';

export class Arena {
  cx = BOX_CX;
  cy = BOX_CY;
  w = 160;
  h = 160;
  shape: BoxDef['shape'] = 'rect';
  phase: ArenaPhase = 'closed';
  /** Stopień otwarcia pudełka 0..1 (animacja). */
  open = 0;
  /** Czas od rozpoczęcia ataku i jego długość. */
  time = 0;
  duration = 0;
  soulX = BOX_CX;
  soulY = BOX_CY;
  /** Pozostały czas nietykalności po trafieniu. */
  inv = 0;
  /** Siła poświaty grazingu 0..1. */
  grazeGlow = 0;
  bullets: Bullet[] = [];
  /** Rysowanie obszarów trafienia (podgląd w edytorze). */
  showHitboxes = false;

  private emissions: Emission[] = [];
  private nextEmission = 0;
  private emitCtx: EmitContext | null = null;

  /** Rozpoczyna atak: otwiera pudełko i przygotowuje oś czasu. */
  begin(attack: AttackDef, start: ArenaStart): void {
    this.cx = BOX_CX + (attack.box.offsetX ?? 0);
    this.cy = BOX_CY + (attack.box.offsetY ?? 0);
    this.w = clamp(attack.box.w, 40, 600);
    this.h = clamp(attack.box.h, 40, 290);
    this.shape = attack.box.shape;
    this.phase = 'opening';
    this.open = 0;
    this.time = 0;
    this.duration = Math.max(0.5, attack.duration);
    this.soulX = this.cx;
    this.soulY = this.cy;
    this.inv = 0;
    this.grazeGlow = 0;
    this.bullets = [];
    this.emissions = expandSpawns(attack.spawns);
    this.nextEmission = 0;
    this.emitCtx = {
      boxX: this.cx,
      boxY: this.cy,
      soulX: this.soulX,
      soulY: this.soulY,
      enemyX: start.enemyX,
      enemyY: start.enemyY,
      rng: start.rng,
      speedMult: start.speedMult,
      types: start.types,
    };
  }

  /** Przerywa atak (np. gdy cała drużyna padła). */
  abort(): void {
    if (this.phase === 'opening' || this.phase === 'active') this.phase = 'closing';
  }

  get finished(): boolean {
    return this.phase === 'closed';
  }

  /** Ile czasu zostało do końca ataku (s). */
  get remaining(): number {
    return Math.max(0, this.duration - this.time);
  }

  update(dt: number, input: Input, rules: RulesDef, events: ArenaEvents): void {
    if (this.phase === 'closed') return;
    this.grazeGlow = Math.max(0, this.grazeGlow - dt * 4);
    if (this.inv > 0) this.inv = Math.max(0, this.inv - dt);

    if (this.phase === 'opening') {
      this.open = Math.min(1, this.open + dt / OPEN_TIME);
      if (this.open >= 1) this.phase = 'active';
      return;
    }

    if (this.phase === 'closing') {
      this.open = Math.max(0, this.open - dt / CLOSE_TIME);
      for (const b of this.bullets) stepBullet(b, dt, this.soulX, this.soulY);
      if (this.open <= 0) {
        this.phase = 'closed';
        this.bullets = [];
      }
      return;
    }

    // --- faza aktywna
    this.time += dt;
    this.moveSoul(dt, input, rules);

    const c = this.emitCtx!;
    c.soulX = this.soulX;
    c.soulY = this.soulY;
    while (this.nextEmission < this.emissions.length && this.emissions[this.nextEmission].time <= this.time) {
      const e = this.emissions[this.nextEmission++];
      if (this.bullets.length < 1500) this.bullets.push(...emit(e, c));
    }

    let anyDead = false;
    for (const b of this.bullets) {
      stepBullet(b, dt, this.soulX, this.soulY);
      if (b.dead) {
        anyDead = true;
        continue;
      }
      if (b.warn > 0) continue;
      const d = hitDistance(b, this.soulX, this.soulY);
      if (d <= rules.soulRadius) {
        if (this.inv <= 0) {
          this.inv = rules.iframes;
          events.onHit(b);
          if (!b.type.persist) {
            b.dead = true;
            anyDead = true;
          }
        }
      } else if (d <= rules.grazeRadius && this.inv <= 0) {
        if (!b.grazed) {
          b.grazed = true;
          b.grazeTimer = GRAZE_INTERVAL;
          this.grazeGlow = 1;
          events.onGraze(b, true);
        } else {
          b.grazeTimer -= dt;
          if (b.grazeTimer <= 0) {
            b.grazeTimer = GRAZE_INTERVAL;
            this.grazeGlow = Math.max(this.grazeGlow, 0.6);
            events.onGraze(b, false);
          }
        }
      }
    }
    if (anyDead) this.bullets = this.bullets.filter((b) => !b.dead);
    if (this.time >= this.duration) this.phase = 'closing';
  }

  private moveSoul(dt: number, input: Input, rules: RulesDef): void {
    const a = input.axis();
    const speed = rules.soulSpeed * (input.held('cancel') ? 0.5 : 1);
    this.soulX += a.x * speed * dt;
    this.soulY += a.y * speed * dt;
    this.clampSoul();
  }

  /** Trzyma serduszko wewnątrz pudełka. */
  clampSoul(): void {
    const hw = Math.max(0, this.w / 2 - BORDER - SOUL_HALF);
    const hh = Math.max(0, this.h / 2 - BORDER - SOUL_HALF);
    if (this.shape === 'ellipse') {
      const dx = this.soulX - this.cx;
      const dy = this.soulY - this.cy;
      const a = Math.max(1, hw);
      const b = Math.max(1, hh);
      const v = (dx * dx) / (a * a) + (dy * dy) / (b * b);
      if (v > 1) {
        const k = 1 / Math.sqrt(v);
        this.soulX = this.cx + dx * k;
        this.soulY = this.cy + dy * k;
      }
    } else {
      this.soulX = clamp(this.soulX, this.cx - hw, this.cx + hw);
      this.soulY = clamp(this.soulY, this.cy - hh, this.cy + hh);
    }
  }

  /** Czy punkt leży wewnątrz pudełka (z marginesem w pikselach). */
  contains(x: number, y: number, margin = 0): boolean {
    const hw = this.w / 2 + margin;
    const hh = this.h / 2 + margin;
    const dx = x - this.cx;
    const dy = y - this.cy;
    if (this.shape === 'ellipse') return (dx * dx) / (hw * hw) + (dy * dy) / (hh * hh) <= 1;
    return Math.abs(dx) <= hw && Math.abs(dy) <= hh;
  }

  render(ctx: Ctx, o: { boxColor: string; fillColor: string; glowColor: string; soul: SpriteRes | null; sprite: (id: string) => SpriteRes | null; time: number }): void {
    if (this.phase === 'closed') return;
    const s = this.phase === 'closing' ? easeInCubic(this.open) : easeOutBack(this.open);
    const bw = Math.max(0, Math.round((this.w * s) / 2) * 2);
    const bh = Math.max(0, Math.round((this.h * s) / 2) * 2);
    this.drawBox(ctx, bw, bh, o.boxColor, o.fillColor);

    // pociski — poza pudełkiem są przygaszone, żeby nie zasłaniały sceny, ale było widać, co nadlatuje
    const fade = this.phase === 'closing' ? this.open : 1;
    for (const b of this.bullets) {
      const spr = o.sprite(b.type.sprite);
      if (!spr) continue;
      let alpha = fade * (this.contains(b.x, b.y, 10) ? 1 : 0.4);
      if (b.warn > 0) alpha *= Math.floor(o.time * 12) % 2 ? 0.6 : 0.28;
      else if (b.age < 0.08) alpha *= 0.4 + (b.age / 0.08) * 0.6;
      drawSprite(ctx, spr, b.age * spr.fps, b.x, b.y, {
        rot: b.rot ? rad(b.rot) : 0,
        scale: spr.scale * b.scale,
        alpha,
      });
      if (this.showHitboxes) this.drawHitbox(ctx, b);
    }

    // serduszko
    if (o.soul && this.phase !== 'closing' && this.open > 0.6) {
      if (this.grazeGlow > 0) {
        // poświata grazingu: dwie rozszerzające się sylwetki serduszka w kolorze TP
        const g = this.grazeGlow;
        drawSprite(ctx, o.soul, 0, this.soulX, this.soulY, { tint: o.glowColor, scale: o.soul.scale * (1.5 + (1 - g) * 1.1), alpha: g * 0.45 });
        drawSprite(ctx, o.soul, 0, this.soulX, this.soulY, { tint: '#ffffff', scale: o.soul.scale * (1.2 + (1 - g) * 0.4), alpha: Math.min(1, g * 1.2) });
      }
      const blink = this.inv > 0 && Math.floor(this.inv * 14) % 2 === 0;
      if (!blink) drawSprite(ctx, o.soul, o.time * o.soul.fps, this.soulX, this.soulY);
      if (this.showHitboxes) {
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.soulX, this.soulY, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawBox(ctx: Ctx, bw: number, bh: number, color: string, fill: string): void {
    if (bw <= 0 || bh <= 0) return;
    const x = Math.round(this.cx - bw / 2);
    const y = Math.round(this.cy - bh / 2);
    if (this.shape === 'ellipse') {
      // elipsa rysowana wierszami, żeby krawędź była ostra jak pixel-art
      const a = bw / 2;
      const b = bh / 2;
      const ai = Math.max(0, a - BORDER);
      const bi = Math.max(0, b - BORDER);
      for (let row = 0; row < bh; row++) {
        const yy = row + 0.5 - b;
        const half = Math.round(a * Math.sqrt(Math.max(0, 1 - (yy * yy) / (b * b))));
        if (half <= 0) continue;
        rect(ctx, this.cx - half, y + row, half * 2, 1, color);
        if (bi > 0 && Math.abs(yy) < bi) {
          const inner = Math.round(ai * Math.sqrt(Math.max(0, 1 - (yy * yy) / (bi * bi))));
          if (inner > 0) rect(ctx, this.cx - inner, y + row, inner * 2, 1, fill);
        }
      }
      return;
    }
    rect(ctx, x, y, bw, bh, color);
    if (bw > BORDER * 2 && bh > BORDER * 2) rect(ctx, x + BORDER, y + BORDER, bw - BORDER * 2, bh - BORDER * 2, fill);
  }

  private drawHitbox(ctx: Ctx, b: Bullet): void {
    ctx.save();
    ctx.strokeStyle = b.warn > 0 ? '#ffe45c' : '#ff3a5a';
    ctx.lineWidth = 1;
    ctx.translate(b.x, b.y);
    const hb = b.type.hitbox;
    if (hb.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, hb.r * b.scale, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.rotate(rad(b.rot));
      ctx.strokeRect((-hb.w * b.scale) / 2, (-hb.h * b.scale) / 2, hb.w * b.scale, hb.h * b.scale);
    }
    ctx.restore();
  }
}
