import { n as e, t } from "./graph-j9GyzERh.js";
import { i as n, n as r, r as i } from "./canvas-repository-qZo_3rR8.js";
//#region src/canvas/domain/execution.ts
function a() {
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
function o(e, t) {
	if (t.type === "queue") {
		if ([
			"idle",
			"done",
			"failed",
			"stopped"
		].includes(e.status) || u(e, t), !t.targetId || !t.order.length) throw Error("Execution queue requires a target and order");
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
	if (t.type === "start") return e.status !== "queued" && u(e, t), {
		...e,
		status: "running"
	};
	if (t.type === "request-stop") return e.status === "stopping" ? e : (e.status !== "running" && u(e, t), {
		...e,
		status: "stopping"
	});
	if (t.type === "node-start") {
		if (e.mode === "parallel") return s(e, t);
		(e.status !== "running" || e.currentNodeId) && u(e, t);
		let n = e.completedNodeIds.length === e.order.length ? [] : e.completedNodeIds, r = e.order[n.length];
		if (t.nodeId !== r) throw Error(`Expected execution node ${r || "<none>"}`);
		return {
			...e,
			completedNodeIds: n,
			currentNodeId: t.nodeId
		};
	}
	if (t.type === "node-done") {
		if (e.mode === "parallel") return s(e, t);
		(!["running", "stopping"].includes(e.status) || e.currentNodeId !== t.nodeId) && u(e, t);
		let n = [...e.completedNodeIds, t.nodeId];
		return {
			...e,
			completedNodeIds: n,
			completedRounds: e.completedRounds + +(n.length === e.order.length),
			currentNodeId: ""
		};
	}
	return e.status !== "running" && e.status !== "stopping" && u(e, t), e.status === "stopping" && t.status === "done" && u(e, t), {
		...e,
		error: t.error || "",
		status: t.status
	};
}
function s(e, t) {
	t.roundId || u(e, t);
	let n = e.rounds[t.roundId] ?? {
		completedNodeIds: [],
		currentNodeId: ""
	};
	if (t.type === "node-start") {
		e.status !== "running" && u(e, t), n.currentNodeId && u(e, t);
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
	["running", "stopping"].includes(e.status) || u(e, t), n.currentNodeId !== t.nodeId && u(e, t);
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
async function c(e, t, n, r = {}) {
	let { mode: i = "serial", onTransition: o, signal: s } = r, c = d(a(), {
		type: "queue",
		targetId: e,
		order: [...t],
		mode: i
	}, o);
	c = d(c, { type: "start" }, o);
	let l = () => (c.status === "running" && (c = d(c, { type: "request-stop" }, o)), d(c, {
		type: "finish",
		status: "stopped"
	}, o));
	for (let e of t) {
		if (s?.aborted) return l();
		c = d(c, {
			type: "node-start",
			nodeId: e
		}, o);
		try {
			await n(e, s);
		} catch (e) {
			return s?.aborted ? l() : d(c, {
				type: "finish",
				status: "failed",
				error: e instanceof Error ? e.message : String(e)
			}, o);
		}
		if (s?.aborted) return c = d(c, { type: "request-stop" }, o), c = d(c, {
			type: "node-done",
			nodeId: e
		}, o), l();
		c = d(c, {
			type: "node-done",
			nodeId: e
		}, o);
	}
	return d(c, {
		type: "finish",
		status: "done"
	}, o);
}
async function l(e, t, n, r, i = {}) {
	let { onTransition: o, signal: s } = i, c = n.map((e, t) => ({
		id: i.roundId?.(e, t) || String(t + 1),
		round: e
	}));
	if (new Set(c.map(({ id: e }) => e)).size !== c.length) throw Error("Parallel execution round IDs must be unique");
	let l = d(a(), {
		type: "queue",
		targetId: e,
		order: [...t],
		mode: "parallel"
	}, o);
	l = d(l, { type: "start" }, o);
	let u = null, f = 0, p = () => {
		l.status === "running" && (l = d(l, { type: "request-stop" }, o));
	}, m = Math.max(1, Math.min(Math.floor(i.limit || 1), c.length || 1)), h = Array.from({ length: m }, async () => {
		for (; !u && !s?.aborted && f < c.length;) {
			let { id: e, round: n } = c[f++];
			for (let i of t) {
				if (u || s?.aborted) break;
				l = d(l, {
					type: "node-start",
					nodeId: i,
					roundId: e
				}, o);
				try {
					await r(i, n, s);
				} catch (e) {
					s?.aborted ? p() : u ||= e;
					break;
				}
				s?.aborted && p(), l = d(l, {
					type: "node-done",
					nodeId: i,
					roundId: e
				}, o);
			}
		}
	});
	return await Promise.all(h), s?.aborted ? (p(), d(l, {
		type: "finish",
		status: "stopped"
	}, o)) : u ? d(l, {
		type: "finish",
		status: "failed",
		error: u instanceof Error ? u.message : String(u)
	}, o) : d(l, {
		type: "finish",
		status: "done"
	}, o);
}
function u(e, t) {
	throw Error(`Invalid execution transition: ${e.status} -> ${t.type}`);
}
function d(e, t, n) {
	let r = o(e, t);
	return n?.(r, t), r;
}
//#endregion
//#region src/canvas/infrastructure/task-client.ts
var f = {
	image: "/api/canvas-image-tasks",
	video: "/api/canvas-video-tasks"
};
function p(e = fetch) {
	let t = /* @__PURE__ */ new Map(), r = {
		cancelledWatches: 0,
		deduplicatedWatches: 0,
		pollErrors: 0,
		polls: 0,
		submissions: 0
	}, a = async (t, i, a) => {
		let o = await n(e, f[t], {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(i ?? {})
		}, a);
		return m(o), r.submissions += 1, o;
	}, o = (t, r, i) => r ? n(e, `${f[t]}/${encodeURIComponent(r)}`, {}, i) : Promise.reject(/* @__PURE__ */ TypeError("Task ID is required")), s = async (e, t, n = {}) => {
		let { intervalMs: a = e === "video" ? 2500 : 1800, maxPollErrors: s = 3, requestTimeoutMs: c = 3e4 } = n, l = Date.now(), u = 0;
		for (;;) {
			h(n.signal, l, n.timeoutMs);
			try {
				r.polls += 1;
				let i = await o(e, t, {
					signal: n.signal,
					timeoutMs: c
				});
				if (u = 0, i.status === "succeeded" || i.status === "failed" || i.status === "cancelled") return i;
			} catch (e) {
				if (r.pollErrors += 1, !(e instanceof i) || !e.retryable || u++ >= s) throw e;
			}
			await g(a, n.signal, l, n.timeoutMs);
		}
	}, c = (e, n, i = {}) => {
		let a = `${e}:${n}`, o = t.get(a);
		if (o) return r.deduplicatedWatches += 1, o.promise;
		let c = new AbortController(), l = () => c.abort(i.signal?.reason);
		i.signal?.aborted ? l() : i.signal?.addEventListener("abort", l, { once: !0 });
		let u = s(e, n, {
			...i,
			signal: c.signal
		}).finally(() => {
			i.signal?.removeEventListener("abort", l), t.delete(a);
		});
		return t.set(a, {
			controller: c,
			promise: u
		}), u;
	};
	return {
		cancel: (e, n) => {
			let i = t.get(`${e}:${n}`);
			return i ? (i.controller.abort(), r.cancelledWatches += 1, !0) : !1;
		},
		get: o,
		getDiagnostics: () => ({
			activeWatches: t.size,
			...r
		}),
		resume: (e, t) => Promise.allSettled(e.map(({ kind: e, id: n }) => c(e, n, t))),
		submit: a,
		wait: s,
		waitForResult: async (e, t, n) => {
			let r = await s(e, t, n);
			if (r.status !== "succeeded") throw new i(r.error || "Task failed", "task-failed", 0, r);
			return r.result;
		},
		watch: c
	};
}
function m(e) {
	let t = String(e.task_id || e.id || "");
	if (!t) throw new i("Task response did not include an ID", "validation", 200, e);
	return t;
}
function h(e, t, n = 0) {
	if (e?.aborted) throw new i("Task polling aborted", "aborted");
	if (n > 0 && Date.now() - t >= n) throw new i("Task polling timed out", "timeout");
}
function g(e, t, n, r = 0) {
	h(t, n, r);
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
//#region src/main.ts
var _ = new URLSearchParams(window.location.search), v = _.get("canvas_modern_core"), y = v === "execution-shadow", b = v === "graph-order", x = v === "shadow", S = _.get("canvas_m2") === "1", C = S || _.get("canvas_execution_engine") === "1", w = S || _.get("canvas_task_client") === "1", T = S || _.get("canvas_repository") === "1", E = C && w && T, D = _.get("canvas_react_islands") === "1", O = D || _.get("canvas_react_activity") === "1", k = D || _.get("canvas_react_execution") === "1", A = D || _.get("canvas_react_status") === "1", j = D || _.get("canvas_react_toolbar") === "1", M = _.get("canvas_board_v2") === "1", N = p(), P = r(), F = /* @__PURE__ */ new Map(), I = 0, L = 0, R = [], z = 0, B = 0, V = /* @__PURE__ */ new Map(), H = {
	done: 0,
	failed: 0,
	stopped: 0
}, U = 0;
function W(n, r, i) {
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
	version: 22,
	canvasRepository: P,
	canvasRepositoryEnabled: T,
	executionEngineEnabled: C,
	m2Enabled: E,
	taskClient: N,
	taskClientEnabled: w,
	activeOrder(n, r) {
		if (!b) return null;
		try {
			let i = window.CanvasLegacyBridge?.getDocumentSnapshot();
			if (!i) return null;
			let a = t(e(i));
			return n === "cascade" ? a.cascadeOrder(r) : a.retryCascadeOrder(r);
		} catch (e) {
			return console.warn("[canvas-modern-core] active graph order failed; using legacy order", e), null;
		}
	},
	compareOrder: W,
	runOrdered(e) {
		return C ? c(e.targetId, e.order, e.execute, {
			mode: e.mode,
			signal: e.signal,
			onTransition: G
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	runParallel(e) {
		return C ? l(e.targetId, e.order, e.rounds, e.execute, {
			limit: e.limit,
			roundId: e.roundId,
			signal: e.signal,
			onTransition: G
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	observeExecution(e) {
		if (y) try {
			let t = F.get(e.targetId) ?? a();
			e.phase === "begin" ? (t = o(t, {
				type: "queue",
				targetId: e.targetId,
				order: e.order,
				mode: e.mode
			}), t = o(t, { type: "start" })) : t = e.phase === "node-start" ? o(t, {
				type: "node-start",
				nodeId: e.nodeId,
				roundId: e.roundId
			}) : e.phase === "node-done" ? o(t, {
				type: "node-done",
				nodeId: e.nodeId,
				roundId: e.roundId
			}) : e.phase === "stop" ? o(t, { type: "request-stop" }) : o(t, {
				type: "finish",
				status: e.status,
				error: e.error
			}), F.set(e.targetId, t), I += 1;
		} catch (t) {
			L += 1, console.warn("[canvas-modern-core] execution shadow transition failed", t, e);
		}
	},
	observeOrder(e, t, n) {
		if (x) try {
			let r = W(e, t, n);
			if (!r) return;
			z += 1, r.matches || (R.length < 50 && R.push(r), console.warn("[canvas-modern-core] graph order mismatch", r));
		} catch (e) {
			B += 1, console.warn("[canvas-modern-core] graph shadow check failed", e);
		}
	},
	getShadowReport() {
		return {
			enabled: x,
			checks: z,
			errors: B,
			mismatches: R.map((e) => ({
				...e,
				legacy: [...e.legacy],
				modern: [...e.modern]
			}))
		};
	},
	getExecutionShadowReport() {
		return {
			enabled: y,
			errors: L,
			events: I,
			runs: [...F.values()].map((e) => ({
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
			enabled: E,
			execution: {
				active: [...V.values()].filter(({ status: e }) => ![
					"done",
					"failed",
					"stopped"
				].includes(e)).length,
				...H,
				transitions: U
			},
			flags: {
				executionEngine: C,
				repository: T,
				taskClient: w
			},
			repository: P.getDiagnostics(),
			tasks: N.getDiagnostics()
		};
	}
}), k) {
	let e = document.getElementById("canvasExecutionIsland");
	e && import("./react-execution-entry-BvXNr52W.js").then(({ mountReactExecutionIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React execution island failed to load", e));
}
if (A) {
	let e = document.getElementById("canvasStatusIsland");
	e && import("./react-execution-entry-BvXNr52W.js").then(({ mountReactStatusIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React status island failed to load", e));
}
if (j) {
	let e = document.getElementById("canvasToolbarIsland");
	e && import("./react-execution-entry-BvXNr52W.js").then(({ mountReactToolbarIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React toolbar island failed to load", e));
}
if (O) {
	let e = document.getElementById("canvasActivityIsland");
	e && import("./react-execution-entry-BvXNr52W.js").then(({ mountReactActivityIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React activity island failed to load", e));
}
if (M) {
	let e = document.getElementById("canvasBoardV2"), t = document.getElementById("board");
	e && t && import("./canvas-board-v2-MKB4bx64.js").then(({ mountCanvasBoardV2: n }) => {
		let r = n(e, t);
		window.addEventListener("pagehide", r, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] CanvasBoard V2 failed to load; using Legacy Board", e));
}
function G(e, t) {
	U += 1, V.set(e.targetId, e), t.type === "finish" && (H[t.status] += 1), window.dispatchEvent(new CustomEvent("canvas-modern-execution", { detail: {
		event: t,
		state: e
	} }));
}
document.documentElement.dataset.canvasModernCore = "22", document.documentElement.dataset.canvasBoardV2 = M ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionEngine = C ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionShadow = y ? "enabled" : "disabled", document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? "ready" : "missing", document.documentElement.dataset.canvasModernGraphOrder = b ? "enabled" : "disabled", document.documentElement.dataset.canvasModernM2 = E ? "enabled" : "disabled", document.documentElement.dataset.canvasModernRepository = T ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactActivity = O ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactExecution = k ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactIslands = D ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactStatus = A ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactToolbar = j ? "enabled" : "disabled", document.documentElement.dataset.canvasModernShadow = x ? "enabled" : "disabled", document.documentElement.dataset.canvasModernTaskClient = w ? "enabled" : "disabled", window.dispatchEvent(new CustomEvent("canvas-modern-core-ready"));
//#endregion
