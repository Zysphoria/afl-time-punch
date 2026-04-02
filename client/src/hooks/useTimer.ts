import { useState, useEffect } from 'react';
import type { Session } from '../types.js';
import { computeElapsedSecs } from '../utils/time.js';

/**
 * Returns elapsed seconds for the active session.
 * Updates every second unless the session is paused.
 * Returns 0 when there is no active session.
 */
export function useTimer(activeSession: Session | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeSession) {
      setElapsed(0);
      return;
    }

    // Compute immediately (handles page refresh correctly)
    setElapsed(computeElapsedSecs(activeSession.clock_in, activeSession.pauses));

    // Check if session is paused (has an open pause with no end)
    const isPaused = activeSession.pauses.some(p => !p.end);
    if (isPaused) return; // Do not tick while paused

    const id = setInterval(() => {
      setElapsed(computeElapsedSecs(activeSession.clock_in, activeSession.pauses));
    }, 1000);

    return () => clearInterval(id);
  }, [activeSession]);

  return elapsed;
}
