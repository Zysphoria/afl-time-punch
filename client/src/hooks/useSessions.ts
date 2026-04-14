import { useState, useEffect, useCallback } from 'react';
import {
  fetchSessions,
  clockIn as apiClockIn,
  clockOut as apiClockOut,
  pauseSession as apiPause,
  resumeSession as apiResume,
  editSessionTimes as apiEdit,
  deleteSession as apiDelete,
  createManualSession as apiCreateManual,
} from '../api.js';
import type { Session } from '../types.js';

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data);
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
    }
  }, []);

  useEffect(() => {
    refresh();
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

  const addManualEntry = useCallback(async (clockInISO: string, clockOutISO: string) => {
    const created = await apiCreateManual(clockInISO, clockOutISO);
    setSessions(prev => [...prev, created].sort((a, b) => a.clock_in.localeCompare(b.clock_in)));
    return created;
  }, []);

  return {
    sessions,
    activeSession,
    refresh,
    clockIn,
    clockOut,
    pause,
    resume,
    editTimes,
    deleteSession: removeSession,
    addManualEntry,
  };
}
