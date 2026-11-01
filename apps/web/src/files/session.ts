import { acquireLock, HEARTBEAT_MS, readLock, releaseLock, renewLock, type LockInfo } from './locks';
import type { Workspace } from './workspace';

/** Wer gerade arbeitet: Name für die Sperrdatei und Kennung dieses Fensters. */
export interface Me {
  user: string;
  session: string;
}

/**
 * Zugriff auf die offene Datei:
 * - `edit`: dieses Fenster hält die Sperre und darf speichern.
 * - `locked`: jemand anderes bearbeitet die Datei; nur ansehen.
 * - `stale`: eine verwaiste Sperre liegt vor; sie lässt sich aufheben.
 * - `lost`: die eigene Sperre wurde inzwischen von jemand anderem übernommen.
 */
export type Access = 'edit' | 'locked' | 'stale' | 'lost';

export type SaveResult =
  | { status: 'saved' }
  | { status: 'conflict'; lastModified: number }
  | { status: 'readonly'; access: Access; lock?: LockInfo };

export type SaveAsResult = SaveResult | { status: 'exists' } | { status: 'locked'; lock: LockInfo };

export interface SessionOptions {
  now?: () => number;
  /** Wartezeit zwischen Schreiben und Prüfen der Sperre (Tests: sofort). */
  settle?: () => Promise<void>;
}

/** Eine Modelldatei im Arbeitsordner: öffnen, sperren, speichern, freigeben. */
export class FileSession {
  file?: string;
  access?: Access;
  /** Die Sperre, die gerade gilt (eigene oder fremde). */
  lock?: LockInfo;
  /** Änderungszeitpunkt der Datei, als dieses Fenster sie zuletzt gelesen oder geschrieben hat. */
  lastModified?: number;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    readonly workspace: Workspace,
    private readonly me: () => Me,
    private readonly options: SessionOptions = {},
  ) {}

  /** Öffnet eine Datei und versucht, sie zu sperren. Die vorher offene Datei wird freigegeben. */
  async open(name: string): Promise<string> {
    const content = await this.workspace.read(name);
    if (!content) {
      throw new Error(name);
    }
    await this.close();
    this.file = name;
    this.lastModified = content.lastModified;
    await this.tryLock(false);
    return content.text;
  }

  /**
   * Versucht erneut zu sperren, z. B. nachdem die andere Person fertig ist. Mit `force` wird eine
   * verwaiste Sperre aufgehoben. Hat sich die Datei inzwischen geändert, kommt ihr neuer Inhalt zurück.
   */
  async retry(force = false): Promise<string | undefined> {
    if (!this.file) {
      return undefined;
    }
    await this.tryLock(force);
    if (this.access !== 'edit') {
      return undefined;
    }
    const content = await this.workspace.read(this.file);
    if (content && content.lastModified !== this.lastModified) {
      this.lastModified = content.lastModified;
      return content.text;
    }
    return undefined;
  }

  /** Speichert in die offene Datei. Hat jemand sie seit dem Öffnen geändert, nur mit `overwrite`. */
  async save(text: string, options: { overwrite?: boolean } = {}): Promise<SaveResult> {
    if (!this.file) {
      throw new Error('no file');
    }
    if (this.access !== 'edit' || !(await renewLock(this.workspace, this.file, this.me().session, this.now()))) {
      if (this.access === 'edit') {
        this.access = 'lost';
        this.lock = await readLock(this.workspace, this.file);
      }
      return { status: 'readonly', access: this.access!, lock: this.lock };
    }
    const current = await this.workspace.read(this.file);
    if (current && current.lastModified !== this.lastModified && !options.overwrite) {
      return { status: 'conflict', lastModified: current.lastModified };
    }
    this.lastModified = await this.workspace.write(this.file, text);
    return { status: 'saved' };
  }

  /** Speichert unter neuem Namen (z. B. ein neues Modell) und sperrt die neue Datei. */
  async saveAs(name: string, text: string, options: { overwrite?: boolean } = {}): Promise<SaveAsResult> {
    if (name === this.file) {
      return this.save(text, options);
    }
    if (!options.overwrite && (await this.workspace.read(name))) {
      return { status: 'exists' };
    }
    const result = await acquireLock(this.workspace, name, this.me(), this.lockOptions());
    if (result.status !== 'acquired') {
      return { status: 'locked', lock: result.lock };
    }
    await this.close();
    this.file = name;
    this.access = 'edit';
    this.lock = result.lock;
    this.lastModified = await this.workspace.write(name, text);
    this.startHeartbeat();
    return { status: 'saved' };
  }

  /** Erneuert die eigene Sperre. Wurde sie übernommen, wechselt der Zugriff auf `lost`. */
  async heartbeat(): Promise<Access | undefined> {
    if (this.file && this.access === 'edit') {
      if (!(await renewLock(this.workspace, this.file, this.me().session, this.now()))) {
        this.access = 'lost';
        this.lock = await readLock(this.workspace, this.file);
      }
    }
    return this.access;
  }

  /** Gibt die Datei frei (eigene Sperre löschen) und vergisst sie. */
  async close(): Promise<void> {
    this.stopHeartbeat();
    if (this.file && this.access === 'edit') {
      await releaseLock(this.workspace, this.file, this.me().session).catch(() => undefined);
    }
    this.file = undefined;
    this.access = undefined;
    this.lock = undefined;
    this.lastModified = undefined;
  }

  /** Wird bei jedem Lebenszeichen aufgerufen, wenn sich der Zugriff ändert. */
  onAccessChange?: (access: Access | undefined) => void;

  private async tryLock(force: boolean) {
    const result = await acquireLock(this.workspace, this.file!, this.me(), { ...this.lockOptions(), force });
    this.lock = result.lock;
    this.access = result.status === 'acquired' ? 'edit' : result.status;
    if (this.access === 'edit') {
      this.startHeartbeat();
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.timer = setInterval(async () => {
      const before = this.access;
      const after = await this.heartbeat().catch(() => this.access);
      if (after !== before) {
        this.onAccessChange?.(after);
      }
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private now() {
    return (this.options.now ?? Date.now)();
  }

  private lockOptions() {
    return { now: this.options.now, settle: this.options.settle };
  }
}

/** Kennung dieses Fensters; jedes Fenster hält seine eigene Sperre. */
export function newSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
