import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-growth-profile client：养成档案面板（conversation.view tab，轨迹旁）
 *
 * - 数据源：GET /api/growth-profile（host webServer 端点；no-store 实时快照）
 * - 形态：属性面板卡片 + 此刻的我（生命核心）+ 周目 + 里程碑 + 关系档案
 * - v0.3（2026-08-19 主人定调）：实时更新（30s 轮询 + in-flight guard + 失败保留快照）+ UI 美化（分区卡片/状态徽章/时间线样式）
 * - 被动哲学：只读展示；决策归爱丽丝
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
export const inject = ['slots'];
/** 轮询间隔（ms）：记忆/插件/生命状态分钟级变化，30s 足够实时又不吵 */
const POLL_MS = 30000;
/** 生命状态 → 徽章颜色 */
const STATUS_COLOR = {
    清醒: '#2ecc71',
    活跃: '#2ecc71',
    专注: '#4a7dff',
    疲劳: '#f39c12',
    睡眠: '#a0a0a8',
};
/** 生命轨迹 kind → 徽章颜色 */
const KIND_COLOR = {
    对话: '#9a9aa2',
    自我感知: '#9b59b6',
    入睡: '#6b7b8c',
    醒来: '#2ecc71',
    压缩存档: '#f39c12',
    进化: '#d4a017',
    记忆沉淀: '#16a085',
    自我改写: '#e84393',
    守护重启: '#e74c3c',
    状态: '#4a7dff',
};
/**
 * 主题色板：官方 --dsw-alias-* 变量（挂在 body，随 DSH 浅/深主题自动切换）+
 * 暗色 fallback（2026-08-19 修复：此前用 --dsw-surface-* 不存在 → 浅色 fallback → 暗色界面白块）
 * accent 用固定品牌蓝：--dsw-alias-brand-primary 在暗色下是白色，不可作强调色
 */
const C = {
    surface1: 'var(--dsw-alias-bg-layer-1, #232324)',
    surface2: 'var(--dsw-alias-bg-layer-2, #2c2c2e)',
    surface3: 'var(--dsw-alias-bg-module-platform, #353638)',
    text: 'var(--dsw-alias-label-primary, #f9fafb)',
    text2: 'var(--dsw-alias-label-secondary, #cfd3d6)',
    border: 'var(--dsw-alias-border-l2, rgba(255,255,255,0.12))',
    accent: '#4a7dff',
    success: 'var(--dsw-alias-state-success-primary, #22c55e)',
    danger: 'var(--dsw-alias-state-error-primary, #f25a5a)',
};
function fmtDate(iso) {
    if (iso === '')
        return '';
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return iso.slice(0, 10);
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
function fmtTime(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
/** 分区容器：卡片化区块 */
function Section({ title, extra, children }) {
    return (_jsxs("div", { style: { background: C.surface1, border: '1px solid ' + C.border, borderRadius: 12, padding: '12px 14px', marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.28)' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 600, color: C.text2, letterSpacing: 0.02 }, children: title }), extra !== undefined && _jsx("span", { style: { fontSize: 11, color: C.text2 }, children: extra })] }), children] }));
}
/** 属性卡片：渐变强调条 + 大数字 */
function Card({ title, value, sub, accent = C.accent }) {
    return (_jsxs("div", { style: { background: C.surface2, borderRadius: 10, padding: '10px 12px 8px', minWidth: 0, position: 'relative', overflow: 'hidden' }, children: [_jsx("div", { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, ' + accent + ', transparent)' } }), _jsx("div", { style: { fontSize: 11, color: C.text2, marginBottom: 3 }, children: title }), _jsx("div", { style: { fontSize: 24, fontWeight: 700, lineHeight: 1.15, letterSpacing: -0.01 }, children: value }), sub !== undefined && (_jsx("div", { style: { fontSize: 11, color: C.text2, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: sub }))] }));
}
/** 生命状态徽章 */
function LifeBadge({ status }) {
    const color = STATUS_COLOR[status] ?? C.accent;
    return (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '2px 9px', borderRadius: 999, background: color + '1a', color, fontWeight: 600 }, children: [_jsx("span", { style: { width: 6, height: 6, borderRadius: '50%', background: color } }), status] }));
}
/** 轨迹 kind 徽章 */
function KindBadge({ kind }) {
    const color = KIND_COLOR[kind] ?? C.text2;
    return (_jsx("span", { style: { display: 'inline-block', fontSize: 10, padding: '1px 6px', borderRadius: 4, background: color + '14', color, marginRight: 6, flexShrink: 0 }, children: kind }));
}
function GrowthProfilePanel() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const inFlight = useRef(false);
    const mounted = useRef(true);
    const load = useCallback(async () => {
        if (inFlight.current)
            return;
        inFlight.current = true;
        try {
            const res = await fetch('/api/growth-profile', { cache: 'no-store' });
            if (!res.ok)
                throw new Error('HTTP ' + res.status);
            const json = (await res.json());
            if (mounted.current) {
                setData(json);
                setError(null);
            }
        }
        catch (e) {
            // 失败保留最后快照（实时更新不因单次抖动而白屏）
            if (mounted.current)
                setError(String(e));
        }
        finally {
            inFlight.current = false;
        }
    }, []);
    useEffect(() => {
        mounted.current = true;
        void load();
        const timer = setInterval(() => void load(), POLL_MS);
        return () => {
            mounted.current = false;
            clearInterval(timer);
        };
    }, [load]);
    const sortedMilestones = useMemo(() => {
        if (data === null)
            return [];
        return [...data.milestones].sort((a, b) => (a.date < b.date ? 1 : -1));
    }, [data]);
    if (error !== null && data === null) {
        return _jsxs("div", { style: { padding: 24, color: C.danger }, children: ["\u517B\u6210\u6863\u6848\u52A0\u8F7D\u5931\u8D25\uFF1A", error] });
    }
    if (data === null) {
        return _jsx("div", { style: { padding: 24, color: C.text2 }, children: "\u517B\u6210\u6863\u6848\u52A0\u8F7D\u4E2D\u2026" });
    }
    const { stats, skills, plugins } = data;
    const life = data.life?.exists === true ? data.life : undefined;
    return (_jsxs("div", { style: { padding: '14px 18px', overflowY: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8 }, children: [_jsx("span", { style: { fontSize: 16, fontWeight: 700, letterSpacing: -0.01 }, children: "\u517B\u6210\u6863\u6848" }), _jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.success, fontWeight: 600 }, children: [_jsx("span", { style: { width: 7, height: 7, borderRadius: '50%', background: C.success, boxShadow: '0 0 5px rgba(34,197,94,0.55)' } }), "\u5B9E\u65F6"] })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsxs("span", { style: { fontSize: 11, color: C.text2 }, children: ["\u66F4\u65B0\u4E8E ", fmtTime(data.generatedAt)] }), _jsx("button", { type: "button", onClick: () => void load(), style: { fontSize: 11, padding: '2px 10px', borderRadius: 6, border: '1px solid ' + C.border, background: C.surface2, color: C.text, cursor: 'pointer' }, children: "\u5237\u65B0" })] })] }), error !== null && (_jsxs("div", { style: { fontSize: 11, color: C.danger, marginBottom: 8, background: 'rgba(242,90,90,0.08)', padding: '4px 10px', borderRadius: 6 }, children: ["\u5237\u65B0\u5931\u8D25\uFF08\u4FDD\u7559\u4E0A\u6B21\u5FEB\u7167\uFF09\uFF1A", error.length > 80 ? error.slice(0, 80) + '…' : error] })), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: 8, marginBottom: 12 }, children: [_jsx(Card, { title: "\u8BB0\u5FC6", value: stats.total, sub: 'fact ' + stats.byKind.fact + ' · knowledge ' + stats.byKind.knowledge + ' · episodic ' + stats.byKind.episodic, accent: "#4a7dff" }), _jsx(Card, { title: "\u5F52\u6863", value: stats.archived, sub: "\u51B7\u5F52\u6863\u53EF\u6DF1\u6316", accent: "#8e8e93" }), _jsx(Card, { title: "\u6280\u80FD", value: skills.length, sub: skills.map((s) => s.name.replace(/^dsh-/, '')).join(' · ') || '-', accent: "#9b59b6" }), _jsx(Card, { title: "\u81EA\u7814\u63D2\u4EF6", value: plugins.length, sub: (data.toolCount !== undefined ? String(data.toolCount) : '?') + ' 工具在面', accent: "#16a085" }), life !== undefined && (_jsx(Card, { title: "\u5B58\u5728", value: String(life.bornDays ?? 0) + ' 天', sub: '今日 ' + (life.todayTurns ?? 0) + ' 圈 · ' + (life.cycleMinutes ?? '-') + ' 分/呼吸', accent: "#e84393" }))] }), life !== undefined && (_jsxs(Section, { title: '此刻的我 · ' + (life.self?.role ?? ''), extra: life.cycleMinutes !== undefined ? '每 ' + life.cycleMinutes + ' 分钟呼吸' : undefined, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }, children: [_jsx(LifeBadge, { status: life.status ?? '—' }), (life.self?.concerns ?? []).length > 0 && (_jsxs("span", { style: { fontSize: 11, color: C.text2 }, children: ["\u7275\u6302\uFF1A", (life.self?.concerns ?? []).slice(0, 3).map((c, i) => (_jsx("span", { style: { marginRight: 5, padding: '1px 7px', borderRadius: 999, background: C.surface3, color: C.text2 }, children: c }, c)))] }))] }), _jsx("div", { style: { fontSize: 13, lineHeight: 1.55, borderLeft: '3px solid ' + C.accent, background: C.surface2, borderRadius: '0 8px 8px 0', padding: '8px 12px', marginBottom: 8, color: C.text }, children: life.self?.creed ?? '' }), life.recent.length > 0 && (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 3 }, children: life.recent.slice(0, 5).map((r, i) => (_jsxs("div", { style: { display: 'flex', alignItems: 'center', fontSize: 11, color: C.text2, lineHeight: 1.5, minWidth: 0 }, title: r.summary, children: [_jsx(KindBadge, { kind: r.kind }), _jsx("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }, children: r.summary.length > 52 ? r.summary.slice(0, 52) + '…' : r.summary }), _jsx("span", { style: { marginLeft: 8, flexShrink: 0, fontSize: 10, color: C.text2 }, children: fmtDate(r.at) })] }, r.at + i))) }))] })), _jsx(Section, { title: '周目 · ' + data.cycles.length + ' 次压缩存档', extra: "\u5468\u76EE\u7EE7\u627F\uFF0C\u6838\u5FC3\u8EAB\u4EFD\u4FDD\u7559", children: data.cycles.length === 0 ? (_jsx("div", { style: { fontSize: 11, color: C.text2 }, children: "\u5C1A\u65E0\u538B\u7F29\u5B58\u6863" })) : (_jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: data.cycles.slice(0, 12).map((c, i) => (_jsxs("span", { title: c.title, style: { fontSize: 11, padding: '3px 10px', borderRadius: 999, background: C.surface3, color: C.text2, display: 'inline-flex', alignItems: 'center', gap: 5 }, children: [_jsx("span", { style: { color: C.accent, fontWeight: 700 }, children: data.cycles.length - i }), fmtDate(c.date)] }, c.date))) })) }), _jsx(Section, { title: '履历 · ' + data.milestones.length + ' 个里程碑', children: sortedMilestones.length === 0 ? (_jsx("div", { style: { fontSize: 11, color: C.text2 }, children: "\u5C1A\u65E0\u91CC\u7A0B\u7891" })) : (_jsx("div", { style: { borderLeft: '2px solid ' + C.border, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 9 }, children: sortedMilestones.slice(0, 10).map((m, i) => (_jsxs("div", { style: { position: 'relative' }, children: [_jsx("span", { style: { position: 'absolute', left: -19, top: 4, width: 10, height: 10, borderRadius: '50%', background: C.accent, boxShadow: '0 0 0 3px ' + C.accent + '22' } }), _jsx("div", { style: { fontSize: 11, color: C.text2, marginBottom: 1 }, children: fmtDate(m.date) }), _jsx("div", { style: { fontSize: 13, lineHeight: 1.4, color: C.text }, title: m.title, children: m.title.length > 88 ? m.title.slice(0, 88) + '…' : m.title })] }, m.date + i))) })) }), _jsx(Section, { title: '关系档案 · ' + data.ownerFeed.length + ' 条主人反馈', children: data.ownerFeed.length === 0 ? (_jsx("div", { style: { fontSize: 11, color: C.text2 }, children: "\u5C1A\u65E0\u4E3B\u4EBA\u53CD\u9988\u8BB0\u5F55" })) : (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 5 }, children: data.ownerFeed.slice(0, 8).map((o, i) => (_jsxs("div", { style: { fontSize: 12, lineHeight: 1.4, display: 'flex', alignItems: 'baseline', gap: 8 }, title: o.title, children: [_jsx("span", { style: { fontSize: 10, color: C.text2, background: C.surface3, padding: '1px 7px', borderRadius: 999, flexShrink: 0 }, children: fmtDate(o.date) }), _jsx("span", { style: { color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: o.title.length > 64 ? o.title.slice(0, 64) + '…' : o.title })] }, o.date + i))) })) })] }));
}
export function apply(ctx) {
    // 2026-09-13 撤除 GUI 槽位（主人定调：GUI 只留 1 个入口——面板宿主的「面板」按钮）：
    // 原此处注册 `conversation.view` 的「养成档案」tab（id=growth-profile order=20）。
    // 养成档案已迁为面板宿主里的一页（dsh-panel `panels/growth-profile.ts`，id=growth-profile order=30）。
    // 保留本文件其余部分（GrowthProfilePanel 组件与取数逻辑）以便需要时恢复入口。
    void ctx;
}
