/*!
 * 超时判负测试: 验证客户端 60s 倒计时归零 → POST /api/timeout → 判负广播
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
  await new Promise(r => setTimeout(r, 600));

  // 1. 开局轮到红方, 红方 timeout 应成功 (判红负, 黑胜)
  const t1 = await api('timeout', { room, sid: j1.sid });
  assert(t1.ok, '轮到红方时上报 timeout 成功');
  await new Promise(r => setTimeout(r, 600));

  const last1 = states1[states1.length - 1];
  const last2 = states2[states2.length - 1];
  assert(last1.status === 'black_win', '红方视角 status=black_win');
  assert(last2.status === 'black_win', '黑方视角 status=black_win');
  assert(last1.winner === j2.sid, '红方收到 winner=j2.sid (黑方胜)');
  assert(last2.winner === j2.sid, '黑方收到 winner=j2.sid');
  assert(last1.reason === 'timeout', 'reason=timeout');

  // 2. 终局后 timeout 被拒
  const t2 = await api('timeout', { room, sid: j1.sid });
  assert(!t2.ok, '终局后 timeout 被拒');
  const t3 = await api('timeout', { room, sid: j2.sid });
  assert(!t3.ok, '非超时方终局后 timeout 被拒');

  es1.removeAllListeners(); es2.removeAllListeners();
  console.log(`\n超时判负: ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });