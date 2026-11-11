/**
 * Korutyny na generatorach — pozwalają pisać przebieg walki "po kolei"
 * (pokaż tekst → poczekaj na klawisz → odtwórz animację → ...), mimo że gra działa w pętli klatek.
 *
 * W generatorze można zrobić:
 *   yield 0.5;             – poczekaj pół sekundy
 *   yield () => warunek;   – czekaj, aż funkcja zwróci true
 *   yield null;            – poczekaj jedną klatkę logiki
 */
export type Wait = number | (() => boolean) | null;
export type Co<T = void> = Generator<Wait, T, void>;

export class CoRunner {
  done = false;
  private pending: Wait | undefined = undefined;

  constructor(private readonly gen: Co) {}

  update(dt: number): void {
    if (this.done) return;
    if (this.pending !== undefined) {
      const w = this.pending;
      if (typeof w === 'number') {
        const left = w - dt;
        if (left > 1e-9) {
          this.pending = left;
          return;
        }
      } else if (typeof w === 'function') {
        if (!w()) return;
      }
      this.pending = undefined;
    }
    for (let guard = 0; guard < 100000; guard++) {
      const r = this.gen.next();
      if (r.done) {
        this.done = true;
        return;
      }
      const w = r.value;
      if (w === null) {
        this.pending = null;
        return;
      }
      if (typeof w === 'number') {
        if (w > 0) {
          this.pending = w;
          return;
        }
        continue;
      }
      if (!w()) {
        this.pending = w;
        return;
      }
    }
    throw new Error('Korutyna nie oddała sterowania (nieskończona pętla?)');
  }
}
