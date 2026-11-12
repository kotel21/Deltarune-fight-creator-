/**
 * Pomocnicze funkcje rysowania na canvasie 2D w stylu pixel-art:
 * prostokąty, ramki, sprite'y z animacją klatkową i barwieniem.
 * Wszystko rysowane jest w bazowej rozdzielczości 640x480 bez wygładzania.
 */

export const SCREEN_W = 640;
export const SCREEN_H = 480;

export type Ctx = CanvasRenderingContext2D;
export type Drawable = HTMLImageElement | HTMLCanvasElement;

/** Załadowany sprite: obraz + opis klatek. */
export interface SpriteRes {
  image: Drawable;
  frameW: number;
  frameH: number;
  frames: number;
  cols: number;
  fps: number;
  loop: boolean;
  scale: number;
  originX: number;
  originY: number;
}

export interface DrawOpts {
  /** Skala na ekranie (domyślnie skala sprite'a). */
  scale?: number;
  alpha?: number;
  flipX?: boolean;
  /** Obrót w radianach wokół punktu zaczepienia. */
  rot?: number;
  /** Punkt zaczepienia w pikselach klatki; domyślnie origin sprite'a. */
  originX?: number;
  originY?: number;
  /** Kolor barwienia (cała sylwetka w jednym kolorze) i jego siła 0..1. */
  tint?: string;
  tintAmount?: number;
}

export function setupCtx(canvas: HTMLCanvasElement): Ctx {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D nie jest dostępny w tej przeglądarce.');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
  if (alpha <= 0 || w <= 0 || h <= 0) return;
  if (alpha < 1) {
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.globalAlpha = prev;
    return;
  }
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Ramka (pusty prostokąt) o grubości t. */
export function frame(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, t = 2, alpha = 1): void {
  rect(ctx, x, y, w, t, color, alpha);
  rect(ctx, x, y + h - t, w, t, color, alpha);
  rect(ctx, x, y + t, t, h - 2 * t, color, alpha);
  rect(ctx, x + w - t, y + t, t, h - 2 * t, color, alpha);
}

/**
 * Panel interfejsu: ciemne wypełnienie + ramka ze ściętymi narożnikami
 * (własny styl Fight Creatora).
 */
export function panel(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, border: string, t = 2, alpha = 1): void {
  x = Math.round(x);
  y = Math.round(y);
  rect(ctx, x + t, y + t, w - 2 * t, h - 2 * t, fill, alpha);
  // krawędzie ze ściętymi rogami
  rect(ctx, x + 2 * t, y, w - 4 * t, t, border, alpha);
  rect(ctx, x + 2 * t, y + h - t, w - 4 * t, t, border, alpha);
  rect(ctx, x, y + 2 * t, t, h - 4 * t, border, alpha);
  rect(ctx, x + w - t, y + 2 * t, t, h - 4 * t, border, alpha);
  rect(ctx, x + t, y + t, t, t, border, alpha);
  rect(ctx, x + w - 2 * t, y + t, t, t, border, alpha);
  rect(ctx, x + t, y + h - 2 * t, t, t, border, alpha);
  rect(ctx, x + w - 2 * t, y + h - 2 * t, t, t, border, alpha);
}

// ---------------------------------------------------------------------------------------------
// Barwienie: kopie obrazów wypełnione jednym kolorem (z zachowaniem kanału alfa), trzymane w cache.
// ---------------------------------------------------------------------------------------------
const tintCache = new WeakMap<object, Map<string, HTMLCanvasElement>>();

export function tinted(image: Drawable, color: string): HTMLCanvasElement {
  let byColor = tintCache.get(image);
  if (!byColor) {
    byColor = new Map();
    tintCache.set(image, byColor);
  }
  let c = byColor.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const cx = c.getContext('2d')!;
    cx.imageSmoothingEnabled = false;
    cx.drawImage(image, 0, 0);
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = color;
    cx.fillRect(0, 0, c.width, c.height);
    byColor.set(color, c);
    if (byColor.size > 48) byColor.delete(byColor.keys().next().value as string);
  }
  return c;
}

/** Rysuje jedną klatkę sprite'a tak, by jego punkt zaczepienia wypadł w (x, y). */
export function drawSprite(ctx: Ctx, s: SpriteRes, frameIndex: number, x: number, y: number, o: DrawOpts = {}): void {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const f = ((Math.floor(frameIndex) % s.frames) + s.frames) % s.frames;
  const sx = (f % s.cols) * s.frameW;
  const sy = Math.floor(f / s.cols) * s.frameH;
  const scale = o.scale ?? s.scale;
  const ox = o.originX ?? s.originX;
  const oy = o.originY ?? s.originY;
  const dw = s.frameW * scale;
  const dh = s.frameH * scale;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;

  const blit = (img: Drawable, a: number) => {
    if (a <= 0) return;
    ctx.globalAlpha = prevAlpha * alpha * a;
    if (o.rot || o.flipX) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      if (o.rot) ctx.rotate(o.rot);
      if (o.flipX) ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, s.frameW, s.frameH, -ox * scale, -oy * scale, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx, sy, s.frameW, s.frameH, Math.round(x - ox * scale), Math.round(y - oy * scale), dw, dh);
    }
  };

  const amount = o.tint ? (o.tintAmount ?? 1) : 0;
  if (amount < 1) blit(s.image, 1);
  if (amount > 0 && o.tint) blit(tinted(s.image, o.tint), amount);
  ctx.globalAlpha = prevAlpha;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const boundsCache = new WeakMap<SpriteRes, Bounds>();

/**
 * Granice nieprzezroczystej części pierwszej klatki sprite'a (w pikselach klatki).
 * Dzięki temu znaczniki i napisy trafiają nad faktyczną sylwetkę, także dla wgranych grafik
 * z dużym pustym marginesem.
 */
export function spriteBounds(s: SpriteRes): Bounds {
  let b = boundsCache.get(s);
  if (b) return b;
  b = { left: 0, top: 0, right: s.frameW, bottom: s.frameH };
  try {
    const c = document.createElement('canvas');
    c.width = s.frameW;
    c.height = s.frameH;
    const cx = c.getContext('2d', { willReadFrequently: true })!;
    cx.drawImage(s.image, 0, 0, s.frameW, s.frameH, 0, 0, s.frameW, s.frameH);
    const d = cx.getImageData(0, 0, s.frameW, s.frameH).data;
    let l = s.frameW, t = s.frameH, r = -1, bt = -1;
    for (let y = 0; y < s.frameH; y++)
      for (let x = 0; x < s.frameW; x++) {
        if (d[(y * s.frameW + x) * 4 + 3] < 24) continue;
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > bt) bt = y;
      }
    if (r >= 0) b = { left: l, top: t, right: r + 1, bottom: bt + 1 };
  } catch {
    /* obraz z innej domeny bez CORS — zostają granice całej klatki */
  }
  boundsCache.set(s, b);
  return b;
}

/** Stan odtwarzania animacji klatkowej. */
export class Anim {
  t = 0;
  done = false;
  constructor(public sprite: SpriteRes | null) {}

  set(sprite: SpriteRes | null, restart = true): void {
    if (this.sprite === sprite && !restart) return;
    this.sprite = sprite;
    this.t = 0;
    this.done = false;
  }

  update(dt: number): void {
    const s = this.sprite;
    if (!s) return;
    this.t += dt;
    if (!s.loop && this.t * s.fps >= s.frames) this.done = true;
  }

  get frame(): number {
    const s = this.sprite;
    if (!s) return 0;
    const f = Math.floor(this.t * s.fps);
    return s.loop ? f % s.frames : Math.min(s.frames - 1, f);
  }
}
