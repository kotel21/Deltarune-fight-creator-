/**
 * Fight Creator — punkt wejścia aplikacji.
 * Etap 1: uruchamia przykładową walkę na silniku. W kolejnych etapach dojdą tu edytor i zapis w chmurze.
 */
import '@fontsource/jersey-10/latin.css';
import '@fontsource/jersey-10/latin-ext.css';
import './style.css';
import { Presenter } from './app/scaler';
import { setupTouchControls } from './app/touch';
import { AudioEngine } from './audio/audio';
import { Battle } from './battle/battle';
import { createSampleProject } from './battle/sample';
import type { FightProject } from './battle/types';
import { loadFont, SpriteStore } from './core/assets';
import { Input } from './core/input';
import { GameLoop } from './core/loop';
import type { BitmapFont } from './core/text';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Brak elementu #${id}`);
  return el as T;
};

async function boot(): Promise<void> {
  const canvas = $<HTMLCanvasElement>('game');
  const overlay = $('overlay');
  const startBtn = $<HTMLButtonElement>('btn-start');
  const note = $('overlay-note');
  const stageWrap = $('stage-wrap');
  const fpsLabel = $('fps');
  const muteBtn = $<HTMLButtonElement>('btn-mute');

  const presenter = new Presenter(canvas, stageWrap);
  const ctx = presenter.ctx;

  const input = new Input();
  input.attach();
  setupTouchControls($('touch'), input);
  const audio = new AudioEngine();

  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
  const seed = seedParam !== null && seedParam !== '' ? Number(seedParam) : undefined;

  let font: BitmapFont;
  const project: FightProject = createSampleProject();
  const sprites = new SpriteStore();
  try {
    [font] = await Promise.all([loadFont(), sprites.load(project.sprites)]);
  } catch (e) {
    note.textContent = `Nie udało się wczytać zasobów gry: ${(e as Error).message}`;
    note.classList.add('error');
    startBtn.textContent = 'Błąd';
    return;
  }
  if (sprites.errors.length) console.warn('Nie wczytano części grafik:', sprites.errors);

  const deps = { input, audio, sprites, font };
  let battle = new Battle(project, deps, { seed });
  let started = false;
  let audioReady = false;

  const loop = new GameLoop(
    (dt) => {
      input.update(dt);
      if (!started) return;
      battle.update(dt);
      if (battle.finished || battle.restartRequested) restart();
    },
    () => {
      battle.render(ctx);
      presenter.present();
      if (loop.stats.frames % 30 === 0) fpsLabel.textContent = `${Math.round(loop.stats.fps)} FPS`;
    },
  );

  function restart(): void {
    audio.stopMusic(0.2);
    battle = new Battle(project, deps, { seed });
  }

  async function start(): Promise<void> {
    if (started) return;
    started = true;
    startBtn.disabled = true;
    startBtn.textContent = 'Wczytywanie…';
    // Dźwięk można włączyć dopiero po geście użytkownika — robimy to tutaj.
    const ok = await audio.unlock();
    if (ok && !audioReady) {
      const errors = await audio.loadProject(project.sounds, project.sfx);
      if (errors.length) console.warn('Nie wczytano części dźwięków:', errors);
      audioReady = true;
    }
    overlay.hidden = true;
    canvas.focus({ preventScroll: true });
    battle = new Battle(project, deps, { seed });
  }

  startBtn.disabled = false;
  startBtn.textContent = '▶ Zagraj';
  startBtn.focus({ preventScroll: true });
  startBtn.addEventListener('click', () => void start());
  window.addEventListener('keydown', (e) => {
    if (!started && (e.code === 'KeyZ' || e.code === 'Enter') && !e.repeat) {
      e.preventDefault();
      void start();
    }
  });

  $('btn-restart').addEventListener('click', () => {
    if (started) restart();
    canvas.focus({ preventScroll: true });
  });
  muteBtn.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    muteBtn.textContent = audio.muted ? 'Dźwięk: wył.' : 'Dźwięk: wł.';
    canvas.focus({ preventScroll: true });
  });
  $('btn-full').addEventListener('click', () => {
    const p = document.fullscreenElement ? document.exitFullscreen() : stageWrap.requestFullscreen?.();
    p?.catch?.(() => undefined); // pełny ekran bywa niedostępny (telefony, osadzone widoki)
    canvas.focus({ preventScroll: true });
  });
  const scaleBtn = $<HTMLButtonElement>('btn-scale');
  const scaleLabel = () => (scaleBtn.textContent = presenter.mode === 'integer' ? 'Skala: 1:1' : 'Skala: auto');
  scaleLabel();
  scaleBtn.addEventListener('click', () => {
    presenter.setMode(presenter.mode === 'integer' ? 'fit' : 'integer');
    scaleLabel();
    canvas.focus({ preventScroll: true });
  });
  // kliknięcie w scenę przywraca fokus klawiatury
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));

  loop.start();

  // Uchwyt do testów automatycznych i podglądu stanu w konsoli.
  (window as unknown as { __fc: unknown }).__fc = {
    get battle() {
      return battle;
    },
    loop,
    input,
    audio,
    presenter,
    project,
    start,
    restart,
  };
}

void boot();
