/**
 * Menu akcji jednej postaci w turze gracza:
 * przyciski FIGHT / ACT / MAGIC / ITEM / SPARE / DEFEND, listy akcji, czarów i przedmiotów
 * oraz wybór celu. Sterowanie: strzałki, Z = zatwierdź, X = cofnij.
 */
import type { AudioEngine } from '../audio/audio';
import type { SpriteStore } from '../core/assets';
import { type Ctx, drawSprite, frame, rect } from '../core/gfx';
import type { Input } from '../core/input';
import { type BitmapFont, drawRich, layoutRich } from '../core/text';
import { clamp, shade } from '../core/util';
import { DIALOG } from './layout';
import type { Command, Enemy, PartyMember } from './state';
import { type ActDef, COMMAND_IDS, type CommandId, type FightProject, type ItemDef, type SpellDef, type TargetKind } from './types';

/** To, czego menu potrzebuje od walki. */
export interface MenuHost {
  readonly project: FightProject;
  readonly font: BitmapFont;
  readonly audio: AudioEngine;
  readonly input: Input;
  readonly sprites: SpriteStore;
  readonly party: PartyMember[];
  readonly enemies: Enemy[];
  readonly tp: number;
  readonly time: number;
  itemCount(id: string): number;
  isSpareable(e: Enemy): boolean;
}

type Screen =
  | { kind: 'root' }
  | { kind: 'enemy'; purpose: 'fight' | 'act' | 'spare' | 'magic' | 'item'; index: number; spell?: SpellDef; item?: ItemDef }
  | { kind: 'acts'; enemy: number; index: number }
  | { kind: 'spells'; index: number }
  | { kind: 'items'; index: number }
  | { kind: 'ally'; purpose: 'magic' | 'item'; index: number; spell?: SpellDef; item?: ItemDef };

const BTN = { x: DIALOG.x + 14, y: DIALOG.y + 84, w: 92, h: 30, gap: 4 };
const LIST = { x: DIALOG.x + 16, y: DIALOG.y + 14, row: 22, visible: 4 };

const needsEnemy = (t: TargetKind): boolean => t === 'enemy';
const needsAlly = (t: TargetKind): boolean => t === 'ally';

export class CommandMenu {
  /** Wynik: wybrane polecenie, 'back' (wróć do poprzedniej postaci) albo null, gdy wybór trwa. */
  result: Command | 'back' | null = null;
  rootIndex: number;
  private readonly stack: Screen[] = [{ kind: 'root' }];
  private message = '';
  private messageTimer = 0;

  constructor(
    private readonly host: MenuHost,
    private readonly member: PartyMember,
    private readonly canGoBack: boolean,
  ) {
    this.rootIndex = clamp(member.rootIndex, 0, COMMAND_IDS.length - 1);
  }

  private get screen(): Screen {
    return this.stack[this.stack.length - 1];
  }

  /** Nazwa aktualnego ekranu menu i pozycja kursora (do testów i podglądu). */
  get screenKind(): Screen['kind'] {
    return this.screen.kind;
  }

  get cursorIndex(): number {
    const s = this.screen;
    return s.kind === 'root' ? this.rootIndex : s.index;
  }

  /** Czy widać ekran główny (wtedy nad przyciskami pokazujemy tekst narratora). */
  get atRoot(): boolean {
    return this.screen.kind === 'root';
  }

  /** Indeks wroga podświetlonego przy wyborze celu (do znacznika na scenie). */
  get highlightedEnemy(): number {
    const s = this.screen;
    if (s.kind === 'enemy') return this.aliveEnemies()[s.index]?.index ?? -1;
    if (s.kind === 'acts') return s.enemy;
    return -1;
  }

  /** Indeks sojusznika podświetlonego przy wyborze celu. */
  get highlightedAlly(): number {
    const s = this.screen;
    return s.kind === 'ally' ? s.index : -1;
  }

  private aliveEnemies(): Enemy[] {
    return this.host.enemies.filter((e) => !e.gone);
  }

  private availableItems(): ItemDef[] {
    return this.host.project.items.filter((it) => this.host.itemCount(it.id) > 0);
  }

  /** Czy przycisk jest dostępny; jeśli nie — zwraca powód. */
  private disabledReason(id: CommandId): string {
    if (this.member.def.commands?.[id] === false) return 'Ta postać tego nie potrafi.';
    if (id === 'magic' && !this.member.def.spells.length) return `${this.member.def.name} nie zna żadnych czarów.`;
    if (id === 'item' && !this.availableItems().length) return 'Brak przedmiotów.';
    if (id === 'act' && !this.aliveEnemies().some((e) => e.def.acts.length)) return 'Brak dostępnych akcji.';
    return '';
  }

  private deny(msg: string): void {
    this.host.audio.sfx('menuDeny');
    this.message = msg;
    this.messageTimer = 1.6;
  }

  private push(s: Screen): void {
    this.host.audio.sfx('menuSelect');
    this.stack.push(s);
  }

  private finish(c: Command): void {
    this.host.audio.sfx('menuSelect');
    this.member.rootIndex = this.rootIndex;
    this.result = c;
  }

  update(dt: number): void {
    if (this.result !== null) return;
    if (this.messageTimer > 0) this.messageTimer -= dt;
    const { input, audio } = this.host;
    const s = this.screen;

    if (input.pressed('cancel')) {
      if (this.stack.length > 1) {
        audio.sfx('menuCancel');
        this.stack.pop();
      } else if (this.canGoBack) {
        audio.sfx('menuCancel');
        this.member.rootIndex = this.rootIndex;
        this.result = 'back';
      }
      return;
    }

    const move = (cur: number, n: number, prevKey: 'up' | 'left', nextKey: 'down' | 'right'): number => {
      if (n <= 0) return 0;
      let i = cur;
      if (input.repeat(prevKey)) i = (cur + n - 1) % n;
      if (input.repeat(nextKey)) i = (cur + 1) % n;
      if (i !== cur) audio.sfx('menuMove');
      return i;
    };
    const confirm = input.pressed('confirm');

    switch (s.kind) {
      case 'root': {
        const n = COMMAND_IDS.length;
        let i = this.rootIndex;
        if (input.repeat('left') || input.repeat('up')) i = (i + n - 1) % n;
        if (input.repeat('right') || input.repeat('down')) i = (i + 1) % n;
        if (i !== this.rootIndex) {
          audio.sfx('menuMove');
          this.rootIndex = i;
        }
        if (!confirm) break;
        const id = COMMAND_IDS[this.rootIndex];
        const reason = this.disabledReason(id);
        if (reason) {
          this.deny(reason);
          break;
        }
        if (id === 'fight' || id === 'act' || id === 'spare') this.push({ kind: 'enemy', purpose: id, index: 0 });
        else if (id === 'magic') this.push({ kind: 'spells', index: 0 });
        else if (id === 'item') this.push({ kind: 'items', index: 0 });
        else this.finish({ type: 'defend', tpGained: 0 });
        break;
      }
      case 'enemy': {
        const list = this.aliveEnemies();
        if (!list.length) {
          this.stack.pop();
          break;
        }
        s.index = move(Math.min(s.index, list.length - 1), list.length, 'up', 'down');
        if (!confirm) break;
        const e = list[s.index];
        if (s.purpose === 'fight') this.finish({ type: 'fight', target: e.index });
        else if (s.purpose === 'spare') this.finish({ type: 'spare', target: e.index });
        else if (s.purpose === 'act') {
          if (!e.def.acts.length) this.deny('Nic tu nie zdziałasz.');
          else this.push({ kind: 'acts', enemy: e.index, index: 0 });
        } else if (s.purpose === 'magic' && s.spell) this.finish({ type: 'magic', spell: s.spell, target: e.index });
        else if (s.purpose === 'item' && s.item) this.finish({ type: 'item', item: s.item, target: e.index });
        break;
      }
      case 'acts': {
        const acts = this.host.enemies[s.enemy].def.acts;
        s.index = move(Math.min(s.index, acts.length - 1), acts.length, 'up', 'down');
        if (!confirm) break;
        const act = acts[s.index];
        if ((act.tpCost ?? 0) > this.host.tp + 1e-6) this.deny('Za mało TP!');
        else this.finish({ type: 'act', target: s.enemy, act });
        break;
      }
      case 'spells': {
        const spells = this.member.def.spells;
        s.index = move(Math.min(s.index, spells.length - 1), spells.length, 'up', 'down');
        if (!confirm) break;
        const spell = spells[s.index];
        if (spell.tpCost > this.host.tp + 1e-6) this.deny('Za mało TP!');
        else if (needsEnemy(spell.target)) this.push({ kind: 'enemy', purpose: 'magic', index: 0, spell });
        else if (needsAlly(spell.target)) this.push({ kind: 'ally', purpose: 'magic', index: this.member.index, spell });
        else this.finish({ type: 'magic', spell, target: null });
        break;
      }
      case 'items': {
        const items = this.availableItems();
        if (!items.length) {
          this.stack.pop();
          break;
        }
        s.index = move(Math.min(s.index, items.length - 1), items.length, 'up', 'down');
        if (!confirm) break;
        const item = items[s.index];
        if (needsEnemy(item.target)) this.push({ kind: 'enemy', purpose: 'item', index: 0, item });
        else if (needsAlly(item.target)) this.push({ kind: 'ally', purpose: 'item', index: this.member.index, item });
        else this.finish({ type: 'item', item, target: null });
        break;
      }
      case 'ally': {
        const n = this.host.party.length;
        s.index = move(Math.min(s.index, n - 1), n, 'up', 'down');
        if (!confirm) break;
        if (s.purpose === 'magic' && s.spell) this.finish({ type: 'magic', spell: s.spell, target: s.index });
        else if (s.purpose === 'item' && s.item) this.finish({ type: 'item', item: s.item, target: s.index });
        break;
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  //  Rysowanie
  // -------------------------------------------------------------------------------------------

  render(ctx: Ctx): void {
    const s = this.screen;
    switch (s.kind) {
      case 'root':
        this.renderRoot(ctx);
        break;
      case 'enemy':
        this.renderEnemies(ctx, s.index);
        break;
      case 'acts':
        this.renderList(
          ctx,
          this.host.enemies[s.enemy].def.acts.map((a) => this.actRow(a)),
          s.index,
        );
        break;
      case 'spells':
        this.renderList(
          ctx,
          this.member.def.spells.map((sp) => ({ name: sp.name, right: `${sp.tpCost}% TP`, rightOk: sp.tpCost <= this.host.tp + 1e-6, desc: sp.description })),
          s.index,
        );
        break;
      case 'items':
        this.renderList(
          ctx,
          this.availableItems().map((it) => ({ name: it.name, right: `x${this.host.itemCount(it.id)}`, rightOk: true, desc: it.description })),
          s.index,
        );
        break;
      case 'ally':
        this.renderAllies(ctx, s.index);
        break;
    }
    if (s.kind !== 'root') this.renderHint(ctx);
  }

  private actRow(a: ActDef): { name: string; right: string; rightOk: boolean; desc: string } {
    const cost = a.tpCost ?? 0;
    return { name: a.name, right: cost > 0 ? `${cost}% TP` : '', rightOk: cost <= this.host.tp + 1e-6, desc: a.description };
  }

  private renderRoot(ctx: Ctx): void {
    const { font, sprites, project, time } = this.host;
    const colors = project.ui.colors;
    const c = this.member.def.color;
    const canSpare = this.aliveEnemies().some((e) => this.host.isSpareable(e));
    COMMAND_IDS.forEach((id, i) => {
      const sel = i === this.rootIndex;
      const enabled = !this.disabledReason(id);
      // przycisk SPARE świeci kolorem Mercy, gdy któregoś wroga można już oszczędzić
      const glow = id === 'spare' && canSpare;
      const base = glow ? colors.mercy : c;
      const bx = BTN.x + i * (BTN.w + BTN.gap);
      const by = BTN.y - (sel ? 2 : 0);
      let fg: string;
      if (sel) {
        rect(ctx, bx, by + 2, BTN.w, BTN.h, shade(enabled ? base : colors.dim, -0.55));
        rect(ctx, bx, by, BTN.w, BTN.h, enabled ? base : colors.dim);
        rect(ctx, bx, by, BTN.w, 2, shade(enabled ? base : colors.dim, 0.5));
        fg = colors.panel;
      } else {
        const pulse = glow && Math.floor(time * 4) % 2 === 0;
        frame(ctx, bx, by, BTN.w, BTN.h, enabled ? (glow ? (pulse ? '#ffffff' : base) : shade(base, -0.4)) : shade(colors.dim, -0.55), 2);
        fg = enabled ? base : shade(colors.dim, -0.3);
      }
      const icon = sprites.get(project.ui.icons[id]);
      if (icon) drawSprite(ctx, icon, sel ? time * icon.fps : 0, bx + 17, by + 15, { scale: 2, tint: fg });
      font.draw(ctx, project.ui.labels[id], bx + 34, by + 10, sel ? colors.panel : enabled ? (glow ? base : colors.text) : shade(colors.dim, -0.3));
    });
    if (this.messageTimer > 0 && this.message) {
      const w = font.measure(this.message) + 16;
      rect(ctx, DIALOG.x + DIALOG.w - w - 12, DIALOG.y + 60, w, 18, colors.damage, 0.9);
      font.draw(ctx, this.message, DIALOG.x + DIALOG.w - 20, DIALOG.y + 64, colors.panel, 1, 'right');
    }
  }

  private cursor(ctx: Ctx, y: number): void {
    const bob = Math.floor(this.host.time * 6) % 2;
    this.host.font.draw(ctx, '▶', LIST.x + bob, y, this.member.def.color);
  }

  private renderEnemies(ctx: Ctx, index: number): void {
    const { font, project } = this.host;
    const colors = project.ui.colors;
    const list = this.aliveEnemies();
    list.forEach((e, i) => {
      const y = LIST.y + i * LIST.row;
      if (i === index) this.cursor(ctx, y);
      const spareable = this.host.isSpareable(e);
      font.draw(ctx, e.def.name, LIST.x + 18, y, spareable ? colors.mercy : colors.text);
      // HP
      const hpPct = clamp(e.shownHp / Math.max(1, e.def.maxHp), 0, 1);
      font.draw(ctx, 'HP', LIST.x + 200, y, colors.dim);
      rect(ctx, LIST.x + 222, y, 110, 10, colors.hpBack);
      rect(ctx, LIST.x + 222, y, Math.round(110 * hpPct), 10, colors.damage);
      font.draw(ctx, `${Math.ceil(hpPct * 100)}%`, LIST.x + 338, y, colors.text);
      // Mercy
      const mp = clamp(e.shownMercy / 100, 0, 1);
      font.draw(ctx, '♥', LIST.x + 392, y, colors.mercy);
      rect(ctx, LIST.x + 408, y, 100, 10, shade(colors.mercy, -0.8));
      rect(ctx, LIST.x + 408, y, Math.round(100 * mp), 10, colors.mercy);
      font.draw(ctx, `${Math.floor(e.shownMercy)}%`, LIST.x + 514, y, spareable ? colors.mercy : colors.text);
    });
  }

  private renderAllies(ctx: Ctx, index: number): void {
    const { font, project, party } = this.host;
    const colors = project.ui.colors;
    party.forEach((m, i) => {
      const y = LIST.y + i * LIST.row;
      if (i === index) this.cursor(ctx, y);
      font.draw(ctx, m.def.name, LIST.x + 18, y, m.def.color);
      if (m.downed) {
        font.draw(ctx, 'POWALONY', LIST.x + 200, y, colors.damage);
      } else {
        const r = clamp(m.hp / Math.max(1, m.def.maxHp), 0, 1);
        font.draw(ctx, 'HP', LIST.x + 200, y, colors.dim);
        rect(ctx, LIST.x + 222, y, 110, 10, colors.hpBack);
        rect(ctx, LIST.x + 222, y, Math.round(110 * r), 10, m.def.color);
        font.draw(ctx, `${Math.ceil(m.hp)}/${m.def.maxHp}`, LIST.x + 338, y, colors.text);
      }
    });
  }

  private renderList(ctx: Ctx, rows: { name: string; right: string; rightOk: boolean; desc: string }[], index: number): void {
    const { font, project } = this.host;
    const colors = project.ui.colors;
    const scroll = clamp(index - LIST.visible + 1, 0, Math.max(0, rows.length - LIST.visible));
    for (let i = scroll; i < Math.min(rows.length, scroll + LIST.visible); i++) {
      const r = rows[i];
      const y = LIST.y + (i - scroll) * LIST.row;
      if (i === index) this.cursor(ctx, y);
      font.draw(ctx, r.name, LIST.x + 18, y, r.rightOk ? colors.text : colors.dim);
      if (r.right) font.draw(ctx, r.right, LIST.x + 268, y, r.rightOk ? colors.tp : colors.damage, 1, 'right');
    }
    if (scroll > 0) font.draw(ctx, '▲', LIST.x + 276, LIST.y, colors.dim);
    if (scroll + LIST.visible < rows.length) font.draw(ctx, '▼', LIST.x + 276, LIST.y + (LIST.visible - 1) * LIST.row + 2, colors.dim);
    // opis wybranej pozycji
    rect(ctx, LIST.x + 290, LIST.y - 2, 2, LIST.row * LIST.visible - 6, shade(colors.dim, -0.5));
    const cur = rows[index];
    if (cur?.desc) {
      const layout = layoutRich(font, cur.desc, { maxWidth: DIALOG.w - 290 - 16 - 30, lineHeight: 16 });
      drawRich(ctx, font, layout, LIST.x + 304, LIST.y, colors.text);
    }
    if (this.messageTimer > 0 && this.message) {
      const w = font.measure(this.message) + 16;
      rect(ctx, LIST.x + 304, DIALOG.y + DIALOG.h - 46, w, 18, colors.damage, 0.9);
      font.draw(ctx, this.message, LIST.x + 312, DIALOG.y + DIALOG.h - 42, colors.panel);
    }
  }

  private renderHint(ctx: Ctx): void {
    const { font, project, input } = this.host;
    const pad = input.lastDevice === 'gamepad';
    const hint = pad ? 'A: wybierz   B: wróć' : 'Z: wybierz   X: wróć';
    font.draw(ctx, hint, DIALOG.x + DIALOG.w - 16, DIALOG.y + DIALOG.h - 22, shade(project.ui.colors.dim, -0.2), 1, 'right');
  }
}
