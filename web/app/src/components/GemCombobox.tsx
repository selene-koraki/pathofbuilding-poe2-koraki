// Async gem search combobox — type to find an active skill or support, pick to
// add it to the group. Backed by the engine's gem database (skills.searchGems).
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/build';
import './GemCombobox.css';

export function GemCombobox({ onPick }: { onPick: (name: string) => void }) {
  const searchGems = useStore((s) => s.searchGems);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Array<{ name: string; support: boolean }>>([]);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void searchGems(q).then((r) => alive && setResults(r.slice(0, 30)));
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, searchGems]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (name: string) => {
    onPick(name);
    setQ('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="gem-combo" ref={ref}>
      <input
        className="pob-input"
        placeholder="+ add gem (active or support)…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            pick(results[active].name);
          } else if (e.key === 'Escape') setOpen(false);
        }}
        aria-label="add gem"
      />
      {open && results.length > 0 && (
        <ul className="gem-combo-list" role="listbox">
          {results.map((g, i) => (
            <li
              key={g.name}
              role="option"
              aria-selected={i === active}
              className={`gem-combo-item ${i === active ? 'is-active' : ''} ${g.support ? 'is-support' : 'is-skill'}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(g.name);
              }}
            >
              <span>{g.name}</span>
              {g.support && <span className="gem-tag">support</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
