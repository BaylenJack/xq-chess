/*!
 * xq-chess AI 提示引擎 (特权脚本, 仅授权用户)
 * 由服务器验证 ?hint=KEY 通过后注入本文件, 不含密钥。
 * API: XQ.ai.startHint('medium'|'hard', playerSide) / XQ.ai.stopHint()
 * 中级: 限时迭代加深 6s 预算; 高手: 15s 预算
 * 依赖: XQ.rules, XQ.game, XQ.ui
 */
(function () {
  'use strict';

  const SLOT_ID = 'hintSlot';
  const slot = document.getElementById(SLOT_ID);
  // 无 hintSlot (新版 UI 已移走开关): 不创建开关, 仅提供 API
  let active = null;   // { level, side, intervalId, computing }

  let worker = null;
  let workerSeq = 0;
  function ensureWorker() {
    if (worker) return;
    try {
      worker = new Worker('/js/ai-worker.js?v=21');
      worker.onmessage = (ev) => {
        const { id, mv, err } = ev.data || {};
        if (id !== workerSeq) return;
        if (active) active.computing = false;
        if (err) { XQ.ui.showHint(null); return; }
        XQ.ui.showHint(mv);
      };
      worker.onerror = () => { if (active) active.computing = false; XQ.ui.showHint(null); };
    } catch (e) { worker = null; }
  }

  function tryStart() {
    if (!active) return;
    const ui = XQ.ui, st = ui.state;
    if (st.status !== XQ.game.STATUS.PLAYING) return;
    const side = ui.playerSide;
    if (side == null) return;
    if (st.turn !== side) return;  // 轮到自己才计算
    if (active.computing) return;
    if (!worker) {
      // Worker 不可用: 绝不主线程同步计算 (会冻结 UI 15 秒), 直接放弃
      window.XQ.ai.stopHint();
      XQ.ui.showHint(null);
      return;
    }
    active.computing = true;
    workerSeq++;
    worker.postMessage({
      id: workerSeq,
      map: st.map,
      my: side,
      depth: 10,          // 只保留深度思考
      randomize: false,
    });
  }

  window.XQ.ai = window.XQ.ai || {};
  window.XQ.ai.startHint = function (level, side) {
    if (active) return;  // 已在运行
    active = { level, side, computing: false };
    ensureWorker();
    tryStart();
    // 轮到自己再算: 每 350ms 检查
    active.intervalId = setInterval(tryStart, 350);
  };
  window.XQ.ai.stopHint = function () {
    if (!active) return;
    clearInterval(active.intervalId);
    active = null;
    XQ.ui.showHint(null);
  };
})();