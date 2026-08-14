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
//#region src/canvas/domain/graph.ts
var a = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"llm",
	"video"
]);
function o(e, t = a) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e.nodes) n.has(t.id) || n.set(t.id, t);
	let r = s(e.connections, "to"), i = s(e.connections, "from");
	function o(e) {
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
	function c(e, t) {
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
	function l(e) {
		let r = /* @__PURE__ */ new Set(), a = /* @__PURE__ */ new Set();
		function s(e) {
			if (r.has(e)) return;
			r.add(e);
			let o = n.get(e);
			if (o) {
				t.has(o.type) && a.add(e);
				for (let r of i.get(e) ?? []) {
					let e = n.get(r.to);
					e && (t.has(e.type) || e.type === "output") && s(e.id);
				}
			}
		}
		s(e);
		let c = [], l = /* @__PURE__ */ new Set();
		for (let e of a) for (let t of o(e)) a.has(t) && !l.has(t) && (l.add(t), c.push(t));
		return c;
	}
	return {
		cascadeOrder: o,
		retryCascadeOrder: l,
		wouldCreateCycle: c
	};
}
function s(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = n.get(r[t]);
		e ? e.push(r) : n.set(r[t], [r]);
	}
	return n;
}
//#endregion
//#region src/main.ts
var c = new URLSearchParams(window.location.search).get("canvas_modern_core") === "shadow", l = [], u = 0, d = 0;
function f(e, t, n) {
	let r = window.CanvasLegacyBridge, a = r?.getDocumentSnapshot();
	if (!r || !a) return null;
	let s = o(i(a)), c = e === "cascade" ? s.cascadeOrder(t) : s.retryCascadeOrder(t), l = n ?? (e === "cascade" ? r.computeCascadeOrder(t) : r.computeRetryCascadeOrder(t));
	return {
		kind: e,
		legacy: [...l],
		modern: c,
		targetId: t,
		matches: l.length === c.length && l.every((e, t) => e === c[t])
	};
}
window.CanvasModernCore = Object.freeze({
	version: 2,
	compareOrder: f,
	observeOrder(e, t, n) {
		if (c) try {
			let r = f(e, t, n);
			if (!r) return;
			u += 1, r.matches || (l.length < 50 && l.push(r), console.warn("[canvas-modern-core] graph order mismatch", r));
		} catch (e) {
			d += 1, console.warn("[canvas-modern-core] graph shadow check failed", e);
		}
	},
	getShadowReport() {
		return {
			enabled: c,
			checks: u,
			errors: d,
			mismatches: l.map((e) => ({
				...e,
				legacy: [...e.legacy],
				modern: [...e.modern]
			}))
		};
	}
}), document.documentElement.dataset.canvasModernCore = "2", document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? "ready" : "missing", document.documentElement.dataset.canvasModernShadow = c ? "enabled" : "disabled", window.dispatchEvent(new CustomEvent("canvas-modern-core-ready"));
//#endregion
