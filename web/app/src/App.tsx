import { useEffect, useState } from 'react';
import { useStore } from './store/build';
import { StatPanel } from './components/StatPanel';
import { ColorText } from './components/ColorText';
import { Panel, Button, NumberInput, Chip, Spinner, TextInput } from './components/primitives';
import './App.css';

export default function App() {
  const { connected, builds, activeId, build, presence, loading } = useStore();
  const init = useStore((s) => s.init);
  const refreshLibrary = useStore((s) => s.refreshLibrary);

  useEffect(() => {
    init();
    void refreshLibrary();
  }, [init, refreshLibrary]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Path of Building <span className="two">2</span>
        </h1>
        <p className="tagline">a planner that looks like the game — computing on the real engine</p>
        <div className="topbar-status">
          <Chip tone={connected ? 'live' : 'warn'}>{connected ? 'synced' : 'reconnecting…'}</Chip>
          {presence && presence.devices.length > 1 && (
            <Chip tone="ok">also open on {presence.devices.length - 1} other device(s)</Chip>
          )}
        </div>
      </header>

      <div className="layout">
        <BuildManager />
        <main className="planner">
          {!activeId && <Welcome />}
          {activeId && loading && !build && <Spinner label="loading build…" />}
          {activeId && build && <Planner />}
        </main>
      </div>

      <footer className="statusbar">
        {builds.length} build{builds.length === 1 ? '' : 's'} · engine authoritative · single-user LAN
      </footer>
    </div>
  );
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

function BuildManager() {
  const { builds, activeId } = useStore();
  const openBuild = useStore((s) => s.openBuild);
  const newBuild = useStore((s) => s.newBuild);
  const [name, setName] = useState('');

  return (
    <aside className="sidebar">
      <Panel title="Build Manager">
        <form
          className="new-build"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              void newBuild(name.trim());
              setName('');
            }
          }}
        >
          <TextInput
            placeholder="New build name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="new build name"
          />
          <Button variant="primary" type="submit">
            +
          </Button>
        </form>
        <ul className="build-list" role="list">
          {builds.map((b) => (
            <li key={b.id}>
              <Button
                active={b.id === activeId}
                onClick={() => void openBuild(b.id)}
                data-build-id={b.id}
              >
                <span className="bl-name">
                  {b.favorite ? '★ ' : ''}
                  {b.name}
                </span>
                <span className="bl-meta">
                  {b.className || '—'}
                  {b.level ? ` · lvl ${b.level}` : ''}
                </span>
              </Button>
            </li>
          ))}
          {builds.length === 0 && <li className="muted">no builds yet</li>}
        </ul>
      </Panel>
    </aside>
  );
}

function Planner() {
  const build = useStore((s) => s.build)!;
  const command = useStore((s) => s.command);
  const [levelDraft, setLevelDraft] = useState<number | null>(null);
  const level = levelDraft ?? build.meta.level ?? 1;

  return (
    <div className="planner-grid">
      <Panel title="Character" className="char-panel">
        <div className="char-title">
          <ColorText
            text={`${build.meta.className || '—'}${
              build.meta.ascendancy && build.meta.ascendancy !== 'None'
                ? ' · ' + build.meta.ascendancy
                : ''
            }`}
          />
        </div>
        <div className="char-sub">{build.name}</div>
        <label className="level-row">
          <span>Level</span>
          <NumberInput
            min={1}
            max={100}
            value={level}
            onChange={(e) => setLevelDraft(Number(e.target.value))}
            onBlur={() => {
              if (levelDraft != null && levelDraft !== build.meta.level) {
                void command('character.setLevel', { level: levelDraft });
              }
            }}
            aria-label="character level"
          />
        </label>
      </Panel>

      <Panel title="Stats" className="stats-panel">
        <StatPanel rows={build.sidebar} warnings={build.warnings} />
      </Panel>
    </div>
  );
}
