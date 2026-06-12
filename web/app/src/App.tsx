import { useEffect } from 'react';
import { useStore, type TabId } from './store/build';
import { StatPanel } from './components/StatPanel';
import { BuildManager } from './components/BuildManager';
import { CharacterPanel } from './components/CharacterPanel';
import { Tabs } from './components/Tabs';
import { ConfigTab } from './tabs/ConfigTab';
import { SkillsTab } from './tabs/SkillsTab';
import { ItemsTab } from './tabs/ItemsTab';
import { NotesTab } from './tabs/NotesTab';
import { Panel, Chip, Spinner } from './components/primitives';
import './App.css';

const TABS: { id: TabId; label: string }[] = [
  { id: 'build', label: 'Build' },
  { id: 'skills', label: 'Skills' },
  { id: 'items', label: 'Items' },
  { id: 'config', label: 'Config' },
  { id: 'notes', label: 'Notes' },
];

export default function App() {
  const { connected, builds, activeId, build, presence, loading, tab } = useStore();
  const init = useStore((s) => s.init);
  const refreshLibrary = useStore((s) => s.refreshLibrary);
  const setTab = useStore((s) => s.setTab);

  useEffect(() => {
    init();
    void refreshLibrary();
  }, [init, refreshLibrary]);

  const otherDevices = (presence?.devices.length || 1) - 1;

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Path of Building <span className="two">2</span>
        </h1>
        <p className="tagline">a planner that looks like the game — computing on the real engine</p>
        <div className="topbar-status">
          <Chip tone={connected ? 'live' : 'warn'}>{connected ? 'synced' : 'reconnecting…'}</Chip>
          {otherDevices > 0 && (
            <Chip tone="ok">also open on {otherDevicesLabel(presence)}</Chip>
          )}
        </div>
      </header>

      <div className="layout">
        <BuildManager />
        <main className="planner">
          {!activeId && <Welcome />}
          {activeId && loading && !build && <Spinner label="loading build…" />}
          {activeId && build && (
            <>
              <Tabs tabs={TABS} active={tab} onSelect={setTab} />
              <div className="planner-body">
                <div className="planner-main">
                  {tab === 'build' && <CharacterPanel />}
                  {tab === 'skills' && <SkillsTab />}
                  {tab === 'items' && <ItemsTab />}
                  {tab === 'config' && <ConfigTab />}
                  {tab === 'notes' && <NotesTab />}
                </div>
                <Panel title="Stats" className="stats-panel">
                  <StatPanel rows={build.sidebar} warnings={build.warnings} />
                </Panel>
              </div>
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
