import React, { useEffect, useRef } from 'react';

/**
 * Moves focus to the error summary banner whenever a form submit fails validation.
 */
export function useFocusErrorSummary(
  summaryRef: React.RefObject<HTMLElement | null>,
  hasErrors: boolean,
  submitAttemptCount: number,
): void {
  useEffect(() => {
    if (submitAttemptCount > 0 && hasErrors && summaryRef.current) {
      summaryRef.current.focus();
    }
  }, [summaryRef, hasErrors, submitAttemptCount]);
}

/**
 * Traps keyboard focus inside an open modal/dialog, closes on Escape,
 * and restores focus to the element that opened the dialog.
 */
export function useDialogFocusTrap(
  isOpen: boolean,
  dialogRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const container = dialogRef.current;

    const getFocusable = (): HTMLElement[] => {
      if (!container) return [];
      const selector = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',');
      return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    };

    const rafId = window.requestAnimationFrame(() => {
      const focusables = getFocusable();
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container?.focus();
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        const focusables = getFocusable();
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, dialogRef, onClose]);
}

/**
 * Keyboard handler for WAI-ARIA tablists (ArrowLeft, ArrowRight, Home, End).
 */
export function useTabListKeyboard<T extends string>(
  tabs: readonly T[],
  activeTab: T,
  onSelectTab: (tab: T) => void,
  tabRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>,
) {
  return (event: React.KeyboardEvent, currentTab: T) => {
    const currentIndex = tabs.indexOf(currentTab);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab !== activeTab) {
      onSelectTab(nextTab);
    }
    tabRefs.current[nextTab]?.focus();
  };
}
