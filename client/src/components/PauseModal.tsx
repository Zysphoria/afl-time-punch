import { useState } from 'react';

interface Props {
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}

export function PauseModal({ onConfirm, onCancel }: Props) {
  const [comment, setComment] = useState('');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Resume Session</h3>
        <label>
          Break comment (optional)
          <input
            className="modal-input"
            type="text"
            placeholder="e.g. Lunch break"
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onConfirm(comment)}
            autoFocus
          />
        </label>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-green" onClick={() => onConfirm(comment)}>Resume</button>
        </div>
      </div>
    </div>
  );
}
