// Numeric-parity corpus (grows each phase; >=25 real builds by Phase 7).
//
// Each scenario describes how to construct a build from scratch and a sequence of
// mutations to apply. The harness (web/parity/runner.ts) computes the resulting
// stat output two ways — directly via the headless engine and via the full web
// stack (gateway sessions) — and asserts they are numerically identical. This is
// the objective bar for "parity": prove it, don't assert it.

export interface RpcCall {
  method: string;
  params?: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  name: string;
  /** Construction + mutation sequence applied after build.new. */
  steps: RpcCall[];
}

// Stats sampled for comparison. getOutput returns only the numeric ones present.
export const TRACKED_STATS = [
  'Life',
  'Mana',
  'EnergyShield',
  'TotalEHP',
  'Armour',
  'Evasion',
  'WardArmour',
  'Str',
  'Dex',
  'Int',
  'FireResist',
  'ColdResist',
  'LightningResist',
  'ChaosResist',
  'FullDPS',
  'TotalDPS',
  'AverageHit',
  'CritChance',
  'BlockChance',
  'MovementSpeedMod',
];

// Phase 1 corpus: every class at a few levels, plus config-toggle matrices.
// classId is the passive tree's class id (not an alphabetical index).
const CLASSES = [
  { classId: 11, name: 'Druid' },
  { classId: 2, name: 'Ranger' },
  { classId: 1, name: 'Witch' },
];

const CONFIG_MATRIX: RpcCall[][] = [
  [],
  [{ method: 'config.set', params: { var: 'enemyIsBoss', value: 'Boss' } }],
  [
    { method: 'config.set', params: { var: 'enemyIsBoss', value: 'Pinnacle' } },
    { method: 'config.set', params: { var: 'resistancePenalty', value: -60 } },
  ],
  [
    { method: 'config.set', params: { var: 'conditionStationary', value: 1 } },
    { method: 'config.set', params: { var: 'multiplierNearbyEnemies', value: 5 } },
  ],
];

export const SCENARIOS: Scenario[] = [];
for (const cls of CLASSES) {
  for (const level of [1, 45, 90]) {
    for (let ci = 0; ci < CONFIG_MATRIX.length; ci++) {
      SCENARIOS.push({
        id: `${cls.name.toLowerCase()}-l${level}-cfg${ci}`,
        name: `${cls.name} lvl ${level} cfg#${ci}`,
        steps: [
          { method: 'character.setClass', params: { classId: cls.classId } },
          { method: 'character.setLevel', params: { level } },
          ...CONFIG_MATRIX[ci],
        ],
      });
    }
  }
}
