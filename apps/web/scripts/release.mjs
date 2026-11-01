// Packt die gebauten Dateien in ein ZIP für die Weitergabe: bestbpmn.html, die Web-App für den
// Webserver mit web.config und eine Kurzanleitung. Ohne zusätzliche Abhängigkeiten.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const folder = `bestbpmn-${version}`;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const entries = [
  [`${folder}/bestbpmn.html`, readFileSync(join(root, 'dist/single/bestbpmn.html'))],
  [`${folder}/LIESMICH.txt`, Buffer.from(readFileSync(join(root, 'release/LIESMICH.txt'), 'utf8').replaceAll('{{VERSION}}', version).replace(/\r?\n/g, '\r\n'))],
  ...files(join(root, 'dist/web')).map((path) => [`${folder}/webserver/${relative(join(root, 'dist/web'), path).replaceAll('\\', '/')}`, readFileSync(path)]),
  [`${folder}/webserver/web.config`, readFileSync(join(root, 'release/web.config'))],
];

/** Ein ZIP-Archiv (Deflate), wie es der Windows-Explorer öffnet. */
function zip(items) {
  const local = [];
  const central = [];
  let offset = 0;
  // DOS-Zeit: fester Zeitpunkt, damit gleiche Inhalte ein gleiches Archiv ergeben.
  const time = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const [name, data] of items) {
    const nameBytes = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // Dateinamen in UTF-8
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + packed.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(items.length, 8);
  end.writeUInt16LE(items.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

mkdirSync(join(root, 'dist/release'), { recursive: true });
const target = join(root, `dist/release/${folder}.zip`);
writeFileSync(target, zip(entries));
console.log(`${relative(root, target)}: ${entries.length} Dateien`);
