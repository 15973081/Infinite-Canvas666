import { n as e, t } from "./graph-j9GyzERh.js";
import { a as n, i as r, o as i, r as a } from "./canvas-repository-fzURdXqR.js";
//#region src/canvas/domain/execution.ts
function o() {
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
function s(e, t) {
	if (t.type === "queue") {
		if ([
			"idle",
			"done",
			"failed",
			"stopped"
		].includes(e.status) || d(e, t), !t.targetId || !t.order.length) throw Error("Execution queue requires a target and order");
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
	if (t.type === "start") return e.status !== "queued" && d(e, t), {
		...e,
		status: "running"
	};
	if (t.type === "request-stop") return e.status === "stopping" ? e : (e.status !== "running" && d(e, t), {
		...e,
		status: "stopping"
	});
	if (t.type === "node-start") {
		if (e.mode === "parallel") return c(e, t);
		(e.status !== "running" || e.currentNodeId) && d(e, t);
		let n = e.completedNodeIds.length === e.order.length ? [] : e.completedNodeIds, r = e.order[n.length];
		if (t.nodeId !== r) throw Error(`Expected execution node ${r || "<none>"}`);
		return {
			...e,
			completedNodeIds: n,
			currentNodeId: t.nodeId
		};
	}
	if (t.type === "node-done") {
		if (e.mode === "parallel") return c(e, t);
		(!["running", "stopping"].includes(e.status) || e.currentNodeId !== t.nodeId) && d(e, t);
		let n = [...e.completedNodeIds, t.nodeId];
		return {
			...e,
			completedNodeIds: n,
			completedRounds: e.completedRounds + +(n.length === e.order.length),
			currentNodeId: ""
		};
	}
	return e.status !== "running" && e.status !== "stopping" && d(e, t), e.status === "stopping" && t.status === "done" && d(e, t), {
		...e,
		error: t.error || "",
		status: t.status
	};
}
function c(e, t) {
	t.roundId || d(e, t);
	let n = e.rounds[t.roundId] ?? {
		completedNodeIds: [],
		currentNodeId: ""
	};
	if (t.type === "node-start") {
		e.status !== "running" && d(e, t), n.currentNodeId && d(e, t);
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
	["running", "stopping"].includes(e.status) || d(e, t), n.currentNodeId !== t.nodeId && d(e, t);
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
async function l(e, t, n, r = {}) {
	let { mode: i = "serial", onTransition: a, signal: s } = r, c = f(o(), {
		type: "queue",
		targetId: e,
		order: [...t],
		mode: i
	}, a);
	c = f(c, { type: "start" }, a);
	let l = () => (c.status === "running" && (c = f(c, { type: "request-stop" }, a)), f(c, {
		type: "finish",
		status: "stopped"
	}, a));
	for (let e of t) {
		if (s?.aborted) return l();
		c = f(c, {
			type: "node-start",
			nodeId: e
		}, a);
		try {
			await n(e, s);
		} catch (e) {
			return s?.aborted ? l() : f(c, {
				type: "finish",
				status: "failed",
				error: e instanceof Error ? e.message : String(e)
			}, a);
		}
		if (s?.aborted) return c = f(c, { type: "request-stop" }, a), c = f(c, {
			type: "node-done",
			nodeId: e
		}, a), l();
		c = f(c, {
			type: "node-done",
			nodeId: e
		}, a);
	}
	return f(c, {
		type: "finish",
		status: "done"
	}, a);
}
async function u(e, t, n, r, i = {}) {
	let { onTransition: a, signal: s } = i, c = n.map((e, t) => ({
		id: i.roundId?.(e, t) || String(t + 1),
		round: e
	}));
	if (new Set(c.map(({ id: e }) => e)).size !== c.length) throw Error("Parallel execution round IDs must be unique");
	let l = f(o(), {
		type: "queue",
		targetId: e,
		order: [...t],
		mode: "parallel"
	}, a);
	l = f(l, { type: "start" }, a);
	let u = null, d = 0, p = () => {
		l.status === "running" && (l = f(l, { type: "request-stop" }, a));
	}, m = Math.max(1, Math.min(Math.floor(i.limit || 1), c.length || 1)), h = Array.from({ length: m }, async () => {
		for (; !u && !s?.aborted && d < c.length;) {
			let { id: e, round: n } = c[d++];
			for (let i of t) {
				if (u || s?.aborted) break;
				l = f(l, {
					type: "node-start",
					nodeId: i,
					roundId: e
				}, a);
				try {
					await r(i, n, s);
				} catch (e) {
					s?.aborted ? p() : u ||= e;
					break;
				}
				s?.aborted && p(), l = f(l, {
					type: "node-done",
					nodeId: i,
					roundId: e
				}, a);
			}
		}
	});
	return await Promise.all(h), s?.aborted ? (p(), f(l, {
		type: "finish",
		status: "stopped"
	}, a)) : u ? f(l, {
		type: "finish",
		status: "failed",
		error: u instanceof Error ? u.message : String(u)
	}, a) : f(l, {
		type: "finish",
		status: "done"
	}, a);
}
function d(e, t) {
	throw Error(`Invalid execution transition: ${e.status} -> ${t.type}`);
}
function f(e, t, n) {
	let r = s(e, t);
	return n?.(r, t), r;
}
//#endregion
//#region src/canvas/infrastructure/task-client.ts
var p = {
	image: "/api/canvas-image-tasks",
	video: "/api/canvas-video-tasks"
};
function m(e = fetch) {
	let t = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), a = {
		cancelledWatches: 0,
		deduplicatedSubmissions: 0,
		deduplicatedWatches: 0,
		pollErrors: 0,
		polls: 0,
		recoveredTasks: 0,
		resumeRequests: 0,
		resumedTasks: 0,
		submissions: 0,
		submissionRetries: 0
	}, o = (t, o, s = {}) => {
		let c = String(s.idempotencyKey || "").trim(), l = c ? `${t}:${c}` : "", u = l ? i.get(l) : void 0;
		if (u) return a.deduplicatedSubmissions += 1, u;
		let d = o && typeof o == "object" && !Array.isArray(o) ? {
			...o,
			...c ? { idempotency_key: c } : {}
		} : o ?? {}, f = (async () => {
			let i = Math.max(0, Math.min(2, Number(s.retryCount ?? +!!c))), o = 0;
			for (;;) try {
				a.submissions += 1;
				let r = await n(e, p[t], {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(d)
				}, s);
				return h(r), r;
			} catch (e) {
				if (!(e instanceof r) || !e.retryable || o++ >= i) throw e;
				a.submissionRetries += 1;
			}
		})().finally(() => {
			l && i.delete(l);
		});
		return l && i.set(l, f), f;
	}, s = (t, r, i) => r ? n(e, `${p[t]}/${encodeURIComponent(r)}`, {}, i) : Promise.reject(/* @__PURE__ */ TypeError("Task ID is required")), c = async (e, t, n = {}) => {
		let { intervalMs: i = e === "video" ? 2500 : 1800, maxPollErrors: o = 3, requestTimeoutMs: c = 3e4 } = n, l = Date.now(), u = 0;
		for (;;) {
			g(n.signal, l, n.timeoutMs);
			try {
				a.polls += 1;
				let r = await s(e, t, {
					signal: n.signal,
					timeoutMs: c
				});
				if (u = 0, r.status === "succeeded" || r.status === "failed" || r.status === "cancelled") return r;
			} catch (e) {
				if (a.pollErrors += 1, !(e instanceof r) || !e.retryable || u++ >= o) throw e;
			}
			await _(i, n.signal, l, n.timeoutMs);
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
			activeSubmissions: i.size,
			activeWatches: t.size,
			...a
		}),
		resume: async (e, t) => {
			a.resumeRequests += 1, a.resumedTasks += e.length;
			let n = await Promise.allSettled(e.map(({ kind: e, id: n }) => l(e, n, t)));
			return a.recoveredTasks += n.filter((e) => e.status === "fulfilled" && e.value.recovered_after_restart).length, n;
		},
		submit: o,
		wait: c,
		waitForResult: async (e, t, n) => {
			let i = await c(e, t, n);
			if (i.status !== "succeeded") throw new r(i.error || "Task failed", "task-failed", 0, i);
			return i.result;
		},
		watch: l
	};
}
function h(e) {
	let t = String(e.task_id || e.id || "");
	if (!t) throw new r("Task response did not include an ID", "validation", 200, e);
	return t;
}
function g(e, t, n = 0) {
	if (e?.aborted) throw new r("Task polling aborted", "aborted");
	if (n > 0 && Date.now() - t >= n) throw new r("Task polling timed out", "timeout");
}
function _(e, t, n, i = 0) {
	g(t, n, i);
	let a = i > 0 ? Math.max(0, i - (Date.now() - n)) : e, o = Math.min(Math.max(0, e), a || e);
	return new Promise((e, n) => {
		let i = () => t?.removeEventListener("abort", s), a = setTimeout(() => {
			i(), e();
		}, o), s = () => {
			clearTimeout(a), i(), n(new r("Task polling aborted", "aborted"));
		};
		t?.addEventListener("abort", s, { once: !0 });
	});
}
//#endregion
//#region src/canvas/infrastructure/rollout.ts
async function v(e = fetch) {
	try {
		let t = await n(e, "/api/canvas-rollout", {}, { timeoutMs: 1500 });
		if (!t || typeof t != "object") return null;
		let r = t;
		if (typeof r.enabled != "boolean" || typeof r.kill_switch != "boolean") return null;
		let i = x(r.effective_percentage), a = x(r.configured_percentage);
		return i === null || a === null ? null : {
			blocked_reasons: Array.isArray(r.blocked_reasons) ? r.blocked_reasons.filter((e) => typeof e == "string") : [],
			configured_percentage: a,
			effective_percentage: i,
			enabled: r.enabled,
			kill_switch: r.kill_switch,
			version: typeof r.version == "number" ? r.version : 1
		};
	} catch {
		return null;
	}
}
function y(e, t, n, r = null) {
	let i = new URLSearchParams(e), a = i.get("canvas_v2"), o = S(i.get("canvas_v2_rollout")), s = S(C(t, "canvasV2RolloutPercentage")), c = r !== null, l = r?.blocked_reasons ?? [], u = ee(n || "anonymous");
	if (r?.kill_switch) return b(u, !1, !1, 0, "server", !0, l, !0);
	let d = r?.effective_percentage ?? s ?? 0, f = r ? "server" : s === null ? "default" : "storage", p = o ?? d;
	return a === "1" || a === "0" ? b(u, a === "1", !0, p, "query", c, l, !1) : b(u, u < p, !1, p, o === null ? f : "query", c, l, !1);
}
function b(e, t, n, r, i, a, o, s) {
	return {
		blockedReasons: [...o],
		bucket: e,
		enabled: t,
		forced: n,
		killSwitch: s,
		percentage: r,
		policyLoaded: a,
		source: i
	};
}
function x(e) {
	return typeof e == "number" && Number.isFinite(e) ? Math.max(0, Math.min(100, Math.floor(e))) : null;
}
function S(e) {
	if (e === null || e.trim() === "") return null;
	let t = Number(e);
	return Number.isFinite(t) ? Math.max(0, Math.min(100, Math.floor(t))) : null;
}
function ee(e) {
	let t = 2166136261;
	for (let n = 0; n < e.length; n += 1) t ^= e.charCodeAt(n), t = Math.imul(t, 16777619);
	return (t >>> 0) % 100;
}
function C(e, t) {
	try {
		return e?.getItem(t) ?? null;
	} catch {
		return null;
	}
}
//#endregion
//#region src/main.ts
var w = new URLSearchParams(window.location.search), te = await v(), T = y(window.location.search, window.localStorage, window.sessionStorage.getItem("canvasClientId") || window.location.pathname, te), E = w.get("canvas_modern_core"), D = E === "execution-shadow", O = E === "graph-order", k = E === "shadow", A = w.get("canvas_m2") === "1" || w.get("canvas_m2") === null && T.enabled, j = A || w.get("canvas_execution_engine") === "1", M = A || w.get("canvas_task_client") === "1", N = A || w.get("canvas_repository") === "1", P = j && M && N, F = w.get("canvas_react_islands") === "1", I = F || w.get("canvas_react_activity") === "1", L = F || w.get("canvas_react_execution") === "1", R = F || w.get("canvas_react_status") === "1", z = F || w.get("canvas_react_toolbar") === "1", B = w.get("canvas_board_v2") === "1" || w.get("canvas_board_v2") === null && T.enabled, V = m(), H = a(), U = /* @__PURE__ */ new Map(), W = 0, G = 0, K = [], q = 0, J = 0, Y = /* @__PURE__ */ new Map(), X = {
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
	version: 27,
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
		return j ? l(e.targetId, e.order, e.execute, {
			mode: e.mode,
			signal: e.signal,
			onTransition: $
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	runParallel(e) {
		return j ? u(e.targetId, e.order, e.rounds, e.execute, {
			limit: e.limit,
			roundId: e.roundId,
			signal: e.signal,
			onTransition: $
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	observeExecution(e) {
		if (D) try {
			let t = U.get(e.targetId) ?? o();
			e.phase === "begin" ? (t = s(t, {
				type: "queue",
				targetId: e.targetId,
				order: e.order,
				mode: e.mode
			}), t = s(t, { type: "start" })) : t = e.phase === "node-start" ? s(t, {
				type: "node-start",
				nodeId: e.nodeId,
				roundId: e.roundId
			}) : e.phase === "node-done" ? s(t, {
				type: "node-done",
				nodeId: e.nodeId,
				roundId: e.roundId
			}) : e.phase === "stop" ? s(t, { type: "request-stop" }) : s(t, {
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
		return i(e, t, n);
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
	e && t && import("./canvas-board-v2-3yonz2t4.js").then(({ mountCanvasBoardV2: n }) => {
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
document.documentElement.dataset.canvasModernCore = "27", document.documentElement.dataset.canvasBoardV2 = B ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionEngine = j ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionShadow = D ? "enabled" : "disabled", document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? "ready" : "missing", document.documentElement.dataset.canvasModernGraphOrder = O ? "enabled" : "disabled", document.documentElement.dataset.canvasModernM2 = P ? "enabled" : "disabled", document.documentElement.dataset.canvasModernRepository = N ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactActivity = I ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactExecution = L ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactIslands = F ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactStatus = R ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactToolbar = z ? "enabled" : "disabled", document.documentElement.dataset.canvasModernShadow = k ? "enabled" : "disabled", document.documentElement.dataset.canvasModernTaskClient = M ? "enabled" : "disabled", document.documentElement.dataset.canvasV2Rollout = T.enabled ? "enabled" : "disabled", document.documentElement.dataset.canvasV2RolloutBucket = String(T.bucket), document.documentElement.dataset.canvasV2RolloutBlocked = T.blockedReasons.join(",") || "none", document.documentElement.dataset.canvasV2RolloutPercentage = String(T.percentage), document.documentElement.dataset.canvasV2RolloutPolicy = T.policyLoaded ? "loaded" : "fallback", window.dispatchEvent(new CustomEvent("canvas-modern-core-ready"));
//#endregion
