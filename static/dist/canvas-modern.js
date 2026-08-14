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
		error: "",
		mode: "serial",
		order: [],
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
		].includes(e.status) || s(e, t), !t.targetId || !t.order.length) throw Error("Execution queue requires a target and order");
		return {
			error: "",
			mode: t.mode,
			order: [...t.order],
			status: "queued",
			targetId: t.targetId
		};
	}
	return t.type === "start" ? (e.status !== "queued" && s(e, t), {
		...e,
		status: "running"
	}) : t.type === "request-stop" ? e.status === "stopping" ? e : (e.status !== "running" && s(e, t), {
		...e,
		status: "stopping"
	}) : (e.status !== "running" && e.status !== "stopping" && s(e, t), e.status === "stopping" && t.status === "done" && s(e, t), {
		...e,
		error: t.error || "",
		status: t.status
	});
}
function s(e, t) {
	throw Error(`Invalid execution transition: ${e.status} -> ${t.type}`);
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
//#region src/main.ts
var d = new URLSearchParams(window.location.search).get("canvas_modern_core"), f = d === "execution-shadow", p = d === "graph-order", m = d === "shadow", h = /* @__PURE__ */ new Map(), g = 0, _ = 0, v = [], y = 0, b = 0;
function x(e, t, n) {
	let r = window.CanvasLegacyBridge, a = r?.getDocumentSnapshot();
	if (!r || !a) return null;
	let o = l(i(a)), s = e === "cascade" ? o.cascadeOrder(t) : o.retryCascadeOrder(t), c = n ?? (e === "cascade" ? r.computeCascadeOrder(t) : r.computeRetryCascadeOrder(t));
	return {
		kind: e,
		legacy: [...c],
		modern: s,
		targetId: t,
		matches: c.length === s.length && c.every((e, t) => e === s[t])
	};
}
window.CanvasModernCore = Object.freeze({
	version: 4,
	activeOrder(e, t) {
		if (!p) return null;
		try {
			let n = window.CanvasLegacyBridge?.getDocumentSnapshot();
			if (!n) return null;
			let r = l(i(n));
			return e === "cascade" ? r.cascadeOrder(t) : r.retryCascadeOrder(t);
		} catch (e) {
			return console.warn("[canvas-modern-core] active graph order failed; using legacy order", e), null;
		}
	},
	compareOrder: x,
	observeExecution(e) {
		if (f) try {
			let t = h.get(e.targetId) ?? a();
			e.phase === "begin" ? (t = o(t, {
				type: "queue",
				targetId: e.targetId,
				order: e.order,
				mode: e.mode
			}), t = o(t, { type: "start" })) : t = e.phase === "stop" ? o(t, { type: "request-stop" }) : o(t, {
				type: "finish",
				status: e.status,
				error: e.error
			}), h.set(e.targetId, t), g += 1;
		} catch (t) {
			_ += 1, console.warn("[canvas-modern-core] execution shadow transition failed", t, e);
		}
	},
	observeOrder(e, t, n) {
		if (m) try {
			let r = x(e, t, n);
			if (!r) return;
			y += 1, r.matches || (v.length < 50 && v.push(r), console.warn("[canvas-modern-core] graph order mismatch", r));
		} catch (e) {
			b += 1, console.warn("[canvas-modern-core] graph shadow check failed", e);
		}
	},
	getShadowReport() {
		return {
			enabled: m,
			checks: y,
			errors: b,
			mismatches: v.map((e) => ({
				...e,
				legacy: [...e.legacy],
				modern: [...e.modern]
			}))
		};
	},
	getExecutionShadowReport() {
		return {
			enabled: f,
			errors: _,
			events: g,
			runs: [...h.values()].map((e) => ({
				...e,
				order: [...e.order]
			}))
		};
	}
}), document.documentElement.dataset.canvasModernCore = "4", document.documentElement.dataset.canvasModernExecutionShadow = f ? "enabled" : "disabled", document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? "ready" : "missing", document.documentElement.dataset.canvasModernGraphOrder = p ? "enabled" : "disabled", document.documentElement.dataset.canvasModernShadow = m ? "enabled" : "disabled", window.dispatchEvent(new CustomEvent("canvas-modern-core-ready"));
//#endregion
