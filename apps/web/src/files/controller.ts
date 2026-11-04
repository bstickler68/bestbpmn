/// <reference path="./fs-access.d.ts" />
import type { TFunction } from '@bestbpmn/i18n';
import { loadFolder, saveFolder } from './handleStore';
import { isLockFile, isStale, lockName, readLock, type LockInfo } from './locks';
import { FileSession, newSessionId, type Access } from './session';
import { BrowserWorkspace, canPickFolder, folderPermission, isModelFile, type FileEntry, type Workspace } from './workspace';

const USER_KEY = 'bestbpmn.user';

/** Was die Dateiverwaltung von der übrigen App braucht. */
export interface FilesHost {
  t: () => TFunction;
  language: () => string;
  /** Aktuelles Modell als BPMN-XML. */
  getXml: () => Promise<string>;
  /** Lädt ein Modell in den Modellierer. */
  /** Lädt ein Modell; `fileName` ist der Name der Datei im Ordner. */
  load: (xml: string, fileName?: string) => Promise<void>;
  /** Vorschlag für den Dateinamen (aus dem Modellnamen). */
  suggestedName: () => string;
  /** Ungespeicherte Änderungen? */
  isDirty: () => boolean;
  markClean: () => void;
  /** Bietet das Modell als Download an (Firefox oder Kopie). */
  download: () => Promise<void>;
  /** Die Anzeige (Dateiname, Banner, Liste) hat sich geändert. */
  changed: () => void;
}

interface ListedFile extends FileEntry {
  lock?: LockInfo;
}

/** Name für die Sperrdatei, einmal gefragt und im Browser gemerkt. */
export function storedUser(): string {
  try {
    return localStorage.getItem(USER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function storeUser(name: string): void {
  try {
    if (name) {
      localStorage.setItem(USER_KEY, name);
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    // Ohne Speicher gilt der Name nur bis zum Neuladen.
  }
}

/** Macht aus einer Eingabe einen gültigen Dateinamen mit `.bpmn`. */
export function normalizeFileName(input: string, fileNameFor: (name: string) => string): string {
  return fileNameFor(input.trim().replace(/\.(bpmn20\.xml|bpmn|xml)$/i, ''));
}

/**
 * Arbeitsordner, Dateiliste und die offene Datei mit ihrer Sperre. Ohne Ordner (oder in Firefox)
 * laufen Öffnen und Speichern wie bisher über Hochladen und Herunterladen.
 */
export class FilesController {
  readonly sessionId = newSessionId();
  folder?: FileSystemDirectoryHandle;
  permission?: PermissionState;
  workspace?: Workspace;
  session?: FileSession;
  files: ListedFile[] = [];
  user = storedUser();
  /** Letzter Fehler beim Lesen des Ordners, z. B. Netzlaufwerk nicht erreichbar. */
  error?: string;

  constructor(
    private readonly host: FilesHost,
    private readonly fileNameFor: (name: string) => string,
  ) {}

  get supported(): boolean {
    return canPickFolder();
  }

  /** Name der offenen Datei im Ordner, sonst `undefined`. */
  get fileName(): string | undefined {
    return this.session?.file;
  }

  get access(): Access | undefined {
    return this.session?.access;
  }

  /** Beim Start: den zuletzt gewählten Ordner wieder anbieten. Der Browser fragt nach dem Neustart erneut. */
  async restore(): Promise<void> {
    if (!this.supported) {
      return;
    }
    const folder = await loadFolder();
    if (folder) {
      this.folder = folder;
      this.permission = await folderPermission(folder).catch(() => 'prompt' as PermissionState);
      if (this.permission === 'granted') {
        await this.connect();
      }
      this.host.changed();
    }
  }

  async pickFolder(): Promise<void> {
    let folder: FileSystemDirectoryHandle;
    try {
      folder = await window.showDirectoryPicker!({ id: 'bestbpmn', mode: 'readwrite' });
    } catch {
      return; // abgebrochen
    }
    await this.closeFile();
    this.folder = folder;
    this.permission = await folderPermission(folder, true);
    await saveFolder(folder);
    await this.connect();
    this.host.changed();
  }

  /** Nach einem Neustart muss der Zugriff einmal per Klick erlaubt werden. */
  async allowFolder(): Promise<void> {
    if (!this.folder) {
      return;
    }
    this.permission = await folderPermission(this.folder, true);
    await this.connect();
    this.host.changed();
  }

  async forgetFolder(): Promise<void> {
    await this.closeFile();
    this.folder = undefined;
    this.workspace = undefined;
    this.permission = undefined;
    this.files = [];
    await saveFolder(undefined);
    this.host.changed();
  }

  setUser(name: string): void {
    this.user = name.trim();
    storeUser(this.user);
  }

  /** Liest die Dateiliste mit den Sperren neu ein. */
  async refresh(): Promise<void> {
    if (!this.workspace) {
      return;
    }
    try {
      const entries = await this.workspace.list();
      const locks = new Set(entries.filter((entry) => isLockFile(entry.name)).map((entry) => entry.name.toLowerCase()));
      this.files = await Promise.all(
        entries
          .filter((entry) => isModelFile(entry.name))
          .map(async (entry) => ({
            ...entry,
            lock: locks.has(lockName(entry.name).toLowerCase()) ? await readLock(this.workspace!, entry.name) : undefined,
          })),
      );
      this.error = undefined;
    } catch (error) {
      this.error = (error as Error).message;
    }
    this.host.changed();
  }

  /** Öffnet eine Datei aus dem Ordner. Fremd gesperrte Dateien öffnen sich nur zum Ansehen. */
  async openFile(name: string): Promise<void> {
    if (!this.workspace || !this.confirmDiscard() || !this.ensureUser()) {
      return;
    }
    // Erst die alte Datei freigeben: Beide Sitzungen gehören zu diesem Fenster und teilen sich die Kennung.
    await this.session?.close();
    this.session = undefined;
    const session = this.newSession();
    let text: string;
    try {
      text = await session.open(name);
    } catch (error) {
      alert(this.host.t()('files.readError', { name, message: (error as Error).message }));
      await this.refresh();
      return;
    }
    this.session = session;
    await this.host.load(text, name);
    this.host.markClean();
    await this.refresh();
  }

  /**
   * Versucht die Sperre noch einmal (`force`: verwaiste Sperre aufheben). Hat sich die Datei
   * inzwischen geändert, wird sie neu geladen.
   */
  async retry(force = false): Promise<void> {
    if (!this.session) {
      return;
    }
    const text = await this.session.retry(force);
    if (text !== undefined && (!this.host.isDirty() || confirm(this.host.t()('files.reloadChanged')))) {
      await this.host.load(text, this.session.file);
      this.host.markClean();
    }
    await this.refresh();
  }

  /** Gibt die offene Datei frei; danach gehört das Modell zu keiner Datei mehr. */
  async closeFile(): Promise<void> {
    await this.session?.close();
    this.session = undefined;
    await this.refresh();
    this.host.changed();
  }

  /** „Neu“ oder eine hochgeladene Datei: die offene Datei wird freigegeben. */
  async detach(): Promise<boolean> {
    if (!this.confirmDiscard()) {
      return false;
    }
    await this.closeFile();
    return true;
  }

  /** Strg+S und „Speichern“: in die offene Datei, sonst unter neuem Namen in den Ordner, sonst als Download. */
  async save(): Promise<void> {
    const t = this.host.t();
    if (!this.workspace) {
      await this.host.download();
      this.host.markClean();
      return;
    }
    if (!this.session?.file) {
      return this.saveAs();
    }
    const xml = await this.host.getXml();
    let result = await this.session.save(xml);
    if (result.status === 'conflict') {
      if (!confirm(t('files.conflict', { name: this.session.file, time: this.time(result.lastModified) }))) {
        return;
      }
      result = await this.session.save(xml, { overwrite: true });
    }
    if (result.status === 'readonly') {
      if (confirm(t('files.readonlySave', { name: this.session.file }))) {
        await this.host.download();
      }
    } else if (result.status === 'saved') {
      this.host.markClean();
    }
    await this.refresh();
  }

  /** Speichert unter einem neuen Namen im Ordner und arbeitet dann in dieser Datei weiter. */
  async saveAs(): Promise<void> {
    const t = this.host.t();
    if (!this.workspace || !this.ensureUser()) {
      return;
    }
    const input = prompt(t('files.saveAsName'), this.session?.file ?? this.host.suggestedName());
    if (!input?.trim()) {
      return;
    }
    const name = normalizeFileName(input, this.fileNameFor);
    const xml = await this.host.getXml();
    const session = this.session?.file ? this.session : this.newSession();
    let result = await session.saveAs(name, xml);
    if (result.status === 'exists') {
      if (!confirm(t('files.exists', { name }))) {
        return;
      }
      result = await session.saveAs(name, xml, { overwrite: true });
    }
    if (result.status === 'locked') {
      alert(t('files.lockedBy', { name, user: result.lock.user, since: this.time(Date.parse(result.lock.since)) }));
      return;
    }
    if (result.status === 'conflict' || result.status === 'readonly') {
      // Gleicher Name wie die offene Datei: wie „Speichern“ behandeln.
      return this.save();
    }
    this.session = session;
    this.host.markClean();
    await this.refresh();
  }

  /** Beim Schließen des Fensters die eigene Sperre freigeben (so weit der Browser es noch zulässt). */
  release(): void {
    void this.session?.close();
  }

  /** Uhrzeit und Datum für Hinweise, in der Sprache der Oberfläche. */
  time(value: number): string {
    if (!Number.isFinite(value)) {
      return '?';
    }
    return new Intl.DateTimeFormat(this.host.language(), { dateStyle: 'short', timeStyle: 'short' }).format(value);
  }

  isStale(lock: LockInfo): boolean {
    return isStale(lock);
  }

  private async connect(): Promise<void> {
    if (this.folder && this.permission === 'granted') {
      this.workspace = new BrowserWorkspace(this.folder);
      await this.refresh();
    } else {
      this.workspace = undefined;
      this.files = [];
    }
  }

  private newSession(): FileSession {
    const session = new FileSession(this.workspace!, () => ({ user: this.user, session: this.sessionId }));
    session.onAccessChange = () => {
      void this.refresh();
    };
    return session;
  }

  /** Der Name steht in der Sperrdatei, damit andere sehen, wer die Datei gerade bearbeitet. */
  private ensureUser(): boolean {
    if (this.user) {
      return true;
    }
    const name = prompt(this.host.t()('files.askName'))?.trim();
    if (name) {
      this.setUser(name);
      this.host.changed();
    }
    return !!name;
  }

  private confirmDiscard(): boolean {
    return !this.host.isDirty() || confirm(this.host.t()('files.discard'));
  }
}
