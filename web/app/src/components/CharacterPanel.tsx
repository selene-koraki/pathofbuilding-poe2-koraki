// Character header — class / ascendancy / level + main skill-group & skill.
import { useState } from 'react';
import { Panel, Select, NumberInput } from './primitives';
import { ColorText } from './ColorText';
import { useStore } from '../store/build';
import './CharacterPanel.css';

export function CharacterPanel() {
  const build = useStore((s) => s.build)!;
  const classes = useStore((s) => s.classes);
  const setClass = useStore((s) => s.setClass);
  const setAscendancy = useStore((s) => s.setAscendancy);
  const setLevel = useStore((s) => s.setLevel);
  const setMainGroup = useStore((s) => s.setMainGroup);
  const setMainSkill = useStore((s) => s.setMainSkill);
  const [levelDraft, setLevelDraft] = useState<number | null>(null);

  const curClass = classes?.classes.find((c) => c.classId === classes.curClassId);
  const groups = build.skills?.groups || [];
  const mainGroup = groups.find((g) => g.index === build.skills?.mainSocketGroup);
  const level = levelDraft ?? build.meta.level ?? 1;

  return (
    <Panel title="Character" className="char-panel">
      <div className="char-title">
        <ColorText
          text={`${build.meta.className || '—'}${
            build.meta.ascendancy && build.meta.ascendancy !== 'None'
              ? ' · ' + build.meta.ascendancy
              : ''
          }`}
        />
      </div>
      <div className="char-grid">
        <label>
          <span>Class</span>
          <Select
            value={classes?.curClassId ?? ''}
            onChange={(e) => void setClass(Number(e.target.value))}
            aria-label="class"
          >
            {classes?.classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>

        <label>
          <span>Ascendancy</span>
          <Select
            value={classes?.curAscendClassId ?? 0}
            onChange={(e) => void setAscendancy(Number(e.target.value))}
            aria-label="ascendancy"
          >
            {curClass?.ascendancies.map((a) => (
              <option key={a.ascendClassId} value={a.ascendClassId}>
                {a.name}
              </option>
            ))}
          </Select>
        </label>

        <label>
          <span>Level</span>
          <NumberInput
            min={1}
            max={100}
            value={level}
            onChange={(e) => setLevelDraft(Number(e.target.value))}
            onBlur={() => {
              if (levelDraft != null && levelDraft !== build.meta.level) {
                void setLevel(levelDraft);
                setLevelDraft(null);
              }
            }}
            aria-label="character level"
          />
        </label>
      </div>

      {groups.length > 0 && (
        <div className="char-grid">
          <label>
            <span>Main skill group</span>
            <Select
              value={build.skills.mainSocketGroup}
              onChange={(e) => void setMainGroup(Number(e.target.value))}
              aria-label="main skill group"
            >
              {groups.map((g) => (
                <option key={g.index} value={g.index}>
                  {g.label}
                </option>
              ))}
            </Select>
          </label>
          {mainGroup && mainGroup.skills.length > 1 && (
            <label>
              <span>Main skill</span>
              <Select
                value={mainGroup.mainActiveSkill}
                onChange={(e) => void setMainSkill(mainGroup.index, Number(e.target.value))}
                aria-label="main skill"
              >
                {mainGroup.skills.map((sk, i) => (
                  <option key={i} value={i + 1}>
                    {sk}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
      )}
    </Panel>
  );
}
