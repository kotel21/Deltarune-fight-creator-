/**
 * Pociski: rozwijanie zdarzeń z osi czasu ataku w konkretne pociski oraz ich ruch.
 * Moduł jest czystą logiką (bez rysowania) — korzysta z niego zarówno walka,
 * jak i podgląd "Testuj atak" w edytorze.
 */
import { angleDiff, clamp, deg, rad, type Rng } from '../core/util';
import { SCREEN_H, SCREEN_W } from '../core/gfx';
import type { BulletTypeDef, MotionKind, SpawnDef } from './types';

/** Jedno wystrzelenie serii (zdarzenie osi czasu + numer powtórzenia). */
export interface Emission {
  time: number;
  spawn: SpawnDef;
  rep: number;
}

export interface Bullet {
  type: BulletTypeDef;
  /** Pozycja na ekranie. */
  x: number;
  y: number;
  /** Pozycja "nośnika" — punktu, wokół którego pocisk faluje lub krąży. */
  cx: number;
  cy: number;
  /** Kierunek lotu (°) i prędkość (px/s). */
  dir: number;
  speed: number;
  accel: number;
  motion: MotionKind;
  waveAmp: number;
  waveFreq: number;
  homingTurn: number;
  homingTime: number;
  orbitR: number;
  orbitSpeed: number;
  orbitPhase: number;
  orbitGrow: number;
  /** Czas od aktywacji (s). */
  age: number;
  /** Pozostały czas ostrzeżenia — dopóki > 0, pocisk nie rani i stoi w miejscu. */
  warn: number;
  /** Pozostały czas życia (Infinity = bez limitu). */
  life: number;
  /** Obrót grafiki (°) i prędkość obrotu (°/s). */
  rot: number;
  spin: number;
  scale: number;
  /** Czy gracz już się o niego otarł + licznik do kolejnych "tyknięć" TP. */
  grazed: boolean;
  grazeTimer: number;
  dead: boolean;
}

/** Rozwija zdarzenia osi czasu (z powtórzeniami) w posortowaną listę wystrzałów. */
export function expandSpawns(spawns: SpawnDef[]): Emission[] {
  const out: Emission[] = [];
  for (const s of spawns) {
    const repeat = Math.max(1, Math.floor(s.repeat ?? 1));
    const interval = Math.max(0, s.interval ?? 0);
    for (let r = 0; r < repeat; r++) out.push({ time: s.time + r * interval, spawn: s, rep: r });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

/** Czas zakończenia ostatniego wystrzału w zdarzeniu (do rysowania bloków na osi czasu). */
export function spawnEndTime(s: SpawnDef): number {
  return s.time + (Math.max(1, Math.floor(s.repeat ?? 1)) - 1) * Math.max(0, s.interval ?? 0);
}

export interface EmitContext {
  /** Środek pudełka. */
  boxX: number;
  boxY: number;
  soulX: number;
  soulY: number;
  /** Pozycja wroga-właściciela ataku (dla origin: 'enemy'). */
  enemyX: number;
  enemyY: number;
  rng: Rng;
  /** Mnożnik prędkości pocisków (np. od stanu wroga). */
  speedMult: number;
  types: Map<string, BulletTypeDef>;
}

/** Tworzy pociski jednego wystrzału. */
export function emit(e: Emission, c: EmitContext): Bullet[] {
  const s = e.spawn;
  const type = c.types.get(s.bullet);
  if (!type) return [];
  const count = clamp(Math.floor(s.count ?? 1), 1, 200);
  const spread = s.spread ?? 0;
  const origin = s.origin ?? 'box';
  const baseX = origin === 'soul' ? c.soulX : origin === 'enemy' ? c.enemyX : c.boxX;
  const baseY = origin === 'soul' ? c.soulY : origin === 'enemy' ? c.enemyY : c.boxY;
  const ox = baseX + s.x + (s.xStep ?? 0) * e.rep;
  const oy = baseY + s.y + (s.yStep ?? 0) * e.rep;
  const step = (s.angleStep ?? 0) * e.rep;
  const out: Bullet[] = [];
  for (let i = 0; i < count; i++) {
    let off = 0;
    if (count > 1) off = spread >= 360 ? (360 / count) * i : -spread / 2 + (spread / (count - 1)) * i;
    const px = ox + c.rng.spread(s.jitterX ?? 0);
    const py = oy + c.rng.spread(s.jitterY ?? 0);
    let dir = s.angle;
    if (s.aim) dir += deg(Math.atan2(c.soulY - py, c.soulX - px));
    const circle = s.motion === 'circle';
    if (!circle) dir += off + step;
    dir += c.rng.spread(s.jitterAngle ?? 0);
    const b: Bullet = {
      type,
      x: px,
      y: py,
      cx: px,
      cy: py,
      dir,
      speed: Math.max(0, s.speed + c.rng.spread(s.jitterSpeed ?? 0)) * c.speedMult,
      accel: (s.accel ?? 0) * c.speedMult,
      motion: s.motion,
      waveAmp: s.waveAmp ?? 20,
      waveFreq: s.waveFreq ?? 1,
      homingTurn: (s.homingTurn ?? 90) * c.speedMult,
      homingTime: s.homingTime ?? 2,
      orbitR: (s.orbitRadius ?? 40) + (s.orbitRadiusStep ?? 0) * i,
      orbitSpeed: (s.orbitSpeed ?? 90) * c.speedMult,
      orbitPhase: (s.orbitPhase ?? 0) + (circle ? off + step : 0),
      orbitGrow: s.orbitGrow ?? 0,
      age: 0,
      warn: Math.max(0, s.warn ?? 0),
      life: s.life && s.life > 0 ? s.life : Infinity,
      rot: 0,
      spin: s.spin ?? 0,
      scale: s.scale && s.scale > 0 ? s.scale : 1,
      grazed: false,
      grazeTimer: 0,
      dead: false,
    };
    place(b);
    if (!b.spin && type.rotate === 'direction') b.rot = heading(b);
    out.push(b);
  }
  return out;
}

/** Ustawia pozycję ekranową pocisku na podstawie nośnika i wzoru ruchu. */
function place(b: Bullet): void {
  if (b.motion === 'wave') {
    const o = b.waveAmp * Math.sin(Math.PI * 2 * b.waveFreq * b.age);
    const a = rad(b.dir);
    b.x = b.cx - Math.sin(a) * o;
    b.y = b.cy + Math.cos(a) * o;
  } else if (b.motion === 'circle') {
    const r = Math.max(0, b.orbitR + b.orbitGrow * b.age);
    const ph = rad(b.orbitPhase + b.orbitSpeed * b.age);
    b.x = b.cx + Math.cos(ph) * r;
    b.y = b.cy + Math.sin(ph) * r;
  } else {
    b.x = b.cx;
    b.y = b.cy;
  }
}

/** Kąt (°), w którym faktycznie porusza się pocisk — do obracania grafiki. */
function heading(b: Bullet): number {
  if (b.motion === 'wave') {
    const lateral = b.waveAmp * Math.PI * 2 * b.waveFreq * Math.cos(Math.PI * 2 * b.waveFreq * b.age);
    return b.dir + deg(Math.atan2(lateral, Math.max(1, b.speed)));
  }
  if (b.motion === 'circle') {
    const ph = b.orbitPhase + b.orbitSpeed * b.age;
    return ph + (b.orbitSpeed >= 0 ? 90 : -90);
  }
  return b.dir;
}

const OOB_MARGIN = 48;

/** Przesuwa pocisk o dt sekund. */
export function stepBullet(b: Bullet, dt: number, soulX: number, soulY: number): void {
  if (b.dead) return;
  if (b.warn > 0) {
    b.warn -= dt;
    if (b.warn > 0) return;
    dt = -b.warn;
    b.warn = 0;
  }
  b.age += dt;
  if (b.age >= b.life) {
    b.dead = true;
    return;
  }
  b.speed = Math.max(0, b.speed + b.accel * dt);
  if (b.motion === 'homing' && b.age <= b.homingTime) {
    const want = deg(Math.atan2(soulY - b.cy, soulX - b.cx));
    const maxTurn = b.homingTurn * dt;
    b.dir += clamp(angleDiff(b.dir, want), -maxTurn, maxTurn);
  }
  const a = rad(b.dir);
  const vx = Math.cos(a) * b.speed;
  const vy = Math.sin(a) * b.speed;
  b.cx += vx * dt;
  b.cy += vy * dt;
  place(b);
  if (b.spin) b.rot += b.spin * dt;
  else if (b.type.rotate === 'direction') b.rot = heading(b);

  // Pocisk, który wyleciał poza ekran i się od niego oddala, jest usuwany.
  if (b.motion !== 'circle') {
    const out = b.x < -OOB_MARGIN || b.x > SCREEN_W + OOB_MARGIN || b.y < -OOB_MARGIN || b.y > SCREEN_H + OOB_MARGIN;
    if (out && (vx * (SCREEN_W / 2 - b.x) + vy * (SCREEN_H / 2 - b.y) <= 0 || b.speed === 0)) b.dead = true;
  }
}

/**
 * Odległość punktu (px, py) od krawędzi obszaru trafienia pocisku.
 * Wartość ujemna oznacza, że punkt jest wewnątrz.
 */
export function hitDistance(b: Bullet, px: number, py: number): number {
  const dx = px - b.x;
  const dy = py - b.y;
  const hb = b.type.hitbox;
  if (hb.shape === 'circle') return Math.hypot(dx, dy) - hb.r * b.scale;
  const a = -rad(b.rot);
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  const qx = Math.abs(lx) - (hb.w * b.scale) / 2;
  const qy = Math.abs(ly) - (hb.h * b.scale) / 2;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}
