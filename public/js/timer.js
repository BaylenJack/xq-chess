/*!
 * xq-chess 倒计时 (简化版)
 * 一个按钮 + 单个倒计时: 点按钮弹出倒计时, 对方走完子自动重置, 轮流使用。
 * ≤10s 红色闪烁; 到 0 上报 /api/timeout。
 */
(function (root) {
  'use strict';

  const DEFAULT_SECONDS = 60;
  const TICK_MS = 100;
  let cur = DEFAULT_SECONDS;
  let iv = null;
  let reported = false;
  let running = false;
  let onExpireCb = null;

  function getEl() { return document.getElementById('clock-main'); }
  function render() {
    const el = getEl();
    if (el) {
      el.textContent = String(Math.ceil(cur));
      el.classList.toggle('danger', running && cur <= 10);
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
    render();
  }

  function start() {
    if (iv) return;
    render();
    iv = setInterval(tick, TICK_MS);
    running = true;
  }
  function stop() {
    if (iv) { clearInterval(iv); iv = null; }
    running = false;
  }
  // 对方走子 → 重置
  function reset() {
    cur = DEFAULT_SECONDS;
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
    start, stop, reset, disable,
    onExpire(fn) { onExpireCb = fn; },
    get cur() { return cur; },
    get running() { return running; },
  };

  root.XQ = root.XQ || {};
  root.XQ.timer = timer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
