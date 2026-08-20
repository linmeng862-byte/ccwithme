// Sync stickers from Chat-C Zeabur server to local
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const API = 'https://zzclaude.zeabur.app';
const DIR = 'C:\\Users\\123\\Chat-C\\data\\stickers';

mkdirSync(DIR, { recursive: true });

const res = await fetch(`${API}/api/stickers`);
const stickers = await res.json();

let downloaded = 0;
for (const s of stickers) {
  const dest = join(DIR, s.filename);
  if (!existsSync(dest)) {
    const img = await fetch(`${API}/stickers/${s.filename}`);
    writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
    console.log('Downloaded:', s.filename);
    downloaded++;
  } else {
    console.log('Exists:', s.filename);
  }
}
console.log(`Done. ${downloaded} new, ${stickers.length - downloaded} already local.`);
