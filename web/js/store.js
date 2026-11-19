// store.js — the show file: patch, groups, palettes, effects, cue lists, playbacks, outputs.
//  Plain JSON, autosaved to localStorage, downloaded / opened as a .wdx.json file. Values are stored per fixture and per
//  channel KEY (not channel number), so a show survives a mode or address change.
//    fixtures   { id, no, name, def, mode, universe (0-based), address (1-based), x, y }
//    groups     { id, name, fixtures: [id] }
//    palettes   { id, name, kind: 'I'|'P'|'C'|'B', values: { fixtureId: { key: 0–255 } } }
//    effects    { id, name, type, wave, rate (cycles / minute), size, center, spread (deg over the selection), fixtures: [id] }
//    cuelists   { id, name, tracking, loop, cues: [{ id, no, name, values, fx: [effectId], fade, delay, trig, wait, tc }] }
//    playbacks  { id, page, slot, name, kind: 'cuelist'|'effect'|'group', ref }
//    universes  { name, out: 'none'|'cable'|'artnet'|'sacn'|'serial', outUniverse, host }
const LS = 'wdx.show.v1';
export const MAX_UNIVERSES = 64;          // 64 × 512 = 32 768 control channels
export const PAGES = 4, SLOTS = 10;

export function blankShow() {
  return {
    app: 'wdx-show', version: 1, name: 'New show', nextId: 1,
    universes: [{ name: 'Universe 1', out: 'cable', outUniverse: 0, host: '127.0.0.1' }],
    fixtures: [], groups: [], palettes: [], effects: [], cuelists: [], playbacks: [],
    settings: { bpm: 120, bridge: 'ws://127.0.0.1:7740/ws', stage: '', midi: false },
  };
}

export const store = {
  show: blankShow(), listeners: new Set(), undoStack: [], redoStack: [], rev: 0,
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  /** what: 'show' (everything) | 'patch' | 'groups' | 'palettes' | 'effects' | 'cues' | 'playbacks' | 'universes' | 'settings' */
  emit(what) { this.rev++; this.listeners.forEach(f => f(what)); clearTimeout(this._t); this._t = setTimeout(() => this.autosave(), 500); },
  /** call before changing the show: makes the change undoable */
  mark() { this.undoStack.push(JSON.stringify(this.show)); if (this.undoStack.length > 60) this.undoStack.shift(); this.redoStack.length = 0; },
  undo() { if (!this.undoStack.length) return false; this.redoStack.push(JSON.stringify(this.show)); this.show = JSON.parse(this.undoStack.pop()); this.emit('show'); return true; },
  redo() { if (!this.redoStack.length) return false; this.undoStack.push(JSON.stringify(this.show)); this.show = JSON.parse(this.redoStack.pop()); this.emit('show'); return true; },
  id() { return this.show.nextId++; },
  fixture(id) { return this.show.fixtures.find(f => f.id === id); },
  byNo(no) { return this.show.fixtures.find(f => f.no === no); },
  get(list, id) { return this.show[list].find(x => x.id === id); },
  remove(list, id) { this.show[list] = this.show[list].filter(x => x.id !== id); },
  autosave() { try { localStorage.setItem(LS, JSON.stringify(this.show)); } catch (e) {} },
  restore() { try { const j = JSON.parse(localStorage.getItem(LS) || 'null'); if (j && j.app === 'wdx-show') { this.show = this.fix(j); return true; } } catch (e) {} return false; },
  fix(j) { const b = blankShow(); const s = Object.assign(b, j); s.settings = Object.assign(blankShow().settings, j.settings || {}); return s; },
  load(json) { if (!json || json.app !== 'wdx-show') throw new Error('Not a DMX Studio show file'); this.mark(); this.show = this.fix(json); this.emit('show'); },
  reset() { this.mark(); this.show = blankShow(); this.emit('show'); },
  download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(this.show, null, 1)], { type: 'application/json' }));
    a.download = (this.show.name || 'show').replace(/[^\w.-]+/g, '_') + '.wdx.json'; a.click(); URL.revokeObjectURL(a.href);
  },
};
