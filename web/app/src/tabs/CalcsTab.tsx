// Calcs tab — a searchable explorer over every computed output stat, with the
// engine's own breakdown (the multiplicative chain + modifier sources) for the
// selected stat. Values come straight from the engine, so they match the desktop.
import { useEffect, useMemo, useState } from 'react';
import { Panel, SearchField, Spinner } from '../components/primitives';
import { ColorText } from '../components/ColorText';
import { useStore, type BreakdownDetail } from '../store/build';
import './CalcsTab.css';

const fmt = (n: number) =>
  Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : String(+n.toFixed(2));

export function CalcsTab() {
  const getFullOutput = useStore((s) => s.getFullOutput);
  const getBreakdown = useStore((s) => s.getBreakdown);
  const buildRev = useStore((s) => s.build); // re-fetch when the build changes
  const [output, setOutput] = useState<Record<string, number> | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [bd, setBd] = useState<BreakdownDetail | null>(null);

  useEffect(() => {
    let alive = true;
    void getFullOutput().then((o) => alive && setOutput(o));
    return () => {
      alive = false;
    };
  }, [getFullOutput, buildRev]);

  useEffect(() => {
    if (!selected) {
      setBd(null);
      return;
    }
    let alive = true;
    void getBreakdown(selected).then((d) => alive && setBd(d));
    return () => {
      alive = false;
    };
  }, [selected, getBreakdown, buildRev]);

  const stats = useMemo(() => {
    if (!output) return [];
    const needle = q.trim().toLowerCase();
    return Object.keys(output)
      .filter((k) => !needle || k.toLowerCase().includes(needle))
      .sort()
      .map((k) => ({ key: k, value: output[k] }));
  }, [output, q]);

  return (
    <div className="calcs-tab">
      <Panel title="Output stats" className="calcs-list-panel">
        <SearchField placeholder="Search stats…" value={q} onChange={(e) => setQ(e.target.value)} />
        {!output && <Spinner label="computing…" />}
        <ul className="calcs-stat-list">
          {stats.map((s) => (
            <li key={s.key}>
              <button
                className={`calcs-stat ${s.key === selected ? 'is-active' : ''}`}
                onClick={() => setSelected(s.key)}
              >
                <span className="cs-name">{s.key}</span>
                <span className="cs-value">{fmt(s.value)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={selected ? `Breakdown — ${selected}` : 'Breakdown'} className="calcs-bd-panel">
        {!selected && <p className="muted">Select a stat to see how it's calculated.</p>}
        {selected && bd && (
          <div className="calcs-breakdown">
            {bd.lines.length === 0 && bd.rows.length === 0 && (
              <p className="muted">No detailed breakdown for this stat.</p>
            )}
            {bd.lines.map((l, i) => (
              <div key={i} className="bd-line">
                <ColorText text={l} />
              </div>
            ))}
            {bd.rows.length > 0 && (
              <table className="bd-table">
                {bd.columns.length > 0 && (
                  <thead>
                    <tr>
                      {bd.columns.map((c, i) => (
                        <th key={i}>
                          <ColorText text={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {bd.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>
                          <ColorText text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
