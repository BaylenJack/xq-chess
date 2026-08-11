/*!
 * xq-chess AI 引擎: negamax + alpha-beta 剪枝
 * 借鉴开源项目 itlwei/Chess (MIT): https://github.com/itlwei/Chess
 * 估值表为红方视角 10x9 位置表 (黑方按行镜像), 源自参考项目的 com.score 表
 * 依赖: XQ.rules
 */
(function (root) {
  'use strict';

  const R = root.XQ.rules;

  const MATE = 8888;          // 将死分值
  const MAX_NODES = 3000000;  // 安全上限, 防极端局面卡死

  // ---- 位置估值表 (红方视角, row 0=红底线 → row 9=黑底线) ----
  const PST = {
    R: [ // 车
      [206, 208, 207, 213, 214, 213, 207, 208, 206],
      [206, 212, 209, 216, 233, 216, 209, 212, 206],
      [206, 208, 207, 214, 216, 214, 207, 208, 206],
      [206, 213, 213, 216, 216, 216, 213, 213, 206],
      [208, 211, 211, 214, 215, 214, 211, 211, 208],
      [208, 212, 212, 214, 215, 214, 212, 212, 208],
      [204, 209, 204, 212, 214, 212, 204, 209, 204],
      [198, 208, 204, 212, 212, 212, 204, 208, 198],
      [200, 208, 206, 212, 200, 212, 206, 208, 200],
      [194, 206, 204, 212, 200, 212, 204, 206, 194],
    ],
    H: [ // 马
      [90, 90, 90, 96, 90, 96, 90, 90, 90],
      [90, 96, 103, 97, 94, 97, 103, 96, 90],
      [92, 98, 99, 103, 99, 103, 99, 98, 92],
      [93, 108, 100, 107, 100, 107, 100, 108, 93],
      [90, 100, 99, 103, 104, 103, 99, 100, 90],
      [90, 98, 101, 102, 103, 102, 101, 98, 90],
      [92, 94, 98, 95, 98, 95, 98, 94, 92],
      [93, 92, 94, 95, 92, 95, 94, 92, 93],
      [85, 90, 92, 93, 78, 93, 92, 90, 85],
      [88, 85, 90, 88, 90, 88, 90, 85, 88],
    ],
    E: [ // 象/相
      [0, 0, 20, 0, 0, 0, 20, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 23, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 20, 0, 0, 0, 20, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
    A: [ // 仕/士
      [0, 0, 0, 20, 0, 20, 0, 0, 0],
      [0, 0, 0, 0, 23, 0, 0, 0, 0],
      [0, 0, 0, 20, 0, 20, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
    K: [ // 将/帅
      [0, 0, 0, 8888, 8888, 8888, 0, 0, 0],
      [0, 0, 0, 8888, 8888, 8888, 0, 0, 0],
      [0, 0, 0, 8888, 8888, 8888, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
    C: [ // 炮
      [100, 100, 96, 91, 90, 91, 96, 100, 100],
      [98, 98, 96, 92, 89, 92, 96, 98, 98],
      [97, 97, 96, 91, 92, 91, 96, 97, 97],
      [96, 99, 99, 98, 100, 98, 99, 99, 96],
      [96, 96, 96, 96, 100, 96, 96, 96, 96],
      [95, 96, 99, 96, 100, 96, 99, 96, 95],
      [96, 96, 96, 96, 96, 96, 96, 96, 96],
      [97, 96, 100, 99, 101, 99, 100, 96, 97],
      [96, 97, 98, 98, 98, 98, 98, 97, 96],
      [96, 96, 97, 99, 99, 99, 97, 96, 96],
    ],
    P: [ // 兵/卒
      [9, 9, 9, 11, 13, 11, 9, 9, 9],
      [19, 24, 34, 42, 44, 42, 34, 24, 19],
      [19, 24, 32, 37, 37, 37, 32, 24, 19],
      [19, 23, 27, 29, 30, 29, 27, 23, 19],
      [14, 18, 20, 27, 29, 27, 20, 18, 14],
      [7, 0, 13, 0, 16, 0, 13, 0, 7],
      [7, 0, 7, 0, 15, 0, 7, 0, 7],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  };

  // 子力价值 (评估用, 吃子排序也参考)
  const PIECE_VALUE = { R: 600, H: 270, C: 285, E: 120, A: 120, P: 30, K: 8888 };

  // 红方位置表取值; 黑方行镜像 (9 - r)
  function pstValue(type, r, c, my) {
    return PST[type][my === 1 ? r : 9 - r][c];
  }

  // 静态评估: 红为正, 黑为负
  function evaluate(map) {
    let val = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = map[r][c];
        if (!p) continue;
        const my = R.isRed(p) ? 1 : -1;
        const t = R.pieceType(p).toUpperCase();
        if (t === 'K') {
          // 将帅位置不参与价值 (被吃即终局)
          val += 8888 * my;  // 保持对称, 但正常局面将都在
          continue;
        }
        val += my * (PIECE_VALUE[t] + pstValue(t, r, c, my));
      }
    }
    return val;
  }

  // 着法排序评分: 吃子优先 (MVV-LVA), 非吃子按目标位置增量
  function moveScore(mv, map) {
    const target = map[mv.to.r][mv.to.c];
    if (target) {
      const victim = PIECE_VALUE[R.pieceType(target).toUpperCase()];
      const attacker = PIECE_VALUE[R.pieceType(mv.piece).toUpperCase()];
      return victim * 10 - attacker;  // MVV-LVA
    }
    const my = R.isRed(mv.piece) ? 1 : -1;
    const t = R.pieceType(mv.piece).toUpperCase();
    return pstValue(t, mv.to.r, mv.to.c, my) - pstValue(t, mv.fr.r, mv.fr.c, my);
  }

  let nodeCount = 0;

  // negamax alpha-beta: 返回分值; 根节点选最佳着法
  function negamax(map, my, depth, alpha, beta) {
    nodeCount++;
    if (nodeCount > MAX_NODES) throw new Error('nodes-exceeded');

    if (depth === 0) {
      return my * evaluate(map);
    }

    const moves = R.legalMoves(map, my);
    if (moves.length === 0) {
      // 无合法着法: 被将死则对方胜 (MATE - ply), 困毙也判负
      return -(MATE - 2000) - (8 - depth);  // 越早杀越大; 困毙同判负
    }

    // 排序: 吃子优先
    moves.sort((a, b) => moveScore(b, map) - moveScore(a, map));

    let best = -Infinity;
    for (const mv of moves) {
      const captured = R.makeMove(map, mv);
      // 吃将即胜
      if (captured && R.pieceType(captured).toUpperCase() === 'K') {
        R.undoMove(map, mv, captured);
        return MATE - 2000 + (8 - depth);  // 对方将被吃: 直接取胜
      }
      const val = -negamax(map, -my, depth - 1, -beta, -alpha);
      R.undoMove(map, mv, captured);
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;  // 剪枝
    }
    return best;
  }

  /**
   * 求最佳走法
   * @param {Array} map 10x9 棋盘
   * @param {number} my 走棋方 (1 红 / -1 黑)
   * @param {number} depth 搜索深度 (2/3/4)
   * @param {boolean} randomize 弱化: 同分着法随机 (菜鸟档)
   * @returns {{fr:{r,c},to:{r,c},piece,score}|null} 最佳着法; 无着法返回 null
   */
  function getBestMove(map, my, depth, randomize) {
    const moves = R.legalMoves(map, my);
    if (moves.length === 0) return null;

    nodeCount = 0;
    moves.sort((a, b) => moveScore(b, map) - moveScore(a, map));

    let alpha = -Infinity;
    const beta = Infinity;
    let bestMove = null;
    let bestScore = -Infinity;

    try {
      for (const mv of moves) {
        const captured = R.makeMove(map, mv);
        let score;
        if (captured && R.pieceType(captured).toUpperCase() === 'K') {
          score = MATE + (8 - depth);  // 吃将: 立即获胜
        } else {
          score = -negamax(map, -my, depth - 1, -beta, -alpha);
        }
        R.undoMove(map, mv, captured);

        // 菜鸟档: 与当前最优分差 ≤ 40 分时随机替换, 制造不稳定性
        if (randomize && score >= bestScore - 40 && Math.random() < 0.4) {
          bestMove = mv; bestScore = score;
        } else if (score > bestScore) {
          bestMove = mv; bestScore = score;
        }
        if (score > alpha) alpha = score;
      }
    } catch (e) {
      if (e.message !== 'nodes-exceeded') throw e;
      // 节点超限: 用当前搜索到的着法兜底 (即使未完成)
    }

    if (!bestMove) return null;
    bestMove.score = bestScore;
    return bestMove;
  }

  const ai = {
    MATE,
    getBestMove,
    // 内部暴露 (测试用)
    _evaluate: evaluate,
    _nodeCount() { return nodeCount; },
  };

  root.XQ = root.XQ || {};
  root.XQ.ai = ai;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ai };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
