/**
 * Wyświetlanie obrazu gry 640x480 w dostępnym miejscu — bez rozmywania pikseli.
 *
 * Gra zawsze rysuje się na ukrytym canvasie w bazowej rozdzielczości 640x480. Widoczny canvas
 * dostaje ten obraz powiększony CAŁKOWITĄ liczbę razy metodą nearest neighbor, więc każdy piksel gry
 * jest idealnie ostrym kwadratem.
 *
 *  - tryb 'integer': rozmiar na ekranie to dokładnie n pikseli ekranu na piksel gry (pixel-perfect),
 *  - tryb 'fit' (domyślny): gdy całkowita skala zostawiałaby dużo pustego miejsca, obraz wypełnia okno:
 *    najpierw powiększenie całkowite (ostre piksele), a dopiero potem lekkie zmniejszenie do rozmiaru
 *    okna — piksele pozostają równe i wyraźne, bez "falowania" typowego dla ułamkowego nearest neighbor.
 */
import { type Ctx, SCREEN_H, SCREEN_W, setupCtx } from '../core/gfx';

export type ScaleMode = 'fit' | 'integer';

const STORAGE_KEY = 'fight-creator:scale-mode';

export class Presenter {
  /** Kontekst ukrytego canvasa 640x480 — na nim rysuje gra. */
  readonly ctx: Ctx;
  mode: ScaleMode = 'fit';
  private readonly game: HTMLCanvasElement;
  private readonly out: CanvasRenderingContext2D;
  private factor = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly container: HTMLElement,
  ) {
    this.game = document.createElement('canvas');
    this.game.width = SCREEN_W;
    this.game.height = SCREEN_H;
    this.ctx = setupCtx(this.game);
    const out = canvas.getContext('2d', { alpha: false });
    if (!out) throw new Error('Canvas 2D nie jest dostępny w tej przeglądarce.');
    this.out = out;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'fit' || saved === 'integer') this.mode = saved;
    } catch {
      /* pamięć przeglądarki bywa niedostępna — wtedy zostaje tryb domyślny */
    }
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setMode(mode: ScaleMode): void {
    this.mode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* nic — wybór po prostu nie zostanie zapamiętany */
    }
    this.resize();
  }

  resize(): void {
    const r = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const raw = Math.max(0.1, Math.min(r.width / SCREEN_W, r.height / SCREEN_H));
    /** ile pikseli ekranu przypada na piksel gry, gdyby wypełnić całe miejsce */
    const device = raw * dpr;
    const whole = Math.max(1, Math.floor(device + 1e-3));
    // w trybie 'fit' zostajemy przy skali całkowitej, o ile nie marnuje ona zbyt dużo miejsca
    const useWhole = device >= 1 && (this.mode === 'integer' || whole / device >= 0.86);
    let cssScale: number;
    if (useWhole) {
      this.factor = whole;
      cssScale = whole / dpr;
      this.canvas.style.imageRendering = 'pixelated';
    } else {
      this.factor = Math.max(1, Math.ceil(device - 1e-3));
      cssScale = raw;
      this.canvas.style.imageRendering = 'auto';
    }
    const w = SCREEN_W * this.factor;
    const h = SCREEN_H * this.factor;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.style.width = `${Math.round(SCREEN_W * cssScale * 100) / 100}px`;
    this.canvas.style.height = `${Math.round(SCREEN_H * cssScale * 100) / 100}px`;
    this.present();
  }

  /** Przenosi klatkę gry na widoczny canvas (powiększenie całkowite, nearest neighbor). */
  present(): void {
    this.out.imageSmoothingEnabled = false;
    this.out.drawImage(this.game, 0, 0, this.canvas.width, this.canvas.height);
  }
}
