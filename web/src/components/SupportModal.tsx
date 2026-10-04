import { useEffect, useRef } from 'react';
import { PROJECT } from '@irtc/protocol';
import { useT } from '../lib/strings';

/** "♥ Support" dialog: the optional donation links (Ko-fi and GitHub Sponsors). */
export function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open ? (
        <article className="card card--modal phone">
          <button className="modal__close" onClick={onClose} aria-label={t('card.close')}>
            ×
          </button>
          <h2 className="phone__title">{t('support.title')}</h2>
          <p>{t('support.text')}</p>
          <div className="support__options">
            <a className="btn btn--primary" href={PROJECT.kofiUrl} target="_blank" rel="noreferrer">
              ☕ Ko-fi
            </a>
            <a className="btn btn--primary" href={PROJECT.sponsorsUrl} target="_blank" rel="noreferrer">
              ♥ GitHub Sponsors
            </a>
          </div>
          <p className="small muted">{t('support.note')}</p>
        </article>
      ) : null}
    </dialog>
  );
}
