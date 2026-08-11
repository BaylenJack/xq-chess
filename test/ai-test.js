/*!
 * xq-chess AI 测试: 杀棋 / 不送将 / 性能 / soak 对弈
 * 用法: node test/ai-test.js
 */
'use strict';

const { rules } = require('../public/js/rules.js');
const { ai } = require('../public/js/ai.js');

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; } else { failed++; console.error('  ✗ ' + msg); } }
function eq(a, b, msg) { assert(a === b, `${msg} (期望 ${b}, 实际 ${a})`); }

function EMPTY() {
  const m = [];
  for (let i = 0; i < 10; i++) m.push(new Array(9).fill(null));
  return m;
}

// ---------- 杀棋位 ----------
console.log('== AI: 杀棋位 ==');
{
  // 双车绝杀: 红方一步将死黑将 (车吃将)
  const map = EMPTY();
  map[0][4] = 'k0';
  map[1][4] = 'R0';   // 红车可吃将
  map[2][4] = 'R1';   // 另一车
  const mv = ai.getBestMove(map, 1, 3);
  assert(mv && mv.to.r === 0 && mv.to.c === 4, 'AI 应吃将 (1,4)→(0,4)');
}
{
  // 悬将位: 黑将 (0,4), 红车 (0,0) 直路只隔黑卒 (0,1) 当炮架 → AI 吃卒破防后下一步吃将
  // 更直接: 黑将 (9,4), 红车 (9,0) 同排, 中间隔 2 个黑卒 → AI 至少先吃一个卒
  const map = EMPTY();
  map[9][4] = 'k0';
  map[9][0] = 'R0';
  map[9][1] = 'p0'; map[9][2] = 'p1';  // 两个黑卒挡路
  const mv = ai.getBestMove(map, 1, 3);
  assert(mv && mv.fr.r === 9 && mv.fr.c === 0, 'AI 用车吃卒 (9,1)');
}

// ---------- 不送将自检 ----------
console.log('== AI: 不送将 ==');
{
  // 黑车将军红帅, 红方必须应将; AI 走完任何着法都不能再被将军
  const map = EMPTY();
  map[0][4] = 'K0';
  map[3][4] = 'r0';   // 黑车直线将军
  map[1][4] = 'P9';   // 挡兵: 可前进挡或吃车
  const mv = ai.getBestMove(map, 1, 3);
  assert(!!mv, '被将军时 AI 有应着');
  const captured = rules.makeMove(map, mv);
  assert(!rules.inCheck(map, 1), 'AI 走完后红方不被将军');
  rules.undoMove(map, mv, captured);
}
{
  // 对脸禁着: 红帅 (8,4) 黑将 (0,4) 同列, AI 不得走 (7,4)
  const map = EMPTY();
  map[0][4] = 'k0';
  map[8][4] = 'K0';
  const mv = ai.getBestMove(map, 1, 3);
  assert(!!mv && !(mv.to.r === 7 && mv.to.c === 4), 'AI 不造成将帅对脸');
}

// ---------- 性能 ----------
console.log('== AI: 性能 ==');
{
  const map = rules.initMap();
  const t0 = Date.now();
  const mv = ai.getBestMove(map, 1, 3);
  const ms = Date.now() - t0;
  assert(!!mv, '开局 AI 有着法');
  assert(ms < 8000, `深 3 开局搜索 < 8s (限时迭代加深 6s 预算, 实际 ${ms}ms)`);
  console.log(`    (深 3 开局: ${ms}ms, 节点 ${ai._nodeCount()})`);
}

// ---------- 中局走法合法性 ----------
console.log('== AI: 中局走法合法性 ==');
{
  // 随机走 20 手后 AI 的着法必须全合法
  const map = rules.initMap();
  let turn = 1;
  for (let i = 0; i < 20; i++) {
    const mv = ai.getBestMove(map, turn, 2);
    assert(!!mv, `第 ${i} 手 AI 有着法`);
    const captured = rules.makeMove(map, mv);
    assert(!rules.inCheck(map, turn), `第 ${i} 手走后 ${turn} 方不被将军`);
    turn = -turn;
  }
}

// ---------- soak 对弈: 两 AI 互下 ----------
console.log('== AI: soak 对弈 (深2 vs 深2, 20 局) ==');
{
  let finished = 0, pieceLeak = 0, kingLost = 0, tooLong = 0;

  for (let g = 0; g < 20; g++) {
    const map = rules.initMap();
    let turn = 1;
    let moves = 0;
    let pieces = 32;

    while (moves < 300) {
      const mv = ai.getBestMove(map, turn, 2);
      if (!mv) break;  // 困毙/将死
      // 走子前先记录: 若此着吃子, 则走完后 count = pieces - 1, 否则 = pieces
      let countBefore = 0;
      for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) if (map[r][c]) countBefore++;
      const captured = rules.makeMove(map, mv);
      if (captured && rules.pieceType(captured).toUpperCase() === 'K') break;  // 吃将终局
      let count = 0;
      for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) if (map[r][c]) count++;
      const expected = countBefore - (captured ? 1 : 0);
      if (count !== expected) { pieceLeak++; break; }
      // 双方将都在盘上
      const red = rules.findKing(map, 1), black = rules.findKing(map, -1);
      if (!red || !black) { kingLost++; break; }
      turn = -turn;
      moves++;
    }
    if (moves >= 300) tooLong++;
    finished++;
  }

  eq(pieceLeak, 0, 'soak: 无棋子泄漏');
  eq(kingLost, 0, 'soak: 双方将始终在盘');
  assert(tooLong < 5, `soak: 终局手数 < 300 (过长 ${tooLong} 局)`);
  console.log(`    (20 局完成, 过长 ${tooLong} 局, 泄漏 ${pieceLeak}, 丢将 ${kingLost})`);
}

console.log(`\nAI 测试: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
