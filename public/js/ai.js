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
  // 深度 → 节点预算 (满血: 深 5 完整搜索, 预算不足自动退深 4 兜底)
  const DEPTH_BUDGET = { 2: 100000, 3: 1000000, 4: 10000000, 5: 10000000 };

  // ---- 开局库 (借鉴 public-Xiangqi OpenBookManager) ----
  // 简化策略: 用通用走法启发 (bookHint 分数加成), 避免手写序列撞子问题
  // 真实开局库需专业 .bin 数据文件支持, 这里只做"开局走法偏好"
  const BOOK_HINT = {
    'C1_2_4': 200, 'C0_2_4': 200,   // 炮二/八平五 (当头炮)
    'H1_2_6': 150, 'H0_2_6': 150,   // 马二/八进三 (正马)
    'H1_2_7': 150, 'H0_2_7': 150,   // 马二/八进四 (反马, 黑方 9,1→7,0 等价)
    'R1_2_8': 100, 'R0_2_8': 100,   // 车一/九平二/八 (出车)
    'R1_2_0': 100, 'R0_2_0': 100,   // 车占肋道
  };
  function bookHint(mv) {
    const key = mv.piece + '_' + mv.to.r + '_' + mv.to.c;
    return BOOK_HINT[key] || 0;
  }
  function bookMove() { return null; }   // 简化版不开预匹配, 由搜索内 bookHint 加分

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
  // 残局价值调整 (借鉴 cchess-zero 价值曲线 + ChineseChess EndGame):
  // 残局: 马/兵价值升 (兵残局值钱), 炮/车价值略降
  const ENDGAME_VALUE = { R: 550, H: 300, C: 250, E: 100, A: 100, P: 120, K: 8888 };

  // 残局判定: 双方除将帅外子力总和 < 阈值
  function isEndgame(map) {
    let total = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = map[r][c];
        if (!p || p[0].toUpperCase() === 'K') continue;
        total += PIECE_VALUE[p[0].toUpperCase()];
      }
    }
    return total < 1500;   // 约剩 2车1炮 以下
  }
  // 盘面子力密度 (用于深度自适应: 开局子多 → 分支因子大, 自动降层)
  function pieceCount(map) {
    let n = 0;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) if (map[r][c]) n++;
    return n;
  }

  // 红方位置表取值; 黑方行镜像 (9 - r)
  function pstValue(type, r, c, my) {
    return PST[type][my === 1 ? r : 9 - r][c];
  }

  // 静态评估: 红为正, 黑为负; 中局/残局分阶段 (借鉴 ChineseChess 分阶段评估)
  function evaluate(map) {
    const endgame = isEndgame(map);
    const V = endgame ? ENDGAME_VALUE : PIECE_VALUE;
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
        // 兵/卒: 过河后位置价值已含在 PST; 残局兵额外加值 (借鉴 cchess-zero 残局兵曲线)
        let base = V[t];
        if (t === 'P' && endgame) {
          // 残局兵: 越深入敌阵越值钱 (row 0-4 = 过河)
          const row = my === 1 ? r : 9 - r;
          base += (5 - Math.min(row, 4)) * 8;
        }
        val += my * (base + pstValue(t, r, c, my));
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
  let searchDepth = 3;   // 当前搜索总深度 (深2禁用静态搜索, 防浅层贪吃长局)
  let nodeBudget = Infinity;   // 当前搜索的节点预算 (超限抛 budget-exceeded, 用已搜结果兜底)
  let deadline = Infinity;     // 当前搜索截止时间戳 (限时迭代加深用)
  const TYPE_IDX = { R: 0, H: 1, C: 2, E: 3, A: 4, P: 5, K: 6 };

  // ---- Zobrist 哈希 + 置换表 (Transposition Table, 借鉴 ChineseChess zobrist) ----
  // 64 位 BigInt 哈希: 7 类型 × 2 色 × 90 格
  let ZOB = null;      // [type(7)][color(2)][cell(90)] -> BigInt
  let HASH_MASK = (1n << 63n) - 1n;
  function initZobrist() {
    if (ZOB) return;
    ZOB = [];
    let seed = 0x9e3779b9;
    const rnd = () => {
      // xorshift32
      seed ^= seed << 13; seed |= 0; seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5; seed >>>= 0;
      return BigInt(seed);
    };
    for (let t = 0; t < 7; t++) {
      ZOB[t] = [];
      for (let c = 0; c < 2; c++) {
        ZOB[t][c] = [];
        for (let cell = 0; cell < 90; cell++) {
          ZOB[t][c][cell] = (rnd() << 32n) ^ rnd();
        }
      }
    }
  }
  const TT = new Map();   // hash -> { score, depth, flag: 'exact'|'lower'|'upper', move }
  const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;
  let curHash = 0n;
  // 棋盘 → 哈希 (仅根节点全量, 搜索内增量)
  function boardHash(map) {
    let h = 0n;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = map[r][c];
        if (!p) continue;
        const t = TYPE_IDX[R.pieceType(p).toUpperCase()];
        const color = R.isRed(p) ? 0 : 1;
        h ^= ZOB[t][color][r * 9 + c];
      }
    }
    return h;
  }
  function hashApply(mv, captured) {
    const t = TYPE_IDX[R.pieceType(mv.piece).toUpperCase()];
    const color = R.isRed(mv.piece) ? 0 : 1;
    curHash ^= ZOB[t][color][mv.fr.r * 9 + mv.fr.c];
    curHash ^= ZOB[t][color][mv.to.r * 9 + mv.to.c];
    if (captured) {
      const ct = TYPE_IDX[R.pieceType(captured).toUpperCase()];
      const cc = R.isRed(captured) ? 0 : 1;
      curHash ^= ZOB[ct][cc][mv.to.r * 9 + mv.to.c];
    }
  }
  function hashUnapply(mv, captured) {
    const t = TYPE_IDX[R.pieceType(mv.piece).toUpperCase()];
    const color = R.isRed(mv.piece) ? 0 : 1;
    curHash ^= ZOB[t][color][mv.to.r * 9 + mv.to.c];
    curHash ^= ZOB[t][color][mv.fr.r * 9 + mv.fr.c];
    if (captured) {
      const ct = TYPE_IDX[R.pieceType(captured).toUpperCase()];
      const cc = R.isRed(captured) ? 0 : 1;
      curHash ^= ZOB[ct][cc][mv.to.r * 9 + mv.to.c];
    }
  }
  function ttGet(hash, depth) {
    const e = TT.get(hash);
    if (!e || e.depth < depth) return null;
    return e;
  }
  function ttStore(hash, depth, score, flag, mv) {
    const e = TT.get(hash);
    if (e && e.depth >= depth) return;  // 已有更深条目
    TT.set(hash, { score, depth, flag, mv: mv || null });
    // 防无限增长: 超 20 万条清空 (对局搜索间隙清理)
    if (TT.size > 200000) TT.clear();
  }

  // ---- 历史启发表: [兵种][目标格] 累积得分 (借鉴 CHistoryHeuritic: 好着法加 2<<depth, 坏着法减) ----
  // 生命周期: 每次 getBestMove 清空, 防止跨对局污染
  let HISTORY = null;
  function clearHistory() {
    HISTORY = new Array(8).fill(0).map(() => new Array(90).fill(0));
  }
  function historyScore(mv) {
    if (!HISTORY) return 0;
    return HISTORY[TYPE_IDX[R.pieceType(mv.piece).toUpperCase()]][mv.to.r * 9 + mv.to.c];
  }
  function historyAdd(mv, depth) {
    if (!HISTORY) return;
    HISTORY[TYPE_IDX[R.pieceType(mv.piece).toUpperCase()]][mv.to.r * 9 + mv.to.c] += (1 << Math.min(depth, 8));
  }

  // 着法排序: 吃子 (MVV-LVA) >> 历史启发 (借鉴 CHistoryHeuritic 排序)
  function sortMoves(moves, map) {
    moves.sort((a, b) => {
      const sa = moveScore(b, map) + bookHint(b), sb = moveScore(a, map) + bookHint(a);
      // 吃子优先 > 开局库启发 > 历史启发
      if (sa !== sb) return sa - sb;
      return historyScore(b) - historyScore(a);
    });
  }

  // 静态搜索 (Quiescence, 借鉴 ChessQuiescMove): 叶子节点只搜吃子, 消除水平线效应
  function quiesce(map, my, alpha, beta) {
    nodeCount++;
    if (nodeCount > nodeBudget) throw new Error('budget-exceeded');
    if (nodeCount > MAX_NODES) throw new Error('nodes-exceeded');
    if (Date.now() > deadline) throw new Error('time-exceeded');

    const stand = my * evaluate(map);
    if (stand >= beta) return stand;   // 超出上界, 剪枝
    if (stand > alpha) alpha = stand;

    // 只生成"吃子"走法 (捕获走法): 伪走法 + 走完不被将军过滤 (保持规则正确)
    const pseudo = R.genPseudoMoves(map, my);
    const captures = [];
    for (const mv of pseudo) {
      if (!map[mv.to.r][mv.to.c]) continue;
      const captured = R.makeMove(map, mv);
      const ok = !R.inCheck(map, my) && !R.kingsFacing(map);
      R.undoMove(map, mv, captured);
      if (ok) captures.push(mv);
    }
    if (captures.length === 0) return stand;

    // 排序: 吃子价值大的优先 (MVV-LVA)
    captures.sort((a, b) => moveScore(b, map) - moveScore(a, map));

    let best = stand;
    for (const mv of captures) {
      const captured = R.makeMove(map, mv);
      if (captured && R.pieceType(captured).toUpperCase() === 'K') {
        R.undoMove(map, mv, captured);
        return MATE - 2000;  // 吃将直接取胜
      }
      const val = -quiesce(map, -my, -beta, -alpha);
      R.undoMove(map, mv, captured);
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;
    }
    return best;
  }

  // negamax alpha-beta + 置换表 + 历史启发 + 静态搜索: 返回分值; 根节点选最佳着法
  function negamax(map, my, depth, alpha, beta, ply) {
    nodeCount++;
    if (nodeCount > nodeBudget) throw new Error('budget-exceeded');
    if (nodeCount > MAX_NODES) throw new Error('nodes-exceeded');
    if (Date.now() > deadline) throw new Error('time-exceeded');

    // 置换表查询 (借鉴 ChineseChess TranspositionTable)
    const origHash = curHash;
    const tt = ttGet(origHash, depth);
    if (tt) {
      if (tt.flag === TT_EXACT) return tt.score;
      if (tt.flag === TT_LOWER && tt.score >= beta) return tt.score;
      if (tt.flag === TT_UPPER && tt.score <= alpha) return tt.score;
    }
    // 置换表着法优先搜索
    let ttMove = tt && tt.mv;

    if (depth === 0) {
      // 叶子 → 静态搜索 (只搜吃子, 消除水平线效应)
      // 注意: 深 2 不启用 (浅层贪吃会导致对局拖长), 深 ≥3 才用
      const s = (searchDepth < 3) ? my * evaluate(map) : quiesce(map, my, alpha, beta);
      ttStore(origHash, depth, s, TT_EXACT, null);
      return s;
    }

    const moves = R.legalMoves(map, my);
    if (moves.length === 0) {
      // 无合法着法: 被将死则对方胜 (MATE - ply), 困毙也判负
      const s = -(MATE - 2000) - (8 - depth);  // 越早杀越大; 困毙同判负
      ttStore(origHash, depth, s, TT_EXACT, null);
      return s;
    }

    // 排序: 吃子优先 + 历史启发 + 置换表着法置顶
    sortMoves(moves, map);
    if (ttMove) {
      const i = moves.findIndex(m => m.fr.r === ttMove.fr.r && m.fr.c === ttMove.fr.c && m.to.r === ttMove.to.r && m.to.c === ttMove.to.c);
      if (i > 0) { moves.unshift(moves.splice(i, 1)[0]); }
    }

    let best = -Infinity;
    let bestMv = null;
    let flag = TT_UPPER;
    for (const mv of moves) {
      const captured = R.makeMove(map, mv);
      hashApply(mv, captured);
      // 吃将即胜
      if (captured && R.pieceType(captured).toUpperCase() === 'K') {
        hashUnapply(mv, captured);
        R.undoMove(map, mv, captured);
        ttStore(origHash, depth, MATE - 2000 + (8 - depth), TT_EXACT, mv);
        return MATE - 2000 + (8 - depth);  // 对方将被吃: 直接取胜
      }
      const val = -negamax(map, -my, depth - 1, -beta, -alpha, ply + 1);
      hashUnapply(mv, captured);
      R.undoMove(map, mv, captured);
      if (val > best) { best = val; bestMv = mv; }
      if (val > alpha) {
        alpha = val;
        flag = TT_EXACT;
      }
      if (alpha >= beta) {
        // 剪枝: 下界
        flag = TT_LOWER;
        historyAdd(mv, depth);
        break;
      }
    }
    // 记录最佳着法 (历史 + 置换表)
    if (alpha < beta && bestMv) historyAdd(bestMv, depth);
    ttStore(origHash, depth, best, flag, bestMv);
    return best;
  }

  // MTD(f) 搜索 (借鉴 ChineseChess AICoreHandler): 零窗口反复搜索, 收敛到真值
  // 比标准 alpha-beta 窗口窄, 配合置换表提升剪枝率
  function mtdf(map, my, depth, guess) {
    let lower = -Infinity;
    let upper = Infinity;
    let g = guess;
    let bestMv = null;
    const moves0 = R.legalMoves(map, my);
    let iterations = 0;
    while (lower < upper - 1 && iterations < 64) {   // 迭代上限 64 (防置换表死循环)
      iterations++;
      const beta = (g === -Infinity || g === Infinity) ? (g === -Infinity ? -Infinity + 1 : Infinity - 1) : g;
      const res = pvsRoot(map, my, depth, beta - 1, beta, moves0);
      g = res.score;
      if (res.move) bestMv = res.move;
      if (g < beta) upper = g;
      else lower = g;
      if (nodeCount > nodeBudget) break;  // 预算保护
    }
    if (bestMv) bestMv.score = (lower > -Infinity && lower < Infinity) ? lower : g;
    return bestMv;
  }

  // 根节点: 对每个走法搜索, 返回最佳着法 + 分值 (供 MTD(f) 迭代)
  function pvsRoot(map, my, depth, alpha, beta, moves) {
    let best = -Infinity;
    let bestMv = null;
    let first = true;
    for (const mv of moves) {
      if (nodeCount > nodeBudget) throw new Error('budget-exceeded');  // 预算保护
      const captured = R.makeMove(map, mv);
      hashApply(mv, captured);
      let score;
      if (captured && R.pieceType(captured).toUpperCase() === 'K') {
        score = MATE + (8 - depth);
        hashUnapply(mv, captured);
        R.undoMove(map, mv, captured);
        return { score, move: mv };
      } else {
        // 根节点用全窗口 (PVS: 首走法全窗口, 其余零窗口)
        if (first) {
          score = -negamax(map, -my, depth - 1, -beta, -alpha, 1);
          first = false;
        } else {
          score = -negamax(map, -my, depth - 1, -alpha - 1, -alpha, 1);
          if (score > alpha && score < beta) {
            score = -negamax(map, -my, depth - 1, -beta, -alpha, 1);
          }
        }
      }
      hashUnapply(mv, captured);
      R.undoMove(map, mv, captured);
      if (score > best) { best = score; bestMv = mv; }
      if (score > alpha) alpha = score;
    }
    return { score: best, move: bestMv };
  }

  /**
   * 求最佳走法
   * @param {Array} map 10x9 棋盘
   * @param {number} my 走棋方 (1 红 / -1 黑)
   * @param {number} depth 搜索深度 (2/3/4)
   * @param {boolean} randomize 弱化: 同分着法随机 (菜鸟档)
   * @returns {{fr:{r,c},to:{r,c},piece,score}|null} 最佳着法; 无着法返回 null
   */
  // 限时迭代加深 (Time-Controlled Iterative Deepening):
  // 从深 3 开始逐层加深, 每层用掉 15s 预算的一部分; 时间到 → 返回已完成的最高层结果
  // 借鉴经典引擎 (pengjiu/ChineseChess AICoreHandler) 的 time-managed 搜索思想
  const TIME_LIMIT_MS = 10000;   // 深度思考总预算 10s (用户要求 ≤10s)
  function getBestMove(map, my, depth, randomize) {
    const moves = R.legalMoves(map, my);
    if (moves.length === 0) return null;

    // 开局库优先 (借鉴 public-Xiangqi OpenBook): 命中 → 毫秒级出招, 不耗 15s 预算
    // 菜鸟档: 随机在开局库里选变招 (天然弱化, 符合 aichess 探索思想)
    if (!randomize) {
      const bm = bookMove(map, my);
      if (bm) { bm.score = 100; bm._fromBook = true; return bm; }
    }

    initZobrist();

    // 深 ≤2 (测试/快速档): 直接单层 alpha-beta, 不走限时迭代
    if (depth <= 2) {
      nodeCount = 0;
      searchDepth = depth;
      clearHistory();
      TT.clear();
      sortMoves(moves, map);
      curHash = boardHash(map);
      nodeBudget = DEPTH_BUDGET[depth] || MAX_NODES;
      deadline = Infinity;
      let alpha = -Infinity;
      const beta = Infinity;
      let bestMove = null, bestScore = -Infinity;
      try {
        for (const mv of moves) {
          const captured = R.makeMove(map, mv);
          hashApply(mv, captured);
          let score;
          if (captured && R.pieceType(captured).toUpperCase() === 'K') {
            score = MATE + (8 - depth);
          } else {
            score = -negamax(map, -my, depth - 1, -beta, -alpha, 1);
          }
          hashUnapply(mv, captured);
          R.undoMove(map, mv, captured);
          if (randomize && score >= bestScore - 40 && Math.random() < 0.4) {
            bestMove = mv; bestScore = score;
          } else if (score > bestScore) {
            bestMove = mv; bestScore = score;
          }
          if (score > alpha) alpha = score;
        }
      } catch (e) {
        if (e.message !== 'nodes-exceeded' && e.message !== 'budget-exceeded' && e.message !== 'time-exceeded') throw e;
      }
      if (!bestMove) { bestMove = moves[0]; bestScore = 0; }
      bestMove.score = bestScore;
      return bestMove;
    }

    // 目标深度: 高手 10 层; 中级 7 层; 菜鸟 5 层
    const targetDepth = depth >= 5 ? 10 : (depth >= 3 ? 7 : 5);
    const timeBudget = depth >= 5 ? TIME_LIMIT_MS : (depth >= 3 ? 6000 : 3000);

    const start = Date.now();
    let bestMove = null;
    let bestScore = 0;
    // 吃将立即返回 (终局走法无需搜索)
    const kill = moves.find(m => map[m.to.r][m.to.c] && R.pieceType(map[m.to.r][m.to.c]).toUpperCase() === 'K');
    if (kill) { kill.score = MATE; return kill; }

    // 逐层加深: 深 3 → 4 → 5 ... → targetDepth
    // 全局截止 (不切片): 浅层天然快 (ms 级), 深层自然吃掉剩余时间
    deadline = start + timeBudget;
    for (let d = 3; d <= targetDepth; d++) {
      nodeCount = 0;
      searchDepth = d;
      clearHistory();
      // TT 不清表: 深层复用浅层已算局面 (Zobrist 哈希一致), 提速显著
      sortMoves(moves, map);
      curHash = boardHash(map);
      nodeBudget = 10000000;   // 单层 1000 万节点 (时间截止才是真预算)

      try {
        const guess = bestMove ? bestScore : evaluate(map) * (my > 0 ? 1 : -1);
        const mv = mtdf(map, my, d, guess);
        if (mv) { bestMove = mv; bestScore = mv.score !== undefined ? mv.score : bestScore; }
      } catch (e) {
        if (e.message !== 'nodes-exceeded' && e.message !== 'budget-exceeded' && e.message !== 'time-exceeded') throw e;
        break;  // 该层超时/超限 → 用上一层结果
      }
    }

    // 最终校验: bestMove 必须合法 (走完不被将军/不造成对脸) — 防伪走法泄漏
    if (bestMove) {
      const cap = R.makeMove(map, bestMove);
      const ok = !R.inCheck(map, my) && !R.kingsFacing(map);
      R.undoMove(map, bestMove, cap);
      if (!ok) {
        // 从不合法候选里挑一个合法走法 (moves 已按分数排序, 取第一个合法的)
        const legalAlt = moves.find(m => {
          const c2 = R.makeMove(map, m);
          const ok2 = !R.inCheck(map, my) && !R.kingsFacing(map);
          R.undoMove(map, m, c2);
          return ok2;
        });
        bestMove = legalAlt || moves[0];
        bestScore = 0;
      }
    }
    if (!bestMove) { bestMove = moves[0]; bestScore = 0; }
    bestMove.score = bestScore;
    // 附上实际达到的深度 (调试/显示用)
    bestMove._depth = searchDepth;
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
