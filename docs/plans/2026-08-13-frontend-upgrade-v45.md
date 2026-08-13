# 前端升级 v45 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 按已确认设计（`docs/plans/2026-08-12-frontend-upgrade-design.md`）为 xq-chess 增加棋谱面板、模态系统、邀请/等待体验并精修控制区。

**Architecture:** 纯前端改动。新增 `notation.js` 纯函数层（中文记法），`ui.js` 增加面板/模态/复制逻辑，`game.html`/`index.html` 加骨架，`style.css` 加新组件样式。`server.js` 与后端协议零改动（棋谱复用 SSE state 全量 history）。

**Tech Stack:** 零依赖 vanilla JS + CSS，node 零框架测试（对齐 test/test.js 风格）。

**坐标备忘（写棋谱代码前必读）:**
- `map[r][c]`：10 行 9 列；row 0 = 红底线，row 9 = 黑底线；红 forward = row 增大，黑 forward = row 减小
- 列号：红 = `9 - c`（汉字一至九，c=7 是二路），黑 = `c + 1`（阿拉伯数字，c=7 是 8 路）
- 经典验证：炮二平五 = 红炮 (2,7)→(2,4)；馬8进7 = 黑马 (9,7)→(7,6)
- 直线子：車(R)炮(C)兵卒(P)将帅(K)；斜线子：馬(H)相象(E)仕士(A)
- 棋子显示名用 `rules.charOf(piece)`（帥仕相馬車炮兵 / 將士象馬車炮卒）

---

### Task 1: notation.js（中文记法纯函数，TDD）

**Files:**
- Create: `public/js/notation.js`
- Test: `test/notation-test.js`

**Step 1: 写失败测试 `test/notation-test.js`**

```js
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
  // 黑车退: (9,0)→(8,0) 黑用阿拉伯数字
  eq(texts([mv(9, 0, 8, 0, 'r0')]), ['車1退1'], '車1退1 (黑方数字)');
  // 黑炮平: (7,7)→(7,4) c=7→8路, c=4→5路
  eq(texts([mv(7, 7, 7, 4, 'c1')]), ['炮8平5'], '炮8平5 (黑方)');
}

console.log('== 记法: 消歧 ==');
{
  // 两炮同列 (2,7) 与 (5,7): (5,7) 是前炮 (红 forward=row 增大)
  // 后炮 (2,7)→(2,4): 後炮平五
  const map0 = [mv(2, 7, 5, 7, 'C1')];            // 先把炮挪到 (5,7) 制造同列
  eq(texts([...map0, mv(2, 7, 2, 4, 'C1')])[1], '後炮平五', '同列双炮: 後炮平五');
  eq(texts([...map0, mv(5, 7, 5, 4, 'C1')])[1], '前炮平五', '同列双炮: 前炮平五');
  // 叠兵: 两红兵同列 c=4, (4,4) 与 (5,4); 前兵 = (5,4)
  const pawns = [mv(3, 4, 4, 4, 'P2'), mv(4, 4, 5, 4, 'P2')];   // 兵到 (5,4)…注意重放合法性不校验, 直接摆
  eq(texts([...pawns, mv(5, 4, 6, 4, 'P2')])[2], '前兵进一', '叠兵: 前兵进一');
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
```

**Step 2: 运行确认失败**

Run: `node test/notation-test.js`
Expected: 报错 `Cannot find module '../public/js/notation.js'`

**Step 3: 实现 `public/js/notation.js`**

```js
/*!
 * xq-chess 中文棋谱记法 (纯函数, 零 DOM 依赖)
 * 坐标: map[r][c], row 0=红底线 row 9=黑底线; 红 forward=row 增大, 黑 forward=row 减小
 * 列号: 红 = 9-c (汉字一至九); 黑 = c+1 (阿拉伯数字)
 * API: toRecord(history) — 从 initMap 重放, 每步在走子前局面算记法
 *      返回 [{seq, text, red}], history 项 = {mv:{fr,to,piece}, captured}
 */
(function (root) {
  'use strict';

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
    return prefix + name + action + target;
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
  root.XQ = root.XQ || {};
  root.XQ.notation = notation;
  if (typeof module !== 'undefined' && module.exports) module.exports = { notation };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

**Step 4: 运行确认通过**

Run: `node test/notation-test.js`
Expected: `记法测试: N 通过, 0 失败`（全部绿）

**Step 5: 回归**

Run: `node test/test.js && node test/ai-test.js`
Expected: 全绿（不应受影响）

**Step 6: Commit**

```bash
git add public/js/notation.js test/notation-test.js
git commit -m "v45: 中文棋谱记法引擎 notation.js + 测试"
```

---

### Task 2: 棋谱面板 UI

**Files:**
- Modify: `public/game.html`（骨架 + script 引入）
- Modify: `public/js/ui.js`（渲染/折叠/更新）
- Modify: `public/css/style.css`（面板样式）

**Step 1: game.html 加骨架**

在 `</section>`（board-stage 结束）与 `<footer class="game-controls">` 之间插入：

```html
  <section id="recordPanel" class="record-panel">
    <button id="recordHead" class="record-head" aria-expanded="false" aria-label="展开/收起棋谱">
      <span class="record-title">棋谱</span>
      <span id="recordLast" class="record-last">暂无着法</span>
      <span class="record-arrow" aria-hidden="true">▾</span>
    </button>
    <div id="recordBody" class="record-body"></div>
  </section>
```

在 `<script src="/js/ai.js?v=37"></script>` 后加一行：
```html
  <script src="/js/notation.js?v=45"></script>
```

**Step 2: ui.js 加棋谱逻辑**

在 ui.js 的 `updateStatus()` 函数之后加：

```js
  // ---- 棋谱面板 ----
  function updateRecord() {
    const recs = (root.XQ.notation && st.history) ? root.XQ.notation.toRecord(st.history) : [];
    const lastEl = $('recordLast');
    if (lastEl) {
      const last = recs[recs.length - 1];
      lastEl.textContent = last ? `${last.seq}. ${last.text}` : '暂无着法';
    }
    const body = $('recordBody');
    if (!body) return;
    body.innerHTML = '';
    for (let i = 0; i < recs.length; i += 2) {
      const a = recs[i], b = recs[i + 1];
      const row = el('div', 'record-row');
      row.appendChild(el('span', 'rec-seq', String(i / 2 + 1)));
      row.appendChild(el('span', 'rec rec-red', a.text));
      row.appendChild(el('span', 'rec rec-black', b ? b.text : ''));
      body.appendChild(row);
    }
    body.scrollTop = body.scrollHeight;   // 新着自动滚到底 (收起时 scrollTop 无效, 无副作用)
  }
```

`connectStream()` 的 state 事件处理器里，`render();` 之前（即 `selected = null; legalNow = []; illegalNow = []; clearHint();` 之后）加一行：

```js
      updateRecord();
```

`joinRoom()` 里 `st.players = data.players;` 之后加：

```js
      updateRecord();
```

`bindControls()` 开头加折叠绑定：

```js
    // 棋谱面板折叠
    const recordHead = document.getElementById('recordHead');
    if (recordHead) {
      recordHead.addEventListener('click', () => {
        const panel = document.getElementById('recordPanel');
        const open = panel.classList.toggle('open');
        recordHead.setAttribute('aria-expanded', String(open));
        if (open) {
          const body = document.getElementById('recordBody');
          if (body) body.scrollTop = body.scrollHeight;
        }
        playSound('select');
      });
    }
```

**Step 3: style.css 加样式**

在 `/* ---------- 控制栏 ---------- */` 区块之前插入：

```css
/* ---------- 棋谱面板 ---------- */
.record-panel {
  position: relative;
  z-index: 1;
  width: min(94vw, 480px);
  margin-top: 20px;   /* 让出 status-pill 的溢出空间 */
  border: 1px solid var(--line-strong);
  border-radius: var(--r-md);
  background: linear-gradient(180deg, rgba(46, 36, 24, .75), rgba(28, 18, 10, .75));
  box-shadow: var(--shadow-1), inset 0 1px 0 rgba(255, 220, 160, .06);
  overflow: hidden;
}
.record-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-serif);
  min-height: 44px;
}
.record-title {
  font-size: var(--fs-xs);
  letter-spacing: 3px;
  color: var(--gold-3);
  border: 1px solid var(--gold-2);
  border-radius: var(--r-pill);
  padding: 2px 10px;
  background: rgba(184, 137, 67, .08);
  flex-shrink: 0;
}
.record-last {
  flex: 1;
  text-align: right;
  font-size: var(--fs-sm);
  letter-spacing: 1px;
  color: var(--ink-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.record-arrow {
  font-size: var(--fs-xs);
  color: var(--ink-3);
  transition: transform var(--dur-base) var(--ease-out);
  flex-shrink: 0;
}
.record-panel.open .record-arrow { transform: rotate(180deg); }
.record-body {
  max-height: 0;
  overflow: hidden;
  transition: max-height var(--dur-slow) var(--ease-out);
}
.record-panel.open .record-body {
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid var(--line);
}
.record-row {
  display: grid;
  grid-template-columns: 36px 1fr 1fr;
  gap: 8px;
  padding: 6px 14px;
  font-size: var(--fs-sm);
  font-family: var(--font-serif);
}
.record-row:nth-child(odd) { background: rgba(232, 182, 76, .05); }
.rec-seq {
  font-family: var(--font-mono);
  color: var(--ink-3);
  text-align: right;
  font-size: var(--fs-xs);
  align-self: center;
}
.rec-red { color: #e0836f; letter-spacing: 1px; }
.rec-black { color: var(--ink-1); letter-spacing: 1px; }
```

**Step 4: 本地验证**

Run: `node server.js`（后台），浏览器开两个窗口进同一房间走两步，确认面板折叠/展开/实时更新/双方同步。

**Step 5: Commit**

```bash
git add public/game.html public/js/ui.js public/css/style.css
git commit -m "v45: 棋谱面板 (折叠式, 中文记法实时同步)"
```

---

### Task 3: 模态系统（确认模态 + 胜负结算，移除原生 confirm）

**Files:**
- Modify: `public/game.html`（confirm/result 模态骨架，移除旧 undoRequestModal）
- Modify: `public/js/ui.js`（模态帮助函数 + 替换三处 confirm + 结算逻辑）
- Modify: `public/css/style.css`（模态样式）

**Step 1: game.html 骨架改动**

删除 footer 内旧元素：
```html
    <div id="undoRequestModal" class="modal hidden"><div class="modal-card">等待对方确认悔棋…</div></div>
```

在 `<div id="modal" class="modal">…</div>`（toast 模态）之后追加：

```html
  <!-- 通用确认模态 (替代原生 confirm) -->
  <div id="confirmModal" class="modal">
    <div class="modal-card confirm-card">
      <div class="confirm-title" id="confirmTitle"></div>
      <div class="confirm-sub hidden" id="confirmSub"></div>
      <div class="confirm-ring hidden" id="confirmRing">
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <circle class="ring-bg" cx="20" cy="20" r="17"/>
          <circle class="ring-fg" id="ringFg" cx="20" cy="20" r="17"/>
        </svg>
        <span class="ring-num" id="ringNum">30</span>
      </div>
      <div class="confirm-actions" id="confirmActions">
        <button id="confirmCancel" class="ctrl-btn">取消</button>
        <button id="confirmOk" class="ctrl-btn primary">确定</button>
      </div>
    </div>
  </div>

  <!-- 胜负结算面板 -->
  <div id="resultModal" class="modal">
    <div class="modal-card result-card">
      <div class="result-kicker" id="resultReason"></div>
      <div class="result-title" id="resultTitle"></div>
      <div class="result-sub" id="resultSub"></div>
      <div class="result-actions">
        <button id="resultRestart" class="ctrl-btn primary">再来一局</button>
        <button id="resultHome" class="ctrl-btn">回大厅</button>
      </div>
    </div>
  </div>
```

**Step 2: ui.js 模态帮助函数**

在 `showModal()` 函数之后追加：

```js
  // ---- 确认模态 (替代原生 confirm) ----
  // resolve: true=确定, false=取消, null=超时/被外部静默关闭
  let confirmState = null;   // { resolve, kind, ringTimer }
  const RING_C = 2 * Math.PI * 17;

  function resolveConfirm(v) {
    if (!confirmState) return;
    const { resolve, ringTimer } = confirmState;
    if (ringTimer) clearInterval(ringTimer);
    confirmState = null;
    $('confirmModal').classList.remove('show');
    resolve(v);
  }
  // 按 kind 静默关闭 (state/undo_rejected 到达时)
  function closeConfirmByKind(kind, v) {
    if (confirmState && confirmState.kind === kind) resolveConfirm(v === undefined ? null : v);
  }

  function showConfirm(opts) {
    // 已有一个开着: 直接以 null 结掉 (新的优先)
    if (confirmState) resolveConfirm(null);
    return new Promise(resolve => {
      $('confirmTitle').textContent = opts.title || '';
      const subEl = $('confirmSub');
      if (opts.sub) { subEl.textContent = opts.sub; subEl.classList.remove('hidden'); }
      else subEl.classList.add('hidden');
      $('confirmOk').textContent = opts.okText || '确定';
      $('confirmCancel').textContent = opts.cancelText || '取消';
      const actions = $('confirmActions');
      actions.classList.toggle('hidden', !!opts.hideActions);
      const ringWrap = $('confirmRing');
      const ringFg = $('ringFg');
      ringFg.style.strokeDasharray = String(RING_C);
      let ringTimer = null;
      if (opts.timeoutSec) {
        ringWrap.classList.remove('hidden');
        const end = Date.now() + opts.timeoutSec * 1000;
        const tick = () => {
          const left = end - Date.now();
          if (left <= 0) { resolveConfirm(null); return; }
          $('ringNum').textContent = String(Math.ceil(left / 1000));
          ringFg.style.strokeDashoffset = String(RING_C * (1 - left / (opts.timeoutSec * 1000)));
        };
        tick();
        ringTimer = setInterval(tick, 250);
      } else {
        ringWrap.classList.add('hidden');
      }
      confirmState = { resolve, kind: opts.kind || '', ringTimer };
      $('confirmModal').classList.add('show');
    });
  }

  // ---- 胜负结算面板 ----
  let endedShown = false;
  function showResult(s) {
    const redWin = s.status === 'red_win';
    const iWon = (redWin ? 1 : -1) === playerSide;
    $('resultTitle').textContent = redWin ? '红方胜' : '黑方胜';
    $('resultSub').textContent = iWon ? '恭喜,你赢了这局' : '惜败,再接再厉';
    let reason;
    if (s.reason === 'timeout') reason = iWon ? '对方超时' : '超时判负';
    else if (s.reason === 'peer_left') reason = '对手离开';
    else {
      const loser = redWin ? -1 : 1;
      reason = R.inCheck(s.map, loser) ? '将死制胜' : '困毙制胜';
    }
    $('resultReason').textContent = reason;
    $('resultModal').classList.add('show');
    playSound(iWon ? 'win' : 'lose');
  }
```

**Step 3: ui.js 接线改动（替换现有代码）**

(a) `bindControls()` 里悔棋按钮，原代码：
```js
    // 悔棋: 发起请求 → 等待对方同意/拒绝
    $('undoBtn').addEventListener('click', () => {
      ensureAudio();
      api('undo', { room: myRoom, sid: mySid })
        .then(res => {
          if (res.pending) {
            showUndoPending();   // 显示"等待对方确认"模态
          } else if (res.auto) {
            showModal('已悔棋');
          }
        })
        .catch(e => showModal(e.message));
    });
```
改为：
```js
    // 悔棋: 发起请求 → 等待模态 (30s 倒计时环, 服务端超时自动清理)
    $('undoBtn').addEventListener('click', async () => {
      ensureAudio();
      try {
        const res = await api('undo', { room: myRoom, sid: mySid });
        if (res.pending) {
          showConfirm({ kind: 'undo-wait', title: '已请求悔棋', sub: '等待对方确认…', timeoutSec: 30, hideActions: true });
        } else if (res.auto) {
          showModal('已悔棋');
        }
      } catch (e) { showModal(e.message); }
    });
```

(b) 重开按钮，原代码：
```js
    // 重新开始: 双方互换颜色 + 交换先手 (服务端处理)
    $('restartBtn').addEventListener('click', () => {
      if (!confirm('重新开始?双方将互换棋色和先手')) return;
      api('restart', { room: myRoom, sid: mySid })
        .catch(e => showModal(e.message));
    });
```
改为：
```js
    // 重新开始: 确认模态 → 双方互换颜色 + 交换先手 (服务端处理)
    $('restartBtn').addEventListener('click', async () => {
      ensureAudio();
      const ok = await showConfirm({ kind: 'restart', title: '重新开始', sub: '双方将互换棋色和先手', okText: '确定重开' });
      if (!ok) return;
      api('restart', { room: myRoom, sid: mySid }).catch(e => showModal(e.message));
    });
```

(c) `bindControls()` 末尾追加模态按钮绑定：
```js
    // 确认模态按钮
    $('confirmOk').addEventListener('click', () => resolveConfirm(true));
    $('confirmCancel').addEventListener('click', () => resolveConfirm(false));
    // 结算面板按钮
    $('resultRestart').addEventListener('click', () => {
      $('resultModal').classList.remove('show');
      api('restart', { room: myRoom, sid: mySid }).catch(e => showModal(e.message));
    });
    $('resultHome').addEventListener('click', () => { location.href = '/'; });
```

(d) 删除旧的 `showUndoPending()` / `hideUndoPending()` / `askUndoConfirm()` 三个函数。

(e) `connectStream()` 的 `undo_request` 处理器，原：
```js
    es.addEventListener('undo_request', async ev => {
      const s = JSON.parse(ev.data);
      if (s.requester === mySid) return;   // 自己提的: 已在 showUndoPending
      const ok = await askUndoConfirm();
      api(ok ? 'undo-confirm' : 'undo-reject', { room: myRoom, sid: mySid })
        .catch(e => showModal(e.message));
    });
```
改为：
```js
    es.addEventListener('undo_request', async ev => {
      const s = JSON.parse(ev.data);
      if (s.requester === mySid) return;   // 自己提的: 已在 undo-wait 模态
      const ans = await showConfirm({ kind: 'undo-ask', title: '对方请求悔棋', sub: '是否同意?', okText: '同意', cancelText: '拒绝', timeoutSec: 30 });
      if (ans === null) return;   // 超时/静默关闭: 不回应 (服务端 30s 自动清理)
      api(ans ? 'undo-confirm' : 'undo-reject', { room: myRoom, sid: mySid })
        .catch(e => showModal(e.message));
    });
```

(f) `undo_rejected` 处理器，原：
```js
    es.addEventListener('undo_rejected', () => {
      hideUndoPending();
      showModal('对方拒绝了你的悔棋请求');
    });
```
改为：
```js
    es.addEventListener('undo_rejected', ev => {
      closeConfirmByKind('undo-wait');
      closeConfirmByKind('undo-ask');
      let timeout = false;
      try { timeout = !!(JSON.parse(ev.data) || {}).timeout; } catch (e) {}
      showModal(timeout ? '悔棋请求超时' : '对方拒绝了你的悔棋请求');
    });
```

(g) state 事件处理器里，`render();` 前追加（悔棋成功后关闭等待/应答模态；终局弹结算）：
```js
      closeConfirmByKind('undo-wait');
      closeConfirmByKind('undo-ask');
      updateRecord();
      if (s.status !== 'playing' && !endedShown) {
        endedShown = true;
        XQ.timer.disable();
        showResult(s);
      }
```
同时**删除**原来的终局分支：
```js
      if (s.status !== 'playing') {
        playSound(s.status === 'red_win' ? 'win' : 'lose');
        // 仅在超时/有人离开时弹窗; 普通胜负由状态徽章 + 走子音效提示即可
        if (s.reason === 'timeout') {
          showModal(s.winner === mySid ? '🎉 对方超时 · 你赢了' : '⏰ 超时判负');
        } else if (s.reason === 'peer_left') {
          showModal('🎉 对手离开 · 你赢了');
        }
        XQ.timer.disable();
      } else if (last) {
        // 对方走子 → server 已重置 deadline, 上面的 sync 已同步
      }
```

(h) `start` 事件处理器里 `render();` 前追加：
```js
      endedShown = false;
      $('resultModal').classList.remove('show');
```

(i) `joinRoom()` 成功分支里（`render();` 前）追加：
```js
      endedShown = false;
```

**Step 4: style.css 追加模态样式**

在 `.modal.show .modal-card { … }` 块之后（`/* ============ 移动端 ============ */` 之前）追加：

```css
/* 确认模态 */
.confirm-card {
  min-width: min(80vw, 320px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  letter-spacing: 2px;
}
.confirm-title { font-size: var(--fs-lg); color: var(--gold-4); }
.confirm-sub { font-size: var(--fs-sm); color: var(--ink-2); letter-spacing: 1px; }
.confirm-actions { display: flex; gap: 12px; width: 100%; margin-top: 4px; }
.confirm-actions .ctrl-btn { flex: 1; }
.ctrl-btn.primary {
  color: var(--wood-edge);
  font-weight: 600;
  background: linear-gradient(180deg, var(--gold-4) 0%, var(--gold-3) 50%, var(--gold-2) 100%);
  border-color: var(--gold-2);
}
.ctrl-btn.primary:hover {
  background: linear-gradient(180deg, var(--gold-5) 0%, var(--gold-4) 50%, var(--gold-3) 100%);
  box-shadow: var(--shadow-2), 0 0 14px rgba(232, 182, 76, .4);
}
/* 倒计时环 */
.confirm-ring {
  position: relative;
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
}
.confirm-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
.confirm-ring .ring-bg { fill: none; stroke: rgba(232, 182, 76, .15); stroke-width: 2.5; }
.confirm-ring .ring-fg {
  fill: none; stroke: var(--gold-3); stroke-width: 2.5; stroke-linecap: round;
  transition: stroke-dashoffset .25s linear;
}
.ring-num { font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--gold-3); }

/* 胜负结算面板 */
.result-card {
  min-width: min(84vw, 340px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.result-kicker {
  font-size: var(--fs-xs); letter-spacing: 4px; color: var(--ink-2);
  border: 1px solid var(--line-strong); border-radius: var(--r-pill); padding: 3px 14px;
}
.result-title {
  font-size: var(--fs-xl); letter-spacing: 10px; color: var(--gold-4);
  text-shadow: 0 0 24px rgba(232, 182, 76, .35);
  margin-left: 10px;   /* 补偿 letter-spacing 视觉居中 */
}
.result-sub { font-size: var(--fs-sm); color: var(--ink-1); letter-spacing: 2px; }
.result-actions { display: flex; gap: 12px; width: 100%; margin-top: 6px; }
.result-actions .ctrl-btn { flex: 1; }
```

**Step 5: 本地验证**

`node server.js` 双窗口：走成将死看结算面板；发起悔棋看双方模态与倒计时环；点重开看确认模态。确认代码中无残留 `confirm(` 调用（`grep -n "confirm(" public/js/ui.js` 只剩 undo-confirm 字符串）。

**Step 6: Commit**

```bash
git add public/game.html public/js/ui.js public/css/style.css
git commit -m "v45: 模态系统 (确认模态+倒计时环+胜负结算面板, 移除原生 confirm)"
```

---

### Task 4: 房间徽章 + 邀请链接 + 等待空态 + 大厅预填

**Files:**
- Modify: `public/game.html`（room-bar + wait-overlay 骨架）
- Modify: `public/js/ui.js`（复制帮助函数 + 显隐逻辑）
- Modify: `public/index.html`（`?room=` 预填 + css 版本号）
- Modify: `public/css/style.css`（样式）

**Step 1: game.html 骨架**

(a) `</header>`（game-top 结束）之后插入：
```html
  <div class="room-bar">
    <button id="roomBadge" class="room-badge" title="复制邀请链接" aria-label="复制邀请链接">
      <span class="room-label">房</span>
      <span id="roomName" class="room-name">…</span>
      <svg class="copy-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="2"/>
        <path d="M5 15V5a2 2 0 0 1 2-2h10"/>
      </svg>
    </button>
  </div>
```

(b) board-stage 内、`<div id="status" ...>` 之前插入：
```html
    <div id="waitOverlay" class="wait-overlay hidden">
      <div class="wait-card">
        <div class="wait-title">虚位以待</div>
        <div class="wait-room" id="waitRoom"></div>
        <button id="waitCopyBtn" class="wait-copy">复制邀请链接</button>
        <div class="wait-sub">朋友进入同一房间即可开局</div>
      </div>
    </div>
```

**Step 2: ui.js 逻辑**

(a) 在 `api()` 函数之前加复制帮助函数：
```js
  // ---- 邀请链接 ----
  function inviteUrl() { return `${location.origin}/?room=${encodeURIComponent(myRoom || '')}`; }
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* 降级 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  async function copyInvite() {
    const ok = await copyText(inviteUrl());
    showModal(ok ? '已复制邀请链接' : '复制失败,请手动复制地址');
  }
  function toggleWaitOverlay(show) {
    const ov = $('waitOverlay');
    if (ov) ov.classList.toggle('hidden', !show);
  }
```

(b) `joinRoom()` 成功分支：`myRoom = room;` 之后加：
```js
      $('roomName').textContent = room;
      $('waitRoom').textContent = `房间 · ${room}`;
```
`render();` 前加：
```js
      toggleWaitOverlay(data.players.length < 2);
```

(c) `bindControls()` 追加：
```js
    // 邀请链接复制
    const roomBadge = document.getElementById('roomBadge');
    if (roomBadge) roomBadge.addEventListener('click', () => { ensureAudio(); copyInvite(); playSound('select'); });
    const waitCopy = document.getElementById('waitCopyBtn');
    if (waitCopy) waitCopy.addEventListener('click', () => { ensureAudio(); copyInvite(); playSound('select'); });
```

(d) state 事件处理器 `updateRecord();` 旁加：
```js
      toggleWaitOverlay((s.players || []).length < 2);
```
start 事件处理器 `render();` 前加：
```js
      toggleWaitOverlay((s.players || []).length < 2);
```

**Step 3: index.html 预填 + 版本号**

(a) css 版本号：`/css/style.css?v=11` → `?v=45`

(b) 脚本内 localStorage 恢复块之后追加（URL 参数优先）：
```js
      // 邀请链接带房间名: 优先预填 (?room=)
      try {
        var urlRoom = new URLSearchParams(location.search).get('room');
        if (urlRoom) roomInput.value = urlRoom.slice(0, 20);
      } catch (e) { /* 忽略 */ }
```

**Step 4: style.css 样式**

在 `.vs-block { … }` 块之后（棋盘舞台之前）插入：
```css
/* ---------- 房间徽章 ---------- */
.room-bar {
  position: relative;
  z-index: 1;
  width: min(96vw, 560px);
  display: flex;
  justify-content: center;
  margin-top: -6px;   /* 贴紧玩家条 (game-body gap 14px) */
}
.room-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  border-radius: var(--r-pill);
  background: rgba(0, 0, 0, .35);
  border: 1px solid var(--line);
  color: var(--ink-2);
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
  letter-spacing: 1px;
  cursor: pointer;
  transition: border-color var(--dur-base), color var(--dur-base), box-shadow var(--dur-base);
}
.room-badge:hover {
  border-color: var(--gold-2);
  color: var(--ink-1);
  box-shadow: 0 0 10px rgba(232, 182, 76, .15);
}
.room-badge .room-label { color: var(--gold-3); font-family: var(--font-serif); letter-spacing: 2px; }
.room-badge .room-name { max-width: 40vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.room-badge .copy-ico { width: 12px; height: 12px; opacity: .7; flex-shrink: 0; }
```

在 `.status-pill { … }` 块之后插入：
```css
/* ---------- 等待空态 ---------- */
.wait-overlay {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 5, 3, .78);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: inherit;
}
.wait-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: var(--sp-5);
  text-align: center;
}
.wait-title {
  font-family: var(--font-serif);
  font-size: var(--fs-lg);
  letter-spacing: 8px;
  color: var(--gold-4);
  text-shadow: 0 0 18px rgba(232, 182, 76, .3);
  margin-left: 8px;
}
.wait-room {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  letter-spacing: 2px;
  color: var(--ink-2);
}
.wait-copy {
  padding: 10px 22px;
  border-radius: var(--r-pill);
  font-family: var(--font-serif);
  font-size: var(--fs-sm);
  letter-spacing: 3px;
  color: var(--wood-edge);
  background: linear-gradient(180deg, var(--gold-4), var(--gold-2));
  border: 1px solid var(--gold-2);
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(232, 182, 76, .3);
  transition: transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
  min-height: 44px;
}
.wait-copy:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(232, 182, 76, .45); }
.wait-copy:active { transform: translateY(0); }
.wait-sub { font-size: var(--fs-xs); color: var(--ink-3); letter-spacing: 1px; }
```

在 `body.lite` 区块追加：
```css
body.lite .wait-overlay { backdrop-filter: none; -webkit-backdrop-filter: none; }
```

**Step 5: 本地验证**

双窗口：单人在房 → 空态出现；第二人加入 → 空态消失；点房名/空态按钮 → 复制成功 toast；新浏览器开 `http://localhost:8280/?room=测试房` → 大厅房间名已预填。

**Step 6: Commit**

```bash
git add public/game.html public/js/ui.js public/index.html public/css/style.css
git commit -m "v45: 邀请体验 (房名徽章+复制邀请链接+等待空态+大厅 ?room= 预填)"
```

---

### Task 5: 控制区重排 + CSS 清理 + 版本号 bump

**Files:**
- Modify: `public/game.html`（删 think-row，按钮并排，版本号 v45）
- Modify: `public/js/ui.js`（无 hint 时隐藏 thinkBtn 本体）
- Modify: `public/css/style.css`（删 .think-row 相关，新增行内思考按钮态，清掉游离 `}` 与重复定义）

**Step 1: game.html 控制区重排**

原 footer：
```html
  <footer class="game-controls">
    <div class="think-row">
      <button id="thinkBtn" class="ctrl-btn think-btn" aria-label="单击开启/关闭深度思考">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 21h6"/><path d="M12 17v4"/><path d="M5 8a7 7 0 0 1 14 0c0 3-3 4-3 8H8c0-4-3-5-3-8z"/>
        </svg>
        <span class="think-label">深度思考</span>
      </button>
    </div>
    <div class="control-row">
      <button id="timerBtn" class="timer-btn" aria-label="切换倒计时">⏱</button>
      <div id="timerDisplay" class="timer-inline hidden">
        <span class="timer-num" id="clock-main">60</span><span class="timer-unit">s</span>
      </div>
      <button id="undoBtn" class="ctrl-btn">悔棋</button>
      <button id="restartBtn" class="ctrl-btn">重新开始</button>
    </div>
  </footer>
```
改为（思考按钮并入 control-row，label 行内显示）：
```html
  <footer class="game-controls">
    <div class="control-row">
      <button id="timerBtn" class="timer-btn" aria-label="切换倒计时">⏱</button>
      <div id="timerDisplay" class="timer-inline hidden">
        <span class="timer-num" id="clock-main">60</span><span class="timer-unit">s</span>
      </div>
      <button id="thinkBtn" class="ctrl-btn think-btn" aria-label="单击开启/关闭深度思考">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 21h6"/><path d="M12 17v4"/><path d="M5 8a7 7 0 0 1 14 0c0 3-3 4-3 8H8c0-4-3-5-3-8z"/>
        </svg>
        <span class="think-label">深度思考</span>
      </button>
      <button id="undoBtn" class="ctrl-btn">悔棋</button>
      <button id="restartBtn" class="ctrl-btn">重新开始</button>
    </div>
  </footer>
```

**Step 2: game.html / index.html 版本号 bump**

- game.html：`style.css?v=44` → `?v=45`；`rules.js?v=37`、`ai.js?v=37`、`game.js?v=37`、`ui.js?v=37`、`timer.js?v=37` 全部 → `?v=45`（notation.js 在 Task 2 已写 `?v=45`）
- index.html：Task 4 已 bump
- **不改** server.js 注入的 `hint.js?v=40`（hint.js 本计划未改动）

**Step 3: ui.js 隐藏逻辑**

原：
```js
      // 无 AI 提示引擎 (普通链接未注入 hint.js) → 隐藏思考按钮
      if (typeof XQ.ai === 'undefined' || typeof XQ.ai.startHint !== 'function') {
        const thinkRow = document.querySelector('.think-row');
        if (thinkRow) thinkRow.classList.add('hidden');
      }
```
改为：
```js
      // 无 AI 提示引擎 (普通链接未注入 hint.js) → 隐藏思考按钮
      if (typeof XQ.ai === 'undefined' || typeof XQ.ai.startHint !== 'function') {
        const thinkBtn = document.getElementById('thinkBtn');
        if (thinkBtn) thinkBtn.classList.add('hidden');
      }
```
另：`bindThinkBtn()` 里 `setLabel('深度思考中')` 等逻辑不变（label 现行内显示，文字变短即可：`'思考中'`）。把两处 `setLabel('深度思考中')` → `setLabel('思考中')`，`setLabel('深度思考')` 保持不变。

**Step 4: style.css 控制区整理**

(a) 删除整个 `.think-row` 相关区块（约 line 1257-1371 之间属于 `.think-row ...` 的所有规则，含 `.think-row .think-btn`、`.think-row .think-btn svg`、`.think-row .think-btn .think-label`、`.think-row .think-btn.deep*`、`.think-row .think-btn.thinking*`、`.deep-flash` keyframes）。保留 `@keyframes think-pulse`。

(b) 清理游离代码（约 line 1250-1255）：删除重复的 `@keyframes clock-danger`（保留 line 651-654 那份）、游离的 `}`、重复的 `.timer-btn:active { transform: translateY(0); }`。清理后该区域应为：
```css
.timer-unit {
  font-family: var(--font-serif);
  font-size: 0.6875rem;
  color: var(--ink-3);
  letter-spacing: 1px;
}

/* 控制行: 倒计时 + 思考 + 悔棋 + 重新开始 */
.control-row {
```

(c) 新增行内思考按钮样式（在 `.control-row` 区块附近）：
```css
/* 思考按钮 (行内, 与其他控制按钮同排) */
.think-btn { gap: 6px; }
.think-btn svg { width: 16px; height: 16px; }
.think-btn .think-label { font-size: inherit; letter-spacing: inherit; color: inherit; position: static; transform: none; }
.think-btn.thinking {
  color: var(--gold-3);
  border-color: var(--gold-3);
  animation: think-glow 1.6s ease-in-out infinite;
}
.think-btn.thinking svg { animation: think-pulse 1.2s ease-in-out infinite; }
@keyframes think-glow {
  0%, 100% { box-shadow: 0 0 6px rgba(232, 182, 76, .25), inset 0 1px 0 rgba(255, 220, 160, .08); }
  50% { box-shadow: 0 0 16px rgba(232, 182, 76, .5), inset 0 1px 0 rgba(255, 220, 160, .08); }
}
```

(d) `.game-controls` 的 `margin-top: 16px` 改为 `margin-top: 6px`（思考行合并后不再需要给 label 留空间）。

(e) 移动端 `@media (max-width: 640px)` 内 `.ctrl-btn` 已有缩小规则，无需新增；检查 320px 宽下四按钮不换行（`.control-row` 保持 flex 单行，按钮 `min-width: 0` 已设）。

**Step 5: 本地验证**

双窗口全流程回归：走子/将军/悔棋协商（模态+倒计时环）/重开（确认模态+换色）/倒计时开关/思考按钮开关（hint 链接）与思考中金色脉冲/普通链接无思考按钮/棋谱面板/邀请复制/等待空态。

**Step 6: Commit**

```bash
git add public/game.html public/js/ui.js public/css/style.css
git commit -m "v45: 控制区重排 (思考并入按钮行) + CSS 清理 + 版本号 v45"
```

---

### Task 6: 全量回归验证（不部署）

**Files:** 无代码改动，纯验证。

**Step 1: 单元/引擎测试**

Run: `node test/test.js && node test/ai-test.js && node test/notation-test.js`
Expected: 三个全绿（规则 88 + AI 50 + 记法全过）

**Step 2: 服务器端到端测试**

Run（后台起服务器再跑联调）:
```bash
node server.js &
sleep 1
node test/room-test.js && node test/timer-test.js
kill %1
```
Expected: 房间 33 过 + 超时 14 过

**Step 3: 浏览器视检**

用 preview（`.claude/launch.json` 已配置 `xq-chess` → 8280）开两个浏览器上下文同房间对局，逐条过：
1. 大厅：`?room=` 预填、localStorage 记忆
2. 等待空态出现/消失、复制邀请链接 toast
3. 房名徽章位置与复制
4. 棋谱面板：折叠头部最新着、展开滚动、双方同步、悔棋后回退
5. 确认模态：重开确认、悔棋应答 30s 环、超时自动关闭
6. 结算面板：将死/超时两种原因、再来一局换色、回大厅
7. 控制区：四按钮一排、思考金色脉冲、普通链接无思考按钮
8. 移动端宽度 375px 预览不溢出

**Step 4: 最终 Commit（如有视检修补）**

```bash
git add -A
git commit -m "v45: 视检修补"
```

**不做：** 不 scp、不 ssh 服务器、不 push GitHub（部署留给用户决定）。

---

## 注意事项备忘

- 9 宫斜线是内联 SVG vector-effect，**不改**回 background-image
- board-wrap 宽度回写 `9×cell` 对齐机制（ui.js buildBoard/recomputeCell）**不动**
- `server.js` **零改动**；hint.js 注入版本号 `?v=40` 不动
- 所有新样式吃现有 token（--gold-*/--ink-*/--line* 等），不新增色板
- ui.js 的 state/start 两个事件处理器都要处理等待空态（新房间第二人加入只广播 start，不广播 state）
