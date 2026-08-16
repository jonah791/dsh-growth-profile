window.__ModuleLoader__.load({
	id: 'dsh-growth-profile',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/client/index.tsx
/**
* dsh-growth-profile client：养成档案面板（conversation.view tab，轨迹旁）
*
* - 数据源：GET /api/growth-profile（host webServer 端点；no-store 实时快照）
* - 形态：属性面板卡片 + 里程碑时间线 + 周目 + 关系档案（主人反馈）
* - 被动哲学：只读展示；轮询 no-store + in-flight guard + unmount 防护，失败保留最后快照
*/
const inject = ["slots"];
function fmtDate(iso) {
	if (iso === "") return "";
	const d = new Date(iso);
	if (isNaN(d.getTime())) return iso.slice(0, 10);
	return d.toLocaleDateString("zh-CN", {
		month: "numeric",
		day: "numeric"
	});
}
function Card({ title, value, sub }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			background: "var(--dsw-surface-2, #f5f5f7)",
			borderRadius: 8,
			padding: "10px 12px",
			minWidth: 0
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					fontSize: 12,
					color: "var(--dsw-text-secondary, #8a8a93)",
					marginBottom: 2
				},
				children: title
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					fontSize: 22,
					fontWeight: 600,
					lineHeight: 1.2
				},
				children: value
			}),
			sub !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					fontSize: 11,
					color: "var(--dsw-text-secondary, #8a8a93)",
					marginTop: 2,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				},
				children: sub
			})
		]
	});
}
function GrowthProfilePanel() {
	const [data, setData] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	(0, react.useEffect)(() => {
		let alive = true;
		const load = async () => {
			try {
				const res = await fetch("/api/growth-profile", { cache: "no-store" });
				if (!res.ok) throw new Error("HTTP " + res.status);
				const json = await res.json();
				if (alive) {
					setData(json);
					setError(null);
				}
			} catch (e) {
				if (alive) setError(String(e));
			}
		};
		load();
		return () => {
			alive = false;
		};
	}, []);
	const sortedMilestones = (0, react.useMemo)(() => {
		if (data === null) return [];
		return [...data.milestones].sort((a, b) => a.date < b.date ? 1 : -1);
	}, [data]);
	if (error !== null && data === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			padding: 24,
			color: "var(--dsw-text-danger, #c0392b)"
		},
		children: ["养成档案加载失败：", error]
	});
	if (data === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: {
			padding: 24,
			color: "var(--dsw-text-secondary, #8a8a93)"
		},
		children: "养成档案加载中…"
	});
	const { stats, skills, plugins } = data;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			padding: "16px 20px",
			overflowY: "auto",
			height: "100%",
			boxSizing: "border-box",
			fontFamily: "inherit"
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "baseline",
					gap: 8,
					marginBottom: 12
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						fontSize: 16,
						fontWeight: 600
					},
					children: "养成档案"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: {
						fontSize: 11,
						color: "var(--dsw-text-secondary, #8a8a93)"
					},
					children: ["更新于 ", new Date(data.generatedAt).toLocaleTimeString("zh-CN")]
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
					gap: 8,
					marginBottom: 16
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
						title: "记忆",
						value: stats.total,
						sub: "fact " + stats.byKind.fact + " · knowledge " + stats.byKind.knowledge + " · episodic " + stats.byKind.episodic
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
						title: "归档",
						value: stats.archived,
						sub: "冷归档可深挖"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
						title: "技能",
						value: skills.length,
						sub: skills.map((s) => s.name.replace(/^dsh-/, "")).join(" · ") || "-"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
						title: "自研插件",
						value: plugins.length,
						sub: (data.toolCount !== void 0 ? String(data.toolCount) : "?") + " 工具在面"
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: { marginBottom: 16 },
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						fontSize: 12,
						fontWeight: 600,
						color: "var(--dsw-text-secondary, #8a8a93)",
						marginBottom: 6
					},
					children: [
						"周目 · ",
						data.cycles.length,
						" 次压缩存档（周目继承，核心身份保留）"
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						display: "flex",
						flexWrap: "wrap",
						gap: 4
					},
					children: data.cycles.slice(0, 12).map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						title: c.title,
						style: {
							fontSize: 11,
							padding: "2px 8px",
							borderRadius: 999,
							background: "var(--dsw-surface-3, #ececef)",
							color: "var(--dsw-text-secondary, #8a8a93)"
						},
						children: fmtDate(c.date)
					}, c.date))
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: { marginBottom: 16 },
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						fontSize: 12,
						fontWeight: 600,
						color: "var(--dsw-text-secondary, #8a8a93)",
						marginBottom: 8
					},
					children: [
						"履历 · ",
						data.milestones.length,
						" 个里程碑"
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						borderLeft: "2px solid var(--dsw-border, #e0e0e4)",
						paddingLeft: 12,
						display: "flex",
						flexDirection: "column",
						gap: 8
					},
					children: sortedMilestones.slice(0, 10).map((m, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { position: "relative" },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
								position: "absolute",
								left: -17,
								top: 5,
								width: 8,
								height: 8,
								borderRadius: "50%",
								background: "var(--dsw-accent, #4a7dff)"
							} }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									fontSize: 11,
									color: "var(--dsw-text-secondary, #8a8a93)"
								},
								children: fmtDate(m.date)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									fontSize: 13,
									lineHeight: 1.35
								},
								title: m.title,
								children: m.title.length > 80 ? m.title.slice(0, 80) + "..." : m.title
							})
						]
					}, m.date + i))
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					fontSize: 12,
					fontWeight: 600,
					color: "var(--dsw-text-secondary, #8a8a93)",
					marginBottom: 6
				},
				children: [
					"关系档案 · ",
					data.ownerFeed.length,
					" 条主人反馈"
				]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 4
				},
				children: data.ownerFeed.slice(0, 8).map((o, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						fontSize: 12,
						lineHeight: 1.3
					},
					title: o.title,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: "var(--dsw-text-secondary, #8a8a93)",
							marginRight: 6
						},
						children: fmtDate(o.date)
					}), o.title.length > 60 ? o.title.slice(0, 60) + "..." : o.title]
				}, o.date + i))
			})] })
		]
	});
}
function apply(ctx) {
	ctx.slots.inject("conversation.view", () => ctx.slots.register({
		name: "conversation.view",
		id: "growth-profile",
		order: 20,
		label: () => "养成档案"
	}, GrowthProfilePanel));
}
//#endregion
exports.apply = apply;
exports.inject = inject;

		return module.exports;
	}
});
