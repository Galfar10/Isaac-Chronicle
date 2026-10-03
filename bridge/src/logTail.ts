import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

export interface LogTailOptions {
  /** Poll interval. Polling a file size is cheap and reliable on every OS (fs.watch is not). */
  intervalMs?: number;
  /** Read the existing content first (replays the current game session). */
  fromStart?: boolean;
  /** Maximum bytes processed per poll, to keep each tick short. */
  maxChunk?: number;
}

/**
 * Tails a text file that another process appends to (Isaac's log.txt).
 * Emits 'lines' (string[]), 'reset' (file truncated/recreated: game restarted),
 * 'missing' and 'error'.
 */
export class LogTail extends EventEmitter {
  private offset = 0;
  private partial = '';
  private decoder = new StringDecoder('utf8');
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private started = false;
  private missing = false;
  private identity: string | null = null;

  constructor(
    public readonly path: string,
    private readonly opts: LogTailOptions = {},
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      const st = await fs.stat(this.path);
      this.identity = `${st.ino}:${st.birthtimeMs}`;
      this.offset = this.opts.fromStart === false ? st.size : 0;
    } catch {
      this.offset = 0;
    }
    await this.poll();
    this.timer = setInterval(() => void this.poll(), this.opts.intervalMs ?? 100);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }

  /** Exposed for tests. */
  async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      let st;
      try {
        st = await fs.stat(this.path);
      } catch {
        if (!this.missing) {
          this.missing = true;
          this.emit('missing', this.path);
        }
        return;
      }
      if (this.missing) this.missing = false;
      const identity = `${st.ino}:${st.birthtimeMs}`;
      if (st.size < this.offset || (this.identity && identity !== this.identity)) {
        // Isaac recreates log.txt on every launch.
        this.offset = 0;
        this.partial = '';
        this.decoder = new StringDecoder('utf8');
        this.emit('reset');
      }
      this.identity = identity;
      if (st.size === this.offset) return;
      const toRead = Math.min(st.size - this.offset, this.opts.maxChunk ?? 4 * 1024 * 1024);
      const fh = await fs.open(this.path, 'r');
      try {
        const buf = Buffer.alloc(toRead);
        const { bytesRead } = await fh.read(buf, 0, toRead, this.offset);
        this.offset += bytesRead;
        const text = this.partial + this.decoder.write(buf.subarray(0, bytesRead));
        const parts = text.split('\n');
        this.partial = parts.pop() ?? '';
        if (parts.length) this.emit('lines', parts);
      } finally {
        await fh.close();
      }
    } catch (err) {
      this.emit('error', err);
    } finally {
      this.busy = false;
    }
  }
}
