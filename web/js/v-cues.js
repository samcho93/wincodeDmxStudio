// v-cues.js — Cue lists (the show's sequences) and Effects (generated movement, intensity and colour).
import { store } from './store.js';
import { WAVES, FX_TYPES, audioFiles } from './engine.js';
import { h, fill, btn, select, numInput, textInput, secInput, dialog, toast } from './ui.js';

const TRIG = [['go', 'GO button'], ['follow', 'Follow (after the previous fade)'], ['wait', 'Wait (seconds after the previous fade)']];

export function mountCues(app, root) {
  const E = app.engine, list = h('div', { class: 'list' }), right = h('div');
  const cur = () => store.get('cuelists', app.curList) || store.show.cuelists[0];
  const pbOf = cl => store.show.playbacks.find(p => p.kind === 'cuelist' && p.ref === cl.id);
  function draw() {
    const S = store.show, cl = cur(); if (cl) app.curList = cl.id;
    fill(list, S.cuelists.map(c => h('div', { class: 'it' + (cl && c.id === cl.id ? ' sel' : ''), onclick: () => { app.curList = c.id; draw(); } }, h('b', null, c.name), h('span', { class: 'spacer' }), h('span', { class: 'note' }, `${c.cues.length} cues`))),
      btn('+ New cue list', () => { store.mark(); const c = { id: store.id(), name: 'Cue list ' + (S.cuelists.length + 1), tracking: true, loop: true, cues: [] }; S.cuelists.push(c); app.curList = c.id; store.emit('cues'); }));
    if (!cl) return fill(right, h('p', { class: 'note' }, 'No cue list yet. Set a look in the Programmer and press “Record cue”, or create a list here.'));
    const P = pbOf(cl), st = P && E.state(P.id), up = fn => { store.mark(); fn(); store.emit('cues'); };
    const rows = cl.cues.map((c, i) => h('tr', { class: (st && st.on && st.idx === i ? 'live ' : '') + 'click', dataset: { i } },
      h('td', null, numInput(c.no, 0, 9999, v => up(() => { c.no = v; cl.cues.sort((a, b) => a.no - b.no); }), { step: 0.1, style: 'width:62px' })),
      h('td', null, textInput(c.name, v => up(() => { c.name = v; }))),
      h('td', null, secInput(c.fade, v => up(() => { c.fade = v; }))),
      h('td', null, secInput(c.delay, v => up(() => { c.delay = v; }))),
      h('td', null, select(TRIG, c.trig || 'go', v => up(() => { c.trig = v; })), c.trig === 'wait' && secInput(c.wait, v => up(() => { c.wait = v; }))),
      h('td', null, h('input', { type: 'number', step: 0.1, min: 0, placeholder: '—', value: c.tc == null ? '' : (c.tc / 1000).toFixed(1), style: 'width:70px', title: 'Timecode: seconds from the start of the list (empty = manual)', onchange: e => up(() => { c.tc = e.target.value === '' ? null : Math.round(+e.target.value * 1000); }) })),
      h('td', null, select([['', '—'], ...S.effects.map(f => [f.id, f.name])], (c.fx || [])[0] ?? '', v => up(() => { c.fx = v === '' ? [] : [+v]; }), { title: 'Effect that runs while this cue is active' })),
      h('td', { class: 'note' }, `${Object.keys(c.values).length} fx · ${Object.values(c.values).reduce((s, v) => s + Object.keys(v).length, 0)} values`),
      h('td', null, btn('▶', () => { if (!P) return toast('Assign the list to a playback first', true); E.go(P.id, 1, i); }, 'small', 'Go to this cue'),
        btn('Load', () => { for (const [id, v] of Object.entries(c.values)) E.setValues(+id, v); E.select(Object.keys(c.values).map(Number)); toast('Cue loaded into the programmer'); }, 'small', 'Copy the cue into the programmer to edit it'),
        btn('Update', () => { const v = E.progValues(); if (!Object.keys(v).length) return toast('The programmer is empty', true); up(() => { for (const [id, x] of Object.entries(v)) Object.assign(c.values[id] || (c.values[id] = {}), x); }); toast('Cue updated'); }, 'small', 'Merge the programmer into this cue'),
        btn('✕', () => up(() => { cl.cues.splice(i, 1); }), 'small', 'Delete the cue'))));
    const audio = h('input', { type: 'file', accept: 'audio/*', hidden: true, onchange: async e => { const f = e.target.files[0]; if (!f) return; await audioFiles.put(f.name, f); up(() => { cl.audio = f.name; }); toast('Audio stored in this browser'); } });
    fill(right, h('div', { class: 'box' }, h('h4', null, 'Cue list', h('span', { class: 'spacer' }), btn('Delete list', () => { if (confirm(`Delete “${cl.name}”?`)) up(() => { store.remove('cuelists', cl.id); store.show.playbacks = store.show.playbacks.filter(p => !(p.kind === 'cuelist' && p.ref === cl.id)); }); }, 'small')),
      h('div', { class: 'row' }, 'Name', textInput(cl.name, v => up(() => { cl.name = v; const p = pbOf(cl); if (p) p.name = v; }), { style: 'width:200px' }),
        h('label', { title: 'Tracking: a cue keeps every value of the cues before it until it changes them (as on a theatre desk). Off: each cue stands alone.' }, h('input', { type: 'checkbox', checked: cl.tracking !== false, onchange: e => up(() => { cl.tracking = e.target.checked; }) }), ' Tracking'),
        h('label', null, h('input', { type: 'checkbox', checked: cl.loop !== false, onchange: e => up(() => { cl.loop = e.target.checked; }) }), ' Loop'),
        h('span', { class: 'pill ' + (P ? 'on' : 'off') }, P ? `Playback ${P.page + 1}.${P.slot + 1}` : 'Not on a playback')),
      h('div', { class: 'row' }, btn('GO', () => P && E.go(P.id), 'acc'), btn('Back', () => P && E.go(P.id, -1)), btn('Off', () => P && E.off(P.id)),
        h('span', { class: 'note' }, '  Timecode:'), btn(st && st.tc ? '■ Stop' : '▶ Run', () => { if (!P) return toast('Assign the list to a playback first', true); E.timecode(P.id, !(st && st.tc)).then(draw); }, st && st.tc ? 'on' : '', 'Run the list against the clock: cues with a time fire by themselves'),
        btn(cl.audio ? '🎵 ' + cl.audio : '🎵 Add audio', () => audio.click(), 'small', 'Audio file played with the timecode run'), audio, cl.audio && btn('✕', () => up(() => { cl.audio = null; }), 'small')),
      h('table', null, h('thead', null, h('tr', null, ['No', 'Name', 'Fade s', 'Delay s', 'Trigger', 'Time s', 'Effect', 'Content', ''].map(t => h('th', null, t)))), h('tbody', null, rows)),
      !cl.cues.length && h('p', { class: 'note' }, 'Empty list. Set a look in the Programmer and press “Record cue”.')));
  }
  root.append(h('div', { class: 'cols' }, h('div', null, list), right));
  E.on(ev => { if (ev === 'pb' && app.tab === 'cues') draw(); });
  return { show: draw, reload: draw };
}

export function mountFx(app, root) {
  const E = app.engine, list = h('div', { class: 'list' }), right = h('div'); let sel = null;
  function draw() {
    const S = store.show, fx = store.get('effects', sel) || S.effects[0]; if (fx) sel = fx.id;
    fill(list, S.effects.map(f => h('div', { class: 'it' + (fx && f.id === fx.id ? ' sel' : ''), onclick: () => { sel = f.id; draw(); } }, h('b', null, f.name), h('span', { class: 'spacer' }), h('span', { class: 'note' }, FX_TYPES[f.type] || f.type))),
      btn('+ New effect', () => { store.mark(); const f = { id: store.id(), name: 'Effect ' + (S.effects.length + 1), type: 'dimmer', wave: 'sine', rate: 30, size: 100, center: 127, spread: 360, dir: 'forward', fixtures: [...E.sel] }; S.effects.push(f); sel = f.id; store.emit('effects'); }));
    if (!fx) return fill(right, h('p', { class: 'note' }, 'Effects generate values continuously: a dimmer chase, a pan / tilt circle, a rainbow. Select fixtures, then “New effect”. Run an effect from a playback fader, or attach it to a cue.'));
    const up = fn => { store.mark(); fn(); store.emit('effects'); }, num = (k, min, max, step = 1) => numInput(fx[k] ?? 0, min, max, v => up(() => { fx[k] = v; }), { step });
    const P = S.playbacks.find(p => p.kind === 'effect' && p.ref === fx.id), st = P && E.state(P.id);
    fill(right, h('div', { class: 'box' }, h('h4', null, 'Effect', h('span', { class: 'spacer' }), btn('Delete', () => up(() => { store.remove('effects', fx.id); S.playbacks = S.playbacks.filter(p => !(p.kind === 'effect' && p.ref === fx.id)); for (const cl of S.cuelists) for (const c of cl.cues) c.fx = (c.fx || []).filter(x => x !== fx.id); }), 'small')),
      h('div', { class: 'form', style: 'max-width:560px' },
        h('span', null, 'Name'), textInput(fx.name, v => up(() => { fx.name = v; if (P) P.name = v; })),
        h('span', null, 'Type'), select(Object.entries(FX_TYPES), fx.type, v => up(() => { fx.type = v; })),
        h('span', null, 'Wave'), select(WAVES, fx.wave, v => up(() => { fx.wave = v; }), { title: 'Shape of the movement over one cycle (not used by circle, figure 8 and rainbow)' }),
        h('span', null, 'Rate'), h('div', null, num('rate', 1, 600), h('span', { class: 'note' }, '  cycles per minute'), btn('Tap', () => { const now = performance.now(); if (draw.tap && now - draw.tap < 3000) up(() => { fx.rate = Math.round(60000 / (now - draw.tap)); }); draw.tap = now; }, 'small', 'Tap twice in time: sets the rate')),
        h('span', null, 'Size'), h('div', null, num('size', 0, 255), h('span', { class: 'note' }, '  how far the value swings (DMX)')),
        fx.type === 'dimmer' && h('span', null, 'Centre'), fx.type === 'dimmer' && h('div', null, num('center', 0, 255), h('span', { class: 'note' }, '  the level it swings around')),
        h('span', null, 'Spread'), h('div', null, num('spread', 0, 1440, 15), h('span', { class: 'note' }, '  degrees of phase across the fixtures: 0 = together, 360 = one wave')),
        h('span', null, 'Direction'), select(['forward', 'backward'], fx.dir || 'forward', v => up(() => { fx.dir = v; })),
        h('span', null, 'Fixtures'), h('div', null, h('b', null, `${fx.fixtures.length} fixtures `), btn('Use the selection', () => { if (!E.sel.length) return toast('Select fixtures first', true); up(() => { fx.fixtures = [...E.sel]; }); }, 'small'), btn('Select them', () => E.select(fx.fixtures), 'small'))),
      h('div', { class: 'row', style: 'margin-top:10px' },
        btn(st && st.on ? '■ Stop' : '▶ Run', () => { if (!P) { store.mark(); const used = new Set(S.playbacks.filter(p => p.page === 0).map(p => p.slot)); let slot = 0; while (used.has(slot)) slot++; if (slot > 9) return toast('Page 1 has no free playback', true); const np = { id: store.id(), page: 0, slot, name: fx.name, kind: 'effect', ref: fx.id }; S.playbacks.push(np); store.emit('playbacks'); E.go(np.id); } else if (st.on) E.off(P.id); else E.go(P.id); draw(); }, st && st.on ? 'on' : 'acc'),
        h('span', { class: 'pill ' + (P ? 'on' : '') }, P ? `Playback ${P.page + 1}.${P.slot + 1}` : 'Run puts it on a free playback'))));
  }
  root.append(h('div', { class: 'cols' }, h('div', null, list), right));
  E.on(ev => { if (ev === 'pb' && app.tab === 'fx') draw(); });
  return { show: draw, reload: draw };
}
