/*!
 * xq-chess 测试: 中文棋谱记法 (零框架, node test/notation-test.js)
 */
'use strict';

const { notation } = require('../public/js/notation.js');

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; failures.push(msg); console.error('  ✗ ' + msg); }
}
function eq(a, b, msg) { assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (期望 ${JSON.stringify(b)}, 实际 ${JSON.stringify(a)})`); }

// 构造 history 记录: mv 必须带 piece (与 server tryMove 存的结构一致)
function mv(frR, frC, toR, toC, piece) {
  return { mv: { fr: { r: frR, c: frC }, to: { r: toR, c: toC }, piece }, captured: null };
}
function texts(history) { return notation.toRecord(history).map(r => r.text); }

console.log('== 记法: 基础 ==');
{
  // 炮二平五: 红炮 (2,7)→(2,4)
  eq(texts([mv(2, 7, 2, 4, 'C1')]), ['炮二平五'], '炮二平五');
  // 馬8进7: 黑马 (9,7)→(7,6)
  eq(texts([mv(9, 7, 7, 6, 'h1')]), ['馬8进7'], '馬8进7');
  // 車九进一: 红车 (0,0)→(1,0) 直线进=步数
  eq(texts([mv(0, 0, 1, 0, 'R0')]), ['車九进一'], '車九进一');
  // 兵九进一: 红兵 (3,0)→(4,0)
  eq(texts([mv(3, 0, 4, 0, 'P0')]), ['兵九进一'], '兵九进一');
  // 帥五平六: 红帅 (0,4)→(0,3)
  eq(texts([mv(0, 4, 0, 3, 'K0')]), ['帥五平六'], '帥五平六');
  // 相七进九: 红相 (0,2)→(2,0) 斜线进=目标列
  eq(texts([mv(0, 2, 2, 0, 'E0')]), ['相七进九'], '相七进九');
  // 仕六进五: 红仕 (0,3)→(1,4)
  eq(texts([mv(0, 3, 1, 4, 'A0')]), ['仕六进五'], '仕六进五');
  // 黑车退: 先 (9,0)→(8,0) 进, 再 (8,0)→(9,0) 退回; 黑用阿拉伯数字
  // (注: 单步 (9,0)→(8,0) 对黑方是"进"——黑 forward=row 减小, 同锚点 馬8进7)
  eq(texts([mv(9, 0, 8, 0, 'r0'), mv(8, 0, 9, 0, 'r0')])[1], '車1退1', '車1退1 (黑方数字)');
  // 黑炮平: (7,7)→(7,4) c=7→8路, c=4→5路
  eq(texts([mv(7, 7, 7, 4, 'c1')]), ['炮8平5'], '炮8平5 (黑方)');
}

console.log('== 记法: 消歧 ==');
{
  // 两炮同列 (2,7) 与 (5,7): (5,7) 是前炮 (红 forward=row 增大)
  const map0 = [mv(2, 1, 5, 7, 'C0')];            // 把 C0 挪到 (5,7), 与 C1(2,7) 同列制造双炮
  eq(texts([...map0, mv(2, 7, 2, 4, 'C1')])[1], '後炮平五', '同列双炮: 後炮平五');
  eq(texts([...map0, mv(5, 7, 5, 4, 'C0')])[1], '前炮平五', '同列双炮: 前炮平五');
  // 叠兵: 两红兵同列 c=4, (4,4) 与 (5,4); 前兵 = (5,4)
  // (P1 一步跳到 (5,4) 仅为摆位, 记法重放按 history 逐步行棋不校验合法性)
  const pawns = [mv(3, 4, 4, 4, 'P2'), mv(3, 2, 5, 4, 'P1')];
  eq(texts([...pawns, mv(5, 4, 6, 4, 'P1')])[2], '前兵进一', '叠兵: 前兵进一');
  eq(texts([...pawns, mv(4, 4, 4, 3, 'P2')])[2], '後兵平六', '叠兵: 後兵平六');
}

console.log('== 记法: 序列结构 ==');
{
  const recs = notation.toRecord([mv(2, 7, 2, 4, 'C1'), mv(9, 7, 7, 6, 'h1')]);
  eq(recs.length, 2, '两手两条记录');
  eq(recs[0].seq, 1, 'seq 从 1 开始');
  eq(recs[0].red, true, '红方标记');
  eq(recs[1].red, false, '黑方标记');
  eq(notation.toRecord([]), [], '空 history 空数组');
}

console.log(`\n记法测试: ${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  console.error('\n失败列表:');
  failures.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
