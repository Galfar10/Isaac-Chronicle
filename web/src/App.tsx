import { useCallback, useEffect, useState } from 'react';
import type { ItemKind } from '@irtc/protocol';
import { Header } from './components/Header';
import { StatsPanel } from './components/StatsPanel';
import { FeaturedItem, RoomItems } from './components/FeaturedItem';
import { InventoryPanel, SynergiesPanel } from './components/Inventory';
import { HistoryPanel } from './components/History';
import { MapPanel } from './components/MapPanel';
import { ItemModal } from './components/ItemModal';
import { SpawnPopup } from './components/SpawnPopup';
import { Welcome } from './components/Welcome';
import { BagIcon, BookIcon, MapIcon, ScrollIcon, SparkIcon } from './components/Icons';
import { gameStore, useClient, useGameEvents } from './lib/gameStore';
import { LangContext, type Lang } from './lib/i18n';

type Tab = 'run' | 'inventory' | 'synergies' | 'history' | 'map';

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function useIsMobile() {
  const q = '(max-width: 760px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}

/** Sketchy line filter shared by drawings (hand-drawn wobble). */
function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <filter id="sketch">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" />
      </filter>
    </svg>
  );
}

export function App() {
  const [monitor, setMonitor] = useState(() => new URLSearchParams(location.search).get('mode') === 'monitor');
  const [lang, setLang] = useState<Lang>(() => readPref<Lang>('irtc.lang', 'es'));
  const [tab, setTab] = useState<Tab>('run');
  const [modal, setModal] = useState<{ kind: ItemKind; id: number } | null>(null);
  const [pinnedKey, setPinnedKey] = useState<number | null>(null);
  const mobile = useIsMobile();
  const { state } = useClient();

  useEffect(() => gameStore.start(), []);
  useEffect(() => {
    document.documentElement.classList.toggle('monitor', monitor);
  }, [monitor]);
  useGameEvents((events) => {
    if (events.some((e) => e.event === 'room_changed' || e.event === 'run_started')) setPinnedKey(null);
  });
  useEffect(() => {
    if (pinnedKey !== null && !state.roomItems.some((i) => i.key === pinnedKey)) setPinnedKey(null);
  }, [state.roomItems, pinnedKey]);

  const toggleMonitor = useCallback(() => {
    setMonitor((m) => {
      const next = !m;
      const url = new URL(location.href);
      if (next) url.searchParams.set('mode', 'monitor');
      else url.searchParams.delete('mode');
      history.replaceState(null, '', url);
      if (next) void document.documentElement.requestFullscreen?.().catch(() => undefined);
      else if (document.fullscreenElement) void document.exitFullscreen();
      return next;
    });
  }, []);
  const toggleLang = () =>
    setLang((l) => {
      const next = l === 'es' ? 'en' : 'es';
      writePref('irtc.lang', next);
      return next;
    });

  const open = (r: { kind: ItemKind; id: number }) => setModal(r);
  const runView = (
    <>
      <FeaturedItem pinnedKey={pinnedKey} onPin={setPinnedKey} onOpen={open} />
      <RoomItems pinnedKey={pinnedKey} onPin={setPinnedKey} />
    </>
  );

  return (
    <LangContext.Provider value={lang}>
      <SvgDefs />
      <div className={`app ${monitor ? 'app--monitor' : ''}`}>
        <Header monitor={monitor} onToggleMonitor={toggleMonitor} onToggleLang={toggleLang} />
        {!state.run ? <Welcome /> : null}
        {mobile ? (
          <main className="mobile">
            {tab === 'run' ? (
              <>
                {runView}
                <StatsPanel />
              </>
            ) : null}
            {tab === 'inventory' ? <InventoryPanel onOpen={open} /> : null}
            {tab === 'synergies' ? <SynergiesPanel /> : null}
            {tab === 'history' ? <HistoryPanel /> : null}
            {tab === 'map' ? <MapPanel /> : null}
            <nav className="tabbar" aria-label="Secciones">
              {(
                [
                  ['run', 'Run', <BookIcon key="i" size={22} />],
                  ['inventory', 'Inventario', <BagIcon key="i" size={22} />],
                  ['synergies', 'Sinergias', <SparkIcon key="i" size={22} />],
                  ['history', 'Historial', <ScrollIcon key="i" size={22} />],
                  ['map', 'Mapa', <MapIcon key="i" size={22} />],
                ] as const
              ).map(([id, label, icon]) => (
                <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} aria-current={tab === id}>
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </main>
        ) : monitor ? (
          /* Second monitor: everything fits one 1080p screen, no page scroll. */
          <main className="journal journal--monitor">
            <div className="col col--left">
              <StatsPanel />
              <MapPanel />
            </div>
            <div className="col col--center">
              {runView}
              <HistoryPanel />
            </div>
            <div className="col col--right">
              <InventoryPanel onOpen={open} />
              <SynergiesPanel />
            </div>
          </main>
        ) : (
          <main className="journal">
            <div className="col col--left">
              <StatsPanel />
              <MapPanel />
            </div>
            <div className="col col--center">{runView}</div>
            <div className="col col--right">
              <InventoryPanel onOpen={open} />
              <SynergiesPanel />
            </div>
            <div className="col col--bottom">
              <HistoryPanel />
            </div>
          </main>
        )}
      </div>
      <SpawnPopup onOpen={open} enabled={mobile && tab !== 'run'} />
      <ItemModal target={modal} onClose={() => setModal(null)} />
    </LangContext.Provider>
  );
}
