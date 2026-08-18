import { t as e } from "./document-codec-CBLn8Zq0.js";
//#region src/canvas/domain/execution.ts
function t() {
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
function n(e, t) {
	if (t.type === "queue") {
		if ([
			"idle",
			"done",
			"failed",
			"stopped"
		].includes(e.status) || o(e, t), !t.targetId || !t.order.length) throw Error("Execution queue requires a target and order");
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
	if (t.type === "start") return e.status !== "queued" && o(e, t), {
		...e,
		status: "running"
	};
	if (t.type === "request-stop") return e.status === "stopping" ? e : (e.status !== "running" && o(e, t), {
		...e,
		status: "stopping"
	});
	if (t.type === "node-start") {
		if (e.mode === "parallel") return r(e, t);
		(e.status !== "running" || e.currentNodeId) && o(e, t);
		let n = e.completedNodeIds.length === e.order.length ? [] : e.completedNodeIds, i = e.order[n.length];
		if (t.nodeId !== i) throw Error(`Expected execution node ${i || "<none>"}`);
		return {
			...e,
			completedNodeIds: n,
			currentNodeId: t.nodeId
		};
	}
	if (t.type === "node-done") {
		if (e.mode === "parallel") return r(e, t);
		(!["running", "stopping"].includes(e.status) || e.currentNodeId !== t.nodeId) && o(e, t);
		let n = [...e.completedNodeIds, t.nodeId];
		return {
			...e,
			completedNodeIds: n,
			completedRounds: e.completedRounds + +(n.length === e.order.length),
			currentNodeId: ""
		};
	}
	return e.status !== "running" && e.status !== "stopping" && o(e, t), e.status === "stopping" && t.status === "done" && o(e, t), {
		...e,
		error: t.error || "",
		status: t.status
	};
}
function r(e, t) {
	t.roundId || o(e, t);
	let n = e.rounds[t.roundId] ?? {
		completedNodeIds: [],
		currentNodeId: ""
	};
	if (t.type === "node-start") {
		e.status !== "running" && o(e, t), n.currentNodeId && o(e, t);
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
	["running", "stopping"].includes(e.status) || o(e, t), n.currentNodeId !== t.nodeId && o(e, t);
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
async function i(e, n, r, i = {}) {
	let { mode: a = "serial", onTransition: o, signal: c } = i, l = s(t(), {
		type: "queue",
		targetId: e,
		order: [...n],
		mode: a
	}, o);
	l = s(l, { type: "start" }, o);
	let u = () => (l.status === "running" && (l = s(l, { type: "request-stop" }, o)), s(l, {
		type: "finish",
		status: "stopped"
	}, o));
	for (let e of n) {
		if (c?.aborted) return u();
		l = s(l, {
			type: "node-start",
			nodeId: e
		}, o);
		try {
			await r(e, c);
		} catch (e) {
			return c?.aborted ? u() : s(l, {
				type: "finish",
				status: "failed",
				error: e instanceof Error ? e.message : String(e)
			}, o);
		}
		if (c?.aborted) return l = s(l, { type: "request-stop" }, o), l = s(l, {
			type: "node-done",
			nodeId: e
		}, o), u();
		l = s(l, {
			type: "node-done",
			nodeId: e
		}, o);
	}
	return s(l, {
		type: "finish",
		status: "done"
	}, o);
}
async function a(e, n, r, i, a = {}) {
	let { onTransition: o, signal: c } = a, l = r.map((e, t) => ({
		id: a.roundId?.(e, t) || String(t + 1),
		round: e
	}));
	if (new Set(l.map(({ id: e }) => e)).size !== l.length) throw Error("Parallel execution round IDs must be unique");
	let u = s(t(), {
		type: "queue",
		targetId: e,
		order: [...n],
		mode: "parallel"
	}, o);
	u = s(u, { type: "start" }, o);
	let d = null, f = 0, p = () => {
		u.status === "running" && (u = s(u, { type: "request-stop" }, o));
	}, m = Math.max(1, Math.min(Math.floor(a.limit || 1), l.length || 1)), h = Array.from({ length: m }, async () => {
		for (; !d && !c?.aborted && f < l.length;) {
			let { id: e, round: t } = l[f++];
			for (let r of n) {
				if (d || c?.aborted) break;
				u = s(u, {
					type: "node-start",
					nodeId: r,
					roundId: e
				}, o);
				try {
					await i(r, t, c);
				} catch (e) {
					c?.aborted ? p() : d ||= e;
					break;
				}
				c?.aborted && p(), u = s(u, {
					type: "node-done",
					nodeId: r,
					roundId: e
				}, o);
			}
		}
	});
	return await Promise.all(h), c?.aborted ? (p(), s(u, {
		type: "finish",
		status: "stopped"
	}, o)) : d ? s(u, {
		type: "finish",
		status: "failed",
		error: d instanceof Error ? d.message : String(d)
	}, o) : s(u, {
		type: "finish",
		status: "done"
	}, o);
}
function o(e, t) {
	throw Error(`Invalid execution transition: ${e.status} -> ${t.type}`);
}
function s(e, t, r) {
	let i = n(e, t);
	return r?.(i, t), i;
}
//#endregion
//#region src/canvas/domain/graph.ts
var c = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"llm",
	"video"
]);
function l(e, t = c) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e.nodes) n.has(t.id) || n.set(t.id, t);
	let r = u(e.connections, "to"), i = u(e.connections, "from");
	function a(e) {
		let i = /* @__PURE__ */ new Set(), a = [];
		function o(e) {
			if (i.has(e)) return;
			i.add(e);
			let c = n.get(e);
			if (c) {
				for (let i of r.get(e) ?? []) {
					let e = n.get(i.from);
					e && (t.has(e.type) ? o(e.id) : e.type === "output" && s(e));
				}
				t.has(c.type) && a.push(e);
			}
		}
		function s(e) {
			for (let i of r.get(e.id) ?? []) {
				let e = n.get(i.from);
				e && t.has(e.type) && o(e.id);
			}
		}
		return o(e), a;
	}
	function o(e, t) {
		if (e === t) return !0;
		let n = /* @__PURE__ */ new Set(), r = [t];
		for (; r.length;) {
			let t = r.pop();
			if (t === e) return !0;
			if (!n.has(t)) {
				n.add(t);
				for (let e of i.get(t) ?? []) r.push(e.to);
			}
		}
		return !1;
	}
	function s(e) {
		let r = /* @__PURE__ */ new Set(), o = /* @__PURE__ */ new Set();
		function s(e) {
			if (r.has(e)) return;
			r.add(e);
			let a = n.get(e);
			if (a) {
				t.has(a.type) && o.add(e);
				for (let r of i.get(e) ?? []) {
					let e = n.get(r.to);
					e && (t.has(e.type) || e.type === "output") && s(e.id);
				}
			}
		}
		s(e);
		let c = [], l = /* @__PURE__ */ new Set();
		for (let e of o) for (let t of a(e)) o.has(t) && !l.has(t) && (l.add(t), c.push(t));
		return c;
	}
	return {
		cascadeOrder: a,
		retryCascadeOrder: s,
		wouldCreateCycle: o
	};
}
function u(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = n.get(r[t]);
		e ? e.push(r) : n.set(r[t], [r]);
	}
	return n;
}
//#endregion
//#region src/canvas/infrastructure/http.ts
var d = class extends Error {
	code;
	status;
	details;
	constructor(e, t, n = 0, r = null) {
		super(e), this.code = t, this.status = n, this.details = r, this.name = "ApiError";
	}
	get retryable() {
		return this.code === "network" || this.code === "server" || this.code === "timeout";
	}
};
async function f(e, t, n = {}, r = {}) {
	let i = new AbortController(), { signal: a, timeoutMs: o = 3e4 } = r, s = !1, c = () => i.abort(a?.reason);
	a?.aborted ? c() : a?.addEventListener("abort", c, { once: !0 });
	let l = o > 0 ? setTimeout(() => {
		s = !0, i.abort();
	}, o) : void 0;
	try {
		let r = await e(t, {
			...n,
			signal: i.signal
		}), a = await p(r);
		if (!r.ok) throw new d(h(a, r.statusText), m(r.status), r.status, a);
		return a;
	} catch (e) {
		throw e instanceof d ? e : s ? new d("Request timed out", "timeout") : a?.aborted || i.signal.aborted ? new d("Request aborted", "aborted") : new d(e instanceof Error ? e.message : String(e), "network");
	} finally {
		l && clearTimeout(l), a?.removeEventListener("abort", c);
	}
}
async function p(e) {
	let t = await e.text();
	if (!t) return {};
	try {
		return JSON.parse(t);
	} catch {
		return t;
	}
}
function m(e) {
	return e === 409 ? "conflict" : e === 404 ? "not-found" : e === 400 || e === 422 ? "validation" : e >= 500 ? "server" : "unknown";
}
function h(e, t) {
	if (typeof e == "string") return e || t;
	if (e && typeof e == "object") {
		let t = e, n = t.detail;
		if (typeof n == "string") return n;
		if (n && typeof n == "object" && typeof n.message == "string") return n.message;
		for (let e of ["message", "error"]) if (typeof t[e] == "string") return t[e];
	}
	return t || "Request failed";
}
//#endregion
//#region src/canvas/infrastructure/canvas-repository.ts
var g = class extends d {
	serverCanvas;
	updatedAt;
	constructor(e, t, n, r) {
		super(e, "conflict", 409, r), this.serverCanvas = t, this.updatedAt = n, this.name = "CanvasConflictError";
	}
};
function _(t = fetch) {
	let n = (e) => `/api/canvases/${encodeURIComponent(e)}`, r = {
		backupsCreated: 0,
		backupsListed: 0,
		backupsRestored: 0,
		conflicts: 0,
		errors: 0,
		loads: 0,
		saves: 0
	}, i = async (e, ...t) => {
		try {
			let n = await f(...t);
			return r[e] += 1, n;
		} catch (e) {
			throw (!(e instanceof d) || e.code !== "conflict") && (r.errors += 1), e;
		}
	};
	return {
		createBackup: (e, r) => i("backupsCreated", t, `${n(e)}/backup`, { method: "POST" }, r),
		get: async (r, a) => {
			let o = await i("loads", t, n(r), {}, a);
			return e(o.canvas);
		},
		getDiagnostics: () => ({ ...r }),
		listBackups: async (e, r) => {
			let a = await i("backupsListed", t, `${n(e)}/backups`, {}, r);
			return Array.isArray(a.backups) ? a.backups : [];
		},
		restoreBackup: async (r, a, o) => {
			let s = await i("backupsRestored", t, `${n(r)}/backups/${encodeURIComponent(a)}/restore`, { method: "POST" }, o);
			return e(s.canvas);
		},
		save: async (a, o, s) => {
			try {
				let r = await i("saves", t, n(a), {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(o)
				}, s);
				return e(r.canvas);
			} catch (t) {
				if (!(t instanceof d) || t.code !== "conflict") throw t;
				r.conflicts += 1;
				let n = v(t.details), i = n.canvas ? e(n.canvas) : null;
				throw new g(t.message, i, Number(n.updated_at || 0), t.details);
			}
		}
	};
}
function v(e) {
	if (!e || typeof e != "object") return {};
	let t = e.detail;
	return t && typeof t == "object" ? t : {};
}
//#endregion
//#region src/canvas/infrastructure/task-client.ts
var y = {
	image: "/api/canvas-image-tasks",
	video: "/api/canvas-video-tasks"
};
function b(e = fetch) {
	let t = /* @__PURE__ */ new Map(), n = {
		cancelledWatches: 0,
		deduplicatedWatches: 0,
		pollErrors: 0,
		polls: 0,
		submissions: 0
	}, r = async (t, r, i) => {
		let a = await f(e, y[t], {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(r ?? {})
		}, i);
		return x(a), n.submissions += 1, a;
	}, i = (t, n, r) => n ? f(e, `${y[t]}/${encodeURIComponent(n)}`, {}, r) : Promise.reject(/* @__PURE__ */ TypeError("Task ID is required")), a = async (e, t, r = {}) => {
		let { intervalMs: a = e === "video" ? 2500 : 1800, maxPollErrors: o = 3, requestTimeoutMs: s = 3e4 } = r, c = Date.now(), l = 0;
		for (;;) {
			S(r.signal, c, r.timeoutMs);
			try {
				n.polls += 1;
				let a = await i(e, t, {
					signal: r.signal,
					timeoutMs: s
				});
				if (l = 0, a.status === "succeeded" || a.status === "failed" || a.status === "cancelled") return a;
			} catch (e) {
				if (n.pollErrors += 1, !(e instanceof d) || !e.retryable || l++ >= o) throw e;
			}
			await C(a, r.signal, c, r.timeoutMs);
		}
	}, o = (e, r, i = {}) => {
		let o = `${e}:${r}`, s = t.get(o);
		if (s) return n.deduplicatedWatches += 1, s.promise;
		let c = new AbortController(), l = () => c.abort(i.signal?.reason);
		i.signal?.aborted ? l() : i.signal?.addEventListener("abort", l, { once: !0 });
		let u = a(e, r, {
			...i,
			signal: c.signal
		}).finally(() => {
			i.signal?.removeEventListener("abort", l), t.delete(o);
		});
		return t.set(o, {
			controller: c,
			promise: u
		}), u;
	};
	return {
		cancel: (e, r) => {
			let i = t.get(`${e}:${r}`);
			return i ? (i.controller.abort(), n.cancelledWatches += 1, !0) : !1;
		},
		get: i,
		getDiagnostics: () => ({
			activeWatches: t.size,
			...n
		}),
		resume: (e, t) => Promise.allSettled(e.map(({ kind: e, id: n }) => o(e, n, t))),
		submit: r,
		wait: a,
		waitForResult: async (e, t, n) => {
			let r = await a(e, t, n);
			if (r.status !== "succeeded") throw new d(r.error || "Task failed", "task-failed", 0, r);
			return r.result;
		},
		watch: o
	};
}
function x(e) {
	let t = String(e.task_id || e.id || "");
	if (!t) throw new d("Task response did not include an ID", "validation", 200, e);
	return t;
}
function S(e, t, n = 0) {
	if (e?.aborted) throw new d("Task polling aborted", "aborted");
	if (n > 0 && Date.now() - t >= n) throw new d("Task polling timed out", "timeout");
}
function C(e, t, n, r = 0) {
	S(t, n, r);
	let i = r > 0 ? Math.max(0, r - (Date.now() - n)) : e, a = Math.min(Math.max(0, e), i || e);
	return new Promise((e, n) => {
		let r = () => t?.removeEventListener("abort", o), i = setTimeout(() => {
			r(), e();
		}, a), o = () => {
			clearTimeout(i), r(), n(new d("Task polling aborted", "aborted"));
		};
		t?.addEventListener("abort", o, { once: !0 });
	});
}
//#endregion
//#region src/main.ts
var w = new URLSearchParams(window.location.search), T = w.get("canvas_modern_core"), E = T === "execution-shadow", D = T === "graph-order", O = T === "shadow", k = w.get("canvas_m2") === "1", A = k || w.get("canvas_execution_engine") === "1", j = k || w.get("canvas_task_client") === "1", M = k || w.get("canvas_repository") === "1", N = A && j && M, P = w.get("canvas_react_islands") === "1", F = P || w.get("canvas_react_activity") === "1", I = P || w.get("canvas_react_execution") === "1", L = P || w.get("canvas_react_status") === "1", R = P || w.get("canvas_react_toolbar") === "1", z = w.get("canvas_board_v2") === "1", B = b(), V = _(), H = /* @__PURE__ */ new Map(), U = 0, W = 0, G = [], K = 0, q = 0, J = /* @__PURE__ */ new Map(), Y = {
	done: 0,
	failed: 0,
	stopped: 0
}, X = 0;
function Z(t, n, r) {
	let i = window.CanvasLegacyBridge, a = i?.getDocumentSnapshot();
	if (!i || !a) return null;
	let o = l(e(a)), s = t === "cascade" ? o.cascadeOrder(n) : o.retryCascadeOrder(n), c = r ?? (t === "cascade" ? i.computeCascadeOrder(n) : i.computeRetryCascadeOrder(n));
	return {
		kind: t,
		legacy: [...c],
		modern: s,
		targetId: n,
		matches: c.length === s.length && c.every((e, t) => e === s[t])
	};
}
if (window.CanvasModernCore = Object.freeze({
	version: 16,
	canvasRepository: V,
	canvasRepositoryEnabled: M,
	executionEngineEnabled: A,
	m2Enabled: N,
	taskClient: B,
	taskClientEnabled: j,
	activeOrder(t, n) {
		if (!D) return null;
		try {
			let r = window.CanvasLegacyBridge?.getDocumentSnapshot();
			if (!r) return null;
			let i = l(e(r));
			return t === "cascade" ? i.cascadeOrder(n) : i.retryCascadeOrder(n);
		} catch (e) {
			return console.warn("[canvas-modern-core] active graph order failed; using legacy order", e), null;
		}
	},
	compareOrder: Z,
	runOrdered(e) {
		return A ? i(e.targetId, e.order, e.execute, {
			mode: e.mode,
			signal: e.signal,
			onTransition: Q
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	runParallel(e) {
		return A ? a(e.targetId, e.order, e.rounds, e.execute, {
			limit: e.limit,
			roundId: e.roundId,
			signal: e.signal,
			onTransition: Q
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	observeExecution(e) {
		if (E) try {
			let r = H.get(e.targetId) ?? t();
			e.phase === "begin" ? (r = n(r, {
				type: "queue",
				targetId: e.targetId,
				order: e.order,
				mode: e.mode
			}), r = n(r, { type: "start" })) : r = e.phase === "node-start" ? n(r, {
				type: "node-start",
				nodeId: e.nodeId,
				roundId: e.roundId
			}) : e.phase === "node-done" ? n(r, {
				type: "node-done",
				nodeId: e.nodeId,
				roundId: e.roundId
			}) : e.phase === "stop" ? n(r, { type: "request-stop" }) : n(r, {
				type: "finish",
				status: e.status,
				error: e.error
			}), H.set(e.targetId, r), U += 1;
		} catch (t) {
			W += 1, console.warn("[canvas-modern-core] execution shadow transition failed", t, e);
		}
	},
	observeOrder(e, t, n) {
		if (O) try {
			let r = Z(e, t, n);
			if (!r) return;
			K += 1, r.matches || (G.length < 50 && G.push(r), console.warn("[canvas-modern-core] graph order mismatch", r));
		} catch (e) {
			q += 1, console.warn("[canvas-modern-core] graph shadow check failed", e);
		}
	},
	getShadowReport() {
		return {
			enabled: O,
			checks: K,
			errors: q,
			mismatches: G.map((e) => ({
				...e,
				legacy: [...e.legacy],
				modern: [...e.modern]
			}))
		};
	},
	getExecutionShadowReport() {
		return {
			enabled: E,
			errors: W,
			events: U,
			runs: [...H.values()].map((e) => ({
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
			enabled: N,
			execution: {
				active: [...J.values()].filter(({ status: e }) => ![
					"done",
					"failed",
					"stopped"
				].includes(e)).length,
				...Y,
				transitions: X
			},
			flags: {
				executionEngine: A,
				repository: M,
				taskClient: j
			},
			repository: V.getDiagnostics(),
			tasks: B.getDiagnostics()
		};
	}
}), I) {
	let e = document.getElementById("canvasExecutionIsland");
	e && import("./react-execution-entry-1p86ZWGb.js").then(({ mountReactExecutionIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React execution island failed to load", e));
}
if (L) {
	let e = document.getElementById("canvasStatusIsland");
	e && import("./react-execution-entry-1p86ZWGb.js").then(({ mountReactStatusIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React status island failed to load", e));
}
if (R) {
	let e = document.getElementById("canvasToolbarIsland");
	e && import("./react-execution-entry-1p86ZWGb.js").then(({ mountReactToolbarIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React toolbar island failed to load", e));
}
if (F) {
	let e = document.getElementById("canvasActivityIsland");
	e && import("./react-execution-entry-1p86ZWGb.js").then(({ mountReactActivityIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React activity island failed to load", e));
}
if (z) {
	let e = document.getElementById("canvasBoardV2"), t = document.getElementById("board");
	e && t && import("./canvas-board-v2-fwQxTQIr.js").then(({ mountCanvasBoardV2: n }) => {
		let r = n(e, t);
		window.addEventListener("pagehide", r, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] CanvasBoard V2 failed to load; using Legacy Board", e));
}
function Q(e, t) {
	X += 1, J.set(e.targetId, e), t.type === "finish" && (Y[t.status] += 1), window.dispatchEvent(new CustomEvent("canvas-modern-execution", { detail: {
		event: t,
		state: e
	} }));
}
document.documentElement.dataset.canvasModernCore = "16", document.documentElement.dataset.canvasBoardV2 = z ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionEngine = A ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionShadow = E ? "enabled" : "disabled", document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? "ready" : "missing", document.documentElement.dataset.canvasModernGraphOrder = D ? "enabled" : "disabled", document.documentElement.dataset.canvasModernM2 = N ? "enabled" : "disabled", document.documentElement.dataset.canvasModernRepository = M ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactActivity = F ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactExecution = I ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactIslands = P ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactStatus = L ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactToolbar = R ? "enabled" : "disabled", document.documentElement.dataset.canvasModernShadow = O ? "enabled" : "disabled", document.documentElement.dataset.canvasModernTaskClient = j ? "enabled" : "disabled", window.dispatchEvent(new CustomEvent("canvas-modern-core-ready"));
//#endregion
