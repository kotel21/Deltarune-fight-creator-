/**
 * Pętla gry ze stałym krokiem logiki 60 Hz.
 * Logika (update) zawsze dostaje dt = 1/60 s, niezależnie od odświeżania monitora,
 * więc ruch pocisków i timingi są deterministyczne. Rysowanie (render) odbywa się
 * raz na klatkę przeglądarki.
 */
export const STEP = 1 / 60;

export class GameLoop {
  running = false;
  /** Statystyki do podglądu wydajności. */
  readonly stats = { fps: 60, updateMs: 0, renderMs: 0, frames: 0 };

  private raf = 0;
  private last = 0;
  private acc = 0;
  private fpsTime = 0;
  private fpsFrames = 0;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Ręczne przesunięcie symulacji o n kroków (używane w testach automatycznych). */
  advance(steps: number): void {
    for (let i = 0; i < steps; i++) this.update(STEP);
    this.render();
  }

  private frame = (t: number): void => {
    if (!this.running) return;
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.1) dt = 0.1; // po powrocie z nieaktywnej karty nie nadrabiamy zaległości
    // Wygładzanie: na monitorach 60/120/144 Hz czas klatki lekko "pływa" — zaokrąglamy go
    // do wielokrotności kroku, żeby nie gubić ani nie dublować kroków logiki.
    for (const hz of [60, 120, 144, 30]) {
      if (Math.abs(dt - 1 / hz) < 0.0012) {
        dt = 1 / hz;
        break;
      }
    }
    this.acc += dt;

    let steps = 0;
    const t0 = performance.now();
    while (this.acc >= STEP - 1e-6 && steps < 5) {
      this.update(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 5) this.acc = 0;
    const t1 = performance.now();
    this.render();
    const t2 = performance.now();

    this.stats.updateMs = this.stats.updateMs * 0.9 + (t1 - t0) * 0.1;
    this.stats.renderMs = this.stats.renderMs * 0.9 + (t2 - t1) * 0.1;
    this.stats.frames++;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.stats.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}
