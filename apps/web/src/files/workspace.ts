/// <reference path="./fs-access.d.ts" />

/** Eine Datei im Arbeitsverzeichnis. */
export interface FileEntry {
  name: string;
  lastModified: number;
}

/** Inhalt einer Datei und der Zeitpunkt ihrer letzten Änderung. */
export interface FileContent {
  text: string;
  lastModified: number;
}

/**
 * Ein Ordner mit Arbeitsdateien. Im Browser steht dahinter die File System Access API, später im
 * Windows-Programm (Tauri) das Dateisystem. Die übrige App kennt nur diese Schnittstelle.
 */
export interface Workspace {
  /** Anzeigename des Ordners, z. B. `Prozesse`. */
  readonly name: string;
  /** Alle Dateien im Ordner (ohne Unterordner), nach Namen sortiert. */
  list(): Promise<FileEntry[]>;
  /** Liest eine Datei; `undefined`, wenn es sie nicht gibt. */
  read(name: string): Promise<FileContent | undefined>;
  /** Schreibt eine Datei und gibt ihren neuen Änderungszeitpunkt zurück. */
  write(name: string, text: string): Promise<number>;
  /** Löscht eine Datei; fehlt sie, passiert nichts. */
  remove(name: string): Promise<void>;
}

/** Arbeitsverzeichnis über die File System Access API (Edge, Chrome; auch Netzlaufwerke). */
export class BrowserWorkspace implements Workspace {
  constructor(readonly handle: FileSystemDirectoryHandle) {}

  get name(): string {
    return this.handle.name;
  }

  async list(): Promise<FileEntry[]> {
    const entries: FileEntry[] = [];
    for await (const entry of this.handle.values()) {
      if (entry.kind === 'file') {
        const file = await (entry as FileSystemFileHandle).getFile();
        entries.push({ name: entry.name, lastModified: file.lastModified });
      }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async read(name: string): Promise<FileContent | undefined> {
    try {
      const file = await (await this.handle.getFileHandle(name)).getFile();
      return { text: await file.text(), lastModified: file.lastModified };
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        return undefined;
      }
      throw error;
    }
  }

  async write(name: string, text: string): Promise<number> {
    const handle = await this.handle.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return (await handle.getFile()).lastModified;
  }

  async remove(name: string): Promise<void> {
    try {
      await this.handle.removeEntry(name);
    } catch (error) {
      if ((error as DOMException).name !== 'NotFoundError') {
        throw error;
      }
    }
  }
}

/** Kann dieser Browser einen Ordner freigeben? Edge und Chrome ja, Firefox und Safari nein. */
export function canPickFolder(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Ordnerzugriff erlaubt? `prompt` heißt: einmal per Klick bestätigen lassen. */
export async function folderPermission(handle: FileSystemDirectoryHandle, request = false): Promise<PermissionState> {
  const descriptor = { mode: 'readwrite' as const };
  const state = (await handle.queryPermission?.(descriptor)) ?? 'granted';
  if (state === 'prompt' && request) {
    return (await handle.requestPermission?.(descriptor)) ?? 'denied';
  }
  return state;
}

/** Nur Modelldateien zeigen. */
export function isModelFile(name: string): boolean {
  return /\.(bpmn|bpmn20\.xml)$/i.test(name);
}
