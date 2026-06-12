// Passive tree engine contract — geometry export, allocate/dealloc, path, power.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Engine } from '../src/engine.js';
import type { BuildState } from '../../shared/dto.js';

const engine = new Engine();

beforeAll(async () => {
  await new Promise<void>((r) => {
    engine.on('status', (s: string) => s === 'up' && r());
    engine.start();
  });
  await engine.call('build.new', { id: 't', name: 'T' });
  await engine.call('character.setClass', { classId: 7 });
  await engine.call('character.setLevel', { level: 90 });
});
afterAll(async () => {
  await engine.stop();
});

describe('passive tree', () => {
  it('exports node geometry + groups', async () => {
    const data = (await engine.call('tree.getData')) as {
      nodes: Array<{ id: number; x: number; y: number; type: string; conns: number[] }>;
      groups: unknown[];
    };
    expect(data.nodes.length).toBeGreaterThan(3000);
    expect(data.groups.length).toBeGreaterThan(100);
    const n = data.nodes[0];
    expect(typeof n.x).toBe('number');
    expect(typeof n.y).toBe('number');
    expect(Array.isArray(n.conns)).toBe(true);
  });

  it('allocates a node and updates point usage + stats', async () => {
    const st = (await engine.call('tree.allocNode', { id: 4739 })) as BuildState; // Spell Damage
    expect(st.tree.points.used).toBe(1);
    expect(st.tree.allocated).toContain(4739);
  });

  it('auto-fills the path when allocating a distant notable', async () => {
    const preview = (await engine.call('tree.previewPath', { id: 51184 })) as {
      path: number[];
      cost: number;
    };
    expect(preview.cost).toBeGreaterThan(1);
    const st = (await engine.call('tree.allocNode', { id: 51184 })) as BuildState; // Raw Power
    expect(st.tree.points.used).toBeGreaterThan(1);
    expect(st.tree.allocated).toContain(51184);
  });

  it('deallocates back down', async () => {
    const st = (await engine.call('tree.deallocNode', { id: 51184 })) as BuildState;
    expect(st.tree.allocated).not.toContain(51184);
  });

  it('searches nodes by text', async () => {
    const res = (await engine.call('tree.search', { q: 'mana' })) as { ids: number[] };
    expect(res.ids.length).toBeGreaterThan(10);
  });

  it('computes node power for the heatmap', async () => {
    const res = (await engine.call('tree.power')) as {
      power: Record<string, { offence: number; defence: number }>;
      maxOffence: number;
    };
    expect(Object.keys(res.power).length).toBeGreaterThan(100);
    expect(res.maxOffence).toBeGreaterThan(0);
  });
});
