// Items tab — equipment slots, equip/unequip, paste-from-game, unique DB search,
// item sets, and flask/charm activation. The ItemTooltip mirrors the engine's
// own coloured display.
import { useEffect, useMemo, useState } from 'react';
import { Panel, Button, Select, SearchField, Checkbox, Spinner } from '../components/primitives';
import { ItemTooltip } from '../components/ItemTooltip';
import { useStore } from '../store/build';
import type { ItemDetail, ItemSetInfo, ItemSlot, UniqueSummary } from '../../../shared/dto';
import './ItemsTab.css';

const RARITY: Record<string, string> = {
  NORMAL: 'r-normal',
  MAGIC: 'r-magic',
  RARE: 'r-rare',
  UNIQUE: 'r-unique',
  RELIC: 'r-relic',
};
const FLASK_OR_CHARM = (name: string) => name.startsWith('Flask') || name.startsWith('Charm');

export function ItemsTab() {
  const slots = useStore((s) => s.build!.items.slots);
  const activeSetId = useStore((s) => s.build!.items.activeSetId);
  const setSlotActive = useStore((s) => s.setSlotActive);
  const itemSets = useStore((s) => s.itemSets);
  const setActiveSet = useStore((s) => s.setActiveSet);
  const newItemSet = useStore((s) => s.newItemSet);

  const [selected, setSelected] = useState<string>(slots[0]?.name || 'Weapon 1');
  const [sets, setSets] = useState<ItemSetInfo[]>([]);

  const refreshSets = () => void itemSets().then((r) => setSets(r.sets));
  useEffect(() => {
    refreshSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSetId]);

  const selectedSlot = slots.find((s) => s.name === selected) || slots[0];

  return (
    <div className="items-tab">
      <div className="items-sets">
        <span className="il-label">Item set</span>
        <Select
          value={activeSetId}
          onChange={(e) => void setActiveSet(Number(e.target.value))}
          aria-label="item set"
        >
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </Select>
        <Button
          variant="ghost"
          onClick={() => {
            const t = window.prompt('New item set name', `Set ${sets.length + 1}`);
            if (t) void newItemSet(t).then(refreshSets);
          }}
        >
          + set
        </Button>
      </div>

      <div className="items-layout">
        <Panel title="Equipment" className="items-slots">
          <div className="slot-grid">
            {slots.map((slot) => (
              <button
                key={slot.name}
                className={`slot-card ${slot.name === selected ? 'is-selected' : ''}`}
                onClick={() => setSelected(slot.name)}
              >
                <span className="slot-name">{slot.name}</span>
                <span className={`slot-item ${slot.item ? RARITY[slot.item.rarity] : 'is-empty'}`}>
                  {slot.item ? slot.item.name : 'empty'}
                </span>
                {FLASK_OR_CHARM(slot.name) && slot.item && (
                  <span
                    className="slot-active"
                    onClick={(e) => {
                      e.stopPropagation();
                      void setSlotActive(slot.name, !slot.active);
                    }}
                  >
                    <Checkbox checked={!!slot.active} readOnly label="active" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </Panel>

        {selectedSlot && <EquipPanel slot={selectedSlot} />}
      </div>
    </div>
  );
}

function EquipPanel({ slot }: { slot: ItemSlot }) {
  const searchUniques = useStore((s) => s.searchUniques);
  const equipUnique = useStore((s) => s.equipUnique);
  const pasteItem = useStore((s) => s.pasteItem);
  const unequip = useStore((s) => s.unequip);
  const getItemDetail = useStore((s) => s.getItemDetail);

  const [q, setQ] = useState('');
  const [uniques, setUniques] = useState<UniqueSummary[]>([]);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [pasting, setPasting] = useState(false);
  const slotBase = useMemo(() => slot.name.replace(/ \d$/, ''), [slot.name]);

  useEffect(() => {
    let alive = true;
    void searchUniques(q, slotBase).then((u) => alive && setUniques(u.slice(0, 40)));
    return () => {
      alive = false;
    };
  }, [q, slotBase, searchUniques]);

  useEffect(() => {
    if (slot.item) {
      let alive = true;
      void getItemDetail(slot.item.id).then((d) => alive && setDetail(d));
      return () => {
        alive = false;
      };
    }
    setDetail(null);
  }, [slot.item, getItemDetail]);

  return (
    <Panel title={slot.name} className="equip-panel">
      {detail ? (
        <div className="equip-current">
          <ItemTooltip detail={detail} />
          <Button variant="ghost" onClick={() => void unequip(slot.name)}>
            Unequip
          </Button>
        </div>
      ) : (
        slot.item && <Spinner label="loading…" />
      )}

      <div className="equip-paste">
        {!pasting ? (
          <Button variant="ghost" onClick={() => setPasting(true)}>
            Paste item…
          </Button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pasteText.trim()) {
                void pasteItem(pasteText, slot.name);
                setPasteText('');
                setPasting(false);
              }
            }}
          >
            <textarea
              className="pob-input"
              rows={5}
              placeholder="Paste an item copied from the game…"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div className="equip-paste-actions">
              <Button type="submit" variant="primary">
                Equip
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPasting(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>

      <div className="equip-db">
        <SearchField
          placeholder={`Search uniques for ${slotBase}…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="unique-list">
          {uniques.map((u) => (
            <li key={u.name}>
              <button className="r-unique" onClick={() => void equipUnique(u.name, slot.name)}>
                {u.name}
              </button>
            </li>
          ))}
          {uniques.length === 0 && <li className="muted">no uniques for this slot</li>}
        </ul>
      </div>
    </Panel>
  );
}
