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
  importSessions as apiImport,
} from '../api.js';
import type { Session } from '../types.js';

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function clearError() { setError(null); }

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
    try {
      const created = await apiClockIn();
      setSessions(prev => [...prev, created]);
      return created;
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const clockOut = useCallback(async (id: number) => {
    try {
      const updated = await apiClockOut(id);
      setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
      return updated;
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const pause = useCallback(async (id: number) => {
    try {
      const updated = await apiPause(id);
      setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
      return updated;
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const resume = useCallback(async (id: number, comment?: string) => {
    try {
      const updated = await apiResume(id, comment);
      setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
      return updated;
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const editTimes = useCallback(async (id: number, clockInISO: string, clockOutISO?: string) => {
    try {
      const updated = await apiEdit(id, clockInISO, clockOutISO);
      setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
      return updated;
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const removeSession = useCallback(async (id: number) => {
    try {
      await apiDelete(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const addManualEntry = useCallback(async (clockInISO: string, clockOutISO: string) => {
    try {
      const created = await apiCreateManual(clockInISO, clockOutISO);
      setSessions(prev => [...prev, created].sort((a, b) => a.clock_in.localeCompare(b.clock_in)));
      return created;
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const importFromFile = useCallback(async (file: File, opts: Parameters<typeof apiImport>[1]) => {
    const result = await apiImport(file, opts);
    await refresh();
    return result;
  }, [refresh]);

  return {
    sessions,
    activeSession,
    loading,
    error,
    clearError,
    refresh,
    clockIn,
    clockOut,
    pause,
    resume,
    editTimes,
    deleteSession: removeSession,
    addManualEntry,
    importFromFile,
  };
}
