import { r as e, t } from "./rollout-BcgAkMGv.js";
//#region src/bootstrap.ts
var n = await t();
window.__CanvasBootstrapRolloutPolicy = n;
var r = e(window.location.search, window.localStorage, window.sessionStorage.getItem("canvasClientId") || window.location.pathname, n), i = null;
window.__loadCanvasLegacyFallback = () => (i ??= (async () => {
	for (let e of [
		"/static/js/canvas-core.js?v=2026.07.06.1",
		"/static/js/canvas-api.js?v=2026.07.06.1",
		"/static/js/ltx-director-timeline.js?v=2026.06.10.1.1781494198",
		"/static/js/canvas.js?v=2026.07.23.4"
	]) await a(e);
	document.readyState === "complete" && await o();
})(), i), r.enabled || await window.__loadCanvasLegacyFallback(), await import("./main-krXrmgE6.js"), r.enabled || await o();
function a(e) {
	return new Promise((t, n) => {
		let r = document.createElement("script");
		r.src = e, r.onload = () => t(), r.onerror = () => n(/* @__PURE__ */ Error(`Failed to load Classic Canvas dependency: ${e}`)), document.body.appendChild(r);
	});
}
async function o() {
	let e = window.onload;
	typeof e == "function" && (window.onload = null, await e.call(window, new Event("load")));
}
//#endregion
