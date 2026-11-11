/**
 * Czyste funkcje z zasadami walki: obrażenia, ocena timingu, warunki oszczędzenia,
 * przełączanie faz i wybór ataku. Bez rysowania i bez stanu — łatwe do testowania.
 */
import type { AttackDef, PhaseDef, SpareDef, TriggerDef } from './types';

export type TimingRating = 'perfect' | 'good' | 'ok' | 'miss';

/** Strefa "idealnego" trafienia jako ułamek połowy paska. */
export const PERFECT_ZONE = 0.06;

/**
 * Ocena trafienia w minigrze FIGHT.
 * @param dist odległość kreski od środka paska, znormalizowana do 0..1 (0 = idealnie w środku)
 */
export function timingPower(dist: number): { power: number; rating: TimingRating } {
  const d = Math.abs(dist);
  if (d > 1) return { power: 0, rating: 'miss' };
  if (d <= PERFECT_ZONE) return { power: 1.3, rating: 'perfect' };
  const power = 1.1 - 0.75 * d;
  return { power, rating: d <= 0.35 ? 'good' : 'ok' };
}

/** Obrażenia zadane wrogowi atakiem FIGHT. */
export function attackDamage(attack: number, defense: number, power: number): number {
  if (power <= 0) return 0;
  return Math.max(1, Math.round(attack * 5 * power - defense * 3));
}

/** TP zdobywane za atak w zależności od oceny. */
export function attackTp(rating: TimingRating): number {
  return rating === 'perfect' ? 8 : rating === 'good' ? 5 : rating === 'ok' ? 3 : 0;
}

/** Obrażenia zadane postaci przez pocisk. */
export function bulletDamage(enemyAttack: number, bulletMult: number, memberDefense: number, defending: boolean, defendMult: number): number {
  const base = (enemyAttack * 5 - memberDefense * 3) * bulletMult * (defending ? defendMult : 1);
  return Math.max(1, Math.round(base));
}

/** Obrażenia od efektu `damage` (czary, akcje). */
export function effectDamage(amount: number, defense: number): number {
  return Math.max(1, Math.round(amount - defense * 3));
}

export interface SpareState {
  mercy: number;
  /** HP w procentach 0..100 */
  hpPct: number;
  turn: number;
}

/** Czy wroga można już oszczędzić. */
export function isSpareable(spare: SpareDef, s: SpareState): boolean {
  const checks: boolean[] = [];
  if (spare.mercy && spare.mercy > 0) checks.push(s.mercy >= spare.mercy);
  if (spare.hpBelowPct !== undefined && spare.hpBelowPct > 0) checks.push(s.hpPct <= spare.hpBelowPct);
  if (spare.afterTurn !== undefined && spare.afterTurn > 0) checks.push(s.turn >= spare.afterTurn);
  if (!checks.length) return s.mercy >= 100;
  return spare.mode === 'all' ? checks.every(Boolean) : checks.some(Boolean);
}

export interface EnemySnapshot {
  id: string;
  hp: number;
  maxHp: number;
  mercy: number;
  /** false = wróg opuścił walkę (pokonany lub oszczędzony) */
  present: boolean;
}

export interface FightSnapshot {
  turn: number;
  enemies: EnemySnapshot[];
}

export function triggerMet(t: TriggerDef, s: FightSnapshot): boolean {
  switch (t.type) {
    case 'turn':
      return s.turn >= t.turn;
    case 'enemiesLeft':
      return s.enemies.filter((e) => e.present).length <= t.count;
    case 'hpBelow': {
      if (t.enemy === '*') {
        const max = s.enemies.reduce((a, e) => a + e.maxHp, 0);
        const cur = s.enemies.reduce((a, e) => a + (e.present ? Math.max(0, e.hp) : 0), 0);
        return max > 0 && (cur / max) * 100 <= t.pct;
      }
      const e = s.enemies.find((x) => x.id === t.enemy);
      // wróg, którego już nie ma, liczy się jak 0% HP
      return !!e && (!e.present || (e.hp / e.maxHp) * 100 <= t.pct);
    }
    case 'mercyAbove': {
      const list = t.enemy === '*' ? s.enemies.filter((e) => e.present) : s.enemies.filter((e) => e.id === t.enemy && e.present);
      return list.some((e) => e.mercy >= t.pct);
    }
  }
}

/**
 * Zwraca indeks fazy, w której powinna być walka. Fazy idą tylko do przodu:
 * przechodzimy do najdalszej fazy, której warunek jest spełniony.
 */
export function resolvePhase(phases: PhaseDef[], current: number, s: FightSnapshot): number {
  let idx = current;
  for (let i = current + 1; i < phases.length; i++) {
    if (phases[i].triggers.some((t) => triggerMet(t, s))) idx = i;
  }
  return idx;
}

/**
 * Wybiera atak na turę wroga.
 * @param seqIndex licznik użyty przy kolejności "po kolei" (zwiększany przez wywołującego)
 * @param random   funkcja losująca 0..1
 */
export function pickAttack(
  phase: PhaseDef,
  attacks: AttackDef[],
  presentEnemyIds: string[],
  seqIndex: number,
  lastAttackId: string | null,
  random: () => number,
): AttackDef | null {
  const pool = phase.attacks
    .map((id) => attacks.find((a) => a.id === id))
    .filter((a): a is AttackDef => !!a && (!a.owner || presentEnemyIds.includes(a.owner)));
  if (!pool.length) return null;
  if (phase.order === 'sequence') return pool[seqIndex % pool.length];
  const candidates = pool.length > 1 ? pool.filter((a) => a.id !== lastAttackId) : pool;
  return candidates[Math.floor(random() * candidates.length) % candidates.length];
}
