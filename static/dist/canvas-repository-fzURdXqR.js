import { n as e, r as t } from "./graph-j9GyzERh.js";
//#region src/canvas/domain/document-merge.ts
var n = Symbol("missing");
function r(t, n, r) {
	let o = e(t), l = e(n), u = e(r);
	if (String(o.id || "") !== String(l.id || "") || String(l.id || "") !== String(u.id || "")) throw TypeError("Cannot merge different canvas documents");
	let d = [], f = i(o, l, u, "", d);
	return f.nodes = a(o.nodes, l.nodes, u.nodes, "nodes", d, s), f.connections = a(o.connections, l.connections, u.connections, "connections", d, c), f.updated_at = u.updated_at, {
		conflicts: [...new Set(d)],
		document: e(f)
	};
}
function i(e, t, r, i, a, s = /* @__PURE__ */ new Set([
	"connections",
	"nodes",
	"updated_at"
])) {
	let c = {};
	return (/* @__PURE__ */ new Set([
		...Object.keys(e),
		...Object.keys(t),
		...Object.keys(r)
	])).forEach((l) => {
		if (s.has(l)) return;
		let u = o(l in e ? e[l] : n, l in t ? t[l] : n, l in r ? r[l] : n, i ? `${i}.${l}` : l, a);
		u !== n && (c[l] = f(u));
	}), c;
}
function a(e, t, r, i, a, s) {
	let c = new Map(e.map((e) => [s(e), e])), l = new Map(t.map((e) => [s(e), e])), u = new Map(r.map((e) => [s(e), e]));
	return [...r.map(s), ...t.map(s)].filter((e, t, n) => n.indexOf(e) === t).flatMap((e) => {
		let t = o(c.get(e) ?? n, l.get(e) ?? n, u.get(e) ?? n, `${i}.${e}`, a);
		return t === n ? [] : [f(t)];
	});
}
function o(e, t, n, r, a) {
	return u(t, e) ? n : u(n, e) || u(t, n) ? t : l(e) && l(t) && l(n) ? i(e, t, n, r, a, /* @__PURE__ */ new Set()) : (a.push(r), t);
}
function s(e) {
	return e.id;
}
function c(e) {
	return String(e.id || `${e.from}->${e.to}:${e.kind || "flow"}`);
}
function l(e) {
	return e !== n && !!e && typeof e == "object" && !Array.isArray(e);
}
function u(e, t) {
	return e === n || t === n ? e === t : d(e) === d(t);
}
function d(e) {
	return Array.isArray(e) ? `[${e.map(d).join(",")}]` : e && typeof e == "object" ? `{${Object.entries(e).sort(([e], [t]) => e.localeCompare(t)).map(([e, t]) => `${JSON.stringify(e)}:${d(t)}`).join(",")}}` : JSON.stringify(e);
}
function f(e) {
	return JSON.parse(JSON.stringify(e));
}
//#endregion
//#region src/canvas/infrastructure/http.ts
var p = class extends Error {
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
async function m(e, t, n = {}, r = {}) {
	let i = new AbortController(), { signal: a, timeoutMs: o = 3e4 } = r, s = !1, c = () => i.abort(a?.reason);
	a?.aborted ? c() : a?.addEventListener("abort", c, { once: !0 });
	let l = o > 0 ? setTimeout(() => {
		s = !0, i.abort();
	}, o) : void 0;
	try {
		let r = await e(t, {
			...n,
			signal: i.signal
		}), a = await h(r);
		if (!r.ok) throw new p(_(a, r.statusText), g(r.status), r.status, a);
		return a;
	} catch (e) {
		throw e instanceof p ? e : s ? new p("Request timed out", "timeout") : a?.aborted || i.signal.aborted ? new p("Request aborted", "aborted") : new p(e instanceof Error ? e.message : String(e), "network");
	} finally {
		l && clearTimeout(l), a?.removeEventListener("abort", c);
	}
}
async function h(e) {
	let t = await e.text();
	if (!t) return {};
	try {
		return JSON.parse(t);
	} catch {
		return t;
	}
}
function g(e) {
	return e === 409 ? "conflict" : e === 404 ? "not-found" : e === 400 || e === 422 ? "validation" : e >= 500 ? "server" : "unknown";
}
function _(e, t) {
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
var v = class extends p {
	serverCanvas;
	updatedAt;
	constructor(e, t, n, r) {
		super(e, "conflict", 409, r), this.serverCanvas = t, this.updatedAt = n, this.name = "CanvasConflictError";
	}
};
function y(t = fetch) {
	let n = (e) => `/api/canvases/${encodeURIComponent(e)}`, r = {
		audits: 0,
		backupsCreated: 0,
		backupsListed: 0,
		backupsRestored: 0,
		conflicts: 0,
		errors: 0,
		loads: 0,
		saves: 0
	}, i = async (e, ...t) => {
		try {
			let n = await m(...t);
			return r[e] += 1, n;
		} catch (e) {
			throw (!(e instanceof p) || e.code !== "conflict") && (r.errors += 1), e;
		}
	};
	return {
		audit: (e = {}, n) => {
			let r = new URLSearchParams({
				include_deleted: String(!!e.includeDeleted),
				include_details: String(e.includeDetails !== !1),
				max_files: String(Math.max(1, Math.min(2e4, Number(e.maxFiles || 5e3))))
			});
			return i("audits", t, `/api/canvas-audit?${r}`, {}, n);
		},
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
				if (!(t instanceof p) || t.code !== "conflict") throw t;
				r.conflicts += 1;
				let n = x(t.details), i = n.canvas ? e(n.canvas) : null;
				throw new v(t.message, i, Number(n.updated_at || 0), t.details);
			}
		}
	};
}
function b(e) {
	return {
		...t(e),
		base_updated_at: Number(e.updated_at || 0)
	};
}
function x(e) {
	if (!e || typeof e != "object") return {};
	let t = e.detail;
	return t && typeof t == "object" ? t : {};
}
//#endregion
export { m as a, p as i, b as n, r as o, y as r, v as t };
