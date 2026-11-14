// Shared building blocks: bottom sheet, stepper, segmented control, toggle.
import { useEffect, useRef, type ReactNode } from 'react';
import { Close } from './icons';

interface SheetProps {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  /** 'sheet' slides from the bottom; 'modal' is centred; 'full' covers the screen. */
  kind?: 'sheet' | 'modal' | 'full';
  tall?: boolean;
  className?: string;
}

export function Sheet({ title, onClose, children, kind = 'sheet', tall, className = '' }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`overlay overlay-${kind}`} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={`panel panel-${kind}${tall ? ' panel-tall' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="panel-head">
          <h2>{title}</h2>
          {onClose && <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Close size={18} /></button>}
        </header>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
}

interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  unit?: string;
}

export function Stepper({ value, min, max, onChange, label, unit }: StepperProps) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="step-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Less ${label}`}>−</button>
      <output className="step-value" aria-live="polite">{value}{unit ? <small> {unit}</small> : null}</output>
      <button type="button" className="step-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}>+</button>
    </div>
  );
}

interface SegProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: SegProps<T>) {
  return (
    <div className="field">
      <span className="field-label" id={`seg-${label}`}>{label}</span>
      <div className="segmented" role="radiogroup" aria-labelledby={`seg-${label}`}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value}
            className={o.value === value ? 'seg on' : 'seg'} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="toggle" role="switch" aria-checked={value} onClick={() => onChange(!value)}>
      <span className="toggle-text"><span>{label}</span>{hint && <small>{hint}</small>}</span>
      <span className={value ? 'switch on' : 'switch'} aria-hidden="true"><i /></span>
    </button>
  );
}
