// Shared RPC schema — the transport-agnostic message contract.
//
// Today these messages travel browser -> gateway (WebSocket) -> engine (stdio).
// A future WASM build would carry the SAME schema over postMessage, changing
// only the gateway. Keep this file free of Node/DOM imports.

import type { BuildState, BuildSummary, PresenceInfo, ConfigOption } from './dto.js';

// ----- Client -> Gateway (over WebSocket) -----------------------------------

/** A command targets either the library (folder ops) or an open build's session. */
export interface ClientRequest {
  id: number; // correlation id (client-scoped)
  method: string; // "<domain>.<method>", e.g. "library.open", "character.setLevel"
  params?: Record<string, unknown>;
}

/** Sent once on connect so the gateway can label the device for presence. */
export interface HelloMessage {
  type: 'hello';
  device: { id: string; label: string };
}

export type ClientMessage = HelloMessage | ({ type: 'request' } & ClientRequest);

// ----- Gateway -> Client ----------------------------------------------------

export interface ResponseMessage {
  type: 'response';
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type ServerEvent =
  | { type: 'event'; event: 'build.updated'; data: BuildState }
  | { type: 'event'; event: 'library.changed'; data: { builds: BuildSummary[] } }
  | { type: 'event'; event: 'presence'; data: PresenceInfo }
  | { type: 'event'; event: 'progress'; data: { msg: string } }
  | { type: 'event'; event: 'error'; data: { where: string; msg: string } }
  | { type: 'event'; event: 'engine'; data: { status: 'up' | 'down' | 'restarting' } };

export type ServerMessage = ResponseMessage | ServerEvent;

// ----- Method catalogue (names are the contract; params kept loose for v1) ---

export const Methods = {
  // Library (gateway-owned: folder + file I/O)
  libraryList: 'library.list',
  libraryOpen: 'library.open', // { id }   -> subscribe device to build session
  libraryClose: 'library.close', // { id }
  libraryNew: 'library.new', // { name, folder? }
  libraryDuplicate: 'library.duplicate', // { id, name? }
  libraryRename: 'library.rename', // { id, name }
  libraryDelete: 'library.delete', // { id }
  libraryMove: 'library.move', // { id, folder }
  libraryFavorite: 'library.favorite', // { id, favorite }
  libraryListFolders: 'library.listFolders',
  libraryImportCode: 'library.importCode', // { code, name }

  // Build (engine-owned)
  buildGetState: 'build.getState',
  buildSave: 'build.save', // { name? }
  buildExportCode: 'build.exportCode',

  // Character
  characterSetLevel: 'character.setLevel', // { level }
  characterSetClass: 'character.setClass', // { classId }
  characterSetAscendancy: 'character.setAscendancy', // { ascendClassId }

  // Config
  configGetSchema: 'config.getSchema',
  configGet: 'config.get',
  configSet: 'config.set', // { var, value }

  // Calcs
  calcsGetSidebar: 'calcs.getSidebar',
  calcsGetOutput: 'calcs.getOutput', // { stats? }

  // Notes
  notesGet: 'notes.get',
  notesSet: 'notes.set', // { text }
} as const;

export type { BuildState, BuildSummary, PresenceInfo, ConfigOption };
