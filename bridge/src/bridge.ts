import { EventEmitter } from 'node:events';
import { WireDecoder, type DomainEvent, type GameState } from '@irtc/protocol';
import { LogTail } from './logTail.js';
import { isIsaacRunning } from './processWatch.js';
import { GameStateStore, type StoreOptions } from './store.js';

export interface BridgeOptions extends StoreOptions {
  logPath: string;
  pollMs?: number;
  /** Disable the Isaac process check (tests / mock). */
  processCheck?: boolean;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface BridgeUpdate {
  events: DomainEvent[];
  state: GameState;
  /** True while replaying the existing log content at startup. */
  replay: boolean;
}

/**
 * The local bridge: log.txt -> wire decoder -> state store -> 'update' events.
 */
export class Bridge extends EventEmitter {
  readonly store: GameStateStore;
  private readonly decoder = new WireDecoder();
  private readonly tail: LogTail;
  private timers: NodeJS.Timeout[] = [];
  private replaying = false;
  private invalidCount = 0;
  private readonly log: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(private readonly opts: BridgeOptions) {
    super();
    this.log = opts.logger ?? console;
    this.store = new GameStateStore(opts);
    this.store.setLogPath(opts.logPath);
    this.tail = new LogTail(opts.logPath, { intervalMs: opts.pollMs ?? 50, fromStart: true });
    this.tail.on('lines', (lines: string[]) => this.onLines(lines));
    this.tail.on('reset', () => {
      this.decoder.reset();
      this.log.info('[bridge] log.txt was recreated (game restarted)');
    });
    this.tail.on('missing', (p: string) => {
      this.publish(this.store.setError(`log.txt not found: ${p}`));
    });
    this.tail.on('error', (err: Error) => this.log.warn('[bridge] tail error:', err.message));
  }

  get state(): GameState {
    return this.store.state;
  }

  async start(): Promise<void> {
    this.replaying = true;
    await this.tail.start();
    this.replaying = false;
    // Replayed packets are old: liveness must come from a fresh heartbeat.
    if (this.store.state.connection.game === 'connected') this.store.state.connection.lastPacketAt = null;
    this.publish(this.store.tick(), true);
    this.timers.push(setInterval(() => this.publish(this.store.tick()), 1000));
    if (this.opts.processCheck !== false) {
      const check = async () => this.publish(this.store.setIsaacRunning(await isIsaacRunning()));
      void check();
      this.timers.push(setInterval(() => void check(), 5000));
    }
  }

  stop(): void {
    this.tail.stop();
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  /** Feeds raw lines (also used by tests). */
  onLines(lines: string[]): void {
    const events: DomainEvent[] = [];
    let applied = 0;
    for (const line of lines) {
      const res = this.decoder.decodeLine(line);
      if (!res) continue;
      if (!res.ok) {
        this.invalidCount++;
        if (this.invalidCount <= 20) this.log.warn(`[bridge] ignored invalid message: ${res.reason}`);
        continue;
      }
      applied++;
      events.push(...this.store.apply(res.message));
    }
    if (this.store.state.connection.error?.startsWith('log.txt not found')) events.push(...this.store.setError(null));
    if (this.decoder.protocolMismatch !== null) {
      events.push(
        ...this.store.setError(
          `Incompatible mod version (wire protocol ${this.decoder.protocolMismatch}). Update the mod and the Companion.`,
        ),
      );
    }
    // Any applied message may change the state (coins, hearts...) even without a domain
    // event: always publish so the web updates immediately.
    if (applied || events.length) this.publish(events, applied > 0);
  }

  private publish(events: DomainEvent[], force = false): void {
    if (!events.length && !force) return;
    const update: BridgeUpdate = { events: this.replaying ? [] : events, state: this.store.state, replay: this.replaying };
    if (this.replaying) return; // the final state is published once replay finishes
    this.emit('update', update);
  }
}
