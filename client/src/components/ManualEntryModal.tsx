import { useState } from 'react';
import { todayStr } from '../utils/time.js';

interface Props {
  onConfirm: (clockIn: string, clockOut: string) => void;
  onCancel: () => void;
}

export function ManualEntryModal({ onConfirm, onCancel }: Props) {
  const [date, setDate] = useState(todayStr());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [error, setError] = useState('');

  function handleSubmit() {
    if (!date || !startTime || !endTime) {
      setError('All fields are required.');
      return;
    }
    // Local-time strings are intentional: the user picks times in their local TZ,
    // and in Electron the process TZ matches the OS TZ, so this is correct.
    const clockIn = new Date(`${date}T${startTime}:00`).toISOString();
    const clockOut = new Date(`${date}T${endTime}:00`).toISOString();
    if (clockOut <= clockIn) {
      setError('End time must be after start time.');
      return;
    }
    onConfirm(clockIn, clockOut);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Add Manual Entry</h3>

        <label>
          Date
          <input
            className="modal-input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </label>

        <label>
          Start time
          <input
            className="modal-input"
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
          />
        </label>

        <label>
          End time
          <input
            className="modal-input"
            type="time"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
          />
        </label>

        {error && <span style={{ color: 'var(--red)', fontSize: 13 }}>{error}</span>}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-blue" onClick={handleSubmit}>Add Entry</button>
        </div>
      </div>
    </div>
  );
}
