import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

interface AnnouncerContextValue {
  announcePolite: (message: string) => void;
  announceAssertive: (message: string) => void;
}

const AnnouncerContext = createContext<AnnouncerContextValue | null>(null);

export function LiveAnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');
  const clearTimerRef = useRef<number | null>(null);

  const scheduleAnnouncement = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string>>, message: string) => {
      if (!message.trim()) return;
      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current);
      }
      // Clear briefly so screen readers re-announce identical consecutive messages
      setter('');
      window.requestAnimationFrame(() => {
        setter(message);
      });
      clearTimerRef.current = window.setTimeout(() => {
        setter('');
      }, 6000);
    },
    [],
  );

  const announcePolite = useCallback(
    (message: string) => scheduleAnnouncement(setPoliteMessage, message),
    [scheduleAnnouncement],
  );

  const announceAssertive = useCallback(
    (message: string) => scheduleAnnouncement(setAssertiveMessage, message),
    [scheduleAnnouncement],
  );

  return (
    <AnnouncerContext.Provider value={{ announcePolite, announceAssertive }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="sr-only"
        data-testid="live-announcer-polite"
      >
        {politeMessage}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        role="alert"
        className="sr-only"
        data-testid="live-announcer-assertive"
      >
        {assertiveMessage}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): AnnouncerContextValue {
  const ctx = useContext(AnnouncerContext);
  if (!ctx) {
    throw new Error('useAnnouncer must be used within a LiveAnnouncerProvider.');
  }
  return ctx;
}
