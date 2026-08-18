import { n as e, r as t } from "./graph-YnXwoyDQ.js";
//#region src/canvas/infrastructure/http.ts
var n = class extends Error {
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
async function r(e, t, r = {}, s = {}) {
	let c = new AbortController(), { signal: l, timeoutMs: u = 3e4 } = s, d = !1, f = () => c.abort(l?.reason);
	l?.aborted ? f() : l?.addEventListener("abort", f, { once: !0 });
	let p = u > 0 ? setTimeout(() => {
		d = !0, c.abort();
	}, u) : void 0;
	try {
		let s = await e(t, {
			...r,
			signal: c.signal
		}), l = await i(s);
		if (!s.ok) throw new n(o(l, s.statusText), a(s.status), s.status, l);
		return l;
	} catch (e) {
		throw e instanceof n ? e : d ? new n("Request timed out", "timeout") : l?.aborted || c.signal.aborted ? new n("Request aborted", "aborted") : new n(e instanceof Error ? e.message : String(e), "network");
	} finally {
		p && clearTimeout(p), l?.removeEventListener("abort", f);
	}
}
async function i(e) {
	let t = await e.text();
	if (!t) return {};
	try {
		return JSON.parse(t);
	} catch {
		return t;
	}
}
function a(e) {
	return e === 409 ? "conflict" : e === 404 ? "not-found" : e === 400 || e === 422 ? "validation" : e >= 500 ? "server" : "unknown";
}
function o(e, t) {
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
var s = class extends n {
	serverCanvas;
	updatedAt;
	constructor(e, t, n, r) {
		super(e, "conflict", 409, r), this.serverCanvas = t, this.updatedAt = n, this.name = "CanvasConflictError";
	}
};
function c(t = fetch) {
	let i = (e) => `/api/canvases/${encodeURIComponent(e)}`, a = {
		backupsCreated: 0,
		backupsListed: 0,
		backupsRestored: 0,
		conflicts: 0,
		errors: 0,
		loads: 0,
		saves: 0
	}, o = async (e, ...t) => {
		try {
			let n = await r(...t);
			return a[e] += 1, n;
		} catch (e) {
			throw (!(e instanceof n) || e.code !== "conflict") && (a.errors += 1), e;
		}
	};
	return {
		createBackup: (e, n) => o("backupsCreated", t, `${i(e)}/backup`, { method: "POST" }, n),
		get: async (n, r) => {
			let a = await o("loads", t, i(n), {}, r);
			return e(a.canvas);
		},
		getDiagnostics: () => ({ ...a }),
		listBackups: async (e, n) => {
			let r = await o("backupsListed", t, `${i(e)}/backups`, {}, n);
			return Array.isArray(r.backups) ? r.backups : [];
		},
		restoreBackup: async (n, r, a) => {
			let s = await o("backupsRestored", t, `${i(n)}/backups/${encodeURIComponent(r)}/restore`, { method: "POST" }, a);
			return e(s.canvas);
		},
		save: async (r, c, l) => {
			try {
				let n = await o("saves", t, i(r), {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(c)
				}, l);
				return e(n.canvas);
			} catch (t) {
				if (!(t instanceof n) || t.code !== "conflict") throw t;
				a.conflicts += 1;
				let r = u(t.details), i = r.canvas ? e(r.canvas) : null;
				throw new s(t.message, i, Number(r.updated_at || 0), t.details);
			}
		}
	};
}
function l(e) {
	return {
		...t(e),
		base_updated_at: Number(e.updated_at || 0)
	};
}
function u(e) {
	if (!e || typeof e != "object") return {};
	let t = e.detail;
	return t && typeof t == "object" ? t : {};
}
//#endregion
export { r as i, c as n, n as r, l as t };
