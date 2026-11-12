import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/assets/builtin', async () => {
  const manifest = (await import('../src/assets/sprites/manifest.json')).default as Record<string, { frameW: number; frameH: number; frames: number; fps: number; loop: boolean }>;
  return {
    BUILTIN_SPRITES: manifest,
    builtinSprite: (name: string) => ({ src: `builtin:${name}`, ...manifest[name], scale: 2 }),
  };
});

describe('przykładowa walka', () => {
  it('przechodzi walidację projektu', async () => {
    const { createSampleProject } = await import('../src/battle/sample');
    const { validateProject } = await import('../src/battle/validate');
    const p = createSampleProject();
    expect(validateProject(p)).toEqual([]);
    expect(p.party).toHaveLength(3);
    expect(p.enemies).toHaveLength(2);
    expect(p.phases.length).toBeGreaterThanOrEqual(2);
    // da się zserializować do JSON i z powrotem bez strat
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});
