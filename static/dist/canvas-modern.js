import { n as e, t } from "./graph-j9GyzERh.js";
import { i as n, n as r, r as i } from "./canvas-repository-qZo_3rR8.js";
//#region src/canvas/domain/document-merge.ts
var a = Symbol("missing");
function o(t, n, r) {
	let i = e(t), a = e(n), o = e(r);
	if (String(i.id || "") !== String(a.id || "") || String(a.id || "") !== String(o.id || "")) throw TypeError("Cannot merge different canvas documents");
	let l = [], f = s(i, a, o, "", l);
	return f.nodes = c(i.nodes, a.nodes, o.nodes, "nodes", l, u), f.connections = c(i.connections, a.connections, o.connections, "connections", l, d), f.updated_at = o.updated_at, {
		conflicts: [...new Set(l)],
		document: e(f)
	};
}
function s(e, t, n, r, i, o = /* @__PURE__ */ new Set([
	"connections",
	"nodes",
	"updated_at"
])) {
	let s = {};
	return (/* @__PURE__ */ new Set([
		...Object.keys(e),
		...Object.keys(t),
		...Object.keys(n)
	])).forEach((c) => {
		if (o.has(c)) return;
		let u = l(c in e ? e[c] : a, c in t ? t[c] : a, c in n ? n[c] : a, r ? `${r}.${c}` : c, i);
		u !== a && (s[c] = h(u));
	}), s;
}
function c(e, t, n, r, i, o) {
	let s = new Map(e.map((e) => [o(e), e])), c = new Map(t.map((e) => [o(e), e])), u = new Map(n.map((e) => [o(e), e]));
	return [...n.map(o), ...t.map(o)].filter((e, t, n) => n.indexOf(e) === t).flatMap((e) => {
		let t = l(s.get(e) ?? a, c.get(e) ?? a, u.get(e) ?? a, `${r}.${e}`, i);
		return t === a ? [] : [h(t)];
	});
}
function l(e, t, n, r, i) {
	return p(t, e) ? n : p(n, e) || p(t, n) ? t : f(e) && f(t) && f(n) ? s(e, t, n, r, i, /* @__PURE__ */ new Set()) : (i.push(r), t);
}
function u(e) {
	return e.id;
}
function d(e) {
	return String(e.id || `${e.from}->${e.to}:${e.kind || "flow"}`);
}
function f(e) {
	return e !== a && !!e && typeof e == "object" && !Array.isArray(e);
}
function p(e, t) {
	return e === a || t === a ? e === t : m(e) === m(t);
}
function m(e) {
	return Array.isArray(e) ? `[${e.map(m).join(",")}]` : e && typeof e == "object" ? `{${Object.entries(e).sort(([e], [t]) => e.localeCompare(t)).map(([e, t]) => `${JSON.stringify(e)}:${m(t)}`).join(",")}}` : JSON.stringify(e);
}
function h(e) {
	return JSON.parse(JSON.stringify(e));
}
//#endregion
//#region src/canvas/domain/execution.ts
function g() {
	return {
		completedNodeIds: [],
		completedRounds: 0,
		currentNodeId: "",
		error: "",
		mode: "serial",
		order: [],
		rounds: {},
		status: "idle",
		targetId: ""
	};
}
function _(e, t) {
	if (t.type === "queue") {
		if ([
			"idle",
			"done",
			"failed",
			"stopped"
		].includes(e.status) || y(e, t), !t.targetId || !t.order.length) throw Error("Execution queue requires a target and order");
		return {
			completedNodeIds: [],
			completedRounds: 0,
			currentNodeId: "",
			error: "",
			mode: t.mode,
			order: [...t.order],
			rounds: {},
			status: "queued",
			targetId: t.targetId
		};
	}
	if (t.type === "start") return e.status !== "queued" && y(e, t), {
		...e,
		status: "running"
	};
	if (t.type === "request-stop") return e.status === "stopping" ? e : (e.status !== "running" && y(e, t), {
		...e,
		status: "stopping"
	});
	if (t.type === "node-start") {
		if (e.mode === "parallel") return v(e, t);
		(e.status !== "running" || e.currentNodeId) && y(e, t);
		let n = e.completedNodeIds.length === e.order.length ? [] : e.completedNodeIds, r = e.order[n.length];
		if (t.nodeId !== r) throw Error(`Expected execution node ${r || "<none>"}`);
		return {
			...e,
			completedNodeIds: n,
			currentNodeId: t.nodeId
		};
	}
	if (t.type === "node-done") {
		if (e.mode === "parallel") return v(e, t);
		(!["running", "stopping"].includes(e.status) || e.currentNodeId !== t.nodeId) && y(e, t);
		let n = [...e.completedNodeIds, t.nodeId];
		return {
			...e,
			completedNodeIds: n,
			completedRounds: e.completedRounds + +(n.length === e.order.length),
			currentNodeId: ""
		};
	}
	return e.status !== "running" && e.status !== "stopping" && y(e, t), e.status === "stopping" && t.status === "done" && y(e, t), {
		...e,
		error: t.error || "",
		status: t.status
	};
}
function v(e, t) {
	t.roundId || y(e, t);
	let n = e.rounds[t.roundId] ?? {
		completedNodeIds: [],
		currentNodeId: ""
	};
	if (t.type === "node-start") {
		e.status !== "running" && y(e, t), n.currentNodeId && y(e, t);
		let r = e.order[n.completedNodeIds.length];
		if (t.nodeId !== r) throw Error(`Expected execution node ${r || "<none>"}`);
		return {
			...e,
			rounds: {
				...e.rounds,
				[t.roundId]: {
					...n,
					currentNodeId: t.nodeId
				}
			}
		};
	}
	["running", "stopping"].includes(e.status) || y(e, t), n.currentNodeId !== t.nodeId && y(e, t);
	let r = [...n.completedNodeIds, t.nodeId];
	return {
		...e,
		completedRounds: e.completedRounds + +(r.length === e.order.length),
		rounds: {
			...e.rounds,
			[t.roundId]: {
				completedNodeIds: r,
				currentNodeId: ""
			}
		}
	};
}
async function ee(e, t, n, r = {}) {
	let { mode: i = "serial", onTransition: a, signal: o } = r, s = b(g(), {
		type: "queue",
		targetId: e,
		order: [...t],
		mode: i
	}, a);
	s = b(s, { type: "start" }, a);
	let c = () => (s.status === "running" && (s = b(s, { type: "request-stop" }, a)), b(s, {
		type: "finish",
		status: "stopped"
	}, a));
	for (let e of t) {
		if (o?.aborted) return c();
		s = b(s, {
			type: "node-start",
			nodeId: e
		}, a);
		try {
			await n(e, o);
		} catch (e) {
			return o?.aborted ? c() : b(s, {
				type: "finish",
				status: "failed",
				error: e instanceof Error ? e.message : String(e)
			}, a);
		}
		if (o?.aborted) return s = b(s, { type: "request-stop" }, a), s = b(s, {
			type: "node-done",
			nodeId: e
		}, a), c();
		s = b(s, {
			type: "node-done",
			nodeId: e
		}, a);
	}
	return b(s, {
		type: "finish",
		status: "done"
	}, a);
}
async function te(e, t, n, r, i = {}) {
	let { onTransition: a, signal: o } = i, s = n.map((e, t) => ({
		id: i.roundId?.(e, t) || String(t + 1),
		round: e
	}));
	if (new Set(s.map(({ id: e }) => e)).size !== s.length) throw Error("Parallel execution round IDs must be unique");
	let c = b(g(), {
		type: "queue",
		targetId: e,
		order: [...t],
		mode: "parallel"
	}, a);
	c = b(c, { type: "start" }, a);
	let l = null, u = 0, d = () => {
		c.status === "running" && (c = b(c, { type: "request-stop" }, a));
	}, f = Math.max(1, Math.min(Math.floor(i.limit || 1), s.length || 1)), p = Array.from({ length: f }, async () => {
		for (; !l && !o?.aborted && u < s.length;) {
			let { id: e, round: n } = s[u++];
			for (let i of t) {
				if (l || o?.aborted) break;
				c = b(c, {
					type: "node-start",
					nodeId: i,
					roundId: e
				}, a);
				try {
					await r(i, n, o);
				} catch (e) {
					o?.aborted ? d() : l ||= e;
					break;
				}
				o?.aborted && d(), c = b(c, {
					type: "node-done",
					nodeId: i,
					roundId: e
				}, a);
			}
		}
	});
	return await Promise.all(p), o?.aborted ? (d(), b(c, {
		type: "finish",
		status: "stopped"
	}, a)) : l ? b(c, {
		type: "finish",
		status: "failed",
		error: l instanceof Error ? l.message : String(l)
	}, a) : b(c, {
		type: "finish",
		status: "done"
	}, a);
}
function y(e, t) {
	throw Error(`Invalid execution transition: ${e.status} -> ${t.type}`);
}
function b(e, t, n) {
	let r = _(e, t);
	return n?.(r, t), r;
}
//#endregion
//#region src/canvas/infrastructure/task-client.ts
var x = {
	image: "/api/canvas-image-tasks",
	video: "/api/canvas-video-tasks"
};
function ne(e = fetch) {
	let t = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), a = {
		cancelledWatches: 0,
		deduplicatedSubmissions: 0,
		deduplicatedWatches: 0,
		pollErrors: 0,
		polls: 0,
		submissions: 0,
		submissionRetries: 0
	}, o = (t, o, s = {}) => {
		let c = String(s.idempotencyKey || "").trim(), l = c ? `${t}:${c}` : "", u = l ? r.get(l) : void 0;
		if (u) return a.deduplicatedSubmissions += 1, u;
		let d = o && typeof o == "object" && !Array.isArray(o) ? {
			...o,
			...c ? { idempotency_key: c } : {}
		} : o ?? {}, f = (async () => {
			let r = Math.max(0, Math.min(2, Number(s.retryCount ?? +!!c))), o = 0;
			for (;;) try {
				a.submissions += 1;
				let r = await n(e, x[t], {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(d)
				}, s);
				return re(r), r;
			} catch (e) {
				if (!(e instanceof i) || !e.retryable || o++ >= r) throw e;
				a.submissionRetries += 1;
			}
		})().finally(() => {
			l && r.delete(l);
		});
		return l && r.set(l, f), f;
	}, s = (t, r, i) => r ? n(e, `${x[t]}/${encodeURIComponent(r)}`, {}, i) : Promise.reject(/* @__PURE__ */ TypeError("Task ID is required")), c = async (e, t, n = {}) => {
		let { intervalMs: r = e === "video" ? 2500 : 1800, maxPollErrors: o = 3, requestTimeoutMs: c = 3e4 } = n, l = Date.now(), u = 0;
		for (;;) {
			S(n.signal, l, n.timeoutMs);
			try {
				a.polls += 1;
				let r = await s(e, t, {
					signal: n.signal,
					timeoutMs: c
				});
				if (u = 0, r.status === "succeeded" || r.status === "failed" || r.status === "cancelled") return r;
			} catch (e) {
				if (a.pollErrors += 1, !(e instanceof i) || !e.retryable || u++ >= o) throw e;
			}
			await ie(r, n.signal, l, n.timeoutMs);
		}
	}, l = (e, n, r = {}) => {
		let i = `${e}:${n}`, o = t.get(i);
		if (o) return a.deduplicatedWatches += 1, o.promise;
		let s = new AbortController(), l = () => s.abort(r.signal?.reason);
		r.signal?.aborted ? l() : r.signal?.addEventListener("abort", l, { once: !0 });
		let u = c(e, n, {
			...r,
			signal: s.signal
		}).finally(() => {
			r.signal?.removeEventListener("abort", l), t.delete(i);
		});
		return t.set(i, {
			controller: s,
			promise: u
		}), u;
	};
	return {
		cancel: (e, n) => {
			let r = t.get(`${e}:${n}`);
			return r ? (r.controller.abort(), a.cancelledWatches += 1, !0) : !1;
		},
		get: s,
		getDiagnostics: () => ({
			activeSubmissions: r.size,
			activeWatches: t.size,
			...a
		}),
		resume: (e, t) => Promise.allSettled(e.map(({ kind: e, id: n }) => l(e, n, t))),
		submit: o,
		wait: c,
		waitForResult: async (e, t, n) => {
			let r = await c(e, t, n);
			if (r.status !== "succeeded") throw new i(r.error || "Task failed", "task-failed", 0, r);
			return r.result;
		},
		watch: l
	};
}
function re(e) {
	let t = String(e.task_id || e.id || "");
	if (!t) throw new i("Task response did not include an ID", "validation", 200, e);
	return t;
}
function S(e, t, n = 0) {
	if (e?.aborted) throw new i("Task polling aborted", "aborted");
	if (n > 0 && Date.now() - t >= n) throw new i("Task polling timed out", "timeout");
}
function ie(e, t, n, r = 0) {
	S(t, n, r);
	let a = r > 0 ? Math.max(0, r - (Date.now() - n)) : e, o = Math.min(Math.max(0, e), a || e);
	return new Promise((e, n) => {
		let r = () => t?.removeEventListener("abort", s), a = setTimeout(() => {
			r(), e();
		}, o), s = () => {
			clearTimeout(a), r(), n(new i("Task polling aborted", "aborted"));
		};
		t?.addEventListener("abort", s, { once: !0 });
	});
}
//#endregion
//#region src/canvas/infrastructure/rollout.ts
function ae(e, t, n) {
	let r = new URLSearchParams(e), i = r.get("canvas_v2"), a = C(r.get("canvas_v2_rollout")), o = C(se(t, "canvasV2RolloutPercentage")), s = a ?? o ?? 0, c = a === null ? o === null ? "default" : "storage" : "query", l = oe(n || "anonymous");
	return i === "1" || i === "0" ? {
		bucket: l,
		enabled: i === "1",
		forced: !0,
		percentage: s,
		source: "query"
	} : {
		bucket: l,
		enabled: l < s,
		forced: !1,
		percentage: s,
		source: c
	};
}
function C(e) {
	if (e === null || e.trim() === "") return null;
	let t = Number(e);
	return Number.isFinite(t) ? Math.max(0, Math.min(100, Math.floor(t))) : null;
}
function oe(e) {
	let t = 2166136261;
	for (let n = 0; n < e.length; n += 1) t ^= e.charCodeAt(n), t = Math.imul(t, 16777619);
	return (t >>> 0) % 100;
}
function se(e, t) {
	try {
		return e?.getItem(t) ?? null;
	} catch {
		return null;
	}
}
//#endregion
//#region src/main.ts
var w = new URLSearchParams(window.location.search), T = ae(window.location.search, window.localStorage, window.sessionStorage.getItem("canvasClientId") || window.location.pathname), E = w.get("canvas_modern_core"), D = E === "execution-shadow", O = E === "graph-order", k = E === "shadow", A = w.get("canvas_m2") === "1" || w.get("canvas_m2") === null && T.enabled, j = A || w.get("canvas_execution_engine") === "1", M = A || w.get("canvas_task_client") === "1", N = A || w.get("canvas_repository") === "1", P = j && M && N, F = w.get("canvas_react_islands") === "1", I = F || w.get("canvas_react_activity") === "1", L = F || w.get("canvas_react_execution") === "1", R = F || w.get("canvas_react_status") === "1", z = F || w.get("canvas_react_toolbar") === "1", B = w.get("canvas_board_v2") === "1" || w.get("canvas_board_v2") === null && T.enabled, V = ne(), H = r(), U = /* @__PURE__ */ new Map(), W = 0, G = 0, K = [], q = 0, J = 0, Y = /* @__PURE__ */ new Map(), X = {
	done: 0,
	failed: 0,
	stopped: 0
}, Z = 0;
function Q(n, r, i) {
	let a = window.CanvasLegacyBridge, o = a?.getDocumentSnapshot();
	if (!a || !o) return null;
	let s = t(e(o)), c = n === "cascade" ? s.cascadeOrder(r) : s.retryCascadeOrder(r), l = i ?? (n === "cascade" ? a.computeCascadeOrder(r) : a.computeRetryCascadeOrder(r));
	return {
		kind: n,
		legacy: [...l],
		modern: c,
		targetId: r,
		matches: l.length === c.length && l.every((e, t) => e === c[t])
	};
}
if (window.CanvasModernCore = Object.freeze({
	version: 23,
	canvasRepository: H,
	canvasRepositoryEnabled: N,
	executionEngineEnabled: j,
	m2Enabled: P,
	taskClient: V,
	taskClientEnabled: M,
	activeOrder(n, r) {
		if (!O) return null;
		try {
			let i = window.CanvasLegacyBridge?.getDocumentSnapshot();
			if (!i) return null;
			let a = t(e(i));
			return n === "cascade" ? a.cascadeOrder(r) : a.retryCascadeOrder(r);
		} catch (e) {
			return console.warn("[canvas-modern-core] active graph order failed; using legacy order", e), null;
		}
	},
	compareOrder: Q,
	runOrdered(e) {
		return j ? ee(e.targetId, e.order, e.execute, {
			mode: e.mode,
			signal: e.signal,
			onTransition: $
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	runParallel(e) {
		return j ? te(e.targetId, e.order, e.rounds, e.execute, {
			limit: e.limit,
			roundId: e.roundId,
			signal: e.signal,
			onTransition: $
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	observeExecution(e) {
		if (D) try {
			let t = U.get(e.targetId) ?? g();
			e.phase === "begin" ? (t = _(t, {
				type: "queue",
				targetId: e.targetId,
				order: e.order,
				mode: e.mode
			}), t = _(t, { type: "start" })) : t = e.phase === "node-start" ? _(t, {
				type: "node-start",
				nodeId: e.nodeId,
				roundId: e.roundId
			}) : e.phase === "node-done" ? _(t, {
				type: "node-done",
				nodeId: e.nodeId,
				roundId: e.roundId
			}) : e.phase === "stop" ? _(t, { type: "request-stop" }) : _(t, {
				type: "finish",
				status: e.status,
				error: e.error
			}), U.set(e.targetId, t), W += 1;
		} catch (t) {
			G += 1, console.warn("[canvas-modern-core] execution shadow transition failed", t, e);
		}
	},
	observeOrder(e, t, n) {
		if (k) try {
			let r = Q(e, t, n);
			if (!r) return;
			q += 1, r.matches || (K.length < 50 && K.push(r), console.warn("[canvas-modern-core] graph order mismatch", r));
		} catch (e) {
			J += 1, console.warn("[canvas-modern-core] graph shadow check failed", e);
		}
	},
	getShadowReport() {
		return {
			enabled: k,
			checks: q,
			errors: J,
			mismatches: K.map((e) => ({
				...e,
				legacy: [...e.legacy],
				modern: [...e.modern]
			}))
		};
	},
	getExecutionShadowReport() {
		return {
			enabled: D,
			errors: G,
			events: W,
			runs: [...U.values()].map((e) => ({
				...e,
				completedNodeIds: [...e.completedNodeIds],
				order: [...e.order],
				rounds: Object.fromEntries(Object.entries(e.rounds).map(([e, t]) => [e, {
					...t,
					completedNodeIds: [...t.completedNodeIds]
				}]))
			}))
		};
	},
	getM2Report() {
		return {
			enabled: P,
			rollout: T,
			execution: {
				active: [...Y.values()].filter(({ status: e }) => ![
					"done",
					"failed",
					"stopped"
				].includes(e)).length,
				...X,
				transitions: Z
			},
			flags: {
				executionEngine: j,
				repository: N,
				taskClient: M
			},
			repository: H.getDiagnostics(),
			tasks: V.getDiagnostics()
		};
	},
	mergeConflict(e, t, n) {
		return o(e, t, n);
	}
}), L) {
	let e = document.getElementById("canvasExecutionIsland");
	e && import("./react-execution-entry-BvXNr52W.js").then(({ mountReactExecutionIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React execution island failed to load", e));
}
if (R) {
	let e = document.getElementById("canvasStatusIsland");
	e && import("./react-execution-entry-BvXNr52W.js").then(({ mountReactStatusIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React status island failed to load", e));
}
if (z) {
	let e = document.getElementById("canvasToolbarIsland");
	e && import("./react-execution-entry-BvXNr52W.js").then(({ mountReactToolbarIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React toolbar island failed to load", e));
}
if (I) {
	let e = document.getElementById("canvasActivityIsland");
	e && import("./react-execution-entry-BvXNr52W.js").then(({ mountReactActivityIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React activity island failed to load", e));
}
if (B) {
	let e = document.getElementById("canvasBoardV2"), t = document.getElementById("board");
	e && t && import("./canvas-board-v2-MKB4bx64.js").then(({ mountCanvasBoardV2: n }) => {
		let r = n(e, t);
		window.addEventListener("pagehide", r, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] CanvasBoard V2 failed to load; using Legacy Board", e));
}
function $(e, t) {
	Z += 1, Y.set(e.targetId, e), t.type === "finish" && (X[t.status] += 1), window.dispatchEvent(new CustomEvent("canvas-modern-execution", { detail: {
		event: t,
		state: e
	} }));
}
document.documentElement.dataset.canvasModernCore = "23", document.documentElement.dataset.canvasBoardV2 = B ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionEngine = j ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionShadow = D ? "enabled" : "disabled", document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? "ready" : "missing", document.documentElement.dataset.canvasModernGraphOrder = O ? "enabled" : "disabled", document.documentElement.dataset.canvasModernM2 = P ? "enabled" : "disabled", document.documentElement.dataset.canvasModernRepository = N ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactActivity = I ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactExecution = L ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactIslands = F ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactStatus = R ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactToolbar = z ? "enabled" : "disabled", document.documentElement.dataset.canvasModernShadow = k ? "enabled" : "disabled", document.documentElement.dataset.canvasModernTaskClient = M ? "enabled" : "disabled", document.documentElement.dataset.canvasV2Rollout = T.enabled ? "enabled" : "disabled", document.documentElement.dataset.canvasV2RolloutBucket = String(T.bucket), document.documentElement.dataset.canvasV2RolloutPercentage = String(T.percentage), window.dispatchEvent(new CustomEvent("canvas-modern-core-ready"));
//#endregion
