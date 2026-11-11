/**
 * Rejestr zasobów wbudowanych (oryginalne sprite'y zastępcze + atlas fontu).
 * W projekcie walki odwołujemy się do nich przez 'builtin:<nazwa>'.
 */
import manifestJson from './sprites/manifest.json';
import fontMetaJson from './font/jersey10.json';
import fontAtlasUrl from './font/jersey10.png';
import type { FontMeta } from '../core/text';
import type { SpriteDef } from '../battle/types';

export interface BuiltinSpriteInfo {
  file: string;
  group: string;
  frameW: number;
  frameH: number;
  frames: number;
  fps: number;
  loop: boolean;
  originX?: number;
  originY?: number;
}

export const BUILTIN_SPRITES = manifestJson as Record<string, BuiltinSpriteInfo>;

const urls = import.meta.glob('./sprites/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Adres obrazu wbudowanego sprite'a albo undefined, gdy taki nie istnieje. */
export function builtinSpriteUrl(name: string): string | undefined {
  return urls[`./sprites/${name}.png`];
}

/** Gotowa definicja SpriteDef dla wbudowanego sprite'a (z możliwością nadpisania pól). */
export function builtinSprite(name: string, overrides: Partial<SpriteDef> = {}): SpriteDef {
  const info = BUILTIN_SPRITES[name];
  if (!info) throw new Error(`Nieznany wbudowany sprite: ${name}`);
  const def: SpriteDef = {
    src: `builtin:${name}`,
    frameW: info.frameW,
    frameH: info.frameH,
    frames: info.frames,
    fps: info.fps,
    loop: info.loop,
    scale: 2,
  };
  if (info.originX !== undefined) def.originX = info.originX;
  if (info.originY !== undefined) def.originY = info.originY;
  return { ...def, ...overrides };
}

export const FONT_META = fontMetaJson as FontMeta;
export const FONT_ATLAS_URL = fontAtlasUrl;
