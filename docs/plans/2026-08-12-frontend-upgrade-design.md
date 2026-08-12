# 前端升级设计 v45（2026-08-12）

状态：已确认（逐段与用户过目通过）。本次纯前端改动，`server.js` 不动，不部署。

## 范围

1. **棋谱面板**（新功能）：中文记法纯展示，折叠式，双方实时同步
2. **模态系统重做**：替换原生 `confirm()`，新增胜负结算面板
3. **邀请与等待体验**：房间名展示+复制邀请链接+大厅 `?room=` 预填+等待空态
4. **视觉精修**：古典风延续，控制区重排，新组件统一吃现有 token

## 文件改动

| 文件 | 改动 |
|---|---|
| `public/js/notation.js` | 新增：中文棋谱记法转换器（纯函数） |
| `test/notation-test.js` | 新增：棋谱记法测试（零框架风格） |
| `public/js/ui.js` | 棋谱面板、模态系统、房间名/复制、等待空态 |
| `public/css/style.css` | 新组件样式 + 控制区整理 |
| `public/game.html` | 新组件骨架 + 版本号 bump |
| `public/index.html` | `?room=` 预填 + css 版本号 bump |

## 棋谱记法（notation.js）

- 格式 `[棋子名][列号][动作][目标]`：炮二平五 / 馬8进7 / 車一進三
- 列号：红 = `9-c`（汉字一至九），黑 = `c+1`（阿拉伯数字）
- 动作：直线子（車炮兵將帥）进/退=步数、平=目标列号；斜线子（馬相士）进/退=目标列号
- 进方向：红 row 增大，黑 row 减小
- 同列同类子消歧：前/後；同列叠兵 前/中/後
- API：`toRecord(history)` — 从 initMap 重放，每步在走子前局面算记法，返回 `[{seq, text, red}]`
- 同步：无协议改动，复用 SSE state 的全量 history，两端本地转换

## 模态系统（ui.js）

- 确认模态：重开确认、悔棋应答（拒绝/同意+30s 倒计时环）、悔棋等待（倒计时环，无取消按钮——服务端无撤销接口）
- 胜负结算面板：大字结果+你赢/输视角文案+原因（将死/困毙/超时/对手离开）+「再来一局」（restart API）+「回大厅」
- 触发点：SSE state status 变终局时弹结算面板；短消息保留 showModal toast
- 移除全部三处原生 confirm()

## 邀请与等待

- 对局页顶部玩家条下方：`房 · XXX ⧉` 徽章，复制邀请链接 `域名/?room=房间名`，clipboard API 失败降级 execCommand，toast 反馈
- index.html：优先读 URL `?room=` 预填房间名，其次 localStorage
- players<2 时棋盘舞台覆盖等待空态：「虚位以待」+房间名+复制邀请链接按钮；SSE start 自动移除

## 视觉精修

- 控制区重排：深度思考并入「悔棋/重开」同排四等分按钮，思考态金色描边+脉冲；删除孤立 think-row
- 新组件统一现有 token（深木渐变底/金色细描边/角花/衬线字体）
- 不动：棋盘本体（木纹/网格/九宫 SVG/河界）、棋子样式

## 验证（不部署）

1. `node test/test.js && node test/ai-test.js && node test/notation-test.js` 全绿
2. 本地 `node server.js` + `node test/room-test.js && node test/timer-test.js` 回归
3. 浏览器预览双窗口模拟对局，逐项目视检

## 约束备忘

- 9 宫斜线是内联 SVG vector-effect，不改回 background-image
- wrap 宽度回写 9×cell 对齐机制不破坏
- 改 JS/CSS 后 bump game.html/index.html 的 `?v=` 版本号（统一 v45）
- hint.js 若不改则不动 server.js 注入的 `?v=40`
