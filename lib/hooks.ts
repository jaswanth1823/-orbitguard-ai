import { useEffect, useRef } from 'react';

/**
 * Calls `handler` when a click or touch occurs outside of `ref`.
 * Also calls `handler` when Escape is pressed.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T>,
  handler: () => void,
  enabled = true,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handlerRef.current();
      }
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') handlerRef.current();
    }

    // Use pointerdown so the panel closes before the next click lands
    document.addEventListener('pointerdown', onPointer, { capture: true });
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('pointerdown', onPointer, { capture: true });
      document.removeEventListener('keydown', onKeydown);
    };
  }, [ref, enabled]);
}

/**
 * Focuses the first focusable element inside `containerRef` whenever `open`
 * becomes true. Restores focus to the trigger on close.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  open: boolean,
) {
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      const focusable = containerRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    } else {
      (triggerRef.current as HTMLElement | null)?.focus();
    }
  }, [open, containerRef]);
}
