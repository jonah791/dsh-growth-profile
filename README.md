<!--
  DSH 插件生态公约声明（plugin-ecosystem-convention · 组合优先/声明清晰/兼容优先）
  purpose: 养成档案：聚合当前状态/技能/里程碑/周目/主人反馈/生命核心为自我呈现视图（30s 实时轮询 + 精致面板；只读，被动哲学）
  inject: 'tools','webServer'
  tools: growth_profile
  runtime: host-only
  envDeps: 无（纯逻辑/标准 Node）
  boundary: 无特殊授权边界
  compat: cordis ^4.0.1 / dsh-tools ^0.1.0-rc.6
-->
# dsh-growth-profile — 养成档案插件


<p align="center">
  <a href="https://github.com/jonah791/dsh-growth-profile"><img src="https://img.shields.io/badge/version-0.3.0-blue" alt="version"></a>
  <img src="https://img.shields.io/badge/License-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/TypeScript-3178C6" alt="TypeScript">
</p>
DSH（DeepSeek Harness）插件：agent 的自我呈现视图——记忆/技能/插件/履历/关系档案聚合为「养成档案」，前端面板 tab 展示，提供 /api/growth-profile 接口。

## 功能特性

- **自我呈现**：聚合当前状态（记忆/技能/插件/工具面）+ 履历里程碑 + 周目存档 + 关系档案
- **此刻的我（v0.2）**：接入生命核心（dsh-life-core）——存在天数 / 生命状态 / 今日圈数 / 感知周期 / 自我模型（角色·关系·宣言·牵挂·价值权重）/ 最近生命轨迹（life-log 实时尾部）
- **实时更新（v0.3）**：30s 轮询 + in-flight guard + 失败保留最后快照（不白屏）+ 手动刷新按钮 + 实时状态点
- **精致面板（v0.3）**：分区卡片化布局、生命状态徽章（清醒/活跃/专注/疲劳/睡眠 色彩映射）、轨迹 kind 彩色徽章、宣言引用块、周目编号胶囊、里程碑发光圆点时间线
- **前端面板**：「养成档案」tab 挂载在对话界面（对话 | 轨迹 | 养成档案）
- **API**：`/api/growth-profile` 供外部读取

## 数据源

| 段 | 来源 | 缺失时 |
|----|------|--------|
| 记忆/里程碑/周目/关系档案 | DSH_HOME/storages/agent_memory.json | 空数组 + note |
| 技能 | DSH_HOME/skills + ~/.agents/skills + 项目 .dsh/.agents/skills | 空数组 + note |
| 插件 | <workspace>/self-plugins/*/package.json | 空数组 + note |
| 此刻的我（v0.2） | DSH_HOME/life-core/state.json + life-log.jsonl | exists:false + note（面板隐藏该段） |

## 安装

```bash
cd <你的 self-plugins 目录>
git clone https://github.com/jonah791/dsh-growth-profile.git
cd dsh-growth-profile
pnpm install
pnpm build
```

## 使用

- 前端：打开对话界面 → 「养成档案」tab
- API：`GET /api/growth-profile`

## 相关

- [我的数字生命爱丽丝 — 插件生态中心（架构总览）](https://github.com/jonah791/alice-digital-life)

## License

MIT
