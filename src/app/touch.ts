/**
 * Ekranowe przyciski dla urządzeń dotykowych: okrągły krzyżak (8 kierunków)
 * oraz przyciski Z / X / C. Pokazują się po pierwszym dotknięciu ekranu.
 */
import type { Action, Input } from '../core/input';

const DIRS: Action[] = ['up', 'down', 'left', 'right'];

export function setupTouchControls(root: HTMLElement, input: Input): void {
  const dpad = root.querySelector<HTMLElement>('#dpad');
  const arrows: Record<string, HTMLElement | null> = {
    up: root.querySelector('.arrow.up'),
    down: root.querySelector('.arrow.down'),
    left: root.querySelector('.arrow.left'),
    right: root.querySelector('.arrow.right'),
  };

  const show = () => {
    root.hidden = false;
  };
  if (window.matchMedia?.('(pointer: coarse)').matches) show();
  window.addEventListener('touchstart', show, { once: true, passive: true });

  const setDirs = (active: Set<Action>) => {
    for (const d of DIRS) {
      input.setVirtual(d, active.has(d));
      arrows[d]?.classList.toggle('on', active.has(d));
    }
  };

  if (dpad) {
    let pointer: number | null = null;
    const track = (e: PointerEvent) => {
      const r = dpad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const active = new Set<Action>();
      const dead = r.width * 0.12;
      if (Math.hypot(dx, dy) > dead) {
        // podział na 8 kierunków
        const a = Math.atan2(dy, dx);
        const oct = Math.round(a / (Math.PI / 4));
        if (oct === 0 || oct === 1 || oct === -1) active.add('right');
        if (oct === 4 || oct === -4 || oct === 3 || oct === -3) active.add('left');
        if (oct === 1 || oct === 2 || oct === 3) active.add('down');
        if (oct === -1 || oct === -2 || oct === -3) active.add('up');
      }
      setDirs(active);
    };
    dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pointer = e.pointerId;
      dpad.setPointerCapture(e.pointerId);
      track(e);
    });
    dpad.addEventListener('pointermove', (e) => {
      if (e.pointerId === pointer) track(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      setDirs(new Set());
    };
    dpad.addEventListener('pointerup', release);
    dpad.addEventListener('pointercancel', release);
    dpad.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  root.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((btn) => {
    const act = btn.dataset.act as Action;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      input.setVirtual(act, true);
      btn.classList.add('on');
    };
    const up = () => {
      input.setVirtual(act, false);
      btn.classList.remove('on');
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}
