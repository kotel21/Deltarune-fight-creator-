/**
 * Okno dialogowe (tekst pisany literka po literce z dźwiękiem "blipa")
 * oraz dymki z kwestiami przeciwników.
 */
import type { AudioEngine } from '../audio/audio';
import { type Ctx, rect } from '../core/gfx';
import type { Input } from '../core/input';
import { type BitmapFont, drawRich, layoutRich, type RichLayout, Typewriter } from '../core/text';
import type { VoiceDef } from './types';

const BLIP_INTERVAL = 0.055;

export interface ShowOpts {
  voice?: VoiceDef;
  /** Tekst bierny: nie czeka na klawisz (np. opis sytuacji nad menu). */
  passive?: boolean;
  /** Automatyczne przejście dalej po tylu sekundach od wypisania (brak = czekaj na Z). */
  auto?: number;
  maxWidth: number;
  lineHeight?: number;
}

export class DialogBox {
  /** Gracz potwierdził wypisaną stronę (albo minął czas auto). */
  advanced = false;
  private tw: Typewriter | null = null;
  private voice: VoiceDef | undefined;
  private passive = false;
  private auto = -1;
  private autoTimer = 0;
  private blipCooldown = 0;

  constructor(private readonly font: BitmapFont) {}

  show(text: string, opts: ShowOpts): void {
    const layout = layoutRich(this.font, text, { maxWidth: opts.maxWidth, lineHeight: opts.lineHeight });
    this.tw = new Typewriter(layout);
    this.voice = opts.voice;
    this.passive = !!opts.passive;
    this.auto = opts.auto ?? -1;
    this.autoTimer = 0;
    this.advanced = false;
    this.blipCooldown = 0;
  }

  clear(): void {
    this.tw = null;
    this.advanced = false;
  }

  get hasText(): boolean {
    return !!this.tw;
  }

  /** Czy cały tekst strony został już wypisany. */
  get typed(): boolean {
    return !this.tw || this.tw.done;
  }

  /** Czy okno czeka na potwierdzenie gracza. */
  get waiting(): boolean {
    return !!this.tw && this.tw.done && !this.passive && !this.advanced;
  }

  update(dt: number, input: Input, audio: AudioEngine): void {
    const tw = this.tw;
    if (!tw) return;
    this.blipCooldown -= dt;
    const revealed = tw.update(dt, !this.passive && input.held('cancel'));
    if (revealed > 0 && this.blipCooldown <= 0) {
      audio.blip(this.voice);
      this.blipCooldown = BLIP_INTERVAL;
    }
    if (this.passive || this.advanced) return;
    if (input.pressed('confirm')) {
      if (!tw.done) tw.finish();
      else this.advanced = true;
    } else if (tw.done && this.auto >= 0) {
      this.autoTimer += dt;
      if (this.autoTimer >= this.auto) this.advanced = true;
    }
  }

  render(ctx: Ctx, x: number, y: number, color: string, time: number): void {
    if (!this.tw) return;
    drawRich(ctx, this.font, this.tw.layout, x, y, color, this.tw.shown, time);
  }
}

// ---------------------------------------------------------------------------------------------
//  Dymki przeciwników
// ---------------------------------------------------------------------------------------------

const BUBBLE_PAD = 9;
const BUBBLE_MAX_TEXT = 158;
const BUBBLE_FILL = '#f4f1ff';
const BUBBLE_INK = '#1b1530';

export class Bubble {
  readonly w: number;
  readonly h: number;
  readonly x: number;
  readonly y: number;
  private readonly layout: RichLayout;
  private readonly tw: Typewriter;
  private blipCooldown = 0;
  private age = 0;

  /**
   * @param tipX,tipY punkt przy wrogu, na który wskazuje ogonek dymka (dymek pojawia się po jego lewej stronie)
   */
  constructor(
    private readonly font: BitmapFont,
    text: string,
    tipX: number,
    private readonly tipY: number,
    private readonly voice: VoiceDef | undefined,
  ) {
    this.layout = layoutRich(font, text, { maxWidth: BUBBLE_MAX_TEXT, lineHeight: 16 });
    this.tw = new Typewriter(this.layout, 36);
    this.w = Math.max(40, Math.ceil(this.layout.width) + BUBBLE_PAD * 2);
    this.h = Math.ceil(this.layout.height) + BUBBLE_PAD * 2;
    this.x = Math.max(150, Math.round(tipX - 14 - this.w));
    this.y = Math.max(6, Math.min(292 - this.h, Math.round(tipY - this.h / 2)));
  }

  get typed(): boolean {
    return this.tw.done;
  }

  finish(): void {
    this.tw.finish();
  }

  update(dt: number, fast: boolean, audio: AudioEngine): void {
    this.age += dt;
    this.blipCooldown -= dt;
    const revealed = this.tw.update(dt, fast);
    if (revealed > 0 && this.blipCooldown <= 0) {
      audio.blip(this.voice);
      this.blipCooldown = BLIP_INTERVAL + 0.01;
    }
  }

  render(ctx: Ctx, time: number): void {
    // krótkie "wyskoczenie" dymka
    const pop = Math.min(1, this.age / 0.12);
    const w = Math.round(this.w * (0.6 + 0.4 * pop));
    const h = Math.round(this.h * (0.6 + 0.4 * pop));
    const x = this.x + (this.w - w);
    const y = this.y + Math.round((this.h - h) / 2);
    // ramka ze ściętymi rogami
    rect(ctx, x + 4, y, w - 8, h, BUBBLE_INK);
    rect(ctx, x + 2, y + 2, w - 4, h - 4, BUBBLE_INK);
    rect(ctx, x, y + 4, w, h - 8, BUBBLE_INK);
    rect(ctx, x + 4, y + 2, w - 8, h - 4, BUBBLE_FILL);
    rect(ctx, x + 2, y + 4, w - 4, h - 8, BUBBLE_FILL);
    // ogonek skierowany w stronę wroga
    const ty = Math.max(y + 8, Math.min(y + h - 10, Math.round(this.tipY)));
    for (let i = 0; i < 5; i++) {
      rect(ctx, x + w + i * 2 - 2, ty - (5 - i), 4, (5 - i) * 2 + 2, BUBBLE_INK);
    }
    for (let i = 0; i < 4; i++) {
      rect(ctx, x + w + i * 2 - 2, ty - (3 - i), 2, (3 - i) * 2 + 2, BUBBLE_FILL);
    }
    if (pop >= 1) drawRich(ctx, this.font, this.layout, this.x + BUBBLE_PAD, this.y + BUBBLE_PAD, BUBBLE_INK, this.tw.shown, time);
  }
}
