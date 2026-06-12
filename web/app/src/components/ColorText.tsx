// <ColorText> — renders an engine string with ^-colour escapes as styled spans.
import { memo } from 'react';
import { parseColor } from '../design/colors';

export const ColorText = memo(function ColorText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  const spans = parseColor(text);
  return (
    <span className={className}>
      {spans.map((s, i) =>
        s.color ? (
          <span key={i} style={{ color: s.color }}>
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
});
