// Shared DTOs — the contract between the LuaJIT engine kernel, the Node gateway,
// and the React app. One source of truth for the shapes that cross the wire.
//
// Colour escapes (^x.., ^N) inside strings are passed through verbatim from the
// engine and rendered by the app's <ColorText>; never strip them here.

/** One row of the engine's computed stat sidebar. Exactly one variant is set. */
export type SidebarRow =
  | { label: string; value: string }
  | { header: string }
  | { spacer: true };

/** Character/build header metadata. */
export interface BuildMeta {
  level?: number;
  className?: string;
  classId?: number;
  ascendancy?: string;
  ascendancyId?: number;
  mainSkill?: string;
  fullDPS?: number;
  life?: number;
  energyShield?: number;
}

/** Current config values + which option vars the desktop would currently show. */
export interface ConfigState {
  input: Record<string, string | number | boolean>;
  shown: string[];
}

/** One gem instance inside a socket group. */
export interface GemInstance {
  nameSpec: string;
  displayName: string;
  level: number;
  quality: number;
  enabled: boolean;
  count: number;
  support: boolean;
  color?: string;
  error?: string;
}

/** A socket group: header summary + full gem list for the Skills tab. */
export interface SkillGroupSummary {
  index: number;
  label: string;
  rawLabel?: string;
  enabled: boolean;
  includeInFullDPS: boolean;
  source?: string;
  slot?: string;
  mainActiveSkill: number;
  skills: string[];
  gems: GemInstance[];
}
export interface SkillsState {
  mainSocketGroup: number;
  groups: SkillGroupSummary[];
}

/** A summarised item (for slot cards and lists). */
export interface ItemSummary {
  id: number;
  name: string;
  rarity: string;
  type?: string;
}

/** One equipment slot and what's in it. */
export interface ItemSlot {
  name: string;
  itemId: number;
  active?: boolean;
  item?: ItemSummary;
}
export interface ItemsState {
  slots: ItemSlot[];
  activeSetId: number;
}

/** Full item detail incl. coloured tooltip lines (engine-authoritative). */
export interface ItemDetail {
  id: number;
  name: string;
  rarity: string;
  baseName?: string;
  type?: string;
  tooltip: Array<{ size?: number; text: string }>;
}

export interface UniqueSummary {
  name: string;
  rarity: string;
  baseName?: string;
  type?: string;
  slot?: string;
}
export interface ItemSetInfo {
  id: number;
  title: string;
  active: boolean;
}

/** Passive-tree allocation state (geometry fetched once via tree.getData). */
export interface TreePoints {
  used: number;
  ascendancy: number;
  secondaryAscendancy: number;
  sockets: number;
  weaponSet1: number;
  weaponSet2: number;
}
export interface TreeState {
  treeVersion: string;
  classId: number;
  ascendClassId: number;
  allocMode: number;
  allocated: number[];
  masterySelections: Record<string, number>;
  points: TreePoints;
}

/** Full per-build projection pushed after every mutation (the live state). */
export interface BuildState {
  id: string;
  name: string;
  meta: BuildMeta;
  sidebar: SidebarRow[];
  warnings: string[];
  config: ConfigState;
  skills: SkillsState;
  items: ItemsState;
  tree: TreeState;
}

/** Tree geometry (one-time fetch, cached client-side). */
export interface TreeNode {
  id: number;
  x: number;
  y: number;
  type: string;
  name?: string;
  ascendancy?: string;
  isMastery?: boolean;
  group?: number;
  orbit?: number;
  conns: number[];
}
export interface TreeData {
  version: string;
  scaleImage: number;
  nodes: TreeNode[];
  groups: Array<{ id: number; x: number; y: number }>;
}

/** A lightweight summary the Build Manager lists (derived from the XML header). */
export interface BuildSummary {
  id: string; // stable id (folder-relative path without extension)
  name: string; // display name
  folder: string; // "" for root
  className?: string;
  ascendancy?: string;
  level?: number;
  mainSkill?: string;
  favorite: boolean;
  updatedAt: number; // epoch ms (file mtime)
}

/** Which devices are currently subscribed to a given build session. */
export interface PresenceInfo {
  buildId: string;
  devices: Array<{ id: string; label: string }>;
}

/** Config option descriptor, generated from ConfigOptions.lua. */
export interface ConfigOption {
  var: string;
  label: string;
  type: string; // check | list | count | integer | float | text | ...
  list?: Array<{ label: string; val: unknown }>;
  default?: unknown;
  tooltip?: string;
}

/** One section of the Config tab (e.g. General, Combat, Quest Rewards). */
export interface ConfigSectionSchema {
  section: string;
  col?: number;
  options: ConfigOption[];
}
export interface ConfigSchema {
  sections: ConfigSectionSchema[];
}

/** A class + its ascendancies, for the character selectors. */
export interface ClassInfo {
  classId: number;
  name: string;
  ascendancies: Array<{ ascendClassId: number; name: string }>;
}
export interface ClassCatalogue {
  classes: ClassInfo[];
  curClassId: number;
  curAscendClassId: number;
}
