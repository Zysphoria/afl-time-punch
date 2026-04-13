import type { Session, Settings } from './types.js';

const BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function fetchSessions(week?: string): Promise<Session[]> {
  const url = week ? `${BASE}/sessions?week=${week}` : `${BASE}/sessions`;
  const res = await fetch(url);
  return handleResponse<Session[]>(res);
}

export async function clockIn(): Promise<Session> {
  const res = await fetch(`${BASE}/sessions`, { method: 'POST' });
  return handleResponse<Session>(res);
}

export async function createManualSession(clockInISO: string, clockOutISO: string): Promise<Session> {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clock_in: clockInISO, clock_out: clockOutISO }),
  });
  return handleResponse<Session>(res);
}

export interface ImportOptions {
  dateCol: number;
  clockInCol: number;
  clockOutCol: number;
  breakCol?: number | null;
  lunchStartCol?: number | null;
  lunchEndCol?: number | null;
}

export async function importSessions(
  file: File,
  opts: ImportOptions,
): Promise<{ imported: number; skipped: number }> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('dateCol',    String(opts.dateCol));
  fd.append('clockInCol',  String(opts.clockInCol));
  fd.append('clockOutCol', String(opts.clockOutCol));
  if (opts.breakCol      != null) fd.append('breakCol',      String(opts.breakCol));
  if (opts.lunchStartCol != null) fd.append('lunchStartCol', String(opts.lunchStartCol));
  if (opts.lunchEndCol   != null) fd.append('lunchEndCol',   String(opts.lunchEndCol));
  const res = await fetch(`${BASE}/import`, { method: 'POST', body: fd });
  return handleResponse<{ imported: number; skipped: number }>(res);
}

export interface HeaderEntry { name: string; index: number; }

export interface PreviewResult {
  headers: HeaderEntry[];
  dateCol: number | null;
  clockInCol: number | null;
  clockOutCol: number | null;
  breakCol: number | null;
  lunchStartCol: number | null;
  lunchEndCol: number | null;
}

export async function previewImportHeaders(formData: FormData): Promise<PreviewResult> {
  const res = await fetch(`${BASE}/import?preview=true`, { method: 'POST', body: formData });
  return handleResponse<PreviewResult>(res);
}

export async function clockOut(id: number): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clock_out: new Date().toISOString() }),
  });
  return handleResponse<Session>(res);
}

export async function pauseSession(id: number): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pause_start: new Date().toISOString() }),
  });
  return handleResponse<Session>(res);
}

export async function resumeSession(id: number, comment?: string): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pause_end: new Date().toISOString(),
      ...(comment ? { comment } : {}),
    }),
  });
  return handleResponse<Session>(res);
}

export async function editSessionTimes(
  id: number,
  clockIn: string,
  clockOut?: string
): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clock_in: clockIn,
      ...(clockOut ? { clock_out: clockOut } : {}),
    }),
  });
  return handleResponse<Session>(res);
}

export async function deleteSession(id: number): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch(`${BASE}/settings`);
  return handleResponse<Settings>(res);
}

export async function updateSettings(hourlyRate: string): Promise<Settings> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hourly_rate: hourlyRate }),
  });
  return handleResponse<Settings>(res);
}

// ── Export ────────────────────────────────────────────────────────────────────

export function exportUrl(week?: string): string {
  return week ? `${BASE}/export?week=${week}` : `${BASE}/export`;
}
