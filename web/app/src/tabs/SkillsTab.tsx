// Skills tab — socket groups, gems, supports, main skill, Full DPS, and paste.
import { useState } from 'react';
import { Panel, Button } from '../components/primitives';
import { SocketGroup } from '../components/SocketGroup';
import { useStore } from '../store/build';
import './SkillsTab.css';

export function SkillsTab() {
  const groups = useStore((s) => s.build!.skills.groups);
  const addGroup = useStore((s) => s.addGroup);
  const pasteGroup = useStore((s) => s.pasteGroup);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');

  return (
    <Panel title="Skills">
      <div className="skills-toolbar">
        <Button variant="primary" onClick={() => void addGroup('')}>
          + Socket group
        </Button>
        <Button variant="ghost" onClick={() => setPasting((p) => !p)}>
          Paste group…
        </Button>
      </div>

      {pasting && (
        <form
          className="skills-paste"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) {
              void pasteGroup(text);
              setText('');
              setPasting(false);
            }
          }}
        >
          <textarea
            className="pob-input"
            rows={4}
            placeholder={'Fireball 20/20 1\nFire Penetration II 20/0 1'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="paste socket group"
          />
          <div className="skills-paste-actions">
            <Button type="submit" variant="primary">
              Add
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPasting(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="skills-groups">
        {groups.map((g) => (
          <SocketGroup key={g.index} group={g} />
        ))}
        {groups.length === 0 && (
          <p className="muted">No socket groups yet. Add one, then search for a skill gem.</p>
        )}
      </div>
    </Panel>
  );
}
