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

/** A socket group summarised for the header selectors. */
export interface SkillGroupSummary {
  index: number;
  label: string;
  enabled: boolean;
  includeInFullDPS: boolean;
  mainActiveSkill: number;
  skills: string[];
}
export interface SkillsState {
  mainSocketGroup: number;
  groups: SkillGroupSummary[];
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
