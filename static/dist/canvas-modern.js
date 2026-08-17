//#region src/canvas/domain/document-codec.ts
function e(e, t) {
	if (!e || typeof e != "object" || Array.isArray(e)) throw TypeError(`${t} must be an object`);
	return e;
}
function t(t, n) {
	let r = e(t, `nodes[${n}]`);
	if (typeof r.id != "string" || !r.id) throw TypeError(`nodes[${n}].id must be a non-empty string`);
	if (typeof r.type != "string" || !r.type) throw TypeError(`nodes[${n}].type must be a non-empty string`);
	return r;
}
function n(t, n) {
	let r = e(t, `connections[${n}]`);
	if (typeof r.from != "string" || !r.from) throw TypeError(`connections[${n}].from must be a non-empty string`);
	if (typeof r.to != "string" || !r.to) throw TypeError(`connections[${n}].to must be a non-empty string`);
	return r;
}
function r(e) {
	return JSON.parse(JSON.stringify(e));
}
function i(i) {
	let a = r(e(i, "document")), o = a.nodes ?? [], s = a.connections ?? [];
	if (!Array.isArray(o)) throw TypeError("document.nodes must be an array");
	if (!Array.isArray(s)) throw TypeError("document.connections must be an array");
	let c = Number(a.schemaVersion ?? 1);
	if (!Number.isInteger(c) || c < 1) throw TypeError("document.schemaVersion must be a positive integer");
	return {
		...a,
		schemaVersion: c,
		nodes: o.map(t),
		connections: s.map(n)
	};
}
//#endregion
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
//#region src/canvas/domain/graph.ts
var f = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"llm",
	"video"
]);
function p(e, t = f) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e.nodes) n.has(t.id) || n.set(t.id, t);
	let r = m(e.connections, "to"), i = m(e.connections, "from");
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
function m(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = n.get(r[t]);
		e ? e.push(r) : n.set(r[t], [r]);
	}
	return n;
}
//#endregion
//#region src/canvas/infrastructure/http.ts
var h = class extends Error {
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
async function g(e, t, n = {}, r = {}) {
	let i = new AbortController(), { signal: a, timeoutMs: o = 3e4 } = r, s = !1, c = () => i.abort(a?.reason);
	a?.aborted ? c() : a?.addEventListener("abort", c, { once: !0 });
	let l = o > 0 ? setTimeout(() => {
		s = !0, i.abort();
	}, o) : void 0;
	try {
		let r = await e(t, {
			...n,
			signal: i.signal
		}), a = await _(r);
		if (!r.ok) throw new h(y(a, r.statusText), v(r.status), r.status, a);
		return a;
	} catch (e) {
		throw e instanceof h ? e : s ? new h("Request timed out", "timeout") : a?.aborted || i.signal.aborted ? new h("Request aborted", "aborted") : new h(e instanceof Error ? e.message : String(e), "network");
	} finally {
		l && clearTimeout(l), a?.removeEventListener("abort", c);
	}
}
async function _(e) {
	let t = await e.text();
	if (!t) return {};
	try {
		return JSON.parse(t);
	} catch {
		return t;
	}
}
function v(e) {
	return e === 409 ? "conflict" : e === 404 ? "not-found" : e === 400 || e === 422 ? "validation" : e >= 500 ? "server" : "unknown";
}
function y(e, t) {
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
var b = class extends h {
	serverCanvas;
	updatedAt;
	constructor(e, t, n, r) {
		super(e, "conflict", 409, r), this.serverCanvas = t, this.updatedAt = n, this.name = "CanvasConflictError";
	}
};
function x(e = fetch) {
	let t = (e) => `/api/canvases/${encodeURIComponent(e)}`, n = {
		backupsCreated: 0,
		backupsListed: 0,
		backupsRestored: 0,
		conflicts: 0,
		errors: 0,
		loads: 0,
		saves: 0
	}, r = async (e, ...t) => {
		try {
			let r = await g(...t);
			return n[e] += 1, r;
		} catch (e) {
			throw (!(e instanceof h) || e.code !== "conflict") && (n.errors += 1), e;
		}
	};
	return {
		createBackup: (n, i) => r("backupsCreated", e, `${t(n)}/backup`, { method: "POST" }, i),
		get: async (n, a) => i((await r("loads", e, t(n), {}, a)).canvas),
		getDiagnostics: () => ({ ...n }),
		listBackups: async (n, i) => {
			let a = await r("backupsListed", e, `${t(n)}/backups`, {}, i);
			return Array.isArray(a.backups) ? a.backups : [];
		},
		restoreBackup: async (n, a, o) => i((await r("backupsRestored", e, `${t(n)}/backups/${encodeURIComponent(a)}/restore`, { method: "POST" }, o)).canvas),
		save: async (a, o, s) => {
			try {
				return i((await r("saves", e, t(a), {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(o)
				}, s)).canvas);
			} catch (e) {
				if (!(e instanceof h) || e.code !== "conflict") throw e;
				n.conflicts += 1;
				let t = S(e.details), r = t.canvas ? i(t.canvas) : null;
				throw new b(e.message, r, Number(t.updated_at || 0), e.details);
			}
		}
	};
}
function S(e) {
	if (!e || typeof e != "object") return {};
	let t = e.detail;
	return t && typeof t == "object" ? t : {};
}
//#endregion
//#region src/canvas/infrastructure/task-client.ts
var C = {
	image: "/api/canvas-image-tasks",
	video: "/api/canvas-video-tasks"
};
function w(e = fetch) {
	let t = /* @__PURE__ */ new Map(), n = {
		cancelledWatches: 0,
		deduplicatedWatches: 0,
		pollErrors: 0,
		polls: 0,
		submissions: 0
	}, r = async (t, r, i) => {
		let a = await g(e, C[t], {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(r ?? {})
		}, i);
		return T(a), n.submissions += 1, a;
	}, i = (t, n, r) => n ? g(e, `${C[t]}/${encodeURIComponent(n)}`, {}, r) : Promise.reject(/* @__PURE__ */ TypeError("Task ID is required")), a = async (e, t, r = {}) => {
		let { intervalMs: a = e === "video" ? 2500 : 1800, maxPollErrors: o = 3, requestTimeoutMs: s = 3e4 } = r, c = Date.now(), l = 0;
		for (;;) {
			E(r.signal, c, r.timeoutMs);
			try {
				n.polls += 1;
				let a = await i(e, t, {
					signal: r.signal,
					timeoutMs: s
				});
				if (l = 0, a.status === "succeeded" || a.status === "failed" || a.status === "cancelled") return a;
			} catch (e) {
				if (n.pollErrors += 1, !(e instanceof h) || !e.retryable || l++ >= o) throw e;
			}
			await D(a, r.signal, c, r.timeoutMs);
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
			if (r.status !== "succeeded") throw new h(r.error || "Task failed", "task-failed", 0, r);
			return r.result;
		},
		watch: o
	};
}
function T(e) {
	let t = String(e.task_id || e.id || "");
	if (!t) throw new h("Task response did not include an ID", "validation", 200, e);
	return t;
}
function E(e, t, n = 0) {
	if (e?.aborted) throw new h("Task polling aborted", "aborted");
	if (n > 0 && Date.now() - t >= n) throw new h("Task polling timed out", "timeout");
}
function D(e, t, n, r = 0) {
	E(t, n, r);
	let i = r > 0 ? Math.max(0, r - (Date.now() - n)) : e, a = Math.min(Math.max(0, e), i || e);
	return new Promise((e, n) => {
		let r = () => t?.removeEventListener("abort", o), i = setTimeout(() => {
			r(), e();
		}, a), o = () => {
			clearTimeout(i), r(), n(new h("Task polling aborted", "aborted"));
		};
		t?.addEventListener("abort", o, { once: !0 });
	});
}
//#endregion
//#region src/main.ts
var O = new URLSearchParams(window.location.search), k = O.get("canvas_modern_core"), A = k === "execution-shadow", j = k === "graph-order", M = k === "shadow", N = O.get("canvas_m2") === "1", P = N || O.get("canvas_execution_engine") === "1", F = N || O.get("canvas_task_client") === "1", I = N || O.get("canvas_repository") === "1", L = P && F && I, R = O.get("canvas_react_execution") === "1", z = w(), B = x(), V = /* @__PURE__ */ new Map(), H = 0, U = 0, W = [], G = 0, K = 0, q = /* @__PURE__ */ new Map(), J = {
	done: 0,
	failed: 0,
	stopped: 0
}, Y = 0;
function X(e, t, n) {
	let r = window.CanvasLegacyBridge, a = r?.getDocumentSnapshot();
	if (!r || !a) return null;
	let o = p(i(a)), s = e === "cascade" ? o.cascadeOrder(t) : o.retryCascadeOrder(t), c = n ?? (e === "cascade" ? r.computeCascadeOrder(t) : r.computeRetryCascadeOrder(t));
	return {
		kind: e,
		legacy: [...c],
		modern: s,
		targetId: t,
		matches: c.length === s.length && c.every((e, t) => e === s[t])
	};
}
if (window.CanvasModernCore = Object.freeze({
	version: 12,
	canvasRepository: B,
	canvasRepositoryEnabled: I,
	executionEngineEnabled: P,
	m2Enabled: L,
	taskClient: z,
	taskClientEnabled: F,
	activeOrder(e, t) {
		if (!j) return null;
		try {
			let n = window.CanvasLegacyBridge?.getDocumentSnapshot();
			if (!n) return null;
			let r = p(i(n));
			return e === "cascade" ? r.cascadeOrder(t) : r.retryCascadeOrder(t);
		} catch (e) {
			return console.warn("[canvas-modern-core] active graph order failed; using legacy order", e), null;
		}
	},
	compareOrder: X,
	runOrdered(e) {
		return P ? c(e.targetId, e.order, e.execute, {
			mode: e.mode,
			signal: e.signal,
			onTransition: Z
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	runParallel(e) {
		return P ? l(e.targetId, e.order, e.rounds, e.execute, {
			limit: e.limit,
			roundId: e.roundId,
			signal: e.signal,
			onTransition: Z
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	observeExecution(e) {
		if (A) try {
			let t = V.get(e.targetId) ?? a();
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
			}), V.set(e.targetId, t), H += 1;
		} catch (t) {
			U += 1, console.warn("[canvas-modern-core] execution shadow transition failed", t, e);
		}
	},
	observeOrder(e, t, n) {
		if (M) try {
			let r = X(e, t, n);
			if (!r) return;
			G += 1, r.matches || (W.length < 50 && W.push(r), console.warn("[canvas-modern-core] graph order mismatch", r));
		} catch (e) {
			K += 1, console.warn("[canvas-modern-core] graph shadow check failed", e);
		}
	},
	getShadowReport() {
		return {
			enabled: M,
			checks: G,
			errors: K,
			mismatches: W.map((e) => ({
				...e,
				legacy: [...e.legacy],
				modern: [...e.modern]
			}))
		};
	},
	getExecutionShadowReport() {
		return {
			enabled: A,
			errors: U,
			events: H,
			runs: [...V.values()].map((e) => ({
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
			enabled: L,
			execution: {
				active: [...q.values()].filter(({ status: e }) => ![
					"done",
					"failed",
					"stopped"
				].includes(e)).length,
				...J,
				transitions: Y
			},
			flags: {
				executionEngine: P,
				repository: I,
				taskClient: F
			},
			repository: B.getDiagnostics(),
			tasks: z.getDiagnostics()
		};
	}
}), R) {
	let e = document.getElementById("canvasExecutionIsland");
	e && import("./react-execution-entry-Ddb7kJVg.js").then(({ mountReactExecutionIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React execution island failed to load", e));
}
function Z(e, t) {
	Y += 1, q.set(e.targetId, e), t.type === "finish" && (J[t.status] += 1), window.dispatchEvent(new CustomEvent("canvas-modern-execution", { detail: {
		event: t,
		state: e
	} }));
}
document.documentElement.dataset.canvasModernCore = "12", document.documentElement.dataset.canvasModernExecutionEngine = P ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionShadow = A ? "enabled" : "disabled", document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? "ready" : "missing", document.documentElement.dataset.canvasModernGraphOrder = j ? "enabled" : "disabled", document.documentElement.dataset.canvasModernM2 = L ? "enabled" : "disabled", document.documentElement.dataset.canvasModernRepository = I ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactExecution = R ? "enabled" : "disabled", document.documentElement.dataset.canvasModernShadow = M ? "enabled" : "disabled", document.documentElement.dataset.canvasModernTaskClient = F ? "enabled" : "disabled", window.dispatchEvent(new CustomEvent("canvas-modern-core-ready"));
//#endregion
