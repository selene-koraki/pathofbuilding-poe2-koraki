// Tab bar primitive — engraved gold underline for the active tab.
import './Tabs.css';

export interface TabDef<T extends string> {
  id: T;
  label: string;
}

export function Tabs<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabDef<T>[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="pob-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          className={`pob-tab ${t.id === active ? 'is-active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
