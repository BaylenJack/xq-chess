/*!
 * xq-chess 对局状态机: 行棋 / 悔棋 / 重开 / 事件广播
 * 依赖: XQ.rules
 */
(function (root) {
  'use strict';

  const R = root.XQ.rules;

  const RED = 1, BLACK = -1;
  const STATUS = { PLAYING: 'playing', RED_WIN: 'red_win', BLACK_WIN: 'black_win' };

  function create() {
    const st = {
      map: R.initMap(),
      turn: RED,               // 当前走棋方
      history: [],             // [{mv, captured}] 每手记录
      status: STATUS.PLAYING,
      check: false,            // 当前 turn 方是否被将军
      lastMove: null,          // {mv, captured}
      legalCache: null,        // {turn, moves: Map<fromKey, mv[]>}
    };
    st.check = R.inCheck(st.map, st.turn);
    return st;
  }

  // 从某个格子出发的合法走法 (带缓存)
  function legalMovesFrom(st, r, c) {
    const key = `${st.turn}`;
    if (!st.legalCache || st.legalCache.key !== key) {
      const all = R.legalMoves(st.map, st.turn);
      const byFrom = new Map();
      for (const mv of all) {
        const k = `${mv.fr.r},${mv.fr.c}`;
        if (!byFrom.has(k)) byFrom.set(k, []);
        byFrom.get(k).push(mv);
      }
      st.legalCache = { key, moves: byFrom };
    }
    return st.legalCache.moves.get(`${r},${c}`) || [];
  }

  function endStatus(st, turn) {
    // turn 方刚走完; 检查对方 (下一方) 是否被将死/困毙, 或己方被吃将
    const opp = -turn;
    if (!R.findKing(st.map, turn)) return turn === RED ? STATUS.BLACK_WIN : STATUS.RED_WIN;
    if (!R.hasLegalMoves(st.map, opp)) {
      return opp === RED ? STATUS.BLACK_WIN : STATUS.RED_WIN;
    }
    return STATUS.PLAYING;
  }

  /**
   * 尝试走棋 (只接受当前 turn 方的合法着法)
   * @returns {{ok:boolean, gameOver:boolean, st}} ok=false 表示非法走法
   */
  function tryMove(st, mv) {
    if (st.status !== STATUS.PLAYING) return { ok: false, gameOver: false, st };
    if ((R.isRed(mv.piece) ? 1 : -1) !== st.turn) return { ok: false, gameOver: false, st };

    const legal = legalMovesFrom(st, mv.fr.r, mv.fr.c);
    const found = legal.find(m => m.to.r === mv.to.r && m.to.c === mv.to.c);
    if (!found) return { ok: false, gameOver: false, st };

    const captured = R.makeMove(st.map, found);
    st.history.push({ mv: found, captured });
    st.lastMove = { mv: found, captured };
    st.legalCache = null;

    const newStatus = endStatus(st, st.turn);
    st.status = newStatus;
    if (newStatus === STATUS.PLAYING) {
      st.turn = -st.turn;
      st.check = R.inCheck(st.map, st.turn);
    } else {
      st.check = false;
    }
    return { ok: true, gameOver: newStatus !== STATUS.PLAYING, st };
  }

  // 悔一步整轮 (人类 + AI); 终局后可悔回继续
  function undoRound(st) {
    if (st.history.length === 0) return false;
    // 回退 2 手 (红+黑); 若只有 1 手 (AI 还没走) 也回退 1 手
    const n = Math.min(2, st.history.length);
    for (let i = 0; i < n; i++) {
      const rec = st.history.pop();
      R.undoMove(st.map, rec.mv, rec.captured);
    }
    st.status = STATUS.PLAYING;
    st.check = false;
    st.lastMove = st.history.length ? st.history[st.history.length - 1] : null;
    st.legalCache = null;
    // 悔棋后轮到走棋方: 由调用方决定 (AI 刚走完则轮到人类)
    return true;
  }

  // 重建新局 (保留设置)
  function reset(st) {
    const fresh = create();
    st.map = fresh.map;
    st.turn = fresh.turn;
    st.history = [];
    st.status = fresh.status;
    st.check = fresh.check;
    st.lastMove = null;
    st.legalCache = null;
  }

  // ---- 事件广播 (极简) ----
  const events = {};
  function on(event, fn) {
    (events[event] = events[event] || []).push(fn);
  }
  function emit(event, payload) {
    for (const fn of events[event] || []) fn(payload);
  }

  const game = {
    RED, BLACK, STATUS,
    create,
    legalMovesFrom,
    tryMove,
    undoRound,
    reset,
    on,
    emit,
  };

  root.XQ = root.XQ || {};
  root.XQ.game = game;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { game };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
