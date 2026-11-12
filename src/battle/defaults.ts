/** Wartości domyślne projektu walki: zasady, kolory interfejsu, tabela wbudowanych grafik. */
import { BUILTIN_SPRITES, builtinSprite } from '../assets/builtin';
import type { BulletTypeDef, RulesDef, SpriteDef, UiDef } from './types';

export const DEFAULT_RULES: RulesDef = {
  startTp: 0,
  tpGraze: 2.5,
  tpGrazeHold: 0.6,
  tpDefend: 16,
  defendMult: 0.5,
  iframes: 1.1,
  soulSpeed: 150,
  soulRadius: 4,
  grazeRadius: 22,
  reviveTurns: 3,
};

export const DEFAULT_COLORS: UiDef['colors'] = {
  panel: '#0d0f24',
  border: '#e8e6ff',
  text: '#ffffff',
  dim: '#8a8fb5',
  tp: '#38e0ff',
  tpMax: '#ffe45c',
  mercy: '#ffe45c',
  hpBack: '#4a1830',
  box: '#e8e6ff',
  boxFill: '#05060f',
  damage: '#ff5a6e',
  heal: '#7dffa8',
};

export function defaultUi(): UiDef {
  return {
    labels: { fight: 'FIGHT', act: 'ACT', magic: 'MAGIC', item: 'ITEM', spare: 'SPARE', defend: 'DEFEND' },
    icons: { fight: 'icon-fight', act: 'icon-act', magic: 'icon-magic', item: 'icon-item', spare: 'icon-spare', defend: 'icon-defend' },
    soul: 'soul',
    fx: { slash: 'fx-slash', hit: 'fx-hit', heal: 'fx-heal', sparkle: 'fx-sparkle' },
    colors: { ...DEFAULT_COLORS },
  };
}

/** Wszystkie wbudowane sprite'y pod identyfikatorami równymi ich nazwom. */
export function builtinSpriteTable(): Record<string, SpriteDef> {
  const out: Record<string, SpriteDef> = {};
  for (const name of Object.keys(BUILTIN_SPRITES)) out[name] = builtinSprite(name);
  return out;
}

/** Wbudowane typy pocisków (obszary trafienia w pikselach ekranu, nieco mniejsze niż grafika). */
export function defaultBulletTypes(): BulletTypeDef[] {
  return [
    { id: 'orb', name: 'Kulka', sprite: 'bullet-orb', hitbox: { shape: 'circle', r: 6 }, damage: 1, rotate: 'none' },
    { id: 'shard', name: 'Odłamek', sprite: 'bullet-shard', hitbox: { shape: 'box', w: 22, h: 8 }, damage: 1, rotate: 'direction' },
    { id: 'drop', name: 'Kropla', sprite: 'bullet-drop', hitbox: { shape: 'box', w: 18, h: 8 }, damage: 0.8, rotate: 'direction' },
    { id: 'bolt', name: 'Piorun', sprite: 'bullet-bolt', hitbox: { shape: 'box', w: 52, h: 8 }, damage: 1.4, rotate: 'direction' },
    { id: 'star', name: 'Gwiazdka', sprite: 'bullet-star', hitbox: { shape: 'circle', r: 7 }, damage: 1, rotate: 'none' },
    { id: 'zet', name: 'Zet', sprite: 'bullet-zet', hitbox: { shape: 'circle', r: 7 }, damage: 0.8, rotate: 'none' },
    { id: 'cog', name: 'Zębatka', sprite: 'bullet-cog', hitbox: { shape: 'circle', r: 11 }, damage: 1.2, rotate: 'none' },
  ];
}
