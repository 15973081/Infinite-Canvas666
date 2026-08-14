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
		].includes(e.status) || c(e, t), !t.targetId || !t.order.length) throw Error("Execution queue requires a target and order");
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
	if (t.type === "start") return e.status !== "queued" && c(e, t), {
		...e,
		status: "running"
	};
	if (t.type === "request-stop") return e.status === "stopping" ? e : (e.status !== "running" && c(e, t), {
		...e,
		status: "stopping"
	});
	if (t.type === "node-start") {
		if (e.mode === "parallel") return s(e, t);
		(e.status !== "running" || e.currentNodeId) && c(e, t);
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
		(e.status !== "running" || e.currentNodeId !== t.nodeId) && c(e, t);
		let n = [...e.completedNodeIds, t.nodeId];
		return {
			...e,
			completedNodeIds: n,
			completedRounds: e.completedRounds + +(n.length === e.order.length),
			currentNodeId: ""
		};
	}
	return e.status !== "running" && e.status !== "stopping" && c(e, t), e.status === "stopping" && t.status === "done" && c(e, t), {
		...e,
		error: t.error || "",
		status: t.status
	};
}
function s(e, t) {
	(e.status !== "running" || !t.roundId) && c(e, t);
	let n = e.rounds[t.roundId] ?? {
		completedNodeIds: [],
		currentNodeId: ""
	};
	if (t.type === "node-start") {
		n.currentNodeId && c(e, t);
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
	n.currentNodeId !== t.nodeId && c(e, t);
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
function c(e, t) {
	throw Error(`Invalid execution transition: ${e.status} -> ${t.type}`);
}
//#endregion
//#region src/canvas/domain/graph.ts
var l = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"llm",
	"video"
]);
function u(e, t = l) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e.nodes) n.has(t.id) || n.set(t.id, t);
	let r = d(e.connections, "to"), i = d(e.connections, "from");
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
function d(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = n.get(r[t]);
		e ? e.push(r) : n.set(r[t], [r]);
	}
	return n;
}
//#endregion
//#region src/main.ts
var f = new URLSearchParams(window.location.search).get("canvas_modern_core"), p = f === "execution-shadow", m = f === "graph-order", h = f === "shadow", g = /* @__PURE__ */ new Map(), _ = 0, v = 0, y = [], b = 0, x = 0;
function S(e, t, n) {
	let r = window.CanvasLegacyBridge, a = r?.getDocumentSnapshot();
	if (!r || !a) return null;
	let o = u(i(a)), s = e === "cascade" ? o.cascadeOrder(t) : o.retryCascadeOrder(t), c = n ?? (e === "cascade" ? r.computeCascadeOrder(t) : r.computeRetryCascadeOrder(t));
	return {
		kind: e,
		legacy: [...c],
		modern: s,
		targetId: t,
		matches: c.length === s.length && c.every((e, t) => e === s[t])
	};
}
window.CanvasModernCore = Object.freeze({
	version: 7,
	activeOrder(e, t) {
		if (!m) return null;
		try {
			let n = window.CanvasLegacyBridge?.getDocumentSnapshot();
			if (!n) return null;
			let r = u(i(n));
			return e === "cascade" ? r.cascadeOrder(t) : r.retryCascadeOrder(t);
		} catch (e) {
			return console.warn("[canvas-modern-core] active graph order failed; using legacy order", e), null;
		}
	},
	compareOrder: S,
	observeExecution(e) {
		if (p) try {
			let t = g.get(e.targetId) ?? a();
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
			}), g.set(e.targetId, t), _ += 1;
		} catch (t) {
			v += 1, console.warn("[canvas-modern-core] execution shadow transition failed", t, e);
		}
	},
	observeOrder(e, t, n) {
		if (h) try {
			let r = S(e, t, n);
			if (!r) return;
			b += 1, r.matches || (y.length < 50 && y.push(r), console.warn("[canvas-modern-core] graph order mismatch", r));
		} catch (e) {
			x += 1, console.warn("[canvas-modern-core] graph shadow check failed", e);
		}
	},
	getShadowReport() {
		return {
			enabled: h,
			checks: b,
			errors: x,
			mismatches: y.map((e) => ({
				...e,
				legacy: [...e.legacy],
				modern: [...e.modern]
			}))
		};
	},
	getExecutionShadowReport() {
		return {
			enabled: p,
			errors: v,
			events: _,
			runs: [...g.values()].map((e) => ({
				...e,
				completedNodeIds: [...e.completedNodeIds],
				order: [...e.order],
				rounds: Object.fromEntries(Object.entries(e.rounds).map(([e, t]) => [e, {
					...t,
					completedNodeIds: [...t.completedNodeIds]
				}]))
			}))
		};
	}
}), document.documentElement.dataset.canvasModernCore = "7", document.documentElement.dataset.canvasModernExecutionShadow = p ? "enabled" : "disabled", document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? "ready" : "missing", document.documentElement.dataset.canvasModernGraphOrder = m ? "enabled" : "disabled", document.documentElement.dataset.canvasModernShadow = h ? "enabled" : "disabled", window.dispatchEvent(new CustomEvent("canvas-modern-core-ready"));
//#endregion
