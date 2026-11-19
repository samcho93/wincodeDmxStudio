// libimport.js — fixtures from a library as studio profiles.
//  The fixture descriptions are the simulator's (see lib/ofl.js, lib/gdtf.js and tools/import-library.mjs): the bundled
//  Open Fixture Library and files the user imports (GDTF, Open Fixture Library JSON). A description becomes a profile
//  here (profileFromDesc) so that the programmer's attribute groups, colour mixing, effects and range lists work on it;
//  the description itself travels with the show (show.library) and with the stage hand-over, where the simulator
//  builds the 3D fixture from the same data.
import { fromOFL } from './lib/ofl.js';
import { fromGDTF } from './lib/gdtf.js';

const BASE = new URL('../fixtures/ofl/', import.meta.url), LS = 'wdx.library.user.v1';
let indexP = null; const packs = new Map();
/** [{ id, m: manufacturer, n: name, c: categories, k: { mode: channels }, f: ['moving', 'rgb', 'gobo', 'prism'] }] */
export const oflIndex = () => indexP || (indexP = fetch(new URL('index.json', BASE)).then(r => { if (!r.ok) throw new Error('The bundled fixture library is missing'); return r.json(); }).catch(e => { indexP = null; throw e; }));
export async function oflDesc(id) {
  const [, man, key] = id.split('/');
  if (!packs.has(man)) packs.set(man, fetch(new URL(man + '.json', BASE)).then(r => r.json()));
  const D = (await packs.get(man))[key]; if (!D) throw new Error('Fixture not found in the library: ' + id); return D;
}
export const userLibrary = {
  all() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } },
  add(D) { const all = this.all(); all[D.id] = D; try { localStorage.setItem(LS, JSON.stringify(all)); } catch (e) {} },
  remove(id) { const all = this.all(); delete all[id]; try { localStorage.setItem(LS, JSON.stringify(all)); } catch (e) {} },
};
/** a .gdtf file or an Open Fixture Library .json file → description (same ids as the simulator gives them) */
export async function importFile(file) {
  if (/\.gdtf$/i.test(file.name)) return fromGDTF(file);
  const D = fromOFL(JSON.parse(await file.text()), 'file', file.name.replace(/\.json$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'), 'Imported'); D.id = D.id.replace(/^ofl\//, 'user/'); return D;
}

// capability type → the base name the studio's features look for, and the attribute group
const EMIT = { Red: 'r', Green: 'g', Blue: 'b', White: 'w', 'Warm White': 'ww', 'Cold White': 'cw', Amber: 'a', UV: 'uv', Lime: 'lime', Indigo: 'indigo', Cyan: 'cyan', Magenta: 'magenta', Yellow: 'yellow' };
const BASES = { Intensity: ['dimmer', 'I'], Pan: ['pan', 'P'], Tilt: ['tilt', 'P'], PanContinuous: ['panRot', 'P'], PanTiltSpeed: ['ptSpeed', 'P'], Shutter: ['strobe', 'B'], Zoom: ['zoom', 'B'], Focus: ['focus', 'B'], Frost: ['frost', 'B'],
  Prism: ['prism', 'B'], PrismRotation: ['prismRot', 'B'], SlotRotation: ['goboRot', 'B'], WheelShake: ['goboShake', 'B'], Preset: ['colorMacro', 'C'] };

export function profileFromDesc(D) {
  const CH = D.channels, keys = Object.keys(CH), caps = k => (CH[k] && CH[k].caps) || [], all = type => keys.flatMap(k => caps(k).filter(c => c.type === type));
  const colorWheel = (D.wheels || []).findIndex(w => w.slots.some(s => s.type === 'Color')), fineOf = {}; for (const k of keys) if (CH[k].fine) fineOf[CH[k].fine] = k;
  const span = type => all(type).reduce((m, c) => Math.max(m, Math.abs(c.e - c.s)), 0), zooms = all('Zoom').flatMap(c => [c.s, c.e]), lens = D.lens || [20, 20];
  /** the kind of a channel: what most of its DMX range does (a channel that is mostly "no function" still counts by its function) */
  const kind = k => { const w = {}; for (const c of caps(k)) if (c.type !== 'Other') w[c.type] = (w[c.type] || 0) + c.b - c.a + 1; return Object.keys(w).sort((a, b) => w[b] - w[a])[0] || 'Other'; };
  const modes = {};
  for (const m of D.modes) {
    const seen = {}, chans = [];
    m.channels.forEach((key, i) => {
      if (key == null) return chans.push({ key: `_${i}`, name: 'Not used', base: `_${i}`, head: 0, grp: 'X', def: 0, ranges: [] });
      const c = CH[key], of = fineOf[key], src = of || key, t = kind(src), cs = caps(src), first = cs.find(x => x.type === t) || {};
      let base, grp;
      if (t === 'ColorIntensity') { base = EMIT[first.color] || 'colour'; grp = 'C'; }
      else if (t === 'WheelSlot' || t === 'WheelRotation') { base = first.wheel === colorWheel ? 'color' : 'gobo'; grp = first.wheel === colorWheel ? 'C' : 'B'; }
      else if (BASES[t]) [base, grp] = BASES[t]; else { base = src; grp = 'X'; }
      // several channels of one kind (pixels of a bar, a second gobo wheel): the first keeps the plain name, colours count as heads
      const n = (seen[base + (of ? 'F' : '')] = (seen[base + (of ? 'F' : '')] || 0) + 1);
      let head = 0; if (n > 1) { if (grp === 'C' && EMIT[first.color]) head = n; else base = base + n; }
      if (grp === 'C' && EMIT[first.color] && n === 1 && m.channels.filter(k2 => k2 && !fineOf[k2] && kind(k2) === 'ColorIntensity' && (caps(k2).find(x => x.type === 'ColorIntensity') || {}).color === first.color).length > 1) head = 1;
      const open = caps(key).find(x => x.type === 'Shutter' && x.fx === 'open');
      const ch = { key, name: c.name, base: of ? base + 'Fine' : base, head, grp, def: t === 'Pan' || t === 'Tilt' ? (of ? 0 : 128) : open ? Math.round((open.a + open.b) / 2) : c.def | 0,
        ranges: caps(key).length > 1 ? caps(key).map(x => [x.a, x.b, x.label]) : [] };
      if (of) ch.fineOf = of; else if (c.fine && m.channels.includes(c.fine)) ch.fine = c.fine;
      chans.push(ch);
    });
    modes[m.id] = { label: m.label, channels: chans };
  }
  const longest = D.modes.reduce((a, m) => (m.channels.length > a.channels.length ? m : a), D.modes[0]);
  return { id: D.id, manufacturer: D.manufacturer, model: D.name, short: D.name, sim: D.id, library: D.source, heads: 1, defaultMode: longest.id, modes,
    zoom: zooms.length ? [Math.min(...zooms), Math.max(...zooms)] : lens, pan: span('Pan'), tilt: span('Tilt') };
}
