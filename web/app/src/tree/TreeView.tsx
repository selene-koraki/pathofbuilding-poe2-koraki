// React wrapper around the PixiJS TreeRenderer. Fetches geometry once, mounts the
// renderer, reflects engine allocation (build.updated -> setAllocated), and wires
// hover tooltips, search highlight, and the offence/defence power heatmap.
import { useEffect, useRef, useState } from 'react';
import { TreeRenderer } from './TreeRenderer';
import { ColorText } from '../components/ColorText';
import { Button, SearchField, Spinner } from '../components/primitives';
import { useStore } from '../store/build';
import type { TreeData } from '../../../shared/dto';
import './TreeView.css';

// Cache geometry per tree version across tab switches.
const treeCache = new Map<string, TreeData>();
type Heat = 'off' | 'offence' | 'defence';

export function TreeView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TreeRenderer | null>(null);
  const getTreeData = useStore((s) => s.getTreeData);
  const allocNode = useStore((s) => s.allocNode);
  const deallocNode = useStore((s) => s.deallocNode);
  const previewPath = useStore((s) => s.previewPath);
  const getTreeNode = useStore((s) => s.getTreeNode);
  const searchTree = useStore((s) => s.searchTree);
  const treePower = useStore((s) => s.treePower);
  const setAllocMode = useStore((s) => s.setAllocMode);
  const allocated = useStore((s) => s.build?.tree.allocated);
  const points = useStore((s) => s.build?.tree.points);
  const allocMode = useStore((s) => s.build?.tree.allocMode ?? 0);

  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<{ name: string; type: string; stats: string[] } | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [heat, setHeat] = useState<Heat>('off');
  const [q, setQ] = useState('');

  useEffect(() => {
    let renderer: TreeRenderer | null = null;
    let cancelled = false;
    const version = useStore.getState().build?.tree.treeVersion || 'cur';
    (async () => {
      const data = treeCache.get(version) || (await getTreeData());
      treeCache.set(data.version || version, data);
      if (cancelled || !canvasRef.current) return;
      renderer = new TreeRenderer();
      rendererRef.current = renderer;
      await renderer.init(canvasRef.current, data, {
        onToggle: (id, isAlloc) => (isAlloc ? void deallocNode(id) : void allocNode(id)),
        onHover: async (id) => {
          if (id == null) return setHover(null);
          const n = await getTreeNode(id);
          setHover({ name: n.name, type: n.type, stats: n.stats });
        },
        onPreview: (id) => previewPath(id).then((p) => p.path),
      });
      renderer.setAllocated(useStore.getState().build?.tree.allocated || []);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      renderer?.destroy();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect engine allocation changes.
  useEffect(() => {
    if (allocated && rendererRef.current) rendererRef.current.setAllocated(allocated);
  }, [allocated]);

  const cycleHeat = async () => {
    const next: Heat = heat === 'off' ? 'offence' : heat === 'offence' ? 'defence' : 'off';
    setHeat(next);
    if (next !== 'off') {
      const p = await treePower();
      rendererRef.current?.setHeatmap(next, p.power, { offence: p.maxOffence, defence: p.maxDefence });
    } else {
      rendererRef.current?.setHeatmap('off', null, { offence: 1, defence: 1 });
    }
  };

  const onSearch = (val: string) => {
    setQ(val);
    if (!val.trim()) {
      rendererRef.current?.setSearch([]);
      return;
    }
    void searchTree(val).then((ids) => rendererRef.current?.setSearch(ids));
  };

  return (
    <div className="tree-view">
      <div className="tree-toolbar">
        <span className="tree-points">
          {points ? `${points.used} pts` : ''}
          {points && points.ascendancy ? ` · ${points.ascendancy} asc` : ''}
        </span>
        <SearchField placeholder="Search tree…" value={q} onChange={(e) => onSearch(e.target.value)} />
        <Button active={heat !== 'off'} onClick={() => void cycleHeat()}>
          Heatmap: {heat}
        </Button>
        <Button
          active={allocMode !== 0}
          onClick={() => void setAllocMode((allocMode + 1) % 3)}
          title="Weapon-set passive allocation mode"
        >
          {allocMode === 0 ? 'Normal' : allocMode === 1 ? 'Weapon Set I' : 'Weapon Set II'}
        </Button>
        <span className="tree-hint">tap/click to allocate · drag to pan · pinch or scroll to zoom · shift-hover previews path</span>
      </div>
      <div className="tree-canvas-wrap" onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}>
        {!ready && <Spinner label="loading tree…" />}
        <canvas ref={canvasRef} className="tree-canvas" />
        {hover && (
          <div
            className="tree-tooltip"
            style={{ left: Math.min(mouse.x + 16, window.innerWidth - 320), top: mouse.y + 16 }}
          >
            <div className={`tt-name ${hover.type === 'Keystone' ? 'is-keystone' : ''}`}>{hover.name}</div>
            {hover.stats.map((s, i) => (
              <div key={i} className="tt-stat">
                <ColorText text={s} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
