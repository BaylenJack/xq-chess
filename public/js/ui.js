/*!
 * xq-chess 界面 v3: 适配进入页 v3 / 棋盘页 v3 DOM
 *  - 新增: 头像/角色名字节, 大号 monospace 倒计时, 状态徽章, 合法落点 .legal-dot, 落子 spring 入场
 *  - 保留: SSE 在线同步, 翻转 (红方), 三档 AI 提示, 超时报负
 */
(function (root) {
  'use strict';

  const R = root.XQ.rules;
  const G = root.XQ.game;

  let st = G.create();
  let playerSide = null;
  let hintMove = null;
  let flipped = false;   // 红方视角翻转 (自己的棋在下方)

  let mySid = null, myRoom = null, es = null;

  // ---- 音效 ----
  let audioCtx = null;
  function beep(freq, dur, type, vol) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  }
  function playSound(kind) {
    if (!audioCtx) return;
    switch (kind) {
      case 'move': beep(330, 0.08, 'sine'); break;
      case 'capture': beep(220, 0.12, 'triangle', 0.15); setTimeout(() => beep(165, 0.1, 'triangle', 0.12), 60); break;
      case 'check': beep(660, 0.09, 'square', 0.07); setTimeout(() => beep(660, 0.09, 'square', 0.07), 110); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'sine', 0.14), i * 130)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sine', 0.13), i * 150)); break;
      case 'select': beep(520, 0.05, 'sine', 0.08); break;
      case 'hint': beep(880, 0.12, 'sine', 0.12); setTimeout(() => beep(1175, 0.18, 'sine', 0.12), 90); break;
      case 'join': beep(440, 0.1, 'sine', 0.1); setTimeout(() => beep(660, 0.12, 'sine', 0.1), 100); break;
      case 'timeout': beep(220, 0.4, 'sawtooth', 0.18); break;
    }
  }
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  // ---- DOM ----
  let boardEl = null, cells = [];
  let selected = null, legalNow = [], illegalNow = [];
  const $ = id => document.getElementById(id);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---- 低端设备检测: 帧率低 → body.lite (禁光斑/粒子/模糊, 老手机流畅) ----
  function detectLowEnd() {
    // 硬件信号: 内存 < 2GB 或 老 WebKit (iOS < 15 的 Safari/微信)
    const nav = root.navigator || {};
    const mem = nav.deviceMemory;  // 仅 Chromium 有
    const isOldWebKit = /OS (1[0-4])_/.test(nav.userAgent || '');  // iOS < 15
    let lowEnd = (mem && mem < 4) || isOldWebKit;
    if (lowEnd) document.body.classList.add('lite');
    // 帧率实测: 30 帧采样, < 45fps 判定低端
    let frames = 0;
    const t0 = performance.now();
    function sample(ts) {
      frames++;
      if (ts - t0 >= 500) {
        const fps = frames / ((ts - t0) / 1000);
        if (fps < 45) document.body.classList.add('lite');
        return;
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }

  // 数据驱动翻转: 逻辑行 r → 屏幕行 (红方翻转时上下颠倒)
  function viewR(r) { return flipped ? 9 - r : r; }
  // 屏幕行 → 逻辑行
  function logicR(vr) { return flipped ? 9 - vr : vr; }

  function buildBoard() {
    // #board 本身就是 board-wrap (game.html 静态定义), 直接往它里面放各层
    boardEl = $('board');
    // 木纹底
    boardEl.appendChild(el('div', 'wood-bg'));
    // 网格线
    boardEl.appendChild(el('div', 'grid-lines'));
    // 九宫斜线: 内联 SVG (vector-effect 物理像素线宽, 任何 DPR 下与网格线一致)
    const diagSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    diagSVG.setAttribute('class', 'palace-diags');
    diagSVG.setAttribute('viewBox', '0 0 8 9');
    diagSVG.setAttribute('preserveAspectRatio', 'none');
    const DIAG = 'http://www.w3.org/2000/svg';
    const lines = [[3,0,5,2], [5,0,3,2], [3,7,5,9], [5,7,3,9]];
    for (const [x1,y1,x2,y2] of lines) {
      const ln = document.createElementNS(DIAG, 'line');
      ln.setAttribute('x1', x1); ln.setAttribute('y1', y1);
      ln.setAttribute('x2', x2); ln.setAttribute('y2', y2);
      ln.setAttribute('stroke', '#3d2611');
      ln.setAttribute('stroke-width', '1.5');
      ln.setAttribute('vector-effect', 'non-scaling-stroke');
      ln.setAttribute('shape-rendering', 'geometricPrecision');
      diagSVG.appendChild(ln);
    }
    boardEl.appendChild(diagSVG);
    // 楚河汉界
    const riverBand = el('div', 'river-band');
    riverBand.innerHTML = '<span class="river">楚&nbsp;河&nbsp;汉&nbsp;界</span>';
    boardEl.appendChild(riverBand);
    // 90 个格子: 按屏幕位置 vr 创建 (0=顶, 9=底)
    cells = [];
    for (let vr = 0; vr < 10; vr++) {
      cells[vr] = [];
      for (let c = 0; c < 9; c++) {
        const cell = el('div', 'cell', '');
        cell.dataset.r = vr; cell.dataset.c = c;  // 屏幕定位
        cell.addEventListener('click', () => onCellClick(logicR(vr), c));
        cells[vr][c] = { el: cell, pieceEl: null, dotEl: null, xEl: null };
        boardEl.appendChild(cell);
      }
    }
    // 关键! 显式计算并设置 --cell (像素值), 避免嵌套 calc 失效
    // 让 wrap 宽度严格 = 9 × cell (棋盘 8 格 + 两侧各半格边距), 保证各层精确对齐
    const boardW = boardEl.getBoundingClientRect().width;
    const cellPx = Math.max(30, Math.floor(boardW / 9));
    boardEl.style.setProperty('--cell', cellPx + 'px');
    boardEl.style.width = (cellPx * 9) + 'px';   // 回写, 消除 454≠450 的 4px 误差
    // 棋盘大小变化时重设 (ResizeObserver + resize 兜底, 覆盖安卓 WebView 不触发 RO 的情况)
    const recomputeCell = () => {
      const w = boardEl.getBoundingClientRect().width;
      const c = Math.max(30, Math.floor(w / 9));
      boardEl.style.setProperty('--cell', c + 'px');
      boardEl.style.width = (c * 9) + 'px';
    };
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(recomputeCell).observe(boardEl);
    }
    window.addEventListener('resize', recomputeCell);
    // 首帧校准 (等布局稳定后再算一次)
    requestAnimationFrame(() => requestAnimationFrame(recomputeCell));
  }

  function setPiece(r, c, piece) {
    const cell = cells[r][c];
    if (cell.pieceEl) { cell.pieceEl.remove(); cell.pieceEl = null; }
    if (piece) {
      const p = el('div', 'piece' + (R.isRed(piece) ? ' red' : ' black'));
      // 文字包在内层 .glyph: 保证任何视角下棋子字永远正读, 且不与选中动画冲突
      const glyph = el('span', 'glyph', R.charOf(piece));
      p.appendChild(glyph);
      cell.el.appendChild(p);
      cell.pieceEl = p;
    }
  }

  function render() {
    // 棋子: 逻辑行 r → 屏幕行 viewR(r); 仅当棋子变化时更新 (不重建 → 不抖动)
    // 关键: 复用判断必须同时比较 字符 + 颜色 (charOf 红黑同字, 只看字会漏掉吃子后颜色反转)
    for (let r = 0; r < 10; r++) {
      const vr = viewR(r);
      for (let c = 0; c < 9; c++) {
        const cell = cells[vr][c];
        const piece = st.map[r][c];
        const sameGlyph = cell.pieceEl && cell.pieceEl.querySelector('.glyph')?.textContent === R.charOf(piece) && !!piece;
        const sameColor = cell.pieceEl && cell.pieceEl.classList.contains(piece && R.isRed(piece) ? 'red' : 'black') && !!piece;
        if (sameGlyph && sameColor) continue;
        if (cell.pieceEl) { cell.pieceEl.remove(); cell.pieceEl = null; }
        if (piece) setPiece(vr, c, piece);
      }
    }
    // 高亮类: 同样映射
    for (let vr = 0; vr < 10; vr++) {
      const r = logicR(vr);
      for (let c = 0; c < 9; c++) {
        const cell = cells[vr][c];
        const cls = [];
        if (selected && selected.r === r && selected.c === c) cls.push('sel');
        const isLegal = legalNow.some(m => m.to.r === r && m.to.c === c);
        const isIllegal = illegalNow.some(m => m.to.r === r && m.to.c === c);
        if (isLegal) cls.push('legal');
        if (isIllegal) cls.push('illegal');
        if (st.lastMove) {
          const mv = st.lastMove.mv;
          if (mv.fr.r === r && mv.fr.c === c) cls.push('last-from');
          if (mv.to.r === r && mv.to.c === c) cls.push('last-to');
        }
        if (st.check && st.map[r][c] && st.map[r][c][0] === (playerSide === G.RED ? 'K' : 'k')) cls.push('check');
        if (hintMove) {
          if (hintMove.fr.r === r && hintMove.fr.c === c) cls.push('hint-from');
          if (hintMove.to.r === r && hintMove.to.c === c) cls.push('hint-to');
        }
        cell.el.className = 'cell' + (cls.length ? ' ' + cls.join(' ') : '');

        // 合法落点小点 (独立元素, 翻转后通过 .legal-dot 反向 rotate)
        if (isLegal && !cell.dotEl) {
          const dot = el('div', 'legal-dot');
          cell.el.appendChild(dot);
          cell.dotEl = dot;
        } else if (!isLegal && cell.dotEl) {
          cell.dotEl.remove();
          cell.dotEl = null;
        }
        // 送将红 X 标记 (伪合法但会被将军的落点)
        if (isIllegal && !cell.xEl) {
          const x = el('div', 'illegal-x', '✕');
          cell.el.appendChild(x);
          cell.xEl = x;
        } else if (!isIllegal && cell.xEl) {
          cell.xEl.remove();
          cell.xEl = null;
        }
      }
    }
    updateStatus();
  }

  function myTurn() { return st.turn === playerSide; }
  function isMine(r, c) {
    const p = st.map[r][c];
    return !!p && (R.isRed(p) ? 1 : -1) === playerSide;
  }

  function updateStatus() {
    const p1 = document.querySelector('.player-card[data-side="1"]');
    const p2 = document.querySelector('.player-card[data-side="-1"]');
    if (p1) {
      p1.classList.toggle('active', st.turn === 1);
      const nameEl = p1.querySelector('.name');
      if (nameEl) nameEl.textContent = (st.players || []).find(p => p.side === 1)?.name || '等待…';
    }
    if (p2) {
      p2.classList.toggle('active', st.turn === -1);
      const nameEl = p2.querySelector('.name');
      if (nameEl) nameEl.textContent = (st.players || []).find(p => p.side === -1)?.name || '等待…';
    }
    if (st.status !== G.STATUS.PLAYING) {
      $('status').textContent = st.status === G.STATUS.RED_WIN ? '红方胜！' : '黑方胜！';
    } else {
      const t = myTurn() ? '你的回合' : '对方回合';
      $('status').textContent = st.check ? `将军 · ${t}` : t;
    }
    $('undoBtn').disabled = st.history.length === 0;
  }

  // ---- 棋谱面板 ----
  function updateRecord() {
    const recs = (root.XQ.notation && st.history) ? root.XQ.notation.toRecord(st.history) : [];
    const lastEl = $('recordLast');
    if (lastEl) {
      const last = recs[recs.length - 1];
      lastEl.textContent = last ? `${Math.ceil(last.seq / 2)}. ${last.text}` : '暂无着法';
    }
    const body = $('recordBody');
    if (!body) return;
    body.innerHTML = '';
    for (let i = 0; i < recs.length; i += 2) {
      const a = recs[i], b = recs[i + 1];
      const row = el('div', 'record-row');
      row.appendChild(el('span', 'rec-seq', String(i / 2 + 1)));
      row.appendChild(el('span', 'rec-red', a.text));
      row.appendChild(el('span', 'rec-black', b ? b.text : ''));
      body.appendChild(row);
    }
    body.scrollTop = body.scrollHeight;   // 新着自动滚到底 (收起时不可见, 展开时会重新滚到底)
  }

  function onCellClick(r, c) {
    ensureAudio();
    if (st.status !== G.STATUS.PLAYING) return;
    if (!myTurn()) return;
    const piece = st.map[r][c];
    if (selected) {
      const mv = legalNow.find(m => m.to.r === r && m.to.c === c);
      if (mv) { sendMove(mv); return; }
      // 点击送将红 X 落点 → 提示原因
      const ill = illegalNow.find(m => m.to.r === r && m.to.c === c);
      if (ill) {
        showModal('⚠ 这步会送将, 不能走');
        playSound('select');
        return;
      }
      if (piece && isMine(r, c)) { select(r, c); return; }
      selected = null; legalNow = []; illegalNow = [];
      render();
      return;
    }
    if (piece && isMine(r, c)) select(r, c);
  }

  function select(r, c) {
    selected = { r, c };
    legalNow = G.legalMovesFrom(st, r, c);
    // 伪合法但送将的着法 (红 X 提示)
    illegalNow = R.illegalMovesFrom(st.map, { r, c });
    playSound('select');
    render();
  }

  function clearHint() {
    if (hintMove) { hintMove = null; render(); }
  }

  // ---- 邀请链接 ----
  function inviteUrl() { return `${location.origin}/?room=${encodeURIComponent(myRoom || '')}`; }
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* 降级 */ }
    let ta = null;
    try {
      ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      return document.execCommand('copy');
    } catch (e) { return false; }
    finally { if (ta) ta.remove(); }
  }
  async function copyInvite() {
    const ok = await copyText(inviteUrl());
    showModal(ok ? '已复制邀请链接' : '复制失败,请手动复制地址');
  }
  function toggleWaitOverlay(show) {
    const ov = $('waitOverlay');
    if (ov) ov.classList.toggle('hidden', !show);
  }

  async function api(path, body) {
    const r = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  async function joinRoom() {
    const q = new URLSearchParams(location.search);
    const room = q.get('room') || '';
    const name = q.get('name') || '棋友';
    if (!room) { location.href = '/'; return; }
    myRoom = room;
    $('roomName').textContent = room;
    $('waitRoom').textContent = `房间 · ${room}`;
    try {
      // 复用上次的 sid (退出重进 → 服务端 60s 内恢复原玩家, 续对局不重置)
      const savedSid = localStorage.getItem('xq-sid:' + room);
      const data = await api('join', { room, name, ...(savedSid ? { sid: savedSid } : {}) });
      mySid = data.sid; playerSide = data.side;
      localStorage.setItem('xq-sid:' + room, data.sid);
      // 红方翻转: 己方红子在下方 (数据驱动, 格子 data-r 定位已按屏幕位置)
      flipped = playerSide === 1;
      st = G.create();
      st.players = data.players;
      updateRecord();
      applyOnlineStatus(data.players);
      $('status').textContent = data.players.length < 2 ? '等待朋友加入…' : '对局开始';
      // 清空棋盘所有棋子 (消除 init 阶段 flipped=false 的旧渲染), 再按正确视角渲染
      for (let vr = 0; vr < 10; vr++) {
        for (let c = 0; c < 9; c++) {
          const cell = cells[vr][c];
          if (cell.pieceEl) { cell.pieceEl.remove(); cell.pieceEl = null; }
        }
      }
      endedShown = false;
      toggleWaitOverlay(data.players.length < 2);
      render();
      connectStream();
      if (data.players.length >= 2) playSound('join');
      // 倒计时由 SSE 广播同步 (服务端权威), 此处不重置
    } catch (e) {
      // 加入失败 (房间满等): 弹提示并回到进入页; 清除可能失效的 sid (防 403 循环)
      try { localStorage.removeItem('xq-sid:' + room); } catch (err) { /* 忽略 */ }
      showModal(e.message || '加入房间失败');
      setTimeout(() => { location.href = '/'; }, 1600);
    }
  }

  function connectStream() {
    if (es) es.close();
    es = new EventSource(`/api/stream?room=${encodeURIComponent(myRoom)}&sid=${mySid}`);
    es.addEventListener('state', ev => {
      const s = JSON.parse(ev.data);
      // 检测新走子 (对比本地 history 与推送 history)
      const newMoves = s.history.slice((st.history || []).length);
      const last = s.history[s.history.length - 1];
      // 记录走子动画信息 (render 前)
      let animMove = null;
      if (newMoves.length === 1 && last && last.mv) {
        animMove = {
          from: { r: last.mv.fr.r, c: last.mv.fr.c },
          to: { r: last.mv.to.r, c: last.mv.to.c },
          piece: last.mv.piece,
          captured: !!last.captured,
        };
      }
      st.map = s.map;
      st.turn = s.turn;
      st.status = s.status === 'playing' ? G.STATUS.PLAYING : (s.status === 'red_win' ? G.STATUS.RED_WIN : G.STATUS.BLACK_WIN);
      st.check = s.check;
      st.history = s.history;
      st.lastMove = s.lastMove;
      st.players = s.players;
      // 同步我的角色 (重启互换后必须更新; 旧逻辑忘了, 导致两人都看到同一颜色)
      const myNew = (s.players || []).find(p => p.sid === mySid);
      if (myNew && myNew.side !== playerSide) {
        playerSide = myNew.side;
        flipped = playerSide === 1;
      }
      // 倒计时: 服务端权威 (deadline 广播), 两方同步
      if (s.clock) XQ.timer.sync(s.clock.deadline, s.clock.on);
      // 倒计时面板显隐: 服务端广播, 双方同步
      if (typeof XQ.applyClockVisible === 'function') XQ.applyClockVisible(s.clockVisible);
      if (last) playSound(last.captured ? 'capture' : 'move');
      if (s.check) playSound('check');
      selected = null; legalNow = []; illegalNow = []; clearHint();
      updateRecord();
      toggleWaitOverlay((s.players || []).length < 2);
      closeConfirmByKind('undo-wait');
      closeConfirmByKind('undo-ask');
      if (s.status !== 'playing' && !endedShown) {
        endedShown = true;
        XQ.timer.disable();
        showResult(s);
      }
      render();
      // 走子动画: 原位置光点 + 落子环绕发光 (渲染后)
      if (animMove) {
        animateMove(animMove);
      }
      G.emit('change', st);
    });
    es.addEventListener('start', ev => {
      const s = JSON.parse(ev.data);
      st.players = s.players;
      // 同步角色 (重启互换后)
      const myNew = s.players && s.players.find(p => p.sid === mySid);
      if (myNew && myNew.side !== playerSide) {
        playerSide = myNew.side;
        flipped = playerSide === 1;
      }
      $('status').textContent = '对局开始';
      showModal('对局开始');
      playSound('join');
      // 倒计时随 state 广播同步 (start 事件无 clock, 由紧随的 state 处理)
      if (confirmState) resolveConfirm(null);   // 重开后所有确认模态均已过期
      endedShown = false;
      $('resultModal').classList.remove('show');
      toggleWaitOverlay((s.players || []).length < 2);
      render();
    });
    es.addEventListener('peer_left', ev => {
      const s = JSON.parse(ev.data);
      showModal(s.message || '对手离开了');
    });
    // 悔棋请求: 弹窗询问对方 (非请求方)
    es.addEventListener('undo_request', async ev => {
      const s = JSON.parse(ev.data);
      if (s.requester === mySid) return;   // 自己提的: 已在 undo-wait 模态
      const ans = await showConfirm({ kind: 'undo-ask', title: '对方请求悔棋', sub: '是否同意?', okText: '同意', cancelText: '拒绝', timeoutSec: 30 });
      if (ans === null) return;   // 超时/静默关闭: 不回应 (服务端 30s 自动清理)
      api(ans ? 'undo-confirm' : 'undo-reject', { room: myRoom, sid: mySid })
        .catch(e => showModal(e.message));
    });
    // 悔棋被拒
    es.addEventListener('undo_rejected', ev => {
      closeConfirmByKind('undo-wait');
      closeConfirmByKind('undo-ask');
      let s = {};
      try { s = JSON.parse(ev.data) || {}; } catch (e) {}
      if (s.by === mySid) return;   // 自己刚拒绝的不再提示 (广播是房间级的)
      showModal(s.timeout ? '悔棋请求超时' : '对方拒绝了你的悔棋请求');
    });
    es.addEventListener('error', () => {
      // EventSource 断线: 显示断线状态 (会自动重连, 重连后 server 推送最新 state)
      const statusEl = $('status');
      if (statusEl && st.status === G.STATUS.PLAYING && statusEl.textContent.indexOf('断线') === -1) {
        statusEl.textContent = '连接中断,重连中…';
      }
    });
    // 在线状态更新 (双方玩家卡)
    es.addEventListener('players', ev => {
      const s = JSON.parse(ev.data);
      applyOnlineStatus(s.players || []);
    });
  }

  // 更新玩家卡在线状态 (p1=红, p2=黑)
  function applyOnlineStatus(players) {
    for (const p of players || []) {
      const isRed = p.side === 1;
      const dot = document.querySelector(`.online-dot[data-for="${isRed ? 'p1' : 'p2'}"]`);
      if (dot) dot.classList.toggle('offline', !p.online);
    }
  }

  function sendMove(mv) {
    const res = G.tryMove(st, mv);
    if (!res.ok) return;
    selected = null; legalNow = []; illegalNow = [];
    render();
    updateRecord();
    // 本地走子也触发过渡动画 (乐观更新, 服务端 state 回来时 newMoves=0 不重复触发)
    animateMove({ from: mv.fr, to: mv.to, piece: mv.piece, captured: !!mv.captured });
    api('move', { room: myRoom, sid: mySid, mv: { fr: mv.fr, to: mv.to } })
      .catch(e => showModal(e.message));
  }

  // 走子过渡动画: 原位置发光点 + 跳跃粒子 + 落子环绕 + 落地涟漪
  function animateMove(m) {
    const fromCell = cells[viewR(m.from.r)][m.from.c];
    const toCell = cells[viewR(m.to.r)][m.to.c];

    // 原位置: 显著亮点 (小而亮, 快速闪现, 与落子圈区分)
    if (fromCell && fromCell.el) {
      const dot = el('div', 'move-trail-dot');
      fromCell.el.appendChild(dot);
      setTimeout(() => dot.remove(), 900);   // 匹配 CSS 0.9s 动画
    }
    // 跳跃轨迹: 弧线粒子带 (从原位置飘向落点)
    if (fromCell && toCell) {
      const fromEl = fromCell.el;
      const toEl = toCell.el;
      const fx = fromEl.getBoundingClientRect().left + fromEl.offsetWidth / 2;
      const fy = fromEl.getBoundingClientRect().top + fromEl.offsetHeight / 2;
      const tx = toEl.getBoundingClientRect().left + toEl.offsetWidth / 2;
      const ty = toEl.getBoundingClientRect().top + toEl.offsetHeight / 2;
      const boardRect = boardEl.getBoundingClientRect();
      const sparkCount = document.body.classList.contains('lite') ? 0 : 3;  // 轻量: 3 颗粒子足够
      for (let i = 1; i <= sparkCount; i++) {
        const t = i / 4;
        const spark = el('div', 'move-spark');
        const x = fx + (tx - fx) * t;
        const y = fy + (ty - fy) * t - Math.sin(t * Math.PI) * (boardRect.width * 0.12);
        spark.style.left = (x - boardRect.left) + 'px';
        spark.style.top = (y - boardRect.top) + 'px';
        boardEl.appendChild(spark);
        spark.style.animationDelay = (t * 260) + 'ms';
        setTimeout(() => spark.remove(), 260 + t * 260 + 400);
      }
    }
    // 落子位置: 环绕发光 + 涟漪
    if (toCell && toCell.el) {
      const ring = el('div', 'move-land-ring');
      toCell.el.appendChild(ring);
      setTimeout(() => ring.remove(), 1200);
      const piece = toCell.el.querySelector('.piece');
      if (piece) {
        piece.classList.add('landed');
        setTimeout(() => piece.classList.remove('landed'), 450);
      }
      const ripple = el('div', 'move-ripple');
      toCell.el.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    }
  }

  function bindControls() {
    // 棋谱面板折叠
    const recordHead = document.getElementById('recordHead');
    if (recordHead) {
      recordHead.addEventListener('click', () => {
        const panel = document.getElementById('recordPanel');
        const open = panel.classList.toggle('open');
        recordHead.setAttribute('aria-expanded', String(open));
        if (open) {
          const body = document.getElementById('recordBody');
          if (body) body.scrollTop = body.scrollHeight;
        }
        ensureAudio();
        playSound('select');
      });
    }
    // 倒计时按钮: 开关走服务端广播, 双方同步显隐
    const timerBtn = document.getElementById('timerBtn');
    if (timerBtn) {
      timerBtn.addEventListener('click', () => {
        ensureAudio();
        api('clock-toggle', { room: myRoom, sid: mySid }).catch(() => {});
        playSound('select');
      });
    }
    // 思考按钮: 单击=普通(深 4 / 6s), 长按=深度(深 10 / 15s)
    bindThinkBtn();

    // 悔棋: 发起请求 → 等待模态 (30s 倒计时环, 服务端超时自动清理)
    $('undoBtn').addEventListener('click', async () => {
      ensureAudio();
      try {
        const res = await api('undo', { room: myRoom, sid: mySid });
        if (res.pending) {
          showConfirm({ kind: 'undo-wait', title: '已请求悔棋', sub: '等待对方确认…', timeoutSec: 30, hideActions: true });
        } else if (res.auto) {
          showModal('已悔棋');
        }
      } catch (e) { showModal(e.message); }
    });

    // 重新开始: 确认模态 → 双方互换颜色 + 交换先手 (服务端处理)
    $('restartBtn').addEventListener('click', async () => {
      ensureAudio();
      const ok = await showConfirm({ kind: 'restart', title: '重新开始', sub: '双方将互换棋色和先手', okText: '确定重开' });
      if (!ok) return;
      api('restart', { room: myRoom, sid: mySid }).catch(e => showModal(e.message));
    });

    // 倒计时面板显隐 (服务端广播)
    function applyClockVisible(v) {
      if (!timerBtn) return;
      const show = !!v;
      const timerDisplay = document.getElementById('timerDisplay');
      if (timerDisplay) timerDisplay.classList.toggle('hidden', !show);
      timerBtn.classList.toggle('active', show);
      if (!show) XQ.timer.stop();
    }
    XQ.applyClockVisible = applyClockVisible;
    XQ.timer.onExpire(() => {
      playSound('timeout');
      api('timeout', { room: myRoom, sid: mySid }).catch(() => {});
    });

    // 确认模态按钮
    $('confirmOk').addEventListener('click', () => resolveConfirm(true));
    $('confirmCancel').addEventListener('click', () => resolveConfirm(false));
    // 结算面板按钮
    $('resultRestart').addEventListener('click', () => {
      $('resultModal').classList.remove('show');
      api('restart', { room: myRoom, sid: mySid }).catch(e => showModal(e.message));
    });
    $('resultHome').addEventListener('click', () => { location.href = '/'; });

    // 邀请链接复制
    const roomBadge = document.getElementById('roomBadge');
    if (roomBadge) roomBadge.addEventListener('click', () => { ensureAudio(); copyInvite(); playSound('select'); });
    const waitCopy = document.getElementById('waitCopyBtn');
    if (waitCopy) waitCopy.addEventListener('click', () => { ensureAudio(); copyInvite(); playSound('select'); });
  }

  // 思考按钮: 单击开启/关闭深度思考
  function bindThinkBtn() {
    const btn = $('thinkBtn');
    if (!btn) return;
    const label = btn.querySelector('.think-label');
    const setLabel = (text) => { if (label) label.textContent = text; };
    // 单击: 激活深度思考 (Worker 后台算, 轮到自己时显示提示)
    const startThink = () => {
      if (XQ.thinking) return;
      XQ.thinking = true;
      btn.classList.add('thinking');
      setLabel('思考中');
      btn.setAttribute('aria-pressed', 'true');
      const onTurn = () => {
        if (!XQ.thinking) return;
        if (st.status !== G.STATUS.PLAYING || st.turn !== playerSide) return;
        XQ.ai.startHint('hard', playerSide);
      };
      onTurn();
      XQ.thinkPoll = setInterval(onTurn, 300);
    };
    const endThink = () => {
      XQ.thinking = false;
      clearInterval(XQ.thinkPoll);
      btn.classList.remove('thinking');
      setLabel('深度思考');
      btn.setAttribute('aria-pressed', 'false');
      XQ.ai.stopHint();
    };
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (XQ.thinking) endThink();
      else startThink();
    });
  }

  function showModal(text) {
    const m = $('modal');
    m.querySelector('.modal-card').textContent = text;
    m.classList.add('show');
    setTimeout(() => m.classList.remove('show'), 3200);
  }

  // ---- 确认模态 (替代原生 confirm) ----
  // resolve: true=确定, false=取消, null=超时/被外部静默关闭
  let confirmState = null;   // { resolve, kind, ringTimer }
  const RING_C = 2 * Math.PI * 17;

  function resolveConfirm(v) {
    if (!confirmState) return;
    const { resolve, ringTimer } = confirmState;
    if (ringTimer) clearInterval(ringTimer);
    confirmState = null;
    $('confirmModal').classList.remove('show');
    resolve(v);
  }
  // 按 kind 静默关闭 (state/undo_rejected 到达时)
  function closeConfirmByKind(kind) {
    if (confirmState && confirmState.kind === kind) resolveConfirm(null);
  }

  function showConfirm(opts) {
    // 已有一个开着: 直接以 null 结掉 (新的优先)
    if (confirmState) resolveConfirm(null);
    return new Promise(resolve => {
      $('confirmTitle').textContent = opts.title || '';
      const subEl = $('confirmSub');
      if (opts.sub) { subEl.textContent = opts.sub; subEl.classList.remove('hidden'); }
      else subEl.classList.add('hidden');
      $('confirmOk').textContent = opts.okText || '确定';
      $('confirmCancel').textContent = opts.cancelText || '取消';
      $('confirmActions').classList.toggle('hidden', !!opts.hideActions);
      const ringWrap = $('confirmRing');
      const ringFg = $('ringFg');
      ringFg.style.strokeDasharray = String(RING_C);
      // 先赋值再启动倒计时: tick 立即超时 (timeoutSec<=0) 调 resolveConfirm 也有路可退
      confirmState = { resolve, kind: opts.kind || '', ringTimer: null };
      if (opts.timeoutSec) {
        ringWrap.classList.remove('hidden');
        const end = Date.now() + opts.timeoutSec * 1000;
        const tick = () => {
          const left = end - Date.now();
          if (left <= 0) { resolveConfirm(null); return; }
          $('ringNum').textContent = String(Math.ceil(left / 1000));
          ringFg.style.strokeDashoffset = String(RING_C * (1 - left / (opts.timeoutSec * 1000)));
        };
        tick();
        // tick 中已超时结掉则 confirmState 已清空, 不再起定时器
        if (confirmState) confirmState.ringTimer = setInterval(tick, 250);
      } else {
        ringWrap.classList.add('hidden');
      }
      if (confirmState) $('confirmModal').classList.add('show');
    });
  }

  // ---- 胜负结算面板 ----
  let endedShown = false;
  function showResult(s) {
    const redWin = s.status === 'red_win';
    const iWon = (redWin ? 1 : -1) === playerSide;
    $('resultTitle').textContent = redWin ? '红方胜' : '黑方胜';
    $('resultSub').textContent = iWon ? '恭喜,你赢了这局' : '惜败,再接再厉';
    let reason;
    if (s.reason === 'timeout') reason = iWon ? '对方超时' : '超时判负';
    else if (s.reason === 'peer_left') reason = '对手离开';
    else {
      const loser = redWin ? -1 : 1;
      reason = R.inCheck(s.map, loser) ? '将死制胜' : '困毙制胜';
    }
    $('resultReason').textContent = reason;
    $('resultModal').classList.add('show');
    playSound(iWon ? 'win' : 'lose');
  }

  const ui = {
    init() {
      detectLowEnd();
      // 无 AI 提示引擎 (普通链接未注入 hint.js) → 隐藏思考按钮
      if (typeof XQ.ai === 'undefined' || typeof XQ.ai.startHint !== 'function') {
        const thinkBtn = document.getElementById('thinkBtn');
        if (thinkBtn) thinkBtn.classList.add('hidden');
      }
      buildBoard();
      bindControls();
      render();
      joinRoom();
    },
    showHint(mv) {
      hintMove = mv ? { fr: mv.fr, to: mv.to } : null;
      render();
    },
    get state() { return st; },
    get playerSide() { return playerSide; },
    _setHint(v) { hintMove = v; },
  };

  root.XQ = root.XQ || {};
  root.XQ.ui = ui;
})(typeof globalThis !== 'undefined' ? globalThis : this);