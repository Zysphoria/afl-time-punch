import { useState, useMemo } from 'react';
import type { Session } from '../types.js';
import { formatDuration, formatTime } from '../utils/time.js';
import { computePay, formatPay } from '../utils/pay.js';

interface Props {
  session: Session;
  hourlyRate: string;
  elapsed: number;           // From useTimer; only relevant when session is active
  onEdit: (id: number, clockIn: string, clockOut?: string) => void;
  onDelete: (id: number) => void;
}

function toLocalTimeValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function localTimeToISO(date: string, localTime: string): string {
  // date = YYYY-MM-DD, localTime = HH:MM
  return new Date(`${date}T${localTime}:00`).toISOString();
}

export function SessionRow({ session, hourlyRate, elapsed, onEdit, onDelete }: Props) {
  const isActive = session.clock_out === null;
  const isPaused = isActive && session.pauses.some(p => !p.end);

  const [editMode, setEditMode] = useState(false);
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');

  function enterEdit() {
    setEditClockIn(toLocalTimeValue(session.clock_in));
    setEditClockOut(toLocalTimeValue(session.clock_out));
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
  }

  /** Live duration preview in edit mode */
  const previewDurationSecs = useMemo(() => {
    if (!editMode) return 0;
    try {
      const inISO = localTimeToISO(session.date, editClockIn);
      const outISO = editClockOut ? localTimeToISO(session.date, editClockOut) : null;
      if (!outISO) return 0;
      const totalMs = new Date(outISO).getTime() - new Date(inISO).getTime();
      const pauseMs = session.pauses.reduce((sum, p) => {
        if (!p.end) return sum;
        return sum + (new Date(p.end).getTime() - new Date(p.start).getTime());
      }, 0);
      return Math.max(0, Math.floor((totalMs - pauseMs) / 1000));
    } catch {
      return 0;
    }
  }, [editMode, editClockIn, editClockOut, session]);

  async function saveEdit() {
    const inISO = localTimeToISO(session.date, editClockIn);
    const outISO = editClockOut ? localTimeToISO(session.date, editClockOut) : undefined;
    onEdit(session.id, inISO, outISO);
    setEditMode(false);
  }

  const displaySecs = isActive ? elapsed : session.duration_secs;
  const pay = computePay(displaySecs, hourlyRate);

  let rowClass = 'session-row';
  if (isActive && isPaused) rowClass += ' paused';
  else if (isActive) rowClass += ' active';
  else rowClass += ' completed';
  if (editMode) rowClass += ' edit-mode';

  if (!editMode) {
    return (
      <div className={rowClass}>
        <div className="session-times">
          <span>{formatTime(session.clock_in)}</span>
          <span className="text-muted">→</span>
          <span>{isActive ? (isPaused ? 'PAUSED' : 'NOW') : formatTime(session.clock_out)}</span>
        </div>
        <span className="session-duration">{formatDuration(displaySecs)}</span>
        <span className="session-pay">{formatPay(pay)}</span>

        {/* Pause sub-rows */}
        {session.pauses.map((p, i) => (
          <div key={i} className="session-row pause-entry" style={{ marginTop: 4, width: '100%', fontSize: 12 }}>
            <span className="text-yellow">⏸ Pause</span>
            <span className="text-muted" style={{ marginLeft: 8 }}>
              {formatTime(p.start)} → {p.end ? formatTime(p.end) : 'open'}
            </span>
            {p.comment && <span className="text-muted" style={{ marginLeft: 8 }}>"{p.comment}"</span>}
          </div>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="session-edit-btn" onClick={enterEdit} title="Edit times">✏</button>
          <button className="session-edit-btn" onClick={() => onDelete(session.id)} title="Delete">✕</button>
        </div>
      </div>
    );
  }

  // Edit mode
  return (
    <div className={rowClass}>
      <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Clock In</label>
      <input
        type="time"
        className="time-input"
        value={editClockIn}
        onChange={e => setEditClockIn(e.target.value)}
      />
      <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Clock Out</label>
      <input
        type="time"
        className="time-input"
        value={editClockOut}
        placeholder="active"
        onChange={e => setEditClockOut(e.target.value)}
      />
      <span className="session-duration" style={{ marginLeft: 8 }}>
        {editClockOut ? formatDuration(previewDurationSecs) : '--:--:--'}
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button className="btn btn-green" style={{ padding: '4px 10px' }} onClick={saveEdit}>✓</button>
        <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={cancelEdit}>✕</button>
      </div>
    </div>
  );
}
