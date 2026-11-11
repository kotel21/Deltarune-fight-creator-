/**
 * Wejście gracza: klawiatura, pad (Gamepad API) i przyciski dotykowe.
 * Wszystko sprowadzamy do kilku logicznych akcji, żeby reszta silnika nie musiała
 * wiedzieć, z jakiego urządzenia korzysta gracz.
 *
 *   strzałki / krzyżak / lewa gałka  -> up, down, left, right
 *   Z lub Enter   / A na padzie      -> confirm
 *   X lub Shift   / B na padzie      -> cancel
 *   C lub Ctrl    / X, Y, Start      -> menu
 */

export type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'menu';

export const ACTIONS: readonly Action[] = ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu'];

const KEYMAP: Record<string, Action> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyZ: 'confirm',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  KeyX: 'cancel',
  ShiftLeft: 'cancel',
  ShiftRight: 'cancel',
  KeyC: 'menu',
  ControlLeft: 'menu',
  ControlRight: 'menu',
  Escape: 'menu',
};

/** Standardowy układ pada (https://w3c.github.io/gamepad/#remapping). */
const PAD_BUTTONS: Record<number, Action> = {
  0: 'confirm',
  1: 'cancel',
  2: 'menu',
  3: 'menu',
  9: 'menu',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
};

const REPEAT_DELAY = 0.34;
const REPEAT_INTERVAL = 0.085;
const STICK_DIGITAL = 0.5;
const STICK_DEADZONE = 0.22;

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export class Input {
  /** Gdy false, silnik ignoruje wejście (np. gdy fokus jest w polu edytora). */
  enabled = true;
  /** Ostatnio użyte urządzenie — do podpowiedzi sterowania. */
  lastDevice: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';

  private codes = new Set<string>();
  private virtual = new Set<Action>();
  private pad = new Set<Action>();
  private latched = new Set<Action>();
  private now = new Set<Action>();
  private justPressed = new Set<Action>();
  private repeated = new Set<Action>();
  private holdTime = new Map<Action, number>();
  private stick = { x: 0, y: 0 };
  /** Kierunki z urządzeń cyfrowych (klawisze, dotyk, krzyżak) — bez gałki analogowej. */
  private digital = new Set<Action>();
  private padButtons = new Set<Action>();
  private detach: (() => void) | null = null;

  /** Podpina nasłuchiwanie klawiatury do okna. */
  attach(target: Window = window): void {
    const down = (e: KeyboardEvent) => {
      if (!this.enabled || isTextField(e.target)) return;
      const action = KEYMAP[e.code];
      if (!action) return;
      // Ctrl/Shift bywają częścią skrótów przeglądarki — nie blokujemy ich kombinacji.
      if (!(e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight') && !e.metaKey && !e.altKey) e.preventDefault();
      if (!e.repeat) {
        this.codes.add(e.code);
        this.latched.add(action);
        this.lastDevice = 'keyboard';
      }
    };
    const up = (e: KeyboardEvent) => {
      this.codes.delete(e.code);
    };
    const blur = () => this.releaseAll();
    target.addEventListener('keydown', down as EventListener);
    target.addEventListener('keyup', up as EventListener);
    target.addEventListener('blur', blur);
    this.detach = () => {
      target.removeEventListener('keydown', down as EventListener);
      target.removeEventListener('keyup', up as EventListener);
      target.removeEventListener('blur', blur);
    };
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
  }

  releaseAll(): void {
    this.codes.clear();
    this.virtual.clear();
    this.latched.clear();
  }

  /** Przycisk ekranowy (dotyk) wciśnięty / puszczony. */
  setVirtual(action: Action, down: boolean): void {
    if (down) {
      this.virtual.add(action);
      this.latched.add(action);
      this.lastDevice = 'touch';
    } else {
      this.virtual.delete(action);
    }
  }

  /** Wywoływane raz na krok logiki (60 razy na sekundę). */
  update(dt: number): void {
    this.pollGamepads();
    const prev = this.now;
    const now = new Set<Action>();
    const digital = new Set<Action>();
    for (const code of this.codes) {
      const a = KEYMAP[code];
      if (a) digital.add(a);
    }
    for (const a of this.virtual) digital.add(a);
    for (const a of this.padButtons) digital.add(a);
    for (const a of digital) now.add(a);
    for (const a of this.pad) now.add(a);
    this.digital = digital;

    this.justPressed.clear();
    this.repeated.clear();
    for (const a of ACTIONS) {
      const isDown = now.has(a);
      const pressed = (isDown && !prev.has(a)) || this.latched.has(a);
      if (pressed) {
        this.justPressed.add(a);
        this.repeated.add(a);
        this.holdTime.set(a, 0);
      } else if (isDown) {
        const t = (this.holdTime.get(a) ?? 0) + dt;
        if (t >= REPEAT_DELAY) {
          this.repeated.add(a);
          this.holdTime.set(a, t - REPEAT_INTERVAL);
        } else {
          this.holdTime.set(a, t);
        }
      } else {
        this.holdTime.delete(a);
      }
    }
    this.latched.clear();
    this.now = now;
  }

  /** Czy akcja jest teraz trzymana. */
  held(a: Action): boolean {
    return this.enabled && this.now.has(a);
  }

  /** Czy akcja została wciśnięta w tym kroku. */
  pressed(a: Action): boolean {
    return this.enabled && this.justPressed.has(a);
  }

  /** Jak pressed(), ale z auto-powtarzaniem przy przytrzymaniu (do menu). */
  repeat(a: Action): boolean {
    return this.enabled && this.repeated.has(a);
  }

  /** Wektor ruchu: cyfrowo -1/0/1 na oś (klawisze, krzyżak, dotyk) albo analogowo z gałki pada. */
  axis(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    const dig = (a: Action) => (this.digital.has(a) ? 1 : 0);
    const x = dig('right') - dig('left');
    const y = dig('down') - dig('up');
    if (x !== 0 || y !== 0) return { x, y };
    const mag = Math.hypot(this.stick.x, this.stick.y);
    if (mag <= STICK_DEADZONE) return { x: 0, y: 0 };
    // gałka analogowa: prędkość proporcjonalna do wychylenia (pełna prędkość tuż przed końcem zakresu)
    const k = Math.min(1, ((mag - STICK_DEADZONE) / (1 - STICK_DEADZONE)) * 1.15) / mag;
    return { x: this.stick.x * k, y: this.stick.y * k };
  }

  private pollGamepads(): void {
    this.pad.clear();
    this.padButtons.clear();
    this.stick.x = 0;
    this.stick.y = 0;
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let pads: (Gamepad | null)[];
    try {
      pads = navigator.getGamepads();
    } catch {
      return; // np. zablokowane przez politykę uprawnień w ramce
    }
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      gp.buttons.forEach((b, i) => {
        const a = PAD_BUTTONS[i];
        if (a && (b.pressed || b.value > 0.5)) {
          this.pad.add(a);
          this.padButtons.add(a);
          this.lastDevice = 'gamepad';
        }
      });
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > Math.hypot(this.stick.x, this.stick.y)) {
        this.stick.x = ax;
        this.stick.y = ay;
      }
      if (ax > STICK_DIGITAL) this.pad.add('right');
      if (ax < -STICK_DIGITAL) this.pad.add('left');
      if (ay > STICK_DIGITAL) this.pad.add('down');
      if (ay < -STICK_DIGITAL) this.pad.add('up');
      if (Math.hypot(ax, ay) > STICK_DIGITAL) this.lastDevice = 'gamepad';
    }
  }
}
