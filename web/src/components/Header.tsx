import { DIFFICULTY_NAMES } from '@irtc/protocol';
import { useEffect, useState } from 'react';
import { fetchCharacters } from '../lib/api';
import { isThisPc } from '../lib/connection';
import { ago, clock, curseNames, floorName } from '../lib/format';
import { useClient, useNow } from '../lib/gameStore';
import { useLang, type Lang } from '../lib/i18n';
import { useT } from '../lib/strings';
import { ExpandIcon } from './Icons';
import { MobileModal } from './MobileModal';

function useCharacterNames() {
  const [names, setNames] = useState<Map<number, { name: string; nameEs: string | null }>>(new Map());
  useEffect(() => {
    void fetchCharacters().then((list) => setNames(new Map(list.map((c) => [c.id, c]))));
  }, []);
  return names;
}

export function ConnectionBadge() {
  const client = useClient();
  const now = useNow(1000);
  const lang = useLang();
  const t = useT();
  const c = client.state.connection;
  let tone: 'ok' | 'warn' | 'bad';
  let label: string;
  let detail: string;
  if (client.socket !== 'open') {
    tone = client.everConnected ? 'bad' : 'warn';
    label = client.socket === 'connecting' ? t('conn.connecting') : t('conn.companionDown');
    detail = client.retryInMs !== null ? t('conn.retry', { s: Math.ceil(client.retryInMs / 1000) }) : t('conn.searching');
  } else if (c.game === 'connected') {
    tone = 'ok';
    label = c.paused ? t('conn.connectedPaused') : t('conn.connected');
    detail = t('conn.lastPacket', { ago: ago(c.lastPacketAt, now, lang) });
  } else if (c.game === 'idle') {
    tone = 'warn';
    label = t('conn.idle');
    detail = t('conn.idleDetail');
  } else if (c.game === 'waiting') {
    tone = 'warn';
    label = t('conn.waiting');
    detail = t('conn.waitingDetail');
  } else {
    tone = 'bad';
    label = t('conn.disconnected');
    detail = t('conn.noData', { ago: ago(c.lastPacketAt, now, lang) });
  }
  const error = c.error ?? (!c.protocolOk ? t('conn.incompatible') : null);
  return (
    <div className={`conn conn--${tone}`} role="status" aria-live="polite" title={detail}>
      <span className="conn__dot" aria-hidden />
      <span className="conn__label">{label}</span>
      <span className="conn__detail">{error ?? detail}</span>
    </div>
  );
}

interface HeaderProps {
  monitor: boolean;
  onToggleMonitor: () => void;
  onToggleLang: () => void;
}

export function Header({ monitor, onToggleMonitor, onToggleLang }: HeaderProps) {
  const { state } = useClient();
  const lang: Lang = useLang();
  const t = useT();
  const characters = useCharacterNames();
  const run = state.run;
  const ch = run?.character.type !== null && run?.character.type !== undefined ? characters.get(run.character.type) : undefined;
  const charName = (lang === 'es' ? ch?.nameEs : ch?.name) ?? ch?.name ?? run?.character.name ?? '—';
  const curses = run?.floor ? curseNames(run.floor.curses) : [];
  const [phoneOpen, setPhoneOpen] = useState(false);
  const status = run?.status === 'dead' ? t('run.dead') : run?.status === 'won' ? t('run.won') : run?.status === 'exited' ? t('run.exited') : null;

  return (
    <header className="header">
      <div className="header__brand">
        <h1 className="title">{t('title')}</h1>
        <ConnectionBadge />
      </div>
      {run ? (
        <dl className="runinfo">
          <div>
            <dt>{t('run.character')}</dt>
            <dd>
              {run.character.tainted ? <span className="tainted">Tainted </span> : null}
              {charName}
            </dd>
          </div>
          <div>
            <dt>{t('run.floor')}</dt>
            <dd>{floorName(run.floor?.name, run.floor?.stage, lang)}</dd>
          </div>
          <div>
            <dt>{t('run.time')}</dt>
            <dd className="mono">{clock(run.time)}</dd>
          </div>
          <div>
            <dt>{t('run.seed')}</dt>
            <dd className="mono">{run.seed ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('run.mode')}</dt>
            <dd>
              {DIFFICULTY_NAMES[run.difficulty ?? -1] ?? '—'}
              {run.challenge ? ` · ${t('run.challenge')} ${run.challenge}` : ''}
            </dd>
          </div>
          {status ? (
            <div>
              <dt>{t('run.status')}</dt>
              <dd className={`runstatus runstatus--${run.status}`}>{status}</dd>
            </div>
          ) : null}
          {curses.length ? (
            <div className="runinfo__curses">
              <dt>{t('run.curses')}</dt>
              <dd>{curses.join(' · ')}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="header__empty">{t('run.none')}</p>
      )}
      <div className="header__tools">
        {isThisPc() ? (
          <button className="btn" onClick={() => setPhoneOpen(true)} title={t('btn.mobileTitle')}>
            📱 {t('btn.mobile')}
          </button>
        ) : null}
        <button className="btn" onClick={onToggleLang} title={t('btn.langTitle')}>
          {lang === 'es' ? 'ES' : 'EN'}
        </button>
        <button className="btn" onClick={onToggleMonitor} title={t('btn.monitorTitle')}>
          <ExpandIcon size={18} /> {monitor ? t('btn.exit') : t('btn.monitor')}
        </button>
      </div>
      <MobileModal open={phoneOpen} onClose={() => setPhoneOpen(false)} />
    </header>
  );
}
