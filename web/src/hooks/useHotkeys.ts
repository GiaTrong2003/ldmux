import { useEffect } from 'react';

export function useEscape(enabled: boolean, handler: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === 'TEXTAREA') t.blur();
      handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, handler]);
}

// Enter (no modifiers, no shift) submits; Shift/Ctrl/Meta + Enter = newline.
export function submitOnEnter(
  onSubmit: () => void
): (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void {
  return e => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    // `e.nativeEvent.isComposing` — don't interrupt IME (Vietnamese, Japanese, etc.)
    if ((e.nativeEvent as any).isComposing) return;
    e.preventDefault();
    onSubmit();
  };
}
