/* 中国象棋规则引擎：浏览器与 Node 共用，所有操作均显式传入棋盘。 */
(function (root) {
  'use strict';

  const ROWS = 10, COLS = 9, RED = 1, BLACK = -1;
  const GLYPHS = { K:'帥', A:'仕', E:'相', H:'馬', R:'車', C:'炮', P:'兵', k:'將', a:'士', e:'象', h:'馬', r:'車', c:'炮', p:'卒' };
  const START = [
    ['R0','H0','E0','A0','K0','A1','E1','H1','R1'],
    [null,null,null,null,null,null,null,null,null],
    [null,'C0',null,null,null,null,null,'C1',null],
    ['P0',null,'P1',null,'P2',null,'P3',null,'P4'],
    [null,null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null,null],
    ['p0',null,'p1',null,'p2',null,'p3',null,'p4'],
    [null,'c0',null,null,null,null,null,'c1',null],
    [null,null,null,null,null,null,null,null,null],
    ['r0','h0','e0','a0','k0','a1','e1','h1','r1'],
  ];

  const clone = board => board.map(row => row.slice());
  const initialBoard = () => clone(START);
  const inBoard = (r,c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const typeOf = piece => piece ? piece[0].toUpperCase() : null;
  const sideOf = piece => !piece ? 0 : (piece[0] === piece[0].toUpperCase() ? RED : BLACK);
  const isRed = piece => sideOf(piece) === RED;
  const charOf = piece => piece ? GLYPHS[piece[0]] : '';
  const inPalace = (r,c) => c >= 3 && c <= 5 && ((r >= 0 && r <= 2) || (r >= 7 && r <= 9));
  const move = (board, r, c, tr, tc) => ({ fr:{r,c}, to:{r:tr,c:tc}, piece:board[r][c] });
  const canLand = (board, side, r, c) => inBoard(r,c) && sideOf(board[r][c]) !== side;

  function rookTargets(board, r, c, side) {
    const out = [];
    for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      for (let rr=r+dr, cc=c+dc; inBoard(rr,cc); rr+=dr, cc+=dc) {
        if (!board[rr][cc]) out.push([rr,cc]);
        else { if (sideOf(board[rr][cc]) !== side) out.push([rr,cc]); break; }
      }
    }
    return out;
  }

  function cannonTargets(board, r, c, side) {
    const out = [];
    for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let screen = false;
      for (let rr=r+dr, cc=c+dc; inBoard(rr,cc); rr+=dr, cc+=dc) {
        const target = board[rr][cc];
        if (!screen) {
          if (!target) out.push([rr,cc]); else screen = true;
        } else if (target) {
          if (sideOf(target) !== side) out.push([rr,cc]);
          break;
        }
      }
    }
    return out;
  }

  function pseudoTargets(board, r, c) {
    const piece = board[r]?.[c];
    if (!piece) return [];
    const side = sideOf(piece), type = typeOf(piece), out = [];
    if (type === 'R') return rookTargets(board,r,c,side);
    if (type === 'C') return cannonTargets(board,r,c,side);
    if (type === 'H') {
      for (const [dr,dc,lr,lc] of [[2,1,1,0],[2,-1,1,0],[-2,1,-1,0],[-2,-1,-1,0],[1,2,0,1],[1,-2,0,-1],[-1,2,0,1],[-1,-2,0,-1]]) {
        if (!board[r+lr]?.[c+lc] && canLand(board,side,r+dr,c+dc)) out.push([r+dr,c+dc]);
      }
    } else if (type === 'E') {
      for (const [dr,dc] of [[2,2],[2,-2],[-2,2],[-2,-2]]) {
        const tr=r+dr, tc=c+dc;
        const ownHalf = side === RED ? tr <= 4 : tr >= 5;
        if (ownHalf && !board[r+dr/2]?.[c+dc/2] && canLand(board,side,tr,tc)) out.push([tr,tc]);
      }
    } else if (type === 'A') {
      for (const [dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const tr=r+dr, tc=c+dc;
        if (inPalace(tr,tc) && canLand(board,side,tr,tc)) out.push([tr,tc]);
      }
    } else if (type === 'K') {
      for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const tr=r+dr, tc=c+dc;
        if (inPalace(tr,tc) && canLand(board,side,tr,tc)) out.push([tr,tc]);
      }
    } else if (type === 'P') {
      const forward = side === RED ? 1 : -1;
      if (canLand(board,side,r+forward,c)) out.push([r+forward,c]);
      const crossed = side === RED ? r >= 5 : r <= 4;
      if (crossed) for (const dc of [-1,1]) if (canLand(board,side,r,c+dc)) out.push([r,c+dc]);
    }
    return out;
  }

  function applyMove(board, mv) {
    const captured = board[mv.to.r][mv.to.c];
    board[mv.to.r][mv.to.c] = board[mv.fr.r][mv.fr.c];
    board[mv.fr.r][mv.fr.c] = null;
    return captured;
  }
  function undoMove(board, mv, captured) {
    board[mv.fr.r][mv.fr.c] = mv.piece;
    board[mv.to.r][mv.to.c] = captured || null;
  }

  function findKing(board, side) {
    const wanted = side === RED ? 'K' : 'k';
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (board[r][c]?.[0] === wanted) return {r,c};
    return null;
  }

  function kingsFacing(board) {
    const red=findKing(board,RED), black=findKing(board,BLACK);
    if (!red || !black || red.c !== black.c) return false;
    for (let r=Math.min(red.r,black.r)+1; r<Math.max(red.r,black.r); r++) if (board[r][red.c]) return false;
    return true;
  }

  function inCheck(board, side) {
    const king = findKing(board,side);
    if (!king) return true;
    const enemy = -side;
    const {r,c}=king;
    // 车、将帅对脸：沿四个正方向遇到的第一枚棋子。
    for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
      for(let rr=r+dr,cc=c+dc;inBoard(rr,cc);rr+=dr,cc+=dc){
        const piece=board[rr][cc];if(!piece)continue;
        if(sideOf(piece)===enemy&&(typeOf(piece)==='R'||typeOf(piece)==='K'))return true;
        break;
      }
    }
    // 炮：隔一枚炮架后遇到的第一枚棋子。
    for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
      let screen=false;
      for(let rr=r+dr,cc=c+dc;inBoard(rr,cc);rr+=dr,cc+=dc){
        const piece=board[rr][cc];if(!piece)continue;
        if(!screen){screen=true;continue;}
        if(sideOf(piece)===enemy&&typeOf(piece)==='C')return true;
        break;
      }
    }
    // 马与蹩马腿。
    for(const [dr,dc,lr,lc] of [[2,1,1,1],[2,-1,1,-1],[-2,1,-1,1],[-2,-1,-1,-1],[1,2,1,1],[1,-2,1,-1],[-1,2,-1,1],[-1,-2,-1,-1]]){
      const rr=r+dr,cc=c+dc,piece=board[rr]?.[cc];
      if(piece&&sideOf(piece)===enemy&&typeOf(piece)==='H'&&!board[r+lr]?.[c+lc])return true;
    }
    // 兵卒：正向攻击与过河后的横向攻击。
    const forward=enemy===RED?1:-1,pr=r-forward,front=board[pr]?.[c];
    if(front&&sideOf(front)===enemy&&typeOf(front)==='P')return true;
    for(const cc of [c-1,c+1]){const piece=board[r]?.[cc];if(piece&&sideOf(piece)===enemy&&typeOf(piece)==='P')return true;}
    return false;
  }

  function legalMovesFrom(board, from) {
    const piece = board[from.r]?.[from.c];
    if (!piece) return [];
    const side = sideOf(piece), out=[];
    for (const [tr,tc] of pseudoTargets(board,from.r,from.c)) {
      const mv=move(board,from.r,from.c,tr,tc), captured=applyMove(board,mv);
      const legal=!inCheck(board,side);
      undoMove(board,mv,captured);
      if (legal) out.push(mv);
    }
    return out;
  }
  function illegalMovesFrom(board, from) {
    const legal = new Set(legalMovesFrom(board,from).map(m => `${m.to.r},${m.to.c}`));
    return pseudoTargets(board,from.r,from.c).filter(([r,c]) => !legal.has(`${r},${c}`)).map(([r,c]) => move(board,from.r,from.c,r,c));
  }
  function legalMoves(board, side) {
    const out=[];
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (sideOf(board[r][c])===side) out.push(...legalMovesFrom(board,{r,c}));
    return out;
  }
  const hasLegalMoves = (board,side) => legalMoves(board,side).length > 0;
  const resultFor = (board,sideToMove) => hasLegalMoves(board,sideToMove) ? 'playing' : (sideToMove===RED?'black_win':'red_win');

  const rules = {
    ROWS,COLS,RED,BLACK, initialBoard, initMap:initialBoard, clone,
    typeOf, pieceType:typeOf, sideOf, isRed, charOf, inBoard, inPalace,
    pseudoTargets, legalMovesFrom, illegalMovesFrom, legalMoves,
    applyMove, makeMove:applyMove, undoMove, findKing, kingsFacing, inCheck, hasLegalMoves, resultFor,
  };
  root.XQ = root.XQ || {}; root.XQ.rules = rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = { rules };
})(typeof globalThis !== 'undefined' ? globalThis : this);
