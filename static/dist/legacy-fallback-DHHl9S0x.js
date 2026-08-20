import { n as e } from "./http-F-lX8WKW.js";
//#region src/canvas/infrastructure/rollout.ts
async function t(t = fetch) {
	try {
		let n = await e(t, "/api/canvas-rollout", {}, { timeoutMs: 1500 });
		if (!n || typeof n != "object") return null;
		let r = n;
		if (typeof r.enabled != "boolean" || typeof r.kill_switch != "boolean") return null;
		let i = a(r.effective_percentage), o = a(r.configured_percentage);
		return i === null || o === null ? null : {
			blocked_reasons: Array.isArray(r.blocked_reasons) ? r.blocked_reasons.filter((e) => typeof e == "string") : [],
			configured_percentage: o,
			effective_percentage: i,
			enabled: r.enabled,
			kill_switch: r.kill_switch,
			version: typeof r.version == "number" ? r.version : 1
		};
	} catch {
		return null;
	}
}
async function n(t, n = {}, r = fetch) {
	try {
		await e(r, "/api/canvas-rollout/events", {
			body: JSON.stringify({
				event: t,
				...n
			}),
			headers: { "Content-Type": "application/json" },
			keepalive: !0,
			method: "POST"
		}, { timeoutMs: 1500 });
	} catch {}
}
function r(e, t, n, r = null) {
	let a = new URLSearchParams(e), l = a.get("canvas_v2"), u = o(a.get("canvas_v2_rollout")), d = o(c(t, "canvasV2RolloutPercentage")), f = r !== null, p = r?.blocked_reasons ?? [], m = s(n || "anonymous");
	if (r?.kill_switch) return i(m, !1, !1, 0, "server", !0, p, !0);
	let h = r?.effective_percentage ?? d ?? 100, g = r ? "server" : d === null ? "default" : "storage", _ = u ?? h;
	return l === "1" || l === "0" ? i(m, l === "1", !0, _, "query", f, p, !1) : i(m, m < _, !1, _, u === null ? g : "query", f, p, !1);
}
function i(e, t, n, r, i, a, o, s) {
	return {
		blockedReasons: [...o],
		bucket: e,
		enabled: t,
		forced: n,
		killSwitch: s,
		percentage: r,
		policyLoaded: a,
		source: i
	};
}
function a(e) {
	return typeof e == "number" && Number.isFinite(e) ? Math.max(0, Math.min(100, Math.floor(e))) : null;
}
function o(e) {
	if (e === null || e.trim() === "") return null;
	let t = Number(e);
	return Number.isFinite(t) ? Math.max(0, Math.min(100, Math.floor(t))) : null;
}
function s(e) {
	let t = 2166136261;
	for (let n = 0; n < e.length; n += 1) t ^= e.charCodeAt(n), t = Math.imul(t, 16777619);
	return (t >>> 0) % 100;
}
function c(e, t) {
	try {
		return e?.getItem(t) ?? null;
	} catch {
		return null;
	}
}
//#endregion
//#region src/canvas/infrastructure/legacy-fallback.ts
function l(e = window.location.href) {
	let t = typeof window > "u" ? "http://localhost/" : window.location.href, n = new URL(e, t), r = new URL("/static/canvas-legacy.html", n);
	return r.search = n.search, r.hash = n.hash, r.searchParams.delete("canvas_v2"), r.searchParams.delete("canvas_v2_rollout"), `${r.pathname}${r.search}${r.hash}`;
}
//#endregion
export { r as i, t as n, n as r, l as t };
