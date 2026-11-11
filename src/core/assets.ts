/**
 * Ładowanie grafik: zamienia definicje SpriteDef z projektu na gotowe do rysowania SpriteRes.
 * Obsługuje źródła 'builtin:<nazwa>', adresy URL i data URL (pliki wgrane przez użytkownika).
 */
import type { SpriteDef } from '../battle/types';
import { builtinSpriteUrl, FONT_ATLAS_URL, FONT_META } from '../assets/builtin';
import type { SpriteRes } from './gfx';
import { BitmapFont } from './text';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Nie udało się wczytać obrazu: ${src.slice(0, 80)}`));
    img.src = src;
  });
}

/** Zamienia 'builtin:nazwa' na faktyczny adres; inne źródła zwraca bez zmian. */
export function resolveSpriteSrc(src: string): string {
  if (src.startsWith('builtin:')) {
    const url = builtinSpriteUrl(src.slice('builtin:'.length));
    if (!url) throw new Error(`Nieznany wbudowany sprite: ${src}`);
    return url;
  }
  return src;
}

let placeholder: HTMLCanvasElement | null = null;
/** Szachownica zastępcza — rysowana, gdy brakuje grafiki (żeby błąd był widoczny, ale nie zatrzymywał gry). */
function placeholderImage(): HTMLCanvasElement {
  if (!placeholder) {
    placeholder = document.createElement('canvas');
    placeholder.width = 16;
    placeholder.height = 16;
    const c = placeholder.getContext('2d')!;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        c.fillStyle = (x + y) % 2 ? '#ff3ad0' : '#2a1040';
        c.fillRect(x * 4, y * 4, 4, 4);
      }
  }
  return placeholder;
}

export function placeholderSprite(): SpriteRes {
  return { image: placeholderImage(), frameW: 16, frameH: 16, frames: 1, cols: 1, fps: 1, loop: true, scale: 2, originX: 8, originY: 8 };
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function toSpriteRes(def: SpriteDef, image: HTMLImageElement | HTMLCanvasElement): SpriteRes {
  const frameW = Math.max(1, Math.min(def.frameW || image.width, image.width));
  const frameH = Math.max(1, Math.min(def.frameH || image.height, image.height));
  const cols = Math.max(1, Math.floor(image.width / frameW));
  const rows = Math.max(1, Math.floor(image.height / frameH));
  const frames = Math.max(1, Math.min(def.frames || cols * rows, cols * rows));
  return {
    image,
    frameW,
    frameH,
    frames,
    cols,
    fps: def.fps > 0 ? def.fps : 1,
    loop: def.loop !== false,
    scale: def.scale && def.scale > 0 ? def.scale : 2,
    originX: def.originX ?? frameW / 2,
    originY: def.originY ?? frameH / 2,
  };
}

/** Magazyn załadowanych sprite'ów jednego projektu. */
export class SpriteStore {
  private readonly map = new Map<string, SpriteRes>();
  /** Komunikaty o grafikach, których nie udało się wczytać. */
  readonly errors: string[] = [];

  async load(defs: Record<string, SpriteDef>): Promise<void> {
    await Promise.all(
      Object.entries(defs).map(async ([id, def]) => {
        try {
          const src = resolveSpriteSrc(def.src);
          let p = imageCache.get(src);
          if (!p) {
            p = loadImage(src);
            // nie trzymamy w cache wielkich data URL-i wgranych plików
            if (src.length < 2048) imageCache.set(src, p);
          }
          this.map.set(id, toSpriteRes(def, await p));
        } catch (e) {
          this.errors.push(`${id}: ${(e as Error).message}`);
          this.map.set(id, placeholderSprite());
        }
      }),
    );
  }

  /** Zwraca sprite albo null, gdy identyfikator jest pusty. Nieznany identyfikator daje szachownicę. */
  get(id: string | undefined | null): SpriteRes | null {
    if (!id) return null;
    return this.map.get(id) ?? placeholderSprite();
  }

  has(id: string): boolean {
    return this.map.has(id);
  }
}

let fontPromise: Promise<BitmapFont> | null = null;
/** Wczytuje font bitmapowy (raz na całą aplikację). */
export function loadFont(): Promise<BitmapFont> {
  if (!fontPromise) fontPromise = loadImage(FONT_ATLAS_URL).then((img) => new BitmapFont(img, FONT_META));
  return fontPromise;
}
