/*!
 * xq-chess AI 计算 Worker
 * 把 negamax 搜索从主线程移到 Worker, 避免深 3-4 时冻结 UI (810ms+)
 * 通过 importScripts 加载 rules.js + ai.js, 消息协议:
 *   in:  { id, map, my, depth, randomize }
 *   out: { id, mv } | { id, err }
 */
'use strict';

importScripts('/js/rules.js', '/js/ai.js');

self.onmessage = (ev) => {
  const { id, map, my, depth, randomize } = ev.data || {};
  try {
    const mv = self.XQ.ai.getBestMove(map, my, depth, !!randomize);
    self.postMessage({ id, mv });
  } catch (e) {
    self.postMessage({ id, err: String(e && e.message || e) });
  }
};
