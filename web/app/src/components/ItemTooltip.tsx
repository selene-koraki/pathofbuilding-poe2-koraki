// <ItemTooltip> — the coloured item display. Renders the engine's own tooltip
// lines (rarity colour + per-mod ^-codes, incl. the red "not supported" signal),
// so the display matches the desktop exactly.
import { ColorText } from './ColorText';
import type { ItemDetail } from '../../../shared/dto';
import './ItemTooltip.css';

const RARITY_CLASS: Record<string, string> = {
  NORMAL: 'r-normal',
  MAGIC: 'r-magic',
  RARE: 'r-rare',
  UNIQUE: 'r-unique',
  RELIC: 'r-relic',
};

export function ItemTooltip({ detail }: { detail: ItemDetail }) {
  return (
    <div className={`item-tooltip ${RARITY_CLASS[detail.rarity] || ''}`}>
      {detail.tooltip.map((line, i) => (
        <div
          key={i}
          className="it-line"
          style={line.size ? { fontSize: `${Math.min(line.size, 18)}px` } : undefined}
        >
          <ColorText text={line.text} />
        </div>
      ))}
    </div>
  );
}
