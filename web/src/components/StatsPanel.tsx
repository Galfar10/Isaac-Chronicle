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

const STAT_ROWS: { key: keyof Stats; label: string; icon: ReactNode; digits?: number }[] = [
  { key: 'damage', label: 'Daño', icon: <DamageIcon /> },
  { key: 'tears', label: 'Lágrimas', icon: <TearsIcon /> },
  { key: 'range', label: 'Alcance', icon: <RangeIcon /> },
  { key: 'shotSpeed', label: 'Vel. disparo', icon: <ShotSpeedIcon /> },
  { key: 'speed', label: 'Velocidad', icon: <SpeedIcon /> },
  { key: 'luck', label: 'Suerte', icon: <LuckIcon /> },
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
  const h = state.player?.health;
  if (!h) return null;
  if (state.player?.healthHidden) {
    return (
      <div className="health">
        <div className="health__title">
          <HeartIcon size={22} /> Vida
        </div>
        <div className="hearts">
          <span className="muted">??? — Curse of the Unknown oculta tu vida</span>
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
    h.eternal ? `${h.eternal} eterno` : null,
    h.golden ? `${h.golden} dorado${h.golden > 1 ? 's' : ''}` : null,
    h.rotten ? `${h.rotten} podrido${h.rotten > 1 ? 's' : ''}` : null,
  ].filter(Boolean);
  return (
    <div className="health">
      <div className="health__title">
        <HeartIcon size={22} /> Vida
      </div>
      <div className="hearts" aria-label={`Rojos ${h.red / 2}/${h.max / 2}, almas ${h.soul / 2}, negros ${h.black}`}>
        {icons.length ? icons : <span className="muted">Sin corazones</span>}
      </div>
      {extras.length ? <div className="health__extra">{extras.join(' · ')}</div> : null}
    </div>
  );
}

function Resources() {
  const { state } = useClient();
  const r = state.player?.resources;
  if (!r) return null;
  return (
    <div className="resources">
      <span title="Monedas">
        <CoinIcon size={22} /> {String(r.coins).padStart(2, '0')}
      </span>
      <span title="Bombas">
        <BombIcon size={22} /> {String(r.bombs).padStart(2, '0')}
        {r.goldenBomb ? <em className="golden">∞</em> : null}
      </span>
      <span title="Llaves">
        <KeyIcon size={22} /> {String(r.keys).padStart(2, '0')}
        {r.goldenKey ? <em className="golden">∞</em> : null}
      </span>
    </div>
  );
}

function Transformations() {
  const { state } = useClient();
  const lang = useLang();
  const [names, setNames] = useState<Map<number, { name: string; nameEs: string | null }>>(new Map());
  useEffect(() => {
    void fetchTransformations().then((l) => setNames(new Map(l.map((t) => [t.id, t]))));
  }, []);
  const forms = state.player?.transformations ?? [];
  if (!forms.length) return null;
  return (
    <div className="forms">
      {forms.map((f) => {
        const n = names.get(f);
        return (
          <span key={f} className="chip chip--gold">
            {(lang === 'es' ? n?.nameEs : n?.name) ?? n?.name ?? `Forma ${f}`}
          </span>
        );
      })}
    </div>
  );
}

export function StatsPanel() {
  const { state } = useClient();
  const stats = state.stats;
  const deltas = useStatDeltas();
  return (
    <section className="panel panel--stats" aria-label="Estadísticas">
      <h2 className="panel__title">Estadísticas</h2>
      <Hearts />
      <Resources />
      <ul className="stats">
        {STAT_ROWS.map((row) => {
          const d = deltas[row.key];
          return (
            <li key={row.key} className={`stat ${d ? (d.v > 0 ? 'stat--up' : 'stat--down') : ''}`}>
              <span className="stat__icon">{row.icon}</span>
              <span className="stat__label">{row.label}</span>
              <span className="stat__value mono">{stats ? fixed(stats[row.key], row.digits ?? 2) : '—'}</span>
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
      {stats ? (
        <p className="footnote">
          Valores reales del juego. Lágrimas = 30/(FireDelay+1) y alcance = TearRange/40, igual que el HUD.
        </p>
      ) : (
        <p className="footnote">Las estadísticas aparecerán al empezar una partida.</p>
      )}
    </section>
  );
}
