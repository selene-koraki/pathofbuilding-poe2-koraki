// Build Manager — the home/library screen and quick-switcher. Rich cards (class,
// level, main skill, favorite), search + sort, folders, and create / duplicate /
// rename / delete / import-code. Reflects library.changed live across devices.
import { useMemo, useState } from 'react';
import { Panel, Button, TextInput, Select, SearchField, IconButton } from './primitives';
import { useStore } from '../store/build';
import type { BuildSummary } from '../../../shared/dto';
import './BuildManager.css';

type Sort = 'recent' | 'name' | 'level';

export function BuildManager() {
  const builds = useStore((s) => s.builds);
  const activeId = useStore((s) => s.activeId);
  const openBuild = useStore((s) => s.openBuild);
  const newBuild = useStore((s) => s.newBuild);
  const importCode = useStore((s) => s.importCode);
  const duplicate = useStore((s) => s.duplicate);
  const rename = useStore((s) => s.rename);
  const del = useStore((s) => s.del);
  const favorite = useStore((s) => s.favorite);

  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [importing, setImporting] = useState(false);
  const [code, setCode] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = builds.filter(
      (b) =>
        !needle ||
        b.name.toLowerCase().includes(needle) ||
        (b.className || '').toLowerCase().includes(needle) ||
        (b.mainSkill || '').toLowerCase().includes(needle),
    );
    const byFav = (a: BuildSummary, b: BuildSummary) => Number(b.favorite) - Number(a.favorite);
    list.sort((a, b) => {
      const f = byFav(a, b);
      if (f) return f;
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'level') return (b.level || 0) - (a.level || 0);
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [builds, q, sort]);

  // Group by folder for display.
  const groups = useMemo(() => {
    const m = new Map<string, BuildSummary[]>();
    for (const b of filtered) {
      const k = b.folder || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(b);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

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
          <Button variant="primary" type="submit" title="Create build">
            +
          </Button>
        </form>

        <div className="bm-toolbar">
          <SearchField
            placeholder="Search builds…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="search builds"
          />
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="sort">
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="level">Level</option>
          </Select>
        </div>

        <div className="bm-import">
          {!importing ? (
            <Button variant="ghost" onClick={() => setImporting(true)}>
              Import build code…
            </Button>
          ) : (
            <form
              className="bm-import-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) {
                  void importCode(code.trim(), 'Imported');
                  setCode('');
                  setImporting(false);
                }
              }}
            >
              <textarea
                className="pob-input"
                rows={2}
                placeholder="Paste a PoB build code…"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-label="build code"
              />
              <div className="bm-import-actions">
                <Button type="submit" variant="primary">
                  Import
                </Button>
                <Button type="button" variant="ghost" onClick={() => setImporting(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>

        <div className="build-list" role="list">
          {groups.map(([folder, items]) => (
            <div key={folder} className="bm-folder">
              {folder && <div className="bm-folder-name">{folder}</div>}
              {items.map((b) => (
                <div key={b.id} className={`bm-card ${b.id === activeId ? 'is-active' : ''}`}>
                  <IconButton
                    className={`bm-fav ${b.favorite ? 'on' : ''}`}
                    title={b.favorite ? 'Unfavorite' : 'Favorite'}
                    onClick={() => void favorite(b.id, !b.favorite)}
                  >
                    {b.favorite ? '★' : '☆'}
                  </IconButton>
                  <button
                    className="bm-open"
                    onClick={() => void openBuild(b.id)}
                    data-build-id={b.id}
                  >
                    <span className="bl-name">{b.name}</span>
                    <span className="bl-meta">
                      {b.className || '—'}
                      {b.level ? ` · lvl ${b.level}` : ''}
                      {b.mainSkill ? ` · ${b.mainSkill}` : ''}
                    </span>
                  </button>
                  <div className="bm-actions">
                    <IconButton title="Duplicate" onClick={() => void duplicate(b.id)}>
                      ⧉
                    </IconButton>
                    <IconButton
                      title="Rename"
                      onClick={() => {
                        const n = window.prompt('Rename build', b.name);
                        if (n && n.trim()) void rename(b.id, n.trim());
                      }}
                    >
                      ✎
                    </IconButton>
                    <IconButton
                      title="Delete"
                      onClick={() => {
                        if (window.confirm(`Delete "${b.name}"?`)) void del(b.id);
                      }}
                    >
                      🗑
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {builds.length === 0 && <div className="muted">no builds yet</div>}
        </div>
      </Panel>
    </aside>
  );
}
