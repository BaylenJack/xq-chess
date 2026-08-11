/*!
 * xq-chess 中国象棋规则引擎 (纯函数, 零 DOM 依赖)
 * 规则逻辑借鉴开源项目 itlwei/Chess (MIT): https://github.com/itlwei/Chess
 * 棋盘: map[row][col] (10 行 x 9 列), row 0 = 红方底线, row 9 = 黑方底线
 * 棋子编码 (ASCII, 引擎内部用, 显示由 charOf 转换):
 *   红方 (my=1):  K=帥 A=仕 E=相 H=馬 R=車 C=炮 P=兵
 *   黑方 (my=-1): k=將 a=士 e=象 h=馬 r=車 c=炮 p=卒
 *   my 取红为正: 红 = 1, 黑 = -1
 */
(function (root) {
  'use strict';

  const ROWS = 10;
  const COLS = 9;

  // 标准开局: 红在上 (row 0-4), 黑在下 (row 5-9)
  function initMap() {
    return [
      ['R0', 'H0', 'E0', 'A0', 'K0', 'A1', 'E1', 'H1', 'R1'],
      [null, null, null, null, null, null, null, null, null],
      [null, 'C0', null, null, null, null, null, 'C1', null],
      ['P0', null, 'P1', null, 'P2', null, 'P3', null, 'P4'],
      [null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null],
      ['p0', null, 'p1', null, 'p2', null, 'p3', null, 'p4'],
      [null, 'c0', null, null, null, null, null, 'c1', null],
      [null, null, null, null, null, null, null, null, null],
      ['r0', 'h0', 'e0', 'a0', 'k0', 'a1', 'e1', 'h1', 'r1'],
    ];
  }

  function pieceType(piece) { return piece ? piece[0] : null; }
  function isRed(piece) { return !!piece && piece[0] === piece[0].toUpperCase(); }

  const CHARS = {
    K: '帥', A: '仕', E: '相', H: '馬', R: '車', C: '炮', P: '兵',
    k: '將', a: '士', e: '象', h: '馬', r: '車', c: '炮', p: '卒',
  };
  function charOf(piece) { return piece ? CHARS[pieceType(piece)] : ''; }

  function inBoard(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

  // 九宫: 将/士 的活动范围
  function inPalace(r, c) { return c >= 3 && c <= 5 && ((r >= 0 && r <= 2) || (r >= 7 && r <= 9)); }

  // 直线扫描 (炮用): 从 (r,c) 沿 (dr,dc) 推进
  // 中国象棋炮: 走点 = 遇第一子前的所有空格; 吃子 = 隔第一子 (炮架) 吃第二子, 中间空格忽略
  function scanDir(map, r, c, dr, dc) {
    const canGo = [];   // 走点
    let target = null;  // 隔一子可吃的目标 (第二子)
    let n = 0;          // 已遇子数
    let rr = r + dr, cc = c + dc;
    while (inBoard(rr, cc)) {
      const p = map[rr][cc];
      if (!p) {
        if (n === 0) canGo.push([rr, cc]);
      } else {
        n++;
        if (n === 2) { target = [rr, cc]; break; }
      }
      rr += dr; cc += dc;
    }
    return { canGo, target };
  }

  // ---- 每兵种伪合法走法生成 (不含自将军过滤) ----
  const bylaw = {
    // 车: 直线任意, 遇到对方子可吃后停
    R(r, c, map, my) {
      const d = [];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        let rr = r + dr, cc = c + dc;
        while (inBoard(rr, cc)) {
          const p = map[rr][cc];
          if (!p) d.push([rr, cc]);
          else {
            if ((isRed(p) ? 1 : -1) !== my) d.push([rr, cc]);
            break;
          }
          rr += dr; cc += dc;
        }
      }
      return d;
    },
    // 马: 走日, 蹩马腿
    H(r, c, map, my) {
      const d = [];
      // [dr, dc] 马跳方向, [lr, lc] 马腿方向 (2 分量方向的中点)
      const legs = [[1, 2, 0, 1], [1, -2, 0, -1], [-1, 2, 0, 1], [-1, -2, 0, -1],
                    [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0]];
      for (const [dr, dc, lr, lc] of legs) {
        const rr = r + dr, cc = c + dc;
        if (!inBoard(rr, cc)) continue;
        if (map[r + lr][c + lc]) continue;  // 蹩腿
        const p = map[rr][cc];
        if (!p || (isRed(p) ? 1 : -1) !== my) d.push([rr, cc]);
      }
      return d;
    },
    // 象/相: 走田, 塞象眼, 不过河
    E(r, c, map, my) {
      const d = [];
      const redHalf = my === 1;  // 红象在 row 0-4
      for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
        const rr = r + dr, cc = c + dc;
        if (!inBoard(rr, cc)) continue;
        if (redHalf ? rr > 4 : rr < 5) continue;  // 象不能过河
        if (map[r + dr / 2][c + dc / 2]) continue;  // 塞象眼
        const p = map[rr][cc];
        if (!p || (isRed(p) ? 1 : -1) !== my) d.push([rr, cc]);
      }
      return d;
    },
    // 士: 九宫内斜走一格
    A(r, c, map, my) {
      const d = [];
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (!inPalace(rr, cc)) continue;
        const p = map[rr][cc];
        if (!p || (isRed(p) ? 1 : -1) !== my) d.push([rr, cc]);
      }
      return d;
    },
    // 将/帅: 九宫内直走一格 (对脸规则在合法过滤时处理)
    K(r, c, map, my) {
      const d = [];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (!inPalace(rr, cc)) continue;
        const p = map[rr][cc];
        if (!p || (isRed(p) ? 1 : -1) !== my) d.push([rr, cc]);
      }
      return d;
    },
    // 炮: 直线走空点 (遇第一子前), 隔一子跳吃 (中间空格可忽略)
    C(r, c, map, my) {
      const d = [];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const { canGo, target } = scanDir(map, r, c, dr, dc);
        for (const pt of canGo) d.push(pt);
        if (target) {
          const [tr, tc] = target;
          const t = map[tr][tc];
          if (t && (isRed(t) ? 1 : -1) !== my) d.push([tr, tc]);
        }
      }
      return d;
    },
    // 兵/卒: 过河前只前进, 过河后可横移
    P(r, c, map, my) {
      const d = [];
      const forward = my === 1 ? 1 : -1;  // 红向下 (row 增大), 黑向上
      const crossed = my === 1 ? r >= 5 : r <= 4;  // 过河判定
      const rr = r + forward, cc = c;
      if (inBoard(rr, cc)) {
        const p = map[rr][cc];
        if (!p || (isRed(p) ? 1 : -1) !== my) d.push([rr, cc]);
      }
      if (crossed) {
        for (const dc of [-1, 1]) {
          const cr = r, c2 = c + dc;
          if (inBoard(cr, c2)) {
            const p = map[cr][c2];
            if (!p || (isRed(p) ? 1 : -1) !== my) d.push([cr, c2]);
          }
        }
      }
      return d;
    },
  };

  // 生成某方的全部伪合法走法
  function genPseudoMoves(map, my) {
    const moves = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = map[r][c];
        if (!piece) continue;
        if ((isRed(piece) ? 1 : -1) !== my) continue;
        const type = pieceType(piece).toUpperCase();  // 规则按大写索引
        const targets = bylaw[type](r, c, map, my);
        for (const [tr, tc] of targets) {
          moves.push({ fr: { r, c }, to: { r: tr, c: tc }, piece });
        }
      }
    }
    return moves;
  }

  // 就地执行走法, 返回被吃子 (若有); 用于搜索的 make/undo
  function makeMove(map, mv) {
    const captured = map[mv.to.r][mv.to.c];
    map[mv.to.r][mv.to.c] = mv.piece;
    map[mv.fr.r][mv.fr.c] = null;
    return captured;
  }
  function undoMove(map, mv, captured) {
    map[mv.fr.r][mv.fr.c] = mv.piece;
    map[mv.to.r][mv.to.c] = captured;
  }

  // 找将/帅位置
  function findKing(map, my) {
    const king = my === 1 ? 'K' : 'k';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (map[r][c] && map[r][c][0] === king) return { r, c };
      }
    }
    return null;
  }

  // 将军检测: 方向扫描对方子是否攻击到己方将 (含将帅对脸)
  function inCheck(map, my) {
    const king = findKing(map, my);
    if (!king) return false;  // 将被吃 = 已输 (游戏结束, 不再算将军)
    const { r, c } = king;
    const enemy = -my;

    // 直线: 车与将
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      let rr = r + dr, cc = c + dc;
      while (inBoard(rr, cc)) {
        const p = map[rr][cc];
        if (p) {
          const t = pieceType(p).toUpperCase();
          if ((isRed(p) ? 1 : -1) === enemy && (t === 'R' || t === 'K')) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }

    // 炮: 隔一个子打将
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      let screen = false;
      let rr = r + dr, cc = c + dc;
      while (inBoard(rr, cc)) {
        const p = map[rr][cc];
        if (p) {
          if (!screen) screen = true;
          else {
            if ((isRed(p) ? 1 : -1) === enemy && pieceType(p).toUpperCase() === 'C') return true;
            break;
          }
        }
        rr += dr; cc += dc;
      }
    }

    // 马
    const horseMoves = [[-1, -2], [-1, 2], [1, -2], [1, 2], [-2, -1], [-2, 1], [2, -1], [2, 1]];
    for (const [dr, dc] of horseMoves) {
      const rr = r + dr, cc = c + dc;
      if (!inBoard(rr, cc)) continue;
      const p = map[rr][cc];
      if (p && (isRed(p) ? 1 : -1) === enemy && pieceType(p).toUpperCase() === 'H') {
        // 马腿在 2 分量方向的中点: 马 (r+dr,c+dc) 跳向将 (r,c), 腿 = (r+dr/2, c+dc/2 的非 2 分量)
        const lr = Math.abs(dr) === 2 ? r + dr / 2 : r + dr;
        const lc = Math.abs(dc) === 2 ? c + dc / 2 : c + dc;
        if (!map[lr][lc]) return true;  // 马腿无遮挡才将军
      }
    }

    // 兵/卒
    const pawnDir = enemy === 1 ? 1 : -1;  // 敌兵向前方向 (红兵 +1, 黑兵 -1)
    // 正面: 敌兵在将的正前方一行
    const pr = r - pawnDir;
    if (inBoard(pr, c)) {
      const p = map[pr][c];
      if (p && (isRed(p) ? 1 : -1) === enemy && pieceType(p).toUpperCase() === 'P') return true;
    }
    // 横吃: 敌兵在将的左右邻格 (兵到将所在行必然已过河, 九宫在 0-2/7-9 行)
    for (const pc of [c - 1, c + 1]) {
      if (!inBoard(r, pc)) continue;
      const p = map[r][pc];
      if (p && (isRed(p) ? 1 : -1) === enemy && pieceType(p).toUpperCase() === 'P') return true;
    }

    return false;
  }

  // 将帅对脸: 同列直线上无任何棋子 (合法过滤时需避免)
  function kingsFacing(map) {
    const red = findKing(map, 1), black = findKing(map, -1);
    if (!red || !black || red.c !== black.c) return false;
    const c = red.c;
    const top = Math.min(red.r, black.r), bottom = Math.max(red.r, black.r);
    for (let r = top + 1; r < bottom; r++) {
      if (map[r][c]) return false;
    }
    return true;
  }

  // 从某格出发的合法走法 (过滤: 走完后己方不被将军 / 不造成对脸)
  function legalMovesFrom(map, fr) {
    const piece = map[fr.r][fr.c];
    if (!piece) return [];
    const my = isRed(piece) ? 1 : -1;
    const pseudo = bylaw[pieceType(piece).toUpperCase()](fr.r, fr.c, map, my);
    const out = [];
    for (const [tr, tc] of pseudo) {
      const mv = { fr: { r: fr.r, c: fr.c }, to: { r: tr, c: tc }, piece };
      const captured = makeMove(map, mv);
      const ok = !inCheck(map, my) && !kingsFacing(map);
      undoMove(map, mv, captured);
      if (ok) out.push(mv);
    }
    return out;
  }

  // 伪合法但"送将/对脸"被禁的着法 (UI 用红 X 提示, 让玩家明白规则限制)
  function illegalMovesFrom(map, fr) {
    const piece = map[fr.r][fr.c];
    if (!piece) return [];
    const my = isRed(piece) ? 1 : -1;
    const pseudo = bylaw[pieceType(piece).toUpperCase()](fr.r, fr.c, map, my);
    const out = [];
    for (const [tr, tc] of pseudo) {
      const mv = { fr: { r: fr.r, c: fr.c }, to: { r: tr, c: tc }, piece };
      const captured = makeMove(map, mv);
      const ok = !inCheck(map, my) && !kingsFacing(map);
      undoMove(map, mv, captured);
      if (!ok) out.push(mv);
    }
    return out;
  }

  // 某方的全部合法走法
  function legalMoves(map, my) {
    const out = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = map[r][c];
        if (!piece || (isRed(piece) ? 1 : -1) !== my) continue;
        out.push(...legalMovesFrom(map, { r, c }));
      }
    }
    return out;
  }

  // 是否还有合法走法 (困毙判定)
  function hasLegalMoves(map, my) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = map[r][c];
        if (!piece || (isRed(piece) ? 1 : -1) !== my) continue;
        if (legalMovesFrom(map, { r, c }).length > 0) return true;
      }
    }
    return false;
  }

  // 判断某一方是否已被将死 (无合法着法且被将军) 或困毙 (无合法着法且未将军)
  function statusAfter(map, my) {
    if (!hasLegalMoves(map, my)) {
      return inCheck(map, my) ? 'checkmated' : 'stalemated';
    }
    return 'ok';
  }

  const rules = {
    ROWS, COLS,
    initMap,
    pieceType, isRed, charOf,
    inBoard, inPalace,
    genPseudoMoves, legalMoves, legalMovesFrom, illegalMovesFrom,
    makeMove, undoMove,
    inCheck, kingsFacing, findKing,
    hasLegalMoves, statusAfter,
  };

  root.XQ = root.XQ || {};
  root.XQ.rules = rules;

  // CommonJS 导出 (node 测试用)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { rules };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
