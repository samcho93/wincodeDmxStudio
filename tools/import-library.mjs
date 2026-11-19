#!/usr/bin/env node
/* =====================================================================
 *  import-library.mjs — bring the simulator's fixture library into the studio.
 *    node tools/import-library.mjs <path to wincodeMovingHead>
 *  Copies, unchanged:
 *    web/js/library/ofl.js, gdtf.js   → web/js/lib/          the importers (Open Fixture Library JSON, GDTF)
 *    web/js/library/ofl-data/         → web/fixtures/ofl/    the bundled Open Fixture Library (index + one file per manufacturer)
 *  Both sides must read a fixture the same way: the studio patches it, the 3D stage simulates it, and the ids, modes
 *  and channel order have to agree. So these files are never edited here — change them in the simulator and run this again.
 * ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = process.argv[2] && path.join(path.resolve(process.argv[2]), 'web', 'js', 'library');
if (!SRC || !fs.existsSync(path.join(SRC, 'ofl-data', 'index.json'))) { console.error('usage: node tools/import-library.mjs <path to wincodeMovingHead>'); process.exit(2); }
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const NOTE = '// COPIED from the Wincode simulator (web/js/library/) by tools/import-library.mjs — do not edit here.\n';
fs.mkdirSync(path.join(WEB, 'js', 'lib'), { recursive: true });
for (const f of ['ofl.js', 'gdtf.js']) fs.writeFileSync(path.join(WEB, 'js', 'lib', f), NOTE + fs.readFileSync(path.join(SRC, f), 'utf8'));
const out = path.join(WEB, 'fixtures', 'ofl'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
let n = 0, size = 0; for (const f of fs.readdirSync(path.join(SRC, 'ofl-data'))) { fs.copyFileSync(path.join(SRC, 'ofl-data', f), path.join(out, f)); n++; size += fs.statSync(path.join(out, f)).size; }
const count = JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf8')).length;
console.log(`importers → web/js/lib/ · ${count} fixtures in ${n} files (${(size / 1e6).toFixed(1)} MB) → web/fixtures/ofl/`);
