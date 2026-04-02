import type { Session } from '../types.js';
import { computePay, formatPay } from '../utils/pay.js';

interface Props {
  sessions: Session[];
  hourlyRate: string;
}

export function WeekSummary({ sessions, hourlyRate }: Props) {
  const completedSessions = sessions.filter(s => s.clock_out !== null);
  const totalSecs = completedSessions.reduce((sum, s) => sum + s.duration_secs, 0);
  const totalPay = computePay(totalSecs, hourlyRate);
  const totalHrs = (totalSecs / 3600).toFixed(2);

  // Count unique days worked
  const daysWorked = new Set(completedSessions.map(s => s.date)).size;

  return (
    <div className="week-summary">
      <div className="summary-item">
        <span className="summary-label">Week Hours</span>
        <span className="summary-value blue">{totalHrs}h</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Week Earned</span>
        <span className="summary-value green">{formatPay(totalPay)}</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Rate</span>
        <span className="summary-value">${hourlyRate}/hr</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Days Worked</span>
        <span className="summary-value">{daysWorked}</span>
      </div>
    </div>
  );
}
