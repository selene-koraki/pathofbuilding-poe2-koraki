// Library — owns the shared Builds/ folder: lists builds, reads/writes the same
// plain-XML files the desktop app uses, and tracks favorites + cached metadata
// in a small sidecar so the Build Manager has rich cards without loading every
// build through the engine.

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import type { Engine } from './engine.js';
import type { BuildState, BuildSummary } from '../../shared/dto.js';

const SIDECAR = '.pob-web.json';

interface SidecarEntry {
  favorite?: boolean;
  mainSkill?: string;
  className?: string;
  ascendancy?: string;
  level?: number;
}
type Sidecar = Record<string, SidecarEntry>;

function idToFile(id: string): string {
  return path.join(config.buildDir, id + '.xml');
}
function fileToId(rel: string): string {
  return rel.replace(/\.xml$/i, '');
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.buildDir, { recursive: true });
}

async function readSidecar(): Promise<Sidecar> {
  try {
    return JSON.parse(await fs.readFile(path.join(config.buildDir, SIDECAR), 'utf8'));
  } catch {
    return {};
  }
}
async function writeSidecar(s: Sidecar): Promise<void> {
  await fs.writeFile(path.join(config.buildDir, SIDECAR), JSON.stringify(s, null, 2));
}

/** Parse the cheap <Build .../> header attributes from raw XML. */
function parseHeader(xml: string): Partial<SidecarEntry> {
  const m = xml.match(/<Build\b([^>]*)>/);
  if (!m) return {};
  const attrs = m[1];
  const get = (k: string) => attrs.match(new RegExp(`${k}="([^"]*)"`))?.[1];
  const level = get('level');
  return {
    className: get('className') || undefined,
    ascendancy: get('ascendClassName') || undefined,
    level: level ? Number(level) : undefined,
  };
}

/** Recursively collect *.xml build files relative to buildDir. */
async function walk(dir: string, base: string, out: string[]): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(full, rel, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.xml')) out.push(rel);
  }
}

export class Library {
  constructor(private engine: Engine) {}

  async init(): Promise<void> {
    await ensureDir();
    await this.ensureSample();
  }

  /** Generate a Sample build straight from the engine if the folder is empty. */
  private async ensureSample(): Promise<void> {
    const files: string[] = [];
    await walk(config.buildDir, '', files);
    if (files.length > 0) return;
    try {
      await this.engine.call('build.new', { id: 'Sample', name: 'Sample' });
      const res = (await this.engine.call('build.save', { name: 'Sample' })) as { xml: string };
      this.engine.loadedBuildId = 'Sample';
      await fs.writeFile(idToFile('Sample'), res.xml);
      process.stderr.write('[library] wrote Sample build\n');
    } catch (e) {
      process.stderr.write(`[library] could not create sample: ${(e as Error).message}\n`);
    }
  }

  async list(): Promise<BuildSummary[]> {
    await ensureDir();
    const files: string[] = [];
    await walk(config.buildDir, '', files);
    const sidecar = await readSidecar();
    const out: BuildSummary[] = [];
    for (const rel of files) {
      const id = fileToId(rel);
      const full = path.join(config.buildDir, rel);
      let stat: import('node:fs').Stats;
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      const side = sidecar[id] || {};
      // Prefer cached metadata; fall back to a cheap header parse.
      let header: Partial<SidecarEntry> = side;
      if (side.className === undefined || side.level === undefined) {
        try {
          header = { ...parseHeader(await fs.readFile(full, 'utf8')), ...side };
        } catch {
          /* ignore */
        }
      }
      const folder = id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '';
      const name = id.slice(id.lastIndexOf('/') + 1);
      out.push({
        id,
        name,
        folder,
        className: header.className,
        ascendancy: header.ascendancy,
        level: header.level,
        mainSkill: side.mainSkill,
        favorite: !!side.favorite,
        updatedAt: stat.mtimeMs,
      });
    }
    out.sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt);
    return out;
  }

  async read(id: string): Promise<string> {
    return fs.readFile(idToFile(id), 'utf8');
  }

  async exists(id: string): Promise<boolean> {
    try {
      await fs.access(idToFile(id));
      return true;
    } catch {
      return false;
    }
  }

  async write(id: string, xml: string): Promise<void> {
    const file = idToFile(id);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, xml);
  }

  /** Update the cached metadata for a build from its latest computed state. */
  async cacheMeta(id: string, state: BuildState): Promise<void> {
    const s = await readSidecar();
    s[id] = {
      ...s[id],
      mainSkill: state.meta.mainSkill,
      className: state.meta.className,
      ascendancy: state.meta.ascendancy,
      level: state.meta.level,
    };
    await writeSidecar(s);
  }

  private async uniqueId(base: string): Promise<string> {
    if (!(await this.exists(base))) return base;
    for (let i = 2; i < 1000; i++) {
      const cand = `${base} ${i}`;
      if (!(await this.exists(cand))) return cand;
    }
    return `${base} ${Date.now()}`;
  }

  /** Create a new default build (engine-generated XML). Returns its id. */
  async create(name: string, folder = ''): Promise<string> {
    const base = folder ? `${folder}/${name}` : name;
    const id = await this.uniqueId(base);
    await this.engine.call('build.new', { id, name });
    const res = (await this.engine.call('build.save', { name })) as { xml: string };
    this.engine.loadedBuildId = id;
    await this.write(id, res.xml);
    return id;
  }

  /** Import a base64url build code into a new file. Returns its id. */
  async importCode(code: string, name: string, folder = ''): Promise<string> {
    const base = folder ? `${folder}/${name}` : name;
    const id = await this.uniqueId(base);
    await this.engine.call('build.importCode', { id, code, name });
    const res = (await this.engine.call('build.save', { name })) as { xml: string };
    this.engine.loadedBuildId = id;
    await this.write(id, res.xml);
    return id;
  }

  async duplicate(id: string, name?: string): Promise<string> {
    const xml = await this.read(id);
    const folder = id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '';
    const baseName = name || id.slice(id.lastIndexOf('/') + 1) + ' copy';
    const newId = await this.uniqueId(folder ? `${folder}/${baseName}` : baseName);
    await this.write(newId, xml);
    return newId;
  }

  async rename(id: string, name: string): Promise<string> {
    const folder = id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '';
    const newId = folder ? `${folder}/${name}` : name;
    if (newId === id) return id;
    await fs.rename(idToFile(id), idToFile(newId));
    await this.moveSidecar(id, newId);
    return newId;
  }

  async move(id: string, folder: string): Promise<string> {
    const name = id.slice(id.lastIndexOf('/') + 1);
    const newId = folder ? `${folder}/${name}` : name;
    if (newId === id) return id;
    const file = idToFile(newId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.rename(idToFile(id), file);
    await this.moveSidecar(id, newId);
    return newId;
  }

  private async moveSidecar(from: string, to: string): Promise<void> {
    const s = await readSidecar();
    if (s[from]) {
      s[to] = s[from];
      delete s[from];
      await writeSidecar(s);
    }
  }

  async remove(id: string): Promise<void> {
    await fs.unlink(idToFile(id)).catch(() => undefined);
    const s = await readSidecar();
    if (s[id]) {
      delete s[id];
      await writeSidecar(s);
    }
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    const s = await readSidecar();
    s[id] = { ...s[id], favorite };
    await writeSidecar(s);
  }

  async listFolders(): Promise<string[]> {
    const files: string[] = [];
    await walk(config.buildDir, '', files);
    const folders = new Set<string>();
    for (const rel of files) {
      const id = fileToId(rel);
      if (id.includes('/')) folders.add(id.slice(0, id.lastIndexOf('/')));
    }
    return [...folders].sort();
  }
}
