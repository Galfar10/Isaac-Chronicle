import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { fetchLan, setLan, type LanStatus } from '../lib/api';
import { useT } from '../lib/strings';

function Qr({ text }: { text: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    void QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }).then(
      (s) => alive && setSvg(s),
    );
    return () => {
      alive = false;
    };
  }, [text]);
  return <div className="phone__qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** "📱 Mobile" dialog: turns mobile mode on/off and shows the QR link for the phone. PC only. */
export function MobileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();
  const [status, setStatus] = useState<LanStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (open) void fetchLan().then((s) => (setStatus(s), setFailed(s === null)));
  }, [open]);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    const s = await setLan(enabled);
    setBusy(false);
    setFailed(s === null);
    if (s) setStatus(s);
  };

  const url = status?.urls[0] ?? null;
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open ? (
        <article className="card card--modal phone">
          <button className="modal__close" onClick={onClose} aria-label={t('card.close')}>
            ×
          </button>
          <h2 className="phone__title">{t('mobile.title')}</h2>
          {failed ? <p className="phone__warn">{t('mobile.error')}</p> : null}
          {status && !status.enabled ? (
            <>
              <p>{t('mobile.intro')}</p>
              <button className="btn btn--primary" disabled={busy || !status.available} onClick={() => void toggle(true)}>
                {t('mobile.enable')}
              </button>
              <p className="small muted">{t('mobile.privacy')}</p>
            </>
          ) : null}
          {status?.enabled ? (
            <>
              {url ? (
                <>
                  <ol className="phone__steps">
                    <li>{t('mobile.step1')}</li>
                    <li>{t('mobile.step2')}</li>
                    <li>{t('mobile.step3')}</li>
                  </ol>
                  <Qr text={url} />
                  {status.urls.map((u) => (
                    <p key={u} className="phone__url mono">
                      {u}
                    </p>
                  ))}
                  <p className="small muted">{t('mobile.firewall')}</p>
                  <p className="small muted">{t('mobile.secret')}</p>
                </>
              ) : (
                <p className="phone__warn">{t('mobile.noNetwork')}</p>
              )}
              <button className="btn" disabled={busy} onClick={() => void toggle(false)}>
                {t('mobile.disable')}
              </button>
            </>
          ) : null}
        </article>
      ) : null}
    </dialog>
  );
}
