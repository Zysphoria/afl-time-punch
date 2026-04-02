import { useState, useEffect, useCallback } from 'react';
import { fetchSettings, updateSettings } from '../api.js';
import type { Settings } from '../types.js';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({ hourly_rate: '15.00' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings()
      .then(setSettings)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const saveRate = useCallback(async (rate: string) => {
    try {
      const updated = await updateSettings(rate);
      setSettings(updated);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  return { settings, loading, error, saveRate };
}
