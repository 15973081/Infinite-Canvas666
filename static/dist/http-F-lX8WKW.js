//#region src/canvas/infrastructure/http.ts
var e = class extends Error {
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
async function t(t, a, o = {}, s = {}) {
	let c = new AbortController(), { signal: l, timeoutMs: u = 3e4 } = s, d = !1, f = () => c.abort(l?.reason);
	l?.aborted ? f() : l?.addEventListener("abort", f, { once: !0 });
	let p = u > 0 ? setTimeout(() => {
		d = !0, c.abort();
	}, u) : void 0;
	try {
		let s = await t(a, {
			...o,
			signal: c.signal
		}), l = await n(s);
		if (!s.ok) throw new e(i(l, s.statusText), r(s.status), s.status, l);
		return l;
	} catch (t) {
		throw t instanceof e ? t : d ? new e("Request timed out", "timeout") : l?.aborted || c.signal.aborted ? new e("Request aborted", "aborted") : new e(t instanceof Error ? t.message : String(t), "network");
	} finally {
		p && clearTimeout(p), l?.removeEventListener("abort", f);
	}
}
async function n(e) {
	let t = await e.text();
	if (!t) return {};
	try {
		return JSON.parse(t);
	} catch {
		return t;
	}
}
function r(e) {
	return e === 409 ? "conflict" : e === 404 ? "not-found" : e === 400 || e === 422 ? "validation" : e >= 500 ? "server" : "unknown";
}
function i(e, t) {
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
export { t as n, e as t };
