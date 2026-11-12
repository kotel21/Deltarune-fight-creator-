/**
 * PRZYKŁADOWA WALKA: "Pobudka w deszczu"
 * Drużyna (Iskra, Borek, Lumi) kontra Budzikot i Chmurnik.
 * Pokazuje wszystkie mechaniki silnika: ACT z efektami i zmianą zachowania wroga, czary za TP,
 * przedmioty, Mercy i SPARE, ataki ułożone na osi czasu (wszystkie wzory ruchu pocisków),
 * różne kształty pudełka, kolejność ataków oraz drugą fazę z inną muzyką.
 */
import { builtinSongLoop } from '../audio/audio';
import { builtinSpriteTable, DEFAULT_RULES, defaultBulletTypes, defaultUi } from './defaults';
import { type AttackDef, FORMAT_NAME, FORMAT_VERSION, type FightProject, type MusicDef } from './types';

function music(sound: string, volume: number): MusicDef {
  const loop = builtinSongLoop(sound);
  return {
    sound,
    volume,
    loop: true,
    // wstęp utworu gra raz, potem zapętla się fragment od loopStart do loopEnd
    loopStart: loop ? Math.round(loop.loopStart * 1000) / 1000 : 0,
    loopEnd: loop ? Math.round(loop.loopEnd * 1000) / 1000 : 0,
  };
}

const attacks: AttackDef[] = [
  {
    // Wskazówki zegara: dwa obracające się ramiona z kulek. Bezpiecznie jest w samym środku tarczy
    // i między ramionami — trzeba krążyć razem z nimi albo przeskakiwać przez środek.
    id: 'tik-tak',
    name: 'Tik-tak',
    owner: 'budzikot',
    duration: 8,
    box: { shape: 'ellipse', w: 190, h: 190 },
    spawns: [
      { id: 'minutowa', time: 0.2, bullet: 'orb', x: 0, y: 0, angle: 0, speed: 0, motion: 'circle', orbitRadius: 20, orbitRadiusStep: 16, orbitSpeed: 62, orbitPhase: -90, count: 5, warn: 0.7 },
      { id: 'godzinowa', time: 0.2, bullet: 'orb', x: 0, y: 0, angle: 0, speed: 0, motion: 'circle', orbitRadius: 20, orbitRadiusStep: 16, orbitSpeed: -34, orbitPhase: 90, count: 3, warn: 0.7 },
      { id: 'zebatki-lewa', time: 2, bullet: 'cog', x: -150, y: -110, angle: 0, aim: true, speed: 78, motion: 'straight', repeat: 2, interval: 3.2, spin: 200 },
      { id: 'zebatki-prawa', time: 3.6, bullet: 'cog', x: 150, y: 110, angle: 0, aim: true, speed: 78, motion: 'straight', repeat: 2, interval: 3.2, spin: -200 },
    ],
  },
  {
    // Ulewa: krople spadają lekko skośnie, a co chwilę jedna (z ostrzeżeniem) celuje prosto w serduszko.
    id: 'ulewa',
    name: 'Ulewa',
    owner: 'chmurnik',
    duration: 7.5,
    box: { shape: 'rect', w: 230, h: 130 },
    spawns: [
      { id: 'deszcz', time: 0.4, bullet: 'drop', x: 14, y: -100, angle: 96, speed: 150, motion: 'straight', repeat: 46, interval: 0.145, jitterX: 122, jitterAngle: 3, jitterSpeed: 22 },
      { id: 'celna-kropla', time: 1.3, bullet: 'drop', origin: 'soul', x: 0, y: -118, angle: 90, speed: 210, motion: 'straight', repeat: 5, interval: 1.25, warn: 0.55, scale: 1.5 },
    ],
  },
  {
    // Dzwonienie: fale dźwięku rozchodzą się wachlarzami z lewej i prawej, a z góry opadają senne "Z".
    id: 'dzwonienie',
    name: 'Dzwonienie',
    owner: 'budzikot',
    duration: 7.5,
    box: { shape: 'rect', w: 200, h: 150 },
    spawns: [
      { id: 'fala-lewa', time: 0.5, bullet: 'orb', x: -150, y: 0, angle: 0, speed: 98, motion: 'straight', count: 7, spread: 84, repeat: 4, interval: 1.75, jitterAngle: 5 },
      { id: 'fala-prawa', time: 1.4, bullet: 'orb', x: 150, y: 0, angle: 180, speed: 98, motion: 'straight', count: 7, spread: 84, repeat: 4, interval: 1.75, jitterAngle: 5 },
      { id: 'zety', time: 1, bullet: 'zet', x: 0, y: -100, angle: 90, speed: 44, motion: 'wave', waveAmp: 20, waveFreq: 0.7, repeat: 7, interval: 0.9, jitterX: 84 },
    ],
  },
  {
    // Burza: pioruny (z ostrzeżeniem) biją w miejsce, gdzie stoi serduszko; z boku zacina deszcz.
    id: 'burza',
    name: 'Burza',
    owner: 'chmurnik',
    duration: 8,
    box: { shape: 'rect', w: 190, h: 150 },
    spawns: [
      { id: 'piorun', time: 0.7, bullet: 'bolt', origin: 'soul', x: 0, y: -150, angle: 90, speed: 470, motion: 'straight', repeat: 7, interval: 1, warn: 0.6 },
      { id: 'piorun-obok', time: 3.2, bullet: 'bolt', origin: 'soul', x: 0, y: -150, angle: 90, speed: 470, motion: 'straight', repeat: 5, interval: 1, warn: 0.6, jitterX: 46 },
      { id: 'zacinajacy-deszcz', time: 0.3, bullet: 'drop', x: 130, y: -20, angle: 168, speed: 112, motion: 'straight', repeat: 15, interval: 0.5, jitterY: 70 },
    ],
  },
  {
    // Zawierucha (faza 2): falujące odłamki niesione wiatrem i gwiazdki, które przez chwilę gonią serduszko.
    id: 'zawierucha',
    name: 'Zawierucha',
    duration: 8.5,
    box: { shape: 'rect', w: 250, h: 130 },
    spawns: [
      { id: 'wiatr', time: 0.4, bullet: 'shard', x: 165, y: 0, angle: 180, speed: 124, motion: 'wave', waveAmp: 22, waveFreq: 1.1, repeat: 20, interval: 0.38, jitterY: 52 },
      { id: 'gwiazdka-1', time: 1.4, bullet: 'star', x: -160, y: -80, angle: 0, aim: true, speed: 74, motion: 'homing', homingTurn: 75, homingTime: 3.4, life: 5.2, spin: 240 },
      { id: 'gwiazdka-2', time: 4.4, bullet: 'star', x: -160, y: 80, angle: 0, aim: true, speed: 74, motion: 'homing', homingTurn: 75, homingTime: 3.4, life: 5.2, spin: -240 },
    ],
  },
  {
    // Alarm! (faza 2): spirala kulek wirująca z góry pudełka, potem druga — w przeciwną stronę — z dołu.
    id: 'alarm',
    name: 'Alarm!',
    owner: 'budzikot',
    duration: 8.5,
    box: { shape: 'ellipse', w: 200, h: 200 },
    spawns: [
      { id: 'spirala-gora', time: 0.6, bullet: 'orb', x: 0, y: -66, angle: 90, speed: 82, motion: 'straight', count: 5, spread: 360, repeat: 19, interval: 0.21, angleStep: 13, warn: 0 },
      { id: 'spirala-dol', time: 4.6, bullet: 'orb', x: 0, y: 66, angle: 270, speed: 82, motion: 'straight', count: 5, spread: 360, repeat: 17, interval: 0.21, angleStep: -13 },
      { id: 'zebatka', time: 2.6, bullet: 'cog', origin: 'enemy', x: -40, y: 0, angle: 0, aim: true, speed: 96, motion: 'straight', repeat: 3, interval: 2, spin: 260 },
    ],
  },
];

export function createSampleProject(): FightProject {
  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    meta: {
      name: 'Pobudka w deszczu',
      author: 'Fight Creator',
      description: 'Przykładowa walka pokazująca możliwości silnika: Budzikot i Chmurnik w dwóch fazach.',
    },
    sprites: builtinSpriteTable(),
    sounds: {
      'music-faza-1': { src: 'builtin:music-tik-tak', name: 'Tik-Tak Tango (wbudowany)' },
      'music-faza-2': { src: 'builtin:music-burza', name: 'Burza w Budziku (wbudowany)' },
    },
    party: [
      {
        id: 'iskra',
        name: 'Iskra',
        color: '#ffb43a',
        maxHp: 110,
        attack: 12,
        defense: 2,
        sprites: { idle: 'iskra-idle', attack: 'iskra-attack', hurt: 'iskra-hurt', defend: 'iskra-defend' },
        voice: { wave: 'square', pitch: 523 },
        spells: [
          {
            id: 'plomyk',
            name: 'Płomyk',
            description: 'Ogniste cięcie w jednego wroga.\n[o]Obrażenia: 70[/]',
            tpCost: 25,
            target: 'enemy',
            text: ['{user} rozpala ostrze: [o]Płomyk![/]'],
            effects: [{ type: 'damage', amount: 70 }],
          },
        ],
      },
      {
        id: 'borek',
        name: 'Borek',
        color: '#3fd8c0',
        maxHp: 150,
        attack: 16,
        defense: 4,
        sprites: { idle: 'borek-idle', attack: 'borek-attack', hurt: 'borek-hurt', defend: 'borek-defend' },
        voice: { wave: 'saw', pitch: 196 },
        spells: [
          {
            id: 'trzask',
            name: 'Trzask',
            description: 'Uderzenie w ziemię rani wszystkich wrogów.\n[o]Obrażenia: 45[/]',
            tpCost: 40,
            target: 'allEnemies',
            text: ['{user} wali młotem w ziemię: [o]Trzask![/]'],
            effects: [{ type: 'damage', amount: 45, all: true }],
          },
        ],
      },
      {
        id: 'lumi',
        name: 'Lumi',
        color: '#d79bff',
        maxHp: 80,
        attack: 8,
        defense: 1,
        sprites: { idle: 'lumi-idle', attack: 'lumi-attack', hurt: 'lumi-hurt', defend: 'lumi-defend' },
        voice: { wave: 'triangle', pitch: 880 },
        spells: [
          {
            id: 'blask',
            name: 'Blask',
            description: 'Leczy jednego sojusznika i podnosi powalonych.\n[g]+50 HP[/]',
            tpCost: 30,
            target: 'ally',
            text: ['{user} unosi latarenkę: [g]Blask![/]'],
            effects: [{ type: 'heal', amount: 50 }],
          },
          {
            id: 'kolysanka',
            name: 'Kołysanka',
            description: 'Kojąca melodia dla wszystkich wrogów.\n[y]+20% Mercy[/]',
            tpCost: 20,
            target: 'allEnemies',
            text: ['{user} nuci cichutko [y]Kołysankę[/]...'],
            effects: [{ type: 'mercy', amount: 20, all: true }],
          },
          {
            id: 'zorza',
            name: 'Zorza',
            description: 'Leczy całą drużynę.\n[g]+35 HP dla każdego[/]',
            tpCost: 55,
            target: 'party',
            text: ['{user} rozświetla niebo: [g]Zorza![/]'],
            effects: [{ type: 'heal', amount: 35, all: true }],
          },
        ],
      },
    ],
    enemies: [
      {
        id: 'budzikot',
        name: 'Budzikot',
        maxHp: 380,
        attack: 5,
        defense: 2,
        exp: 18,
        gold: 35,
        sprites: { idle: 'budzikot-idle', hurt: 'budzikot-hurt', attack: 'budzikot-attack' },
        voice: { wave: 'square', pitch: 1175 },
        acts: [
          {
            id: 'zbadaj',
            name: 'Zbadaj',
            description: 'Przyjrzyj się przeciwnikowi.',
            text: ['[y]BUDZIKOT[/] — ATK {atk}, DEF {def}.\nKoci budzik. Dzwoni zawsze pięć minut za wcześnie.', 'Uwielbia głaskanie po dzwonkach. Przycisk drzemki go usypia.'],
            effects: [],
          },
          {
            id: 'poglaszcz',
            name: 'Pogłaszcz',
            description: 'Głaskanie po dzwonkach.\n[y]+30% Mercy[/]',
            text: ['{user} głaszcze Budzikota po dzwonkach.', 'Mruczy jak nakręcana sprężyna!'],
            effects: [{ type: 'mercy', amount: 30 }],
          },
          {
            id: 'drzemka',
            name: 'Drzemka',
            description: 'Wciśnij przycisk drzemki.\n[b]Usypia: wolniejsze pociski, łatwiej o Mercy.[/]',
            tpCost: 16,
            text: ['{user} wciska przycisk drzemki.', 'Budzikot ziewa... i tyka coraz wolniej.'],
            effects: [
              { type: 'setState', state: 'sleepy' },
              { type: 'mercy', amount: 10 },
            ],
          },
          {
            id: 'nakrec',
            name: 'Nakręć',
            description: 'Nakręć sprężynę do oporu.\n[y]+45% Mercy[/], [r]ale ataki przyspieszą![/]',
            text: ['{user} nakręca sprężynę do oporu.', 'Budzikot jest zachwycony! I bardzo, [shake]BARDZO[/] pobudzony.'],
            effects: [
              { type: 'mercy', amount: 45 },
              { type: 'setState', state: 'wound' },
            ],
          },
        ],
        dialog: {
          lines: ['Tik-tak! Pobudka, śpiochy!', 'Mrrr-DRYŃ! Spóźnicie się!', 'Czas ucieka! Tik-tak-tik!'],
          order: 'sequence',
          lowHp: ['T-tik... sprężyna mi słabnie...'],
          spareable: ['Mrrr... w sumie mogę zadzwonić później.'],
        },
        flavor: ['Budzikot tyka nerwowo i zerka na własną tarczę.', 'Budzikot przeciąga się i mruczy mechanicznie.', 'W powietrzu pachnie smarem do zegarków.'],
        spare: { mercy: 100, failMercy: 5 },
        states: {
          sleepy: {
            label: 'ŚPIĄCY',
            bulletSpeedMult: 0.62,
            mercyMult: 1.5,
            turns: 2,
            tint: '#6ecbff',
            dialog: ['Zzz... jeszcze pięć minutek...', 'Mrrr... zzz...'],
            flavor: ['Budzikot przysypia. Wskazówki opadają mu jak wąsy.'],
          },
          wound: {
            label: 'NAKRĘCONY',
            bulletSpeedMult: 1.3,
            attackMult: 1.2,
            turns: 2,
            tint: '#ff9a2e',
            dialog: ['TIKTIKTIKTIK!!'],
            flavor: ['Budzikot aż podskakuje. Sprężyna zaraz pęknie!'],
          },
        },
        texts: {
          spared: '{user} okazuje litość. Budzikot odchodzi, pobrzękując wesoło!',
          defeated: 'Budzikot pada. Sprężyna wyskakuje z cichym „boing”.',
          spareFail: 'Budzikot nie zamierza jeszcze przestać dzwonić.',
        },
      },
      {
        id: 'chmurnik',
        name: 'Chmurnik',
        maxHp: 300,
        attack: 6,
        defense: 0,
        exp: 15,
        gold: 28,
        sprites: { idle: 'chmurnik-idle', hurt: 'chmurnik-hurt', attack: 'chmurnik-attack' },
        voice: { wave: 'triangle', pitch: 233 },
        acts: [
          {
            id: 'zbadaj',
            name: 'Zbadaj',
            description: 'Przyjrzyj się przeciwnikowi.',
            text: ['[b]CHMURNIK[/] — ATK {atk}, DEF {def}.\nBurzowa chmurka z wiecznie złym humorem.', 'Podobno rozchmurza się po dobrym żarcie. Bardzo zmęczony też odpuszcza.'],
            effects: [],
          },
          {
            id: 'pociesz',
            name: 'Pociesz',
            description: 'Kilka ciepłych słów.\n[y]+30% Mercy[/]',
            text: ['{user} mówi, że po każdej burzy wychodzi słońce.', 'Chmurnik udaje, że nie słucha. Ale słucha.'],
            effects: [{ type: 'mercy', amount: 30 }],
          },
          {
            id: 'zart',
            name: 'Żart',
            description: 'Opowiedz suchar.\n[y]+25% Mercy[/] [b]i rozpogodzenie (słabsze ataki)[/]',
            text: ['{user}: „Co robi chmura w szkole? ...[wait=0.4]Chmurzy się nad zadaniem”.', 'Chmurnik parska deszczem. Chyba mu się spodobało!'],
            effects: [
              { type: 'mercy', amount: 25 },
              { type: 'setState', state: 'calm' },
            ],
          },
          {
            id: 'parasol',
            name: 'Parasol',
            description: 'Rozłóż parasol nad drużyną.\n[b]ATK wroga -20% do końca walki[/]',
            tpCost: 25,
            text: ['{user} rozkłada ogromny parasol.', 'Deszcz Chmurnika traci impet!'],
            effects: [
              { type: 'stat', stat: 'attack', mult: 0.8 },
              { type: 'mercy', amount: 10 },
            ],
          },
        ],
        dialog: {
          lines: ['Hmpf. Zaraz zmokniecie.', 'Nie znoszę ładnej pogody.', 'Grrrzmot!'],
          order: 'sequence',
          lowHp: ['Chlip... zaraz się rozpłaczę...'],
          spareable: ['...Chyba mi przeszło.'],
        },
        flavor: ['Chmurnik pochmurnieje jeszcze bardziej.', 'Nad głowami zbiera się na deszcz.', 'Chmurnik burczy coś pod nosem.'],
        spare: { mercy: 100, hpBelowPct: 20, mode: 'any', failMercy: 5 },
        states: {
          calm: {
            label: 'ROZPOGODZONY',
            attackMult: 0.7,
            bulletSpeedMult: 0.85,
            turns: 3,
            tint: '#fff1a8',
            dialog: ['...Może nie jest tak źle.', 'Dawno nikt mnie nie rozśmieszył.'],
            flavor: ['Chmurnik pojaśniał. Prawie widać przez niego słońce.'],
          },
        },
        texts: {
          spared: '{user} okazuje litość. Chmurnik odpływa, zostawiając tęczę!',
          defeated: 'Chmurnik rozwiewa się w lekką mgiełkę.',
          spareFail: 'Chmurnik wciąż jest naburmuszony.',
        },
      },
    ],
    items: [
      {
        id: 'bulka',
        name: 'Bułka z dżemem',
        description: 'Słodka i sycąca.\n[g]Leczy 45 HP[/] (podnosi powalonych).',
        count: 2,
        target: 'ally',
        text: ['{user} podaje bułkę z dżemem. {target} od razu ma więcej sił!'],
        effects: [{ type: 'heal', amount: 45 }],
      },
      {
        id: 'herbata',
        name: 'Herbata z termosu',
        description: 'Rozgrzewa całą drużynę.\n[g]Leczy każdemu 25 HP[/].',
        count: 1,
        target: 'party',
        text: ['{user} rozlewa herbatę z termosu. Od razu cieplej!'],
        effects: [{ type: 'heal', amount: 25, all: true }],
      },
      {
        id: 'iskierka',
        name: 'Iskierka',
        description: 'Skupiona energia.\n[b]+30% TP[/]',
        count: 1,
        target: 'none',
        text: ['{user} rozgniata Iskierkę w dłoni. Energia rośnie!'],
        effects: [{ type: 'tp', amount: 30 }],
      },
    ],
    bulletTypes: defaultBulletTypes(),
    attacks,
    phases: [
      {
        id: 'faza-1',
        name: 'Faza 1 — Pobudka',
        triggers: [],
        order: 'sequence',
        attacks: ['tik-tak', 'ulewa', 'dzwonienie', 'burza'],
        music: music('music-faza-1', 0.9),
      },
      {
        id: 'faza-2',
        name: 'Faza 2 — Burza',
        triggers: [
          { type: 'hpBelow', enemy: '*', pct: 50 },
          { type: 'enemiesLeft', count: 1 },
          { type: 'turn', turn: 6 },
        ],
        order: 'random',
        attacks: ['zawierucha', 'alarm', 'burza', 'tik-tak'],
        music: music('music-faza-2', 0.9),
        enterText: ['Niebo ciemnieje, a tykanie przyspiesza!', '[r]Robi się poważnie![/]'],
      },
    ],
    background: {
      color: '#0b0c20',
      layers: [
        { type: 'scroll', sprite: 'bg-night', speedX: -14, speedY: 5 },
        { type: 'pulse', color: '#5a2f9c', speed: 0.22, minOpacity: 0, maxOpacity: 0.14 },
      ],
    },
    ui: defaultUi(),
    sfx: {},
    rules: { ...DEFAULT_RULES },
    intro: { text: ['Drogę zagradzają [y]Budzikot[/] i [b]Chmurnik[/]!'] },
    narratorVoice: { wave: 'square', pitch: 392 },
  };
}
