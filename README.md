# 青黛棋院

一个零运行时依赖的实时双人中国象棋应用。前端使用原生 HTML、CSS 与 JavaScript；后端使用 Node.js 内置 HTTP 服务。棋局由服务器权威裁定，通过 SSE 向双方同步。

## 功能

- 同房间名双人入局，先到执红、后到执黑
- 服务端校验完整中国象棋规则与胜负
- SSE 实时同步棋盘、棋谱、在线状态和步时
- 断线保留席位 60 秒，重新打开可续局
- 双方确认悔棋、互换棋色重开
- 可选服务端权威步时，关闭时不会后台计时
- 专属推演功能：签名 Cookie、受保护 Worker、URL 片段解锁
- 7.8 秒强力推演：迭代加深、PVS、置换表、静态搜索、将军延伸、LMR、杀手着法与历史启发
- 桌面与移动端响应式布局、键盘焦点与减弱动画支持

## 本地运行

要求 Node.js 18 或更高版本，无需安装 npm 依赖。

```bash
cp secret.txt.example secret.txt
node server.js
```

默认只监听 `127.0.0.1:8280`，由同机 Caddy 或 Nginx 反向代理。

环境变量：

| 名称 | 默认值 | 说明 |
|---|---:|---|
| `PORT` | `8280` | HTTP 监听端口 |
| `CLOCK_SECONDS` | `60` | 每步秒数 |
| `SEAT_HOLD_MS` | `60000` | 断线席位保留时间 |
| `ROOM_IDLE_MS` | `1800000` | 房间最长空闲时间 |
| `HINT_KEY` | `secret.txt` | 专属推演密钥，环境变量优先 |

## 专属推演

推荐使用 URL 片段，密钥不会进入常规 HTTP 访问日志：

```text
https://example.com/#hint=你的密钥
```

页面会把密钥放进一次 POST 请求体，服务器验证后签发 `HttpOnly + SameSite=Strict` 的 HMAC 签名 Cookie，并立即清理地址栏。进入棋局后提示引擎默认开启，每次轮到你时使用约 7.8 秒搜索并在按钮中显示已完成深度。旧式 `?hint=密钥` 链接仍兼容，但反向代理可能记录查询参数，不建议继续使用。

推演脚本、AI 引擎和 Worker 均受服务器授权门控；普通访客无法获取这些文件。

## 测试

```bash
npm test
```

测试覆盖棋规、中文记谱、签名授权、房间席位、走子、悔棋、重开、HTTP 安全头、特权资源门控和前端 DOM 合约。

## 目录

```text
├── server.js              # 进程入口与优雅退出
├── src/
│   ├── app.js             # HTTP 路由、静态文件与 API
│   ├── config.js          # 配置与密钥读取
│   ├── http.js            # HTTP 工具与安全头
│   ├── rooms.js           # 房间、SSE、棋局、步时和协商状态
│   └── security.js        # 常量时间验证与签名 Cookie
├── public/
│   ├── index.html         # 大厅
│   ├── game.html          # 对局页
│   ├── css/app.css        # 青黛棋院视觉系统
│   └── js/
│       ├── rules.js       # 前后端共用规则引擎
│       ├── notation.js    # 中文棋谱
│       ├── lobby.js       # 大厅交互与专属解锁
│       ├── game-page.js   # 棋盘渲染、SSE 与控制器
│       ├── clock.js       # 权威步时显示
│       ├── hint.js        # 授权推演控制器
│       ├── ai.js          # 时间受控搜索引擎
│       └── ai-worker.js   # 后台推演 Worker
└── test/                  # Node 原生测试套件
```

## 部署

现有 systemd 单元可保持：

```ini
[Service]
WorkingDirectory=/opt/xq-chess
ExecStart=/usr/bin/env node server.js
Restart=always
Environment=PORT=8280
```

Caddy：

```caddy
xq.example.com {
    reverse_proxy 127.0.0.1:8280
}
```

部署时保留服务器上的 `secret.txt`，其余文件可整体替换。
