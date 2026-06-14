// Command palette (Ctrl-K) — jump to any tab or build, undo/redo, export. The
// keyboard-first affordance the desktop UI lacks.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type TabId } from '../store/build';
import './CommandPalette.css';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setTab = useStore((s) => s.setTab);
  const builds = useStore((s) => s.builds);
  const openBuild = useStore((s) => s.openBuild);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const activeId = useStore((s) => s.activeId);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Cmd[]>(() => {
    const tabs: TabId[] = ['build', 'tree', 'skills', 'items', 'calcs', 'config', 'notes'];
    const cmds: Cmd[] = tabs.map((t) => ({
      id: `tab:${t}`,
      label: `Go to ${t[0].toUpperCase() + t.slice(1)}`,
      hint: 'tab',
      run: () => setTab(t),
    }));
    if (activeId) {
      cmds.push({ id: 'undo', label: 'Undo', hint: 'Ctrl-Z', run: () => void undo() });
      cmds.push({ id: 'redo', label: 'Redo', hint: 'Ctrl-Y', run: () => void redo() });
    }
    for (const b of builds) {
      cmds.push({ id: `open:${b.id}`, label: `Open ${b.name}`, hint: b.className || 'build', run: () => void openBuild(b.id) });
    }
    return cmds;
  }, [builds, activeId, setTab, openBuild, undo, redo]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (n ? commands.filter((c) => c.label.toLowerCase().includes(n)) : commands).slice(0, 40);
  }, [q, commands]);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;
  return (
    <div className="cmdk-overlay" onMouseDown={onClose}>
      <div className="cmdk" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Jump to a tab, build, or action…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, filtered.length - 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            else if (e.key === 'Enter' && filtered[active]) {
              filtered[active].run();
              onClose();
            } else if (e.key === 'Escape') onClose();
          }}
        />
        <ul className="cmdk-list">
          {filtered.map((c, i) => (
            <li
              key={c.id}
              className={`cmdk-item ${i === active ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={() => {
                c.run();
                onClose();
              }}
            >
              <span>{c.label}</span>
              {c.hint && <span className="cmdk-hint">{c.hint}</span>}
            </li>
          ))}
          {filtered.length === 0 && <li className="cmdk-empty">no matches</li>}
        </ul>
      </div>
    </div>
  );
}
