// Parity runner — computes a scenario's stat output two independent ways and
// returns both for the harness to compare.
//
//   computeDirect    : a dedicated headless engine kernel (the reference path).
//   computeViaGateway : the full web stack — Library + SessionManager — i.e. the
//                       exact code path a browser drives over WebSocket.
//
// Identical numbers prove the web layer (serialization, sessions, autosave,
// command routing) introduces zero divergence from the raw engine.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Engine } from '../server/src/engine.js';
import type { Library } from '../server/src/library.js';
import type { SessionManager } from '../server/src/sessions.js';
import { TRACKED_STATS, type Scenario } from './scenarios.js';

export type StatMap = Record<string, number>;

/** Reference path: drive a standalone engine directly. */
export async function computeDirect(engine: Engine, scenario: Scenario): Promise<StatMap> {
  await engine.call('build.new', { id: scenario.id, name: scenario.id });
  for (const step of scenario.steps) await engine.call(step.method, step.params);
  return (await engine.call('calcs.getOutput', { stats: TRACKED_STATS })) as StatMap;
}

/** Web-stack path: create a build file, open the session, mutate, read output. */
export async function computeViaGateway(
  sessions: SessionManager,
  library: Library,
  scenario: Scenario,
  buildDir: string,
): Promise<StatMap> {
  // Start from a fresh default build file, exactly like "New build" in the UI.
  const id = await library.create(scenario.id);
  // Open the session (subscribe), then apply each step through the session — the
  // identical routing a WebSocket client would trigger.
  const fakeClient = { id: 'parity', label: 'parity', send: () => undefined, subscriptions: new Set<string>() };
  await sessions.open(fakeClient, id);
  for (const step of scenario.steps) await sessions.command(id, step.method, step.params);
  const out = (await sessions.command(id, 'calcs.getOutput', { stats: TRACKED_STATS })) as StatMap;
  sessions.close(fakeClient, id);
  // Clean up the scratch build file.
  await fs.rm(path.join(buildDir, id + '.xml'), { force: true });
  return out;
}

/** Compare two stat maps; returns the list of differing keys (empty == parity). */
export function diffStats(a: StatMap, b: StatMap): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs: string[] = [];
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    // Same engine -> bit-identical; allow only exact equality (NaN-safe).
    if (va !== vb && !(Number.isNaN(va) && Number.isNaN(vb))) diffs.push(`${k}: ${va} != ${vb}`);
  }
  return diffs;
}
