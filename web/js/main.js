// main.js — DMX Studio shell: top bar, tabs, playback faders, command line, keys, MIDI, the 40 Hz clock.
import { store, PAGES, SLOTS } from './store.js';
import { loadLibrary, getDef, registerShow } from './library.js';
import { Engine } from './engine.js';
import { Outputs } from './outputs.js';
import { h, $, fill, btn, select, dialog, toast } from './ui.js';
import { mountProg } from './v-prog.js';
import { mountPatch } from './v-patch.js';
import { mountCues, mountFx } from './v-cues.js';
import { mountOut, mountSetup } from './v-out.js';
import { EXAMPLES } from './examples.js';

await loadLibrary();
store.opening = registerShow;                                  // library fixtures of a show become profiles as it opens
const restored = store.restore();
const engine = new Engine(), out = new Outputs(engine);
const app = { engine, store, out, tab: 'prog', views: {}, page: 0, curList: null };
window.WDX = app;                                              // for debugging from the console

/* ── clock: a worker timer keeps 40 Hz even when this tab is in the background ── */
let last = performance.now();
const clock = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 25)'], { type: 'text/javascript' })));
clock.onmessage = () => { const now = performance.now(), dt = Math.min(200, now - last); last = now; engine.tick(dt); out.send(); };

/* ── 3D stage link ── */
// Same origin as the simulator = the Virtual DMX cable reaches it: next to it on GitHub Pages, or under /studio/ on its local server.
app.stageUrl = () => store.show.settings.stage || (location.pathname.startsWith('/studio/') ? `${location.origin}/stage.html` : location.hostname.endsWith('github.io') ? `${location.origin}/wincodeMovingHead/stage.html` : 'http://127.0.0.1:7740/stage.html');
/** the fixtures of this patch that the simulator can show (Wincode models and library fixtures) as a stage file */
app.stageFile = download => {
  const S = store.show, fx = S.fixtures.filter(f => getDef(f.def)?.sim).sort((a, b) => a.no - b.no), n = fx.length, perRow = n <= 6 ? n : Math.ceil(n / 2);
  const file = { app: 'wmh-stage', version: 1, name: S.name,
    fixtures: fx.map((f, i) => { const row = Math.floor(i / perRow), k = Math.min(perRow, n - row * perRow); return { id: f.id, x: ((i % perRow) - (k - 1) / 2) * (getDef(f.def).heads > 1 ? 2.2 : 1.5), z: -row * 1.8, rot: 0, mount: 'floor' }; }),
    workspace: { app: 'wmh-dmx-editor', version: 1, name: S.name, nextId: S.nextId, universes: S.universes.map(u => ({ name: u.name, out: 'none', outUniverse: u.outUniverse, host: u.host })),
      fixtures: fx.map(f => ({ id: f.id, name: f.name, def: f.def, mode: f.mode, universe: f.universe, address: f.address })), functions: [], vc: { widgets: [] },
      library: Object.fromEntries(Object.entries(S.library || {}).filter(([id]) => fx.some(f => f.def === id))) } };   // the stage builds library fixtures from their descriptions
  if (download) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' })); a.download = (S.name || 'show').replace(/[^\w.-]+/g, '_') + '.stage.json'; a.click(); URL.revokeObjectURL(a.href); }
  return file;
};
$('#btnStage').addEventListener('click', () => {
  const url = app.stageUrl(), file = app.stageFile(false);
  if (!file.fixtures.length) return toast('The patch has no fixtures the 3D stage can show (Wincode models or library fixtures)', true);
  let same = false; try { same = new URL(url, location.href).origin === location.origin; } catch (e) {}
  if (same) { try { localStorage.setItem('wmh.stage.v1', JSON.stringify(file)); } catch (e) {} }   // the stage opens what it saved last: hand it this patch
  else toast('The stage is on another site: open the studio at http://127.0.0.1:7740/studio/ (simulator server) for a live link, or download the stage file in Setup', true);
  window.open(url, 'wmh-stage');
});

/* ── top bar ── */
const syncBar = () => { $('#showName').value = store.show.name; $('#btnBlackout').classList.toggle('on', engine.blackout); document.title = `${store.show.name} — Wincode DMX Studio`; };
$('#showName').addEventListener('change', e => { store.mark(); store.show.name = e.target.value || 'Show'; store.emit('settings'); syncBar(); });
$('#btnNew').addEventListener('click', () => { if (confirm('Start an empty show? (Undo brings the current one back.)')) { engine.offAll(); engine.prog = {}; store.reset(); } });
$('#btnSave').addEventListener('click', () => store.download());
$('#btnOpen').addEventListener('click', () => $('#fileOpen').click());
$('#fileOpen').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { engine.offAll(); engine.prog = {}; store.load(JSON.parse(await f.text())); toast('Show opened'); } catch (err) { toast('Could not open the file: ' + err.message, true); } });
fill($('#selExample'), EXAMPLES.map(x => h('option', { value: x.id, title: x.about }, x.name)));
$('#btnExample').addEventListener('click', () => { const x = EXAMPLES.find(e => e.id === $('#selExample').value); engine.offAll(); engine.prog = {}; store.load(x.build()); toast(`Loaded “${x.name}”`); });
$('#btnUndo').addEventListener('click', () => store.undo() || toast('Nothing to undo'));
$('#btnRedo').addEventListener('click', () => store.redo() || toast('Nothing to redo'));
$('#btnBlackout').addEventListener('click', () => { engine.blackout = !engine.blackout; syncBar(); });
$('#gm').addEventListener('input', e => { engine.gm = e.target.value / 100; $('#gmVal').textContent = e.target.value + '%'; });
addEventListener('beforeunload', () => store.autosave());

/* ── tabs ── */
const refresh = () => { const v = app.views[app.tab]; if (v && v.show) v.show(); };
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  app.tab = t.dataset.tab;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + app.tab));
  refresh();
}));
app.views.prog = mountProg(app, $('#tab-prog'));
app.views.patch = mountPatch(app, $('#tab-patch'));
app.views.cues = mountCues(app, $('#tab-cues'));
app.views.fx = mountFx(app, $('#tab-fx'));
app.views.out = mountOut(app, $('#tab-out'));
app.views.setup = mountSetup(app, $('#tab-setup'));

/* ── playbacks: pages of ten faders, each running a cue list, an effect or a group master ── */
const pbEls = [];
function assign(slot) {
  const S = store.show, P = S.playbacks.find(p => p.page === app.page && p.slot === slot);
  let kind = P ? P.kind : 'cuelist', ref = P ? P.ref : null;
  dialog(`Playback ${app.page + 1}.${slot + 1}`, b => { const draw = () => { const list = kind === 'cuelist' ? S.cuelists : kind === 'effect' ? S.effects : S.groups;
    fill(b, h('div', { class: 'form' }, h('span', null, 'Runs'), select([['cuelist', 'Cue list'], ['effect', 'Effect'], ['group', 'Group master (intensity)']], kind, v => { kind = v; ref = null; draw(); }),
      h('span', null, 'Item'), list.length ? select(list.map(x => [x.id, x.name]), ref ?? list[0].id, v => { ref = +v; }) : h('span', { class: 'note' }, 'none yet'))); if (ref == null && list.length) ref = list[0].id; }; draw(); },
  [['Assign', () => { if (ref == null) return false; store.mark(); if (P) engine.off(P.id); S.playbacks = S.playbacks.filter(p => p !== P); const src = store.get(kind === 'cuelist' ? 'cuelists' : kind === 'effect' ? 'effects' : 'groups', ref);
    S.playbacks.push({ id: store.id(), page: app.page, slot, name: src.name, kind, ref }); store.emit('playbacks'); }, 'acc'],
  ...(P ? [['Clear', () => { store.mark(); engine.off(P.id); S.playbacks = S.playbacks.filter(p => p !== P); store.emit('playbacks'); }, 'warn']] : [])]);
}
function drawPlaybacks() {
  const S = store.show, root = $('#playbacks'); pbEls.length = 0;
  fill(root, h('div', { class: 'pbpage' }, Array.from({ length: PAGES }, (_, i) => btn('P' + (i + 1), () => { app.page = i; drawPlaybacks(); }, 'small ' + (app.page === i ? 'on' : ''), 'Playback page ' + (i + 1)))),
    Array.from({ length: SLOTS }, (_, slot) => {
      const P = S.playbacks.find(p => p.page === app.page && p.slot === slot), st = P && engine.state(P.id);
      const fader = h('input', { type: 'range', min: 0, max: 100, value: st ? st.level * 100 : 0, disabled: !P, oninput: e => P && engine.setLevel(P.id, e.target.value / 100), title: 'Fader: intensity of this playback' });
      const cue = h('div', { class: 'cue' }), bar = h('i');
      const flash = btn('Flash', null, '', 'Hold: full intensity while pressed'); if (P) { flash.addEventListener('pointerdown', () => engine.flash(P.id, true)); for (const ev of ['pointerup', 'pointerleave']) flash.addEventListener(ev, () => engine.state(P.id).flash && engine.flash(P.id, false)); }
      const el = h('div', { class: 'pb' + (P ? '' : ' empty') }, h('div', { class: 'col' },
        h('div', { class: 'name', title: 'Click to assign', onclick: () => assign(slot) }, P ? P.name : `${slot + 1} · empty`), cue, h('div', { class: 'bar' }, bar),
        h('div', { class: 'keys' }, btn(P && P.kind === 'group' ? 'Master' : 'GO', () => P && engine.go(P.id), 'go', 'Next cue / start'), btn('Back', () => P && P.kind === 'cuelist' && engine.go(P.id, -1)), btn('Off', () => P && engine.off(P.id)), flash)), fader);
      pbEls.push({ P, el, cue, bar, fader }); return el;
    }));
}
function livePlaybacks() {
  for (const x of pbEls) { if (!x.P) continue; const st = engine.state(x.P.id), P = x.P; x.el.classList.toggle('on', st.on || (P.kind === 'group' && st.level < 1));
    if (P.kind === 'cuelist') { const cl = store.get('cuelists', P.ref), c = cl && cl.cues[st.idx]; x.cue.textContent = st.tc ? `▶ ${(st.tcT / 1000).toFixed(1)} s${c ? ' · ' + c.name : ''}` : c ? `${c.no} · ${c.name}` : cl ? `${cl.cues.length} cues` : '—';
      x.bar.style.width = st.on && st.fade ? Math.min(100, Math.max(0, (st.t - st.delay) / st.fade * 100)) + '%' : st.on ? '100%' : '0'; }
    else { x.cue.textContent = P.kind === 'effect' ? (st.on ? 'running' : 'effect') : `group · ${Math.round(st.level * 100)}%`; x.bar.style.width = st.on ? '100%' : '0'; }
    if (document.activeElement !== x.fader) x.fader.value = st.level * 100; }
}
for (const P of store.show.playbacks) engine.state(P.id).level = 1;

/* ── command line ── */
function command(text) {
  const t = text.trim().toLowerCase(); if (!t) return '';
  if (t === 'clear') { engine.clear(); return 'cleared'; }
  let m = /^(go|off|back)\s*(\d+)?$/.exec(t);
  if (m) { const P = store.show.playbacks.find(p => p.page === app.page && p.slot === (+(m[2] || 1)) - 1); if (!P) return 'no playback there'; if (m[1] === 'go') engine.go(P.id); else if (m[1] === 'back') engine.go(P.id, -1); else engine.off(P.id); return `${m[1]} ${P.name}`; }
  const [selPart, levelPart] = t.split('@').map(s => s.trim());
  if (selPart) {
    const ids = [];
    for (const part of selPart.split('+').map(s => s.trim())) {
      let g = /^(?:group|g)\s*(\d+)$/.exec(part);
      if (g) { const grp = store.show.groups[+g[1] - 1]; if (!grp) return `no group ${g[1]}`; ids.push(...grp.fixtures); continue; }
      g = /^(\d+)(?:\s*(?:thru|t|-|>)\s*(\d+))?$/.exec(part); if (!g) return `not understood: “${part}”`;
      const a = +g[1], b = g[2] ? +g[2] : a, lo = Math.min(a, b), hi = Math.max(a, b);
      const got = store.show.fixtures.filter(f => f.no >= lo && f.no <= hi).sort((x, y) => (a <= b ? x.no - y.no : y.no - x.no)).map(f => f.id); if (!got.length) return `no fixture ${part}`; ids.push(...got);
    }
    engine.select(ids);
  }
  if (levelPart != null) {
    if (!engine.sel.length) return 'nothing selected';
    const v = levelPart === 'full' || levelPart === 'f' ? 100 : levelPart === '' ? 100 : +levelPart; if (!isFinite(v)) return `not a level: “${levelPart}”`;
    engine.set('dimmer', Math.min(100, Math.max(0, v)) * 2.55, 0); engine.set('dim', Math.min(100, Math.max(0, v)) * 2.55, 0); return `${engine.sel.length} fixtures @ ${v}%`;
  }
  return `${engine.sel.length} selected`;
}
app.command = command;
$('#cmdline').addEventListener('keydown', e => { if (e.key === 'Enter') { $('#cmdMsg').textContent = command(e.target.value); e.target.value = ''; } if (e.key === 'Escape') e.target.blur(); e.stopPropagation(); });

/* ── keys ── */
addEventListener('keydown', e => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  const k = e.key, slotGo = n => { const P = store.show.playbacks.find(p => p.page === app.page && p.slot === n); if (P) engine.go(P.id); };
  if (e.ctrlKey && k.toLowerCase() === 'z') { store.undo(); e.preventDefault(); } else if (e.ctrlKey && k.toLowerCase() === 'y') { store.redo(); e.preventDefault(); }
  else if (e.ctrlKey && k.toLowerCase() === 'a') { engine.select(store.show.fixtures.slice().sort((a, b) => a.no - b.no).map(f => f.id)); e.preventDefault(); }
  else if (e.ctrlKey || e.altKey || e.metaKey) return;
  else if (k === 'Escape') engine.clear();
  else if (k === 'Enter') { $('#cmdline').focus(); e.preventDefault(); }
  else if (k === ' ') { slotGo(0); e.preventDefault(); }
  else if (/^[0-9]$/.test(k)) slotGo(k === '0' ? 9 : +k - 1);
  else if (k === 'b' || k === 'B') { engine.blackout = !engine.blackout; syncBar(); }
  else if (k === 'h' || k === 'H') { engine.highlight = !engine.highlight; refresh(); }
  else if (k === 'f' || k === 'F') { engine.set('dimmer', 255, 0); engine.set('dim', 255, 0); }
  else if (k === 'r' || k === 'R') app.views.prog.recordCue();
  else if (k === 'ArrowRight' || k === 'ArrowLeft') { const f = store.show.fixtures.slice().sort((a, b) => a.no - b.no); if (f.length) { const i = f.findIndex(x => x.id === engine.sel[engine.sel.length - 1]); engine.select([f[(i + (k === 'ArrowRight' ? 1 : -1) + f.length) % f.length].id]); } }
});

/* ── MIDI: faders on control change 1–10, GO on notes 36–45, flash on notes 46–55, grand master on control change 11 ── */
let midiAccess = null;
app.midi = async () => {
  if (!store.show.settings.midi) { if (midiAccess) for (const i of midiAccess.inputs.values()) i.onmidimessage = null; return; }
  if (!navigator.requestMIDIAccess) return toast('Web MIDI is not available in this browser', true);
  try { midiAccess = midiAccess || await navigator.requestMIDIAccess(); } catch (e) { return toast('MIDI access was refused', true); }
  const slot = n => store.show.playbacks.find(p => p.page === app.page && p.slot === n);
  for (const input of midiAccess.inputs.values()) input.onmidimessage = ev => { const [st, d1, d2] = ev.data, type = st & 0xf0;
    if (type === 0xb0 && d1 >= 1 && d1 <= 10) { const P = slot(d1 - 1); if (P) engine.setLevel(P.id, d2 / 127); }
    else if (type === 0xb0 && d1 === 11) { engine.gm = d2 / 127; $('#gm').value = Math.round(engine.gm * 100); $('#gmVal').textContent = $('#gm').value + '%'; }
    else if ((type === 0x90 || type === 0x80) && d1 >= 36 && d1 <= 45) { if (type === 0x90 && d2 > 0) { const P = slot(d1 - 36); if (P) engine.go(P.id); } }
    else if ((type === 0x90 || type === 0x80) && d1 >= 46 && d1 <= 55) { const P = slot(d1 - 46); if (P) engine.flash(P.id, type === 0x90 && d2 > 0); } };
};

/* ── wiring ── */
store.on(w => { if (w === 'show') { syncBar(); app.curList = null; } if (w === 'show' || w === 'playbacks' || w === 'cues' || w === 'effects' || w === 'groups') drawPlaybacks();
  const v = app.views[app.tab]; if (v && v.reload) v.reload(); });
engine.on(ev => { if (ev === 'pb') livePlaybacks(); });
setInterval(() => { const s = out.status(), p = $('#outPill'); p.className = 'pill ' + (s.ok ? 'on' : 'off'); p.textContent = s.text; const v = app.views[app.tab]; if (v && v.live) v.live(); }, 500);
setInterval(() => { const v = app.views[app.tab]; if (v && v.fast) v.fast(); livePlaybacks(); }, 80);

if (!restored) store.show = EXAMPLES[0].build();              // first visit: start with the showcase so there is something to play with
engine.resize(); syncBar(); drawPlaybacks(); refresh(); app.midi();
