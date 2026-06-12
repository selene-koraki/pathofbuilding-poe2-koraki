import { useEffect, useState } from 'react';
import { useStore, type TabId } from './store/build';
import { StatPanel } from './components/StatPanel';
import { BuildManager } from './components/BuildManager';
import { CharacterPanel } from './components/CharacterPanel';
import { Tabs } from './components/Tabs';
import { ConfigTab } from './tabs/ConfigTab';
import { TreeTab } from './tabs/TreeTab';
import { SkillsTab } from './tabs/SkillsTab';
import { ItemsTab } from './tabs/ItemsTab';
import { CalcsTab } from './tabs/CalcsTab';
import { NotesTab } from './tabs/NotesTab';
import { Panel, Chip, Spinner, Button, IconButton } from './components/primitives';
import { CommandPalette } from './components/CommandPalette';
import './App.css';

const TABS: { id: TabId; label: string }[] = [
  { id: 'build', label: 'Build' },
  { id: 'tree', label: 'Tree' },
  { id: 'skills', label: 'Skills' },
  { id: 'items', label: 'Items' },
  { id: 'calcs', label: 'Calcs' },
  { id: 'config', label: 'Config' },
  { id: 'notes', label: 'Notes' },
];

export default function App() {
  const { connected, builds, activeId, build, presence, loading, tab } = useStore();
  const init = useStore((s) => s.init);
  const refreshLibrary = useStore((s) => s.refreshLibrary);
  const setTab = useStore((s) => s.setTab);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const exportCode = useStore((s) => s.exportCode);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [exported, setExported] = useState<string | null>(null);

  useEffect(() => {
    init();
    void refreshLibrary();
  }, [init, refreshLibrary]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (useStore.getState().activeId) {
          e.preventDefault();
          void undo();
        }
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        if (useStore.getState().activeId) {
          e.preventDefault();
          void redo();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const otherDevices = (presence?.devices.length || 1) - 1;

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Path of Building <span className="two">2</span>
        </h1>
        <p className="tagline">a planner that looks like the game — computing on the real engine</p>
        <div className="topbar-status">
          {activeId && (
            <>
              <IconButton title="Undo (Ctrl-Z)" onClick={() => void undo()}>
                ↶
              </IconButton>
              <IconButton title="Redo (Ctrl-Y)" onClick={() => void redo()}>
                ↷
              </IconButton>
              <Button variant="ghost" onClick={() => void exportCode().then(setExported)} title="Export build code">
                Export
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl-K)">
            ⌘K
          </Button>
          <Chip tone={connected ? 'live' : 'warn'}>{connected ? 'synced' : 'reconnecting…'}</Chip>
          {otherDevices > 0 && <Chip tone="ok">also open on {otherDevicesLabel(presence)}</Chip>}
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {exported != null && (
        <div className="cmdk-overlay" onMouseDown={() => setExported(null)}>
          <div className="export-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Build code</h3>
            <p className="muted">Paste this into desktop PoB or another device to import the build.</p>
            <textarea className="pob-input" readOnly value={exported} rows={6} onFocus={(e) => e.currentTarget.select()} />
            <div className="export-actions">
              <Button
                variant="primary"
                onClick={() => {
                  void navigator.clipboard?.writeText(exported);
                }}
              >
                Copy
              </Button>
              <Button variant="ghost" onClick={() => setExported(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="layout">
        <BuildManager />
        <main className="planner">
          {!activeId && <Welcome />}
          {activeId && loading && !build && <Spinner label="loading build…" />}
          {activeId && build && (
            <>
              <Tabs tabs={TABS} active={tab} onSelect={setTab} />
              {tab === 'tree' ? (
                <TreeTab />
              ) : (
                <div className="planner-body">
                  <div className="planner-main">
                    {tab === 'build' && <CharacterPanel />}
                    {tab === 'skills' && <SkillsTab />}
                    {tab === 'items' && <ItemsTab />}
                    {tab === 'calcs' && <CalcsTab />}
                    {tab === 'config' && <ConfigTab />}
                    {tab === 'notes' && <NotesTab />}
                  </div>
                  <Panel title="Stats" className="stats-panel">
                    <StatPanel rows={build.sidebar} warnings={build.warnings} />
                  </Panel>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <footer className="statusbar">
        {builds.length} build{builds.length === 1 ? '' : 's'} · engine authoritative · single-user LAN
      </footer>
    </div>
  );
}

// Label another device viewing the same build (exclude self from presence).
function otherDevicesLabel(presence: ReturnType<typeof useStore.getState>['presence']): string {
  if (!presence) return 'another device';
  let selfId = '';
  try {
    selfId = localStorage.getItem('pob-device-id') || '';
  } catch {
    /* ignore */
  }
  const other = presence.devices.find((d) => d.id !== selfId);
  return other?.label || 'another device';
}

function Welcome() {
  return (
    <Panel title="Welcome">
      <p className="muted">
        Pick a build from the library, or create a new one. Open the same build on another device —
        it stays in lockstep.
      </p>
    </Panel>
  );
}
