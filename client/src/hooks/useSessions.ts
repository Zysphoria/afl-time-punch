import { useState, useEffect, useCallback } from 'react';
import {
  fetchSessions,
  clockIn as apiClockIn,
  clockOut as apiClockOut,
  pauseSession as apiPause,
  resumeSession as apiResume,
  editSessionTimes as apiEdit,
  deleteSession as apiDelete,
} from '../api.js';
import type { Session } from '../types.js';

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  /** The single session without a clock_out, if any */
  const activeSession = sessions.find(s => s.clock_out === null) ?? null;

  const clockIn = useCallback(async () => {
    const created = await apiClockIn();
    setSessions(prev => [...prev, created]);
    return created;
  }, []);

  const clockOut = useCallback(async (id: number) => {
    const updated = await apiClockOut(id);
    setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const pause = useCallback(async (id: number) => {
    const updated = await apiPause(id);
    setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const resume = useCallback(async (id: number, comment?: string) => {
    const updated = await apiResume(id, comment);
    setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const editTimes = useCallback(async (id: number, clockInISO: string, clockOutISO?: string) => {
    const updated = await apiEdit(id, clockInISO, clockOutISO);
    setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const removeSession = useCallback(async (id: number) => {
    await apiDelete(id);
    setSessions(prev => prev.filter(s => s.id !== id));
  }, []);

  return {
    sessions,
    activeSession,
    loading,
    error,
    refresh,
    clockIn,
    clockOut,
    pause,
    resume,
    editTimes,
    deleteSession: removeSession,
  };
}
