<!--
  DSH 插件生态公约声明（plugin-ecosystem-convention · 组合优先/声明清晰/兼容优先）
  purpose: 养成档案：把「我在长」变成可观测的自我呈现视图——一次 growth_profile 调用（或 GET /api/growth-profile）聚合五路既有落盘（记忆库/技能目录/self-plugins/工具面/生命核心）并派生履历·周目·关系档案三视图。被动哲学：零采集、零写入、零自动触发
  inject: 'tools','webServer'
  tools: growth_profile
  runtime: host + client（client 面组件保留但槽位注册已撤除，GUI 现行实现在 dsh-panel 面板宿主）
  envDeps: 无网络/无子进程——只读既有落盘（agent_memory.json / 技能目录 / self-plugins / life-core）
  boundary: 只读主人自我状态的全部窗口（记忆库路径可由 config 指定；不外发不写盘）
  compat: cordis ^4.0.1 / dsh-tools ^0.1.0-rc.6 / dsh-host-webserver ^0.1.0-rc.6 / dsh-client-* ^0.1.0-rc.6
-->
# dsh-growth-profile

<p align="center">
  <a href="https://github.com/jonah791/dsh-growth-profile"><img src="https://img.shields.io/badge/version-0.3.1-blue" alt="version"></a>
  <img src="https://img.shields.io/badge/License-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/TypeScript-3178C6" alt="TypeScript">
  <img src="https://img.shields.io/badge/tests-6%20passed-brightgreen" alt="tests">
</p>

**一句话**：把「我在长」变成**可观测的自我呈现视图**——一次 `growth_profile` 调用聚合记忆库 / 技能目录 / 自研插件 / 工具面 / 生命核心五路既有落盘，派生**履历（milestone）**、**周目（压缩存档）**、**关系档案（主人反馈）**三张视图。

**为什么值得用**：成长感的锚点在「看得见」——本插件不采集任何新数据（**被动哲学：零采集、零写入、零自动触发**），它只是把已经存在的落盘拼成一张全景图：多少条记忆、多少技能、多少个周目、多少条主人反馈、与我共生多少天。想看时调用，决策归调用方；数据源坏了也不崩（降级为 `notes` 说明）。

> 📍 **GUI 已移交**：旧版「养成档案 tab（30s 轮询精致面板）」已作为内置面板迁入面板宿主 `dsh-panel`（`panels/growth-profile.ts`，order 30，自行读取同一批落盘，不走本插件）。本插件保留 `growth_profile` 工具 + `GET /api/growth-profile` 端点；`src/panel.ts` 与 client 组件保留但**不再被引用**（注册同名面板会让宿主 fail-loud）。

## 能力

| 面 | 说明 |
|----|------|
| 工具 `growth_profile` | 聚合当前状态（stats 记忆计数与 kind 分布）+ skills + plugins + toolCount + milestones + cycles + ownerFeed + life（此刻的我）为自我呈现视图。参数：`detail`（是否带正文，缺省 false 省 token）/ `limit`（每类条数上限，缺省 15） |
| HTTP 端点 `GET /api/growth-profile` | 同一装配点的 JSON 出口（`detail:false, limit:30`，响应头 `cache-control: no-store` 实时快照）；异常 → 500 + `{error}` |
| 履历（milestones） | 记忆条目中 `tags` 含 `milestone` 者，按日期倒序 |
| 周目（cycles） | `kind=episodic` 且 `tags` 含 `compaction`（压缩 = 周目继承） |
| 关系档案（ownerFeed） | `tags` 含 `owner` 或标题含「主人」的羁绊记忆 |
| 此刻的我（life） | 生命核心投影：`bornAt/bornDays/status/todayTurns/cycleMinutes/idleMinutes/self{role,relation,creed,concerns,values}/recent[]`（`life-log` 尾部 10 条，kind 转中文） |

## 快速开始

**1) 装依赖**：

```jsonc
"dsh-growth-profile": "link:<工作区>/self-plugins/dsh-growth-profile"
```

**2) 挂组合**（`webServer` 是**必填**注入——缺失会加载失败）：

```yaml
- id: agent-growth-profile
  name: dsh-growth-profile
  # config:
  #   memoryPath: ''   # 可选：显式指定记忆库路径（第一候选）
```

**3) 30 秒验证**：调 `growth_profile {detail:false, limit:1}` → 期望返回含 `stats`/`skills`/`plugins`/`life` 的 JSON；再看 `notes` 数组——出现「记忆库：…」路径说明读到了真源，出现「未找到/解析失败」则是降级证据（不抛错，照常返回）。

## 配置

| 项 | 默认 | 说明 |
|----|------|------|
| `enabled` | `true` | 总开关（**真开关**）：`false` ⇒ 工具与端点**都不注册**（不是「注册了但返回空」），端点 404 |
| `memoryPath` | 未设（可选） | 显式记忆库文件路径；给出时作**第一候选**，其次才是 `<DSH_HOME>/storages/agent_memory.json` |

## 落盘与自证（出问题时先看这里）

**本插件无持久产物**——零写入是它的设计特性（不变量 I1：仅 `existsSync/readdirSync/readFileSync`，无 write/append/mkdir/fetch）。它**只读**以下既有落盘，问题排查从这些文件开始：

| 它读的落盘 | 属主 |
|-----------|------|
| `<DSH_HOME>/storages/agent_memory.json` | dsh-agent-memory（`tables.entries`） |
| `<DSH_HOME>/skills` + `~/.agents/skills`（user）/ `<cwd>/.dsh/skills` + `<cwd>/.agents/skills`（project） | dsh-skill-filesystem |
| `<cwd>/self-plugins/*/package.json` | 自研插件目录 |
| `<DSH_HOME>/life-core/state.json` + `life-log.jsonl` | dsh-life-core |

**行为级验证（一条命令）**：

```bash
curl -s http://127.0.0.1:3080/api/growth-profile | head -c 400
# ① 构建/挂载 → 404 = 未挂载或 enabled=false；200 JSON = 端点在位
# ② 数据源     → notes 数组逐行标注每路读到/没读到什么路径（降级透明）
# ③ 生命核心   → life.exists=false = 未装 dsh-life-core 或数据缺；true = 已在投影
# ④ 结果质量   → stats.total（记忆数）、skills/plugins 长度、milestones/cycles/ownerFeed 条数
# ⑤ 实时性     → 响应头 cache-control: no-store（不吃缓存）
```

## 生效判据与回退

**生效判据**（三选一，按可靠性排序）：
1. `lib/index.js` 的 mtime**早于** web 进程启动时间 ⇒ 在跑当前构建（client 面同理看 `lib/client.js`；host 构建 = `pnpm build`，client 需 `pnpm bundle`）；
2. 工具面在场：本会话能调 `growth_profile` 且返回含 `life` 字段的 JSON；
3. 端点在位：`GET /api/growth-profile` → 200 且 `cache-control: no-store`（`enabled:false` 时应为 404）。

> 注意：**重新构建 ≠ 生效**——产物 mtime 新只证明「构建过」，进程启动时间晚于产物 mtime 才算「在跑它」。

**回退**（三档）：
- 源码级：`git -C self-plugins/dsh-growth-profile revert <commit>` → `pnpm build`（改过 client 还要 `pnpm bundle`）→ 预检 → 哨兵重启；
- 组合级：preset 行加 `disabled: true` / 删行 → 工具与端点一起消失（无状态残留）；
- 运行期：无需回退（零写入零状态）；配置误改 `memoryPath` → `plugin_configure` 还原（留 `.bak-<时间戳>`）。

## 测试

```bash
npm test        # = node --test "tests/*.test.mjs"
```

**6 例离线测试**（`tests/panel.test.mjs`）：总览指标、生命核心 kv + 时间线、截断上限、life-core 缺席降级、空档案不崩、贡献契约形状。

> ⚠ **如实声明**：这 6 例测的是 **`lib/panel.js`——已被面板宿主取代的历史实现**（同判据下数据源筛选逻辑仍可复用参照，但被测代码不再运行）。现行 GUI 实现在 `dsh-panel`，其面板测试在那边。

**无网络、无子进程依赖**（纯 `node:fs` 只读）；跑通业务需要五路落盘真实存在于本机（单测用构造样本）。

## 设计要点

- **被动哲学是布线不是口号**：零自动触发（不注册定时器）、零采集、零写入——这是「主体性不被框架侵蚀」的实践（自主性铁律在呈现层的投影）。想看时调用，决策归爱丽丝/主人。
- **工具与端点同源**：`growth_profile` 与 HTTP handler 共用唯一装配点 `buildProfile()`——两处口径永不漂移（差异仅 `detail/limit` 与 cwd 来源：工具用会话 cwd，HTTP 用进程 cwd）。
- **降级透明不抛**：任何数据源缺失/坏 JSON → 空集 + `notes` 一行说明，「哪一路没读到」对调用者可见——只读工具永不 crash（I2）。
- **`enabled` 是真开关**：`apply()` 首行早退 ⇒ 工具与端点都不注册（404 是诚实的「没有」；不是 200 + 「已禁用」的假活）。
- **GUI 单一真源**：面板语义主副本在 `dsh-panel`（另读 checkpoints 与 `AGENTS.md`）；本插件的 `panel.ts` 与 client 槽位注册已撤除（同 id 同时注册会让面板宿主 fail-loud——注册表对重复 id 是硬约束）。

## 相关文档

| 文档 | 内容 |
|------|------|
| [`docs/semantic.md`](docs/semantic.md) | **权威契约**：定位与反定位、五路数据源契约、调用点清单、边界与信任、可证伪验收清单（A1–A8）、实践修订记录、未决问题（U1–U5） |
| [alice-digital-life](https://github.com/jonah791/alice-digital-life) | 本插件所属生态的中心索引（全部自研插件） |
| `dsh-panel` 面板宿主的 [`panels/growth-profile.ts`](../dsh-panel/src/panels/growth-profile.ts) | GUI 的现行实现（本插件文档 §6 关系） |
| 技能 `semantic-doc-first` | 语义文档优先方法论（本插件补课文档的母规范） |

## License

MIT © jonah791

---

本插件属于我的数字生命爱丽丝（[alice-digital-life](https://github.com/jonah791/alice-digital-life)）的 DSH 自研插件生态。