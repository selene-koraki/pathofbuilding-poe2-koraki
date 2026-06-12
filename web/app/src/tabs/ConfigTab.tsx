// Config tab — auto-generated from the engine's ConfigOptions schema. Only the
// options the desktop would currently show (conditions met) are rendered, and
// every change recomputes live via config.set. Includes quest-reward campaign
// buffs and the custom-modifiers box (both are just sections of the schema).
import { useMemo, useState } from 'react';
import { Panel, Checkbox, Select, NumberInput, SearchField } from '../components/primitives';
import { ColorText } from '../components/ColorText';
import { parseColor } from '../design/colors';
import { useStore } from '../store/build';
import type { ConfigOption } from '../../../shared/dto';
import './ConfigTab.css';

const stripColor = (s?: string) =>
  s ? parseColor(s).map((x) => x.text).join('') : undefined;

function ConfigControl({ opt }: { opt: ConfigOption }) {
  const input = useStore((s) => s.build!.config.input);
  const setConfig = useStore((s) => s.setConfig);
  const current = input[opt.var];
  const title = stripColor(opt.tooltip);

  if (opt.type === 'check') {
    return (
      <div className="cfg-row" title={title}>
        <Checkbox
          checked={Boolean(current ?? opt.default ?? false)}
          onChange={(e) => void setConfig(opt.var, e.target.checked)}
          label={<ColorText text={opt.label} />}
        />
      </div>
    );
  }

  if (opt.type === 'list') {
    const value = current ?? opt.default;
    return (
      <label className="cfg-row cfg-field" title={title}>
        <span className="cfg-label">
          <ColorText text={opt.label} />
        </span>
        <Select
          value={String(value)}
          onChange={(e) => {
            const chosen = opt.list?.find((o) => String(o.val) === e.target.value);
            void setConfig(opt.var, chosen ? chosen.val : e.target.value);
          }}
        >
          {opt.list?.map((o, i) => (
            <option key={i} value={String(o.val)}>
              {stripColor(o.label)}
            </option>
          ))}
        </Select>
      </label>
    );
  }

  if (opt.type === 'text') {
    return (
      <label className="cfg-row cfg-textarea" title={title}>
        <span className="cfg-label">
          <ColorText text={opt.label} />
        </span>
        <textarea
          className="pob-input"
          rows={4}
          defaultValue={String(current ?? '')}
          onBlur={(e) => void setConfig(opt.var, e.target.value)}
        />
      </label>
    );
  }

  // count / integer / float
  return (
    <label className="cfg-row cfg-field" title={title}>
      <span className="cfg-label">
        <ColorText text={opt.label} />
      </span>
      <NumberInput
        defaultValue={current != null ? String(current) : ''}
        onBlur={(e) => {
          const v = e.target.value.trim();
          void setConfig(opt.var, v === '' ? null : Number(v));
        }}
      />
    </label>
  );
}

export function ConfigTab() {
  const schema = useStore((s) => s.configSchema);
  const shown = useStore((s) => s.build!.config.shown);
  const [q, setQ] = useState('');
  const shownSet = useMemo(() => new Set(shown), [shown]);

  if (!schema) return <Panel title="Configuration">Loading…</Panel>;
  const needle = q.trim().toLowerCase();

  const sections = schema.sections
    .map((sec) => ({
      ...sec,
      options: sec.options.filter((o) => {
        if (!shownSet.has(o.var)) return false;
        if (needle && !stripColor(o.label)?.toLowerCase().includes(needle)) return false;
        return true;
      }),
    }))
    .filter((sec) => sec.options.length > 0);

  return (
    <div className="config-tab">
      <div className="config-search">
        <SearchField placeholder="Search config…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="config-grid">
        {sections.map((sec) => (
          <Panel key={sec.section} title={<ColorText text={sec.section} />} className="config-section">
            {sec.options.map((opt) => (
              <ConfigControl key={opt.var} opt={opt} />
            ))}
          </Panel>
        ))}
        {sections.length === 0 && <p className="muted">No matching options.</p>}
      </div>
    </div>
  );
}
