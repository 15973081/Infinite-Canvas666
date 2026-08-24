import { n as e, t } from "./http-F-lX8WKW.js";
import { n, r } from "./graph-Dsb9toch.js";
//#region src/canvas/infrastructure/canvas-repository.ts
var i = class extends t {
	serverCanvas;
	updatedAt;
	constructor(e, t, n, r) {
		super(e, "conflict", 409, r), this.serverCanvas = t, this.updatedAt = n, this.name = "CanvasConflictError";
	}
};
function a(r = fetch) {
	let a = (e) => `/api/canvases/${encodeURIComponent(e)}`, o = {
		audits: 0,
		backupsCreated: 0,
		backupsListed: 0,
		backupsRestored: 0,
		conflicts: 0,
		errors: 0,
		loads: 0,
		saves: 0
	}, c = async (n, ...r) => {
		try {
			let t = await e(...r);
			return o[n] += 1, t;
		} catch (e) {
			throw (!(e instanceof t) || e.code !== "conflict") && (o.errors += 1), e;
		}
	};
	return {
		audit: (e = {}, t) => {
			let n = new URLSearchParams({
				include_deleted: String(!!e.includeDeleted),
				include_details: String(e.includeDetails !== !1),
				max_files: String(Math.max(1, Math.min(2e4, Number(e.maxFiles || 5e3))))
			});
			return c("audits", r, `/api/canvas-audit?${n}`, {}, t);
		},
		createBackup: (e, t) => c("backupsCreated", r, `${a(e)}/backup`, { method: "POST" }, t),
		get: async (e, t) => {
			let i = await c("loads", r, a(e), {}, t);
			return n(i.canvas);
		},
		getDiagnostics: () => ({ ...o }),
		listBackups: async (e, t) => {
			let n = await c("backupsListed", r, `${a(e)}/backups`, {}, t);
			return Array.isArray(n.backups) ? n.backups : [];
		},
		restoreBackup: async (e, t, i) => {
			let o = await c("backupsRestored", r, `${a(e)}/backups/${encodeURIComponent(t)}/restore`, { method: "POST" }, i);
			return n(o.canvas);
		},
		save: async (e, l, u) => {
			try {
				let t = await c("saves", r, a(e), {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(l)
				}, u);
				return n(t.canvas);
			} catch (e) {
				if (!(e instanceof t) || e.code !== "conflict") throw e;
				o.conflicts += 1;
				let r = s(e.details), a = r.canvas ? n(r.canvas) : null;
				throw new i(e.message, a, Number(r.updated_at || 0), e.details);
			}
		}
	};
}
function o(e) {
	return {
		...r(e),
		base_updated_at: Number(e.updated_at || 0)
	};
}
function s(e) {
	if (!e || typeof e != "object") return {};
	let t = e.detail;
	return t && typeof t == "object" ? t : {};
}
//#endregion
//#region src/canvas/domain/document-merge.ts
var c = Symbol("missing");
function l(e, t, r) {
	let i = n(e), a = n(t), o = n(r);
	if (String(i.id || "") !== String(a.id || "") || String(a.id || "") !== String(o.id || "")) throw TypeError("Cannot merge different canvas documents");
	let s = [], c = m(i, a, o, "", s);
	return c.nodes = d(i.nodes, a.nodes, o.nodes, s), c.connections = h(i.connections, a.connections, o.connections, "connections", s, v), c.updated_at = o.updated_at, {
		conflicts: [...new Set(s)],
		document: n(c)
	};
}
function u(e) {
	return e.nodes.some(f);
}
function d(e, t, n, r) {
	let i = new Map(e.map((e) => [e.id, e])), a = new Map(t.map((e) => [e.id, e])), o = new Map(n.map((e) => [e.id, e]));
	return [...t.map(_), ...n.map(_)].filter((e, t, n) => n.indexOf(e) === t).flatMap((e) => {
		let t = a.get(e), n = o.get(e);
		if (t && n && f(t)) return [{
			...S(t),
			images: p(t.images, n.images)
		}];
		let s = g(i.get(e) ?? c, t ?? c, n ?? c, `nodes.${e}`, r);
		return s === c ? [] : [S(s)];
	});
}
function f(e) {
	return !!(e.running || e.pending || e.queued || Array.isArray(e.pendingTasks) && e.pendingTasks.some((e) => !!(e && typeof e == "object" && e.taskId)));
}
function p(e, t) {
	if (!Array.isArray(e) && !Array.isArray(t)) return Array.isArray(e) ? S(e) : void 0;
	let n = [], r = /* @__PURE__ */ new Set();
	return [...Array.isArray(e) ? e : [], ...Array.isArray(t) ? t : []].forEach((e) => {
		let t = typeof e == "string" ? e : e && typeof e == "object" ? String(e.url || "") : "";
		t && r.has(t) || (t && r.add(t), n.push(S(e)));
	}), n;
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
		let l = g(s in e ? e[s] : c, s in t ? t[s] : c, s in n ? n[s] : c, r ? `${r}.${s}` : s, i);
		l !== c && (o[s] = S(l));
	}), o;
}
function h(e, t, n, r, i, a) {
	let o = new Map(e.map((e) => [a(e), e])), s = new Map(t.map((e) => [a(e), e])), l = new Map(n.map((e) => [a(e), e]));
	return [...n.map(a), ...t.map(a)].filter((e, t, n) => n.indexOf(e) === t).flatMap((e) => {
		let t = g(o.get(e) ?? c, s.get(e) ?? c, l.get(e) ?? c, `${r}.${e}`, i);
		return t === c ? [] : [S(t)];
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
	return e !== c && !!e && typeof e == "object" && !Array.isArray(e);
}
function b(e, t) {
	return e === c || t === c ? e === t : x(e) === x(t);
}
function x(e) {
	return Array.isArray(e) ? `[${e.map(x).join(",")}]` : e && typeof e == "object" ? `{${Object.entries(e).sort(([e], [t]) => e.localeCompare(t)).map(([e, t]) => `${JSON.stringify(e)}:${x(t)}`).join(",")}}` : JSON.stringify(e);
}
function S(e) {
	return JSON.parse(JSON.stringify(e));
}
//#endregion
export { a, o as i, l as n, i as r, u as t };
