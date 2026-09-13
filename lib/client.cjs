Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
require("react");
require("react/jsx-runtime");
//#region src/client/index.tsx
/**
* dsh-growth-profile client：养成档案面板（conversation.view tab，轨迹旁）
*
* - 数据源：GET /api/growth-profile（host webServer 端点；no-store 实时快照）
* - 形态：属性面板卡片 + 此刻的我（生命核心）+ 周目 + 里程碑 + 关系档案
* - v0.3（2026-08-19 主人定调）：实时更新（30s 轮询 + in-flight guard + 失败保留快照）+ UI 美化（分区卡片/状态徽章/时间线样式）
* - 被动哲学：只读展示；决策归爱丽丝
*/
const inject = ["slots"];
function apply(ctx) {}
//#endregion
exports.apply = apply;
exports.inject = inject;
