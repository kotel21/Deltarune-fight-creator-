"""
NOCNA ZMIANA: GALERIA MANEKIN  (wersja "PORT" v0.9.1)
Gra horror o przetrwaniu nocnej zmiany w opuszczonym centrum handlowym.

Sterowanie:
  SPACJA            - kamery (lub najedz myszka na pasek na dole)
  Q / E             - lewe / prawe drzwi
  A / D             - lewe / prawe swiatlo
  1-7               - wybor kamery
  Mysz              - klikanie przyciskow, mapy kamer i zamykanie reklam (X)
  ESC               - menu
"""
import json
import math
import os
import random
import sys
import time

import pygame

try:
    import numpy as np
except ImportError:
    np = None

# ---------------------------------------------------------------- stale
LW, LH = 320, 180          # niska rozdzielczosc swiata ("port")
SCALE = 3
SW, SH = LW * SCALE, LH * SCALE
FPS = 60
HOUR = 45.0                # sekund na godzine w grze
SAVE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "zapis.json")

CAMS = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"]
CAM_NAMES = {
    "C1": "Wejście", "C2": "Sklep z ubraniami", "C3": "Fontanna", "C4": "Winda",
    "C5": "Korytarz L", "C6": "Korytarz P", "C7": "Toalety",
}
MAP_RECTS = {
    "C1": (262, 106), "C2": (232, 118), "C3": (262, 124), "C4": (292, 118),
    "C7": (292, 136), "C5": (246, 148), "C6": (278, 148),
}
MAP_W, MAP_H = 15, 9
OFFICE_MAP = (262, 162)

#            marek basia promocja reklamy
NIGHT_AI = {
    1: (3, 0, 0, 0),
    2: (5, 3, 2, 2),
    3: (7, 6, 4, 4),
    4: (10, 9, 7, 6),
    5: (13, 13, 10, 9),
}

MANAGER = {
    1: [
        "Halo halo! Witamy w Galeria Manekin, nowy ochroniarz!",
        "Ta wersja gra jest port na komputer. Przepraszamy za błędy i reklamy.",
        "Manekiny czasem chodzą w nocy. To normalne. Gwarancja nie obejmuje.",
        "Jak manekin przyjdzie do drzwi - zamknij drzwi. Światło pokazuje kto stoi.",
        "Prąd jest ograniczony. Nie marnuj. Oceń nas na 5 gwiazdek. Pa!",
    ],
    2: [
        "Noc 2! Basia też się obudziła. Ona chodzi prawą stroną, przez toalety.",
        "Aplikacja ma teraz reklamy. Zamykaj je szybko X-em. Nie patrz im w oczy.",
        "Pan Promocja mieszka w windzie (kamera 4). On nie lubi być nie oglądany.",
        "Jak winda zrobi DING - zamknij lewe drzwi. Szybko.",
    ],
    3: [
        "Noc 3. Ciekawostka: Marek rusza się tylko gdy NIE patrzysz na niego.",
        "Basia jest odwrotnie. Jej wszystko jedno. Hehe.",
        "Pamiętaj: zamknięte drzwi = dużo prądu. Otwarte drzwi = mało ochroniarza.",
    ],
    4: [
        "Noc 4. Ktoś zgłosił, że widział mnie w windzie w nocy.",
        "To nie byłem ja. Ja nie mam już nóg. To znaczy... nie ważne.",
        "Zaktualizowaliśmy reklamy. Teraz są szybsze. Przepraszamy.",
    ],
    5: [
        "Noc 5. [wiadomość uszkodzona] ... nie wychodź z biura ...",
        "... 99% ... 99% ... 99% ... ładowanie manekina ...",
        "... oni są już blisko ... oceń nas ... na 5 ...",
    ],
}

TIPS = [
    "Porada: Manekiny nie lubią zamkniętych drzwi.",
    "Porada: Oceń nas na 5 gwiazdek *****",
    "Porada: Ta gra była zoptymalizowana na telefon Nokia.",
    "Porada: Reklamy można zamknąć. Prawie zawsze.",
    "Porada: Jeśli słyszysz DING - już jest za późno. Albo nie.",
]


def lerp(a, b, t):
    return a + (b - a) * t


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


# ---------------------------------------------------------------- dzwieki
class Synth:
    def __init__(self):
        self.ok = False
        self.loops = {}
        if np is None:
            return
        try:
            pygame.mixer.init(22050, -16, 2, 512)
            self.rate, _, self.channels = pygame.mixer.get_init()
            pygame.mixer.set_num_channels(24)
        except pygame.error:
            return
        self.ok = True
        r = self.rate
        rng = np.random.default_rng(11)
        T = lambda d: np.arange(int(r * d)) / r

        def env(n, a=0.005, rel=0.2):
            e = np.ones(n)
            a, rel = max(1, int(a * r)), max(1, int(rel * r))
            e[:a] = np.linspace(0, 1, a)
            e[-rel:] *= np.linspace(1, 0, rel)
            return e

        def lowpass(x, k):
            return np.convolve(x, np.ones(k) / k, mode="same")

        def square(f, t):
            return np.sign(np.sin(2 * np.pi * f * t))

        s = {}
        t = T(4)
        s["fan"] = lowpass(rng.standard_normal(len(t)), 40) * 1.4 + 0.15 * np.sin(2 * np.pi * 120 * t)
        t = T(2)
        s["buzz"] = 0.25 * square(60, t) * (0.6 + 0.4 * np.sin(2 * np.pi * 7 * t)) + 0.1 * rng.standard_normal(len(t))
        s["static"] = rng.standard_normal(int(r * 2)) * 0.45
        t = T(0.5)
        s["door"] = (lowpass(rng.standard_normal(len(t)), 6) * np.exp(-t * 12) * 1.2
                     + 0.6 * np.sin(2 * np.pi * 70 * t) * np.exp(-t * 9)
                     + 0.3 * np.sin(2 * np.pi * 410 * t) * np.exp(-t * 15))
        t = T(0.05)
        s["blip"] = 0.35 * square(1300, t) * env(len(t), 0.001, 0.02)
        t = T(0.25)
        s["step"] = lowpass(rng.standard_normal(len(t)), 25) * np.exp(-t * 30) * 2.5
        knock = np.zeros(int(r * 1.0))
        for k in (0.0, 0.25, 0.5):
            n = int(r * 0.12)
            tt = np.arange(n) / r
            i = int(k * r)
            knock[i:i + n] += np.sin(2 * np.pi * 95 * tt) * np.exp(-tt * 35) + lowpass(rng.standard_normal(n), 4) * np.exp(-tt * 50) * 0.6
        s["knock"] = knock
        t = T(1.6)
        s["ding"] = (np.sin(2 * np.pi * 1047 * t) * np.exp(-t * 3) * (t < 0.6)
                     + np.sin(2 * np.pi * 784 * (t - 0.4)) * np.exp(-np.maximum(0, t - 0.4) * 3) * (t >= 0.4)) * 0.6
        run = np.zeros(int(r * 2.0))
        for k in range(10):
            n = int(r * 0.1)
            tt = np.arange(n) / r
            i = int(k * 0.19 * r)
            run[i:i + n] += lowpass(rng.standard_normal(n), 20) * np.exp(-tt * 40) * (1.5 + k * 0.25)
        s["run"] = run
        t = T(1.5)
        f = 950 - 450 * t + 140 * np.sin(2 * np.pi * 27 * t)
        saw = 2 * ((np.cumsum(f) / r) % 1.0) - 1
        s["scream"] = np.clip((0.7 * saw + 0.55 * rng.standard_normal(len(t))) * env(len(t), 0.002, 0.4) * 1.5, -1, 1)
        t = T(0.7)
        s["sting"] = (np.sin(2 * np.pi * 233 * t) + np.sin(2 * np.pi * 247 * t) + 0.5 * np.sin(2 * np.pi * 466 * t)) * env(len(t), 0.01, 0.5) * 0.3
        # dzwony o 6:00
        chime = np.zeros(int(r * 4.0))
        for k, fr in enumerate((659, 523, 587, 392, 392, 587, 659, 523)):
            n = int(r * 1.2)
            tt = np.arange(n) / r
            i = int(k * 0.42 * r)
            seg = (np.sin(2 * np.pi * fr * tt) + 0.4 * np.sin(2 * np.pi * fr * 2.01 * tt)) * np.exp(-tt * 3)
            chime[i:i + n] += seg[:len(chime) - i]
        s["chime"] = chime * 0.35
        # tandetny dzingiel reklamy
        jingle = np.zeros(int(r * 1.3))
        for k, fr in enumerate((523, 659, 784, 1047, 784, 1047)):
            n = int(r * 0.18)
            tt = np.arange(n) / r
            i = int(k * 0.2 * r)
            jingle[i:i + n] += square(fr, tt) * env(n, 0.005, 0.05) * 0.18
        s["jingle"] = jingle
        # pozytywka (brak pradu)
        box = np.zeros(int(r * 6.0))
        notes = (784, 659, 523, 659, 784, 784, 784, 0, 698, 698, 698, 0, 784, 880, 880)
        for k, fr in enumerate(notes):
            if fr == 0:
                continue
            n = int(r * 0.6)
            tt = np.arange(n) / r
            i = int(k * 0.38 * r)
            seg = (2 * np.abs(2 * ((fr * tt) % 1) - 1) - 1) * np.exp(-tt * 5)
            box[i:i + n] += seg[:len(box) - i]
        s["musicbox"] = box * 0.3
        t = T(1.2)
        s["powerdown"] = np.sin(2 * np.pi * np.cumsum(400 * np.exp(-t * 3) + 30) / r) * env(len(t), 0.01, 0.4) * 0.6
        for i, fr in enumerate((420, 520, 610)):
            t = T(0.045)
            s[f"voice{i}"] = square(fr, t) * env(len(t), 0.002, 0.02) * 0.12
        t = T(0.3)
        s["bang"] = lowpass(rng.standard_normal(len(t)), 3) * np.exp(-t * 14) * 1.3 + np.sin(2 * np.pi * 55 * t) * np.exp(-t * 10)
        t = T(0.15)
        s["click"] = square(200, t) * np.exp(-t * 60) * 0.4

        self.snd = {k: self._make(v) for k, v in s.items()}

    def _make(self, mono):
        data = (np.clip(mono, -1, 1) * 30000).astype(np.int16)
        if self.channels == 2:
            data = np.column_stack([data, data])
        return pygame.sndarray.make_sound(np.ascontiguousarray(data))

    def play(self, name, vol=1.0):
        if not self.ok:
            return None
        ch = self.snd[name].play()
        if ch:
            ch.set_volume(vol)
        return ch

    def loop(self, name, vol):
        """Petla - wlacza/ustawia glosnosc; vol=0 zatrzymuje."""
        if not self.ok:
            return
        ch = self.loops.get(name)
        if vol <= 0:
            if ch:
                ch.stop()
                self.loops.pop(name, None)
            return
        if ch is None or not ch.get_busy():
            ch = self.snd[name].play(loops=-1)
            self.loops[name] = ch
        if ch:
            ch.set_volume(vol)

    def stop_all(self):
        if self.ok:
            pygame.mixer.stop()
            self.loops.clear()


# ---------------------------------------------------------------- rysowanie postaci
def draw_mannequin(s, cx, by, h, kind, t, light=1.0, angry=False):
    skin = shade((205, 190, 165) if kind == "marek" else (220, 198, 178), light)
    dark = shade((60, 55, 50), light)
    w = max(1, int(h * 0.05))
    hr = max(2, int(h * 0.1))
    hy = by - h + hr
    sy = hy + hr + h * 0.05
    hip = sy + h * 0.33
    sway = math.sin(t * 1.3 + cx) * h * 0.01
    # stojak
    pygame.draw.line(s, dark, (cx, hip), (cx, by), max(1, w // 2))
    pygame.draw.line(s, dark, (cx - h * 0.12, by), (cx + h * 0.12, by), max(1, w // 2))
    # nogi
    pygame.draw.line(s, skin, (cx - h * 0.05, hip), (cx - h * 0.07, by - h * 0.03), w + 1)
    pygame.draw.line(s, skin, (cx + h * 0.05, hip), (cx + h * 0.07, by - h * 0.03), w + 1)
    # tulow
    body_col = skin if kind == "marek" else shade((150, 40, 60), light)
    pygame.draw.polygon(s, body_col, [(cx - h * 0.14, sy), (cx + h * 0.14, sy),
                                      (cx + h * 0.09, hip), (cx - h * 0.09, hip)])
    # rece
    reach = h * (0.25 if angry else 0.0)
    for side in (-1, 1):
        x0 = cx + side * h * 0.14
        pygame.draw.line(s, skin, (x0, sy + 1), (x0 + side * h * 0.05 + sway, sy + h * 0.3 - reach), w)
    # szyja + glowa
    pygame.draw.line(s, skin, (cx, sy), (cx, hy + hr), w)
    if kind == "basia":
        hair = shade((150, 30, 20), light)
        pygame.draw.circle(s, hair, (int(cx), int(hy - 1)), hr + 2)
        pygame.draw.rect(s, hair, (cx - hr - 2, hy, hr * 2 + 4, hr * 1.6))
    pygame.draw.circle(s, skin, (int(cx + sway), int(hy)), hr)
    ex = max(1, hr // 3)
    if angry:
        for side in (-1, 1):
            pygame.draw.circle(s, (0, 0, 0), (int(cx + sway + side * ex), int(hy - 1)), max(1, hr // 3))
        pygame.draw.circle(s, (0, 0, 0), (int(cx + sway), int(hy + hr * 0.5)), max(1, hr // 3))
    elif kind == "basia":
        pygame.draw.line(s, shade((180, 0, 30), light), (cx + sway - hr * 0.5, hy + hr * 0.4),
                         (cx + sway + hr * 0.5, hy + hr * 0.4), max(1, hr // 4))
        for side in (-1, 1):
            pygame.draw.line(s, (20, 20, 20), (cx + sway + side * ex - 1, hy - 1), (cx + sway + side * ex + 1, hy - 1))
    else:
        pygame.draw.line(s, shade((170, 155, 135), light), (cx + sway, hy - hr + 1), (cx + sway, hy + hr - 1))


def draw_promo(s, cx, by, h, t, light=1.0, peek=1.0):
    """Pan Promocja - maskotka-naklejka promocyjna."""
    suit = shade((90, 40, 120), light)
    yel = shade((240, 200, 40), light)
    hr = h * 0.2
    hy = by - h + hr
    w = max(1, int(h * 0.06))
    sy = hy + hr * 0.8
    pygame.draw.rect(s, suit, (cx - h * 0.13, sy, h * 0.26, h * 0.4))
    pygame.draw.line(s, suit, (cx - h * 0.07, sy + h * 0.4), (cx - h * 0.09, by), w + 1)
    pygame.draw.line(s, suit, (cx + h * 0.07, sy + h * 0.4), (cx + h * 0.09, by), w + 1)
    for side in (-1, 1):
        hx = cx + side * h * 0.25
        hy2 = sy + h * 0.15 + math.sin(t * 5 + side) * 2
        pygame.draw.line(s, suit, (cx + side * h * 0.13, sy + 2), (hx, hy2), w)
        pygame.draw.circle(s, shade((240, 240, 240), light), (int(hx), int(hy2)), max(1, int(h * 0.05)))
    pygame.draw.polygon(s, shade((200, 20, 20), light), [(cx, sy + 2), (cx - 4, sy - 1), (cx - 4, sy + 5),
                                                         (cx + 4, sy - 1), (cx + 4, sy + 5)])
    draw_star(s, cx, hy, hr, yel, t)
    # twarz
    er = max(1, int(hr * 0.22))
    for side in (-1, 1):
        pygame.draw.circle(s, (0, 0, 0), (int(cx + side * hr * 0.35), int(hy - hr * 0.2)), er)
        pygame.draw.circle(s, (255, 255, 255), (int(cx + side * hr * 0.35), int(hy - hr * 0.2)), max(1, er // 2))
    mouth = pygame.Rect(0, 0, hr * 1.2, hr * 0.6)
    mouth.center = (cx, hy + hr * 0.35)
    pygame.draw.ellipse(s, (20, 0, 0), mouth)
    if mouth.w > 6:
        for i in range(5):
            x = mouth.x + mouth.w * (i + 0.5) / 5
            pygame.draw.line(s, (240, 240, 230), (x, mouth.y + 1), (x, mouth.y + max(2, mouth.h * 0.35)))


def draw_star(s, cx, cy, r, col, t, spikes=12):
    pts = []
    for i in range(spikes * 2):
        a = i / (spikes * 2) * math.tau + t * 0.3
        rr = r if i % 2 == 0 else r * 0.78
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    pygame.draw.polygon(s, col, pts)


def draw_face(s, kind, t, rng):
    """Twarz do jumpscare'a - wypelnia ekran (niska rozdzielczosc)."""
    k = 1 + t * 1.4
    cx = LW / 2 + rng.uniform(-6, 6)
    cy = LH / 2 + 10 + rng.uniform(-6, 6)
    if kind in ("marek", "basia"):
        skin = (215, 198, 172)
        if kind == "basia":
            pygame.draw.ellipse(s, (150, 30, 20), (cx - 85 * k, cy - 110 * k, 170 * k, 230 * k))
        pygame.draw.ellipse(s, skin, (cx - 65 * k, cy - 85 * k, 130 * k, 175 * k))
        for side in (-1, 1):
            pygame.draw.ellipse(s, (0, 0, 0), (cx + side * 26 * k - 14 * k, cy - 35 * k, 28 * k, 20 * k))
            pygame.draw.circle(s, (255, 255, 255), (int(cx + side * 26 * k), int(cy - 25 * k)), max(1, int(2 * k)))
        mouth = pygame.Rect(0, 0, 80 * k, 60 * k)
        mouth.center = (cx, cy + 40 * k)
        pygame.draw.ellipse(s, (10, 0, 0), mouth)
        if kind == "basia":
            pygame.draw.ellipse(s, (190, 0, 30), mouth.inflate(8 * k, 8 * k), max(2, int(4 * k)))
    elif kind == "promo":
        draw_star(s, cx, cy, 90 * k, (240, 200, 40), t * 4, 14)
        for side in (-1, 1):
            pygame.draw.circle(s, (0, 0, 0), (int(cx + side * 30 * k), int(cy - 25 * k)), int(16 * k))
            pygame.draw.circle(s, (255, 30, 30), (int(cx + side * 30 * k), int(cy - 25 * k)), max(1, int(5 * k)))
        mouth = pygame.Rect(0, 0, 110 * k, 60 * k)
        mouth.center = (cx, cy + 30 * k)
        pygame.draw.ellipse(s, (30, 0, 0), mouth)
        for i in range(9):
            x = mouth.x + mouth.w * (i + 0.5) / 9
            pygame.draw.polygon(s, (240, 235, 220), [(x - 5 * k, mouth.y + 6 * k), (x + 5 * k, mouth.y + 6 * k),
                                                     (x, mouth.y + 22 * k)])
    else:  # reklama
        box = pygame.Rect(0, 0, 200 * k, 140 * k)
        box.center = (cx, cy)
        pygame.draw.rect(s, (230, 230, 230), box)
        pygame.draw.rect(s, (40, 60, 200), (box.x, box.y, box.w, 16 * k))
        for side in (-1, 1):
            pygame.draw.circle(s, (0, 0, 0), (int(cx + side * 35 * k), int(cy - 5 * k)), int(18 * k))
            pygame.draw.circle(s, (255, 0, 0), (int(cx + side * 35 * k), int(cy - 5 * k)), max(1, int(4 * k)))
        pygame.draw.rect(s, (0, 0, 0), (cx - 50 * k, cy + 25 * k, 100 * k, 25 * k))


# ---------------------------------------------------------------- tla kamer
def draw_room(s, cam, t, rng_static):
    s.fill((14, 14, 18))
    floor_y = 120
    if cam in ("C5", "C6"):
        # korytarz w perspektywie
        pygame.draw.polygon(s, (26, 24, 30), [(0, 0), (LW, 0), (200, 60), (120, 60)])
        pygame.draw.polygon(s, (30, 28, 34), [(0, 0), (120, 60), (120, 120), (0, LH)])
        pygame.draw.polygon(s, (30, 28, 34), [(LW, 0), (200, 60), (200, 120), (LW, LH)])
        pygame.draw.polygon(s, (22, 20, 20), [(0, LH), (120, 120), (200, 120), (LW, LH)])
        pygame.draw.rect(s, (8, 8, 10), (120, 60, 80, 60))
        for i in range(6):
            y = 120 + (LH - 120) * (i / 6) ** 1.6
            x0 = lerp(120, 0, (y - 120) / (LH - 120))
            x1 = lerp(200, LW, (y - 120) / (LH - 120))
            pygame.draw.line(s, (30, 28, 28), (x0, y), (x1, y))
        side = 30 if cam == "C5" else 250
        pygame.draw.rect(s, (70, 60, 40), (side, 50, 30, 40))     # plakat
        pygame.draw.circle(s, (120, 110, 90), (side + 15, 63), 7)
        pygame.draw.rect(s, (160, 40, 40), (side + 4, 78, 22, 6))
        lamp = 0.6 + 0.4 * (rng_static.random() > 0.03)
        pygame.draw.rect(s, shade((140, 140, 110), lamp), (145, 4, 30, 3))
    else:
        pygame.draw.rect(s, (24, 22, 28), (0, 0, LW, floor_y))
        pygame.draw.rect(s, (20, 19, 18), (0, floor_y, LW, LH - floor_y))
        for i in range(0, LW, 20):
            pygame.draw.line(s, (28, 26, 25), (i, floor_y), (i - 40 + i * 0.25, LH))
        if cam == "C1":
            for i in range(4):
                pygame.draw.rect(s, (30, 40, 50), (20 + i * 72, 18, 64, 90))
                pygame.draw.rect(s, (50, 60, 70), (20 + i * 72, 18, 64, 90), 1)
            pygame.draw.rect(s, (90, 20, 30), (90, 4, 140, 12))
        elif cam == "C2":
            for x in (30, 230):
                pygame.draw.line(s, (90, 90, 90), (x, 50), (x + 70, 50), 2)
                for k in range(6):
                    c = [(80, 30, 30), (30, 60, 80), (70, 70, 30)][k % 3]
                    pygame.draw.rect(s, c, (x + 4 + k * 11, 52, 8, 30))
            pygame.draw.rect(s, (40, 36, 30), (110, 30, 100, 60))
            pygame.draw.rect(s, (60, 50, 30), (110, 30, 100, 60), 1)
        elif cam == "C3":
            pygame.draw.ellipse(s, (40, 40, 48), (100, 95, 120, 40))
            pygame.draw.ellipse(s, (20, 40, 60), (110, 100, 100, 28))
            pygame.draw.rect(s, (50, 50, 55), (155, 70, 10, 35))
            for k in range(8):
                y = 72 + ((t * 30 + k * 5) % 30)
                pygame.draw.line(s, (60, 90, 120), (160 + (k - 4), 72), (160 + (k - 4) * 3, y))
            for x in (20, 250):
                pygame.draw.rect(s, (45, 35, 25), (x, 110, 50, 8))
        elif cam == "C4":
            pygame.draw.rect(s, (60, 60, 66), (100, 20, 120, 110))
            pygame.draw.rect(s, (40, 40, 44), (100, 20, 120, 110), 2)
            pygame.draw.rect(s, (30, 30, 34), (236, 60, 14, 30))
            pygame.draw.circle(s, (200, 140, 30), (243, 68), 2)
            pygame.draw.circle(s, (80, 80, 80), (243, 80), 2)
            pygame.draw.rect(s, (10, 10, 10), (140, 6, 40, 10))
        elif cam == "C7":
            for i in range(4):
                pygame.draw.rect(s, (50, 70, 70), (30 + i * 50, 30, 44, 90))
                pygame.draw.rect(s, (30, 45, 45), (30 + i * 50, 30, 44, 90), 1)
            pygame.draw.rect(s, (70, 80, 90), (240, 30, 60, 40))
            pygame.draw.rect(s, (40, 40, 40), (240, 30, 60, 40), 2)


# ---------------------------------------------------------------- przeciwnicy
class Walker:
    def __init__(self, name, path, side, ai, interval, retreat):
        self.name = name
        self.path = path
        self.side = side
        self.ai = ai
        self.interval = interval
        self.timer = interval * random.uniform(1.0, 2.0)
        self.i = 0
        self.retreat = retreat
        self.inside = False
        self.seen_at_door = False

    @property
    def loc(self):
        return self.path[self.i]

    @property
    def at_door(self):
        return self.i == len(self.path) - 1


class Night:
    def __init__(self, n, synth, rng):
        self.n = n
        self.synth = synth
        self.rng = rng
        ai = NIGHT_AI[n]
        self.marek = Walker("marek", ["C1", "C2", "C3", "C5", "DL"], "L", ai[0], 4.9, [1, 2])
        self.basia = Walker("basia", ["C1", "C3", "C7", "C6", "DR"], "R", ai[1], 5.3, [1, 2])
        self.walkers = [self.marek, self.basia]
        self.promo_ai = ai[2]
        self.promo_stage = 0
        self.promo_timer = 5.0
        self.promo_run = -1.0
        self.ads_ai = ai[3]
        self.ads = []
        self.ad_timer = 4.0
        self.time = 0.0
        self.power = 100.0
        self.door = {"L": False, "R": False}
        self.door_anim = {"L": 0.0, "R": 0.0}
        self.light = {"L": False, "R": False}
        self.cam_up = False
        self.cam_anim = 0.0
        self.cam = "C1"
        self.cam_static = 0.0
        self.killer = None
        self.kill_delay = -1.0
        self.power_out = False
        self.out_timer = 0.0
        self.out_stage = 0
        self.won = False
        self.msgs = list(MANAGER.get(n, []))
        self.msg_i = 0
        self.msg_chars = 0.0
        self.msg_hold = 0.0
        self.voice_t = 0.0

    # ---------------------------------------------------------- akcje gracza
    def toggle_door(self, side):
        if self.power_out:
            self.synth.play("click", 0.5)
            return
        self.door[side] = not self.door[side]
        self.synth.play("door", 0.7)

    def toggle_light(self, side):
        if self.power_out:
            self.synth.play("click", 0.5)
            return
        other = "R" if side == "L" else "L"
        self.light[side] = not self.light[side]
        self.light[other] = False
        if self.light[side]:
            w = self.marek if side == "L" else self.basia
            if w.at_door and not w.seen_at_door:
                w.seen_at_door = True
                self.synth.play("sting", 0.8)

    def toggle_cam(self):
        if self.power_out or self.killer:
            return
        self.cam_up = not self.cam_up
        self.light = {"L": False, "R": False}
        self.synth.play("blip", 0.5)
        if self.cam_up:
            self.cam_static = 0.3
        else:
            self.check_inside()

    def set_cam(self, c):
        if self.cam_up and c != self.cam:
            self.cam = c
            self.cam_static = 0.25
            self.synth.play("blip", 0.4)

    def click_ad(self, p):
        for ad in reversed(self.ads):
            r = ad["rect"]
            x = pygame.Rect(r.right - 11, r.y + 1, 10, 9)
            if x.collidepoint(p):
                self.ads.remove(ad)
                self.synth.play("click", 0.5)
                return True
            if r.collidepoint(p):
                # klikniecie w reklame - "otwiera sklep" = strata pradu
                self.power = max(0, self.power - 2)
                self.synth.play("jingle", 0.5)
                return True
        return False

    # ---------------------------------------------------------- logika
    def kill(self, who):
        if self.killer is None:
            self.killer = who
            self.cam_up = False

    def check_inside(self):
        for w in self.walkers:
            if w.inside:
                self.kill(w.name)

    def usage(self):
        return 1 + sum(self.door.values()) + sum(self.light.values()) + (1 if self.cam_up else 0)

    def update(self, dt):
        if self.killer or self.won:
            return
        self.time += dt
        if self.time >= HOUR * 6:
            self.won = True
            return

        # animacje
        for sd in ("L", "R"):
            target = 1.0 if self.door[sd] else 0.0
            self.door_anim[sd] += (target - self.door_anim[sd]) * min(1, dt * 14)
        self.cam_anim += ((1.0 if self.cam_up else 0.0) - self.cam_anim) * min(1, dt * 12)
        self.cam_static = max(0, self.cam_static - dt)

        # wiadomosci kierownika
        if self.msg_i < len(self.msgs):
            line = self.msgs[self.msg_i]
            if self.msg_chars < len(line):
                self.msg_chars += dt * 32
                self.voice_t -= dt
                if self.voice_t <= 0:
                    self.voice_t = 0.07
                    self.synth.play(f"voice{self.rng.randrange(3)}", 0.5)
            else:
                self.msg_hold += dt
                if self.msg_hold > 2.6:
                    self.msg_i += 1
                    self.msg_chars = 0
                    self.msg_hold = 0

        # prad
        if not self.power_out:
            self.power -= dt * (0.085 * self.usage() + 0.012 * (self.n - 1))
            if self.power <= 0:
                self.power = 0
                self.power_out = True
                self.door = {"L": False, "R": False}
                self.light = {"L": False, "R": False}
                self.cam_up = False
                self.ads.clear()
                self.out_timer = self.rng.uniform(4, 10)
                self.synth.play("powerdown", 0.9)
        else:
            self.out_timer -= dt
            if self.out_timer <= 0:
                if self.out_stage == 0:
                    self.out_stage = 1
                    self.out_timer = self.rng.uniform(5, 12)
                    self.synth.play("musicbox", 0.8)
                elif self.out_stage == 1:
                    self.out_stage = 2
                    self.out_timer = self.rng.uniform(1.5, 4)
                else:
                    self.kill("promo")
            return

        # lazacy
        for w in self.walkers:
            if w.ai <= 0:
                continue
            w.timer -= dt
            if w.timer > 0:
                continue
            w.timer = w.interval
            if w.inside:
                if not self.cam_up:
                    self.kill(w.name)
                else:
                    self.kill_delay = 1.5 if self.kill_delay < 0 else self.kill_delay
                continue
            if self.rng.randint(1, 20) > w.ai:
                continue
            # Marek zamiera, gdy na niego patrzysz
            if w.name == "marek" and self.cam_up and self.cam == w.loc:
                continue
            old = w.loc
            if w.at_door:
                if self.door[w.side]:
                    w.i = self.rng.choice(w.retreat)
                    w.seen_at_door = False
                    self.synth.play("knock", 0.6)
                else:
                    w.inside = True
                    self.light[w.side] = False
                    if not self.cam_up:
                        self.kill(w.name)
                    else:
                        self.kill_delay = 1.5
            else:
                w.i += 1
                if w.at_door:
                    self.synth.play("step", 0.9)
                else:
                    self.synth.play("step", 0.25)
            if self.cam_up and self.cam in (old, w.loc):
                self.cam_static = 0.6
        if self.kill_delay >= 0:
            self.kill_delay -= dt
            if self.kill_delay < 0:
                self.check_inside()

        # Pan Promocja
        if self.promo_ai > 0:
            watched = self.cam_up and self.cam == "C4"
            if self.promo_run >= 0:
                self.promo_run -= dt
                if self.promo_run < 0:
                    if self.door["L"]:
                        self.synth.play("bang", 1.0)
                        self.power = max(0, self.power - 6)
                        self.promo_stage = 0
                        self.promo_timer = 6.0
                    else:
                        self.kill("promo")
            else:
                self.promo_timer -= dt
                if self.promo_timer <= 0:
                    self.promo_timer = 5.0
                    if not watched and self.rng.randint(1, 20) <= self.promo_ai:
                        self.promo_stage += 1
                        if self.promo_stage >= 4:
                            self.promo_run = 2.6
                            self.synth.play("ding", 0.9)
                            self.synth.play("run", 0.7)
                    elif watched and self.promo_stage > 0 and self.rng.random() < 0.15:
                        self.promo_stage -= 1

        # reklamy
        if self.ads_ai > 0:
            self.ad_timer -= dt
            if self.ad_timer <= 0:
                self.ad_timer = 4.0
                if self.cam_up and len(self.ads) < 4 and self.rng.randint(1, 20) <= self.ads_ai:
                    w, h = 96, 60
                    r = pygame.Rect(self.rng.randint(6, LW - w - 6), self.rng.randint(14, 95 - 10), w, h)
                    life = 9.0 - self.n * 0.6
                    self.ads.append({"rect": r, "t": life, "life": life,
                                     "text": self.rng.choice(["MANEKIN -70%!!!", "KUP 2 GŁOWY GRATIS", "WYGRANA: TELEFON!!",
                                                              "NOWA GRA: ZŁAP MNIE", "PROMOCJA TYLKO DZIŚ"])})
                    self.synth.play("jingle", 0.5)
            for ad in list(self.ads):
                ad["t"] -= dt
                if ad["t"] <= 0:
                    self.kill("reklama")
                    break

    def hour(self):
        h = int(self.time // HOUR)
        return 12 if h == 0 else h


# ---------------------------------------------------------------- aplikacja
class App:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((SW, SH))
        pygame.display.set_caption("Nocna Zmiana: Galeria Manekin (PORT)")
        self.low = pygame.Surface((LW, LH))
        self.clock = pygame.time.Clock()
        self.synth = Synth()
        self.rng = random.Random()
        self.f_small = pygame.font.Font(None, 22)
        self.f = pygame.font.Font(None, 30)
        self.f_mid = pygame.font.Font(None, 44)
        self.f_big = pygame.font.Font(None, 96)
        self.noise = self._noise_frames()
        self.scan = self._scanlines()
        self.vign = self._vignette()
        self.progress = self._load()
        self.scene = "loading"
        self.t = 0.0
        self.scene_t = 0.0
        self.night = None
        self.night_n = 1
        self.tip = self.rng.choice(TIPS)
        self.fake_fps = 60
        self.freeze = 0.0
        self.freeze_frame = None
        self.lag_t = self.rng.uniform(25, 50)
        self.menu_items = []
        self.hover_bar = False
        self.mouse = (0, 0)
        self.death = None

    # ---------------------------------------------------------- zasoby
    def _noise_frames(self):
        frames = []
        for _ in range(5):
            s = pygame.Surface((LW // 2, LH // 2))
            for y in range(s.get_height()):
                for x in range(s.get_width()):
                    v = self.rng.randint(0, 255)
                    s.set_at((x, y), (v, v, v))
            frames.append(pygame.transform.scale(s, (LW, LH)))
        return frames

    def _scanlines(self):
        s = pygame.Surface((LW, LH), pygame.SRCALPHA)
        for y in range(0, LH, 2):
            pygame.draw.line(s, (0, 0, 0, 70), (0, y), (LW, y))
        return s

    def _vignette(self):
        s = pygame.Surface((LW // 4, LH // 4), pygame.SRCALPHA)
        w, h = s.get_size()
        for y in range(h):
            for x in range(w):
                d = math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2)) / math.sqrt(2)
                s.set_at((x, y), (0, 0, 0, int(255 * max(0, (d - 0.3) / 0.7) ** 1.3)))
        return pygame.transform.smoothscale(s, (LW, LH))

    def _load(self):
        try:
            with open(SAVE_FILE) as fh:
                return json.load(fh)
        except (OSError, ValueError):
            return {"night": 1}

    def _save(self):
        try:
            with open(SAVE_FILE, "w") as fh:
                json.dump(self.progress, fh)
        except OSError:
            pass

    # ---------------------------------------------------------- tekst
    def text(self, txt, pos, font=None, col=(220, 220, 220), center=False, shadow=True, alpha=255):
        font = font or self.f
        img = font.render(txt, True, col)
        if alpha < 255:
            img.set_alpha(alpha)
        x, y = pos
        if center:
            x -= img.get_width() // 2
        if shadow:
            sh = font.render(txt, True, (0, 0, 0))
            if alpha < 255:
                sh.set_alpha(alpha)
            self.screen.blit(sh, (x + 2, y + 2))
        self.screen.blit(img, (x, y))
        return img.get_width()

    def glitch(self, s, p):
        return "".join(self.rng.choice("#@%&?!01") if c != " " and self.rng.random() < p else c for c in s)

    def go(self, scene):
        self.scene = scene
        self.scene_t = 0.0

    def start_night(self, n):
        self.night_n = n
        self.night = Night(n, self.synth, self.rng)
        self.synth.stop_all()
        self.go("intro")

    # ---------------------------------------------------------- wejscie
    def lp(self, pos):
        return pos[0] // SCALE, pos[1] // SCALE

    def handle(self, e):
        if e.type == pygame.QUIT:
            self.quit()
        if e.type == pygame.KEYDOWN and e.key == pygame.K_ESCAPE:
            if self.scene in ("play", "intro"):
                self.synth.stop_all()
                self.go("menu")
            elif self.scene == "menu":
                self.quit()
            return
        if self.scene == "loading":
            if e.type in (pygame.MOUSEBUTTONDOWN, pygame.KEYDOWN) and self.scene_t > 0.5:
                self.go("menu")
        elif self.scene == "menu":
            if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
                for rect, action in self.menu_items:
                    if rect.collidepoint(e.pos):
                        self.synth.play("blip", 0.6)
                        action()
            if e.type == pygame.KEYDOWN and e.key == pygame.K_RETURN:
                self.start_night(self.progress.get("night", 1))
        elif self.scene == "play":
            self.handle_play(e)
        elif self.scene in ("gameover", "theend"):
            if e.type in (pygame.MOUSEBUTTONDOWN, pygame.KEYDOWN) and self.scene_t > 1.5:
                self.go("menu")

    def handle_play(self, e):
        n = self.night
        if e.type == pygame.KEYDOWN:
            k = e.key
            if k in (pygame.K_SPACE, pygame.K_s):
                n.toggle_cam()
            elif k == pygame.K_q and not n.cam_up:
                n.toggle_door("L")
            elif k == pygame.K_e and not n.cam_up:
                n.toggle_door("R")
            elif k == pygame.K_a and not n.cam_up:
                n.toggle_light("L")
            elif k == pygame.K_d and not n.cam_up:
                n.toggle_light("R")
            elif pygame.K_1 <= k <= pygame.K_7:
                n.set_cam(CAMS[k - pygame.K_1])
            elif k == pygame.K_RETURN and n.msg_i < len(n.msgs):
                n.msg_i = len(n.msgs)
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            p = self.lp(e.pos)
            if n.cam_up:
                if n.click_ad(p):
                    return
                for c, (x, y) in MAP_RECTS.items():
                    if pygame.Rect(x, y, MAP_W, MAP_H).collidepoint(p):
                        n.set_cam(c)
                        return
            else:
                if pygame.Rect(68, 66, 14, 14).collidepoint(p):
                    n.toggle_door("L")
                elif pygame.Rect(68, 84, 14, 14).collidepoint(p):
                    n.toggle_light("L")
                elif pygame.Rect(238, 66, 14, 14).collidepoint(p):
                    n.toggle_door("R")
                elif pygame.Rect(238, 84, 14, 14).collidepoint(p):
                    n.toggle_light("R")
        if e.type == pygame.MOUSEMOTION:
            p = self.lp(e.pos)
            inside = pygame.Rect(90, 168, 140, 12).collidepoint(p)
            if inside and not self.hover_bar:
                n.toggle_cam()
            self.hover_bar = inside

    def quit(self):
        pygame.quit()
        sys.exit()

    # ---------------------------------------------------------- update
    def update(self, dt):
        self.t += dt
        self.scene_t += dt
        if self.rng.random() < 0.02:
            self.fake_fps = self.rng.choice([60, 59, 58, 61, 12, 30, 60, 60, 144])
        if self.scene == "loading" and self.scene_t > 4.2:
            self.go("menu")
        elif self.scene == "intro" and self.scene_t > 3.0:
            self.go("play")
        elif self.scene == "play":
            n = self.night
            n.update(dt)
            # dzwieki tla
            self.synth.loop("fan", 0 if n.power_out else 0.22)
            self.synth.loop("buzz", 0.25 if any(n.light.values()) else 0)
            st = 0.0
            if n.cam_up:
                st = 0.06 + n.cam_static * 0.5
            self.synth.loop("static", st)
            # "lag" portu
            self.lag_t -= dt
            if self.lag_t <= 0:
                self.lag_t = self.rng.uniform(30, 60)
                self.freeze = 0.25
                self.freeze_frame = self.screen.copy()
            self.freeze = max(0, self.freeze - dt)
            if n.killer:
                self.death = n.killer
                self.synth.stop_all()
                self.synth.play("scream", 1.0)
                self.go("jumpscare")
            elif n.won:
                self.synth.stop_all()
                self.synth.play("chime", 0.9)
                self.go("win")
        elif self.scene == "jumpscare" and self.scene_t > 1.3:
            self.synth.loop("static", 0.4)
            self.go("gameover")
        elif self.scene == "gameover" and self.scene_t > 6:
            self.synth.stop_all()
            self.go("menu")
        elif self.scene == "win" and self.scene_t > 5:
            if self.night_n >= 5:
                self.progress["night"] = 5
                self.progress["done"] = True
                self._save()
                self.go("theend")
            else:
                self.progress["night"] = max(self.progress.get("night", 1), self.night_n + 1)
                self._save()
                self.start_night(self.night_n + 1)
        if self.scene in ("gameover",) and self.scene_t > 2:
            self.synth.loop("static", 0)

    # ---------------------------------------------------------- rysowanie
    def present(self):
        pygame.transform.scale(self.low, (SW, SH), self.screen)

    def draw(self):
        if self.scene == "play" and self.freeze > 0 and self.freeze_frame:
            self.screen.blit(self.freeze_frame, (0, 0))
            self.text("Ładowanie...", (SW - 160, SH - 40), self.f_small, (200, 200, 200))
            return
        getattr(self, "draw_" + self.scene)()
        if self.scene != "jumpscare":
            self.draw_statusbar()

    def draw_statusbar(self):
        bar = pygame.Surface((SW, 22), pygame.SRCALPHA)
        bar.fill((0, 0, 0, 150))
        self.screen.blit(bar, (0, 0))
        self.text(time.strftime("%H:%M"), (8, 3), self.f_small, (230, 230, 230), shadow=False)
        for i in range(4):
            h = 4 + i * 3
            pygame.draw.rect(self.screen, (230, 230, 230), (SW - 110 + i * 6, 18 - h, 4, h))
        phone = max(1, 23 - int(self.t / 30))
        pygame.draw.rect(self.screen, (230, 230, 230), (SW - 70, 5, 30, 13), 1)
        pygame.draw.rect(self.screen, (230, 60, 60) if phone < 15 else (230, 230, 230),
                         (SW - 68, 7, int(26 * phone / 100) + 1, 9))
        self.text(f"{phone}%", (SW - 36, 3), self.f_small, (230, 230, 230), shadow=False)
        self.text(f"FPS: {self.fake_fps}", (70, 3), self.f_small,
                  (120, 230, 120) if self.fake_fps > 40 else (230, 90, 90), shadow=False)

    def draw_loading(self):
        s = self.low
        s.fill((0, 0, 0))
        prog = min(0.99, self.scene_t / 2.3)
        if self.scene_t > 3.4:
            prog = 1.0
        pygame.draw.rect(s, (60, 60, 60), (60, 120, 200, 8), 1)
        pygame.draw.rect(s, (200, 40, 40), (62, 122, int(196 * prog), 4))
        draw_mannequin(s, 160, 105, 60, "marek", self.t)
        self.present()
        self.text("NOCNA ZMIANA", (SW // 2, 40), self.f_mid, (200, 40, 40), center=True)
        lbl = "Optymalizacja shaderów..." if 2.3 < self.scene_t < 3.4 else f"Ładowanie {int(prog * 100)}%"
        self.text(lbl, (SW // 2, 400), self.f, center=True)
        self.text(self.tip, (SW // 2, 450), self.f_small, (150, 150, 150), center=True)
        self.text("v0.9.1 PORT (nieoficjalny)", (10, SH - 26), self.f_small, (90, 90, 90))

    def draw_menu(self):
        s = self.low
        s.fill((6, 4, 8))
        flick = 0.3 if self.rng.random() < 0.05 else 1.0
        x = 230 + (self.rng.randint(-1, 1) if self.rng.random() < 0.1 else 0)
        draw_mannequin(s, x, 170, 130, "basia", self.t, 0.6 * flick, angry=int(self.t * 3) % 23 == 0)
        draw_mannequin(s, 275, 175, 120, "marek", self.t, 0.35 * flick)
        s.blit(self.scan, (0, 0))
        nf = self.noise[int(self.t * 20) % len(self.noise)]
        nf.set_alpha(18)
        s.blit(nf, (0, 0))
        s.blit(self.vign, (0, 0))
        self.present()
        title = "NOCNA ZMIANA" if self.rng.random() > 0.03 else self.glitch("NOCNA ZMIANA", 0.4)
        self.text(title, (50, 70), self.f_big, (200, 30, 30))
        self.text("GALERIA MANEKIN", (55, 140), self.f_mid, (200, 200, 190))
        self.text("edycja PORT na komputer", (58, 180), self.f_small, (140, 140, 140))
        self.menu_items = []
        y = 260
        cur = self.progress.get("night", 1)
        items = [("Nowa gra", lambda: (self.progress.update(night=1), self._save(), self.start_night(1)))]
        if cur > 1:
            items.append((f"Kontynuuj  (Noc {cur})", lambda: self.start_night(self.progress.get("night", 1))))
        if self.progress.get("done"):
            items.append(("Noc 5 (wyzwanie)", lambda: self.start_night(5)))
        items.append(("Wyjście", self.quit))
        mx, my = pygame.mouse.get_pos()
        for label, action in items:
            img = self.f_mid.render(label, True, (255, 255, 255))
            rect = pygame.Rect(60, y, img.get_width(), img.get_height())
            hov = rect.collidepoint(mx, my)
            self.text(("> " if hov else "") + label, (60, y), self.f_mid, (255, 255, 255) if hov else (160, 160, 160))
            self.menu_items.append((rect.inflate(40, 6), action))
            y += 50
        self.text("Oceń nas na 5 gwiazdek!  *****", (60, SH - 40), self.f_small, (200, 180, 60))

    def draw_intro(self):
        self.low.fill((0, 0, 0))
        nf = self.noise[int(self.t * 20) % len(self.noise)]
        nf.set_alpha(int(max(0, 1 - self.scene_t) * 120))
        self.low.blit(nf, (0, 0))
        self.present()
        a = int(255 * min(1, self.scene_t, max(0, 3 - self.scene_t)))
        self.text("12:00", (SW // 2, SH // 2 - 70), self.f_big, (230, 230, 230), center=True, alpha=a)
        self.text(f"Noc {self.night_n}", (SW // 2, SH // 2 + 20), self.f_mid, (230, 230, 230), center=True, alpha=a)

    def draw_play(self):
        n = self.night
        s = self.low
        if n.cam_anim > 0.95:
            self.draw_camera_low()
        else:
            self.draw_office_low()
            if n.cam_anim > 0.02:
                h = int(LH * n.cam_anim)
                pygame.draw.rect(s, (20, 20, 24), (10, LH - h, LW - 20, h))
                pygame.draw.rect(s, (60, 60, 66), (10, LH - h, LW - 20, h), 2)
        self.present()
        self.draw_play_ui()

    def draw_office_low(self):
        n = self.night
        s = self.low
        t = self.t
        lit = 0.25 if n.power_out else 1.0
        s.fill(shade((26, 25, 32), lit))
        pygame.draw.polygon(s, shade((32, 28, 26), lit), [(0, 130), (LW, 130), (LW, LH), (0, LH)])
        for i in range(0, LW + 40, 24):
            pygame.draw.line(s, shade((24, 22, 20), lit), (i, 130), (i - 30, LH))
        # plakaty
        pygame.draw.rect(s, shade((60, 50, 40), lit), (112, 26, 40, 50))
        draw_mannequin(s, 132, 74, 40, "basia", t, 0.7 * lit)
        pygame.draw.rect(s, shade((150, 140, 110), lit), (168, 32, 34, 26))
        pygame.draw.rect(s, shade((40, 40, 40), lit), (176, 36, 18, 14))
        # drzwi
        for side, x in (("L", 14), ("R", 254)):
            dr = pygame.Rect(x, 28, 52, 120)
            if n.light[side] and not n.power_out:
                for i in range(10):
                    pygame.draw.rect(s, shade((80, 74, 55), 1 - i * 0.08), dr.inflate(-i * 3, -i * 2))
                w = n.marek if side == "L" else n.basia
                if w.at_door and not w.inside:
                    draw_mannequin(s, dr.centerx, dr.bottom - 2, 100, w.name, t, 0.9, angry=True)
                if side == "L" and n.promo_run >= 0:
                    draw_promo(s, dr.centerx, dr.bottom - 2, 90, t, 0.9)
            else:
                pygame.draw.rect(s, (4, 4, 6), dr)
            if n.power_out and side == "L" and n.out_stage >= 1:
                if int(t * 4) % 2 or n.out_stage == 2:
                    for ex in (-6, 6):
                        pygame.draw.circle(s, (255, 220, 60), (dr.centerx + ex, 60), 2)
            dh = int(120 * n.door_anim[side])
            if dh > 0:
                pygame.draw.rect(s, shade((88, 90, 96), lit), (x, 28, 52, dh))
                for yy in range(28, 28 + dh, 8):
                    pygame.draw.line(s, shade((60, 62, 66), lit), (x, yy), (x + 51, yy))
                pygame.draw.rect(s, shade((200, 160, 30), lit), (x, 28 + dh - 4, 52, 4))
            pygame.draw.rect(s, shade((50, 50, 56), lit), dr.inflate(6, 4), 3)
        # przyciski
        for side, x in (("L", 68), ("R", 238)):
            pygame.draw.rect(s, shade((40, 40, 44), lit), (x - 3, 62, 20, 40))
            dc = (230, 40, 40) if n.door[side] else (90, 20, 20)
            lc = (240, 240, 220) if n.light[side] else (90, 90, 80)
            pygame.draw.rect(s, shade(dc, lit), (x, 66, 14, 14))
            pygame.draw.rect(s, shade(lc, lit), (x, 84, 14, 14))
        # biurko
        pygame.draw.rect(s, shade((70, 48, 30), lit), (84, 122, 152, 30))
        pygame.draw.rect(s, shade((50, 34, 20), lit), (84, 122, 152, 30), 2)
        pygame.draw.rect(s, shade((30, 30, 34), lit), (138, 98, 44, 26))
        glow = 0.0 if n.power_out else 1.0
        pygame.draw.rect(s, shade((40, 70, 60), glow * (0.8 + 0.2 * math.sin(t * 9))), (141, 101, 38, 18))
        # wiatrak
        fx, fy = 104, 106
        pygame.draw.line(s, shade((60, 60, 60), lit), (fx, fy), (fx, 122), 2)
        ang = 0 if n.power_out else t * 25
        for k in range(3):
            a = ang + k * math.tau / 3
            pygame.draw.line(s, shade((120, 120, 120), lit), (fx, fy), (fx + math.cos(a) * 9, fy + math.sin(a) * 9), 3)
        pygame.draw.circle(s, shade((80, 80, 80), lit), (fx, fy), 10, 1)
        # kubek, papiery
        pygame.draw.rect(s, shade((180, 180, 170), lit), (200, 112, 8, 10))
        pygame.draw.rect(s, shade((200, 195, 170), lit), (214, 118, 14, 4))
        # ciemnosc
        dark = pygame.Surface((LW, LH), pygame.SRCALPHA)
        flick = 1.0 if self.rng.random() > 0.01 else 0.5
        dark.fill((0, 0, 0, int(80 / flick) if not n.power_out else 170))
        s.blit(dark, (0, 0))
        s.blit(self.vign, (0, 0))
        # pasek kamer
        if not n.power_out:
            pygame.draw.rect(s, (60, 60, 70), (90, 168, 140, 10))
            pygame.draw.rect(s, (140, 140, 160), (90, 168, 140, 10), 1)
            for k in range(3):
                cx = 155 + k * 5
                pygame.draw.polygon(s, (200, 200, 220), [(cx, 171), (cx + 4, 171), (cx + 2, 175)])
        # przyciski dotykowe ("port")
        tb = pygame.Surface((LW, LH), pygame.SRCALPHA)
        pygame.draw.circle(tb, (255, 255, 255, 30), (20, 160), 12)
        pygame.draw.circle(tb, (255, 255, 255, 30), (300, 160), 12)
        pygame.draw.polygon(tb, (255, 255, 255, 50), [(16, 160), (24, 154), (24, 166)])
        pygame.draw.polygon(tb, (255, 255, 255, 50), [(304, 160), (296, 154), (296, 166)])
        s.blit(tb, (0, 0))

    def draw_camera_low(self):
        n = self.night
        s = self.low
        t = self.t
        cam = n.cam
        draw_room(s, cam, t, self.rng)
        spots = {
            "C1": {"marek": (110, 150, 90), "basia": (210, 150, 92)},
            "C2": {"marek": (160, 152, 80)},
            "C3": {"marek": (80, 150, 70), "basia": (240, 150, 70)},
            "C5": {"marek": (160, 172, 120)},
            "C6": {"basia": (160, 172, 120)},
            "C7": {"basia": (215, 148, 82)},
        }
        for w in n.walkers:
            if w.ai <= 0 and w.name == "basia" and cam == "C1":
                # w nocy 1 Basia stoi nieruchomo
                draw_mannequin(s, 210, 150, 92, "basia", 0, 0.7)
                continue
            sp = spots.get(cam, {}).get(w.name)
            if sp and w.loc == cam:
                angry = cam in ("C5", "C6")
                draw_mannequin(s, sp[0], sp[1], sp[2], w.name, t, 0.75, angry)
        if cam == "C4" and n.promo_ai > 0:
            st = n.promo_stage
            if n.promo_run >= 0:
                pygame.draw.rect(s, (10, 10, 12), (102, 22, 116, 106))
            else:
                gap = [0, 10, 28, 50, 58][min(4, st)]
                if gap > 0:
                    pygame.draw.rect(s, (6, 6, 8), (160 - gap, 22, gap * 2, 106))
                    if st >= 2:
                        draw_promo(s, 160, 128, 80 + st * 8, t, 0.8)
                    elif st == 1:
                        for ex in (-5, 5):
                            pygame.draw.circle(s, (255, 230, 80), (160 + ex, 60), 1)
                    pygame.draw.rect(s, (60, 60, 66), (102, 22, 58 - gap, 106))
                    pygame.draw.rect(s, (60, 60, 66), (160 + gap, 22, 58 - gap, 106))
                pygame.draw.line(s, (30, 30, 34), (160, 22), (160, 128))
        elif cam == "C4":
            pygame.draw.line(s, (30, 30, 34), (160, 22), (160, 128))
        if cam == "C5" and n.promo_run >= 0:
            draw_promo(s, 160 - (2.6 - n.promo_run) * 40, 175, 130, t * 3, 0.9)
        # efekty kamery
        s.blit(self.scan, (0, 0))
        nf = self.noise[int(t * 30) % len(self.noise)]
        nf.set_alpha(int(30 + 200 * min(1, n.cam_static * 2)))
        s.blit(nf, (0, 0))
        s.blit(self.vign, (0, 0))
        if int(t * 2) % 2:
            pygame.draw.circle(s, (220, 30, 30), (12, 14), 3)
        # reklamy
        for ad in n.ads:
            r = ad["rect"]
            danger = ad["t"] < 2.5
            jx = self.rng.randint(-2, 2) if danger else 0
            rr = r.move(jx, 0)
            pygame.draw.rect(s, (235, 235, 235), rr)
            pygame.draw.rect(s, (40, 60, 200), (rr.x, rr.y, rr.w, 11))
            pygame.draw.rect(s, (200, 40, 40), (rr.right - 11, rr.y + 1, 10, 9))
            pygame.draw.line(s, (255, 255, 255), (rr.right - 9, rr.y + 3), (rr.right - 3, rr.y + 8))
            pygame.draw.line(s, (255, 255, 255), (rr.right - 3, rr.y + 3), (rr.right - 9, rr.y + 8))
            fx, fy = rr.x + 18, rr.y + 36
            draw_star(s, fx, fy, 12, (240, 200, 40), t)
            ec = (255, 0, 0) if danger else (0, 0, 0)
            for ex in (-4, 4):
                pygame.draw.circle(s, ec, (fx + ex, fy - 3), 2)
            pygame.draw.arc(s, (0, 0, 0), (fx - 6, fy - 2, 12, 8), math.pi, math.tau, 1)
            frac = max(0, ad["t"] / ad["life"])
            pygame.draw.rect(s, (200, 40, 40) if danger else (60, 160, 60), (rr.x, rr.bottom - 3, int(rr.w * frac), 3))
        # mapa
        mp = pygame.Surface((LW, LH), pygame.SRCALPHA)
        pygame.draw.rect(mp, (0, 0, 0, 140), (224, 100, 92, 74))
        s.blit(mp, (0, 0))
        links = [("C1", "C2"), ("C1", "C3"), ("C1", "C4"), ("C2", "C5"), ("C3", "C5"), ("C3", "C7"), ("C4", "C7"),
                 ("C7", "C6"), ("C3", "C6")]
        for a, b in links:
            ax, ay = MAP_RECTS[a]
            bx, by = MAP_RECTS[b]
            pygame.draw.line(s, (90, 90, 90), (ax + MAP_W // 2, ay + MAP_H // 2), (bx + MAP_W // 2, by + MAP_H // 2))
        for c, (x, y) in MAP_RECTS.items():
            col = (60, 160, 60) if c == cam else (70, 70, 70)
            pygame.draw.rect(s, col, (x, y, MAP_W, MAP_H))
            pygame.draw.rect(s, (200, 200, 200), (x, y, MAP_W, MAP_H), 1)
        ox, oy = OFFICE_MAP
        pygame.draw.rect(s, (120, 40, 40), (ox, oy, MAP_W, MAP_H))
        pygame.draw.line(s, (90, 90, 90), (MAP_RECTS["C5"][0] + MAP_W, MAP_RECTS["C5"][1] + 4), (ox, oy + 4))
        pygame.draw.line(s, (90, 90, 90), (MAP_RECTS["C6"][0], MAP_RECTS["C6"][1] + 4), (ox + MAP_W, oy + 4))
        # pasek
        pygame.draw.rect(s, (60, 60, 70), (90, 168, 140, 10))
        pygame.draw.rect(s, (140, 140, 160), (90, 168, 140, 10), 1)

    def draw_play_ui(self):
        n = self.night
        S = SCALE
        # czas i noc
        self.text(f"{n.hour()} AM" if n.hour() != 12 else "12 AM", (SW - 120, 34), self.f_mid)
        self.text(f"Noc {n.n}", (SW - 100, 74), self.f_small, (170, 170, 170))
        # prad
        pw = int(math.ceil(n.power))
        self.text(f"Prąd: {pw}%", (16, SH - 76), self.f, (230, 230, 230) if pw > 20 else (230, 80, 80))
        self.text("Zużycie:", (16, SH - 46), self.f_small, (200, 200, 200))
        for i in range(n.usage() if not n.power_out else 0):
            col = [(60, 200, 60), (60, 200, 60), (230, 200, 40), (230, 120, 40), (230, 50, 50), (230, 50, 50)][min(5, i)]
            pygame.draw.rect(self.screen, col, (90 + i * 16, SH - 46, 12, 18))
        if n.cam_up and n.cam_anim > 0.95:
            self.text(f"CAM {n.cam[1]} - {CAM_NAMES[n.cam]}", (40, 30), self.f, (240, 240, 240))
            for c, (x, y) in MAP_RECTS.items():
                self.text(c, (x * S + 8, y * S + 4), self.f_small, (255, 255, 255), shadow=False)
            self.text("TY", (OFFICE_MAP[0] * S + 10, OFFICE_MAP[1] * S + 4), self.f_small, (255, 255, 255), shadow=False)
            if n.cam == "C4" and n.promo_ai == 0:
                self.text("WINDA NIECZYNNA", (SW // 2, SH // 2 - 20), self.f, (200, 60, 60), center=True)
            for ad in n.ads:
                r = ad["rect"]
                self.text("REKLAMA", (r.x * S + 6, r.y * S + 4), self.f_small, (255, 255, 255), shadow=False)
                lines, cur = [], ""
                for word in ad["text"].split():
                    if cur and len(cur) + len(word) > 11:
                        lines.append(cur)
                        cur = word
                    else:
                        cur = (cur + " " + word).strip()
                lines.append(cur)
                for li, l in enumerate(lines[:3]):
                    self.text(l, (r.x * S + 108, r.y * S + 44 + li * 22), self.f_small, (20, 20, 20), shadow=False)
                self.text("KUP TERAZ", (r.x * S + 108, r.y * S + 118), self.f_small, (200, 30, 30), shadow=False)
        elif not n.cam_up and n.cam_anim < 0.05:
            if not n.power_out:
                self.text("Q", (68 * S + 14, 66 * S + 8), self.f_small, (255, 255, 255))
                self.text("A", (68 * S + 14, 84 * S + 8), self.f_small, (0, 0, 0), shadow=False)
                self.text("E", (238 * S + 14, 66 * S + 8), self.f_small, (255, 255, 255))
                self.text("D", (238 * S + 14, 84 * S + 8), self.f_small, (0, 0, 0), shadow=False)
            self.text("sterowanie dotykowe (nie działa)", (SW // 2, SH - 70), self.f_small, (110, 110, 110),
                      center=True, shadow=False)
        # kierownik
        if n.msg_i < len(n.msgs):
            line = n.msgs[n.msg_i][:int(n.msg_chars)]
            if n.n == 5:
                line = self.glitch(line, 0.08)
            box = pygame.Surface((SW - 160, 70), pygame.SRCALPHA)
            box.fill((0, 0, 0, 190))
            self.screen.blit(box, (80, 110))
            pygame.draw.rect(self.screen, (120, 120, 120), (80, 110, SW - 160, 70), 1)
            self.text("Kierownik:", (94, 116), self.f_small, (230, 200, 80))
            self.text(line, (94, 142), self.f_small, (230, 230, 230))
            self.text("[ENTER] pomiń", (SW - 200, 160), self.f_small, (120, 120, 120), shadow=False)

    def draw_jumpscare(self):
        s = self.low
        s.fill((40, 0, 0) if int(self.scene_t * 20) % 2 else (5, 0, 0))
        draw_face(s, self.death, self.scene_t, self.rng)
        nf = self.noise[int(self.t * 40) % len(self.noise)]
        nf.set_alpha(70)
        s.blit(nf, (0, 0))
        self.present()

    def draw_gameover(self):
        s = self.low
        nf = self.noise[int(self.t * 25) % len(self.noise)]
        s.blit(nf, (0, 0))
        dk = pygame.Surface((LW, LH), pygame.SRCALPHA)
        dk.fill((0, 0, 0, min(255, int(self.scene_t * 120))))
        s.blit(dk, (0, 0))
        self.present()
        if self.scene_t > 1.5:
            who = {"marek": "Marek cię znalazł.", "basia": "Basia cię przytuliła.",
                   "promo": "Pan Promocja: -100% ochroniarza.", "reklama": "Reklama nie została zamknięta."}[self.death]
            self.text("KONIEC GRY", (SW // 2, 170), self.f_big, (200, 30, 30), center=True)
            self.text(who, (SW // 2, 260), self.f, center=True)
            self.text("Błąd: ochroniarz.exe przestał działać", (SW // 2, 300), self.f_small, (140, 140, 140), center=True)
            if self.scene_t > 2.5:
                self.text("kliknij, aby wrócić do menu", (SW // 2, 400), self.f_small, (160, 160, 160), center=True)

    def draw_win(self):
        self.low.fill((0, 0, 0))
        self.present()
        k = min(1, self.scene_t / 2.0)
        y = int(lerp(0, 60, k))
        clip = pygame.Rect(SW // 2 - 80, SH // 2 - 60, 200, 100)
        self.screen.set_clip(clip)
        self.text("5", (SW // 2 - 60, SH // 2 - 50 - y), self.f_big, (230, 230, 230))
        self.text("6", (SW // 2 - 60, SH // 2 + 10 - y), self.f_big, (230, 230, 230))
        self.screen.set_clip(None)
        self.text("AM", (SW // 2 - 10, SH // 2 - 50), self.f_big, (230, 230, 230))
        if self.scene_t > 2.5:
            self.text(f"Noc {self.night_n} przetrwana!", (SW // 2, SH // 2 + 80), self.f_mid, (230, 200, 80), center=True)

    def draw_theend(self):
        s = self.low
        s.fill((10, 10, 14))
        draw_promo(s, 270, 178, 110, self.t, 0.5)
        self.present()
        self.text("KONIEC!", (SW // 2, 80), self.f_big, (230, 200, 80), center=True)
        lines = [
            "Udało ci się przetrwać 5 nocy w Galerii Manekin.",
            "Wypłata: 120,50 zł  (minus 119,00 zł za reklamy)",
            "Dziękujemy za grę w nasz PORT!",
            "Oceń nas na 5 gwiazdek *****",
            "Odblokowano: Noc 5 (wyzwanie) w menu",
        ]
        for i, l in enumerate(lines):
            self.text(l, (SW // 2 - 60, 190 + i * 40), self.f, center=True)
        if self.scene_t > 1.5:
            self.text("kliknij, aby wrócić", (SW // 2 - 60, 420), self.f_small, (150, 150, 150), center=True)

    # ---------------------------------------------------------- petla
    def run(self):
        while True:
            dt = min(self.clock.tick(FPS) / 1000, 0.05)
            for e in pygame.event.get():
                self.handle(e)
            self.update(dt)
            self.draw()
            pygame.display.flip()


if __name__ == "__main__":
    App().run()
