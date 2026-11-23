"""
SZEPT W CIEMNOSCI - mala gra horror w Pythonie (pygame).

Sterowanie:
  WASD / strzalki  - ruch
  SHIFT            - bieg (halasuje!)
  Mysz             - kierunek latarki
  F / PPM          - wlacz / wylacz latarke
  ESC              - wyjscie
  R                - restart po smierci / wygranej

Cel: znajdz 3 klucze i dotrzyj do drzwi wyjsciowych.
Ono nie lubi swiatla... ale swiatlo je przyciaga.
"""
import math
import random
import sys
from collections import deque

import pygame

try:
    import numpy as np
except ImportError:  # dzwieki sa opcjonalne
    np = None

# ---------------------------------------------------------------- ustawienia
SCREEN_W, SCREEN_H = 960, 640
TILE = 48
MAZE_W, MAZE_H = 17, 12          # komorki labiryntu
FPS = 60

PLAYER_R = 13
WALK_SPEED = 125
SPRINT_SPEED = 205
LIGHT_RANGE = 330
LIGHT_HALF_ANGLE = math.radians(28)
BATTERY_DRAIN = 2.3              # % na sekunde
KEYS_NEEDED = 3

NOTES = [
    "\"Dzień 3. Ono nie lubi światła. Ale światło je przyciąga.\"",
    "\"Nie biegaj. Ono słyszy kroki.\"",
    "\"Trzy klucze. Drzwi na końcu. Nie oglądaj się.\"",
    "\"Jeśli słyszysz serce, które nie jest twoje - świeć mu w oczy.\"",
]


# ---------------------------------------------------------------- dzwieki
class Sounds:
    def __init__(self):
        self.ok = False
        if np is None:
            return
        try:
            pygame.mixer.init(22050, -16, 2, 512)
            self.rate, _, self.channels = pygame.mixer.get_init()
            pygame.mixer.set_num_channels(16)
        except pygame.error:
            return
        self.ok = True
        r = self.rate
        rng = np.random.default_rng(7)

        def env(n, attack=0.005, release=0.3):
            e = np.ones(n)
            a = max(1, int(attack * r))
            rl = max(1, int(release * r))
            e[:a] = np.linspace(0, 1, a)
            e[-rl:] *= np.linspace(1, 0, rl)
            return e

        # dron tla (petla)
        t = np.arange(int(r * 6)) / r
        drone = (0.35 * np.sin(2 * np.pi * 55 * t)
                 + 0.25 * np.sin(2 * np.pi * 57.3 * t)
                 + 0.12 * np.sin(2 * np.pi * 110.5 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.17 * t))
                 + 0.05 * rng.standard_normal(len(t)))
        self.drone = self._make(drone * 0.5)

        # bicie serca
        t = np.arange(int(r * 0.6)) / r
        thump = lambda t0: np.where(t >= t0, np.sin(2 * np.pi * 52 * (t - t0)) * np.exp(-(t - t0) * 18), 0)
        self.heart = self._make((thump(0.0) + 0.7 * thump(0.22)) * 0.9)

        # krok
        n = int(r * 0.07)
        step = rng.standard_normal(n) * np.exp(-np.arange(n) / r * 60)
        step = np.convolve(step, np.ones(12) / 12, mode="same")
        self.step = self._make(step * 0.6)

        # podniesienie przedmiotu
        t = np.arange(int(r * 0.5)) / r
        f = 440 + 500 * t
        chime = np.sin(2 * np.pi * np.cumsum(f) / r) * env(len(t), 0.01, 0.4)
        self.pickup = self._make(chime * 0.35)

        # krzyk / jumpscare
        t = np.arange(int(r * 1.6)) / r
        f = 900 - 500 * t + 120 * np.sin(2 * np.pi * 23 * t)
        saw = 2 * ((np.cumsum(f) / r) % 1.0) - 1
        scream = 0.6 * saw + 0.5 * rng.standard_normal(len(t))
        self.scream = self._make(np.clip(scream * env(len(t), 0.002, 0.5) * 1.4, -1, 1))

        # syk potwora (gdy oswietlony)
        t = np.arange(int(r * 0.8)) / r
        hiss = rng.standard_normal(len(t)) * env(len(t), 0.05, 0.5)
        hiss += 0.3 * np.sin(2 * np.pi * (180 - 80 * t) * t)
        self.hiss = self._make(hiss * 0.45)

        # szum / statyka (petla)
        static = rng.standard_normal(int(r * 2)) * 0.4
        self.static = self._make(static)

        # skrzypienie (losowe)
        t = np.arange(int(r * 1.2)) / r
        f = 140 + 60 * np.sin(2 * np.pi * 1.3 * t)
        creak = np.sign(np.sin(2 * np.pi * np.cumsum(f) / r)) * (rng.random(len(t)) > 0.3)
        creak = np.convolve(creak, np.ones(30) / 30, mode="same")
        self.creak = self._make(creak * env(len(t), 0.2, 0.6) * 0.25)

        # drzwi / wygrana
        t = np.arange(int(r * 1.5)) / r
        door = sum(np.sin(2 * np.pi * fr * t) for fr in (220, 277, 330, 440)) / 4
        self.door = self._make(door * env(len(t), 0.05, 1.0) * 0.5)

        self.drone_ch = self.drone.play(loops=-1)
        self.static_ch = self.static.play(loops=-1)
        self.static_ch.set_volume(0)

    def _make(self, mono):
        mono = np.clip(mono, -1, 1)
        data = (mono * 32000).astype(np.int16)
        if self.channels == 2:
            data = np.column_stack([data, data])
        return pygame.sndarray.make_sound(np.ascontiguousarray(data))

    def play(self, name, vol=1.0):
        if not self.ok:
            return
        ch = getattr(self, name).play()
        if ch:
            ch.set_volume(vol)

    def set_static(self, vol):
        if self.ok and self.static_ch:
            self.static_ch.set_volume(vol)

    def stop_all(self):
        if self.ok:
            pygame.mixer.stop()

    def restart_loops(self):
        if self.ok:
            self.drone_ch = self.drone.play(loops=-1)
            self.static_ch = self.static.play(loops=-1)
            self.static_ch.set_volume(0)


# ---------------------------------------------------------------- mapa
def generate_maze(cw, ch, rng):
    """Labirynt (recursive backtracker) + kilka dodatkowych przejsc."""
    gw, gh = cw * 2 + 1, ch * 2 + 1
    grid = [[1] * gw for _ in range(gh)]
    stack = [(0, 0)]
    seen = {(0, 0)}
    grid[1][1] = 0
    while stack:
        cx, cy = stack[-1]
        nbrs = [(cx + dx, cy + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                if 0 <= cx + dx < cw and 0 <= cy + dy < ch and (cx + dx, cy + dy) not in seen]
        if not nbrs:
            stack.pop()
            continue
        nx, ny = rng.choice(nbrs)
        grid[cy * 2 + 1 + (ny - cy)][cx * 2 + 1 + (nx - cx)] = 0
        grid[ny * 2 + 1][nx * 2 + 1] = 0
        seen.add((nx, ny))
        stack.append((nx, ny))
    # petle - zeby dalo sie uciekac
    for _ in range(cw * ch // 4):
        x = rng.randrange(1, gw - 1)
        y = rng.randrange(1, gh - 1)
        if grid[y][x] == 1:
            if (grid[y][x - 1] == 0 and grid[y][x + 1] == 0 and grid[y - 1][x] == 1 and grid[y + 1][x] == 1) or \
               (grid[y - 1][x] == 0 and grid[y + 1][x] == 0 and grid[y][x - 1] == 1 and grid[y][x + 1] == 1):
                grid[y][x] = 0
    return grid


def bfs(grid, start, goal=None):
    """Zwraca (dystanse, rodzice) lub sciezke do goal."""
    gh, gw = len(grid), len(grid[0])
    q = deque([start])
    prev = {start: None}
    while q:
        cur = q.popleft()
        if cur == goal:
            path = []
            while cur is not None:
                path.append(cur)
                cur = prev[cur]
            return path[::-1]
        x, y = cur
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < gw and 0 <= ny < gh and grid[ny][nx] == 0 and (nx, ny) not in prev:
                prev[(nx, ny)] = cur
                q.append((nx, ny))
    if goal is not None:
        return []
    return prev


def bfs_dist(grid, start):
    gh, gw = len(grid), len(grid[0])
    dist = {start: 0}
    q = deque([start])
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < gw and 0 <= ny < gh and grid[ny][nx] == 0 and (nx, ny) not in dist:
                dist[(nx, ny)] = dist[(x, y)] + 1
                q.append((nx, ny))
    return dist


def cast_ray(grid, ox, oy, ang, maxd):
    """DDA - odleglosc do najblizszej sciany wzdluz promienia."""
    dx, dy = math.cos(ang), math.sin(ang)
    mx, my = int(ox // TILE), int(oy // TILE)
    big = 1e30
    ddx = abs(TILE / dx) if dx else big
    ddy = abs(TILE / dy) if dy else big
    if dx < 0:
        stepx, sdx = -1, (ox - mx * TILE) / -dx
    elif dx > 0:
        stepx, sdx = 1, ((mx + 1) * TILE - ox) / dx
    else:
        stepx, sdx = 0, big
    if dy < 0:
        stepy, sdy = -1, (oy - my * TILE) / -dy
    elif dy > 0:
        stepy, sdy = 1, ((my + 1) * TILE - oy) / dy
    else:
        stepy, sdy = 0, big
    gh, gw = len(grid), len(grid[0])
    while True:
        if sdx < sdy:
            d = sdx
            sdx += ddx
            mx += stepx
        else:
            d = sdy
            sdy += ddy
            my += stepy
        if d > maxd:
            return maxd
        if not (0 <= mx < gw and 0 <= my < gh) or grid[my][mx]:
            return d


def line_of_sight(grid, ax, ay, bx, by):
    d = math.hypot(bx - ax, by - ay)
    if d < 1:
        return True
    return cast_ray(grid, ax, ay, math.atan2(by - ay, bx - ax), d) >= d - 1


def angle_diff(a, b):
    return (a - b + math.pi) % (2 * math.pi) - math.pi


# ---------------------------------------------------------------- grafika mapy
def build_map_surface(grid, rng):
    gh, gw = len(grid), len(grid[0])
    surf = pygame.Surface((gw * TILE, gh * TILE))
    for y in range(gh):
        for x in range(gw):
            r = pygame.Rect(x * TILE, y * TILE, TILE, TILE)
            if grid[y][x]:
                base = rng.randint(38, 48)
                pygame.draw.rect(surf, (base + 6, base, base - 4), r)
                for _ in range(10):
                    px = r.x + rng.randrange(TILE)
                    py = r.y + rng.randrange(TILE)
                    c = rng.randint(20, 60)
                    surf.set_at((px, py), (c, c - 5, c - 8))
                # cegly
                for row in range(0, TILE, 12):
                    pygame.draw.line(surf, (28, 24, 22), (r.x, r.y + row), (r.right, r.y + row))
                    off = 0 if (row // 12) % 2 == 0 else 12
                    for col in range(off, TILE, 24):
                        pygame.draw.line(surf, (28, 24, 22), (r.x + col, r.y + row), (r.x + col, r.y + row + 12))
            else:
                base = rng.randint(22, 28)
                pygame.draw.rect(surf, (base, base + 2, base + 1), r)
                pygame.draw.rect(surf, (16, 17, 17), r, 1)
                if rng.random() < 0.08:  # plamy
                    cx = r.x + rng.randint(10, TILE - 10)
                    cy = r.y + rng.randint(10, TILE - 10)
                    for _ in range(5):
                        pygame.draw.circle(surf, (45, 8, 8), (cx + rng.randint(-6, 6), cy + rng.randint(-6, 6)),
                                           rng.randint(2, 7))
                if rng.random() < 0.05:  # rysy
                    p = (r.x + rng.randrange(TILE), r.y + rng.randrange(TILE))
                    for _ in range(3):
                        q = (p[0] + rng.randint(-12, 12), p[1] + rng.randint(-12, 12))
                        pygame.draw.line(surf, (12, 12, 12), p, q)
                        p = q
    return surf


def make_noise_frames(rng, n=4):
    frames = []
    for _ in range(n):
        s = pygame.Surface((SCREEN_W // 3, SCREEN_H // 3), pygame.SRCALPHA)
        for _ in range(1800):
            v = rng.randint(0, 255)
            s.set_at((rng.randrange(s.get_width()), rng.randrange(s.get_height())), (v, v, v, 255))
        frames.append(pygame.transform.scale(s, (SCREEN_W, SCREEN_H)))
    return frames


def make_vignette(color=(0, 0, 0)):
    # maska radialna liczona w niskiej rozdzielczosci, potem wygladzona
    small = pygame.Surface((SCREEN_W // 8, SCREEN_H // 8), pygame.SRCALPHA)
    sw, sh = small.get_size()
    for y in range(sh):
        for x in range(sw):
            d = math.hypot((x - sw / 2) / (sw / 2), (y - sh / 2) / (sh / 2)) / math.sqrt(2)
            a = int(255 * max(0.0, (d - 0.35) / 0.65) ** 1.5)
            small.set_at((x, y), (*color, min(255, a)))
    return pygame.transform.smoothscale(small, (SCREEN_W, SCREEN_H))


# ---------------------------------------------------------------- byty
class Monster:
    def __init__(self, x, y):
        self.x, self.y = x, y
        self.state = "wander"      # wander / hunt / flee
        self.path = []
        self.repath = 0
        self.target = None
        self.lost_timer = 0
        self.lit_time = 0
        self.flee_timer = 0
        self.anim = 0
        self.last_known = None

    @property
    def tile(self):
        return int(self.x // TILE), int(self.y // TILE)


class Game:
    def __init__(self, sounds, seed=None):
        self.sounds = sounds
        self.rng = random.Random(seed)
        self.font = pygame.font.Font(None, 30)
        self.small = pygame.font.Font(None, 24)
        self.big = pygame.font.Font(None, 96)
        self.noise = make_noise_frames(self.rng)
        self.vignette = make_vignette()
        self.red_vignette = make_vignette((120, 0, 0))
        self.reset()

    # ------------------------------------------------------------ setup
    def reset(self):
        rng = self.rng
        self.grid = generate_maze(MAZE_W, MAZE_H, rng)
        self.map_surf = build_map_surface(self.grid, rng)
        self.map_w = len(self.grid[0]) * TILE
        self.map_h = len(self.grid) * TILE

        start = (1, 1)
        self.px, self.py = TILE * 1.5, TILE * 1.5
        dist = bfs_dist(self.grid, start)
        cells = [c for c in dist if c[0] % 2 == 1 and c[1] % 2 == 1]
        far = sorted(cells, key=lambda c: dist[c])

        self.exit_tile = far[-1]
        # potwor - daleko, ale nie przy wyjsciu
        mid = [c for c in far if dist[c] > dist[far[-1]] * 0.55 and c != self.exit_tile]
        mt = rng.choice(mid)
        self.monster = Monster((mt[0] + 0.5) * TILE, (mt[1] + 0.5) * TILE)

        used = {start, self.exit_tile, mt}
        pool = [c for c in cells if dist[c] > 6 and c not in used]
        rng.shuffle(pool)
        # klucze rozlozone - wybieramy z roznych "odleglosci"
        pool_sorted = sorted(pool, key=lambda c: dist[c])
        thirds = len(pool_sorted) // 3
        self.keys = []
        for i in range(KEYS_NEEDED):
            seg = pool_sorted[i * thirds:(i + 1) * thirds] or pool_sorted
            k = rng.choice(seg)
            self.keys.append(k)
            used.add(k)
        rest = [c for c in pool if c not in used]
        self.batteries = rest[:5]
        self.notes = [(c, NOTES[i]) for i, c in enumerate(rest[5:5 + len(NOTES)])]

        self.keys_found = 0
        self.battery = 100.0
        self.stamina = 100.0
        self.light_on = True
        self.light_angle = 0.0
        self.flicker = 1.0
        self.message = "Gdzie ja jestem...? Muszę znaleźć 3 klucze."
        self.message_t = 5.0
        self.state = "title"
        self.time = 0
        self.step_t = 0
        self.heart_t = 0
        self.creak_t = rng.uniform(8, 18)
        self.shake = 0
        self.dead_t = 0
        self.door_open = False

    # ------------------------------------------------------------ pomocnicze
    def is_wall_at(self, x, y):
        tx, ty = int(x // TILE), int(y // TILE)
        if not (0 <= ty < len(self.grid) and 0 <= tx < len(self.grid[0])):
            return True
        if (tx, ty) == self.exit_tile and not self.door_open:
            return False
        return self.grid[ty][tx] == 1

    def collides(self, x, y, r):
        for ox, oy in ((-r, -r), (r, -r), (-r, r), (r, r), (0, -r), (0, r), (-r, 0), (r, 0)):
            if self.is_wall_at(x + ox, y + oy):
                return True
        return False

    def say(self, text, t=4.0):
        self.message = text
        self.message_t = t

    # ------------------------------------------------------------ update
    def update(self, dt, keys, mouse, cam):
        self.time += dt
        if self.message_t > 0:
            self.message_t -= dt
        if self.shake > 0:
            self.shake = max(0, self.shake - dt * 2)

        if self.state != "play":
            if self.state == "dead":
                self.dead_t += dt
            return

        # --- ruch gracza
        mx = (keys[pygame.K_d] or keys[pygame.K_RIGHT]) - (keys[pygame.K_a] or keys[pygame.K_LEFT])
        my = (keys[pygame.K_s] or keys[pygame.K_DOWN]) - (keys[pygame.K_w] or keys[pygame.K_UP])
        moving = mx or my
        sprint = (keys[pygame.K_LSHIFT] or keys[pygame.K_RSHIFT]) and self.stamina > 1 and moving
        speed = SPRINT_SPEED if sprint else WALK_SPEED
        if sprint:
            self.stamina = max(0, self.stamina - 28 * dt)
        else:
            self.stamina = min(100, self.stamina + 14 * dt)
        if moving:
            l = math.hypot(mx, my)
            vx, vy = mx / l * speed * dt, my / l * speed * dt
            if not self.collides(self.px + vx, self.py, PLAYER_R):
                self.px += vx
            if not self.collides(self.px, self.py + vy, PLAYER_R):
                self.py += vy
            self.step_t -= dt * (1.6 if sprint else 1.0)
            if self.step_t <= 0:
                self.step_t = 0.38
                self.sounds.play("step", 0.5 if sprint else 0.25)

        # --- latarka
        wx, wy = mouse[0] + cam[0], mouse[1] + cam[1]
        target = math.atan2(wy - self.py, wx - self.px)
        self.light_angle += angle_diff(target, self.light_angle) * min(1, dt * 14)
        if self.light_on and self.battery > 0:
            self.battery = max(0, self.battery - BATTERY_DRAIN * dt)
            if self.battery == 0:
                self.say("Bateria padła...", 3)
        light_active = self.light_on and self.battery > 0
        if self.battery < 20:
            self.flicker = 0.0 if self.rng.random() < (0.25 - self.battery / 100) else 1.0
        else:
            self.flicker = 1.0 if self.rng.random() > 0.005 else 0.3

        # --- przedmioty
        ptile = (int(self.px // TILE), int(self.py // TILE))
        if ptile in self.keys:
            self.keys.remove(ptile)
            self.keys_found += 1
            self.sounds.play("pickup", 0.7)
            if self.keys_found == KEYS_NEEDED:
                self.say("Mam wszystkie klucze! Teraz do drzwi...", 4)
            else:
                self.say(f"Klucz ({self.keys_found}/{KEYS_NEEDED}). Coś się poruszyło w ciemności...", 4)
            self.monster.state = "hunt"           # potwor slyszy
            self.monster.last_known = ptile
            self.monster.lost_timer = 3
        if ptile in self.batteries:
            self.batteries.remove(ptile)
            self.battery = min(100, self.battery + 45)
            self.sounds.play("pickup", 0.4)
            self.say("Bateria. Światło wraca.", 2.5)
        for n in list(self.notes):
            if n[0] == ptile:
                self.notes.remove(n)
                self.sounds.play("pickup", 0.3)
                self.say(n[1], 6)
        if ptile == self.exit_tile:
            if self.keys_found >= KEYS_NEEDED:
                self.state = "win"
                self.sounds.stop_all()
                self.sounds.play("door", 0.8)
            elif self.message_t <= 0:
                self.say(f"Drzwi zamknięte. Potrzebuję {KEYS_NEEDED - self.keys_found} kluczy.", 2.5)

        self.update_monster(dt, light_active, sprint)

        # --- atmosfera
        d = math.hypot(self.monster.x - self.px, self.monster.y - self.py)
        closeness = max(0.0, 1 - d / 520)
        self.sounds.set_static(closeness ** 2 * 0.35)
        self.heart_t -= dt
        if closeness > 0.05 and self.heart_t <= 0:
            self.heart_t = 1.1 - 0.7 * closeness
            self.sounds.play("heart", 0.3 + 0.7 * closeness)
        self.creak_t -= dt
        if self.creak_t <= 0:
            self.creak_t = self.rng.uniform(10, 25)
            self.sounds.play("creak", self.rng.uniform(0.2, 0.5))

        if d < PLAYER_R + 14 and self.monster.state != "flee":
            self.state = "dead"
            self.dead_t = 0
            self.shake = 1.5
            self.sounds.stop_all()
            self.sounds.play("scream", 1.0)

    def update_monster(self, dt, light_active, sprint):
        m = self.monster
        m.anim += dt
        d = math.hypot(m.x - self.px, m.y - self.py)
        los = d < 700 and line_of_sight(self.grid, m.x, m.y, self.px, self.py)
        ptile = (int(self.px // TILE), int(self.py // TILE))

        # czy oswietlony?
        lit = False
        if light_active and self.flicker > 0.5 and d < LIGHT_RANGE and los:
            ang = math.atan2(m.y - self.py, m.x - self.px)
            if abs(angle_diff(ang, self.light_angle)) < LIGHT_HALF_ANGLE:
                lit = True
        if lit and m.state != "flee":
            m.lit_time += dt
            if m.lit_time > 0.7:
                m.state = "flee"
                m.flee_timer = 3.5
                m.lit_time = 0
                m.path = []
                self.sounds.play("hiss", 0.8)
                self.shake = 0.4
        elif not lit:
            m.lit_time = max(0, m.lit_time - dt * 0.5)

        # percepcja
        if m.state != "flee":
            sees = los and (d < 230 or (light_active and d < 560))
            hears = sprint and d < 380
            if sees or hears:
                if m.state != "hunt":
                    self.shake = max(self.shake, 0.25)
                m.state = "hunt"
                m.last_known = ptile
                m.lost_timer = 4.0

        speed = 72
        if m.state == "hunt":
            speed = 128 + 14 * self.keys_found
            m.lost_timer -= dt
            if m.lost_timer <= 0:
                m.state = "wander"
                m.path = []
            m.repath -= dt
            if m.repath <= 0 or not m.path:
                m.repath = 0.35
                m.path = bfs(self.grid, m.tile, m.last_known)[1:]
        elif m.state == "flee":
            speed = 150
            m.flee_timer -= dt
            if m.flee_timer <= 0:
                m.state = "wander"
                m.path = []
            if not m.path:
                # uciekaj do komorki daleko od gracza
                dist = bfs_dist(self.grid, ptile)
                cand = [c for c, v in dist.items() if v > 12]
                if cand:
                    m.path = bfs(self.grid, m.tile, self.rng.choice(cand))[1:]
        else:  # wander
            if not m.path:
                # czasem idz w strone gracza - "czuje" go
                if self.rng.random() < 0.35:
                    goal = ptile
                else:
                    gh, gw = len(self.grid), len(self.grid[0])
                    goal = (self.rng.randrange(1, gw, 2), self.rng.randrange(1, gh, 2))
                m.path = bfs(self.grid, m.tile, goal)[1:][:12]

        if m.path:
            tx, ty = m.path[0]
            gx, gy = (tx + 0.5) * TILE, (ty + 0.5) * TILE
            dx, dy = gx - m.x, gy - m.y
            dl = math.hypot(dx, dy)
            step = speed * dt
            if dl <= step:
                m.x, m.y = gx, gy
                m.path.pop(0)
            else:
                m.x += dx / dl * step
                m.y += dy / dl * step
        # ostatni krok bezposrednio do gracza
        if m.state == "hunt" and los and d < TILE * 1.2:
            m.x += (self.px - m.x) / d * speed * dt
            m.y += (self.py - m.y) / d * speed * dt

    # ------------------------------------------------------------ rysowanie
    def camera(self):
        cx = min(max(0, self.px - SCREEN_W / 2), self.map_w - SCREEN_W)
        cy = min(max(0, self.py - SCREEN_H / 2), self.map_h - SCREEN_H)
        return cx, cy

    def draw(self, screen):
        if self.state == "title":
            self.draw_title(screen)
            return
        if self.state == "dead":
            self.draw_jumpscare(screen)
            return

        cx, cy = self.camera()
        if self.shake > 0:
            cx += self.rng.uniform(-1, 1) * 10 * self.shake
            cy += self.rng.uniform(-1, 1) * 10 * self.shake
        screen.blit(self.map_surf, (-cx, -cy))
        t = self.time

        # drzwi
        ex, ey = self.exit_tile
        er = pygame.Rect(ex * TILE + 6 - cx, ey * TILE + 4 - cy, TILE - 12, TILE - 8)
        pygame.draw.rect(screen, (70, 40, 20), er)
        pygame.draw.rect(screen, (30, 15, 5), er, 3)
        pygame.draw.circle(screen, (200, 170, 60), (er.right - 8, er.centery), 3)
        if self.keys_found >= KEYS_NEEDED:
            pygame.draw.rect(screen, (180, 150, 60), er.inflate(6, 6), 2)

        # przedmioty
        for kx, ky in self.keys:
            p = ((kx + 0.5) * TILE - cx, (ky + 0.5) * TILE - cy + math.sin(t * 3 + kx) * 3)
            pygame.draw.circle(screen, (220, 190, 70), (int(p[0] - 6), int(p[1])), 7, 3)
            pygame.draw.line(screen, (220, 190, 70), (p[0], p[1]), (p[0] + 12, p[1]), 3)
            pygame.draw.line(screen, (220, 190, 70), (p[0] + 9, p[1]), (p[0] + 9, p[1] + 5), 2)
        for bx, by in self.batteries:
            r = pygame.Rect(0, 0, 10, 18)
            r.center = ((bx + 0.5) * TILE - cx, (by + 0.5) * TILE - cy)
            pygame.draw.rect(screen, (60, 160, 70), r)
            pygame.draw.rect(screen, (200, 200, 200), (r.centerx - 2, r.y - 3, 5, 3))
        for (nx, ny), _ in self.notes:
            r = pygame.Rect(0, 0, 16, 20)
            r.center = ((nx + 0.5) * TILE - cx, (ny + 0.5) * TILE - cy)
            pygame.draw.rect(screen, (200, 195, 170), r)
            for i in range(3):
                pygame.draw.line(screen, (90, 80, 70), (r.x + 3, r.y + 5 + i * 5), (r.right - 3, r.y + 5 + i * 5))

        # potwor
        m = self.monster
        mx, my = m.x - cx, m.y - cy
        self.draw_monster(screen, mx, my, m)

        # gracz
        px, py = self.px - cx, self.py - cy
        pygame.draw.circle(screen, (90, 100, 120), (int(px), int(py)), PLAYER_R)
        pygame.draw.circle(screen, (40, 45, 55), (int(px), int(py)), PLAYER_R, 2)
        hx = px + math.cos(self.light_angle) * 10
        hy = py + math.sin(self.light_angle) * 10
        pygame.draw.circle(screen, (180, 180, 160), (int(hx), int(hy)), 4)

        # ciemnosc + swiatlo
        dark = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        dark.fill((0, 0, 0, 252))
        light_active = self.light_on and self.battery > 0 and self.flicker > 0.5
        rng_mult = 0.55 + 0.45 * min(1, self.battery / 40)
        if light_active:
            rays = 70
            rmax = LIGHT_RANGE * rng_mult
            dists = []
            for i in range(rays + 1):
                a = self.light_angle - LIGHT_HALF_ANGLE + 2 * LIGHT_HALF_ANGLE * i / rays
                dists.append((a, cast_ray(self.grid, self.px, self.py, a, rmax)))
            for frac, alpha in ((1.0, 165), (0.8, 100), (0.6, 40), (0.4, 0)):
                pts = [(px, py)]
                for a, dd in dists:
                    r = min(dd + 8, rmax * frac)
                    pts.append((px + math.cos(a) * r, py + math.sin(a) * r))
                pygame.draw.polygon(dark, (0, 0, 0, alpha), pts)
        # mala poswiata wokol gracza
        amb = []
        for i in range(36):
            a = i / 36 * math.tau
            r = min(cast_ray(self.grid, self.px, self.py, a, 58) + 4, 58)
            amb.append((px + math.cos(a) * r, py + math.sin(a) * r))
        pygame.draw.polygon(dark, (0, 0, 0, 150 if light_active else 120), amb)
        screen.blit(dark, (0, 0))

        # oczy potwora swieca w ciemnosci
        d = math.hypot(m.x - self.px, m.y - self.py)
        if d < 420 and line_of_sight(self.grid, self.px, self.py, m.x, m.y):
            glow = int(120 + 120 * abs(math.sin(t * 2.3)))
            for side in (-7, 7):
                pygame.draw.circle(screen, (glow, 10, 10), (int(mx + side), int(my - 18)), 3)

        # efekty
        closeness = max(0.0, 1 - d / 520)
        if closeness > 0:
            nf = self.noise[int(t * 30) % len(self.noise)]
            nf.set_alpha(int(closeness ** 1.5 * 90))
            screen.blit(nf, (0, 0))
            self.red_vignette.set_alpha(int(closeness * 255 * (0.6 + 0.4 * math.sin(t * 6))))
            screen.blit(self.red_vignette, (0, 0))
        screen.blit(self.vignette, (0, 0))
        nf = self.noise[int(t * 24 + 2) % len(self.noise)]
        nf.set_alpha(8)
        screen.blit(nf, (0, 0))

        self.draw_hud(screen)
        if self.state == "win":
            self.draw_end(screen, "UDAŁO CI SIĘ UCIEC", (200, 200, 180),
                          f"Czas: {int(self.time)} s    [R] - jeszcze raz")

    def draw_monster(self, screen, x, y, m):
        t = m.anim
        sway = math.sin(t * 4) * 3
        body = []
        for i in range(14):
            a = i / 14 * math.tau
            r = 16 + 4 * math.sin(a * 3 + t * 6)
            body.append((x + math.cos(a) * r * 0.8 + sway, y + math.sin(a) * r * 1.4 - 4))
        pygame.draw.polygon(screen, (8, 6, 8), body)
        # rece / macki
        for k in range(4):
            a = k / 4 * math.tau + t
            l = 22 + 8 * math.sin(t * 5 + k)
            pygame.draw.line(screen, (12, 8, 10), (x, y), (x + math.cos(a) * l, y + math.sin(a) * l), 3)
        col = (255, 40, 40) if m.state == "hunt" else (200, 200, 200)
        for side in (-7, 7):
            pygame.draw.circle(screen, col, (int(x + side + sway), int(y - 18)), 3)
        # usta
        pygame.draw.arc(screen, (120, 0, 0), (x - 8 + sway, y - 12, 16, 10), math.pi, math.tau, 2)

    def draw_hud(self, screen):
        # bateria
        pygame.draw.rect(screen, (30, 30, 30), (20, 20, 124, 18))
        bc = (70, 170, 80) if self.battery > 30 else (200, 160, 40) if self.battery > 12 else (200, 50, 40)
        pygame.draw.rect(screen, bc, (22, 22, int(120 * self.battery / 100), 14))
        screen.blit(self.small.render("LATARKA" + ("" if self.light_on else " (OFF)"), True, (150, 150, 150)), (150, 20))
        # stamina
        pygame.draw.rect(screen, (30, 30, 30), (20, 44, 124, 10))
        pygame.draw.rect(screen, (110, 130, 170), (22, 46, int(120 * self.stamina / 100), 6))
        # klucze
        txt = self.font.render(f"Klucze: {self.keys_found}/{KEYS_NEEDED}", True, (210, 185, 90))
        screen.blit(txt, (SCREEN_W - txt.get_width() - 20, 20))
        # wiadomosc
        if self.message_t > 0:
            a = int(255 * min(1, self.message_t))
            s = self.font.render(self.message, True, (210, 205, 195))
            s.set_alpha(a)
            screen.blit(s, (SCREEN_W / 2 - s.get_width() / 2, SCREEN_H - 60))

    def draw_title(self, screen):
        screen.fill((0, 0, 0))
        t = self.time
        flick = 1 if self.rng.random() > 0.04 else 0.3
        col = (int(170 * flick), int(20 * flick), int(20 * flick))
        title = self.big.render("SZEPT W CIEMNOŚCI", True, col)
        jx = self.rng.randint(-2, 2) if self.rng.random() < 0.1 else 0
        screen.blit(title, (SCREEN_W / 2 - title.get_width() / 2 + jx, 150))
        lines = [
            "WASD - ruch     SHIFT - bieg (hałasuje)",
            "Mysz - latarka     F / PPM - włącz/wyłącz",
            "",
            "Znajdź 3 klucze i dotrzyj do drzwi.",
            "Ono nie lubi światła... ale światło je przyciąga.",
        ]
        for i, l in enumerate(lines):
            s = self.font.render(l, True, (150, 150, 150))
            screen.blit(s, (SCREEN_W / 2 - s.get_width() / 2, 290 + i * 34))
        if int(t * 2) % 2 == 0:
            s = self.font.render("[ENTER] - zacznij", True, (220, 220, 220))
            screen.blit(s, (SCREEN_W / 2 - s.get_width() / 2, 500))
        # oczy w ciemnosci
        if int(t * 0.7) % 3 == 0:
            for ex, ey in ((140, 520), (820, 90)):
                for side in (-8, 8):
                    pygame.draw.circle(screen, (180, 20, 20), (ex + side, ey), 3)
        nf = self.noise[int(t * 24) % len(self.noise)]
        nf.set_alpha(25)
        screen.blit(nf, (0, 0))

    def draw_jumpscare(self, screen):
        t = self.dead_t
        if t < 1.4:
            # twarz
            shake = (1.4 - t) * 30
            ox = self.rng.uniform(-shake, shake)
            oy = self.rng.uniform(-shake, shake)
            screen.fill((25, 0, 0) if int(t * 20) % 2 else (5, 0, 0))
            cx, cy = SCREEN_W / 2 + ox, SCREEN_H / 2 + oy
            scale = 1 + t * 0.6
            pygame.draw.ellipse(screen, (12, 8, 10),
                                (cx - 260 * scale, cy - 300 * scale, 520 * scale, 640 * scale))
            for side in (-1, 1):
                ex, ey = cx + side * 100 * scale, cy - 90 * scale
                pygame.draw.circle(screen, (240, 240, 230), (int(ex), int(ey)), int(48 * scale))
                pygame.draw.circle(screen, (200, 0, 0), (int(ex + ox * 0.3), int(ey)), int(14 * scale))
                pygame.draw.circle(screen, (0, 0, 0), (int(ex + ox * 0.3), int(ey)), int(6 * scale))
            mouth = pygame.Rect(0, 0, 300 * scale, 200 * scale)
            mouth.center = (cx, cy + 130 * scale)
            pygame.draw.ellipse(screen, (60, 0, 0), mouth)
            teeth = 11
            for i in range(teeth):
                x0 = mouth.x + mouth.w * (i + 0.5) / teeth
                w = mouth.w / teeth / 2
                pygame.draw.polygon(screen, (230, 225, 200),
                                    [(x0 - w, mouth.y + 25 * scale), (x0 + w, mouth.y + 25 * scale),
                                     (x0, mouth.y + 70 * scale)])
                pygame.draw.polygon(screen, (230, 225, 200),
                                    [(x0 - w, mouth.bottom - 25 * scale), (x0 + w, mouth.bottom - 25 * scale),
                                     (x0, mouth.bottom - 65 * scale)])
            nf = self.noise[int(t * 40) % len(self.noise)]
            nf.set_alpha(110)
            screen.blit(nf, (0, 0))
        else:
            screen.fill((0, 0, 0))
            self.draw_end(screen, "ZŁAPAŁO CIĘ", (170, 20, 20),
                          f"Klucze: {self.keys_found}/{KEYS_NEEDED}    [R] - spróbuj ponownie")

    def draw_end(self, screen, title, color, sub):
        shade = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        shade.fill((0, 0, 0, 200))
        screen.blit(shade, (0, 0))
        s = self.big.render(title, True, color)
        screen.blit(s, (SCREEN_W / 2 - s.get_width() / 2, SCREEN_H / 2 - 80))
        s = self.font.render(sub, True, (170, 170, 170))
        screen.blit(s, (SCREEN_W / 2 - s.get_width() / 2, SCREEN_H / 2 + 20))


# ---------------------------------------------------------------- petla gry
def main():
    pygame.init()
    screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
    pygame.display.set_caption("Szept w Ciemności")
    clock = pygame.time.Clock()
    sounds = Sounds()
    game = Game(sounds)

    while True:
        dt = min(clock.tick(FPS) / 1000, 0.05)
        for e in pygame.event.get():
            if e.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if e.type == pygame.KEYDOWN:
                if e.key == pygame.K_ESCAPE:
                    pygame.quit()
                    sys.exit()
                if game.state == "title" and e.key in (pygame.K_RETURN, pygame.K_SPACE):
                    game.state = "play"
                    game.time = 0
                elif game.state == "play" and e.key == pygame.K_f:
                    game.light_on = not game.light_on
                elif game.state in ("dead", "win") and e.key == pygame.K_r:
                    sounds.stop_all()
                    sounds.restart_loops()
                    game.reset()
                    game.state = "play"
            if e.type == pygame.MOUSEBUTTONDOWN and e.button == 3 and game.state == "play":
                game.light_on = not game.light_on

        game.update(dt, pygame.key.get_pressed(), pygame.mouse.get_pos(), game.camera())
        game.draw(screen)
        pygame.display.flip()


if __name__ == "__main__":
    main()
