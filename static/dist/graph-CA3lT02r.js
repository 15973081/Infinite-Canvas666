import { n as e, t } from "./http-F-lX8WKW.js";
//#region src/canvas/domain/document-codec.ts
function n(e, t) {
	if (!e || typeof e != "object" || Array.isArray(e)) throw TypeError(`${t} must be an object`);
	return e;
}
function r(e, t, r = !1) {
	let i = n(e, `nodes[${t}]`);
	if (typeof i.id != "string" || !i.id) throw TypeError(`nodes[${t}].id must be a non-empty string`);
	if (r && (i.type === void 0 || i.type === null || i.type === "") && (i.type = "smart-image"), typeof i.type != "string" || !i.type) throw TypeError(`nodes[${t}].type must be a non-empty string`);
	return i;
}
function i(e, t) {
	let r = n(e, `connections[${t}]`);
	if (typeof r.from != "string" || !r.from) throw TypeError(`connections[${t}].from must be a non-empty string`);
	if (typeof r.to != "string" || !r.to) throw TypeError(`connections[${t}].to must be a non-empty string`);
	return r;
}
function a(e) {
	return JSON.parse(JSON.stringify(e));
}
function o(e) {
	let t = a(n(e, "document")), o = t.nodes ?? [], s = t.connections ?? [];
	if (!Array.isArray(o)) throw TypeError("document.nodes must be an array");
	if (!Array.isArray(s)) throw TypeError("document.connections must be an array");
	let c = Number(t.schemaVersion ?? 1);
	if (!Number.isInteger(c) || c < 1) throw TypeError("document.schemaVersion must be a positive integer");
	return {
		...t,
		schemaVersion: c,
		nodes: o.map((e, n) => r(e, n, String(t.kind || "").toLowerCase() === "smart")),
		connections: s.map(i)
	};
}
function s(e) {
	return a(o(e));
}
//#endregion
//#region src/canvas/infrastructure/canvas-repository.ts
var c = class extends t {
	serverCanvas;
	updatedAt;
	constructor(e, t, n, r) {
		super(e, "conflict", 409, r), this.serverCanvas = t, this.updatedAt = n, this.name = "CanvasConflictError";
	}
};
function l(n = fetch) {
	let r = (e) => `/api/canvases/${encodeURIComponent(e)}`, i = {
		audits: 0,
		backupsCreated: 0,
		backupsListed: 0,
		backupsRestored: 0,
		conflicts: 0,
		errors: 0,
		loads: 0,
		saves: 0
	}, a = async (n, ...r) => {
		try {
			let t = await e(...r);
			return i[n] += 1, t;
		} catch (e) {
			throw (!(e instanceof t) || e.code !== "conflict") && (i.errors += 1), e;
		}
	};
	return {
		audit: (e = {}, t) => {
			let r = new URLSearchParams({
				include_deleted: String(!!e.includeDeleted),
				include_details: String(e.includeDetails !== !1),
				max_files: String(Math.max(1, Math.min(2e4, Number(e.maxFiles || 5e3))))
			});
			return a("audits", n, `/api/canvas-audit?${r}`, {}, t);
		},
		createBackup: (e, t) => a("backupsCreated", n, `${r(e)}/backup`, { method: "POST" }, t),
		get: async (e, t) => o((await a("loads", n, r(e), {}, t)).canvas),
		getDiagnostics: () => ({ ...i }),
		listBackups: async (e, t) => {
			let i = await a("backupsListed", n, `${r(e)}/backups`, {}, t);
			return Array.isArray(i.backups) ? i.backups : [];
		},
		restoreBackup: async (e, t, i) => o((await a("backupsRestored", n, `${r(e)}/backups/${encodeURIComponent(t)}/restore`, { method: "POST" }, i)).canvas),
		save: async (e, s, l) => {
			try {
				return o((await a("saves", n, r(e), {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(s)
				}, l)).canvas);
			} catch (e) {
				if (!(e instanceof t) || e.code !== "conflict") throw e;
				i.conflicts += 1;
				let n = d(e.details), r = n.canvas ? o(n.canvas) : null;
				throw new c(e.message, r, Number(n.updated_at || 0), e.details);
			}
		}
	};
}
function u(e) {
	return {
		...s(e),
		base_updated_at: Number(e.updated_at || 0)
	};
}
function d(e) {
	if (!e || typeof e != "object") return {};
	let t = e.detail;
	return t && typeof t == "object" ? t : {};
}
//#endregion
//#region src/canvas/domain/document-merge.ts
var f = Symbol("missing");
function p(e, t, n) {
	let r = o(e), i = o(t), a = o(n);
	if (String(r.id || "") !== String(i.id || "") || String(i.id || "") !== String(a.id || "")) throw TypeError("Cannot merge different canvas documents");
	let s = [], c = m(r, i, a, "", s);
	return c.nodes = h(r.nodes, i.nodes, a.nodes, "nodes", s, _), c.connections = h(r.connections, i.connections, a.connections, "connections", s, v), c.updated_at = a.updated_at, {
		conflicts: [...new Set(s)],
		document: o(c)
	};
}
function m(e, t, n, r, i, a = /* @__PURE__ */ new Set([
	"connections",
	"nodes",
	"updated_at"
])) {
	let o = {};
	return (/* @__PURE__ */ new Set([
		...Object.keys(e),
		...Object.keys(t),
		...Object.keys(n)
	])).forEach((s) => {
		if (a.has(s)) return;
		let c = g(s in e ? e[s] : f, s in t ? t[s] : f, s in n ? n[s] : f, r ? `${r}.${s}` : s, i);
		c !== f && (o[s] = S(c));
	}), o;
}
function h(e, t, n, r, i, a) {
	let o = new Map(e.map((e) => [a(e), e])), s = new Map(t.map((e) => [a(e), e])), c = new Map(n.map((e) => [a(e), e]));
	return [...n.map(a), ...t.map(a)].filter((e, t, n) => n.indexOf(e) === t).flatMap((e) => {
		let t = g(o.get(e) ?? f, s.get(e) ?? f, c.get(e) ?? f, `${r}.${e}`, i);
		return t === f ? [] : [S(t)];
	});
}
function g(e, t, n, r, i) {
	return b(t, e) ? n : b(n, e) || b(t, n) ? t : y(e) && y(t) && y(n) ? m(e, t, n, r, i, /* @__PURE__ */ new Set()) : (i.push(r), t);
}
function _(e) {
	return e.id;
}
function v(e) {
	return String(e.id || `${e.from}->${e.to}:${e.kind || "flow"}`);
}
function y(e) {
	return e !== f && !!e && typeof e == "object" && !Array.isArray(e);
}
function b(e, t) {
	return e === f || t === f ? e === t : x(e) === x(t);
}
function x(e) {
	return Array.isArray(e) ? `[${e.map(x).join(",")}]` : e && typeof e == "object" ? `{${Object.entries(e).sort(([e], [t]) => e.localeCompare(t)).map(([e, t]) => `${JSON.stringify(e)}:${x(t)}`).join(",")}}` : JSON.stringify(e);
}
function S(e) {
	return JSON.parse(JSON.stringify(e));
}
//#endregion
//#region src/canvas/domain/graph.ts
var C = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"llm",
	"video"
]), w = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"video"
]);
function T(e, t = C) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e.nodes) n.has(t.id) || n.set(t.id, t);
	let r = E(e.connections, "to"), i = E(e.connections, "from");
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
	function s(t, r, i = !1) {
		if (!t || !r || t === r) return !1;
		let a = n.get(t), s = n.get(r);
		return !a || !s || !i && e.connections.some((e) => e.from === t && e.to === r) ? !1 : w.has(a.type) ? s.type === "output" || w.has(s.type) ? !o(t, r) : !1 : s.type === "loop" ? !!s.imageInput && [
			"image",
			"group",
			"output"
		].includes(a.type) || !!s.showPrompt && [
			"prompt",
			"promptGroup",
			"loop",
			"llm"
		].includes(a.type) : s.type === "llm" ? [
			"prompt",
			"loop",
			"promptGroup",
			"llm",
			"image",
			"group",
			"output"
		].includes(a.type) : a.type === "llm" ? w.has(s.type) : w.has(s.type) && [
			"image",
			"prompt",
			"loop",
			"group",
			"promptGroup",
			"output",
			"llm"
		].includes(a.type) && (a.type !== "output" || !o(t, r));
	}
	function c(e) {
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
		canConnect: s,
		cascadeOrder: a,
		retryCascadeOrder: c,
		wouldCreateCycle: o
	};
}
function E(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = n.get(r[t]);
		e ? e.push(r) : n.set(r[t], [r]);
	}
	return n;
}
//#endregion
export { l as a, u as i, p as n, o, c as r, T as t };
