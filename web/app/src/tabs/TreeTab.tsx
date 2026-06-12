// Tree tab — the PixiJS passive tree plus a spec (loadout) selector.
import { useEffect, useState } from 'react';
import { TreeView } from '../tree/TreeView';
import { Select } from '../components/primitives';
import { useStore } from '../store/build';

export function TreeTab() {
  const listSpecs = useStore((s) => s.listSpecs);
  const selectSpec = useStore((s) => s.selectSpec);
  const treeRev = useStore((s) => s.build?.tree.treeVersion);
  const [specs, setSpecs] = useState<Array<{ index: number; title: string; version: string }>>([]);
  const [active, setActive] = useState(1);

  useEffect(() => {
    void listSpecs().then((r) => {
      setSpecs(r.specs);
      setActive(r.active);
    });
  }, [listSpecs, treeRev]);

  return (
    <div className="tree-tab">
      {specs.length > 1 && (
        <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="il-label">Tree</span>
          <Select value={active} onChange={(e) => void selectSpec(Number(e.target.value))}>
            {specs.map((s) => (
              <option key={s.index} value={s.index}>
                {s.title} ({s.version})
              </option>
            ))}
          </Select>
        </div>
      )}
      <TreeView />
    </div>
  );
}
