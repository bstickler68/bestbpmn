import type { Workspace } from './workspace';

/** Inhalt einer Sperrdatei `name.bpmn.lock`. */
export interface LockInfo {
  /** Name der Person, die die Datei bearbeitet. */
  user: string;
  /** Kennung des Fensters, das die Sperre hält. So erkennt die App ihre eigene Sperre wieder. */
  session: string;
  /** Beginn der Bearbeitung (ISO-Zeit). */
  since: string;
  /** Letztes Lebenszeichen (ISO-Zeit). Die App erneuert es regelmäßig. */
  heartbeat: string;
}

/** So oft erneuert ein offenes Fenster seine Sperre. */
export const HEARTBEAT_MS = 60_000;
/** Ohne Lebenszeichen seit dieser Zeit gilt eine Sperre als verwaist, z. B. nach einem Absturz. */
export const STALE_MS = 10 * 60_000;

export const lockName = (file: string) => `${file}.lock`;
export const isLockFile = (name: string) => name.toLowerCase().endsWith('.lock');

export type LockResult =
  | { status: 'acquired'; lock: LockInfo }
  | { status: 'locked'; lock: LockInfo }
  | { status: 'stale'; lock: LockInfo };

export async function readLock(workspace: Workspace, file: string): Promise<LockInfo | undefined> {
  const content = await workspace.read(lockName(file));
  if (!content) {
    return undefined;
  }
  try {
    const value = JSON.parse(content.text) as Partial<LockInfo>;
    if (typeof value.user === 'string' && typeof value.session === 'string' && typeof value.heartbeat === 'string') {
      return { user: value.user, session: value.session, since: value.since ?? value.heartbeat, heartbeat: value.heartbeat };
    }
  } catch {
    // Unlesbare Sperrdatei: wie eine verwaiste Sperre behandeln.
  }
  return { user: '?', session: '?', since: new Date(content.lastModified).toISOString(), heartbeat: new Date(0).toISOString() };
}

export function isStale(lock: LockInfo, now = Date.now()): boolean {
  const beat = Date.parse(lock.heartbeat);
  return Number.isNaN(beat) || now - beat > STALE_MS;
}

/**
 * Sperrt eine Datei für dieses Fenster. Ist sie von jemand anderem gesperrt, kommt `locked` zurück;
 * eine verwaiste Sperre (`stale`) überschreibt nur `force`. Nach dem Schreiben liest die Funktion die
 * Sperre noch einmal: Hat jemand anderes im selben Moment gesperrt, gewinnt, wer zuletzt geschrieben hat,
 * und der andere bekommt `locked`. Ganz ausschließen lässt sich ein gleichzeitiger Zugriff im Browser nicht.
 */
export async function acquireLock(
  workspace: Workspace,
  file: string,
  me: { user: string; session: string },
  options: { force?: boolean; now?: () => number; settle?: () => Promise<void> } = {},
): Promise<LockResult> {
  const now = options.now ?? Date.now;
  const existing = await readLock(workspace, file);
  if (existing && existing.session !== me.session) {
    if (!isStale(existing, now())) {
      return { status: 'locked', lock: existing };
    }
    if (!options.force) {
      return { status: 'stale', lock: existing };
    }
  }
  const time = new Date(now()).toISOString();
  const lock: LockInfo = {
    user: me.user,
    session: me.session,
    since: existing?.session === me.session ? existing.since : time,
    heartbeat: time,
  };
  await workspace.write(lockName(file), JSON.stringify(lock, null, 2));
  await (options.settle ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 300))))();
  const check = await readLock(workspace, file);
  if (check && check.session !== me.session) {
    return { status: 'locked', lock: check };
  }
  return { status: 'acquired', lock };
}

/** Erneuert das Lebenszeichen der eigenen Sperre. Gehört sie nicht mehr diesem Fenster, `false`. */
export async function renewLock(workspace: Workspace, file: string, session: string, now = Date.now()): Promise<boolean> {
  const lock = await readLock(workspace, file);
  if (!lock || lock.session !== session) {
    return false;
  }
  await workspace.write(lockName(file), JSON.stringify({ ...lock, heartbeat: new Date(now).toISOString() }, null, 2));
  return true;
}

/** Gibt die eigene Sperre frei. Fremde Sperren bleiben unberührt. */
export async function releaseLock(workspace: Workspace, file: string, session: string): Promise<void> {
  const lock = await readLock(workspace, file);
  if (lock?.session === session) {
    await workspace.remove(lockName(file));
  }
}
