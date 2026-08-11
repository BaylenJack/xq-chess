/*!
 * xq-chess 服务器 (零依赖 Node http)
 * - 静态文件服务 (public/)
 * - 房间对战: 输入相同房间名即可同玩 (先到先得: 先入红, 后入黑)
 * - 服务端权威校验走法 (加载 Node 版 rules.js), 通过 SSE 广播状态
 * - 专属链接门控: ?hint=KEY 才在首页注入 <script src="/js/hint.js">
 * - 密钥来源: 环境变量 HINT_KEY > secret.txt 首行; 都没有则门控禁用
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = process.env.PORT || 8280;

// ---- 规则引擎 (服务端权威) ----
const { rules } = require(path.join(PUBLIC, 'js', 'rules.js'));
const RED = 1, BLACK = -1;
const PLAYING = 'playing', RED_WIN = 'red_win', BLACK_WIN = 'black_win';
const CLOCK_SECONDS = Number(process.env.CLOCK_SECONDS) || 60;   // 单方步时 (秒), 走子后重置 (测试可缩短)

// ---- 密钥 ----
function loadKey() {
  if (process.env.HINT_KEY) return process.env.HINT_KEY.trim();
  try {
    const txt = fs.readFileSync(path.join(ROOT, 'secret.txt'), 'utf8');
    const line = txt.split(/\r?\n/).find(l => l.trim() && !l.trim().startsWith('#'));
    if (line) return line.trim();
  } catch (e) { /* 无 secret.txt */ }
  return null;
}
const HINT_KEY = loadKey();
if (!HINT_KEY) console.warn('⚠  未设置 HINT_KEY / secret.txt — 提示功能门控已禁用');

function safeEqual(a, b) {
  if (!HINT_KEY) return false;
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(HINT_KEY).digest();
  return crypto.timingSafeEqual(ha, hb);
}
const HINT_COOKIE = 'xq_hint_ok';
// 验证 hint 权限: URL 带密钥 或 已有授权 cookie
function authed(req, url) {
  if (!HINT_KEY) return false;
  // 1. URL 带密钥 (首次访问)
  const given = url && url.searchParams && url.searchParams.get('hint');
  if (given && safeEqual(given, HINT_KEY)) return true;
  // 2. 授权 cookie (已通过验证的会话)
  const ck = String((req && req.headers && req.headers.cookie) || '');
  return ck.includes(HINT_COOKIE + '=1');
}

// ---- 房间管理 (内存) ----
const rooms = new Map();   // room -> roomState
const EMPTY_TIMEOUT = 10 * 60 * 1000;      // 空房 10 分钟清理
const SOLO_TIMEOUT = 30 * 60 * 1000;       // 单人占房 30 分钟清理 (防止漏连接占房)

function clearRoomTimers(rs) {
  if (rs.emptyTimer) { clearTimeout(rs.emptyTimer); rs.emptyTimer = null; }
  if (rs.soloTimer) { clearTimeout(rs.soloTimer); rs.soloTimer = null; }
}
function scheduleRoomCleanup(rs) {
  clearRoomTimers(rs);
  const n = rs.players.size;
  if (n === 0) {
    rs.emptyTimer = setTimeout(() => rooms.delete(rs.name), EMPTY_TIMEOUT);
  } else if (n === 1) {
    rs.soloTimer = setTimeout(() => { if (rooms.get(rs.name) && rooms.get(rs.name).players.size === 1) rooms.delete(rs.name); }, SOLO_TIMEOUT);
  }
}

function roomState(room) {
  if (!rooms.has(room)) {
    const rs = {
      name: room,
      players: new Map(),   // sid -> {sid, name, side, stream}
      map: rules.initMap(),
      turn: RED,
      history: [],
      status: PLAYING,
      check: false,
      lastMove: null,
      clock: { deadline: 0, on: false },   // 服务端权威倒计时: 走子后重置
      clockVisible: false,                 // 倒计时面板显隐 (服务端广播, 双方同步)
      emptyTimer: null,
      soloTimer: null,
    };
    scheduleRoomCleanup(rs);  // 空房 10 分钟后清理
    rooms.set(room, rs);
  }
  return rooms.get(room);
}

function isFull(rs) { return rs.players.size >= 2; }

// 广播状态给房内所有玩家
function broadcast(rs, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const p of rs.players.values()) {
    try { p.stream.write(payload); } catch (e) { /* 客户端断开 */ }
  }
}

// 倒计时: 重置 (走子/开局/悔棋/重开后调用); 附带服务端自判超时 (客户端断线也能判负)
function resetClock(rs) {
  if (rs.clockTimer) { clearTimeout(rs.clockTimer); rs.clockTimer = null; }
  const deadline = Date.now() + CLOCK_SECONDS * 1000;
  rs.clock = { deadline, on: true };
  rs.clockTimer = setTimeout(() => {
    if (rs.status !== PLAYING || !rs.clock.on) return;
    if (Date.now() < rs.clock.deadline) return;
    // 轮到谁谁超时
    const loser = rs.turn;
    const winner = -loser;
    rs.status = winner === RED ? RED_WIN : BLACK_WIN;
    rs.clock.on = false;
    const winnerSid = [...rs.players.values()].find(p => p.side === winner)?.sid || null;
    broadcast(rs, 'state', view(rs, 0, { winner: winnerSid, reason: 'timeout' }));
  }, CLOCK_SECONDS * 1000 + 2000);   // +2s 缓冲, 让客户端上报优先 (双保险)
}

// 组装发给单个玩家的视图 (隐藏对方无关信息)
function view(rs, forSide, extra) {
  return {
    room: rs.name,
    map: rs.map,
    turn: rs.turn,
    status: rs.status,
    check: rs.check,
    history: rs.history.map(h => ({ mv: h.mv, captured: h.captured })),
    lastMove: rs.lastMove,
    you: forSide,
    players: [...rs.players.values()].map(p => ({ name: p.name, side: p.side })),
    clock: { deadline: rs.clock.deadline, on: rs.clock.on },   // 权威倒计时
    clockVisible: rs.clockVisible,   // 倒计时面板显隐 (同步)
    ...(extra || {}),
  };
}

// 执行走法 (服务端权威校验)
function tryMove(rs, side, mv) {
  if (rs.status !== PLAYING) return { ok: false, reason: '对局已结束' };
  if (rs.turn !== side) return { ok: false, reason: '还没轮到你' };
  // 坐标合法性校验 (防恶意/错误请求崩溃)
  const fr = mv.fr, to = mv.to;
  if (!fr || !to) return { ok: false, reason: '参数错误' };
  const frR = Number(fr.r), frC = Number(fr.c), toR = Number(to.r), toC = Number(to.c);
  if (!Number.isInteger(frR) || !Number.isInteger(frC) || !Number.isInteger(toR) || !Number.isInteger(toC)) {
    return { ok: false, reason: '非法坐标' };
  }
  if (frR < 0 || frR > 9 || frC < 0 || frC > 8 || toR < 0 || toR > 9 || toC < 0 || toC > 8) {
    return { ok: false, reason: '坐标越界' };
  }
  const piece = rs.map[frR][frC];
  if (!piece || (rules.isRed(piece) ? 1 : -1) !== side) return { ok: false, reason: '非法走法' };
  const legal = rules.legalMovesFrom(rs.map, { r: frR, c: frC });
  const found = legal.find(m => m.to.r === toR && m.to.c === toC);
  if (!found) return { ok: false, reason: '非法走法' };

  const captured = rules.makeMove(rs.map, found);
  rs.history.push({ mv: found, captured });
  rs.lastMove = { mv: found, captured };

  // 胜负判定
  const opp = -side;
  let status = PLAYING;
  if (!rules.findKing(rs.map, side)) status = side === RED ? BLACK_WIN : RED_WIN;
  else if (!rules.hasLegalMoves(rs.map, opp)) status = opp === RED ? BLACK_WIN : RED_WIN;
  rs.status = status;
  if (status === PLAYING) {
    rs.turn = opp;
    rs.check = rules.inCheck(rs.map, opp);
  } else {
    rs.check = false;
  }
  return { ok: true, captured: !!captured, gameOver: status !== PLAYING };
}

// ---- 静态文件服务 ----
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};
const BLOCKED = new Set(['secret.txt', '.gitignore', 'server.js', 'package.json', 'README.md']);

function injectHint(html) {
  return html.replace('</body>',
    `<script src="/js/hint.js?v=18"></script></body>`);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (e) {
    console.error('[error]', req.method, req.url, e.message);
    if (!res.headersSent) json(res, 500, { error: '服务器内部错误' });
    else res.end();
  }
});

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // ---- API ----
  if (url.pathname.startsWith('/api/')) {
    const body = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : {};
    const q = Object.fromEntries(url.searchParams);
    const room = String(q.room || body.room || '').trim().slice(0, 32);
    if (!room) return json(res, 400, { error: '缺少房间名' });

    // 加入房间
    if (url.pathname === '/api/join' && req.method === 'POST') {
      const name = String(body.name || '玩家').trim().slice(0, 12) || '玩家';
      const sid = crypto.randomBytes(8).toString('hex');
      const rs = roomState(room);
      // 清理僵尸连接: 房间已满时, 踢出 stream 已断开的玩家 (退出后立即重进的场景)
      if (rs.players.size >= 2) {
        for (const [psid, p] of [...rs.players]) {
          if (p.stream && (p.stream.destroyed || p.stream.writableEnded)) {
            console.log(`[join] 清理僵尸 ${psid}`);
            rs.players.delete(psid);
          }
        }
      }
      if (isFull(rs)) return json(res, 409, { error: '房间已满' });
      // 按已占颜色分配: 红方空缺 → 红, 否则 → 黑 (防止重进撞角色死局)
      const hasRed = [...rs.players.values()].some(p => p.side === RED);
      const side = hasRed ? BLACK : RED;
      rs.players.set(sid, { sid, name, side, stream: null });
      scheduleRoomCleanup(rs);  // 加入后重排清理 (2 人 → 不再清理)
      json(res, 200, { sid, side, room, name, players: [...rs.players.values()].map(p => ({ name: p.name, side: p.side })) });
      // 第二人加入 → 开局, 通知两人 (用 setImmediate 等两人的 stream 连接好, 避免丢消息)
      if (rs.players.size === 2) {
        rs.map = rules.initMap(); rs.turn = RED; rs.history = []; rs.status = PLAYING; rs.check = false; rs.lastMove = null;
        resetClock(rs);
        setImmediate(() => broadcast(rs, 'start', { players: [...rs.players.values()].map(p => ({ name: p.name, side: p.side })) }));
      }
      return;
    }

    const sid = String(q.sid || body.sid || '');
    const rs = rooms.get(room);
    const me = rs && rs.players.get(sid);
    if (!me) return json(res, 403, { error: '未加入房间或房间不存在' });

    // SSE 推送流
    if (url.pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write(`retry: 2000\n\n`);
      // 旧连接清理: 若该 sid 已有 stream (重复连接), 先关掉旧的
      if (me.stream && me.stream !== res) {
        try { me.stream.end(); } catch (e) {}
      }
      me.stream = res;
      // 立即推送当前状态
      res.write(`event: state\ndata: ${JSON.stringify(view(rs, me.side))}\n\n`);
      req.on('close', () => {
        // 仅当这是当前有效的 stream 时才清理 (防止旧连接 close 误删新连接的玩家)
        if (rs.players.get(sid) && rs.players.get(sid).stream === res) {
          rs.players.delete(sid);
          me.stream = null;
          // 只剩一人 → 通知剩余玩家等待
          if (rs.players.size === 1) {
            const rest = [...rs.players.values()][0];
            try { rest.stream.write(`event: peer_left\ndata: ${JSON.stringify({ message: '对手离开了' })}\n\n`); } catch (e) {}
          }
          scheduleRoomCleanup(rs);
        }
      });
      return;
    }

    // 走棋
    if (url.pathname === '/api/move' && req.method === 'POST') {
      const mv = body.mv;
      if (!mv || !mv.fr || !mv.to) return json(res, 400, { error: '参数错误' });
      const res2 = tryMove(rs, me.side, mv);
      if (!res2.ok) return json(res, 400, { error: res2.reason });
      resetClock(rs);
      broadcast(rs, 'state', view(rs, 0));
      return json(res, 200, { ok: true });
    }

    // 悔棋 (双方同意制: 任一玩家请求即撤一轮)
    if (url.pathname === '/api/undo' && req.method === 'POST') {
      if (rs.history.length === 0) return json(res, 400, { error: '没有可悔的棋' });
      const n = Math.min(2, rs.history.length);
      for (let i = 0; i < n; i++) {
        const rec = rs.history.pop();
        rules.undoMove(rs.map, rec.mv, rec.captured);
      }
      rs.status = PLAYING; rs.check = false;
      rs.lastMove = rs.history.length ? rs.history[rs.history.length - 1] : null;
      // 悔棋后轮到走棋方: 历史偶数手 → 红方, 奇数手 → 黑方
      rs.turn = rs.history.length % 2 === 0 ? RED : BLACK;
      rs.check = rules.inCheck(rs.map, rs.turn);
      resetClock(rs);
      broadcast(rs, 'state', view(rs, 0));
      return json(res, 200, { ok: true });
    }

    // 重开
    if (url.pathname === '/api/restart' && req.method === 'POST') {
      rs.map = rules.initMap(); rs.turn = RED; rs.history = []; rs.status = PLAYING; rs.check = false; rs.lastMove = null;
      resetClock(rs);
      broadcast(rs, 'state', view(rs, 0));
      return json(res, 200, { ok: true });
    }

    // 倒计时面板开关 (服务端广播, 双方同步显隐)
    if (url.pathname === '/api/clock-toggle' && req.method === 'POST') {
      rs.clockVisible = !rs.clockVisible;
      broadcast(rs, 'state', view(rs, 0));
      return json(res, 200, { ok: true, clockVisible: rs.clockVisible });
    }

    // 超时判负 (客户端 60s 倒计时归零时上报)
    if (url.pathname === '/api/timeout' && req.method === 'POST') {
      if (rs.status !== PLAYING) return json(res, 400, { error: '对局已结束' });
      if (rs.turn !== me.side) return json(res, 400, { error: '还没轮到你' });
      // 服务端权威校验: 必须真的超时 (防客户端提前上报)
      if (!rs.clock.on || Date.now() < rs.clock.deadline) return json(res, 400, { error: '时间未到' });
      // 判负: 对方胜
      const winner = -me.side;
      rs.status = winner === RED ? RED_WIN : BLACK_WIN;
      rs.check = false;
      rs.clock.on = false;
      const winnerSid = [...rs.players.values()].find(p => p.side === winner)?.sid || null;
      broadcast(rs, 'state', view(rs, 0, { winner: winnerSid, reason: 'timeout' }));
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: '未知接口' });
  }

  // ---- 静态文件 ----
  let p;
  try { p = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end('Bad Request'); }
  // Windows 下 path.normalize('//x') 按 UNC 处理补尾斜杠, 折叠重复斜杠
  const norm = path.normalize('/' + p).replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  if (norm.includes('..') || norm.includes('\0')) { res.writeHead(403); return res.end('Forbidden'); }
  const rel = norm.slice(1) || 'index.html';
  // hint 权限: URL 带密钥 或 已有授权 cookie (首次带密钥访问 → 种 cookie, 后续全自动)
  const hintAuthed = authed(req, url);
  if (hintAuthed && url.searchParams.get('hint')) {
    // 首次带密钥 → 种 httpOnly cookie, 之后免密钥
    try { res.setHeader('Set-Cookie', `${HINT_COOKIE}=1; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`); } catch (e) {}
  }
  const ok = hintAuthed;

  if (rel === 'js/hint.js') {
    if (!ok) { res.writeHead(404); return res.end('Not Found'); }
    const file = path.join(PUBLIC, 'js', 'hint.js');
    return fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not Found'); }
      res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    });
  }

  if (BLOCKED.has(rel) || rel.startsWith('secret')) { res.writeHead(404); return res.end('Not Found'); }

  const file = path.join(PUBLIC, rel);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' };
    if (rel === 'index.html' || rel === 'game.html') {
      // 进入页与棋盘页都注入 hint (游戏页带 hint 参数自动带入棋盘页)
      headers['Cache-Control'] = 'no-store';
      let html = data.toString('utf8');
      if (ok) html = injectHint(html);
      res.writeHead(200, headers);
      return res.end(html);
    }
    headers['Cache-Control'] = 'no-cache';  // 每次重新验证, 杜绝旧文件残留
    res.writeHead(200, headers);
    res.end(data);
  });
}

server.listen(PORT, () => {
  console.log(`中国象棋已启动: http://localhost:${PORT}`);
  console.log(`普通链接: http://<服务器IP>:${PORT}/`);
  if (HINT_KEY) console.log(`专属链接: http://<服务器IP>:${PORT}/?hint=${HINT_KEY}`);
  else console.log('提示功能未启用 (无密钥)');
});
