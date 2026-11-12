/** Rozmieszczenie elementów ekranu walki (bazowa rozdzielczość 640x480). */

/** Wysokość sceny (część nad panelami postaci). */
export const STAGE_H = 300;

/** Panele postaci. */
export const PANEL = { y: 304, w: 196, h: 38, gap: 6 };

/** Okno dialogowe / menu na dole ekranu. */
export const DIALOG = { x: 20, y: 348, w: 600, h: 124, pad: 16 };

/** Pionowy pasek TP po lewej. */
export const TP_BAR = { x: 14, y: 54, w: 22, h: 182 };

export interface Point {
  x: number;
  y: number;
}

/** Pozycje stóp postaci drużyny (lewa strona sceny). */
export function partyAnchors(count: number): Point[] {
  if (count <= 1) return [{ x: 112, y: 204 }];
  if (count === 2) return [
    { x: 104, y: 150 },
    { x: 132, y: 256 },
  ];
  return [
    { x: 100, y: 112 },
    { x: 138, y: 198 },
    { x: 100, y: 284 },
  ];
}

/** Pozycje przeciwników (prawa strona sceny). */
export function enemyAnchors(count: number): Point[] {
  if (count <= 1) return [{ x: 500, y: 214 }];
  if (count === 2) return [
    { x: 480, y: 150 },
    { x: 546, y: 266 },
  ];
  return [
    { x: 486, y: 106 },
    { x: 556, y: 190 },
    { x: 486, y: 276 },
  ];
}

/** Lewy górny róg panelu postaci o danym indeksie. */
export function panelX(index: number, count: number): number {
  const total = count * PANEL.w + (count - 1) * PANEL.gap;
  return Math.round(320 - total / 2 + index * (PANEL.w + PANEL.gap));
}
