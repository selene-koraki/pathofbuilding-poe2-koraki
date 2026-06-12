// PixiJS passive-tree renderer. The engine is authoritative for allocation and
// stats; this only reflects engine state and emits intents. Static geometry is
// built once; pan/zoom is a world transform (no redraw), and node colours are
// re-drawn only on allocation / search / heatmap changes — so it stays at 60fps.
import { Application, Container, Graphics } from 'pixi.js';
import type { TreeData, TreeNode } from '../../../shared/dto';

const COL = {
  edge: 0x3a3018,
  edgeAlloc: 0xc8aa64,
  nodeUnalloc: 0x2b2620,
  nodeReachable: 0x5f5848,
  nodeAlloc: 0xc8aa64,
  notable: 0xefd9a3,
  keystone: 0xff8844,
  socket: 0x3cd2d2,
  ascendancy: 0xb44bff,
  search: 0x46c246,
  preview: 0x4757e6,
  hover: 0xffffff,
};

function radius(n: TreeNode): number {
  switch (n.type) {
    case 'Keystone':
      return 65;
    case 'Notable':
      return 42;
    case 'Socket':
      return 45;
    case 'ClassStart':
      return 0;
    case 'AscendClassStart':
      return 24;
    default:
      return n.isMastery ? 38 : 22;
  }
}

export interface TreeCallbacks {
  onToggle: (id: number, allocated: boolean) => void;
  onHover: (id: number | null) => void;
  onPreview: (id: number) => Promise<number[]>;
}

export class TreeRenderer {
  private app = new Application();
  private world = new Container();
  private edgesG = new Graphics();
  private edgesAllocG = new Graphics();
  private nodesG = new Graphics();
  private overlayG = new Graphics();
  private data!: TreeData;
  private byId = new Map<number, TreeNode>();
  private grid = new Map<string, number[]>();
  private cell = 300;
  private allocated = new Set<number>();
  private searchSet = new Set<number>();
  private power: Record<string, { offence: number; defence: number }> | null = null;
  private powerMax = { offence: 1, defence: 1 };
  private heatmap: 'off' | 'offence' | 'defence' = 'off';
  private scale = 0.12;
  private dragging = false;
  private last = { x: 0, y: 0 };
  private cb!: TreeCallbacks;
  private shift = false;

  async init(canvas: HTMLCanvasElement, data: TreeData, cb: TreeCallbacks): Promise<void> {
    this.data = data;
    this.cb = cb;
    for (const n of data.nodes) {
      this.byId.set(n.id, n);
      const key = this.cellKey(n.x, n.y);
      (this.grid.get(key) || this.grid.set(key, []).get(key)!).push(n.id);
    }
    await this.app.init({
      canvas,
      antialias: true,
      backgroundAlpha: 0,
      resizeTo: canvas.parentElement || undefined,
    });
    this.world.addChild(this.edgesG, this.edgesAllocG, this.nodesG, this.overlayG);
    this.app.stage.addChild(this.world);
    this.buildEdges();
    this.redrawNodes();
    this.fit();
    this.bindEvents(canvas);
  }

  private cellKey(x: number, y: number): string {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
  }

  private buildEdges(): void {
    const seen = new Set<string>();
    const g = this.edgesG;
    g.clear();
    for (const n of this.data.nodes) {
      for (const t of n.conns) {
        const other = this.byId.get(t);
        if (!other) continue;
        const key = n.id < t ? `${n.id}-${t}` : `${t}-${n.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        g.moveTo(n.x, n.y).lineTo(other.x, other.y);
      }
    }
    g.stroke({ width: 18, color: COL.edge, alpha: 0.6 });
  }

  private redrawAllocEdges(): void {
    const g = this.edgesAllocG;
    g.clear();
    for (const id of this.allocated) {
      const n = this.byId.get(id);
      if (!n) continue;
      for (const t of n.conns) {
        if (id < t && this.allocated.has(t)) {
          const other = this.byId.get(t)!;
          g.moveTo(n.x, n.y).lineTo(other.x, other.y);
        }
      }
    }
    g.stroke({ width: 22, color: COL.edgeAlloc, alpha: 0.9 });
  }

  private heatColor(p: { offence: number; defence: number }): number | null {
    if (this.heatmap === 'off') return null;
    const v = this.heatmap === 'offence' ? p.offence / this.powerMax.offence : p.defence / this.powerMax.defence;
    if (!v || v <= 0) return null;
    const t = Math.min(1, v);
    if (this.heatmap === 'offence') {
      // dark -> orange -> red
      const r = Math.round(120 + 135 * t);
      const g = Math.round(40 + 60 * (1 - t));
      return (r << 16) | (g << 8) | 0x10;
    }
    const b = Math.round(120 + 135 * t);
    return (0x20 << 16) | (0x60 << 8) | b;
  }

  private nodeColor(n: TreeNode): number {
    if (this.searchSet.has(n.id)) return COL.search;
    if (this.heatmap !== 'off' && this.power) {
      const hc = this.heatColor(this.power[String(n.id)] || { offence: 0, defence: 0 });
      if (hc != null) return hc;
    }
    if (this.allocated.has(n.id)) {
      if (n.type === 'Keystone') return COL.keystone;
      if (n.type === 'Notable') return COL.notable;
      if (n.ascendancy) return COL.ascendancy;
      return COL.nodeAlloc;
    }
    if (n.type === 'Socket') return COL.socket;
    // reachable = adjacent to an allocated node
    for (const t of n.conns) if (this.allocated.has(t)) return COL.nodeReachable;
    return COL.nodeUnalloc;
  }

  private redrawNodes(): void {
    const g = this.nodesG;
    g.clear();
    for (const n of this.data.nodes) {
      const r = radius(n);
      if (r === 0) continue;
      const color = this.nodeColor(n);
      if (n.type === 'Socket') {
        g.circle(n.x, n.y, r).stroke({ width: 8, color });
      } else {
        g.circle(n.x, n.y, r).fill({ color });
        if (this.allocated.has(n.id)) g.circle(n.x, n.y, r).stroke({ width: 5, color: COL.edgeAlloc });
      }
    }
  }

  setAllocated(ids: number[]): void {
    this.allocated = new Set(ids);
    this.redrawAllocEdges();
    this.redrawNodes();
  }
  setSearch(ids: number[]): void {
    this.searchSet = new Set(ids);
    this.redrawNodes();
  }
  setHeatmap(
    mode: 'off' | 'offence' | 'defence',
    power: Record<string, { offence: number; defence: number }> | null,
    max: { offence: number; defence: number },
  ): void {
    this.heatmap = mode;
    this.power = power;
    if (max) this.powerMax = { offence: max.offence || 1, defence: max.defence || 1 };
    this.redrawNodes();
  }

  private drawOverlay(hoverId: number | null, path: number[] = []): void {
    const g = this.overlayG;
    g.clear();
    for (const id of path) {
      const n = this.byId.get(id);
      if (n) g.circle(n.x, n.y, radius(n) + 6).stroke({ width: 8, color: COL.preview });
    }
    if (hoverId != null) {
      const n = this.byId.get(hoverId);
      if (n) g.circle(n.x, n.y, radius(n) + 10).stroke({ width: 6, color: COL.hover, alpha: 0.8 });
    }
  }

  private fit(): void {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.data.nodes) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y);
    }
    const w = this.app.renderer.width, h = this.app.renderer.height;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    this.scale = Math.min(w / (maxX - minX), h / (maxY - minY)) * 0.9 || 0.1;
    this.world.scale.set(this.scale);
    this.world.position.set(w / 2 - cx * this.scale, h / 2 - cy * this.scale);
  }

  private toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.world.x) / this.scale, y: (sy - this.world.y) / this.scale };
  }

  private nearest(wx: number, wy: number): TreeNode | null {
    let best: TreeNode | null = null;
    let bestD = Infinity;
    const cx = Math.floor(wx / this.cell), cy = Math.floor(wy / this.cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const ids = this.grid.get(`${cx + dx},${cy + dy}`);
        if (!ids) continue;
        for (const id of ids) {
          const n = this.byId.get(id)!;
          const r = radius(n);
          if (r === 0) continue;
          const d = (n.x - wx) ** 2 + (n.y - wy) ** 2;
          if (d < bestD && d < (r + 20) ** 2) {
            bestD = d;
            best = n;
          }
        }
      }
    return best;
  }

  private bindEvents(canvas: HTMLCanvasElement): void {
    let hoverId: number | null = null;
    let rafPending = false;
    let lastMove = { x: 0, y: 0 };

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const before = this.toWorld(e.offsetX, e.offsetY);
      this.scale = Math.max(0.03, Math.min(2, this.scale * factor));
      this.world.scale.set(this.scale);
      this.world.position.set(e.offsetX - before.x * this.scale, e.offsetY - before.y * this.scale);
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.last = { x: e.offsetX, y: e.offsetY };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointerup', (e) => {
      this.dragging = false;
      const moved = Math.abs(e.offsetX - this.last.x) + Math.abs(e.offsetY - this.last.y);
      if (moved < 4) {
        const w = this.toWorld(e.offsetX, e.offsetY);
        const n = this.nearest(w.x, w.y);
        if (n && radius(n) > 0 && n.type !== 'ClassStart') {
          this.cb.onToggle(n.id, this.allocated.has(n.id));
        }
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      this.shift = e.shiftKey;
      lastMove = { x: e.offsetX, y: e.offsetY };
      if (this.dragging) {
        this.world.position.set(
          this.world.x + (e.offsetX - this.last.x),
          this.world.y + (e.offsetY - this.last.y),
        );
        this.last = { x: e.offsetX, y: e.offsetY };
        return;
      }
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const w = this.toWorld(lastMove.x, lastMove.y);
        const n = this.nearest(w.x, w.y);
        const id = n ? n.id : null;
        if (id !== hoverId) {
          hoverId = id;
          this.cb.onHover(id);
          if (id != null && this.shift && !this.allocated.has(id)) {
            void this.cb.onPreview(id).then((path) => this.drawOverlay(id, path));
          } else {
            this.drawOverlay(id);
          }
        } else if (id != null) {
          if (this.shift && !this.allocated.has(id)) {
            void this.cb.onPreview(id).then((path) => this.drawOverlay(id, path));
          }
        }
      });
    });
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}
