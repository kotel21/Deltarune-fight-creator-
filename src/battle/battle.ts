/**
 * SILNIK WALKI
 * ------------
 * Jedna instancja Battle = jedna rozgrywana walka. Przebieg tur jest zapisany jako korutyna
 * (metoda main), dzięki czemu kolejność zdarzeń czyta się z góry na dół:
 *
 *   wstęp → [ tura gracza: wybór akcji → wykonanie → kwestie wrogów → atak wroga (bullet box) ] → wynik
 *
 * Klasa nie wie nic o DOM-ie: dostaje wejście, audio, grafiki i font, a na zewnątrz udostępnia
 * update(dt) i render(ctx). Dzięki temu ten sam silnik działa w grze i w podglądzie edytora.
 */
import type { AudioEngine } from '../audio/audio';
import type { SpriteStore } from '../core/assets';
import { Anim, type Ctx, drawSprite, panel, rect, SCREEN_H, SCREEN_W, spriteBounds, type SpriteRes } from '../core/gfx';
import type { Input } from '../core/input';
import type { BitmapFont } from '../core/text';
import { clamp, easeOutCubic, fillTemplate, Rng, shade } from '../core/util';
import { Arena, type ArenaEvents } from './arena';
import { drawBackground } from './background';
import { type Co, CoRunner } from './coroutine';
import { Bubble, DialogBox } from './dialog';
import { attackDamage, attackTp, bulletDamage, effectDamage, type FightSnapshot, isSpareable, pickAttack, resolvePhase } from './formulas';
import { FxLayer } from './fx';
import { drawEnemyTag, drawPartyPanels, drawTpBar } from './hud';
import { DIALOG, enemyAnchors, partyAnchors } from './layout';
import { CommandMenu, type MenuHost } from './menu';
import type { Bullet } from './patterns';
import type { BattleOutcome, BattleSummary, Command, Enemy, EnemyAnimName, PartyAnimName, PartyMember } from './state';
import { TimingGame } from './timing';
import type { AttackDef, BulletTypeDef, CommandId, EffectDef, EnemyStateDef, FightProject, PhaseDef, TargetKind, VoiceDef } from './types';

export type BattleMode = 'intro' | 'command' | 'execute' | 'enemyDialog' | 'enemyAttack' | 'result';

export interface BattleDeps {
  input: Input;
  audio: AudioEngine;
  sprites: SpriteStore;
  font: BitmapFont;
}

export interface BattleOptions {
  /** Ziarno losowości — ten sam seed daje ten sam przebieg ataków. */
  seed?: number;
}

interface EffectCtx {
  user: PartyMember;
  enemy: Enemy | null;
  ally: PartyMember | null;
  kind: TargetKind;
}

const TEXT_W = DIALOG.w - DIALOG.pad * 2;
const TEXT_X = DIALOG.x + DIALOG.pad;
const TEXT_Y = DIALOG.y + 14;
const PAUSE_ITEMS = ['Wznów', 'Zacznij od nowa', 'Dźwięk'] as const;

export class Battle implements MenuHost {
  readonly project: FightProject;
  readonly font: BitmapFont;
  readonly audio: AudioEngine;
  readonly input: Input;
  readonly sprites: SpriteStore;

  readonly party: PartyMember[];
  readonly enemies: Enemy[];
  /** Punkty TP 0..100. */
  tp: number;
  turn = 1;
  phaseIndex = 0;
  /** Czas walki w sekundach (zatrzymuje się w pauzie). */
  time = 0;
  mode: BattleMode = 'intro';
  outcome: BattleOutcome | null = null;
  /** Gracz zamknął ekran wyniku — walkę można zakończyć lub zacząć od nowa. */
  finished = false;
  /** Gracz wybrał "Zacznij od nowa" w pauzie. */
  restartRequested = false;
  paused = false;

  readonly arena = new Arena();
  readonly fx = new FxLayer();
  readonly dialog: DialogBox;
  menu: CommandMenu | null = null;
  timing: TimingGame | null = null;
  bubbles: Bubble[] = [];

  readonly stats = { grazes: 0, hitsTaken: 0, damageTaken: 0, damageDealt: 0 };

  private readonly rng: Rng;
  private readonly runner: CoRunner;
  private readonly bulletTypes: Map<string, BulletTypeDef>;
  private readonly inventory = new Map<string, number>();
  private readonly arenaEvents: ArenaEvents;
  private shownTp: number;
  private activeMember = -1;
  private targets: number[] = [];
  private attackOwner: Enemy | null = null;
  private currentAttack: AttackDef | null = null;
  private seqIndex = 0;
  private lastAttackId: string | null = null;
  private exp = 0;
  private gold = 0;
  private pauseIndex = 0;
  private resultAlpha = 0;
  private resultCount = 0;
  private sparkleTimer = 0;
  private tpPulse = 0;

  constructor(project: FightProject, deps: BattleDeps, opts: BattleOptions = {}) {
    this.project = project;
    this.font = deps.font;
    this.audio = deps.audio;
    this.input = deps.input;
    this.sprites = deps.sprites;
    this.rng = new Rng(opts.seed);
    this.dialog = new DialogBox(deps.font);
    this.bulletTypes = new Map(project.bulletTypes.map((b) => [b.id, b]));
    this.tp = clamp(project.rules.startTp, 0, 100);
    this.shownTp = this.tp;
    for (const it of project.items) this.inventory.set(it.id, Math.max(0, Math.floor(it.count)));

    const pDefs = project.party.slice(0, 3);
    const pPos = partyAnchors(pDefs.length);
    this.party = pDefs.map((def, index) => ({
      def,
      index,
      hp: def.maxHp,
      downed: false,
      recover: 0,
      defending: false,
      x: pPos[index].x,
      y: pPos[index].y,
      offsetX: 0,
      anim: new Anim(this.sprites.get(def.sprites.idle)),
      animName: 'idle',
      command: null,
      flash: 0,
      shake: 0,
      hop: 0,
      rootIndex: 0,
      shownHp: def.maxHp,
    }));

    const eDefs = project.enemies.slice(0, 3);
    const ePos = enemyAnchors(eDefs.length);
    this.enemies = eDefs.map((def, index) => ({
      def,
      index,
      hp: def.maxHp,
      mercy: 0,
      state: '',
      stateTurns: 0,
      gone: null,
      leaving: 0,
      x: ePos[index].x,
      y: ePos[index].y,
      offsetX: 0,
      anim: new Anim(this.sprites.get(def.sprites.idle)),
      animName: 'idle',
      attacking: false,
      flash: 0,
      shake: 0,
      attackMult: 1,
      defenseMult: 1,
      dialogIndex: 0,
      hpBarTimer: 0,
      stateFlash: 0,
      shownHp: def.maxHp,
      shownMercy: 0,
      wasSpareable: false,
    }));

    this.arenaEvents = {
      onHit: (b) => this.onSoulHit(b),
      onGraze: (_b, first) => this.onGraze(first),
    };
    this.runner = new CoRunner(this.main());
  }

  // ===========================================================================================
  //  Pomocnicze
  // ===========================================================================================

  private get colors() {
    return this.project.ui.colors;
  }

  private get phase(): PhaseDef | undefined {
    return this.project.phases[this.phaseIndex];
  }

  private spr(id: string | undefined): SpriteRes | null {
    return this.sprites.get(id);
  }

  itemCount(id: string): number {
    return this.inventory.get(id) ?? 0;
  }

  private aliveEnemies(): Enemy[] {
    return this.enemies.filter((e) => !e.gone);
  }

  private stateOf(e: Enemy): EnemyStateDef | undefined {
    return e.state ? e.def.states?.[e.state] : undefined;
  }

  isSpareable(e: Enemy): boolean {
    if (e.gone) return false;
    return isSpareable(e.def.spare, { mercy: e.mercy, hpPct: (e.hp / Math.max(1, e.def.maxHp)) * 100, turn: this.turn });
  }

  private enemyAttackStat(e: Enemy): number {
    return e.def.attack * e.attackMult * (this.stateOf(e)?.attackMult ?? 1);
  }

  private enemyDefenseStat(e: Enemy): number {
    return e.def.defense * e.defenseMult * (this.stateOf(e)?.defenseMult ?? 1);
  }

  /** Środek i górna krawędź widocznej sylwetki sprite'a zaczepionego w (x, y). */
  private silhouette(s: SpriteRes | null, x: number, y: number): { x: number; y: number; top: number } {
    if (!s) return { x, y: y - 40, top: y - 80 };
    const b = spriteBounds(s);
    return {
      x: x + ((b.left + b.right) / 2 - s.originX) * s.scale,
      y: y + ((b.top + b.bottom) / 2 - s.originY) * s.scale,
      top: y + (b.top - s.originY) * s.scale,
    };
  }

  /** Środek sylwetki wroga na ekranie (do efektów i napisów). */
  private enemyCenter(e: Enemy): { x: number; y: number; top: number } {
    return this.silhouette(this.spr(e.def.sprites.idle), e.x + e.offsetX, e.y);
  }

  private memberCenter(m: PartyMember): { x: number; y: number; top: number } {
    return this.silhouette(this.spr(m.def.sprites.idle), m.x + m.offsetX, m.y);
  }

  private setPartyAnim(m: PartyMember, name: PartyAnimName): void {
    m.anim.set(this.spr(m.def.sprites[name]));
    m.animName = name;
  }

  private setEnemyAnim(e: Enemy, name: EnemyAnimName): void {
    const id = e.def.sprites[name] ?? e.def.sprites.idle;
    e.anim.set(this.spr(id));
    e.animName = name;
  }

  private addTp(amount: number): void {
    const before = this.tp;
    this.tp = clamp(this.tp + amount, 0, 100);
    if (amount > 0 && this.tp > before) this.tpPulse = 0.25;
  }

  private snapshot(): FightSnapshot {
    return {
      turn: this.turn,
      enemies: this.enemies.map((e) => ({ id: e.def.id, hp: e.hp, maxHp: e.def.maxHp, mercy: e.mercy, present: !e.gone })),
    };
  }

  /** Zmienne podstawiane w tekstach akcji. */
  private textVars(user: PartyMember, enemy: Enemy | null, ally: PartyMember | null, extra: Record<string, string | number> = {}): Record<string, string | number> {
    const vars: Record<string, string | number> = { user: user.def.name, target: enemy?.def.name ?? ally?.def.name ?? '', ...extra };
    if (enemy) {
      vars.enemy = enemy.def.name;
      vars.hp = Math.max(0, Math.ceil(enemy.hp));
      vars.maxHp = enemy.def.maxHp;
      vars.atk = Math.round(this.enemyAttackStat(enemy) * 10) / 10;
      vars.def = Math.round(this.enemyDefenseStat(enemy) * 10) / 10;
      vars.mercy = Math.floor(enemy.mercy);
    }
    return vars;
  }

  /** Wróg wskazany przy wyborze celu; jeśli już zniknął lub padł — pierwszy, który jeszcze stoi. */
  private enemyTarget(index: number): Enemy | null {
    const e = this.enemies[index];
    if (e && !e.gone && e.hp > 0) return e;
    return this.aliveEnemies().find((x) => x.hp > 0) ?? null;
  }

  // ===========================================================================================
  //  Korutyny pomocnicze
  // ===========================================================================================

  /** Animacja trwająca `dur` sekund; fn dostaje postęp 0..1. */
  private *tween(dur: number, fn: (k: number) => void): Co {
    const t0 = this.time;
    for (;;) {
      const k = dur <= 0 ? 1 : Math.min(1, (this.time - t0) / dur);
      fn(k);
      if (k >= 1) return;
      yield null;
    }
  }

  /** Pokazuje kolejne strony tekstu w oknie dialogowym i czeka na potwierdzenie każdej. */
  private *say(pages: string[], opts: { voice?: VoiceDef; auto?: number } = {}): Co {
    for (const page of pages) {
      if (!page) continue;
      this.dialog.show(page, { voice: opts.voice ?? this.project.narratorVoice, auto: opts.auto, maxWidth: TEXT_W });
      yield () => this.dialog.advanced;
    }
    this.dialog.clear();
  }

  // ===========================================================================================
  //  Główny przebieg walki
  // ===========================================================================================

  private *main(): Co {
    yield* this.intro();
    for (;;) {
      yield* this.phaseCheck();
      yield* this.commandPhase();
      yield* this.executeCommands();
      if (this.checkEnd()) break;
      yield* this.phaseCheck();
      yield* this.enemyDialog();
      yield* this.enemyAttack();
      if (this.checkEnd()) break;
      yield* this.endTurn();
    }
    yield* this.resultScreen();
  }

  private *intro(): Co {
    this.mode = 'intro';
    this.audio.playMusic(this.phase?.music, 0.2);
    yield* this.tween(0.55, (k) => {
      const e = easeOutCubic(k);
      for (const m of this.party) m.offsetX = -240 * (1 - e);
      for (const en of this.enemies) en.offsetX = 280 * (1 - e);
    });
    yield* this.say(this.project.intro.text);
  }

  // --- tura gracza: wybór poleceń -------------------------------------------------------------

  private pickFlavor(): string {
    const pool: string[] = [];
    for (const e of this.aliveEnemies()) {
      const st = this.stateOf(e);
      if (this.isSpareable(e)) pool.push(`${e.def.name} wygląda, jakby nie chciał już walczyć. [y]Można go oszczędzić![/]`);
      else if (st?.flavor?.length) pool.push(...st.flavor);
      else pool.push(...e.def.flavor);
    }
    return pool.length ? this.rng.pick(pool) : '';
  }

  private reserve(m: PartyMember, c: Command): void {
    if (c.type === 'act') this.tp = clamp(this.tp - (c.act.tpCost ?? 0), 0, 100);
    else if (c.type === 'magic') this.tp = clamp(this.tp - c.spell.tpCost, 0, 100);
    else if (c.type === 'item') this.inventory.set(c.item.id, Math.max(0, this.itemCount(c.item.id) - 1));
    else if (c.type === 'defend') {
      c.tpGained = Math.min(this.project.rules.tpDefend, 100 - this.tp);
      this.addTp(c.tpGained);
      m.defending = true;
      this.setPartyAnim(m, 'defend');
      this.audio.sfx('defend');
    }
  }

  private unreserve(m: PartyMember, c: Command): void {
    if (c.type === 'act') this.tp = clamp(this.tp + (c.act.tpCost ?? 0), 0, 100);
    else if (c.type === 'magic') this.tp = clamp(this.tp + c.spell.tpCost, 0, 100);
    else if (c.type === 'item') this.inventory.set(c.item.id, this.itemCount(c.item.id) + 1);
    else if (c.type === 'defend') {
      this.tp = clamp(this.tp - c.tpGained, 0, 100);
      m.defending = false;
      this.setPartyAnim(m, 'idle');
    }
  }

  private *commandPhase(): Co {
    this.mode = 'command';
    for (const m of this.party) m.command = null;
    const actors = this.party.filter((m) => !m.downed);
    this.dialog.show(this.pickFlavor(), { passive: true, voice: this.project.narratorVoice, maxWidth: TEXT_W });
    let i = 0;
    while (i < actors.length) {
      const m = actors[i];
      this.activeMember = m.index;
      const menu = new CommandMenu(this, m, i > 0);
      this.menu = menu;
      yield () => menu.result !== null;
      this.menu = null;
      const r = menu.result;
      if (r === null) continue;
      if (r === 'back') {
        i--;
        const prev = actors[i];
        if (prev.command) {
          this.unreserve(prev, prev.command);
          prev.command = null;
        }
        continue;
      }
      this.reserve(m, r);
      m.command = r;
      i++;
    }
    this.activeMember = -1;
    this.dialog.clear();
  }

  // --- wykonanie poleceń ----------------------------------------------------------------------

  private *executeCommands(): Co {
    this.mode = 'execute';
    // najpierw akcje, czary, przedmioty i oszczędzanie — w kolejności drużyny
    for (const m of this.party) {
      const c = m.command;
      if (!c || m.downed) continue;
      if (c.type === 'act') yield* this.doAct(m, c);
      else if (c.type === 'magic') yield* this.doMagic(m, c);
      else if (c.type === 'item') yield* this.doItem(m, c);
      else if (c.type === 'spare') yield* this.doSpare(m, c);
      if (!this.aliveEnemies().length) return;
    }
    // potem wszystkie ataki naraz w minigrze timingu
    const fighters = this.party.filter((m) => !m.downed && m.command?.type === 'fight');
    if (fighters.length && this.aliveEnemies().length) yield* this.doFights(fighters);
  }

  private *doAct(m: PartyMember, c: Extract<Command, { type: 'act' }>): Co {
    const enemy = this.enemyTarget(c.target);
    if (!enemy) return;
    m.hop = 0.28;
    const vars = this.textVars(m, enemy, null);
    yield* this.say(c.act.text.map((t) => fillTemplate(t, vars)));
    yield* this.applyEffects(c.act.effects, { user: m, enemy, ally: null, kind: 'enemy' });
  }

  private *doMagic(m: PartyMember, c: Extract<Command, { type: 'magic' }>): Co {
    const spell = c.spell;
    let enemy: Enemy | null = null;
    let ally: PartyMember | null = null;
    if (spell.target === 'enemy') {
      enemy = this.enemyTarget(c.target ?? 0);
      if (!enemy) return;
    } else if (spell.target === 'ally') ally = this.party[c.target ?? m.index] ?? m;
    else if (spell.target === 'self') ally = m;
    this.setPartyAnim(m, 'attack');
    this.audio.sfx('magic');
    const vars = this.textVars(m, enemy, ally);
    yield* this.say(spell.text.map((t) => fillTemplate(t, vars)));
    yield* this.applyEffects(spell.effects, { user: m, enemy, ally, kind: spell.target });
  }

  private *doItem(m: PartyMember, c: Extract<Command, { type: 'item' }>): Co {
    const item = c.item;
    let enemy: Enemy | null = null;
    let ally: PartyMember | null = null;
    if (item.target === 'enemy') enemy = this.enemyTarget(c.target ?? 0);
    else if (item.target === 'ally') ally = this.party[c.target ?? m.index] ?? m;
    else if (item.target === 'self') ally = m;
    m.hop = 0.28;
    this.audio.sfx('item');
    const vars = this.textVars(m, enemy, ally, { item: item.name });
    yield* this.say(item.text.map((t) => fillTemplate(t, vars)));
    yield* this.applyEffects(item.effects, { user: m, enemy, ally, kind: item.target });
  }

  private *doSpare(m: PartyMember, c: Extract<Command, { type: 'spare' }>): Co {
    const enemy = this.enemyTarget(c.target);
    if (!enemy) return;
    m.hop = 0.28;
    const vars = this.textVars(m, enemy, null);
    if (this.isSpareable(enemy)) {
      enemy.gone = 'spared';
      this.gold += enemy.def.gold;
      this.audio.sfx('spare');
      const c0 = this.enemyCenter(enemy);
      this.fx.rise(c0.x, c0.y + 20, this.colors.mercy, 14, 46);
      this.fx.sprite(this.spr(this.project.ui.fx.sparkle), c0.x - 24, c0.y - 20);
      this.fx.sprite(this.spr(this.project.ui.fx.sparkle), c0.x + 26, c0.y + 6);
      this.dialog.show(fillTemplate(enemy.def.texts?.spared ?? '{user} okazuje litość. {target} odchodzi w pokoju!', vars), { passive: true, voice: this.project.narratorVoice, maxWidth: TEXT_W });
      yield* this.tween(0.9, (k) => (enemy.leaving = k));
      yield 0.5;
      this.dialog.clear();
    } else {
      this.audio.sfx('menuDeny');
      const gain = enemy.def.spare.failMercy ?? 0;
      yield* this.say([fillTemplate(enemy.def.texts?.spareFail ?? '{target} nie chce jeszcze odejść.', vars)], { auto: 2.2 });
      if (gain > 0) {
        this.addMercy(enemy, gain);
        yield 0.3;
      }
    }
  }

  private *applyEffects(effects: EffectDef[], c: EffectCtx): Co {
    const enemyTargets = (all: boolean | undefined): Enemy[] => {
      const alive = this.aliveEnemies();
      if (all || c.kind === 'allEnemies') return alive;
      if (c.enemy && !c.enemy.gone) return [c.enemy];
      return alive.slice(0, 1);
    };
    for (const e of effects) {
      switch (e.type) {
        case 'mercy':
          for (const t of enemyTargets(e.all)) this.addMercy(t, e.amount);
          break;
        case 'damage':
          for (const t of enemyTargets(e.all)) this.damageEnemy(t, effectDamage(e.amount, this.enemyDefenseStat(t)), false);
          break;
        case 'heal': {
          const targets = e.all || c.kind === 'party' ? this.party : e.self ? [c.user] : [c.ally ?? c.user];
          for (const t of targets) this.healMember(t, e.amount);
          break;
        }
        case 'tp':
          this.addTp(e.amount);
          this.fx.popup(`${e.amount >= 0 ? '+' : ''}${Math.round(e.amount)}% TP`, 78, 150, this.colors.tp, 1);
          this.audio.sfx('mercy');
          break;
        case 'setState':
          for (const t of enemyTargets(e.all)) this.setEnemyState(t, e.state, true);
          break;
        case 'stat':
          for (const t of enemyTargets(e.all)) {
            if (e.stat === 'attack') t.attackMult *= e.mult;
            else t.defenseMult *= e.mult;
            const cc = this.enemyCenter(t);
            this.fx.popup(`${e.stat === 'attack' ? 'ATK' : 'DEF'} ${e.mult < 1 ? '▼' : '▲'}`, cc.x, cc.y - 34, e.mult < 1 ? '#6ecbff' : this.colors.damage, 1);
            this.audio.sfx('mercy');
          }
          break;
      }
      yield 0.32;
    }
    yield* this.resolveDefeats();
    if (effects.length) yield 0.2;
  }

  private addMercy(e: Enemy, amount: number): void {
    const gain = amount * (this.stateOf(e)?.mercyMult ?? 1);
    e.mercy = clamp(e.mercy + gain, 0, 100);
    const c = this.enemyCenter(e);
    this.fx.popup(`${gain >= 0 ? '+' : ''}${Math.round(gain)}%`, c.x, c.y - 30, this.colors.mercy);
    this.audio.sfx('mercy');
    const spareable = this.isSpareable(e);
    if (spareable && !e.wasSpareable) {
      this.fx.rise(c.x, c.y + 30, this.colors.mercy, 10, 40);
      this.fx.sprite(this.spr(this.project.ui.fx.sparkle), c.x, c.y - 10, { scale: 3 });
    }
    e.wasSpareable = spareable;
  }

  private setEnemyState(e: Enemy, state: string, announce: boolean): void {
    const def = state ? e.def.states?.[state] : undefined;
    e.state = def ? state : '';
    e.stateTurns = def?.turns ?? 0;
    if (announce) {
      // etykieta stanu pojawia się na plakietce wroga; tutaj tylko krótki błysk i dźwięk
      e.flash = 0.12;
      e.stateFlash = 1.2;
      this.audio.sfx('bubble');
    }
  }

  private damageEnemy(e: Enemy, dmg: number, crit: boolean): void {
    if (e.gone) return;
    e.hp = Math.max(0, e.hp - dmg);
    this.stats.damageDealt += dmg;
    this.setEnemyAnim(e, 'hurt');
    e.flash = 0.14;
    e.shake = 0.3;
    e.hpBarTimer = 2.6;
    const c = this.enemyCenter(e);
    this.fx.popup(String(dmg), c.x, c.y - 34, crit ? this.colors.tpMax : this.colors.text, crit ? 3 : 2);
    this.fx.sprite(this.spr(this.project.ui.fx.hit), c.x, c.y);
    this.fx.burst(c.x, c.y, crit ? this.colors.tpMax : '#ffffff', crit ? 14 : 8, crit ? 170 : 120);
    this.fx.shake(crit ? 6 : 3, 0.2);
    this.audio.sfx(crit ? 'crit' : 'hit');
    e.wasSpareable = this.isSpareable(e);
  }

  private healMember(m: PartyMember, amount: number): void {
    const c = this.memberCenter(m);
    if (m.downed) {
      m.downed = false;
      m.recover = 0;
      m.hp = clamp(Math.round(amount), 1, m.def.maxHp);
      this.setPartyAnim(m, 'idle');
      this.audio.sfx('revive');
    } else {
      m.hp = Math.min(m.def.maxHp, m.hp + Math.round(amount));
      this.audio.sfx('heal');
    }
    this.fx.popup(`+${Math.round(amount)}`, c.x, c.y - 34, this.colors.heal);
    this.fx.sprite(this.spr(this.project.ui.fx.heal), c.x, c.y + 8);
  }

  private *resolveDefeats(): Co {
    for (const e of this.enemies) {
      if (e.gone || e.hp > 0) continue;
      e.gone = 'defeated';
      this.exp += e.def.exp;
      this.gold += e.def.gold;
      this.audio.sfx('enemyDefeat');
      const c = this.enemyCenter(e);
      this.fx.burst(c.x, c.y, '#ffffff', 16, 150);
      const text = fillTemplate(e.def.texts?.defeated ?? '{target} znika z pola walki!', { target: e.def.name });
      this.dialog.show(text, { passive: true, voice: this.project.narratorVoice, maxWidth: TEXT_W });
      yield* this.tween(0.8, (k) => (e.leaving = k));
      yield 0.45;
      this.dialog.clear();
    }
  }

  private *doFights(fighters: PartyMember[]): Co {
    this.dialog.clear();
    const game = new TimingGame(
      fighters.map((m) => ({ index: m.index, name: m.def.name, color: m.def.color })),
      this.rng,
    );
    this.timing = game;
    yield () => game.done;
    for (const r of game.results()) {
      const m = this.party[r.memberIndex];
      const c = m.command;
      if (!c || c.type !== 'fight') continue;
      const enemy = this.enemyTarget(c.target);
      if (!enemy) break;
      const ec = this.enemyCenter(enemy);
      if (r.power <= 0) {
        this.fx.popup('PUDŁO', ec.x, ec.y - 34, this.colors.dim);
        yield 0.35;
        continue;
      }
      this.setPartyAnim(m, 'attack');
      this.audio.sfx('swing');
      yield 0.2;
      this.fx.sprite(this.spr(this.project.ui.fx.slash), ec.x - 34, ec.y - 44, { scale: 3 });
      const crit = r.rating === 'perfect';
      this.damageEnemy(enemy, attackDamage(m.def.attack, this.enemyDefenseStat(enemy), r.power), crit);
      this.addTp(attackTp(r.rating));
      yield 0.5;
    }
    this.timing = null;
    yield* this.resolveDefeats();
  }

  // --- fazy -----------------------------------------------------------------------------------

  private *phaseCheck(): Co {
    if (!this.aliveEnemies().length) return;
    const next = resolvePhase(this.project.phases, this.phaseIndex, this.snapshot());
    if (next === this.phaseIndex) return;
    this.phaseIndex = next;
    this.seqIndex = 0;
    const ph = this.project.phases[next];
    this.audio.sfx('phase');
    this.fx.flash('#ffffff', 0.7, 2);
    this.fx.shake(5, 0.6);
    for (const s of ph.enterStates ?? []) {
      const e = this.enemies.find((x) => x.def.id === s.enemy && !x.gone);
      if (e) this.setEnemyState(e, s.state, true);
    }
    if (ph.music) this.audio.playMusic(ph.music, 0.8);
    yield 0.5;
    if (ph.enterText?.length) yield* this.say(ph.enterText);
  }

  // --- tura wroga -----------------------------------------------------------------------------

  private pickLine(e: Enemy): string {
    const st = this.stateOf(e);
    const d = e.def.dialog;
    let pool = d.lines;
    let sequential = d.order === 'sequence';
    if (st?.dialog?.length) {
      pool = st.dialog;
      sequential = false;
    } else if (this.isSpareable(e) && d.spareable?.length) {
      pool = d.spareable;
      sequential = false;
    } else if (e.hp / Math.max(1, e.def.maxHp) <= 0.35 && d.lowHp?.length) {
      pool = d.lowHp;
      sequential = false;
    }
    if (!pool.length) return '';
    if (sequential) return pool[e.dialogIndex++ % pool.length];
    return this.rng.pick(pool);
  }

  private *enemyDialog(): Co {
    const speakers: { e: Enemy; line: string }[] = [];
    for (const e of this.aliveEnemies()) {
      const line = this.pickLine(e);
      if (line) speakers.push({ e, line });
    }
    if (!speakers.length) return;
    this.mode = 'enemyDialog';
    this.dialog.clear();
    this.bubbles = speakers.map(({ e, line }) => {
      const c = this.enemyCenter(e);
      const s = e.anim.sprite;
      const halfW = s ? (s.frameW * s.scale) / 2 : 50;
      return new Bubble(this.font, line, c.x - halfW * 0.72, c.y - 6, e.def.voice);
    });
    this.audio.sfx('bubble');
    yield null; // żeby to samo naciśnięcie Z nie zamknęło od razu dymków
    let idle = 0;
    yield () => {
      const allTyped = this.bubbles.every((b) => b.typed);
      if (this.input.pressed('confirm')) {
        if (allTyped) return true;
        for (const b of this.bubbles) b.finish();
        return false;
      }
      if (allTyped) {
        idle += 1 / 60;
        if (idle > 3.5) return true;
      }
      return false;
    };
    this.bubbles = [];
  }

  private *enemyAttack(): Co {
    const present = this.aliveEnemies();
    const ph = this.phase;
    const attack = ph
      ? pickAttack(
          ph,
          this.project.attacks,
          present.map((e) => e.def.id),
          this.seqIndex,
          this.lastAttackId,
          () => this.rng.next(),
        )
      : null;
    if (!attack) {
      yield 0.4;
      return;
    }
    this.seqIndex++;
    this.lastAttackId = attack.id;
    const owner = present.find((e) => e.def.id === attack.owner) ?? present[0];
    const alive = this.party.filter((m) => !m.downed);
    this.targets = attack.target === 'all' ? alive.map((m) => m.index) : [this.rng.pick(alive).index];
    this.attackOwner = owner;
    this.currentAttack = attack;
    for (const e of present) {
      if (!attack.owner || e === owner) {
        e.attacking = true;
        this.setEnemyAnim(e, 'attack');
      }
    }
    this.mode = 'enemyAttack';
    this.dialog.clear();
    const oc = this.enemyCenter(owner);
    this.arena.begin(attack, {
      types: this.bulletTypes,
      rng: this.rng,
      speedMult: this.stateOf(owner)?.bulletSpeedMult ?? 1,
      enemyX: oc.x,
      enemyY: oc.y,
    });
    this.audio.sfx('boxOpen');
    yield () => this.arena.finished;
    this.targets = [];
    this.currentAttack = null;
    this.attackOwner = null;
    for (const e of this.enemies) {
      if (e.attacking) {
        e.attacking = false;
        if (!e.gone) this.setEnemyAnim(e, 'idle');
      }
    }
    yield 0.15;
  }

  private onSoulHit(b: Bullet): void {
    let victims = this.targets.map((i) => this.party[i]).filter((m) => m && !m.downed);
    if (!victims.length) {
      const alive = this.party.filter((m) => !m.downed);
      if (!alive.length) return;
      const pick = this.rng.pick(alive);
      this.targets = [pick.index];
      victims = [pick];
    }
    const owner = this.attackOwner;
    const atk = owner ? this.enemyAttackStat(owner) : 5;
    const share = victims.length > 1 ? 0.6 : 1;
    const rules = this.project.rules;
    this.stats.hitsTaken++;
    for (const m of victims) {
      const dmg = bulletDamage(atk, b.type.damage * share, m.def.defense, m.defending, rules.defendMult);
      m.hp -= dmg;
      this.stats.damageTaken += dmg;
      m.flash = 0.16;
      m.shake = 0.3;
      const c = this.memberCenter(m);
      this.fx.popup(String(dmg), c.x, c.y - 36, this.colors.damage);
      if (m.hp <= 0) {
        m.hp = 0;
        m.downed = true;
        m.recover = 0;
        m.defending = false;
        m.command = null;
        this.setPartyAnim(m, 'hurt');
        this.fx.popup('POWALONY', c.x, c.y - 60, this.colors.damage, 1);
        this.audio.sfx('downed');
      } else if (!m.defending) {
        this.setPartyAnim(m, 'hurt');
      }
    }
    this.fx.shake(5, 0.25);
    this.fx.flash(this.colors.damage, 0.22, 4);
    this.audio.sfx('hurt');
    // jeżeli cel padł, kolejne trafienia przechodzą na kogoś innego
    const alive = this.party.filter((m) => !m.downed);
    if (!alive.length) this.arena.abort();
    else if (!this.targets.some((i) => !this.party[i].downed)) this.targets = [this.rng.pick(alive).index];
  }

  private onGraze(first: boolean): void {
    const rules = this.project.rules;
    this.addTp(first ? rules.tpGraze : rules.tpGrazeHold);
    if (first) {
      this.stats.grazes++;
      this.audio.sfx('graze');
    }
  }

  private *endTurn(): Co {
    const rules = this.project.rules;
    for (const m of this.party) {
      m.defending = false;
      if (!m.downed) {
        if (m.animName === 'defend') this.setPartyAnim(m, 'idle');
        continue;
      }
      m.recover += 1 / Math.max(1, rules.reviveTurns);
      if (m.recover >= 1 - 1e-6) {
        m.downed = false;
        m.recover = 0;
        m.hp = Math.max(1, Math.ceil(m.def.maxHp * 0.25));
        this.setPartyAnim(m, 'idle');
        const c = this.memberCenter(m);
        this.fx.popup('WSTAJE!', c.x, c.y - 40, this.colors.heal, 1);
        this.fx.sprite(this.spr(this.project.ui.fx.heal), c.x, c.y + 8);
        this.audio.sfx('revive');
        yield 0.5;
      }
    }
    for (const e of this.aliveEnemies()) {
      if (e.state && e.stateTurns > 0) {
        e.stateTurns--;
        if (e.stateTurns === 0) this.setEnemyState(e, '', false);
      }
    }
    this.turn++;
  }

  private checkEnd(): boolean {
    if (!this.aliveEnemies().length) {
      this.outcome = this.enemies.every((e) => e.gone === 'spared') ? 'spared' : 'victory';
      return true;
    }
    if (this.party.every((m) => m.downed)) {
      this.outcome = 'defeat';
      return true;
    }
    return false;
  }

  // --- ekran wyniku ---------------------------------------------------------------------------

  get summary(): BattleSummary | null {
    if (!this.outcome) return null;
    return {
      outcome: this.outcome,
      exp: this.outcome === 'defeat' ? 0 : this.exp,
      gold: this.outcome === 'defeat' ? 0 : this.gold,
      turns: this.turn,
      grazes: this.stats.grazes,
      hitsTaken: this.stats.hitsTaken,
      damageTaken: this.stats.damageTaken,
      damageDealt: this.stats.damageDealt,
    };
  }

  private *resultScreen(): Co {
    this.mode = 'result';
    this.dialog.clear();
    this.menu = null;
    this.timing = null;
    this.bubbles = [];
    this.audio.stopMusic(0.7);
    yield 0.4;
    this.audio.sfx(this.outcome === 'defeat' ? 'lose' : 'win');
    if (this.outcome !== 'defeat') {
      for (const m of this.party) if (!m.downed) m.hop = 0.3;
    }
    yield* this.tween(0.45, (k) => (this.resultAlpha = k));
    let lastTick = -1;
    yield* this.tween(0.9, (k) => {
      this.resultCount = k;
      const step = Math.floor(k * 12);
      if (step !== lastTick && this.outcome !== 'defeat') {
        lastTick = step;
        this.audio.sfx('tick');
      }
    });
    yield null;
    yield () => this.input.pressed('confirm');
    this.audio.sfx('menuSelect');
    this.finished = true;
  }

  // ===========================================================================================
  //  Aktualizacja
  // ===========================================================================================

  update(dt: number): void {
    const input = this.input;
    if (this.mode !== 'result' && input.pressed('menu')) {
      this.paused = !this.paused;
      this.pauseIndex = 0;
      this.audio.sfx(this.paused ? 'menuSelect' : 'menuCancel');
      this.audio.duckMusic(this.paused ? 0.35 : 1);
      return;
    }
    if (this.paused) {
      this.updatePause();
      return;
    }

    this.time += dt;
    this.shownTp += (this.tp - this.shownTp) * Math.min(1, dt * 12);
    if (Math.abs(this.tp - this.shownTp) < 0.05) this.shownTp = this.tp;
    if (this.tpPulse > 0) this.tpPulse = Math.max(0, this.tpPulse - dt);

    for (const m of this.party) {
      if (!m.downed) m.anim.update(dt);
      if (m.anim.done && !m.downed) this.setPartyAnim(m, m.defending ? 'defend' : 'idle');
      m.flash = Math.max(0, m.flash - dt);
      m.shake = Math.max(0, m.shake - dt);
      m.hop = Math.max(0, m.hop - dt);
      m.shownHp += (m.hp - m.shownHp) * Math.min(1, dt * 10);
      if (Math.abs(m.hp - m.shownHp) < 0.5) m.shownHp = m.hp;
    }
    for (const e of this.enemies) {
      e.anim.update(dt);
      if (e.anim.done) this.setEnemyAnim(e, e.attacking && !e.gone ? 'attack' : 'idle');
      e.flash = Math.max(0, e.flash - dt);
      e.shake = Math.max(0, e.shake - dt);
      e.hpBarTimer = Math.max(0, e.hpBarTimer - dt);
      e.stateFlash = Math.max(0, e.stateFlash - dt);
      e.shownHp += (e.hp - e.shownHp) * Math.min(1, dt * 8);
      if (Math.abs(e.hp - e.shownHp) < 0.5) e.shownHp = e.hp;
      e.shownMercy += (e.mercy - e.shownMercy) * Math.min(1, dt * 8);
      if (Math.abs(e.mercy - e.shownMercy) < 0.3) e.shownMercy = e.mercy;
    }

    // iskierki przy wrogach gotowych do oszczędzenia
    this.sparkleTimer -= dt;
    if (this.sparkleTimer <= 0) {
      this.sparkleTimer = 0.55;
      for (const e of this.aliveEnemies()) {
        if (!this.isSpareable(e)) continue;
        const c = this.enemyCenter(e);
        this.fx.sprite(this.spr(this.project.ui.fx.sparkle), c.x + (Math.random() * 2 - 1) * 44, c.y + (Math.random() * 2 - 1) * 36);
      }
    }

    this.fx.update(dt);
    this.dialog.update(dt, input, this.audio);
    this.menu?.update(dt);
    this.timing?.update(dt, input, this.audio);
    if (this.bubbles.length) {
      const fast = input.held('cancel');
      for (const b of this.bubbles) b.update(dt, fast, this.audio);
    }
    if (this.arena.phase !== 'closed') this.arena.update(dt, input, this.project.rules, this.arenaEvents);

    this.runner.update(dt);
  }

  private updatePause(): void {
    const input = this.input;
    const n = PAUSE_ITEMS.length;
    if (input.repeat('up')) {
      this.pauseIndex = (this.pauseIndex + n - 1) % n;
      this.audio.sfx('menuMove');
    }
    if (input.repeat('down')) {
      this.pauseIndex = (this.pauseIndex + 1) % n;
      this.audio.sfx('menuMove');
    }
    const resume = () => {
      this.paused = false;
      this.audio.duckMusic(1);
    };
    if (input.pressed('cancel')) {
      this.audio.sfx('menuCancel');
      resume();
      return;
    }
    if (input.pressed('confirm')) {
      this.audio.sfx('menuSelect');
      if (this.pauseIndex === 0) resume();
      else if (this.pauseIndex === 1) {
        resume();
        this.restartRequested = true;
      } else this.audio.setMuted(!this.audio.muted);
    }
  }

  // ===========================================================================================
  //  Rysowanie
  // ===========================================================================================

  render(ctx: Ctx): void {
    const font = this.font;
    const colors = this.colors;
    drawBackground(ctx, this.project.background, this.sprites, this.time);

    const off = this.fx.offset;
    ctx.save();
    ctx.translate(off.x, off.y);

    // --- scena: przeciwnicy i drużyna, od najdalszych (u góry) do najbliższych
    type Drawable = { y: number; draw: () => void };
    const list: Drawable[] = [];
    for (const e of this.enemies) list.push({ y: e.y, draw: () => this.drawEnemy(ctx, e) });
    for (const m of this.party) list.push({ y: m.y, draw: () => this.drawMember(ctx, m) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    // plakietki wrogów (Mercy, HP, stan)
    const targeting = this.menu?.highlightedEnemy ?? -1;
    for (const e of this.enemies) {
      if (e.gone) continue;
      drawEnemyTag(ctx, font, e, {
        colors,
        spareable: this.isSpareable(e),
        showHp: e.hpBarTimer > 0 || targeting === e.index,
        stateLabel: this.stateOf(e)?.label,
        time: this.time,
      });
    }

    // znaczniki wybieranego celu
    if (this.menu) {
      const bob = Math.round(Math.sin(this.time * 9) * 3);
      const active = this.party[this.activeMember];
      const col = active?.def.color ?? colors.text;
      if (targeting >= 0) {
        const c = this.enemyCenter(this.enemies[targeting]);
        font.drawOutline(ctx, '▼', c.x, c.top - 20 + bob, col, colors.panel, 2, 'center');
      }
      const ally = this.menu.highlightedAlly;
      if (ally >= 0 && this.party[ally]) {
        const c = this.memberCenter(this.party[ally]);
        font.drawOutline(ctx, '▼', c.x, c.top - 20 + bob, col, colors.panel, 2, 'center');
      }
    }

    // --- bullet box (reszta sceny jest na ten czas przyciemniona)
    if (this.arena.phase !== 'closed') rect(ctx, -8, -8, SCREEN_W + 16, SCREEN_H + 16, '#000000', 0.42 * clamp(this.arena.open, 0, 1));
    drawTpBar(ctx, font, this.shownTp, this.tpPulse > 0 ? { ...colors, tp: shade(colors.tp, 0.5) } : colors, this.time);
    if (this.arena.phase !== 'closed') {
      this.arena.render(ctx, {
        boxColor: colors.box,
        fillColor: colors.boxFill,
        glowColor: colors.tp,
        soul: this.spr(this.project.ui.soul),
        sprite: (id) => this.spr(id),
        time: this.time,
      });
    }

    this.fx.renderSprites(ctx);
    for (const b of this.bubbles) b.render(ctx, this.time);
    this.fx.renderPopups(ctx, font);
    ctx.restore();

    // --- interfejs na dole
    drawPartyPanels(ctx, font, {
      party: this.party,
      colors,
      active: this.activeMember,
      targets: this.mode === 'enemyAttack' ? this.targets : [],
      time: this.time,
      icon: (cmd: CommandId) => this.spr(this.project.ui.icons[cmd]),
    });
    this.drawDialogArea(ctx);

    this.fx.renderFlash(ctx);
    if (this.mode === 'result') this.drawResult(ctx);
    if (this.paused) this.drawPause(ctx);
  }

  private drawMember(ctx: Ctx, m: PartyMember): void {
    let sprite = m.anim.sprite;
    let frame = m.anim.frame;
    if (m.downed) {
      const down = this.spr(m.def.sprites.down);
      if (down) {
        sprite = down;
        frame = Math.floor(this.time * down.fps);
      } else {
        sprite = this.spr(m.def.sprites.hurt);
        frame = sprite ? sprite.frames - 1 : 0;
      }
    }
    if (!sprite) return;
    const shake = m.shake > 0 ? Math.round(Math.sin(this.time * 80) * 4 * (m.shake / 0.3)) : 0;
    const hop = m.hop > 0 ? -Math.round(Math.sin((1 - m.hop / 0.3) * Math.PI) * 9) : 0;
    const x = m.x + m.offsetX + shake;
    const y = m.y + hop;
    // cień pod postacią
    rect(ctx, x - 22, m.y - 3, 44, 6, '#000000', 0.28);
    rect(ctx, x - 16, m.y - 5, 32, 10, '#000000', 0.22);
    let tint: string | undefined;
    let amount = 0;
    if (m.downed) {
      tint = '#0b0c20';
      amount = 0.55;
    } else if (m.flash > 0) {
      tint = '#ffffff';
      amount = Math.min(1, m.flash / 0.1);
    }
    drawSprite(ctx, sprite, frame, x, y, { tint, tintAmount: amount });
    if (m.index === this.activeMember && this.menu) {
      const c = this.memberCenter(m);
      this.font.drawOutline(ctx, '▼', c.x, c.top - 14 + Math.round(Math.sin(this.time * 8) * 2), m.def.color, this.colors.panel, 1, 'center');
    }
  }

  private drawEnemy(ctx: Ctx, e: Enemy): void {
    if (e.gone && e.leaving >= 1) return;
    const sprite = e.anim.sprite;
    if (!sprite) return;
    const st = this.stateOf(e);
    let alpha = 1;
    let tint: string | undefined;
    let amount = 0;
    let dx = e.offsetX;
    let dy = 0;
    if (e.gone === 'spared') {
      // rozjaśnia się do bieli, a potem odpływa w bok i znika
      alpha = 1 - Math.pow(e.leaving, 3);
      tint = '#ffffff';
      amount = Math.min(1, e.leaving * 3);
      dx += e.leaving * e.leaving * 70;
    } else if (e.gone === 'defeated') {
      alpha = 1 - e.leaving;
      tint = '#ffffff';
      amount = 0.5 + e.leaving * 0.5;
      dx += Math.round(Math.sin(this.time * 90) * 3 * (1 - e.leaving));
      dy = e.leaving * 14;
    } else if (e.flash > 0) {
      tint = '#ffffff';
      amount = Math.min(1, e.flash / 0.1);
    } else if (st?.tint) {
      tint = st.tint;
      amount = 0.28;
    }
    if (e.shake > 0) dx += Math.round(Math.sin(this.time * 80) * 5 * (e.shake / 0.3));
    if (!e.gone) {
      rect(ctx, e.x + dx - 30, e.y - 2, 60, 6, '#000000', 0.26);
      rect(ctx, e.x + dx - 22, e.y - 4, 44, 10, '#000000', 0.2);
    }
    drawSprite(ctx, sprite, e.anim.frame, e.x + dx, e.y + dy, { alpha, tint, tintAmount: amount });
  }

  private drawDialogArea(ctx: Ctx): void {
    const colors = this.colors;
    const font = this.font;
    panel(ctx, DIALOG.x, DIALOG.y, DIALOG.w, DIALOG.h, colors.panel, colors.border, 2);
    if (this.timing) {
      this.timing.render(ctx, font, DIALOG.x + 14, DIALOG.y + 12, DIALOG.w - 28, colors);
      return;
    }
    if (this.menu) {
      if (this.menu.atRoot) this.dialog.render(ctx, TEXT_X, TEXT_Y, colors.text, this.time);
      this.menu.render(ctx);
      return;
    }
    if (this.mode === 'enemyAttack' && this.currentAttack && this.arena.phase !== 'closed') {
      // nazwa ataku + pasek pozostałego czasu
      font.draw(ctx, this.currentAttack.name, TEXT_X, TEXT_Y, colors.dim);
      const pad = this.input.lastDevice === 'gamepad';
      font.draw(ctx, pad ? 'Gałka / krzyżak: ruch    B: wolniej' : 'Strzałki: ruch    X: wolniej', DIALOG.x + DIALOG.w - DIALOG.pad, TEXT_Y, shade(colors.dim, -0.25), 1, 'right');
      const bw = DIALOG.w - DIALOG.pad * 2;
      const k = this.arena.duration > 0 ? clamp(this.arena.remaining / this.arena.duration, 0, 1) : 0;
      rect(ctx, TEXT_X, TEXT_Y + 22, bw, 6, shade(colors.dim, -0.7));
      rect(ctx, TEXT_X, TEXT_Y + 22, Math.round(bw * k), 6, colors.dim);
      return;
    }
    this.dialog.render(ctx, TEXT_X, TEXT_Y, colors.text, this.time);
    if (this.dialog.waiting && Math.floor(this.time * 3) % 2 === 0) {
      font.draw(ctx, '▼', DIALOG.x + DIALOG.w - 26, DIALOG.y + DIALOG.h - 22, colors.dim);
    }
  }

  private drawResult(ctx: Ctx): void {
    const colors = this.colors;
    const font = this.font;
    const a = this.resultAlpha;
    rect(ctx, 0, 0, SCREEN_W, SCREEN_H, '#000000', 0.6 * a);
    if (a < 1) return;
    const s = this.summary;
    if (!s) return;
    const w = 380;
    const h = 222;
    const x = (SCREEN_W - w) / 2;
    const y = 96;
    const title = s.outcome === 'defeat' ? 'PORAŻKA' : s.outcome === 'spared' ? 'POKÓJ!' : 'ZWYCIĘSTWO!';
    const tc = s.outcome === 'defeat' ? colors.damage : s.outcome === 'spared' ? colors.heal : colors.tpMax;
    panel(ctx, x, y, w, h, colors.panel, tc, 2);
    font.drawShadow(ctx, title, SCREEN_W / 2, y + 20, tc, '#000000', 3, 'center');
    const sub =
      s.outcome === 'defeat'
        ? 'Drużyna padła... ale to jeszcze nie koniec.'
        : s.outcome === 'spared'
          ? 'Nikt nie ucierpiał. Wszyscy rozeszli się w zgodzie.'
          : 'Przeciwnicy opuścili pole walki.';
    font.draw(ctx, sub, SCREEN_W / 2, y + 62, colors.text, 1, 'center');
    const k = this.resultCount;
    const rowY = y + 90;
    if (s.outcome !== 'defeat') {
      font.draw(ctx, 'EXP', x + 60, rowY, colors.dim, 2);
      font.draw(ctx, `+${Math.round(s.exp * k)}`, x + w - 60, rowY, colors.text, 2, 'right');
      font.draw(ctx, 'Monety', x + 60, rowY + 30, colors.dim, 2);
      font.draw(ctx, `+${Math.round(s.gold * k)}`, x + w - 60, rowY + 30, colors.tpMax, 2, 'right');
    } else {
      font.draw(ctx, 'Zadane obrażenia', x + 60, rowY + 8, colors.dim);
      font.draw(ctx, String(s.damageDealt), x + w - 60, rowY + 8, colors.text, 1, 'right');
      font.draw(ctx, 'Otrzymane obrażenia', x + 60, rowY + 30, colors.dim);
      font.draw(ctx, String(s.damageTaken), x + w - 60, rowY + 30, colors.text, 1, 'right');
    }
    rect(ctx, x + 40, rowY + 66, w - 80, 2, shade(colors.dim, -0.5));
    font.draw(ctx, `Tury: ${s.turns}    Otarcia: ${s.grazes}    Trafienia: ${s.hitsTaken}`, SCREEN_W / 2, rowY + 78, colors.dim, 1, 'center');
    if (k >= 1 && Math.floor(this.time * 2.5) % 2 === 0) {
      const pad = this.input.lastDevice === 'gamepad';
      font.draw(ctx, `${pad ? 'A' : 'Z'}: ${s.outcome === 'defeat' ? 'spróbuj ponownie' : 'zagraj jeszcze raz'}`, SCREEN_W / 2, y + h - 26, colors.text, 1, 'center');
    }
  }

  private drawPause(ctx: Ctx): void {
    const colors = this.colors;
    const font = this.font;
    rect(ctx, 0, 0, SCREEN_W, SCREEN_H, '#000000', 0.62);
    const w = 260;
    const h = 150;
    const x = (SCREEN_W - w) / 2;
    const y = 150;
    panel(ctx, x, y, w, h, colors.panel, colors.border, 2);
    font.drawShadow(ctx, 'PAUZA', SCREEN_W / 2, y + 16, colors.text, '#000000', 2, 'center');
    PAUSE_ITEMS.forEach((label, i) => {
      const sel = i === this.pauseIndex;
      const text = i === 2 ? `Dźwięk: ${this.audio.muted ? 'WYŁ.' : 'WŁ.'}` : label;
      const ly = y + 58 + i * 24;
      if (sel) font.draw(ctx, '▶', x + 44, ly, colors.tpMax);
      font.draw(ctx, text, x + 62, ly, sel ? colors.tpMax : colors.text);
    });
    font.draw(ctx, 'C: wróć do gry', SCREEN_W / 2, y + h - 20, colors.dim, 1, 'center');
  }

  /** Migawka stanu do testów automatycznych i podglądu w edytorze. */
  debugState() {
    return {
      mode: this.mode,
      turn: this.turn,
      tp: this.tp,
      phase: this.phaseIndex,
      outcome: this.outcome,
      finished: this.finished,
      paused: this.paused,
      activeMember: this.activeMember,
      menuOpen: !!this.menu,
      menuScreen: this.menu?.screenKind ?? null,
      menuCursor: this.menu?.cursorIndex ?? -1,
      timing: this.timing ? this.timing.lanes.map((l) => ({ state: l.state, pos: l.pos })) : null,
      dialogWaiting: this.dialog.waiting,
      bubbles: this.bubbles.length,
      party: this.party.map((m) => ({ name: m.def.name, hp: m.hp, downed: m.downed, command: m.command?.type ?? null })),
      enemies: this.enemies.map((e) => ({ name: e.def.name, hp: e.hp, mercy: e.mercy, gone: e.gone, state: e.state })),
      arena: { phase: this.arena.phase, time: this.arena.time, bullets: this.arena.bullets.length, soulX: this.arena.soulX, soulY: this.arena.soulY, inv: this.arena.inv },
      attack: this.currentAttack?.id ?? null,
      stats: { ...this.stats },
    };
  }
}
