// v-prog.js — Programmer: select fixtures, set attributes, and record the result as groups, palettes and cues.
import { store } from './store.js';
import { GROUPS, modeOf, mixOf, getDef } from './library.js';
import { h, fill, btn, select, dialog, textInput, toast, pct, hsv } from './ui.js';

const KINDS = { I: 'Intensity palettes', P: 'Position palettes', C: 'Colour palettes', B: 'Beam palettes' };
const SWATCHES = [[255, 255, 255], [255, 0, 0], [255, 110, 0], [255, 220, 0], [0, 255, 0], [0, 255, 200], [0, 110, 255], [0, 0, 255], [150, 0, 255], [255, 0, 200], [255, 150, 170], [255, 190, 120]];

export function mountProg(app, root) {
  const E = app.engine;
  let grp = 'I', dragging = null;
  const tiles = h('div', { class: 'tiles' }), groups = h('div', { class: 'pool' }), pools = {}, attrs = h('div'), tabs = h('div', { class: 'gtabs' });
  for (const k of Object.keys(KINDS)) pools[k] = h('div', { class: 'pool' });
  const fanIn = h('input', { type: 'range', min: 0, max: 127, value: 0, style: 'width:110px', oninput: e => { E.fan = +e.target.value; fanV.textContent = E.fan ? '±' + E.fan : 'off'; } }), fanV = h('b', null, 'off');
  const hlBtn = btn('Highlight', () => { E.highlight = !E.highlight; hlBtn.classList.toggle('on', E.highlight); }, '', 'Selected fixtures at full intensity while you focus them (H)');

  /* ── fixtures ── */
  const fixtures = () => store.show.fixtures.slice().sort((a, b) => a.no - b.no);
  function step(d) { const f = fixtures(); if (!f.length) return; const i = f.findIndex(x => x.id === E.sel[E.sel.length - 1]); E.select([f[(i + d + f.length) % f.length].id]); }
  function drawTiles() {
    fill(tiles, fixtures().map(f => h('div', { class: 'tile', dataset: { id: f.id }, title: `${f.name} · ${getDef(f.def)?.model || f.def} · U${f.universe + 1}.${String(f.address).padStart(3, '0')}`,
      onclick: e => (e.ctrlKey || e.shiftKey ? E.toggleSel(f.id) : E.select([f.id], false)) },
      h('span', { class: 'no' }, f.no), h('i', { class: 'sw' }), h('div', { class: 'nm' }, f.name), h('div', { class: 'lv' }, h('i')))),
      !store.show.fixtures.length && h('p', { class: 'note' }, 'No fixtures yet — patch some in the Patch tab, or load an example from the top bar.'));
    markSel();
  }
  function markSel() {
    for (const t of tiles.children) if (t.dataset.id) { const id = +t.dataset.id; t.classList.toggle('sel', E.sel.includes(id)); t.classList.toggle('prog', !!E.prog[id]); }
    document.querySelector('#selInfo').textContent = E.sel.length ? `${E.sel.length} selected · ${Object.keys(E.prog).length} in programmer` : Object.keys(E.prog).length ? `${Object.keys(E.prog).length} in programmer` : '';
  }

  /* ── pools ── */
  const edit = (title, item, list, extra) => dialog(title, body => fill(body, h('div', { class: 'form' }, h('span', null, 'Name'), textInput(item.name, v => { store.mark(); item.name = v; store.emit(list); }))), [
    ...(extra || []), ['Delete', () => { store.mark(); store.remove(list, item.id); store.emit(list); }, 'warn']]);
  function drawPools() {
    fill(groups, store.show.groups.map(g => h('div', { class: 'pitem k-G', title: 'Click: select · Ctrl-click: add to the selection · right-click: edit',
      onclick: e => E.select(g.fixtures, e.ctrlKey || e.shiftKey), oncontextmenu: e => { e.preventDefault(); edit('Group', g, 'groups', [['Update from selection', () => { store.mark(); g.fixtures = [...E.sel]; store.emit('groups'); }]]); } }, `${g.name} (${g.fixtures.length})`)),
      h('div', { class: 'pitem add', title: 'Record the selection as a group', onclick: () => { if (!E.sel.length) return toast('Select fixtures first', true); store.mark(); store.show.groups.push({ id: store.id(), name: 'Group ' + (store.show.groups.length + 1), fixtures: [...E.sel] }); store.emit('groups'); } }, '+'));
    for (const k of Object.keys(KINDS)) fill(pools[k], store.show.palettes.filter(p => p.kind === k).map(p => h('div', { class: 'pitem k-' + k, title: 'Click: apply to the selection · right-click: edit',
      onclick: () => { if (!E.sel.length) return toast('Select fixtures first', true); E.applyPalette(p); },
      oncontextmenu: e => { e.preventDefault(); edit('Palette', p, 'palettes', [['Update from programmer', () => { const v = E.progValues(k); if (!Object.keys(v).length) return toast('Nothing of this kind in the programmer', true), false; store.mark(); Object.assign(p.values, v); store.emit('palettes'); }]]); } }, p.name)),
      h('div', { class: 'pitem add', title: `Record the programmer's ${GROUPS[k].toLowerCase()} values as a palette`, onclick: () => { const v = E.progValues(k); if (!Object.keys(v).length) return toast(`No ${GROUPS[k].toLowerCase()} values in the programmer`, true);
        store.mark(); store.show.palettes.push({ id: store.id(), name: `${GROUPS[k]} ${store.show.palettes.filter(p => p.kind === k).length + 1}`, kind: k, values: v }); store.emit('palettes'); } }, '+'));
  }

  /* ── attributes of the selection ── */
  const selChans = () => { const map = new Map();          // base → { c, ids }
    for (const id of E.sel) { const e = E.fx.get(id); if (!e) continue; for (const c of e.m.channels) if (c.grp === grp && !c.fineOf && !map.has(c.base)) map.set(c.base, { c, id }); }
    return [...map.values()]; };
  function drawAttrs() {
    fill(tabs, Object.entries(GROUPS).map(([k, n]) => btn(n, () => { grp = k; drawAttrs(); }, `g-${k} ${grp === k ? 'on' : ''}`)));
    if (!E.sel.length) return fill(attrs, h('p', { class: 'note' }, 'Select fixtures (click, Ctrl-click, a group, or the command line: “1 thru 6”). Their attributes appear here.'));
    const list = selChans(), kids = [];
    if (grp === 'P' && list.some(x => x.c.base === 'pan')) {
      const dot = h('i'), pad = h('div', { class: 'xy', title: 'Drag: pan (horizontal) and tilt (vertical)' }, dot);
      const move = e => { const r = pad.getBoundingClientRect(), x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); E.set('pan', x * 255); E.set('tilt', (1 - y) * 255, 0); };
      pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); dragging = 'xy'; move(e); }); pad.addEventListener('pointermove', e => { if (dragging === 'xy') move(e); }); pad.addEventListener('pointerup', () => { dragging = null; });
      pad._dot = dot; kids.push(pad);
    }
    if (grp === 'C' && E.sel.some(id => mixOf(E.fx.get(id).f).length)) {
      const hue = h('div', { class: 'hue', title: 'Drag: hue of the colour mixing (RGB or CMY)' });
      const pick = e => { const r = hue.getBoundingClientRect(); E.setColour(hsv(Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width)), 1, 1)); };
      hue.addEventListener('pointerdown', e => { hue.setPointerCapture(e.pointerId); dragging = 'hue'; pick(e); }); hue.addEventListener('pointermove', e => { if (dragging === 'hue') pick(e); }); hue.addEventListener('pointerup', () => { dragging = null; });
      kids.push(hue, h('div', { class: 'swatches' }, SWATCHES.map(c => h('i', { style: `background:rgb(${c})`, onclick: () => E.setColour(c) }))));
    }
    for (const { c, id } of list) {
      const sl = h('input', { type: 'range', min: 0, max: 255, step: 1, value: E.value(id, c.key), oninput: e => { E.set(c.base, +e.target.value); }, onpointerdown: () => { dragging = c.base; }, onpointerup: () => { dragging = null; } });
      const row = h('div', { class: 'attr', dataset: { base: c.base, key: c.key, id } }, h('span', { class: 'nm', title: c.name }, c.name.replace(/\s*\d+$/, '')), sl, h('span', { class: 'v' }), h('span', { class: 'x', title: 'Release from the programmer', onclick: () => E.release(c.base) }, '×'));
      kids.push(row);
      if (c.ranges.length > 1) kids.push(h('div', { class: 'attr' }, select([['', '— functions —'], ...c.ranges.map(r => [r[0] === r[1] ? r[0] : Math.round((r[0] + Math.min(r[1], r[0] + 6)) / 2), `${String(r[0]).padStart(3, '0')}–${String(r[1]).padStart(3, '0')}  ${r[2]}`])], '', v => { if (v !== '') E.set(c.base, +v, 0); })));
    }
    if (!list.length && kids.length === 0) kids.push(h('p', { class: 'note' }, `The selected fixtures have no ${GROUPS[grp].toLowerCase()} channels.`));
    fill(attrs, kids); liveAttrs();
  }
  function liveAttrs() {
    for (const row of attrs.querySelectorAll('.attr[data-key]')) { const id = +row.dataset.id, key = row.dataset.key, v = E.value(id, key);
      row.classList.toggle('in', E.inProg(id, key)); row.querySelector('.v').textContent = Math.round(v);
      const sl = row.querySelector('input'); if (dragging !== row.dataset.base) sl.value = v; }
    const pad = attrs.querySelector('.xy'); if (pad && E.sel.length) { const e = E.fx.get(E.sel[0]), pk = e.m.channels.find(c => c.base === 'pan'), tk = e.m.channels.find(c => c.base === 'tilt');
      if (pk && tk) { pad._dot.style.left = E.value(E.sel[0], pk.key) / 2.55 + '%'; pad._dot.style.top = 100 - E.value(E.sel[0], tk.key) / 2.55 + '%'; } }
  }

  /* ── record ── */
  function recordCue() {
    const vals = E.progValues(); if (!Object.keys(vals).length) return toast('The programmer is empty', true);
    const S = store.show; let cl = store.get('cuelists', app.curList) || S.cuelists[0];
    store.mark();
    if (!cl) { cl = { id: store.id(), name: 'Main', tracking: true, loop: true, cues: [] }; S.cuelists.push(cl); }
    app.curList = cl.id;
    const no = cl.cues.length ? Math.floor(cl.cues[cl.cues.length - 1].no) + 1 : 1;
    cl.cues.push({ id: store.id(), no, name: 'Cue ' + no, values: vals, fx: [], fade: 2000, delay: 0, trig: 'go', wait: 0, tc: null });
    if (!S.playbacks.some(p => p.kind === 'cuelist' && p.ref === cl.id)) { const used = new Set(S.playbacks.filter(p => p.page === 0).map(p => p.slot)); let slot = 0; while (used.has(slot)) slot++; if (slot < 10) S.playbacks.push({ id: store.id(), page: 0, slot, name: cl.name, kind: 'cuelist', ref: cl.id }); }
    store.emit('cues'); toast(`Recorded cue ${no} in “${cl.name}”`);
  }

  root.append(h('div', { class: 'prog' },
    h('div', null,
      h('div', { class: 'box' }, h('h4', null, 'Fixtures', h('span', { class: 'spacer' }),
        btn('All', () => E.select(fixtures().map(f => f.id)), 'small'), btn('None', () => E.select([]), 'small'), btn('Odd', () => E.select(fixtures().filter((f, i) => i % 2 === 0).map(f => f.id)), 'small'), btn('Even', () => E.select(fixtures().filter((f, i) => i % 2 === 1).map(f => f.id)), 'small'),
        btn('Invert', () => E.select(fixtures().filter(f => !E.sel.includes(f.id)).map(f => f.id)), 'small'), btn('◀', () => step(-1), 'small', 'Previous fixture'), btn('▶', () => step(1), 'small', 'Next fixture')), tiles),
      h('div', { class: 'box' }, h('h4', null, 'Groups'), groups),
      Object.entries(KINDS).map(([k, n]) => h('div', { class: 'box' }, h('h4', null, n), pools[k]))),
    h('div', null,
      h('div', { class: 'box' }, h('h4', null, 'Programmer'),
        h('div', { class: 'row' }, btn('Clear', () => E.clear(), 'acc', 'First press: empty the programmer · second press: clear the selection (Esc)'), hlBtn,
          btn('Record cue', recordCue, 'acc', 'Store the programmer as the next cue of the current cue list (R)'), btn('Full', () => E.set('dimmer', 255, 0) || E.set('dim', 255, 0), '', 'Selected fixtures at full (F)'), btn('Zero', () => { E.set('dimmer', 0, 0); E.set('dim', 0, 0); }, '', 'Selected fixtures at zero')),
        h('div', { class: 'row' }, h('span', { title: 'Spread the next values across the selection, first fixture low, last fixture high' }, 'Fan'), fanIn, fanV),
        tabs, attrs))));

  E.on(ev => { if (ev === 'sel') { markSel(); drawAttrs(); } if (ev === 'prog') { markSel(); liveAttrs(); } });
  return {
    show() { drawTiles(); drawPools(); drawAttrs(); },
    reload() { drawTiles(); drawPools(); drawAttrs(); },
    recordCue,
    fast() {
      for (const t of tiles.children) { if (!t.dataset.id) continue; const e = E.fx.get(+t.dataset.id); if (!e) continue; const o = E.out[e.f.universe]; let lv = -1, rgb = null;
        const m = e.m, ix = k => (m.index[k] != null ? o[e.base + m.index[k]] : null);
        for (const c of m.channels) if (c.grp === 'I' && !c.fineOf) lv = Math.max(lv, o[e.base + m.index[c.key]]);
        const mix = mixOf(e.f)[0]; if (mix) rgb = mix.type === 'rgb' ? [ix(mix.r), ix(mix.g), ix(mix.b)] : [255 - ix(mix.cyan), 255 - ix(mix.magenta), 255 - ix(mix.yellow)];
        const k = lv < 0 ? 1 : lv / 255; t.querySelector('.lv i').style.width = (lv < 0 ? 0 : lv / 2.55) + '%';
        t.querySelector('.sw').style.background = rgb ? `rgb(${rgb.map(v => Math.round(v * k))})` : `rgb(${Math.round(255 * k)},${Math.round(240 * k)},${Math.round(200 * k)})`; }
      if (!dragging) liveAttrs();
    },
  };
}
