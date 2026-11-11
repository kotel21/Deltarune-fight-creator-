/**
 * Tekst pixelowy: font bitmapowy (atlas wygenerowany z fontu "Jersey 10", licencja OFL),
 * prosty język znaczników do kolorów/pauz oraz efekt maszyny do pisania.
 *
 * Znaczniki w tekstach dialogów:
 *   [y] [r] [g] [b] [p] [o] [gray] [w]   – kolor (żółty, czerwony, zielony, niebieski, różowy, pomarańczowy, szary, biały)
 *   [c=#ff8800]                          – dowolny kolor
 *   [/]                                  – powrót do koloru domyślnego i wyłączenie efektów
 *   [wait] / [wait=0.5]                  – pauza w pisaniu (sekundy)
 *   [shake] [wave]                       – drżenie / falowanie liter
 *   [[                                   – dosłowny znak "["
 */
import { type Ctx, type Drawable, tinted } from './gfx';

export interface FontMeta {
  family: string;
  license: string;
  capHeight: number;
  cellW: number;
  cellH: number;
  cols: number;
  ascent: number;
  descent: number;
  originX: number;
  chars: string;
  advances: number[];
}

export type Align = 'left' | 'center' | 'right';

export class BitmapFont {
  readonly capHeight: number;
  /** Domyślny odstęp między liniami (w pikselach fontu, przed skalowaniem). */
  readonly lineHeight: number;
  private readonly index = new Map<string, number>();
  private readonly fallback: number;

  constructor(
    private readonly image: Drawable,
    private readonly meta: FontMeta,
  ) {
    Array.from(meta.chars).forEach((ch, i) => this.index.set(ch, i));
    this.fallback = this.index.get('?') ?? 0;
    this.capHeight = meta.capHeight;
    this.lineHeight = meta.capHeight + 8;
    // twarda spacja zachowuje się jak zwykła
    const space = this.index.get(' ');
    if (space !== undefined) this.index.set(' ', space);
  }

  has(ch: string): boolean {
    return this.index.has(ch);
  }

  /** Szerokość znaku w pikselach fontu (przed skalowaniem). */
  advance(ch: string): number {
    return this.meta.advances[this.index.get(ch) ?? this.fallback];
  }

  measure(text: string, scale = 1): number {
    let w = 0;
    for (const ch of text) w += this.advance(ch);
    return w * scale;
  }

  /** Rysuje pojedynczy znak; (x, y) to lewy górny róg wysokości wersalików. Zwraca szerokość. */
  glyph(ctx: Ctx, ch: string, x: number, y: number, color: string, scale = 1): number {
    const m = this.meta;
    const i = this.index.get(ch) ?? this.fallback;
    if (ch !== ' ' && ch !== ' ') {
      const img = color === '#ffffff' || color === '#fff' ? this.image : tinted(this.image, color);
      ctx.drawImage(
        img,
        (i % m.cols) * m.cellW,
        Math.floor(i / m.cols) * m.cellH,
        m.cellW,
        m.cellH,
        Math.round(x) - m.originX * scale,
        Math.round(y) - (m.ascent - m.capHeight) * scale,
        m.cellW * scale,
        m.cellH * scale,
      );
    }
    return m.advances[i] * scale;
  }

  /** Rysuje linię tekstu. Zwraca jej szerokość. */
  draw(ctx: Ctx, text: string, x: number, y: number, color = '#ffffff', scale = 1, align: Align = 'left'): number {
    const w = this.measure(text, scale);
    let cx = Math.round(align === 'left' ? x : align === 'center' ? x - w / 2 : x - w);
    for (const ch of text) cx += this.glyph(ctx, ch, cx, y, color, scale);
    return w;
  }

  /** Tekst z cieniem (przesuniętym o skalę w prawo i w dół). */
  drawShadow(ctx: Ctx, text: string, x: number, y: number, color: string, shadow: string, scale = 1, align: Align = 'left'): number {
    this.draw(ctx, text, x + scale, y + scale, shadow, scale, align);
    return this.draw(ctx, text, x, y, color, scale, align);
  }

  /** Tekst z obrysem dookoła (np. liczby obrażeń). */
  drawOutline(ctx: Ctx, text: string, x: number, y: number, color: string, outline: string, scale = 1, align: Align = 'left'): number {
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        if (ox || oy) this.draw(ctx, text, x + ox * scale, y + oy * scale, outline, scale, align);
      }
    return this.draw(ctx, text, x, y, color, scale, align);
  }
}

// ---------------------------------------------------------------------------------------------
//  Tekst ze znacznikami
// ---------------------------------------------------------------------------------------------

export const TEXT_COLORS: Record<string, string> = {
  y: '#ffe45c',
  r: '#ff5a6e',
  g: '#7dffa8',
  b: '#6ecbff',
  p: '#ff9ad5',
  o: '#ffb43a',
  gray: '#9aa0c8',
  w: '#ffffff',
};

export interface RichGlyph {
  ch: string;
  x: number;
  y: number;
  /** null = kolor domyślny przekazany przy rysowaniu */
  color: string | null;
  /** 0 = brak, 1 = drżenie, 2 = fala */
  fx: 0 | 1 | 2;
  /** dodatkowa pauza po wypisaniu tego znaku (s) */
  pause: number;
}

export interface RichLayout {
  glyphs: RichGlyph[];
  width: number;
  height: number;
  lines: number;
  scale: number;
}

export interface LayoutOpts {
  maxWidth: number;
  scale?: number;
  /** Odstęp linii w pikselach ekranu; domyślnie font.lineHeight * scale. */
  lineHeight?: number;
}

interface Token {
  ch: string;
  color: string | null;
  fx: 0 | 1 | 2;
  pause: number;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let color: string | null = null;
  let fx: 0 | 1 | 2 = 0;
  const src = text.normalize('NFC');
  let i = 0;
  const addPause = (p: number) => {
    if (out.length) out[out.length - 1].pause += p;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '[') {
      if (src[i + 1] === '[') {
        out.push({ ch: '[', color, fx, pause: 0 });
        i += 2;
        continue;
      }
      const end = src.indexOf(']', i);
      if (end > i) {
        const tag = src.slice(i + 1, end).trim().toLowerCase();
        let ok = true;
        if (tag === '/') {
          color = null;
          fx = 0;
        } else if (tag in TEXT_COLORS) color = TEXT_COLORS[tag];
        else if (/^c=#[0-9a-f]{3,8}$/.test(tag)) color = tag.slice(2);
        else if (tag === 'wait') addPause(0.4);
        else if (/^wait=\d*\.?\d+$/.test(tag)) addPause(Math.min(5, parseFloat(tag.slice(5))));
        else if (tag === 'shake') fx = 1;
        else if (tag === 'wave') fx = 2;
        else ok = false;
        if (ok) {
          i = end + 1;
          continue;
        }
      }
    }
    const cp = src.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    out.push({ ch, color, fx, pause: 0 });
    i += ch.length;
  }
  // naturalne pauzy po interpunkcji
  for (let k = 0; k < out.length - 1; k++) {
    const t = out[k];
    const next = out[k + 1].ch;
    if (next !== ' ' && next !== '\n') continue;
    if ('.!?…'.includes(t.ch)) t.pause += 0.22;
    else if (',;:—–'.includes(t.ch)) t.pause += 0.1;
  }
  return out;
}

/** Usuwa znaczniki — zostaje sam tekst (np. do mierzenia albo czytników ekranu). */
export function stripMarkup(text: string): string {
  return tokenize(text)
    .map((t) => t.ch)
    .join('');
}

/** Rozkłada tekst na linie z zawijaniem słów. */
export function layoutRich(font: BitmapFont, text: string, opts: LayoutOpts): RichLayout {
  const scale = opts.scale ?? 1;
  const lh = opts.lineHeight ?? font.lineHeight * scale;
  const tokens = tokenize(text);
  const glyphs: RichGlyph[] = [];
  let x = 0;
  let line = 0;
  let width = 0;
  let i = 0;
  const newline = () => {
    width = Math.max(width, x);
    x = 0;
    line++;
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.ch === '\n') {
      if (glyphs.length) glyphs[glyphs.length - 1].pause += t.pause;
      newline();
      i++;
      continue;
    }
    if (t.ch === ' ') {
      // spacja na początku zawiniętej linii znika
      if (x > 0) {
        glyphs.push({ ch: ' ', x, y: line * lh, color: t.color, fx: t.fx, pause: t.pause });
        x += font.advance(' ') * scale;
      } else if (glyphs.length) glyphs[glyphs.length - 1].pause += t.pause;
      i++;
      continue;
    }
    // słowo
    let j = i;
    let w = 0;
    while (j < tokens.length && tokens[j].ch !== ' ' && tokens[j].ch !== '\n') {
      w += font.advance(tokens[j].ch) * scale;
      j++;
    }
    if (x > 0 && x + w > opts.maxWidth) {
      // cofamy spację kończącą poprzednią linię
      const last = glyphs[glyphs.length - 1];
      if (last && last.ch === ' ' && last.y === line * lh) {
        x -= font.advance(' ') * scale;
        const removed = glyphs.pop()!;
        if (glyphs.length) glyphs[glyphs.length - 1].pause += removed.pause;
      }
      newline();
    }
    for (let k = i; k < j; k++) {
      const tk = tokens[k];
      const a = font.advance(tk.ch) * scale;
      if (x > 0 && x + a > opts.maxWidth) newline(); // bardzo długie słowo łamiemy w środku
      glyphs.push({ ch: tk.ch, x, y: line * lh, color: tk.color, fx: tk.fx, pause: tk.pause });
      x += a;
    }
    i = j;
  }
  width = Math.max(width, x);
  return { glyphs, width, height: line * lh + font.capHeight * scale, lines: line + 1, scale };
}

/** Rysuje rozłożony tekst; count = ile znaków pokazać (efekt pisania), time = czas do animacji efektów. */
export function drawRich(ctx: Ctx, font: BitmapFont, layout: RichLayout, x: number, y: number, color = '#ffffff', count = Infinity, time = 0): void {
  const n = Math.min(layout.glyphs.length, count);
  for (let i = 0; i < n; i++) {
    const g = layout.glyphs[i];
    if (g.ch === ' ') continue;
    let gx = x + g.x;
    let gy = y + g.y;
    if (g.fx === 1) {
      gx += Math.round(Math.sin(time * 61 + i * 12.9898) * 1.2);
      gy += Math.round(Math.cos(time * 53 + i * 78.233) * 1.2);
    } else if (g.fx === 2) {
      gy += Math.round(Math.sin(time * 6 + i * 0.6) * 2);
    }
    font.glyph(ctx, g.ch, gx, gy, g.color ?? color, layout.scale);
  }
}

/** Efekt maszyny do pisania dla rozłożonego tekstu. */
export class Typewriter {
  shown = 0;
  private wait = 0;

  constructor(
    readonly layout: RichLayout,
    /** znaki na sekundę */
    public cps = 42,
  ) {}

  get done(): boolean {
    return this.shown >= this.layout.glyphs.length;
  }

  /** Zwraca liczbę nowo odsłoniętych znaków (bez spacji) — do odtwarzania "blipów". */
  update(dt: number, fast = false): number {
    if (this.done) return 0;
    this.wait -= fast ? dt * 6 : dt;
    let revealed = 0;
    const g = this.layout.glyphs;
    while (this.wait <= 0 && this.shown < g.length) {
      const cur = g[this.shown];
      this.shown++;
      if (cur.ch !== ' ') revealed++;
      this.wait += 1 / this.cps + cur.pause;
    }
    return revealed;
  }

  finish(): void {
    this.shown = this.layout.glyphs.length;
  }
}
