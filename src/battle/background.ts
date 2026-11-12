/** Tło walki: kolor bazowy + warstwy (obraz, przewijanie, siatka, pulsowanie). */
import type { SpriteStore } from '../core/assets';
import { type Ctx, rect, SCREEN_H, SCREEN_W } from '../core/gfx';
import type { BackgroundDef } from './types';

const mod = (v: number, m: number): number => ((v % m) + m) % m;

export function drawBackground(ctx: Ctx, bg: BackgroundDef, sprites: SpriteStore, time: number): void {
  rect(ctx, 0, 0, SCREEN_W, SCREEN_H, bg.color || '#000000');
  for (const layer of bg.layers) {
    switch (layer.type) {
      case 'image': {
        const s = sprites.get(layer.sprite);
        if (!s) break;
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = prev * (layer.opacity ?? 1);
        const fw = s.frameW, fh = s.frameH;
        const f = Math.floor(time * s.fps) % s.frames;
        const sx = (f % s.cols) * fw, sy = Math.floor(f / s.cols) * fh;
        if (layer.mode === 'tile') {
          const tw = fw * s.scale, th = fh * s.scale;
          for (let y = 0; y < SCREEN_H; y += th) for (let x = 0; x < SCREEN_W; x += tw) ctx.drawImage(s.image, sx, sy, fw, fh, x, y, tw, th);
        } else if (layer.mode === 'center') {
          const tw = fw * s.scale, th = fh * s.scale;
          ctx.drawImage(s.image, sx, sy, fw, fh, Math.round((SCREEN_W - tw) / 2), Math.round((SCREEN_H - th) / 2), tw, th);
        } else {
          ctx.drawImage(s.image, sx, sy, fw, fh, 0, 0, SCREEN_W, SCREEN_H);
        }
        ctx.globalAlpha = prev;
        break;
      }
      case 'scroll': {
        const s = sprites.get(layer.sprite);
        if (!s) break;
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = prev * (layer.opacity ?? 1);
        const fw = s.frameW, fh = s.frameH;
        const tw = fw * s.scale, th = fh * s.scale;
        const f = Math.floor(time * s.fps) % s.frames;
        const sx = (f % s.cols) * fw, sy = Math.floor(f / s.cols) * fh;
        const ox = Math.round(mod(time * layer.speedX, tw)) - tw;
        const oy = Math.round(mod(time * layer.speedY, th)) - th;
        for (let y = oy; y < SCREEN_H; y += th) for (let x = ox; x < SCREEN_W; x += tw) ctx.drawImage(s.image, sx, sy, fw, fh, x, y, tw, th);
        ctx.globalAlpha = prev;
        break;
      }
      case 'grid': {
        const size = Math.max(8, layer.size);
        const lw = Math.max(1, layer.lineWidth ?? 2);
        const alpha = layer.opacity ?? 1;
        const ox = Math.round(mod(time * layer.speedX, size));
        const oy = Math.round(mod(time * layer.speedY, size));
        for (let x = ox - size; x < SCREEN_W; x += size) rect(ctx, x, 0, lw, SCREEN_H, layer.color, alpha);
        for (let y = oy - size; y < SCREEN_H; y += size) rect(ctx, 0, y, SCREEN_W, lw, layer.color, alpha);
        break;
      }
      case 'pulse': {
        const lo = layer.minOpacity ?? 0;
        const hi = layer.maxOpacity ?? 0.3;
        const k = 0.5 + 0.5 * Math.sin(time * layer.speed * Math.PI * 2);
        rect(ctx, 0, 0, SCREEN_W, SCREEN_H, layer.color, lo + (hi - lo) * k);
        break;
      }
    }
  }
}
