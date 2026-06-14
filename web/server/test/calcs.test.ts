// Calcs engine contract — breakdowns + non-committing what-if comparison.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Engine } from '../src/engine.js';

const engine = new Engine();
const life = async () =>
  ((await engine.call('calcs.getStat', { stat: 'Life' })) as { value: number }).value;

beforeAll(async () => {
  await new Promise<void>((r) => {
    engine.on('status', (s: string) => s === 'up' && r());
    engine.start();
  });
  await engine.call('build.new', { id: 'c', name: 'C' });
  await engine.call('character.setClass', { classId: 7 });
  await engine.call('character.setLevel', { level: 80 });
});
afterAll(async () => {
  await engine.stop();
});

describe('calcs', () => {
  it('returns a breakdown for an output stat', async () => {
    const bd = (await engine.call('calcs.getBreakdown', { stat: 'Life' })) as {
      stat: string;
      lines: string[];
    };
    expect(bd.lines.length).toBeGreaterThan(0);
    expect(bd.lines.some((l) => l.includes('base'))).toBe(true);
  });

  it('compares a hypothetical mutation and reverts the build', async () => {
    const baseline = await life();
    const deltas = (await engine.call('calcs.compare', {
      steps: [
        { method: 'items.equipUnique', params: { name: 'Belly of the Beast, Explorer Armour' } },
      ],
      stats: ['Life'],
    })) as { deltas: Array<{ stat: string; delta: number }> };
    const lifeDelta = deltas.deltas.find((d) => d.stat === 'Life');
    expect(lifeDelta).toBeTruthy();
    expect(lifeDelta!.delta).toBeGreaterThan(0);
    // The comparison must NOT have committed — Life is back to baseline.
    expect(await life()).toBe(baseline);
  });
});
