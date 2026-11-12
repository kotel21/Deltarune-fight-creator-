/**
 * Sprawdzanie spójności projektu walki: czy wszystkie odwołania (grafiki, dźwięki, ataki, pociski)
 * wskazują na istniejące elementy i czy liczby mają sensowne wartości.
 * Zwraca listę czytelnych komunikatów — pusta lista oznacza, że projekt jest poprawny.
 */
import { COMMAND_IDS, type EffectDef, FORMAT_NAME, type FightProject, type MusicDef } from './types';

export function validateProject(p: FightProject): string[] {
  const out: string[] = [];
  const err = (msg: string) => out.push(msg);
  if (p.format !== FORMAT_NAME) err(`Nieznany format pliku: "${String(p.format)}".`);

  const sprite = (id: string | undefined, where: string, required = true) => {
    if (!id) {
      if (required) err(`${where}: nie wybrano grafiki.`);
      return;
    }
    if (!p.sprites[id]) err(`${where}: grafika "${id}" nie istnieje.`);
  };
  const sound = (id: string | undefined, where: string) => {
    if (id && !p.sounds[id]) err(`${where}: dźwięk "${id}" nie istnieje.`);
  };
  const music = (m: MusicDef | undefined, where: string) => {
    if (!m) return;
    sound(m.sound, where);
    if (m.loopStart !== undefined && m.loopStart < 0) err(`${where}: początek pętli nie może być ujemny.`);
    if (m.loopEnd && m.loopStart !== undefined && m.loopEnd <= m.loopStart) err(`${where}: koniec pętli musi być późniejszy niż początek.`);
  };
  const unique = (ids: string[], what: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id) err(`${what}: pusty identyfikator.`);
      if (seen.has(id)) err(`${what}: powtórzony identyfikator "${id}".`);
      seen.add(id);
    }
  };
  const effects = (list: EffectDef[], where: string, stateNames: Set<string> | null) => {
    for (const e of list) {
      if (e.type === 'setState' && e.state && stateNames && !stateNames.has(e.state)) err(`${where}: stan "${e.state}" nie jest zdefiniowany u tego wroga.`);
      if ((e.type === 'mercy' || e.type === 'damage' || e.type === 'heal' || e.type === 'tp') && !Number.isFinite(e.amount)) err(`${where}: efekt "${e.type}" ma nieprawidłową wartość.`);
      if (e.type === 'stat' && !(e.mult > 0)) err(`${where}: mnożnik statystyki musi być dodatni.`);
    }
  };

  for (const [id, s] of Object.entries(p.sprites)) {
    if (!s.src) err(`Grafika "${id}": brak źródła obrazu.`);
    if (!(s.frameW > 0) || !(s.frameH > 0)) err(`Grafika "${id}": rozmiar klatki musi być większy od zera.`);
    if (!(s.frames >= 1)) err(`Grafika "${id}": liczba klatek musi wynosić co najmniej 1.`);
    if (!(s.fps > 0)) err(`Grafika "${id}": prędkość animacji musi być większa od zera.`);
  }

  // drużyna
  if (p.party.length < 1 || p.party.length > 3) err('Drużyna musi mieć od 1 do 3 postaci.');
  unique(p.party.map((m) => m.id), 'Drużyna');
  for (const m of p.party) {
    const w = `Postać "${m.name}"`;
    if (!(m.maxHp > 0)) err(`${w}: HP musi być większe od zera.`);
    sprite(m.sprites.idle, `${w} (idle)`);
    sprite(m.sprites.attack, `${w} (atak)`);
    sprite(m.sprites.hurt, `${w} (obrażenia)`);
    sprite(m.sprites.defend, `${w} (obrona)`);
    sprite(m.sprites.down, `${w} (powalenie)`, false);
    sound(m.voice?.sound, `${w} (głos)`);
    unique(m.spells.map((s) => s.id), `${w}: czary`);
    for (const s of m.spells) {
      if (s.tpCost < 0 || s.tpCost > 100) err(`${w}: czar "${s.name}" ma koszt TP poza zakresem 0–100.`);
      effects(s.effects, `${w}: czar "${s.name}"`, null);
    }
  }

  // przeciwnicy
  if (p.enemies.length < 1 || p.enemies.length > 3) err('W walce musi być od 1 do 3 przeciwników.');
  unique(p.enemies.map((e) => e.id), 'Przeciwnicy');
  const enemyIds = new Set(p.enemies.map((e) => e.id));
  for (const e of p.enemies) {
    const w = `Przeciwnik "${e.name}"`;
    if (!(e.maxHp > 0)) err(`${w}: HP musi być większe od zera.`);
    sprite(e.sprites.idle, `${w} (idle)`);
    sprite(e.sprites.hurt, `${w} (obrażenia)`, false);
    sprite(e.sprites.attack, `${w} (atak)`, false);
    sound(e.voice?.sound, `${w} (głos)`);
    const states = new Set(Object.keys(e.states ?? {}));
    unique(e.acts.map((a) => a.id), `${w}: akcje`);
    for (const a of e.acts) {
      if ((a.tpCost ?? 0) < 0 || (a.tpCost ?? 0) > 100) err(`${w}: akcja "${a.name}" ma koszt TP poza zakresem 0–100.`);
      effects(a.effects, `${w}: akcja "${a.name}"`, states);
    }
  }

  // przedmioty
  unique(p.items.map((i) => i.id), 'Przedmioty');
  for (const it of p.items) effects(it.effects, `Przedmiot "${it.name}"`, null);

  // pociski i ataki
  unique(p.bulletTypes.map((b) => b.id), 'Typy pocisków');
  const bulletIds = new Set(p.bulletTypes.map((b) => b.id));
  for (const b of p.bulletTypes) {
    sprite(b.sprite, `Pocisk "${b.name}"`);
    if (b.hitbox.shape === 'circle' ? !(b.hitbox.r > 0) : !(b.hitbox.w > 0 && b.hitbox.h > 0)) err(`Pocisk "${b.name}": obszar trafienia musi mieć dodatni rozmiar.`);
  }
  unique(p.attacks.map((a) => a.id), 'Ataki');
  const attackIds = new Set(p.attacks.map((a) => a.id));
  for (const a of p.attacks) {
    const w = `Atak "${a.name}"`;
    if (!(a.duration > 0)) err(`${w}: czas trwania musi być większy od zera.`);
    if (!(a.box.w > 0 && a.box.h > 0)) err(`${w}: pudełko musi mieć dodatni rozmiar.`);
    if (a.owner && !enemyIds.has(a.owner)) err(`${w}: właściciel "${a.owner}" nie jest przeciwnikiem w tej walce.`);
    unique(a.spawns.map((s) => s.id), `${w}: zdarzenia`);
    for (const s of a.spawns) {
      if (!bulletIds.has(s.bullet)) err(`${w}: nieznany typ pocisku "${s.bullet}".`);
      if (s.time < 0) err(`${w}: zdarzenie "${s.id}" zaczyna się przed startem ataku.`);
      if (s.time > a.duration) err(`${w}: zdarzenie "${s.id}" zaczyna się po końcu ataku.`);
    }
  }

  // fazy
  if (!p.phases.length) err('Walka musi mieć co najmniej jedną fazę.');
  unique(p.phases.map((f) => f.id), 'Fazy');
  p.phases.forEach((f, i) => {
    const w = `Faza "${f.name}"`;
    if (i > 0 && !f.triggers.length) err(`${w}: brak warunku wejścia — faza nigdy się nie zacznie.`);
    for (const id of f.attacks) if (!attackIds.has(id)) err(`${w}: atak "${id}" nie istnieje.`);
    for (const t of f.triggers) {
      if ((t.type === 'hpBelow' || t.type === 'mercyAbove') && t.enemy !== '*' && !enemyIds.has(t.enemy)) err(`${w}: warunek odwołuje się do nieznanego wroga "${t.enemy}".`);
    }
    for (const s of f.enterStates ?? []) {
      const e = p.enemies.find((x) => x.id === s.enemy);
      if (!e) err(`${w}: stan dla nieznanego wroga "${s.enemy}".`);
      else if (s.state && !e.states?.[s.state]) err(`${w}: wróg "${e.name}" nie ma stanu "${s.state}".`);
    }
    music(f.music, `${w} (muzyka)`);
  });

  // tło i interfejs
  for (const l of p.background.layers) if (l.type === 'image' || l.type === 'scroll') sprite(l.sprite, 'Tło');
  for (const c of COMMAND_IDS) sprite(p.ui.icons[c], `Ikona przycisku ${c.toUpperCase()}`);
  sprite(p.ui.soul, 'Serduszko (SOUL)');
  sprite(p.ui.fx.slash, 'Efekt cięcia');
  sprite(p.ui.fx.hit, 'Efekt trafienia');
  sprite(p.ui.fx.heal, 'Efekt leczenia');
  sprite(p.ui.fx.sparkle, 'Efekt iskierek');
  for (const [ev, id] of Object.entries(p.sfx)) sound(id, `Efekt dźwiękowy "${ev}"`);
  sound(p.narratorVoice?.sound, 'Głos narratora');
  return out;
}
