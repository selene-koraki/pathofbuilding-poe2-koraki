// Core primitives for the design system. Bespoke (no UI framework) so a single
// token file re-themes everything. Expanded across phases; the tabs consume
// these rather than raw elements.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import './primitives.css';

export function Panel({
  title,
  children,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`pob-panel ${className || ''}`}>
      {title != null && <h2 className="pob-section">{title}</h2>}
      {children}
    </section>
  );
}

export function Button({
  variant = 'default',
  active,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'primary';
  active?: boolean;
}) {
  return (
    <button
      className={`pob-btn pob-btn-${variant} ${active ? 'is-active' : ''} ${className || ''}`}
      {...rest}
    />
  );
}

export function IconButton({
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`pob-iconbtn ${className || ''}`} {...rest} />;
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`pob-input ${className || ''}`} {...rest} />;
}

export function NumberInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" className={`pob-input ${className || ''}`} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={`pob-input pob-select ${className || ''}`} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className="pob-check">
      <input type="checkbox" {...rest} />
      {label != null && <span>{label}</span>}
    </label>
  );
}

export function SearchField({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`pob-search ${className || ''}`}>
      <span className="pob-search-icon" aria-hidden>
        ⌕
      </span>
      <input type="search" className="pob-input" {...rest} />
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="pob-spinner" role="status" aria-live="polite">
      <div className="pob-spinner-ring" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: 'ok' | 'warn' | 'live' }) {
  return <span className={`pob-chip pob-chip-${tone || 'ok'}`}>{children}</span>;
}
