# dsh-growth-profile — 养成档案插件

DSH（DeepSeek Harness）插件：agent 的自我呈现视图——记忆/技能/插件/履历/关系档案聚合为「养成档案」，前端面板 tab 展示，提供 /api/growth-profile 接口。

## 功能特性

- **自我呈现**：聚合当前状态（记忆/技能/插件/工具面）+ 履历里程碑 + 周目存档 + 关系档案
- **前端面板**：「养成档案」tab 挂载在对话界面（对话 | 轨迹 | 养成档案）
- **API**：`/api/growth-profile` 供外部读取

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

## License

MIT
