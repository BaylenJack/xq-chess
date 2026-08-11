/*!
 * xq-chess AI 提示引擎 (特权脚本, 三档难度)
 * 仅当服务器验证 ?hint=KEY 通过后才注入本文件; 本文件本身不含任何密钥。
 * 功能: 控制栏「提示」开关 + 三档难度; 开启后轮到你走棋时, 高亮 AI 建议的落子。
 *   菜鸟: 深 2 + 随机化 (娱乐向)
 *   中级: 深 3
 *   高手: 深 4
 * 依赖: XQ.rules, XQ.ai, XQ.game, XQ.ui
 */
(function () {
  'use strict';

  let enabled = false;
  let timer = null;
  let computing = false;

  const slot = document.getElementById('hintSlot');
  if (!slot) return;  // 无插槽则静默退出

  const DEPTHS = { easy: 2, medium: 3, hard: 4 };
  let level = localStorage.getItem('xq-hint-level') || 'medium';
  if (!DEPTHS[level]) level = 'medium';

  // ---- 开关 + 难度 ----
  const btn = document.createElement('div');
  btn.className = 'hint-toggle';
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = '<span>💡 AI 提示</span><span class="switch"></span>';
  btn.addEventListener('click', () => {
    enabled = !enabled;
    btn.classList.toggle('on', enabled);
    btn.setAttribute('aria-pressed', String(enabled));
    XQ.ui._setHint(null);
    if (enabled) refresh();
  });
  slot.appendChild(btn);

  const levelRow = document.createElement('div');
  levelRow.className = 'hint-levels';
  levelRow.innerHTML = '<span class="lbl">提示强度</span>' +
    '<button data-l="easy" class="hl">菜鸟</button>' +
    '<button data-l="medium" class="hl">中级</button>' +
    '<button data-l="hard" class="hl">高手</button>';
  levelRow.querySelectorAll('.hl').forEach(b => {
    b.classList.toggle('on', b.dataset.l === level);
    b.addEventListener('click', () => {
      level = b.dataset.l;
      localStorage.setItem('xq-hint-level', level);
      levelRow.querySelectorAll('.hl').forEach(x => x.classList.toggle('on', x.dataset.l === level));
      if (enabled) refresh();
    });
  });
  slot.appendChild(levelRow);

  // ---- 计算并显示提示 ----
  function refresh() {
    const ui = XQ.ui;
    const st = ui.state;
    if (!enabled || computing) return;
    if (st.status !== XQ.game.STATUS.PLAYING) { ui.showHint(null); return; }
    const side = ui.playerSide;
    if (side == null) return;                    // 未入房
    if (st.turn !== side) { ui.showHint(null); return; }  // 只提示自己的回合
    computing = true;
    const cfg = DEPTHS[level];
    // 同步搜索 (深 2-4 几十到几百毫秒, 主线程可接受)
    setTimeout(() => {
      try {
        const mv = XQ.ai.getBestMove(st.map, side, cfg, level === 'easy');
        ui.showHint(mv);
      } catch (e) {
        ui.showHint(null);
      }
      computing = false;
    }, 0);
  }

  // 盘面变化 → 防抖重算
  XQ.game.on('change', () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 350);
  });

  // 暴露给调试
  window.XQ.hint = {
    setEnabled(b) { enabled = !!b; btn.classList.toggle('on', enabled); if (enabled) refresh(); },
    setLevel(l) { if (DEPTHS[l]) { level = l; localStorage.setItem('xq-hint-level', l); } },
    refresh,
    get enabled() { return enabled; },
    get level() { return level; },
  };
})();
