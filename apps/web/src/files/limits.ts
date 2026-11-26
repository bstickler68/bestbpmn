/**
 * Obergrenze für Dateien, die bestbpmn liest (Modelle, Katalog, Sperrdateien). Echte BPMN-Modelle
 * sind selten größer als wenige Megabyte; viel größere Dateien würden den Browser nur lahmlegen
 * (OWASP ASVS 4.0.3, 12.1.1).
 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const megabytes = (bytes: number) => `${Math.ceil(bytes / (1024 * 1024))} MB`;

/** Die Datei ist größer als erlaubt. Die Meldung ist sprachneutral und steht in „… konnte nicht gelesen werden: …“. */
export class FileTooLargeError extends Error {
  constructor(readonly size: number) {
    super(`${megabytes(size)} > ${megabytes(MAX_FILE_BYTES)}`);
    this.name = 'FileTooLargeError';
  }
}

/** Liest eine Datei als Text, aber nur bis zur Obergrenze. */
export async function readText(file: Blob, limit = MAX_FILE_BYTES): Promise<string> {
  if (file.size > limit) {
    throw new FileTooLargeError(file.size);
  }
  return file.text();
}
