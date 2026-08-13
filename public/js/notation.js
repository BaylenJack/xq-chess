/*!
 * xq-chess 中文棋谱记法 (纯函数, 零 DOM 依赖)
 * 坐标: map[r][c], row 0=红底线 row 9=黑底线; 红 forward=row 增大, 黑 forward=row 减小
 * 列号: 红 = 9-c (汉字一至九); 黑 = c+1 (阿拉伯数字)
 * API: toRecord(history) — 从 initMap 重放, 每步在走子前局面算记法
 *      返回 [{seq, text, red}], history 项 = {mv:{fr,to,piece}, captured}
 */
(function (root) {
  'use strict';

  root.XQ = root.XQ || {};
  // node 测试环境: 无 <script> 预加载 rules.js, 主动引入 (浏览器由加载顺序保证 XQ.rules 已就绪)
  if (!root.XQ.rules && typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    root.XQ.rules = require('./rules.js').rules;
  }
  const R = root.XQ.rules;
  const HAN = '一二三四五六七八九';
  const STRAIGHT = { R: 1, C: 1, P: 1, K: 1 };   // 直线子: 进退=步数; 其余斜线子: 进退=目标列

  function colNum(my, c) {
    const n = my === 1 ? 9 - c : c + 1;
    return my === 1 ? HAN[n - 1] : String(n);
  }

  // 走子前局面 map 上, 生成 mv 的中文记法
  function describe(map, mv) {
    const { fr, to, piece } = mv;
    const my = R.isRed(piece) ? 1 : -1;
    const name = R.charOf(piece);
    const type = R.pieceType(piece).toUpperCase();

    // 同列同类己方子 (含自己), 按"前敌方向"排序 (红: row 大在前; 黑: row 小在前)
    const mates = [];
    for (let r = 0; r < R.ROWS; r++) {
      const p = map[r][fr.c];
      if (p && p[0] === piece[0]) mates.push(r);
    }
    mates.sort((a, b) => (my === 1 ? b - a : a - b));

    let prefix;
    if (mates.length >= 2) {
      // 同列多个: 前/中/後 (3 个以上极罕见, 用 一二三四五)
      const labels = mates.length === 2 ? ['前', '後']
        : mates.length === 3 ? ['前', '中', '後']
        : mates.map((_, i) => HAN[i]);
      prefix = labels[mates.indexOf(fr.r)];
    } else {
      prefix = colNum(my, fr.c);
    }
    // 前/中/後 在子名前 (前炮平五); 列号在子名后 (炮二平五)
    const head = mates.length >= 2 ? prefix + name : name + prefix;

    let action, target;
    if (to.r === fr.r) {
      action = '平';
      target = colNum(my, to.c);
    } else {
      const forward = my === 1 ? to.r > fr.r : to.r < fr.r;
      action = forward ? '进' : '退';
      if (STRAIGHT[type]) {
        const steps = Math.abs(to.r - fr.r);
        target = my === 1 ? HAN[steps - 1] : String(steps);
      } else {
        target = colNum(my, to.c);
      }
    }
    return head + action + target;
  }

  function toRecord(history) {
    const map = R.initMap();
    const out = [];
    for (let i = 0; i < (history || []).length; i++) {
      const rec = history[i];
      out.push({ seq: i + 1, red: R.isRed(rec.mv.piece), text: describe(map, rec.mv) });
      R.makeMove(map, rec.mv);   // 记法不需要 captured
    }
    return out;
  }

  const notation = { toRecord, _describe: describe };
  root.XQ.notation = notation;
  if (typeof module !== 'undefined' && module.exports) module.exports = { notation };
})(typeof globalThis !== 'undefined' ? globalThis : this);
