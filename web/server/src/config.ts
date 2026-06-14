// Gateway configuration, all overridable by environment.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// web/server/dist/config.js or web/server/src/config.ts -> repo root is ../../..
export const REPO_ROOT = path.resolve(here, '..', '..', '..');

export const config = {
  /** LAN port; default per deployment spec. */
  port: Number(process.env.PORT) || 7632,
  /** Bind address; 0.0.0.0 so any LAN device can reach it. */
  host: process.env.HOST || '0.0.0.0',
  /** Shared Builds folder (same plain-XML files the desktop app uses). */
  buildDir: process.env.POB_BUILD_DIR || path.join(REPO_ROOT, 'web', 'builds'),
  /** Engine kernel entrypoint + the src/ cwd it must run from. */
  engineScript: path.join(REPO_ROOT, 'web', 'engine', 'kernel.lua'),
  engineCwd: path.join(REPO_ROOT, 'src'),
  luajit: process.env.POB_LUAJIT || 'luajit',
  /** Built SPA to serve (vite build output). */
  appDist: path.join(REPO_ROOT, 'web', 'app', 'dist'),
  /** Debounced autosave delay after the last mutation. */
  autosaveMs: Number(process.env.POB_AUTOSAVE_MS) || 1500,
  /** Idle session eviction after the last device leaves. */
  sessionIdleMs: Number(process.env.POB_SESSION_IDLE_MS) || 5 * 60 * 1000,
  repoRoot: REPO_ROOT,
};

/** LUA_PATH/LUA_CPATH the engine subprocess needs: vendored runtime + rocks. */
export function engineEnv(): NodeJS.ProcessEnv {
  const runtime = path.join(REPO_ROOT, 'runtime', 'lua');
  const luaPath = `${runtime}/?.lua;${runtime}/?/init.lua;${process.env.LUA_PATH || ''};;`;
  const luaCpath = `${process.env.LUA_CPATH || ''};;`;
  return {
    ...process.env,
    LUA_PATH: luaPath,
    LUA_CPATH: luaCpath,
    HOME: process.env.HOME || '/tmp',
    CI: '', // let the engine load ModCache for speed/parity with desktop
  };
}
