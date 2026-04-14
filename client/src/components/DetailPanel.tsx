import type { Session } from '../types.js';
import { SessionRow } from './SessionRow.js';
import { WeekSummary } from './WeekSummary.js';
import { formatDayLabel, getWeekKey } from '../utils/time.js';
import { computePay, formatPay } from '../utils/pay.js';

interface Props {
  selectedDay: string;              // YYYY-MM-DD
  sessions: Session[];              // ALL sessions (we filter here)
  hourlyRate: string;
  activeSession: Session | null;
  elapsed: number;                  // from useTimer
  onEdit: (id: number, clockIn: string, clockOut?: string) => void;
  onDelete: (id: number) => void;
}

export function DetailPanel({
  selectedDay,
  sessions,
  hourlyRate,
  activeSession,
  elapsed,
  onEdit,
  onDelete,
}: Props) {
  // Sessions for the selected day
  const daySessions = sessions.filter(s => s.date === selectedDay);

  // Sessions for the week containing selectedDay (for WeekSummary)
  const weekKey = getWeekKey(selectedDay);
  const weekSessions = sessions.filter(s => getWeekKey(s.date) === weekKey);

  // Day totals
  const completedDaySecs = daySessions
    .filter(s => s.clock_out !== null)
    .reduce((sum, s) => sum + s.duration_secs, 0);
  const dayPay = computePay(completedDaySecs, hourlyRate);

  return (
    <div className="detail-panel">
      <WeekSummary sessions={weekSessions} hourlyRate={hourlyRate} />

      <div className="detail-content">
        <div className="detail-header">
          <h2>{formatDayLabel(selectedDay)}</h2>
          <div className="day-totals">
            {(completedDaySecs / 3600).toFixed(2)}h worked &nbsp;·&nbsp; {formatPay(dayPay)} earned
          </div>
        </div>

        <div className="session-list">
          {daySessions.length === 0 && (
            <p className="text-muted">No sessions recorded for this day.</p>
          )}
          {daySessions.map(s => (
            <SessionRow
              key={s.id}
              session={s}
              hourlyRate={hourlyRate}
              elapsed={activeSession?.id === s.id ? elapsed : s.duration_secs}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
