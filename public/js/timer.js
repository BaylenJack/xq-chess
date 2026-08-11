/*!
 * xq-chess 倒计时引擎
 * 每回合 60s 倒数: 当前回合玩家的时间递减, 对手冻结。
 * ≤10s 加 .danger 闪烁; 到 0 上报 /api/timeout。
 * 显示在棋盘下方 (红 Xs | ⏸按钮 | Xs 黑), 按钮可暂停/恢复。
 */
(function (root) {
  'use strict';

  const DEFAULT_SECONDS = 60;
  const TICK_MS = 100;
  let t1 = DEFAULT_SECONDS, t2 = DEFAULT_SECONDS;
  let cur = DEFAULT_SECONDS;
  let curSide = 1;
  let iv = null;
  let reported = false;
  let paused = false;
  let onExpireCb = null;

  function getEl(side) {
    return document.getElementById(side === 1 ? 'clock-1' : 'clock-2');
  }
  function getSideEl(side) {
    return document.querySelector('.timer-side[data-side="' + side + '"]');
  }
  function render() {
    const el1 = getEl(1), el2 = getEl(-1);
    if (el1) {
      const v = curSide === 1 ? cur : t1;
      el1.textContent = String(Math.ceil(v));
      el1.classList.toggle('danger', curSide === 1 && cur <= 10 && !paused);
    }
    if (el2) {
      const v = curSide === -1 ? cur : t2;
      el2.textContent = String(Math.ceil(v));
      el2.classList.toggle('danger', curSide === -1 && cur <= 10 && !paused);
    }
    // 高亮当前回合方
    const s1 = getSideEl(1), s2 = getSideEl(-1);
    if (s1) s1.classList.toggle('active', curSide === 1 && !paused);
    if (s2) s2.classList.toggle('active', curSide === -1 && !paused);
    // 暂停按钮状态
    const btn = document.getElementById('timerToggleBtn');
    if (btn) {
      btn.textContent = paused ? '▶' : '⏸';
      btn.classList.toggle('paused', paused);
    }
  }

  function tick() {
    if (paused) return;
    if (cur <= 0) {
      if (!reported) {
        reported = true;
        if (onExpireCb) onExpireCb();
      }
      stop();
      return;
    }
    cur = Math.max(0, +(cur - TICK_MS / 1000).toFixed(2));
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
    paused = false;
    render();
    start();
  }
  function disable() {
    stop();
    reported = true;
    render();
  }
  // 暂停/恢复切换
  function togglePause() {
    paused = !paused;
    render();
    if (!paused) start();
    return paused;
  }
  function setPaused(v) {
    paused = !!v;
    render();
    if (!paused) start();
  }

  const timer = {
    DEFAULT_SECONDS,
    start, stop, reset, disable, switchSide,
    togglePause, setPaused,
    onExpire(fn) { onExpireCb = fn; },
    get cur() { return cur; },
    get side() { return curSide; },
    get paused() { return paused; },
  };

  root.XQ = root.XQ || {};
  root.XQ.timer = timer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
