# 中国象棋小游戏

借鉴开源项目 [itlwei/Chess](https://github.com/itlwei/Chess)(MIT) 的中国象棋,全新实现的纯前端 + 零依赖 Node 服务器版本。

**和朋友在线对战**:打开游戏填写**昵称 + 房间名**后进入棋盘,两人输入**相同的房间名**即可一起玩(先进入的执红,后进入的执黑)。进入页与棋盘页分离,界面干净。

**AI 提示专属链接** —— 只有持有密钥链接的你,棋盘侧栏才有「💡 AI 提示」开关,并分**菜鸟 / 中级 / 高手**三档强度(深 2 随机 / 深 3 / 深 4);轮到你走棋时高亮 AI 建议的落子。其他人打开普通链接,纯对战无任何提示功能。

## 快速开始

```bash
# 1. 生成专属密钥 (只执行一次)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))" > secret.txt

# 2. 启动
node server.js          # 默认 8280 端口, 可用 PORT=xxxx 指定

# 3. 运行测试 (规则 + AI)
npm test
```

## 两种链接

| 链接 | 效果 |
|---|---|
| `http://地址:8280/` | 普通链接 —— 无任何提示功能 |
| `http://地址:8280/?hint=你的密钥` | **专属链接** —— 侧栏出现「💡 AI 提示」开关 |

密钥来源:环境变量 `HINT_KEY` 或 `secret.txt` 首行(非 `#` 开头)。密钥只存在于服务器端与你的专属 URL 中,**永远不会出现在任何前端静态文件里**;`/js/hint.js` 本身也需要密钥才能获取(未授权 404),普通访问者即使查看源码也拿不到提示功能。

> 安全提示:密钥会出现在服务器访问日志的 URL 中。专属链接只发给自己即可;若担心日志泄漏,可在 nginx/Caddy 层对日志脱敏。

## 玩法

- **进入房间**:首页填写昵称 + 房间名进入棋盘;和朋友输入相同房间名即可同玩,先到先得(先入红、后入黑)
- 任意一方可悔棋/重开;吃掉对方将帅或困死对方即胜
- **AI 提示(专属链接)**:侧栏「💡 AI 提示」开关 + 三档强度(菜鸟/中级/高手),开启后轮到你走棋时高亮 AI 建议的**来源格(蓝环)与落子格(蓝色脉冲)**;提示只建议不代走,你仍可自由行棋
- 音效:走子/吃子/将军/胜负(WebAudio 合成,无外部资源)
- 移动端可用,无需任何外部 CDN

## 文件结构

```
├── server.js             # 零依赖 Node 服务器: 静态服务 + 密钥门控 + 房间对战
├── secret.txt            # 你的专属密钥 (已 gitignore, 绝不入库)
├── public/
│   ├── index.html        # 进入页 (昵称 + 房间名, 不含 hint 引用)
│   ├── game.html         # 棋盘页 (自动加入房间, hint 由服务器注入)
│   ├── css/style.css     # 烫金古典视觉: 深胡桃木 + 珐琅棋子 + 走子动画
│   └── js/
│       ├── rules.js      # 规则引擎 (纯函数): 走法生成/将军/胜负/送将检测
│       ├── ai.js         # AI 引擎: negamax + alpha-beta + 位置估值
│       ├── game.js       # 对局状态机: 行棋/悔棋/重开/事件
│       ├── ui.js         # DOM 渲染/交互/音效/走子动画 (数据驱动翻转)
│       ├── timer.js      # 双人倒计时引擎 (60s/方, 超时判负)
│       └── hint.js       # AI 提示 (仅专属链接注入, 不含密钥)
└── test/                 # 规则 + AI + 房间 + 超时测试
```

## 部署到服务器 (systemd + Caddy)

1. 上传项目到服务器 `/opt/xq-chess`(含 `secret.txt`)
2. 注册 systemd 服务:

```ini
# /etc/systemd/system/xq-chess.service
[Unit]
Description=XQ Chess server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/xq-chess
ExecStart=/usr/bin/env node server.js
Restart=always
RestartSec=3
Environment=PORT=8280

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now xq-chess
```

3. Caddy 反向代理 + 自动 HTTPS:

```
# /etc/caddy/Caddyfile
xq.htyiybb.top {
    reverse_proxy 127.0.0.1:8280
}
```

```bash
sudo systemctl reload caddy
```

4. DNS:给域名加 A 记录指向服务器 IP。

完成后的两种链接:
- 普通:`https://xq.htyiybb.top/`
- 专属:`https://xq.htyiybb.top/?hint=密钥`

## 技术说明

- 规则引擎借鉴参考项目:车横扫、马蹩腿、象塞眼+不过河、士将九宫、兵过河横移、炮隔子跳吃、将帅对脸;比参考项目更严格的胜负判定:吃将即胜 + 困毙判负 + 将军检测(方向扫描)
- AI:negamax + alpha-beta 剪枝,吃子优先(MVV-LVA)着法排序,位置估值表移植自参考项目(MIT),深 2/3/4 三档
- 纯函数棋盘操作 make/undo,搜索与 UI 无共享状态(参考项目此处的耦合 bug 已消除)
- 专属链接安全模型:服务器验证 `?hint=KEY`(sha256 对齐后 timingSafeEqual),授权才注入 hint 脚本;`Cache-Control: no-store` 防止代理缓存泄漏特权版页面
