// engine.js — the console core: programmer, playbacks, effects and the DMX universes, computed 40 times a second.
//  Priority, lowest to highest (as on a lighting console):
//    channel defaults → playbacks (cue lists: intensity merges HTP across playbacks and follows each fader, everything else is
//    LTP in the order the playbacks were started) → effects → programmer (always wins) → highlight → group masters →
//    grand master / blackout (intensity only).
//  Values are 0–255 floats per channel key; a channel with a fine partner gets the fraction written to it (16-bit).
import { store } from './store.js';
import { modeOf, colourValues, mixOf } from './library.js';
import { hsv } from './ui.js';

const clamp = (v, a = 0, b = 255) => Math.min(b, Math.max(a, v));
export const WAVES = ['sine', 'triangle', 'ramp up', 'ramp down', 'square', 'pulse', 'chase', 'random'];
export const FX_TYPES = { dimmer: 'Dimmer', circle: 'Pan / tilt circle', pan: 'Pan', tilt: 'Tilt', eight: 'Pan / tilt figure 8', rainbow: 'Colour rainbow', zoom: 'Zoom', focus: 'Focus' };
/** wave(phase 0–1, items) → −1…1 */
function wave(name, p, n) {
  p = ((p % 1) + 1) % 1;
  switch (name) {
    case 'triangle': return p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
    case 'ramp up': return -1 + 2 * p;
    case 'ramp down': return 1 - 2 * p;
    case 'square': return p < 0.5 ? 1 : -1;
    case 'pulse': return p < 0.2 ? 1 : -1;
    case 'chase': return p < 1 / Math.max(2, n) ? 1 : -1;
    case 'random': { const k = Math.floor(p * 8); return (((k * 2654435761) >>> 0) % 1000) / 500 - 1; }
    default: return Math.sin(p * Math.PI * 2);
  }
}

/* audio for timecode cue lists (kept in IndexedDB, keyed by file name) */
let dbP = null;
const db = () => dbP || (dbP = new Promise((res, rej) => { const r = indexedDB.open('wdx-audio', 1); r.onupgradeneeded = () => r.result.createObjectStore('audio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const rq = fn(d.transaction('audio', mode).objectStore('audio')); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); };
export const audioFiles = { put: (name, blob) => tx('readwrite', s => s.put(blob, name)), get: name => tx('readonly', s => s.get(name)) };
const audioEls = new Map();
async function audioEl(name) {
  if (!name) return null;
  if (!audioEls.has(name)) { const blob = await audioFiles.get(name).catch(() => null); if (!blob) return null; audioEls.set(name, new Audio(URL.createObjectURL(blob))); }
  return audioEls.get(name);
}

export class Engine {
  constructor() {
    this.sel = []; this.prog = {}; this.progRev = 0; this.highlight = false; this.fan = 0;
    this.gm = 1; this.blackout = false; this.time = 0; this.frames = 0; this.seq = 1;
    this.pb = new Map();                                        // playback id → runtime state
    this.listeners = new Set(); this.cache = new Map(); this.cacheRev = -1;
    this.resize(); store.on(() => this.resize());
  }
  on(fn) { this.listeners.add(fn); } emit(ev) { this.listeners.forEach(f => f(ev)); }

  /* ── patch → address tables ── */
  resize() {
    const S = store.show, n = S.universes.length, mk = (T, fillv) => Array.from({ length: n }, () => { const a = new T(512); if (fillv != null) a.fill(fillv); return a; });
    this.out = Array.from({ length: n }, (_, i) => (this.out && this.out[i]) || new Uint8Array(512));
    this.val = mk(Float32Array); this.live = mk(Float32Array); this.def = mk(Float32Array); this.hi = mk(Float32Array); this.mul = mk(Float32Array, 1);
    this.int = mk(Uint8Array); this.fine = mk(Int16Array, -1); this.owner = mk(Int32Array); this.touched = mk(Uint8Array);
    this.fx = new Map();
    for (const f of S.fixtures) {
      const m = modeOf(f); if (!m || f.universe >= n) continue;
      this.fx.set(f.id, { f, m, base: f.address - 1 });
      m.channels.forEach((c, i) => { const a = f.address - 1 + i; if (a > 511) return;
        this.def[f.universe][a] = c.def || 0; this.int[f.universe][a] = c.grp === 'I' ? 1 : 0; this.owner[f.universe][a] = f.id;
        if (c.fine && m.index[c.fine] != null) this.fine[f.universe][a] = f.address - 1 + m.index[c.fine]; });
    }
    this.sel = this.sel.filter(id => this.fx.has(id));
    for (const id of Object.keys(this.prog)) if (!this.fx.has(+id)) delete this.prog[id];
    for (const [id] of this.pb) if (!store.get('playbacks', id)) this.pb.delete(id);
    this.cache.clear();
  }
  /** { fixtureId: { key: value } } → [{ u, a, v, int, k }] (k = universe * 512 + address) */
  compile(values) {
    const list = [];
    for (const [fid, vals] of Object.entries(values || {})) {
      const e = this.fx.get(+fid); if (!e) continue;
      for (const [key, v] of Object.entries(vals)) { const i = e.m.index[key]; if (i == null) continue; const a = e.base + i; if (a > 511) continue;
        list.push({ u: e.f.universe, a, v, int: e.m.channels[i].grp === 'I', k: e.f.universe * 512 + a }); }
    }
    return list;
  }
  cached(key, make) { if (this.cacheRev !== store.rev) { this.cache.clear(); this.cacheRev = store.rev; } if (!this.cache.has(key)) this.cache.set(key, make()); return this.cache.get(key); }
  /** merged values of a cue list up to cue i (tracking) or of cue i alone */
  cueState(cl, i) {
    return this.cached(`cs${cl.id}:${i}`, () => {
      const out = {}; const from = cl.tracking === false ? i : 0;
      for (let j = from; j <= i; j++) for (const [fid, vals] of Object.entries(cl.cues[j]?.values || {})) Object.assign(out[fid] || (out[fid] = {}), vals);
      return this.compile(out);
    });
  }

  /* ── selection and programmer ── */
  select(ids, add = false) { const set = add ? [...this.sel] : []; for (const id of ids) if (this.fx.has(id) && !set.includes(id)) set.push(id); this.sel = set; this.emit('sel'); }
  toggleSel(id) { this.sel = this.sel.includes(id) ? this.sel.filter(x => x !== id) : [...this.sel, id]; this.emit('sel'); }
  clear() { if (Object.keys(this.prog).length) { this.prog = {}; this.progRev++; this.emit('prog'); } else { this.sel = []; this.emit('sel'); } }
  /** set an attribute (channel base name) on the selection; fan spreads ±fan across the selection order */
  set(base, v, fan = this.fan) {
    const n = this.sel.length;
    this.sel.forEach((id, i) => { const e = this.fx.get(id); if (!e) return; const p = this.prog[id] || (this.prog[id] = {});
      const off = n > 1 ? (i / (n - 1) - 0.5) * 2 * fan : 0;
      for (const c of e.m.channels) if (c.base === base) p[c.key] = clamp(v + off); });
    this.progRev++; this.emit('prog');
  }
  setValues(id, vals) { Object.assign(this.prog[id] || (this.prog[id] = {}), vals); this.progRev++; this.emit('prog'); }
  setColour(rgb) { for (const id of this.sel) { const e = this.fx.get(id); if (e) Object.assign(this.prog[id] || (this.prog[id] = {}), colourValues(e.f, rgb)); } this.progRev++; this.emit('prog'); }
  release(base) { for (const id of this.sel) { const e = this.fx.get(id), p = this.prog[id]; if (!e || !p) continue; for (const c of e.m.channels) if (c.base === base) delete p[c.key]; if (!Object.keys(p).length) delete this.prog[id]; } this.progRev++; this.emit('prog'); }
  /** value of a channel right now: programmer, else what is on the wire */
  value(id, key) { const p = this.prog[id]; if (p && key in p) return p[key]; const e = this.fx.get(id); if (!e) return 0; const i = e.m.index[key]; return i == null ? 0 : this.out[e.f.universe][e.base + i]; }
  inProg(id, key) { const p = this.prog[id]; return !!p && key in p; }
  applyPalette(p) {
    for (const id of this.sel) { const e = this.fx.get(id); if (!e) continue;
      let vals = p.values[id];
      if (!vals) { const other = Object.keys(p.values).map(k => this.fx.get(+k)).find(o => o && o.f.def === e.f.def && o.f.mode === e.f.mode); if (other) vals = p.values[other.f.id]; }   // same type: use its values
      if (vals) Object.assign(this.prog[id] || (this.prog[id] = {}), vals); }
    this.progRev++; this.emit('prog');
  }
  /** programmer content, optionally only one attribute group */
  progValues(kind) {
    const out = {};
    for (const [id, vals] of Object.entries(this.prog)) { const e = this.fx.get(+id); if (!e) continue;
      for (const [k, v] of Object.entries(vals)) { const c = e.m.channels[e.m.index[k]]; if (c && (!kind || c.grp === kind)) (out[id] || (out[id] = {}))[k] = Math.round(v * 100) / 100; } }
    return out;
  }

  /* ── playbacks ── */
  state(id) { if (!this.pb.has(id)) this.pb.set(id, { on: false, idx: -1, t: 0, fade: 0, delay: 0, from: new Map(), own: new Map(), list: [], level: 1, flash: false, seq: 0, hold: 0, tc: false, tcT: 0 }); return this.pb.get(id); }
  /** GO: next cue (dir 1), previous (−1) or a given cue index */
  go(id, dir = 1, to = null) {
    const P = store.get('playbacks', id); if (!P) return; const s = this.state(id);
    if (P.kind !== 'cuelist') { s.on = true; s.seq = this.seq++; s.t = 0; this.emit('pb'); return; }
    const cl = store.get('cuelists', P.ref); if (!cl || !cl.cues.length) return;
    let i = to != null ? to : s.idx + dir;
    if (i >= cl.cues.length) { if (cl.loop === false) return this.off(id); i = 0; }
    if (i < 0) i = cl.cues.length - 1;
    const cue = cl.cues[i], target = this.cueState(cl, i).slice(), has = new Set(target.map(e => e.k));
    for (const [k, v] of s.own) if (!has.has(k) && this.int[k >> 9][k & 511] && v > 0) target.push({ u: k >> 9, a: k & 511, v: 0, int: true, k });   // intensities the new cue drops fade out
    s.from = new Map(target.map(e => [e.k, s.own.has(e.k) ? s.own.get(e.k) : e.int ? 0 : this.live[e.u][e.a]]));
    s.list = target; s.idx = i; s.t = 0; s.fade = dir < 0 ? Math.min(cue.fade || 0, 500) : cue.fade || 0; s.delay = cue.delay || 0; s.hold = 0;
    if (!s.on) { s.on = true; s.seq = this.seq++; }
    this.emit('pb');
  }
  off(id) { const s = this.state(id); s.on = false; s.idx = -1; s.own.clear(); s.list = []; s.tc = false; if (s.audio) { s.audio.pause(); s.audio = null; } this.emit('pb'); }
  offAll() { for (const id of this.pb.keys()) this.off(id); }
  setLevel(id, v) { const s = this.state(id), P = store.get('playbacks', id); s.level = clamp(v, 0, 1);
    if (P && P.kind !== 'group') { if (v > 0 && !s.on) this.go(id); else if (v === 0 && s.on && !s.flash) this.off(id); } }
  flash(id, down) { const s = this.state(id); s.flash = down; if (down && !s.on) { this.go(id); s.flashed = true; } else if (!down && s.flashed) { s.flashed = false; this.off(id); } }
  /** run a cue list against the clock (and its audio file): cues with a time fire by themselves */
  async timecode(id, run) {
    const P = store.get('playbacks', id), s = this.state(id), cl = P && store.get('cuelists', P.ref); if (!cl) return;
    if (!run) { s.tc = false; if (s.audio) s.audio.pause(); this.emit('pb'); return; }
    this.off(id); s.tc = true; s.tcT = 0; s.on = true; s.seq = this.seq++;
    s.audio = await audioEl(cl.audio); if (s.audio) { s.audio.currentTime = 0; s.audio.play().catch(() => {}); }
    this.emit('pb');
  }

  /* ── one frame ── */
  tick(dt) {
    const S = store.show, U = this.out.length; this.time += dt;
    for (let u = 0; u < U; u++) { this.val[u].set(this.def[u]); this.hi[u].fill(0); this.mul[u].fill(1); }
    const fxOn = new Map();                                     // effect id → level
    const pbs = S.playbacks.map(P => [P, this.state(P.id)]).sort((a, b) => a[1].seq - b[1].seq);
    for (const [P, s] of pbs) {
      const level = s.flash ? 1 : s.level;
      if (P.kind === 'group') { const g = store.get('groups', P.ref); if (g && level < 1) for (const fid of g.fixtures) { const e = this.fx.get(fid); if (e) e.m.channels.forEach((c, i) => { if (c.grp === 'I' && e.base + i < 512) this.mul[e.f.universe][e.base + i] *= level; }); } continue; }
      if (!s.on) continue;
      if (P.kind === 'effect') { fxOn.set(P.ref, Math.max(fxOn.get(P.ref) || 0, level)); continue; }
      const cl = store.get('cuelists', P.ref); if (!cl) continue;
      if (s.tc) {                                               // timecode: fire the cues whose time has come
        const prev = s.tcT; s.tcT = s.audio && !s.audio.paused ? s.audio.currentTime * 1000 : s.tcT + dt;
        cl.cues.forEach((c, i) => { if (c.tc != null && c.tc >= prev && c.tc < s.tcT && i !== s.idx) this.go(P.id, 1, i); if (c.tc != null && c.tc === 0 && prev === 0 && s.idx < 0 && i === 0) this.go(P.id, 1, 0); });
      }
      if (s.idx < 0) continue;
      s.t += dt;
      const k = s.t < s.delay ? 0 : s.fade > 0 ? clamp((s.t - s.delay) / s.fade, 0, 1) : 1;
      for (const e of s.list) {
        const v = s.from.get(e.k) + (e.v - s.from.get(e.k)) * k; s.own.set(e.k, v);
        if (e.int) { if (v * level > this.hi[e.u][e.a]) this.hi[e.u][e.a] = v * level; } else this.val[e.u][e.a] = v;
      }
      for (const fid of cl.cues[s.idx].fx || []) fxOn.set(fid, Math.max(fxOn.get(fid) || 0, level));
      if (k >= 1 && !s.tc) {                                    // follow / wait triggers of the next cue
        const nx = cl.cues[s.idx + 1] || (cl.loop !== false ? cl.cues[0] : null);
        if (nx && nx !== cl.cues[s.idx] && (nx.trig === 'follow' || nx.trig === 'wait')) { s.hold += dt; if (s.hold >= (nx.trig === 'wait' ? nx.wait || 0 : 0)) this.go(P.id); }
      }
    }
    for (let u = 0; u < U; u++) { const v = this.val[u], hi = this.hi[u], it = this.int[u]; for (let a = 0; a < 512; a++) if (it[a] && hi[a] > 0) v[a] = hi[a]; }
    for (const [fid, level] of fxOn) this.runEffect(store.get('effects', fid), level);
    for (let u = 0; u < U; u++) { this.live[u].set(this.val[u]); this.touched[u].fill(0); }
    for (const e of this.cached('prog' + this.progRev, () => this.compile(this.prog))) { this.val[e.u][e.a] = e.v; this.touched[e.u][e.a] = 1; }
    if (this.highlight) for (const id of this.sel) { const e = this.fx.get(id); if (e) e.m.channels.forEach((c, i) => { if (c.grp === 'I' && e.base + i < 512) this.val[e.f.universe][e.base + i] = 255; }); }
    const g = this.blackout ? 0 : this.gm;
    for (let u = 0; u < U; u++) {
      const v = this.val[u], out = this.out[u], it = this.int[u], fn = this.fine[u], mul = this.mul[u];
      for (let a = 0; a < 512; a++) { let x = v[a]; if (it[a]) x *= g * mul[a]; out[a] = x; v[a] = x; }
      for (let a = 0; a < 512; a++) if (fn[a] >= 0) { const x = Math.min(255.996, v[a] + (this.touched[u][fn[a]] || v[fn[a]] ? v[fn[a]] / 256 : 0)); out[a] = Math.floor(x); out[fn[a]] = Math.floor((x - Math.floor(x)) * 256); }
    }
    this.frames++;
  }
  /** effect targets: one item per fixture head */
  items(E) {
    return this.cached('fx' + E.id, () => {
      const out = [];
      for (const fid of E.fixtures || []) { const e = this.fx.get(fid); if (!e) continue;
        const heads = [...new Set(e.m.channels.filter(c => c.head > 0).map(c => c.head))];
        for (const hd of heads.length ? heads : [0]) {
          const addr = base => { const c = e.m.channels.find(x => x.base === base && (x.head === hd || x.head === 0 && !e.m.channels.some(y => y.base === base && y.head === hd))); return c ? e.base + e.m.index[c.key] : -1; };
          const mix = mixOf(e.f).find((k, i) => (heads.length ? i === heads.indexOf(hd) : true));
          out.push({ u: e.f.universe, f: e.f, hd, addr, mix, a: {} });
        } }
      return out;
    });
  }
  runEffect(E, level) {
    if (!E) return; const its = this.items(E), n = its.length; if (!n) return;
    const t = this.time * (E.rate || 30) / 60000, size = (E.size ?? 100) * level, dirn = E.dir === 'backward' ? -1 : 1;
    its.forEach((it, i) => {
      const p = dirn * t + (n > 1 ? (i / n) * ((E.spread ?? 0) / 360) : 0), v = this.val[it.u];
      const A = b => (b in it.a ? it.a[b] : (it.a[b] = it.addr(b))), add = (b, d) => { const a = A(b); if (a >= 0 && a < 512) v[a] = clamp(v[a] + d); };
      switch (E.type) {
        case 'dimmer': { for (const b of ['dim', 'dimmer']) { const a = A(b); if (a >= 0 && (b === 'dim' || it.hd === 0)) { v[a] = clamp((E.center ?? 127) + wave(E.wave, p, n) * size) * (b === 'dim' ? level : level); break; } } break; }
        case 'circle': add('pan', Math.cos(p * Math.PI * 2) * size); add('tilt', Math.sin(p * Math.PI * 2) * size); break;
        case 'eight': add('pan', Math.cos(p * Math.PI * 2) * size); add('tilt', Math.sin(p * Math.PI * 4) * size * 0.6); break;
        case 'rainbow': { if (it.mix) { const c = hsv(((p % 1) + 1) % 1, 1, 1), k = it.mix, m = this.fx.get(it.f.id).m, at = key => this.fx.get(it.f.id).base + m.index[key];
          if (k.type === 'rgb') { v[at(k.r)] = c[0]; v[at(k.g)] = c[1]; v[at(k.b)] = c[2]; } else { v[at(k.cyan)] = 255 - c[0]; v[at(k.magenta)] = 255 - c[1]; v[at(k.yellow)] = 255 - c[2]; } } break; }
        default: add(E.type, wave(E.wave, p, n) * size);
      }
    });
  }
}
