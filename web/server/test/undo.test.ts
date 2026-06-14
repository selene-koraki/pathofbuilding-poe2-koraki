// Import/export round-trip + global undo/redo across mutation types.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Engine } from '../src/engine.js';
import type { BuildState } from '../../shared/dto.js';

const engine = new Engine();

beforeAll(async () => {
  await new Promise<void>((r) => {
    engine.on('status', (s: string) => s === 'up' && r());
    engine.start();
  });
  await engine.call('build.new', { id: 'u', name: 'U' });
  await engine.call('character.setClass', { classId: 7 });
  await engine.call('character.setLevel', { level: 90 });
});
afterAll(async () => {
  await engine.stop();
});

describe('undo/redo + import/export', () => {
  it('undoes and redoes a tree allocation', async () => {
    const allocd = (await engine.call('tree.allocNode', { id: 4739 })) as BuildState;
    expect(allocd.tree.allocated).toContain(4739);

    const undone = (await engine.call('build.undo')) as BuildState;
    expect(undone.tree.allocated).not.toContain(4739);

    const redone = (await engine.call('build.redo')) as BuildState;
    expect(redone.tree.allocated).toContain(4739);
  });

  it('undo spans different mutation domains (config then skills)', async () => {
    await engine.call('config.set', { var: 'enemyIsBoss', value: 'Boss' });
    await engine.call('skills.addGroup', { label: 'G' });
    let st = (await engine.call('build.getState')) as BuildState;
    expect(st.skills.groups.length).toBeGreaterThan(0);
    expect(st.config.input.enemyIsBoss).toBe('Boss');

    st = (await engine.call('build.undo')) as BuildState; // undo addGroup
    expect(st.skills.groups.length).toBe(0);
    st = (await engine.call('build.undo')) as BuildState; // undo config
    expect(st.config.input.enemyIsBoss).not.toBe('Boss');
  });

  it('exports a code that re-imports to the same allocation', async () => {
    await engine.call('tree.allocNode', { id: 51184 });
    const before = (await engine.call('tree.getAllocated')) as BuildState['tree'];
    const exp = (await engine.call('build.exportCode')) as { code: string };
    expect(exp.code.length).toBeGreaterThan(50);

    const re = (await engine.call('build.importCode', { id: 'u', code: exp.code })) as BuildState;
    // Re-imported build has the same allocated node count.
    expect(re.tree.allocated.sort()).toEqual([...before.allocated].sort());
  });
});
