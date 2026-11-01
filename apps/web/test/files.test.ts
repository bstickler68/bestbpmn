import { afterEach, describe, expect, it } from 'vitest';
import { acquireLock, lockName, readLock, releaseLock, renewLock, STALE_MS } from '../src/files/locks';
import { FileSession } from '../src/files/session';
import { BrowserWorkspace, isModelFile, type FileContent, type FileEntry, type Workspace } from '../src/files/workspace';
import { normalizeFileName } from '../src/files/controller';
import { svgToPng, withExtension } from '../src/export';
import { fileNameFor } from '@bestbpmn/bpmn-js-extension';

/** Arbeitsordner im Speicher. Jeder Schreibvorgang bekommt einen neuen Zeitpunkt. */
class MemoryWorkspace implements Workspace {
  readonly name = 'Test';
  files = new Map<string, FileContent>();
  private clock = 1_000;

  async list(): Promise<FileEntry[]> {
    return [...this.files].map(([name, { lastModified }]) => ({ name, lastModified })).sort((a, b) => a.name.localeCompare(b.name));
  }
  async read(name: string) {
    return this.files.get(name);
  }
  async write(name: string, text: string) {
    const lastModified = ++this.clock;
    this.files.set(name, { text, lastModified });
    return lastModified;
  }
  async remove(name: string) {
    this.files.delete(name);
  }
}

const immediately = async () => {};
const anna = { user: 'Anna', session: 'a' };
const ben = { user: 'Ben', session: 'b' };

describe('Sperrdateien', () => {
  it('sperrt eine freie Datei und schreibt Name und Zeit hinein', async () => {
    const ws = new MemoryWorkspace();
    const result = await acquireLock(ws, 'Antrag.bpmn', anna, { settle: immediately, now: () => 0 });

    expect(result.status).toBe('acquired');
    const lock = JSON.parse(ws.files.get('Antrag.bpmn.lock')!.text);
    expect(lock).toMatchObject({ user: 'Anna', session: 'a', since: '1970-01-01T00:00:00.000Z' });
  });

  it('meldet eine fremde Sperre und lässt sie stehen', async () => {
    const ws = new MemoryWorkspace();
    await acquireLock(ws, 'Antrag.bpmn', anna, { settle: immediately, now: () => 0 });
    const result = await acquireLock(ws, 'Antrag.bpmn', ben, { settle: immediately, now: () => 60_000 });

    expect(result).toMatchObject({ status: 'locked', lock: { user: 'Anna' } });
    expect((await readLock(ws, 'Antrag.bpmn'))!.user).toBe('Anna');
  });

  it('hebt eine verwaiste Sperre nur auf Wunsch auf', async () => {
    const ws = new MemoryWorkspace();
    await acquireLock(ws, 'Antrag.bpmn', anna, { settle: immediately, now: () => 0 });
    const later = () => STALE_MS + 1;

    expect((await acquireLock(ws, 'Antrag.bpmn', ben, { settle: immediately, now: later })).status).toBe('stale');
    expect((await acquireLock(ws, 'Antrag.bpmn', ben, { settle: immediately, now: later, force: true })).status).toBe('acquired');
    expect((await readLock(ws, 'Antrag.bpmn'))!.user).toBe('Ben');
  });

  it('erkennt, wenn jemand im selben Moment gesperrt hat', async () => {
    const ws = new MemoryWorkspace();
    // Ben hat vor Anna nachgesehen und schreibt seine Sperre, während Anna noch wartet; der Letzte gewinnt.
    const now = new Date().toISOString();
    const settle = () =>
      ws.write('Antrag.bpmn.lock', JSON.stringify({ ...ben, since: now, heartbeat: now })).then(() => undefined);
    const result = await acquireLock(ws, 'Antrag.bpmn', anna, { settle });

    expect(result).toMatchObject({ status: 'locked', lock: { user: 'Ben' } });
  });

  it('behandelt eine unlesbare Sperrdatei als verwaist', async () => {
    const ws = new MemoryWorkspace();
    await ws.write('Antrag.bpmn.lock', 'kaputt');

    expect((await acquireLock(ws, 'Antrag.bpmn', anna, { settle: immediately })).status).toBe('stale');
  });

  it('erneuert und löscht nur die eigene Sperre', async () => {
    const ws = new MemoryWorkspace();
    await acquireLock(ws, 'Antrag.bpmn', anna, { settle: immediately, now: () => 0 });

    expect(await renewLock(ws, 'Antrag.bpmn', 'b', 5_000)).toBe(false);
    expect(await renewLock(ws, 'Antrag.bpmn', 'a', 5_000)).toBe(true);
    expect((await readLock(ws, 'Antrag.bpmn'))!.heartbeat).toBe('1970-01-01T00:00:05.000Z');

    await releaseLock(ws, 'Antrag.bpmn', 'b');
    expect(ws.files.has(lockName('Antrag.bpmn'))).toBe(true);
    await releaseLock(ws, 'Antrag.bpmn', 'a');
    expect(ws.files.has(lockName('Antrag.bpmn'))).toBe(false);
  });
});

describe('Datei im Arbeitsordner', () => {
  const sessions: FileSession[] = [];
  const session = (ws: Workspace, me: typeof anna, now = () => 0) => {
    const s = new FileSession(ws, () => me, { settle: immediately, now });
    sessions.push(s);
    return s;
  };

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((s) => s.close()));
  });

  it('öffnet zum Bearbeiten, speichert und gibt beim Schließen frei', async () => {
    const ws = new MemoryWorkspace();
    await ws.write('Antrag.bpmn', '<v1/>');
    const s = session(ws, anna);

    expect(await s.open('Antrag.bpmn')).toBe('<v1/>');
    expect(s.access).toBe('edit');
    expect(await s.save('<v2/>')).toEqual({ status: 'saved' });
    expect(ws.files.get('Antrag.bpmn')!.text).toBe('<v2/>');

    await s.close();
    expect(ws.files.has('Antrag.bpmn.lock')).toBe(false);
  });

  it('öffnet eine fremd gesperrte Datei nur zum Ansehen', async () => {
    const ws = new MemoryWorkspace();
    await ws.write('Antrag.bpmn', '<v1/>');
    await session(ws, anna).open('Antrag.bpmn');
    const b = session(ws, ben);

    await b.open('Antrag.bpmn');
    expect(b.access).toBe('locked');
    expect(b.lock!.user).toBe('Anna');
    expect(await b.save('<ben/>')).toMatchObject({ status: 'readonly', access: 'locked' });
    expect(ws.files.get('Antrag.bpmn')!.text).toBe('<v1/>');

    // Schließt Ben, bleibt Annas Sperre bestehen.
    await b.close();
    expect((await readLock(ws, 'Antrag.bpmn'))!.user).toBe('Anna');
  });

  it('übernimmt nach Annas Freigabe und lädt ihre Änderungen nach', async () => {
    const ws = new MemoryWorkspace();
    await ws.write('Antrag.bpmn', '<v1/>');
    const a = session(ws, anna);
    await a.open('Antrag.bpmn');
    const b = session(ws, ben);
    await b.open('Antrag.bpmn');

    await a.save('<anna/>');
    await a.close();

    expect(await b.retry()).toBe('<anna/>');
    expect(b.access).toBe('edit');
  });

  it('warnt, wenn die Datei seit dem Öffnen von außen geändert wurde', async () => {
    const ws = new MemoryWorkspace();
    await ws.write('Antrag.bpmn', '<v1/>');
    const s = session(ws, anna);
    await s.open('Antrag.bpmn');
    await ws.write('Antrag.bpmn', '<extern/>');

    expect((await s.save('<mine/>')).status).toBe('conflict');
    expect(ws.files.get('Antrag.bpmn')!.text).toBe('<extern/>');
    expect(await s.save('<mine/>', { overwrite: true })).toEqual({ status: 'saved' });
    expect(ws.files.get('Antrag.bpmn')!.text).toBe('<mine/>');
  });

  it('merkt, wenn jemand die verwaiste Sperre übernommen hat', async () => {
    const ws = new MemoryWorkspace();
    await ws.write('Antrag.bpmn', '<v1/>');
    const a = session(ws, anna);
    await a.open('Antrag.bpmn');
    await acquireLock(ws, 'Antrag.bpmn', ben, { settle: immediately, force: true, now: () => STALE_MS + 1 });

    expect(await a.heartbeat()).toBe('lost');
    expect(a.lock!.user).toBe('Ben');
    expect((await a.save('<anna/>')).status).toBe('readonly');
  });

  it('speichert ein neues Modell unter neuem Namen und sperrt es', async () => {
    const ws = new MemoryWorkspace();
    await ws.write('Antrag.bpmn', '<alt/>');
    const s = session(ws, anna);

    expect(await s.saveAs('Antrag.bpmn', '<neu/>')).toEqual({ status: 'exists' });
    expect(await s.saveAs('Antrag.bpmn', '<neu/>', { overwrite: true })).toEqual({ status: 'saved' });
    expect(s.file).toBe('Antrag.bpmn');
    expect(s.access).toBe('edit');
    expect((await readLock(ws, 'Antrag.bpmn'))!.user).toBe('Anna');
  });

  it('gibt beim Speichern unter neuem Namen die alte Datei frei', async () => {
    const ws = new MemoryWorkspace();
    await ws.write('Alt.bpmn', '<alt/>');
    const s = session(ws, anna);
    await s.open('Alt.bpmn');

    await s.saveAs('Neu.bpmn', '<neu/>');
    expect(ws.files.has('Alt.bpmn.lock')).toBe(false);
    expect(ws.files.has('Neu.bpmn.lock')).toBe(true);
  });

  it('überschreibt keine fremd gesperrte Datei', async () => {
    const ws = new MemoryWorkspace();
    await ws.write('Antrag.bpmn', '<v1/>');
    await session(ws, anna).open('Antrag.bpmn');

    expect(await session(ws, ben).saveAs('Antrag.bpmn', '<ben/>', { overwrite: true })).toMatchObject({
      status: 'locked',
      lock: { user: 'Anna' },
    });
    expect(ws.files.get('Antrag.bpmn')!.text).toBe('<v1/>');
  });
});

describe('Arbeitsordner im Browser (File System Access API)', () => {
  it('liest, schreibt, listet und löscht Dateien', async () => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle(`bestbpmn-test-${Date.now()}`, { create: true });
    const ws = new BrowserWorkspace(folder);
    try {
      expect(await ws.read('Fehlt.bpmn')).toBeUndefined();
      const written = await ws.write('Prozess.bpmn', '<a/>');
      await ws.write('Prozess.bpmn', '<b/>');
      expect((await ws.read('Prozess.bpmn'))!.text).toBe('<b/>');
      expect(written).toBeGreaterThan(0);

      const result = await acquireLock(ws, 'Prozess.bpmn', anna, { settle: immediately });
      expect(result.status).toBe('acquired');
      expect((await ws.list()).map((entry) => entry.name)).toEqual(['Prozess.bpmn', 'Prozess.bpmn.lock']);

      await releaseLock(ws, 'Prozess.bpmn', 'a');
      await ws.remove('Fehlt.bpmn');
      expect((await ws.list()).map((entry) => entry.name)).toEqual(['Prozess.bpmn']);
    } finally {
      await root.removeEntry(folder.name, { recursive: true });
    }
  });
});

describe('Dateinamen und Export', () => {
  it('erkennt Modelldateien', () => {
    expect(['a.bpmn', 'B.BPMN', 'c.bpmn20.xml', 'a.bpmn.lock', 'd.xml', 'e.svg'].filter(isModelFile)).toEqual([
      'a.bpmn',
      'B.BPMN',
      'c.bpmn20.xml',
    ]);
  });

  it('macht aus der Eingabe einen Windows-tauglichen Namen mit .bpmn', () => {
    expect(normalizeFileName(' Antrag.bpmn ', fileNameFor)).toBe('Antrag.bpmn');
    expect(normalizeFileName('Antrag: neu?', fileNameFor)).toBe('Antrag- neu-.bpmn');
    expect(normalizeFileName('CON', fileNameFor)).toBe('CON-process.bpmn');
  });

  it('tauscht die Endung für SVG und PNG', () => {
    expect(withExtension('Antrag.bpmn', '.svg')).toBe('Antrag.svg');
    expect(withExtension('Antrag.bpmn20.xml', '.png')).toBe('Antrag.png');
  });

  it('rechnet SVG in PNG um', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="red"/></svg>';
    const png = await svgToPng(svg);
    expect(png.type).toBe('image/png');
    const bitmap = await createImageBitmap(png);
    expect([bitmap.width, bitmap.height]).toEqual([80, 40]);
  });
});
