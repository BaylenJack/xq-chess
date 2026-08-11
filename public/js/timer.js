/*!
 * xq-chess 倒计时引擎
 * 每回合 60s 倒数: 当前回合玩家的 clock 递减, 对手 clock 冻结。
 * ≤10s 加 .danger 闪烁; 到 0 上报 /api/timeout。
 * 回合切换 (走子) 时 reset: 双方时间都重置为 60s。
 */
(function (root) {
  'use strict';

  const DEFAULT_SECONDS = 60;
  const TICK_MS = 100;
  let t1 = DEFAULT_SECONDS, t2 = DEFAULT_SECONDS;  // 红/黑剩余时间
  let cur = DEFAULT_SECONDS;                        // 当前回合剩余 (递减中)
  let curSide = 1;                                  // 当前回合方
  let iv = null;
  let reported = false;
  let onExpireCb = null;

  function getEl(side) {
    return document.getElementById(side === 1 ? 'clock-1' : 'clock-2');
  }
  function render() {
    const el1 = getEl(1), el2 = getEl(-1);
    if (el1) {
      // 当前回合方显示递减值, 对手显示冻结值
      const v = curSide === 1 ? cur : t1;
      el1.textContent = String(Math.ceil(v));
      el1.classList.toggle('danger', curSide === 1 && cur <= 10);
    }
    if (el2) {
      const v = curSide === -1 ? cur : t2;
      el2.textContent = String(Math.ceil(v));
      el2.classList.toggle('danger', curSide === -1 && cur <= 10);
    }
  }

  function tick() {
    if (cur <= 0) {
      if (!reported) {
        reported = true;
        if (onExpireCb) onExpireCb();
      }
      stop();
      return;
    }
    cur = Math.max(0, +(cur - TICK_MS / 1000).toFixed(2));
    // 同步到对应方的时间槽
    if (curSide === 1) t1 = cur; else t2 = cur;
    render();
  }

  function start() {
    if (iv) return;
    render();
    iv = setInterval(tick, TICK_MS);
  }
  function stop() {
    if (iv) { clearInterval(iv); iv = null; }
  }
  // 切换回合: 冻结当前方时间, 开始另一方
  function switchSide(side) {
    if (curSide === 1) t1 = cur; else t2 = cur;
    curSide = side;
    cur = side === 1 ? t1 : t2;
    reported = false;
    render();
    start();
  }
  function reset() {
    t1 = DEFAULT_SECONDS; t2 = DEFAULT_SECONDS;
    cur = DEFAULT_SECONDS;
    curSide = 1;
    reported = false;
    render();
    start();
  }
  function disable() {
    stop();
    reported = true;
    render();
  }

  const timer = {
    DEFAULT_SECONDS,
    start, stop, reset, disable, switchSide,
    onExpire(fn) { onExpireCb = fn; },
    get cur() { return cur; },
    get side() { return curSide; },
  };

  root.XQ = root.XQ || {};
  root.XQ.timer = timer;
})(typeof globalThis !== 'undefined' ? globalThis : this);