/** Stan walki w trakcie gry (w odróżnieniu od definicji z projektu). */
import type { Anim } from '../core/gfx';
import type { ActDef, EnemyDef, ItemDef, PartyMemberDef, SpellDef } from './types';

/** Polecenie wybrane dla postaci w turze gracza. */
export type Command =
  | { type: 'fight'; target: number }
  | { type: 'act'; target: number; act: ActDef }
  | { type: 'magic'; spell: SpellDef; target: number | null }
  | { type: 'item'; item: ItemDef; target: number | null }
  | { type: 'spare'; target: number }
  | { type: 'defend'; tpGained: number };

export type PartyAnimName = 'idle' | 'attack' | 'hurt' | 'defend';

export interface PartyMember {
  def: PartyMemberDef;
  index: number;
  hp: number;
  /** Powalona postać nie działa, dopóki nie zostanie uleczona albo sama nie wstanie. */
  downed: boolean;
  /** Postęp samodzielnego wstawania 0..1. */
  recover: number;
  defending: boolean;
  x: number;
  y: number;
  /** Przesunięcie do animacji wejścia na scenę. */
  offsetX: number;
  anim: Anim;
  animName: PartyAnimName;
  command: Command | null;
  /** Liczniki efektów: biały błysk i drżenie po trafieniu (s). */
  flash: number;
  shake: number;
  /** Licznik krótkiego podskoku przy wykonywaniu akcji (s). */
  hop: number;
  /** Zapamiętana pozycja kursora w menu akcji. */
  rootIndex: number;
  /** HP pokazywane na pasku (płynnie goni prawdziwe). */
  shownHp: number;
}

export type EnemyAnimName = 'idle' | 'hurt' | 'attack';

export interface Enemy {
  def: EnemyDef;
  index: number;
  hp: number;
  /** Mercy w procentach 0..100. */
  mercy: number;
  /** Aktualny stan (zachowanie); '' = domyślny. */
  state: string;
  stateTurns: number;
  /** null = bierze udział w walce. */
  gone: null | 'spared' | 'defeated';
  /** Postęp animacji opuszczania walki 0..1. */
  leaving: number;
  x: number;
  y: number;
  offsetX: number;
  anim: Anim;
  animName: EnemyAnimName;
  /** Czy trwa atak tego wroga (animacja `attack`). */
  attacking: boolean;
  flash: number;
  shake: number;
  attackMult: number;
  defenseMult: number;
  dialogIndex: number;
  /** Jak długo jeszcze pokazywać pasek HP nad wrogiem (s). */
  hpBarTimer: number;
  /** Licznik migania etykiety stanu tuż po jego zmianie (s). */
  stateFlash: number;
  shownHp: number;
  shownMercy: number;
  wasSpareable: boolean;
}

export type BattleOutcome = 'victory' | 'spared' | 'defeat';

export interface BattleSummary {
  outcome: BattleOutcome;
  exp: number;
  gold: number;
  turns: number;
  grazes: number;
  hitsTaken: number;
  damageTaken: number;
  damageDealt: number;
}
