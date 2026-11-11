/*
 * Generuje atlas bitmapowy fontu pixelowego używanego przez renderer tekstu na canvasie.
 *
 * Font: "Jersey 10" (Copyright 2023 The Soft Type Project Authors), licencja SIL OFL 1.1.
 * Atlas jest renderowany w natywnej siatce fontu (wysokość wersalików = 10 pikseli,
 * 1 piksel fontu = 1 piksel atlasu), a silnik skaluje go całkowitymi krotnościami
 * (x1, x2, x3...), więc tekst jest zawsze ostry.
 *
 * Uruchomienie:  npm run gen:font   (wymaga Playwrighta z Chromium — tylko do regeneracji atlasu;
 * wygenerowane pliki src/assets/font/* są w repozytorium, zwykły build ich nie przebudowuje).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'node_modules/@fontsource/jersey-10/files');
const OUT_DIR = path.join(ROOT, 'src/assets/font');
// Jersey 10: siatka 75 jednostek przy em = 1400 jednostek, czyli 56/3 px na em daje 1 px na piksel fontu.
const K = 6; // nadpróbkowanie
const FONT_PX = (56 / 3) * K; // = 112 px

// Zakresy znaków: ASCII, Latin-1, Latin Extended-A (m.in. polskie znaki) + wybrana interpunkcja.
const ranges = [
  [0x20, 0x7e],
  [0xa1, 0xff],
  [0x100, 0x17f],
];
const extras = [0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2022, 0x2026, 0x20ac];

// Własne symbole dorysowane do atlasu (font ich nie zawiera). '#' = piksel.
// yTop = liczba pikseli nad linią bazową, na której zaczyna się rysunek.
const customGlyphs = {
  '♥': { yTop: 9, rows: ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'] },
  '♡': { yTop: 9, rows: ['.##...##.', '#..#.#..#', '#...#...#', '#.......#', '.#.....#.', '..#...#..', '...#.#...', '....#....'] },
  '★': { yTop: 10, rows: ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..#####..', '.###.###.', '.#.....#.'] },
  '✦': { yTop: 10, rows: ['....#....', '....#....', '...###...', '..#####..', '#########', '..#####..', '...###...', '....#....', '....#....'] },
  '▶': { yTop: 9, rows: ['#.....', '##....', '####..', '#####.', '######', '#####.', '####..', '##....', '#.....'] },
  '◀': { yTop: 9, rows: ['.....#', '....##', '..####', '.#####', '######', '.#####', '..####', '....##', '.....#'] },
  '▲': { yTop: 8, rows: ['....#....', '...###...', '..#####..', '.#######.', '#########'] },
  '▼': { yTop: 8, rows: ['#########', '.#######.', '..#####..', '...###...', '....#....'] },
  '→': { yTop: 8, rows: ['....##...', '.....##..', '#########', '#########', '.....##..', '....##...'] },
  '←': { yTop: 8, rows: ['...##....', '..##.....', '#########', '#########', '..##.....', '...##....'] },
  '↑': { yTop: 9, rows: ['...##...', '..####..', '.######.', '##.##.##', '...##...', '...##...', '...##...', '...##...', '...##...'] },
  '↓': { yTop: 9, rows: ['...##...', '...##...', '...##...', '...##...', '...##...', '##.##.##', '.######.', '..####..', '...##...'] },
  '●': { yTop: 8, rows: ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..'] },
  '○': { yTop: 8, rows: ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'] },
  '♪': { yTop: 10, rows: ['...###', '...#.#', '...#.#', '...#..', '...#..', '...#..', '.###..', '####..', '####..', '.##...'] },
  '✓': { yTop: 8, rows: ['.......##', '......##.', '.....##..', '##..##...', '.####....', '..##.....'] },
  '✗': { yTop: 8, rows: ['##...##', '.##.##.', '..###..', '..###..', '.##.##.', '##...##'] },
  '■': { yTop: 8, rows: ['#######', '#######', '#######', '#######', '#######', '#######', '#######'] },
  '◆': { yTop: 10, rows: ['....#....', '...###...', '..#####..', '.#######.', '#########', '.#######.', '..#####..', '...###...', '....#....'] },
};

(async () => {
  const b64 = (f) => fs.readFileSync(path.join(FONT_DIR, f)).toString('base64');
  const latin = b64('jersey-10-latin-400-normal.woff2');
  const latinExt = b64('jersey-10-latin-ext-400-normal.woff2');

  const chars = [];
  for (const [a, b] of ranges) for (let c = a; c <= b; c++) chars.push(String.fromCodePoint(c));
  for (const c of extras) chars.push(String.fromCodePoint(c));

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><html><body></body></html>');

  const result = await page.evaluate(
    async ({ latin, latinExt, chars, K, FONT_PX }) => {
      const mk = (name, data) => new FontFace(name, `url(data:font/woff2;base64,${data}) format("woff2")`);
      const f1 = mk('FcA', latin);
      const f2 = mk('FcB', latinExt);
      await f1.load();
      await f2.load();
      document.fonts.add(f1);
      document.fonts.add(f2);

      // Renderujemy w powiększeniu K razy i próbkujemy środek każdego bloku KxK —
      // dzięki temu antyaliasing przeglądarki nie zamazuje jednopikselowych detali.
      const W = 56, H = 56, OX = 16, BASE = 34;
      const cv = document.createElement('canvas');
      cv.width = W * K;
      cv.height = H * K;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      let ambiguous = 0;
      const render = (ch, font) => {
        ctx.clearRect(0, 0, W * K, H * K);
        ctx.font = font;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#fff';
        ctx.fillText(ch, OX * K, BASE * K);
        const d = ctx.getImageData(0, 0, W * K, H * K).data;
        const bits = new Uint8Array(W * H);
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            let sum = 0;
            for (let yy = 0; yy < K; yy++)
              for (let xx = 0; xx < K; xx++) sum += d[((y * K + yy) * W * K + x * K + xx) * 4 + 3];
            const avg = sum / (K * K);
            if (avg > 50 && avg < 205) ambiguous++;
            bits[y * W + x] = avg >= 128 ? 1 : 0;
          }
        return { bits, width: ctx.measureText(ch).width / K };
      };
      const same = (a, b) => {
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
      };
      const pixelFont = `${FONT_PX}px FcA, FcB, monospace`;
      const fallback = `${FONT_PX}px monospace`;
      const out = [];
      const missing = [];
      for (const ch of chars) {
        const a = render(ch, pixelFont);
        const isSpace = ch === ' ' || ch === ' ';
        if (!isSpace) {
          const b = render(ch, fallback);
          if (same(a.bits, b.bits) && Math.abs(a.width - b.width) < 0.01) {
            missing.push(ch);
            continue;
          }
        }
        // granice glifu
        let minX = W, maxX = -1, minY = H, maxY = -1;
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++)
            if (a.bits[y * W + x]) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
        const rows = [];
        if (maxX >= 0) {
          for (let y = minY; y <= maxY; y++) {
            let s = '';
            for (let x = minX; x <= maxX; x++) s += a.bits[y * W + x] ? '#' : '.';
            rows.push(s);
          }
        }
        out.push({
          ch,
          advance: Math.round(a.width),
          left: maxX >= 0 ? minX - OX : 0, // przesunięcie od punktu startu pióra
          top: maxX >= 0 ? BASE - minY : 0, // ile pikseli nad linią bazową zaczyna się glif
          rows,
        });
      }
      return { glyphs: out, missing, ambiguous };
    },
    { latin, latinExt, chars, K, FONT_PX },
  );
  await browser.close();

  const glyphs = result.glyphs;
  for (const [ch, g] of Object.entries(customGlyphs)) {
    glyphs.push({ ch, advance: g.rows[0].length + 1, left: 0, top: g.yTop, rows: g.rows });
  }

  // Wspólna komórka: obliczamy zakres pionowy i poziomy wszystkich glifów.
  let ascent = 0, descent = 0, minLeft = 0, maxRight = 0;
  for (const g of glyphs) {
    if (!g.rows.length) continue;
    ascent = Math.max(ascent, g.top);
    descent = Math.max(descent, g.rows.length - g.top);
    minLeft = Math.min(minLeft, g.left);
    maxRight = Math.max(maxRight, g.left + g.rows[0].length);
  }
  const originX = -minLeft;
  const cellW = originX + maxRight;
  const cellH = ascent + descent;
  const cols = 32;
  const rowsCount = Math.ceil(glyphs.length / cols);
  const width = cols * cellW;
  const height = rowsCount * cellH;
  const rgba = Buffer.alloc(width * height * 4, 0);
  glyphs.forEach((g, i) => {
    const cx = (i % cols) * cellW;
    const cy = Math.floor(i / cols) * cellH;
    g.rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] !== '#') continue;
        const x = cx + originX + g.left + rx;
        const y = cy + (ascent - g.top) + ry;
        const o = (y * width + x) * 4;
        rgba[o] = 255;
        rgba[o + 1] = 255;
        rgba[o + 2] = 255;
        rgba[o + 3] = 255;
      }
    });
  });

  const { encodePNG } = await import('./png.mjs');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'jersey10.png'), encodePNG(width, height, rgba));
  const meta = {
    family: 'Jersey 10',
    license: 'SIL Open Font License 1.1 — Copyright 2023 The Soft Type Project Authors',
    capHeight: 10,
    cellW,
    cellH,
    cols,
    ascent,
    descent,
    originX,
    chars: glyphs.map((g) => g.ch).join(''),
    advances: glyphs.map((g) => g.advance),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'jersey10.json'), JSON.stringify(meta));
  console.log(
    `atlas ${width}x${height}, komórka ${cellW}x${cellH}, ascent ${ascent}, descent ${descent}, glify: ${glyphs.length}, brak w foncie: ${result.missing.length}, niejednoznaczne piksele: ${result.ambiguous}`,
  );
  if (result.missing.length) console.log('pominięte:', result.missing.join(' '));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
