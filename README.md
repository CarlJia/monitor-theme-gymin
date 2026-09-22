# monitor-theme-gymin

[monitor](https://github.com/CarlJia/monitor) 的第三方主题（极敏·Gymin），基于内置状态面板丰富表现形式。

React + Vite + shadcn/ui，黑白配色。

## 开发

启动一个 hub 实例：

```bash
monitor-hub --listen 127.0.0.1:9911 --db /tmp/monitor.db --site http://127.0.0.1:9911
```

启动开发服务器，Vite 将 `/api` 与 WebSocket 代理至 hub：

```bash
npm ci
npm run dev
```

手上没有 hub 时用 `npm run dev:mock`：它自己起一个合成数据的 mock hub（节点表、
详情页的历史指标与延迟曲线都造好了），把 Vite 的 `/api` 代理指过去。hub 监听的是
当场找到的空闲端口，所以 `npm run dev` 与它互不打扰，也不会接上另一个还没退出的
旧 hub。

构建产物位于 `dist/`。提交前运行 `npm run build && npm run lint && npm test`。

`npm test` 校验数字格式化和实时指标的输入边界，以及组件的渲染结果。前者是
`src/lib/*.test.ts`——不带框架、`node` 自己剥掉类型的脚本；后者是
`src/components/*.test.tsx`——vitest + jsdom（组件是 .tsx，Node 读不了 JSX）。
两段串在同一个 `npm test` 里，失败时退出码非零。

## 主题包

一个可安装主题是一个目录，名字必须与 `theme.json` 的 `short` 相同：

```text
<themes-dir>/<short>/
├── theme.json
├── preview.png        # 可选，面板上的预览图
└── dist/
    └── index.html
```

`theme.json` 的字段均为字符串：

| 字段 | 含义 |
|---|---|
| `name` | 显示名称 |
| `short` | 唯一短名，限字母、数字、`-`、`_`，取 `default` 则顶替 hub 内置的那份 |
| `description` | 简介 |
| `version` | 主题版本 |
| `author` | 作者 |
| `url` | 源码地址 |

每个 tag 的 release 里的 `theme.tar.gz` 解开就是这个目录——hub 构建时嵌入的是同一个包。

将目录复制到 hub 的 `--themes` 位置，在后台「主题」页切换，无需重启。

本地构建并打包：

```bash
npm run build && npm run package-theme
```

产出 `theme.tar.gz` 与 `theme.tar.gz.sha256`，布局与 tag release 里的产物一致。

## 主题契约

主题是纯静态 SPA，只能依赖下列同源接口（地图底图为打包内置的矢量轮廓与经纬网，
国旗为打包内置的 SVG，不发起任何外部请求）：

| 接口 | 用途 |
|---|---|
| `GET /api/me` | 站点名、登录状态、公开页开关 |
| `GET /api/nodes` | 节点列表、实时指标和累计流量 |
| `GET /api/nodes/{id}/metrics` | 历史指标和延迟记录 |
| `GET /api/nodes/quality` | 全节点最近一小时的延迟/丢包带宽，按节点 id 给出；公开页开启时匿名可用 |
| `GET /api/ws` | 每 2 秒推送一次节点快照的 WebSocket |

`metrics` 的三个查询参数都可省：

- `hours=N` 窗口宽度。**匿名上限 168，登录后 2160**，超出静默 clamp——降采样限的是响应行数，这个
  上限限的是 hub 扫描多少行
- `points=W` 调用方能画的桶数上限，clamp 到 [60, 1440]，超出两端都按端点算：超过 1440 等于不传（1440 是默认上限），低于 60 会被拉到 60——所以传小值不会得到更稀的响应
- `series=metrics|ping` 只取要画的那一半，省掉的那半原本占响应的三分之一到三分之二

探测曲线的名字在响应的 `probes` 里随样本一起下发，匿名可读，所以画延迟图不需要第二个请求，也不
需要管理员身份。

整个窗口的丢包率在响应的 `loss` 里，按探测 id 给出**未取整的浮点百分比**（0.14% 不会被取整成 0%，因为 0% 表示没丢）；只在 `series=ping` 那半里出现；没丢包的探测不出现。**不要拿样本行里
的 `loss` 自己平均**：那一个是所在桶的百分比，除数已经丢了，而各桶样本数天然不等——窗口首尾两桶
本来就是残缺的，探测启停、节点掉线、agent 跳过一轮都会再造几个。十三次里丢一次，平均桶百分比会
算出 50%。

匿名访问 `GET /api/nodes` 仅返回 `public=1` 的节点，响应中不含 `ip`、`ipv4`、`ipv6`、`observed_ip`、`hostname`、`remark`、`agent_version`、`token`，`metrics` 也按白名单裁剪。字段定义以 hub 的 `src/api.rs` 为准。

未知路径回落到主题的 `dist/index.html`，客户端路由可用。`/admin/*` 由 hub 内置后台接管，不属于主题契约。

本主题用 `/node/{id}` 作为详情页。hub 的回落对它够用，但**hub 前面若有按路径做正向白名单的反代
或 WAF，得把这个前缀放行**：从列表点进去只是 pushState，边缘看不见，刷新详情页才会真的请求
`/node/{id}`，症状是「点进去正常，一刷新就被拦」。

## 变更记录

每个 tag 的改动汇总在 [CHANGELOG.md](CHANGELOG.md)，GitHub Release 页面同时
附带 `theme.tar.gz` 与自动 notes：[releases](https://github.com/CarlJia/monitor-theme-gymin/releases)。

## 许可

MIT
