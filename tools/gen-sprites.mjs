/*
 * Generator oryginalnych sprite'ów zastępczych (pixel-art) dla Fight Creatora.
 * Każdy sprite to poziomy spritesheet (pasek klatek) zapisany jako PNG + wpis w manifest.json.
 *
 * Uruchomienie:  npm run gen:sprites
 * Wynik:         src/assets/sprites/*.png, src/assets/sprites/manifest.json, docs/sprites-preview.png
 *
 * Wszystkie grafiki są rysowane z kodu (własne projekty) — można je swobodnie podmieniać
 * własnymi plikami PNG w edytorze.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.mjs';
import { Px, strip, rng, mix } from './pixel.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/assets/sprites');
const DOCS = path.join(ROOT, 'docs');

const INK = '#1b1530'; // kolor obrysu
const WHITE = '#ffffff';

const sheets = []; // { name, frames: Px[], fps, loop, group, origin }
/** origin = punkt zaczepienia w klatce [x, y] (np. środek stóp postaci); domyślnie środek klatki. */
function sheet(name, group, fps, loop, frames, origin) {
  sheets.push({ name, group, fps, loop, frames, origin });
}

const rad = (deg) => (deg * Math.PI) / 180;
const polar = (x, y, deg, len) => [x + Math.cos(rad(deg)) * len, y + Math.sin(rad(deg)) * len];

// ============================================================================================
//  ISKRA — mała rycerka z płomiennym pióropuszem
// ============================================================================================
const IS = {
  steel: '#cfd8ee', steelHi: '#f6f8ff', steelSh: '#8e9bc0', visor: '#252a45', eye: '#ffe27a',
  armor: '#4f67a8', armorSh: '#39497f', armorHi: '#7c96d8',
  scarf: '#ff9a2e', scarfSh: '#d2641c',
  flameY: '#ffe45c', flameO: '#ff9a2e', flameR: '#e8502a',
  boot: '#7a5440', bootSh: '#4f352a',
  blade: '#f2f6ff', bladeSh: '#a3b2da', gold: '#ffcf4d', goldSh: '#c08a26',
};

function drawSword(p, hx, hy, deg, len = 13) {
  const [tx, ty] = polar(hx, hy, deg, len);
  const [gx, gy] = polar(hx, hy, deg, 2);
  // ostrze
  p.line(gx, gy, tx, ty, IS.bladeSh, 2);
  p.line(gx, gy, tx, ty, IS.blade, 1);
  // jelec (prostopadle)
  const [a1x, a1y] = polar(gx, gy, deg + 90, 2.4);
  const [a2x, a2y] = polar(gx, gy, deg - 90, 2.4);
  p.line(a1x, a1y, a2x, a2y, IS.gold, 1);
  // rękojeść
  const [px_, py_] = polar(hx, hy, deg + 180, 1.5);
  p.line(hx, hy, px_, py_, IS.goldSh, 1);
}

function drawIskra(o = {}) {
  const p = new Px(48, 48);
  const { dx = 0, dy = 0, bob = 0, lean = 0, plume = 0, scarf = 0, sword = -58, eyes = 'open', shield = 0, crouch = 0, trail = null, handUp = 0 } = o;
  const X = 20 + dx, G = 45 + dy;
  const by = G - 11 + bob + crouch; // środek tułowia
  const hx = X + lean, hy = G - 23 + bob + crouch; // środek głowy

  // szalik powiewający za plecami
  p.poly([[X - 2, hy + 6], [X - 9, hy + 6 + scarf], [X - 15, hy + 9 + scarf * 2], [X - 14, hy + 12 + scarf * 2], [X - 8, hy + 10 + scarf], [X - 2, hy + 10]], IS.scarfSh);
  p.poly([[X - 2, hy + 6], [X - 9, hy + 5 + scarf], [X - 14, hy + 8 + scarf * 2], [X - 8, hy + 8 + scarf], [X - 2, hy + 8]], IS.scarf);

  // nogi
  const sp = crouch ? 1 : 0;
  p.rect(X - 4 - sp, G - 5, 3, 5, IS.boot).rect(X + 1 + sp, G - 5, 3, 5, IS.boot);
  p.rect(X - 4 - sp, G - 1, 4, 1, IS.bootSh).rect(X + 1 + sp, G - 1, 4, 1, IS.bootSh);

  // ślad cięcia (rysowany pod postacią/mieczem)
  if (trail) {
    const [cx, cy, r, a0, a1] = trail;
    for (let a = a0; a <= a1; a += 2) {
      const t = (a - a0) / (a1 - a0);
      const [ax, ay] = polar(cx, cy, a, r);
      p.rect(Math.round(ax), Math.round(ay), 1 + Math.round(t * 2), 1 + Math.round(t * 2), t > 0.6 ? WHITE : IS.flameY);
    }
  }

  // tułów
  const bx = X + lean * 0.5;
  p.disc(bx, by, 6, 6.5, IS.armorSh);
  p.disc(bx - 0.6, by - 0.6, 5.2, 5.7, IS.armor);
  p.rect(bx - 3, by - 4, 2, 3, IS.armorHi);
  p.rect(bx - 5, by + 2, 11, 1, IS.gold);
  p.rect(bx - 5, by + 3, 11, 1, IS.goldSh);

  // hełm
  p.disc(hx, hy, 8.6, 7.6, IS.steelSh);
  p.disc(hx - 0.6, hy - 0.7, 7.8, 6.8, IS.steel);
  p.disc(hx - 3, hy - 4, 2.6, 1.4, IS.steelHi);
  // wizjer + oko
  p.rect(hx, hy - 1, 8, 4, IS.visor);
  p.rect(hx - 1, hy, 1, 2, IS.visor);
  if (eyes === 'open') p.rect(hx + 4, hy, 2, 2, IS.eye);
  else if (eyes === 'hurt') {
    p.set(hx + 3, hy - 0, IS.eye).set(hx + 4, hy + 1, IS.eye).set(hx + 3, hy + 2, IS.eye).set(hx + 6, hy, IS.eye).set(hx + 5, hy + 1, IS.eye).set(hx + 6, hy + 2, IS.eye);
  } else if (eyes === 'focus') p.rect(hx + 3, hy + 1, 4, 1, IS.eye);
  // grzebień hełmu
  p.rect(hx - 1, hy - 8, 3, 2, IS.steelSh);

  // pióropusz-płomień
  const pl = plume;
  p.poly([[hx - 4, hy - 7], [hx - 6 - pl, hy - 12], [hx - 3 - pl, hy - 10], [hx - 4 - pl * 1.5, hy - 17], [hx + 1 - pl * 0.5, hy - 11], [hx + 3 - pl, hy - 13], [hx + 4, hy - 7]], IS.flameR);
  p.poly([[hx - 3, hy - 7], [hx - 4 - pl, hy - 11], [hx - 2 - pl, hy - 10], [hx - 3 - pl, hy - 15], [hx + 1 - pl * 0.5, hy - 10], [hx + 3, hy - 7]], IS.flameO);
  p.poly([[hx - 2, hy - 7], [hx - 2 - pl * 0.5, hy - 11], [hx, hy - 9], [hx + 2, hy - 7]], IS.flameY);

  // szalik przy szyi
  p.rect(hx - 5, hy + 6, 11, 2, IS.scarf);
  p.rect(hx - 5, hy + 8, 11, 1, IS.scarfSh);

  if (shield) {
    // tarcza przed postacią
    const sx = X + 9, sy = by - 1;
    p.disc(sx, sy, 5.6, 7.6, IS.goldSh);
    p.disc(sx - 0.4, sy - 0.4, 4.8, 6.8, IS.gold);
    p.disc(sx - 0.2, sy - 0.2, 3.3, 5.2, IS.steel);
    p.disc(sx - 0.2, sy - 0.2, 2.2, 3.8, IS.steelSh);
    // godło-płomyk
    p.poly([[sx - 1.5, sy + 2], [sx - 0.5, sy - 3], [sx + 1, sy - 1], [sx + 2, sy + 2]], IS.flameO);
    p.set(sx, sy + 1, IS.flameY);
    if (shield === 2) p.rect(sx - 3, sy - 5, 2, 1, WHITE).set(sx - 4, sy - 4, WHITE);
    if (shield === 3) p.rect(sx + 1, sy + 3, 2, 1, WHITE).set(sx + 3, sy + 2, WHITE);
  } else {
    // ręka i miecz
    const handX = bx + 6 + (handUp ? 1 : 0), handY = by + 1 - handUp;
    p.line(bx + 3, by - 2, handX, handY, IS.armorSh, 2);
    drawSword(p, handX + 1, handY, sword);
    p.rect(handX, handY - 1, 2, 2, IS.steel);
  }
  return p;
}

function finish(p, flash = 0) {
  if (flash) p.tint(WHITE, flash);
  p.outline(INK);
  return p;
}

sheet('iskra-idle', 'party', 6, true, [
  finish(drawIskra({ bob: 0, plume: 0, scarf: 0 })),
  finish(drawIskra({ bob: 0, plume: 1, scarf: 1 })),
  finish(drawIskra({ bob: 1, plume: 0, scarf: 2 })),
  finish(drawIskra({ bob: 1, plume: -1, scarf: 1 })),
], [20, 46]);
sheet('iskra-attack', 'party', 14, false, [
  finish(drawIskra({ dx: -1, lean: -1, sword: -92, handUp: 6, plume: -1, eyes: 'focus' })),
  finish(drawIskra({ dx: -2, lean: -2, sword: -118, handUp: 9, plume: -2, eyes: 'focus', scarf: -1 })),
  finish(drawIskra({ dx: 4, lean: 2, sword: -35, plume: 2, eyes: 'focus', scarf: 2, trail: [30, 34, 14, -150, -35] })),
  finish(drawIskra({ dx: 7, lean: 3, sword: 28, plume: 3, eyes: 'focus', scarf: 3, trail: [33, 34, 14, -80, 28] })),
  finish(drawIskra({ dx: 6, lean: 2, sword: 34, plume: 1, eyes: 'focus', scarf: 2 })),
  finish(drawIskra({ dx: 2, lean: 0, sword: -20, plume: 0, scarf: 1 })),
], [20, 46]);
sheet('iskra-hurt', 'party', 10, false, [
  finish(drawIskra({ dx: -2, lean: -2, eyes: 'hurt', plume: 3, scarf: -2, sword: -80 }), 0.8),
  finish(drawIskra({ dx: -4, lean: -3, eyes: 'hurt', plume: 3, scarf: -2, sword: -85 })),
  finish(drawIskra({ dx: -2, lean: -1, eyes: 'hurt', plume: 1, scarf: 0, sword: -70 })),
], [20, 46]);
sheet('iskra-defend', 'party', 6, true, [
  finish(drawIskra({ crouch: 1, shield: 1, plume: 0, scarf: 1 })),
  finish(drawIskra({ crouch: 1, shield: 2, plume: 1, scarf: 2 })),
  finish(drawIskra({ crouch: 1, shield: 3, plume: 0, scarf: 1 })),
], [20, 46]);

// ============================================================================================
//  BOREK — niedźwiadek-siłacz z młotem
// ============================================================================================
const BO = {
  fur: '#a8703f', furSh: '#7a4c29', furHi: '#cb9058', belly: '#ecc896', bellySh: '#c99b66',
  nose: '#2b1d22', eye: '#221820', band: '#3fd8c0', bandSh: '#259a8a',
  wood: '#96693f', woodSh: '#62432a', iron: '#b9c2d4', ironSh: '#7c879f', ironHi: '#f1f4fb', paw: '#5c3a22',
};

function drawHammer(p, hx, hy, deg, len = 17) {
  const [tx, ty] = polar(hx, hy, deg, len);
  const [bx, by] = polar(hx, hy, deg + 180, 3);
  p.line(bx, by, tx, ty, BO.woodSh, 2);
  p.line(bx, by, tx, ty, BO.wood, 1);
  // obuch — obrócony prostokąt prostopadły do trzonka
  p.rotRect(tx, ty, 8, 13, deg, BO.ironSh);
  const [ix, iy] = polar(tx, ty, deg + 180, 0.8);
  p.rotRect(ix, iy, 6, 12, deg, BO.iron);
  const [h1x, h1y] = polar(tx, ty, deg - 90, 4);
  p.rotRect(h1x, h1y, 4, 2, deg, BO.ironHi);
}

function drawBorek(o = {}) {
  const p = new Px(68, 56);
  const { dx = 0, dy = 0, bob = 0, lean = 0, hammer = -78, eyes = 'open', guard = 0, crouch = 0, impact = 0, mouth = 0, handUp = 0, front = 0 } = o;
  const X = 24 + dx, G = 53 + dy;
  const by = G - 12 + bob + crouch;
  const hx = X + 1 + lean, hy = G - 28 + bob + crouch;

  // końcówka chusty z tyłu
  p.poly([[X - 5, hy + 8], [X - 12, hy + 9], [X - 14, hy + 13], [X - 9, hy + 12], [X - 5, hy + 11]], BO.bandSh);

  // młot za plecami (gdy nie w gardzie)
  const handX = X + 10 + lean * 0.5, handY = by + 1 - handUp;
  if (!guard && !front) drawHammer(p, handX, handY, hammer);

  // łapy tylne
  p.disc(X - 5, G - 2, 4, 2.6, BO.paw).disc(X + 5, G - 2, 4, 2.6, BO.paw);

  // tułów
  const bx = X + lean * 0.4;
  p.disc(bx, by, 10.6, 10, BO.furSh);
  p.disc(bx - 0.7, by - 0.7, 9.7, 9.2, BO.fur);
  p.disc(bx + 3, by + 2, 5.6, 6, BO.bellySh);
  p.disc(bx + 2.6, by + 1.6, 5, 5.4, BO.belly);

  // głowa
  p.disc(hx - 7, hy - 6, 3.4, 3.4, BO.furSh).disc(hx - 7.3, hy - 6.3, 2.8, 2.8, BO.fur).disc(hx - 7, hy - 6, 1.4, 1.4, BO.belly);
  p.disc(hx + 6, hy - 7, 3.4, 3.4, BO.furSh).disc(hx + 5.7, hy - 7.3, 2.8, 2.8, BO.fur).disc(hx + 6, hy - 7, 1.4, 1.4, BO.belly);
  p.disc(hx, hy, 9.6, 8.6, BO.furSh);
  p.disc(hx - 0.6, hy - 0.6, 8.8, 7.8, BO.fur);
  p.disc(hx - 4, hy - 5, 2.5, 1.3, BO.furHi);
  // pysk
  p.disc(hx + 5, hy + 2.5, 4.6, 3.6, BO.bellySh);
  p.disc(hx + 4.8, hy + 2.2, 4.2, 3.2, BO.belly);
  p.rect(hx + 7, hy, 3, 2, BO.nose);
  if (mouth) p.rect(hx + 5, hy + 3, 3, 2, BO.nose);
  else p.set(hx + 6, hy + 4, BO.nose).set(hx + 7, hy + 4, BO.nose).set(hx + 8, hy + 3, BO.nose);
  // oko + brew
  if (eyes === 'open') {
    p.rect(hx + 1, hy - 3, 2, 3, BO.eye).set(hx + 1, hy - 3, WHITE);
    p.rect(hx, hy - 5, 4, 1, BO.furSh);
  } else if (eyes === 'hurt') {
    p.set(hx, hy - 4, BO.eye).set(hx + 1, hy - 3, BO.eye).set(hx + 2, hy - 2, BO.eye).set(hx + 1, hy - 1, BO.eye).set(hx, hy, BO.eye);
  } else if (eyes === 'angry') {
    p.rect(hx + 1, hy - 2, 2, 2, BO.eye);
    p.line(hx - 1, hy - 5, hx + 3, hy - 3, BO.furSh, 1);
  }

  // chusta na szyi
  p.rect(hx - 6, hy + 7, 13, 2, BO.band);
  p.rect(hx - 6, hy + 9, 13, 1, BO.bandSh);

  if (guard) {
    // młot trzymany poziomo jak zasłona
    const gy = by - 2;
    p.line(X - 2, gy + 1, X + 20, gy + 1, BO.woodSh, 2);
    p.line(X - 2, gy, X + 20, gy, BO.wood, 1);
    p.rect(X + 17, gy - 6, 8, 13, BO.ironSh).rect(X + 17, gy - 6, 6, 12, BO.iron).rect(X + 18, gy - 5, 2, 4, BO.ironHi);
    if (guard === 2) p.rect(X + 20, gy - 8, 1, 2, WHITE).rect(X + 24, gy - 7, 2, 1, WHITE);
    p.disc(X + 4, gy + 1, 2.2, 2.4, BO.furSh).disc(X + 12, gy + 1, 2.2, 2.4, BO.furSh);
  } else {
    // przednia łapa trzymająca trzonek
    if (front) drawHammer(p, handX, handY, hammer);
    if (handUp) p.line(bx + 6, by - 4, handX - 1, handY, BO.furSh, 3);
    p.disc(handX - 1, handY, 3, 3.6, BO.furSh);
    p.disc(handX - 1.4, handY - 0.4, 2.4, 3, BO.fur);
  }

  if (impact) {
    // gwiazdki uderzenia przy obuchu
    const [ix, iy] = polar(handX, handY, hammer, 19);
    for (let i = 0; i < 6; i++) {
      const [sx, sy] = polar(ix, iy, i * 60 + impact * 20, 5 + impact * 2);
      p.rect(Math.round(sx), Math.round(sy), 2, 2, i % 2 ? WHITE : IS.flameY);
    }
  }
  return p;
}

sheet('borek-idle', 'party', 5, true, [
  finish(drawBorek({ bob: 0 })),
  finish(drawBorek({ bob: 0, hammer: -79 })),
  finish(drawBorek({ bob: 1, hammer: -80 })),
  finish(drawBorek({ bob: 1, hammer: -79 })),
], [24, 54]);
sheet('borek-attack', 'party', 12, false, [
  finish(drawBorek({ dx: -1, lean: -1, hammer: -92, handUp: 8, front: 1, eyes: 'angry' })),
  finish(drawBorek({ dx: -2, lean: -2, dy: -1, hammer: -112, handUp: 12, front: 1, eyes: 'angry', mouth: 1 })),
  finish(drawBorek({ dx: 3, lean: 1, dy: -2, hammer: -48, handUp: 6, front: 1, eyes: 'angry', mouth: 1 })),
  finish(drawBorek({ dx: 7, lean: 3, hammer: 16, front: 1, eyes: 'angry', mouth: 1, impact: 1 })),
  finish(drawBorek({ dx: 7, lean: 3, hammer: 20, front: 1, eyes: 'angry', impact: 2 })),
  finish(drawBorek({ dx: 3, lean: 1, hammer: -34, front: 1 })),
], [24, 54]);
sheet('borek-hurt', 'party', 10, false, [
  finish(drawBorek({ dx: -2, lean: -2, eyes: 'hurt', mouth: 1, hammer: -95 }), 0.8),
  finish(drawBorek({ dx: -4, lean: -3, eyes: 'hurt', mouth: 1, hammer: -100 })),
  finish(drawBorek({ dx: -2, lean: -1, eyes: 'hurt', hammer: -88 })),
], [24, 54]);
sheet('borek-defend', 'party', 6, true, [
  finish(drawBorek({ crouch: 1, guard: 1, eyes: 'angry' })),
  finish(drawBorek({ crouch: 1, guard: 2, eyes: 'angry' })),
  finish(drawBorek({ crouch: 2, guard: 1, eyes: 'angry' })),
], [24, 54]);

// ============================================================================================
//  LUMI — ćma-czarodziejka z latarenką
// ============================================================================================
const LU = {
  body: '#b79df0', bodySh: '#8468cc', head: '#d2c0ff', headSh: '#a48be6', fluff: '#f8f3ff', fluffSh: '#cdbfee',
  eye: '#2a1f4a', cheek: '#ff9ad5', wing: '#ff9ad5', wingSh: '#cf5fa6', wingHi: '#ffd3ee', spot: '#fff1a8',
  ant: '#8468cc', staff: '#96744e', staffSh: '#634a33', lamp: '#fff7c9', lampGlow: '#ffd77a', lampFrame: '#6b5a8a', foot: '#5a468f',
};

function drawLantern(p, x, y, glow = 0, burst = 0) {
  // poświata
  if (glow) {
    const r = 4 + glow;
    for (let a = 0; a < 360; a += 45) {
      const [gx, gy] = polar(x, y, a + glow * 22, r);
      p.set(gx, gy, LU.lampGlow);
    }
  }
  if (burst) {
    for (let a = 0; a < 360; a += 45) {
      const [ax, ay] = polar(x, y, a, 3 + burst);
      const [bx, by] = polar(x, y, a, 5 + burst * 3);
      p.line(ax, ay, bx, by, a % 90 === 0 ? WHITE : LU.lampGlow, 1);
    }
  }
  p.rect(x - 2, y - 3, 5, 7, LU.lampFrame);
  p.rect(x - 1, y - 2, 3, 5, LU.lampGlow);
  p.rect(x, y - 1, 1, 3, LU.lamp);
  p.rect(x - 1, y - 4, 3, 1, LU.lampFrame);
  p.set(x, y - 5, LU.lampFrame);
}

function drawWings(p, X, G, w, front = false) {
  if (!front) {
    // skrzydła za plecami
    p.poly([[X - 2, G - 18], [X - 13 - w, G - 29 + w * 2], [X - 18 - w, G - 23 + w * 2], [X - 16 - w, G - 15 + w], [X - 8, G - 11]], LU.wingSh);
    p.poly([[X - 3, G - 18], [X - 12 - w, G - 27 + w * 2], [X - 16 - w, G - 22 + w * 2], [X - 14 - w, G - 16 + w], [X - 8, G - 13]], LU.wing);
    p.disc(X - 12 - w, G - 21 + w * 1.5, 2, 2, LU.spot);
    p.set(X - 12 - w, G - 21 + Math.round(w * 1.5), LU.wingSh);
    p.poly([[X - 3, G - 13], [X - 13 - w, G - 10], [X - 13 - w * 0.5, G - 4 - w], [X - 6, G - 5]], LU.wingSh);
    p.poly([[X - 3, G - 12], [X - 11 - w, G - 9], [X - 11 - w * 0.5, G - 5 - w], [X - 6, G - 6]], LU.wing);
    p.set(X - 9 - w, G - 8, LU.wingHi);
  } else {
    // skrzydła złożone z przodu jak tarcza
    p.poly([[X + 1, G - 20], [X + 11, G - 24], [X + 14, G - 14], [X + 11, G - 4], [X + 2, G - 3], [X + 5, G - 12]], LU.wingSh);
    p.poly([[X + 2, G - 19], [X + 10, G - 22], [X + 12, G - 14], [X + 10, G - 6], [X + 4, G - 5], [X + 6, G - 12]], LU.wing);
    p.disc(X + 8, G - 16, 2, 2, LU.spot);
    p.set(X + 8, G - 16, LU.wingSh);
    p.disc(X + 8, G - 9, 1.5, 1.5, LU.wingHi);
  }
}

function drawLumi(o = {}) {
  const p = new Px(64, 52);
  const { dx = 0, dy = 0, bob = 0, lean = 0, wing = 0, eyes = 'open', glow = 0, burst = 0, staffDeg = -90, staffDx = 0, fold = 0, crouch = 0 } = o;
  const X = 22 + dx, G = 49 + dy;
  const by = G - 9 + bob + crouch;
  const hx = X + lean, hy = G - 23 + bob + crouch;

  if (!fold) drawWings(p, X, G + bob + crouch, wing, false);

  // stopy
  p.rect(X - 3, G - 2, 2, 2, LU.foot).rect(X + 1, G - 2, 2, 2, LU.foot);

  // tułów
  p.disc(X + lean * 0.4, by, 5.6, 7, LU.bodySh);
  p.disc(X + lean * 0.4 - 0.5, by - 0.5, 4.8, 6.2, LU.body);

  // laska z latarenką
  const sx = X + 11 + staffDx, sy = G - 1 + (fold ? 0 : 0);
  const [tx, ty] = polar(sx, sy, staffDeg, 24);
  p.line(sx, sy, tx, ty, LU.staffSh, 2);
  p.line(sx, sy, tx, ty, LU.staff, 1);
  drawLantern(p, Math.round(tx), Math.round(ty) - 2, glow, burst);

  // puchata kryza
  p.disc(X + lean * 0.6, hy + 8, 6.6, 3.2, LU.fluffSh);
  p.disc(X + lean * 0.6, hy + 7.4, 6.1, 2.7, LU.fluff);

  // czułki
  p.line(hx - 2, hy - 6, hx - 5, hy - 11, LU.ant, 1).line(hx - 5, hy - 11, hx - 8, hy - 12, LU.ant, 1);
  p.set(hx - 6, hy - 10, LU.ant).set(hx - 4, hy - 12, LU.ant).set(hx - 8, hy - 13, LU.wing);
  p.line(hx + 2, hy - 6, hx + 4, hy - 11, LU.ant, 1).line(hx + 4, hy - 11, hx + 7, hy - 13, LU.ant, 1);
  p.set(hx + 3, hy - 12, LU.ant).set(hx + 6, hy - 11, LU.ant).set(hx + 7, hy - 14, LU.wing);

  // głowa
  p.disc(hx, hy, 8, 7, LU.headSh);
  p.disc(hx - 0.5, hy - 0.6, 7.3, 6.2, LU.head);
  p.disc(hx - 3, hy - 3.6, 2.2, 1.2, LU.fluff);
  // oczy
  if (eyes === 'open') {
    p.disc(hx + 1.5, hy + 0.5, 2, 2.7, LU.eye).disc(hx + 6, hy + 0.5, 1.5, 2.5, LU.eye);
    p.set(hx + 1, hy - 1, WHITE).set(hx + 6, hy - 1, WHITE);
  } else if (eyes === 'blink') {
    p.rect(hx, hy + 1, 4, 1, LU.eye).rect(hx + 5, hy + 1, 3, 1, LU.eye);
  } else if (eyes === 'hurt') {
    p.set(hx, hy - 1, LU.eye).set(hx + 1, hy, LU.eye).set(hx + 2, hy + 1, LU.eye).set(hx + 1, hy + 2, LU.eye).set(hx, hy + 3, LU.eye);
    p.set(hx + 7, hy - 1, LU.eye).set(hx + 6, hy, LU.eye).set(hx + 5, hy + 1, LU.eye).set(hx + 6, hy + 2, LU.eye).set(hx + 7, hy + 3, LU.eye);
  } else if (eyes === 'focus') {
    p.rect(hx, hy, 4, 2, LU.eye).rect(hx + 5, hy, 3, 2, LU.eye);
  }
  p.set(hx + 3, hy + 4, LU.cheek).set(hx + 4, hy + 4, LU.cheek);

  // rączka na lasce
  const hax = Math.round(sx + (tx - sx) * 0.42), hay = Math.round(sy + (ty - sy) * 0.42);
  p.line(X + 3 + lean * 0.4, by - 2, hax, hay, LU.bodySh, 2);
  p.rect(hax - 1, hay - 1, 3, 3, LU.body);

  if (fold) drawWings(p, X, G + crouch, 0, true);
  return p;
}

sheet('lumi-idle', 'party', 6, true, [
  finish(drawLumi({ bob: 0, wing: 0, glow: 1 })),
  finish(drawLumi({ bob: 0, wing: 1, glow: 2 })),
  finish(drawLumi({ bob: 1, wing: 2, glow: 1 })),
  finish(drawLumi({ bob: 1, wing: 1, glow: 2, eyes: 'blink' })),
], [22, 50]);
sheet('lumi-attack', 'party', 12, false, [
  finish(drawLumi({ dx: -1, lean: -1, staffDeg: -100, eyes: 'focus', wing: 1 })),
  finish(drawLumi({ dx: -1, lean: -1, dy: -1, staffDeg: -108, eyes: 'focus', wing: 2, glow: 2 })),
  finish(drawLumi({ dx: 3, lean: 1, staffDeg: -62, staffDx: 1, eyes: 'focus', wing: 0, burst: 1 })),
  finish(drawLumi({ dx: 5, lean: 2, staffDeg: -50, staffDx: 2, eyes: 'focus', wing: -1, burst: 2 })),
  finish(drawLumi({ dx: 4, lean: 1, staffDeg: -55, staffDx: 2, eyes: 'open', wing: 0, burst: 3 })),
  finish(drawLumi({ dx: 1, lean: 0, staffDeg: -80, wing: 1, glow: 1 })),
], [22, 50]);
sheet('lumi-hurt', 'party', 10, false, [
  finish(drawLumi({ dx: -2, lean: -2, eyes: 'hurt', wing: -2, staffDeg: -78 }), 0.8),
  finish(drawLumi({ dx: -4, lean: -3, eyes: 'hurt', wing: -2, staffDeg: -74 })),
  finish(drawLumi({ dx: -2, lean: -1, eyes: 'hurt', wing: -1, staffDeg: -84 })),
], [22, 50]);
sheet('lumi-defend', 'party', 6, true, [
  finish(drawLumi({ crouch: 1, fold: 1, eyes: 'focus', glow: 1 })),
  finish(drawLumi({ crouch: 1, fold: 1, eyes: 'focus', glow: 2 })),
  finish(drawLumi({ crouch: 2, fold: 1, eyes: 'blink', glow: 1 })),
], [22, 50]);

// ============================================================================================
//  BUDZIKOT — koci budzik
// ============================================================================================
const BU = {
  brass: '#e8b93c', brassSh: '#aa7a1c', brassHi: '#fff0a8', face: '#fff3d6', faceSh: '#e6cf9f', ink: '#3a2a4a',
  nose: '#ff7aa8', tailA: '#f08a3c', tailB: '#ffd9a0', foot: '#8a5a1c', bell: '#f6cf55', bellSh: '#c08f25',
};

function drawBudzikot(o = {}) {
  const p = new Px(56, 56);
  const { dx = 0, dy = 0, minute = -90, hour = 150, tail = 0, jig = 0, eyes = 'open', strike = 0, ring = 0, squash = 0 } = o;
  const X = 27 + dx, Y = 36 + dy;

  // ogon (za korpusem, po prawej)
  const tailPts = [[X + 10, Y + 9], [X + 16, Y + 8], [X + 20 + tail, Y + 3], [X + 21 + tail * 1.5, Y - 4], [X + 19 + tail * 2, Y - 9]];
  for (let i = 0; i + 1 < tailPts.length; i++) {
    const [ax, ay] = tailPts[i];
    const [bx, by] = tailPts[i + 1];
    p.line(ax, ay, bx, by, i % 2 ? BU.tailB : BU.tailA, 3);
  }
  p.disc(X + 19 + tail * 2, Y - 10, 2.2, 2.2, BU.tailB);

  // nóżki
  p.disc(X - 7, Y + 14, 3.2, 2.2, BU.foot).disc(X + 7, Y + 14, 3.2, 2.2, BU.foot);

  // dzwonki (uszy)
  const bj = jig;
  for (const s of [-1, 1]) {
    const bx = X + s * 10 + (ring ? s * ring : 0), by = Y - 14 + bj;
    p.rect(bx - 1, by + 3, 2, 4, BU.brassSh);
    p.disc(bx, by, 5.6, 5, BU.bellSh);
    p.disc(bx - 0.5, by - 0.6, 4.8, 4.2, BU.bell);
    p.disc(bx - 2, by - 2.4, 1.6, 1, BU.brassHi);
  }
  // młoteczek między dzwonkami
  p.line(X, Y - 11, X + strike * 3, Y - 18 + bj, BU.ink, 1);
  p.disc(X + strike * 4, Y - 19 + bj, 1.8, 1.8, BU.brassSh);

  // korpus
  const ry = 13.6 - squash, rx = 13.6 + squash;
  p.disc(X, Y, rx, ry, BU.brassSh);
  p.disc(X - 0.4, Y - 0.4, rx - 0.8, ry - 0.8, BU.brass);
  p.disc(X - 6, Y - 9, 3, 1.4, BU.brassHi);
  p.disc(X, Y, rx - 3, ry - 3, BU.faceSh);
  p.disc(X - 0.3, Y - 0.3, rx - 3.5, ry - 3.5, BU.face);

  // podziałka
  p.rect(X - 0, Y - 10 + squash, 1, 2, BU.ink).rect(X - 0, Y + 8 - squash, 1, 2, BU.ink);
  p.rect(X - 10 - squash, Y, 2, 1, BU.ink).rect(X + 9 + squash, Y, 2, 1, BU.ink);

  // wskazówki
  const [mx, my] = polar(X, Y + 1, minute, 8);
  const [hx_, hy_] = polar(X, Y + 1, hour, 5);
  p.line(X, Y + 1, mx, my, BU.ink, 1);
  p.line(X, Y + 1, hx_, hy_, BU.ink, 2);

  // oczy
  if (eyes === 'open') {
    p.rect(X - 6, Y - 5, 2, 4, BU.ink).rect(X + 4, Y - 5, 2, 4, BU.ink);
    p.set(X - 6, Y - 5, WHITE).set(X + 4, Y - 5, WHITE);
  } else if (eyes === 'blink' || eyes === 'sleepy') {
    p.rect(X - 7, Y - 3, 4, 1, BU.ink).rect(X + 3, Y - 3, 4, 1, BU.ink);
  } else if (eyes === 'hurt') {
    p.set(X - 7, Y - 5, BU.ink).set(X - 6, Y - 4, BU.ink).set(X - 5, Y - 3, BU.ink).set(X - 6, Y - 2, BU.ink).set(X - 7, Y - 1, BU.ink);
    p.set(X + 6, Y - 5, BU.ink).set(X + 5, Y - 4, BU.ink).set(X + 4, Y - 3, BU.ink).set(X + 5, Y - 2, BU.ink).set(X + 6, Y - 1, BU.ink);
  } else if (eyes === 'angry') {
    p.rect(X - 6, Y - 4, 2, 3, BU.ink).rect(X + 4, Y - 4, 2, 3, BU.ink);
    p.line(X - 8, Y - 7, X - 4, Y - 5, BU.ink, 1).line(X + 7, Y - 7, X + 3, Y - 5, BU.ink, 1);
  }
  // nosek (oś wskazówek) i pyszczek
  p.rect(X - 1, Y, 2, 2, BU.nose);
  p.set(X - 2, Y + 3, BU.ink).set(X - 1, Y + 4, BU.ink).set(X, Y + 3, BU.ink).set(X + 1, Y + 4, BU.ink).set(X + 2, Y + 3, BU.ink);
  // wąsy
  p.line(X - 12, Y + 1, X - 17, Y - 1, BU.ink, 1).line(X - 12, Y + 3, X - 17, Y + 4, BU.ink, 1);
  p.line(X + 12, Y + 1, X + 16, Y - 1, BU.ink, 1).line(X + 12, Y + 3, X + 16, Y + 4, BU.ink, 1);

  if (ring) {
    // kreski dzwonienia
    for (const s of [-1, 1]) {
      p.line(X + s * 18, Y - 19, X + s * 21, Y - 22, BU.brassHi, 1);
      p.line(X + s * 19, Y - 14, X + s * 23, Y - 14, BU.brassHi, 1);
      p.line(X + s * 15, Y - 22, X + s * 16, Y - 25, BU.brassHi, 1);
    }
  }
  return p;
}

sheet('budzikot-idle', 'enemy', 5, true, [
  finish(drawBudzikot({ minute: -90, tail: 0 })),
  finish(drawBudzikot({ minute: -60, tail: 1, strike: 0.3 })),
  finish(drawBudzikot({ minute: -30, tail: 2, jig: 1 })),
  finish(drawBudzikot({ minute: 0, tail: 1, eyes: 'blink', strike: -0.3 })),
], [27, 53]);
sheet('budzikot-hurt', 'enemy', 10, false, [
  finish(drawBudzikot({ dx: 2, eyes: 'hurt', minute: 40, hour: 250, tail: -1, squash: 1 }), 0.8),
  finish(drawBudzikot({ dx: 4, eyes: 'hurt', minute: 130, hour: 300, tail: -2, squash: 1.5 })),
  finish(drawBudzikot({ dx: 2, eyes: 'hurt', minute: 220, hour: 20, tail: -1 })),
], [27, 53]);
sheet('budzikot-attack', 'enemy', 12, true, [
  finish(drawBudzikot({ eyes: 'angry', ring: 1, strike: 1, minute: -90, hour: 90, tail: 2 })),
  finish(drawBudzikot({ eyes: 'angry', ring: -1, strike: -1, minute: -90, hour: 90, tail: 1, dy: -1 })),
], [27, 53]);

// ============================================================================================
//  CHMURNIK — naburmuszona chmurka burzowa
// ============================================================================================
const CH = {
  cloud: '#9aa7cc', cloudHi: '#d6def5', cloudSh: '#65719a', ink: '#232842', bolt: '#ffe45c', boltSh: '#e0a22a',
  drop: '#8fd3ff', dropHi: '#e2f5ff', cheek: '#c98bb4',
};

function drawChmurnik(o = {}) {
  const p = new Px(60, 52);
  const { dx = 0, dy = 0, bob = 0, eyes = 'angry', drops = 0, bolt = 0, squash = 0, dark = 0 } = o;
  const X = 30 + dx, Y = 22 + dy + bob;
  const puffs = [
    [-14, 4, 7.5], [-6, -4, 9.5], [6, -2, 8.5], [14, 4, 7], [-6, 7, 8.5], [5, 8, 8.5],
  ];
  const sq = 1 + squash * 0.12, sqy = 1 - squash * 0.12;
  for (const [px_, py_, r] of puffs) p.disc(X + px_ * sq, Y + py_ * sqy + 1.6, r * sq, r * sqy, CH.cloudSh);
  for (const [px_, py_, r] of puffs) p.disc(X + px_ * sq - 0.4, Y + py_ * sqy - 0.2, r * sq - 0.6, r * sqy - 0.8, CH.cloud);
  p.disc(X - 8, Y - 8, 4.5, 2.6, CH.cloudHi).disc(X + 5, Y - 6, 3.6, 2, CH.cloudHi).disc(X - 15, Y + 1, 2.4, 1.6, CH.cloudHi);
  if (dark) p.swap(CH.cloud, '#7c88b3').swap(CH.cloudHi, '#aeb8dc').swap(CH.cloudSh, '#4c567c');

  // twarz
  const fy = Y + 3;
  if (eyes === 'angry') {
    p.rect(X - 8, fy - 1, 3, 3, CH.ink).rect(X + 4, fy - 1, 3, 3, CH.ink);
    p.set(X - 8, fy - 1, WHITE).set(X + 4, fy - 1, WHITE);
    p.line(X - 10, fy - 5, X - 5, fy - 3, CH.ink, 1).line(X - 10, fy - 4, X - 5, fy - 2, CH.ink, 1);
    p.line(X + 8, fy - 5, X + 3, fy - 3, CH.ink, 1).line(X + 8, fy - 4, X + 3, fy - 2, CH.ink, 1);
  } else if (eyes === 'blink') {
    p.rect(X - 9, fy, 4, 1, CH.ink).rect(X + 3, fy, 4, 1, CH.ink);
    p.line(X - 10, fy - 4, X - 5, fy - 2, CH.ink, 1).line(X + 8, fy - 4, X + 3, fy - 2, CH.ink, 1);
  } else if (eyes === 'hurt') {
    p.set(X - 9, fy - 2, CH.ink).set(X - 8, fy - 1, CH.ink).set(X - 7, fy, CH.ink).set(X - 8, fy + 1, CH.ink).set(X - 9, fy + 2, CH.ink);
    p.set(X + 7, fy - 2, CH.ink).set(X + 6, fy - 1, CH.ink).set(X + 5, fy, CH.ink).set(X + 6, fy + 1, CH.ink).set(X + 7, fy + 2, CH.ink);
  }
  // usta (podkówka) i rumieńce
  p.set(X - 3, fy + 6, CH.ink).rect(X - 2, fy + 5, 4, 1, CH.ink).set(X + 2, fy + 6, CH.ink);
  p.rect(X - 12, fy + 3, 2, 1, CH.cheek).rect(X + 9, fy + 3, 2, 1, CH.cheek);

  // krople
  const dropXs = [-11, 0, 11];
  dropXs.forEach((ox, i) => {
    const ph = (drops + i * 2) % 6;
    const yy = Y + 18 + ph * 2;
    if (yy < 50) {
      p.rect(X + ox, yy, 2, 3, CH.drop).set(X + ox, yy - 1, CH.drop).set(X + ox, yy, CH.dropHi);
    }
  });

  if (bolt) {
    const bx = X + 3, byy = Y + 16;
    const pts = [[bx, byy], [bx + 5, byy], [bx + 1, byy + 6], [bx + 5, byy + 6], [bx - 3, byy + 15], [bx - 1, byy + 8], [bx - 5, byy + 8]];
    p.poly(pts, bolt === 2 ? WHITE : CH.bolt);
    p.line(bx - 4, byy + 8, bx - 2, byy + 14, CH.boltSh, 1);
  }
  return p;
}

sheet('chmurnik-idle', 'enemy', 5, true, [
  finish(drawChmurnik({ bob: 0, drops: 0 })),
  finish(drawChmurnik({ bob: 1, drops: 1 })),
  finish(drawChmurnik({ bob: 2, drops: 2, eyes: 'blink' })),
  finish(drawChmurnik({ bob: 1, drops: 3 })),
], [30, 46]);
sheet('chmurnik-hurt', 'enemy', 10, false, [
  finish(drawChmurnik({ dx: 2, eyes: 'hurt', squash: 1 }), 0.8),
  finish(drawChmurnik({ dx: 4, eyes: 'hurt', squash: 2 })),
  finish(drawChmurnik({ dx: 2, eyes: 'hurt', squash: 1 })),
], [30, 46]);
sheet('chmurnik-attack', 'enemy', 10, true, [
  finish(drawChmurnik({ dark: 1, bolt: 1, drops: 1 })),
  finish(drawChmurnik({ dark: 1, bolt: 2, drops: 3, dy: -1 })),
], [30, 46]);

// ============================================================================================
//  SOUL — serduszko gracza
// ============================================================================================
const HEART = ['.##...##.', '####.####', '#########', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'];
function drawSoul(main, hi, sh) {
  const p = new Px(11, 11);
  p.art(1, 1, HEART, { '#': main });
  // połysk i cień
  p.set(2, 2, hi).set(3, 2, hi).set(2, 3, hi);
  p.set(8, 5, sh).set(7, 6, sh).set(6, 7, sh).set(5, 8, sh).set(8, 4, sh);
  return p;
}
sheet('soul', 'soul', 4, true, [drawSoul('#ff2a44', '#ff9aa6', '#c3122c'), drawSoul('#ff4a5e', '#ffc2c9', '#d21f3a')]);

// ============================================================================================
//  POCISKI (wszystkie kierunkowe są zwrócone w prawo — silnik obraca je zgodnie z kierunkiem lotu)
// ============================================================================================
function orb(r, ringC, coreC, hiC) {
  const p = new Px(12, 12);
  p.disc(5.5, 5.5, r + 1, r + 1, ringC);
  p.disc(5.5, 5.5, r, r, coreC);
  p.set(4, 4, hiC).set(5, 4, hiC).set(4, 5, hiC);
  return p;
}
sheet('bullet-orb', 'bullet', 8, true, [orb(3.6, '#7fd8ff', '#ffffff', '#ffffff'), orb(3.2, '#bdeaff', '#ffffff', '#ffffff')]);

function shard(f) {
  const p = new Px(16, 10);
  p.poly([[0, 5], [10, 1], [16, 5], [10, 9]], '#c9c2ff');
  p.poly([[1, 5], [10, 2], [15, 5]], WHITE);
  if (f) p.rect(8, 3, 3, 1, '#fff7c9');
  return p;
}
sheet('bullet-shard', 'bullet', 8, true, [shard(0), shard(1)]);

function drop(f) {
  const p = new Px(14, 8);
  p.poly([[0, 4], [8, 1], [8, 7]], '#8fd3ff');
  p.disc(9.5, 4, 3.6, 3.6, '#8fd3ff');
  p.disc(9.8, 3.6, 2.4, 2.4, '#d9f2ff');
  p.set(11, 3, WHITE);
  if (f) p.set(1, 4, '#d9f2ff').set(3, 4, '#d9f2ff');
  return p;
}
sheet('bullet-drop', 'bullet', 8, true, [drop(0), drop(1)]);

function bolt(f) {
  const p = new Px(30, 12);
  const j = [[0, 6], [7, 2 + f], [12, 8 - f], [20, 3 + (f === 2 ? 1 : 0)], [29, 6]];
  for (let i = 0; i + 1 < j.length; i++) p.line(j[i][0], j[i][1], j[i + 1][0], j[i + 1][1], '#ffe45c', 3);
  for (let i = 0; i + 1 < j.length; i++) p.line(j[i][0], j[i][1], j[i + 1][0], j[i + 1][1], WHITE, 1);
  return p;
}
sheet('bullet-bolt', 'bullet', 16, true, [bolt(0), bolt(1), bolt(2)]);

function star(rot, c1, c2) {
  const p = new Px(15, 15);
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push(polar(7.5, 7.5, rot - 90 + i * 36, i % 2 ? 3 : 7.4));
  p.poly(pts, c1);
  const pts2 = [];
  for (let i = 0; i < 10; i++) pts2.push(polar(7.5, 7.5, rot - 90 + i * 36, i % 2 ? 2 : 5));
  p.poly(pts2, c2);
  return p;
}
sheet('bullet-star', 'bullet', 6, true, [star(0, '#ffe45c', WHITE), star(0, '#fff3a6', WHITE)]);

const ZET = ['#######', '#######', '....##.', '...##..', '..##...', '.##....', '#######', '#######'];
function zet(f) {
  const p = new Px(12, 12);
  p.art(2 + f, 2, ZET, { '#': '#cfe9ff' });
  p.outline('#5b7fd6');
  return p;
}
sheet('bullet-zet', 'bullet', 4, true, [zet(0), zet(1)]);

function cog(rot) {
  const p = new Px(18, 18);
  for (let i = 0; i < 8; i++) {
    const [tx, ty] = polar(9, 9, rot + i * 45, 6.6);
    p.rotRect(tx, ty, 4, 3.4, rot + i * 45, '#d8b24a');
  }
  p.disc(9, 9, 6, 6, '#f6d878');
  p.disc(8.6, 8.6, 4.6, 4.6, '#fff0b8');
  p.disc(9, 9, 2, 2, '#8a6418');
  return p;
}
sheet('bullet-cog', 'bullet', 10, true, [cog(0), cog(22.5)]);

// ============================================================================================
//  IKONY PRZYCISKÓW (białe — silnik barwi je kolorem postaci). Klatka 2 = lekki podskok.
// ============================================================================================
const ICONS = {
  fight: ['.........###', '........####', '.......####.', '......####..', '.....####...', '.#..####....', '.######.....', '..####......', '..#####.....', '.###.##.....', '###.........', '##..........'],
  act: ['............', '.##########.', '############', '############', '###.##.##.##', '###.##.##.##', '############', '.##########.', '...###......', '..###.......', '..##........', '............'],
  magic: ['....#.......', '....#.......', '...###......', '.#######....', '...###......', '....#...#...', '....#..###..', '........#...', '..#.........', '.###.....#..', '..#.........', '............'],
  item: ['....####....', '....#..#....', '.....##.....', '....####....', '...######...', '..##.#####..', '.##.#######.', '.##########.', '.##########.', '.##########.', '..########..', '...######...'],
  spare: ['............', '.###...###..', '#####.#####.', '#####.#####.', '####...####.', '#####.#####.', '.#########..', '..#######...', '...#####....', '....###.....', '.....#......', '............'],
  defend: ['............', '.##########.', '.##########.', '.####..####.', '.####..####.', '.##......##.', '.##......##.', '.####..####.', '..###..###..', '...######...', '....####....', '.....##.....'],
};
for (const [name, rows] of Object.entries(ICONS)) {
  const a = new Px(14, 14).art(1, 1, rows, { '#': WHITE });
  const b = new Px(14, 14).art(1, 0, rows, { '#': WHITE });
  sheet(`icon-${name}`, 'icon', 6, true, [a, b]);
}

// ============================================================================================
//  EFEKTY
// ============================================================================================
function slash(f) {
  const p = new Px(40, 40);
  const cx = 6, cy = 34, r = 26;
  const span = [[-88, -60, 2], [-88, -30, 3], [-88, -4, 4], [-60, -4, 3], [-30, -4, 1]][f];
  const [a0, a1, th] = span;
  for (let a = a0; a <= a1; a += 1) {
    const t = (a - a0) / Math.max(1, a1 - a0);
    const w = Math.max(1, Math.round(th * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1))));
    for (let k = 0; k < w; k++) {
      const [x, y] = polar(cx, cy, a, r - k);
      p.set(x, y, k === 0 ? WHITE : k < w - 1 ? '#fff3a6' : '#ffb347');
    }
  }
  if (f === 4) {
    for (let a = a0; a <= a1; a += 9) {
      const [x, y] = polar(cx, cy, a, r + 3);
      p.set(x, y, '#fff3a6');
    }
  }
  return p;
}
sheet('fx-slash', 'fx', 20, false, [slash(0), slash(1), slash(2), slash(3), slash(4)]);

function hitFx(f) {
  const p = new Px(28, 28);
  const c = 14;
  if (f === 0) {
    p.poly([[c, c - 5], [c + 1.5, c - 1.5], [c + 5, c], [c + 1.5, c + 1.5], [c, c + 5], [c - 1.5, c + 1.5], [c - 5, c], [c - 1.5, c - 1.5]], WHITE);
  } else if (f === 1) {
    const pts = [];
    for (let i = 0; i < 16; i++) pts.push(polar(c, c, i * 22.5, i % 2 ? 4 : 11));
    p.poly(pts, '#ffd34d');
    const pts2 = [];
    for (let i = 0; i < 16; i++) pts2.push(polar(c, c, i * 22.5, i % 2 ? 3 : 8));
    p.poly(pts2, WHITE);
  } else if (f === 2) {
    for (let i = 0; i < 8; i++) {
      const [ax, ay] = polar(c, c, i * 45, 6);
      const [bx, by] = polar(c, c, i * 45, 12);
      p.line(ax, ay, bx, by, i % 2 ? '#ffd34d' : WHITE, 2);
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const [ax, ay] = polar(c, c, i * 45 + 10, 12);
      p.rect(Math.round(ax), Math.round(ay), 2, 2, i % 2 ? '#ffd34d' : WHITE);
    }
  }
  return p;
}
sheet('fx-hit', 'fx', 18, false, [hitFx(0), hitFx(1), hitFx(2), hitFx(3)]);

function plus(p, x, y, s, c) {
  p.rect(x - s, y, s * 2 + 1, 1, c).rect(x, y - s, 1, s * 2 + 1, c);
  if (s > 1) p.rect(x - 1, y - 1, 3, 3, c);
}
function healFx(f) {
  const p = new Px(32, 36);
  const items = [[8, 30, 2, 0], [22, 32, 3, 1], [15, 34, 2, 2], [26, 28, 1, 3], [5, 33, 1, 4]];
  for (const [x, y0, s, ph] of items) {
    const t = f - ph * 0.6;
    if (t < 0 || t > 5) continue;
    const y = y0 - t * 5;
    plus(p, x, Math.round(y), t > 3.5 ? Math.max(1, s - 1) : s, t > 3 ? '#d9ffe6' : '#7dffa8');
  }
  // drobinki
  const r = rng(77 + f);
  for (let i = 0; i < 5; i++) p.set(3 + r() * 26, 6 + r() * 26, '#eafff1');
  return p;
}
sheet('fx-heal', 'fx', 12, false, [0, 1, 2, 3, 4, 5].map(healFx));

function sparkle(f) {
  const p = new Px(13, 13);
  const s = [1, 3, 5, 3][f];
  p.rect(6 - s, 6, s * 2 + 1, 1, WHITE).rect(6, 6 - s, 1, s * 2 + 1, WHITE);
  if (s >= 3) p.rect(5, 5, 3, 3, '#fff3a6').set(6, 6, WHITE);
  if (s >= 5) p.set(4, 4, '#fff3a6').set(8, 4, '#fff3a6').set(4, 8, '#fff3a6').set(8, 8, '#fff3a6');
  return p;
}
sheet('fx-sparkle', 'fx', 12, true, [0, 1, 2, 3].map(sparkle));

// ============================================================================================
//  TŁO — kafel nocnego nieba (do przewijania)
// ============================================================================================
function nightTile() {
  const p = new Px(96, 96);
  p.rect(0, 0, 96, 96, '#0b0c20');
  const r = rng(20261110);
  // delikatne pasy mgławicy (dithering)
  for (let y = 0; y < 96; y++)
    for (let x = 0; x < 96; x++) {
      const v = Math.sin((x + y * 0.6) / 15.28) + Math.sin((x * 0.5 - y) / 15.28);
      if (v > 1.25 && (x + y) % 2 === 0) p.set(x, y, '#12143a');
      else if (v > 0.7 && x % 2 === 0 && y % 2 === 0) p.set(x, y, '#12143a');
    }
  for (let i = 0; i < 46; i++) p.set(Math.floor(r() * 96), Math.floor(r() * 96), i % 3 ? '#2f3470' : '#565cab');
  for (let i = 0; i < 7; i++) {
    const x = 4 + Math.floor(r() * 88), y = 4 + Math.floor(r() * 88);
    p.set(x, y, '#e8e6ff').set(x - 1, y, '#565cab').set(x + 1, y, '#565cab').set(x, y - 1, '#565cab').set(x, y + 1, '#565cab');
  }
  return p;
}
sheet('bg-night', 'bg', 1, true, [nightTile()]);

// ============================================================================================
//  ZAPIS
// ============================================================================================
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DOCS, { recursive: true });
const manifest = {};
for (const s of sheets) {
  const st = strip(s.frames);
  fs.writeFileSync(path.join(OUT, `${s.name}.png`), encodePNG(st.w, st.h, st.d));
  manifest[s.name] = { file: `${s.name}.png`, group: s.group, frameW: s.frames[0].w, frameH: s.frames[0].h, frames: s.frames.length, fps: s.fps, loop: s.loop };
  if (s.origin) {
    manifest[s.name].originX = s.origin[0];
    manifest[s.name].originY = s.origin[1];
  }
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// podgląd wszystkich arkuszy (x3) na ciemnym tle
{
  const K = 3, PAD = 6;
  const list = sheets.filter((s) => s.group !== 'bg').map((s) => strip(s.frames).scaled(K));
  // układamy w kolumnach
  const colW = 760;
  let x = PAD, y = PAD, rowH = 0, W = 0, H = 0;
  const pos = [];
  for (const st of list) {
    if (x + st.w + PAD > colW) {
      x = PAD;
      y += rowH + PAD;
      rowH = 0;
    }
    pos.push([x, y]);
    x += st.w + PAD * 2;
    rowH = Math.max(rowH, st.h);
    W = Math.max(W, x);
    H = Math.max(H, y + st.h + PAD);
  }
  const sheetImg = new Px(W, H);
  sheetImg.rect(0, 0, W, H, mix('#0b0c20', '#1a1c40', 0.5));
  list.forEach((st, i) => sheetImg.blit(st, pos[i][0], pos[i][1]));
  fs.writeFileSync(path.join(DOCS, 'sprites-preview.png'), encodePNG(sheetImg.w, sheetImg.h, sheetImg.d));
}
console.log(`zapisano ${sheets.length} arkuszy do ${path.relative(ROOT, OUT)}`);
