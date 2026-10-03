import { DIFFICULTY_NAMES } from '@irtc/protocol';
import { useEffect, useState } from 'react';
import { fetchCharacters } from '../lib/api';
import { ago, clock, curseNames, floorName } from '../lib/format';
import { useClient, useNow } from '../lib/gameStore';
import { useLang, type Lang } from '../lib/i18n';
import { ExpandIcon } from './Icons';

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
  const c = client.state.connection;
  let tone: 'ok' | 'warn' | 'bad';
  let label: string;
  let detail: string;
  if (client.socket !== 'open') {
    tone = client.everConnected ? 'bad' : 'warn';
    label = client.socket === 'connecting' ? 'CONECTANDO' : 'COMPANION DESCONECTADO';
    detail =
      client.retryInMs !== null
        ? `Reintentando en ${Math.ceil(client.retryInMs / 1000)} s — ¿está abierta la app Isaac Companion?`
        : 'Buscando la app Isaac Companion…';
  } else if (c.game === 'connected') {
    tone = 'ok';
    label = c.paused ? 'ISAAC CONECTADO · PAUSA' : 'ISAAC CONECTADO';
    detail = `Último paquete ${ago(c.lastPacketAt, now)}`;
  } else if (c.game === 'idle') {
    tone = 'warn';
    label = 'ISAAC ABIERTO · SIN DATOS';
    detail = 'Empieza o continúa una partida. Si no cambia, comprueba que el mod está activado.';
  } else if (c.game === 'waiting') {
    tone = 'warn';
    label = 'ESPERANDO A ISAAC';
    detail = 'Abre The Binding of Isaac con el mod activado.';
  } else {
    tone = 'bad';
    label = 'ISAAC DESCONECTADO';
    detail = `Sin datos ${ago(c.lastPacketAt, now)}`;
  }
  const error = c.error ?? (!c.protocolOk ? 'Versión del mod incompatible: actualiza el mod y la app.' : null);
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
  const characters = useCharacterNames();
  const run = state.run;
  const ch = run?.character.type !== null && run?.character.type !== undefined ? characters.get(run.character.type) : undefined;
  const charName = (lang === 'es' ? ch?.nameEs : ch?.name) ?? ch?.name ?? run?.character.name ?? '—';
  const curses = run?.floor ? curseNames(run.floor.curses) : [];
  const status =
    run?.status === 'dead' ? 'Muerte' : run?.status === 'won' ? 'Victoria' : run?.status === 'exited' ? 'Guardada / salida' : null;

  return (
    <header className="header">
      <div className="header__brand">
        <h1 className="title">Diario de la Run</h1>
        <ConnectionBadge />
      </div>
      {run ? (
        <dl className="runinfo">
          <div>
            <dt>Personaje</dt>
            <dd>
              {run.character.tainted ? <span className="tainted">Tainted </span> : null}
              {charName}
            </dd>
          </div>
          <div>
            <dt>Piso</dt>
            <dd>{floorName(run.floor?.name, run.floor?.stage)}</dd>
          </div>
          <div>
            <dt>Tiempo</dt>
            <dd className="mono">{clock(run.time)}</dd>
          </div>
          <div>
            <dt>Semilla</dt>
            <dd className="mono">{run.seed ?? '—'}</dd>
          </div>
          <div>
            <dt>Modo</dt>
            <dd>
              {DIFFICULTY_NAMES[run.difficulty ?? -1] ?? '—'}
              {run.challenge ? ` · Reto ${run.challenge}` : ''}
            </dd>
          </div>
          {status ? (
            <div>
              <dt>Estado</dt>
              <dd className={`runstatus runstatus--${run.status}`}>{status}</dd>
            </div>
          ) : null}
          {curses.length ? (
            <div className="runinfo__curses">
              <dt>Maldiciones</dt>
              <dd>{curses.join(' · ')}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="header__empty">Sin partida en curso.</p>
      )}
      <div className="header__tools">
        <button className="btn" onClick={onToggleLang} title="Idioma de los nombres de objetos">
          {lang === 'es' ? 'ES' : 'EN'}
        </button>
        <button className="btn" onClick={onToggleMonitor} title="Modo segundo monitor (pantalla completa)">
          <ExpandIcon size={18} /> {monitor ? 'Salir' : '2º monitor'}
        </button>
      </div>
    </header>
  );
}
