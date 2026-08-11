/*!
 * xq-chess 测试: 规则 + AI (零框架, node test/test.js)
 */
'use strict';

const { rules } = require('../public/js/rules.js');

let passed = 0, failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; failures.push(msg); console.error('  ✗ ' + msg); }
}
function eq(a, b, msg) { assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (期望 ${JSON.stringify(b)}, 实际 ${JSON.stringify(a)})`); }
function count(moves) { return moves.length; }

function mapFrom(rows) {  // 接受 10 行字符串数组, 空格=空, 否则棋子编码
  return rows.map(row => row.trim().split(/\s+/).map(s => (s === '.' || s === '') ? null : s));
}

// 全空棋盘构造器
const EMPTY = () => mapFrom([
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
]);

// ---------- 基础 ----------
console.log('== 规则: 基础 ==');
{
  const map = rules.initMap();
  eq(map.length, 10, '棋盘 10 行');
  eq(map[0].length, 9, '棋盘 9 列');
  eq(map[0][0], 'R0', '红车位置');
  eq(map[9][4], 'k0', '黑将位置');
  const redMoves = rules.legalMoves(map, 1);
  const blackMoves = rules.legalMoves(map, -1);
  // 标准开局合法着法数 (公认数值: 红黑各 44)
  eq(count(redMoves), 44, '红方开局 44 种合法走法');
  eq(count(blackMoves), 44, '黑方开局 44 种合法走法');
}

// ---------- 每兵种走法 ----------
console.log('== 规则: 兵种走法 ==');
{
  // 车: 开局 4 个落点 (从第 0 行: 左右各 1 格挡 + 中间空路)
  {
    const map = rules.initMap();
    const mvs = rules.legalMovesFrom(map, { r: 0, c: 0 });
    eq(count(mvs), 2, '开局红车 (0,0) 2 种走法');
  }
  // 马: 开局 2 种 (蹩腿检查)
  {
    const map = rules.initMap();
    const mvs = rules.legalMovesFrom(map, { r: 0, c: 1 });
    eq(count(mvs), 2, '开局红马 (0,1) 2 种走法');
  }
  // 炮: 开局 12 种 (隔子不能吃但有跳吃可能? 开局无目标)
  {
    const map = rules.initMap();
    const mvs = rules.legalMovesFrom(map, { r: 2, c: 1 });
    // 炮在 (2,1): 上 2 (被兵挡), 左 1, 下 2 (被兵挡在 3,1), 右 6
    eq(count(mvs), 12, '开局红炮 (2,1) 12 种走法');
  }
  // 炮隔一子吃
  {
    const map = EMPTY();
    map[8][4] = 'C0';  // 红炮
    map[8][1] = 'p0';  // 黑卒当炮架 (隔 2 个空格)
    map[8][0] = 'r0';  // 黑车: 隔 (8,1) 黑卒被吃
    const mvs = rules.legalMovesFrom(map, { r: 8, c: 4 });
    const targets = mvs.map(m => `${m.to.r},${m.to.c}`);
    assert(targets.includes('8,0'), '炮隔一子可吃 (8,0) 黑车');
    assert(!targets.includes('8,1'), '炮不能吃炮架 (黑卒自己人)');
    assert(targets.includes('8,2'), '炮架前空格可走 (8,2)');
    assert(targets.includes('8,3'), '炮架前空格可走 (8,3)');
    assert(targets.includes('8,5'), '炮空线可走 (8,5)');
  }
  // 马蹩腿: 红马 (0,1), 跳点 (2,0)/(2,2) 的腿都在 (1,1)
  {
    const map = rules.initMap();
    let mvs = rules.legalMovesFrom(map, { r: 0, c: 1 });
    eq(count(mvs), 2, '开局红马 (0,1) 2 种走法');
    map[1][1] = 'P9';  // 蹩住两个跳点的腿
    mvs = rules.legalMovesFrom(map, { r: 0, c: 1 });
    eq(count(mvs), 0, '马腿被 (1,1) 蹩住后无跳点');
  }
  // 象不过河 + 塞象眼
  {
    const map = rules.initMap();
    // 红相在 (0,2): 可跳 (2,0) 和 (2,4)
    let mvs = rules.legalMovesFrom(map, { r: 0, c: 2 });
    eq(count(mvs), 2, '红相开局 2 种走法');
    map[1][3] = 'P9';  // 塞 (2,4) 的象眼
    mvs = rules.legalMovesFrom(map, { r: 0, c: 2 });
    const targets = mvs.map(m => `${m.to.r},${m.to.c}`);
    assert(!targets.includes('2,4'), '塞象眼后相不能走 (2,4)');
    assert(targets.includes('2,0'), '未塞眼方向 (2,0) 可走');
  }
  // 士九宫限制
  {
    const map = rules.initMap();
    const mvs = rules.legalMovesFrom(map, { r: 0, c: 3 });
    const targets = mvs.map(m => `${m.to.r},${m.to.c}`);
    assert(targets.includes('1,4'), '士可走 (1,4)');
    eq(count(mvs), 1, '士开局只有 1 种走法');
  }
  // 将九宫限制
  {
    const map = rules.initMap();
    const mvs = rules.legalMovesFrom(map, { r: 0, c: 4 });
    eq(count(mvs), 1, '帅开局只有 1 种走法 (0,4)→(1,4)');
  }
  // 兵: 未过河只能前进
  {
    const map = rules.initMap();
    const mvs = rules.legalMovesFrom(map, { r: 3, c: 0 });
    eq(count(mvs), 1, '红兵 (3,0) 未过河只能前进 1 步');
    const targets = mvs.map(m => `${m.to.r},${m.to.c}`);
    assert(targets.includes('4,0'), '红兵前进到 (4,0)');
  }
  // 兵: 过河后可横移
  {
    const map = rules.initMap();
    map[5][4] = 'P9';  // 放一个已过河的兵
    map[4][4] = null;
    const mvs = rules.legalMovesFrom(map, { r: 5, c: 4 });
    const targets = mvs.map(m => `${m.to.r},${m.to.c}`);
    assert(targets.includes('6,4'), '过河兵前进 (6,4)');
    assert(targets.includes('5,3'), '过河兵左移 (5,3)');
    assert(targets.includes('5,5'), '过河兵右移 (5,5)');
  }
}

// ---------- 将军/对脸/困毙 ----------
console.log('== 规则: 将军/对脸/困毙 ==');
{
  // 将帅对脸检测
  {
    const map = EMPTY();
    map[0][4] = 'k0'; map[9][4] = 'K0';
    assert(rules.kingsFacing(map), '将帅对脸检测 (同列无遮挡)');
    map[5][4] = 'P9';
    assert(!rules.kingsFacing(map), '中间有子则不对脸');
  }
  // 对脸禁着: 帅不能走到 (7,4) 造成对脸 (黑将 (0,4) 同列)
  {
    const map = EMPTY();
    map[0][4] = 'k0'; map[8][4] = 'K0';
    const mvs = rules.legalMovesFrom(map, { r: 8, c: 4 });
    const targets = mvs.map(m => `${m.to.r},${m.to.c}`);
    assert(!targets.includes('7,4'), '帅不能走到 (7,4) 造成对脸');
    assert(targets.includes('8,3'), '帅可横向走 (8,3)');
  }
  // inCheck: 车将军
  {
    const map = EMPTY();
    map[0][4] = 'K0'; map[3][4] = 'r0';  // 黑车直线瞄红帅
    assert(rules.inCheck(map, 1), '黑车直线将军红方');
    map[2][4] = 'P9';  // 挡路
    assert(!rules.inCheck(map, 1), '挡路后不再将军');
  }
  // inCheck: 炮隔一子将军
  {
    const map = EMPTY();
    map[0][4] = 'K0'; map[1][4] = 'P9'; map[3][4] = 'c0';  // 炮隔 (1,4) 打 (0,4)
    assert(rules.inCheck(map, 1), '黑炮隔子将军红方');
    map[2][4] = 'P8';  // 多一个子破坏炮架
    assert(!rules.inCheck(map, 1), '炮架被破坏后不再将军');
  }
  // inCheck: 马将军 + 蹩腿豁免
  {
    const map = EMPTY();
    map[0][4] = 'K0'; map[2][3] = 'h0';  // 黑马 (2,3) 跳 (0,4)? 腿 (1,3) 空 → 将军
    assert(rules.inCheck(map, 1), '黑马将军红方');
    map[1][3] = 'P9';  // 蹩腿
    assert(!rules.inCheck(map, 1), '马腿被蹩后不将军');
  }
  // inCheck: 兵将军
  {
    // 红兵正面将军: 红兵在 (8,4), 黑将 (9,4)
    const map = EMPTY();
    map[9][4] = 'k0'; map[8][4] = 'P9';
    assert(rules.inCheck(map, -1), '红兵正面将军黑方');
    map[8][4] = null; map[8][3] = 'P9';  // 未过河红兵横邻 (8,3) 不能吃将
    assert(!rules.inCheck(map, -1), '未过河红兵横邻不将军');
    map[8][3] = null; map[5][4] = 'P9';  // 已过河红兵横邻 (5,4)... 黑将 (9,4) 不邻
    assert(!rules.inCheck(map, -1), '远兵不将军');
  }
  // 困毙/将死: 黑将四面受制无合法着法 (吃任何封路车后仍被保护车将军)
  {
    const map = EMPTY();
    map[0][4] = 'k0';
    map[1][4] = 'R0';  // 封正下 + 直线将军
    map[0][3] = 'R1';  // 封左, 由 (1,3) 车保护
    map[1][3] = 'R3';
    map[0][5] = 'R2';  // 封右, 由 (1,5) 车保护
    map[1][5] = 'R4';
    map[2][4] = 'R5';  // 保护 (1,4): 黑将吃后仍被将军
    const st = rules.statusAfter(map, -1);
    eq(st, 'checkmated', '黑将被将死');
  }
}

// ---------- 合法性细节 ----------
console.log('== 规则: 合法性 ==');
{
  // 被将军时必须应将 (挡/躲/吃)
  {
    const map = rules.initMap();
    // 黑车将军红帅: 红方唯一合法着法之一必须是挡
    map[9][0] = null;
    map[4][4] = 'r0';  // 黑车 (4,4) 直瞄 (0,4) 红帅
    const redMoves = rules.legalMoves(map, 1);
    const targets = redMoves.map(m => `${m.fr.r},${m.fr.c}->${m.to.r},${m.to.c}`);
    assert(count(redMoves) > 0, '被将军时红方仍有合法着法');
    // 能挡 (1,4) 的子: 兵? (3,4) 的兵前进到 (4,4) 吃车 / (1,4) 放子
    const canBlock = redMoves.filter(m => m.to.r === 4 && m.to.c === 4);
    assert(canBlock.length > 0, '红方可以吃车应将');
    // 所有合法着法都不应送将
    for (const mv of redMoves) {
      const captured = rules.makeMove(map, mv);
      assert(!rules.inCheck(map, 1), `走 ${mv.fr.r},${mv.fr.c}->${mv.to.r},${mv.to.c} 后红方不应被将军`);
      rules.undoMove(map, mv, captured);
    }
  }
  // 吃将即胜: 合法走法里允许吃将 (一旦吃将, 游戏结束)
  {
    const map = mapFrom([
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      'R........',
      'k........',
    ]);
    map[0][4] = null; map[9][4] = null;
    map[9][0] = 'k0';
    map[8][0] = 'R0';  // 红车在 (8,0), 黑将在 (9,0)
    const mvs = rules.legalMovesFrom(map, { r: 8, c: 0 });
    const targets = mvs.map(m => `${m.to.r},${m.to.c}`);
    assert(targets.includes('9,0'), '红车可以吃黑将 (吃将即胜)');
  }
}

// ---------- 汇总 ----------
console.log(`\n规则测试: ${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  console.error('\n失败列表:');
  failures.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
