import { useState, useRef } from 'react';
import { previewImportHeaders, importSessions } from '../api.js';
import type { HeaderEntry } from '../api.js';

interface Props {
  onImported: () => void;
  onCancel: () => void;
}

type Step = 'upload' | 'map' | 'result';

interface ColumnMap {
  dateCol: string;
  clockInCol: string;
  clockOutCol: string;
  breakCol: string;
}

export function ImportModal({ onImported, onCancel }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<HeaderEntry[]>([]);
  const [colMap, setColMap] = useState<ColumnMap>({ dateCol: '', clockInCol: '', clockOutCol: '', breakCol: '' });
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePreview() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Please select an .xlsx file.'); return; }
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const cols = await previewImportHeaders(fd);
      setHeaders(cols);
      // Auto-detect common column names
      const find = (patterns: string[]) =>
        cols.find(h => patterns.some(p => h.name.toLowerCase().includes(p)))?.name ?? '';
      setColMap({
        dateCol: find(['date']),
        clockInCol: find(['time in', 'start', 'clock in', 'clock-in']),
        clockOutCol: find(['time out', 'end', 'clock out', 'clock-out']),
        breakCol: find(['break', 'pause', 'comment', 'lunch']),
      });
      setStep('map');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!colMap.dateCol || !colMap.clockInCol || !colMap.clockOutCol) {
      setError('Date, Start, and End columns are required.');
      return;
    }
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      // Use the raw sheet index from the HeaderEntry — avoids indexOf misalignment on
      // sheets where blank columns exist between data columns.
      fd.append('dateCol',    String(headers.find(h => h.name === colMap.dateCol)?.index    ?? 0));
      fd.append('clockInCol',  String(headers.find(h => h.name === colMap.clockInCol)?.index  ?? 1));
      fd.append('clockOutCol', String(headers.find(h => h.name === colMap.clockOutCol)?.index ?? 2));
      if (colMap.breakCol) {
        const idx = headers.find(h => h.name === colMap.breakCol)?.index;
        if (idx !== undefined) fd.append('breakCol', String(idx));
      }
      const res = await importSessions(fd);
      setResult(res);
      setStep('result');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function ColSelect({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
    return (
      <label>
        {label}{required ? ' *' : ' (optional)'}
        <select
          className="modal-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ cursor: 'pointer' }}
        >
          <option value="">— select column —</option>
          {headers.map((h, i) => <option key={i} value={h.name}>{h.name}</option>)}
        </select>
      </label>
    );
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" style={{ minWidth: 360 }} onClick={e => e.stopPropagation()}>
        {step === 'upload' && (
          <>
            <h3>Import Spreadsheet</h3>
            <label>
              Select .xlsx file
              <input
                ref={fileRef}
                className="modal-input"
                type="file"
                accept=".xlsx"
                style={{ cursor: 'pointer' }}
              />
            </label>
            {error && <span style={{ color: 'var(--red)', fontSize: 13 }}>{error}</span>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
              <button className="btn btn-blue" onClick={handlePreview} disabled={busy}>
                {busy ? 'Reading…' : 'Next →'}
              </button>
            </div>
          </>
        )}

        {step === 'map' && (
          <>
            <h3>Map Columns</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Match your spreadsheet columns to the fields below.
            </p>
            <ColSelect label="Date" value={colMap.dateCol} onChange={v => setColMap(p => ({ ...p, dateCol: v }))} required />
            <ColSelect label="Start time" value={colMap.clockInCol} onChange={v => setColMap(p => ({ ...p, clockInCol: v }))} required />
            <ColSelect label="End time" value={colMap.clockOutCol} onChange={v => setColMap(p => ({ ...p, clockOutCol: v }))} required />
            <ColSelect label="Break / notes" value={colMap.breakCol} onChange={v => setColMap(p => ({ ...p, breakCol: v }))} />
            {error && <span style={{ color: 'var(--red)', fontSize: 13 }}>{error}</span>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setStep('upload')}>← Back</button>
              <button className="btn btn-green" onClick={handleImport} disabled={busy}>
                {busy ? 'Importing…' : 'Import'}
              </button>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <>
            <h3>Import Complete</h3>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)' }}>{result.imported}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>imported</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-muted)' }}>{result.skipped}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>skipped (duplicates)</div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-blue" onClick={onImported}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
