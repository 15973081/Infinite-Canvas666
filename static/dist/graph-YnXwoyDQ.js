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
function a(e) {
	return r(i(e));
}
//#endregion
//#region src/canvas/domain/graph.ts
var o = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"llm",
	"video"
]), s = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"video"
]);
function c(e, t = o) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e.nodes) n.has(t.id) || n.set(t.id, t);
	let r = l(e.connections, "to"), i = l(e.connections, "from");
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
	function u(t, r) {
		if (!t || !r || t === r) return !1;
		let i = n.get(t), a = n.get(r);
		return !i || !a || e.connections.some((e) => e.from === t && e.to === r) ? !1 : s.has(i.type) ? a.type === "output" || s.has(a.type) ? !c(t, r) : !1 : a.type === "loop" ? !!a.imageInput && [
			"image",
			"group",
			"output"
		].includes(i.type) || !!a.showPrompt && [
			"prompt",
			"promptGroup",
			"loop",
			"llm"
		].includes(i.type) : a.type === "llm" ? [
			"prompt",
			"loop",
			"promptGroup",
			"llm",
			"image",
			"group",
			"output"
		].includes(i.type) : i.type === "llm" ? s.has(a.type) : s.has(a.type) && [
			"image",
			"prompt",
			"loop",
			"group",
			"promptGroup",
			"output",
			"llm"
		].includes(i.type) && (i.type !== "output" || !c(t, r));
	}
	function d(e) {
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
		canConnect: u,
		cascadeOrder: a,
		retryCascadeOrder: d,
		wouldCreateCycle: c
	};
}
function l(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = n.get(r[t]);
		e ? e.push(r) : n.set(r[t], [r]);
	}
	return n;
}
//#endregion
export { i as n, a as r, c as t };
