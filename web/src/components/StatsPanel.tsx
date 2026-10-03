import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Stats } from '@irtc/protocol';
import { useClient, useGameEvents } from '../lib/gameStore';
import { fixed, signed } from '../lib/format';
import {
  BombIcon,
  CoinIcon,
  DamageIcon,
  HeartIcon,
  KeyIcon,
  LuckIcon,
  RangeIcon,
  ShotSpeedIcon,
  SpeedIcon,
  TearsIcon,
} from './Icons';
import { fetchTransformations } from '../lib/api';
import { useLang } from '../lib/i18n';
import { useT } from '../lib/strings';

const STAT_ROWS: { key: keyof Stats; label: 'stats.damage' | 'stats.tears' | 'stats.range' | 'stats.shotSpeed' | 'stats.speed' | 'stats.luck'; icon: ReactNode }[] = [
  { key: 'damage', label: 'stats.damage', icon: <DamageIcon /> },
  { key: 'tears', label: 'stats.tears', icon: <TearsIcon /> },
  { key: 'range', label: 'stats.range', icon: <RangeIcon /> },
  { key: 'shotSpeed', label: 'stats.shotSpeed', icon: <ShotSpeedIcon /> },
  { key: 'speed', label: 'stats.speed', icon: <SpeedIcon /> },
  { key: 'luck', label: 'stats.luck', icon: <LuckIcon /> },
];

/** Shows "+1.69" next to a stat for a few seconds after it changes. */
function useStatDeltas() {
  const [deltas, setDeltas] = useState<Partial<Record<keyof Stats, { v: number; id: number }>>>({});
  const counter = useRef(0);
  useGameEvents((events) => {
    for (const e of events) {
      if (e.event !== 'stats_changed') continue;
      const next: Partial<Record<keyof Stats, { v: number; id: number }>> = {};
      for (const [k, v] of Object.entries(e.data.deltas)) if (v) next[k as keyof Stats] = { v, id: ++counter.current };
      if (Object.keys(next).length) setDeltas((d) => ({ ...d, ...next }));
    }
  });
  useEffect(() => {
    if (!Object.keys(deltas).length) return;
    const t = setTimeout(() => setDeltas({}), 3500);
    return () => clearTimeout(t);
  }, [deltas]);
  return deltas;
}

function Hearts() {
  const { state } = useClient();
  const t = useT();
  const h = state.player?.health;
  if (!h) return null;
  const title = (
    <div className="health__title">
      <HeartIcon size={22} /> {t('stats.health')}
    </div>
  );
  if (state.player?.healthHidden) {
    return (
      <div className="health">
        {title}
        <div className="hearts">
          <span className="muted">{t('stats.healthHidden')}</span>
        </div>
      </div>
    );
  }
  const containers = Math.ceil(h.max / 2);
  const icons: ReactNode[] = [];
  for (let i = 0; i < containers; i++) {
    const fill = Math.max(0, Math.min(2, h.red - i * 2));
    icons.push(<span key={`r${i}`} className={`heart heart--red heart--fill${fill}`} />);
  }
  const soulHalves = h.soul;
  const blackSlots = h.black;
  const soulCount = Math.ceil(soulHalves / 2);
  for (let i = 0; i < soulCount; i++) {
    const fill = Math.max(0, Math.min(2, soulHalves - i * 2));
    const black = soulCount - i <= blackSlots;
    icons.push(<span key={`s${i}`} className={`heart ${black ? 'heart--black' : 'heart--soul'} heart--fill${fill}`} />);
  }
  for (let i = 0; i < h.bone; i++) icons.push(<span key={`b${i}`} className="heart heart--bone heart--fill2" />);
  for (let i = 0; i < h.broken; i++) icons.push(<span key={`x${i}`} className="heart heart--broken heart--fill2" />);
  const extras = [
    h.eternal ? t('hearts.eternal', { n: h.eternal }) : null,
    h.golden ? t('hearts.golden', { n: h.golden }) : null,
    h.rotten ? t('hearts.rotten', { n: h.rotten }) : null,
  ].filter(Boolean);
  return (
    <div className="health">
      {title}
      <div className="hearts">{icons.length ? icons : <span className="muted">{t('stats.noHearts')}</span>}</div>
      {extras.length ? <div className="health__extra">{extras.join(' · ')}</div> : null}
    </div>
  );
}

function Resources() {
  const { state } = useClient();
  const t = useT();
  const r = state.player?.resources;
  if (!r) return null;
  return (
    <div className="resources">
      <span title={t('stats.coins')}>
        <CoinIcon size={22} /> {String(r.coins).padStart(2, '0')}
      </span>
      <span title={t('stats.bombs')}>
        <BombIcon size={22} /> {String(r.bombs).padStart(2, '0')}
        {r.goldenBomb ? <em className="golden">∞</em> : null}
      </span>
      <span title={t('stats.keys')}>
        <KeyIcon size={22} /> {String(r.keys).padStart(2, '0')}
        {r.goldenKey ? <em className="golden">∞</em> : null}
      </span>
    </div>
  );
}

function Transformations() {
  const { state } = useClient();
  const lang = useLang();
  const t = useT();
  const [names, setNames] = useState<Map<number, { name: string; nameEs: string | null }>>(new Map());
  useEffect(() => {
    void fetchTransformations().then((l) => setNames(new Map(l.map((x) => [x.id, x]))));
  }, []);
  const forms = state.player?.transformations ?? [];
  if (!forms.length) return null;
  return (
    <div className="forms">
      {forms.map((f) => {
        const n = names.get(f);
        return (
          <span key={f} className="chip chip--gold">
            {(lang === 'es' ? n?.nameEs : n?.name) ?? n?.name ?? t('stats.form', { n: f })}
          </span>
        );
      })}
    </div>
  );
}

export function StatsPanel() {
  const { state } = useClient();
  const t = useT();
  const stats = state.stats;
  const deltas = useStatDeltas();
  return (
    <section className="panel panel--stats" aria-label={t('stats.title')}>
      <h2 className="panel__title">{t('stats.title')}</h2>
      <Hearts />
      <Resources />
      <ul className="stats">
        {STAT_ROWS.map((row) => {
          const d = deltas[row.key];
          return (
            <li key={row.key} className={`stat ${d ? (d.v > 0 ? 'stat--up' : 'stat--down') : ''}`}>
              <span className="stat__icon">{row.icon}</span>
              <span className="stat__label">{t(row.label)}</span>
              <span className="stat__value mono">{stats ? fixed(stats[row.key], 2) : '—'}</span>
              {d ? (
                <span key={d.id} className={`stat__delta ${d.v > 0 ? 'up' : 'down'}`}>
                  {signed(d.v)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Transformations />
      <p className="footnote">{stats ? t('stats.note') : t('stats.empty')}</p>
    </section>
  );
}
