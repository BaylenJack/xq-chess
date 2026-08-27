/*
 * 青黛棋院专属推演引擎 v3
 * 迭代加深 + PVS + 置换表 + 静态搜索 + 将军延伸 + LMR + 杀手/历史启发。
 * 默认 7.8 秒计算预算，给 Worker 消息传递与绘制预留约 0.2 秒。
 */
(function (root) {
  'use strict';
  const R = root.XQ.rules;
  const RED = R.RED, BLACK = R.BLACK;
  const MATE = 1000000, INF = 2000000, MAX_PLY = 64, MAX_TT = 260000;
  const VALUE = { K: 50000, R: 1000, C: 500, H: 450, E: 230, A: 230, P: 120 };
  const PIECES = 'KAEHRCPkaehrcp';
  const FLAG_EXACT = 0, FLAG_LOWER = 1, FLAG_UPPER = 2;
  const now = () => (root.performance?.now ? root.performance.now() : Date.now());
  class SearchTimeout extends Error {}

  let nodes = 0, deadline = 0, startedAt = 0, stopped = false;
  let table = new Map(), killers = [], history = [], pathCounts = new Map();

  let seed = 0x9e3779b97f4a7c15n;
  const MASK = (1n << 64n) - 1n;
  function random64() {
    seed ^= seed << 13n; seed &= MASK;
    seed ^= seed >> 7n;
    seed ^= seed << 17n; seed &= MASK;
    return seed;
  }
  const ZOBRIST = Array.from({ length: 14 }, () => Array.from({ length: 90 }, random64));
  const SIDE_KEY = random64();
  const pieceIndex = piece => PIECES.indexOf(piece?.[0]);
  const square = point => point.r * 9 + point.c;
  function boardHash(board, side) {
    let hash = side === BLACK ? SIDE_KEY : 0n;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const piece = board[r][c];
      if (piece) hash ^= ZOBRIST[pieceIndex(piece)][r * 9 + c];
    }
    return hash;
  }
  function nextHash(hash, move, captured) {
    const index = pieceIndex(move.piece), from = square(move.fr), to = square(move.to);
    let next = hash ^ SIDE_KEY ^ ZOBRIST[index][from] ^ ZOBRIST[index][to];
    if (captured) next ^= ZOBRIST[pieceIndex(captured)][to];
    return next;
  }

  function checkTime() {
    nodes++;
    if ((nodes & 511) === 0 && (stopped || now() >= deadline)) throw new SearchTimeout();
  }
  function positional(type, side, r, c) {
    const advance = side === RED ? r : 9 - r;
    const center = 4 - Math.abs(c - 4);
    if (type === 'P') return advance * 12 + (advance >= 5 ? 52 + center * 4 : center * 2);
    if (type === 'H') return center * 10 + Math.min(advance, 9 - advance) * 5 - (c === 0 || c === 8 ? 12 : 0);
    if (type === 'C') return center * 5 + (advance >= 2 && advance <= 7 ? 12 : 0);
    if (type === 'R') return center * 3 + (advance >= 2 ? 8 : 0);
    if (type === 'K') return -Math.abs(c - 4) * 8 - (advance > 1 ? 8 : 0);
    return 0;
  }
  function mobility(board, r, c, type) {
    if (type !== 'R' && type !== 'C' && type !== 'H') return 0;
    return R.pseudoTargets(board, r, c).length * (type === 'R' ? 3 : 2);
  }
  function absoluteEvaluation(board) {
    let score = 0;
    const pawns = { [RED]: [], [BLACK]: [] };
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const piece = board[r][c]; if (!piece) continue;
      const side = R.sideOf(piece), type = R.typeOf(piece);
      const value = VALUE[type] + positional(type, side, r, c) + mobility(board, r, c, type);
      if (type === 'P') pawns[side].push({ r, c });
      score += side === RED ? value : -value;
    }
    for (const side of [RED, BLACK]) {
      const bonus = pawns[side].reduce((sum, pawn) => sum + (pawns[side].some(other => other.r === pawn.r && Math.abs(other.c - pawn.c) === 1) ? 18 : 0), 0);
      score += side === RED ? bonus : -bonus;
    }
    return score;
  }
  const evaluate = (board, side) => (side === RED ? 1 : -1) * absoluteEvaluation(board);

  function sameMove(a, b) {
    return !!a && !!b && a.fr.r === b.fr.r && a.fr.c === b.fr.c && a.to.r === b.to.r && a.to.c === b.to.c;
  }
  function historyKey(side, move) { return (side === RED ? 0 : 8100) + square(move.fr) * 90 + square(move.to); }
  function orderScore(board, move, side, ply, ttMove) {
    if (sameMove(move, ttMove)) return 20000000;
    const captured = board[move.to.r][move.to.c];
    if (captured) return 10000000 + VALUE[R.typeOf(captured)] * 32 - VALUE[R.typeOf(move.piece)];
    if (sameMove(move, killers[ply]?.[0])) return 9000000;
    if (sameMove(move, killers[ply]?.[1])) return 8500000;
    const type=R.typeOf(move.piece);
    const positionalGain=positional(type,side,move.to.r,move.to.c)-positional(type,side,move.fr.r,move.fr.c);
    return (history[historyKey(side, move)] || 0)+positionalGain*48;
  }
  function orderedMoves(board, moves, side, ply, ttMove) {
    return moves.sort((a, b) => orderScore(board, b, side, ply, ttMove) - orderScore(board, a, side, ply, ttMove));
  }
  function rememberQuiet(move, side, ply, depth) {
    killers[ply] = killers[ply] || [null, null];
    if (!sameMove(move, killers[ply][0])) killers[ply] = [move, killers[ply][0]];
    const key = historyKey(side, move);
    history[key] = Math.min(1000000, (history[key] || 0) + depth * depth * 24);
  }
  function store(hash, entry) {
    const old = table.get(hash);
    if (!old || entry.depth >= old.depth) table.set(hash, entry);
    if (table.size > MAX_TT) table.clear();
  }

  function quiesce(board, side, alpha, beta, ply, hash, remaining) {
    checkTime();
    if (ply >= MAX_PLY || remaining <= 0) return evaluate(board, side);
    const checked = R.inCheck(board, side);
    const stand = evaluate(board, side);
    if (!checked) {
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
    }
    let moves = R.legalMoves(board, side);
    if (!moves.length) return -MATE + ply;
    if (!checked) {
      moves = moves.filter(move => {
        if (board[move.to.r][move.to.c]) return true;
        const captured = R.applyMove(board, move);
        let givesCheck;
        try { givesCheck = R.inCheck(board, -side); }
        finally { R.undoMove(board, move, captured); }
        return givesCheck;
      });
      if (!moves.length) return stand;
    }
    orderedMoves(board, moves, side, ply, null);
    for (const move of moves) {
      const captured = R.applyMove(board, move), childHash = nextHash(hash, move, captured);
      let score;
      pathCounts.set(childHash, (pathCounts.get(childHash) || 0) + 1);
      try {
        score = pathCounts.get(childHash) >= 3 ? 0 : -quiesce(board, -side, -beta, -alpha, ply + 1, childHash, remaining - 1);
      } finally {
        pathCounts.set(childHash, pathCounts.get(childHash) - 1);
        R.undoMove(board, move, captured);
      }
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function negamax(board, side, depth, alpha, beta, ply, hash, allowExtension) {
    checkTime();
    if (ply >= MAX_PLY) return evaluate(board, side);
    if ((pathCounts.get(hash) || 0) >= 3) return 0;
    const checked = R.inCheck(board, side);
    if (checked && allowExtension && depth > 0) depth++;
    if (depth <= 0) return quiesce(board, side, alpha, beta, ply, hash, 7);

    const originalAlpha = alpha, cached = table.get(hash);
    if (cached && cached.depth >= depth) {
      if (cached.flag === FLAG_EXACT) return cached.score;
      if (cached.flag === FLAG_LOWER && cached.score >= beta) return cached.score;
      if (cached.flag === FLAG_UPPER && cached.score <= alpha) return cached.score;
    }
    const moves = orderedMoves(board, R.legalMoves(board, side), side, ply, cached?.move);
    if (!moves.length) return -MATE + ply;

    let best = -INF, bestMove = null;
    for (let index = 0; index < moves.length; index++) {
      const move = moves[index], captured = R.applyMove(board, move), childHash = nextHash(hash, move, captured);
      const givesCheck = R.inCheck(board, -side);
      const quiet = !captured && !givesCheck;
      pathCounts.set(childHash, (pathCounts.get(childHash) || 0) + 1);
      let score;
      try {
        if (pathCounts.get(childHash) >= 3) score = 0;
        else if (index === 0) score = -negamax(board, -side, depth - 1, -beta, -alpha, ply + 1, childHash, !checked);
        else {
          const reduction = quiet && !checked && depth >= 4 && index >= 4 ? (index >= 10 && depth >= 6 ? 2 : 1) : 0;
          score = -negamax(board, -side, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, childHash, !checked);
          if (score > alpha && reduction) score = -negamax(board, -side, depth - 1, -alpha - 1, -alpha, ply + 1, childHash, !checked);
          if (score > alpha && score < beta) score = -negamax(board, -side, depth - 1, -beta, -alpha, ply + 1, childHash, !checked);
        }
      } finally {
        pathCounts.set(childHash, pathCounts.get(childHash) - 1);
        R.undoMove(board, move, captured);
      }
      if (score > best) { best = score; bestMove = move; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) { if (quiet) rememberQuiet(move, side, ply, depth); break; }
    }
    const flag = best <= originalAlpha ? FLAG_UPPER : best >= beta ? FLAG_LOWER : FLAG_EXACT;
    store(hash, { depth, score: best, flag, move: bestMove });
    return best;
  }

  function rootSearch(board, side, depth, alpha, beta, hash, preferred) {
    const moves = orderedMoves(board, R.legalMoves(board, side), side, 0, preferred);
    if (!moves.length) return { move: null, score: -MATE };
    let bestMove = moves[0], bestScore = -INF;
    for (let index = 0; index < moves.length; index++) {
      checkTime();
      const move = moves[index], captured = R.applyMove(board, move), childHash = nextHash(hash, move, captured);
      pathCounts.set(childHash, (pathCounts.get(childHash) || 0) + 1);
      let score;
      try {
        if (index === 0) score = -negamax(board, -side, depth - 1, -beta, -alpha, 1, childHash, true);
        else {
          score = -negamax(board, -side, depth - 1, -alpha - 1, -alpha, 1, childHash, true);
          if (score > alpha && score < beta) score = -negamax(board, -side, depth - 1, -beta, -alpha, 1, childHash, true);
        }
      } finally {
        pathCounts.set(childHash, pathCounts.get(childHash) - 1);
        R.undoMove(board, move, captured);
      }
      if (score > bestScore) { bestScore = score; bestMove = move; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return { move: bestMove, score: bestScore };
  }

  function bestMove(board, side, options = {}) {
    const timeMs = Math.min(7800, Math.max(80, Number(options.timeMs) || 7800));
    const maxDepth = Math.min(14, Math.max(1, Number(options.maxDepth) || 12));
    startedAt = now(); deadline = startedAt + timeMs; nodes = 0; stopped = false;
    table = new Map(); killers = Array.from({ length: MAX_PLY }, () => [null, null]); history = [];
    const hash = boardHash(board, side); pathCounts = new Map([[hash, 1]]);
    const legal = R.legalMoves(board, side); if (!legal.length) return null;
    let completed = { move: legal[0], score: evaluate(board, side), depth: 0 };

    for (let depth = 1; depth <= maxDepth; depth++) {
      try {
        let alpha = -INF, beta = INF;
        if (depth >= 3 && Math.abs(completed.score) < MATE / 2) { alpha = completed.score - 90; beta = completed.score + 90; }
        let result = rootSearch(board, side, depth, alpha, beta, hash, completed.move);
        if (result.score <= alpha || result.score >= beta) result = rootSearch(board, side, depth, -INF, INF, hash, result.move);
        completed = { move: result.move, score: result.score, depth };
        options.onProgress?.({ depth, score: result.score, nodes, elapsedMs: Math.round(now() - startedAt), move: result.move });
        if (Math.abs(result.score) > MATE - 1000) break;
      } catch (error) {
        if (!(error instanceof SearchTimeout)) throw error;
        break;
      }
    }
    return { ...completed.move, score: completed.score, depth: completed.depth, stats: { depth: completed.depth, nodes, elapsedMs: Math.round(now() - startedAt), ttSize: table.size } };
  }
  function cancel() { stopped = true; }

  const ai = { bestMove, getBestMove: (board, side, depth) => bestMove(board, side, { maxDepth: depth || 12, timeMs: 7800 }), evaluate, cancel, MATE };
  root.XQ = root.XQ || {}; root.XQ.ai = ai;
  if (typeof module !== 'undefined' && module.exports) module.exports = { ai };
})(typeof globalThis !== 'undefined' ? globalThis : this);
