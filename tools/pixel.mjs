// Malutka biblioteka do rysowania pixel-artu z kodu (używana przez gen-sprites.mjs).

const colorCache = new Map();

/** '#rrggbb' | '#rrggbbaa' | [r,g,b,a] -> [r,g,b,a] */
export function col(c) {
  if (Array.isArray(c)) return c;
  let v = colorCache.get(c);
  if (!v) {
    const h = c.replace('#', '');
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255];
    colorCache.set(c, v);
  }
  return v;
}

export function mix(a, b, t) {
  const ca = col(a), cb = col(b);
  return [0, 1, 2, 3].map((i) => Math.round(ca[i] + (cb[i] - ca[i]) * t));
}

export class Px {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h * 4);
  }

  inb(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inb(x, y)) return this;
    const k = col(c);
    const o = (y * this.w + x) * 4;
    this.d[o] = k[0];
    this.d[o + 1] = k[1];
    this.d[o + 2] = k[2];
    this.d[o + 3] = k[3];
    return this;
  }

  erase(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inb(x, y)) return this;
    this.d.fill(0, (y * this.w + x) * 4, (y * this.w + x) * 4 + 4);
    return this;
  }

  alpha(x, y) {
    if (!this.inb(x, y)) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }

  rect(x, y, w, h, c) {
    x = Math.round(x);
    y = Math.round(y);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
    return this;
  }

  /** Wypełniona elipsa o środku (cx, cy) i promieniach rx, ry (mogą być ułamkowe). */
  disc(cx, cy, rx, ry, c) {
    if (ry === undefined || typeof ry !== 'number') {
      c = ry;
      ry = rx;
    }
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, c);
      }
    return this;
  }

  /** Okrąg (pierścień) o grubości t. */
  ring(cx, cy, r, t, c) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r && d > r - t) this.set(x, y, c);
      }
    return this;
  }

  line(x0, y0, x1, y1, c, t = 1) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    const off = Math.floor((t - 1) / 2);
    for (;;) {
      if (t <= 1) this.set(x0, y0, c);
      else this.rect(x0 - off, y0 - off, t, t, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }

  /** Wypełniony wielokąt (reguła parzystości), punkty jako [[x,y],...]. */
  poly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) this.set(x, y, c);
      }
    }
    return this;
  }

  /** Obrócony prostokąt o środku (cx, cy). */
  rotRect(cx, cy, w, h, deg, c) {
    const a = (deg * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]);
    return this.poly(pts, c);
  }

  /** Stempel z ASCII-artu: pal mapuje znak -> kolor, '.' i ' ' = przezroczyste. */
  art(x, y, rows, pal) {
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c) this.set(x + rx, y + ry, c);
      }
    });
    return this;
  }

  blit(src, dx, dy, opts = {}) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const sx = opts.flipX ? src.w - 1 - x : x;
        const o = (y * src.w + sx) * 4;
        if (src.d[o + 3] === 0) continue;
        this.set(dx + x, dy + y, [src.d[o], src.d[o + 1], src.d[o + 2], src.d[o + 3]]);
      }
    return this;
  }

  /** Obrys wokół nieprzezroczystych pikseli. */
  outline(c, diagonal = false) {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y)) continue;
        let near = this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1);
        if (!near && diagonal) near = this.alpha(x - 1, y - 1) || this.alpha(x + 1, y - 1) || this.alpha(x - 1, y + 1) || this.alpha(x + 1, y + 1);
        if (near) add.push([x, y]);
      }
    for (const [x, y] of add) this.set(x, y, c);
    return this;
  }

  /** Miesza wszystkie nieprzezroczyste piksele z kolorem c (t = 0..1). */
  tint(c, t) {
    const k = col(c);
    for (let i = 0; i < this.d.length; i += 4) {
      if (!this.d[i + 3]) continue;
      for (let j = 0; j < 3; j++) this.d[i + j] = Math.round(this.d[i + j] + (k[j] - this.d[i + j]) * t);
    }
    return this;
  }

  /** Zamienia jeden kolor na inny. */
  swap(from, to) {
    const a = col(from), b = col(to);
    for (let i = 0; i < this.d.length; i += 4) {
      if (this.d[i + 3] && this.d[i] === a[0] && this.d[i + 1] === a[1] && this.d[i + 2] === a[2]) {
        this.d[i] = b[0];
        this.d[i + 1] = b[1];
        this.d[i + 2] = b[2];
      }
    }
    return this;
  }

  shifted(dx, dy) {
    const out = new Px(this.w, this.h);
    out.blit(this, dx, dy);
    return out;
  }

  scaled(k) {
    const out = new Px(this.w * k, this.h * k);
    for (let y = 0; y < out.h; y++)
      for (let x = 0; x < out.w; x++) {
        const o = (Math.floor(y / k) * this.w + Math.floor(x / k)) * 4;
        const t = (y * out.w + x) * 4;
        out.d[t] = this.d[o];
        out.d[t + 1] = this.d[o + 1];
        out.d[t + 2] = this.d[o + 2];
        out.d[t + 3] = this.d[o + 3];
      }
    return out;
  }
}

/** Skleja klatki w poziomy pasek (spritesheet). */
export function strip(frames) {
  const w = frames[0].w, h = frames[0].h;
  const out = new Px(w * frames.length, h);
  frames.forEach((f, i) => out.blit(f, i * w, 0));
  return out;
}

/** Deterministyczny generator liczb pseudolosowych. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
