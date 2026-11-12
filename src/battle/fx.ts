/**
 * Warstwa efektów: wyskakujące liczby (obrażenia, leczenie, mercy), animacje efektów
 * (cięcie, trafienie, leczenie), cząsteczki, trzęsienie ekranu i błysk.
 */
import { type Ctx, drawSprite, rect, SCREEN_H, SCREEN_W, type SpriteRes } from '../core/gfx';
import type { BitmapFont } from '../core/text';

interface Popup {
  text: string;
  x: number;
  y: number;
  vy: number;
  color: string;
  scale: number;
  age: number;
  life: number;
}

interface SpriteFx {
  sprite: SpriteRes;
  x: number;
  y: number;
  t: number;
  scale: number;
  tint?: string;
  rot: number;
  flipX: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  color: string;
  size: number;
  age: number;
  life: number;
}

export class FxLayer {
  private popups: Popup[] = [];
  private sprites: SpriteFx[] = [];
  private particles: Particle[] = [];
  private shakeTime = 0;
  private shakeDur = 0;
  private shakeAmp = 0;
  private flashAlpha = 0;
  private flashColor = '#ffffff';
  private flashDecay = 3;
  private clock = 0;

  /** Wyskakująca liczba / napis. */
  popup(text: string, x: number, y: number, color: string, scale = 2): void {
    // jeśli w tym miejscu jest już świeży napis, nowy wyskakuje wyżej
    for (const p of this.popups) {
      if (p.age < 0.5 && Math.abs(p.x - x) < 60 && Math.abs(p.y - y) < 20) y -= 22;
    }
    this.popups.push({ text, x, y, vy: -130, color, scale, age: 0, life: 1.05 });
  }

  /** Jednorazowa animacja efektu (odtwarza wszystkie klatki sprite'a i znika). */
  sprite(sprite: SpriteRes | null, x: number, y: number, opts: { scale?: number; tint?: string; rot?: number; flipX?: boolean } = {}): void {
    if (!sprite) return;
    this.sprites.push({ sprite, x, y, t: 0, scale: opts.scale ?? sprite.scale, tint: opts.tint, rot: opts.rot ?? 0, flipX: !!opts.flipX });
  }

  /** Rozprysk cząsteczek. */
  burst(x: number, y: number, color: string, count = 10, speed = 120, gravity = 240): void {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, gravity, color, size: Math.random() < 0.5 ? 2 : 4, age: 0, life: 0.45 + Math.random() * 0.35 });
    }
  }

  /** Unoszące się iskierki (np. przy oszczędzaniu). */
  rise(x: number, y: number, color: string, count = 8, spreadX = 40): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({ x: x + (Math.random() * 2 - 1) * spreadX, y: y - Math.random() * 50, vx: (Math.random() * 2 - 1) * 12, vy: -30 - Math.random() * 50, gravity: -20, color, size: 2, age: 0, life: 0.6 + Math.random() * 0.6 });
    }
  }

  shake(amp: number, time: number): void {
    if (amp >= this.shakeAmp * (this.shakeDur > 0 ? this.shakeTime / this.shakeDur : 0)) {
      this.shakeAmp = amp;
      this.shakeTime = time;
      this.shakeDur = time;
    }
  }

  flash(color: string, alpha: number, decay = 3): void {
    this.flashColor = color;
    this.flashAlpha = alpha;
    this.flashDecay = decay;
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * this.flashDecay);
    for (const p of this.popups) {
      p.age += dt;
      p.vy += 330 * dt;
      if (p.vy > 40) p.vy = 40;
      p.y += p.vy * dt;
    }
    this.popups = this.popups.filter((p) => p.age < p.life);
    for (const s of this.sprites) s.t += dt;
    this.sprites = this.sprites.filter((s) => s.t * s.sprite.fps < s.sprite.frames);
    for (const p of this.particles) {
      p.age += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  /** Aktualne przesunięcie sceny od trzęsienia ekranu. */
  get offset(): { x: number; y: number } {
    if (this.shakeTime <= 0 || this.shakeDur <= 0) return { x: 0, y: 0 };
    const k = this.shakeAmp * (this.shakeTime / this.shakeDur);
    return { x: Math.round(Math.sin(this.clock * 97) * k), y: Math.round(Math.cos(this.clock * 83) * k) };
  }

  /** Animacje efektów i cząsteczki (rysowane nad postaciami). */
  renderSprites(ctx: Ctx): void {
    for (const s of this.sprites) {
      drawSprite(ctx, s.sprite, Math.min(s.sprite.frames - 1, Math.floor(s.t * s.sprite.fps)), s.x, s.y, {
        scale: s.scale,
        tint: s.tint,
        tintAmount: s.tint ? 0.85 : 0,
        rot: s.rot,
        flipX: s.flipX,
      });
    }
    for (const p of this.particles) {
      const a = 1 - p.age / p.life;
      rect(ctx, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, p.color, Math.min(1, a * 1.6));
    }
  }

  /** Wyskakujące napisy (rysowane na samym wierzchu sceny). */
  renderPopups(ctx: Ctx, font: BitmapFont): void {
    for (const p of this.popups) {
      // pod koniec napis miga zamiast blednąć — półprzezroczysty obrys wyglądałby jak brudna plama
      const left = p.life - p.age;
      if (left < 0.2 && Math.floor(left * 30) % 2 === 0) continue;
      font.drawOutline(ctx, p.text, p.x, p.y, p.color, '#12102a', p.scale, 'center');
    }
  }

  renderFlash(ctx: Ctx): void {
    if (this.flashAlpha > 0) rect(ctx, 0, 0, SCREEN_W, SCREEN_H, this.flashColor, Math.min(1, this.flashAlpha));
  }
}
