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

/** Full per-build projection pushed after every mutation (the live state). */
export interface BuildState {
  id: string;
  name: string;
  meta: BuildMeta;
  sidebar: SidebarRow[];
  warnings: string[];
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

/** Config option descriptor (Phase 1 fills these from ConfigOptions.lua). */
export interface ConfigOption {
  var: string;
  label: string;
  type: 'check' | 'list' | 'count' | 'integer' | 'float' | 'text' | 'section';
  list?: Array<{ label: string; val: unknown }>;
  default?: unknown;
  tooltip?: string;
}
