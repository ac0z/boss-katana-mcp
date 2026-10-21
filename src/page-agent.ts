export interface Leaf { bid: string; pid: string; name: string; size: number; ofs: number; min: number; max: number }
export interface AgentStatus { connected: boolean; patchName: string; colors: number[] }
export interface WriteChange { pid: string; value: number }

/**
 * Runs inside the BTS WebView page (plain ES5-ish JS, no imports).
 * Uses BTS globals: AddressMap, Parameter, $native, _7bitize, hex2, STX, ROLAND, DT1, EOX,
 * ProductSetting, INTEGER* size constants, currentMIDIConnect.
 */
export const PAGE_AGENT_SOURCE = String.raw`(function () {
  if (window.__katanaClaude && window.__katanaClaude.v === 1) return;
  var leaves = null, byPid = {};

  function bytesOf(size) {
    if (size === INTEGER2x4 || size === INTEGER2x7) return 2;
    if (size === INTEGER4x4) return 4;
    return 1;
  }

  function index() {
    if (leaves) return leaves;
    leaves = [];
    var root = new AddressMap().root;
    var patch = root.filter(function (b) { return b.name === 'PATCH'; })[0];
    patch.child.forEach(function (blk) {
      var bid = 'PATCH%' + blk.name;
      blk.child.forEach(function (p) {
        if (p.size < INTEGER1x1) return; // string params (patch name)
        var leaf = { bid: bid, pid: bid + '%' + p.addr, name: p.name, size: p.size, ofs: p.ofs, min: p.min, max: p.max };
        leaves.push(leaf);
        byPid[leaf.pid] = leaf;
      });
    });
    return leaves;
  }

  function leafOf(pid) {
    index();
    var l = byPid[pid];
    if (!l) throw new Error('unknown pid ' + pid);
    return l;
  }

  function read(pids) {
    var out = {};
    pids.forEach(function (pid) { var l = leafOf(pid); out[pid] = Parameter.value(pid, l.size, l.ofs); });
    return out;
  }

  // Replays the bytes now in Parameter's buffer as an incoming DT1, so BTS redraws the UI.
  function mirrorToUi(l) {
    var off = parseInt(l.pid.split('%').pop(), 10);
    var data = Parameter.paramSet[l.bid].slice(off, off + bytesOf(l.size)).join('');
    var addr = _7bitize(Parameter.getblock(l.bid).addr + off).toString(16).toUpperCase();
    while (addr.length < 8) addr = '0' + addr;
    var sum = 0, body = addr + data;
    for (var i = 0; i < body.length; i += 2) sum += parseInt(body.substr(i, 2), 16);
    var msg = STX + ROLAND + ProductSetting.deviceId + ProductSetting.modelId + DT1 + body + hex2((128 - (sum % 128)) & 0x7f) + EOX;
    $native.midi.event.message(msg, 0);
  }

  function write(changes) {
    var ls = changes.map(function (c) { return leafOf(c.pid); });
    changes.forEach(function (c, i) {
      Parameter.setValue(c.pid, ls[i].size, ls[i].ofs, c.value); // DT1 to the amp
      mirrorToUi(ls[i]);
    });
    return read(changes.map(function (c) { return c.pid; }));
  }

  function status() {
    var name = Parameter.paramSet['PATCH%COM'].map(function (h) { return String.fromCharCode(parseInt(h, 16)); }).join('').trim();
    var colors = [0, 1, 2, 3, 4].map(function (i) { return Parameter.value('PATCH%COLOR%' + i, INTEGER1x7, 0); });
    return { connected: window.currentMIDIConnect != null, patchName: name, colors: colors };
  }

  window.__katanaClaude = { v: 1, index: index, read: read, write: write, status: status };
})();`;

export function agentCall(method: 'index' | 'read' | 'write' | 'status', arg?: unknown): string {
  const args = arg === undefined ? '' : JSON.stringify(arg);
  return `${PAGE_AGENT_SOURCE}\nwindow.__katanaClaude.${method}(${args})`;
}
