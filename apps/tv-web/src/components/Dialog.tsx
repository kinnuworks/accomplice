// Modal dialog that traps D-pad focus. Back closes it.
import type { ReactNode } from 'react';
import { useBack } from '../focus/focus';

export function Dialog({ title, children, onClose, className = '', label }: { title?: ReactNode; children: ReactNode; onClose: () => void; className?: string; label?: string }) {
  useBack(onClose, true, 100);
  return (
    <div className="dialog-backdrop" data-nav-scope role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
      <div className={`dialog ${className}`}>
        {title && <h2 className="dialog-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Confirm({ title, body, yes, no, onYes, onNo }: { title: string; body: string; yes: string; no: string; onYes: () => void; onNo: () => void }) {
  return (
    <Dialog title={title} onClose={onNo} className="dialog-confirm">
      <p className="dialog-body">{body}</p>
      <div className="dialog-actions">
        <button className="btn btn-primary" data-nav data-nav-autofocus onClick={onNo}>{no}</button>
        <button className="btn btn-ghost" data-nav onClick={onYes}>{yes}</button>
      </div>
    </Dialog>
  );
}
