/**
 * MODEL DANYCH WALKI
 * ------------------
 * Cała walka (drużyna, przeciwnicy, ataki, fazy, muzyka, grafiki) to jeden obiekt FightProject,
 * który da się zapisać jako JSON. Ten sam format czyta silnik walki, edytor oraz zapis/eksport.
 *
 * Konwencje:
 *  - współrzędne ekranu w pikselach bazowej rozdzielczości 640x480,
 *  - kąty w stopniach: 0 = w prawo, 90 = w dół, 180 = w lewo, 270 = w górę,
 *  - czasy w sekundach, prędkości w pikselach na sekundę,
 *  - grafiki i dźwięki wskazuje się przez identyfikator z tabel `sprites` / `sounds`.
 */

export const FORMAT_NAME = 'fight-creator';
export const FORMAT_VERSION = 1;

// ---------------------------------------------------------------------------------------------
//  Zasoby
// ---------------------------------------------------------------------------------------------

/** Sprite = spritesheet z jedną animacją klatkową (klatki ułożone od lewej do prawej, wierszami). */
export interface SpriteDef {
  /** Źródło obrazu: 'builtin:<nazwa>' (wbudowane), adres URL albo data URL (wgrany plik). */
  src: string;
  /** Rozmiar jednej klatki w pikselach obrazu. */
  frameW: number;
  frameH: number;
  /** Liczba klatek animacji. */
  frames: number;
  /** Prędkość animacji (klatki na sekundę). */
  fps: number;
  /** Czy animacja się zapętla (domyślnie tak). */
  loop?: boolean;
  /** Powiększenie na ekranie (domyślnie 2 — pixel-art rysowany w połowie rozdzielczości). */
  scale?: number;
  /** Punkt zaczepienia w klatce (np. środek stóp postaci). Domyślnie środek klatki. */
  originX?: number;
  originY?: number;
}

/** Plik dźwiękowy (muzyka lub efekt). */
export interface SoundDef {
  /** 'builtin:<nazwa>', adres URL albo data URL (wgrany MP3/OGG/WAV). */
  src: string;
  name?: string;
}

/** Ustawienia odtwarzania muzyki. */
export interface MusicDef {
  /** Identyfikator z tabeli `sounds`. */
  sound: string;
  /** Głośność 0..1 (domyślnie 1). */
  volume?: number;
  /** Czy zapętlać (domyślnie tak). */
  loop?: boolean;
  /** Początek pętli w sekundach — po dojściu do loopEnd utwór wraca tutaj (domyślnie 0). */
  loopStart?: number;
  /** Koniec pętli w sekundach (domyślnie koniec utworu). */
  loopEnd?: number;
}

/** "Głos" postaci — dźwięk blipa przy pisaniu tekstu. */
export interface VoiceDef {
  /** Własny dźwięk z tabeli `sounds` (ma pierwszeństwo). */
  sound?: string;
  /** Kształt fali syntezowanego blipa. */
  wave?: 'square' | 'triangle' | 'saw' | 'sine' | 'noise';
  /** Wysokość dźwięku w Hz. */
  pitch?: number;
}

// ---------------------------------------------------------------------------------------------
//  Efekty akcji (ACT / MAGIC / ITEM)
// ---------------------------------------------------------------------------------------------

export type EffectDef =
  /** Dodaje punkty Mercy (w procentach) celowi albo wszystkim wrogom. */
  | { type: 'mercy'; amount: number; all?: boolean }
  /** Zadaje stałe obrażenia wrogowi (pomniejszone o jego obronę). */
  | { type: 'damage'; amount: number; all?: boolean }
  /** Leczy sojusznika (cel akcji, `self` = wykonawca, `all` = cała drużyna). Leczenie podnosi powalonych. */
  | { type: 'heal'; amount: number; all?: boolean; self?: boolean }
  /** Zmienia TP (może być ujemne). */
  | { type: 'tp'; amount: number }
  /** Zmienia zachowanie wroga — przełącza go w stan zdefiniowany w EnemyDef.states ('' = stan domyślny). */
  | { type: 'setState'; state: string; all?: boolean }
  /** Mnoży statystykę wroga do końca walki (np. mult 0.8 = -20% ataku). */
  | { type: 'stat'; stat: 'attack' | 'defense'; mult: number; all?: boolean };

/** Kogo dotyczy akcja. */
export type TargetKind = 'enemy' | 'allEnemies' | 'ally' | 'party' | 'self' | 'none';

// ---------------------------------------------------------------------------------------------
//  Drużyna
// ---------------------------------------------------------------------------------------------

export interface SpellDef {
  id: string;
  name: string;
  description: string;
  /** Koszt w TP (procenty paska). */
  tpCost: number;
  target: TargetKind;
  /** Tekst pokazywany przy rzucaniu. Dostępne: {user}, {target}. */
  text: string[];
  effects: EffectDef[];
  /** Sprite efektu odtwarzany na celu (domyślnie zależny od efektów). */
  fx?: string;
}

export interface PartyMemberDef {
  id: string;
  name: string;
  /** Kolor postaci w interfejsie ('#rrggbb'). */
  color: string;
  maxHp: number;
  attack: number;
  defense: number;
  /** Sprite'y poszczególnych animacji. */
  sprites: {
    idle: string;
    attack: string;
    hurt: string;
    defend: string;
    /** Opcjonalnie: animacja powalenia (domyślnie ostatnia klatka `hurt`, przyciemniona). */
    down?: string;
  };
  voice?: VoiceDef;
  spells: SpellDef[];
  /** Które przyciski menu są dostępne dla tej postaci (domyślnie wszystkie). */
  commands?: Partial<Record<CommandId, boolean>>;
}

export type CommandId = 'fight' | 'act' | 'magic' | 'item' | 'spare' | 'defend';
export const COMMAND_IDS: readonly CommandId[] = ['fight', 'act', 'magic', 'item', 'spare', 'defend'];

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  /** Ile sztuk jest w ekwipunku na początku walki. */
  count: number;
  target: TargetKind;
  /** Tekst użycia. Dostępne: {user}, {target}, {item}. */
  text: string[];
  effects: EffectDef[];
}

// ---------------------------------------------------------------------------------------------
//  Przeciwnicy
// ---------------------------------------------------------------------------------------------

export interface ActDef {
  id: string;
  name: string;
  description: string;
  /** Opcjonalny koszt TP. */
  tpCost?: number;
  /** Strony tekstu. Dostępne: {user}, {target}, {hp}, {maxHp}, {atk}, {def}, {mercy}. */
  text: string[];
  effects: EffectDef[];
}

/** Warunki oszczędzenia przeciwnika (SPARE). */
export interface SpareDef {
  /** Wymagany poziom Mercy w procentach (zwykle 100). 0 lub brak = warunek wyłączony. */
  mercy?: number;
  /** Można oszczędzić, gdy HP spadnie do tego procentu lub niżej. */
  hpBelowPct?: number;
  /** Można oszczędzić od tej tury (liczonej od 1). */
  afterTurn?: number;
  /** 'any' = wystarczy jeden spełniony warunek (domyślnie), 'all' = muszą być spełnione wszystkie. */
  mode?: 'any' | 'all';
  /** Ile Mercy dodaje nieudana próba oszczędzenia. */
  failMercy?: number;
}

/** Stan (zachowanie) przeciwnika, w który mogą go wprowadzić akcje ACT lub zmiana fazy. */
export interface EnemyStateDef {
  /** Etykieta pokazywana przy wrogu, np. "ŚPIĄCY". */
  label?: string;
  attackMult?: number;
  defenseMult?: number;
  /** Mnożnik prędkości pocisków w atakach tego wroga. */
  bulletSpeedMult?: number;
  /** Mnożnik zdobywanego Mercy. */
  mercyMult?: number;
  /** Kwestie w dymku używane w tym stanie (zamiast zwykłych). */
  dialog?: string[];
  /** Teksty narratora na początku tury gracza w tym stanie. */
  flavor?: string[];
  /** Kolor podbarwienia sprite'a. */
  tint?: string;
  /** Po ilu turach stan mija (brak = trwa do zmiany). */
  turns?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  attack: number;
  defense: number;
  /** Nagrody po pokonaniu (EXP tylko za pokonanie, monety także za oszczędzenie). */
  exp: number;
  gold: number;
  sprites: {
    idle: string;
    hurt?: string;
    /** Animacja używana podczas tury wroga. */
    attack?: string;
  };
  voice?: VoiceDef;
  acts: ActDef[];
  dialog: {
    /** Kwestie w dymku przed atakiem. */
    lines: string[];
    order: 'sequence' | 'random';
    /** Kwestie, gdy HP spadnie poniżej 35%. */
    lowHp?: string[];
    /** Kwestie, gdy wroga można już oszczędzić. */
    spareable?: string[];
  };
  /** Teksty narratora wyświetlane w menu gracza. */
  flavor: string[];
  spare: SpareDef;
  states?: Record<string, EnemyStateDef>;
  texts?: {
    defeated?: string;
    spared?: string;
    spareFail?: string;
  };
}

// ---------------------------------------------------------------------------------------------
//  Pociski i ataki
// ---------------------------------------------------------------------------------------------

export type HitboxDef = { shape: 'circle'; r: number } | { shape: 'box'; w: number; h: number };

export interface BulletTypeDef {
  id: string;
  name: string;
  sprite: string;
  /** Obszar trafienia w pikselach ekranu (zwykle trochę mniejszy niż grafika). */
  hitbox: HitboxDef;
  /** Mnożnik obrażeń (1 = normalne). */
  damage: number;
  /** 'direction' = grafika obraca się zgodnie z kierunkiem lotu, 'none' = bez obrotu. */
  rotate: 'none' | 'direction';
  /** Czy pocisk zostaje po trafieniu gracza (domyślnie znika). */
  persist?: boolean;
}

export type MotionKind = 'straight' | 'wave' | 'homing' | 'circle';

/** Zdarzenie na osi czasu ataku: wystrzelenie pocisku lub całej serii. */
export interface SpawnDef {
  id: string;
  /** Moment startu (s od początku ataku). */
  time: number;
  /** Identyfikator typu pocisku. */
  bullet: string;
  /** Punkt odniesienia pozycji: środek pudełka (domyślnie), aktualna pozycja serduszka albo wróg-właściciel ataku. */
  origin?: 'box' | 'soul' | 'enemy';
  /** Pozycja startowa względem punktu odniesienia. */
  x: number;
  y: number;
  /** Kierunek lotu w stopniach. */
  angle: number;
  /** Celuj w serduszko w chwili wystrzału (angle działa wtedy jako odchylenie). */
  aim?: boolean;
  /** Prędkość (px/s) i przyspieszenie (px/s²). */
  speed: number;
  accel?: number;
  /** Wzór ruchu. */
  motion: MotionKind;
  /** Fala: amplituda (px) i częstotliwość (Hz). */
  waveAmp?: number;
  waveFreq?: number;
  /** Naprowadzanie: maks. prędkość skrętu (°/s) i czas naprowadzania (s). */
  homingTurn?: number;
  homingTime?: number;
  /** Okrąg: promień (px), prędkość kątowa (°/s), kąt startowy na okręgu (°), zmiana promienia (px/s). */
  orbitRadius?: number;
  orbitSpeed?: number;
  orbitPhase?: number;
  orbitGrow?: number;
  /** Okrąg: o ile rośnie promień każdego kolejnego pocisku w serii (do budowania "ramion"). */
  orbitRadiusStep?: number;
  /** Seria: liczba pocisków i rozrzut kątowy (360 = pełny pierścień). */
  count?: number;
  spread?: number;
  /** Powtórzenia serii: ile razy, co ile sekund, o ile zmienia się kąt/pozycja przy każdym powtórzeniu. */
  repeat?: number;
  interval?: number;
  angleStep?: number;
  xStep?: number;
  yStep?: number;
  /** Losowość: ± pozycja (px), ± kąt (°), ± prędkość (px/s). */
  jitterX?: number;
  jitterY?: number;
  jitterAngle?: number;
  jitterSpeed?: number;
  /** Czas ostrzeżenia (s): pocisk pojawia się półprzezroczysty i nie rani, dopiero potem rusza. */
  warn?: number;
  /** Czas życia (s); 0 lub brak = do wylotu poza ekran / końca ataku. */
  life?: number;
  /** Obrót grafiki (°/s). */
  spin?: number;
  /** Dodatkowe powiększenie. */
  scale?: number;
}

export interface BoxDef {
  shape: 'rect' | 'ellipse';
  w: number;
  h: number;
  /** Przesunięcie środka pudełka względem domyślnej pozycji. */
  offsetX?: number;
  offsetY?: number;
}

export interface AttackDef {
  id: string;
  name: string;
  /** Wróg-właściciel: atak jest dostępny tylko, gdy ten wróg bierze udział w walce. Brak = atak wspólny. */
  owner?: string;
  /** Czas trwania (s). */
  duration: number;
  box: BoxDef;
  /** Kogo ranią trafienia: losowy członek drużyny (domyślnie) albo wszyscy. */
  target?: 'random' | 'all';
  spawns: SpawnDef[];
}

// ---------------------------------------------------------------------------------------------
//  Fazy walki
// ---------------------------------------------------------------------------------------------

export type TriggerDef =
  /** HP wroga (albo '*' = łączne HP wszystkich) spadło do podanego procentu. */
  | { type: 'hpBelow'; enemy: string; pct: number }
  /** Nadeszła tura o podanym numerze (liczone od 1). */
  | { type: 'turn'; turn: number }
  /** W walce zostało najwyżej tylu wrogów. */
  | { type: 'enemiesLeft'; count: number }
  /** Mercy wroga (albo '*' = dowolnego) osiągnęło podany procent. */
  | { type: 'mercyAbove'; enemy: string; pct: number };

export interface PhaseDef {
  id: string;
  name: string;
  /** Warunki wejścia (wystarczy jeden). Pierwsza faza zaczyna się od razu. */
  triggers: TriggerDef[];
  /** Kolejność ataków: po kolei albo losowo. */
  order: 'sequence' | 'random';
  /** Identyfikatory ataków używanych w tej fazie. */
  attacks: string[];
  music?: MusicDef;
  /** Tekst narratora przy wejściu w fazę. */
  enterText?: string[];
  /** Stany, w które wchodzą wrogowie przy wejściu w fazę. */
  enterStates?: { enemy: string; state: string }[];
}

// ---------------------------------------------------------------------------------------------
//  Tło, interfejs, zasady
// ---------------------------------------------------------------------------------------------

export type BgLayerDef =
  /** Nieruchomy obraz rozciągnięty na ekran lub powtarzany. */
  | { type: 'image'; sprite: string; mode?: 'stretch' | 'tile' | 'center'; opacity?: number }
  /** Przewijany, powtarzany obraz. */
  | { type: 'scroll'; sprite: string; speedX: number; speedY: number; opacity?: number }
  /** Animowana siatka. */
  | { type: 'grid'; color: string; size: number; speedX: number; speedY: number; lineWidth?: number; opacity?: number }
  /** Pulsująca poświata. */
  | { type: 'pulse'; color: string; speed: number; minOpacity?: number; maxOpacity?: number };

export interface BackgroundDef {
  /** Kolor bazowy. */
  color: string;
  layers: BgLayerDef[];
}

export interface UiDef {
  /** Napisy na przyciskach akcji. */
  labels: Record<CommandId, string>;
  /** Sprite'y ikon przycisków. */
  icons: Record<CommandId, string>;
  /** Sprite serduszka. */
  soul: string;
  /** Sprite'y efektów. */
  fx: { slash: string; hit: string; heal: string; sparkle: string };
  colors: {
    panel: string;
    border: string;
    text: string;
    dim: string;
    tp: string;
    tpMax: string;
    mercy: string;
    hpBack: string;
    box: string;
    boxFill: string;
    damage: string;
    heal: string;
  };
}

export interface RulesDef {
  /** TP na start (0..100). */
  startTp: number;
  /** TP za pierwsze otarcie się o pocisk i za każde kolejne ćwierć sekundy przy nim. */
  tpGraze: number;
  tpGrazeHold: number;
  /** TP za DEFEND. */
  tpDefend: number;
  /** Mnożnik obrażeń podczas obrony. */
  defendMult: number;
  /** Czas nietykalności po trafieniu (s). */
  iframes: number;
  /** Prędkość serduszka (px/s); przytrzymanie X spowalnia o połowę. */
  soulSpeed: number;
  /** Promień trafienia serduszka i promień otarcia (px). */
  soulRadius: number;
  grazeRadius: number;
  /** Po ilu turach powalona postać sama wstaje. */
  reviveTurns: number;
}

/** Nazwy zdarzeń dźwiękowych, które można podmienić własnymi plikami. */
export const SFX_EVENTS = [
  'menuMove', 'menuSelect', 'menuCancel', 'menuDeny', 'text', 'swing', 'hit', 'crit', 'miss', 'hurt', 'graze',
  'heal', 'mercy', 'spare', 'defend', 'magic', 'item', 'enemyDefeat', 'boxOpen', 'phase', 'win', 'lose',
  'downed', 'revive', 'bubble', 'warn', 'tick',
] as const;
export type SfxEvent = (typeof SFX_EVENTS)[number];

// ---------------------------------------------------------------------------------------------
//  Projekt
// ---------------------------------------------------------------------------------------------

export interface FightProject {
  format: typeof FORMAT_NAME;
  version: number;
  meta: {
    name: string;
    author?: string;
    description?: string;
  };
  sprites: Record<string, SpriteDef>;
  sounds: Record<string, SoundDef>;
  /** Drużyna: 1–3 postacie. */
  party: PartyMemberDef[];
  /** Przeciwnicy: 1–3. */
  enemies: EnemyDef[];
  items: ItemDef[];
  bulletTypes: BulletTypeDef[];
  attacks: AttackDef[];
  phases: PhaseDef[];
  background: BackgroundDef;
  ui: UiDef;
  /** Własne efekty dźwiękowe: zdarzenie -> identyfikator z `sounds`. Brak wpisu = dźwięk wbudowany. */
  sfx: Partial<Record<SfxEvent, string>>;
  rules: RulesDef;
  /** Tekst otwierający walkę. */
  intro: { text: string[] };
  /** Głos narratora (blip w oknie dialogowym). */
  narratorVoice?: VoiceDef;
}
