// v-patch.js — Patch: which fixture sits at which DMX address, in which mode.
import { store, MAX_UNIVERSES } from './store.js';
import { library, getDef, modeOf, footprint, freeAddress } from './library.js';
import { h, fill, btn, select, numInput, textInput, dialog, toast } from './ui.js';

export function mountPatch(app, root) {
  const body = h('tbody'), info = h('span', { class: 'note' });
  const uniOpts = () => store.show.universes.map((u, i) => [i, `${i + 1} · ${u.name}`]);
  /** channels that two fixtures both use */
  function clashes() { const bad = new Set(), map = new Map();
    for (const f of store.show.fixtures) for (let i = 0; i < footprint(f); i++) { const k = f.universe * 1000 + f.address + i; if (map.has(k)) { bad.add(f.id); bad.add(map.get(k)); } else map.set(k, f.id); if (f.address + i > 512) bad.add(f.id); }
    return bad; }
  function draw() {
    const S = store.show, bad = clashes(), set = (f, k, v) => { store.mark(); f[k] = v; store.emit('patch'); };
    fill(body, S.fixtures.slice().sort((a, b) => a.universe - b.universe || a.address - b.address).map(f => { const d = getDef(f.def), n = footprint(f);
      return h('tr', { class: bad.has(f.id) ? 'sel' : '' },
        h('td', null, numInput(f.no, 1, 9999, v => { if (S.fixtures.some(x => x !== f && x.no === v)) return toast(`Fixture number ${v} is in use`, true), draw(); set(f, 'no', v); }, { style: 'width:60px' })),
        h('td', null, textInput(f.name, v => set(f, 'name', v))),
        h('td', null, d ? `${d.manufacturer} ${d.model}` : `? ${f.def}`),
        h('td', null, d ? select(Object.entries(d.modes).map(([id, m]) => [id, m.label]), f.mode, v => set(f, 'mode', v)) : ''),
        h('td', null, select(uniOpts(), f.universe, v => set(f, 'universe', +v))),
        h('td', null, numInput(f.address, 1, 512, v => set(f, 'address', v), { style: 'width:60px' })),
        h('td', null, `${String(f.address).padStart(3, '0')} – ${String(f.address + n - 1).padStart(3, '0')}  (${n})`, bad.has(f.id) && h('b', { style: 'color:var(--red)' }, '  overlap')),
        h('td', null, btn('✕', () => { store.mark(); store.remove('fixtures', f.id); for (const g of S.groups) g.fixtures = g.fixtures.filter(x => x !== f.id); store.emit('patch'); }, 'small', 'Remove from the patch')));
    }));
    const ch = S.fixtures.reduce((s, f) => s + footprint(f), 0);
    info.textContent = `${S.fixtures.length} fixtures · ${ch} channels of ${S.universes.length * 512} (${S.universes.length} universe${S.universes.length > 1 ? 's' : ''}, up to ${MAX_UNIVERSES})`;
  }
  function add() {
    const libs = library(); let def = libs[0], mode = def.defaultMode, qty = 1, uni = 0, addr = 0, name = '';
    dialog('Patch fixtures', b => { const redraw = () => fill(b, h('div', { class: 'form' },
      h('span', null, 'Fixture'), select(libs.map(d => [d.id, `${d.manufacturer} — ${d.model}`]), def.id, v => { def = getDef(v); mode = def.defaultMode; redraw(); }),
      h('span', null, 'Mode'), select(Object.entries(def.modes).map(([id, m]) => [id, `${m.label} (${m.channels.length} channels)`]), mode, v => { mode = v; }),
      h('span', null, 'Quantity'), numInput(qty, 1, 200, v => { qty = v; }),
      h('span', null, 'Universe'), select(uniOpts(), uni, v => { uni = +v; }),
      h('span', null, 'Start address'), h('div', null, numInput(addr, 0, 512, v => { addr = v; }), h('span', { class: 'note' }, '  0 = first free address')),
      h('span', null, 'Name'), textInput(name, v => { name = v; }, { placeholder: def.short || def.model }))); redraw(); },
    [['Patch', () => {
      const S = store.show, size = def.modes[mode].channels.length; store.mark();
      let no = S.fixtures.reduce((m, f) => Math.max(m, f.no), 0) + 1, a = addr, u = uni, done = 0;
      for (let i = 0; i < qty; i++) {
        const tmp = { def: def.id, mode };
        if (!a || a + size - 1 > 512) { a = freeAddress(u, size); while (!a && u + 1 < S.universes.length) { u++; a = freeAddress(u, size); } }
        if (!a) { if (S.universes.length >= MAX_UNIVERSES) break; S.universes.push({ name: `Universe ${S.universes.length + 1}`, out: 'none', outUniverse: S.universes.length, host: '127.0.0.1' }); u = S.universes.length - 1; a = 1; }
        S.fixtures.push({ id: store.id(), no: no++, name: `${name || def.short || def.model}${qty > 1 ? ' ' + (i + 1) : ''}`, ...tmp, universe: u, address: a, x: 0, y: 0 });
        a += size; done++;
      }
      store.emit('patch'); toast(`Patched ${done} × ${def.model}`);
    }, 'acc']]);
  }
  root.append(h('div', { class: 'box' }, h('h4', null, 'Patch', h('span', { class: 'spacer' }), info, btn('+ Patch fixtures', add, 'acc')),
    h('table', null, h('thead', null, h('tr', null, ['No', 'Name', 'Fixture', 'Mode', 'Universe', 'Address', 'Channels', ''].map(t => h('th', null, t)))), body),
    h('p', { class: 'note' }, 'The fixture number is what the command line and the fixture tiles use. Addresses that overlap are marked. Cues, palettes and groups refer to fixtures, not to addresses: re-addressing does not break a show.')));
  return { show: draw, reload: draw };
}
