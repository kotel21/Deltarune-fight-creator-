import { describe, expect, it } from 'vitest';
import { attackDamage, attackTp, bulletDamage, effectDamage, isSpareable, pickAttack, resolvePhase, timingPower, triggerMet, type FightSnapshot } from '../src/battle/formulas';
import type { AttackDef, PhaseDef } from '../src/battle/types';

describe('minigra FIGHT', () => {
  it('środek paska daje trafienie idealne i największą moc', () => {
    const p = timingPower(0);
    expect(p.rating).toBe('perfect');
    expect(p.power).toBeGreaterThan(timingPower(0.2).power);
  });
  it('im dalej od środka, tym słabiej', () => {
    const a = timingPower(0.1), b = timingPower(0.5), c = timingPower(0.95);
    expect(a.power).toBeGreaterThan(b.power);
    expect(b.power).toBeGreaterThan(c.power);
    expect(a.rating).toBe('good');
    expect(c.rating).toBe('ok');
    expect(c.power).toBeGreaterThan(0);
  });
  it('symetria względem środka i pudło poza paskiem', () => {
    expect(timingPower(-0.3).power).toBeCloseTo(timingPower(0.3).power);
    expect(timingPower(1.2)).toEqual({ power: 0, rating: 'miss' });
  });
  it('obrażenia: co najmniej 1 przy trafieniu, 0 przy pudle', () => {
    expect(attackDamage(12, 2, 1.3)).toBe(72);
    expect(attackDamage(1, 50, 0.5)).toBe(1);
    expect(attackDamage(12, 2, 0)).toBe(0);
    expect(attackTp('perfect')).toBeGreaterThan(attackTp('ok'));
    expect(attackTp('miss')).toBe(0);
  });
});

describe('obrażenia od pocisków i efektów', () => {
  it('obrona zmniejsza obrażenia, DEFEND je dzieli', () => {
    const normal = bulletDamage(5, 1, 2, false, 0.5);
    expect(normal).toBe(19);
    expect(bulletDamage(5, 1, 2, true, 0.5)).toBe(Math.round(19 * 0.5));
    expect(bulletDamage(1, 1, 99, false, 0.5)).toBe(1);
    expect(bulletDamage(5, 1.4, 2, false, 0.5)).toBeGreaterThan(normal);
  });
  it('efekt damage odejmuje obronę wroga', () => {
    expect(effectDamage(70, 2)).toBe(64);
    expect(effectDamage(1, 10)).toBe(1);
  });
});

describe('warunki oszczędzenia', () => {
  it('domyślnie wymagane jest 100% Mercy', () => {
    expect(isSpareable({}, { mercy: 99, hpPct: 100, turn: 1 })).toBe(false);
    expect(isSpareable({}, { mercy: 100, hpPct: 100, turn: 1 })).toBe(true);
  });
  it('tryb any: wystarczy jeden warunek', () => {
    const spare = { mercy: 100, hpBelowPct: 20, mode: 'any' as const };
    expect(isSpareable(spare, { mercy: 0, hpPct: 15, turn: 1 })).toBe(true);
    expect(isSpareable(spare, { mercy: 100, hpPct: 90, turn: 1 })).toBe(true);
    expect(isSpareable(spare, { mercy: 50, hpPct: 50, turn: 1 })).toBe(false);
  });
  it('tryb all: wszystkie warunki naraz', () => {
    const spare = { mercy: 50, afterTurn: 3, mode: 'all' as const };
    expect(isSpareable(spare, { mercy: 60, hpPct: 100, turn: 2 })).toBe(false);
    expect(isSpareable(spare, { mercy: 60, hpPct: 100, turn: 3 })).toBe(true);
  });
});

const snap = (over: Partial<FightSnapshot> = {}): FightSnapshot => ({
  turn: 1,
  enemies: [
    { id: 'a', hp: 100, maxHp: 100, mercy: 0, present: true },
    { id: 'b', hp: 100, maxHp: 100, mercy: 0, present: true },
  ],
  ...over,
});

describe('fazy walki', () => {
  it('warunek HP pojedynczego wroga i łącznego HP', () => {
    const s = snap();
    s.enemies[0].hp = 40;
    expect(triggerMet({ type: 'hpBelow', enemy: 'a', pct: 50 }, s)).toBe(true);
    expect(triggerMet({ type: 'hpBelow', enemy: 'b', pct: 50 }, s)).toBe(false);
    expect(triggerMet({ type: 'hpBelow', enemy: '*', pct: 50 }, s)).toBe(false);
    s.enemies[1].hp = 50;
    expect(triggerMet({ type: 'hpBelow', enemy: '*', pct: 50 }, s)).toBe(true);
  });
  it('nieobecny wróg liczy się jak 0 HP', () => {
    const s = snap();
    s.enemies[0].present = false;
    expect(triggerMet({ type: 'hpBelow', enemy: 'a', pct: 10 }, s)).toBe(true);
    expect(triggerMet({ type: 'hpBelow', enemy: '*', pct: 50 }, s)).toBe(true);
    expect(triggerMet({ type: 'enemiesLeft', count: 1 }, s)).toBe(true);
  });
  it('tura i mercy', () => {
    expect(triggerMet({ type: 'turn', turn: 3 }, snap({ turn: 2 }))).toBe(false);
    expect(triggerMet({ type: 'turn', turn: 3 }, snap({ turn: 3 }))).toBe(true);
    const s = snap();
    s.enemies[1].mercy = 80;
    expect(triggerMet({ type: 'mercyAbove', enemy: '*', pct: 75 }, s)).toBe(true);
    expect(triggerMet({ type: 'mercyAbove', enemy: 'a', pct: 75 }, s)).toBe(false);
  });
  it('fazy idą tylko do przodu i przeskakują do najdalszej spełnionej', () => {
    const phases: PhaseDef[] = [
      { id: 'p1', name: '1', triggers: [], order: 'sequence', attacks: [] },
      { id: 'p2', name: '2', triggers: [{ type: 'turn', turn: 3 }], order: 'sequence', attacks: [] },
      { id: 'p3', name: '3', triggers: [{ type: 'turn', turn: 5 }], order: 'sequence', attacks: [] },
    ];
    expect(resolvePhase(phases, 0, snap({ turn: 1 }))).toBe(0);
    expect(resolvePhase(phases, 0, snap({ turn: 3 }))).toBe(1);
    expect(resolvePhase(phases, 0, snap({ turn: 9 }))).toBe(2);
    expect(resolvePhase(phases, 2, snap({ turn: 1 }))).toBe(2);
  });
});

describe('wybór ataku', () => {
  const mk = (id: string, owner?: string): AttackDef => ({ id, name: id, owner, duration: 5, box: { shape: 'rect', w: 100, h: 100 }, spawns: [] });
  const attacks = [mk('a1', 'a'), mk('b1', 'b'), mk('common')];
  const phase = (order: 'sequence' | 'random'): PhaseDef => ({ id: 'p', name: 'p', triggers: [], order, attacks: ['a1', 'b1', 'common'] });
  it('kolejność po kolei zapętla listę', () => {
    const ids = [0, 1, 2, 3].map((i) => pickAttack(phase('sequence'), attacks, ['a', 'b'], i, null, () => 0)?.id);
    expect(ids).toEqual(['a1', 'b1', 'common', 'a1']);
  });
  it('pomija ataki wroga, którego już nie ma', () => {
    const ids = [0, 1, 2].map((i) => pickAttack(phase('sequence'), attacks, ['b'], i, null, () => 0)?.id);
    expect(ids).toEqual(['b1', 'common', 'b1']);
  });
  it('losowo nie powtarza tego samego ataku dwa razy z rzędu', () => {
    for (let i = 0; i < 50; i++) {
      const r = pickAttack(phase('random'), attacks, ['a', 'b'], 0, 'a1', Math.random);
      expect(r?.id).not.toBe('a1');
    }
  });
  it('pusta pula daje null', () => {
    expect(pickAttack({ ...phase('random'), attacks: [] }, attacks, ['a'], 0, null, Math.random)).toBeNull();
    expect(pickAttack({ ...phase('random'), attacks: ['a1'] }, attacks, ['b'], 0, null, Math.random)).toBeNull();
  });
});
