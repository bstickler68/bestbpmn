/// <reference path="./fs-access.d.ts" />

// Der gewählte Ordner wird in IndexedDB gemerkt; localStorage kann keine Ordner-Handles speichern.
const DB_NAME = 'bestbpmn';
const STORE = 'handles';
const KEY = 'workspace';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Der zuletzt gewählte Arbeitsordner; ohne Speicher oder beim ersten Start `undefined`. */
export async function loadFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    return (await run('readonly', (store) => store.get(KEY))) as FileSystemDirectoryHandle | undefined;
  } catch {
    return undefined;
  }
}

export async function saveFolder(handle: FileSystemDirectoryHandle | undefined): Promise<void> {
  try {
    await run<unknown>('readwrite', (store) => (handle ? store.put(handle, KEY) : store.delete(KEY)) as IDBRequest<unknown>);
  } catch {
    // Ohne Speicher muss der Ordner nach dem Neuladen wieder gewählt werden.
  }
}
