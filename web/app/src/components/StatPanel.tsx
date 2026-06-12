// <StatPanel> — the persistent stat sidebar. Renders the engine's own computed
// list (label/value rows, section headers, spacers) with colour passthrough.
import { ColorText } from './ColorText';
import type { SidebarRow } from '../../../shared/dto';
import './StatPanel.css';

export function StatPanel({ rows, warnings }: { rows: SidebarRow[]; warnings?: string[] }) {
  return (
    <div className="pob-statlist">
      {rows.map((row, i) => {
        if ('spacer' in row) return <div key={i} className="pob-stat-gap" />;
        if ('header' in row)
          return (
            <div key={i} className="pob-stat-head">
              <ColorText text={row.header} />
            </div>
          );
        return (
          <div key={i} className="pob-stat-row">
            <span className="pob-stat-label">
              <ColorText text={row.label} />
            </span>
            <span className="pob-stat-value">
              <ColorText text={row.value} />
            </span>
          </div>
        );
      })}
      {warnings && warnings.length > 0 && (
        <div className="pob-warnings">
          {warnings.map((w, i) => (
            <div key={i} className="pob-warning">
              <ColorText text={w} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
