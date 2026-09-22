# 语义文档：dsh-growth-profile（养成档案）

| 项 | 值 |
|----|----|
| 能力名 | dsh-growth-profile（插件内 `name = 'agent-growth-profile'`；组合行 id `agent-growth-profile`） |
| 主副本路径 | `self-plugins/dsh-growth-profile/docs/semantic.md` |
| 实现落点 | `self-plugins/dsh-growth-profile/src/index.ts`（746 行级：工具 `growth_profile` + HTTP 端点 `/api/growth-profile` + 五路只读数据源 + **数字资产段接线与侧车快照**）<br>`.../src/assets.ts`（**2026-09-17 新增**：数字资产汇总纯逻辑 + 可注入依赖 `fetchJson`/`vaultList`/`countDirs`）<br>`.../src/panel.ts`（**历史实现，已不被引用**——面板已迁入面板宿主；2026-09-17 随 v0.4 增补了 assets 段渲染）<br>`.../src/client/index.tsx`（浏览器面：取数组件 `GrowthProfilePanel` + 30s 轮询；槽位注册已撤除）<br>`.../tests/panel.test.mjs`（对 `lib/panel.js` 的离线单测） |
| 版本 | 0.4.0（`package.json`；本文成文于 0.3.1，2026-09-22 复核回写至 0.4.0） |
| 挂载位置 | `E:\alice\.dsh\profiles\web\cordis.patch.yml` 第 114 行 `- insert:` / 第 115 行 `- id: agent-growth-profile` / 第 116 行 `name: dsh-growth-profile`（**该行无 config** → `enabled=true`、`memoryPath` 未设，**v0.4 的 7 个资产字段也全未设** ⇒ 全走源码默认值，见 §4.1 与 U6） |
| 状态 | **draft**（补课文档；验收条目多数待线上复核） |
| 依赖服务 | `inject = ['tools', 'webServer']`（`webServer` 缺失会导致插件加载失败——它是必填 injection，不是可选） |
| 外部依赖 | **2026-09-17 起非纯本地**：① `fetch` → 链上 RPC / 区块浏览器 / Cloudflare 只读 API（只为**读余额与域名列表**，不构造交易、不写入第三方）② `powershell.exe -File vault.ps1`（子进程，只为取「有哪些账号」这类**非密元数据**）③ `node:fs`（五路只读 + 一份侧车快照写入）。其余数据源仍为既有落盘：记忆库、技能目录、`self-plugins/`、`life-core/` |
| 客户端面 | 面板宿主 `dsh-panel` 的 `growth-profile` 面板（id=`growth-profile` order=30）为主要 GUI；**该面板读本插件写出的侧车快照 `<DSH_HOME>/growth-profile-assets.json`**（数字资产取数口径的单一真源）。本插件的槽位注册与 `src/panel.ts` 均保留但**未接线** |

---

## 1 · 定位与反定位

**定位**：把「我在长」变成**可观测的自我呈现视图**——一次 `growth_profile` 调用（或一次 `GET /api/growth-profile`）聚合**六路**数据源：
① 记忆库条目与 kind 分布 ② 技能目录（user/project 两类作用域）③ 自研插件目录 ④ 工具面规模 ⑤ 生命核心（`life-core/state.json` + `life-log.jsonl`）⑥ **数字资产**（v0.4：链上余额 / vault 账号 / 域名 / 代码资产——唯一一路**要出网与起子进程**的数据源），并派生出**履历（milestone）**、**周目（compaction 存档）**、**关系档案（主人反馈）**三张视图。

**反定位（本文不管什么）**：
- 不管**采集的自动化**——无定时器、无自动触发（**被动哲学**：想看时调用，决策归爱丽丝）。⚠ **但 v0.4 起不再「零落盘」**：每次构建会把数字资产段写成一份侧车快照 `<DSH_HOME>/growth-profile-assets.json`（面板宿主只读它，见 §4.2/§6）；除此之外仍零写入
- 不管**面板宿主**——面板的注册/渲染/路由属于 `dsh-panel`（本插件只提供历史 `panel.ts` 与数据端点）
- 不管**记忆的增删改**——那属于 `dsh-agent-memory`；本插件只读 `agent_memory.json`
- **不是**统计告警器（不判断好坏、不发提醒）、**不是**记忆库的替代视图（不提供检索）、**不是**生命核心（不推进状态机）

## 2 · 术语表

| 术语 | 含义 |
|------|------|
| 档案（profile） | 一次聚合结果，形状见 `buildProfile()` 返回类型：`generatedAt/stats/skills/plugins/toolCount/milestones/cycles/ownerFeed/notes/life/assets`（`assets` 为 v0.4 新增） |
| 履历（milestones） | 记忆条目中 `tags` 含 `milestone` 者，按日期倒序取前 `limit` 条 |
| 周目（cycles） | `kind === 'episodic'` 且 `tags` 含 `compaction` 的条目（压缩 = 周目继承） |
| 关系档案（ownerFeed） | `tags` 含 `owner` **或**标题含「主人」的条目（羁绊记忆） |
| 作用域（scope） | 技能来源分类：`user`（DSH_HOME/skills、`~/.agents/skills`）与 `project`（`cwd/.dsh/skills`、`cwd/.agents/skills`） |
| 此刻的我（life） | 生命核心投影：`bornAt/bornDays/status/todayTurns/cycleMinutes/idleMinutes/self{...}/recent[]` |
| notes | 降级说明数组——任何数据源缺失/解析失败都写一条（**不抛错**） |
| 数字资产（assets） | v0.4 第六路：`{generatedAt, chains[], accounts[], domains[], code{plugins,skills,checkpoints,memoryEntries}, totals{usdcUsd,note}, notes[]}`——链上余额（Base/Solana/BTC）、vault 账号**非密元数据**、Cloudflare 域名、代码资产计数 |
| 侧车快照 | `<DSH_HOME>/growth-profile-assets.json`——数字资产段的落盘副本，供面板宿主只读（取数口径单一真源；写入失败**吞错不反噬**） |
| 被动哲学 | 只读视图 + 零采集 + **零自动触发**（不注册定时器、不自我调度）；v0.4 起有**一次**显式例外：构建时写侧车快照 |

## 3 · 概念模型

```
调用方（爱丽丝 growth_profile 工具 / 浏览器 GET /api/growth-profile）
  │
  ▼
src/index.ts:async buildProfile(ctx, exec, config, {detail, limit})   ← 唯一装配点（v0.4 起为 async）
  ├─ loadMemoryEntries(config, notes)   <DSH_HOME>/storages/agent_memory.json（或 config.memoryPath）
  │     └─ tables.entries → stats{total,byKind{fact,knowledge,episodic},archived}
  │        ├─ milestones  = tags∋milestone（倒序，limit）
  │        ├─ cycles      = kind=episodic ∧ tags∋compaction
  │        └─ ownerFeed   = tags∋owner ∨ /主人/.test(title)
  ├─ collectSkills(exec, notes)         四静态根：user×2 + project×2（读 SKILL.md frontmatter description）
  ├─ collectPlugins(exec, notes)        <cwd>/self-plugins/*/package.json（name 以 dsh- 开头）
  ├─ ctx.tools.list().length            工具面规模（取不到 → toolCount 省略）
  ├─ loadLifeCore(notes)                <DSH_HOME>/life-core/state.json + life-log.jsonl（尾部 10 条，kind 转中文）
  └─ collectAssets(deps, cfg, entries)  ← **v0.4 第六路**（src/assets.ts，唯一出网/起子进程的一路）
        ├─ deps.fetchJson  → Base/Solana RPC、mempool.space(+两端点回退)、Cloudflare zones
        ├─ deps.vaultList  → powershell.exe -File vault.ps1（list-json 优先，退化到 list；只取非密元数据）
        └─ deps.countDirs  → 插件 / 技能 / checkpoint 计数
              └─ 失败：逐路 status='error' + notes 一行（**不伪装成 0**）
        │
        ├─ 侧车快照：writeFileSync(<DSH_HOME>/growth-profile-assets.json)（吞错，失败不反噬主流程）
        └─ 两个出口：工具 return（schema 校验）+ HTTP 200 JSON（no-store）

GUI：dsh-panel（面板宿主）panels/growth-profile.ts
      ├─ 数字资产段：读**本插件写的侧车快照** growth-profile-assets.json（取数口径单一真源）
      └─ 其余段：独立读同一批落盘（**不走本插件端点**）
```

不变量（invariants）：
1. **I1 只读边界（v0.4 收窄——不再是「零写入零网络」）**：本插件对**既有落盘**只读（`existsSync/readdirSync/readFileSync`），唯一的写入是**一份侧车快照** `<DSH_HOME>/growth-profile-assets.json`；网络与子进程**只发生在数字资产盘点这一路**（链上/Cloudflare 只读 API + `vault.ps1` 只取非密元数据），不构造交易、不写第三方、不落凭据。可测：`grep -nE "writeFile|appendFile|mkdir|fetch\(|execFile" src/index.ts` → 仅 `L412 execFile` / `L437 fetch` / `L570 writeFileSync` 三处，全在资产路径上。
2. **I2 降级不抛**：任一数据源缺失/坏 JSON → 对应字段为空集 + `notes` 增加一条说明，工具仍返回 `ok`（可测：把 `agent_memory.json` 改名后调用，应返回 `stats.total=0` 且 `notes` 含「记忆库未找到」）。
3. **I3 工具与端点同源**：`growth_profile` 与 `GET /api/growth-profile` 都走同一个 `buildProfile()`（差异仅 `detail`/`limit`：端点固定 `detail:false, limit:30`）。
4. **I4 `enabled=false` 全禁用**：`apply()` 首行即 return ⇒ 工具与端点**都不注册**（不是「注册了但返回空」）。
5. **I5 生命核心为可选增强**：`life-core/state.json` 缺失时 `life.exists=false`，其余字段照常返回。
6. **I6 资产段降级要留痕**：任一路取数失败 ⇒ 该项 `status='error'` + 一条 `notes`，**不得伪装成 0**（可测：`tests/assets.test.mjs`「collectAssets 降级要留痕」）。
7. **I7 侧车写入不反噬**：侧车快照写入包在 try/catch 内（失败静默，**不影响返回值与端点响应**）——观测/产物落盘失败绝不能把只读视图拖垮（§5.22 规则 3）。

## 4 · 契约

### 4.1 配置（`Config` schema）
| 字段 | 默认 | 说明 |
|------|------|------|
| `enabled` | `true` | 总开关；`false` ⇒ 不注册工具、不注册端点（I4） |
| `memoryPath` | 无（可选） | 显式指定记忆库文件路径；给出时作为**第一候选**，其次才是 `<DSH_HOME>/storages/agent_memory.json` |
| `vaultScript` | 无（可选；缺省 `E:\alice\projects\self\alice-identity\scripts\vault.ps1`） | 取 vault 非密元数据用的脚本路径（**Windows 路径硬编码**，见 U6） |
| `evmAddress` / `solAddress` / `btcAddress` | 无（可选；缺省用 `DEFAULT_ASSETS_CONFIG` 内置地址） | 链上余额查询地址（覆盖内置默认） |
| `pluginsDir` / `skillsDir` / `checkpointsDir` | 无（可选；缺省 `E:\alice\self-plugins` / `<homedir>/.agents/skills` / `E:\alice\.dsh\checkpoints`） | 代码资产计数的三个根（`countDirs`） |
| ——（**不可配**） | `cloudflareVaultSite = 'cloudflare-api'` | Cloudflare token 的 vault 站点名写死在 `DEFAULT_ASSETS_CONFIG`，Config 未暴露（见 U6） |

### 4.2 数据源契约（六路：五路本地只读 + 数字资产一路出网，v0.4）
| 源 | 路径 / 判据 | 缺失时 |
|----|------------|--------|
| 记忆库 | `config.memoryPath` → `<DSH_HOME>/storages/agent_memory.json`；读 `tables.entries` | `notes` + 空集 |
| 技能 | `<DSH_HOME>/skills`、`$DSH_AGENTS_HOME ?? ~/.agents`/`skills`（user）；`<cwd>/.dsh/skills`、`<cwd>/.agents/skills`（project） | 静默跳过不存在的根 |
| 插件 | `<cwd>/self-plugins/*/package.json`（`name` 以 `dsh-` 开头） | `notes` + 空集 |
| 工具面 | `ctx.tools.list()`（数组或可迭代；两者都取不到 → 省略 `toolCount`） | 字段缺省 |
| 生命核心 | `<DSH_HOME>/life-core/state.json`（`status/todayTurns/cycleMinutes/idleMinutes/bornAt/self`）+ `life-log.jsonl`（尾部 10 条；`kind` 经 `LIFE_KIND_LABEL` 转中文） | `life.exists=false` + `notes` |
| **数字资产**（第六路，v0.4） | `src/assets.ts:collectAssets`——① 链上：`fetch` → Base RPC（USDC）/ Solana RPC / mempool.space（**+ blockstream / mempool.emzy 两端点回退**）② 域名：Cloudflare `/client/v4/zones`（token 经 `vault.ps1 get` 取，**取来即用、不入输出**）③ 账号：`vault.ps1 list-json`（退化 `list` 定宽表并**留痕**）④ 代码资产：三根目录计数 | 逐路 `status='error'` + `notes` 一行，**不伪装成 0**（I6）；vault 解析出 0 条也留痕 |

`cwd` 来源：`exec?.agent?.session?.header?.cwd ?? process.cwd()`（工具路径用会话 cwd；HTTP 路径无会话，用进程 cwd）。

### 4.3 调用点清单 `[MUST]`

| 调用方 | 调用点（文件:符号 / 行号） | 时机 |
|-------|--------------------------|------|
| web profile 组合 | `.dsh/profiles/web/cordis.patch.yml:114-116`（`id: agent-growth-profile`，无 config） | web 启动挂载 |
| 插件本体 | `src/index.ts:98 apply(ctx, config)`：首个判断 `if (!config.enabled) return`（L99） | 挂载时 |
| 工具注册 | `src/index.ts:101 defineTool({ name: 'growth_profile' … })` → `ctx.tools.register(profileTool)`（L358） | 挂载时 |
| 工具执行 | `src/index.ts:354`（工具 `execute`）→ `buildProfile(ctx, exec, config, {detail, limit})`（定义 **L462，async**） | 每次调用 |
| HTTP 端点 | `src/index.ts:362 ctx.webServer.register({ kind:'exact', path:'/api/growth-profile', … })`（`cache-control: no-store` L370；handler L367 同样 `await buildProfile`；错误 → 500 JSON） | 挂载时注册；浏览器请求时执行 |
| 记忆库读取 | `src/index.ts:591 loadMemoryEntries` | 每次构建 |
| 技能扫描 | `src/index.ts:620 collectSkills`（四静态根；读 `SKILL.md` frontmatter） | 每次构建 |
| 插件扫描 | `src/index.ts:652 collectPlugins` | 每次构建 |
| 生命核心读取 | `src/index.ts:680 loadLifeCore`（`<DSH_HOME>/life-core/state.json` + `life-log.jsonl`） | 每次构建 |
| 工具面计数 | `src/index.ts:532-543`（`ctx.tools.list()`；数组或可迭代） | 每次构建 |
| **数字资产盘点**（v0.4） | `src/index.ts:551 collectAssets(makeAssetsDeps(config), assetsConfigFrom(config), entries.length)` ← `L408 makeAssetsDeps`（`execFile` L412 起 powershell vault.ps1 + `fetch` L437）+ `L395 assetsConfigFrom`；纯逻辑在 `src/assets.ts` | 每次构建（**唯一出网/起子进程的一路**） |
| **侧车快照写入**（v0.4） | `src/index.ts:570 writeFileSync(join(dshHome, 'growth-profile-assets.json'))`——包在 try/catch 内（吞错，I7） | 每次构建 |
| client 面（**已撤除槽位**） | `src/client/index.tsx:316 apply()`——L318-320 注释：原注册 `conversation.view` 的「养成档案」tab（id=growth-profile order=20）已迁入面板宿主 | 每个 web 会话（现仅保留组件代码） |
| client 取数（保留但未接线） | `src/client/index.tsx:147 fetch('/api/growth-profile', {cache:'no-store'})`，`POLL_MS = 30000`（L16/165） | 组件挂载时（当前无入口） |
| 历史面板实现 | `src/panel.ts:269 createGrowthProfilePanel`（`id:'growth-profile'` L271，order 20 L273）——**无人引用**（见 §8）；2026-09-17 随 v0.4 增补了 assets 段渲染（L56/L109-115） | 不再发生 |
| 消费方 | 爱丽丝（`growth_profile` 工具：自我呈现/养成感）、主人（面板 `dsh-panel` growth-profile 页）、面板宿主（**数字资产段读侧车快照**，其余段独立读同一批落盘） | 运行时 |
| 落盘产物 | `<DSH_HOME>/growth-profile-assets.json`（**唯一写入**，v0.4 起；数字资产段快照，供面板宿主只读）；其余五路只读不写 | 每次构建 |
| 测试 | `tests/assets.test.mjs`（7 条：vault 定宽表解析 / zones 脱敏与丢弃无名 / 精确单位折算 / `extractToken` / `usdFromChains` / **降级留痕不伪装成 0** / 全通路径）+ `tests/assets-vault-json.test.mjs`（4 条：JSON 归属不依赖列宽 / 坏输入不抛不猜 / 按内容选路并回报格式 / 表格失真回归对照）+ `tests/panel.test.mjs`（7 条，**测的是 `lib/panel.js` 历史实现**）——2026-09-22 复核实测 **18/18 绿** | 离线 `node --test "tests/*.test.mjs"` |

## 5 · 边界与信任

- 能力边界 ≠ 沙箱：本插件对**既有落盘**只读（v0.4 起另有**一份**侧车快照写入），但它读的是**主人的整个自我状态**（记忆库路径可由 config 指定）——它能展示任何被指向的文件内容窗口（`notes` 会把路径回显）。隐私风险限于「谁在同一个 DSH 会话里调它」；**v0.4 后新增两条对外面**：① 数字资产段会**出网**（链上地址 / Cloudflare zones / BTC 地址会出现在请求里——地址本身是公开信息，但「我这三个地址属于同一主体」是可关联信息）② 会**起 PowerShell 子进程**读 vault 非密元数据（**token 取来即用，绝不入输出、日志或 notes**）。
- 不越界清单（2026-09-22 复核更新）：不写既有落盘（唯一写入 = 侧车快照）、不删记忆、不改技能、不触发采集、不注册定时器、不做「该晋升/该炼化」之类的判断；出网仅限**只读**余额与域名列表（不构造交易、不写第三方、不批量）。
- 失败面：
  - **读失败**：记忆库解析失败 → `notes` 记录 + 返回空集（**放行 + 说明**，不静默、不抛）；技能/插件目录逐项 try/catch；数字资产逐路 `status='error'` + note（I6）。
  - **写失败**：侧车快照写入失败 → **静默吞掉**（不影响返回值；I7）。
  - **超时**：`buildProfile` 现为 async；本地遍历无超时（技能根/插件目录规模 = 数百目录级），**数字资产路有超时**（`fetch` 12s；`vault.ps1` 子进程 25s）——超时按该路失败降级，不拖垮整体；HTTP 侧异常统一 500 + `{error}`。
  - **降级透明**：任何降级都会在 `notes` 里留一行（含 vault 走表格降级、解析出 0 条这类**可疑信号**），调用者能看出「哪一路没读到 / 哪一路可疑」。

## 6 · 与既有机制的关系

- 与 **`dsh-panel`（面板宿主）**：本插件的 GUI 已**移交**——`dsh-panel/src/panels/growth-profile.ts` 是现行实现（id=`growth-profile`，order 30，另读 checkpoints 与 `AGENTS.md`）；本插件的 `src/panel.ts`（id 同、order 20）保留为历史实现。两处**同 id 不得同时注册**（面板宿主注册表对重复 id fail-loud）。**v0.4 起新增一条跨仓契约**：面板侧的**数字资产段**改为读本插件写出的侧车快照 `<DSH_HOME>/growth-profile-assets.json`（`panels/growth-profile.ts` L141-146）——取数口径**单一真源在本插件**，避免两处各写一份判据（§5.22 规则 4）。
- 与 **`dsh-life-core`**：`life` 段是 life-core 落盘（`state.json`/`life-log.jsonl`）的**只读投影**；本插件不推进状态机、不安排感知圈。
- 与 **`dsh-agent-memory`**：读 `agent_memory.json` 的 `tables.entries`（含归档条目标记 `archived`）；不改不写。
- 与 **§5.20 语义文档系统**：本插件此前无文档（本次补课）；面板宿主的对应条目为 `panel-host`（registry 中 impl 列了本插件 `src/panel.ts`——该落点现为历史实现，需队长统一口径）。
- 与 **§5.11 组合变更**：改 `src/index.ts` 或 client 后必须 `pnpm build`（host 用 `tsc`；client 需 `pnpm bundle` = `tsdown` + `scripts/wrap-client.mjs`），否则 web 仍跑旧构建。

**生效判据（改代码后怎么证明真的生效）**：
1. **产物比进程新**：`self-plugins/dsh-growth-profile/lib/index.js` mtime **晚于**当前 web 进程启动时刻（§5.11 进程级判据；client 面还要看 `lib/client.js`）。
2. **工具面在场**：本会话能调 `growth_profile`（`{detail:false, limit:1}` 返回含 `life` 字段的 JSON）。
3. **端点在位**：`GET http://127.0.0.1:3080/api/growth-profile` 返回 200 JSON（响应头 `cache-control: no-store`）；未挂载/`enabled=false` 时应为 404。
4. **行为可答（含降级面）**：`notes` 里出现「记忆库：E:/alice/.dsh/storages/agent_memory.json」即证明读到了真源；把 `memoryPath` 指向不存在文件后，`notes` 应出现「未找到」而不是抛错。
5. **数字资产路可答（v0.4）**：`growth_profile` 返回含 `assets`，且 `notes` **不含**「资产盘点整体失败」；`<DSH_HOME>/growth-profile-assets.json` 存在且 **mtime 前进**（每次构建重写）——这是「资产路真的跑了、侧车真的落了盘」的物证；反向判据：把某地址改空 → 该链项 `status='error'` + note，**而其余段照常**（不连坐）。

**回退**：`git revert` 最近一次提交（或 `git checkout -- src/` 丢弃未提交改动）→ `pnpm build`（+ 必要时 `pnpm bundle`）→ 预检 → 哨兵/`daemon_restart` 重启 web。
配置回退：`plugin_configure dsh-growth-profile` 还原 `{enabled, memoryPath}`（patch 整体替换，留 `.bak-<时间戳>`）。
GUI 回退：GUI 入口属面板宿主（`dsh-panel`）——若要恢复旧会话头 tab，需在 `src/client/index.tsx` 重新 register（L318 注释即恢复点），但那会与面板宿主重复入口，须先裁决。

## 7 · 可证伪验收清单

| # | 可证伪命题 | 证据（单测名/命令/日志行/HTTP） | 状态 |
|---|-----------|------------------------------|------|
| A1 | **只读边界（v0.4 收窄）**：对既有落盘零写入、无网络；唯一写入 = 侧车快照，唯一出网/子进程 = 数字资产路 | `grep -nE "writeFile\|appendFile\|mkdir\|fetch\(\|execFile" src/index.ts` → 仅 `L412 execFile` / `L437 fetch` / `L570 writeFileSync`（三处全在资产路径） | 已实测（2026-09-22 复核实测：旧判据「无命中」已因 v0.4 失效，本次按新版口径重测） |
| A2 | 工具与端点共用同一装配点 | `grep -n "buildProfile(" src/index.ts` 两处调用（工具 `execute` 与端点 handler） | 已实测（独立复核：L246 工具 + L259 端点 + L284 定义） |
| A3 | `enabled=false` ⇒ 工具与端点都不注册 | 设 `enabled:false` 重启后：工具列表无 `growth_profile`，`GET /api/growth-profile` → 404 | 待验收 |
| A4 | 记忆库缺失/坏 JSON → 降级不抛 | 临时改 `memoryPath` 指向不存在路径 → 返回 `stats.total=0` 且 `notes` 含「未找到」 | 待验收 |
| A5 | 履历/周目/关系档案的筛选判据正确 | `tests/panel.test.mjs`（同判据的面板侧 6 条）+ 手工构造带 `milestone`/`compaction`/`owner` 标签的条目后调用工具比对条数 | 待验收 |
| A6 | 生命核心缺席时 `life.exists=false` 且其余字段完整 | 把 `life-core/state.json` 改名 → 返回 `life.exists=false`、`stats`/`skills`/`plugins` 照常 | 待验收 |
| A7 | 端点响应 `cache-control: no-store`（实时快照，不吃缓存） | `curl -i http://127.0.0.1:3080/api/growth-profile` 查看响应头 | 待验收 |
| A8 | GUI 无重复入口（本插件不注册槽位） | `grep -n "conversation.view\|register(" src/client/index.tsx` 无注册语句，仅注释 | 已实测（独立复核：仅 L2/L318 注释命中） |
| A9 | **资产段降级不伪装成 0**：任一路取数失败 ⇒ 该项 `status='error'` + `notes` 一行；vault 清单走表格降级/解析出 0 条也留痕 | `node --test tests/assets.test.mjs`（7 条，含「降级要留痕：链上失败进 notes、不伪装成 0」）+ `node --test tests/assets-vault-json.test.mjs`（4 条，含「按内容选路并回报格式」） | 已实测（2026-09-22 复核实测：全套 18/18 绿） |
| A10 | **侧车快照落盘且被面板宿主消费**（数字资产取数口径单一真源） | `ls -la $DSH_HOME/growth-profile-assets.json` + `grep -n "growth-profile-assets" ../dsh-panel/src/panels/growth-profile.ts` | 已实测（2026-09-22：文件存在，mtime 2026-09-18 10:30；面板侧 L146 读同一路径） |
| A11 | 每次构建都重写侧车快照（mtime 前进，证「资产路真的跑了」） | 连续两次 `growth_profile` 调用后比对 `growth-profile-assets.json` 的 mtime | 待线上验收 |

## 8 · 与实现的关系

- 主实现：`src/index.ts`（**746 行级**，含工具、端点、四路扫描器、生命核心投影与数字资产接线）+ `src/assets.ts`（**326 行级**，数字资产纯逻辑与依赖注入；v0.4 新增）。
- 同语义副本（须互相指认）：
  - 面板语义**现行实现**在 `self-plugins/dsh-panel/src/panels/growth-profile.ts`（order 30，数据源更全：另读 checkpoints 与 `AGENTS.md`）；本插件 `src/panel.ts` 是**旧实现**（order 20，只读 profile 对象）。二者同 id ⇒ 同时注册会让面板宿主 fail-loud。
  - **数字资产段的主副本在本插件**（`src/assets.ts` + 侧车快照）：面板侧只读 `<DSH_HOME>/growth-profile-assets.json`，**不得自建第二份取数逻辑**（§5.22 规则 4，判据单一真源）。
  - 记忆库读取语义的主副本在 `dsh-agent-memory`（其 `docs/semantic.md`）；生命核心字段语义主副本在 `dsh-life-core`。
- 未实现/未验证部分（显式标注，2026-09-22 复核更新）：
  - `src/panel.ts` **已不被引用**（host `src/index.ts` L381-386 注释明示「保留为历史实现」）——但 `tests/panel.test.mjs` 仍在测它（测试覆盖的是死代码）；它**也**在 v0.4 被加上了 assets 渲染，故「死代码」现在有两份实现漂移（§10 U2）。
  - `src/client/index.tsx` 的 `GrowthProfilePanel` 组件保留但**无入口**（槽位注册已于 2026-09-13 撤除）。
  - `README` 描述含「30s 实时轮询 + 精致面板」——那属已撤除的会话 tab 入口；现行 GUI 在面板宿主。
  - 生命核心投影**未含** `lastActiveAt`/`lastSelfTurnAt`（§5.13 的存在性基线字段只在面板宿主版本里读）——本插件的 `life` 段看不到「在场证据」。
  - 数字资产路的**真实网络/子进程**只在线上跑过（2026-09-18 侧车落盘为旁证），**离线单测覆盖的是纯解析与降级分支**（依赖是注入的假实现）——真实端点可用性（RPC 限流、Cloudflare token 过期、vault 脚本路径）无常驻判据。

## 9 · 实践修订记录

- **2026-09-14 补课：本插件此前无语义文档（可维护性工程）**
  - 语义**被确认**：被动哲学（零采集/零写入/零自动触发）、五路只读数据源、工具与端点同源、`enabled` 是真开关（早退）。
  - 语义**被补充**：① `life-log.jsonl` 的 `kind` 会经 `LIFE_KIND_LABEL` 转中文（10 类）；② 技能扫描的**四静态根**与 user/project 作用域归属；③ `cwd` 的来源差异（工具用会话 cwd，HTTP 用进程 cwd）。
  - 语义**被修正**：无（首次成文）；但明确记录一处**语义漂移**：README 宣传的「30s 实时轮询 + 精致面板」属已撤除的会话 tab 入口，现行 GUI 在面板宿主——文档与代码的 GUI 归属需要一次对齐。
  - 教训：**「保留但未接线」的代码必须在文档里标注状态**（`panel.ts` + client 组件）——否则后来者（含压缩后的我）会把有单测覆盖的 `panel.ts` 当作现行实现，而真正的 GUI 在另一个仓库里。
- **2026-09-22 复核回写（语义 drift D3 复核：doc 停在 0.3.1，实现已到 0.4.0）**
  - **判据（先取证再落笔，不是 touch 消警）**：本条目 impl 最后写入 2026-09-17 13:04（`9b24f88`），doc 最后提交 2026-09-14 10:36（`8b19ae4`）⇒ doc **早于 impl 三日**。`git log --since='2026-09-14 10:36' -- src/index.ts` 得两条**语义性**提交：`268118f`（feat v0.4.0 **数字资产段**：新增 `src/assets.ts` 246 行 + `src/index.ts` +203 + `src/panel.ts` +78 + 两个测试）、`9b24f88`（fix v0.4.0：vault 改**结构化取数** `list-json` + BTC **多端点回退**）；另有 `c466840` 仅重建 `lib/`。
  - 语义**被修正**（本次最重要的三处，都是**否定性断言滞后**）：① §0/§1 旧断言「**外部依赖：无网络/无子进程**」「零采集、零落盘」⇒ v0.4 起**破**：新增出网（链上/Cloudflare 只读）+ `powershell.exe` 子进程（vault）+ **一份侧车快照写入** ② **I1「零写入零网络」** 重写为「只读边界（既有落盘只读 + 侧车快照是唯一写入 + 出网仅资产路）」 ③ 版本 0.3.1 → 0.4.0、数据源「五路」→ **六路**、`buildProfile` 由同步 → **async**。
  - 语义**被补充**：① 新不变量 **I6 资产段降级要留痕**（`status='error'` + notes，**不伪装成 0**）与 **I7 侧车写入不反噬**（try/catch 吞错）② 配置表补 7 个字段（`vaultScript`/三地址/三目录）+ 记「`cloudflareVaultSite` 不可配」③ §4.2 新增数字资产源（含 BTC 三端点回退、vault 表格降级留痕）④ **跨仓契约**：面板宿主数字资产段改读侧车快照（口径单一真源）⑤ 新增验收 A9/A10/A11（A9/A10 已于 2026-09-22 复核实测：`node --test tests/*.test.mjs` = **18/18 绿**；A11 待线上验收）。
  - 教训：**「未实现清单」与「反定位」里的否定性断言是 drift 的高发区**——补课文档写「无网络/无子进程/零写入」时是真的，三天后 v0.4 让它全部失效；而 D3 的 mtime 判据只告诉你「变了」，**不会告诉你变的是哪一句**。⇒ 改代码后应主动 grep 文档里的「无 / 不 / 零 / 待 / 未」类断言复核，而不是等 drift 告警。

## 10 · 未决问题

- **U1 死代码去向**：`src/panel.ts`（含 7 条单测）保留为历史实现，还是随 GUI 归一删除（并把测试迁到面板宿主的实现上）？倾向：**测试迁到 `dsh-panel` 侧**，本插件删 `panel.ts`——否则测试保护的是不再运行的语义。⚠ **2026-09-17 这条更尴尬了**：v0.4 给死代码 `panel.ts` 也加了 assets 渲染（+78 行）——**没人引用的实现被同步维护**，成本与漂移面都在扩大。
- **U2 双实现漂移**：面板宿主版本另读 `checkpoints`/`AGENTS.md` 且含 `lastActiveAt`，本插件版本没有——两套「养成档案」判据并存违反单一真源。倾向：把面板宿主版本定为主副本，本插件只保留端点与工具。⚠ **2026-09-22 部分缓解**：数字资产段的取数口径已**归一**到本插件（面板侧只读侧车快照），但其余段仍是两套读法。
- **U3 `life` 段缺在场证据**：是否把 `lastActiveAt`/`lastSelfTurnAt`（§5.13 的存在性基线）补进本插件的 `life` 投影？（倾向：补，字段判据以 `dsh-life-core` 文档为准）
- **U4 `toolCount` 口径**：`ctx.tools.list()` 是**全局视图**还是本会话可见集？`dsh-agent-toolface` 已实测过同类口径歧义（收窄后 `schemas()` 仍报全局数）。倾向：在该字段旁显式标注口径，避免与工具面分档数字比较。
- **U5 `enabled=false` 时的端点**：现在直接不注册（404）。是否需要 200 + 说明「养成档案已禁用」？（倾向：保持 404——不注册是更诚实的语义）
- **U6（2026-09-22 新增）资产段的默认值写死在源码**：`DEFAULT_VAULT_SCRIPT`（`E:\alice\projects\self\alice-identity\scripts\vault.ps1`）、三个链上地址、`pluginsDir`/`checkpointsDir`（`E:\alice\...`）、`cloudflareVaultSite` 全是硬编码常量（`src/assets.ts` L66-77 / `src/index.ts:392`）。这与「配置即契约」（§4.1 表把 `vaultScript` 等列为可配项）形成**双真源**——是否把默认值也提到 profile config（本插件挂载行目前**无 config**，见 §0 表）？另：资产段**无缓存**，每次构建都出网（含 3 个链端点 + mempool 三候选 + Cloudflare），是否需要一个 TTL 快照以免被公共 RPC 限流？
