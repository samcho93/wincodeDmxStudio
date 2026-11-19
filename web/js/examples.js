// examples.js — ready-made shows for the Wincode fixtures.
//  Built in code from the fixture profiles (never from channel numbers), so they stay right when a profile changes:
//  a colour is looked up by name in the colour wheel's range table or mixed with RGB / CMY, "narrow zoom" is whichever
//  end of the zoom channel the profile says is narrow, and so on.
import { blankShow } from './store.js';
import { getDef, colourValues, mixOf } from './library.js';

const RGB = { White: [255, 255, 255], Red: [255, 0, 0], Amber: [255, 120, 0], Yellow: [255, 220, 0], Green: [0, 255, 0], Cyan: [0, 255, 220], Blue: [0, 40, 255], Magenta: [255, 0, 200] };
const WHEEL = { White: /^(white|open)/i, Red: /^(deep )?red$/i, Amber: /^orange$/i, Yellow: /^yellow$/i, Green: /^(light |dark )?green$/i, Cyan: /^cyan$|^light green$/i, Blue: /^(deep )?blue$/i, Magenta: /^magenta$/i };

function build(name, rig) {
  const S = blankShow(); S.name = name; let id = 1; const nid = () => id++;
  /* ── patch ── */
  let addr = 1, uni = 0, no = 1;
  for (const r of rig) for (let i = 0; i < (r.count || 1); i++) {
    const d = getDef(r.def), mode = r.mode || d.defaultMode, size = d.modes[mode].channels.length;
    if (r.address) addr = r.address + i * size;
    if (addr + size - 1 > 512) { uni++; addr = 1; S.universes.push({ name: `Universe ${uni + 1}`, out: 'cable', outUniverse: uni, host: '127.0.0.1' }); }
    S.fixtures.push({ id: nid(), no: no++, name: (r.name || d.short) + ((r.count || 1) > 1 ? ' ' + (i + 1) : ''), def: r.def, mode, universe: uni, address: addr, x: 0, y: 0 }); addr += size;
  }
  const F = S.fixtures, chans = f => getDef(f.def).modes[f.mode].channels;
  const movers = F.filter(f => getDef(f.def).heads === 1 && chans(f).some(c => c.base === 'pan')), bars = F.filter(f => getDef(f.def).heads > 1), all = F.map(f => f.id);
  /* ── value helpers: each returns { key: value } for one fixture ── */
  const setBase = (f, base, v) => Object.fromEntries(chans(f).filter(c => c.base === base).map(c => [c.key, typeof v === 'function' ? v(c) : v]));
  const pick = (c, re) => { const r = c.ranges.find(x => re.test(x[2])); return r ? Math.round(r[0] + Math.min(r[1] - r[0], 4) / 2) : null; };
  const level = (f, p) => ({ ...setBase(f, 'dimmer', p * 2.55), ...setBase(f, 'dim', p * 2.55) });
  const colour = (f, nm) => { if (mixOf(f).length) return colourValues(f, RGB[nm]);
    const c = chans(f).find(x => x.base === 'color'); const v = c && pick(c, WHEEL[nm]); return v == null ? {} : { [c.key]: v }; };
  const zoom = (f, wide) => setBase(f, 'zoom', c => { const m = c.ranges[0] && /(-?[\d.]+)°.*?(-?[\d.]+)°/.exec(c.ranges[0][2]), narrowLow = !m || +m[1] < +m[2]; return (wide ? narrowLow : !narrowLow) ? 235 : 20; });
  const beam = (f, kind) => { const o = { ...zoom(f, kind === 'wide'), ...setBase(f, 'gobo', 0), ...setBase(f, 'rotGobo', 0), ...setBase(f, 'prism', 0), ...setBase(f, 'prism1', 0), ...setBase(f, 'prism2', 0), ...setBase(f, 'frost', 0) };
    const first = (base, re) => { const c = chans(f).find(x => x.base === base); const v = c && pick(c, re); if (v != null) o[c.key] = v; return v != null; };
    if (kind === 'wide') first('frost', /frost in|medium|light/i) || Object.assign(o, setBase(f, 'frost', 200));
    if (kind === 'gobo') first('rotGobo', /^(?!open)(?!.*shake).+/i) || first('gobo', /^(?!open)(?!.*shake).+/i);
    if (kind === 'prism') { first('prism', /on/i) || first('prism1', /rotate/i); Object.assign(o, setBase(f, 'prismRot', 215), setBase(f, 'prism1Rot', 90)); }
    return o; };
  const pos = (f, i, n, kind) => { const u = n > 1 ? (i / (n - 1)) * 2 - 1 : 0, bar = getDef(f.def).heads > 1;
    const P = { centre: [128, bar ? 128 : 100], fan: [128 + u * (bar ? 0 : 38), bar ? 128 : 96], front: [128, bar ? 150 : 84], cross: [128 - u * (bar ? 0 : 30), bar ? 110 : 108] }[kind];
    return { ...setBase(f, 'pan', P[0]), ...setBase(f, 'tilt', bar && kind === 'fan' ? c => 128 + ((c.head - 3) / 2) * 34 : P[1]) }; };
  const every = fn => Object.fromEntries(F.map((f, i) => [f.id, fn(f, i, F.length)]).filter(e => Object.keys(e[1]).length));
  const merge = (...parts) => { const out = {}; for (const p of parts) for (const [k, v] of Object.entries(p)) Object.assign(out[k] || (out[k] = {}), v); return out; };

  /* ── groups ── */
  const group = (nm, ids) => { if (ids.length) S.groups.push({ id: nid(), name: nm, fixtures: ids }); };
  group('All', all); if (movers.length && bars.length) { group('Moving heads', movers.map(f => f.id)); group('Bars', bars.map(f => f.id)); }
  const byDef = new Map(); for (const f of F) (byDef.get(f.def) || byDef.set(f.def, []).get(f.def)).push(f.id);
  if (byDef.size > 1) for (const [d, ids] of byDef) group(getDef(d).short, ids);
  if (F.length > 3) { group('Odd', all.filter((_, i) => i % 2 === 0)); group('Even', all.filter((_, i) => i % 2 === 1)); }

  /* ── palettes ── */
  const pal = (kind, nm, values) => { if (Object.keys(values).length) S.palettes.push({ id: nid(), name: nm, kind, values }); return values; };
  const I = { full: pal('I', 'Full', every(f => level(f, 100))), half: pal('I', '50 %', every(f => level(f, 50))), zero: pal('I', 'Zero', every(f => level(f, 0))) };
  const Pp = Object.fromEntries([['centre', 'Centre'], ['fan', 'Fan out'], ['front', 'Front'], ['cross', 'Cross']].map(([k, nm]) => [k, pal('P', nm, every((f, i, n) => pos(f, i, n, k)))]));
  const C = Object.fromEntries(Object.keys(RGB).map(nm => [nm, pal('C', nm, every(f => colour(f, nm)))]));
  const B = Object.fromEntries([['tight', 'Tight beam'], ['wide', 'Wide wash'], ['gobo', 'Gobo'], ['prism', 'Prism']].map(([k, nm]) => [k, pal('B', nm, every(f => beam(f, k)))]));

  /* ── effects ── */
  const fx = (nm, o) => { const e = { id: nid(), name: nm, wave: 'sine', rate: 30, size: 100, center: 127, spread: 360, dir: 'forward', ...o }; if (e.fixtures.length) S.effects.push(e); return e; };
  const eCircle = fx('Circle', { type: 'circle', rate: 14, size: 22, spread: 180, fixtures: movers.map(f => f.id) });
  const eTilt = fx('Tilt wave', { type: 'tilt', rate: 20, size: 26, spread: 360, fixtures: (bars.length ? bars : movers).map(f => f.id) });
  const eChase = fx('Dimmer chase', { type: 'dimmer', wave: 'chase', rate: 50, size: 127, center: 127, spread: 360, fixtures: (bars.length ? bars : F).map(f => f.id) });
  const eRain = fx('Rainbow', { type: 'rainbow', rate: 10, spread: 360, fixtures: F.filter(f => mixOf(f).length).map(f => f.id) });
  const ePulse = fx('Dimmer breathe', { type: 'dimmer', wave: 'sine', rate: 24, size: 90, center: 160, spread: 0, fixtures: all });
  const has = e => S.effects.includes(e);

  /* ── cue lists ── */
  const cue = (cl, nm, values, o = {}) => cl.cues.push({ id: nid(), no: cl.cues.length + 1, name: nm, values, fx: [], fade: 2000, delay: 0, trig: 'go', wait: 0, tc: null, ...o });
  const main = { id: nid(), name: 'Main show', tracking: true, loop: true, cues: [] }; S.cuelists.push(main);
  cue(main, 'Open white', merge(I.full, Pp.centre, C.White, B.tight), { fade: 2500 });
  cue(main, 'Red fan', merge(C.Red, Pp.fan), { fade: 3000 });
  cue(main, 'Blue wide wash', merge(C.Blue, B.wide, Pp.front));
  cue(main, 'Amber gobos', merge(C.Amber, B.gobo, Pp.cross), { fx: has(eCircle) ? [eCircle.id] : [] });
  cue(main, 'Magenta prism', merge(C.Magenta, B.prism, Pp.centre), { fx: has(eTilt) ? [eTilt.id] : [] });
  cue(main, 'Green tight, half', merge(C.Green, B.tight, I.half, Pp.fan));
  cue(main, 'Fade out', merge(I.zero), { fade: 4000 });
  const chase = { id: nid(), name: 'Colour chase', tracking: true, loop: true, cues: [] }; S.cuelists.push(chase);
  cue(chase, 'Full', merge(I.full, B.tight, Pp.fan, C.Red), { fade: 300 });
  for (const nm of ['Yellow', 'Green', 'Cyan', 'Blue', 'Magenta', 'Red']) cue(chase, nm, merge(C[nm]), { fade: 400, trig: 'wait', wait: 600 });
  const timed = { id: nid(), name: 'Timecode demo', tracking: true, loop: false, cues: [] }; S.cuelists.push(timed);
  [['Start', merge(I.full, Pp.centre, C.Blue, B.tight), 0], ['Fan red', merge(C.Red, Pp.fan), 4000], ['Wide amber', merge(C.Amber, B.wide), 8000], ['Prism', merge(C.Magenta, B.prism), 12000], ['Out', merge(I.zero), 16000]].forEach(([nm, v, tc]) => cue(timed, nm, v, { tc, fade: 1500 }));

  /* ── playbacks, page 1 ── */
  let slot = 0; const play = (kind, src) => { if (src && slot < 10) S.playbacks.push({ id: nid(), page: 0, slot: slot++, name: src.name, kind, ref: src.id }); };
  play('cuelist', main); play('cuelist', chase); play('cuelist', timed);
  for (const e of [eCircle, eTilt, eChase, eRain, ePulse]) if (has(e)) play('effect', e);
  if (S.groups[1]) play('group', S.groups[1]);
  S.nextId = id; return S;
}

const W = id => 'wincode/' + id;
export const EXAMPLES = [
  { id: 'showcase', name: 'Wincode showcase — all five models', about: '2 × 250W BSW, 500W Frame, ApexPointe 420, Mega480 and AquaVortex TB5: the patch of the simulator\'s “All models” stage',
    build: () => build('Wincode showcase', [{ def: W('lm1012b'), mode: 'EXT', count: 2, name: 'BSW', address: 1 }, { def: W('lm500wf'), name: 'Frame', address: 41 }, { def: W('tb5'), mode: '85CH', name: 'TB5', address: 101 }, { def: W('apexpointe420'), name: 'ApexPointe', address: 201 }, { def: W('mega480'), mode: '39CH', name: 'Mega480', address: 241 }]) },
  { id: 'bsw', name: '250W BSW × 4', about: 'four WOP-LM1012B in 20CH mode', build: () => build('250W BSW × 4', [{ def: W('lm1012b'), mode: 'EXT', count: 4, name: 'BSW' }]) },
  { id: 'frame', name: '500W Frame × 4', about: 'four WOP-LM500WF', build: () => build('500W Frame × 4', [{ def: W('lm500wf'), count: 4, name: 'Frame' }]) },
  { id: 'apex', name: 'ApexPointe 420 × 4', about: 'four ApexPointe 420 in 39CH mode', build: () => build('ApexPointe 420 × 4', [{ def: W('apexpointe420'), count: 4, name: 'Apex' }]) },
  { id: 'mega', name: 'Mega480 × 4', about: 'four Mega480 in 39CH mode', build: () => build('Mega480 × 4', [{ def: W('mega480'), mode: '39CH', count: 4, name: 'Mega' }]) },
  { id: 'tb5', name: 'AquaVortex TB5 × 2', about: 'two TB5 bars in 85CH mode (10 heads)', build: () => build('AquaVortex TB5 × 2', [{ def: W('tb5'), mode: '85CH', count: 2, name: 'TB5' }]) },
  { id: 'big', name: 'Large rig — 48 fixtures, 5 universes', about: '16 Mega480, 16 ApexPointe 420, 8 TB5 and 8 BSW: 2088 channels across five universes',
    build: () => build('Large rig', [{ def: W('mega480'), mode: '39CH', count: 16, name: 'Mega' }, { def: W('apexpointe420'), count: 16, name: 'Apex' }, { def: W('tb5'), mode: '85CH', count: 8, name: 'TB5' }, { def: W('lm1012b'), mode: 'EXT', count: 8, name: 'BSW' }]) },
];
