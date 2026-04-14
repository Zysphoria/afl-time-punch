import { useState, useMemo } from 'react';
import type { Session } from '../types.js';
import {
  groupByWeek,
  getWeekLabel,
  getWeekDays,
  getWeekStart,
  getYear,
  todayStr,
} from '../utils/time.js';
import { computePay, formatPay } from '../utils/pay.js';

interface Props {
  sessions: Session[];
  selectedDay: string;           // YYYY-MM-DD
  onSelectDay: (day: string) => void;
  hourlyRate: string;
}

export function Sidebar({ sessions, selectedDay, onSelectDay, hourlyRate }: Props) {
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

  const [isCollapsed, setIsCollapsed] = useState(false);

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

  // Group past weeks by year (descending), default current year expanded
  const currentYear = getYear(currentWeekStart);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(
    new Set([currentYear])
  );

  function toggleYear(year: string) {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  const pastWeeksByYear = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const w of pastWeeks) {
      const yr = getYear(w);
      if (!map.has(yr)) map.set(yr, []);
      map.get(yr)!.push(w);
    }
    return map;
  }, [pastWeeks]);

  const sortedYears = useMemo(
    () => [...pastWeeksByYear.keys()].sort().reverse(),
    [pastWeeksByYear]
  );

  // Current week seconds — used to include in the matching year total
  const currentWeekSecs = useMemo(() => {
    return (weekMap.get(currentWeekStart) ?? [])
      .filter(s => s.clock_out !== null)
      .reduce((sum, s) => sum + s.duration_secs, 0);
  }, [weekMap, currentWeekStart]);

  function renderWeek(weekStart: string, isCurrent: boolean) {
    const weekSessions = weekMap.get(weekStart) ?? [];
    const isExpanded = expandedWeeks.has(weekStart);
    const totalSecs = weekSessions
      .filter(s => s.clock_out !== null)
      .reduce((sum, s) => sum + s.duration_secs, 0);
    const totalHrs = (totalSecs / 3600).toFixed(1);
    const weekPay = computePay(totalSecs, hourlyRate);
    const days = getWeekDays(weekStart);

    return (
      <div key={weekStart}>
        <div
          className={`sidebar-week-header ${isCurrent ? 'current' : ''}`}
          onClick={() => toggleWeek(weekStart)}
        >
          <span>{isExpanded ? '▼' : '▶'} {getWeekLabel(weekStart)}</span>
          <span style={{ fontSize: 12 }}>{totalHrs}h · {formatPay(weekPay)}</span>
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
    <div className={`sidebar${isCollapsed ? ' collapsed' : ''}`}>
      <button
        className="sidebar-toggle"
        onClick={() => setIsCollapsed(prev => !prev)}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? '▶' : '◀'}
      </button>

      {!isCollapsed && (
        <>
          <div className="sidebar-section-label">Current Week</div>
          {renderWeek(currentWeekStart, true)}

          {sortedYears.map(year => {
            const weeks = pastWeeksByYear.get(year)!;
            const isExpanded = expandedYears.has(year);
            // Include current week in the year total if it belongs to this year
            const currentWeekBonus = getYear(currentWeekStart) === year ? currentWeekSecs : 0;
            const yearSecs = currentWeekBonus + weeks.reduce((sum, w) => {
              const wSessions = weekMap.get(w) ?? [];
              return sum + wSessions
                .filter(s => s.clock_out !== null)
                .reduce((s2, s) => s2 + s.duration_secs, 0);
            }, 0);
            const yearHrs = (yearSecs / 3600).toFixed(1);
            const yearPay = computePay(yearSecs, hourlyRate);

            return (
              <div key={year}>
                <div
                  className="sidebar-year-header"
                  onClick={() => toggleYear(year)}
                >
                  <span>{isExpanded ? '▼' : '▶'} {year}</span>
                  <span>{yearHrs}h · {formatPay(yearPay)}</span>
                </div>
                {isExpanded && weeks.map(w => renderWeek(w, false))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
