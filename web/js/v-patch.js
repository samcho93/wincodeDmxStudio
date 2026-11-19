// v-patch.js — Patch: which fixture sits at which DMX address, in which mode.
import { store, MAX_UNIVERSES } from './store.js';
import { library, getDef, modeOf, footprint, freeAddress, registerDesc } from './library.js';
import { oflIndex, oflDesc, userLibrary, importFile } from './libimport.js';
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
    let def = library()[0], mode = def.defaultMode, qty = 1, uni = 0, addr = 0, name = '', q = '', kind = '', rows = null;
    const descs = new Map(Object.entries(store.show.library || {}));    // descriptions of the library fixtures picked here or already in the show
    dialog('Patch fixtures', b => {
      const form = h('div', { class: 'form' }), list = h('div', { class: 'liblist' }), count = h('span', { class: 'note' });
      const redraw = () => { const libs = library(); fill(form,
        h('span', null, 'Fixture'), select(libs.map(d => [d.id, `${d.manufacturer} — ${d.model}`]), def.id, v => { def = getDef(v); mode = def.defaultMode; redraw(); }),
        h('span', null, 'Mode'), select(Object.entries(def.modes).map(([id, m]) => [id, /\(\d+\)$/.test(m.label) ? m.label : `${m.label} (${m.channels.length} channels)`]), mode, v => { mode = v; }),
        h('span', null, 'Quantity'), numInput(qty, 1, 200, v => { qty = v; }),
        h('span', null, 'Universe'), select(uniOpts(), uni, v => { uni = +v; }),
        h('span', null, 'Start address'), h('div', null, numInput(addr, 0, 512, v => { addr = v; }), h('span', { class: 'note' }, '  0 = first free address')),
        h('span', null, 'Name'), textInput(name, v => { name = v; }, { placeholder: def.short || def.model })); };
      const pick = async r => { try { const D = descs.get(r.id) || (r.user ? userLibrary.all()[r.id] : await oflDesc(r.id)); descs.set(D.id, D); def = registerDesc(D); mode = def.defaultMode; redraw(); search(); } catch (e) { toast('This fixture could not be loaded: ' + e.message, true); } };
      const search = () => { if (!rows) return; const words = q.toLowerCase().split(/\s+/).filter(Boolean), hit = rows.filter(r => (!kind || r.c.includes(kind)) && words.every(w => (r.m + ' ' + r.n).toLowerCase().includes(w)));
        count.textContent = `${hit.length} of ${rows.length} library fixtures${hit.length > 80 ? ' — showing 80, type to narrow down' : ''}`;
        fill(list, hit.slice(0, 80).map(r => h('div', { class: 'librow' + (def.id === r.id ? ' sel' : ''), onclick: () => pick(r) }, h('b', null, r.n), h('span', { class: 'note' }, `  ${r.m}`), h('span', { class: 'spacer' }),
          h('span', { class: 'note' }, [r.user ? 'imported' : '', ...r.f.filter(x => x !== 'moving')].filter(Boolean).join(' · ') + '  ' + Object.values(r.k).sort((a, b) => a - b).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4).join('/') + ' ch'))),
          !hit.length && h('p', { class: 'note', style: 'padding:6px 8px' }, 'Nothing matches. Import a GDTF file for a fixture that is not in the library.')); };
      const load = async () => { const users = Object.values(userLibrary.all()).map(D => ({ id: D.id, m: D.manufacturer, n: D.name, c: D.categories || [], k: Object.fromEntries(D.modes.map(m => [m.id, m.channels.length])), f: [], user: true }));
        let ofl = []; try { ofl = await oflIndex(); } catch (e) { count.textContent = e.message; } rows = [...users, ...ofl]; search(); };
      const importFiles = async files => { let last = null; for (const f of files) try { const D = await importFile(f); userLibrary.add(D); descs.set(D.id, D); last = D; } catch (e) { toast(`${f.name}: ${e.message}`, true); }
        await load(); if (last) { def = registerDesc(last); mode = def.defaultMode; redraw(); search(); toast(`Imported ${last.manufacturer} ${last.name}`); } };
      const file = h('input', { type: 'file', accept: '.gdtf,.json', multiple: true, hidden: true, onchange: e => { const fs = [...e.target.files]; e.target.value = ''; importFiles(fs); } });
      fill(b, form,
        h('h4', { class: 'libhead' }, 'Fixture library', h('span', { class: 'note' }, '— Open Fixture Library and imported files; click one to choose it above')),
        h('div', { class: 'row' }, h('input', { type: 'text', placeholder: 'Search by name or manufacturer…', style: 'flex:1', oninput: e => { q = e.target.value; search(); } }),
          select([['', 'All kinds'], ['Moving Head', 'Moving heads'], ['Color Changer', 'Colour changers'], ['Pixel Bar', 'Pixel bars'], ['Blinder', 'Blinders'], ['Strobe', 'Strobes'], ['Scanner', 'Scanners'], ['Dimmer', 'Dimmers']], kind, v => { kind = v; search(); }),
          btn('Import GDTF / OFL file…', () => file.click(), '', 'Add a fixture from a GDTF file (.gdtf) or an Open Fixture Library file (.json)'), file),
        list, count);
      b.addEventListener('dragover', e => e.preventDefault()); b.addEventListener('drop', e => { e.preventDefault(); importFiles([...e.dataTransfer.files]); });
      redraw(); load();
    },
    [['Patch', () => {
      const S = store.show, size = def.modes[mode].channels.length; store.mark();
      if (def.library && descs.has(def.id)) (S.library = S.library || {})[def.id] = descs.get(def.id);   // the show keeps the description of a library fixture it uses
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
