// outputs.js — where the universes go. Each universe picks one line (Setup → Universes):
//   cable   Virtual DMX cable: a BroadcastChannel every page of the same origin can read. The Wincode simulator and its
//           stage page listen on it, so the studio drives the 3D fixtures with no server at all.
//   artnet  Art-Net 4 / sacn  sACN (E1.31): a browser cannot send UDP, so the frames go to a bridge over WebSocket
//           (the simulator's server, or `npm start` of this project) which transmits them. Frame = [3, proto, universe lo,
//           universe hi, host length, host…, 512 slots].
//   serial  ENTTEC DMX USB Pro compatible widget through Web Serial (Chrome / Edge): one universe, straight from the page.
//  Other transports plug in the same way: a line is { send(index, universeConfig, data) }.
import { store } from './store.js';

export const CABLE = 'wmh-dmx';           // channel name shared with the Wincode simulator
export const LINES = { none: 'Off', cable: 'Virtual DMX cable', artnet: 'Art-Net (bridge)', sacn: 'sACN / E1.31 (bridge)', serial: 'DMX USB Pro (Web Serial)' };

export class Outputs {
  constructor(engine) {
    this.engine = engine; this.bc = new BroadcastChannel(CABLE); this.id = 'wdx-' + Math.random().toString(36).slice(2);
    this.ws = null; this.wsUrl = ''; this.port = null; this.writer = null; this.busy = false; this.enc = new TextEncoder(); this.sent = 0;
  }
  bridgeOnline() { return !!this.ws && this.ws.readyState === 1; }
  /** keep the bridge connection alive while a universe needs it */
  bridge() {
    const need = store.show.universes.some(u => u.out === 'artnet' || u.out === 'sacn'), url = store.show.settings.bridge || '';
    if (!need || !url) { if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; } return; }
    if (this.ws && this.wsUrl === url && this.ws.readyState <= 1) return;
    if (this.retry && performance.now() < this.retry) return;
    this.retry = performance.now() + 2000; this.wsUrl = url;
    try { this.ws = new WebSocket(url); this.ws.binaryType = 'arraybuffer'; this.ws.onerror = () => {}; } catch (e) { this.ws = null; }
  }
  async connectSerial() {
    if (!navigator.serial) throw new Error('Web Serial is not available in this browser (use Chrome or Edge).');
    this.port = await navigator.serial.requestPort(); await this.port.open({ baudRate: 250000, dataBits: 8, stopBits: 2, parity: 'none' });
    this.writer = this.port.writable.getWriter();
  }
  async disconnectSerial() { try { this.writer && this.writer.releaseLock(); this.port && await this.port.close(); } catch (e) {} this.port = this.writer = null; }
  send() {
    this.bridge();
    store.show.universes.forEach((u, i) => {
      const data = this.engine.out[i]; if (!data || u.out === 'none') return;
      if (u.out === 'cable') this.bc.postMessage({ t: 'dmx', from: this.id, u: u.outUniverse | 0, data: data.slice() });
      else if (u.out === 'serial') { if (this.writer && !this.busy) {          // ENTTEC Pro "Output Only Send DMX" packet: 7E 06 len lo hi | 00 + slots | E7
        const b = new Uint8Array(518); b[0] = 0x7e; b[1] = 6; b[2] = 513 & 255; b[3] = 513 >> 8; b[4] = 0; b.set(data, 5); b[517] = 0xe7;
        this.busy = true; this.writer.write(b).catch(() => {}).finally(() => { this.busy = false; }); } }
      else if (this.bridgeOnline()) {
        const host = this.enc.encode(u.host || '127.0.0.1'), b = new Uint8Array(5 + host.length + 512);
        b[0] = 3; b[1] = u.out === 'sacn' ? 1 : 0; b[2] = u.outUniverse & 255; b[3] = (u.outUniverse >> 8) & 255; b[4] = host.length; b.set(host, 5); b.set(data, 5 + host.length);
        this.ws.send(b);
      }
    });
    this.sent++;
  }
  /** one line for the top bar */
  status() {
    const us = store.show.universes, on = us.filter(u => u.out !== 'none'), net = on.some(u => u.out === 'artnet' || u.out === 'sacn'), ser = on.some(u => u.out === 'serial');
    const bad = (net && !this.bridgeOnline()) || (ser && !this.writer);
    return { ok: on.length > 0 && !bad, text: !on.length ? 'No output' : `${on.length} / ${us.length} universes out${net && !this.bridgeOnline() ? ' · bridge offline' : ''}${ser && !this.writer ? ' · serial not connected' : ''}` };
  }
}
