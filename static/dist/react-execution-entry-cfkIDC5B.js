import { a as e, i as t, n, o as r, r as i, t as a } from "./jsx-runtime-B18keJCK.js";
//#region src/canvas/stores/activity-store.ts
var o = {
	costs: {
		calls: 0,
		estimated: 0,
		image: 0,
		total: 0,
		unknown: 0,
		video: 0
	},
	logs: [],
	mode: "logs"
};
function s(t) {
	let n = l(t) ? d(t) : d(o);
	return e()((e) => ({
		snapshot: n,
		projectActivity: (t) => e({ snapshot: d(t) })
	}));
}
function c(e, t) {
	let n = (e) => {
		let n = e.detail;
		l(n) && t.getState().projectActivity(n);
	};
	return e.addEventListener("canvas-legacy-activity", n), () => e.removeEventListener("canvas-legacy-activity", n);
}
function l(e) {
	if (!e || typeof e != "object") return !1;
	let t = e, n = t.costs;
	return (t.mode === "cost" || t.mode === "logs") && Array.isArray(t.logs) && t.logs.every(u) && !!n && [
		"calls",
		"estimated",
		"image",
		"total",
		"unknown",
		"video"
	].every((e) => Number.isFinite(Number(n?.[e])));
}
function u(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return (t.status === "failed" || t.status === "success") && (t.costMicros === null || Number.isFinite(t.costMicros)) && [
		"costSource",
		"error",
		"id",
		"model",
		"platform",
		"prompt"
	].every((e) => typeof t[e] == "string") && [
		"createdAt",
		"outputCount",
		"runMs"
	].every((e) => Number.isFinite(t[e]));
}
function d(e) {
	return {
		costs: { ...e.costs },
		logs: e.logs.map((e) => ({ ...e })),
		mode: e.mode
	};
}
//#endregion
//#region src/canvas/stores/execution-store.ts
function f() {
	return e()((e) => ({
		runs: {},
		project: (t) => e(({ runs: e }) => ({ runs: {
			...e,
			[t.targetId]: h(t)
		} }))
	}));
}
function p(e, t) {
	let n = (e) => {
		let n = e.detail?.state;
		m(n) && t.getState().project(n);
	};
	return e.addEventListener("canvas-modern-execution", n), () => e.removeEventListener("canvas-modern-execution", n);
}
function m(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return typeof t.targetId == "string" && typeof t.status == "string" && Array.isArray(t.order) && Array.isArray(t.completedNodeIds) && !!(t.rounds && typeof t.rounds == "object");
}
function h(e) {
	return {
		...e,
		completedNodeIds: [...e.completedNodeIds],
		order: [...e.order],
		rounds: Object.fromEntries(Object.entries(e.rounds).map(([e, t]) => [e, {
			...t,
			completedNodeIds: [...t.completedNodeIds]
		}]))
	};
}
//#endregion
//#region src/canvas/stores/session-store.ts
function g(t = {
	kind: "info",
	text: ""
}) {
	return e()((e) => ({
		status: { ...t },
		projectStatus: (t) => e({ status: { ...t } })
	}));
}
function _(e, t) {
	let n = (e) => {
		let n = e.detail;
		v(n) && t.getState().projectStatus(n);
	};
	return e.addEventListener("canvas-legacy-status", n), () => e.removeEventListener("canvas-legacy-status", n);
}
function v(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return typeof t.text == "string" && [
		"error",
		"info",
		"pending",
		"success"
	].includes(String(t.kind));
}
//#endregion
//#region src/canvas/ui/canvas-activity-island.tsx
var y = r(), b = a();
function x(e, t, n, r) {
	let i = (0, y.createRoot)(e);
	return i.render(/* @__PURE__ */ (0, b.jsx)(C, {
		activityStore: t,
		close: r,
		documentStore: n
	})), i;
}
function S(e) {
	return `¥${new Intl.NumberFormat("zh-CN", {
		maximumFractionDigits: 6,
		minimumFractionDigits: 2
	}).format(e / 1e6)}`;
}
function C({ activityStore: e, close: n, documentStore: r }) {
	let { costs: i, logs: a, mode: o } = t(e, ({ snapshot: e }) => e), s = t(r, ({ document: e }) => String(e?.title || "当前画布"));
	return /* @__PURE__ */ (0, b.jsxs)("section", {
		className: `log-panel${o === "cost" ? " cost-mode" : ""}`,
		"data-testid": "canvas-activity-island",
		onClick: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, b.jsxs)("header", {
				className: "log-head",
				children: [/* @__PURE__ */ (0, b.jsxs)("div", { children: [/* @__PURE__ */ (0, b.jsx)("div", {
					className: "log-title",
					children: o === "cost" ? "费用仪表盘" : "生成日志"
				}), /* @__PURE__ */ (0, b.jsxs)("div", {
					className: "log-cost-summary",
					children: [
						s,
						" · 总计 ",
						S(i.total)
					]
				})] }), /* @__PURE__ */ (0, b.jsx)("button", {
					"aria-label": "关闭日志",
					className: "preview-icon-btn",
					onClick: n,
					type: "button",
					children: "×"
				})]
			}),
			/* @__PURE__ */ (0, b.jsxs)("div", {
				className: "cost-dashboard",
				"aria-live": "polite",
				children: [
					/* @__PURE__ */ (0, b.jsxs)("div", {
						className: "cost-card cost-card-total",
						children: [
							/* @__PURE__ */ (0, b.jsx)("span", { children: "预估总费用" }),
							/* @__PURE__ */ (0, b.jsx)("strong", { children: S(i.total) }),
							/* @__PURE__ */ (0, b.jsx)("small", { children: i.estimated ? `含预估 ${S(i.estimated)}` : "按调用时价格统计" })
						]
					}),
					/* @__PURE__ */ (0, b.jsxs)("div", {
						className: "cost-card",
						children: [/* @__PURE__ */ (0, b.jsx)("span", { children: "图片费用" }), /* @__PURE__ */ (0, b.jsx)("strong", { children: S(i.image) })]
					}),
					/* @__PURE__ */ (0, b.jsxs)("div", {
						className: "cost-card",
						children: [/* @__PURE__ */ (0, b.jsx)("span", { children: "视频费用" }), /* @__PURE__ */ (0, b.jsx)("strong", { children: S(i.video) })]
					}),
					/* @__PURE__ */ (0, b.jsxs)("div", {
						className: "cost-card",
						children: [
							/* @__PURE__ */ (0, b.jsx)("span", { children: "计费调用" }),
							/* @__PURE__ */ (0, b.jsx)("strong", { children: i.calls }),
							/* @__PURE__ */ (0, b.jsx)("small", { children: i.unknown ? `${i.unknown} 笔待定价` : "" })
						]
					})
				]
			}),
			/* @__PURE__ */ (0, b.jsx)("div", {
				className: "log-list",
				children: a.length ? a.map((e) => /* @__PURE__ */ (0, b.jsx)("article", {
					className: `log-item${e.status === "failed" ? " failed" : ""}`,
					children: /* @__PURE__ */ (0, b.jsxs)("div", {
						className: "log-main",
						children: [
							/* @__PURE__ */ (0, b.jsxs)("div", {
								className: "log-meta",
								children: [
									/* @__PURE__ */ (0, b.jsx)("span", {
										className: `log-chip ${e.status === "failed" ? "status-failed" : "status-ok"}`,
										children: e.status === "failed" ? "失败" : "成功"
									}),
									/* @__PURE__ */ (0, b.jsx)("span", {
										className: "log-chip",
										children: e.platform || "-"
									}),
									e.model ? /* @__PURE__ */ (0, b.jsx)("span", {
										className: "log-chip",
										children: e.model
									}) : null,
									e.costMicros === null ? /* @__PURE__ */ (0, b.jsx)("span", {
										className: "log-chip cost-unknown",
										children: "待定价"
									}) : /* @__PURE__ */ (0, b.jsx)("span", {
										className: `log-chip${e.costSource === "estimated" ? " cost-estimated" : ""}`,
										children: S(e.costMicros)
									})
								]
							}),
							/* @__PURE__ */ (0, b.jsxs)("div", {
								className: "log-subline",
								children: [
									/* @__PURE__ */ (0, b.jsx)("span", { children: new Date(e.createdAt).toLocaleString("zh-CN") }),
									/* @__PURE__ */ (0, b.jsxs)("span", { children: ["输出 ", e.outputCount] }),
									/* @__PURE__ */ (0, b.jsxs)("span", { children: [Math.round(e.runMs / 1e3), "s"] })
								]
							}),
							e.error ? /* @__PURE__ */ (0, b.jsx)("div", {
								className: "log-error",
								children: e.error
							}) : null,
							/* @__PURE__ */ (0, b.jsx)("div", {
								className: "log-prompt",
								title: e.prompt,
								children: e.prompt || "无提示词元数据"
							})
						]
					})
				}, e.id)) : /* @__PURE__ */ (0, b.jsx)("div", {
					className: "log-empty",
					children: "暂无生成日志"
				})
			})
		]
	});
}
//#endregion
//#region src/canvas/ui/canvas-status-island.tsx
var w = {
	error: "#dc2626",
	info: "#64748b",
	pending: "#d97706",
	success: "#16a34a"
};
function T(e, t) {
	let n = (0, y.createRoot)(e);
	return n.render(/* @__PURE__ */ (0, b.jsx)(E, { store: t })), n;
}
function E({ store: e }) {
	let n = t(e, ({ status: e }) => e);
	return /* @__PURE__ */ (0, b.jsxs)("span", {
		"aria-live": "polite",
		"data-testid": "canvas-status-island",
		role: "status",
		style: {
			alignItems: "center",
			color: w[n.kind],
			display: "inline-flex",
			fontSize: 11,
			fontWeight: 700,
			gap: 5
		},
		children: [/* @__PURE__ */ (0, b.jsx)("span", {
			"aria-hidden": "true",
			children: "●"
		}), n.text || "Ready"]
	});
}
//#endregion
//#region src/canvas/ui/canvas-toolbar-island.tsx
var D = [
	{
		command: "open-cost",
		label: "费用"
	},
	{
		command: "open-log",
		label: "日志"
	},
	{
		command: "open-backups",
		label: "备份"
	}
];
function O(e, t) {
	let n = (0, y.createRoot)(e);
	return n.render(D.map(({ command: e, label: n }) => /* @__PURE__ */ (0, b.jsx)("button", {
		"aria-label": n === "日志" ? "生成日志" : n,
		className: "tool-btn",
		onClick: () => t(e),
		type: "button",
		children: /* @__PURE__ */ (0, b.jsx)("span", { children: n })
	}, e))), n;
}
//#endregion
//#region src/canvas/ui/execution-status-island.tsx
var k = {
	idle: "等待运行",
	queued: "排队中",
	running: "运行中",
	stopping: "正在停止",
	done: "已完成",
	failed: "运行失败",
	stopped: "已停止"
};
function A(e, t, n) {
	let r = (0, y.createRoot)(e);
	return r.render(/* @__PURE__ */ (0, b.jsx)(j, {
		runCommand: n,
		store: t
	})), r;
}
function j({ runCommand: e, store: n }) {
	let r = t(n, ({ runs: e }) => e), i = Object.values(r), a = i.filter(({ status: e }) => [
		"queued",
		"running",
		"stopping"
	].includes(e)), o = a.at(-1) ?? i.at(-1), s = o?.mode === "parallel" ? `${o.completedRounds} 轮完成` : `${o?.completedNodeIds.length ?? 0}/${o?.order.length ?? 0} 节点`;
	return /* @__PURE__ */ (0, b.jsxs)("section", {
		"aria-live": "polite",
		className: "panel",
		"data-testid": "execution-status-island",
		style: {
			alignItems: "center",
			display: "flex",
			gap: 8,
			minHeight: 42,
			padding: "7px 12px"
		},
		children: [
			/* @__PURE__ */ (0, b.jsx)("span", {
				"aria-hidden": "true",
				style: { color: a.length ? "#2563eb" : "#64748b" },
				children: "●"
			}),
			/* @__PURE__ */ (0, b.jsxs)("span", {
				style: {
					display: "grid",
					lineHeight: 1.2
				},
				children: [
					/* @__PURE__ */ (0, b.jsx)("strong", {
						style: { fontSize: 12 },
						children: o ? k[o.status] : "现代执行已就绪"
					}),
					/* @__PURE__ */ (0, b.jsx)("small", {
						style: {
							color: "#64748b",
							fontSize: 10
						},
						children: o ? `${a.length || 1} 个工作流 · ${s}` : "等待运行事件"
					}),
					o?.error ? /* @__PURE__ */ (0, b.jsx)("small", {
						style: {
							color: "#dc2626",
							fontSize: 10
						},
						children: o.error
					}) : null
				]
			}),
			o && [
				"queued",
				"running",
				"stopping"
			].includes(o.status) ? /* @__PURE__ */ (0, b.jsx)("button", {
				className: "tool-btn",
				disabled: o.status === "stopping",
				onClick: () => e("stop-execution", { targetId: o.targetId }),
				type: "button",
				children: "停止"
			}) : null,
			o?.status === "failed" ? /* @__PURE__ */ (0, b.jsx)("button", {
				className: "tool-btn",
				onClick: () => e("retry-execution", { targetId: o.targetId }),
				type: "button",
				children: "重试"
			}) : null
		]
	});
}
//#endregion
//#region src/canvas/ui/react-execution-entry.tsx
function M(e) {
	let t = window.CanvasLegacyBridge;
	if (!t) throw Error("Canvas legacy bridge is unavailable");
	let n = f(), r = p(window, n), i = A(e, n, (e, n) => {
		t.runCommand(e, n);
	});
	return e.hidden = !1, () => {
		r(), i.unmount();
	};
}
function N(e) {
	let t = window.CanvasLegacyBridge;
	if (!t) throw Error("Canvas legacy bridge is unavailable");
	let r = s(t.getActivitySnapshot?.()), a = i(t.getDocumentSnapshot()), o = c(window, r), l = n(window, a), u = e.parentElement?.querySelector(":scope > .log-panel") ?? null, d = u?.style.display ?? "";
	u && (u.style.display = "none");
	let f = e.style.display;
	e.style.display = "contents", e.hidden = !1;
	let p = x(e, r, a, () => {
		t.runCommand("close-log");
	});
	return () => {
		o(), l(), p.unmount(), e.hidden = !0, e.style.display = f, u && (u.style.display = d);
	};
}
function P(e) {
	let t = window.CanvasLegacyBridge?.getStatusSnapshot?.(), n = g(t), r = _(window, n), i = T(e, n);
	return e.hidden = !1, () => {
		r(), i.unmount();
	};
}
function F(e) {
	let t = window.CanvasLegacyBridge;
	if (!t) throw Error("Canvas legacy bridge is unavailable");
	let n = [
		"canvasCostToggle",
		"canvasLogToggle",
		"canvasBackupToggle"
	].map((e) => document.getElementById(e)).filter((e) => !!e), r = n.map((e) => e.hidden);
	n.forEach((e) => {
		e.hidden = !0;
	});
	let i = e.style.display;
	e.style.display = "contents", e.hidden = !1;
	let a = O(e, (e) => {
		t.runCommand(e);
	});
	return () => {
		a.unmount(), e.style.display = i, n.forEach((e, t) => {
			e.hidden = r[t];
		});
	};
}
//#endregion
export { N as mountReactActivityIsland, M as mountReactExecutionIsland, P as mountReactStatusIsland, F as mountReactToolbarIsland };
