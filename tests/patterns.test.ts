import { describe, expect, it } from 'vitest';
import { emit, expandSpawns, hitDistance, stepBullet, type EmitContext } from '../src/battle/patterns';
import type { BulletTypeDef, SpawnDef } from '../src/battle/types';
import { Rng } from '../src/core/util';

const orb: BulletTypeDef = { id: 'orb', name: 'orb', sprite: 'x', hitbox: { shape: 'circle', r: 6 }, damage: 1, rotate: 'none' };
const ctx = (): EmitContext => ({ boxX: 320, boxY: 160, soulX: 320, soulY: 200, enemyX: 500, enemyY: 100, rng: new Rng(1), speedMult: 1, types: new Map([['orb', orb]]) });
const base = (o: Partial<SpawnDef>): SpawnDef => ({ id: 's', time: 0, bullet: 'orb', x: 0, y: 0, angle: 0, speed: 100, motion: 'straight', ...o });

describe('oś czasu i serie', () => {
  it('powtórzenia rozwijają się w kolejne wystrzały', () => {
    const e = expandSpawns([base({ time: 1, repeat: 3, interval: 0.5 }), base({ id: 't', time: 0.2 })]);
    expect(e.map((x) => x.time)).toEqual([0.2, 1, 1.5, 2]);
  });
  it('pełny pierścień rozkłada pociski równo', () => {
    const b = emit({ time: 0, spawn: base({ count: 4, spread: 360 }), rep: 0 }, ctx());
    expect(b.map((x) => Math.round(x.dir))).toEqual([0, 90, 180, 270]);
  });
});

describe('wzory ruchu', () => {
  it('prosto: przesuwa się o speed*dt', () => {
    const [b] = emit({ time: 0, spawn: base({}), rep: 0 }, ctx());
    stepBullet(b, 0.5, 0, 0);
    expect(b.x).toBeCloseTo(370);
  });
  it('fala: odchyla się poprzecznie do kierunku', () => {
    const [b] = emit({ time: 0, spawn: base({ motion: 'wave', waveAmp: 20, waveFreq: 1 }), rep: 0 }, ctx());
    stepBullet(b, 0.25, 0, 0);
    expect(b.y).toBeCloseTo(180);
  });
  it('okrąg: trzyma promień wokół środka', () => {
    const [b] = emit({ time: 0, spawn: base({ motion: 'circle', speed: 0, orbitRadius: 40, orbitSpeed: 90 }), rep: 0 }, ctx());
    for (let i = 0; i < 30; i++) stepBullet(b, 1 / 60, 0, 0);
    expect(Math.hypot(b.x - 320, b.y - 160)).toBeCloseTo(40);
  });
  it('naprowadzanie: skręca w stronę serduszka', () => {
    const [b] = emit({ time: 0, spawn: base({ motion: 'homing', homingTurn: 180 }), rep: 0 }, ctx());
    for (let i = 0; i < 30; i++) stepBullet(b, 1 / 60, 320, 400);
    expect(b.dir).toBeGreaterThan(30);
  });
  it('ostrzeżenie: pocisk stoi, dopóki trwa warn', () => {
    const [b] = emit({ time: 0, spawn: base({ warn: 0.5 }), rep: 0 }, ctx());
    stepBullet(b, 0.4, 0, 0);
    expect(b.x).toBe(320);
    stepBullet(b, 0.2, 0, 0);
    expect(b.x).toBeCloseTo(330);
  });
  it('kolizja okręgu', () => {
    const [b] = emit({ time: 0, spawn: base({}), rep: 0 }, ctx());
    expect(hitDistance(b, 320, 160)).toBeLessThan(0);
    expect(hitDistance(b, 340, 160)).toBeCloseTo(14);
  });
});
