/**
 * Rysowanie stałych elementów interfejsu walki:
 * panele postaci z paskami HP, pionowy pasek TP oraz plakietki przy przeciwnikach (Mercy %, HP).
 */
import { type Ctx, drawSprite, panel, rect, type SpriteRes } from '../core/gfx';
import type { BitmapFont } from '../core/text';
import { clamp, shade } from '../core/util';
import { PANEL, panelX, TP_BAR } from './layout';
import type { Enemy, PartyMember } from './state';
import type { CommandId, UiDef } from './types';

type Colors = UiDef['colors'];

export interface PanelOpts {
  party: PartyMember[];
  colors: Colors;
  /** Indeks postaci, która właśnie wybiera akcję (-1 = nikt). */
  active: number;
  /** Indeksy postaci, w które celuje bieżący atak wroga. */
  targets: number[];
  time: number;
  icon: (cmd: CommandId) => SpriteRes | null;
}

export function drawPartyPanels(ctx: Ctx, font: BitmapFont, o: PanelOpts): void {
  const n = o.party.length;
  o.party.forEach((m, i) => {
    const active = i === o.active;
    const x = panelX(i, n);
    const y = PANEL.y - (active ? 4 : 0);
    const c = m.def.color;
    panel(ctx, x, y, PANEL.w, PANEL.h, o.colors.panel, active ? c : shade(c, -0.5), 2);
    rect(ctx, x + 4, y + 6, 4, PANEL.h - 12, m.downed ? shade(c, -0.6) : c);

    // imię + ikona wybranej akcji
    const nameW = font.draw(ctx, m.def.name.toUpperCase(), x + 14, y + 7, m.downed ? o.colors.dim : c);
    if (m.command && !m.downed) {
      const ic = o.icon(m.command.type);
      if (ic) drawSprite(ctx, ic, 0, x + 14 + nameW + 12, y + 12, { scale: 1, tint: c });
    }

    // HP
    const maxHp = Math.max(1, m.def.maxHp);
    const bx = x + 14;
    const by = y + 24;
    const bw = PANEL.w - 24;
    const bh = 8;
    rect(ctx, bx, by, bw, bh, o.colors.hpBack);
    if (m.downed) {
      font.draw(ctx, 'POWALONY', x + PANEL.w - 10, y + 7, o.colors.damage, 1, 'right');
      rect(ctx, bx, by, Math.round(bw * clamp(m.recover, 0, 1)), bh, o.colors.dim);
    } else {
      const ratio = clamp(m.shownHp / maxHp, 0, 1);
      const low = m.hp / maxHp <= 0.25;
      font.draw(ctx, `${Math.max(0, Math.ceil(m.shownHp))}/${maxHp}`, x + PANEL.w - 10, y + 7, low ? o.colors.damage : o.colors.text, 1, 'right');
      const fw = Math.max(m.hp > 0 ? 2 : 0, Math.round(bw * ratio));
      rect(ctx, bx, by, fw, bh, c);
      rect(ctx, bx, by, fw, 2, shade(c, 0.45));
    }

    // znacznik celu ataku wroga
    if (o.targets.includes(i) && !m.downed && Math.floor(o.time * 5) % 2 === 0) {
      font.drawOutline(ctx, '▼', x + PANEL.w / 2, y - 13, o.colors.damage, o.colors.panel, 1, 'center');
    }
  });
}

/** Pionowy pasek TP. `shown` to wartość animowana (płynnie goni prawdziwą). */
export function drawTpBar(ctx: Ctx, font: BitmapFont, shown: number, colors: Colors, time: number): void {
  const { x, y, w, h } = TP_BAR;
  const full = shown >= 99.5;
  const c = full ? colors.tpMax : colors.tp;
  font.drawShadow(ctx, 'TP', x + w / 2, y - 17, c, colors.panel, 1, 'center');
  panel(ctx, x, y, w, h, shade(colors.tp, -0.88), colors.border, 2);
  const ih = h - 8;
  const fh = Math.round((ih * clamp(shown, 0, 100)) / 100);
  if (fh > 0) {
    rect(ctx, x + 4, y + 4 + ih - fh, w - 8, fh, c);
    rect(ctx, x + 4, y + 4 + ih - fh, w - 8, 2, shade(c, 0.6));
    rect(ctx, x + 4, y + 4 + ih - fh, 3, fh, shade(c, 0.3));
  }
  // podziałka co 10%
  for (let i = 1; i < 10; i++) rect(ctx, x + 4, y + 4 + Math.round((ih * i) / 10), w - 8, 1, colors.panel, 0.55);
  if (full) {
    if (Math.floor(time * 4) % 2 === 0) font.drawShadow(ctx, 'MAX', x + w / 2, y + h + 6, colors.tpMax, colors.panel, 1, 'center');
  } else {
    font.drawShadow(ctx, `${Math.floor(shown)}%`, x + w / 2, y + h + 6, colors.text, colors.panel, 1, 'center');
  }
}

export interface EnemyTagOpts {
  colors: Colors;
  spareable: boolean;
  showHp: boolean;
  stateLabel?: string;
  time: number;
}

/** Plakietka przy przeciwniku: Mercy w procentach, opcjonalnie pasek HP i etykieta stanu. */
export function drawEnemyTag(ctx: Ctx, font: BitmapFont, e: Enemy, o: EnemyTagOpts): void {
  const cx = e.x + e.offsetX;
  const y = e.y + 8;
  const pct = `${Math.floor(e.shownMercy)}%`;
  const text = `♥ ${pct}`;
  const w = font.measure(text) + 12;
  const pulse = o.spareable && Math.floor(o.time * 4) % 2 === 0;
  const color = o.spareable ? (pulse ? '#ffffff' : o.colors.mercy) : e.mercy > 0 ? o.colors.mercy : o.colors.dim;
  rect(ctx, cx - w / 2, y - 4, w, 18, o.colors.panel, 0.72);
  if (o.spareable) {
    rect(ctx, cx - w / 2, y - 4, w, 2, o.colors.mercy);
    rect(ctx, cx - w / 2, y + 12, w, 2, o.colors.mercy);
  }
  font.draw(ctx, text, cx, y, color, 1, 'center');
  let ny = y + 18;
  if (o.showHp) {
    const bw = 64;
    rect(ctx, cx - bw / 2 - 2, ny - 2, bw + 4, 9, o.colors.panel, 0.8);
    rect(ctx, cx - bw / 2, ny, bw, 5, o.colors.hpBack);
    rect(ctx, cx - bw / 2, ny, Math.round(bw * clamp(e.shownHp / Math.max(1, e.def.maxHp), 0, 1)), 5, o.colors.damage);
    ny += 11;
  }
  if (o.stateLabel) {
    const fresh = e.stateFlash > 0 && Math.floor(e.stateFlash * 10) % 2 === 0;
    font.drawOutline(ctx, o.stateLabel, cx, ny, fresh ? '#ffffff' : '#6ecbff', o.colors.panel, 1, 'center');
  }
}
