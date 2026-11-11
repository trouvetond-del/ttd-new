import { useEffect, useState, type InputHTMLAttributes } from 'react';

// Keep an editing buffer: clearing a number must never immediately restore 0/1.
// Existing callers still receive numeric changes and retain their save validation.
export function NumberInput({ value, onChange, onFocus, onBlur, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => { if (!editing) setDraft(String(value ?? '')); }, [value, editing]);
  return <input {...props} type="number" value={editing ? draft : value ?? ''}
    onFocus={(e) => { setDraft(e.currentTarget.value); setEditing(true); onFocus?.(e); }}
    onChange={(e) => {
      setEditing(true);
      setDraft(e.currentTarget.value);
      // Empty is an intermediate edit, not a replacement business value.
      if (e.currentTarget.value !== '') onChange?.(e);
    }}
    onBlur={(e) => { setEditing(false); onBlur?.(e); }} />;
}
