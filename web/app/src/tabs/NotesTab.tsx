// Notes tab — free-text build notes, autosaved on blur.
import { useEffect, useState } from 'react';
import { Panel } from '../components/primitives';
import { useStore } from '../store/build';

export function NotesTab() {
  const notes = useStore((s) => s.notes);
  const saveNotes = useStore((s) => s.saveNotes);
  const [draft, setDraft] = useState(notes);
  useEffect(() => setDraft(notes), [notes]);

  return (
    <Panel title="Notes">
      <textarea
        className="pob-input"
        style={{ width: '100%', minHeight: '50vh', resize: 'vertical', fontFamily: 'var(--font-body)' }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== notes) void saveNotes(draft);
        }}
        aria-label="build notes"
      />
    </Panel>
  );
}
