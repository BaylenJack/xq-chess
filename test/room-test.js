/*!
 * 房间系统端到端联调测试: 模拟两个客户端完整对局
 * 用法: node test/room-test.js (需先启动服务器)
 */
'use strict';

const BASE = process.env.XQ_TEST_URL || 'http://localhost:8280';

async function api(path, body) {
  const r = await fetch(`${BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, ...data };
}

// 简易 SSE 客户端 (Node 无内置 EventSource)
function sseClient(url, handlers) {
  const { EventEmitter } = require('events');
  const ee = new EventEmitter();
  const mod = url.startsWith('https') ? require('https') : require('http');
  const u = new URL(url);
  const req = mod.request(u, { headers: { Accept: 'text/event-stream' } }, res => {
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
  // 真正断开连接 (供测试模拟玩家退出)
  ee.destroy = () => req.destroy();
  return ee;
}

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; } else { failed++; console.error('  ✗ ' + msg); } }

async function main() {
  const room = 'roomtest-' + Math.random().toString(36).slice(2, 8);
  console.log(`== 房间联调: ${room} ==`);

  // 1. 红方加入
  const r1 = await api('join', { room, name: '小红' });
  assert(r1.ok && r1.side === 1, '红方加入成功, side=1');
  assert(r1.players.length === 1, '加入后 1 名玩家');

  // 2. 黑方加入
  const r2 = await api('join', { room, name: '小黑' });
  assert(r2.ok && r2.side === -1, '黑方加入成功, side=-1');
  assert(r2.players.length === 2, '加入后 2 名玩家');

  // 3. 第三人被拒
  const r3 = await api('join', { room, name: '老三' });
  assert(!r3.ok && r3.status === 409, '第三人加入被拒 (409)');

  // 4. 流式连接 (SSE) — 先注册监听再等初始 state (初始 state 连接即推送)
  let states1 = [], states2 = [];
  const es1 = sseClient(`${BASE}/api/stream?room=${room}&sid=${r1.sid}`, {});
  const es2 = sseClient(`${BASE}/api/stream?room=${room}&sid=${r2.sid}`, {});
  es1.on('state', ev => { states1.push(JSON.parse(ev.data)); });
  es2.on('state', ev => { states2.push(JSON.parse(ev.data)); });
  await new Promise(res => setTimeout(res, 800));

  assert(states1.length >= 1 && states1[0].map, '红方收到初始 state');
  assert(states2.length >= 1 && states2[0].map, '黑方收到初始 state');

  // 5. 红方走棋 (炮 2,1 → 6,1)
  const m1 = await api('move', { room, sid: r1.sid, mv: { fr: { r: 2, c: 1 }, to: { r: 6, c: 1 } } });
  assert(m1.ok, '红方走炮 2,1→6,1 成功');
  await new Promise(res => setTimeout(res, 400));

  // 6. 黑方非法走棋 (黑方回合, 但红方再走)
  const m2 = await api('move', { room, sid: r1.sid, mv: { fr: { r: 3, c: 0 }, to: { r: 4, c: 0 } } });
  assert(!m2.ok, '红方在不是自己回合时被拒');

  // 7. 黑方走棋 (马 9,1 → 7,0)
  const m3 = await api('move', { room, sid: r2.sid, mv: { fr: { r: 9, c: 1 }, to: { r: 7, c: 0 } } });
  assert(m3.ok, '黑方走马 9,1→7,0 成功');
  await new Promise(res => setTimeout(res, 400));

  // 8. 非法走法被拒 (车斜走)
  const m4 = await api('move', { room, sid: r1.sid, mv: { fr: { r: 0, c: 0 }, to: { r: 1, c: 1 } } });
  assert(!m4.ok, '非法走法 (车斜走) 被拒');

  // 9. 状态同步一致
  assert(states1.length >= 3, `红方收到 ${states1.length} 个 state`);
  const last1 = states1[states1.length - 1];
  const last2 = states2[states2.length - 1];
  assert(last1.history.length === 2 && last2.history.length === 2, '双方 history 各 2 手');
  assert(JSON.stringify(last1.map) === JSON.stringify(last2.map), '双方棋盘一致');
  assert(last1.turn === 1, '轮到红方');

  // 10. 悔棋 (协商制: 请求 → 对方同意 → 悔请求者自己的上一步)
  const u1 = await api('undo', { room, sid: r2.sid });
  assert(u1.ok, '悔棋请求成功');
  await new Promise(res => setTimeout(res, 300));
  const u2 = await api('undo-confirm', { room, sid: r1.sid });
  assert(u2.ok, '对方同意悔棋');
  await new Promise(res => setTimeout(res, 400));
  const afterUndo = states1[states1.length - 1];
  // 黑 (r2) 请求 → 撤黑自己的 1 手 (黑最后走) → history 剩 1
  assert(afterUndo.history.length === 1, `悔棋后 history 剩 1 (实际 ${afterUndo.history.length})`);
  assert(afterUndo.turn === -1, '悔棋后轮到黑方 (请求者)');

  // 11. 重开
  const rs1 = await api('restart', { room, sid: r1.sid });
  assert(rs1.ok, '重开成功');
  await new Promise(res => setTimeout(res, 400));
  const afterRestart = states1[states1.length - 1];
  const initMoves = afterRestart.map.flat().filter(Boolean).length;
  assert(initMoves === 32, `重开后棋盘 32 子 (实际 ${initMoves})`);
  assert(afterRestart.history.length === 0 && afterRestart.turn === 1, '重开后轮到红方');

  // 12. 倒计时面板开关: 一方 toggle → 双方收到 clockVisible 同步
  const states1Before = states1.length;
  const ct = await api('clock-toggle', { room, sid: r1.sid });
  assert(ct.ok && ct.clockVisible === true, 'clock-toggle 成功且返回 true');
  await new Promise(res => setTimeout(res, 400));
  assert(states1.length > states1Before, 'toggle 后双方收到新 state');
  assert(states1[states1.length - 1].clockVisible === true, '红方 state 同步 clockVisible=true');
  assert(states2[states2.length - 1].clockVisible === true, '黑方 state 同步 clockVisible=true');
  // 再 toggle 回来
  await api('clock-toggle', { room, sid: r2.sid });
  await new Promise(res => setTimeout(res, 400));
  assert(states1[states1.length - 1].clockVisible === false, '再 toggle 后双方 clockVisible=false');

  // 13. 退出重进: 颜色补空缺而非按人数 (防死局)
  const room2 = 'roomtest-re-' + Math.random().toString(36).slice(2, 8);
  const re1 = await api('join', { room: room2, name: '先入' });
  assert(re1.side === 1, 'room2 先入 = 红');
  const re2 = await api('join', { room: room2, name: '后入' });
  assert(re2.side === -1, 'room2 后入 = 黑');
  // 先入者 (红) 的 stream 断开 → 模拟退出
  const esRe1 = sseClient(`${BASE}/api/stream?room=${room2}&sid=${re1.sid}`, {});
  await new Promise(res => setTimeout(res, 300));
  esRe1.destroy && esRe1.destroy();   // 断开 stream → 服务端清理该玩家
  await new Promise(res => setTimeout(res, 500));
  // 先入者重进 → 应补红方空缺 (而非按人数判黑)
  const re3 = await api('join', { room: room2, name: '先入' });
  assert(re3.ok, '重进成功');
  assert(re3.side === 1, `重进补红方空缺 (实际 side=${re3.side})`);
  // 现在应两人齐全: 红(重进者) + 黑(后入者), 无颜色冲突
  assert(re3.players.length === 2, '重进后房间 2 人');
  const sides = re3.players.map(p => p.side).sort();
  assert(JSON.stringify(sides) === JSON.stringify([-1, 1]), '房间颜色不冲突 (红+黑各一)');

  es1.removeAllListeners(); es2.removeAllListeners();
  es1.destroy && es1.destroy(); es2.destroy && es2.destroy();
  console.log(`\n房间联调: ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
