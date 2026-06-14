// <SocketGroup> — a skill group card: enable/Full-DPS/main toggles, a gem list
// (active = gold, support = blue, unresolved = red), and a gem-search adder.
import { Checkbox, IconButton, Button } from './primitives';
import { GemCombobox } from './GemCombobox';
import { useStore } from '../store/build';
import type { GemInstance, SkillGroupSummary } from '../../../shared/dto';
import './SocketGroup.css';

function GemPill({ groupIndex, gem, gemIndex }: { groupIndex: number; gem: GemInstance; gemIndex: number }) {
  const setGem = useStore((s) => s.setGem);
  const removeGem = useStore((s) => s.removeGem);
  const cls = gem.error ? 'is-error' : gem.support ? 'is-support' : 'is-skill';
  return (
    <div className={`gem-pill ${cls} ${gem.enabled ? '' : 'is-disabled'}`} title={gem.error || gem.displayName}>
      <Checkbox
        checked={gem.enabled}
        onChange={(e) => void setGem(groupIndex, gemIndex, { enabled: e.target.checked })}
        aria-label={`enable ${gem.displayName}`}
      />
      <span className="gem-name">{gem.displayName || gem.nameSpec || '(empty)'}</span>
      <label className="gem-num" title="Level">
        L
        <input
          className="pob-input"
          type="number"
          min={1}
          max={40}
          defaultValue={gem.level}
          onBlur={(e) => void setGem(groupIndex, gemIndex, { level: Number(e.target.value) })}
        />
      </label>
      <label className="gem-num" title="Quality">
        Q
        <input
          className="pob-input"
          type="number"
          min={0}
          max={30}
          defaultValue={gem.quality}
          onBlur={(e) => void setGem(groupIndex, gemIndex, { quality: Number(e.target.value) })}
        />
      </label>
      <IconButton title="Remove gem" onClick={() => void removeGem(groupIndex, gemIndex)}>
        ✕
      </IconButton>
    </div>
  );
}

export function SocketGroup({ group }: { group: SkillGroupSummary }) {
  const mainSocketGroup = useStore((s) => s.build!.skills.mainSocketGroup);
  const setGroupEnabled = useStore((s) => s.setGroupEnabled);
  const setGroupFullDPS = useStore((s) => s.setGroupFullDPS);
  const renameGroup = useStore((s) => s.renameGroup);
  const removeGroup = useStore((s) => s.removeGroup);
  const setMainGroup = useStore((s) => s.setMainGroup);
  const addGem = useStore((s) => s.addGem);
  const isMain = group.index === mainSocketGroup;

  return (
    <div className={`socket-group ${isMain ? 'is-main' : ''} ${group.enabled ? '' : 'is-disabled'}`}>
      <div className="sg-head">
        <Checkbox
          checked={group.enabled}
          onChange={(e) => void setGroupEnabled(group.index, e.target.checked)}
          aria-label="enable group"
        />
        <input
          className="pob-input sg-label"
          defaultValue={group.rawLabel || ''}
          placeholder={group.label}
          onBlur={(e) => {
            if (e.target.value !== (group.rawLabel || '')) void renameGroup(group.index, e.target.value);
          }}
          aria-label="group label"
          disabled={!!group.source}
        />
        {isMain ? (
          <span className="sg-main-badge">main</span>
        ) : (
          <Button variant="ghost" onClick={() => void setMainGroup(group.index)} title="Set as main skill group">
            set main
          </Button>
        )}
        <Checkbox
          checked={group.includeInFullDPS}
          onChange={(e) => void setGroupFullDPS(group.index, e.target.checked)}
          label="Full DPS"
        />
        {!group.source && (
          <IconButton title="Delete group" onClick={() => void removeGroup(group.index)}>
            🗑
          </IconButton>
        )}
        {group.source && <span className="sg-source" title={`from ${group.source}`}>⛓ {group.slot || group.source}</span>}
      </div>

      <div className="sg-gems">
        {group.gems.map((gem, i) => (
          <GemPill key={i} groupIndex={group.index} gem={gem} gemIndex={i + 1} />
        ))}
        {group.gems.length === 0 && <div className="muted sg-empty">no gems yet</div>}
      </div>

      {!group.source && (
        <div className="sg-add">
          <GemCombobox onPick={(name) => void addGem(group.index, name)} />
        </div>
      )}
    </div>
  );
}
