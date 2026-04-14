import { useState, useEffect, useRef } from 'react';
import type { Session } from '../types.js';
import { formatDuration, todayStr, getWeekKey } from '../utils/time.js';
import { computePay, formatPay } from '../utils/pay.js';
import { exportUrl } from '../api.js';
import { ManualEntryModal } from './ManualEntryModal.js';
import { ImportModal } from './ImportModal.js';

interface Props {
  activeSession: Session | null;
  sessions: Session[];
  elapsed: number;
  hourlyRate: string;
  onClockIn: () => void;
  onClockOut: () => void;
  onPause: () => void;
  onResume: () => void;
  onRateChange: (rate: string) => void;
  onAddManualEntry: (clockIn: string, clockOut: string) => void;
  onImported: () => void;
}

export function TopBar({
  activeSession,
  sessions,
  elapsed,
  hourlyRate,
  onClockIn,
  onClockOut,
  onPause,
  onResume,
  onRateChange,
  onAddManualEntry,
  onImported,
}: Props) {
  const [rateInput, setRateInput] = useState(hourlyRate);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const rateInputRef = useRef<HTMLInputElement>(null);
  const isPaused = activeSession?.pauses.some(p => !p.end) ?? false;

  // Sync external rate changes into local input only when the field isn't focused
  useEffect(() => {
    if (document.activeElement !== rateInputRef.current) {
      setRateInput(hourlyRate);
    }
  }, [hourlyRate]);

  // Today's pay
  const today = todayStr();
  const todaySecs = sessions
    .filter(s => s.date === today && s.clock_out !== null)
    .reduce((sum, s) => sum + s.duration_secs, 0);
  const todayPay = computePay(todaySecs + (activeSession?.date === today ? elapsed : 0), hourlyRate);

  // This week's pay
  const currentWeekKey = getWeekKey(today);
  const weekSecs = sessions
    .filter(s => getWeekKey(s.date) === currentWeekKey && s.clock_out !== null)
    .reduce((sum, s) => sum + s.duration_secs, 0);
  const weekPay = computePay(weekSecs + (activeSession && getWeekKey(activeSession.date) === currentWeekKey ? elapsed : 0), hourlyRate);

  function handleRateBlur() {
    const parsed = parseFloat(rateInput);
    if (!isNaN(parsed) && parsed > 0) {
      onRateChange(parsed.toFixed(2));
    } else {
      setRateInput(hourlyRate);
    }
  }

  function handleExport() {
    window.location.href = exportUrl();
  }

  let timerClass = 'timer-display';
  if (!activeSession) timerClass += ' inactive';
  else if (isPaused) timerClass += ' paused';

  return (
    <div className="top-bar">
      <span className="app-name">
        AFL Time Punch
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(window as any).electronAPI?.version && (
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.55, marginLeft: 6 }}>
            v{(window as any).electronAPI.version}
          </span>
        )}
      </span>

      <span className={timerClass}>
        {formatDuration(activeSession ? elapsed : 0)}
      </span>

      {/* Action buttons — state-driven */}
      {!activeSession && (
        <button className="btn btn-green" onClick={onClockIn}>CLOCK IN</button>
      )}
      {activeSession && !isPaused && (
        <>
          <button className="btn btn-red" onClick={onClockOut}>CLOCK OUT</button>
          <button className="btn btn-yellow" onClick={onPause}>PAUSE</button>
        </>
      )}
      {activeSession && isPaused && (
        <button className="btn btn-blue" onClick={onResume}>RESUME</button>
      )}

      <div className="spacer" />

      {/* Pay displays */}
      <div className="pay-display">
        <span>Today</span>
        <strong>{formatPay(todayPay)}</strong>
      </div>
      <div className="pay-display">
        <span>This Week</span>
        <strong>{formatPay(weekPay)}</strong>
      </div>

      {/* Rate input */}
      <div className="rate-input-wrap">
        <span>$/hr</span>
        <input
          ref={rateInputRef}
          className="rate-input"
          type="number"
          min="0"
          step="0.50"
          value={rateInput}
          onChange={e => setRateInput(e.target.value)}
          onBlur={handleRateBlur}
          onKeyDown={e => e.key === 'Enter' && handleRateBlur()}
        />
      </div>

      {/* Manual entry + import */}
      <button className="btn btn-ghost" onClick={() => setShowManualEntry(true)}>+ Add Entry</button>
      <button className="btn btn-ghost" onClick={() => setShowImport(true)}>Import</button>

      {/* Export */}
      <button className="btn btn-ghost" onClick={handleExport}>Export XLSX</button>

      {showManualEntry && (
        <ManualEntryModal
          onConfirm={(clockIn, clockOut) => {
            onAddManualEntry(clockIn, clockOut);
            setShowManualEntry(false);
          }}
          onCancel={() => setShowManualEntry(false)}
        />
      )}

      {showImport && (
        <ImportModal
          onImported={() => {
            onImported();
            setShowImport(false);
          }}
          onCancel={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
