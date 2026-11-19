// v-out.js — DMX output monitor and Setup (universes, lines, bridge, MIDI, the link to the 3D stage).
import { store, MAX_UNIVERSES } from './store.js';
import { LINES } from './outputs.js';
import { h, fill, btn, select, numInput, textInput, toast } from './ui.js';

export function mountOut(app, root) {
  const E = app.engine; let uni = 0;
  const grid = h('div', { class: 'mon' }), pick = h('span'), cells = [];
  for (let a = 0; a < 512; a++) { const bar = h('i'), val = h('span', null, '0'), c = h('div', null, bar, h('b', null, a + 1), val); c._bar = bar; c._val = val; cells.push(c); grid.append(c); }
  function draw() {
    const S = store.show; if (uni >= S.universes.length) uni = 0;
    fill(pick, select(S.universes.map((u, i) => [i, `${i + 1} · ${u.name} · ${LINES[u.out]}`]), uni, v => { uni = +v; draw(); }));
    const own = E.owner[uni] || [], starts = new Set(S.fixtures.filter(f => f.universe === uni).map(f => f.address - 1));
    cells.forEach((c, a) => { c.className = (own[a] ? 'own' : '') + (starts.has(a) ? ' start' : ''); const f = own[a] && store.fixture(own[a]); c.title = f ? `${a + 1} · ${f.no} ${f.name} · ${E.fx.get(f.id)?.m.channels[a - (f.address - 1)]?.name || ''}` : `${a + 1} · free`; });
  }
  root.append(h('div', { class: 'box' }, h('h4', null, 'DMX output', h('span', { class: 'spacer' }), pick), grid,
    h('p', { class: 'note' }, 'What is on the wire right now. Orange numbers are patched channels; the bar on the left edge marks the first channel of a fixture. Hover a cell for its fixture and function.')));
  return { show: draw, reload: draw, fast() { const o = E.out[uni]; if (!o) return; for (let a = 0; a < 512; a++) { const c = cells[a], v = o[a]; if (c._v !== v) { c._v = v; c._val.textContent = v; c._bar.style.height = v / 2.55 + '%'; } } } };
}

export function mountSetup(app, root) {
  const tb = h('tbody'), misc = h('div');
  function draw() {
    const S = store.show, up = fn => { store.mark(); fn(); store.emit('universes'); };
    fill(tb, S.universes.map((u, i) => h('tr', null,
      h('td', null, i + 1), h('td', null, textInput(u.name, v => up(() => { u.name = v; }))),
      h('td', null, select(Object.entries(LINES), u.out, v => up(() => { u.out = v; }))),
      h('td', null, u.out === 'none' || u.out === 'serial' ? '—' : numInput(u.outUniverse, 0, 32767, v => up(() => { u.outUniverse = v; }), { title: u.out === 'cable' ? 'Cable universe the simulator listens on' : 'Universe number on the network (Art-Net: 0-based port address · sACN: 1–63999)' })),
      h('td', null, u.out === 'artnet' || u.out === 'sacn' ? textInput(u.host, v => up(() => { u.host = v; }), { placeholder: 'IP address', title: 'Target: a node address, the broadcast address, or 127.0.0.1 for a simulator on this computer' }) : '—'),
      h('td', null, `${S.fixtures.filter(f => f.universe === i).length} fixtures`),
      h('td', null, i === S.universes.length - 1 && i > 0 && btn('✕', () => { if (S.fixtures.some(f => f.universe === i)) return toast('Fixtures are patched on this universe', true); up(() => { S.universes.pop(); }); }, 'small')))));
    const serial = app.out.writer;
    fill(misc,
      h('div', { class: 'box' }, h('h4', null, 'Lines'),
        h('div', { class: 'form', style: 'max-width:760px' },
          h('span', null, 'Bridge'), h('div', null, textInput(S.settings.bridge, v => { store.mark(); S.settings.bridge = v; store.emit('settings'); }, { style: 'width:280px' }), h('span', { class: 'pill ' + (app.out.bridgeOnline() ? 'on' : '') }, app.out.bridgeOnline() ? 'connected' : 'not connected'),
            h('p', { class: 'note' }, 'WebSocket address of a bridge that turns frames into Art-Net / sACN packets: the Wincode simulator server (ws://127.0.0.1:7740/ws) or this project started with npm start (ws://127.0.0.1:7750/ws). Only used by universes set to Art-Net or sACN.')),
          h('span', null, 'DMX USB Pro'), h('div', null, btn(serial ? 'Disconnect' : 'Connect…', async () => { try { if (serial) await app.out.disconnectSerial(); else await app.out.connectSerial(); } catch (e) { toast(e.message, true); } draw(); }), h('span', { class: 'pill ' + (serial ? 'on' : '') }, serial ? 'connected' : 'not connected'),
            h('p', { class: 'note' }, 'ENTTEC DMX USB Pro compatible widget through Web Serial (Chrome / Edge). Sends the universe whose line is “DMX USB Pro”.')),
          h('span', null, 'MIDI'), h('div', null, h('label', null, h('input', { type: 'checkbox', checked: !!S.settings.midi, onchange: e => { store.mark(); S.settings.midi = e.target.checked; store.emit('settings'); app.midi(); } }), ' Control the playbacks from a MIDI surface'),
            h('p', { class: 'note' }, 'Control change 1–10 → playback faders · notes 36–45 → GO · notes 46–55 → flash · control change 11 → grand master (current page).')))),
      h('div', { class: 'box' }, h('h4', null, '3D stage'),
        h('div', { class: 'form', style: 'max-width:760px' },
          h('span', null, 'Stage page'), h('div', null, textInput(S.settings.stage, v => { store.mark(); S.settings.stage = v; store.emit('settings'); }, { style: 'width:420px', placeholder: app.stageUrl() }),
            h('p', { class: 'note' }, 'Address of the Wincode simulator\'s stage page. “3D Stage” in the top bar hands it this patch and opens it; the fixtures there then follow the Virtual DMX cable. This works when both pages are served from the same site (as on GitHub Pages). From another site or port, save the stage file and open it there, and use Art-Net through the bridge.')),
          h('span', null, 'Stage file'), h('div', null, btn('Download stage file', () => app.stageFile(true)), h('span', { class: 'note' }, '  the Wincode fixtures of this patch, for “Open…” on the stage page')))),
      h('div', { class: 'box' }, h('h4', null, 'Keys'),
        h('p', { class: 'note' }, h('kbd', null, 'Esc'), ' clear · ', h('kbd', null, 'H'), ' highlight · ', h('kbd', null, 'F'), ' full · ', h('kbd', null, 'R'), ' record cue · ', h('kbd', null, 'B'), ' blackout · ', h('kbd', null, 'Space'), ' GO on playback 1 · ', h('kbd', null, '1'), '–', h('kbd', null, '0'),
          ' GO on playbacks 1–10 · ', h('kbd', null, '←'), ' ', h('kbd', null, '→'), ' previous / next fixture · ', h('kbd', null, 'Ctrl+A'), ' select all · ', h('kbd', null, 'Ctrl+Z'), ' / ', h('kbd', null, 'Ctrl+Y'), ' undo / redo · ', h('kbd', null, 'Enter'), ' command line')));
  }
  root.append(h('div', { class: 'box' }, h('h4', null, 'Universes', h('span', { class: 'spacer' }),
    btn('+ Universe', () => { const S = store.show; if (S.universes.length >= MAX_UNIVERSES) return toast(`${MAX_UNIVERSES} universes is the limit`, true); store.mark(); S.universes.push({ name: `Universe ${S.universes.length + 1}`, out: 'none', outUniverse: S.universes.length, host: '127.0.0.1' }); store.emit('universes'); }, 'acc')),
    h('table', null, h('thead', null, h('tr', null, ['#', 'Name', 'Line', 'Universe', 'Host', 'Patch', ''].map(t => h('th', null, t)))), tb),
    h('p', { class: 'note' }, `One universe is 512 channels; add universes for larger rigs (up to ${MAX_UNIVERSES} = ${MAX_UNIVERSES * 512} channels). Each universe goes to its own line.`)), misc);
  return { show: draw, reload: draw, live: () => { if (app.tab === 'setup' && draw.on !== app.out.bridgeOnline()) { draw.on = app.out.bridgeOnline(); draw(); } } };
}
