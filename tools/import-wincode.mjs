#!/usr/bin/env node
/* =====================================================================
 *  import-wincode.mjs — build fixture profiles from the Wincode simulator's model definitions.
 *    node tools/import-wincode.mjs <path to wincodeMovingHead/web/js/models/index.js>
 *  Writes web/fixtures/wincode.json. A profile is plain data, so the studio does not depend on the simulator's code:
 *    { id, manufacturer, model, sim, heads, defaultMode, modes: { id: { label, channels: [channel] } } }
 *    channel = { key, name, base, head, grp, attr, def, fine?, ranges: [[from, to, label]] }
 *  grp  I intensity · P position · C colour · B beam · X control        (the programmer's attribute groups)
 *  def  the value the channel rests at when nothing controls it (shutter open, pan / tilt centred, …)
 *  ranges come from sampling the model's describe() over 0–255: consecutive values with the same kind of label are merged.
 * ===================================================================== */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const src = process.argv[2];
if (!src) { console.error('usage: node tools/import-wincode.mjs <…/web/js/models/index.js>'); process.exit(2); }
const { LIST } = await import(pathToFileURL(path.resolve(src)).href);
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', 'web', 'fixtures', 'wincode.json');

const baseOf = key => { const m = /^rb\d_\d[rgb]$/.test(key) ? ['', 'rb'] : /^([a-zA-Z]+?)\d*$/.exec(key); return m ? m[1] : key; };
const headOf = key => { const m = /^(?:rb(\d)_\d[rgb]|[a-zA-Z]+?(\d+))$/.exec(key); return m ? +(m[1] || m[2]) : 0; };
const GRP = {
  I: ['dimmer', 'dimmerFine', 'dim', 'dimFine'],
  P: ['pan', 'panFine', 'tilt', 'tiltFine', 'ptSpeed', 'panCtrl'],
  C: ['r', 'g', 'b', 'w', 'l', 'a', 'uv', 'cyan', 'magenta', 'yellow', 'cto', 'color', 'colorFine', 'green', 'vColor', 'cmyMacro', 'colorTime', 'ringR', 'ringG', 'ringB', 'rb', 'ledColor', 'ledCto'],
  B: ['strobe', 'zoom', 'zoomFine', 'focus', 'focusFine', 'gobo', 'rotGobo', 'rotGoboFine', 'goboRot', 'goboRotFine', 'prism', 'prismRot', 'frost', 'iris', 'cutRot', 'cut',
    'ringMacro', 'macro', 'ringStrobe', 'fx', 'fxRot', 'fxPos', 'fxAnim', 'pattern', 'patternRot', 'shaper', 'shaperRot', 'hotspot'],
};
const grpOf = base => { if (/^prism\d?(Rot)?$/.test(base)) return 'B'; for (const [g, list] of Object.entries(GRP)) if (list.includes(base)) return g; return 'X'; };
// keys like prism1 / prism2Rot carry a wheel number, not a head number
const split = key => (/^prism\d(Rot)?$/.test(key) ? { base: key, head: 0 } : { base: baseOf(key), head: headOf(key) });

function ranges(M, key) {
  // a label with a unit (37%, 12.5Hz, 180°, 3200K, 2.5s) describes a continuous range: its numbers are ignored when merging.
  // Labels without one (Gobo 3, LEE 790 …) are distinct slots and merge only when identical.
  const norm = s => (/\d\s*(%|°|Hz|K|s)|^Linear /.test(String(s)) ? String(s).replace(/-?\d+(\.\d+)?/g, '#') : String(s)).replace(/\s+/g, ' ').trim();
  const out = [];
  for (let v = 0; v <= 255; v++) {
    let t; try { t = M.describe(key, v); } catch (e) { t = String(v); }
    const n = norm(t), last = out[out.length - 1];
    if (last && last.n === n) { last.to = v; last.last = String(t); } else out.push({ from: v, to: v, n, first: String(t), last: String(t) });
  }
  if (out.length === 256 && out.every(r => r.first === String(r.from))) return [];     // plain 0–255: no table needed
  if (out.length === 1 && /^#\s*%?$|^#$/.test(out[0].n)) return [];                    // plain 0–255 / percent: no table needed
  return out.map(r => [r.from, r.to, r.from === r.to || r.first === r.last ? r.first : `${r.first} … ${r.last}`]);
}

/** resting value of a channel */
function defaultOf(M, key, base, rs) {
  if (base === 'pan' || base === 'tilt') return 128;
  if (M.homeValues && key in M.homeValues && !/^(dimmer|dim)$/.test(base)) return M.homeValues[key];
  if (/strobe/i.test(base)) {                                   // shutter: open, so that raising the dimmer gives light
    const open = rs.filter(r => /open|^on\b/i.test(r[2]) && !/pulse|strobe|random/i.test(r[2])).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
    if (open) return open[0] === 0 ? 0 : Math.round((open[0] + Math.min(open[1], open[0] + 8)) / 2);
    return 255;
  }
  return 0;
}

const fixtures = LIST.map(M => {
  const modes = {};
  for (const m of Object.values(M.modes)) {
    const keys = new Set(m.channels);
    modes[m.id] = { label: m.label, channels: m.channels.map(key => {
      const { base, head } = split(key), rs = ranges(M, key), c = { key, name: M.ch[key], base, head, grp: grpOf(base), def: 0, ranges: rs };
      c.def = defaultOf(M, key, base, rs);
      if (/Fine$/.test(base)) c.fineOf = key.replace('Fine', ''); else if (keys.has(key.replace(/(\d*)$/, 'Fine$1'))) c.fine = key.replace(/(\d*)$/, 'Fine$1');
      return c;
    }) };
  }
  return { id: 'wincode/' + M.id, manufacturer: 'Wincode', model: `${M.name} (${M.code})`, short: M.name, sim: M.id, heads: M.heads || 1, defaultMode: M.defaultMode, modes,
    zoom: [M.spec.zoomMin, M.spec.zoomMax], pan: M.spec.panRange, tilt: M.spec.tiltRange };
});
fs.writeFileSync(OUT, JSON.stringify({ generated: 'tools/import-wincode.mjs', fixtures }) + '\n');
for (const f of fixtures) console.log(f.id.padEnd(24), Object.entries(f.modes).map(([id, m]) => `${id}:${m.channels.length}`).join(' '));
console.log('→', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' kB');
