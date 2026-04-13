import { useState, useMemo } from 'react';
import type { Session } from '../types.js';
import {
  groupByWeek,
  getWeekLabel,
  getWeekDays,
  getWeekStart,
  todayStr,
} from '../utils/time.js';

interface Props {
  sessions: Session[];
  selectedDay: string;           // YYYY-MM-DD
  onSelectDay: (day: string) => void;
}

export function Sidebar({ sessions, selectedDay, onSelectDay }: Props) {
  const today = todayStr();
  const currentWeekStart = getWeekStart(today);

  // Weeks that have sessions, sorted descending
  const weekMap = useMemo(() => groupByWeek(sessions), [sessions]);
  const sortedWeeks = useMemo(
    () => [...weekMap.keys()].sort().reverse(),
    [weekMap]
  );

  // Current week always expanded; past weeks collapsed by default
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(
    new Set([currentWeekStart])
  );

  function toggleWeek(weekStart: string) {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(weekStart)) next.delete(weekStart);
      else next.add(weekStart);
      return next;
    });
  }

  // Separate current week from past weeks
  const pastWeeks = sortedWeeks.filter(w => w !== currentWeekStart);

  function renderWeek(weekStart: string, isCurrent: boolean) {
    const weekSessions = weekMap.get(weekStart) ?? [];
    const isExpanded = expandedWeeks.has(weekStart);
    const totalSecs = weekSessions
      .filter(s => s.clock_out !== null)
      .reduce((sum, s) => sum + s.duration_secs, 0);
    const totalHrs = (totalSecs / 3600).toFixed(1);
    const days = getWeekDays(weekStart);

    return (
      <div key={weekStart}>
        <div
          className={`sidebar-week-header ${isCurrent ? 'current' : ''}`}
          onClick={() => toggleWeek(weekStart)}
        >
          <span>{isExpanded ? '▼' : '▶'} {getWeekLabel(weekStart)}</span>
          <span style={{ fontSize: 12 }}>{totalHrs}h</span>
        </div>
        {isExpanded && days.map(day => {
          const daySessions = weekSessions.filter(s => s.date === day);
          const daySecs = daySessions
            .filter(s => s.clock_out !== null)
            .reduce((sum, s) => sum + s.duration_secs, 0);
          const dayHrs = daySecs > 0 ? `${(daySecs / 3600).toFixed(1)}h` : '';
          const dayName = new Date(day + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });

          return (
            <div
              key={day}
              className={`sidebar-day-row ${selectedDay === day ? 'selected' : ''} ${day === today ? 'today' : ''}`}
              onClick={() => onSelectDay(day)}
            >
              <span className="day-name">{dayName}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dayHrs}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-section-label">Current Week</div>
      {renderWeek(currentWeekStart, true)}

      {pastWeeks.length > 0 && (
        <>
          <div className="sidebar-section-label" style={{ marginTop: 12 }}>Past Weeks</div>
          {pastWeeks.map(w => renderWeek(w, false))}
        </>
      )}
    </div>
  );
}
