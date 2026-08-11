/*!
 * 超时判负测试 (服务端权威计时版):
 *  - state 广播含 clock (deadline 为未来时间戳)
 *  - 未到时间上报 timeout 被拒
 *  - 时间到后上报 timeout 判负
 *  - 服务端自判超时 (不调用 API, 等 server 自动判负)
 * 用法: 先 CLOCK_SECONDS=1 node server.js 启动, 再 XQ_TEST_URL=http://localhost:8280 node test/timer-test.js
 */
'use strict';

const BASE = process.env.XQ_TEST_URL || 'http://localhost:8280';

function sseClient(url) {
  const { EventEmitter } = require('events');
  const mod = url.startsWith('https') ? require('https') : require('http');
  const ee = new EventEmitter();
  const req = mod.request(new URL(url), { headers: { Accept: 'text/event-stream' } }, res => {
    res.setEncoding('utf8');
    let buf = '';
    res.on('data', chunk => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
        let event = 'message', data = '';
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        ee.emit(event, { data });
      }
    });
  });
  req.on('error', () => {});
  req.end();
  return ee;
}

async function api(path, body) {
  const r = await fetch(`${BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, ...data };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }

async function main() {
  const room = 'timeout-' + Math.random().toString(36).slice(2, 8);
  console.log(`== 超时判负: ${room} ==`);

  const j1 = await api('join', { room, name: '红' });
  const j2 = await api('join', { room, name: '黑' });
  assert(j1.ok && j2.ok, '双人加入');

  const es1 = sseClient(`${BASE}/api/stream?room=${room}&sid=${j1.sid}`);
  const es2 = sseClient(`${BASE}/api/stream?room=${room}&sid=${j2.sid}`);
  const states1 = [], states2 = [];
  es1.on('state', ev => states1.push(JSON.parse(ev.data)));
  es2.on('state', ev => states2.push(JSON.parse(ev.data)));
  await sleep(600);

  // 1. state 广播含 clock (权威倒计时)
  const s0 = states1[states1.length - 1];
  assert(s0 && s0.clock && typeof s0.clock.deadline === 'number', 'state 含 clock.deadline');
  assert(s0 && s0.clock.on === true, '开局 clock.on = true');
  assert(s0 && s0.clock.deadline > Date.now(), 'deadline 是未来时间戳');

  // 2. 未到时间上报 timeout 被拒
  const tEarly = await api('timeout', { room, sid: j1.sid });
  assert(!tEarly.ok, '未到时间上报 timeout 被拒');

  // 3. 时间到后上报 timeout 成功 (CLOCK_SECONDS=1)
  await sleep(1500);
  const t1 = await api('timeout', { room, sid: j1.sid });
  assert(t1.ok, '时间到后红方上报 timeout 成功');
  await sleep(600);

  const last1 = states1[states1.length - 1];
  const last2 = states2[states2.length - 1];
  assert(last1.status === 'black_win', '红方视角 status=black_win');
  assert(last2.status === 'black_win', '黑方视角 status=black_win');
  assert(last1.winner === j2.sid, '红方收到 winner=j2.sid (黑方胜)');
  assert(last2.winner === j2.sid, '黑方收到 winner=j2.sid');
  assert(last1.reason === 'timeout', 'reason=timeout');

  // 4. 终局后 timeout 被拒
  const t2 = await api('timeout', { room, sid: j1.sid });
  assert(!t2.ok, '终局后 timeout 被拒');

  // 5. 服务端自判超时 (新房间, 不调用 API, 等 server 自己判负)
  const room2 = 'timeout-auto-' + Math.random().toString(36).slice(2, 8);
  const a1 = await api('join', { room: room2, name: '红' });
  const a2 = await api('join', { room: room2, name: '黑' });
  const es3 = sseClient(`${BASE}/api/stream?room=${room2}&sid=${a1.sid}`);
  const states3 = [];
  es3.on('state', ev => states3.push(JSON.parse(ev.data)));
  await sleep(600);
  // 开局红方走子, 然后不操作 → 服务端应在 ~1.5s 后自动判红负
  await api('move', { room: room2, sid: a1.sid, mv: { fr: { r: 6, c: 4 }, to: { r: 5, c: 4 } } });
  await sleep(3500);
  const autoLast = states3[states3.length - 1];
  assert(autoLast.status === 'black_win', '服务端自判超时: 红负黑胜');
  assert(autoLast.reason === 'timeout', '自判 reason=timeout');

  es1.removeAllListeners(); es2.removeAllListeners(); es3.removeAllListeners();
  console.log(`\n超时判负: ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
