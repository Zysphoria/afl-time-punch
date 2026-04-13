import { useState, useRef } from 'react';
import { previewImportHeaders, importSessions } from '../api.js';
import type { HeaderEntry, ImportOptions } from '../api.js';

interface Props {
  onImported: () => void;
  onCancel: () => void;
}

type Step = 'upload' | 'confirm' | 'map' | 'result';

interface ColIndices {
  dateCol: number | null;
  clockInCol: number | null;
  clockOutCol: number | null;
  breakCol: number | null;
  lunchStartCol: number | null;
  lunchEndCol: number | null;
}

export function ImportModal({ onImported, onCancel }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<HeaderEntry[]>([]);
  const [cols, setCols] = useState<ColIndices>({
    dateCol: null, clockInCol: null, clockOutCol: null,
    breakCol: null, lunchStartCol: null, lunchEndCol: null,
  });
  // names used only in manual map step
  const [colNames, setColNames] = useState({ dateCol: '', clockInCol: '', clockOutCol: '', breakCol: '' });
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Store the File object in state — the <input> is unmounted when step changes,
  // which nullifies the ref, so we can't re-read it from the DOM later.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePreview() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Please select an .xlsx file.'); return; }
    setSelectedFile(file);
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const preview = await previewImportHeaders(fd);
      setHeaders(preview.headers);
      setCols({
        dateCol: preview.dateCol,
        clockInCol: preview.clockInCol,
        clockOutCol: preview.clockOutCol,
        breakCol: preview.breakCol,
        lunchStartCol: preview.lunchStartCol,
        lunchEndCol: preview.lunchEndCol,
      });
      // Seed name-based map step from detected indices
      const nameOf = (idx: number | null) =>
        preview.headers.find(h => h.index === idx)?.name ?? '';
      setColNames({
        dateCol: nameOf(preview.dateCol),
        clockInCol: nameOf(preview.clockInCol),
        clockOutCol: nameOf(preview.clockOutCol),
        breakCol: nameOf(preview.breakCol),
      });
      const allRequired = preview.dateCol !== null && preview.clockInCol !== null && preview.clockOutCol !== null;
      setStep(allRequired ? 'confirm' : 'map');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(overrideCols?: ColIndices) {
    const useCols = overrideCols ?? cols;
    if (useCols.dateCol === null || useCols.clockInCol === null || useCols.clockOutCol === null) {
      setError('Date, Start, and End columns are required.');
      return;
    }
    const file = selectedFile;
    if (!file) { setError('No file selected — please go back and choose a file.'); return; }
    setError('');
    setBusy(true);
    try {
      const opts: ImportOptions = {
        dateCol: useCols.dateCol,
        clockInCol: useCols.clockInCol,
        clockOutCol: useCols.clockOutCol,
        breakCol: useCols.breakCol,
        lunchStartCol: useCols.lunchStartCol,
        lunchEndCol: useCols.lunchEndCol,
      };
      const res = await importSessions(file, opts);
      setResult(res);
      setStep('result');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Build ColIndices from the name-based manual map state */
  function colIndicesFromNames(): ColIndices {
    const idx = (name: string) => headers.find(h => h.name === name)?.index ?? null;
    return {
      dateCol: idx(colNames.dateCol),
      clockInCol: idx(colNames.clockInCol),
      clockOutCol: idx(colNames.clockOutCol),
      breakCol: colNames.breakCol ? idx(colNames.breakCol) : null,
      lunchStartCol: cols.lunchStartCol,
      lunchEndCol: cols.lunchEndCol,
    };
  }

  function ColSelect({ label, value, onChange, required }: {
    label: string; value: string; onChange: (v: string) => void; required?: boolean;
  }) {
    return (
      <label>
        {label}{required ? ' *' : ' (optional)'}
        <select className="modal-input" value={value} onChange={e => onChange(e.target.value)} style={{ cursor: 'pointer' }}>
          <option value="">— select column —</option>
          {headers.map((h, i) => <option key={i} value={h.name}>{h.name}</option>)}
        </select>
      </label>
    );
  }

  const labelStyle: React.CSSProperties = { color: 'var(--text-muted)', display: 'inline-block', width: 52, fontSize: 12 };
  const nameOf = (idx: number | null) => headers.find(h => h.index === idx)?.name ?? '—';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" style={{ minWidth: 360 }} onClick={e => e.stopPropagation()}>

        {step === 'upload' && (
          <>
            <h3>Import Spreadsheet</h3>
            <label>
              Select .xlsx file
              <input ref={fileRef} className="modal-input" type="file" accept=".xlsx" style={{ cursor: 'pointer' }} />
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

        {step === 'confirm' && (
          <>
            <h3>Ready to Import</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>
              Auto-detected columns:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, marginBottom: 14 }}>
              <div><span style={labelStyle}>Date</span><strong>{nameOf(cols.dateCol)}</strong></div>
              <div><span style={labelStyle}>Start</span><strong>{nameOf(cols.clockInCol)}</strong></div>
              <div><span style={labelStyle}>End</span><strong>{nameOf(cols.clockOutCol)}</strong></div>
              {cols.lunchStartCol !== null && cols.lunchEndCol !== null && (
                <div><span style={labelStyle}>Break</span><strong>{nameOf(cols.lunchStartCol)} → {nameOf(cols.lunchEndCol)}</strong></div>
              )}
              {cols.lunchStartCol === null && cols.breakCol !== null && (
                <div><span style={labelStyle}>Break</span><strong>{nameOf(cols.breakCol)}</strong></div>
              )}
            </div>
            {error && <span style={{ color: 'var(--red)', fontSize: 13 }}>{error}</span>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setStep('map')}>Choose manually</button>
              <button className="btn btn-green" onClick={() => handleImport()} disabled={busy}>
                {busy ? 'Importing…' : 'Import'}
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
            <ColSelect label="Date" value={colNames.dateCol} onChange={v => setColNames(p => ({ ...p, dateCol: v }))} required />
            <ColSelect label="Start time" value={colNames.clockInCol} onChange={v => setColNames(p => ({ ...p, clockInCol: v }))} required />
            <ColSelect label="End time" value={colNames.clockOutCol} onChange={v => setColNames(p => ({ ...p, clockOutCol: v }))} required />
            <ColSelect label="Break / notes" value={colNames.breakCol} onChange={v => setColNames(p => ({ ...p, breakCol: v }))} />
            {error && <span style={{ color: 'var(--red)', fontSize: 13 }}>{error}</span>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setStep('upload')}>← Back</button>
              <button className="btn btn-green" onClick={() => handleImport(colIndicesFromNames())} disabled={busy}>
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
