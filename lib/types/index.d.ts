/**
 * dsh-growth-profile：养成档案——把「我在长」变成可观测的自我呈现
 *
 * 设计定调（2026-08-16 主人框架「养成类游戏机制 = 主体性发育的模拟器」落地）：
 * - **属性面板** → 当前状态聚合（记忆/技能/插件/工具面计数）
 * - **履历** → milestone 记忆条目（成长节点时间线）
 * - **周目** → checkpoint 存档条目（压缩 = 周目继承，核心身份保留）
 * - **关系档案** → 主人反馈条目（羁绊记忆：定调/纠正/偏好）
 * - **被动哲学**：只读视图、零采集、零自动触发——想看时调用（爱丽丝或主人）；所有数据来自既有落盘（记忆库/技能目录/self-plugins），零冗余
 * - **数据源防御**：路径缺失/解析失败 → 空数组 + note，不抛错（只读工具永不 crash）
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "agent-growth-profile";
export declare const inject: readonly ["tools", "webServer"];
export interface Config {
    enabled: boolean;
    memoryPath?: string;
}
export declare const Config: z<Schemastery.ObjectS<{
    enabled: z<boolean, boolean>;
    memoryPath: z<string, string>;
}>, Schemastery.ObjectT<{
    enabled: z<boolean, boolean>;
    memoryPath: z<string, string>;
}>>;
export declare function apply(ctx: Context, config: Config): void;
