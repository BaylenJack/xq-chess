/*!
 * xq-chess 倒计时 (服务端权威版)
 * 不再本地计时: 只渲染 server 广播的 clock.deadline (毫秒时间戳)。
 * 两方收到同一 deadline → 显示完全同步; 超时上报 /api/timeout (server 也自判)。
 */
(function (root) {
  'use strict';

  const DEFAULT_SECONDS = 60;
  let deadline = 0;        // 服务端权威 deadline (ms 时间戳)
  let on = false;
  let reported = false;
  let rafId = null;
  let onExpireCb = null;

  function getEl() { return document.getElementById('clock-main'); }

  // 渲染剩余秒数 (ceil, 与旧版一致)
  function render() {
    const el = getEl();
    if (!el) return;
    const remain = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    el.textContent = String(remain);
    el.classList.toggle('danger', on && remain <= 10);
  }

  // 动画帧循环: 只渲染, 不做逻辑 (权威在 server)
  function frame() {
    const remain = deadline - Date.now();
    if (on) {
      if (remain <= 0) {
        render();
        if (!reported) {
          reported = true;
          if (onExpireCb) onExpireCb();
        }
        stop();
        return;
      }
      render();
      rafId = requestAnimationFrame(frame);
    }
  }

  // 从 server 广播同步 deadline
  function sync(deadlineMs, isOn) {
    deadline = deadlineMs || 0;
    on = !!isOn;
    reported = false;
    render();
    if (on && !rafId) rafId = requestAnimationFrame(frame);
  }
  // 重置 (server 已重置, 客户端只显示新 deadline)
  function reset() { sync(deadline, on); }
  function stop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    on = false;
  }
  function disable() {
    stop();
    reported = true;
    render();
  }

  const timer = {
    DEFAULT_SECONDS,
    sync, reset, stop, disable,
    onExpire(fn) { onExpireCb = fn; },
    get deadline() { return deadline; },
    get running() { return on; },
  };

  root.XQ = root.XQ || {};
  root.XQ.timer = timer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
