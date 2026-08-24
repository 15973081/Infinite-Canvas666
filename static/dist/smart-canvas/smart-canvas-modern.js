//#region \0rolldown/runtime.js
var e = Object.create, t = Object.defineProperty, n = Object.getOwnPropertyDescriptor, r = Object.getOwnPropertyNames, i = Object.getPrototypeOf, a = Object.prototype.hasOwnProperty, o = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports), s = (e, i, o, s) => {
	if (i && typeof i == "object" || typeof i == "function") for (var c = r(i), l = 0, u = c.length, d; l < u; l++) d = c[l], !a.call(e, d) && d !== o && t(e, d, {
		get: ((e) => i[e]).bind(null, d),
		enumerable: !(s = n(i, d)) || s.enumerable
	});
	return e;
}, c = (n, r, o) => (o = n == null ? {} : e(i(n)), s(r || !n || !n.__esModule || !a.call(n, "default") ? t(o, "default", {
	value: n,
	enumerable: !0
}) : o, n)), l = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"llm",
	"video"
]), u = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"video"
]);
function d(e, t = l) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e.nodes) n.has(t.id) || n.set(t.id, t);
	let r = f(e.connections, "to"), i = f(e.connections, "from");
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
		return !a || !s || !i && e.connections.some((e) => e.from === t && e.to === r) ? !1 : s.type === "smart-image" ? [
			"image",
			"loop",
			"output",
			"prompt",
			"promptGroup",
			"smart-image"
		].includes(a.type) && !o(t, r) : a.type === "smart-image" ? [
			"loop",
			"prompt",
			"smart-image"
		].includes(s.type) && !o(t, r) : u.has(a.type) ? s.type === "output" || u.has(s.type) ? !o(t, r) : !1 : s.type === "loop" ? (!!s.imageInput && [
			"image",
			"group",
			"output",
			"smart-image"
		].includes(a.type) || !!s.showPrompt && [
			"prompt",
			"promptGroup",
			"loop",
			"llm",
			"smart-image"
		].includes(a.type)) && !o(t, r) : s.type === "llm" ? [
			"prompt",
			"loop",
			"promptGroup",
			"llm",
			"image",
			"group",
			"output"
		].includes(a.type) && !o(t, r) : a.type === "llm" ? u.has(s.type) && !o(t, r) : u.has(s.type) && [
			"image",
			"prompt",
			"loop",
			"group",
			"promptGroup",
			"output",
			"llm"
		].includes(a.type) && !o(t, r);
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
function f(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = n.get(r[t]);
		e ? e.push(r) : n.set(r[t], [r]);
	}
	return n;
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
//#region src/canvas/application/smart-canvas-execution.ts
var v = {
	square: {
		"1k": "1024x1024",
		"2k": "2048x2048",
		"4k": "4096x4096"
	},
	landscape: {
		"1k": "1536x1024",
		"2k": "2048x1360",
		"4k": "3520x2336"
	},
	portrait: {
		"1k": "1024x1536",
		"2k": "1360x2048",
		"4k": "2336x3520"
	},
	landscape43: {
		"1k": "1024x768",
		"2k": "2048x1536",
		"4k": "3312x2480"
	},
	portrait43: {
		"1k": "768x1024",
		"2k": "1536x2048",
		"4k": "2480x3312"
	},
	wide: {
		"1k": "1536x864",
		"2k": "2048x1152",
		"4k": "3840x2160"
	},
	story: {
		"1k": "864x1536",
		"2k": "1152x2048",
		"4k": "2160x3840"
	},
	ultrawide: {
		"1k": "1536x656",
		"2k": "2048x880",
		"4k": "3840x1648"
	},
	ultratall: {
		"1k": "656x1536",
		"2k": "880x2048",
		"4k": "1648x3840"
	}
};
function y({ fetcher: e, getConfig: t, getWorkflow: n, taskClient: r }) {
	let i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new WeakMap(), o = (e) => !!(e && (e.type === "smart-image" || e.type === "loop" || e.type === "prompt" && e.llmEnabled)), s = async (e, t) => {
		t && await t(structuredClone(e));
	}, c = (t, n, r) => m(e, t, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(n)
	}, { signal: r }), l = async (e, t, n = "node", r) => {
		let a = structuredClone(t), s = a.nodes.find((t) => t.id === e);
		if (!o(s)) throw Error(`不支持执行节点：${s?.type || e}`);
		i.get(e)?.abort();
		let c = new AbortController();
		i.set(e, c);
		try {
			if (s?.type === "loop") await p(a, s, c.signal, r);
			else if (s?.type === "prompt") await f(a, s, c.signal, r);
			else {
				let t = n === "cascade" ? T(a, e) : [e];
				for (let e of t) {
					R(c.signal);
					let t = a.nodes.find((t) => t.id === e);
					t?.type === "prompt" && t.llmEnabled ? await f(a, t, c.signal, r) : t?.type === "smart-image" && await h(a, t, c.signal, r);
				}
			}
			return a;
		} finally {
			i.get(e) === c && i.delete(e);
		}
	}, u = async (e, t, n, r) => {
		if (e === "stop-execution") {
			i.get(t)?.abort();
			let e = structuredClone(n);
			return e.nodes.filter((e) => e.id === t || e.running).forEach((e) => {
				e.running = !1, e.queued = !1, e.runStatus = "stopped";
			}), await s(e, r), e;
		}
		let a = n.nodes.find((e) => e.id === t);
		if (!a) return structuredClone(n);
		let o = structuredClone(n), c = o.nodes.find((e) => e.id === t);
		return c.runError = "", c.runStatus = void 0, l(t, o, a.type === "loop" ? "cascade" : "node", r);
	}, d = async (e, t) => {
		let n = structuredClone(e), i = [];
		return n.nodes.filter((e) => e.type === "smart-image").forEach((e) => {
			k(e).filter((e) => !e.failed || !e.recoverTaskId).forEach((a) => {
				let o = String(a.taskId || ""), c = a.kind === "video" ? "video" : "image";
				o && (a.recoveryStatus = "recovering", i.push(r.watch(c, o).then(async (r) => {
					let i = A(e, a, r);
					i.length && j(n, e, i, !0), await s(n, t);
				}).catch(async (r) => {
					a.failed = !0, a.recoveryStatus = "interrupted", a.error = r instanceof Error ? r.message : String(r), e.running = !1, await s(n, t);
				})));
			});
		}), i.length && (await s(n, t), await Promise.all(i)), n;
	}, f = async (e, t, n, r, i) => {
		let a = String(t.llmInstruction || t.text || "").trim();
		if (!a) throw Error("请输入要处理的提示词或 LLM 指令");
		let o = w(e, t, i).media, l = String(t.llmProvider || ""), u = String(t.llmModel || t.model || ""), d = {
			message: a,
			messages: [],
			images: o.filter((e) => e.kind === "image").map((e) => e.url),
			videos: o.filter((e) => e.kind === "video").map((e) => e.url),
			model: u,
			provider: l,
			ms_model: l === "modelscope" ? u : "",
			system_prompt: t.llmSystemEnabled ? String(t.llmSystemPrompt || "You are a helpful prompt assistant.") : ""
		};
		t.running = !0, t.runStatus = "running", t.runError = "", await s(e, r);
		try {
			let r = await c("/api/canvas-llm", d, n);
			t.text = String(r.text || "").trim(), t.runStatus = "done", P(e, t, d, [], "");
		} catch (n) {
			throw N(e, t, n, d), n;
		} finally {
			t.running = !1, await s(e, r);
		}
	}, p = async (e, t, n, r) => {
		let i = E(e, t.id);
		if (!i) throw Error("请把循环节点连接到下游图片链路");
		let a = Math.max(1, Number(t.loopStart || 1)), o = Math.max(1, Math.min(100, Number(t.count || 1))), c = Array.from({ length: o }, (e, t) => a + t);
		t.running = !0, t.runStatus = "running", t.runStartedAt = Date.now(), t.runTotal = o, await s(e, r);
		let l = async (a) => {
			R(n);
			let o = {
				images: O(e, t, a),
				loopId: t.id,
				prompt: D(t, a)
			};
			t.activeRound = a, t.currentPrompt = o.prompt, t.currentImages = o.images, await s(e, r);
			for (let t of T(e, i.id)) {
				R(n);
				let i = e.nodes.find((e) => e.id === t);
				i?.type === "prompt" && i.llmEnabled ? await f(e, i, n, r, o) : i?.type === "smart-image" && await h(e, i, n, r, !0, o);
			}
		};
		try {
			if (t.mode === "parallel") await Promise.all(c.map(l));
			else for (let e of c) await l(e);
			t.runStatus = "done";
		} catch (e) {
			throw t.runStatus = n.aborted ? "stopped" : "failed", t.runError = e instanceof Error ? e.message : String(e), e;
		} finally {
			t.running = !1, t.activeRound = void 0, t.currentImages = void 0, t.currentPrompt = void 0, t.runFinishedAt = Date.now(), await s(e, r);
		}
	}, h = async (e, n, r, i, o = !1, l) => {
		let u = b(n), d = w(e, n, l), f = d.prompts.join("\n\n").trim() || String(n.runModelPrompt || n.runPrompt || n.promptDraftText || ""), p = String(u.engine || "api"), m = (p === "api" || p === "volcengine") && String(u.apiKind || "image") === "video";
		if (!f && (p !== "comfy" || String(u.comfyMode || u.mode || "text") === "text") && !d.media.some((e) => e.kind === "image")) throw Error("缺少提示词输入");
		let h = p === "api" || p === "volcengine" || p === "modelscope" ? Math.max(1, Math.min(8, Number(u.count || 1))) : 1;
		a.set(n, (a.get(n) || 0) + 1), n.running = !0, n.pending = m ? 1 : h, n.runStartedAt = Date.now(), n.runStatus = "running", n.runError = "", await s(e, i);
		let y = {};
		try {
			let a = [];
			if (p === "comfy") {
				let e = await v(u, f, d.media, r);
				y = e.request, a = e.outputs;
			} else if (p === "modelscope") {
				let e = await _(u, f, d.media, r);
				y = e.request, a = e.outputs;
			} else if (m) {
				let e = S(u, f, d.media, t());
				y = e, a = F(await c("/api/canvas-video", e, r), "video");
			} else {
				let t = x(u, f, d.media);
				if (y = t, a = await g(e, n, u, t, r, i), k(n).some((e) => e.failed && e.recoverTaskId)) return;
			}
			if (!a.length) throw Error(m ? "没有返回视频" : "没有返回图片");
			j(e, n, a, o), P(e, n, y, a, "");
		} catch (t) {
			throw r.aborted ? (n.runStatus = "stopped", n.runError = "执行已停止") : N(e, n, t, y), t;
		} finally {
			let t = Math.max(0, (a.get(n) || 1) - 1);
			t ? a.set(n, t) : a.delete(n), n.running = t > 0, k(n).length || (n.pending = 0), await s(e, i);
		}
	}, g = async (e, t, n, i, a, o) => {
		let l = Math.max(1, Math.min(8, Number(n.count || 1))), u = (await Promise.all(Array.from({ length: l }, () => c("/api/canvas-image-tasks", i, a)))).map((e) => ({
			taskId: String(e.task_id || e.id || ""),
			kind: "image",
			providerId: i.provider_id,
			model: i.model,
			startedAt: Date.now()
		})).filter((e) => e.taskId);
		t.pendingTasks = [...k(t), ...u], t.pending = k(t).length, t.running = !1, await s(e, o);
		let d = [];
		for (let n of [...k(t)]) {
			R(a);
			let i = A(t, n, await r.wait("image", String(n.taskId), { signal: a }));
			d.push(...i), await s(e, o);
		}
		return d;
	}, _ = async (t, n, r, i) => {
		let a = String(t.msgenModel || "zimage"), o = a === "qwen_edit" ? {
			accepts: !0,
			endpoint: "/api/angle/generate",
			model: "Qwen/Qwen-Image-Edit-2511",
			needs: !0
		} : a === "klein_edit" ? {
			accepts: !0,
			endpoint: "/api/ms/generate",
			model: "black-forest-labs/FLUX.2-klein-9B",
			needs: !0
		} : a === "custom" ? {
			accepts: !0,
			endpoint: "/api/ms/generate",
			model: String(t.msCustomModel || ""),
			needs: !1
		} : {
			accepts: !1,
			endpoint: "/generate",
			model: "Tongyi-MAI/Z-Image-Turbo",
			needs: !1
		}, s = r.filter((e) => e.kind === "image").slice(0, 3);
		if (o.needs && !s.length) throw Error("当前 ModelScope 模型需要图片输入");
		let l = C(t, "ms"), [u, d] = l.split("x").map(Number), f = [];
		if (o.accepts) for (let t of s) f.push(await L(e, t.url, i).catch(() => t.url));
		let p = a === "zimage" ? {
			prompt: n,
			resolution: l
		} : a === "qwen_edit" ? {
			prompt: n,
			image_urls: f,
			resolution: l
		} : {
			prompt: n,
			model: o.model,
			image_urls: f,
			width: u,
			height: d,
			size: l
		}, m = Math.max(1, Math.min(8, Number(t.count || 1)));
		return {
			request: p,
			outputs: (await Promise.all(Array.from({ length: m }, () => c(o.endpoint, p, i)))).flatMap((e) => F(e, "image"))
		};
	}, v = async (e, t, r, i) => {
		let a = String(e.comfyMode || e.mode || "text");
		if (a === "text") {
			let n = {
				prompt: t,
				width: Number(e.width || 1024),
				height: Number(e.height || 1024),
				workflow_json: "Z-Image.json",
				type: "zimage"
			};
			return {
				request: n,
				outputs: F(await c("/api/generate", n, i), "image")
			};
		}
		if (a === "enhance") {
			let t = te(r, "image", "Comfy 增强"), n = {
				workflow_json: "Z-Image-Enhance.json",
				type: "enhance",
				params: {
					15: { image: await y(t, i) },
					204: { value: Number(e.enhanceStrength ?? .5) }
				}
			};
			return {
				request: n,
				outputs: F(await c("/api/generate", n, i), "image")
			};
		}
		if (a === "edit") {
			let e = r.filter((e) => e.kind === "image").slice(0, 3);
			if (!e.length) throw Error("Comfy 编辑需要图片输入");
			let n = await Promise.all(e.map((e) => y(e, i))), a = {
				prompt: t,
				workflow_json: "Flux2-Klein.json",
				type: "klein",
				params: {
					168: { text: t },
					158: { noise_seed: Math.floor(Math.random() * 1e6) },
					278: { image: n[0] || "" },
					270: { image: n[1] || "" },
					292: { image: n[2] || "" },
					313: { value: !!n[1] },
					314: { value: !!n[2] }
				}
			};
			return {
				request: a,
				outputs: F(await c("/api/generate", a, i), "image")
			};
		}
		let o = String(e.comfyWorkflow || "");
		if (!o) throw Error("请选择 ComfyUI 工作流");
		let s = await n(o), l = s.config && typeof s.config == "object" ? s.config : { fields: [] }, u = Array.isArray(l.fields) ? l.fields : [], d = {}, f = new Map([
			"image",
			"video",
			"audio"
		].map((e) => [e, r.filter((t) => t.kind === e)])), p = /* @__PURE__ */ new Map();
		for (let n of u) {
			let r = String(n.id || "");
			if (!r) continue;
			let a = ee(n);
			if (a === "prompt") d[r] = t;
			else if (a === "image" || a === "video" || a === "audio") {
				let e = p.get(a) || 0, t = f.get(a)?.[e];
				p.set(a, e + 1), d[r] = t ? await y(t, i) : "";
			} else d[r] = e.comfyParams?.[r] ?? n.default;
		}
		let m = {
			config: l,
			fields: d
		};
		return {
			request: m,
			outputs: F(await c(`/api/workflows/${encodeURIComponent(o)}/run`, m, i), "image")
		};
	}, y = async (t, n) => {
		if (t.comfy_name) return String(t.comfy_name);
		let r = await e(t.url, { signal: n });
		if (!r.ok) return t.name || t.url;
		let i = new FormData();
		i.append("files", new File([await r.blob()], t.name || "smart-ref.png"));
		let a = await m(e, "/api/upload", {
			method: "POST",
			body: i
		}, { signal: n });
		return String(a.files?.[0]?.comfy_name || t.name || t.url);
	};
	return {
		canHandle: o,
		recoverDocument: d,
		runCommand: u,
		runNode: l
	};
}
function b(e) {
	let t = e.runSettings && typeof e.runSettings == "object" ? structuredClone(e.runSettings) : {}, n = String(t.engine || "api");
	return {
		...t,
		engine: n,
		apiKind: t.apiKind || "image",
		provider_id: t.provider_id || t.apiProvider || (n === "volcengine" ? "volcengine" : ""),
		videoProvider: t.videoProvider || t.apiProvider || (n === "volcengine" ? "volcengine" : ""),
		videoModel: t.videoModel || t.model || "",
		videoDuration: t.videoDuration ?? t.duration ?? 5,
		videoAspect: t.videoAspect || t.aspectRatio || "16:9",
		videoResolution: t.videoResolution || t.resolution || "",
		comfyMode: t.comfyMode || t.mode || "text"
	};
}
function x(e, t, n) {
	let r = String(e.provider_id || ""), i = String(e.model || "");
	if (!r || !i) throw Error("请选择 API 平台和模型");
	return {
		prompt: t,
		provider_id: r,
		model: i,
		size: C(e),
		quality: e.quality || "auto",
		n: 1,
		reference_images: n.filter((e) => e.kind === "image")
	};
}
function S(e, t, n, r) {
	let i = String(e.videoProvider || "comfly"), a = String(e.videoModel || "veo3-fast");
	if (!a) throw Error("请选择视频模型");
	let o = (r.api_providers || []).find((e) => e.id === i), s = i === "volcengine" || String(o?.protocol || "").toLowerCase() === "volcengine", c = (e) => String(s ? e.asset_uris?.volcengine || e.url : e.uploadedUrl || e.url), l = !s && !!e.videoUseFrameRoles, u = n.filter((e) => e.kind === "image").map((e, t) => ({
		url: c(e),
		name: e.name || `图${t + 1}`,
		...l && t < 2 ? { role: t === 0 ? "first_frame" : "last_frame" } : {}
	})), d = Array.isArray(e.videoTempShLinks) ? e.videoTempShLinks.filter((e) => e.manual && e.url).map((e) => String(e.url)) : [], f = d.length ? d : n.filter((e) => e.kind === "video").map(c), p = n.filter((e) => e.kind === "audio").map(c), m = a.toLowerCase().replaceAll("_", "-").replaceAll(".", "-").includes("seedance-2-5"), h = Number(e.videoDuration);
	return {
		prompt: t,
		provider_id: i,
		model: a,
		duration: m && h === -1 ? -1 : Math.max(m ? 4 : 1, Math.min(m ? 30 : 60, h || 5)),
		aspect_ratio: e.videoAspect || "16:9",
		resolution: e.videoResolution || "",
		images: u,
		videos: f,
		audios: p,
		enhance_prompt: !!(e.videoEnhancePrompt ?? e.enhancePrompt),
		enable_upsample: !!(e.videoEnableUpsample ?? e.enableUpsample),
		watermark: !!(e.videoWatermark ?? e.watermark),
		camerafixed: !!(e.videoCameraFixed ?? e.cameraFixed),
		generate_audio: !!(e.videoGenerateAudio ?? e.generateAudio),
		multimodal: !!(e.videoMultimodal ?? e.multimodal),
		trusted_asset: [
			...u.map((e) => e.url),
			...f,
			...p
		].some((e) => e.startsWith("asset://")),
		task_mode: e.videoTaskMode || e.taskMode || "auto"
	};
}
function C(e, t = "") {
	let n = String(e[t ? `${t}Ratio` : "ratio"] || "square"), r = String(e[t ? `${t}Resolution` : "resolution"] || "1k"), i = String(e[t ? `${t}CustomSize` : "customSize"] || "");
	return r === "custom" && /^\d{2,5}x\d{2,5}$/i.test(i) ? i : v[n]?.[r] || v.square[r] || v.square["1k"];
}
function w(e, t, n) {
	let r = new Map(e.nodes.map((e) => [e.id, e])), i = e.connections.filter((e) => e.to === t.id && String(e.kind || "flow") !== "history").map((e) => r.get(e.from)).filter(Boolean), a = [], o = [], s = (e, t = "image") => {
		if (!e) return;
		let n = typeof e == "string" ? { url: e } : e, r = String(n.url || n.sourceUrl || n.localUrl || "");
		if (!r) return;
		let i = I(n, t);
		o.push({
			...n,
			kind: i,
			name: String(n.name || `${i}-${o.length + 1}`),
			url: r
		});
	};
	i.forEach((e) => {
		if (e.type === "prompt" && e.text && a.push(String(e.text)), e.type === "loop") {
			let t = n?.loopId === e.id ? n : void 0, r = t?.prompt ?? e.currentPrompt, i = t?.images ?? (Array.isArray(e.currentImages) ? e.currentImages : []);
			r && a.push(String(r)), i.forEach((e) => s(e));
		}
		e.type === "smart-image" && (Array.isArray(e.images) ? e.images : []).forEach((e) => s(e));
	}), (Array.isArray(t.runInputRefs) ? t.runInputRefs : []).forEach((e) => s(e)), (Array.isArray(t.runPromptRefs) ? t.runPromptRefs : []).forEach((e) => s(e)), t.type === "smart-image" && (Array.isArray(t.images) ? t.images : []).forEach((e) => s(e)), (t.runModelPrompt || t.runPrompt || t.promptDraftText) && a.push(String(t.runModelPrompt || t.runPrompt || t.promptDraftText));
	let c = /* @__PURE__ */ new Set();
	return {
		prompts: a.map((e) => e.trim()).filter(Boolean),
		media: o.filter((e) => !!(e.url && !c.has(e.url) && c.add(e.url)))
	};
}
function T(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = [], i = /* @__PURE__ */ new Set(), a = (o) => {
		if (i.has(o)) return;
		i.add(o), e.connections.filter((e) => e.to === o && String(e.kind || "flow") !== "history").forEach((e) => a(e.from));
		let s = n.get(o);
		s && (s.type === "smart-image" && (o === t || s.runSettings) || s.type === "prompt" && s.llmEnabled) && r.push(o);
	};
	return a(t), r;
}
function E(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = /* @__PURE__ */ new Set([t]), i = [t], a = [];
	for (; i.length;) {
		let t = i.shift();
		e.connections.filter((e) => e.from === t && String(e.kind || "flow") !== "history").forEach((e) => {
			if (r.has(e.to)) return;
			r.add(e.to);
			let t = n.get(e.to);
			t && (a.push(t), i.push(t.id));
		});
	}
	return a.filter((e) => e.type === "smart-image").at(-1) || null;
}
function D(e, t) {
	let n = Array.isArray(e.variablePrompts) ? e.variablePrompts.map(String) : String(e.variablePrompt || "").split(/\r?\n/), r = Math.max(0, t - Math.max(1, Number(e.loopStart || 1)));
	return String(n[r % Math.max(1, n.length)] || "").replaceAll("《计数》", String(t)).replaceAll("《进度》", `${r + 1}/${Math.max(1, Number(e.count || 1))}`);
}
function O(e, t, n) {
	let r = w(e, t).media.filter((e) => e.kind === "image"), i = Math.max(0, Number(t.loopStart || 1) - 1 + n - Math.max(1, Number(t.loopStart || 1)));
	return r.slice(i, i + Math.max(1, Number(t.imageBatchSize || 1)));
}
function k(e) {
	return Array.isArray(e.pendingTasks) ? e.pendingTasks.filter((e) => !!(e && typeof e == "object" && e.taskId)) : [];
}
function A(e, t, n) {
	if (n.status === "succeeded") {
		let r = F(n.result, String(t.kind || "image"));
		return e.pendingTasks = k(e).filter((e) => e.taskId !== t.taskId), e.pending = k(e).length, r;
	}
	return t.failed = !0, t.recoveryStatus = n.status, t.error = n.error || `任务状态：${n.status}`, n.upstream_task_id && (t.recoverTaskId = n.upstream_task_id), t.recoverTaskId || (e.pendingTasks = k(e).filter((e) => e.taskId !== t.taskId), e.pending = k(e).length), e.running = !1, e.runStatus = "failed", e.runError = String(t.error), [];
}
function j(e, t, n, r) {
	let i = (Array.isArray(t.images) ? t.images : []).filter(Boolean);
	i.length && !r && M(e, t, i), t.images = r ? [...i, ...n] : n, t.pendingTasks = void 0, t.pending = 0, t.running = !1, t.runStatus = "done", t.runError = "", t.runFinishedAt = Date.now(), t.runElapsedMs = Math.max(0, Number(t.runFinishedAt) - Number(t.runStartedAt || t.runFinishedAt)), t.outputKind = n[0]?.kind || "image";
	let a = Array.isArray(t.images) ? t.images.length : 0;
	t.title = a > 1 ? t.outputKind === "video" ? "Videos" : "Group" : t.outputKind === "video" ? "Video" : "Image", t.scale = a > 1 ? .8 : 2, t.w = void 0, t.h = void 0;
}
function M(e, t, n) {
	let r = e.nodes.find((e) => e.type === "smart-image" && e.historyFor === t.id);
	r || (r = {
		id: z("smart-history"),
		type: "smart-image",
		title: "历史分组",
		historyFor: t.id,
		isHistoryGroup: !0,
		images: [],
		scale: .8,
		x: Number(t.x || 0),
		y: Number(t.y || 0) + 260
	}, e.nodes.push(r), e.connections.push({
		from: t.id,
		to: r.id,
		kind: "history"
	})), r.images = [...Array.isArray(r.images) ? r.images : [], ...n];
}
function N(e, t, n, r) {
	t.running = !1, t.pending = k(t).length, t.runStatus = "failed", t.runError = n instanceof Error ? n.message : String(n), t._cascadeFailed = !0, P(e, t, r, [], String(t.runError || ""));
}
function P(e, t, n, r, i) {
	let a = Array.isArray(e.logs) ? e.logs : [];
	e.logs = [{
		id: z("log"),
		createdAt: Date.now(),
		status: i ? "failed" : "success",
		nodeId: t.id,
		nodeType: t.type,
		request: n,
		outputs: r,
		error: i
	}, ...a].slice(0, 500);
}
function F(e, t) {
	let n = [], r = (e) => {
		if (!e) return;
		if (typeof e == "string") {
			/^(https?:\/\/|\/|data:|blob:)/i.test(e) && n.push({
				kind: I({ url: e }, t),
				name: `output-${n.length + 1}`,
				url: e
			});
			return;
		}
		if (Array.isArray(e)) {
			e.forEach(r);
			return;
		}
		if (typeof e != "object") return;
		let i = e, a = i.url || i.path || i.src || i.uri || i.output_url || i.video_url;
		typeof a == "string" && n.push({
			...i,
			kind: I(i, t),
			name: String(i.name || `output-${n.length + 1}`),
			url: a
		}), [
			"images",
			"videos",
			"audios",
			"files",
			"texts",
			"outputs",
			"items",
			"data",
			"result",
			"output"
		].forEach((e) => r(i[e]));
	};
	r(e);
	let i = /* @__PURE__ */ new Set();
	return n.filter((e) => !!(e.url && !i.has(e.url) && i.add(e.url)));
}
function I(e, t = "image") {
	let n = String(e.kind || e.type || t).toLowerCase(), r = String(e.url || "").toLowerCase();
	return n.includes("video") || /\.(mp4|webm|mov|m4v)(\?|$)/.test(r) ? "video" : n.includes("audio") || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(r) ? "audio" : n.includes("text") || /\.(txt|json|md)(\?|$)/.test(r) ? "text" : "image";
}
function ee(e) {
	if (e.type === "image" || e.type === "video" || e.type === "audio") return e.type;
	let t = `${String(e.input || "")} ${String(e.name || "")}`.toLowerCase();
	return e.type === "textarea" || /prompt|text|提示词|正向|负向/.test(t) ? "prompt" : "setting";
}
function te(e, t, n) {
	let r = e.find((e) => e.kind === t);
	if (!r) throw Error(`${n}需要${t === "image" ? "图片" : t}输入`);
	return r;
}
async function L(e, t, n) {
	let r = await e(t, { signal: n });
	if (!r.ok) throw Error("读取图片失败");
	let i = new Uint8Array(await (await r.blob()).arrayBuffer()), a = "";
	return i.forEach((e) => {
		a += String.fromCharCode(e);
	}), `data:${r.headers.get("content-type") || "application/octet-stream"};base64,${btoa(a)}`;
}
function R(e) {
	if (e.aborted) throw Error("执行已停止");
}
function z(e) {
	return `${e}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}
//#endregion
//#region src/canvas/application/modern-canvas-runtime.ts
var B = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"llm",
	"video"
]), ne = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"video"
]);
function re(e, t = fetch) {
	let n = {}, r = [], i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map(), s = async () => {
		let [e, i] = await Promise.all([Te(t, "/api/config", {}), Te(t, "/api/workflows", { workflows: [] })]);
		n = e, r = Array.isArray(i.workflows) ? i.workflows : [];
	}, c = async (e) => {
		let n = String(e || "").trim();
		if (!n) return [];
		let r = i.get(n);
		return r || (r = await m(t, `/api/workflows/${encodeURIComponent(n)}`), i.set(n, r)), structuredClone(r.config?.fields ?? []);
	}, l = (e, t, i = {
		id: "",
		type: e
	}) => {
		if (e === "comfy" && t === "workflow") return r.map((e) => ({
			value: String(e.name || ""),
			label: String(e.title || e.name || "")
		}));
		if (e === "msgen" && t === "model") return [
			{
				value: "zimage",
				label: "Z-Image Turbo"
			},
			{
				value: "qwen_edit",
				label: "Qwen Edit"
			},
			{
				value: "custom",
				label: "自定义 ModelScope 模型"
			}
		];
		let a = u(e);
		if (t === "provider") return a.map((e) => ({
			value: String(e.id || ""),
			label: String(e.name || e.id || "")
		}));
		if (t === "model") {
			let t = a.find((t) => t.id === (e === "llm" ? i.llmProvider : i.apiProvider)) ?? a[0], r = e === "video" ? t?.video_models : e === "llm" ? t?.chat_models : t?.image_models, o = e === "video" ? n.video_models : e === "llm" ? n.chat_models : n.image_models;
			return [...new Set((r ?? o ?? []).map(String).filter(Boolean))].map((e) => ({
				value: e,
				label: e
			}));
		}
		if (e === "msgen" && t === "custom-model") {
			let e = (n.api_providers ?? []).find((e) => e.id === "modelscope");
			return [...new Set([...e?.image_models ?? [], String(i.msCustomModel || "")].filter(Boolean))].map((e) => ({
				value: e,
				label: e
			}));
		}
		if (e === "msgen" && t === "lora") {
			let e = (n.api_providers ?? []).find((e) => e.id === "modelscope"), t = String(i.msCustomModel || i.msgenModel || "");
			return (e?.ms_loras ?? []).filter((e) => !e.model && !e.model_id || [e.model, e.model_id].includes(t)).map((e) => ({
				value: String(e.id || ""),
				label: String(e.name || e.id || ""),
				meta: { strength: Number(e.strength ?? .8) }
			}));
		}
		return [];
	}, u = (e) => (n.api_providers ?? []).filter((t) => {
		let n = e === "video" ? t.video_models : e === "llm" ? t.chat_models : t.image_models;
		return t.enabled !== !1 && Array.isArray(n) && n.length > 0;
	}), f = async (e) => {
		let n = new FormData();
		return e.forEach((e) => n.append("files", e)), m(t, "/api/ai/upload", {
			method: "POST",
			body: n
		});
	}, p = (e) => {
		let t = structuredClone(e), n = Math.max(1, Number(t.frameRate || 24)), r = Math.max(1, Number(t.durationFrames || 120));
		return t.frameRate = n, t.durationFrames = r, t.durationSeconds = Math.round(r / n * 1e3) / 1e3, t.ltxTimelineData ||= JSON.stringify({
			segments: [{
				id: Se("ltxseg"),
				start: 0,
				length: r,
				prompt: "",
				type: "text"
			}],
			audioSegments: []
		}), t;
	}, h = async (e, n, r, i = "") => {
		let a = structuredClone(n), o = a.nodes.find((t) => t.id === e && t.type === "video");
		if (!o) throw Error("Video node is missing from the active canvas");
		if (r === "manual") {
			let e = i.trim();
			if (e && !/^(https?:\/\/|asset:\/\/)/i.test(e)) throw Error("请输入 http/https 媒体网址或 asset:// 素材 URI");
			return o.manualVideoUrl = e, a;
		}
		let s = ie(a, o).media.filter((e) => e.kind === "video" || e.kind === "audio"), c = { ...o.uploadedMediaUrls ?? {} };
		for (let e of s) {
			if (/^(https?:\/\/|asset:\/\/)/i.test(e.url)) {
				c[e.url] = e.url;
				continue;
			}
			let n = await m(t, "/api/cloud-video/upload", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: e.url,
					service: "auto"
				})
			});
			if (!n.url) throw Error("云端没有返回媒体链接");
			c[e.url] = n.url;
		}
		return o.uploadedMediaUrls = c, a;
	}, g = y({
		fetcher: t,
		getConfig: () => n,
		getWorkflow: async (e) => {
			let n = i.get(e);
			return n || (n = await m(t, `/api/workflows/${encodeURIComponent(e)}`), i.set(e, n)), n;
		},
		taskClient: e
	}), _ = async (e, t, n = "node", r) => {
		if (t.kind === "smart" && g.canHandle(t.nodes.find((t) => t.id === e))) return g.runNode(e, t, n, r);
		let i = structuredClone(t), o = n === "cascade" ? d(i).cascadeOrder(e) : [e];
		if (!o.length) throw Error("没有可执行的节点");
		let s = new AbortController();
		a.get(e)?.abort(), a.set(e, s);
		try {
			for (let t of o) {
				if (s.signal.aborted) throw Error("执行已停止");
				await x(i, t, n === "chat" && t === e, s.signal, r);
			}
			return i;
		} finally {
			a.get(e) === s && a.delete(e);
		}
	}, v = async (e, t, n, r) => {
		if (n.kind === "smart" && g.canHandle(n.nodes.find((e) => e.id === t))) return g.runCommand(e, t, n, r);
		if (e === "stop-execution") return a.get(t)?.abort(), structuredClone(n);
		let i = structuredClone(n), o = d(i).retryCascadeOrder(t), s = new AbortController();
		a.set(t, s);
		try {
			for (let e of o) await x(i, e, !1, s.signal, r);
			return i;
		} finally {
			a.get(t) === s && a.delete(t);
		}
	}, b = async (t, n) => {
		let r = await g.recoverDocument(t, n), i = [];
		for (let t of r.nodes.filter((e) => e.type === "output")) for (let a of Array.isArray(t._pending) ? t._pending : []) {
			let o = String(a.canvasTaskId || ""), s = a.canvasTaskType === "video" ? "video" : ["image", "online-image"].includes(String(a.canvasTaskType || "")) ? "image" : null;
			!o || !s || (a.recoveryStatus = "recovering", a.failed = !1, i.push(e.watch(s, o).then(async (e) => {
				let i = r.nodes.find((e) => e.id === String(a.nodeId || ""));
				if (e.status === "succeeded") {
					let n = H(e.result);
					i && (ce(i, n), i.runStatus = "done", i.runError = ""), n.length && se(t, n), t._pending = t._pending.filter((e) => e.id !== a.id), Ee(r, {
						id: Se("log"),
						nodeId: i?.id || a.nodeId,
						nodeType: i?.type || a.type,
						recovered: !0,
						status: "done",
						outputs: n.map(U),
						...De(e, a)
					});
				} else a.recoveryStatus = e.status, a.recoveryError = e.error || `任务状态：${e.status}`, a.failed = !0, i && (i.runStatus = "failed", i.runError = String(a.recoveryError));
				await we(r, n);
			}).catch(async (e) => {
				a.recoveryStatus = "interrupted", a.recoveryError = e instanceof Error ? e.message : String(e), a.failed = !0, await we(r, n);
			})));
		}
		return i.length && (await we(r, n), await Promise.all(i)), r;
	}, x = async (e, t, n, r, i) => {
		let a = e.nodes.find((e) => e.id === t);
		if (!a || !B.has(a.type)) throw Error(`不支持执行节点：${a?.type || t}`);
		a.running = !0, a.runStatus = "running", a.runError = "", await we(e, i);
		let s = ie(e, a), c = null, l = null, u = [], d = !1, f = Date.now(), p = `${String(e.id || "")}:${t}`;
		o.delete(p);
		try {
			a.type !== "llm" && (l = oe(e, a), l && (c = {
				id: Se("pending"),
				startedAt: Date.now(),
				nodeId: t,
				type: a.type
			}, l._pending = [...Array.isArray(l._pending) ? l._pending : [], c], await we(e, i))), u = await S(e, a, s, n, r, c, i), u.length && (ce(a, u), l && se(l, u, s.media[0])), a.runStatus = "done", a.runError = "", d = !0, Ee(e, {
				id: Se("log"),
				nodeId: t,
				nodeType: a.type,
				status: "done",
				startedAt: f,
				finishedAt: Date.now(),
				outputs: u.map(U),
				...o.get(p)
			});
		} catch (n) {
			throw a.runStatus = "failed", a.runError = n instanceof Error ? n.message : String(n), c?.canvasTaskId && (c.failed = !0, c.recoveryStatus ||= "interrupted", c.recoveryError ||= a.runError), Ee(e, {
				id: Se("log"),
				nodeId: t,
				nodeType: a.type,
				status: "failed",
				startedAt: f,
				finishedAt: Date.now(),
				error: a.runError,
				...o.get(p)
			}), n;
		} finally {
			a.running = !1, l && c && (d || !c.canvasTaskId) && (l._pending = (Array.isArray(l._pending) ? l._pending : []).filter((e) => e.id !== c?.id)), o.delete(p), await we(e, i);
		}
	}, S = async (e, t, r, i, a, o, s) => {
		let c = r.prompts.join("\n\n").trim() || String(t.userInput || t.globalPrompt || "");
		if (t.type === "llm") {
			let e = i ? String(t.chatInput || c) : c;
			if (!e) throw Error("LLM 缺少提示词输入");
			let n = Array.isArray(t.messages) ? t.messages : [], o = await E("/api/canvas-llm", {
				message: e,
				model: t.model || t.llmMsModel || "",
				ms_model: t.llmProvider === "modelscope" && (t.model || t.llmMsModel) || "",
				provider: t.llmProvider || "",
				system_prompt: t.systemPrompt || "You are a helpful assistant.",
				messages: n,
				images: r.media.filter((e) => e.kind === "image"),
				videos: r.media.filter((e) => e.kind === "video")
			}, a);
			return t.outputText = o.text || "", i && (t.messages = [
				...n,
				{
					role: "user",
					content: e
				},
				{
					role: "assistant",
					content: o.text || ""
				}
			], t.chatInput = ""), [];
		}
		if (!c && t.type !== "comfy" && !(t.type === "generator" && r.media.some((e) => e.kind === "image"))) throw Error("缺少提示词输入");
		if (t.type === "video") {
			let n = {
				prompt: c,
				provider_id: t.apiProvider || "",
				model: t.model || "veo3-fast",
				duration: Number(t.duration || 5),
				aspect_ratio: t.aspectRatio || "16:9",
				resolution: t.resolution || "",
				images: r.media.filter((e) => e.kind === "image"),
				videos: [String(t.manualVideoUrl || ""), ...r.media.filter((e) => e.kind === "video").map((e) => xe(t, e.url))].filter(Boolean),
				audios: r.media.filter((e) => e.kind === "audio").map((e) => xe(t, e.url)),
				enhance_prompt: !!t.enhancePrompt,
				enable_upsample: !!t.enableUpsample,
				watermark: !!t.watermark,
				camerafixed: !!t.cameraFixed,
				generate_audio: !!t.generateAudio,
				multimodal: !!t.multimodal,
				task_mode: t.taskMode || "auto"
			};
			return T("video", e, t, n, a, o, s);
		}
		if (t.type === "generator") {
			let i = me(t, n.api_providers ?? []), l = r.media.filter((e) => e.kind === "image"), u = c || "Edit the reference images.", d = await fe(t, l);
			he(i.providerId, i.model, d, l.length), Object.assign(t, {
				apiProvider: i.providerId,
				model: i.model
			});
			let f = {
				prompt: u,
				provider_id: i.providerId,
				model: i.model,
				size: d,
				reference_images: l,
				quality: ge(t.quality),
				n: Math.max(1, Math.min(8, Number(t.count || 1)))
			};
			return T("image", e, t, f, a, o, s);
		}
		if (t.type === "msgen") {
			let e = String(t.msgenModel || "zimage"), n = de(t.msRatio, t.msResolution, t.msCustomSize, t.msWidth, t.msHeight), i = e === "qwen_edit" ? "/api/angle/generate" : "/generate", o = {
				prompt: c,
				resolution: n,
				client_id: Ce()
			};
			e !== "zimage" && (o.image_urls = r.media.filter((e) => e.kind === "image").map((e) => e.url)), e === "custom" && (o.model = t.msCustomModel || ""), t.msLoraEnabled && t.msLoraId && (o.loras = { [String(t.msLoraId)]: Number(t.msLoraStrength ?? .8) });
			let s = Math.max(1, Math.min(8, Number(t.count || 1)));
			return (await Promise.all(Array.from({ length: s }, () => E(i, o, a)))).flatMap(H);
		}
		if (t.type === "ltxDirector") {
			let e = p(t);
			Object.assign(t, e);
			let n = le(t, c), r = JSON.parse(String(n.timeline_data || "{}"));
			for (let e of r.segments ?? []) e.type !== "image" || e.imageFile || !e.imageB64 || (e.imageFile = await D({
				kind: "image",
				name: `ltx-${String(e.id || "segment")}.png`,
				url: String(e.imageB64)
			}, a), delete e.imgObj);
			n.timeline_data = JSON.stringify(r), t.ltxTimelineData = n.timeline_data, t.ltxLocalPrompts = n.local_prompts, t.ltxSegmentLengths = n.segment_lengths, t.ltxGuideStrength = n.guide_strength;
			let i = {
				46: n,
				"94:28": { noise_seed: Number(t.noiseSeed ?? 12) }
			};
			return H(await E("/api/generate", {
				prompt: c,
				workflow_json: "LTXDirectorv2-API.json",
				params: i,
				type: "ltx-director",
				client_id: Ce()
			}, a));
		}
		return C(t, r, c, a);
	}, C = async (e, t, n, i) => {
		let a = String(e.mode || "text"), o;
		if (a === "text") o = {
			prompt: n,
			width: Number(e.width || 1024),
			height: Number(e.height || 1024),
			workflow_json: "Z-Image.json",
			type: "zimage",
			client_id: Ce()
		};
		else if (a === "enhance") {
			let n = ae(t, "image", 1, "Comfy 增强")[0], r = V(await E("/api/generate", {
				workflow_json: "Z-Image-Enhance.json",
				params: {
					15: { image: await D(n, i) },
					204: { value: Number(e.enhanceStrength ?? .5) }
				},
				type: "enhance",
				client_id: Ce()
			}, i), "Comfy 增强");
			return e.enhanceUpscale ? w(r[0], Number(e.enhanceUpscaleRes || 2048), i) : r;
		} else if (a === "custom") {
			let a = String(e.comfyWorkflow || r[0]?.name || ""), s = await c(a), l = {}, u = new Map([
				"image",
				"video",
				"audio"
			].map((e) => [e, t.media.filter((t) => t.kind === e)])), d = /* @__PURE__ */ new Map();
			for (let e of [
				"image",
				"video",
				"audio"
			]) {
				let n = s.filter((t) => ue(t) === e).length;
				n && ae(t, e, n, `Comfy 工作流 ${a || "未命名"}`);
			}
			for (let t of s) {
				let r = String(t.node || ""), a = String(t.input || "");
				if (!r || !a) continue;
				l[r] ??= {};
				let o = ue(t);
				if (o === "prompt") l[r][a] = n;
				else if ([
					"image",
					"video",
					"audio"
				].includes(o)) {
					let e = d.get(o) ?? 0, t = u.get(o)?.[e];
					d.set(o, e + 1), l[r][a] = t ? await D(t, i) : "";
				} else {
					let n = String(t.id || ""), i = (e.comfyParams ?? {})[n] ?? t.default, o = (e.comfyRandomActive ?? {})[n] !== !1;
					l[r][a] = t.random_enabled && o ? W(t) : i;
				}
			}
			o = {
				prompt: n,
				workflow_json: a,
				params: l,
				type: "workflow-custom",
				client_id: Ce()
			};
		} else {
			let r = ae(t, "image", 1, "Comfy 编辑").slice(0, 3), a = [];
			for (let e of r) a.push(await D(e, i));
			let o = V(await E("/api/generate", {
				prompt: n,
				workflow_json: "Flux2-Klein.json",
				type: "klein",
				params: {
					168: { text: n },
					158: { noise_seed: Math.floor(Math.random() * 1e6) },
					278: { image: a[0] || "" },
					270: { image: a[1] || "" },
					292: { image: a[2] || "" },
					313: { value: !!a[1] },
					314: { value: !!a[2] }
				},
				client_id: Ce()
			}, i), "Comfy 编辑");
			return e.editUpscale ? w(o[0], Number(e.editUpscaleRes || 2048), i) : o;
		}
		return H(await E("/api/generate", o, i));
	}, w = async (e, t, n) => {
		let r = U(e);
		if (!r) throw Error("Comfy 超分辨率缺少输入图片");
		let i = await D({
			kind: "image",
			name: "canvas-upscale.png",
			url: r
		}, n);
		return V(await E("/api/generate", {
			workflow_json: "upscale.json",
			params: {
				15: { image: i },
				172: {
					seed: Math.floor(Math.random() * 4294967295),
					resolution: Math.max(64, t || 2048)
				}
			},
			type: "enhance",
			client_id: Ce()
		}, n), "Comfy 超分辨率");
	}, T = async (t, n, r, i, a, s, c) => {
		let l = `${n.id}:${r.id}:${Se("submit")}`, u = await e.submit(t, i, {
			idempotencyKey: l,
			signal: a
		}), d = String(u.task_id || u.id || ""), f = `${String(n.id || "")}:${r.id}`;
		o.set(f, De(u, {
			canvasTaskId: d,
			idempotencyKey: l
		})), s && Object.assign(s, {
			canvasTaskId: d,
			canvasTaskType: t,
			idempotencyKey: l
		}), await we(n, c);
		let p = await e.wait(t, d, { signal: a });
		if (o.set(f, De(p, {
			canvasTaskId: d,
			idempotencyKey: l
		})), p.status !== "succeeded") throw s && Object.assign(s, {
			failed: !0,
			recoveryStatus: p.status,
			recoveryError: p.error || `${t} task failed`
		}), Error(p.error || `${t} task failed`);
		return H(p.result);
	}, E = (e, n, r) => m(t, e, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(n)
	}, { signal: r }), D = async (e, n) => {
		let r = await t(/^https?:\/\//i.test(e.url) ? `/api/download-output?inline=1&url=${encodeURIComponent(e.url)}&name=${encodeURIComponent(e.name || "media")}` : e.url, { signal: n });
		if (!r.ok) throw Error(`读取 ComfyUI 输入媒体失败：${e.name || e.url}`);
		let i = await r.blob(), a = new FormData();
		a.append("files", new File([i], e.name || `canvas-${e.kind}`, { type: i.type }));
		let o = await m(t, "/api/upload", {
			method: "POST",
			body: a
		}, { signal: n }), s = String(o.files?.[0]?.comfy_name || "");
		if (!s) throw Error("ComfyUI 没有返回媒体文件名");
		return s;
	};
	return {
		getComfyFields: c,
		getNodeOptions: l,
		initialize: s,
		normalizeLtxNode: p,
		prepareVideoMedia: h,
		recoverDocument: b,
		runCommand: v,
		runNode: _,
		uploadMedia: f
	};
}
function ie(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = e.connections.filter((e) => e.to === t.id).map((e) => n.get(e.from)).filter(Boolean), i = [], a = [], o = (e) => {
		e.type === "prompt" && e.text && i.push(String(e.text)), e.type === "llm" && e.outputText && i.push(String(e.outputText)), (e.type === "promptGroup" || e.type === "group") && (Array.isArray(e.items) ? e.items : []).map(String).map((e) => n.get(e)).filter(Boolean).forEach((e) => o(e)), e.type === "image" && e.url && a.push(_e(e.url, e.mediaKind, e.name)), e.type === "output" && (Array.isArray(e.images) ? e.images : []).slice(-1).forEach((e) => a.push(_e(U(e), ve(e), "output"))), ne.has(e.type) && (Array.isArray(e.generatedOutputs) ? e.generatedOutputs : []).forEach((t) => a.push(_e(U(t), ve(t), e.type)));
	};
	return r.forEach(o), {
		prompts: i.filter(Boolean),
		media: be(a)
	};
}
function ae(e, t, n, r) {
	let i = e.media.filter((e) => e.kind === t);
	if (i.length < n) throw Error(`${r}需要连接 ${n} 个${{
		audio: "音频",
		image: "图片",
		video: "视频"
	}[t]}输入，当前只有 ${i.length} 个`);
	return i;
}
function V(e, t) {
	let n = H(e);
	if (!n.length) throw Error(`${t}未返回任何媒体`);
	return n;
}
function oe(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = e.connections.filter((e) => e.from === t.id).map((e) => n.get(e.to)).find((e) => e?.type === "output");
	return r || (e.connections.filter((e) => e.from === t.id).map((e) => n.get(e.to)).some((e) => e && ne.has(e.type)) ? null : (r || (r = {
		id: Se("out"),
		type: "output",
		x: Number(t.x || 0) + 460,
		y: Number(t.y || 0),
		images: []
	}, e.nodes.push(r), e.connections.push({
		id: Se("edge"),
		from: t.id,
		to: r.id
	})), r));
}
function se(e, t, n) {
	let r = new Set((Array.isArray(e.images) ? e.images : []).map(U)), i = t.map((e) => ({
		url: U(e),
		kind: ve(e),
		viewed: !1
	})).filter((e) => e.url && !r.has(e.url));
	if (e.images = [...Array.isArray(e.images) ? e.images : [], ...i], n?.url) {
		let t = { ...e.imageComparisons ?? {} };
		i.forEach((e) => {
			t[e.url] = {
				url: n.url,
				name: n.name
			};
		}), e.imageComparisons = t;
	}
}
function ce(e, t) {
	e.generatedOutputs = t.map((e) => ve(e) === "image" ? U(e) : {
		url: U(e),
		kind: ve(e)
	}).filter((e) => typeof e == "string" ? e : e.url);
}
function H(e) {
	let t = [], n = (e) => {
		if (!e) return;
		if (typeof e == "string") {
			/^(https?:\/\/|\/|data:|blob:)/i.test(e) && t.push(e);
			return;
		}
		if (Array.isArray(e)) {
			e.forEach(n);
			return;
		}
		if (typeof e != "object") return;
		let r = e, i = r.url || r.path || r.src || r.uri || r.output_url || r.video_url;
		typeof i == "string" && t.push({
			url: i,
			kind: r.kind || r.type || ""
		}), [
			"images",
			"videos",
			"audios",
			"files",
			"outputs",
			"items",
			"data",
			"result",
			"output"
		].forEach((e) => n(r[e]));
	};
	n(e);
	let r = /* @__PURE__ */ new Set();
	return t.filter((e) => {
		let t = U(e);
		return !!(t && !r.has(t) && r.add(t));
	});
}
function le(e, t) {
	let n = {
		audioSegments: [],
		segments: []
	};
	try {
		let t = JSON.parse(String(e.ltxTimelineData || "{}"));
		n = {
			audioSegments: Array.isArray(t.audioSegments) ? t.audioSegments : [],
			segments: Array.isArray(t.segments) ? t.segments : []
		};
	} catch {}
	let r = Math.max(1, Number(e.durationFrames || 120)), i = t.trim() || String(e.globalPrompt || "").trim() || ".", a = n.segments.slice().sort((e, t) => Number(e.start || 0) - Number(t.start || 0)), o = [], s = [], c = 0, l = 0;
	for (let e of a) {
		let t = Math.max(0, Number(e.start || 0));
		if (t >= r) break;
		let n = Math.max(1, Number(e.length || 1));
		if (t > c) {
			let e = Math.min(t, r) - c;
			o.length ? o[o.length - 1] += e : l += e;
		}
		let a = Math.max(0, Math.min(t + n, r) - t);
		o.push(a + l);
		let u = String(e.prompt || "").trim();
		s.push(u || i), u || (e.prompt = i), l = 0, c = t + n;
	}
	o.length && Math.min(c, r) < r && (o[o.length - 1] += r - Math.min(c, r)), o.length || (o.push(r), s.push(i));
	let u = a.filter((e) => e.type !== "text").map((e) => Number(e.guideStrength ?? 1).toFixed(2)).join(","), d = JSON.stringify({
		segments: a,
		audioSegments: n.audioSegments
	});
	return {
		global_prompt: i,
		duration_frames: r,
		duration_seconds: Number(e.durationSeconds || r / Number(e.frameRate || 24)),
		timeline_data: d,
		local_prompts: s.join(" | "),
		segment_lengths: o.join(","),
		guide_strength: u,
		epsilon: Number(e.epsilon ?? .001),
		frame_rate: Number(e.frameRate || 24),
		use_custom_audio: !!e.useCustomAudio,
		display_mode: String(e.displayMode || "seconds"),
		custom_width: Math.max(0, Number(e.customWidth || 0)),
		custom_height: Math.max(0, Number(e.customHeight || 0)),
		resize_method: "maintain aspect ratio",
		divisible_by: Math.max(1, Number(e.divisibleBy || 32)),
		img_compression: Number(e.imgCompression ?? 18),
		timeline_ui: ""
	};
}
function ue(e) {
	let t = String(e.type || e.kind || e.input_type || "").toLowerCase();
	return t.includes("image") ? "image" : t.includes("video") ? "video" : t.includes("audio") ? "audio" : t.includes("prompt") || t.includes("text") ? "prompt" : "setting";
}
function de(e, t, n, r, i, a = "") {
	let o = [
		"1k",
		"2k",
		"4k"
	].includes(String(t || "").toLowerCase()) ? String(t).toLowerCase() : "1k";
	if (String(t || "") === "custom" && n) return String(n).trim();
	if (String(t || "") === "custom" && Number(r) > 0 && Number(i) > 0) return `${Math.round(Number(r))}x${Math.round(Number(i))}`;
	let s = {
		square: {
			"1k": "1024x1024",
			"2k": "2048x2048",
			"4k": "4096x4096"
		},
		landscape: {
			"1k": "1536x1024",
			"2k": "2048x1360",
			"4k": "3520x2336"
		},
		portrait: {
			"1k": "1024x1536",
			"2k": "1360x2048",
			"4k": "2336x3520"
		},
		landscape43: {
			"1k": "1024x768",
			"2k": "2048x1536",
			"4k": "3312x2480"
		},
		portrait43: {
			"1k": "768x1024",
			"2k": "1536x2048",
			"4k": "2480x3312"
		},
		wide: {
			"1k": "1536x864",
			"2k": "2048x1152",
			"4k": "3840x2160"
		},
		story: {
			"1k": "864x1536",
			"2k": "1152x2048",
			"4k": "2160x3840"
		},
		ultrawide: {
			"1k": "1536x656",
			"2k": "2048x880",
			"4k": "3840x1648"
		},
		ultratall: {
			"1k": "656x1536",
			"2k": "880x2048",
			"4k": "1648x3840"
		}
	}, c = {
		"1:1": "square",
		"2:3": "portrait",
		"3:2": "landscape",
		"3:4": "portrait43",
		"4:3": "landscape43",
		"9:16": "story",
		"16:9": "wide",
		"21:9": "ultrawide",
		"9:21": "ultratall"
	}[String(e || "")] || String(e || "square");
	if ((c === "custom" || c === "source") && pe(a)) {
		let e = pe(a), t = {
			"1k": 1024,
			"2k": 2048,
			"4k": 3840
		}, n = {
			"1k": 2359296,
			"2k": 4194304,
			"4k": 8294400
		}, r = t[o] ?? 1024, i = n[o] ?? 1048576, s = e >= 1 ? r : Math.min(r * e, Math.sqrt(i * e)), c = e >= 1 ? Math.min(r / e, Math.sqrt(i / e)) : r;
		return `${Math.max(64, Math.floor(s / 16) * 16)}x${Math.max(64, Math.floor(c / 16) * 16)}`;
	}
	return s[c]?.[o] || s.square[o];
}
async function fe(e, t) {
	let n = e.customRatio;
	if (String(e.ratio || "") === "source" && !pe(n)) {
		let r = t[0];
		if (!r) throw Error("自适应比例需要至少一张参考图");
		if (typeof Image > "u") throw Error("当前环境无法读取参考图尺寸，请改用自定义比例");
		let i = await new Promise((e, t) => {
			let n = new Image();
			n.onload = () => e({
				height: n.naturalHeight,
				width: n.naturalWidth
			}), n.onerror = () => t(/* @__PURE__ */ Error("无法读取参考图尺寸，请改用自定义比例")), n.src = r.url;
		});
		n = `${i.width}:${i.height}`, e.customRatio = n, e.customRatioWidth = i.width, e.customRatioHeight = i.height;
	}
	return de(e.ratio, e.resolution, e.customSize, e.width, e.height, n);
}
function pe(e) {
	let t = String(e || "").trim().match(/^(\d+(?:\.\d+)?)\s*[:x*]\s*(\d+(?:\.\d+)?)$/i);
	if (!t) return null;
	let n = Number(t[1]), r = Number(t[2]);
	return n > 0 && r > 0 ? n / r : null;
}
function me(e, t) {
	let n = t.filter((e) => e.enabled !== !1 && Array.isArray(e.image_models) && e.image_models.length > 0);
	if (!n.length) {
		let t = String(e.apiProvider || "").trim(), n = String(e.model || "").trim();
		if (t && n) return {
			providerId: t,
			model: n
		};
	}
	let r = n.find((t) => t.id === e.apiProvider) ?? n[0];
	if (!r?.id) throw Error("没有可用的图片生成平台，请先完成 API 设置");
	let i = [...new Set((r.image_models ?? []).map(String).filter(Boolean))], a = String(e.model || ""), o = i.includes(a) ? a : i[0];
	if (!o) throw Error(`图片生成平台 ${r.name || r.id} 没有可用模型`);
	return {
		providerId: String(r.id),
		model: o
	};
}
function he(e, t, n, r) {
	let i = t.toLowerCase(), a = e === "modelscope" ? 4 : /seedream|doubao/.test(i) || e === "volcengine" ? 10 : 16;
	if (r > a) throw Error(`${t} 最多支持 ${a} 张参考图，当前连接了 ${r} 张`);
	let o = String(n || "").match(/^(\d+)x(\d+)$/i);
	if (!o) throw Error("图片尺寸无效，请选择预设尺寸或填写完整的自定义宽高");
	let s = Number(o[1]), c = Number(o[2]);
	if (s < 64 || c < 64 || s % 16 || c % 16) throw Error("图片宽高必须不小于 64，且为 16 的倍数");
	if (/gpt[^a-z0-9]*image[^a-z0-9]*2/i.test(t) && (Math.max(s, c) > 3840 || s * c > 8294400)) throw Error(`GPT-Image-2 不支持尺寸 ${n}：最长边不能超过 3840，且总像素不能超过 8294400`);
}
function ge(e) {
	let t = String(e || "").trim().toLowerCase();
	return t === "low" || t === "medium" || t === "high" ? t : void 0;
}
function _e(e, t, n) {
	return {
		url: String(e || ""),
		kind: ye(String(t || ""), String(e || "")),
		name: String(n || "media")
	};
}
function U(e) {
	return typeof e == "string" ? e : e && typeof e == "object" ? String(e.url || "") : "";
}
function ve(e) {
	return ye(e && typeof e == "object" ? String(e.kind || "") : "", U(e));
}
function ye(e, t) {
	return e === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(t) ? "video" : e === "audio" || /\.(mp3|wav|m4a|ogg)(\?|$)/i.test(t) ? "audio" : "image";
}
function W(e) {
	let t = Number.isFinite(Number(e.min)) ? Number(e.min) : 0, n = Number.isFinite(Number(e.max)) ? Number(e.max) : Math.max(t + 1, 1e6), r = Math.max(Number(e.step) || 1, 2 ** -52), i = Math.max(0, Math.floor((n - t) / r)), a = t + Math.floor(Math.random() * (i + 1)) * r;
	return Number(a.toFixed(Math.min(12, Math.max(0, String(r).split(".")[1]?.length || 0))));
}
function be(e) {
	let t = /* @__PURE__ */ new Set();
	return e.filter((e) => !!(e.url && !t.has(e.url) && t.add(e.url)));
}
function xe(e, t) {
	return String((e.uploadedMediaUrls ?? {})[t] || t);
}
function Se(e) {
	return `${e}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}
function Ce() {
	try {
		return typeof sessionStorage > "u" ? "canvas-modern" : sessionStorage.getItem("canvasClientId") || "canvas-modern";
	} catch {
		return "canvas-modern";
	}
}
async function we(e, t) {
	t && await t(structuredClone(e));
}
async function Te(e, t, n) {
	try {
		return await m(e, t);
	} catch {
		return n;
	}
}
function Ee(e, t) {
	e.logs = [...Array.isArray(e.logs) ? e.logs : [], t].slice(-500);
}
function De(e, t = {}) {
	let n = e.result && typeof e.result == "object" ? e.result : {}, r = e.cost ?? n.cost;
	return {
		canvasTaskId: String(e.task_id || e.id || t.canvasTaskId || ""),
		upstreamTaskId: String(e.upstream_task_id || n.upstream_task_id || t.upstreamTaskId || ""),
		idempotencyKey: String(e.idempotency_key || t.idempotencyKey || ""),
		...r === void 0 ? {} : { cost: structuredClone(r) }
	};
}
//#endregion
//#region src/canvas/domain/document-codec.ts
function Oe(e, t) {
	if (!e || typeof e != "object" || Array.isArray(e)) throw TypeError(`${t} must be an object`);
	return e;
}
function ke(e, t, n = !1) {
	let r = Oe(e, `nodes[${t}]`);
	if (typeof r.id != "string" || !r.id) throw TypeError(`nodes[${t}].id must be a non-empty string`);
	if (n && (r.type === void 0 || r.type === null || r.type === "") && (r.type = "smart-image"), typeof r.type != "string" || !r.type) throw TypeError(`nodes[${t}].type must be a non-empty string`);
	return r;
}
function Ae(e, t) {
	let n = Oe(e, `connections[${t}]`);
	if (typeof n.from != "string" || !n.from) throw TypeError(`connections[${t}].from must be a non-empty string`);
	if (typeof n.to != "string" || !n.to) throw TypeError(`connections[${t}].to must be a non-empty string`);
	return n;
}
function je(e) {
	return JSON.parse(JSON.stringify(e));
}
function Me(e) {
	let t = je(Oe(e, "document")), n = t.nodes ?? [], r = t.connections ?? [];
	if (!Array.isArray(n)) throw TypeError("document.nodes must be an array");
	if (!Array.isArray(r)) throw TypeError("document.connections must be an array");
	let i = Number(t.schemaVersion ?? 1);
	if (!Number.isInteger(i) || i < 1) throw TypeError("document.schemaVersion must be a positive integer");
	return {
		...t,
		schemaVersion: i,
		nodes: n.map((e, n) => ke(e, n, String(t.kind || "").toLowerCase() === "smart")),
		connections: r.map(Ae)
	};
}
function Ne(e) {
	return je(Me(e));
}
//#endregion
//#region src/canvas/infrastructure/canvas-repository.ts
var Pe = class extends p {
	serverCanvas;
	updatedAt;
	constructor(e, t, n, r) {
		super(e, "conflict", 409, r), this.serverCanvas = t, this.updatedAt = n, this.name = "CanvasConflictError";
	}
};
function Fe(e = fetch) {
	let t = (e) => `/api/canvases/${encodeURIComponent(e)}`, n = {
		audits: 0,
		backupsCreated: 0,
		backupsListed: 0,
		backupsRestored: 0,
		conflicts: 0,
		errors: 0,
		loads: 0,
		saves: 0
	}, r = async (e, ...t) => {
		try {
			let r = await m(...t);
			return n[e] += 1, r;
		} catch (e) {
			throw (!(e instanceof p) || e.code !== "conflict") && (n.errors += 1), e;
		}
	};
	return {
		audit: (t = {}, n) => {
			let i = new URLSearchParams({
				include_deleted: String(!!t.includeDeleted),
				include_details: String(t.includeDetails !== !1),
				max_files: String(Math.max(1, Math.min(2e4, Number(t.maxFiles || 5e3))))
			});
			return r("audits", e, `/api/canvas-audit?${i}`, {}, n);
		},
		createBackup: (n, i) => r("backupsCreated", e, `${t(n)}/backup`, { method: "POST" }, i),
		get: async (n, i) => Me((await r("loads", e, t(n), {}, i)).canvas),
		getDiagnostics: () => ({ ...n }),
		listBackups: async (n, i) => {
			let a = await r("backupsListed", e, `${t(n)}/backups`, {}, i);
			return Array.isArray(a.backups) ? a.backups : [];
		},
		restoreBackup: async (n, i, a) => Me((await r("backupsRestored", e, `${t(n)}/backups/${encodeURIComponent(i)}/restore`, { method: "POST" }, a)).canvas),
		save: async (i, a, o) => {
			try {
				return Me((await r("saves", e, t(i), {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(a)
				}, o)).canvas);
			} catch (e) {
				if (!(e instanceof p) || e.code !== "conflict") throw e;
				n.conflicts += 1;
				let t = Le(e.details), r = t.canvas ? Me(t.canvas) : null;
				throw new Pe(e.message, r, Number(t.updated_at || 0), e.details);
			}
		}
	};
}
function Ie(e) {
	return {
		...Ne(e),
		base_updated_at: Number(e.updated_at || 0)
	};
}
function Le(e) {
	if (!e || typeof e != "object") return {};
	let t = e.detail;
	return t && typeof t == "object" ? t : {};
}
//#endregion
//#region src/canvas/infrastructure/task-client.ts
var Re = {
	image: "/api/canvas-image-tasks",
	video: "/api/canvas-video-tasks"
};
function ze(e = fetch) {
	let t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map(), r = {
		cancelledWatches: 0,
		deduplicatedSubmissions: 0,
		deduplicatedWatches: 0,
		pollErrors: 0,
		polls: 0,
		recoveredTasks: 0,
		resumeRequests: 0,
		resumedTasks: 0,
		submissions: 0,
		submissionRetries: 0
	}, i = (t, i, a = {}) => {
		let o = String(a.idempotencyKey || "").trim(), s = o ? `${t}:${o}` : "", c = s ? n.get(s) : void 0;
		if (c) return r.deduplicatedSubmissions += 1, c;
		let l = i && typeof i == "object" && !Array.isArray(i) ? {
			...i,
			...o ? { idempotency_key: o } : {}
		} : i ?? {}, u = (async () => {
			let n = Math.max(0, Math.min(2, Number(a.retryCount ?? +!!o))), i = 0;
			for (;;) try {
				r.submissions += 1;
				let n = await m(e, Re[t], {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(l)
				}, a);
				return Be(n), n;
			} catch (e) {
				if (!(e instanceof p) || !e.retryable || i++ >= n) throw e;
				r.submissionRetries += 1;
			}
		})().finally(() => {
			s && n.delete(s);
		});
		return s && n.set(s, u), u;
	}, a = (t, n, r) => n ? m(e, `${Re[t]}/${encodeURIComponent(n)}`, {}, r) : Promise.reject(/* @__PURE__ */ TypeError("Task ID is required")), o = async (e, t, n = {}) => {
		let { intervalMs: i = e === "video" ? 2500 : 1800, maxPollErrors: o = 3, requestTimeoutMs: s = 3e4 } = n, c = Date.now(), l = 0;
		for (;;) {
			Ve(n.signal, c, n.timeoutMs);
			try {
				r.polls += 1;
				let i = await a(e, t, {
					signal: n.signal,
					timeoutMs: s
				});
				if (l = 0, i.status === "succeeded" || i.status === "failed" || i.status === "cancelled") return i;
			} catch (e) {
				if (r.pollErrors += 1, !(e instanceof p) || !e.retryable || l++ >= o) throw e;
			}
			await He(i, n.signal, c, n.timeoutMs);
		}
	}, s = (e, n, i = {}) => {
		let a = `${e}:${n}`, s = t.get(a);
		if (s) return r.deduplicatedWatches += 1, s.promise;
		let c = new AbortController(), l = () => c.abort(i.signal?.reason);
		i.signal?.aborted ? l() : i.signal?.addEventListener("abort", l, { once: !0 });
		let u = o(e, n, {
			...i,
			signal: c.signal
		}).finally(() => {
			i.signal?.removeEventListener("abort", l), t.delete(a);
		});
		return t.set(a, {
			controller: c,
			promise: u
		}), u;
	};
	return {
		cancel: (e, n) => {
			let i = t.get(`${e}:${n}`);
			return i ? (i.controller.abort(), r.cancelledWatches += 1, !0) : !1;
		},
		get: a,
		getDiagnostics: () => ({
			activeSubmissions: n.size,
			activeWatches: t.size,
			...r
		}),
		resume: async (e, t) => {
			r.resumeRequests += 1, r.resumedTasks += e.length;
			let n = await Promise.allSettled(e.map(({ kind: e, id: n }) => s(e, n, t)));
			return r.recoveredTasks += n.filter((e) => e.status === "fulfilled" && e.value.recovered_after_restart).length, n;
		},
		submit: i,
		wait: o,
		waitForResult: async (e, t, n) => {
			let r = await o(e, t, n);
			if (r.status !== "succeeded") throw new p(r.error || "Task failed", "task-failed", 0, r);
			return r.result;
		},
		watch: s
	};
}
function Be(e) {
	let t = String(e.task_id || e.id || "");
	if (!t) throw new p("Task response did not include an ID", "validation", 200, e);
	return t;
}
function Ve(e, t, n = 0) {
	if (e?.aborted) throw new p("Task polling aborted", "aborted");
	if (n > 0 && Date.now() - t >= n) throw new p("Task polling timed out", "timeout");
}
function He(e, t, n, r = 0) {
	Ve(t, n, r);
	let i = r > 0 ? Math.max(0, r - (Date.now() - n)) : e, a = Math.min(Math.max(0, e), i || e);
	return new Promise((e, n) => {
		let r = () => t?.removeEventListener("abort", o), i = setTimeout(() => {
			r(), e();
		}, a), o = () => {
			clearTimeout(i), r(), n(new p("Task polling aborted", "aborted"));
		};
		t?.addEventListener("abort", o, { once: !0 });
	});
}
//#endregion
//#region node_modules/react/cjs/react.production.js
var Ue = /* @__PURE__ */ o(((e) => {
	var t = Symbol.for("react.transitional.element"), n = Symbol.for("react.portal"), r = Symbol.for("react.fragment"), i = Symbol.for("react.strict_mode"), a = Symbol.for("react.profiler"), o = Symbol.for("react.consumer"), s = Symbol.for("react.context"), c = Symbol.for("react.forward_ref"), l = Symbol.for("react.suspense"), u = Symbol.for("react.memo"), d = Symbol.for("react.lazy"), f = Symbol.for("react.activity"), p = Symbol.iterator;
	function m(e) {
		return typeof e != "object" || !e ? null : (e = p && e[p] || e["@@iterator"], typeof e == "function" ? e : null);
	}
	var h = {
		isMounted: function() {
			return !1;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	}, g = Object.assign, _ = {};
	function v(e, t, n) {
		this.props = e, this.context = t, this.refs = _, this.updater = n || h;
	}
	v.prototype.isReactComponent = {}, v.prototype.setState = function(e, t) {
		if (typeof e != "object" && typeof e != "function" && e != null) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, e, t, "setState");
	}, v.prototype.forceUpdate = function(e) {
		this.updater.enqueueForceUpdate(this, e, "forceUpdate");
	};
	function y() {}
	y.prototype = v.prototype;
	function b(e, t, n) {
		this.props = e, this.context = t, this.refs = _, this.updater = n || h;
	}
	var x = b.prototype = new y();
	x.constructor = b, g(x, v.prototype), x.isPureReactComponent = !0;
	var S = Array.isArray;
	function C() {}
	var w = {
		H: null,
		A: null,
		T: null,
		S: null
	}, T = Object.prototype.hasOwnProperty;
	function E(e, n, r) {
		var i = r.ref;
		return {
			$$typeof: t,
			type: e,
			key: n,
			ref: i === void 0 ? null : i,
			props: r
		};
	}
	function D(e, t) {
		return E(e.type, t, e.props);
	}
	function O(e) {
		return typeof e == "object" && !!e && e.$$typeof === t;
	}
	function k(e) {
		var t = {
			"=": "=0",
			":": "=2"
		};
		return "$" + e.replace(/[=:]/g, function(e) {
			return t[e];
		});
	}
	var A = /\/+/g;
	function j(e, t) {
		return typeof e == "object" && e && e.key != null ? k("" + e.key) : t.toString(36);
	}
	function M(e) {
		switch (e.status) {
			case "fulfilled": return e.value;
			case "rejected": throw e.reason;
			default: switch (typeof e.status == "string" ? e.then(C, C) : (e.status = "pending", e.then(function(t) {
				e.status === "pending" && (e.status = "fulfilled", e.value = t);
			}, function(t) {
				e.status === "pending" && (e.status = "rejected", e.reason = t);
			})), e.status) {
				case "fulfilled": return e.value;
				case "rejected": throw e.reason;
			}
		}
		throw e;
	}
	function N(e, r, i, a, o) {
		var s = typeof e;
		(s === "undefined" || s === "boolean") && (e = null);
		var c = !1;
		if (e === null) c = !0;
		else switch (s) {
			case "bigint":
			case "string":
			case "number":
				c = !0;
				break;
			case "object": switch (e.$$typeof) {
				case t:
				case n:
					c = !0;
					break;
				case d: return c = e._init, N(c(e._payload), r, i, a, o);
			}
		}
		if (c) return o = o(e), c = a === "" ? "." + j(e, 0) : a, S(o) ? (i = "", c != null && (i = c.replace(A, "$&/") + "/"), N(o, r, i, "", function(e) {
			return e;
		})) : o != null && (O(o) && (o = D(o, i + (o.key == null || e && e.key === o.key ? "" : ("" + o.key).replace(A, "$&/") + "/") + c)), r.push(o)), 1;
		c = 0;
		var l = a === "" ? "." : a + ":";
		if (S(e)) for (var u = 0; u < e.length; u++) a = e[u], s = l + j(a, u), c += N(a, r, i, s, o);
		else if (u = m(e), typeof u == "function") for (e = u.call(e), u = 0; !(a = e.next()).done;) a = a.value, s = l + j(a, u++), c += N(a, r, i, s, o);
		else if (s === "object") {
			if (typeof e.then == "function") return N(M(e), r, i, a, o);
			throw r = String(e), Error("Objects are not valid as a React child (found: " + (r === "[object Object]" ? "object with keys {" + Object.keys(e).join(", ") + "}" : r) + "). If you meant to render a collection of children, use an array instead.");
		}
		return c;
	}
	function P(e, t, n) {
		if (e == null) return e;
		var r = [], i = 0;
		return N(e, r, "", "", function(e) {
			return t.call(n, e, i++);
		}), r;
	}
	function F(e) {
		if (e._status === -1) {
			var t = e._result;
			t = t(), t.then(function(t) {
				(e._status === 0 || e._status === -1) && (e._status = 1, e._result = t);
			}, function(t) {
				(e._status === 0 || e._status === -1) && (e._status = 2, e._result = t);
			}), e._status === -1 && (e._status = 0, e._result = t);
		}
		if (e._status === 1) return e._result.default;
		throw e._result;
	}
	var I = typeof reportError == "function" ? reportError : function(e) {
		if (typeof window == "object" && typeof window.ErrorEvent == "function") {
			var t = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: typeof e == "object" && e && typeof e.message == "string" ? String(e.message) : String(e),
				error: e
			});
			if (!window.dispatchEvent(t)) return;
		} else if (typeof process == "object" && typeof process.emit == "function") {
			process.emit("uncaughtException", e);
			return;
		}
		console.error(e);
	}, ee = {
		map: P,
		forEach: function(e, t, n) {
			P(e, function() {
				t.apply(this, arguments);
			}, n);
		},
		count: function(e) {
			var t = 0;
			return P(e, function() {
				t++;
			}), t;
		},
		toArray: function(e) {
			return P(e, function(e) {
				return e;
			}) || [];
		},
		only: function(e) {
			if (!O(e)) throw Error("React.Children.only expected to receive a single React element child.");
			return e;
		}
	};
	e.Activity = f, e.Children = ee, e.Component = v, e.Fragment = r, e.Profiler = a, e.PureComponent = b, e.StrictMode = i, e.Suspense = l, e.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = w, e.__COMPILER_RUNTIME = {
		__proto__: null,
		c: function(e) {
			return w.H.useMemoCache(e);
		}
	}, e.cache = function(e) {
		return function() {
			return e.apply(null, arguments);
		};
	}, e.cacheSignal = function() {
		return null;
	}, e.cloneElement = function(e, t, n) {
		if (e == null) throw Error("The argument must be a React element, but you passed " + e + ".");
		var r = g({}, e.props), i = e.key;
		if (t != null) for (a in t.key !== void 0 && (i = "" + t.key), t) !T.call(t, a) || a === "key" || a === "__self" || a === "__source" || a === "ref" && t.ref === void 0 || (r[a] = t[a]);
		var a = arguments.length - 2;
		if (a === 1) r.children = n;
		else if (1 < a) {
			for (var o = Array(a), s = 0; s < a; s++) o[s] = arguments[s + 2];
			r.children = o;
		}
		return E(e.type, i, r);
	}, e.createContext = function(e) {
		return e = {
			$$typeof: s,
			_currentValue: e,
			_currentValue2: e,
			_threadCount: 0,
			Provider: null,
			Consumer: null
		}, e.Provider = e, e.Consumer = {
			$$typeof: o,
			_context: e
		}, e;
	}, e.createElement = function(e, t, n) {
		var r, i = {}, a = null;
		if (t != null) for (r in t.key !== void 0 && (a = "" + t.key), t) T.call(t, r) && r !== "key" && r !== "__self" && r !== "__source" && (i[r] = t[r]);
		var o = arguments.length - 2;
		if (o === 1) i.children = n;
		else if (1 < o) {
			for (var s = Array(o), c = 0; c < o; c++) s[c] = arguments[c + 2];
			i.children = s;
		}
		if (e && e.defaultProps) for (r in o = e.defaultProps, o) i[r] === void 0 && (i[r] = o[r]);
		return E(e, a, i);
	}, e.createRef = function() {
		return { current: null };
	}, e.forwardRef = function(e) {
		return {
			$$typeof: c,
			render: e
		};
	}, e.isValidElement = O, e.lazy = function(e) {
		return {
			$$typeof: d,
			_payload: {
				_status: -1,
				_result: e
			},
			_init: F
		};
	}, e.memo = function(e, t) {
		return {
			$$typeof: u,
			type: e,
			compare: t === void 0 ? null : t
		};
	}, e.startTransition = function(e) {
		var t = w.T, n = {};
		w.T = n;
		try {
			var r = e(), i = w.S;
			i !== null && i(n, r), typeof r == "object" && r && typeof r.then == "function" && r.then(C, I);
		} catch (e) {
			I(e);
		} finally {
			t !== null && n.types !== null && (t.types = n.types), w.T = t;
		}
	}, e.unstable_useCacheRefresh = function() {
		return w.H.useCacheRefresh();
	}, e.use = function(e) {
		return w.H.use(e);
	}, e.useActionState = function(e, t, n) {
		return w.H.useActionState(e, t, n);
	}, e.useCallback = function(e, t) {
		return w.H.useCallback(e, t);
	}, e.useContext = function(e) {
		return w.H.useContext(e);
	}, e.useDebugValue = function() {}, e.useDeferredValue = function(e, t) {
		return w.H.useDeferredValue(e, t);
	}, e.useEffect = function(e, t) {
		return w.H.useEffect(e, t);
	}, e.useEffectEvent = function(e) {
		return w.H.useEffectEvent(e);
	}, e.useId = function() {
		return w.H.useId();
	}, e.useImperativeHandle = function(e, t, n) {
		return w.H.useImperativeHandle(e, t, n);
	}, e.useInsertionEffect = function(e, t) {
		return w.H.useInsertionEffect(e, t);
	}, e.useLayoutEffect = function(e, t) {
		return w.H.useLayoutEffect(e, t);
	}, e.useMemo = function(e, t) {
		return w.H.useMemo(e, t);
	}, e.useOptimistic = function(e, t) {
		return w.H.useOptimistic(e, t);
	}, e.useReducer = function(e, t, n) {
		return w.H.useReducer(e, t, n);
	}, e.useRef = function(e) {
		return w.H.useRef(e);
	}, e.useState = function(e) {
		return w.H.useState(e);
	}, e.useSyncExternalStore = function(e, t, n) {
		return w.H.useSyncExternalStore(e, t, n);
	}, e.useTransition = function() {
		return w.H.useTransition();
	}, e.version = "19.2.8";
})), We = /* @__PURE__ */ o(((e, t) => {
	t.exports = Ue();
})), Ge = /* @__PURE__ */ o(((e) => {
	function t(e, t) {
		var n = e.length;
		e.push(t);
		a: for (; 0 < n;) {
			var r = n - 1 >>> 1, a = e[r];
			if (0 < i(a, t)) e[r] = t, e[n] = a, n = r;
			else break a;
		}
	}
	function n(e) {
		return e.length === 0 ? null : e[0];
	}
	function r(e) {
		if (e.length === 0) return null;
		var t = e[0], n = e.pop();
		if (n !== t) {
			e[0] = n;
			a: for (var r = 0, a = e.length, o = a >>> 1; r < o;) {
				var s = 2 * (r + 1) - 1, c = e[s], l = s + 1, u = e[l];
				if (0 > i(c, n)) l < a && 0 > i(u, c) ? (e[r] = u, e[l] = n, r = l) : (e[r] = c, e[s] = n, r = s);
				else if (l < a && 0 > i(u, n)) e[r] = u, e[l] = n, r = l;
				else break a;
			}
		}
		return t;
	}
	function i(e, t) {
		var n = e.sortIndex - t.sortIndex;
		return n === 0 ? e.id - t.id : n;
	}
	if (e.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
		var a = performance;
		e.unstable_now = function() {
			return a.now();
		};
	} else {
		var o = Date, s = o.now();
		e.unstable_now = function() {
			return o.now() - s;
		};
	}
	var c = [], l = [], u = 1, d = null, f = 3, p = !1, m = !1, h = !1, g = !1, _ = typeof setTimeout == "function" ? setTimeout : null, v = typeof clearTimeout == "function" ? clearTimeout : null, y = typeof setImmediate < "u" ? setImmediate : null;
	function b(e) {
		for (var i = n(l); i !== null;) {
			if (i.callback === null) r(l);
			else if (i.startTime <= e) r(l), i.sortIndex = i.expirationTime, t(c, i);
			else break;
			i = n(l);
		}
	}
	function x(e) {
		if (h = !1, b(e), !m) {
			if (n(c) !== null) m = !0, S || (S = !0, O());
			else {
				var t = n(l);
				t !== null && j(x, t.startTime - e);
			}
		}
	}
	var S = !1, C = -1, w = 5, T = -1;
	function E() {
		return g ? !0 : !(e.unstable_now() - T < w);
	}
	function D() {
		if (g = !1, S) {
			var t = e.unstable_now();
			T = t;
			var i = !0;
			try {
				a: {
					m = !1, h && (h = !1, v(C), C = -1), p = !0;
					var a = f;
					try {
						b: {
							for (b(t), d = n(c); d !== null && !(d.expirationTime > t && E());) {
								var o = d.callback;
								if (typeof o == "function") {
									d.callback = null, f = d.priorityLevel;
									var s = o(d.expirationTime <= t);
									if (t = e.unstable_now(), typeof s == "function") {
										d.callback = s, b(t), i = !0;
										break b;
									}
									d === n(c) && r(c), b(t);
								} else r(c);
								d = n(c);
							}
							if (d !== null) i = !0;
							else {
								var u = n(l);
								u !== null && j(x, u.startTime - t), i = !1;
							}
						}
						break a;
					} finally {
						d = null, f = a, p = !1;
					}
				}
			} finally {
				i ? O() : S = !1;
			}
		}
	}
	var O;
	if (typeof y == "function") O = function() {
		y(D);
	};
	else if (typeof MessageChannel < "u") {
		var k = new MessageChannel(), A = k.port2;
		k.port1.onmessage = D, O = function() {
			A.postMessage(null);
		};
	} else O = function() {
		_(D, 0);
	};
	function j(t, n) {
		C = _(function() {
			t(e.unstable_now());
		}, n);
	}
	e.unstable_IdlePriority = 5, e.unstable_ImmediatePriority = 1, e.unstable_LowPriority = 4, e.unstable_NormalPriority = 3, e.unstable_Profiling = null, e.unstable_UserBlockingPriority = 2, e.unstable_cancelCallback = function(e) {
		e.callback = null;
	}, e.unstable_forceFrameRate = function(e) {
		0 > e || 125 < e ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : w = 0 < e ? Math.floor(1e3 / e) : 5;
	}, e.unstable_getCurrentPriorityLevel = function() {
		return f;
	}, e.unstable_next = function(e) {
		switch (f) {
			case 1:
			case 2:
			case 3:
				var t = 3;
				break;
			default: t = f;
		}
		var n = f;
		f = t;
		try {
			return e();
		} finally {
			f = n;
		}
	}, e.unstable_requestPaint = function() {
		g = !0;
	}, e.unstable_runWithPriority = function(e, t) {
		switch (e) {
			case 1:
			case 2:
			case 3:
			case 4:
			case 5: break;
			default: e = 3;
		}
		var n = f;
		f = e;
		try {
			return t();
		} finally {
			f = n;
		}
	}, e.unstable_scheduleCallback = function(r, i, a) {
		var o = e.unstable_now();
		switch (typeof a == "object" && a ? (a = a.delay, a = typeof a == "number" && 0 < a ? o + a : o) : a = o, r) {
			case 1:
				var s = -1;
				break;
			case 2:
				s = 250;
				break;
			case 5:
				s = 1073741823;
				break;
			case 4:
				s = 1e4;
				break;
			default: s = 5e3;
		}
		return s = a + s, r = {
			id: u++,
			callback: i,
			priorityLevel: r,
			startTime: a,
			expirationTime: s,
			sortIndex: -1
		}, a > o ? (r.sortIndex = a, t(l, r), n(c) === null && r === n(l) && (h ? (v(C), C = -1) : h = !0, j(x, a - o))) : (r.sortIndex = s, t(c, r), m || p || (m = !0, S || (S = !0, O()))), r;
	}, e.unstable_shouldYield = E, e.unstable_wrapCallback = function(e) {
		var t = f;
		return function() {
			var n = f;
			f = t;
			try {
				return e.apply(this, arguments);
			} finally {
				f = n;
			}
		};
	};
})), Ke = /* @__PURE__ */ o(((e, t) => {
	t.exports = Ge();
})), qe = /* @__PURE__ */ o(((e) => {
	var t = We();
	function n(e) {
		var t = "https://react.dev/errors/" + e;
		if (1 < arguments.length) {
			t += "?args[]=" + encodeURIComponent(arguments[1]);
			for (var n = 2; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
		}
		return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
	}
	function r() {}
	var i = {
		d: {
			f: r,
			r: function() {
				throw Error(n(522));
			},
			D: r,
			C: r,
			L: r,
			m: r,
			X: r,
			S: r,
			M: r
		},
		p: 0,
		findDOMNode: null
	}, a = Symbol.for("react.portal");
	function o(e, t, n) {
		var r = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
		return {
			$$typeof: a,
			key: r == null ? null : "" + r,
			children: e,
			containerInfo: t,
			implementation: n
		};
	}
	var s = t.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
	function c(e, t) {
		if (e === "font") return "";
		if (typeof t == "string") return t === "use-credentials" ? t : "";
	}
	e.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = i, e.createPortal = function(e, t) {
		var r = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
		if (!t || t.nodeType !== 1 && t.nodeType !== 9 && t.nodeType !== 11) throw Error(n(299));
		return o(e, t, null, r);
	}, e.flushSync = function(e) {
		var t = s.T, n = i.p;
		try {
			if (s.T = null, i.p = 2, e) return e();
		} finally {
			s.T = t, i.p = n, i.d.f();
		}
	}, e.preconnect = function(e, t) {
		typeof e == "string" && (t ? (t = t.crossOrigin, t = typeof t == "string" ? t === "use-credentials" ? t : "" : void 0) : t = null, i.d.C(e, t));
	}, e.prefetchDNS = function(e) {
		typeof e == "string" && i.d.D(e);
	}, e.preinit = function(e, t) {
		if (typeof e == "string" && t && typeof t.as == "string") {
			var n = t.as, r = c(n, t.crossOrigin), a = typeof t.integrity == "string" ? t.integrity : void 0, o = typeof t.fetchPriority == "string" ? t.fetchPriority : void 0;
			n === "style" ? i.d.S(e, typeof t.precedence == "string" ? t.precedence : void 0, {
				crossOrigin: r,
				integrity: a,
				fetchPriority: o
			}) : n === "script" && i.d.X(e, {
				crossOrigin: r,
				integrity: a,
				fetchPriority: o,
				nonce: typeof t.nonce == "string" ? t.nonce : void 0
			});
		}
	}, e.preinitModule = function(e, t) {
		if (typeof e == "string") {
			if (typeof t == "object" && t) {
				if (t.as == null || t.as === "script") {
					var n = c(t.as, t.crossOrigin);
					i.d.M(e, {
						crossOrigin: n,
						integrity: typeof t.integrity == "string" ? t.integrity : void 0,
						nonce: typeof t.nonce == "string" ? t.nonce : void 0
					});
				}
			} else t ?? i.d.M(e);
		}
	}, e.preload = function(e, t) {
		if (typeof e == "string" && typeof t == "object" && t && typeof t.as == "string") {
			var n = t.as, r = c(n, t.crossOrigin);
			i.d.L(e, n, {
				crossOrigin: r,
				integrity: typeof t.integrity == "string" ? t.integrity : void 0,
				nonce: typeof t.nonce == "string" ? t.nonce : void 0,
				type: typeof t.type == "string" ? t.type : void 0,
				fetchPriority: typeof t.fetchPriority == "string" ? t.fetchPriority : void 0,
				referrerPolicy: typeof t.referrerPolicy == "string" ? t.referrerPolicy : void 0,
				imageSrcSet: typeof t.imageSrcSet == "string" ? t.imageSrcSet : void 0,
				imageSizes: typeof t.imageSizes == "string" ? t.imageSizes : void 0,
				media: typeof t.media == "string" ? t.media : void 0
			});
		}
	}, e.preloadModule = function(e, t) {
		if (typeof e == "string") {
			if (t) {
				var n = c(t.as, t.crossOrigin);
				i.d.m(e, {
					as: typeof t.as == "string" && t.as !== "script" ? t.as : void 0,
					crossOrigin: n,
					integrity: typeof t.integrity == "string" ? t.integrity : void 0
				});
			} else i.d.m(e);
		}
	}, e.requestFormReset = function(e) {
		i.d.r(e);
	}, e.unstable_batchedUpdates = function(e, t) {
		return e(t);
	}, e.useFormState = function(e, t, n) {
		return s.H.useFormState(e, t, n);
	}, e.useFormStatus = function() {
		return s.H.useHostTransitionStatus();
	}, e.version = "19.2.8";
})), Je = /* @__PURE__ */ o(((e, t) => {
	function n() {
		if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) try {
			__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
		} catch (e) {
			console.error(e);
		}
	}
	n(), t.exports = qe();
})), Ye = /* @__PURE__ */ o(((e) => {
	var t = Ke(), n = We(), r = Je();
	function i(e) {
		var t = "https://react.dev/errors/" + e;
		if (1 < arguments.length) {
			t += "?args[]=" + encodeURIComponent(arguments[1]);
			for (var n = 2; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
		}
		return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
	}
	function a(e) {
		return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
	}
	function o(e) {
		var t = e, n = e;
		if (e.alternate) for (; t.return;) t = t.return;
		else {
			e = t;
			do
				t = e, t.flags & 4098 && (n = t.return), e = t.return;
			while (e);
		}
		return t.tag === 3 ? n : null;
	}
	function s(e) {
		if (e.tag === 13) {
			var t = e.memoizedState;
			if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
		}
		return null;
	}
	function c(e) {
		if (e.tag === 31) {
			var t = e.memoizedState;
			if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
		}
		return null;
	}
	function l(e) {
		if (o(e) !== e) throw Error(i(188));
	}
	function u(e) {
		var t = e.alternate;
		if (!t) {
			if (t = o(e), t === null) throw Error(i(188));
			return t === e ? e : null;
		}
		for (var n = e, r = t;;) {
			var a = n.return;
			if (a === null) break;
			var s = a.alternate;
			if (s === null) {
				if (r = a.return, r !== null) {
					n = r;
					continue;
				}
				break;
			}
			if (a.child === s.child) {
				for (s = a.child; s;) {
					if (s === n) return l(a), e;
					if (s === r) return l(a), t;
					s = s.sibling;
				}
				throw Error(i(188));
			}
			if (n.return !== r.return) n = a, r = s;
			else {
				for (var c = !1, u = a.child; u;) {
					if (u === n) {
						c = !0, n = a, r = s;
						break;
					}
					if (u === r) {
						c = !0, r = a, n = s;
						break;
					}
					u = u.sibling;
				}
				if (!c) {
					for (u = s.child; u;) {
						if (u === n) {
							c = !0, n = s, r = a;
							break;
						}
						if (u === r) {
							c = !0, r = s, n = a;
							break;
						}
						u = u.sibling;
					}
					if (!c) throw Error(i(189));
				}
			}
			if (n.alternate !== r) throw Error(i(190));
		}
		if (n.tag !== 3) throw Error(i(188));
		return n.stateNode.current === n ? e : t;
	}
	function d(e) {
		var t = e.tag;
		if (t === 5 || t === 26 || t === 27 || t === 6) return e;
		for (e = e.child; e !== null;) {
			if (t = d(e), t !== null) return t;
			e = e.sibling;
		}
		return null;
	}
	var f = Object.assign, p = Symbol.for("react.element"), m = Symbol.for("react.transitional.element"), h = Symbol.for("react.portal"), g = Symbol.for("react.fragment"), _ = Symbol.for("react.strict_mode"), v = Symbol.for("react.profiler"), y = Symbol.for("react.consumer"), b = Symbol.for("react.context"), x = Symbol.for("react.forward_ref"), S = Symbol.for("react.suspense"), C = Symbol.for("react.suspense_list"), w = Symbol.for("react.memo"), T = Symbol.for("react.lazy"), E = Symbol.for("react.activity"), D = Symbol.for("react.memo_cache_sentinel"), O = Symbol.iterator;
	function k(e) {
		return typeof e != "object" || !e ? null : (e = O && e[O] || e["@@iterator"], typeof e == "function" ? e : null);
	}
	var A = Symbol.for("react.client.reference");
	function j(e) {
		if (e == null) return null;
		if (typeof e == "function") return e.$$typeof === A ? null : e.displayName || e.name || null;
		if (typeof e == "string") return e;
		switch (e) {
			case g: return "Fragment";
			case v: return "Profiler";
			case _: return "StrictMode";
			case S: return "Suspense";
			case C: return "SuspenseList";
			case E: return "Activity";
		}
		if (typeof e == "object") switch (e.$$typeof) {
			case h: return "Portal";
			case b: return e.displayName || "Context";
			case y: return (e._context.displayName || "Context") + ".Consumer";
			case x:
				var t = e.render;
				return e = e.displayName, e ||= (e = t.displayName || t.name || "", e === "" ? "ForwardRef" : "ForwardRef(" + e + ")"), e;
			case w: return t = e.displayName || null, t === null ? j(e.type) || "Memo" : t;
			case T:
				t = e._payload, e = e._init;
				try {
					return j(e(t));
				} catch {}
		}
		return null;
	}
	var M = Array.isArray, N = n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, P = r.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, F = {
		pending: !1,
		data: null,
		method: null,
		action: null
	}, I = [], ee = -1;
	function te(e) {
		return { current: e };
	}
	function L(e) {
		0 > ee || (e.current = I[ee], I[ee] = null, ee--);
	}
	function R(e, t) {
		ee++, I[ee] = e.current, e.current = t;
	}
	var z = te(null), B = te(null), ne = te(null), re = te(null);
	function ie(e, t) {
		switch (R(ne, t), R(B, e), R(z, null), t.nodeType) {
			case 9:
			case 11:
				e = (e = t.documentElement) && (e = e.namespaceURI) ? Vd(e) : 0;
				break;
			default: if (e = t.tagName, t = t.namespaceURI) t = Vd(t), e = Hd(t, e);
			else switch (e) {
				case "svg":
					e = 1;
					break;
				case "math":
					e = 2;
					break;
				default: e = 0;
			}
		}
		L(z), R(z, e);
	}
	function ae() {
		L(z), L(B), L(ne);
	}
	function V(e) {
		e.memoizedState !== null && R(re, e);
		var t = z.current, n = Hd(t, e.type);
		t !== n && (R(B, e), R(z, n));
	}
	function oe(e) {
		B.current === e && (L(z), L(B)), re.current === e && (L(re), Qf._currentValue = F);
	}
	var se, ce;
	function H(e) {
		if (se === void 0) try {
			throw Error();
		} catch (e) {
			var t = e.stack.trim().match(/\n( *(at )?)/);
			se = t && t[1] || "", ce = -1 < e.stack.indexOf("\n    at") ? " (<anonymous>)" : -1 < e.stack.indexOf("@") ? "@unknown:0:0" : "";
		}
		return "\n" + se + e + ce;
	}
	var le = !1;
	function ue(e, t) {
		if (!e || le) return "";
		le = !0;
		var n = Error.prepareStackTrace;
		Error.prepareStackTrace = void 0;
		try {
			var r = { DetermineComponentFrameRoot: function() {
				try {
					if (t) {
						var n = function() {
							throw Error();
						};
						if (Object.defineProperty(n.prototype, "props", { set: function() {
							throw Error();
						} }), typeof Reflect == "object" && Reflect.construct) {
							try {
								Reflect.construct(n, []);
							} catch (e) {
								var r = e;
							}
							Reflect.construct(e, [], n);
						} else {
							try {
								n.call();
							} catch (e) {
								r = e;
							}
							e.call(n.prototype);
						}
					} else {
						try {
							throw Error();
						} catch (e) {
							r = e;
						}
						(n = e()) && typeof n.catch == "function" && n.catch(function() {});
					}
				} catch (e) {
					if (e && r && typeof e.stack == "string") return [e.stack, r.stack];
				}
				return [null, null];
			} };
			r.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
			var i = Object.getOwnPropertyDescriptor(r.DetermineComponentFrameRoot, "name");
			i && i.configurable && Object.defineProperty(r.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
			var a = r.DetermineComponentFrameRoot(), o = a[0], s = a[1];
			if (o && s) {
				var c = o.split("\n"), l = s.split("\n");
				for (i = r = 0; r < c.length && !c[r].includes("DetermineComponentFrameRoot");) r++;
				for (; i < l.length && !l[i].includes("DetermineComponentFrameRoot");) i++;
				if (r === c.length || i === l.length) for (r = c.length - 1, i = l.length - 1; 1 <= r && 0 <= i && c[r] !== l[i];) i--;
				for (; 1 <= r && 0 <= i; r--, i--) if (c[r] !== l[i]) {
					if (r !== 1 || i !== 1) do
						if (r--, i--, 0 > i || c[r] !== l[i]) {
							var u = "\n" + c[r].replace(" at new ", " at ");
							return e.displayName && u.includes("<anonymous>") && (u = u.replace("<anonymous>", e.displayName)), u;
						}
					while (1 <= r && 0 <= i);
					break;
				}
			}
		} finally {
			le = !1, Error.prepareStackTrace = n;
		}
		return (n = e ? e.displayName || e.name : "") ? H(n) : "";
	}
	function de(e, t) {
		switch (e.tag) {
			case 26:
			case 27:
			case 5: return H(e.type);
			case 16: return H("Lazy");
			case 13: return e.child !== t && t !== null ? H("Suspense Fallback") : H("Suspense");
			case 19: return H("SuspenseList");
			case 0:
			case 15: return ue(e.type, !1);
			case 11: return ue(e.type.render, !1);
			case 1: return ue(e.type, !0);
			case 31: return H("Activity");
			default: return "";
		}
	}
	function fe(e) {
		try {
			var t = "", n = null;
			do
				t += de(e, n), n = e, e = e.return;
			while (e);
			return t;
		} catch (e) {
			return "\nError generating stack: " + e.message + "\n" + e.stack;
		}
	}
	var pe = Object.prototype.hasOwnProperty, me = t.unstable_scheduleCallback, he = t.unstable_cancelCallback, ge = t.unstable_shouldYield, _e = t.unstable_requestPaint, U = t.unstable_now, ve = t.unstable_getCurrentPriorityLevel, ye = t.unstable_ImmediatePriority, W = t.unstable_UserBlockingPriority, be = t.unstable_NormalPriority, xe = t.unstable_LowPriority, Se = t.unstable_IdlePriority, Ce = t.log, we = t.unstable_setDisableYieldValue, Te = null, Ee = null;
	function De(e) {
		if (typeof Ce == "function" && we(e), Ee && typeof Ee.setStrictMode == "function") try {
			Ee.setStrictMode(Te, e);
		} catch {}
	}
	var Oe = Math.clz32 ? Math.clz32 : je, ke = Math.log, Ae = Math.LN2;
	function je(e) {
		return e >>>= 0, e === 0 ? 32 : 31 - (ke(e) / Ae | 0) | 0;
	}
	var Me = 256, Ne = 262144, Pe = 4194304;
	function Fe(e) {
		var t = e & 42;
		if (t !== 0) return t;
		switch (e & -e) {
			case 1: return 1;
			case 2: return 2;
			case 4: return 4;
			case 8: return 8;
			case 16: return 16;
			case 32: return 32;
			case 64: return 64;
			case 128: return 128;
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072: return e & 261888;
			case 262144:
			case 524288:
			case 1048576:
			case 2097152: return e & 3932160;
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432: return e & 62914560;
			case 67108864: return 67108864;
			case 134217728: return 134217728;
			case 268435456: return 268435456;
			case 536870912: return 536870912;
			case 1073741824: return 0;
			default: return e;
		}
	}
	function Ie(e, t, n) {
		var r = e.pendingLanes;
		if (r === 0) return 0;
		var i = 0, a = e.suspendedLanes, o = e.pingedLanes;
		e = e.warmLanes;
		var s = r & 134217727;
		return s === 0 ? (s = r & ~a, s === 0 ? o === 0 ? n || (n = r & ~e, n !== 0 && (i = Fe(n))) : i = Fe(o) : i = Fe(s)) : (r = s & ~a, r === 0 ? (o &= s, o === 0 ? n || (n = s & ~e, n !== 0 && (i = Fe(n))) : i = Fe(o)) : i = Fe(r)), i === 0 ? 0 : t !== 0 && t !== i && (t & a) === 0 && (a = i & -i, n = t & -t, a >= n || a === 32 && n & 4194048) ? t : i;
	}
	function Le(e, t) {
		return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
	}
	function Re(e, t) {
		switch (e) {
			case 1:
			case 2:
			case 4:
			case 8:
			case 64: return t + 250;
			case 16:
			case 32:
			case 128:
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072:
			case 262144:
			case 524288:
			case 1048576:
			case 2097152: return t + 5e3;
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432: return -1;
			case 67108864:
			case 134217728:
			case 268435456:
			case 536870912:
			case 1073741824: return -1;
			default: return -1;
		}
	}
	function ze() {
		var e = Pe;
		return Pe <<= 1, !(Pe & 62914560) && (Pe = 4194304), e;
	}
	function Be(e) {
		for (var t = [], n = 0; 31 > n; n++) t.push(e);
		return t;
	}
	function Ve(e, t) {
		e.pendingLanes |= t, t !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
	}
	function He(e, t, n, r, i, a) {
		var o = e.pendingLanes;
		e.pendingLanes = n, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= n, e.entangledLanes &= n, e.errorRecoveryDisabledLanes &= n, e.shellSuspendCounter = 0;
		var s = e.entanglements, c = e.expirationTimes, l = e.hiddenUpdates;
		for (n = o & ~n; 0 < n;) {
			var u = 31 - Oe(n), d = 1 << u;
			s[u] = 0, c[u] = -1;
			var f = l[u];
			if (f !== null) for (l[u] = null, u = 0; u < f.length; u++) {
				var p = f[u];
				p !== null && (p.lane &= -536870913);
			}
			n &= ~d;
		}
		r !== 0 && Ue(e, r, 0), a !== 0 && i === 0 && e.tag !== 0 && (e.suspendedLanes |= a & ~(o & ~t));
	}
	function Ue(e, t, n) {
		e.pendingLanes |= t, e.suspendedLanes &= ~t;
		var r = 31 - Oe(t);
		e.entangledLanes |= t, e.entanglements[r] = e.entanglements[r] | 1073741824 | n & 261930;
	}
	function Ge(e, t) {
		var n = e.entangledLanes |= t;
		for (e = e.entanglements; n;) {
			var r = 31 - Oe(n), i = 1 << r;
			i & t | e[r] & t && (e[r] |= t), n &= ~i;
		}
	}
	function qe(e, t) {
		var n = t & -t;
		return n = n & 42 ? 1 : Ye(n), (n & (e.suspendedLanes | t)) === 0 ? n : 0;
	}
	function Ye(e) {
		switch (e) {
			case 2:
				e = 1;
				break;
			case 8:
				e = 4;
				break;
			case 32:
				e = 16;
				break;
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072:
			case 262144:
			case 524288:
			case 1048576:
			case 2097152:
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432:
				e = 128;
				break;
			case 268435456:
				e = 134217728;
				break;
			default: e = 0;
		}
		return e;
	}
	function Xe(e) {
		return e &= -e, 2 < e ? 8 < e ? e & 134217727 ? 32 : 268435456 : 8 : 2;
	}
	function G() {
		var e = P.p;
		return e === 0 ? (e = window.event, e === void 0 ? 32 : mp(e.type)) : e;
	}
	function Ze(e, t) {
		var n = P.p;
		try {
			return P.p = e, t();
		} finally {
			P.p = n;
		}
	}
	var Qe = Math.random().toString(36).slice(2), $e = "__reactFiber$" + Qe, et = "__reactProps$" + Qe, tt = "__reactContainer$" + Qe, nt = "__reactEvents$" + Qe, rt = "__reactListeners$" + Qe, it = "__reactHandles$" + Qe, at = "__reactResources$" + Qe, ot = "__reactMarker$" + Qe;
	function st(e) {
		delete e[$e], delete e[et], delete e[nt], delete e[rt], delete e[it];
	}
	function ct(e) {
		var t = e[$e];
		if (t) return t;
		for (var n = e.parentNode; n;) {
			if (t = n[tt] || n[$e]) {
				if (n = t.alternate, t.child !== null || n !== null && n.child !== null) for (e = df(e); e !== null;) {
					if (n = e[$e]) return n;
					e = df(e);
				}
				return t;
			}
			e = n, n = e.parentNode;
		}
		return null;
	}
	function lt(e) {
		if (e = e[$e] || e[tt]) {
			var t = e.tag;
			if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return e;
		}
		return null;
	}
	function ut(e) {
		var t = e.tag;
		if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
		throw Error(i(33));
	}
	function dt(e) {
		var t = e[at];
		return t ||= e[at] = {
			hoistableStyles: /* @__PURE__ */ new Map(),
			hoistableScripts: /* @__PURE__ */ new Map()
		}, t;
	}
	function ft(e) {
		e[ot] = !0;
	}
	var pt = /* @__PURE__ */ new Set(), mt = {};
	function ht(e, t) {
		gt(e, t), gt(e + "Capture", t);
	}
	function gt(e, t) {
		for (mt[e] = t, e = 0; e < t.length; e++) pt.add(t[e]);
	}
	var _t = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), vt = {}, yt = {};
	function bt(e) {
		return pe.call(yt, e) ? !0 : pe.call(vt, e) ? !1 : _t.test(e) ? yt[e] = !0 : (vt[e] = !0, !1);
	}
	function xt(e, t, n) {
		if (bt(t)) {
			if (n === null) e.removeAttribute(t);
			else {
				switch (typeof n) {
					case "undefined":
					case "function":
					case "symbol":
						e.removeAttribute(t);
						return;
					case "boolean":
						var r = t.toLowerCase().slice(0, 5);
						if (r !== "data-" && r !== "aria-") {
							e.removeAttribute(t);
							return;
						}
				}
				e.setAttribute(t, "" + n);
			}
		}
	}
	function St(e, t, n) {
		if (n === null) e.removeAttribute(t);
		else {
			switch (typeof n) {
				case "undefined":
				case "function":
				case "symbol":
				case "boolean":
					e.removeAttribute(t);
					return;
			}
			e.setAttribute(t, "" + n);
		}
	}
	function Ct(e, t, n, r) {
		if (r === null) e.removeAttribute(n);
		else {
			switch (typeof r) {
				case "undefined":
				case "function":
				case "symbol":
				case "boolean":
					e.removeAttribute(n);
					return;
			}
			e.setAttributeNS(t, n, "" + r);
		}
	}
	function wt(e) {
		switch (typeof e) {
			case "bigint":
			case "boolean":
			case "number":
			case "string":
			case "undefined": return e;
			case "object": return e;
			default: return "";
		}
	}
	function Tt(e) {
		var t = e.type;
		return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
	}
	function Et(e, t, n) {
		var r = Object.getOwnPropertyDescriptor(e.constructor.prototype, t);
		if (!e.hasOwnProperty(t) && r !== void 0 && typeof r.get == "function" && typeof r.set == "function") {
			var i = r.get, a = r.set;
			return Object.defineProperty(e, t, {
				configurable: !0,
				get: function() {
					return i.call(this);
				},
				set: function(e) {
					n = "" + e, a.call(this, e);
				}
			}), Object.defineProperty(e, t, { enumerable: r.enumerable }), {
				getValue: function() {
					return n;
				},
				setValue: function(e) {
					n = "" + e;
				},
				stopTracking: function() {
					e._valueTracker = null, delete e[t];
				}
			};
		}
	}
	function Dt(e) {
		if (!e._valueTracker) {
			var t = Tt(e) ? "checked" : "value";
			e._valueTracker = Et(e, t, "" + e[t]);
		}
	}
	function Ot(e) {
		if (!e) return !1;
		var t = e._valueTracker;
		if (!t) return !0;
		var n = t.getValue(), r = "";
		return e && (r = Tt(e) ? e.checked ? "true" : "false" : e.value), e = r, e !== n && (t.setValue(e), !0);
	}
	function kt(e) {
		if (e ||= typeof document < "u" ? document : void 0, e === void 0) return null;
		try {
			return e.activeElement || e.body;
		} catch {
			return e.body;
		}
	}
	var At = /[\n"\\]/g;
	function jt(e) {
		return e.replace(At, function(e) {
			return "\\" + e.charCodeAt(0).toString(16) + " ";
		});
	}
	function Mt(e, t, n, r, i, a, o, s) {
		e.name = "", o != null && typeof o != "function" && typeof o != "symbol" && typeof o != "boolean" ? e.type = o : e.removeAttribute("type"), t == null ? o !== "submit" && o !== "reset" || e.removeAttribute("value") : o === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + wt(t)) : e.value !== "" + wt(t) && (e.value = "" + wt(t)), t == null ? n == null ? r != null && e.removeAttribute("value") : Pt(e, o, wt(n)) : Pt(e, o, wt(t)), i == null && a != null && (e.defaultChecked = !!a), i != null && (e.checked = i && typeof i != "function" && typeof i != "symbol"), s != null && typeof s != "function" && typeof s != "symbol" && typeof s != "boolean" ? e.name = "" + wt(s) : e.removeAttribute("name");
	}
	function Nt(e, t, n, r, i, a, o, s) {
		if (a != null && typeof a != "function" && typeof a != "symbol" && typeof a != "boolean" && (e.type = a), t != null || n != null) {
			if (!(a !== "submit" && a !== "reset" || t != null)) {
				Dt(e);
				return;
			}
			n = n == null ? "" : "" + wt(n), t = t == null ? n : "" + wt(t), s || t === e.value || (e.value = t), e.defaultValue = t;
		}
		r ??= i, r = typeof r != "function" && typeof r != "symbol" && !!r, e.checked = s ? e.checked : !!r, e.defaultChecked = !!r, o != null && typeof o != "function" && typeof o != "symbol" && typeof o != "boolean" && (e.name = o), Dt(e);
	}
	function Pt(e, t, n) {
		t === "number" && kt(e.ownerDocument) === e || e.defaultValue === "" + n || (e.defaultValue = "" + n);
	}
	function Ft(e, t, n, r) {
		if (e = e.options, t) {
			t = {};
			for (var i = 0; i < n.length; i++) t["$" + n[i]] = !0;
			for (n = 0; n < e.length; n++) i = t.hasOwnProperty("$" + e[n].value), e[n].selected !== i && (e[n].selected = i), i && r && (e[n].defaultSelected = !0);
		} else {
			for (n = "" + wt(n), t = null, i = 0; i < e.length; i++) {
				if (e[i].value === n) {
					e[i].selected = !0, r && (e[i].defaultSelected = !0);
					return;
				}
				t !== null || e[i].disabled || (t = e[i]);
			}
			t !== null && (t.selected = !0);
		}
	}
	function It(e, t, n) {
		if (t != null && (t = "" + wt(t), t !== e.value && (e.value = t), n == null)) {
			e.defaultValue !== t && (e.defaultValue = t);
			return;
		}
		e.defaultValue = n == null ? "" : "" + wt(n);
	}
	function K(e, t, n, r) {
		if (t == null) {
			if (r != null) {
				if (n != null) throw Error(i(92));
				if (M(r)) {
					if (1 < r.length) throw Error(i(93));
					r = r[0];
				}
				n = r;
			}
			n ??= "", t = n;
		}
		n = wt(t), e.defaultValue = n, r = e.textContent, r === n && r !== "" && r !== null && (e.value = r), Dt(e);
	}
	function Lt(e, t) {
		if (t) {
			var n = e.firstChild;
			if (n && n === e.lastChild && n.nodeType === 3) {
				n.nodeValue = t;
				return;
			}
		}
		e.textContent = t;
	}
	var Rt = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
	function zt(e, t, n) {
		var r = t.indexOf("--") === 0;
		n == null || typeof n == "boolean" || n === "" ? r ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : r ? e.setProperty(t, n) : typeof n != "number" || n === 0 || Rt.has(t) ? t === "float" ? e.cssFloat = n : e[t] = ("" + n).trim() : e[t] = n + "px";
	}
	function Bt(e, t, n) {
		if (t != null && typeof t != "object") throw Error(i(62));
		if (e = e.style, n != null) {
			for (var r in n) !n.hasOwnProperty(r) || t != null && t.hasOwnProperty(r) || (r.indexOf("--") === 0 ? e.setProperty(r, "") : r === "float" ? e.cssFloat = "" : e[r] = "");
			for (var a in t) r = t[a], t.hasOwnProperty(a) && n[a] !== r && zt(e, a, r);
		} else for (var o in t) t.hasOwnProperty(o) && zt(e, o, t[o]);
	}
	function Vt(e) {
		if (e.indexOf("-") === -1) return !1;
		switch (e) {
			case "annotation-xml":
			case "color-profile":
			case "font-face":
			case "font-face-src":
			case "font-face-uri":
			case "font-face-format":
			case "font-face-name":
			case "missing-glyph": return !1;
			default: return !0;
		}
	}
	var Ht = /* @__PURE__ */ new Map([
		["acceptCharset", "accept-charset"],
		["htmlFor", "for"],
		["httpEquiv", "http-equiv"],
		["crossOrigin", "crossorigin"],
		["accentHeight", "accent-height"],
		["alignmentBaseline", "alignment-baseline"],
		["arabicForm", "arabic-form"],
		["baselineShift", "baseline-shift"],
		["capHeight", "cap-height"],
		["clipPath", "clip-path"],
		["clipRule", "clip-rule"],
		["colorInterpolation", "color-interpolation"],
		["colorInterpolationFilters", "color-interpolation-filters"],
		["colorProfile", "color-profile"],
		["colorRendering", "color-rendering"],
		["dominantBaseline", "dominant-baseline"],
		["enableBackground", "enable-background"],
		["fillOpacity", "fill-opacity"],
		["fillRule", "fill-rule"],
		["floodColor", "flood-color"],
		["floodOpacity", "flood-opacity"],
		["fontFamily", "font-family"],
		["fontSize", "font-size"],
		["fontSizeAdjust", "font-size-adjust"],
		["fontStretch", "font-stretch"],
		["fontStyle", "font-style"],
		["fontVariant", "font-variant"],
		["fontWeight", "font-weight"],
		["glyphName", "glyph-name"],
		["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
		["glyphOrientationVertical", "glyph-orientation-vertical"],
		["horizAdvX", "horiz-adv-x"],
		["horizOriginX", "horiz-origin-x"],
		["imageRendering", "image-rendering"],
		["letterSpacing", "letter-spacing"],
		["lightingColor", "lighting-color"],
		["markerEnd", "marker-end"],
		["markerMid", "marker-mid"],
		["markerStart", "marker-start"],
		["overlinePosition", "overline-position"],
		["overlineThickness", "overline-thickness"],
		["paintOrder", "paint-order"],
		["panose-1", "panose-1"],
		["pointerEvents", "pointer-events"],
		["renderingIntent", "rendering-intent"],
		["shapeRendering", "shape-rendering"],
		["stopColor", "stop-color"],
		["stopOpacity", "stop-opacity"],
		["strikethroughPosition", "strikethrough-position"],
		["strikethroughThickness", "strikethrough-thickness"],
		["strokeDasharray", "stroke-dasharray"],
		["strokeDashoffset", "stroke-dashoffset"],
		["strokeLinecap", "stroke-linecap"],
		["strokeLinejoin", "stroke-linejoin"],
		["strokeMiterlimit", "stroke-miterlimit"],
		["strokeOpacity", "stroke-opacity"],
		["strokeWidth", "stroke-width"],
		["textAnchor", "text-anchor"],
		["textDecoration", "text-decoration"],
		["textRendering", "text-rendering"],
		["transformOrigin", "transform-origin"],
		["underlinePosition", "underline-position"],
		["underlineThickness", "underline-thickness"],
		["unicodeBidi", "unicode-bidi"],
		["unicodeRange", "unicode-range"],
		["unitsPerEm", "units-per-em"],
		["vAlphabetic", "v-alphabetic"],
		["vHanging", "v-hanging"],
		["vIdeographic", "v-ideographic"],
		["vMathematical", "v-mathematical"],
		["vectorEffect", "vector-effect"],
		["vertAdvY", "vert-adv-y"],
		["vertOriginX", "vert-origin-x"],
		["vertOriginY", "vert-origin-y"],
		["wordSpacing", "word-spacing"],
		["writingMode", "writing-mode"],
		["xmlnsXlink", "xmlns:xlink"],
		["xHeight", "x-height"]
	]), Ut = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
	function Wt(e) {
		return Ut.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
	}
	function Gt() {}
	var Kt = null;
	function qt(e) {
		return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
	}
	var Jt = null, Yt = null;
	function Xt(e) {
		var t = lt(e);
		if (t && (e = t.stateNode)) {
			var n = e[et] || null;
			a: switch (e = t.stateNode, t.type) {
				case "input":
					if (Mt(e, n.value, n.defaultValue, n.defaultValue, n.checked, n.defaultChecked, n.type, n.name), t = n.name, n.type === "radio" && t != null) {
						for (n = e; n.parentNode;) n = n.parentNode;
						for (n = n.querySelectorAll("input[name=\"" + jt("" + t) + "\"][type=\"radio\"]"), t = 0; t < n.length; t++) {
							var r = n[t];
							if (r !== e && r.form === e.form) {
								var a = r[et] || null;
								if (!a) throw Error(i(90));
								Mt(r, a.value, a.defaultValue, a.defaultValue, a.checked, a.defaultChecked, a.type, a.name);
							}
						}
						for (t = 0; t < n.length; t++) r = n[t], r.form === e.form && Ot(r);
					}
					break a;
				case "textarea":
					It(e, n.value, n.defaultValue);
					break a;
				case "select": t = n.value, t != null && Ft(e, !!n.multiple, t, !1);
			}
		}
	}
	var Zt = !1;
	function Qt(e, t, n) {
		if (Zt) return e(t, n);
		Zt = !0;
		try {
			return e(t);
		} finally {
			if (Zt = !1, (Jt !== null || Yt !== null) && (vu(), Jt && (t = Jt, e = Yt, Yt = Jt = null, Xt(t), e))) for (t = 0; t < e.length; t++) Xt(e[t]);
		}
	}
	function $t(e, t) {
		var n = e.stateNode;
		if (n === null) return null;
		var r = n[et] || null;
		if (r === null) return null;
		n = r[t];
		a: switch (t) {
			case "onClick":
			case "onClickCapture":
			case "onDoubleClick":
			case "onDoubleClickCapture":
			case "onMouseDown":
			case "onMouseDownCapture":
			case "onMouseMove":
			case "onMouseMoveCapture":
			case "onMouseUp":
			case "onMouseUpCapture":
			case "onMouseEnter":
				(r = !r.disabled) || (e = e.type, r = e !== "button" && e !== "input" && e !== "select" && e !== "textarea"), e = !r;
				break a;
			default: e = !1;
		}
		if (e) return null;
		if (n && typeof n != "function") throw Error(i(231, t, typeof n));
		return n;
	}
	var en = !(typeof window > "u" || window.document === void 0 || window.document.createElement === void 0), tn = !1;
	if (en) try {
		var nn = {};
		Object.defineProperty(nn, "passive", { get: function() {
			tn = !0;
		} }), window.addEventListener("test", nn, nn), window.removeEventListener("test", nn, nn);
	} catch {
		tn = !1;
	}
	var rn = null, an = null, on = null;
	function sn() {
		if (on) return on;
		var e, t = an, n = t.length, r, i = "value" in rn ? rn.value : rn.textContent, a = i.length;
		for (e = 0; e < n && t[e] === i[e]; e++);
		var o = n - e;
		for (r = 1; r <= o && t[n - r] === i[a - r]; r++);
		return on = i.slice(e, 1 < r ? 1 - r : void 0);
	}
	function cn(e) {
		var t = e.keyCode;
		return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
	}
	function ln() {
		return !0;
	}
	function un() {
		return !1;
	}
	function dn(e) {
		function t(t, n, r, i, a) {
			for (var o in this._reactName = t, this._targetInst = r, this.type = n, this.nativeEvent = i, this.target = a, this.currentTarget = null, e) e.hasOwnProperty(o) && (t = e[o], this[o] = t ? t(i) : i[o]);
			return this.isDefaultPrevented = (i.defaultPrevented == null ? !1 === i.returnValue : i.defaultPrevented) ? ln : un, this.isPropagationStopped = un, this;
		}
		return f(t.prototype, {
			preventDefault: function() {
				this.defaultPrevented = !0;
				var e = this.nativeEvent;
				e && (e.preventDefault ? e.preventDefault() : typeof e.returnValue != "unknown" && (e.returnValue = !1), this.isDefaultPrevented = ln);
			},
			stopPropagation: function() {
				var e = this.nativeEvent;
				e && (e.stopPropagation ? e.stopPropagation() : typeof e.cancelBubble != "unknown" && (e.cancelBubble = !0), this.isPropagationStopped = ln);
			},
			persist: function() {},
			isPersistent: ln
		}), t;
	}
	var fn = {
		eventPhase: 0,
		bubbles: 0,
		cancelable: 0,
		timeStamp: function(e) {
			return e.timeStamp || Date.now();
		},
		defaultPrevented: 0,
		isTrusted: 0
	}, pn = dn(fn), mn = f({}, fn, {
		view: 0,
		detail: 0
	}), hn = dn(mn), gn, _n, vn, yn = f({}, mn, {
		screenX: 0,
		screenY: 0,
		clientX: 0,
		clientY: 0,
		pageX: 0,
		pageY: 0,
		ctrlKey: 0,
		shiftKey: 0,
		altKey: 0,
		metaKey: 0,
		getModifierState: An,
		button: 0,
		buttons: 0,
		relatedTarget: function(e) {
			return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
		},
		movementX: function(e) {
			return "movementX" in e ? e.movementX : (e !== vn && (vn && e.type === "mousemove" ? (gn = e.screenX - vn.screenX, _n = e.screenY - vn.screenY) : _n = gn = 0, vn = e), gn);
		},
		movementY: function(e) {
			return "movementY" in e ? e.movementY : _n;
		}
	}), bn = dn(yn), xn = dn(f({}, yn, { dataTransfer: 0 })), Sn = dn(f({}, mn, { relatedTarget: 0 })), Cn = dn(f({}, fn, {
		animationName: 0,
		elapsedTime: 0,
		pseudoElement: 0
	})), wn = dn(f({}, fn, { clipboardData: function(e) {
		return "clipboardData" in e ? e.clipboardData : window.clipboardData;
	} })), Tn = dn(f({}, fn, { data: 0 })), En = {
		Esc: "Escape",
		Spacebar: " ",
		Left: "ArrowLeft",
		Up: "ArrowUp",
		Right: "ArrowRight",
		Down: "ArrowDown",
		Del: "Delete",
		Win: "OS",
		Menu: "ContextMenu",
		Apps: "ContextMenu",
		Scroll: "ScrollLock",
		MozPrintableKey: "Unidentified"
	}, Dn = {
		8: "Backspace",
		9: "Tab",
		12: "Clear",
		13: "Enter",
		16: "Shift",
		17: "Control",
		18: "Alt",
		19: "Pause",
		20: "CapsLock",
		27: "Escape",
		32: " ",
		33: "PageUp",
		34: "PageDown",
		35: "End",
		36: "Home",
		37: "ArrowLeft",
		38: "ArrowUp",
		39: "ArrowRight",
		40: "ArrowDown",
		45: "Insert",
		46: "Delete",
		112: "F1",
		113: "F2",
		114: "F3",
		115: "F4",
		116: "F5",
		117: "F6",
		118: "F7",
		119: "F8",
		120: "F9",
		121: "F10",
		122: "F11",
		123: "F12",
		144: "NumLock",
		145: "ScrollLock",
		224: "Meta"
	}, On = {
		Alt: "altKey",
		Control: "ctrlKey",
		Meta: "metaKey",
		Shift: "shiftKey"
	};
	function kn(e) {
		var t = this.nativeEvent;
		return t.getModifierState ? t.getModifierState(e) : (e = On[e]) ? !!t[e] : !1;
	}
	function An() {
		return kn;
	}
	var jn = dn(f({}, mn, {
		key: function(e) {
			if (e.key) {
				var t = En[e.key] || e.key;
				if (t !== "Unidentified") return t;
			}
			return e.type === "keypress" ? (e = cn(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? Dn[e.keyCode] || "Unidentified" : "";
		},
		code: 0,
		location: 0,
		ctrlKey: 0,
		shiftKey: 0,
		altKey: 0,
		metaKey: 0,
		repeat: 0,
		locale: 0,
		getModifierState: An,
		charCode: function(e) {
			return e.type === "keypress" ? cn(e) : 0;
		},
		keyCode: function(e) {
			return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
		},
		which: function(e) {
			return e.type === "keypress" ? cn(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
		}
	})), Mn = dn(f({}, yn, {
		pointerId: 0,
		width: 0,
		height: 0,
		pressure: 0,
		tangentialPressure: 0,
		tiltX: 0,
		tiltY: 0,
		twist: 0,
		pointerType: 0,
		isPrimary: 0
	})), Nn = dn(f({}, mn, {
		touches: 0,
		targetTouches: 0,
		changedTouches: 0,
		altKey: 0,
		metaKey: 0,
		ctrlKey: 0,
		shiftKey: 0,
		getModifierState: An
	})), Pn = dn(f({}, fn, {
		propertyName: 0,
		elapsedTime: 0,
		pseudoElement: 0
	})), Fn = dn(f({}, yn, {
		deltaX: function(e) {
			return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
		},
		deltaY: function(e) {
			return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
		},
		deltaZ: 0,
		deltaMode: 0
	})), In = dn(f({}, fn, {
		newState: 0,
		oldState: 0
	})), Ln = [
		9,
		13,
		27,
		32
	], Rn = en && "CompositionEvent" in window, zn = null;
	en && "documentMode" in document && (zn = document.documentMode);
	var Bn = en && "TextEvent" in window && !zn, Vn = en && (!Rn || zn && 8 < zn && 11 >= zn), Hn = " ", Un = !1;
	function Wn(e, t) {
		switch (e) {
			case "keyup": return Ln.indexOf(t.keyCode) !== -1;
			case "keydown": return t.keyCode !== 229;
			case "keypress":
			case "mousedown":
			case "focusout": return !0;
			default: return !1;
		}
	}
	function Gn(e) {
		return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
	}
	var Kn = !1;
	function qn(e, t) {
		switch (e) {
			case "compositionend": return Gn(t);
			case "keypress": return t.which === 32 ? (Un = !0, Hn) : null;
			case "textInput": return e = t.data, e === Hn && Un ? null : e;
			default: return null;
		}
	}
	function Jn(e, t) {
		if (Kn) return e === "compositionend" || !Rn && Wn(e, t) ? (e = sn(), on = an = rn = null, Kn = !1, e) : null;
		switch (e) {
			case "paste": return null;
			case "keypress":
				if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
					if (t.char && 1 < t.char.length) return t.char;
					if (t.which) return String.fromCharCode(t.which);
				}
				return null;
			case "compositionend": return Vn && t.locale !== "ko" ? null : t.data;
			default: return null;
		}
	}
	var Yn = {
		color: !0,
		date: !0,
		datetime: !0,
		"datetime-local": !0,
		email: !0,
		month: !0,
		number: !0,
		password: !0,
		range: !0,
		search: !0,
		tel: !0,
		text: !0,
		time: !0,
		url: !0,
		week: !0
	};
	function Xn(e) {
		var t = e && e.nodeName && e.nodeName.toLowerCase();
		return t === "input" ? !!Yn[e.type] : t === "textarea";
	}
	function Zn(e, t, n, r) {
		Jt ? Yt ? Yt.push(r) : Yt = [r] : Jt = r, t = Td(t, "onChange"), 0 < t.length && (n = new pn("onChange", "change", null, n, r), e.push({
			event: n,
			listeners: t
		}));
	}
	var Qn = null, $n = null;
	function er(e) {
		vd(e, 0);
	}
	function tr(e) {
		if (Ot(ut(e))) return e;
	}
	function nr(e, t) {
		if (e === "change") return t;
	}
	var rr = !1;
	if (en) {
		var ir;
		if (en) {
			var ar = "oninput" in document;
			if (!ar) {
				var or = document.createElement("div");
				or.setAttribute("oninput", "return;"), ar = typeof or.oninput == "function";
			}
			ir = ar;
		} else ir = !1;
		rr = ir && (!document.documentMode || 9 < document.documentMode);
	}
	function sr() {
		Qn && (Qn.detachEvent("onpropertychange", cr), $n = Qn = null);
	}
	function cr(e) {
		if (e.propertyName === "value" && tr($n)) {
			var t = [];
			Zn(t, $n, e, qt(e)), Qt(er, t);
		}
	}
	function lr(e, t, n) {
		e === "focusin" ? (sr(), Qn = t, $n = n, Qn.attachEvent("onpropertychange", cr)) : e === "focusout" && sr();
	}
	function ur(e) {
		if (e === "selectionchange" || e === "keyup" || e === "keydown") return tr($n);
	}
	function dr(e, t) {
		if (e === "click") return tr(t);
	}
	function fr(e, t) {
		if (e === "input" || e === "change") return tr(t);
	}
	function pr(e, t) {
		return e === t && (e !== 0 || 1 / e == 1 / t) || e !== e && t !== t;
	}
	var mr = typeof Object.is == "function" ? Object.is : pr;
	function hr(e, t) {
		if (mr(e, t)) return !0;
		if (typeof e != "object" || !e || typeof t != "object" || !t) return !1;
		var n = Object.keys(e), r = Object.keys(t);
		if (n.length !== r.length) return !1;
		for (r = 0; r < n.length; r++) {
			var i = n[r];
			if (!pe.call(t, i) || !mr(e[i], t[i])) return !1;
		}
		return !0;
	}
	function gr(e) {
		for (; e && e.firstChild;) e = e.firstChild;
		return e;
	}
	function _r(e, t) {
		var n = gr(e);
		e = 0;
		for (var r; n;) {
			if (n.nodeType === 3) {
				if (r = e + n.textContent.length, e <= t && r >= t) return {
					node: n,
					offset: t - e
				};
				e = r;
			}
			a: {
				for (; n;) {
					if (n.nextSibling) {
						n = n.nextSibling;
						break a;
					}
					n = n.parentNode;
				}
				n = void 0;
			}
			n = gr(n);
		}
	}
	function vr(e, t) {
		return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? vr(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
	}
	function yr(e) {
		e = e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null ? e.ownerDocument.defaultView : window;
		for (var t = kt(e.document); t instanceof e.HTMLIFrameElement;) {
			try {
				var n = typeof t.contentWindow.location.href == "string";
			} catch {
				n = !1;
			}
			if (n) e = t.contentWindow;
			else break;
			t = kt(e.document);
		}
		return t;
	}
	function br(e) {
		var t = e && e.nodeName && e.nodeName.toLowerCase();
		return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
	}
	var xr = en && "documentMode" in document && 11 >= document.documentMode, Sr = null, Cr = null, wr = null, Tr = !1;
	function Er(e, t, n) {
		var r = n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument;
		Tr || Sr == null || Sr !== kt(r) || (r = Sr, "selectionStart" in r && br(r) ? r = {
			start: r.selectionStart,
			end: r.selectionEnd
		} : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = {
			anchorNode: r.anchorNode,
			anchorOffset: r.anchorOffset,
			focusNode: r.focusNode,
			focusOffset: r.focusOffset
		}), wr && hr(wr, r) || (wr = r, r = Td(Cr, "onSelect"), 0 < r.length && (t = new pn("onSelect", "select", null, t, n), e.push({
			event: t,
			listeners: r
		}), t.target = Sr)));
	}
	function Dr(e, t) {
		var n = {};
		return n[e.toLowerCase()] = t.toLowerCase(), n["Webkit" + e] = "webkit" + t, n["Moz" + e] = "moz" + t, n;
	}
	var Or = {
		animationend: Dr("Animation", "AnimationEnd"),
		animationiteration: Dr("Animation", "AnimationIteration"),
		animationstart: Dr("Animation", "AnimationStart"),
		transitionrun: Dr("Transition", "TransitionRun"),
		transitionstart: Dr("Transition", "TransitionStart"),
		transitioncancel: Dr("Transition", "TransitionCancel"),
		transitionend: Dr("Transition", "TransitionEnd")
	}, kr = {}, Ar = {};
	en && (Ar = document.createElement("div").style, "AnimationEvent" in window || (delete Or.animationend.animation, delete Or.animationiteration.animation, delete Or.animationstart.animation), "TransitionEvent" in window || delete Or.transitionend.transition);
	function jr(e) {
		if (kr[e]) return kr[e];
		if (!Or[e]) return e;
		var t = Or[e], n;
		for (n in t) if (t.hasOwnProperty(n) && n in Ar) return kr[e] = t[n];
		return e;
	}
	var Mr = jr("animationend"), Nr = jr("animationiteration"), Pr = jr("animationstart"), Fr = jr("transitionrun"), Ir = jr("transitionstart"), Lr = jr("transitioncancel"), Rr = jr("transitionend"), zr = /* @__PURE__ */ new Map(), Br = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
	Br.push("scrollEnd");
	function Vr(e, t) {
		zr.set(e, t), ht(t, [e]);
	}
	var Hr = typeof reportError == "function" ? reportError : function(e) {
		if (typeof window == "object" && typeof window.ErrorEvent == "function") {
			var t = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: typeof e == "object" && e && typeof e.message == "string" ? String(e.message) : String(e),
				error: e
			});
			if (!window.dispatchEvent(t)) return;
		} else if (typeof process == "object" && typeof process.emit == "function") {
			process.emit("uncaughtException", e);
			return;
		}
		console.error(e);
	}, Ur = [], Wr = 0, Gr = 0;
	function Kr() {
		for (var e = Wr, t = Gr = Wr = 0; t < e;) {
			var n = Ur[t];
			Ur[t++] = null;
			var r = Ur[t];
			Ur[t++] = null;
			var i = Ur[t];
			Ur[t++] = null;
			var a = Ur[t];
			if (Ur[t++] = null, r !== null && i !== null) {
				var o = r.pending;
				o === null ? i.next = i : (i.next = o.next, o.next = i), r.pending = i;
			}
			a !== 0 && Xr(n, i, a);
		}
	}
	function qr(e, t, n, r) {
		Ur[Wr++] = e, Ur[Wr++] = t, Ur[Wr++] = n, Ur[Wr++] = r, Gr |= r, e.lanes |= r, e = e.alternate, e !== null && (e.lanes |= r);
	}
	function Jr(e, t, n, r) {
		return qr(e, t, n, r), Zr(e);
	}
	function Yr(e, t) {
		return qr(e, null, null, t), Zr(e);
	}
	function Xr(e, t, n) {
		e.lanes |= n;
		var r = e.alternate;
		r !== null && (r.lanes |= n);
		for (var i = !1, a = e.return; a !== null;) a.childLanes |= n, r = a.alternate, r !== null && (r.childLanes |= n), a.tag === 22 && (e = a.stateNode, e === null || e._visibility & 1 || (i = !0)), e = a, a = a.return;
		return e.tag === 3 ? (a = e.stateNode, i && t !== null && (i = 31 - Oe(n), e = a.hiddenUpdates, r = e[i], r === null ? e[i] = [t] : r.push(t), t.lane = n | 536870912), a) : null;
	}
	function Zr(e) {
		if (50 < lu) throw lu = 0, uu = null, Error(i(185));
		for (var t = e.return; t !== null;) e = t, t = e.return;
		return e.tag === 3 ? e.stateNode : null;
	}
	var Qr = {};
	function $r(e, t, n, r) {
		this.tag = e, this.key = n, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
	}
	function ei(e, t, n, r) {
		return new $r(e, t, n, r);
	}
	function ti(e) {
		return e = e.prototype, !(!e || !e.isReactComponent);
	}
	function ni(e, t) {
		var n = e.alternate;
		return n === null ? (n = ei(e.tag, t, e.key, e.mode), n.elementType = e.elementType, n.type = e.type, n.stateNode = e.stateNode, n.alternate = e, e.alternate = n) : (n.pendingProps = t, n.type = e.type, n.flags = 0, n.subtreeFlags = 0, n.deletions = null), n.flags = e.flags & 65011712, n.childLanes = e.childLanes, n.lanes = e.lanes, n.child = e.child, n.memoizedProps = e.memoizedProps, n.memoizedState = e.memoizedState, n.updateQueue = e.updateQueue, t = e.dependencies, n.dependencies = t === null ? null : {
			lanes: t.lanes,
			firstContext: t.firstContext
		}, n.sibling = e.sibling, n.index = e.index, n.ref = e.ref, n.refCleanup = e.refCleanup, n;
	}
	function ri(e, t) {
		e.flags &= 65011714;
		var n = e.alternate;
		return n === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = n.childLanes, e.lanes = n.lanes, e.child = n.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = n.memoizedProps, e.memoizedState = n.memoizedState, e.updateQueue = n.updateQueue, e.type = n.type, t = n.dependencies, e.dependencies = t === null ? null : {
			lanes: t.lanes,
			firstContext: t.firstContext
		}), e;
	}
	function ii(e, t, n, r, a, o) {
		var s = 0;
		if (r = e, typeof e == "function") ti(e) && (s = 1);
		else if (typeof e == "string") s = Uf(e, n, z.current) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
		else a: switch (e) {
			case E: return e = ei(31, n, t, a), e.elementType = E, e.lanes = o, e;
			case g: return ai(n.children, a, o, t);
			case _:
				s = 8, a |= 24;
				break;
			case v: return e = ei(12, n, t, a | 2), e.elementType = v, e.lanes = o, e;
			case S: return e = ei(13, n, t, a), e.elementType = S, e.lanes = o, e;
			case C: return e = ei(19, n, t, a), e.elementType = C, e.lanes = o, e;
			default:
				if (typeof e == "object" && e) switch (e.$$typeof) {
					case b:
						s = 10;
						break a;
					case y:
						s = 9;
						break a;
					case x:
						s = 11;
						break a;
					case w:
						s = 14;
						break a;
					case T:
						s = 16, r = null;
						break a;
				}
				s = 29, n = Error(i(130, e === null ? "null" : typeof e, "")), r = null;
		}
		return t = ei(s, n, t, a), t.elementType = e, t.type = r, t.lanes = o, t;
	}
	function ai(e, t, n, r) {
		return e = ei(7, e, r, t), e.lanes = n, e;
	}
	function oi(e, t, n) {
		return e = ei(6, e, null, t), e.lanes = n, e;
	}
	function si(e) {
		var t = ei(18, null, null, 0);
		return t.stateNode = e, t;
	}
	function ci(e, t, n) {
		return t = ei(4, e.children === null ? [] : e.children, e.key, t), t.lanes = n, t.stateNode = {
			containerInfo: e.containerInfo,
			pendingChildren: null,
			implementation: e.implementation
		}, t;
	}
	var li = /* @__PURE__ */ new WeakMap();
	function ui(e, t) {
		if (typeof e == "object" && e) {
			var n = li.get(e);
			return n === void 0 ? (t = {
				value: e,
				source: t,
				stack: fe(t)
			}, li.set(e, t), t) : n;
		}
		return {
			value: e,
			source: t,
			stack: fe(t)
		};
	}
	var di = [], fi = 0, pi = null, mi = 0, hi = [], gi = 0, _i = null, vi = 1, yi = "";
	function bi(e, t) {
		di[fi++] = mi, di[fi++] = pi, pi = e, mi = t;
	}
	function xi(e, t, n) {
		hi[gi++] = vi, hi[gi++] = yi, hi[gi++] = _i, _i = e;
		var r = vi;
		e = yi;
		var i = 32 - Oe(r) - 1;
		r &= ~(1 << i), n += 1;
		var a = 32 - Oe(t) + i;
		if (30 < a) {
			var o = i - i % 5;
			a = (r & (1 << o) - 1).toString(32), r >>= o, i -= o, vi = 1 << 32 - Oe(t) + i | n << i | r, yi = a + e;
		} else vi = 1 << a | n << i | r, yi = e;
	}
	function Si(e) {
		e.return !== null && (bi(e, 1), xi(e, 1, 0));
	}
	function Ci(e) {
		for (; e === pi;) pi = di[--fi], di[fi] = null, mi = di[--fi], di[fi] = null;
		for (; e === _i;) _i = hi[--gi], hi[gi] = null, yi = hi[--gi], hi[gi] = null, vi = hi[--gi], hi[gi] = null;
	}
	function wi(e, t) {
		hi[gi++] = vi, hi[gi++] = yi, hi[gi++] = _i, vi = t.id, yi = t.overflow, _i = e;
	}
	var Ti = null, Ei = null, q = !1, Di = null, Oi = !1, ki = Error(i(519));
	function Ai(e) {
		throw Ii(ui(Error(i(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", "")), e)), ki;
	}
	function ji(e) {
		var t = e.stateNode, n = e.type, r = e.memoizedProps;
		switch (t[$e] = e, t[et] = r, n) {
			case "dialog":
				$("cancel", t), $("close", t);
				break;
			case "iframe":
			case "object":
			case "embed":
				$("load", t);
				break;
			case "video":
			case "audio":
				for (n = 0; n < gd.length; n++) $(gd[n], t);
				break;
			case "source":
				$("error", t);
				break;
			case "img":
			case "image":
			case "link":
				$("error", t), $("load", t);
				break;
			case "details":
				$("toggle", t);
				break;
			case "input":
				$("invalid", t), Nt(t, r.value, r.defaultValue, r.checked, r.defaultChecked, r.type, r.name, !0);
				break;
			case "select":
				$("invalid", t);
				break;
			case "textarea": $("invalid", t), K(t, r.value, r.defaultValue, r.children);
		}
		n = r.children, typeof n != "string" && typeof n != "number" && typeof n != "bigint" || t.textContent === "" + n || !0 === r.suppressHydrationWarning || jd(t.textContent, n) ? (r.popover != null && ($("beforetoggle", t), $("toggle", t)), r.onScroll != null && $("scroll", t), r.onScrollEnd != null && $("scrollend", t), r.onClick != null && (t.onclick = Gt), t = !0) : t = !1, t || Ai(e, !0);
	}
	function Mi(e) {
		for (Ti = e.return; Ti;) switch (Ti.tag) {
			case 5:
			case 31:
			case 13:
				Oi = !1;
				return;
			case 27:
			case 3:
				Oi = !0;
				return;
			default: Ti = Ti.return;
		}
	}
	function Ni(e) {
		if (e !== Ti) return !1;
		if (!q) return Mi(e), q = !0, !1;
		var t = e.tag, n;
		if ((n = t !== 3 && t !== 27) && ((n = t === 5) && (n = e.type, n = n === "form" || n === "button" || Ud(e.type, e.memoizedProps)), n = !n), n && Ei && Ai(e), Mi(e), t === 13) {
			if (e = e.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(i(317));
			Ei = uf(e);
		} else if (t === 31) {
			if (e = e.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(i(317));
			Ei = uf(e);
		} else t === 27 ? (t = Ei, Zd(e.type) ? (e = lf, lf = null, Ei = e) : Ei = t) : Ei = Ti ? cf(e.stateNode.nextSibling) : null;
		return !0;
	}
	function Pi() {
		Ei = Ti = null, q = !1;
	}
	function Fi() {
		var e = Di;
		return e !== null && (Yl === null ? Yl = e : Yl.push.apply(Yl, e), Di = null), e;
	}
	function Ii(e) {
		Di === null ? Di = [e] : Di.push(e);
	}
	var Li = te(null), Ri = null, zi = null;
	function Bi(e, t, n) {
		R(Li, t._currentValue), t._currentValue = n;
	}
	function Vi(e) {
		e._currentValue = Li.current, L(Li);
	}
	function Hi(e, t, n) {
		for (; e !== null;) {
			var r = e.alternate;
			if ((e.childLanes & t) === t ? r !== null && (r.childLanes & t) !== t && (r.childLanes |= t) : (e.childLanes |= t, r !== null && (r.childLanes |= t)), e === n) break;
			e = e.return;
		}
	}
	function Ui(e, t, n, r) {
		var a = e.child;
		for (a !== null && (a.return = e); a !== null;) {
			var o = a.dependencies;
			if (o !== null) {
				var s = a.child;
				o = o.firstContext;
				a: for (; o !== null;) {
					var c = o;
					o = a;
					for (var l = 0; l < t.length; l++) if (c.context === t[l]) {
						o.lanes |= n, c = o.alternate, c !== null && (c.lanes |= n), Hi(o.return, n, e), r || (s = null);
						break a;
					}
					o = c.next;
				}
			} else if (a.tag === 18) {
				if (s = a.return, s === null) throw Error(i(341));
				s.lanes |= n, o = s.alternate, o !== null && (o.lanes |= n), Hi(s, n, e), s = null;
			} else s = a.child;
			if (s !== null) s.return = a;
			else for (s = a; s !== null;) {
				if (s === e) {
					s = null;
					break;
				}
				if (a = s.sibling, a !== null) {
					a.return = s.return, s = a;
					break;
				}
				s = s.return;
			}
			a = s;
		}
	}
	function Wi(e, t, n, r) {
		e = null;
		for (var a = t, o = !1; a !== null;) {
			if (!o) {
				if (a.flags & 524288) o = !0;
				else if (a.flags & 262144) break;
			}
			if (a.tag === 10) {
				var s = a.alternate;
				if (s === null) throw Error(i(387));
				if (s = s.memoizedProps, s !== null) {
					var c = a.type;
					mr(a.pendingProps.value, s.value) || (e === null ? e = [c] : e.push(c));
				}
			} else if (a === re.current) {
				if (s = a.alternate, s === null) throw Error(i(387));
				s.memoizedState.memoizedState !== a.memoizedState.memoizedState && (e === null ? e = [Qf] : e.push(Qf));
			}
			a = a.return;
		}
		e !== null && Ui(t, e, n, r), t.flags |= 262144;
	}
	function Gi(e) {
		for (e = e.firstContext; e !== null;) {
			if (!mr(e.context._currentValue, e.memoizedValue)) return !0;
			e = e.next;
		}
		return !1;
	}
	function Ki(e) {
		Ri = e, zi = null, e = e.dependencies, e !== null && (e.firstContext = null);
	}
	function qi(e) {
		return Yi(Ri, e);
	}
	function Ji(e, t) {
		return Ri === null && Ki(e), Yi(e, t);
	}
	function Yi(e, t) {
		var n = t._currentValue;
		if (t = {
			context: t,
			memoizedValue: n,
			next: null
		}, zi === null) {
			if (e === null) throw Error(i(308));
			zi = t, e.dependencies = {
				lanes: 0,
				firstContext: t
			}, e.flags |= 524288;
		} else zi = zi.next = t;
		return n;
	}
	var Xi = typeof AbortController < "u" ? AbortController : function() {
		var e = [], t = this.signal = {
			aborted: !1,
			addEventListener: function(t, n) {
				e.push(n);
			}
		};
		this.abort = function() {
			t.aborted = !0, e.forEach(function(e) {
				return e();
			});
		};
	}, Zi = t.unstable_scheduleCallback, Qi = t.unstable_NormalPriority, $i = {
		$$typeof: b,
		Consumer: null,
		Provider: null,
		_currentValue: null,
		_currentValue2: null,
		_threadCount: 0
	};
	function ea() {
		return {
			controller: new Xi(),
			data: /* @__PURE__ */ new Map(),
			refCount: 0
		};
	}
	function ta(e) {
		e.refCount--, e.refCount === 0 && Zi(Qi, function() {
			e.controller.abort();
		});
	}
	var na = null, ra = 0, ia = 0, aa = null;
	function oa(e, t) {
		if (na === null) {
			var n = na = [];
			ra = 0, ia = ud(), aa = {
				status: "pending",
				value: void 0,
				then: function(e) {
					n.push(e);
				}
			};
		}
		return ra++, t.then(sa, sa), t;
	}
	function sa() {
		if (--ra === 0 && na !== null) {
			aa !== null && (aa.status = "fulfilled");
			var e = na;
			na = null, ia = 0, aa = null;
			for (var t = 0; t < e.length; t++) (0, e[t])();
		}
	}
	function ca(e, t) {
		var n = [], r = {
			status: "pending",
			value: null,
			reason: null,
			then: function(e) {
				n.push(e);
			}
		};
		return e.then(function() {
			r.status = "fulfilled", r.value = t;
			for (var e = 0; e < n.length; e++) (0, n[e])(t);
		}, function(e) {
			for (r.status = "rejected", r.reason = e, e = 0; e < n.length; e++) (0, n[e])(void 0);
		}), r;
	}
	var la = N.S;
	N.S = function(e, t) {
		Ql = U(), typeof t == "object" && t && typeof t.then == "function" && oa(e, t), la !== null && la(e, t);
	};
	var ua = te(null);
	function da() {
		var e = ua.current;
		return e === null ? Fl.pooledCache : e;
	}
	function fa(e, t) {
		t === null ? R(ua, ua.current) : R(ua, t.pool);
	}
	function pa() {
		var e = da();
		return e === null ? null : {
			parent: $i._currentValue,
			pool: e
		};
	}
	var ma = Error(i(460)), ha = Error(i(474)), ga = Error(i(542)), _a = { then: function() {} };
	function va(e) {
		return e = e.status, e === "fulfilled" || e === "rejected";
	}
	function ya(e, t, n) {
		switch (n = e[n], n === void 0 ? e.push(t) : n !== t && (t.then(Gt, Gt), t = n), t.status) {
			case "fulfilled": return t.value;
			case "rejected": throw e = t.reason, Ca(e), e;
			default:
				if (typeof t.status == "string") t.then(Gt, Gt);
				else {
					if (e = Fl, e !== null && 100 < e.shellSuspendCounter) throw Error(i(482));
					e = t, e.status = "pending", e.then(function(e) {
						if (t.status === "pending") {
							var n = t;
							n.status = "fulfilled", n.value = e;
						}
					}, function(e) {
						if (t.status === "pending") {
							var n = t;
							n.status = "rejected", n.reason = e;
						}
					});
				}
				switch (t.status) {
					case "fulfilled": return t.value;
					case "rejected": throw e = t.reason, Ca(e), e;
				}
				throw xa = t, ma;
		}
	}
	function ba(e) {
		try {
			var t = e._init;
			return t(e._payload);
		} catch (e) {
			throw typeof e == "object" && e && typeof e.then == "function" ? (xa = e, ma) : e;
		}
	}
	var xa = null;
	function Sa() {
		if (xa === null) throw Error(i(459));
		var e = xa;
		return xa = null, e;
	}
	function Ca(e) {
		if (e === ma || e === ga) throw Error(i(483));
	}
	var wa = null, Ta = 0;
	function Ea(e) {
		var t = Ta;
		return Ta += 1, wa === null && (wa = []), ya(wa, e, t);
	}
	function Da(e, t) {
		t = t.props.ref, e.ref = t === void 0 ? null : t;
	}
	function Oa(e, t) {
		throw t.$$typeof === p ? Error(i(525)) : (e = Object.prototype.toString.call(t), Error(i(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e)));
	}
	function ka(e) {
		function t(t, n) {
			if (e) {
				var r = t.deletions;
				r === null ? (t.deletions = [n], t.flags |= 16) : r.push(n);
			}
		}
		function n(n, r) {
			if (!e) return null;
			for (; r !== null;) t(n, r), r = r.sibling;
			return null;
		}
		function r(e) {
			for (var t = /* @__PURE__ */ new Map(); e !== null;) e.key === null ? t.set(e.index, e) : t.set(e.key, e), e = e.sibling;
			return t;
		}
		function a(e, t) {
			return e = ni(e, t), e.index = 0, e.sibling = null, e;
		}
		function o(t, n, r) {
			return t.index = r, e ? (r = t.alternate, r === null ? (t.flags |= 67108866, n) : (r = r.index, r < n ? (t.flags |= 67108866, n) : r)) : (t.flags |= 1048576, n);
		}
		function s(t) {
			return e && t.alternate === null && (t.flags |= 67108866), t;
		}
		function c(e, t, n, r) {
			return t === null || t.tag !== 6 ? (t = oi(n, e.mode, r), t.return = e, t) : (t = a(t, n), t.return = e, t);
		}
		function l(e, t, n, r) {
			var i = n.type;
			return i === g ? d(e, t, n.props.children, r, n.key) : t !== null && (t.elementType === i || typeof i == "object" && i && i.$$typeof === T && ba(i) === t.type) ? (t = a(t, n.props), Da(t, n), t.return = e, t) : (t = ii(n.type, n.key, n.props, null, e.mode, r), Da(t, n), t.return = e, t);
		}
		function u(e, t, n, r) {
			return t === null || t.tag !== 4 || t.stateNode.containerInfo !== n.containerInfo || t.stateNode.implementation !== n.implementation ? (t = ci(n, e.mode, r), t.return = e, t) : (t = a(t, n.children || []), t.return = e, t);
		}
		function d(e, t, n, r, i) {
			return t === null || t.tag !== 7 ? (t = ai(n, e.mode, r, i), t.return = e, t) : (t = a(t, n), t.return = e, t);
		}
		function f(e, t, n) {
			if (typeof t == "string" && t !== "" || typeof t == "number" || typeof t == "bigint") return t = oi("" + t, e.mode, n), t.return = e, t;
			if (typeof t == "object" && t) {
				switch (t.$$typeof) {
					case m: return n = ii(t.type, t.key, t.props, null, e.mode, n), Da(n, t), n.return = e, n;
					case h: return t = ci(t, e.mode, n), t.return = e, t;
					case T: return t = ba(t), f(e, t, n);
				}
				if (M(t) || k(t)) return t = ai(t, e.mode, n, null), t.return = e, t;
				if (typeof t.then == "function") return f(e, Ea(t), n);
				if (t.$$typeof === b) return f(e, Ji(e, t), n);
				Oa(e, t);
			}
			return null;
		}
		function p(e, t, n, r) {
			var i = t === null ? null : t.key;
			if (typeof n == "string" && n !== "" || typeof n == "number" || typeof n == "bigint") return i === null ? c(e, t, "" + n, r) : null;
			if (typeof n == "object" && n) {
				switch (n.$$typeof) {
					case m: return n.key === i ? l(e, t, n, r) : null;
					case h: return n.key === i ? u(e, t, n, r) : null;
					case T: return n = ba(n), p(e, t, n, r);
				}
				if (M(n) || k(n)) return i === null ? d(e, t, n, r, null) : null;
				if (typeof n.then == "function") return p(e, t, Ea(n), r);
				if (n.$$typeof === b) return p(e, t, Ji(e, n), r);
				Oa(e, n);
			}
			return null;
		}
		function _(e, t, n, r, i) {
			if (typeof r == "string" && r !== "" || typeof r == "number" || typeof r == "bigint") return e = e.get(n) || null, c(t, e, "" + r, i);
			if (typeof r == "object" && r) {
				switch (r.$$typeof) {
					case m: return e = e.get(r.key === null ? n : r.key) || null, l(t, e, r, i);
					case h: return e = e.get(r.key === null ? n : r.key) || null, u(t, e, r, i);
					case T: return r = ba(r), _(e, t, n, r, i);
				}
				if (M(r) || k(r)) return e = e.get(n) || null, d(t, e, r, i, null);
				if (typeof r.then == "function") return _(e, t, n, Ea(r), i);
				if (r.$$typeof === b) return _(e, t, n, Ji(t, r), i);
				Oa(t, r);
			}
			return null;
		}
		function v(i, a, s, c) {
			for (var l = null, u = null, d = a, m = a = 0, h = null; d !== null && m < s.length; m++) {
				d.index > m ? (h = d, d = null) : h = d.sibling;
				var g = p(i, d, s[m], c);
				if (g === null) {
					d === null && (d = h);
					break;
				}
				e && d && g.alternate === null && t(i, d), a = o(g, a, m), u === null ? l = g : u.sibling = g, u = g, d = h;
			}
			if (m === s.length) return n(i, d), q && bi(i, m), l;
			if (d === null) {
				for (; m < s.length; m++) d = f(i, s[m], c), d !== null && (a = o(d, a, m), u === null ? l = d : u.sibling = d, u = d);
				return q && bi(i, m), l;
			}
			for (d = r(d); m < s.length; m++) h = _(d, i, m, s[m], c), h !== null && (e && h.alternate !== null && d.delete(h.key === null ? m : h.key), a = o(h, a, m), u === null ? l = h : u.sibling = h, u = h);
			return e && d.forEach(function(e) {
				return t(i, e);
			}), q && bi(i, m), l;
		}
		function y(a, s, c, l) {
			if (c == null) throw Error(i(151));
			for (var u = null, d = null, m = s, h = s = 0, g = null, v = c.next(); m !== null && !v.done; h++, v = c.next()) {
				m.index > h ? (g = m, m = null) : g = m.sibling;
				var y = p(a, m, v.value, l);
				if (y === null) {
					m === null && (m = g);
					break;
				}
				e && m && y.alternate === null && t(a, m), s = o(y, s, h), d === null ? u = y : d.sibling = y, d = y, m = g;
			}
			if (v.done) return n(a, m), q && bi(a, h), u;
			if (m === null) {
				for (; !v.done; h++, v = c.next()) v = f(a, v.value, l), v !== null && (s = o(v, s, h), d === null ? u = v : d.sibling = v, d = v);
				return q && bi(a, h), u;
			}
			for (m = r(m); !v.done; h++, v = c.next()) v = _(m, a, h, v.value, l), v !== null && (e && v.alternate !== null && m.delete(v.key === null ? h : v.key), s = o(v, s, h), d === null ? u = v : d.sibling = v, d = v);
			return e && m.forEach(function(e) {
				return t(a, e);
			}), q && bi(a, h), u;
		}
		function x(e, r, o, c) {
			if (typeof o == "object" && o && o.type === g && o.key === null && (o = o.props.children), typeof o == "object" && o) {
				switch (o.$$typeof) {
					case m:
						a: {
							for (var l = o.key; r !== null;) {
								if (r.key === l) {
									if (l = o.type, l === g) {
										if (r.tag === 7) {
											n(e, r.sibling), c = a(r, o.props.children), c.return = e, e = c;
											break a;
										}
									} else if (r.elementType === l || typeof l == "object" && l && l.$$typeof === T && ba(l) === r.type) {
										n(e, r.sibling), c = a(r, o.props), Da(c, o), c.return = e, e = c;
										break a;
									}
									n(e, r);
									break;
								}
								t(e, r), r = r.sibling;
							}
							o.type === g ? (c = ai(o.props.children, e.mode, c, o.key), c.return = e, e = c) : (c = ii(o.type, o.key, o.props, null, e.mode, c), Da(c, o), c.return = e, e = c);
						}
						return s(e);
					case h:
						a: {
							for (l = o.key; r !== null;) {
								if (r.key === l) {
									if (r.tag === 4 && r.stateNode.containerInfo === o.containerInfo && r.stateNode.implementation === o.implementation) {
										n(e, r.sibling), c = a(r, o.children || []), c.return = e, e = c;
										break a;
									}
									n(e, r);
									break;
								}
								t(e, r), r = r.sibling;
							}
							c = ci(o, e.mode, c), c.return = e, e = c;
						}
						return s(e);
					case T: return o = ba(o), x(e, r, o, c);
				}
				if (M(o)) return v(e, r, o, c);
				if (k(o)) {
					if (l = k(o), typeof l != "function") throw Error(i(150));
					return o = l.call(o), y(e, r, o, c);
				}
				if (typeof o.then == "function") return x(e, r, Ea(o), c);
				if (o.$$typeof === b) return x(e, r, Ji(e, o), c);
				Oa(e, o);
			}
			return typeof o == "string" && o !== "" || typeof o == "number" || typeof o == "bigint" ? (o = "" + o, r !== null && r.tag === 6 ? (n(e, r.sibling), c = a(r, o), c.return = e, e = c) : (n(e, r), c = oi(o, e.mode, c), c.return = e, e = c), s(e)) : n(e, r);
		}
		return function(e, t, n, r) {
			try {
				Ta = 0;
				var i = x(e, t, n, r);
				return wa = null, i;
			} catch (t) {
				if (t === ma || t === ga) throw t;
				var a = ei(29, t, null, e.mode);
				return a.lanes = r, a.return = e, a;
			}
		};
	}
	var Aa = ka(!0), ja = ka(!1), Ma = !1;
	function Na(e) {
		e.updateQueue = {
			baseState: e.memoizedState,
			firstBaseUpdate: null,
			lastBaseUpdate: null,
			shared: {
				pending: null,
				lanes: 0,
				hiddenCallbacks: null
			},
			callbacks: null
		};
	}
	function Pa(e, t) {
		e = e.updateQueue, t.updateQueue === e && (t.updateQueue = {
			baseState: e.baseState,
			firstBaseUpdate: e.firstBaseUpdate,
			lastBaseUpdate: e.lastBaseUpdate,
			shared: e.shared,
			callbacks: null
		});
	}
	function Fa(e) {
		return {
			lane: e,
			tag: 0,
			payload: null,
			callback: null,
			next: null
		};
	}
	function Ia(e, t, n) {
		var r = e.updateQueue;
		if (r === null) return null;
		if (r = r.shared, X & 2) {
			var i = r.pending;
			return i === null ? t.next = t : (t.next = i.next, i.next = t), r.pending = t, t = Zr(e), Xr(e, null, n), t;
		}
		return qr(e, r, t, n), Zr(e);
	}
	function La(e, t, n) {
		if (t = t.updateQueue, t !== null && (t = t.shared, n & 4194048)) {
			var r = t.lanes;
			r &= e.pendingLanes, n |= r, t.lanes = n, Ge(e, n);
		}
	}
	function Ra(e, t) {
		var n = e.updateQueue, r = e.alternate;
		if (r !== null && (r = r.updateQueue, n === r)) {
			var i = null, a = null;
			if (n = n.firstBaseUpdate, n !== null) {
				do {
					var o = {
						lane: n.lane,
						tag: n.tag,
						payload: n.payload,
						callback: null,
						next: null
					};
					a === null ? i = a = o : a = a.next = o, n = n.next;
				} while (n !== null);
				a === null ? i = a = t : a = a.next = t;
			} else i = a = t;
			n = {
				baseState: r.baseState,
				firstBaseUpdate: i,
				lastBaseUpdate: a,
				shared: r.shared,
				callbacks: r.callbacks
			}, e.updateQueue = n;
			return;
		}
		e = n.lastBaseUpdate, e === null ? n.firstBaseUpdate = t : e.next = t, n.lastBaseUpdate = t;
	}
	var za = !1;
	function Ba() {
		if (za) {
			var e = aa;
			if (e !== null) throw e;
		}
	}
	function Va(e, t, n, r) {
		za = !1;
		var i = e.updateQueue;
		Ma = !1;
		var a = i.firstBaseUpdate, o = i.lastBaseUpdate, s = i.shared.pending;
		if (s !== null) {
			i.shared.pending = null;
			var c = s, l = c.next;
			c.next = null, o === null ? a = l : o.next = l, o = c;
			var u = e.alternate;
			u !== null && (u = u.updateQueue, s = u.lastBaseUpdate, s !== o && (s === null ? u.firstBaseUpdate = l : s.next = l, u.lastBaseUpdate = c));
		}
		if (a !== null) {
			var d = i.baseState;
			o = 0, u = l = c = null, s = a;
			do {
				var p = s.lane & -536870913, m = p !== s.lane;
				if (m ? (Q & p) === p : (r & p) === p) {
					p !== 0 && p === ia && (za = !0), u !== null && (u = u.next = {
						lane: 0,
						tag: s.tag,
						payload: s.payload,
						callback: null,
						next: null
					});
					a: {
						var h = e, g = s;
						p = t;
						var _ = n;
						switch (g.tag) {
							case 1:
								if (h = g.payload, typeof h == "function") {
									d = h.call(_, d, p);
									break a;
								}
								d = h;
								break a;
							case 3: h.flags = h.flags & -65537 | 128;
							case 0:
								if (h = g.payload, p = typeof h == "function" ? h.call(_, d, p) : h, p == null) break a;
								d = f({}, d, p);
								break a;
							case 2: Ma = !0;
						}
					}
					p = s.callback, p !== null && (e.flags |= 64, m && (e.flags |= 8192), m = i.callbacks, m === null ? i.callbacks = [p] : m.push(p));
				} else m = {
					lane: p,
					tag: s.tag,
					payload: s.payload,
					callback: s.callback,
					next: null
				}, u === null ? (l = u = m, c = d) : u = u.next = m, o |= p;
				if (s = s.next, s === null) {
					if (s = i.shared.pending, s === null) break;
					m = s, s = m.next, m.next = null, i.lastBaseUpdate = m, i.shared.pending = null;
				}
			} while (1);
			u === null && (c = d), i.baseState = c, i.firstBaseUpdate = l, i.lastBaseUpdate = u, a === null && (i.shared.lanes = 0), Ul |= o, e.lanes = o, e.memoizedState = d;
		}
	}
	function Ha(e, t) {
		if (typeof e != "function") throw Error(i(191, e));
		e.call(t);
	}
	function Ua(e, t) {
		var n = e.callbacks;
		if (n !== null) for (e.callbacks = null, e = 0; e < n.length; e++) Ha(n[e], t);
	}
	var Wa = te(null), Ga = te(0);
	function Ka(e, t) {
		e = Vl, R(Ga, e), R(Wa, t), Vl = e | t.baseLanes;
	}
	function qa() {
		R(Ga, Vl), R(Wa, Wa.current);
	}
	function Ja() {
		Vl = Ga.current, L(Wa), L(Ga);
	}
	var Ya = te(null), Xa = null;
	function Za(e) {
		var t = e.alternate;
		R(no, no.current & 1), R(Ya, e), Xa === null && (t === null || Wa.current !== null || t.memoizedState !== null) && (Xa = e);
	}
	function Qa(e) {
		R(no, no.current), R(Ya, e), Xa === null && (Xa = e);
	}
	function $a(e) {
		e.tag === 22 ? (R(no, no.current), R(Ya, e), Xa === null && (Xa = e)) : eo(e);
	}
	function eo() {
		R(no, no.current), R(Ya, Ya.current);
	}
	function to(e) {
		L(Ya), Xa === e && (Xa = null), L(no);
	}
	var no = te(0);
	function ro(e) {
		for (var t = e; t !== null;) {
			if (t.tag === 13) {
				var n = t.memoizedState;
				if (n !== null && (n = n.dehydrated, n === null || af(n) || of(n))) return t;
			} else if (t.tag === 19 && (t.memoizedProps.revealOrder === "forwards" || t.memoizedProps.revealOrder === "backwards" || t.memoizedProps.revealOrder === "unstable_legacy-backwards" || t.memoizedProps.revealOrder === "together")) {
				if (t.flags & 128) return t;
			} else if (t.child !== null) {
				t.child.return = t, t = t.child;
				continue;
			}
			if (t === e) break;
			for (; t.sibling === null;) {
				if (t.return === null || t.return === e) return null;
				t = t.return;
			}
			t.sibling.return = t.return, t = t.sibling;
		}
		return null;
	}
	var io = 0, J = null, ao = null, oo = null, so = !1, co = !1, lo = !1, uo = 0, fo = 0, po = null, mo = 0;
	function ho() {
		throw Error(i(321));
	}
	function go(e, t) {
		if (t === null) return !1;
		for (var n = 0; n < t.length && n < e.length; n++) if (!mr(e[n], t[n])) return !1;
		return !0;
	}
	function _o(e, t, n, r, i, a) {
		return io = a, J = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, N.H = e === null || e.memoizedState === null ? Ns : Ps, lo = !1, a = n(r, i), lo = !1, co && (a = yo(t, n, r, i)), vo(e), a;
	}
	function vo(e) {
		N.H = Ms;
		var t = ao !== null && ao.next !== null;
		if (io = 0, oo = ao = J = null, so = !1, fo = 0, po = null, t) throw Error(i(300));
		e === null || Zs || (e = e.dependencies, e !== null && Gi(e) && (Zs = !0));
	}
	function yo(e, t, n, r) {
		J = e;
		var a = 0;
		do {
			if (co && (po = null), fo = 0, co = !1, 25 <= a) throw Error(i(301));
			if (a += 1, oo = ao = null, e.updateQueue != null) {
				var o = e.updateQueue;
				o.lastEffect = null, o.events = null, o.stores = null, o.memoCache != null && (o.memoCache.index = 0);
			}
			N.H = Fs, o = t(n, r);
		} while (co);
		return o;
	}
	function bo() {
		var e = N.H, t = e.useState()[0];
		return t = typeof t.then == "function" ? Do(t) : t, e = e.useState()[0], (ao === null ? null : ao.memoizedState) !== e && (J.flags |= 1024), t;
	}
	function xo() {
		var e = uo !== 0;
		return uo = 0, e;
	}
	function So(e, t, n) {
		t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~n;
	}
	function Co(e) {
		if (so) {
			for (e = e.memoizedState; e !== null;) {
				var t = e.queue;
				t !== null && (t.pending = null), e = e.next;
			}
			so = !1;
		}
		io = 0, oo = ao = J = null, co = !1, fo = uo = 0, po = null;
	}
	function wo() {
		var e = {
			memoizedState: null,
			baseState: null,
			baseQueue: null,
			queue: null,
			next: null
		};
		return oo === null ? J.memoizedState = oo = e : oo = oo.next = e, oo;
	}
	function To() {
		if (ao === null) {
			var e = J.alternate;
			e = e === null ? null : e.memoizedState;
		} else e = ao.next;
		var t = oo === null ? J.memoizedState : oo.next;
		if (t !== null) oo = t, ao = e;
		else {
			if (e === null) throw J.alternate === null ? Error(i(467)) : Error(i(310));
			ao = e, e = {
				memoizedState: ao.memoizedState,
				baseState: ao.baseState,
				baseQueue: ao.baseQueue,
				queue: ao.queue,
				next: null
			}, oo === null ? J.memoizedState = oo = e : oo = oo.next = e;
		}
		return oo;
	}
	function Eo() {
		return {
			lastEffect: null,
			events: null,
			stores: null,
			memoCache: null
		};
	}
	function Do(e) {
		var t = fo;
		return fo += 1, po === null && (po = []), e = ya(po, e, t), t = J, (oo === null ? t.memoizedState : oo.next) === null && (t = t.alternate, N.H = t === null || t.memoizedState === null ? Ns : Ps), e;
	}
	function Y(e) {
		if (typeof e == "object" && e) {
			if (typeof e.then == "function") return Do(e);
			if (e.$$typeof === b) return qi(e);
		}
		throw Error(i(438, String(e)));
	}
	function Oo(e) {
		var t = null, n = J.updateQueue;
		if (n !== null && (t = n.memoCache), t == null) {
			var r = J.alternate;
			r !== null && (r = r.updateQueue, r !== null && (r = r.memoCache, r != null && (t = {
				data: r.data.map(function(e) {
					return e.slice();
				}),
				index: 0
			})));
		}
		if (t ??= {
			data: [],
			index: 0
		}, n === null && (n = Eo(), J.updateQueue = n), n.memoCache = t, n = t.data[t.index], n === void 0) for (n = t.data[t.index] = Array(e), r = 0; r < e; r++) n[r] = D;
		return t.index++, n;
	}
	function ko(e, t) {
		return typeof t == "function" ? t(e) : t;
	}
	function Ao(e) {
		return jo(To(), ao, e);
	}
	function jo(e, t, n) {
		var r = e.queue;
		if (r === null) throw Error(i(311));
		r.lastRenderedReducer = n;
		var a = e.baseQueue, o = r.pending;
		if (o !== null) {
			if (a !== null) {
				var s = a.next;
				a.next = o.next, o.next = s;
			}
			t.baseQueue = a = o, r.pending = null;
		}
		if (o = e.baseState, a === null) e.memoizedState = o;
		else {
			t = a.next;
			var c = s = null, l = null, u = t, d = !1;
			do {
				var f = u.lane & -536870913;
				if (f === u.lane ? (io & f) === f : (Q & f) === f) {
					var p = u.revertLane;
					if (p === 0) l !== null && (l = l.next = {
						lane: 0,
						revertLane: 0,
						gesture: null,
						action: u.action,
						hasEagerState: u.hasEagerState,
						eagerState: u.eagerState,
						next: null
					}), f === ia && (d = !0);
					else if ((io & p) === p) {
						u = u.next, p === ia && (d = !0);
						continue;
					} else f = {
						lane: 0,
						revertLane: u.revertLane,
						gesture: null,
						action: u.action,
						hasEagerState: u.hasEagerState,
						eagerState: u.eagerState,
						next: null
					}, l === null ? (c = l = f, s = o) : l = l.next = f, J.lanes |= p, Ul |= p;
					f = u.action, lo && n(o, f), o = u.hasEagerState ? u.eagerState : n(o, f);
				} else p = {
					lane: f,
					revertLane: u.revertLane,
					gesture: u.gesture,
					action: u.action,
					hasEagerState: u.hasEagerState,
					eagerState: u.eagerState,
					next: null
				}, l === null ? (c = l = p, s = o) : l = l.next = p, J.lanes |= f, Ul |= f;
				u = u.next;
			} while (u !== null && u !== t);
			if (l === null ? s = o : l.next = c, !mr(o, e.memoizedState) && (Zs = !0, d && (n = aa, n !== null))) throw n;
			e.memoizedState = o, e.baseState = s, e.baseQueue = l, r.lastRenderedState = o;
		}
		return a === null && (r.lanes = 0), [e.memoizedState, r.dispatch];
	}
	function Mo(e) {
		var t = To(), n = t.queue;
		if (n === null) throw Error(i(311));
		n.lastRenderedReducer = e;
		var r = n.dispatch, a = n.pending, o = t.memoizedState;
		if (a !== null) {
			n.pending = null;
			var s = a = a.next;
			do
				o = e(o, s.action), s = s.next;
			while (s !== a);
			mr(o, t.memoizedState) || (Zs = !0), t.memoizedState = o, t.baseQueue === null && (t.baseState = o), n.lastRenderedState = o;
		}
		return [o, r];
	}
	function No(e, t, n) {
		var r = J, a = To(), o = q;
		if (o) {
			if (n === void 0) throw Error(i(407));
			n = n();
		} else n = t();
		var s = !mr((ao || a).memoizedState, n);
		if (s && (a.memoizedState = n, Zs = !0), a = a.queue, is(Io.bind(null, r, a, e), [e]), a.getSnapshot !== t || s || oo !== null && oo.memoizedState.tag & 1) {
			if (r.flags |= 2048, $o(9, { destroy: void 0 }, Fo.bind(null, r, a, n, t), null), Fl === null) throw Error(i(349));
			o || io & 127 || Po(r, t, n);
		}
		return n;
	}
	function Po(e, t, n) {
		e.flags |= 16384, e = {
			getSnapshot: t,
			value: n
		}, t = J.updateQueue, t === null ? (t = Eo(), J.updateQueue = t, t.stores = [e]) : (n = t.stores, n === null ? t.stores = [e] : n.push(e));
	}
	function Fo(e, t, n, r) {
		t.value = n, t.getSnapshot = r, Lo(t) && Ro(e);
	}
	function Io(e, t, n) {
		return n(function() {
			Lo(t) && Ro(e);
		});
	}
	function Lo(e) {
		var t = e.getSnapshot;
		e = e.value;
		try {
			var n = t();
			return !mr(e, n);
		} catch {
			return !0;
		}
	}
	function Ro(e) {
		var t = Yr(e, 2);
		t !== null && pu(t, e, 2);
	}
	function zo(e) {
		var t = wo();
		if (typeof e == "function") {
			var n = e;
			if (e = n(), lo) {
				De(!0);
				try {
					n();
				} finally {
					De(!1);
				}
			}
		}
		return t.memoizedState = t.baseState = e, t.queue = {
			pending: null,
			lanes: 0,
			dispatch: null,
			lastRenderedReducer: ko,
			lastRenderedState: e
		}, t;
	}
	function Bo(e, t, n, r) {
		return e.baseState = n, jo(e, ao, typeof r == "function" ? r : ko);
	}
	function Vo(e, t, n, r, a) {
		if (ks(e)) throw Error(i(485));
		if (e = t.action, e !== null) {
			var o = {
				payload: a,
				action: e,
				next: null,
				isTransition: !0,
				status: "pending",
				value: null,
				reason: null,
				listeners: [],
				then: function(e) {
					o.listeners.push(e);
				}
			};
			N.T === null ? o.isTransition = !1 : n(!0), r(o), n = t.pending, n === null ? (o.next = t.pending = o, Ho(t, o)) : (o.next = n.next, t.pending = n.next = o);
		}
	}
	function Ho(e, t) {
		var n = t.action, r = t.payload, i = e.state;
		if (t.isTransition) {
			var a = N.T, o = {};
			N.T = o;
			try {
				var s = n(i, r), c = N.S;
				c !== null && c(o, s), Uo(e, t, s);
			} catch (n) {
				Go(e, t, n);
			} finally {
				a !== null && o.types !== null && (a.types = o.types), N.T = a;
			}
		} else try {
			a = n(i, r), Uo(e, t, a);
		} catch (n) {
			Go(e, t, n);
		}
	}
	function Uo(e, t, n) {
		typeof n == "object" && n && typeof n.then == "function" ? n.then(function(n) {
			Wo(e, t, n);
		}, function(n) {
			return Go(e, t, n);
		}) : Wo(e, t, n);
	}
	function Wo(e, t, n) {
		t.status = "fulfilled", t.value = n, Ko(t), e.state = n, t = e.pending, t !== null && (n = t.next, n === t ? e.pending = null : (n = n.next, t.next = n, Ho(e, n)));
	}
	function Go(e, t, n) {
		var r = e.pending;
		if (e.pending = null, r !== null) {
			r = r.next;
			do
				t.status = "rejected", t.reason = n, Ko(t), t = t.next;
			while (t !== r);
		}
		e.action = null;
	}
	function Ko(e) {
		e = e.listeners;
		for (var t = 0; t < e.length; t++) (0, e[t])();
	}
	function qo(e, t) {
		return t;
	}
	function Jo(e, t) {
		if (q) {
			var n = Fl.formState;
			if (n !== null) {
				a: {
					var r = J;
					if (q) {
						if (Ei) {
							b: {
								for (var i = Ei, a = Oi; i.nodeType !== 8;) {
									if (!a) {
										i = null;
										break b;
									}
									if (i = cf(i.nextSibling), i === null) {
										i = null;
										break b;
									}
								}
								a = i.data, i = a === "F!" || a === "F" ? i : null;
							}
							if (i) {
								Ei = cf(i.nextSibling), r = i.data === "F!";
								break a;
							}
						}
						Ai(r);
					}
					r = !1;
				}
				r && (t = n[0]);
			}
		}
		return n = wo(), n.memoizedState = n.baseState = t, r = {
			pending: null,
			lanes: 0,
			dispatch: null,
			lastRenderedReducer: qo,
			lastRenderedState: t
		}, n.queue = r, n = Es.bind(null, J, r), r.dispatch = n, r = zo(!1), a = Os.bind(null, J, !1, r.queue), r = wo(), i = {
			state: t,
			dispatch: null,
			action: e,
			pending: null
		}, r.queue = i, n = Vo.bind(null, J, i, a, n), i.dispatch = n, r.memoizedState = e, [
			t,
			n,
			!1
		];
	}
	function Yo(e) {
		return Xo(To(), ao, e);
	}
	function Xo(e, t, n) {
		if (t = jo(e, t, qo)[0], e = Ao(ko)[0], typeof t == "object" && t && typeof t.then == "function") try {
			var r = Do(t);
		} catch (e) {
			throw e === ma ? ga : e;
		}
		else r = t;
		t = To();
		var i = t.queue, a = i.dispatch;
		return n !== t.memoizedState && (J.flags |= 2048, $o(9, { destroy: void 0 }, Zo.bind(null, i, n), null)), [
			r,
			a,
			e
		];
	}
	function Zo(e, t) {
		e.action = t;
	}
	function Qo(e) {
		var t = To(), n = ao;
		if (n !== null) return Xo(t, n, e);
		To(), t = t.memoizedState, n = To();
		var r = n.queue.dispatch;
		return n.memoizedState = e, [
			t,
			r,
			!1
		];
	}
	function $o(e, t, n, r) {
		return e = {
			tag: e,
			create: n,
			deps: r,
			inst: t,
			next: null
		}, t = J.updateQueue, t === null && (t = Eo(), J.updateQueue = t), n = t.lastEffect, n === null ? t.lastEffect = e.next = e : (r = n.next, n.next = e, e.next = r, t.lastEffect = e), e;
	}
	function es() {
		return To().memoizedState;
	}
	function ts(e, t, n, r) {
		var i = wo();
		J.flags |= e, i.memoizedState = $o(1 | t, { destroy: void 0 }, n, r === void 0 ? null : r);
	}
	function ns(e, t, n, r) {
		var i = To();
		r = r === void 0 ? null : r;
		var a = i.memoizedState.inst;
		ao !== null && r !== null && go(r, ao.memoizedState.deps) ? i.memoizedState = $o(t, a, n, r) : (J.flags |= e, i.memoizedState = $o(1 | t, a, n, r));
	}
	function rs(e, t) {
		ts(8390656, 8, e, t);
	}
	function is(e, t) {
		ns(2048, 8, e, t);
	}
	function as(e) {
		J.flags |= 4;
		var t = J.updateQueue;
		if (t === null) t = Eo(), J.updateQueue = t, t.events = [e];
		else {
			var n = t.events;
			n === null ? t.events = [e] : n.push(e);
		}
	}
	function os(e) {
		var t = To().memoizedState;
		return as({
			ref: t,
			nextImpl: e
		}), function() {
			if (X & 2) throw Error(i(440));
			return t.impl.apply(void 0, arguments);
		};
	}
	function ss(e, t) {
		return ns(4, 2, e, t);
	}
	function cs(e, t) {
		return ns(4, 4, e, t);
	}
	function ls(e, t) {
		if (typeof t == "function") {
			e = e();
			var n = t(e);
			return function() {
				typeof n == "function" ? n() : t(null);
			};
		}
		if (t != null) return e = e(), t.current = e, function() {
			t.current = null;
		};
	}
	function us(e, t, n) {
		n = n == null ? null : n.concat([e]), ns(4, 4, ls.bind(null, t, e), n);
	}
	function ds() {}
	function fs(e, t) {
		var n = To();
		t = t === void 0 ? null : t;
		var r = n.memoizedState;
		return t !== null && go(t, r[1]) ? r[0] : (n.memoizedState = [e, t], e);
	}
	function ps(e, t) {
		var n = To();
		t = t === void 0 ? null : t;
		var r = n.memoizedState;
		if (t !== null && go(t, r[1])) return r[0];
		if (r = e(), lo) {
			De(!0);
			try {
				e();
			} finally {
				De(!1);
			}
		}
		return n.memoizedState = [r, t], r;
	}
	function ms(e, t, n) {
		return n === void 0 || io & 1073741824 && !(Q & 261930) ? e.memoizedState = t : (e.memoizedState = n, e = fu(), J.lanes |= e, Ul |= e, n);
	}
	function hs(e, t, n, r) {
		return mr(n, t) ? n : Wa.current === null ? !(io & 42) || io & 1073741824 && !(Q & 261930) ? (Zs = !0, e.memoizedState = n) : (e = fu(), J.lanes |= e, Ul |= e, t) : (e = ms(e, n, r), mr(e, t) || (Zs = !0), e);
	}
	function gs(e, t, n, r, i) {
		var a = P.p;
		P.p = a !== 0 && 8 > a ? a : 8;
		var o = N.T, s = {};
		N.T = s, Os(e, !1, t, n);
		try {
			var c = i(), l = N.S;
			l !== null && l(s, c), typeof c == "object" && c && typeof c.then == "function" ? Ds(e, t, ca(c, r), du(e)) : Ds(e, t, r, du(e));
		} catch (n) {
			Ds(e, t, {
				then: function() {},
				status: "rejected",
				reason: n
			}, du());
		} finally {
			P.p = a, o !== null && s.types !== null && (o.types = s.types), N.T = o;
		}
	}
	function _s() {}
	function vs(e, t, n, r) {
		if (e.tag !== 5) throw Error(i(476));
		var a = ys(e).queue;
		gs(e, a, t, F, n === null ? _s : function() {
			return bs(e), n(r);
		});
	}
	function ys(e) {
		var t = e.memoizedState;
		if (t !== null) return t;
		t = {
			memoizedState: F,
			baseState: F,
			baseQueue: null,
			queue: {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: ko,
				lastRenderedState: F
			},
			next: null
		};
		var n = {};
		return t.next = {
			memoizedState: n,
			baseState: n,
			baseQueue: null,
			queue: {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: ko,
				lastRenderedState: n
			},
			next: null
		}, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
	}
	function bs(e) {
		var t = ys(e);
		t.next === null && (t = e.alternate.memoizedState), Ds(e, t.next.queue, {}, du());
	}
	function xs() {
		return qi(Qf);
	}
	function Ss() {
		return To().memoizedState;
	}
	function Cs() {
		return To().memoizedState;
	}
	function ws(e) {
		for (var t = e.return; t !== null;) {
			switch (t.tag) {
				case 24:
				case 3:
					var n = du();
					e = Fa(n);
					var r = Ia(t, e, n);
					r !== null && (pu(r, t, n), La(r, t, n)), t = { cache: ea() }, e.payload = t;
					return;
			}
			t = t.return;
		}
	}
	function Ts(e, t, n) {
		var r = du();
		n = {
			lane: r,
			revertLane: 0,
			gesture: null,
			action: n,
			hasEagerState: !1,
			eagerState: null,
			next: null
		}, ks(e) ? As(t, n) : (n = Jr(e, t, n, r), n !== null && (pu(n, e, r), js(n, t, r)));
	}
	function Es(e, t, n) {
		Ds(e, t, n, du());
	}
	function Ds(e, t, n, r) {
		var i = {
			lane: r,
			revertLane: 0,
			gesture: null,
			action: n,
			hasEagerState: !1,
			eagerState: null,
			next: null
		};
		if (ks(e)) As(t, i);
		else {
			var a = e.alternate;
			if (e.lanes === 0 && (a === null || a.lanes === 0) && (a = t.lastRenderedReducer, a !== null)) try {
				var o = t.lastRenderedState, s = a(o, n);
				if (i.hasEagerState = !0, i.eagerState = s, mr(s, o)) return qr(e, t, i, 0), Fl === null && Kr(), !1;
			} catch {}
			if (n = Jr(e, t, i, r), n !== null) return pu(n, e, r), js(n, t, r), !0;
		}
		return !1;
	}
	function Os(e, t, n, r) {
		if (r = {
			lane: 2,
			revertLane: ud(),
			gesture: null,
			action: r,
			hasEagerState: !1,
			eagerState: null,
			next: null
		}, ks(e)) {
			if (t) throw Error(i(479));
		} else t = Jr(e, n, r, 2), t !== null && pu(t, e, 2);
	}
	function ks(e) {
		var t = e.alternate;
		return e === J || t !== null && t === J;
	}
	function As(e, t) {
		co = so = !0;
		var n = e.pending;
		n === null ? t.next = t : (t.next = n.next, n.next = t), e.pending = t;
	}
	function js(e, t, n) {
		if (n & 4194048) {
			var r = t.lanes;
			r &= e.pendingLanes, n |= r, t.lanes = n, Ge(e, n);
		}
	}
	var Ms = {
		readContext: qi,
		use: Y,
		useCallback: ho,
		useContext: ho,
		useEffect: ho,
		useImperativeHandle: ho,
		useLayoutEffect: ho,
		useInsertionEffect: ho,
		useMemo: ho,
		useReducer: ho,
		useRef: ho,
		useState: ho,
		useDebugValue: ho,
		useDeferredValue: ho,
		useTransition: ho,
		useSyncExternalStore: ho,
		useId: ho,
		useHostTransitionStatus: ho,
		useFormState: ho,
		useActionState: ho,
		useOptimistic: ho,
		useMemoCache: ho,
		useCacheRefresh: ho
	};
	Ms.useEffectEvent = ho;
	var Ns = {
		readContext: qi,
		use: Y,
		useCallback: function(e, t) {
			return wo().memoizedState = [e, t === void 0 ? null : t], e;
		},
		useContext: qi,
		useEffect: rs,
		useImperativeHandle: function(e, t, n) {
			n = n == null ? null : n.concat([e]), ts(4194308, 4, ls.bind(null, t, e), n);
		},
		useLayoutEffect: function(e, t) {
			return ts(4194308, 4, e, t);
		},
		useInsertionEffect: function(e, t) {
			ts(4, 2, e, t);
		},
		useMemo: function(e, t) {
			var n = wo();
			t = t === void 0 ? null : t;
			var r = e();
			if (lo) {
				De(!0);
				try {
					e();
				} finally {
					De(!1);
				}
			}
			return n.memoizedState = [r, t], r;
		},
		useReducer: function(e, t, n) {
			var r = wo();
			if (n !== void 0) {
				var i = n(t);
				if (lo) {
					De(!0);
					try {
						n(t);
					} finally {
						De(!1);
					}
				}
			} else i = t;
			return r.memoizedState = r.baseState = i, e = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: e,
				lastRenderedState: i
			}, r.queue = e, e = e.dispatch = Ts.bind(null, J, e), [r.memoizedState, e];
		},
		useRef: function(e) {
			var t = wo();
			return e = { current: e }, t.memoizedState = e;
		},
		useState: function(e) {
			e = zo(e);
			var t = e.queue, n = Es.bind(null, J, t);
			return t.dispatch = n, [e.memoizedState, n];
		},
		useDebugValue: ds,
		useDeferredValue: function(e, t) {
			return ms(wo(), e, t);
		},
		useTransition: function() {
			var e = zo(!1);
			return e = gs.bind(null, J, e.queue, !0, !1), wo().memoizedState = e, [!1, e];
		},
		useSyncExternalStore: function(e, t, n) {
			var r = J, a = wo();
			if (q) {
				if (n === void 0) throw Error(i(407));
				n = n();
			} else {
				if (n = t(), Fl === null) throw Error(i(349));
				Q & 127 || Po(r, t, n);
			}
			a.memoizedState = n;
			var o = {
				value: n,
				getSnapshot: t
			};
			return a.queue = o, rs(Io.bind(null, r, o, e), [e]), r.flags |= 2048, $o(9, { destroy: void 0 }, Fo.bind(null, r, o, n, t), null), n;
		},
		useId: function() {
			var e = wo(), t = Fl.identifierPrefix;
			if (q) {
				var n = yi, r = vi;
				n = (r & ~(1 << 32 - Oe(r) - 1)).toString(32) + n, t = "_" + t + "R_" + n, n = uo++, 0 < n && (t += "H" + n.toString(32)), t += "_";
			} else n = mo++, t = "_" + t + "r_" + n.toString(32) + "_";
			return e.memoizedState = t;
		},
		useHostTransitionStatus: xs,
		useFormState: Jo,
		useActionState: Jo,
		useOptimistic: function(e) {
			var t = wo();
			t.memoizedState = t.baseState = e;
			var n = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: null,
				lastRenderedState: null
			};
			return t.queue = n, t = Os.bind(null, J, !0, n), n.dispatch = t, [e, t];
		},
		useMemoCache: Oo,
		useCacheRefresh: function() {
			return wo().memoizedState = ws.bind(null, J);
		},
		useEffectEvent: function(e) {
			var t = wo(), n = { impl: e };
			return t.memoizedState = n, function() {
				if (X & 2) throw Error(i(440));
				return n.impl.apply(void 0, arguments);
			};
		}
	}, Ps = {
		readContext: qi,
		use: Y,
		useCallback: fs,
		useContext: qi,
		useEffect: is,
		useImperativeHandle: us,
		useInsertionEffect: ss,
		useLayoutEffect: cs,
		useMemo: ps,
		useReducer: Ao,
		useRef: es,
		useState: function() {
			return Ao(ko);
		},
		useDebugValue: ds,
		useDeferredValue: function(e, t) {
			return hs(To(), ao.memoizedState, e, t);
		},
		useTransition: function() {
			var e = Ao(ko)[0], t = To().memoizedState;
			return [typeof e == "boolean" ? e : Do(e), t];
		},
		useSyncExternalStore: No,
		useId: Ss,
		useHostTransitionStatus: xs,
		useFormState: Yo,
		useActionState: Yo,
		useOptimistic: function(e, t) {
			return Bo(To(), ao, e, t);
		},
		useMemoCache: Oo,
		useCacheRefresh: Cs
	};
	Ps.useEffectEvent = os;
	var Fs = {
		readContext: qi,
		use: Y,
		useCallback: fs,
		useContext: qi,
		useEffect: is,
		useImperativeHandle: us,
		useInsertionEffect: ss,
		useLayoutEffect: cs,
		useMemo: ps,
		useReducer: Mo,
		useRef: es,
		useState: function() {
			return Mo(ko);
		},
		useDebugValue: ds,
		useDeferredValue: function(e, t) {
			var n = To();
			return ao === null ? ms(n, e, t) : hs(n, ao.memoizedState, e, t);
		},
		useTransition: function() {
			var e = Mo(ko)[0], t = To().memoizedState;
			return [typeof e == "boolean" ? e : Do(e), t];
		},
		useSyncExternalStore: No,
		useId: Ss,
		useHostTransitionStatus: xs,
		useFormState: Qo,
		useActionState: Qo,
		useOptimistic: function(e, t) {
			var n = To();
			return ao === null ? (n.baseState = e, [e, n.queue.dispatch]) : Bo(n, ao, e, t);
		},
		useMemoCache: Oo,
		useCacheRefresh: Cs
	};
	Fs.useEffectEvent = os;
	function Is(e, t, n, r) {
		t = e.memoizedState, n = n(r, t), n = n == null ? t : f({}, t, n), e.memoizedState = n, e.lanes === 0 && (e.updateQueue.baseState = n);
	}
	var Ls = {
		enqueueSetState: function(e, t, n) {
			e = e._reactInternals;
			var r = du(), i = Fa(r);
			i.payload = t, n != null && (i.callback = n), t = Ia(e, i, r), t !== null && (pu(t, e, r), La(t, e, r));
		},
		enqueueReplaceState: function(e, t, n) {
			e = e._reactInternals;
			var r = du(), i = Fa(r);
			i.tag = 1, i.payload = t, n != null && (i.callback = n), t = Ia(e, i, r), t !== null && (pu(t, e, r), La(t, e, r));
		},
		enqueueForceUpdate: function(e, t) {
			e = e._reactInternals;
			var n = du(), r = Fa(n);
			r.tag = 2, t != null && (r.callback = t), t = Ia(e, r, n), t !== null && (pu(t, e, n), La(t, e, n));
		}
	};
	function Rs(e, t, n, r, i, a, o) {
		return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, a, o) : t.prototype && t.prototype.isPureReactComponent ? !hr(n, r) || !hr(i, a) : !0;
	}
	function zs(e, t, n, r) {
		e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(n, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(n, r), t.state !== e && Ls.enqueueReplaceState(t, t.state, null);
	}
	function Bs(e, t) {
		var n = t;
		if ("ref" in t) for (var r in n = {}, t) r !== "ref" && (n[r] = t[r]);
		if (e = e.defaultProps) for (var i in n === t && (n = f({}, n)), e) n[i] === void 0 && (n[i] = e[i]);
		return n;
	}
	function Vs(e) {
		Hr(e);
	}
	function Hs(e) {
		console.error(e);
	}
	function Us(e) {
		Hr(e);
	}
	function Ws(e, t) {
		try {
			var n = e.onUncaughtError;
			n(t.value, { componentStack: t.stack });
		} catch (e) {
			setTimeout(function() {
				throw e;
			});
		}
	}
	function Gs(e, t, n) {
		try {
			var r = e.onCaughtError;
			r(n.value, {
				componentStack: n.stack,
				errorBoundary: t.tag === 1 ? t.stateNode : null
			});
		} catch (e) {
			setTimeout(function() {
				throw e;
			});
		}
	}
	function Ks(e, t, n) {
		return n = Fa(n), n.tag = 3, n.payload = { element: null }, n.callback = function() {
			Ws(e, t);
		}, n;
	}
	function qs(e) {
		return e = Fa(e), e.tag = 3, e;
	}
	function Js(e, t, n, r) {
		var i = n.type.getDerivedStateFromError;
		if (typeof i == "function") {
			var a = r.value;
			e.payload = function() {
				return i(a);
			}, e.callback = function() {
				Gs(t, n, r);
			};
		}
		var o = n.stateNode;
		o !== null && typeof o.componentDidCatch == "function" && (e.callback = function() {
			Gs(t, n, r), typeof i != "function" && (tu === null ? tu = /* @__PURE__ */ new Set([this]) : tu.add(this));
			var e = r.stack;
			this.componentDidCatch(r.value, { componentStack: e === null ? "" : e });
		});
	}
	function Ys(e, t, n, r, a) {
		if (n.flags |= 32768, typeof r == "object" && r && typeof r.then == "function") {
			if (t = n.alternate, t !== null && Wi(t, n, a, !0), n = Ya.current, n !== null) {
				switch (n.tag) {
					case 31:
					case 13: return Xa === null ? Tu() : n.alternate === null && Hl === 0 && (Hl = 3), n.flags &= -257, n.flags |= 65536, n.lanes = a, r === _a ? n.flags |= 16384 : (t = n.updateQueue, t === null ? n.updateQueue = /* @__PURE__ */ new Set([r]) : t.add(r), Wu(e, r, a)), !1;
					case 22: return n.flags |= 65536, r === _a ? n.flags |= 16384 : (t = n.updateQueue, t === null ? (t = {
						transitions: null,
						markerInstances: null,
						retryQueue: /* @__PURE__ */ new Set([r])
					}, n.updateQueue = t) : (n = t.retryQueue, n === null ? t.retryQueue = /* @__PURE__ */ new Set([r]) : n.add(r)), Wu(e, r, a)), !1;
				}
				throw Error(i(435, n.tag));
			}
			return Wu(e, r, a), Tu(), !1;
		}
		if (q) return t = Ya.current, t === null ? (r !== ki && (t = Error(i(423), { cause: r }), Ii(ui(t, n))), e = e.current.alternate, e.flags |= 65536, a &= -a, e.lanes |= a, r = ui(r, n), a = Ks(e.stateNode, r, a), Ra(e, a), Hl !== 4 && (Hl = 2)) : (!(t.flags & 65536) && (t.flags |= 256), t.flags |= 65536, t.lanes = a, r !== ki && (e = Error(i(422), { cause: r }), Ii(ui(e, n)))), !1;
		var o = Error(i(520), { cause: r });
		if (o = ui(o, n), Jl === null ? Jl = [o] : Jl.push(o), Hl !== 4 && (Hl = 2), t === null) return !0;
		r = ui(r, n), n = t;
		do {
			switch (n.tag) {
				case 3: return n.flags |= 65536, e = a & -a, n.lanes |= e, e = Ks(n.stateNode, r, e), Ra(n, e), !1;
				case 1: if (t = n.type, o = n.stateNode, !(n.flags & 128) && (typeof t.getDerivedStateFromError == "function" || o !== null && typeof o.componentDidCatch == "function" && (tu === null || !tu.has(o)))) return n.flags |= 65536, a &= -a, n.lanes |= a, a = qs(a), Js(a, e, n, r), Ra(n, a), !1;
			}
			n = n.return;
		} while (n !== null);
		return !1;
	}
	var Xs = Error(i(461)), Zs = !1;
	function Qs(e, t, n, r) {
		t.child = e === null ? ja(t, null, n, r) : Aa(t, e.child, n, r);
	}
	function $s(e, t, n, r, i) {
		n = n.render;
		var a = t.ref;
		if ("ref" in r) {
			var o = {};
			for (var s in r) s !== "ref" && (o[s] = r[s]);
		} else o = r;
		return Ki(t), r = _o(e, t, n, o, a, i), s = xo(), e !== null && !Zs ? (So(e, t, i), Cc(e, t, i)) : (q && s && Si(t), t.flags |= 1, Qs(e, t, r, i), t.child);
	}
	function ec(e, t, n, r, i) {
		if (e === null) {
			var a = n.type;
			return typeof a == "function" && !ti(a) && a.defaultProps === void 0 && n.compare === null ? (t.tag = 15, t.type = a, tc(e, t, a, r, i)) : (e = ii(n.type, null, r, t, t.mode, i), e.ref = t.ref, e.return = t, t.child = e);
		}
		if (a = e.child, !wc(e, i)) {
			var o = a.memoizedProps;
			if (n = n.compare, n = n === null ? hr : n, n(o, r) && e.ref === t.ref) return Cc(e, t, i);
		}
		return t.flags |= 1, e = ni(a, r), e.ref = t.ref, e.return = t, t.child = e;
	}
	function tc(e, t, n, r, i) {
		if (e !== null) {
			var a = e.memoizedProps;
			if (hr(a, r) && e.ref === t.ref) {
				if (Zs = !1, t.pendingProps = r = a, wc(e, i)) e.flags & 131072 && (Zs = !0);
				else return t.lanes = e.lanes, Cc(e, t, i);
			}
		}
		return lc(e, t, n, r, i);
	}
	function nc(e, t, n, r) {
		var i = r.children, a = e === null ? null : e.memoizedState;
		if (e === null && t.stateNode === null && (t.stateNode = {
			_visibility: 1,
			_pendingMarkers: null,
			_retryCache: null,
			_transitions: null
		}), r.mode === "hidden") {
			if (t.flags & 128) {
				if (a = a === null ? n : a.baseLanes | n, e !== null) {
					for (r = t.child = e.child, i = 0; r !== null;) i = i | r.lanes | r.childLanes, r = r.sibling;
					r = i & ~a;
				} else r = 0, t.child = null;
				return ic(e, t, a, n, r);
			}
			if (n & 536870912) t.memoizedState = {
				baseLanes: 0,
				cachePool: null
			}, e !== null && fa(t, a === null ? null : a.cachePool), a === null ? qa() : Ka(t, a), $a(t);
			else return r = t.lanes = 536870912, ic(e, t, a === null ? n : a.baseLanes | n, n, r);
		} else a === null ? (e !== null && fa(t, null), qa(), eo(t)) : (fa(t, a.cachePool), Ka(t, a), eo(t), t.memoizedState = null);
		return Qs(e, t, i, n), t.child;
	}
	function rc(e, t) {
		return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = {
			_visibility: 1,
			_pendingMarkers: null,
			_retryCache: null,
			_transitions: null
		}), t.sibling;
	}
	function ic(e, t, n, r, i) {
		var a = da();
		return a = a === null ? null : {
			parent: $i._currentValue,
			pool: a
		}, t.memoizedState = {
			baseLanes: n,
			cachePool: a
		}, e !== null && fa(t, null), qa(), $a(t), e !== null && Wi(e, t, r, !0), t.childLanes = i, null;
	}
	function ac(e, t) {
		return t = vc({
			mode: t.mode,
			children: t.children
		}, e.mode), t.ref = e.ref, e.child = t, t.return = e, t;
	}
	function oc(e, t, n) {
		return Aa(t, e.child, null, n), e = ac(t, t.pendingProps), e.flags |= 2, to(t), t.memoizedState = null, e;
	}
	function sc(e, t, n) {
		var r = t.pendingProps, a = !!(t.flags & 128);
		if (t.flags &= -129, e === null) {
			if (q) {
				if (r.mode === "hidden") return e = ac(t, r), t.lanes = 536870912, rc(null, e);
				if (Qa(t), (e = Ei) ? (e = rf(e, Oi), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = {
					dehydrated: e,
					treeContext: _i === null ? null : {
						id: vi,
						overflow: yi
					},
					retryLane: 536870912,
					hydrationErrors: null
				}, n = si(e), n.return = t, t.child = n, Ti = t, Ei = null)) : e = null, e === null) throw Ai(t);
				return t.lanes = 536870912, null;
			}
			return ac(t, r);
		}
		var o = e.memoizedState;
		if (o !== null) {
			var s = o.dehydrated;
			if (Qa(t), a) {
				if (t.flags & 256) t.flags &= -257, t = oc(e, t, n);
				else if (t.memoizedState !== null) t.child = e.child, t.flags |= 128, t = null;
				else throw Error(i(558));
			} else if (Zs || Wi(e, t, n, !1), a = (n & e.childLanes) !== 0, Zs || a) {
				if (r = Fl, r !== null && (s = qe(r, n), s !== 0 && s !== o.retryLane)) throw o.retryLane = s, Yr(e, s), pu(r, e, s), Xs;
				Tu(), t = oc(e, t, n);
			} else e = o.treeContext, Ei = cf(s.nextSibling), Ti = t, q = !0, Di = null, Oi = !1, e !== null && wi(t, e), t = ac(t, r), t.flags |= 4096;
			return t;
		}
		return e = ni(e.child, {
			mode: r.mode,
			children: r.children
		}), e.ref = t.ref, t.child = e, e.return = t, e;
	}
	function cc(e, t) {
		var n = t.ref;
		if (n === null) e !== null && e.ref !== null && (t.flags |= 4194816);
		else {
			if (typeof n != "function" && typeof n != "object") throw Error(i(284));
			(e === null || e.ref !== n) && (t.flags |= 4194816);
		}
	}
	function lc(e, t, n, r, i) {
		return Ki(t), n = _o(e, t, n, r, void 0, i), r = xo(), e !== null && !Zs ? (So(e, t, i), Cc(e, t, i)) : (q && r && Si(t), t.flags |= 1, Qs(e, t, n, i), t.child);
	}
	function uc(e, t, n, r, i, a) {
		return Ki(t), t.updateQueue = null, n = yo(t, r, n, i), vo(e), r = xo(), e !== null && !Zs ? (So(e, t, a), Cc(e, t, a)) : (q && r && Si(t), t.flags |= 1, Qs(e, t, n, a), t.child);
	}
	function dc(e, t, n, r, i) {
		if (Ki(t), t.stateNode === null) {
			var a = Qr, o = n.contextType;
			typeof o == "object" && o && (a = qi(o)), a = new n(r, a), t.memoizedState = a.state !== null && a.state !== void 0 ? a.state : null, a.updater = Ls, t.stateNode = a, a._reactInternals = t, a = t.stateNode, a.props = r, a.state = t.memoizedState, a.refs = {}, Na(t), o = n.contextType, a.context = typeof o == "object" && o ? qi(o) : Qr, a.state = t.memoizedState, o = n.getDerivedStateFromProps, typeof o == "function" && (Is(t, n, o, r), a.state = t.memoizedState), typeof n.getDerivedStateFromProps == "function" || typeof a.getSnapshotBeforeUpdate == "function" || typeof a.UNSAFE_componentWillMount != "function" && typeof a.componentWillMount != "function" || (o = a.state, typeof a.componentWillMount == "function" && a.componentWillMount(), typeof a.UNSAFE_componentWillMount == "function" && a.UNSAFE_componentWillMount(), o !== a.state && Ls.enqueueReplaceState(a, a.state, null), Va(t, r, a, i), Ba(), a.state = t.memoizedState), typeof a.componentDidMount == "function" && (t.flags |= 4194308), r = !0;
		} else if (e === null) {
			a = t.stateNode;
			var s = t.memoizedProps, c = Bs(n, s);
			a.props = c;
			var l = a.context, u = n.contextType;
			o = Qr, typeof u == "object" && u && (o = qi(u));
			var d = n.getDerivedStateFromProps;
			u = typeof d == "function" || typeof a.getSnapshotBeforeUpdate == "function", s = t.pendingProps !== s, u || typeof a.UNSAFE_componentWillReceiveProps != "function" && typeof a.componentWillReceiveProps != "function" || (s || l !== o) && zs(t, a, r, o), Ma = !1;
			var f = t.memoizedState;
			a.state = f, Va(t, r, a, i), Ba(), l = t.memoizedState, s || f !== l || Ma ? (typeof d == "function" && (Is(t, n, d, r), l = t.memoizedState), (c = Ma || Rs(t, n, c, r, f, l, o)) ? (u || typeof a.UNSAFE_componentWillMount != "function" && typeof a.componentWillMount != "function" || (typeof a.componentWillMount == "function" && a.componentWillMount(), typeof a.UNSAFE_componentWillMount == "function" && a.UNSAFE_componentWillMount()), typeof a.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof a.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = l), a.props = r, a.state = l, a.context = o, r = c) : (typeof a.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
		} else {
			a = t.stateNode, Pa(e, t), o = t.memoizedProps, u = Bs(n, o), a.props = u, d = t.pendingProps, f = a.context, l = n.contextType, c = Qr, typeof l == "object" && l && (c = qi(l)), s = n.getDerivedStateFromProps, (l = typeof s == "function" || typeof a.getSnapshotBeforeUpdate == "function") || typeof a.UNSAFE_componentWillReceiveProps != "function" && typeof a.componentWillReceiveProps != "function" || (o !== d || f !== c) && zs(t, a, r, c), Ma = !1, f = t.memoizedState, a.state = f, Va(t, r, a, i), Ba();
			var p = t.memoizedState;
			o !== d || f !== p || Ma || e !== null && e.dependencies !== null && Gi(e.dependencies) ? (typeof s == "function" && (Is(t, n, s, r), p = t.memoizedState), (u = Ma || Rs(t, n, u, r, f, p, c) || e !== null && e.dependencies !== null && Gi(e.dependencies)) ? (l || typeof a.UNSAFE_componentWillUpdate != "function" && typeof a.componentWillUpdate != "function" || (typeof a.componentWillUpdate == "function" && a.componentWillUpdate(r, p, c), typeof a.UNSAFE_componentWillUpdate == "function" && a.UNSAFE_componentWillUpdate(r, p, c)), typeof a.componentDidUpdate == "function" && (t.flags |= 4), typeof a.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof a.componentDidUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 4), typeof a.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = p), a.props = r, a.state = p, a.context = c, r = u) : (typeof a.componentDidUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 4), typeof a.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 1024), r = !1);
		}
		return a = r, cc(e, t), r = !!(t.flags & 128), a || r ? (a = t.stateNode, n = r && typeof n.getDerivedStateFromError != "function" ? null : a.render(), t.flags |= 1, e !== null && r ? (t.child = Aa(t, e.child, null, i), t.child = Aa(t, null, n, i)) : Qs(e, t, n, i), t.memoizedState = a.state, e = t.child) : e = Cc(e, t, i), e;
	}
	function fc(e, t, n, r) {
		return Pi(), t.flags |= 256, Qs(e, t, n, r), t.child;
	}
	var pc = {
		dehydrated: null,
		treeContext: null,
		retryLane: 0,
		hydrationErrors: null
	};
	function mc(e) {
		return {
			baseLanes: e,
			cachePool: pa()
		};
	}
	function hc(e, t, n) {
		return e = e === null ? 0 : e.childLanes & ~n, t && (e |= Kl), e;
	}
	function gc(e, t, n) {
		var r = t.pendingProps, a = !1, o = !!(t.flags & 128), s;
		if ((s = o) || (s = e !== null && e.memoizedState === null ? !1 : !!(no.current & 2)), s && (a = !0, t.flags &= -129), s = !!(t.flags & 32), t.flags &= -33, e === null) {
			if (q) {
				if (a ? Za(t) : eo(t), (e = Ei) ? (e = rf(e, Oi), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = {
					dehydrated: e,
					treeContext: _i === null ? null : {
						id: vi,
						overflow: yi
					},
					retryLane: 536870912,
					hydrationErrors: null
				}, n = si(e), n.return = t, t.child = n, Ti = t, Ei = null)) : e = null, e === null) throw Ai(t);
				return of(e) ? t.lanes = 32 : t.lanes = 536870912, null;
			}
			var c = r.children;
			return r = r.fallback, a ? (eo(t), a = t.mode, c = vc({
				mode: "hidden",
				children: c
			}, a), r = ai(r, a, n, null), c.return = t, r.return = t, c.sibling = r, t.child = c, r = t.child, r.memoizedState = mc(n), r.childLanes = hc(e, s, n), t.memoizedState = pc, rc(null, r)) : (Za(t), _c(t, c));
		}
		var l = e.memoizedState;
		if (l !== null && (c = l.dehydrated, c !== null)) {
			if (o) t.flags & 256 ? (Za(t), t.flags &= -257, t = yc(e, t, n)) : t.memoizedState === null ? (eo(t), c = r.fallback, a = t.mode, r = vc({
				mode: "visible",
				children: r.children
			}, a), c = ai(c, a, n, null), c.flags |= 2, r.return = t, c.return = t, r.sibling = c, t.child = r, Aa(t, e.child, null, n), r = t.child, r.memoizedState = mc(n), r.childLanes = hc(e, s, n), t.memoizedState = pc, t = rc(null, r)) : (eo(t), t.child = e.child, t.flags |= 128, t = null);
			else if (Za(t), of(c)) {
				if (s = c.nextSibling && c.nextSibling.dataset, s) var u = s.dgst;
				s = u, r = Error(i(419)), r.stack = "", r.digest = s, Ii({
					value: r,
					source: null,
					stack: null
				}), t = yc(e, t, n);
			} else if (Zs || Wi(e, t, n, !1), s = (n & e.childLanes) !== 0, Zs || s) {
				if (s = Fl, s !== null && (r = qe(s, n), r !== 0 && r !== l.retryLane)) throw l.retryLane = r, Yr(e, r), pu(s, e, r), Xs;
				af(c) || Tu(), t = yc(e, t, n);
			} else af(c) ? (t.flags |= 192, t.child = e.child, t = null) : (e = l.treeContext, Ei = cf(c.nextSibling), Ti = t, q = !0, Di = null, Oi = !1, e !== null && wi(t, e), t = _c(t, r.children), t.flags |= 4096);
			return t;
		}
		return a ? (eo(t), c = r.fallback, a = t.mode, l = e.child, u = l.sibling, r = ni(l, {
			mode: "hidden",
			children: r.children
		}), r.subtreeFlags = l.subtreeFlags & 65011712, u === null ? (c = ai(c, a, n, null), c.flags |= 2) : c = ni(u, c), c.return = t, r.return = t, r.sibling = c, t.child = r, rc(null, r), r = t.child, c = e.child.memoizedState, c === null ? c = mc(n) : (a = c.cachePool, a === null ? a = pa() : (l = $i._currentValue, a = a.parent === l ? a : {
			parent: l,
			pool: l
		}), c = {
			baseLanes: c.baseLanes | n,
			cachePool: a
		}), r.memoizedState = c, r.childLanes = hc(e, s, n), t.memoizedState = pc, rc(e.child, r)) : (Za(t), n = e.child, e = n.sibling, n = ni(n, {
			mode: "visible",
			children: r.children
		}), n.return = t, n.sibling = null, e !== null && (s = t.deletions, s === null ? (t.deletions = [e], t.flags |= 16) : s.push(e)), t.child = n, t.memoizedState = null, n);
	}
	function _c(e, t) {
		return t = vc({
			mode: "visible",
			children: t
		}, e.mode), t.return = e, e.child = t;
	}
	function vc(e, t) {
		return e = ei(22, e, null, t), e.lanes = 0, e;
	}
	function yc(e, t, n) {
		return Aa(t, e.child, null, n), e = _c(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
	}
	function bc(e, t, n) {
		e.lanes |= t;
		var r = e.alternate;
		r !== null && (r.lanes |= t), Hi(e.return, t, n);
	}
	function xc(e, t, n, r, i, a) {
		var o = e.memoizedState;
		o === null ? e.memoizedState = {
			isBackwards: t,
			rendering: null,
			renderingStartTime: 0,
			last: r,
			tail: n,
			tailMode: i,
			treeForkCount: a
		} : (o.isBackwards = t, o.rendering = null, o.renderingStartTime = 0, o.last = r, o.tail = n, o.tailMode = i, o.treeForkCount = a);
	}
	function Sc(e, t, n) {
		var r = t.pendingProps, i = r.revealOrder, a = r.tail;
		r = r.children;
		var o = no.current, s = !!(o & 2);
		if (s ? (o = o & 1 | 2, t.flags |= 128) : o &= 1, R(no, o), Qs(e, t, r, n), r = q ? mi : 0, !s && e !== null && e.flags & 128) a: for (e = t.child; e !== null;) {
			if (e.tag === 13) e.memoizedState !== null && bc(e, n, t);
			else if (e.tag === 19) bc(e, n, t);
			else if (e.child !== null) {
				e.child.return = e, e = e.child;
				continue;
			}
			if (e === t) break a;
			for (; e.sibling === null;) {
				if (e.return === null || e.return === t) break a;
				e = e.return;
			}
			e.sibling.return = e.return, e = e.sibling;
		}
		switch (i) {
			case "forwards":
				for (n = t.child, i = null; n !== null;) e = n.alternate, e !== null && ro(e) === null && (i = n), n = n.sibling;
				n = i, n === null ? (i = t.child, t.child = null) : (i = n.sibling, n.sibling = null), xc(t, !1, i, n, a, r);
				break;
			case "backwards":
			case "unstable_legacy-backwards":
				for (n = null, i = t.child, t.child = null; i !== null;) {
					if (e = i.alternate, e !== null && ro(e) === null) {
						t.child = i;
						break;
					}
					e = i.sibling, i.sibling = n, n = i, i = e;
				}
				xc(t, !0, n, null, a, r);
				break;
			case "together":
				xc(t, !1, null, null, void 0, r);
				break;
			default: t.memoizedState = null;
		}
		return t.child;
	}
	function Cc(e, t, n) {
		if (e !== null && (t.dependencies = e.dependencies), Ul |= t.lanes, (n & t.childLanes) === 0) {
			if (e !== null) {
				if (Wi(e, t, n, !1), (n & t.childLanes) === 0) return null;
			} else return null;
		}
		if (e !== null && t.child !== e.child) throw Error(i(153));
		if (t.child !== null) {
			for (e = t.child, n = ni(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null;) e = e.sibling, n = n.sibling = ni(e, e.pendingProps), n.return = t;
			n.sibling = null;
		}
		return t.child;
	}
	function wc(e, t) {
		return (e.lanes & t) !== 0 || (e = e.dependencies, !!(e !== null && Gi(e)));
	}
	function Tc(e, t, n) {
		switch (t.tag) {
			case 3:
				ie(t, t.stateNode.containerInfo), Bi(t, $i, e.memoizedState.cache), Pi();
				break;
			case 27:
			case 5:
				V(t);
				break;
			case 4:
				ie(t, t.stateNode.containerInfo);
				break;
			case 10:
				Bi(t, t.type, t.memoizedProps.value);
				break;
			case 31:
				if (t.memoizedState !== null) return t.flags |= 128, Qa(t), null;
				break;
			case 13:
				var r = t.memoizedState;
				if (r !== null) return r.dehydrated === null ? (n & t.child.childLanes) === 0 ? (Za(t), e = Cc(e, t, n), e === null ? null : e.sibling) : gc(e, t, n) : (Za(t), t.flags |= 128, null);
				Za(t);
				break;
			case 19:
				var i = !!(e.flags & 128);
				if (r = (n & t.childLanes) !== 0, r ||= (Wi(e, t, n, !1), (n & t.childLanes) !== 0), i) {
					if (r) return Sc(e, t, n);
					t.flags |= 128;
				}
				if (i = t.memoizedState, i !== null && (i.rendering = null, i.tail = null, i.lastEffect = null), R(no, no.current), r) break;
				return null;
			case 22: return t.lanes = 0, nc(e, t, n, t.pendingProps);
			case 24: Bi(t, $i, e.memoizedState.cache);
		}
		return Cc(e, t, n);
	}
	function Ec(e, t, n) {
		if (e !== null) {
			if (e.memoizedProps !== t.pendingProps) Zs = !0;
			else {
				if (!wc(e, n) && !(t.flags & 128)) return Zs = !1, Tc(e, t, n);
				Zs = !!(e.flags & 131072);
			}
		} else Zs = !1, q && t.flags & 1048576 && xi(t, mi, t.index);
		switch (t.lanes = 0, t.tag) {
			case 16:
				a: {
					var r = t.pendingProps;
					if (e = ba(t.elementType), t.type = e, typeof e == "function") ti(e) ? (r = Bs(e, r), t.tag = 1, t = dc(null, t, e, r, n)) : (t.tag = 0, t = lc(null, t, e, r, n));
					else {
						if (e != null) {
							var a = e.$$typeof;
							if (a === x) {
								t.tag = 11, t = $s(null, t, e, r, n);
								break a;
							}
							if (a === w) {
								t.tag = 14, t = ec(null, t, e, r, n);
								break a;
							}
						}
						throw t = j(e) || e, Error(i(306, t, ""));
					}
				}
				return t;
			case 0: return lc(e, t, t.type, t.pendingProps, n);
			case 1: return r = t.type, a = Bs(r, t.pendingProps), dc(e, t, r, a, n);
			case 3:
				a: {
					if (ie(t, t.stateNode.containerInfo), e === null) throw Error(i(387));
					r = t.pendingProps;
					var o = t.memoizedState;
					a = o.element, Pa(e, t), Va(t, r, null, n);
					var s = t.memoizedState;
					if (r = s.cache, Bi(t, $i, r), r !== o.cache && Ui(t, [$i], n, !0), Ba(), r = s.element, o.isDehydrated) {
						if (o = {
							element: r,
							isDehydrated: !1,
							cache: s.cache
						}, t.updateQueue.baseState = o, t.memoizedState = o, t.flags & 256) {
							t = fc(e, t, r, n);
							break a;
						}
						if (r !== a) {
							a = ui(Error(i(424)), t), Ii(a), t = fc(e, t, r, n);
							break a;
						}
						switch (e = t.stateNode.containerInfo, e.nodeType) {
							case 9:
								e = e.body;
								break;
							default: e = e.nodeName === "HTML" ? e.ownerDocument.body : e;
						}
						for (Ei = cf(e.firstChild), Ti = t, q = !0, Di = null, Oi = !0, n = ja(t, null, r, n), t.child = n; n;) n.flags = n.flags & -3 | 4096, n = n.sibling;
					} else {
						if (Pi(), r === a) {
							t = Cc(e, t, n);
							break a;
						}
						Qs(e, t, r, n);
					}
					t = t.child;
				}
				return t;
			case 26: return cc(e, t), e === null ? (n = kf(t.type, null, t.pendingProps, null)) ? t.memoizedState = n : q || (n = t.type, e = t.pendingProps, r = Bd(ne.current).createElement(n), r[$e] = t, r[et] = e, Pd(r, n, e), ft(r), t.stateNode = r) : t.memoizedState = kf(t.type, e.memoizedProps, t.pendingProps, e.memoizedState), null;
			case 27: return V(t), e === null && q && (r = t.stateNode = ff(t.type, t.pendingProps, ne.current), Ti = t, Oi = !0, a = Ei, Zd(t.type) ? (lf = a, Ei = cf(r.firstChild)) : Ei = a), Qs(e, t, t.pendingProps.children, n), cc(e, t), e === null && (t.flags |= 4194304), t.child;
			case 5: return e === null && q && ((a = r = Ei) && (r = tf(r, t.type, t.pendingProps, Oi), r === null ? a = !1 : (t.stateNode = r, Ti = t, Ei = cf(r.firstChild), Oi = !1, a = !0)), a || Ai(t)), V(t), a = t.type, o = t.pendingProps, s = e === null ? null : e.memoizedProps, r = o.children, Ud(a, o) ? r = null : s !== null && Ud(a, s) && (t.flags |= 32), t.memoizedState !== null && (a = _o(e, t, bo, null, null, n), Qf._currentValue = a), cc(e, t), Qs(e, t, r, n), t.child;
			case 6: return e === null && q && ((e = n = Ei) && (n = nf(n, t.pendingProps, Oi), n === null ? e = !1 : (t.stateNode = n, Ti = t, Ei = null, e = !0)), e || Ai(t)), null;
			case 13: return gc(e, t, n);
			case 4: return ie(t, t.stateNode.containerInfo), r = t.pendingProps, e === null ? t.child = Aa(t, null, r, n) : Qs(e, t, r, n), t.child;
			case 11: return $s(e, t, t.type, t.pendingProps, n);
			case 7: return Qs(e, t, t.pendingProps, n), t.child;
			case 8: return Qs(e, t, t.pendingProps.children, n), t.child;
			case 12: return Qs(e, t, t.pendingProps.children, n), t.child;
			case 10: return r = t.pendingProps, Bi(t, t.type, r.value), Qs(e, t, r.children, n), t.child;
			case 9: return a = t.type._context, r = t.pendingProps.children, Ki(t), a = qi(a), r = r(a), t.flags |= 1, Qs(e, t, r, n), t.child;
			case 14: return ec(e, t, t.type, t.pendingProps, n);
			case 15: return tc(e, t, t.type, t.pendingProps, n);
			case 19: return Sc(e, t, n);
			case 31: return sc(e, t, n);
			case 22: return nc(e, t, n, t.pendingProps);
			case 24: return Ki(t), r = qi($i), e === null ? (a = da(), a === null && (a = Fl, o = ea(), a.pooledCache = o, o.refCount++, o !== null && (a.pooledCacheLanes |= n), a = o), t.memoizedState = {
				parent: r,
				cache: a
			}, Na(t), Bi(t, $i, a)) : ((e.lanes & n) !== 0 && (Pa(e, t), Va(t, null, null, n), Ba()), a = e.memoizedState, o = t.memoizedState, a.parent === r ? (r = o.cache, Bi(t, $i, r), r !== a.cache && Ui(t, [$i], n, !0)) : (a = {
				parent: r,
				cache: r
			}, t.memoizedState = a, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = a), Bi(t, $i, r))), Qs(e, t, t.pendingProps.children, n), t.child;
			case 29: throw t.pendingProps;
		}
		throw Error(i(156, t.tag));
	}
	function Dc(e) {
		e.flags |= 4;
	}
	function Oc(e, t, n, r, i) {
		if ((t = !!(e.mode & 32)) && (t = !1), t) {
			if (e.flags |= 16777216, (i & 335544128) === i) {
				if (e.stateNode.complete) e.flags |= 8192;
				else if (Su()) e.flags |= 8192;
				else throw xa = _a, ha;
			}
		} else e.flags &= -16777217;
	}
	function kc(e, t) {
		if (t.type !== "stylesheet" || t.state.loading & 4) e.flags &= -16777217;
		else if (e.flags |= 16777216, !Wf(t)) {
			if (Su()) e.flags |= 8192;
			else throw xa = _a, ha;
		}
	}
	function Ac(e, t) {
		t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag === 22 ? 536870912 : ze(), e.lanes |= t, ql |= t);
	}
	function jc(e, t) {
		if (!q) switch (e.tailMode) {
			case "hidden":
				t = e.tail;
				for (var n = null; t !== null;) t.alternate !== null && (n = t), t = t.sibling;
				n === null ? e.tail = null : n.sibling = null;
				break;
			case "collapsed":
				n = e.tail;
				for (var r = null; n !== null;) n.alternate !== null && (r = n), n = n.sibling;
				r === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : r.sibling = null;
		}
	}
	function Mc(e) {
		var t = e.alternate !== null && e.alternate.child === e.child, n = 0, r = 0;
		if (t) for (var i = e.child; i !== null;) n |= i.lanes | i.childLanes, r |= i.subtreeFlags & 65011712, r |= i.flags & 65011712, i.return = e, i = i.sibling;
		else for (i = e.child; i !== null;) n |= i.lanes | i.childLanes, r |= i.subtreeFlags, r |= i.flags, i.return = e, i = i.sibling;
		return e.subtreeFlags |= r, e.childLanes = n, t;
	}
	function Nc(e, t, n) {
		var r = t.pendingProps;
		switch (Ci(t), t.tag) {
			case 16:
			case 15:
			case 0:
			case 11:
			case 7:
			case 8:
			case 12:
			case 9:
			case 14: return Mc(t), null;
			case 1: return Mc(t), null;
			case 3: return n = t.stateNode, r = null, e !== null && (r = e.memoizedState.cache), t.memoizedState.cache !== r && (t.flags |= 2048), Vi($i), ae(), n.pendingContext && (n.context = n.pendingContext, n.pendingContext = null), (e === null || e.child === null) && (Ni(t) ? Dc(t) : e === null || e.memoizedState.isDehydrated && !(t.flags & 256) || (t.flags |= 1024, Fi())), Mc(t), null;
			case 26:
				var a = t.type, o = t.memoizedState;
				return e === null ? (Dc(t), o === null ? (Mc(t), Oc(t, a, null, r, n)) : (Mc(t), kc(t, o))) : o ? o === e.memoizedState ? (Mc(t), t.flags &= -16777217) : (Dc(t), Mc(t), kc(t, o)) : (e = e.memoizedProps, e !== r && Dc(t), Mc(t), Oc(t, a, e, r, n)), null;
			case 27:
				if (oe(t), n = ne.current, a = t.type, e !== null && t.stateNode != null) e.memoizedProps !== r && Dc(t);
				else {
					if (!r) {
						if (t.stateNode === null) throw Error(i(166));
						return Mc(t), null;
					}
					e = z.current, Ni(t) ? ji(t, e) : (e = ff(a, r, n), t.stateNode = e, Dc(t));
				}
				return Mc(t), null;
			case 5:
				if (oe(t), a = t.type, e !== null && t.stateNode != null) e.memoizedProps !== r && Dc(t);
				else {
					if (!r) {
						if (t.stateNode === null) throw Error(i(166));
						return Mc(t), null;
					}
					if (o = z.current, Ni(t)) ji(t, o);
					else {
						var s = Bd(ne.current);
						switch (o) {
							case 1:
								o = s.createElementNS("http://www.w3.org/2000/svg", a);
								break;
							case 2:
								o = s.createElementNS("http://www.w3.org/1998/Math/MathML", a);
								break;
							default: switch (a) {
								case "svg":
									o = s.createElementNS("http://www.w3.org/2000/svg", a);
									break;
								case "math":
									o = s.createElementNS("http://www.w3.org/1998/Math/MathML", a);
									break;
								case "script":
									o = s.createElement("div"), o.innerHTML = "<script><\/script>", o = o.removeChild(o.firstChild);
									break;
								case "select":
									o = typeof r.is == "string" ? s.createElement("select", { is: r.is }) : s.createElement("select"), r.multiple ? o.multiple = !0 : r.size && (o.size = r.size);
									break;
								default: o = typeof r.is == "string" ? s.createElement(a, { is: r.is }) : s.createElement(a);
							}
						}
						o[$e] = t, o[et] = r;
						a: for (s = t.child; s !== null;) {
							if (s.tag === 5 || s.tag === 6) o.appendChild(s.stateNode);
							else if (s.tag !== 4 && s.tag !== 27 && s.child !== null) {
								s.child.return = s, s = s.child;
								continue;
							}
							if (s === t) break a;
							for (; s.sibling === null;) {
								if (s.return === null || s.return === t) break a;
								s = s.return;
							}
							s.sibling.return = s.return, s = s.sibling;
						}
						t.stateNode = o;
						a: switch (Pd(o, a, r), a) {
							case "button":
							case "input":
							case "select":
							case "textarea":
								r = !!r.autoFocus;
								break a;
							case "img":
								r = !0;
								break a;
							default: r = !1;
						}
						r && Dc(t);
					}
				}
				return Mc(t), Oc(t, t.type, e === null ? null : e.memoizedProps, t.pendingProps, n), null;
			case 6:
				if (e && t.stateNode != null) e.memoizedProps !== r && Dc(t);
				else {
					if (typeof r != "string" && t.stateNode === null) throw Error(i(166));
					if (e = ne.current, Ni(t)) {
						if (e = t.stateNode, n = t.memoizedProps, r = null, a = Ti, a !== null) switch (a.tag) {
							case 27:
							case 5: r = a.memoizedProps;
						}
						e[$e] = t, e = !!(e.nodeValue === n || r !== null && !0 === r.suppressHydrationWarning || jd(e.nodeValue, n)), e || Ai(t, !0);
					} else e = Bd(e).createTextNode(r), e[$e] = t, t.stateNode = e;
				}
				return Mc(t), null;
			case 31:
				if (n = t.memoizedState, e === null || e.memoizedState !== null) {
					if (r = Ni(t), n !== null) {
						if (e === null) {
							if (!r) throw Error(i(318));
							if (e = t.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(i(557));
							e[$e] = t;
						} else Pi(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
						Mc(t), e = !1;
					} else n = Fi(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = n), e = !0;
					if (!e) return t.flags & 256 ? (to(t), t) : (to(t), null);
					if (t.flags & 128) throw Error(i(558));
				}
				return Mc(t), null;
			case 13:
				if (r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
					if (a = Ni(t), r !== null && r.dehydrated !== null) {
						if (e === null) {
							if (!a) throw Error(i(318));
							if (a = t.memoizedState, a = a === null ? null : a.dehydrated, !a) throw Error(i(317));
							a[$e] = t;
						} else Pi(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
						Mc(t), a = !1;
					} else a = Fi(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = a), a = !0;
					if (!a) return t.flags & 256 ? (to(t), t) : (to(t), null);
				}
				return to(t), t.flags & 128 ? (t.lanes = n, t) : (n = r !== null, e = e !== null && e.memoizedState !== null, n && (r = t.child, a = null, r.alternate !== null && r.alternate.memoizedState !== null && r.alternate.memoizedState.cachePool !== null && (a = r.alternate.memoizedState.cachePool.pool), o = null, r.memoizedState !== null && r.memoizedState.cachePool !== null && (o = r.memoizedState.cachePool.pool), o !== a && (r.flags |= 2048)), n !== e && n && (t.child.flags |= 8192), Ac(t, t.updateQueue), Mc(t), null);
			case 4: return ae(), e === null && xd(t.stateNode.containerInfo), Mc(t), null;
			case 10: return Vi(t.type), Mc(t), null;
			case 19:
				if (L(no), r = t.memoizedState, r === null) return Mc(t), null;
				if (a = !!(t.flags & 128), o = r.rendering, o === null) {
					if (a) jc(r, !1);
					else {
						if (Hl !== 0 || e !== null && e.flags & 128) for (e = t.child; e !== null;) {
							if (o = ro(e), o !== null) {
								for (t.flags |= 128, jc(r, !1), e = o.updateQueue, t.updateQueue = e, Ac(t, e), t.subtreeFlags = 0, e = n, n = t.child; n !== null;) ri(n, e), n = n.sibling;
								return R(no, no.current & 1 | 2), q && bi(t, r.treeForkCount), t.child;
							}
							e = e.sibling;
						}
						r.tail !== null && U() > $l && (t.flags |= 128, a = !0, jc(r, !1), t.lanes = 4194304);
					}
				} else {
					if (!a) {
						if (e = ro(o), e !== null) {
							if (t.flags |= 128, a = !0, e = e.updateQueue, t.updateQueue = e, Ac(t, e), jc(r, !0), r.tail === null && r.tailMode === "hidden" && !o.alternate && !q) return Mc(t), null;
						} else 2 * U() - r.renderingStartTime > $l && n !== 536870912 && (t.flags |= 128, a = !0, jc(r, !1), t.lanes = 4194304);
					}
					r.isBackwards ? (o.sibling = t.child, t.child = o) : (e = r.last, e === null ? t.child = o : e.sibling = o, r.last = o);
				}
				return r.tail === null ? (Mc(t), null) : (e = r.tail, r.rendering = e, r.tail = e.sibling, r.renderingStartTime = U(), e.sibling = null, n = no.current, R(no, a ? n & 1 | 2 : n & 1), q && bi(t, r.treeForkCount), e);
			case 22:
			case 23: return to(t), Ja(), r = t.memoizedState !== null, e === null ? r && (t.flags |= 8192) : e.memoizedState !== null !== r && (t.flags |= 8192), r ? n & 536870912 && !(t.flags & 128) && (Mc(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : Mc(t), n = t.updateQueue, n !== null && Ac(t, n.retryQueue), n = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), r = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (r = t.memoizedState.cachePool.pool), r !== n && (t.flags |= 2048), e !== null && L(ua), null;
			case 24: return n = null, e !== null && (n = e.memoizedState.cache), t.memoizedState.cache !== n && (t.flags |= 2048), Vi($i), Mc(t), null;
			case 25: return null;
			case 30: return null;
		}
		throw Error(i(156, t.tag));
	}
	function Pc(e, t) {
		switch (Ci(t), t.tag) {
			case 1: return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 3: return Vi($i), ae(), e = t.flags, e & 65536 && !(e & 128) ? (t.flags = e & -65537 | 128, t) : null;
			case 26:
			case 27:
			case 5: return oe(t), null;
			case 31:
				if (t.memoizedState !== null) {
					if (to(t), t.alternate === null) throw Error(i(340));
					Pi();
				}
				return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 13:
				if (to(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
					if (t.alternate === null) throw Error(i(340));
					Pi();
				}
				return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 19: return L(no), null;
			case 4: return ae(), null;
			case 10: return Vi(t.type), null;
			case 22:
			case 23: return to(t), Ja(), e !== null && L(ua), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 24: return Vi($i), null;
			case 25: return null;
			default: return null;
		}
	}
	function Fc(e, t) {
		switch (Ci(t), t.tag) {
			case 3:
				Vi($i), ae();
				break;
			case 26:
			case 27:
			case 5:
				oe(t);
				break;
			case 4:
				ae();
				break;
			case 31:
				t.memoizedState !== null && to(t);
				break;
			case 13:
				to(t);
				break;
			case 19:
				L(no);
				break;
			case 10:
				Vi(t.type);
				break;
			case 22:
			case 23:
				to(t), Ja(), e !== null && L(ua);
				break;
			case 24: Vi($i);
		}
	}
	function Ic(e, t) {
		try {
			var n = t.updateQueue, r = n === null ? null : n.lastEffect;
			if (r !== null) {
				var i = r.next;
				n = i;
				do {
					if ((n.tag & e) === e) {
						r = void 0;
						var a = n.create, o = n.inst;
						r = a(), o.destroy = r;
					}
					n = n.next;
				} while (n !== i);
			}
		} catch (e) {
			Uu(t, t.return, e);
		}
	}
	function Lc(e, t, n) {
		try {
			var r = t.updateQueue, i = r === null ? null : r.lastEffect;
			if (i !== null) {
				var a = i.next;
				r = a;
				do {
					if ((r.tag & e) === e) {
						var o = r.inst, s = o.destroy;
						if (s !== void 0) {
							o.destroy = void 0, i = t;
							var c = n, l = s;
							try {
								l();
							} catch (e) {
								Uu(i, c, e);
							}
						}
					}
					r = r.next;
				} while (r !== a);
			}
		} catch (e) {
			Uu(t, t.return, e);
		}
	}
	function Rc(e) {
		var t = e.updateQueue;
		if (t !== null) {
			var n = e.stateNode;
			try {
				Ua(t, n);
			} catch (t) {
				Uu(e, e.return, t);
			}
		}
	}
	function zc(e, t, n) {
		n.props = Bs(e.type, e.memoizedProps), n.state = e.memoizedState;
		try {
			n.componentWillUnmount();
		} catch (n) {
			Uu(e, t, n);
		}
	}
	function Bc(e, t) {
		try {
			var n = e.ref;
			if (n !== null) {
				switch (e.tag) {
					case 26:
					case 27:
					case 5:
						var r = e.stateNode;
						break;
					case 30:
						r = e.stateNode;
						break;
					default: r = e.stateNode;
				}
				typeof n == "function" ? e.refCleanup = n(r) : n.current = r;
			}
		} catch (n) {
			Uu(e, t, n);
		}
	}
	function Vc(e, t) {
		var n = e.ref, r = e.refCleanup;
		if (n !== null) {
			if (typeof r == "function") try {
				r();
			} catch (n) {
				Uu(e, t, n);
			} finally {
				e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
			}
			else if (typeof n == "function") try {
				n(null);
			} catch (n) {
				Uu(e, t, n);
			}
			else n.current = null;
		}
	}
	function Hc(e) {
		var t = e.type, n = e.memoizedProps, r = e.stateNode;
		try {
			a: switch (t) {
				case "button":
				case "input":
				case "select":
				case "textarea":
					n.autoFocus && r.focus();
					break a;
				case "img": n.src ? r.src = n.src : n.srcSet && (r.srcset = n.srcSet);
			}
		} catch (t) {
			Uu(e, e.return, t);
		}
	}
	function Uc(e, t, n) {
		try {
			var r = e.stateNode;
			Fd(r, e.type, n, t), r[et] = t;
		} catch (t) {
			Uu(e, e.return, t);
		}
	}
	function Wc(e) {
		return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && Zd(e.type) || e.tag === 4;
	}
	function Gc(e) {
		a: for (;;) {
			for (; e.sibling === null;) {
				if (e.return === null || Wc(e.return)) return null;
				e = e.return;
			}
			for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18;) {
				if (e.tag === 27 && Zd(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue a;
				e.child.return = e, e = e.child;
			}
			if (!(e.flags & 2)) return e.stateNode;
		}
	}
	function Kc(e, t, n) {
		var r = e.tag;
		if (r === 5 || r === 6) e = e.stateNode, t ? (n.nodeType === 9 ? n.body : n.nodeName === "HTML" ? n.ownerDocument.body : n).insertBefore(e, t) : (t = n.nodeType === 9 ? n.body : n.nodeName === "HTML" ? n.ownerDocument.body : n, t.appendChild(e), n = n._reactRootContainer, n != null || t.onclick !== null || (t.onclick = Gt));
		else if (r !== 4 && (r === 27 && Zd(e.type) && (n = e.stateNode, t = null), e = e.child, e !== null)) for (Kc(e, t, n), e = e.sibling; e !== null;) Kc(e, t, n), e = e.sibling;
	}
	function qc(e, t, n) {
		var r = e.tag;
		if (r === 5 || r === 6) e = e.stateNode, t ? n.insertBefore(e, t) : n.appendChild(e);
		else if (r !== 4 && (r === 27 && Zd(e.type) && (n = e.stateNode), e = e.child, e !== null)) for (qc(e, t, n), e = e.sibling; e !== null;) qc(e, t, n), e = e.sibling;
	}
	function Jc(e) {
		var t = e.stateNode, n = e.memoizedProps;
		try {
			for (var r = e.type, i = t.attributes; i.length;) t.removeAttributeNode(i[0]);
			Pd(t, r, n), t[$e] = e, t[et] = n;
		} catch (t) {
			Uu(e, e.return, t);
		}
	}
	var Yc = !1, Xc = !1, Zc = !1, Qc = typeof WeakSet == "function" ? WeakSet : Set, $c = null;
	function el(e, t) {
		if (e = e.containerInfo, Rd = sp, e = yr(e), br(e)) {
			if ("selectionStart" in e) var n = {
				start: e.selectionStart,
				end: e.selectionEnd
			};
			else a: {
				n = (n = e.ownerDocument) && n.defaultView || window;
				var r = n.getSelection && n.getSelection();
				if (r && r.rangeCount !== 0) {
					n = r.anchorNode;
					var a = r.anchorOffset, o = r.focusNode;
					r = r.focusOffset;
					try {
						n.nodeType, o.nodeType;
					} catch {
						n = null;
						break a;
					}
					var s = 0, c = -1, l = -1, u = 0, d = 0, f = e, p = null;
					b: for (;;) {
						for (var m; f !== n || a !== 0 && f.nodeType !== 3 || (c = s + a), f !== o || r !== 0 && f.nodeType !== 3 || (l = s + r), f.nodeType === 3 && (s += f.nodeValue.length), (m = f.firstChild) !== null;) p = f, f = m;
						for (;;) {
							if (f === e) break b;
							if (p === n && ++u === a && (c = s), p === o && ++d === r && (l = s), (m = f.nextSibling) !== null) break;
							f = p, p = f.parentNode;
						}
						f = m;
					}
					n = c === -1 || l === -1 ? null : {
						start: c,
						end: l
					};
				} else n = null;
			}
			n ||= {
				start: 0,
				end: 0
			};
		} else n = null;
		for (zd = {
			focusedElem: e,
			selectionRange: n
		}, sp = !1, $c = t; $c !== null;) if (t = $c, e = t.child, t.subtreeFlags & 1028 && e !== null) e.return = t, $c = e;
		else for (; $c !== null;) {
			switch (t = $c, o = t.alternate, e = t.flags, t.tag) {
				case 0:
					if (e & 4 && (e = t.updateQueue, e = e === null ? null : e.events, e !== null)) for (n = 0; n < e.length; n++) a = e[n], a.ref.impl = a.nextImpl;
					break;
				case 11:
				case 15: break;
				case 1:
					if (e & 1024 && o !== null) {
						e = void 0, n = t, a = o.memoizedProps, o = o.memoizedState, r = n.stateNode;
						try {
							var h = Bs(n.type, a);
							e = r.getSnapshotBeforeUpdate(h, o), r.__reactInternalSnapshotBeforeUpdate = e;
						} catch (e) {
							Uu(n, n.return, e);
						}
					}
					break;
				case 3:
					if (e & 1024) {
						if (e = t.stateNode.containerInfo, n = e.nodeType, n === 9) ef(e);
						else if (n === 1) switch (e.nodeName) {
							case "HEAD":
							case "HTML":
							case "BODY":
								ef(e);
								break;
							default: e.textContent = "";
						}
					}
					break;
				case 5:
				case 26:
				case 27:
				case 6:
				case 4:
				case 17: break;
				default: if (e & 1024) throw Error(i(163));
			}
			if (e = t.sibling, e !== null) {
				e.return = t.return, $c = e;
				break;
			}
			$c = t.return;
		}
	}
	function tl(e, t, n) {
		var r = n.flags;
		switch (n.tag) {
			case 0:
			case 11:
			case 15:
				gl(e, n), r & 4 && Ic(5, n);
				break;
			case 1:
				if (gl(e, n), r & 4) {
					if (e = n.stateNode, t === null) try {
						e.componentDidMount();
					} catch (e) {
						Uu(n, n.return, e);
					}
					else {
						var i = Bs(n.type, t.memoizedProps);
						t = t.memoizedState;
						try {
							e.componentDidUpdate(i, t, e.__reactInternalSnapshotBeforeUpdate);
						} catch (e) {
							Uu(n, n.return, e);
						}
					}
				}
				r & 64 && Rc(n), r & 512 && Bc(n, n.return);
				break;
			case 3:
				if (gl(e, n), r & 64 && (e = n.updateQueue, e !== null)) {
					if (t = null, n.child !== null) switch (n.child.tag) {
						case 27:
						case 5:
							t = n.child.stateNode;
							break;
						case 1: t = n.child.stateNode;
					}
					try {
						Ua(e, t);
					} catch (e) {
						Uu(n, n.return, e);
					}
				}
				break;
			case 27: t === null && r & 4 && Jc(n);
			case 26:
			case 5:
				gl(e, n), t === null && r & 4 && Hc(n), r & 512 && Bc(n, n.return);
				break;
			case 12:
				gl(e, n);
				break;
			case 31:
				gl(e, n), r & 4 && sl(e, n);
				break;
			case 13:
				gl(e, n), r & 4 && cl(e, n), r & 64 && (e = n.memoizedState, e !== null && (e = e.dehydrated, e !== null && (n = qu.bind(null, n), sf(e, n))));
				break;
			case 22:
				if (r = n.memoizedState !== null || Yc, !r) {
					t = t !== null && t.memoizedState !== null || Xc, i = Yc;
					var a = Xc;
					Yc = r, (Xc = t) && !a ? vl(e, n, !!(n.subtreeFlags & 8772)) : gl(e, n), Yc = i, Xc = a;
				}
				break;
			case 30: break;
			default: gl(e, n);
		}
	}
	function nl(e) {
		var t = e.alternate;
		t !== null && (e.alternate = null, nl(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && st(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
	}
	var rl = null, il = !1;
	function al(e, t, n) {
		for (n = n.child; n !== null;) ol(e, t, n), n = n.sibling;
	}
	function ol(e, t, n) {
		if (Ee && typeof Ee.onCommitFiberUnmount == "function") try {
			Ee.onCommitFiberUnmount(Te, n);
		} catch {}
		switch (n.tag) {
			case 26:
				Xc || Vc(n, t), al(e, t, n), n.memoizedState ? n.memoizedState.count-- : n.stateNode && (n = n.stateNode, n.parentNode.removeChild(n));
				break;
			case 27:
				Xc || Vc(n, t);
				var r = rl, i = il;
				Zd(n.type) && (rl = n.stateNode, il = !1), al(e, t, n), pf(n.stateNode), rl = r, il = i;
				break;
			case 5: Xc || Vc(n, t);
			case 6:
				if (r = rl, i = il, rl = null, al(e, t, n), rl = r, il = i, rl !== null) {
					if (il) try {
						(rl.nodeType === 9 ? rl.body : rl.nodeName === "HTML" ? rl.ownerDocument.body : rl).removeChild(n.stateNode);
					} catch (e) {
						Uu(n, t, e);
					}
					else try {
						rl.removeChild(n.stateNode);
					} catch (e) {
						Uu(n, t, e);
					}
				}
				break;
			case 18:
				rl !== null && (il ? (e = rl, Qd(e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e, n.stateNode), Np(e)) : Qd(rl, n.stateNode));
				break;
			case 4:
				r = rl, i = il, rl = n.stateNode.containerInfo, il = !0, al(e, t, n), rl = r, il = i;
				break;
			case 0:
			case 11:
			case 14:
			case 15:
				Lc(2, n, t), Xc || Lc(4, n, t), al(e, t, n);
				break;
			case 1:
				Xc || (Vc(n, t), r = n.stateNode, typeof r.componentWillUnmount == "function" && zc(n, t, r)), al(e, t, n);
				break;
			case 21:
				al(e, t, n);
				break;
			case 22:
				Xc = (r = Xc) || n.memoizedState !== null, al(e, t, n), Xc = r;
				break;
			default: al(e, t, n);
		}
	}
	function sl(e, t) {
		if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
			e = e.dehydrated;
			try {
				Np(e);
			} catch (e) {
				Uu(t, t.return, e);
			}
		}
	}
	function cl(e, t) {
		if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null)))) try {
			Np(e);
		} catch (e) {
			Uu(t, t.return, e);
		}
	}
	function ll(e) {
		switch (e.tag) {
			case 31:
			case 13:
			case 19:
				var t = e.stateNode;
				return t === null && (t = e.stateNode = new Qc()), t;
			case 22: return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new Qc()), t;
			default: throw Error(i(435, e.tag));
		}
	}
	function ul(e, t) {
		var n = ll(e);
		t.forEach(function(t) {
			if (!n.has(t)) {
				n.add(t);
				var r = Ju.bind(null, e, t);
				t.then(r, r);
			}
		});
	}
	function dl(e, t) {
		var n = t.deletions;
		if (n !== null) for (var r = 0; r < n.length; r++) {
			var a = n[r], o = e, s = t, c = s;
			a: for (; c !== null;) {
				switch (c.tag) {
					case 27:
						if (Zd(c.type)) {
							rl = c.stateNode, il = !1;
							break a;
						}
						break;
					case 5:
						rl = c.stateNode, il = !1;
						break a;
					case 3:
					case 4:
						rl = c.stateNode.containerInfo, il = !0;
						break a;
				}
				c = c.return;
			}
			if (rl === null) throw Error(i(160));
			ol(o, s, a), rl = null, il = !1, o = a.alternate, o !== null && (o.return = null), a.return = null;
		}
		if (t.subtreeFlags & 13886) for (t = t.child; t !== null;) pl(t, e), t = t.sibling;
	}
	var fl = null;
	function pl(e, t) {
		var n = e.alternate, r = e.flags;
		switch (e.tag) {
			case 0:
			case 11:
			case 14:
			case 15:
				dl(t, e), ml(e), r & 4 && (Lc(3, e, e.return), Ic(3, e), Lc(5, e, e.return));
				break;
			case 1:
				dl(t, e), ml(e), r & 512 && (Xc || n === null || Vc(n, n.return)), r & 64 && Yc && (e = e.updateQueue, e !== null && (r = e.callbacks, r !== null && (n = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = n === null ? r : n.concat(r))));
				break;
			case 26:
				var a = fl;
				if (dl(t, e), ml(e), r & 512 && (Xc || n === null || Vc(n, n.return)), r & 4) {
					var o = n === null ? null : n.memoizedState;
					if (r = e.memoizedState, n === null) {
						if (r === null) {
							if (e.stateNode === null) {
								a: {
									r = e.type, n = e.memoizedProps, a = a.ownerDocument || a;
									b: switch (r) {
										case "title":
											o = a.getElementsByTagName("title")[0], (!o || o[ot] || o[$e] || o.namespaceURI === "http://www.w3.org/2000/svg" || o.hasAttribute("itemprop")) && (o = a.createElement(r), a.head.insertBefore(o, a.querySelector("head > title"))), Pd(o, r, n), o[$e] = e, ft(o), r = o;
											break a;
										case "link":
											var s = Vf("link", "href", a).get(r + (n.href || ""));
											if (s) {
												for (var c = 0; c < s.length; c++) if (o = s[c], o.getAttribute("href") === (n.href == null || n.href === "" ? null : n.href) && o.getAttribute("rel") === (n.rel == null ? null : n.rel) && o.getAttribute("title") === (n.title == null ? null : n.title) && o.getAttribute("crossorigin") === (n.crossOrigin == null ? null : n.crossOrigin)) {
													s.splice(c, 1);
													break b;
												}
											}
											o = a.createElement(r), Pd(o, r, n), a.head.appendChild(o);
											break;
										case "meta":
											if (s = Vf("meta", "content", a).get(r + (n.content || ""))) {
												for (c = 0; c < s.length; c++) if (o = s[c], o.getAttribute("content") === (n.content == null ? null : "" + n.content) && o.getAttribute("name") === (n.name == null ? null : n.name) && o.getAttribute("property") === (n.property == null ? null : n.property) && o.getAttribute("http-equiv") === (n.httpEquiv == null ? null : n.httpEquiv) && o.getAttribute("charset") === (n.charSet == null ? null : n.charSet)) {
													s.splice(c, 1);
													break b;
												}
											}
											o = a.createElement(r), Pd(o, r, n), a.head.appendChild(o);
											break;
										default: throw Error(i(468, r));
									}
									o[$e] = e, ft(o), r = o;
								}
								e.stateNode = r;
							} else Hf(a, e.type, e.stateNode);
						} else e.stateNode = If(a, r, e.memoizedProps);
					} else o === r ? r === null && e.stateNode !== null && Uc(e, e.memoizedProps, n.memoizedProps) : (o === null ? n.stateNode !== null && (n = n.stateNode, n.parentNode.removeChild(n)) : o.count--, r === null ? Hf(a, e.type, e.stateNode) : If(a, r, e.memoizedProps));
				}
				break;
			case 27:
				dl(t, e), ml(e), r & 512 && (Xc || n === null || Vc(n, n.return)), n !== null && r & 4 && Uc(e, e.memoizedProps, n.memoizedProps);
				break;
			case 5:
				if (dl(t, e), ml(e), r & 512 && (Xc || n === null || Vc(n, n.return)), e.flags & 32) {
					a = e.stateNode;
					try {
						Lt(a, "");
					} catch (t) {
						Uu(e, e.return, t);
					}
				}
				r & 4 && e.stateNode != null && (a = e.memoizedProps, Uc(e, a, n === null ? a : n.memoizedProps)), r & 1024 && (Zc = !0);
				break;
			case 6:
				if (dl(t, e), ml(e), r & 4) {
					if (e.stateNode === null) throw Error(i(162));
					r = e.memoizedProps, n = e.stateNode;
					try {
						n.nodeValue = r;
					} catch (t) {
						Uu(e, e.return, t);
					}
				}
				break;
			case 3:
				if (Bf = null, a = fl, fl = gf(t.containerInfo), dl(t, e), fl = a, ml(e), r & 4 && n !== null && n.memoizedState.isDehydrated) try {
					Np(t.containerInfo);
				} catch (t) {
					Uu(e, e.return, t);
				}
				Zc && (Zc = !1, hl(e));
				break;
			case 4:
				r = fl, fl = gf(e.stateNode.containerInfo), dl(t, e), ml(e), fl = r;
				break;
			case 12:
				dl(t, e), ml(e);
				break;
			case 31:
				dl(t, e), ml(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ul(e, r)));
				break;
			case 13:
				dl(t, e), ml(e), e.child.flags & 8192 && e.memoizedState !== null != (n !== null && n.memoizedState !== null) && (Zl = U()), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ul(e, r)));
				break;
			case 22:
				a = e.memoizedState !== null;
				var l = n !== null && n.memoizedState !== null, u = Yc, d = Xc;
				if (Yc = u || a, Xc = d || l, dl(t, e), Xc = d, Yc = u, ml(e), r & 8192) a: for (t = e.stateNode, t._visibility = a ? t._visibility & -2 : t._visibility | 1, a && (n === null || l || Yc || Xc || _l(e)), n = null, t = e;;) {
					if (t.tag === 5 || t.tag === 26) {
						if (n === null) {
							l = n = t;
							try {
								if (o = l.stateNode, a) s = o.style, typeof s.setProperty == "function" ? s.setProperty("display", "none", "important") : s.display = "none";
								else {
									c = l.stateNode;
									var f = l.memoizedProps.style, p = f != null && f.hasOwnProperty("display") ? f.display : null;
									c.style.display = p == null || typeof p == "boolean" ? "" : ("" + p).trim();
								}
							} catch (e) {
								Uu(l, l.return, e);
							}
						}
					} else if (t.tag === 6) {
						if (n === null) {
							l = t;
							try {
								l.stateNode.nodeValue = a ? "" : l.memoizedProps;
							} catch (e) {
								Uu(l, l.return, e);
							}
						}
					} else if (t.tag === 18) {
						if (n === null) {
							l = t;
							try {
								var m = l.stateNode;
								a ? $d(m, !0) : $d(l.stateNode, !1);
							} catch (e) {
								Uu(l, l.return, e);
							}
						}
					} else if ((t.tag !== 22 && t.tag !== 23 || t.memoizedState === null || t === e) && t.child !== null) {
						t.child.return = t, t = t.child;
						continue;
					}
					if (t === e) break a;
					for (; t.sibling === null;) {
						if (t.return === null || t.return === e) break a;
						n === t && (n = null), t = t.return;
					}
					n === t && (n = null), t.sibling.return = t.return, t = t.sibling;
				}
				r & 4 && (r = e.updateQueue, r !== null && (n = r.retryQueue, n !== null && (r.retryQueue = null, ul(e, n))));
				break;
			case 19:
				dl(t, e), ml(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ul(e, r)));
				break;
			case 30: break;
			case 21: break;
			default: dl(t, e), ml(e);
		}
	}
	function ml(e) {
		var t = e.flags;
		if (t & 2) {
			try {
				for (var n, r = e.return; r !== null;) {
					if (Wc(r)) {
						n = r;
						break;
					}
					r = r.return;
				}
				if (n == null) throw Error(i(160));
				switch (n.tag) {
					case 27:
						var a = n.stateNode;
						qc(e, Gc(e), a);
						break;
					case 5:
						var o = n.stateNode;
						n.flags & 32 && (Lt(o, ""), n.flags &= -33), qc(e, Gc(e), o);
						break;
					case 3:
					case 4:
						var s = n.stateNode.containerInfo;
						Kc(e, Gc(e), s);
						break;
					default: throw Error(i(161));
				}
			} catch (t) {
				Uu(e, e.return, t);
			}
			e.flags &= -3;
		}
		t & 4096 && (e.flags &= -4097);
	}
	function hl(e) {
		if (e.subtreeFlags & 1024) for (e = e.child; e !== null;) {
			var t = e;
			hl(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), e = e.sibling;
		}
	}
	function gl(e, t) {
		if (t.subtreeFlags & 8772) for (t = t.child; t !== null;) tl(e, t.alternate, t), t = t.sibling;
	}
	function _l(e) {
		for (e = e.child; e !== null;) {
			var t = e;
			switch (t.tag) {
				case 0:
				case 11:
				case 14:
				case 15:
					Lc(4, t, t.return), _l(t);
					break;
				case 1:
					Vc(t, t.return);
					var n = t.stateNode;
					typeof n.componentWillUnmount == "function" && zc(t, t.return, n), _l(t);
					break;
				case 27: pf(t.stateNode);
				case 26:
				case 5:
					Vc(t, t.return), _l(t);
					break;
				case 22:
					t.memoizedState === null && _l(t);
					break;
				case 30:
					_l(t);
					break;
				default: _l(t);
			}
			e = e.sibling;
		}
	}
	function vl(e, t, n) {
		for (n &&= !!(t.subtreeFlags & 8772), t = t.child; t !== null;) {
			var r = t.alternate, i = e, a = t, o = a.flags;
			switch (a.tag) {
				case 0:
				case 11:
				case 15:
					vl(i, a, n), Ic(4, a);
					break;
				case 1:
					if (vl(i, a, n), r = a, i = r.stateNode, typeof i.componentDidMount == "function") try {
						i.componentDidMount();
					} catch (e) {
						Uu(r, r.return, e);
					}
					if (r = a, i = r.updateQueue, i !== null) {
						var s = r.stateNode;
						try {
							var c = i.shared.hiddenCallbacks;
							if (c !== null) for (i.shared.hiddenCallbacks = null, i = 0; i < c.length; i++) Ha(c[i], s);
						} catch (e) {
							Uu(r, r.return, e);
						}
					}
					n && o & 64 && Rc(a), Bc(a, a.return);
					break;
				case 27: Jc(a);
				case 26:
				case 5:
					vl(i, a, n), n && r === null && o & 4 && Hc(a), Bc(a, a.return);
					break;
				case 12:
					vl(i, a, n);
					break;
				case 31:
					vl(i, a, n), n && o & 4 && sl(i, a);
					break;
				case 13:
					vl(i, a, n), n && o & 4 && cl(i, a);
					break;
				case 22:
					a.memoizedState === null && vl(i, a, n), Bc(a, a.return);
					break;
				case 30: break;
				default: vl(i, a, n);
			}
			t = t.sibling;
		}
	}
	function yl(e, t) {
		var n = null;
		e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== n && (e != null && e.refCount++, n != null && ta(n));
	}
	function bl(e, t) {
		e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && ta(e));
	}
	function xl(e, t, n, r) {
		if (t.subtreeFlags & 10256) for (t = t.child; t !== null;) Sl(e, t, n, r), t = t.sibling;
	}
	function Sl(e, t, n, r) {
		var i = t.flags;
		switch (t.tag) {
			case 0:
			case 11:
			case 15:
				xl(e, t, n, r), i & 2048 && Ic(9, t);
				break;
			case 1:
				xl(e, t, n, r);
				break;
			case 3:
				xl(e, t, n, r), i & 2048 && (e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && ta(e)));
				break;
			case 12:
				if (i & 2048) {
					xl(e, t, n, r), e = t.stateNode;
					try {
						var a = t.memoizedProps, o = a.id, s = a.onPostCommit;
						typeof s == "function" && s(o, t.alternate === null ? "mount" : "update", e.passiveEffectDuration, -0);
					} catch (e) {
						Uu(t, t.return, e);
					}
				} else xl(e, t, n, r);
				break;
			case 31:
				xl(e, t, n, r);
				break;
			case 13:
				xl(e, t, n, r);
				break;
			case 23: break;
			case 22:
				a = t.stateNode, o = t.alternate, t.memoizedState === null ? a._visibility & 2 ? xl(e, t, n, r) : (a._visibility |= 2, Cl(e, t, n, r, !!(t.subtreeFlags & 10256) || !1)) : a._visibility & 2 ? xl(e, t, n, r) : wl(e, t), i & 2048 && yl(o, t);
				break;
			case 24:
				xl(e, t, n, r), i & 2048 && bl(t.alternate, t);
				break;
			default: xl(e, t, n, r);
		}
	}
	function Cl(e, t, n, r, i) {
		for (i &&= !!(t.subtreeFlags & 10256) || !1, t = t.child; t !== null;) {
			var a = e, o = t, s = n, c = r, l = o.flags;
			switch (o.tag) {
				case 0:
				case 11:
				case 15:
					Cl(a, o, s, c, i), Ic(8, o);
					break;
				case 23: break;
				case 22:
					var u = o.stateNode;
					o.memoizedState === null ? (u._visibility |= 2, Cl(a, o, s, c, i)) : u._visibility & 2 ? Cl(a, o, s, c, i) : wl(a, o), i && l & 2048 && yl(o.alternate, o);
					break;
				case 24:
					Cl(a, o, s, c, i), i && l & 2048 && bl(o.alternate, o);
					break;
				default: Cl(a, o, s, c, i);
			}
			t = t.sibling;
		}
	}
	function wl(e, t) {
		if (t.subtreeFlags & 10256) for (t = t.child; t !== null;) {
			var n = e, r = t, i = r.flags;
			switch (r.tag) {
				case 22:
					wl(n, r), i & 2048 && yl(r.alternate, r);
					break;
				case 24:
					wl(n, r), i & 2048 && bl(r.alternate, r);
					break;
				default: wl(n, r);
			}
			t = t.sibling;
		}
	}
	var Tl = 8192;
	function El(e, t, n) {
		if (e.subtreeFlags & Tl) for (e = e.child; e !== null;) Dl(e, t, n), e = e.sibling;
	}
	function Dl(e, t, n) {
		switch (e.tag) {
			case 26:
				El(e, t, n), e.flags & Tl && e.memoizedState !== null && Gf(n, fl, e.memoizedState, e.memoizedProps);
				break;
			case 5:
				El(e, t, n);
				break;
			case 3:
			case 4:
				var r = fl;
				fl = gf(e.stateNode.containerInfo), El(e, t, n), fl = r;
				break;
			case 22:
				e.memoizedState === null && (r = e.alternate, r !== null && r.memoizedState !== null ? (r = Tl, Tl = 16777216, El(e, t, n), Tl = r) : El(e, t, n));
				break;
			default: El(e, t, n);
		}
	}
	function Ol(e) {
		var t = e.alternate;
		if (t !== null && (e = t.child, e !== null)) {
			t.child = null;
			do
				t = e.sibling, e.sibling = null, e = t;
			while (e !== null);
		}
	}
	function kl(e) {
		var t = e.deletions;
		if (e.flags & 16) {
			if (t !== null) for (var n = 0; n < t.length; n++) {
				var r = t[n];
				$c = r, Ml(r, e);
			}
			Ol(e);
		}
		if (e.subtreeFlags & 10256) for (e = e.child; e !== null;) Al(e), e = e.sibling;
	}
	function Al(e) {
		switch (e.tag) {
			case 0:
			case 11:
			case 15:
				kl(e), e.flags & 2048 && Lc(9, e, e.return);
				break;
			case 3:
				kl(e);
				break;
			case 12:
				kl(e);
				break;
			case 22:
				var t = e.stateNode;
				e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, jl(e)) : kl(e);
				break;
			default: kl(e);
		}
	}
	function jl(e) {
		var t = e.deletions;
		if (e.flags & 16) {
			if (t !== null) for (var n = 0; n < t.length; n++) {
				var r = t[n];
				$c = r, Ml(r, e);
			}
			Ol(e);
		}
		for (e = e.child; e !== null;) {
			switch (t = e, t.tag) {
				case 0:
				case 11:
				case 15:
					Lc(8, t, t.return), jl(t);
					break;
				case 22:
					n = t.stateNode, n._visibility & 2 && (n._visibility &= -3, jl(t));
					break;
				default: jl(t);
			}
			e = e.sibling;
		}
	}
	function Ml(e, t) {
		for (; $c !== null;) {
			var n = $c;
			switch (n.tag) {
				case 0:
				case 11:
				case 15:
					Lc(8, n, t);
					break;
				case 23:
				case 22:
					if (n.memoizedState !== null && n.memoizedState.cachePool !== null) {
						var r = n.memoizedState.cachePool.pool;
						r != null && r.refCount++;
					}
					break;
				case 24: ta(n.memoizedState.cache);
			}
			if (r = n.child, r !== null) r.return = n, $c = r;
			else a: for (n = e; $c !== null;) {
				r = $c;
				var i = r.sibling, a = r.return;
				if (nl(r), r === n) {
					$c = null;
					break a;
				}
				if (i !== null) {
					i.return = a, $c = i;
					break a;
				}
				$c = a;
			}
		}
	}
	var Nl = {
		getCacheForType: function(e) {
			var t = qi($i), n = t.data.get(e);
			return n === void 0 && (n = e(), t.data.set(e, n)), n;
		},
		cacheSignal: function() {
			return qi($i).controller.signal;
		}
	}, Pl = typeof WeakMap == "function" ? WeakMap : Map, X = 0, Fl = null, Z = null, Q = 0, Il = 0, Ll = null, Rl = !1, zl = !1, Bl = !1, Vl = 0, Hl = 0, Ul = 0, Wl = 0, Gl = 0, Kl = 0, ql = 0, Jl = null, Yl = null, Xl = !1, Zl = 0, Ql = 0, $l = Infinity, eu = null, tu = null, nu = 0, ru = null, iu = null, au = 0, ou = 0, su = null, cu = null, lu = 0, uu = null;
	function du() {
		return X & 2 && Q !== 0 ? Q & -Q : N.T === null ? G() : ud();
	}
	function fu() {
		if (Kl === 0) {
			if (!(Q & 536870912) || q) {
				var e = Ne;
				Ne <<= 1, !(Ne & 3932160) && (Ne = 262144), Kl = e;
			} else Kl = 536870912;
		}
		return e = Ya.current, e !== null && (e.flags |= 32), Kl;
	}
	function pu(e, t, n) {
		(e === Fl && (Il === 2 || Il === 9) || e.cancelPendingCommit !== null) && (bu(e, 0), _u(e, Q, Kl, !1)), Ve(e, n), (!(X & 2) || e !== Fl) && (e === Fl && (!(X & 2) && (Wl |= n), Hl === 4 && _u(e, Q, Kl, !1)), nd(e));
	}
	function mu(e, t, n) {
		if (X & 6) throw Error(i(327));
		var r = !n && !(t & 127) && (t & e.expiredLanes) === 0 || Le(e, t), a = r ? Ou(e, t) : Eu(e, t, !0), o = r;
		do {
			if (a === 0) {
				zl && !r && _u(e, t, 0, !1);
				break;
			}
			if (n = e.current.alternate, o && !gu(n)) {
				a = Eu(e, t, !1), o = !1;
				continue;
			}
			if (a === 2) {
				if (o = t, e.errorRecoveryDisabledLanes & o) var s = 0;
				else s = e.pendingLanes & -536870913, s = s === 0 ? s & 536870912 ? 536870912 : 0 : s;
				if (s !== 0) {
					t = s;
					a: {
						var c = e;
						a = Jl;
						var l = c.current.memoizedState.isDehydrated;
						if (l && (bu(c, s).flags |= 256), s = Eu(c, s, !1), s !== 2) {
							if (Bl && !l) {
								c.errorRecoveryDisabledLanes |= o, Wl |= o, a = 4;
								break a;
							}
							o = Yl, Yl = a, o !== null && (Yl === null ? Yl = o : Yl.push.apply(Yl, o));
						}
						a = s;
					}
					if (o = !1, a !== 2) continue;
				}
			}
			if (a === 1) {
				bu(e, 0), _u(e, t, 0, !0);
				break;
			}
			a: {
				switch (r = e, o = a, o) {
					case 0:
					case 1: throw Error(i(345));
					case 4: if ((t & 4194048) !== t) break;
					case 6:
						_u(r, t, Kl, !Rl);
						break a;
					case 2:
						Yl = null;
						break;
					case 3:
					case 5: break;
					default: throw Error(i(329));
				}
				if ((t & 62914560) === t && (a = Zl + 300 - U(), 10 < a)) {
					if (_u(r, t, Kl, !Rl), Ie(r, 0, !0) !== 0) break a;
					au = t, r.timeoutHandle = Kd(hu.bind(null, r, n, Yl, eu, Xl, t, Kl, Wl, ql, Rl, o, "Throttled", -0, 0), a);
					break a;
				}
				hu(r, n, Yl, eu, Xl, t, Kl, Wl, ql, Rl, o, null, -0, 0);
			}
			break;
		} while (1);
		nd(e);
	}
	function hu(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
		if (e.timeoutHandle = -1, d = t.subtreeFlags, d & 8192 || (d & 16785408) == 16785408) {
			d = {
				stylesheets: null,
				count: 0,
				imgCount: 0,
				imgBytes: 0,
				suspenseyImages: [],
				waitingForImages: !0,
				waitingForViewTransition: !1,
				unsuspend: Gt
			}, Dl(t, a, d);
			var m = (a & 62914560) === a ? Zl - U() : (a & 4194048) === a ? Ql - U() : 0;
			if (m = qf(d, m), m !== null) {
				au = a, e.cancelPendingCommit = m(Fu.bind(null, e, t, a, n, r, i, o, s, c, u, d, null, f, p)), _u(e, a, o, !l);
				return;
			}
		}
		Fu(e, t, a, n, r, i, o, s, c);
	}
	function gu(e) {
		for (var t = e;;) {
			var n = t.tag;
			if ((n === 0 || n === 11 || n === 15) && t.flags & 16384 && (n = t.updateQueue, n !== null && (n = n.stores, n !== null))) for (var r = 0; r < n.length; r++) {
				var i = n[r], a = i.getSnapshot;
				i = i.value;
				try {
					if (!mr(a(), i)) return !1;
				} catch {
					return !1;
				}
			}
			if (n = t.child, t.subtreeFlags & 16384 && n !== null) n.return = t, t = n;
			else {
				if (t === e) break;
				for (; t.sibling === null;) {
					if (t.return === null || t.return === e) return !0;
					t = t.return;
				}
				t.sibling.return = t.return, t = t.sibling;
			}
		}
		return !0;
	}
	function _u(e, t, n, r) {
		t &= ~Gl, t &= ~Wl, e.suspendedLanes |= t, e.pingedLanes &= ~t, r && (e.warmLanes |= t), r = e.expirationTimes;
		for (var i = t; 0 < i;) {
			var a = 31 - Oe(i), o = 1 << a;
			r[a] = -1, i &= ~o;
		}
		n !== 0 && Ue(e, n, t);
	}
	function vu() {
		return X & 6 ? !0 : (rd(0, !1), !1);
	}
	function yu() {
		if (Z !== null) {
			if (Il === 0) var e = Z.return;
			else e = Z, zi = Ri = null, Co(e), wa = null, Ta = 0, e = Z;
			for (; e !== null;) Fc(e.alternate, e), e = e.return;
			Z = null;
		}
	}
	function bu(e, t) {
		var n = e.timeoutHandle;
		n !== -1 && (e.timeoutHandle = -1, qd(n)), n = e.cancelPendingCommit, n !== null && (e.cancelPendingCommit = null, n()), au = 0, yu(), Fl = e, Z = n = ni(e.current, null), Q = t, Il = 0, Ll = null, Rl = !1, zl = Le(e, t), Bl = !1, ql = Kl = Gl = Wl = Ul = Hl = 0, Yl = Jl = null, Xl = !1, t & 8 && (t |= t & 32);
		var r = e.entangledLanes;
		if (r !== 0) for (e = e.entanglements, r &= t; 0 < r;) {
			var i = 31 - Oe(r), a = 1 << i;
			t |= e[i], r &= ~a;
		}
		return Vl = t, Kr(), n;
	}
	function xu(e, t) {
		J = null, N.H = Ms, t === ma || t === ga ? (t = Sa(), Il = 3) : t === ha ? (t = Sa(), Il = 4) : Il = t === Xs ? 8 : typeof t == "object" && t && typeof t.then == "function" ? 6 : 1, Ll = t, Z === null && (Hl = 1, Ws(e, ui(t, e.current)));
	}
	function Su() {
		var e = Ya.current;
		return e === null ? !0 : (Q & 4194048) === Q ? Xa === null : (Q & 62914560) === Q || Q & 536870912 ? e === Xa : !1;
	}
	function Cu() {
		var e = N.H;
		return N.H = Ms, e === null ? Ms : e;
	}
	function wu() {
		var e = N.A;
		return N.A = Nl, e;
	}
	function Tu() {
		Hl = 4, Rl || (Q & 4194048) !== Q && Ya.current !== null || (zl = !0), !(Ul & 134217727) && !(Wl & 134217727) || Fl === null || _u(Fl, Q, Kl, !1);
	}
	function Eu(e, t, n) {
		var r = X;
		X |= 2;
		var i = Cu(), a = wu();
		(Fl !== e || Q !== t) && (eu = null, bu(e, t)), t = !1;
		var o = Hl;
		a: do
			try {
				if (Il !== 0 && Z !== null) {
					var s = Z, c = Ll;
					switch (Il) {
						case 8:
							yu(), o = 6;
							break a;
						case 3:
						case 2:
						case 9:
						case 6:
							Ya.current === null && (t = !0);
							var l = Il;
							if (Il = 0, Ll = null, Mu(e, s, c, l), n && zl) {
								o = 0;
								break a;
							}
							break;
						default: l = Il, Il = 0, Ll = null, Mu(e, s, c, l);
					}
				}
				Du(), o = Hl;
				break;
			} catch (t) {
				xu(e, t);
			}
		while (1);
		return t && e.shellSuspendCounter++, zi = Ri = null, X = r, N.H = i, N.A = a, Z === null && (Fl = null, Q = 0, Kr()), o;
	}
	function Du() {
		for (; Z !== null;) Au(Z);
	}
	function Ou(e, t) {
		var n = X;
		X |= 2;
		var r = Cu(), a = wu();
		Fl !== e || Q !== t ? (eu = null, $l = U() + 500, bu(e, t)) : zl = Le(e, t);
		a: do
			try {
				if (Il !== 0 && Z !== null) {
					t = Z;
					var o = Ll;
					b: switch (Il) {
						case 1:
							Il = 0, Ll = null, Mu(e, t, o, 1);
							break;
						case 2:
						case 9:
							if (va(o)) {
								Il = 0, Ll = null, ju(t);
								break;
							}
							t = function() {
								Il !== 2 && Il !== 9 || Fl !== e || (Il = 7), nd(e);
							}, o.then(t, t);
							break a;
						case 3:
							Il = 7;
							break a;
						case 4:
							Il = 5;
							break a;
						case 7:
							va(o) ? (Il = 0, Ll = null, ju(t)) : (Il = 0, Ll = null, Mu(e, t, o, 7));
							break;
						case 5:
							var s = null;
							switch (Z.tag) {
								case 26: s = Z.memoizedState;
								case 5:
								case 27:
									var c = Z;
									if (s ? Wf(s) : c.stateNode.complete) {
										Il = 0, Ll = null;
										var l = c.sibling;
										if (l !== null) Z = l;
										else {
											var u = c.return;
											u === null ? Z = null : (Z = u, Nu(u));
										}
										break b;
									}
							}
							Il = 0, Ll = null, Mu(e, t, o, 5);
							break;
						case 6:
							Il = 0, Ll = null, Mu(e, t, o, 6);
							break;
						case 8:
							yu(), Hl = 6;
							break a;
						default: throw Error(i(462));
					}
				}
				ku();
				break;
			} catch (t) {
				xu(e, t);
			}
		while (1);
		return zi = Ri = null, N.H = r, N.A = a, X = n, Z === null ? (Fl = null, Q = 0, Kr(), Hl) : 0;
	}
	function ku() {
		for (; Z !== null && !ge();) Au(Z);
	}
	function Au(e) {
		var t = Ec(e.alternate, e, Vl);
		e.memoizedProps = e.pendingProps, t === null ? Nu(e) : Z = t;
	}
	function ju(e) {
		var t = e, n = t.alternate;
		switch (t.tag) {
			case 15:
			case 0:
				t = uc(n, t, t.pendingProps, t.type, void 0, Q);
				break;
			case 11:
				t = uc(n, t, t.pendingProps, t.type.render, t.ref, Q);
				break;
			case 5: Co(t);
			default: Fc(n, t), t = Z = ri(t, Vl), t = Ec(n, t, Vl);
		}
		e.memoizedProps = e.pendingProps, t === null ? Nu(e) : Z = t;
	}
	function Mu(e, t, n, r) {
		zi = Ri = null, Co(t), wa = null, Ta = 0;
		var i = t.return;
		try {
			if (Ys(e, i, t, n, Q)) {
				Hl = 1, Ws(e, ui(n, e.current)), Z = null;
				return;
			}
		} catch (t) {
			if (i !== null) throw Z = i, t;
			Hl = 1, Ws(e, ui(n, e.current)), Z = null;
			return;
		}
		t.flags & 32768 ? (q || r === 1 ? e = !0 : zl || Q & 536870912 ? e = !1 : (Rl = e = !0, (r === 2 || r === 9 || r === 3 || r === 6) && (r = Ya.current, r !== null && r.tag === 13 && (r.flags |= 16384))), Pu(t, e)) : Nu(t);
	}
	function Nu(e) {
		var t = e;
		do {
			if (t.flags & 32768) {
				Pu(t, Rl);
				return;
			}
			e = t.return;
			var n = Nc(t.alternate, t, Vl);
			if (n !== null) {
				Z = n;
				return;
			}
			if (t = t.sibling, t !== null) {
				Z = t;
				return;
			}
			Z = t = e;
		} while (t !== null);
		Hl === 0 && (Hl = 5);
	}
	function Pu(e, t) {
		do {
			var n = Pc(e.alternate, e);
			if (n !== null) {
				n.flags &= 32767, Z = n;
				return;
			}
			if (n = e.return, n !== null && (n.flags |= 32768, n.subtreeFlags = 0, n.deletions = null), !t && (e = e.sibling, e !== null)) {
				Z = e;
				return;
			}
			Z = e = n;
		} while (e !== null);
		Hl = 6, Z = null;
	}
	function Fu(e, t, n, r, a, o, s, c, l) {
		e.cancelPendingCommit = null;
		do
			Bu();
		while (nu !== 0);
		if (X & 6) throw Error(i(327));
		if (t !== null) {
			if (t === e.current) throw Error(i(177));
			if (o = t.lanes | t.childLanes, o |= Gr, He(e, n, o, s, c, l), e === Fl && (Z = Fl = null, Q = 0), iu = t, ru = e, au = n, ou = o, su = a, cu = r, t.subtreeFlags & 10256 || t.flags & 10256 ? (e.callbackNode = null, e.callbackPriority = 0, Yu(be, function() {
				return Vu(), null;
			})) : (e.callbackNode = null, e.callbackPriority = 0), r = !!(t.flags & 13878), t.subtreeFlags & 13878 || r) {
				r = N.T, N.T = null, a = P.p, P.p = 2, s = X, X |= 4;
				try {
					el(e, t, n);
				} finally {
					X = s, P.p = a, N.T = r;
				}
			}
			nu = 1, Iu(), Lu(), Ru();
		}
	}
	function Iu() {
		if (nu === 1) {
			nu = 0;
			var e = ru, t = iu, n = !!(t.flags & 13878);
			if (t.subtreeFlags & 13878 || n) {
				n = N.T, N.T = null;
				var r = P.p;
				P.p = 2;
				var i = X;
				X |= 4;
				try {
					pl(t, e);
					var a = zd, o = yr(e.containerInfo), s = a.focusedElem, c = a.selectionRange;
					if (o !== s && s && s.ownerDocument && vr(s.ownerDocument.documentElement, s)) {
						if (c !== null && br(s)) {
							var l = c.start, u = c.end;
							if (u === void 0 && (u = l), "selectionStart" in s) s.selectionStart = l, s.selectionEnd = Math.min(u, s.value.length);
							else {
								var d = s.ownerDocument || document, f = d && d.defaultView || window;
								if (f.getSelection) {
									var p = f.getSelection(), m = s.textContent.length, h = Math.min(c.start, m), g = c.end === void 0 ? h : Math.min(c.end, m);
									!p.extend && h > g && (o = g, g = h, h = o);
									var _ = _r(s, h), v = _r(s, g);
									if (_ && v && (p.rangeCount !== 1 || p.anchorNode !== _.node || p.anchorOffset !== _.offset || p.focusNode !== v.node || p.focusOffset !== v.offset)) {
										var y = d.createRange();
										y.setStart(_.node, _.offset), p.removeAllRanges(), h > g ? (p.addRange(y), p.extend(v.node, v.offset)) : (y.setEnd(v.node, v.offset), p.addRange(y));
									}
								}
							}
						}
						for (d = [], p = s; p = p.parentNode;) p.nodeType === 1 && d.push({
							element: p,
							left: p.scrollLeft,
							top: p.scrollTop
						});
						for (typeof s.focus == "function" && s.focus(), s = 0; s < d.length; s++) {
							var b = d[s];
							b.element.scrollLeft = b.left, b.element.scrollTop = b.top;
						}
					}
					sp = !!Rd, zd = Rd = null;
				} finally {
					X = i, P.p = r, N.T = n;
				}
			}
			e.current = t, nu = 2;
		}
	}
	function Lu() {
		if (nu === 2) {
			nu = 0;
			var e = ru, t = iu, n = !!(t.flags & 8772);
			if (t.subtreeFlags & 8772 || n) {
				n = N.T, N.T = null;
				var r = P.p;
				P.p = 2;
				var i = X;
				X |= 4;
				try {
					tl(e, t.alternate, t);
				} finally {
					X = i, P.p = r, N.T = n;
				}
			}
			nu = 3;
		}
	}
	function Ru() {
		if (nu === 4 || nu === 3) {
			nu = 0, _e();
			var e = ru, t = iu, n = au, r = cu;
			t.subtreeFlags & 10256 || t.flags & 10256 ? nu = 5 : (nu = 0, iu = ru = null, zu(e, e.pendingLanes));
			var i = e.pendingLanes;
			if (i === 0 && (tu = null), Xe(n), t = t.stateNode, Ee && typeof Ee.onCommitFiberRoot == "function") try {
				Ee.onCommitFiberRoot(Te, t, void 0, (t.current.flags & 128) == 128);
			} catch {}
			if (r !== null) {
				t = N.T, i = P.p, P.p = 2, N.T = null;
				try {
					for (var a = e.onRecoverableError, o = 0; o < r.length; o++) {
						var s = r[o];
						a(s.value, { componentStack: s.stack });
					}
				} finally {
					N.T = t, P.p = i;
				}
			}
			au & 3 && Bu(), nd(e), i = e.pendingLanes, n & 261930 && i & 42 ? e === uu ? lu++ : (lu = 0, uu = e) : lu = 0, rd(0, !1);
		}
	}
	function zu(e, t) {
		(e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, ta(t)));
	}
	function Bu() {
		return Iu(), Lu(), Ru(), Vu();
	}
	function Vu() {
		if (nu !== 5) return !1;
		var e = ru, t = ou;
		ou = 0;
		var n = Xe(au), r = N.T, a = P.p;
		try {
			P.p = 32 > n ? 32 : n, N.T = null, n = su, su = null;
			var o = ru, s = au;
			if (nu = 0, iu = ru = null, au = 0, X & 6) throw Error(i(331));
			var c = X;
			if (X |= 4, Al(o.current), Sl(o, o.current, s, n), X = c, rd(0, !1), Ee && typeof Ee.onPostCommitFiberRoot == "function") try {
				Ee.onPostCommitFiberRoot(Te, o);
			} catch {}
			return !0;
		} finally {
			P.p = a, N.T = r, zu(e, t);
		}
	}
	function Hu(e, t, n) {
		t = ui(n, t), t = Ks(e.stateNode, t, 2), e = Ia(e, t, 2), e !== null && (Ve(e, 2), nd(e));
	}
	function Uu(e, t, n) {
		if (e.tag === 3) Hu(e, e, n);
		else for (; t !== null;) {
			if (t.tag === 3) {
				Hu(t, e, n);
				break;
			}
			if (t.tag === 1) {
				var r = t.stateNode;
				if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (tu === null || !tu.has(r))) {
					e = ui(n, e), n = qs(2), r = Ia(t, n, 2), r !== null && (Js(n, r, t, e), Ve(r, 2), nd(r));
					break;
				}
			}
			t = t.return;
		}
	}
	function Wu(e, t, n) {
		var r = e.pingCache;
		if (r === null) {
			r = e.pingCache = new Pl();
			var i = /* @__PURE__ */ new Set();
			r.set(t, i);
		} else i = r.get(t), i === void 0 && (i = /* @__PURE__ */ new Set(), r.set(t, i));
		i.has(n) || (Bl = !0, i.add(n), e = Gu.bind(null, e, t, n), t.then(e, e));
	}
	function Gu(e, t, n) {
		var r = e.pingCache;
		r !== null && r.delete(t), e.pingedLanes |= e.suspendedLanes & n, e.warmLanes &= ~n, Fl === e && (Q & n) === n && (Hl === 4 || Hl === 3 && (Q & 62914560) === Q && 300 > U() - Zl ? !(X & 2) && bu(e, 0) : Gl |= n, ql === Q && (ql = 0)), nd(e);
	}
	function Ku(e, t) {
		t === 0 && (t = ze()), e = Yr(e, t), e !== null && (Ve(e, t), nd(e));
	}
	function qu(e) {
		var t = e.memoizedState, n = 0;
		t !== null && (n = t.retryLane), Ku(e, n);
	}
	function Ju(e, t) {
		var n = 0;
		switch (e.tag) {
			case 31:
			case 13:
				var r = e.stateNode, a = e.memoizedState;
				a !== null && (n = a.retryLane);
				break;
			case 19:
				r = e.stateNode;
				break;
			case 22:
				r = e.stateNode._retryCache;
				break;
			default: throw Error(i(314));
		}
		r !== null && r.delete(t), Ku(e, n);
	}
	function Yu(e, t) {
		return me(e, t);
	}
	var Xu = null, Zu = null, Qu = !1, $u = !1, ed = !1, td = 0;
	function nd(e) {
		e !== Zu && e.next === null && (Zu === null ? Xu = Zu = e : Zu = Zu.next = e), $u = !0, Qu || (Qu = !0, ld());
	}
	function rd(e, t) {
		if (!ed && $u) {
			ed = !0;
			do
				for (var n = !1, r = Xu; r !== null;) {
					if (!t) {
						if (e !== 0) {
							var i = r.pendingLanes;
							if (i === 0) var a = 0;
							else {
								var o = r.suspendedLanes, s = r.pingedLanes;
								a = (1 << 31 - Oe(42 | e) + 1) - 1, a &= i & ~(o & ~s), a = a & 201326741 ? a & 201326741 | 1 : a ? a | 2 : 0;
							}
							a !== 0 && (n = !0, cd(r, a));
						} else a = Q, a = Ie(r, r === Fl ? a : 0, r.cancelPendingCommit !== null || r.timeoutHandle !== -1), !(a & 3) || Le(r, a) || (n = !0, cd(r, a));
					}
					r = r.next;
				}
			while (n);
			ed = !1;
		}
	}
	function id() {
		ad();
	}
	function ad() {
		$u = Qu = !1;
		var e = 0;
		td !== 0 && Gd() && (e = td);
		for (var t = U(), n = null, r = Xu; r !== null;) {
			var i = r.next, a = od(r, t);
			a === 0 ? (r.next = null, n === null ? Xu = i : n.next = i, i === null && (Zu = n)) : (n = r, (e !== 0 || a & 3) && ($u = !0)), r = i;
		}
		nu !== 0 && nu !== 5 || rd(e, !1), td !== 0 && (td = 0);
	}
	function od(e, t) {
		for (var n = e.suspendedLanes, r = e.pingedLanes, i = e.expirationTimes, a = e.pendingLanes & -62914561; 0 < a;) {
			var o = 31 - Oe(a), s = 1 << o, c = i[o];
			c === -1 ? ((s & n) === 0 || (s & r) !== 0) && (i[o] = Re(s, t)) : c <= t && (e.expiredLanes |= s), a &= ~s;
		}
		if (t = Fl, n = Q, n = Ie(e, e === t ? n : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), r = e.callbackNode, n === 0 || e === t && (Il === 2 || Il === 9) || e.cancelPendingCommit !== null) return r !== null && r !== null && he(r), e.callbackNode = null, e.callbackPriority = 0;
		if (!(n & 3) || Le(e, n)) {
			if (t = n & -n, t === e.callbackPriority) return t;
			switch (r !== null && he(r), Xe(n)) {
				case 2:
				case 8:
					n = W;
					break;
				case 32:
					n = be;
					break;
				case 268435456:
					n = Se;
					break;
				default: n = be;
			}
			return r = sd.bind(null, e), n = me(n, r), e.callbackPriority = t, e.callbackNode = n, t;
		}
		return r !== null && r !== null && he(r), e.callbackPriority = 2, e.callbackNode = null, 2;
	}
	function sd(e, t) {
		if (nu !== 0 && nu !== 5) return e.callbackNode = null, e.callbackPriority = 0, null;
		var n = e.callbackNode;
		if (Bu() && e.callbackNode !== n) return null;
		var r = Q;
		return r = Ie(e, e === Fl ? r : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), r === 0 ? null : (mu(e, r, t), od(e, U()), e.callbackNode != null && e.callbackNode === n ? sd.bind(null, e) : null);
	}
	function cd(e, t) {
		if (Bu()) return null;
		mu(e, t, !0);
	}
	function ld() {
		Yd(function() {
			X & 6 ? me(ye, id) : ad();
		});
	}
	function ud() {
		if (td === 0) {
			var e = ia;
			e === 0 && (e = Me, Me <<= 1, !(Me & 261888) && (Me = 256)), td = e;
		}
		return td;
	}
	function dd(e) {
		return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : Wt("" + e);
	}
	function fd(e, t) {
		var n = t.ownerDocument.createElement("input");
		return n.name = t.name, n.value = t.value, e.id && n.setAttribute("form", e.id), t.parentNode.insertBefore(n, t), e = new FormData(e), n.parentNode.removeChild(n), e;
	}
	function pd(e, t, n, r, i) {
		if (t === "submit" && n && n.stateNode === i) {
			var a = dd((i[et] || null).action), o = r.submitter;
			o && (t = (t = o[et] || null) ? dd(t.formAction) : o.getAttribute("formAction"), t !== null && (a = t, o = null));
			var s = new pn("action", "action", null, r, i);
			e.push({
				event: s,
				listeners: [{
					instance: null,
					listener: function() {
						if (r.defaultPrevented) {
							if (td !== 0) {
								var e = o ? fd(i, o) : new FormData(i);
								vs(n, {
									pending: !0,
									data: e,
									method: i.method,
									action: a
								}, null, e);
							}
						} else typeof a == "function" && (s.preventDefault(), e = o ? fd(i, o) : new FormData(i), vs(n, {
							pending: !0,
							data: e,
							method: i.method,
							action: a
						}, a, e));
					},
					currentTarget: i
				}]
			});
		}
	}
	for (var md = 0; md < Br.length; md++) {
		var hd = Br[md];
		Vr(hd.toLowerCase(), "on" + (hd[0].toUpperCase() + hd.slice(1)));
	}
	Vr(Mr, "onAnimationEnd"), Vr(Nr, "onAnimationIteration"), Vr(Pr, "onAnimationStart"), Vr("dblclick", "onDoubleClick"), Vr("focusin", "onFocus"), Vr("focusout", "onBlur"), Vr(Fr, "onTransitionRun"), Vr(Ir, "onTransitionStart"), Vr(Lr, "onTransitionCancel"), Vr(Rr, "onTransitionEnd"), gt("onMouseEnter", ["mouseout", "mouseover"]), gt("onMouseLeave", ["mouseout", "mouseover"]), gt("onPointerEnter", ["pointerout", "pointerover"]), gt("onPointerLeave", ["pointerout", "pointerover"]), ht("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), ht("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), ht("onBeforeInput", [
		"compositionend",
		"keypress",
		"textInput",
		"paste"
	]), ht("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), ht("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), ht("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
	var gd = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), _d = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(gd));
	function vd(e, t) {
		t = !!(t & 4);
		for (var n = 0; n < e.length; n++) {
			var r = e[n], i = r.event;
			r = r.listeners;
			a: {
				var a = void 0;
				if (t) for (var o = r.length - 1; 0 <= o; o--) {
					var s = r[o], c = s.instance, l = s.currentTarget;
					if (s = s.listener, c !== a && i.isPropagationStopped()) break a;
					a = s, i.currentTarget = l;
					try {
						a(i);
					} catch (e) {
						Hr(e);
					}
					i.currentTarget = null, a = c;
				}
				else for (o = 0; o < r.length; o++) {
					if (s = r[o], c = s.instance, l = s.currentTarget, s = s.listener, c !== a && i.isPropagationStopped()) break a;
					a = s, i.currentTarget = l;
					try {
						a(i);
					} catch (e) {
						Hr(e);
					}
					i.currentTarget = null, a = c;
				}
			}
		}
	}
	function $(e, t) {
		var n = t[nt];
		n === void 0 && (n = t[nt] = /* @__PURE__ */ new Set());
		var r = e + "__bubble";
		n.has(r) || (Sd(t, e, 2, !1), n.add(r));
	}
	function yd(e, t, n) {
		var r = 0;
		t && (r |= 4), Sd(n, e, r, t);
	}
	var bd = "_reactListening" + Math.random().toString(36).slice(2);
	function xd(e) {
		if (!e[bd]) {
			e[bd] = !0, pt.forEach(function(t) {
				t !== "selectionchange" && (_d.has(t) || yd(t, !1, e), yd(t, !0, e));
			});
			var t = e.nodeType === 9 ? e : e.ownerDocument;
			t === null || t[bd] || (t[bd] = !0, yd("selectionchange", !1, t));
		}
	}
	function Sd(e, t, n, r) {
		switch (mp(t)) {
			case 2:
				var i = cp;
				break;
			case 8:
				i = lp;
				break;
			default: i = up;
		}
		n = i.bind(null, t, n, e), i = void 0, !tn || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (i = !0), r ? i === void 0 ? e.addEventListener(t, n, !0) : e.addEventListener(t, n, {
			capture: !0,
			passive: i
		}) : i === void 0 ? e.addEventListener(t, n, !1) : e.addEventListener(t, n, { passive: i });
	}
	function Cd(e, t, n, r, i) {
		var a = r;
		if (!(t & 1) && !(t & 2) && r !== null) a: for (;;) {
			if (r === null) return;
			var s = r.tag;
			if (s === 3 || s === 4) {
				var c = r.stateNode.containerInfo;
				if (c === i) break;
				if (s === 4) for (s = r.return; s !== null;) {
					var l = s.tag;
					if ((l === 3 || l === 4) && s.stateNode.containerInfo === i) return;
					s = s.return;
				}
				for (; c !== null;) {
					if (s = ct(c), s === null) return;
					if (l = s.tag, l === 5 || l === 6 || l === 26 || l === 27) {
						r = a = s;
						continue a;
					}
					c = c.parentNode;
				}
			}
			r = r.return;
		}
		Qt(function() {
			var r = a, i = qt(n), s = [];
			a: {
				var c = zr.get(e);
				if (c !== void 0) {
					var l = pn, u = e;
					switch (e) {
						case "keypress": if (cn(n) === 0) break a;
						case "keydown":
						case "keyup":
							l = jn;
							break;
						case "focusin":
							u = "focus", l = Sn;
							break;
						case "focusout":
							u = "blur", l = Sn;
							break;
						case "beforeblur":
						case "afterblur":
							l = Sn;
							break;
						case "click": if (n.button === 2) break a;
						case "auxclick":
						case "dblclick":
						case "mousedown":
						case "mousemove":
						case "mouseup":
						case "mouseout":
						case "mouseover":
						case "contextmenu":
							l = bn;
							break;
						case "drag":
						case "dragend":
						case "dragenter":
						case "dragexit":
						case "dragleave":
						case "dragover":
						case "dragstart":
						case "drop":
							l = xn;
							break;
						case "touchcancel":
						case "touchend":
						case "touchmove":
						case "touchstart":
							l = Nn;
							break;
						case Mr:
						case Nr:
						case Pr:
							l = Cn;
							break;
						case Rr:
							l = Pn;
							break;
						case "scroll":
						case "scrollend":
							l = hn;
							break;
						case "wheel":
							l = Fn;
							break;
						case "copy":
						case "cut":
						case "paste":
							l = wn;
							break;
						case "gotpointercapture":
						case "lostpointercapture":
						case "pointercancel":
						case "pointerdown":
						case "pointermove":
						case "pointerout":
						case "pointerover":
						case "pointerup":
							l = Mn;
							break;
						case "toggle":
						case "beforetoggle": l = In;
					}
					var d = !!(t & 4), f = !d && (e === "scroll" || e === "scrollend"), p = d ? c === null ? null : c + "Capture" : c;
					d = [];
					for (var m = r, h; m !== null;) {
						var g = m;
						if (h = g.stateNode, g = g.tag, g !== 5 && g !== 26 && g !== 27 || h === null || p === null || (g = $t(m, p), g != null && d.push(wd(m, g, h))), f) break;
						m = m.return;
					}
					0 < d.length && (c = new l(c, u, null, n, i), s.push({
						event: c,
						listeners: d
					}));
				}
			}
			if (!(t & 7)) {
				a: {
					if (c = e === "mouseover" || e === "pointerover", l = e === "mouseout" || e === "pointerout", c && n !== Kt && (u = n.relatedTarget || n.fromElement) && (ct(u) || u[tt])) break a;
					if ((l || c) && (c = i.window === i ? i : (c = i.ownerDocument) ? c.defaultView || c.parentWindow : window, l ? (u = n.relatedTarget || n.toElement, l = r, u = u ? ct(u) : null, u !== null && (f = o(u), d = u.tag, u !== f || d !== 5 && d !== 27 && d !== 6) && (u = null)) : (l = null, u = r), l !== u)) {
						if (d = bn, g = "onMouseLeave", p = "onMouseEnter", m = "mouse", (e === "pointerout" || e === "pointerover") && (d = Mn, g = "onPointerLeave", p = "onPointerEnter", m = "pointer"), f = l == null ? c : ut(l), h = u == null ? c : ut(u), c = new d(g, m + "leave", l, n, i), c.target = f, c.relatedTarget = h, g = null, ct(i) === r && (d = new d(p, m + "enter", u, n, i), d.target = h, d.relatedTarget = f, g = d), f = g, l && u) b: {
							for (d = Ed, p = l, m = u, h = 0, g = p; g; g = d(g)) h++;
							g = 0;
							for (var _ = m; _; _ = d(_)) g++;
							for (; 0 < h - g;) p = d(p), h--;
							for (; 0 < g - h;) m = d(m), g--;
							for (; h--;) {
								if (p === m || m !== null && p === m.alternate) {
									d = p;
									break b;
								}
								p = d(p), m = d(m);
							}
							d = null;
						}
						else d = null;
						l !== null && Dd(s, c, l, d, !1), u !== null && f !== null && Dd(s, f, u, d, !0);
					}
				}
				a: {
					if (c = r ? ut(r) : window, l = c.nodeName && c.nodeName.toLowerCase(), l === "select" || l === "input" && c.type === "file") var v = nr;
					else if (Xn(c)) {
						if (rr) v = fr;
						else {
							v = ur;
							var y = lr;
						}
					} else l = c.nodeName, !l || l.toLowerCase() !== "input" || c.type !== "checkbox" && c.type !== "radio" ? r && Vt(r.elementType) && (v = nr) : v = dr;
					if (v &&= v(e, r)) {
						Zn(s, v, n, i);
						break a;
					}
					y && y(e, c, r), e === "focusout" && r && c.type === "number" && r.memoizedProps.value != null && Pt(c, "number", c.value);
				}
				switch (y = r ? ut(r) : window, e) {
					case "focusin":
						(Xn(y) || y.contentEditable === "true") && (Sr = y, Cr = r, wr = null);
						break;
					case "focusout":
						wr = Cr = Sr = null;
						break;
					case "mousedown":
						Tr = !0;
						break;
					case "contextmenu":
					case "mouseup":
					case "dragend":
						Tr = !1, Er(s, n, i);
						break;
					case "selectionchange": if (xr) break;
					case "keydown":
					case "keyup": Er(s, n, i);
				}
				var b;
				if (Rn) b: {
					switch (e) {
						case "compositionstart":
							var x = "onCompositionStart";
							break b;
						case "compositionend":
							x = "onCompositionEnd";
							break b;
						case "compositionupdate":
							x = "onCompositionUpdate";
							break b;
					}
					x = void 0;
				}
				else Kn ? Wn(e, n) && (x = "onCompositionEnd") : e === "keydown" && n.keyCode === 229 && (x = "onCompositionStart");
				x && (Vn && n.locale !== "ko" && (Kn || x !== "onCompositionStart" ? x === "onCompositionEnd" && Kn && (b = sn()) : (rn = i, an = "value" in rn ? rn.value : rn.textContent, Kn = !0)), y = Td(r, x), 0 < y.length && (x = new Tn(x, e, null, n, i), s.push({
					event: x,
					listeners: y
				}), b ? x.data = b : (b = Gn(n), b !== null && (x.data = b)))), (b = Bn ? qn(e, n) : Jn(e, n)) && (x = Td(r, "onBeforeInput"), 0 < x.length && (y = new Tn("onBeforeInput", "beforeinput", null, n, i), s.push({
					event: y,
					listeners: x
				}), y.data = b)), pd(s, e, r, n, i);
			}
			vd(s, t);
		});
	}
	function wd(e, t, n) {
		return {
			instance: e,
			listener: t,
			currentTarget: n
		};
	}
	function Td(e, t) {
		for (var n = t + "Capture", r = []; e !== null;) {
			var i = e, a = i.stateNode;
			if (i = i.tag, i !== 5 && i !== 26 && i !== 27 || a === null || (i = $t(e, n), i != null && r.unshift(wd(e, i, a)), i = $t(e, t), i != null && r.push(wd(e, i, a))), e.tag === 3) return r;
			e = e.return;
		}
		return [];
	}
	function Ed(e) {
		if (e === null) return null;
		do
			e = e.return;
		while (e && e.tag !== 5 && e.tag !== 27);
		return e || null;
	}
	function Dd(e, t, n, r, i) {
		for (var a = t._reactName, o = []; n !== null && n !== r;) {
			var s = n, c = s.alternate, l = s.stateNode;
			if (s = s.tag, c !== null && c === r) break;
			s !== 5 && s !== 26 && s !== 27 || l === null || (c = l, i ? (l = $t(n, a), l != null && o.unshift(wd(n, l, c))) : i || (l = $t(n, a), l != null && o.push(wd(n, l, c)))), n = n.return;
		}
		o.length !== 0 && e.push({
			event: t,
			listeners: o
		});
	}
	var Od = /\r\n?/g, kd = /\u0000|\uFFFD/g;
	function Ad(e) {
		return (typeof e == "string" ? e : "" + e).replace(Od, "\n").replace(kd, "");
	}
	function jd(e, t) {
		return t = Ad(t), Ad(e) === t;
	}
	function Md(e, t, n, r, a, o) {
		switch (n) {
			case "children":
				typeof r == "string" ? t === "body" || t === "textarea" && r === "" || Lt(e, r) : (typeof r == "number" || typeof r == "bigint") && t !== "body" && Lt(e, "" + r);
				break;
			case "className":
				St(e, "class", r);
				break;
			case "tabIndex":
				St(e, "tabindex", r);
				break;
			case "dir":
			case "role":
			case "viewBox":
			case "width":
			case "height":
				St(e, n, r);
				break;
			case "style":
				Bt(e, r, o);
				break;
			case "data": if (t !== "object") {
				St(e, "data", r);
				break;
			}
			case "src":
			case "href":
				if (r === "" && (t !== "a" || n !== "href")) {
					e.removeAttribute(n);
					break;
				}
				if (r == null || typeof r == "function" || typeof r == "symbol" || typeof r == "boolean") {
					e.removeAttribute(n);
					break;
				}
				r = Wt("" + r), e.setAttribute(n, r);
				break;
			case "action":
			case "formAction":
				if (typeof r == "function") {
					e.setAttribute(n, "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");
					break;
				}
				if (typeof o == "function" && (n === "formAction" ? (t !== "input" && Md(e, t, "name", a.name, a, null), Md(e, t, "formEncType", a.formEncType, a, null), Md(e, t, "formMethod", a.formMethod, a, null), Md(e, t, "formTarget", a.formTarget, a, null)) : (Md(e, t, "encType", a.encType, a, null), Md(e, t, "method", a.method, a, null), Md(e, t, "target", a.target, a, null))), r == null || typeof r == "symbol" || typeof r == "boolean") {
					e.removeAttribute(n);
					break;
				}
				r = Wt("" + r), e.setAttribute(n, r);
				break;
			case "onClick":
				r != null && (e.onclick = Gt);
				break;
			case "onScroll":
				r != null && $("scroll", e);
				break;
			case "onScrollEnd":
				r != null && $("scrollend", e);
				break;
			case "dangerouslySetInnerHTML":
				if (r != null) {
					if (typeof r != "object" || !("__html" in r)) throw Error(i(61));
					if (n = r.__html, n != null) {
						if (a.children != null) throw Error(i(60));
						e.innerHTML = n;
					}
				}
				break;
			case "multiple":
				e.multiple = r && typeof r != "function" && typeof r != "symbol";
				break;
			case "muted":
				e.muted = r && typeof r != "function" && typeof r != "symbol";
				break;
			case "suppressContentEditableWarning":
			case "suppressHydrationWarning":
			case "defaultValue":
			case "defaultChecked":
			case "innerHTML":
			case "ref": break;
			case "autoFocus": break;
			case "xlinkHref":
				if (r == null || typeof r == "function" || typeof r == "boolean" || typeof r == "symbol") {
					e.removeAttribute("xlink:href");
					break;
				}
				n = Wt("" + r), e.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", n);
				break;
			case "contentEditable":
			case "spellCheck":
			case "draggable":
			case "value":
			case "autoReverse":
			case "externalResourcesRequired":
			case "focusable":
			case "preserveAlpha":
				r != null && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(n, "" + r) : e.removeAttribute(n);
				break;
			case "inert":
			case "allowFullScreen":
			case "async":
			case "autoPlay":
			case "controls":
			case "default":
			case "defer":
			case "disabled":
			case "disablePictureInPicture":
			case "disableRemotePlayback":
			case "formNoValidate":
			case "hidden":
			case "loop":
			case "noModule":
			case "noValidate":
			case "open":
			case "playsInline":
			case "readOnly":
			case "required":
			case "reversed":
			case "scoped":
			case "seamless":
			case "itemScope":
				r && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(n, "") : e.removeAttribute(n);
				break;
			case "capture":
			case "download":
				!0 === r ? e.setAttribute(n, "") : !1 !== r && r != null && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(n, r) : e.removeAttribute(n);
				break;
			case "cols":
			case "rows":
			case "size":
			case "span":
				r != null && typeof r != "function" && typeof r != "symbol" && !isNaN(r) && 1 <= r ? e.setAttribute(n, r) : e.removeAttribute(n);
				break;
			case "rowSpan":
			case "start":
				r == null || typeof r == "function" || typeof r == "symbol" || isNaN(r) ? e.removeAttribute(n) : e.setAttribute(n, r);
				break;
			case "popover":
				$("beforetoggle", e), $("toggle", e), xt(e, "popover", r);
				break;
			case "xlinkActuate":
				Ct(e, "http://www.w3.org/1999/xlink", "xlink:actuate", r);
				break;
			case "xlinkArcrole":
				Ct(e, "http://www.w3.org/1999/xlink", "xlink:arcrole", r);
				break;
			case "xlinkRole":
				Ct(e, "http://www.w3.org/1999/xlink", "xlink:role", r);
				break;
			case "xlinkShow":
				Ct(e, "http://www.w3.org/1999/xlink", "xlink:show", r);
				break;
			case "xlinkTitle":
				Ct(e, "http://www.w3.org/1999/xlink", "xlink:title", r);
				break;
			case "xlinkType":
				Ct(e, "http://www.w3.org/1999/xlink", "xlink:type", r);
				break;
			case "xmlBase":
				Ct(e, "http://www.w3.org/XML/1998/namespace", "xml:base", r);
				break;
			case "xmlLang":
				Ct(e, "http://www.w3.org/XML/1998/namespace", "xml:lang", r);
				break;
			case "xmlSpace":
				Ct(e, "http://www.w3.org/XML/1998/namespace", "xml:space", r);
				break;
			case "is":
				xt(e, "is", r);
				break;
			case "innerText":
			case "textContent": break;
			default: (!(2 < n.length) || n[0] !== "o" && n[0] !== "O" || n[1] !== "n" && n[1] !== "N") && (n = Ht.get(n) || n, xt(e, n, r));
		}
	}
	function Nd(e, t, n, r, a, o) {
		switch (n) {
			case "style":
				Bt(e, r, o);
				break;
			case "dangerouslySetInnerHTML":
				if (r != null) {
					if (typeof r != "object" || !("__html" in r)) throw Error(i(61));
					if (n = r.__html, n != null) {
						if (a.children != null) throw Error(i(60));
						e.innerHTML = n;
					}
				}
				break;
			case "children":
				typeof r == "string" ? Lt(e, r) : (typeof r == "number" || typeof r == "bigint") && Lt(e, "" + r);
				break;
			case "onScroll":
				r != null && $("scroll", e);
				break;
			case "onScrollEnd":
				r != null && $("scrollend", e);
				break;
			case "onClick":
				r != null && (e.onclick = Gt);
				break;
			case "suppressContentEditableWarning":
			case "suppressHydrationWarning":
			case "innerHTML":
			case "ref": break;
			case "innerText":
			case "textContent": break;
			default: if (!mt.hasOwnProperty(n)) a: {
				if (n[0] === "o" && n[1] === "n" && (a = n.endsWith("Capture"), t = n.slice(2, a ? n.length - 7 : void 0), o = e[et] || null, o = o == null ? null : o[n], typeof o == "function" && e.removeEventListener(t, o, a), typeof r == "function")) {
					typeof o != "function" && o !== null && (n in e ? e[n] = null : e.hasAttribute(n) && e.removeAttribute(n)), e.addEventListener(t, r, a);
					break a;
				}
				n in e ? e[n] = r : !0 === r ? e.setAttribute(n, "") : xt(e, n, r);
			}
		}
	}
	function Pd(e, t, n) {
		switch (t) {
			case "div":
			case "span":
			case "svg":
			case "path":
			case "a":
			case "g":
			case "p":
			case "li": break;
			case "img":
				$("error", e), $("load", e);
				var r = !1, a = !1, o;
				for (o in n) if (n.hasOwnProperty(o)) {
					var s = n[o];
					if (s != null) switch (o) {
						case "src":
							r = !0;
							break;
						case "srcSet":
							a = !0;
							break;
						case "children":
						case "dangerouslySetInnerHTML": throw Error(i(137, t));
						default: Md(e, t, o, s, n, null);
					}
				}
				a && Md(e, t, "srcSet", n.srcSet, n, null), r && Md(e, t, "src", n.src, n, null);
				return;
			case "input":
				$("invalid", e);
				var c = o = s = a = null, l = null, u = null;
				for (r in n) if (n.hasOwnProperty(r)) {
					var d = n[r];
					if (d != null) switch (r) {
						case "name":
							a = d;
							break;
						case "type":
							s = d;
							break;
						case "checked":
							l = d;
							break;
						case "defaultChecked":
							u = d;
							break;
						case "value":
							o = d;
							break;
						case "defaultValue":
							c = d;
							break;
						case "children":
						case "dangerouslySetInnerHTML":
							if (d != null) throw Error(i(137, t));
							break;
						default: Md(e, t, r, d, n, null);
					}
				}
				Nt(e, o, c, l, u, s, a, !1);
				return;
			case "select":
				for (a in $("invalid", e), r = s = o = null, n) if (n.hasOwnProperty(a) && (c = n[a], c != null)) switch (a) {
					case "value":
						o = c;
						break;
					case "defaultValue":
						s = c;
						break;
					case "multiple": r = c;
					default: Md(e, t, a, c, n, null);
				}
				t = o, n = s, e.multiple = !!r, t == null ? n != null && Ft(e, !!r, n, !0) : Ft(e, !!r, t, !1);
				return;
			case "textarea":
				for (s in $("invalid", e), o = a = r = null, n) if (n.hasOwnProperty(s) && (c = n[s], c != null)) switch (s) {
					case "value":
						r = c;
						break;
					case "defaultValue":
						a = c;
						break;
					case "children":
						o = c;
						break;
					case "dangerouslySetInnerHTML":
						if (c != null) throw Error(i(91));
						break;
					default: Md(e, t, s, c, n, null);
				}
				K(e, r, a, o);
				return;
			case "option":
				for (l in n) if (n.hasOwnProperty(l) && (r = n[l], r != null)) switch (l) {
					case "selected":
						e.selected = r && typeof r != "function" && typeof r != "symbol";
						break;
					default: Md(e, t, l, r, n, null);
				}
				return;
			case "dialog":
				$("beforetoggle", e), $("toggle", e), $("cancel", e), $("close", e);
				break;
			case "iframe":
			case "object":
				$("load", e);
				break;
			case "video":
			case "audio":
				for (r = 0; r < gd.length; r++) $(gd[r], e);
				break;
			case "image":
				$("error", e), $("load", e);
				break;
			case "details":
				$("toggle", e);
				break;
			case "embed":
			case "source":
			case "link": $("error", e), $("load", e);
			case "area":
			case "base":
			case "br":
			case "col":
			case "hr":
			case "keygen":
			case "meta":
			case "param":
			case "track":
			case "wbr":
			case "menuitem":
				for (u in n) if (n.hasOwnProperty(u) && (r = n[u], r != null)) switch (u) {
					case "children":
					case "dangerouslySetInnerHTML": throw Error(i(137, t));
					default: Md(e, t, u, r, n, null);
				}
				return;
			default: if (Vt(t)) {
				for (d in n) n.hasOwnProperty(d) && (r = n[d], r !== void 0 && Nd(e, t, d, r, n, void 0));
				return;
			}
		}
		for (c in n) n.hasOwnProperty(c) && (r = n[c], r != null && Md(e, t, c, r, n, null));
	}
	function Fd(e, t, n, r) {
		switch (t) {
			case "div":
			case "span":
			case "svg":
			case "path":
			case "a":
			case "g":
			case "p":
			case "li": break;
			case "input":
				var a = null, o = null, s = null, c = null, l = null, u = null, d = null;
				for (m in n) {
					var f = n[m];
					if (n.hasOwnProperty(m) && f != null) switch (m) {
						case "checked": break;
						case "value": break;
						case "defaultValue": l = f;
						default: r.hasOwnProperty(m) || Md(e, t, m, null, r, f);
					}
				}
				for (var p in r) {
					var m = r[p];
					if (f = n[p], r.hasOwnProperty(p) && (m != null || f != null)) switch (p) {
						case "type":
							o = m;
							break;
						case "name":
							a = m;
							break;
						case "checked":
							u = m;
							break;
						case "defaultChecked":
							d = m;
							break;
						case "value":
							s = m;
							break;
						case "defaultValue":
							c = m;
							break;
						case "children":
						case "dangerouslySetInnerHTML":
							if (m != null) throw Error(i(137, t));
							break;
						default: m !== f && Md(e, t, p, m, r, f);
					}
				}
				Mt(e, s, c, l, u, d, o, a);
				return;
			case "select":
				for (o in m = s = c = p = null, n) if (l = n[o], n.hasOwnProperty(o) && l != null) switch (o) {
					case "value": break;
					case "multiple": m = l;
					default: r.hasOwnProperty(o) || Md(e, t, o, null, r, l);
				}
				for (a in r) if (o = r[a], l = n[a], r.hasOwnProperty(a) && (o != null || l != null)) switch (a) {
					case "value":
						p = o;
						break;
					case "defaultValue":
						c = o;
						break;
					case "multiple": s = o;
					default: o !== l && Md(e, t, a, o, r, l);
				}
				t = c, n = s, r = m, p == null ? !!r != !!n && (t == null ? Ft(e, !!n, n ? [] : "", !1) : Ft(e, !!n, t, !0)) : Ft(e, !!n, p, !1);
				return;
			case "textarea":
				for (c in m = p = null, n) if (a = n[c], n.hasOwnProperty(c) && a != null && !r.hasOwnProperty(c)) switch (c) {
					case "value": break;
					case "children": break;
					default: Md(e, t, c, null, r, a);
				}
				for (s in r) if (a = r[s], o = n[s], r.hasOwnProperty(s) && (a != null || o != null)) switch (s) {
					case "value":
						p = a;
						break;
					case "defaultValue":
						m = a;
						break;
					case "children": break;
					case "dangerouslySetInnerHTML":
						if (a != null) throw Error(i(91));
						break;
					default: a !== o && Md(e, t, s, a, r, o);
				}
				It(e, p, m);
				return;
			case "option":
				for (var h in n) if (p = n[h], n.hasOwnProperty(h) && p != null && !r.hasOwnProperty(h)) switch (h) {
					case "selected":
						e.selected = !1;
						break;
					default: Md(e, t, h, null, r, p);
				}
				for (l in r) if (p = r[l], m = n[l], r.hasOwnProperty(l) && p !== m && (p != null || m != null)) switch (l) {
					case "selected":
						e.selected = p && typeof p != "function" && typeof p != "symbol";
						break;
					default: Md(e, t, l, p, r, m);
				}
				return;
			case "img":
			case "link":
			case "area":
			case "base":
			case "br":
			case "col":
			case "embed":
			case "hr":
			case "keygen":
			case "meta":
			case "param":
			case "source":
			case "track":
			case "wbr":
			case "menuitem":
				for (var g in n) p = n[g], n.hasOwnProperty(g) && p != null && !r.hasOwnProperty(g) && Md(e, t, g, null, r, p);
				for (u in r) if (p = r[u], m = n[u], r.hasOwnProperty(u) && p !== m && (p != null || m != null)) switch (u) {
					case "children":
					case "dangerouslySetInnerHTML":
						if (p != null) throw Error(i(137, t));
						break;
					default: Md(e, t, u, p, r, m);
				}
				return;
			default: if (Vt(t)) {
				for (var _ in n) p = n[_], n.hasOwnProperty(_) && p !== void 0 && !r.hasOwnProperty(_) && Nd(e, t, _, void 0, r, p);
				for (d in r) p = r[d], m = n[d], !r.hasOwnProperty(d) || p === m || p === void 0 && m === void 0 || Nd(e, t, d, p, r, m);
				return;
			}
		}
		for (var v in n) p = n[v], n.hasOwnProperty(v) && p != null && !r.hasOwnProperty(v) && Md(e, t, v, null, r, p);
		for (f in r) p = r[f], m = n[f], !r.hasOwnProperty(f) || p === m || p == null && m == null || Md(e, t, f, p, r, m);
	}
	function Id(e) {
		switch (e) {
			case "css":
			case "script":
			case "font":
			case "img":
			case "image":
			case "input":
			case "link": return !0;
			default: return !1;
		}
	}
	function Ld() {
		if (typeof performance.getEntriesByType == "function") {
			for (var e = 0, t = 0, n = performance.getEntriesByType("resource"), r = 0; r < n.length; r++) {
				var i = n[r], a = i.transferSize, o = i.initiatorType, s = i.duration;
				if (a && s && Id(o)) {
					for (o = 0, s = i.responseEnd, r += 1; r < n.length; r++) {
						var c = n[r], l = c.startTime;
						if (l > s) break;
						var u = c.transferSize, d = c.initiatorType;
						u && Id(d) && (c = c.responseEnd, o += u * (c < s ? 1 : (s - l) / (c - l)));
					}
					if (--r, t += 8 * (a + o) / (i.duration / 1e3), e++, 10 < e) break;
				}
			}
			if (0 < e) return t / e / 1e6;
		}
		return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
	}
	var Rd = null, zd = null;
	function Bd(e) {
		return e.nodeType === 9 ? e : e.ownerDocument;
	}
	function Vd(e) {
		switch (e) {
			case "http://www.w3.org/2000/svg": return 1;
			case "http://www.w3.org/1998/Math/MathML": return 2;
			default: return 0;
		}
	}
	function Hd(e, t) {
		if (e === 0) switch (t) {
			case "svg": return 1;
			case "math": return 2;
			default: return 0;
		}
		return e === 1 && t === "foreignObject" ? 0 : e;
	}
	function Ud(e, t) {
		return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
	}
	var Wd = null;
	function Gd() {
		var e = window.event;
		return e && e.type === "popstate" ? e !== Wd && (Wd = e, !0) : (Wd = null, !1);
	}
	var Kd = typeof setTimeout == "function" ? setTimeout : void 0, qd = typeof clearTimeout == "function" ? clearTimeout : void 0, Jd = typeof Promise == "function" ? Promise : void 0, Yd = typeof queueMicrotask == "function" ? queueMicrotask : Jd === void 0 ? Kd : function(e) {
		return Jd.resolve(null).then(e).catch(Xd);
	};
	function Xd(e) {
		setTimeout(function() {
			throw e;
		});
	}
	function Zd(e) {
		return e === "head";
	}
	function Qd(e, t) {
		var n = t, r = 0;
		do {
			var i = n.nextSibling;
			if (e.removeChild(n), i && i.nodeType === 8) {
				if (n = i.data, n === "/$" || n === "/&") {
					if (r === 0) {
						e.removeChild(i), Np(t);
						return;
					}
					r--;
				} else if (n === "$" || n === "$?" || n === "$~" || n === "$!" || n === "&") r++;
				else if (n === "html") pf(e.ownerDocument.documentElement);
				else if (n === "head") {
					n = e.ownerDocument.head, pf(n);
					for (var a = n.firstChild; a;) {
						var o = a.nextSibling, s = a.nodeName;
						a[ot] || s === "SCRIPT" || s === "STYLE" || s === "LINK" && a.rel.toLowerCase() === "stylesheet" || n.removeChild(a), a = o;
					}
				} else n === "body" && pf(e.ownerDocument.body);
			}
			n = i;
		} while (n);
		Np(t);
	}
	function $d(e, t) {
		var n = e;
		e = 0;
		do {
			var r = n.nextSibling;
			if (n.nodeType === 1 ? t ? (n._stashedDisplay = n.style.display, n.style.display = "none") : (n.style.display = n._stashedDisplay || "", n.getAttribute("style") === "" && n.removeAttribute("style")) : n.nodeType === 3 && (t ? (n._stashedText = n.nodeValue, n.nodeValue = "") : n.nodeValue = n._stashedText || ""), r && r.nodeType === 8) {
				if (n = r.data, n === "/$") {
					if (e === 0) break;
					e--;
				} else n !== "$" && n !== "$?" && n !== "$~" && n !== "$!" || e++;
			}
			n = r;
		} while (n);
	}
	function ef(e) {
		var t = e.firstChild;
		for (t && t.nodeType === 10 && (t = t.nextSibling); t;) {
			var n = t;
			switch (t = t.nextSibling, n.nodeName) {
				case "HTML":
				case "HEAD":
				case "BODY":
					ef(n), st(n);
					continue;
				case "SCRIPT":
				case "STYLE": continue;
				case "LINK": if (n.rel.toLowerCase() === "stylesheet") continue;
			}
			e.removeChild(n);
		}
	}
	function tf(e, t, n, r) {
		for (; e.nodeType === 1;) {
			var i = n;
			if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
				if (!r && (e.nodeName !== "INPUT" || e.type !== "hidden")) break;
			} else if (!r) {
				if (t === "input" && e.type === "hidden") {
					var a = i.name == null ? null : "" + i.name;
					if (i.type === "hidden" && e.getAttribute("name") === a) return e;
				} else return e;
			} else if (!e[ot]) switch (t) {
				case "meta":
					if (!e.hasAttribute("itemprop")) break;
					return e;
				case "link":
					if (a = e.getAttribute("rel"), a === "stylesheet" && e.hasAttribute("data-precedence") || a !== i.rel || e.getAttribute("href") !== (i.href == null || i.href === "" ? null : i.href) || e.getAttribute("crossorigin") !== (i.crossOrigin == null ? null : i.crossOrigin) || e.getAttribute("title") !== (i.title == null ? null : i.title)) break;
					return e;
				case "style":
					if (e.hasAttribute("data-precedence")) break;
					return e;
				case "script":
					if (a = e.getAttribute("src"), (a !== (i.src == null ? null : i.src) || e.getAttribute("type") !== (i.type == null ? null : i.type) || e.getAttribute("crossorigin") !== (i.crossOrigin == null ? null : i.crossOrigin)) && a && e.hasAttribute("async") && !e.hasAttribute("itemprop")) break;
					return e;
				default: return e;
			}
			if (e = cf(e.nextSibling), e === null) break;
		}
		return null;
	}
	function nf(e, t, n) {
		if (t === "") return null;
		for (; e.nodeType !== 3;) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !n || (e = cf(e.nextSibling), e === null)) return null;
		return e;
	}
	function rf(e, t) {
		for (; e.nodeType !== 8;) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = cf(e.nextSibling), e === null)) return null;
		return e;
	}
	function af(e) {
		return e.data === "$?" || e.data === "$~";
	}
	function of(e) {
		return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
	}
	function sf(e, t) {
		var n = e.ownerDocument;
		if (e.data === "$~") e._reactRetry = t;
		else if (e.data !== "$?" || n.readyState !== "loading") t();
		else {
			var r = function() {
				t(), n.removeEventListener("DOMContentLoaded", r);
			};
			n.addEventListener("DOMContentLoaded", r), e._reactRetry = r;
		}
	}
	function cf(e) {
		for (; e != null; e = e.nextSibling) {
			var t = e.nodeType;
			if (t === 1 || t === 3) break;
			if (t === 8) {
				if (t = e.data, t === "$" || t === "$!" || t === "$?" || t === "$~" || t === "&" || t === "F!" || t === "F") break;
				if (t === "/$" || t === "/&") return null;
			}
		}
		return e;
	}
	var lf = null;
	function uf(e) {
		e = e.nextSibling;
		for (var t = 0; e;) {
			if (e.nodeType === 8) {
				var n = e.data;
				if (n === "/$" || n === "/&") {
					if (t === 0) return cf(e.nextSibling);
					t--;
				} else n !== "$" && n !== "$!" && n !== "$?" && n !== "$~" && n !== "&" || t++;
			}
			e = e.nextSibling;
		}
		return null;
	}
	function df(e) {
		e = e.previousSibling;
		for (var t = 0; e;) {
			if (e.nodeType === 8) {
				var n = e.data;
				if (n === "$" || n === "$!" || n === "$?" || n === "$~" || n === "&") {
					if (t === 0) return e;
					t--;
				} else n !== "/$" && n !== "/&" || t++;
			}
			e = e.previousSibling;
		}
		return null;
	}
	function ff(e, t, n) {
		switch (t = Bd(n), e) {
			case "html":
				if (e = t.documentElement, !e) throw Error(i(452));
				return e;
			case "head":
				if (e = t.head, !e) throw Error(i(453));
				return e;
			case "body":
				if (e = t.body, !e) throw Error(i(454));
				return e;
			default: throw Error(i(451));
		}
	}
	function pf(e) {
		for (var t = e.attributes; t.length;) e.removeAttributeNode(t[0]);
		st(e);
	}
	var mf = /* @__PURE__ */ new Map(), hf = /* @__PURE__ */ new Set();
	function gf(e) {
		return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
	}
	var _f = P.d;
	P.d = {
		f: vf,
		r: yf,
		D: Sf,
		C: Cf,
		L: wf,
		m: Tf,
		X: Df,
		S: Ef,
		M: Of
	};
	function vf() {
		var e = _f.f(), t = vu();
		return e || t;
	}
	function yf(e) {
		var t = lt(e);
		t !== null && t.tag === 5 && t.type === "form" ? bs(t) : _f.r(e);
	}
	var bf = typeof document > "u" ? null : document;
	function xf(e, t, n) {
		var r = bf;
		if (r && typeof t == "string" && t) {
			var i = jt(t);
			i = "link[rel=\"" + e + "\"][href=\"" + i + "\"]", typeof n == "string" && (i += "[crossorigin=\"" + n + "\"]"), hf.has(i) || (hf.add(i), e = {
				rel: e,
				crossOrigin: n,
				href: t
			}, r.querySelector(i) === null && (t = r.createElement("link"), Pd(t, "link", e), ft(t), r.head.appendChild(t)));
		}
	}
	function Sf(e) {
		_f.D(e), xf("dns-prefetch", e, null);
	}
	function Cf(e, t) {
		_f.C(e, t), xf("preconnect", e, t);
	}
	function wf(e, t, n) {
		_f.L(e, t, n);
		var r = bf;
		if (r && e && t) {
			var i = "link[rel=\"preload\"][as=\"" + jt(t) + "\"]";
			t === "image" && n && n.imageSrcSet ? (i += "[imagesrcset=\"" + jt(n.imageSrcSet) + "\"]", typeof n.imageSizes == "string" && (i += "[imagesizes=\"" + jt(n.imageSizes) + "\"]")) : i += "[href=\"" + jt(e) + "\"]";
			var a = i;
			switch (t) {
				case "style":
					a = Af(e);
					break;
				case "script": a = Pf(e);
			}
			mf.has(a) || (e = f({
				rel: "preload",
				href: t === "image" && n && n.imageSrcSet ? void 0 : e,
				as: t
			}, n), mf.set(a, e), r.querySelector(i) !== null || t === "style" && r.querySelector(jf(a)) || t === "script" && r.querySelector(Ff(a)) || (t = r.createElement("link"), Pd(t, "link", e), ft(t), r.head.appendChild(t)));
		}
	}
	function Tf(e, t) {
		_f.m(e, t);
		var n = bf;
		if (n && e) {
			var r = t && typeof t.as == "string" ? t.as : "script", i = "link[rel=\"modulepreload\"][as=\"" + jt(r) + "\"][href=\"" + jt(e) + "\"]", a = i;
			switch (r) {
				case "audioworklet":
				case "paintworklet":
				case "serviceworker":
				case "sharedworker":
				case "worker":
				case "script": a = Pf(e);
			}
			if (!mf.has(a) && (e = f({
				rel: "modulepreload",
				href: e
			}, t), mf.set(a, e), n.querySelector(i) === null)) {
				switch (r) {
					case "audioworklet":
					case "paintworklet":
					case "serviceworker":
					case "sharedworker":
					case "worker":
					case "script": if (n.querySelector(Ff(a))) return;
				}
				r = n.createElement("link"), Pd(r, "link", e), ft(r), n.head.appendChild(r);
			}
		}
	}
	function Ef(e, t, n) {
		_f.S(e, t, n);
		var r = bf;
		if (r && e) {
			var i = dt(r).hoistableStyles, a = Af(e);
			t ||= "default";
			var o = i.get(a);
			if (!o) {
				var s = {
					loading: 0,
					preload: null
				};
				if (o = r.querySelector(jf(a))) s.loading = 5;
				else {
					e = f({
						rel: "stylesheet",
						href: e,
						"data-precedence": t
					}, n), (n = mf.get(a)) && Rf(e, n);
					var c = o = r.createElement("link");
					ft(c), Pd(c, "link", e), c._p = new Promise(function(e, t) {
						c.onload = e, c.onerror = t;
					}), c.addEventListener("load", function() {
						s.loading |= 1;
					}), c.addEventListener("error", function() {
						s.loading |= 2;
					}), s.loading |= 4, Lf(o, t, r);
				}
				o = {
					type: "stylesheet",
					instance: o,
					count: 1,
					state: s
				}, i.set(a, o);
			}
		}
	}
	function Df(e, t) {
		_f.X(e, t);
		var n = bf;
		if (n && e) {
			var r = dt(n).hoistableScripts, i = Pf(e), a = r.get(i);
			a || (a = n.querySelector(Ff(i)), a || (e = f({
				src: e,
				async: !0
			}, t), (t = mf.get(i)) && zf(e, t), a = n.createElement("script"), ft(a), Pd(a, "link", e), n.head.appendChild(a)), a = {
				type: "script",
				instance: a,
				count: 1,
				state: null
			}, r.set(i, a));
		}
	}
	function Of(e, t) {
		_f.M(e, t);
		var n = bf;
		if (n && e) {
			var r = dt(n).hoistableScripts, i = Pf(e), a = r.get(i);
			a || (a = n.querySelector(Ff(i)), a || (e = f({
				src: e,
				async: !0,
				type: "module"
			}, t), (t = mf.get(i)) && zf(e, t), a = n.createElement("script"), ft(a), Pd(a, "link", e), n.head.appendChild(a)), a = {
				type: "script",
				instance: a,
				count: 1,
				state: null
			}, r.set(i, a));
		}
	}
	function kf(e, t, n, r) {
		var a = (a = ne.current) ? gf(a) : null;
		if (!a) throw Error(i(446));
		switch (e) {
			case "meta":
			case "title": return null;
			case "style": return typeof n.precedence == "string" && typeof n.href == "string" ? (t = Af(n.href), n = dt(a).hoistableStyles, r = n.get(t), r || (r = {
				type: "style",
				instance: null,
				count: 0,
				state: null
			}, n.set(t, r)), r) : {
				type: "void",
				instance: null,
				count: 0,
				state: null
			};
			case "link":
				if (n.rel === "stylesheet" && typeof n.href == "string" && typeof n.precedence == "string") {
					e = Af(n.href);
					var o = dt(a).hoistableStyles, s = o.get(e);
					if (s || (a = a.ownerDocument || a, s = {
						type: "stylesheet",
						instance: null,
						count: 0,
						state: {
							loading: 0,
							preload: null
						}
					}, o.set(e, s), (o = a.querySelector(jf(e))) && !o._p && (s.instance = o, s.state.loading = 5), mf.has(e) || (n = {
						rel: "preload",
						as: "style",
						href: n.href,
						crossOrigin: n.crossOrigin,
						integrity: n.integrity,
						media: n.media,
						hrefLang: n.hrefLang,
						referrerPolicy: n.referrerPolicy
					}, mf.set(e, n), o || Nf(a, e, n, s.state))), t && r === null) throw Error(i(528, ""));
					return s;
				}
				if (t && r !== null) throw Error(i(529, ""));
				return null;
			case "script": return t = n.async, n = n.src, typeof n == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Pf(n), n = dt(a).hoistableScripts, r = n.get(t), r || (r = {
				type: "script",
				instance: null,
				count: 0,
				state: null
			}, n.set(t, r)), r) : {
				type: "void",
				instance: null,
				count: 0,
				state: null
			};
			default: throw Error(i(444, e));
		}
	}
	function Af(e) {
		return "href=\"" + jt(e) + "\"";
	}
	function jf(e) {
		return "link[rel=\"stylesheet\"][" + e + "]";
	}
	function Mf(e) {
		return f({}, e, {
			"data-precedence": e.precedence,
			precedence: null
		});
	}
	function Nf(e, t, n, r) {
		e.querySelector("link[rel=\"preload\"][as=\"style\"][" + t + "]") ? r.loading = 1 : (t = e.createElement("link"), r.preload = t, t.addEventListener("load", function() {
			return r.loading |= 1;
		}), t.addEventListener("error", function() {
			return r.loading |= 2;
		}), Pd(t, "link", n), ft(t), e.head.appendChild(t));
	}
	function Pf(e) {
		return "[src=\"" + jt(e) + "\"]";
	}
	function Ff(e) {
		return "script[async]" + e;
	}
	function If(e, t, n) {
		if (t.count++, t.instance === null) switch (t.type) {
			case "style":
				var r = e.querySelector("style[data-href~=\"" + jt(n.href) + "\"]");
				if (r) return t.instance = r, ft(r), r;
				var a = f({}, n, {
					"data-href": n.href,
					"data-precedence": n.precedence,
					href: null,
					precedence: null
				});
				return r = (e.ownerDocument || e).createElement("style"), ft(r), Pd(r, "style", a), Lf(r, n.precedence, e), t.instance = r;
			case "stylesheet":
				a = Af(n.href);
				var o = e.querySelector(jf(a));
				if (o) return t.state.loading |= 4, t.instance = o, ft(o), o;
				r = Mf(n), (a = mf.get(a)) && Rf(r, a), o = (e.ownerDocument || e).createElement("link"), ft(o);
				var s = o;
				return s._p = new Promise(function(e, t) {
					s.onload = e, s.onerror = t;
				}), Pd(o, "link", r), t.state.loading |= 4, Lf(o, n.precedence, e), t.instance = o;
			case "script": return o = Pf(n.src), (a = e.querySelector(Ff(o))) ? (t.instance = a, ft(a), a) : (r = n, (a = mf.get(o)) && (r = f({}, n), zf(r, a)), e = e.ownerDocument || e, a = e.createElement("script"), ft(a), Pd(a, "link", r), e.head.appendChild(a), t.instance = a);
			case "void": return null;
			default: throw Error(i(443, t.type));
		}
		else t.type === "stylesheet" && !(t.state.loading & 4) && (r = t.instance, t.state.loading |= 4, Lf(r, n.precedence, e));
		return t.instance;
	}
	function Lf(e, t, n) {
		for (var r = n.querySelectorAll("link[rel=\"stylesheet\"][data-precedence],style[data-precedence]"), i = r.length ? r[r.length - 1] : null, a = i, o = 0; o < r.length; o++) {
			var s = r[o];
			if (s.dataset.precedence === t) a = s;
			else if (a !== i) break;
		}
		a ? a.parentNode.insertBefore(e, a.nextSibling) : (t = n.nodeType === 9 ? n.head : n, t.insertBefore(e, t.firstChild));
	}
	function Rf(e, t) {
		e.crossOrigin ??= t.crossOrigin, e.referrerPolicy ??= t.referrerPolicy, e.title ??= t.title;
	}
	function zf(e, t) {
		e.crossOrigin ??= t.crossOrigin, e.referrerPolicy ??= t.referrerPolicy, e.integrity ??= t.integrity;
	}
	var Bf = null;
	function Vf(e, t, n) {
		if (Bf === null) {
			var r = /* @__PURE__ */ new Map(), i = Bf = /* @__PURE__ */ new Map();
			i.set(n, r);
		} else i = Bf, r = i.get(n), r || (r = /* @__PURE__ */ new Map(), i.set(n, r));
		if (r.has(e)) return r;
		for (r.set(e, null), n = n.getElementsByTagName(e), i = 0; i < n.length; i++) {
			var a = n[i];
			if (!(a[ot] || a[$e] || e === "link" && a.getAttribute("rel") === "stylesheet") && a.namespaceURI !== "http://www.w3.org/2000/svg") {
				var o = a.getAttribute(t) || "";
				o = e + o;
				var s = r.get(o);
				s ? s.push(a) : r.set(o, [a]);
			}
		}
		return r;
	}
	function Hf(e, t, n) {
		e = e.ownerDocument || e, e.head.insertBefore(n, t === "title" ? e.querySelector("head > title") : null);
	}
	function Uf(e, t, n) {
		if (n === 1 || t.itemProp != null) return !1;
		switch (e) {
			case "meta":
			case "title": return !0;
			case "style":
				if (typeof t.precedence != "string" || typeof t.href != "string" || t.href === "") break;
				return !0;
			case "link":
				if (typeof t.rel != "string" || typeof t.href != "string" || t.href === "" || t.onLoad || t.onError) break;
				switch (t.rel) {
					case "stylesheet": return e = t.disabled, typeof t.precedence == "string" && e == null;
					default: return !0;
				}
			case "script": if (t.async && typeof t.async != "function" && typeof t.async != "symbol" && !t.onLoad && !t.onError && t.src && typeof t.src == "string") return !0;
		}
		return !1;
	}
	function Wf(e) {
		return !(e.type === "stylesheet" && !(e.state.loading & 3));
	}
	function Gf(e, t, n, r) {
		if (n.type === "stylesheet" && (typeof r.media != "string" || !1 !== matchMedia(r.media).matches) && !(n.state.loading & 4)) {
			if (n.instance === null) {
				var i = Af(r.href), a = t.querySelector(jf(i));
				if (a) {
					t = a._p, typeof t == "object" && t && typeof t.then == "function" && (e.count++, e = Jf.bind(e), t.then(e, e)), n.state.loading |= 4, n.instance = a, ft(a);
					return;
				}
				a = t.ownerDocument || t, r = Mf(r), (i = mf.get(i)) && Rf(r, i), a = a.createElement("link"), ft(a);
				var o = a;
				o._p = new Promise(function(e, t) {
					o.onload = e, o.onerror = t;
				}), Pd(a, "link", r), n.instance = a;
			}
			e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(n, t), (t = n.state.preload) && !(n.state.loading & 3) && (e.count++, n = Jf.bind(e), t.addEventListener("load", n), t.addEventListener("error", n));
		}
	}
	var Kf = 0;
	function qf(e, t) {
		return e.stylesheets && e.count === 0 && Xf(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(n) {
			var r = setTimeout(function() {
				if (e.stylesheets && Xf(e, e.stylesheets), e.unsuspend) {
					var t = e.unsuspend;
					e.unsuspend = null, t();
				}
			}, 6e4 + t);
			0 < e.imgBytes && Kf === 0 && (Kf = 62500 * Ld());
			var i = setTimeout(function() {
				if (e.waitingForImages = !1, e.count === 0 && (e.stylesheets && Xf(e, e.stylesheets), e.unsuspend)) {
					var t = e.unsuspend;
					e.unsuspend = null, t();
				}
			}, (e.imgBytes > Kf ? 50 : 800) + t);
			return e.unsuspend = n, function() {
				e.unsuspend = null, clearTimeout(r), clearTimeout(i);
			};
		} : null;
	}
	function Jf() {
		if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
			if (this.stylesheets) Xf(this, this.stylesheets);
			else if (this.unsuspend) {
				var e = this.unsuspend;
				this.unsuspend = null, e();
			}
		}
	}
	var Yf = null;
	function Xf(e, t) {
		e.stylesheets = null, e.unsuspend !== null && (e.count++, Yf = /* @__PURE__ */ new Map(), t.forEach(Zf, e), Yf = null, Jf.call(e));
	}
	function Zf(e, t) {
		if (!(t.state.loading & 4)) {
			var n = Yf.get(e);
			if (n) var r = n.get(null);
			else {
				n = /* @__PURE__ */ new Map(), Yf.set(e, n);
				for (var i = e.querySelectorAll("link[data-precedence],style[data-precedence]"), a = 0; a < i.length; a++) {
					var o = i[a];
					(o.nodeName === "LINK" || o.getAttribute("media") !== "not all") && (n.set(o.dataset.precedence, o), r = o);
				}
				r && n.set(null, r);
			}
			i = t.instance, o = i.getAttribute("data-precedence"), a = n.get(o) || r, a === r && n.set(null, i), n.set(o, i), this.count++, r = Jf.bind(this), i.addEventListener("load", r), i.addEventListener("error", r), a ? a.parentNode.insertBefore(i, a.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(i, e.firstChild)), t.state.loading |= 4;
		}
	}
	var Qf = {
		$$typeof: b,
		Provider: null,
		Consumer: null,
		_currentValue: F,
		_currentValue2: F,
		_threadCount: 0
	};
	function $f(e, t, n, r, i, a, o, s, c) {
		this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Be(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Be(0), this.hiddenUpdates = Be(null), this.identifierPrefix = r, this.onUncaughtError = i, this.onCaughtError = a, this.onRecoverableError = o, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = c, this.incompleteTransitions = /* @__PURE__ */ new Map();
	}
	function ep(e, t, n, r, i, a, o, s, c, l, u, d) {
		return e = new $f(e, t, n, o, c, l, u, d, s), t = 1, !0 === a && (t |= 24), a = ei(3, null, null, t), e.current = a, a.stateNode = e, t = ea(), t.refCount++, e.pooledCache = t, t.refCount++, a.memoizedState = {
			element: r,
			isDehydrated: n,
			cache: t
		}, Na(a), e;
	}
	function tp(e) {
		return e ? (e = Qr, e) : Qr;
	}
	function np(e, t, n, r, i, a) {
		i = tp(i), r.context === null ? r.context = i : r.pendingContext = i, r = Fa(t), r.payload = { element: n }, a = a === void 0 ? null : a, a !== null && (r.callback = a), n = Ia(e, r, t), n !== null && (pu(n, e, t), La(n, e, t));
	}
	function rp(e, t) {
		if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
			var n = e.retryLane;
			e.retryLane = n !== 0 && n < t ? n : t;
		}
	}
	function ip(e, t) {
		rp(e, t), (e = e.alternate) && rp(e, t);
	}
	function ap(e) {
		if (e.tag === 13 || e.tag === 31) {
			var t = Yr(e, 67108864);
			t !== null && pu(t, e, 67108864), ip(e, 67108864);
		}
	}
	function op(e) {
		if (e.tag === 13 || e.tag === 31) {
			var t = du();
			t = Ye(t);
			var n = Yr(e, t);
			n !== null && pu(n, e, t), ip(e, t);
		}
	}
	var sp = !0;
	function cp(e, t, n, r) {
		var i = N.T;
		N.T = null;
		var a = P.p;
		try {
			P.p = 2, up(e, t, n, r);
		} finally {
			P.p = a, N.T = i;
		}
	}
	function lp(e, t, n, r) {
		var i = N.T;
		N.T = null;
		var a = P.p;
		try {
			P.p = 8, up(e, t, n, r);
		} finally {
			P.p = a, N.T = i;
		}
	}
	function up(e, t, n, r) {
		if (sp) {
			var i = dp(r);
			if (i === null) Cd(e, t, r, fp, n), Cp(e, r);
			else if (Tp(i, e, t, n, r)) r.stopPropagation();
			else if (Cp(e, r), t & 4 && -1 < Sp.indexOf(e)) {
				for (; i !== null;) {
					var a = lt(i);
					if (a !== null) switch (a.tag) {
						case 3:
							if (a = a.stateNode, a.current.memoizedState.isDehydrated) {
								var o = Fe(a.pendingLanes);
								if (o !== 0) {
									var s = a;
									for (s.pendingLanes |= 2, s.entangledLanes |= 2; o;) {
										var c = 1 << 31 - Oe(o);
										s.entanglements[1] |= c, o &= ~c;
									}
									nd(a), !(X & 6) && ($l = U() + 500, rd(0, !1));
								}
							}
							break;
						case 31:
						case 13: s = Yr(a, 2), s !== null && pu(s, a, 2), vu(), ip(a, 2);
					}
					if (a = dp(r), a === null && Cd(e, t, r, fp, n), a === i) break;
					i = a;
				}
				i !== null && r.stopPropagation();
			} else Cd(e, t, r, null, n);
		}
	}
	function dp(e) {
		return e = qt(e), pp(e);
	}
	var fp = null;
	function pp(e) {
		if (fp = null, e = ct(e), e !== null) {
			var t = o(e);
			if (t === null) e = null;
			else {
				var n = t.tag;
				if (n === 13) {
					if (e = s(t), e !== null) return e;
					e = null;
				} else if (n === 31) {
					if (e = c(t), e !== null) return e;
					e = null;
				} else if (n === 3) {
					if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
					e = null;
				} else t !== e && (e = null);
			}
		}
		return fp = e, null;
	}
	function mp(e) {
		switch (e) {
			case "beforetoggle":
			case "cancel":
			case "click":
			case "close":
			case "contextmenu":
			case "copy":
			case "cut":
			case "auxclick":
			case "dblclick":
			case "dragend":
			case "dragstart":
			case "drop":
			case "focusin":
			case "focusout":
			case "input":
			case "invalid":
			case "keydown":
			case "keypress":
			case "keyup":
			case "mousedown":
			case "mouseup":
			case "paste":
			case "pause":
			case "play":
			case "pointercancel":
			case "pointerdown":
			case "pointerup":
			case "ratechange":
			case "reset":
			case "resize":
			case "seeked":
			case "submit":
			case "toggle":
			case "touchcancel":
			case "touchend":
			case "touchstart":
			case "volumechange":
			case "change":
			case "selectionchange":
			case "textInput":
			case "compositionstart":
			case "compositionend":
			case "compositionupdate":
			case "beforeblur":
			case "afterblur":
			case "beforeinput":
			case "blur":
			case "fullscreenchange":
			case "focus":
			case "hashchange":
			case "popstate":
			case "select":
			case "selectstart": return 2;
			case "drag":
			case "dragenter":
			case "dragexit":
			case "dragleave":
			case "dragover":
			case "mousemove":
			case "mouseout":
			case "mouseover":
			case "pointermove":
			case "pointerout":
			case "pointerover":
			case "scroll":
			case "touchmove":
			case "wheel":
			case "mouseenter":
			case "mouseleave":
			case "pointerenter":
			case "pointerleave": return 8;
			case "message": switch (ve()) {
				case ye: return 2;
				case W: return 8;
				case be:
				case xe: return 32;
				case Se: return 268435456;
				default: return 32;
			}
			default: return 32;
		}
	}
	var hp = !1, gp = null, _p = null, vp = null, yp = /* @__PURE__ */ new Map(), bp = /* @__PURE__ */ new Map(), xp = [], Sp = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
	function Cp(e, t) {
		switch (e) {
			case "focusin":
			case "focusout":
				gp = null;
				break;
			case "dragenter":
			case "dragleave":
				_p = null;
				break;
			case "mouseover":
			case "mouseout":
				vp = null;
				break;
			case "pointerover":
			case "pointerout":
				yp.delete(t.pointerId);
				break;
			case "gotpointercapture":
			case "lostpointercapture": bp.delete(t.pointerId);
		}
	}
	function wp(e, t, n, r, i, a) {
		return e === null || e.nativeEvent !== a ? (e = {
			blockedOn: t,
			domEventName: n,
			eventSystemFlags: r,
			nativeEvent: a,
			targetContainers: [i]
		}, t !== null && (t = lt(t), t !== null && ap(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, i !== null && t.indexOf(i) === -1 && t.push(i), e);
	}
	function Tp(e, t, n, r, i) {
		switch (t) {
			case "focusin": return gp = wp(gp, e, t, n, r, i), !0;
			case "dragenter": return _p = wp(_p, e, t, n, r, i), !0;
			case "mouseover": return vp = wp(vp, e, t, n, r, i), !0;
			case "pointerover":
				var a = i.pointerId;
				return yp.set(a, wp(yp.get(a) || null, e, t, n, r, i)), !0;
			case "gotpointercapture": return a = i.pointerId, bp.set(a, wp(bp.get(a) || null, e, t, n, r, i)), !0;
		}
		return !1;
	}
	function Ep(e) {
		var t = ct(e.target);
		if (t !== null) {
			var n = o(t);
			if (n !== null) {
				if (t = n.tag, t === 13) {
					if (t = s(n), t !== null) {
						e.blockedOn = t, Ze(e.priority, function() {
							op(n);
						});
						return;
					}
				} else if (t === 31) {
					if (t = c(n), t !== null) {
						e.blockedOn = t, Ze(e.priority, function() {
							op(n);
						});
						return;
					}
				} else if (t === 3 && n.stateNode.current.memoizedState.isDehydrated) {
					e.blockedOn = n.tag === 3 ? n.stateNode.containerInfo : null;
					return;
				}
			}
		}
		e.blockedOn = null;
	}
	function Dp(e) {
		if (e.blockedOn !== null) return !1;
		for (var t = e.targetContainers; 0 < t.length;) {
			var n = dp(e.nativeEvent);
			if (n === null) {
				n = e.nativeEvent;
				var r = new n.constructor(n.type, n);
				Kt = r, n.target.dispatchEvent(r), Kt = null;
			} else return t = lt(n), t !== null && ap(t), e.blockedOn = n, !1;
			t.shift();
		}
		return !0;
	}
	function Op(e, t, n) {
		Dp(e) && n.delete(t);
	}
	function kp() {
		hp = !1, gp !== null && Dp(gp) && (gp = null), _p !== null && Dp(_p) && (_p = null), vp !== null && Dp(vp) && (vp = null), yp.forEach(Op), bp.forEach(Op);
	}
	function Ap(e, n) {
		e.blockedOn === n && (e.blockedOn = null, hp || (hp = !0, t.unstable_scheduleCallback(t.unstable_NormalPriority, kp)));
	}
	var jp = null;
	function Mp(e) {
		jp !== e && (jp = e, t.unstable_scheduleCallback(t.unstable_NormalPriority, function() {
			jp === e && (jp = null);
			for (var t = 0; t < e.length; t += 3) {
				var n = e[t], r = e[t + 1], i = e[t + 2];
				if (typeof r != "function") {
					if (pp(r || n) === null) continue;
					break;
				}
				var a = lt(n);
				a !== null && (e.splice(t, 3), t -= 3, vs(a, {
					pending: !0,
					data: i,
					method: n.method,
					action: r
				}, r, i));
			}
		}));
	}
	function Np(e) {
		function t(t) {
			return Ap(t, e);
		}
		gp !== null && Ap(gp, e), _p !== null && Ap(_p, e), vp !== null && Ap(vp, e), yp.forEach(t), bp.forEach(t);
		for (var n = 0; n < xp.length; n++) {
			var r = xp[n];
			r.blockedOn === e && (r.blockedOn = null);
		}
		for (; 0 < xp.length && (n = xp[0], n.blockedOn === null);) Ep(n), n.blockedOn === null && xp.shift();
		if (n = (e.ownerDocument || e).$$reactFormReplay, n != null) for (r = 0; r < n.length; r += 3) {
			var i = n[r], a = n[r + 1], o = i[et] || null;
			if (typeof a == "function") o || Mp(n);
			else if (o) {
				var s = null;
				if (a && a.hasAttribute("formAction")) {
					if (i = a, o = a[et] || null) s = o.formAction;
					else if (pp(i) !== null) continue;
				} else s = o.action;
				typeof s == "function" ? n[r + 1] = s : (n.splice(r, 3), r -= 3), Mp(n);
			}
		}
	}
	function Pp() {
		function e(e) {
			e.canIntercept && e.info === "react-transition" && e.intercept({
				handler: function() {
					return new Promise(function(e) {
						return i = e;
					});
				},
				focusReset: "manual",
				scroll: "manual"
			});
		}
		function t() {
			i !== null && (i(), i = null), r || setTimeout(n, 20);
		}
		function n() {
			if (!r && !navigation.transition) {
				var e = navigation.currentEntry;
				e && e.url != null && navigation.navigate(e.url, {
					state: e.getState(),
					info: "react-transition",
					history: "replace"
				});
			}
		}
		if (typeof navigation == "object") {
			var r = !1, i = null;
			return navigation.addEventListener("navigate", e), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(n, 100), function() {
				r = !0, navigation.removeEventListener("navigate", e), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), i !== null && (i(), i = null);
			};
		}
	}
	function Fp(e) {
		this._internalRoot = e;
	}
	Ip.prototype.render = Fp.prototype.render = function(e) {
		var t = this._internalRoot;
		if (t === null) throw Error(i(409));
		var n = t.current;
		np(n, du(), e, t, null, null);
	}, Ip.prototype.unmount = Fp.prototype.unmount = function() {
		var e = this._internalRoot;
		if (e !== null) {
			this._internalRoot = null;
			var t = e.containerInfo;
			np(e.current, 2, null, e, null, null), vu(), t[tt] = null;
		}
	};
	function Ip(e) {
		this._internalRoot = e;
	}
	Ip.prototype.unstable_scheduleHydration = function(e) {
		if (e) {
			var t = G();
			e = {
				blockedOn: null,
				target: e,
				priority: t
			};
			for (var n = 0; n < xp.length && t !== 0 && t < xp[n].priority; n++);
			xp.splice(n, 0, e), n === 0 && Ep(e);
		}
	};
	var Lp = n.version;
	if (Lp !== "19.2.8") throw Error(i(527, Lp, "19.2.8"));
	P.findDOMNode = function(e) {
		var t = e._reactInternals;
		if (t === void 0) throw typeof e.render == "function" ? Error(i(188)) : (e = Object.keys(e).join(","), Error(i(268, e)));
		return e = u(t), e = e === null ? null : d(e), e = e === null ? null : e.stateNode, e;
	};
	var Rp = {
		bundleType: 0,
		version: "19.2.8",
		rendererPackageName: "react-dom",
		currentDispatcherRef: N,
		reconcilerVersion: "19.2.8"
	};
	if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
		var zp = __REACT_DEVTOOLS_GLOBAL_HOOK__;
		if (!zp.isDisabled && zp.supportsFiber) try {
			Te = zp.inject(Rp), Ee = zp;
		} catch {}
	}
	e.createRoot = function(e, t) {
		if (!a(e)) throw Error(i(299));
		var n = !1, r = "", o = Vs, s = Hs, c = Us;
		return t != null && (!0 === t.unstable_strictMode && (n = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onUncaughtError !== void 0 && (o = t.onUncaughtError), t.onCaughtError !== void 0 && (s = t.onCaughtError), t.onRecoverableError !== void 0 && (c = t.onRecoverableError)), t = ep(e, 1, !1, null, null, n, r, null, o, s, c, Pp), e[tt] = t.current, xd(e), new Fp(t);
	};
})), Xe = /* @__PURE__ */ o(((e, t) => {
	function n() {
		if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) try {
			__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
		} catch (e) {
			console.error(e);
		}
	}
	n(), t.exports = Ye();
})), G = /* @__PURE__ */ c(We(), 1), Ze = Xe();
function Qe(e = fetch) {
	return {
		acquireLock: async (t, n, r = "") => {
			try {
				return await rt(e, `/api/canvases/${encodeURIComponent(t)}/lock`, "POST", {
					client_id: n,
					username: r
				});
			} catch (e) {
				if (!(e instanceof p) || e.status !== 409) throw e;
				let t = nt(e.details);
				return {
					ok: !1,
					holder: nt(nt(t.detail).holder || t.holder)
				};
			}
		},
		checkLock: async (t) => nt(await m(e, `/api/canvases/${encodeURIComponent(t)}/lock`)),
		create: async (t = "", n = {}) => {
			let r = await rt(e, "/api/canvases", "POST", {
				title: t.trim() || void 0,
				folder_id: n.folderId || void 0,
				icon: n.icon || void 0,
				kind: n.kind || void 0
			});
			return nt(r).canvas ? nt(nt(r).canvas) : nt(r);
		},
		createFolder: async (t, n = "") => nt(await rt(e, "/api/canvas-folders", "POST", {
			name: t,
			parent_id: n
		})),
		delete: (t) => it(e, `/api/canvases/${encodeURIComponent(t)}`, "DELETE"),
		deleteBackup: (t, n) => it(e, `/api/canvases/${encodeURIComponent(t)}/backups/${encodeURIComponent(n)}`, "DELETE"),
		deleteFolder: (t) => it(e, `/api/canvas-folders/${encodeURIComponent(t)}`, "DELETE"),
		getMeta: async (t) => nt(await m(e, `/api/canvases/${encodeURIComponent(t)}/meta`)),
		list: async () => tt(await m(e, "/api/canvases")),
		listFolders: async () => {
			let t = await m(e, "/api/canvas-folders"), n = nt(t), r = Array.isArray(t) ? t : n.folders;
			return (Array.isArray(r) ? r : []).map(nt).filter((e) => e.id).map((e) => e);
		},
		listTrash: async () => tt(await m(e, "/api/canvases/trash")),
		moveToFolder: (t, n) => rt(e, `/api/canvases/${encodeURIComponent(t)}/folder`, "PATCH", { folder_id: n }).then(() => void 0),
		patchMeta: async (t, n) => {
			let r = nt(await rt(e, `/api/canvases/${encodeURIComponent(t)}/meta`, "POST", n));
			return r.canvas ? nt(r.canvas) : r;
		},
		purge: (t) => it(e, `/api/canvases/${encodeURIComponent(t)}/purge`, "DELETE"),
		releaseLock: async (t, n, r = !1) => {
			if (r) {
				await rt(e, `/api/canvases/${encodeURIComponent(t)}/lock/release`, "POST", { client_id: n }, !0);
				return;
			}
			await it(e, `/api/canvases/${encodeURIComponent(t)}/lock?client_id=${encodeURIComponent(n)}`, "DELETE");
		},
		restore: (t) => it(e, `/api/canvases/${encodeURIComponent(t)}/restore`, "POST"),
		updateFolder: async (t, n) => nt(await rt(e, `/api/canvas-folders/${encodeURIComponent(t)}`, "PATCH", n))
	};
}
var $e = Qe();
function et() {
	return $e;
}
function tt(e) {
	let t = nt(e), n = Array.isArray(e) ? e : t.canvases;
	return (Array.isArray(n) ? n : []).map(nt).filter((e) => e.id).map((e) => e);
}
function nt(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
function rt(e, t, n, r, i = !1) {
	return m(e, t, {
		method: n,
		keepalive: i,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(r ?? {})
	});
}
async function it(e, t, n) {
	await m(e, t, { method: n });
}
//#endregion
//#region node_modules/zustand/esm/vanilla.mjs
var at = (e) => {
	let t, n = /* @__PURE__ */ new Set(), r = (e, r) => {
		let i = typeof e == "function" ? e(t) : e;
		if (!Object.is(i, t)) {
			let e = t;
			t = r ?? (typeof i != "object" || !i) ? i : Object.assign({}, t, i), n.forEach((n) => n(t, e));
		}
	}, i = () => t, a = {
		setState: r,
		getState: i,
		getInitialState: () => o,
		subscribe: (e) => (n.add(e), () => n.delete(e))
	}, o = t = e(r, i, a);
	return a;
}, ot = ((e) => e ? at(e) : at), st = (e) => e;
function ct(e, t = st) {
	let n = G.useSyncExternalStore(e.subscribe, G.useCallback(() => t(e.getState()), [e, t]), G.useCallback(() => t(e.getInitialState()), [e, t]));
	return G.useDebugValue(n), n;
}
//#endregion
//#region src/canvas/domain/document-merge.ts
var lt = Symbol("missing");
function ut(e, t, n) {
	let r = Me(e), i = Me(t), a = Me(n);
	if (String(r.id || "") !== String(i.id || "") || String(i.id || "") !== String(a.id || "")) throw TypeError("Cannot merge different canvas documents");
	let o = [], s = ht(r, i, a, "", o);
	return s.nodes = ft(r.nodes, i.nodes, a.nodes, o), s.connections = gt(r.connections, i.connections, a.connections, "connections", o, yt), s.updated_at = a.updated_at, {
		conflicts: [...new Set(o)],
		document: Me(s)
	};
}
function dt(e) {
	return e.nodes.some(pt);
}
function ft(e, t, n, r) {
	let i = new Map(e.map((e) => [e.id, e])), a = new Map(t.map((e) => [e.id, e])), o = new Map(n.map((e) => [e.id, e]));
	return [...t.map(vt), ...n.map(vt)].filter((e, t, n) => n.indexOf(e) === t).flatMap((e) => {
		let t = a.get(e), n = o.get(e);
		if (t && n && pt(t)) return [{
			...Ct(t),
			images: mt(t.images, n.images)
		}];
		let s = _t(i.get(e) ?? lt, t ?? lt, n ?? lt, `nodes.${e}`, r);
		return s === lt ? [] : [Ct(s)];
	});
}
function pt(e) {
	return !!(e.running || e.pending || e.queued || Array.isArray(e.pendingTasks) && e.pendingTasks.some((e) => !!(e && typeof e == "object" && e.taskId)));
}
function mt(e, t) {
	if (!Array.isArray(e) && !Array.isArray(t)) return Array.isArray(e) ? Ct(e) : void 0;
	let n = [], r = /* @__PURE__ */ new Set();
	return [...Array.isArray(e) ? e : [], ...Array.isArray(t) ? t : []].forEach((e) => {
		let t = typeof e == "string" ? e : e && typeof e == "object" ? String(e.url || "") : "";
		t && r.has(t) || (t && r.add(t), n.push(Ct(e)));
	}), n;
}
function ht(e, t, n, r, i, a = /* @__PURE__ */ new Set([
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
		let c = _t(s in e ? e[s] : lt, s in t ? t[s] : lt, s in n ? n[s] : lt, r ? `${r}.${s}` : s, i);
		c !== lt && (o[s] = Ct(c));
	}), o;
}
function gt(e, t, n, r, i, a) {
	let o = new Map(e.map((e) => [a(e), e])), s = new Map(t.map((e) => [a(e), e])), c = new Map(n.map((e) => [a(e), e]));
	return [...n.map(a), ...t.map(a)].filter((e, t, n) => n.indexOf(e) === t).flatMap((e) => {
		let t = _t(o.get(e) ?? lt, s.get(e) ?? lt, c.get(e) ?? lt, `${r}.${e}`, i);
		return t === lt ? [] : [Ct(t)];
	});
}
function _t(e, t, n, r, i) {
	return xt(t, e) ? n : xt(n, e) || xt(t, n) ? t : bt(e) && bt(t) && bt(n) ? ht(e, t, n, r, i, /* @__PURE__ */ new Set()) : (i.push(r), t);
}
function vt(e) {
	return e.id;
}
function yt(e) {
	return String(e.id || `${e.from}->${e.to}:${e.kind || "flow"}`);
}
function bt(e) {
	return e !== lt && !!e && typeof e == "object" && !Array.isArray(e);
}
function xt(e, t) {
	return e === lt || t === lt ? e === t : St(e) === St(t);
}
function St(e) {
	return Array.isArray(e) ? `[${e.map(St).join(",")}]` : e && typeof e == "object" ? `{${Object.entries(e).sort(([e], [t]) => e.localeCompare(t)).map(([e, t]) => `${JSON.stringify(e)}:${St(t)}`).join(",")}}` : JSON.stringify(e);
}
function Ct(e) {
	return JSON.parse(JSON.stringify(e));
}
//#endregion
//#region src/canvas/stores/document-store.ts
function wt(e) {
	let t = Tt(e);
	return ot()((e, n) => ({
		document: t,
		acceptSavedDocument: (t, n) => e(({ document: e }) => !e || e.id !== t.id ? {} : e === n ? { document: t } : { document: {
			...e,
			updated_at: t.updated_at
		} }),
		adoptDocument: (t) => {
			let r = Tt(t);
			r && n().document?.id !== r.id && e({ document: r });
		},
		addNode: (t, r) => {
			let i = n().document;
			if (!i) return null;
			let a = i.nodes.length, o = `${t}_${crypto.randomUUID()}`, s = r ?? {
				x: 80 + a % 4 * 360,
				y: 160 + Math.floor(a / 4) * 280
			}, c = {
				comfy: {
					w: 420,
					h: 460,
					mode: "text",
					width: 1024,
					height: 1024,
					enhanceStrength: .5,
					enhanceUpscale: !1,
					enhanceUpscaleRes: 2048,
					editUpscale: !1,
					editUpscaleRes: 2048,
					comfyWorkflow: "",
					comfyParams: {},
					comfyRandomActive: {},
					count: 1,
					inputs: []
				},
				generator: {
					apiProvider: "",
					model: "",
					ratio: "square",
					resolution: "1k",
					quality: "auto",
					count: 1,
					customRatio: "",
					customSize: "",
					customRatioWidth: "",
					customRatioHeight: "",
					customWidth: "",
					customHeight: "",
					fitImage: !1,
					inputs: []
				},
				group: {
					w: 300,
					h: 220,
					items: []
				},
				image: {
					url: "",
					name: "空白图片",
					mediaKind: "image"
				},
				llm: {
					llmProvider: "comfly",
					model: "",
					mode: "node",
					showSystem: !1,
					systemPrompt: "You are a helpful assistant. Rewrite the input into a concise image prompt.",
					chatInput: "",
					messages: [],
					outputText: "",
					llmInputHeight: 110,
					llmOutputHeight: 150
				},
				loop: {
					count: 3,
					mode: "serial",
					showPrompt: !1,
					imageInput: !1,
					videoInput: !1,
					loopStart: 1,
					imageBatchSize: 1,
					videoBatchSize: 1,
					variablePrompt: "",
					fixedPrompt: ""
				},
				ltxDirector: {
					w: 1e3,
					h: 800,
					globalPrompt: "",
					durationFrames: 120,
					durationSeconds: 5,
					frameRate: 24,
					customWidth: 0,
					customHeight: 0,
					displayMode: "seconds",
					useCustomAudio: !1,
					imgCompression: 18,
					epsilon: .001,
					divisibleBy: 32,
					noiseSeed: 12,
					ltxTimelineData: "",
					ltxLocalPrompts: "",
					ltxSegmentLengths: "",
					ltxGuideStrength: "",
					ltxSegments: [],
					ltxSelectedSegId: "",
					inputs: []
				},
				msgen: {
					msgenModel: "zimage",
					msWidth: 1024,
					msHeight: 1024,
					msCustomModel: "Tongyi-MAI/Z-Image-Turbo",
					msRatio: "square",
					msResolution: "1k",
					msCustomRatio: "",
					msCustomSize: "",
					msCustomRatioWidth: "",
					msCustomRatioHeight: "",
					msCustomWidth: "",
					msCustomHeight: "",
					msLoraEnabled: !1,
					msLoraId: "",
					msLoraStrength: .8,
					count: 1,
					fitImage: !1,
					inputs: []
				},
				output: {
					images: [],
					imageComparisons: {}
				},
				prompt: { text: "" },
				promptGroup: {
					w: 300,
					h: 220,
					items: []
				},
				"smart-image": {
					title: "上传节点",
					images: [],
					scale: 2,
					created_at: Date.now()
				},
				video: {
					apiProvider: "comfly",
					model: "",
					duration: 5,
					aspectRatio: "16:9",
					resolution: "",
					enhancePrompt: !1,
					enableUpsample: !1,
					watermark: !1,
					cameraFixed: !1,
					generateAudio: !1,
					taskMode: "auto",
					useFrameRoles: !1,
					multimodal: !1,
					manualVideoUrls: [],
					tempShLinks: [],
					inputs: []
				}
			}, l = {
				id: o,
				type: t,
				...s,
				...c[t]
			};
			return e({ document: {
				...i,
				nodes: [...i.nodes, l]
			} }), o;
		},
		connectNodes: (t, r) => {
			let i = n().document;
			return !i || !d(i).canConnect(t, r) ? !1 : (e({ document: {
				...i,
				connections: [...i.connections, {
					from: t,
					to: r
				}]
			} }), !0);
		},
		copyNodes: (e) => {
			let t = n().document;
			if (!t) return {
				connections: [],
				nodes: []
			};
			let r = Et(t.nodes, e);
			return structuredClone({
				connections: t.connections.filter((e) => r.has(e.from) && r.has(e.to)),
				nodes: t.nodes.filter((e) => r.has(e.id))
			});
		},
		deleteConnection: (t) => e(({ document: e }) => e && t >= 0 && t < e.connections.length ? { document: {
			...e,
			connections: e.connections.filter((e, n) => n !== t)
		} } : {}),
		deleteNode: (t) => e(({ document: e }) => {
			if (!e?.nodes.some((e) => e.id === t)) return {};
			let n = Et(e.nodes, [t]);
			return { document: {
				...e,
				connections: e.connections.filter((e) => !n.has(e.from) && !n.has(e.to)),
				nodes: e.nodes.filter((e) => !n.has(e.id))
			} };
		}),
		groupPromptNodes: (t) => {
			let r = n().document;
			if (!r) return null;
			let i = r.nodes.filter((e) => t.includes(e.id) && e.type === "prompt");
			if (!i.length) return null;
			let a = `promptGroup_${crypto.randomUUID()}`, o = Math.min(...i.map((e) => Number(e.x || 0))), s = Math.min(...i.map((e) => Number(e.y || 0))), c = Math.max(...i.map((e) => Number(e.x || 0) + Number(e.w || 310))), l = Math.max(...i.map((e) => Number(e.y || 0) + Number(e.h || 230))), u = r.connections.filter((e) => i.some((t) => t.id === e.from) && !t.includes(e.to)), d = r.connections.filter((e) => !i.some((t) => t.id === e.from)).concat([...new Set(u.map((e) => e.to))].map((e) => ({
				from: a,
				to: e
			})));
			return e({ document: {
				...r,
				connections: d,
				nodes: [...r.nodes, {
					id: a,
					type: "promptGroup",
					x: o - 24,
					y: s - 58,
					w: c - o + 48,
					h: l - s + 90,
					items: i.map((e) => e.id)
				}]
			} }), a;
		},
		groupNodes: (t) => {
			let r = n().document;
			if (!r) return null;
			let i = r.nodes.filter((e) => t.includes(e.id) && ["image", "prompt"].includes(e.type));
			if (!i.length) return null;
			let a = `group_${crypto.randomUUID()}`, o = Math.min(...i.map((e) => Number(e.x || 0))), s = Math.min(...i.map((e) => Number(e.y || 0))), c = Math.max(...i.map((e) => Number(e.x || 0) + Number(e.w || (e.type === "image" ? 260 : 310)))), l = Math.max(...i.map((e) => Number(e.y || 0) + Number(e.h || (e.type === "image" ? 336 : 230)))), u = r.connections.filter((e) => i.some((t) => t.id === e.from) && !t.includes(e.to)), d = r.connections.filter((e) => !i.some((t) => t.id === e.from)).concat([...new Set(u.map((e) => e.to))].map((e) => ({
				from: a,
				to: e
			})));
			return e({ document: {
				...r,
				connections: d,
				nodes: [...r.nodes, {
					id: a,
					type: "group",
					x: o - 24,
					y: s - 58,
					w: c - o + 48,
					h: l - s + 90,
					items: i.map((e) => e.id)
				}]
			} }), a;
		},
		moveNode: (t, n, r) => e(({ document: e }) => {
			let i = e?.nodes.find((e) => e.id === t);
			if (!e || !i) return {};
			let a = Et(e.nodes, [t]), o = n - Number(i.x || 0), s = r - Number(i.y || 0);
			return { document: {
				...e,
				nodes: e.nodes.map((e) => a.has(e.id) ? {
					...e,
					x: Number(e.x || 0) + o,
					y: Number(e.y || 0) + s
				} : e)
			} };
		}),
		pasteNodes: (t) => {
			let r = n().document;
			if (!r || !t.nodes.length) return [];
			let i = new Map(t.nodes.map((e) => [e.id, `${e.type}_${crypto.randomUUID()}`])), a = structuredClone(t.nodes).map((e) => ({
				...e,
				id: i.get(e.id),
				x: Number(e.x || 0) + 32,
				y: Number(e.y || 0) + 32,
				...Array.isArray(e.items) ? { items: e.items.map((e) => i.get(String(e)) ?? e) } : {}
			})), o = structuredClone(t.connections).map((e) => ({
				...e,
				from: i.get(e.from),
				to: i.get(e.to)
			})).filter((e) => e.from && e.to);
			return e({ document: {
				...r,
				connections: [...r.connections, ...o],
				nodes: [...r.nodes, ...a]
			} }), a.map((e) => e.id);
		},
		projectDocument: (t) => {
			let n = Tt(t);
			n && e({ document: n });
		},
		projectExecutionDocument: (t) => {
			let r = Tt(t), i = n().document;
			if (!i || !r || i.id !== r.id) return;
			let a = new Set(i.nodes.map((e) => e.id)), o = new Map(r.nodes.map((e) => [e.id, e])), s = r.nodes.filter((e) => e.type === "output" && !a.has(e.id)), c = new Set(s.map((e) => e.id)), l = [
				"_cascadeFailed",
				"_pending",
				"generatedOutputs",
				"imageComparisons",
				"images",
				"messages",
				"outputKind",
				"outputLayout",
				"outputText",
				"pending",
				"pendingTaskId",
				"pendingTasks",
				"queued",
				"runElapsedMs",
				"runError",
				"runFinishedAt",
				"running",
				"runStatus"
			], u = i.nodes.map((e) => {
				let t = o.get(e.id);
				if (!t) return e;
				let n = {};
				return l.forEach((r) => {
					r in t ? n[r] = structuredClone(t[r]) : r in e && (n[r] = void 0);
				}), {
					...e,
					...n
				};
			}), d = new Set(i.connections.map((e) => `${e.from}\u0000${e.to}\u0000${String(e.kind || "")}`)), f = r.connections.filter((e) => (c.has(e.from) || c.has(e.to)) && !d.has(`${e.from}\u0000${e.to}\u0000${String(e.kind || "")}`));
			e({ document: {
				...i,
				...Array.isArray(r.logs) ? { logs: structuredClone(r.logs) } : {},
				connections: [...i.connections, ...structuredClone(f)],
				nodes: [...u, ...structuredClone(s)],
				updated_at: r.updated_at ?? i.updated_at
			} });
		},
		updateNode: (t, n) => e(({ document: e }) => {
			if (!e?.nodes.some((e) => e.id === t)) return {};
			let r = {
				...e,
				nodes: e.nodes.map((e) => e.id === t ? {
					...e,
					...n,
					id: e.id,
					type: e.type
				} : e)
			}, i = d(r);
			return { document: {
				...r,
				connections: r.connections.filter((e) => i.canConnect(e.from, e.to, !0))
			} };
		})
	}));
}
function Tt(e) {
	if (!e) return null;
	try {
		return Me(e);
	} catch {
		return null;
	}
}
function Et(e, t) {
	let n = /* @__PURE__ */ new Set(), r = (t) => {
		if (n.has(t)) return;
		n.add(t);
		let i = e.find((e) => e.id === t);
		(i?.type === "group" || i?.type === "promptGroup") && Array.isArray(i.items) && i.items.forEach((e) => r(String(e)));
	};
	return t.forEach(r), n;
}
//#endregion
//#region src/canvas/domain/image-transform.ts
var Dt = Je();
function Ot(e, t) {
	let n = Pt(t.width), r = Pt(t.height), i = Ft(e.x, 0, n - 1), a = Ft(e.y, 0, r - 1);
	return {
		x: i,
		y: a,
		width: Ft(e.width, 1, n - i),
		height: Ft(e.height, 1, r - a)
	};
}
function kt(e, t, n = 4096) {
	let r = Pt(t.width), i = Pt(t.height), a = Ft(e.width, r, Math.max(r, n)), o = Ft(e.height, i, Math.max(i, n));
	return {
		width: a,
		height: o,
		offsetX: Ft(e.offsetX, 0, a - r),
		offsetY: Ft(e.offsetY, 0, o - i)
	};
}
function At(e, t) {
	return `${String(e || "image").replace(/\.[^.]+$/, "") || "image"}_${t}.png`;
}
function jt(e) {
	let t = new Uint8ClampedArray(e.length);
	for (let n = 0; n < e.length; n += 4) {
		let r = e[n + 3] > 8 ? 255 : 0;
		t[n] = r, t[n + 1] = r, t[n + 2] = r, t[n + 3] = 255;
	}
	return t;
}
function Mt(e) {
	let t = Math.max(1, Math.round(Number(e) || 1));
	return t <= 20 ? String.fromCharCode(9312 + t - 1) : String(t);
}
function Nt(e, t, n = {}) {
	let r = Pt(e), i = Pt(t), a = Math.max(0, Math.min(240, Number(n.gap) || 0)) / 2, o = Array.isArray(n.lines), s = o ? [...new Set(n.lines.filter((e) => e.type === "h").map((e) => Math.max(.001, Math.min(.999, Number(e.pos) || .001)) * i))].sort((e, t) => e - t) : Array.from({ length: Math.max(1, Math.min(21, Math.round(Number(n.rows) || 1))) - 1 }, (e, t) => (t + 1) * i / Math.max(1, Math.min(21, Math.round(Number(n.rows) || 1)))), c = o ? [...new Set(n.lines.filter((e) => e.type === "v").map((e) => Math.max(.001, Math.min(.999, Number(e.pos) || .001)) * r))].sort((e, t) => e - t) : Array.from({ length: Math.max(1, Math.min(21, Math.round(Number(n.cols) || 1))) - 1 }, (e, t) => (t + 1) * r / Math.max(1, Math.min(21, Math.round(Number(n.cols) || 1)))), l = [
		0,
		...s,
		i
	], u = [
		0,
		...c,
		r
	], d = [];
	for (let e = 0; e < l.length - 1; e += 1) {
		let t = Math.round(e === 0 ? l[e] : l[e] + a), n = Math.round(e === l.length - 2 ? l[e + 1] : l[e + 1] - a);
		for (let r = 0; r < u.length - 1; r += 1) {
			let i = Math.round(r === 0 ? u[r] : u[r] + a), o = Math.round(r === u.length - 2 ? u[r + 1] : u[r + 1] - a);
			o > i && n > t && d.push({
				row: e,
				col: r,
				x: i,
				y: t,
				w: o - i,
				h: n - t
			});
		}
	}
	return d;
}
function Pt(e) {
	return Math.max(1, Math.round(Number(e) || 1));
}
function Ft(e, t, n) {
	return Math.min(n, Math.max(t, Math.round(Number(e) || 0)));
}
//#endregion
//#region node_modules/react/cjs/react-jsx-runtime.production.js
var It = /* @__PURE__ */ o(((e) => {
	var t = Symbol.for("react.transitional.element"), n = Symbol.for("react.fragment");
	function r(e, n, r) {
		var i = null;
		if (r !== void 0 && (i = "" + r), n.key !== void 0 && (i = "" + n.key), "key" in n) for (var a in r = {}, n) a !== "key" && (r[a] = n[a]);
		else r = n;
		return n = r.ref, {
			$$typeof: t,
			type: e,
			key: i,
			ref: n === void 0 ? null : n,
			props: r
		};
	}
	e.Fragment = n, e.jsx = r, e.jsxs = r;
})), K = (/* @__PURE__ */ o(((e, t) => {
	t.exports = It();
})))();
function Lt({ name: e, onApply: t, onClose: n, url: r }) {
	let [i, a] = (0, G.useState)(null), o = (0, G.useRef)(null), [s, c] = (0, G.useState)("crop"), [l, u] = (0, G.useState)({
		x: 0,
		y: 0,
		width: 1,
		height: 1
	}), [d, f] = (0, G.useState)({
		offsetX: 0,
		offsetY: 0,
		width: 1,
		height: 1
	}), [p, m] = (0, G.useState)(!1), [h, g] = (0, G.useState)("");
	(0, G.useEffect)(() => {
		let e = !1, t = new Image();
		return /^https?:/i.test(r) && (t.crossOrigin = "anonymous"), t.onload = () => {
			if (e) return;
			let n = {
				width: t.naturalWidth,
				height: t.naturalHeight
			};
			o.current = t, a(n), u({
				x: 0,
				y: 0,
				...n
			}), f({
				offsetX: 0,
				offsetY: 0,
				...n
			});
		}, t.onerror = () => {
			e || g("无法读取图片，远程图片可能不允许跨域编辑");
		}, t.src = r, () => {
			e = !0, o.current = null, t.src = "";
		};
	}, [r]);
	let _ = async () => {
		let r = o.current;
		if (!r || !i) {
			g("图片尚未加载完成");
			return;
		}
		m(!0), g("正在生成 PNG…");
		try {
			let a = document.createElement("canvas"), o = a.getContext("2d");
			if (!o) throw Error("当前浏览器无法创建图片编辑画布");
			if (s === "crop") {
				let e = Ot(l, i);
				a.width = e.width, a.height = e.height, o.drawImage(r, e.x, e.y, e.width, e.height, 0, 0, e.width, e.height);
			} else {
				let e = kt(d, i);
				a.width = e.width, a.height = e.height, o.fillStyle = "#ffffff", o.fillRect(0, 0, e.width, e.height), o.drawImage(r, e.offsetX, e.offsetY, i.width, i.height);
			}
			let c = await Rt(a);
			g("正在上传编辑结果…"), await t({
				blob: c,
				height: a.height,
				mode: s,
				name: At(e, s),
				width: a.width
			}), n();
		} catch (e) {
			let t = e instanceof Error ? e.message || e.name || "图片转换失败" : String(e) || "图片转换失败";
			g(t);
		} finally {
			m(!1);
		}
	}, v = (e, t, n, r = 0) => /* @__PURE__ */ (0, K.jsxs)("label", {
		className: "field",
		children: [/* @__PURE__ */ (0, K.jsx)("span", { children: e }), /* @__PURE__ */ (0, K.jsx)("input", {
			"aria-label": e,
			className: "setting-input",
			min: r,
			onChange: (e) => n(Number(e.target.value)),
			type: "number",
			value: t
		})]
	});
	return (0, Dt.createPortal)(/* @__PURE__ */ (0, K.jsx)("div", {
		className: "modal open canvas-image-transform",
		onClick: n,
		onPointerDown: (e) => e.stopPropagation(),
		role: "dialog",
		children: /* @__PURE__ */ (0, K.jsxs)("section", {
			className: "modal-panel",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, K.jsxs)("header", { children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: "编辑图片" }), /* @__PURE__ */ (0, K.jsx)("button", {
					disabled: p,
					onClick: n,
					type: "button",
					children: "关闭"
				})] }),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "mode-tabs",
					children: [/* @__PURE__ */ (0, K.jsx)("button", {
						className: s === "crop" ? "active" : "",
						onClick: () => c("crop"),
						type: "button",
						children: "裁剪"
					}), /* @__PURE__ */ (0, K.jsx)("button", {
						className: s === "outpaint" ? "active" : "",
						onClick: () => c("outpaint"),
						type: "button",
						children: "扩图"
					})]
				}),
				/* @__PURE__ */ (0, K.jsx)("img", {
					alt: "图片编辑预览",
					className: "canvas-image-transform-preview",
					src: r
				}),
				i ? /* @__PURE__ */ (0, K.jsxs)("p", { children: [
					i.width,
					" × ",
					i.height,
					"px"
				] }) : /* @__PURE__ */ (0, K.jsx)("p", { children: "正在读取图片…" }),
				s === "crop" ? /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "canvas-image-transform-fields",
					children: [
						v("裁剪 X", l.x, (e) => u((t) => ({
							...t,
							x: e
						}))),
						v("裁剪 Y", l.y, (e) => u((t) => ({
							...t,
							y: e
						}))),
						v("裁剪宽度", l.width, (e) => u((t) => ({
							...t,
							width: e
						})), 1),
						v("裁剪高度", l.height, (e) => u((t) => ({
							...t,
							height: e
						})), 1)
					]
				}) : /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "canvas-image-transform-fields",
					children: [
						v("扩图宽度", d.width, (e) => f((t) => ({
							...t,
							width: e
						})), i?.width || 1),
						v("扩图高度", d.height, (e) => f((t) => ({
							...t,
							height: e
						})), i?.height || 1),
						v("原图 X 偏移", d.offsetX, (e) => f((t) => ({
							...t,
							offsetX: e
						}))),
						v("原图 Y 偏移", d.offsetY, (e) => f((t) => ({
							...t,
							offsetY: e
						})))
					]
				}),
				h ? /* @__PURE__ */ (0, K.jsx)("small", {
					"data-testid": "image-transform-status",
					children: h
				}) : null,
				/* @__PURE__ */ (0, K.jsx)("button", {
					className: "primary-btn",
					disabled: !i || p,
					onClick: () => void _(),
					type: "button",
					children: p ? "正在上传…" : s === "crop" ? "应用裁剪" : "应用扩图"
				})
			]
		})
	}), document.body);
}
function Rt(e) {
	return new Promise((t, n) => e.toBlob((e) => e ? t(e) : n(/* @__PURE__ */ Error("无法生成编辑后的 PNG 图片")), "image/png"));
}
//#endregion
//#region src/canvas/ui/legacy-image-transform-dialog.tsx
var zt = [];
function Bt({ initialMode: e = "crop", joinItems: t = zt, name: n, onApply: r, onClose: i, onCreateMask: a, onGridJoin: o, onGridSplit: s, url: c }) {
	let l = (0, G.useRef)(null), u = (0, G.useRef)(null), d = (0, G.useRef)(null), f = (0, G.useRef)(null), p = (0, G.useRef)(null), m = (0, G.useRef)(null), h = (0, G.useRef)([]), g = (0, G.useRef)([]), _ = (0, G.useRef)(1), v = (0, G.useRef)(null), y = (0, G.useRef)(null), b = (0, G.useRef)(null), x = (0, G.useRef)([]), [S, C] = (0, G.useState)(e), [w, T] = (0, G.useState)(null), [E, D] = (0, G.useState)({
		width: 1,
		height: 1
	}), [O, k] = (0, G.useState)({
		width: 1,
		height: 1
	}), [A, j] = (0, G.useState)({
		x: 0,
		y: 0,
		width: 1,
		height: 1
	}), [M, N] = (0, G.useState)({
		offsetX: 0,
		offsetY: 0,
		width: 1,
		height: 1
	}), [P, F] = (0, G.useState)(1), [I, ee] = (0, G.useState)("free"), [te, L] = (0, G.useState)("#ff2d55"), [R, z] = (0, G.useState)(42), [B, ne] = (0, G.useState)(14), [re, ie] = (0, G.useState)([]), [ae, V] = (0, G.useState)(""), [oe, se] = (0, G.useState)(3), [ce, H] = (0, G.useState)(3), [le, ue] = (0, G.useState)(0), [de, fe] = (0, G.useState)(!1), [pe, me] = (0, G.useState)("h"), [he, ge] = (0, G.useState)([]), [_e, U] = (0, G.useState)(0), [ve, ye] = (0, G.useState)("split"), [W, be] = (0, G.useState)(() => t.map((e, t) => t)), [xe, Se] = (0, G.useState)(() => Math.max(1, Math.ceil(t.length / Math.max(1, Math.ceil(Math.sqrt(Math.max(1, t.length))))))), [Ce, we] = (0, G.useState)(() => Math.max(1, Math.ceil(Math.sqrt(Math.max(1, t.length))))), [Te, Ee] = (0, G.useState)(2048), [De, Oe] = (0, G.useState)({
		x: 0,
		y: 0
	}), [ke, Ae] = (0, G.useState)(0), [je, Me] = (0, G.useState)(!1), [Ne, Pe] = (0, G.useState)(""), Fe = (0, G.useMemo)(() => ({
		width: Math.max(1, E.width * P),
		height: Math.max(1, E.height * P)
	}), [E, P]), Ie = w ? Fe.width / w.width : 1, Le = w ? Fe.height / w.height : 1, Re = (0, G.useMemo)(() => t.filter((e) => e?.url), [t]), ze = (0, G.useMemo)(() => Qt(Re, W, xe, Ce, le), [
		le,
		Ce,
		W,
		xe,
		Re
	]), Be = S === "grid" && ve === "join" ? {
		width: ze.width * P,
		height: ze.height * P
	} : S === "outpaint" ? {
		width: M.width * Ie,
		height: M.height * Le
	} : Fe;
	(0, G.useEffect)(() => {
		Pe(""), T(null), F(1), p.current = null, m.current = null, h.current = [], g.current = [], _.current = 1, ie([]), V(""), v.current = null, x.current = [], se(3), H(3), ue(0), fe(!1), me("h"), ge([]), C(e), ye("split"), be(t.map((e, t) => t));
		let n = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, t.length))));
		we(n), Se(Math.max(1, Math.ceil(t.length / n))), Ee(2048), U((e) => e + 1), Ae((e) => e + 1);
	}, [
		e,
		t,
		c
	]), (0, G.useEffect)(() => {
		let e = f.current;
		if (!e) return;
		let t = () => k({
			width: e.clientWidth,
			height: e.clientHeight
		});
		t();
		let n = new ResizeObserver(t);
		return n.observe(e), () => n.disconnect();
	}, []), (0, G.useEffect)(() => {
		window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [S, je]), (0, G.useEffect)(() => {
		let e = d.current;
		if (!e) return;
		let t = e.getContext("2d");
		t && (t.clearRect(0, 0, e.width, e.height), re.forEach((e) => {
			t.save(), t.font = `800 ${e.size}px Arial, sans-serif`, t.textAlign = "center", t.textBaseline = "middle", t.lineWidth = Math.max(2, e.size / 10), t.strokeStyle = "rgba(255,255,255,0.92)", t.strokeText(e.text, e.x, e.y), t.fillStyle = e.color, t.fillText(e.text, e.x, e.y), t.restore();
		}));
	}, [re, w]), (0, G.useEffect)(() => {
		if (!w) return;
		let e = u.current, t = d.current;
		!e || !t || (e.width = w.width, e.height = w.height, t.width = w.width, t.height = w.height, h.current = [], g.current = [], _.current = 1, ie([]), Ae((e) => e + 1));
	}, [w]), (0, G.useEffect)(() => {
		if (S !== "grid" || !w) return;
		let e = u.current, t = e?.getContext("2d");
		!e || !t || (t.clearRect(0, 0, e.width, e.height), t.save(), t.strokeStyle = "rgba(248,250,252,.96)", t.lineWidth = Math.max(1, Math.min(e.width, e.height) / 420), t.setLineDash([8, 6]), (de ? he : [...Array.from({ length: oe - 1 }, (e, t) => ({
			type: "h",
			pos: (t + 1) / oe
		})), ...Array.from({ length: ce - 1 }, (e, t) => ({
			type: "v",
			pos: (t + 1) / ce
		}))]).forEach((n) => {
			let r = n.pos * (n.type === "h" ? e.height : e.width), i = (i) => {
				t.beginPath(), n.type === "h" ? (t.moveTo(0, r + i), t.lineTo(e.width, r + i)) : (t.moveTo(r + i, 0), t.lineTo(r + i, e.height)), t.stroke();
			};
			le > 0 ? (i(-le / 2), i(le / 2)) : i(0);
		}), t.restore());
	}, [
		ce,
		de,
		le,
		he,
		oe,
		_e,
		S,
		w
	]), (0, G.useEffect)(() => {
		let e = (e) => {
			let t = p.current;
			if (!t || !w) return;
			let n = (e.clientX - t.startX) / Math.max(Ie, 1e-4), r = (e.clientY - t.startY) / Math.max(Le, 1e-4);
			if (t.mode === "crop-move") j(Xt({
				...t.startCrop,
				x: t.startCrop.x + n,
				y: t.startCrop.y + r
			}, w));
			else if (t.mode === "crop-resize") j(Xt({
				...t.startCrop,
				width: t.startCrop.width + n,
				height: t.startCrop.height + r
			}, w));
			else if (t.mode === "image") N(Zt({
				...t.startOutpaint,
				offsetX: t.startOutpaint.offsetX + n,
				offsetY: t.startOutpaint.offsetY + r
			}, w));
			else {
				let e = t.mode === "outpaint-left" ? -n : t.mode === "outpaint-right" || t.mode === "outpaint-corner" ? n : 0, i = t.mode === "outpaint-top" ? -r : t.mode === "outpaint-bottom" || t.mode === "outpaint-corner" ? r : 0, a = Math.max(w.width, t.startOutpaint.width + e * 2), o = Math.max(w.height, t.startOutpaint.height + i * 2);
				N(Zt({
					width: a,
					height: o,
					offsetX: t.startOutpaint.offsetX + (a - t.startOutpaint.width) / 2,
					offsetY: t.startOutpaint.offsetY + (o - t.startOutpaint.height) / 2
				}, w));
			}
		}, t = () => {
			p.current = null;
		};
		return window.addEventListener("pointermove", e), window.addEventListener("pointerup", t), window.addEventListener("pointercancel", t), () => {
			window.removeEventListener("pointermove", e), window.removeEventListener("pointerup", t), window.removeEventListener("pointercancel", t);
		};
	}, [
		Ie,
		Le,
		w
	]);
	let Ve = (e = S) => {
		w && (e === "outpaint" ? N({
			offsetX: 0,
			offsetY: 0,
			width: w.width,
			height: w.height
		}) : j({
			x: w.width * .08,
			y: w.height * .08,
			width: w.width * .84,
			height: w.height * .84
		}));
	}, He = (e) => {
		S === "grid" && e !== "grid" && Ye(!0), C(e), Ve(e), V(""), (e === "preview" || e === "crop" || e === "grid") && Ye(!0);
	}, Ue = (e, t) => {
		!w || je || (e.preventDefault(), e.stopPropagation(), p.current = {
			mode: t,
			startCrop: A,
			startOutpaint: M,
			startX: e.clientX,
			startY: e.clientY
		});
	}, We = () => {
		let e = u.current, t = e?.getContext("2d");
		return !e || !t ? null : {
			imageData: t.getImageData(0, 0, e.width, e.height),
			labelCounter: _.current,
			textItems: re.map((e) => ({ ...e }))
		};
	}, Ge = (e) => {
		let t = u.current, n = t?.getContext("2d");
		!t || !n || !e || (n.putImageData(e.imageData, 0, 0), _.current = e.labelCounter, ie(e.textItems.map((e) => ({ ...e }))), V(""));
	}, Ke = () => {
		let e = We();
		e && (h.current = [...h.current.slice(-19), e], g.current = [], Ae((e) => e + 1));
	}, qe = () => {
		let e = h.current.pop(), t = We();
		!e || !t || (g.current.push(t), Ge(e), Ae((e) => e + 1));
	}, Je = () => {
		let e = g.current.pop(), t = We();
		!e || !t || (h.current.push(t), Ge(e), Ae((e) => e + 1));
	}, Ye = (e = !1) => {
		let t = u.current, n = t?.getContext("2d");
		!t || !n || (!e && (qt(t) || re.length) && Ke(), n.clearRect(0, 0, t.width, t.height), _.current = 1, ie([]), V(""), Ae((e) => e + 1));
	}, Xe = (e) => {
		let t = e.currentTarget, n = t.getBoundingClientRect();
		return {
			x: (e.clientX - n.left) * t.width / Math.max(1, n.width),
			y: (e.clientY - n.top) * t.height / Math.max(1, n.height)
		};
	}, Ze = (e) => {
		e.lineCap = "round", e.lineJoin = "round", e.lineWidth = S === "mask" ? R : B, e.strokeStyle = S === "mask" ? "rgba(255,255,255,0.451)" : te, e.fillStyle = e.strokeStyle, e.globalCompositeOperation = "source-over";
	}, Qe = (e) => {
		if (S === "grid") {
			if (!de || je) return;
			e.preventDefault(), e.stopPropagation();
			let t = e.currentTarget, n = Xe(e), r = Math.max(8, Math.min(t.width, t.height) / 80), i = -1, a = Infinity;
			he.forEach((e, o) => {
				let s = e.type === "h" ? Math.abs(n.y - e.pos * t.height) : Math.abs(n.x - e.pos * t.width);
				s <= r && s < a && (i = o, a = s);
			}), x.current.push(he.map((e) => ({ ...e })));
			let o = {
				type: pe,
				pos: pe === "h" ? n.y / t.height : n.x / t.width
			}, s = i >= 0 ? i : he.length;
			ge((e) => i >= 0 ? e.map((e, t) => t === i ? {
				...e,
				pos: o.pos
			} : e) : [...e, o]), v.current = {
				index: s,
				pointerId: e.pointerId
			}, t.setPointerCapture(e.pointerId), U((e) => e + 1);
			return;
		}
		if (!["brush", "mask"].includes(S) || je || S === "brush" && I === "text") return;
		e.preventDefault(), e.stopPropagation();
		let t = e.currentTarget, n = t.getContext("2d");
		if (!n) return;
		let r = Xe(e);
		if (Ke(), t.setPointerCapture(e.pointerId), Ze(n), S === "brush" && I === "label") {
			let i = Math.max(18, B * 2.2), a = Mt(_.current++);
			n.save(), n.font = `900 ${i}px Arial, sans-serif`, n.textAlign = "center", n.textBaseline = "middle", n.lineWidth = Math.max(3, i / 8), n.strokeStyle = "rgba(255,255,255,0.92)", n.strokeText(a, r.x, r.y), n.fillStyle = te, n.fillText(a, r.x, r.y), n.restore(), t.releasePointerCapture(e.pointerId), Ae((e) => e + 1);
			return;
		}
		let i = I === "rect" || I === "ellipse" ? n.getImageData(0, 0, t.width, t.height) : void 0;
		m.current = {
			imageData: i,
			lastX: r.x,
			lastY: r.y,
			pointerId: e.pointerId,
			startX: r.x,
			startY: r.y
		}, n.beginPath(), n.moveTo(r.x, r.y), n.lineTo(r.x + .01, r.y + .01), (S === "mask" || I === "free") && n.stroke(), S === "mask" && Jt(t);
	}, $e = (e) => {
		let t = v.current;
		if (S === "grid" && de && t?.pointerId === e.pointerId) {
			e.preventDefault();
			let n = Xe(e);
			ge((r) => r.map((r, i) => i === t.index ? {
				...r,
				pos: Math.max(.001, Math.min(.999, r.type === "h" ? n.y / e.currentTarget.height : n.x / e.currentTarget.width))
			} : r));
			return;
		}
		let n = m.current;
		if (!n || n.pointerId !== e.pointerId) return;
		e.preventDefault();
		let r = e.currentTarget, i = r.getContext("2d");
		if (!i) return;
		let a = Xe(e);
		if (S === "brush" && I !== "free" && n.imageData) {
			i.putImageData(n.imageData, 0, 0), Ze(i);
			let e = Math.min(n.startX, a.x), t = Math.min(n.startY, a.y), r = Math.abs(a.x - n.startX), o = Math.abs(a.y - n.startY);
			I === "rect" ? i.strokeRect(e, t, r, o) : I === "ellipse" && (i.beginPath(), i.ellipse(e + r / 2, t + o / 2, Math.max(1, r / 2), Math.max(1, o / 2), 0, 0, Math.PI * 2), i.stroke());
			return;
		}
		Ze(i), i.beginPath(), i.moveTo(n.lastX, n.lastY), i.lineTo(a.x, a.y), i.stroke(), n.lastX = a.x, n.lastY = a.y, S === "mask" && Jt(r);
	}, et = (e) => {
		v.current?.pointerId === e.pointerId && (v.current = null, e.currentTarget.releasePointerCapture(e.pointerId), U((e) => e + 1)), m.current?.pointerId === e.pointerId && (m.current = null, e.currentTarget.releasePointerCapture(e.pointerId), Ae((e) => e + 1));
	}, tt = (e) => {
		if (S !== "brush" || I !== "text" || je) return;
		e.preventDefault(), e.stopPropagation();
		let t = Xe(e), n = [...re].reverse().find((e) => Math.abs(e.x - t.x) <= Math.max(30, e.text.length * e.size * .35) && Math.abs(e.y - t.y) <= e.size);
		if (n) {
			V(n.id);
			return;
		}
		Ke();
		let r = {
			color: te,
			id: `text_${crypto.randomUUID?.() || Date.now()}`,
			size: Math.max(12, B * 2),
			text: "文字",
			x: t.x,
			y: t.y
		};
		ie((e) => [...e, r]), V(r.id);
	}, nt = async () => {
		let e = l.current;
		if (!(!e || !w || S === "preview")) {
			Me(!0), Pe("正在生成 PNG…");
			try {
				let t = document.createElement("canvas"), c = t.getContext("2d");
				if (!c) throw Error("当前浏览器无法创建图片编辑画布");
				if (S === "crop") {
					let n = Xt(A, w);
					t.width = Math.max(1, Math.round(n.width)), t.height = Math.max(1, Math.round(n.height)), c.drawImage(e, Math.round(n.x), Math.round(n.y), t.width, t.height, 0, 0, t.width, t.height);
				} else if (S === "outpaint") {
					let n = Zt(M, w);
					t.width = Math.max(1, Math.round(n.width)), t.height = Math.max(1, Math.round(n.height)), c.fillStyle = "#ffffff", c.fillRect(0, 0, t.width, t.height), c.drawImage(e, Math.round(n.offsetX), Math.round(n.offsetY), w.width, w.height);
				} else if (S === "grid") {
					if (ve === "join") {
						if (Re.length <= 1 || !o) throw Error("请从包含多张图片的分组打开宫格拼接");
						Pe("正在生成拼接图片…");
						let e = await $t(Re, ze, Te, n);
						Pe("正在上传拼接图片…"), await o(e), i();
						return;
					}
					let t = Nt(w.width, w.height, de ? {
						gap: le,
						lines: he
					} : {
						cols: ce,
						gap: le,
						rows: oe
					});
					if (!t.length) throw Error("当前切割线没有产生有效图片");
					let r = String(n || "image").replace(/\.[^.]+$/, "") || "image", a = [];
					for (let n of t) {
						let t = document.createElement("canvas");
						t.width = n.w, t.height = n.h, t.getContext("2d")?.drawImage(e, n.x, n.y, n.w, n.h, 0, 0, n.w, n.h), a.push({
							blob: await nn(t),
							name: `${r}_r${n.row + 1}_c${n.col + 1}.png`,
							rect: n
						});
					}
					Pe(`正在上传 ${a.length} 张切分图片…`), await s({
						items: a,
						layout: {
							cols: Math.max(1, ...t.map((e) => e.col + 1)),
							groupId: `grid_${crypto.randomUUID?.() || Date.now()}`,
							rows: Math.max(1, ...t.map((e) => e.row + 1)),
							type: "grid-split"
						}
					}), i();
					return;
				} else if (S === "mask") {
					let e = u.current, r = e?.getContext("2d");
					if (!e || !r || !qt(e)) throw Error("请先绘制遮罩区域");
					let o = jt(r.getImageData(0, 0, e.width, e.height).data);
					t.width = e.width, t.height = e.height;
					let s = c.createImageData(t.width, t.height);
					s.data.set(o), c.putImageData(s, 0, 0);
					let l = await nn(t);
					Pe("正在上传遮罩…"), await a({
						blob: l,
						height: t.height,
						name: Yt(n, "mask"),
						width: t.width
					}), i();
					return;
				} else {
					let n = u.current, r = d.current;
					if (!n || !r || !qt(n) && !re.length) throw Error("请先绘制图片内容");
					t.width = w.width, t.height = w.height, c.drawImage(e, 0, 0, w.width, w.height), c.drawImage(n, 0, 0), c.drawImage(r, 0, 0);
				}
				let l = await nn(t);
				Pe("正在上传编辑结果…"), await r({
					blob: l,
					height: t.height,
					mode: S,
					name: S === "brush" ? Yt(n, "paint") : At(n, S),
					width: t.width
				}), i();
			} catch (e) {
				Pe(e instanceof Error ? e.message || e.name || "图片转换失败" : String(e) || "图片转换失败");
			} finally {
				Me(!1);
			}
		}
	}, rt = (e, t) => {
		fe(!1), se(e), H(t), ge([]), x.current = [], U((e) => e + 1);
	}, it = (e, t) => {
		Se(e), we(t);
	}, at = (e, t) => {
		je || ve !== "join" || (e.preventDefault(), e.stopPropagation(), e.currentTarget.setPointerCapture(e.pointerId), b.current = {
			clientX: e.clientX,
			clientY: e.clientY,
			index: t,
			pointerId: e.pointerId
		}, Oe({
			x: 0,
			y: 0
		}));
	}, ot = (e) => {
		let t = b.current;
		!t || t.pointerId !== e.pointerId || (e.preventDefault(), e.stopPropagation(), Oe({
			x: e.clientX - t.clientX,
			y: e.clientY - t.clientY
		}));
	}, st = (e) => {
		let t = b.current;
		if (!t || t.pointerId !== e.pointerId) return;
		let n = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-grid-join-index]"), r = Number(n?.dataset.gridJoinIndex);
		Number.isInteger(r) && r !== t.index && be((e) => {
			let n = [...e], i = n.indexOf(t.index), a = n.indexOf(r);
			return i >= 0 && a >= 0 && ([n[i], n[a]] = [n[a], n[i]]), n;
		}), b.current = null, Oe({
			x: 0,
			y: 0
		}), e.currentTarget.releasePointerCapture?.(e.pointerId);
	}, ct = () => {
		let e = x.current.pop();
		e && (ge(e), U((e) => e + 1));
	}, lt = ke >= 0 && h.current.length > 0, ut = ke >= 0 && g.current.length > 0, dt = re.find((e) => e.id === ae);
	return /* @__PURE__ */ (0, K.jsx)("div", {
		"aria-label": "编辑图片",
		"aria-modal": "true",
		className: "image-edit-modal open canvas-modern-image-edit",
		onClick: i,
		role: "dialog",
		style: { zIndex: 1100 },
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "image-edit-panel",
			onClick: (e) => e.stopPropagation(),
			onPointerDown: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "image-edit-head",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "image-edit-headline",
							children: [/* @__PURE__ */ (0, K.jsx)("div", {
								className: "image-edit-title",
								children: Ut(S)
							}), /* @__PURE__ */ (0, K.jsx)("div", {
								className: "image-edit-sub",
								children: Wt(S)
							})]
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "image-edit-mode",
							children: [
								/* @__PURE__ */ (0, K.jsx)(Vt, {
									active: S === "preview",
									icon: "eye",
									label: "预览",
									onClick: () => He("preview")
								}),
								/* @__PURE__ */ (0, K.jsx)(Vt, {
									active: S === "crop",
									icon: "crop",
									label: "裁剪",
									onClick: () => He("crop")
								}),
								/* @__PURE__ */ (0, K.jsx)(Vt, {
									active: S === "outpaint",
									icon: "expand",
									label: "扩图",
									onClick: () => He("outpaint")
								}),
								/* @__PURE__ */ (0, K.jsx)(Vt, {
									active: S === "mask",
									icon: "brush",
									label: "遮罩",
									onClick: () => He("mask")
								}),
								/* @__PURE__ */ (0, K.jsx)(Vt, {
									active: S === "brush",
									icon: "paintbrush",
									label: "画笔",
									onClick: () => He("brush")
								}),
								/* @__PURE__ */ (0, K.jsx)(Vt, {
									active: S === "grid",
									icon: "grid-3x3",
									label: "宫格切分",
									onClick: () => He("grid")
								})
							]
						}),
						/* @__PURE__ */ (0, K.jsx)("div", {
							className: "image-edit-head-end",
							children: /* @__PURE__ */ (0, K.jsx)("button", {
								"aria-label": "关闭",
								className: "preview-icon-btn",
								disabled: je,
								onClick: i,
								title: "关闭",
								type: "button",
								children: /* @__PURE__ */ (0, K.jsx)("i", {
									className: "w-4 h-4",
									"data-lucide": "x"
								})
							})
						})
					]
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: `image-edit-tools ${S === "mask" ? "active" : ""}`,
					children: [
						/* @__PURE__ */ (0, K.jsxs)("label", { children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "笔刷" }), /* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "遮罩笔刷大小",
							max: "160",
							min: "4",
							onChange: (e) => z(Number(e.target.value)),
							type: "range",
							value: R
						})] }),
						/* @__PURE__ */ (0, K.jsx)(Ht, {
							disabled: !lt,
							icon: "undo-2",
							label: "撤销遮罩",
							onClick: qe
						}),
						/* @__PURE__ */ (0, K.jsx)(Ht, {
							disabled: !ut,
							icon: "redo-2",
							label: "恢复遮罩",
							onClick: Je
						}),
						/* @__PURE__ */ (0, K.jsxs)("button", {
							className: "image-edit-btn secondary",
							onClick: () => Ye(),
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": "eraser"
							}), /* @__PURE__ */ (0, K.jsx)("span", { children: "清空" })]
						}),
						/* @__PURE__ */ (0, K.jsx)("span", {
							className: "image-edit-sub",
							children: "白色区域为要编辑的遮罩"
						})
					]
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: `image-edit-tools ${S === "brush" ? "active" : ""}`,
					children: [
						[
							[
								"free",
								"paintbrush",
								"自由画笔"
							],
							[
								"rect",
								"square",
								"矩形"
							],
							[
								"ellipse",
								"circle",
								"椭圆"
							],
							[
								"label",
								"list-ordered",
								"数字标签"
							],
							[
								"text",
								"type",
								"文字标签"
							]
						].map(([e, t, n]) => /* @__PURE__ */ (0, K.jsx)("button", {
							"aria-label": n,
							className: `image-edit-btn ${I === e ? "primary" : "secondary"}`,
							onClick: () => {
								ee(e), V("");
							},
							title: n,
							type: "button",
							children: /* @__PURE__ */ (0, K.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": t
							})
						}, e)),
						/* @__PURE__ */ (0, K.jsxs)("label", { children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "颜色" }), /* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "画笔颜色",
							onChange: (e) => L(e.target.value),
							type: "color",
							value: te
						})] }),
						/* @__PURE__ */ (0, K.jsxs)("label", { children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "笔刷" }), /* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "画笔大小",
							max: "80",
							min: "2",
							onChange: (e) => ne(Number(e.target.value)),
							type: "range",
							value: B
						})] }),
						/* @__PURE__ */ (0, K.jsx)(Ht, {
							disabled: !lt,
							icon: "undo-2",
							label: "撤销画笔",
							onClick: qe
						}),
						/* @__PURE__ */ (0, K.jsx)(Ht, {
							disabled: !ut,
							icon: "redo-2",
							label: "恢复画笔",
							onClick: Je
						}),
						/* @__PURE__ */ (0, K.jsxs)("button", {
							className: "image-edit-btn secondary",
							onClick: () => Ye(),
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": "eraser"
							}), /* @__PURE__ */ (0, K.jsx)("span", { children: "清空" })]
						})
					]
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: `image-edit-tools ${S === "grid" ? `active grid-operation-${ve}` : ""}`,
					children: [
						Re.length > 1 && o ? /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "grid-operation-toggle",
							children: [/* @__PURE__ */ (0, K.jsx)("button", {
								className: ve === "split" ? "active" : "",
								id: "gridSplitModeBtn",
								onClick: () => ye("split"),
								type: "button",
								children: "拆分"
							}), /* @__PURE__ */ (0, K.jsx)("button", {
								className: ve === "join" ? "active" : "",
								id: "gridJoinModeBtn",
								onClick: () => {
									ye("join"), fe(!1);
								},
								type: "button",
								children: "拼接"
							})]
						}) : null,
						ve === "join" ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "grid-preset-row grid-join-control",
							id: "gridJoinPresetRow",
							children: [
								/* @__PURE__ */ (0, K.jsx)("span", {
									className: "image-edit-sub",
									children: "布局"
								}),
								[
									[1, 2],
									[2, 1],
									[2, 2],
									[2, 3],
									[3, 2],
									[3, 3]
								].map(([e, t]) => /* @__PURE__ */ (0, K.jsxs)("button", {
									className: `grid-preset-btn ${xe === e && Ce === t ? "active" : ""}`,
									onClick: () => it(e, t),
									type: "button",
									children: [
										e,
										"×",
										t
									]
								}, `${e}x${t}`)),
								/* @__PURE__ */ (0, K.jsx)("button", {
									className: "grid-preset-btn",
									onClick: () => {
										let e = Math.max(1, Math.ceil(Math.sqrt(Re.length)));
										it(Math.ceil(Re.length / e), e);
									},
									type: "button",
									children: "自动"
								})
							]
						}), /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "grid-preset-row grid-join-control",
							id: "gridJoinSizeRow",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "image-edit-sub",
								children: "输出"
							}), [
								1024,
								2048,
								4096
							].map((e) => /* @__PURE__ */ (0, K.jsx)("button", {
								className: `grid-preset-btn ${Te === e ? "active" : ""}`,
								"data-grid-join-size": e,
								onClick: () => Ee(e),
								type: "button",
								children: e
							}, e))]
						})] }) : null,
						/* @__PURE__ */ (0, K.jsx)("button", {
							className: `image-edit-btn ${de ? "primary" : "secondary"}`,
							onClick: () => {
								fe((e) => !e), ge([]), x.current = [], U((e) => e + 1);
							},
							title: "自由放置切割线",
							type: "button",
							children: "自定义"
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "grid-preset-row",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "image-edit-sub",
								children: "预设"
							}), [
								[1, 2],
								[2, 1],
								[2, 2],
								[2, 3],
								[3, 2],
								[3, 3]
							].map(([e, t]) => /* @__PURE__ */ (0, K.jsxs)("button", {
								className: "grid-preset-btn",
								onClick: () => rt(e, t),
								type: "button",
								children: [
									e,
									"×",
									t
								]
							}, `${e}x${t}`))]
						}),
						de ? /* @__PURE__ */ (0, K.jsxs)("div", {
							style: {
								alignItems: "center",
								display: "flex",
								gap: 6
							},
							children: [
								/* @__PURE__ */ (0, K.jsx)("button", {
									className: `image-edit-btn ${pe === "h" ? "primary" : "secondary"}`,
									onClick: () => me("h"),
									title: "点击图片放置水平线",
									type: "button",
									children: "水平"
								}),
								/* @__PURE__ */ (0, K.jsx)("button", {
									className: `image-edit-btn ${pe === "v" ? "primary" : "secondary"}`,
									onClick: () => me("v"),
									title: "点击图片放置竖直线",
									type: "button",
									children: "垂直"
								}),
								/* @__PURE__ */ (0, K.jsx)("button", {
									"aria-label": "撤销切割线",
									className: "image-edit-btn secondary",
									disabled: !x.current.length,
									onClick: ct,
									style: { opacity: x.current.length ? 1 : .4 },
									title: "撤销上一条线",
									type: "button",
									children: /* @__PURE__ */ (0, K.jsx)("i", {
										className: "w-3.5 h-3.5",
										"data-lucide": "undo-2"
									})
								}),
								/* @__PURE__ */ (0, K.jsx)("button", {
									"aria-label": "清除自定义线",
									className: "image-edit-btn secondary",
									onClick: () => {
										x.current = [], ge([]), U((e) => e + 1);
									},
									title: "清除所有自定义线",
									type: "button",
									children: /* @__PURE__ */ (0, K.jsx)("i", {
										className: "w-3.5 h-3.5",
										"data-lucide": "eraser"
									})
								})
							]
						}) : /* @__PURE__ */ (0, K.jsxs)("span", {
							style: { display: "contents" },
							children: [/* @__PURE__ */ (0, K.jsxs)("label", { children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "横向线" }), /* @__PURE__ */ (0, K.jsx)("input", {
								"aria-label": "横向线",
								max: "20",
								min: "0",
								onChange: (e) => se(Math.max(1, Math.min(21, Number(e.target.value) + 1))),
								type: "number",
								value: oe - 1
							})] }), /* @__PURE__ */ (0, K.jsxs)("label", { children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "竖向线" }), /* @__PURE__ */ (0, K.jsx)("input", {
								"aria-label": "竖向线",
								max: "20",
								min: "0",
								onChange: (e) => H(Math.max(1, Math.min(21, Number(e.target.value) + 1))),
								type: "number",
								value: ce - 1
							})] })]
						}),
						/* @__PURE__ */ (0, K.jsxs)("label", {
							className: "grid-gap-control",
							children: [
								/* @__PURE__ */ (0, K.jsx)("span", { children: "间隔(px)" }),
								/* @__PURE__ */ (0, K.jsx)("input", {
									"aria-label": "宫格间隔",
									max: "240",
									min: "0",
									onChange: (e) => ue(Math.max(0, Math.min(240, Number(e.target.value)))),
									step: "1",
									type: "range",
									value: le
								}),
								/* @__PURE__ */ (0, K.jsx)("span", {
									className: "grid-gap-value",
									children: le
								})
							]
						}),
						/* @__PURE__ */ (0, K.jsxs)("span", {
							className: "image-edit-sub",
							children: [
								"将输出 ",
								de ? (he.filter((e) => e.type === "h").length + 1) * (he.filter((e) => e.type === "v").length + 1) : oe * ce,
								" 张图片"
							]
						})
					]
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: `image-edit-stage ${Be.width + 36 > O.width ? "overflow-x" : ""} ${Be.height + 36 > O.height ? "overflow-y" : ""}`.trim(),
					onWheel: (e) => {
						if (!w) return;
						e.preventDefault(), e.stopPropagation();
						let t = f.current, n = P, r = Math.max(.15, Math.min(6, P * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
						if (t) {
							let i = t.getBoundingClientRect(), a = e.clientX - i.left, o = e.clientY - i.top, s = t.scrollLeft + a, c = t.scrollTop + o;
							window.requestAnimationFrame(() => {
								let e = r / n;
								t.scrollLeft = s * e - a, t.scrollTop = c * e - o;
							});
						}
						F(r);
					},
					ref: f,
					children: /* @__PURE__ */ (0, K.jsx)("div", {
						className: "image-edit-stage-inner",
						children: /* @__PURE__ */ (0, K.jsxs)("div", {
							className: `crop-canvas ${S === "preview" ? "preview-mode" : S === "outpaint" ? `outpaint-mode ${M.width > 4096 || M.height > 4096 ? "outpaint-warning" : ""}` : S === "mask" ? "mask-mode" : S === "brush" ? `brush-mode ${I === "text" ? "text-mode" : ""}` : S === "grid" ? `grid-mode ${ve === "join" ? "grid-join-mode" : de ? `grid-custom-${pe}` : ""}` : ""}`,
							style: w ? {
								height: Be.height,
								width: Be.width
							} : void 0,
							children: [
								/* @__PURE__ */ (0, K.jsx)("img", {
									alt: "crop source",
									className: S === "grid" && ve === "join" ? "grid-join-hidden" : void 0,
									crossOrigin: /^https?:/i.test(c) ? "anonymous" : void 0,
									onLoad: (e) => {
										let t = e.currentTarget, n = {
											width: t.naturalWidth,
											height: t.naturalHeight
										};
										l.current = t;
										let r = {
											width: t.clientWidth || n.width,
											height: t.clientHeight || n.height
										};
										D(r), T(n), j({
											x: n.width * .08,
											y: n.height * .08,
											width: n.width * .84,
											height: n.height * .84
										}), N({
											offsetX: 0,
											offsetY: 0,
											width: n.width,
											height: n.height
										});
									},
									onError: () => Pe("无法读取图片，远程图片可能不允许跨域编辑"),
									onPointerDown: (e) => {
										S === "outpaint" && Ue(e, "image");
									},
									src: c,
									style: w ? S === "outpaint" ? {
										height: Fe.height,
										left: M.offsetX * Ie,
										maxHeight: "none",
										maxWidth: "none",
										top: M.offsetY * Le,
										width: Fe.width
									} : {
										height: Fe.height,
										maxHeight: "none",
										maxWidth: "none",
										width: Fe.width
									} : void 0
								}),
								S === "grid" && ve === "join" ? /* @__PURE__ */ (0, K.jsx)("div", {
									className: "grid-join-canvas",
									id: "gridJoinCanvas",
									ref: y,
									style: {
										display: "block",
										height: ze.height * P,
										width: ze.width * P
									},
									children: ze.items.map((e) => {
										let t = Re[e.index], n = b.current?.index === e.index;
										return /* @__PURE__ */ (0, K.jsx)("img", {
											alt: t?.name || `grid ${e.index + 1}`,
											className: `grid-join-item ${n ? "dragging" : ""}`,
											crossOrigin: /^https?:/i.test(t?.url || "") ? "anonymous" : void 0,
											"data-grid-join-index": e.index,
											draggable: !1,
											onPointerCancel: st,
											onPointerDown: (t) => at(t, e.index),
											onPointerMove: ot,
											onPointerUp: st,
											src: t?.url,
											style: {
												height: e.height * P,
												left: e.x * P,
												objectFit: "cover",
												top: e.y * P,
												transform: n ? `translate(${De.x}px, ${De.y}px)` : void 0,
												width: e.width * P
											}
										}, `${t?.url}-${e.index}`);
									})
								}) : null,
								/* @__PURE__ */ (0, K.jsx)("canvas", {
									className: "edit-draw-canvas",
									height: w?.height || 1,
									onPointerCancel: et,
									onPointerDown: Qe,
									onPointerLeave: et,
									onPointerMove: $e,
									onPointerUp: et,
									ref: u,
									style: {
										display: S === "grid" && ve === "join" ? "none" : void 0,
										height: Fe.height,
										left: S === "outpaint" ? M.offsetX * Ie : void 0,
										top: S === "outpaint" ? M.offsetY * Le : void 0,
										width: Fe.width
									},
									width: w?.width || 1
								}),
								/* @__PURE__ */ (0, K.jsx)("canvas", {
									className: "edit-text-canvas",
									height: w?.height || 1,
									onDoubleClick: tt,
									onPointerDown: tt,
									ref: d,
									style: {
										display: S === "grid" && ve === "join" ? "none" : void 0,
										height: Fe.height,
										left: S === "outpaint" ? M.offsetX * Ie : void 0,
										top: S === "outpaint" ? M.offsetY * Le : void 0,
										width: Fe.width
									},
									width: w?.width || 1
								}),
								dt ? /* @__PURE__ */ (0, K.jsx)("div", {
									className: "edit-text-inline",
									contentEditable: !0,
									onBlur: (e) => {
										let t = e.currentTarget.textContent?.trim() || "";
										ie((e) => t ? e.map((e) => e.id === dt.id ? {
											...e,
											text: t
										} : e) : e.filter((e) => e.id !== dt.id)), V("");
									},
									onKeyDown: (e) => {
										e.key === "Enter" && !e.shiftKey && (e.preventDefault(), e.currentTarget.blur()), e.key === "Escape" && (e.preventDefault(), V(""));
									},
									ref: (e) => {
										e && document.activeElement !== e && (e.textContent = dt.text, window.requestAnimationFrame(() => e.focus()));
									},
									style: {
										color: dt.color,
										fontSize: dt.size * Le,
										left: dt.x * Ie,
										top: dt.y * Le,
										transform: "translate(-50%, -50%)"
									},
									suppressContentEditableWarning: !0
								}) : null,
								/* @__PURE__ */ (0, K.jsx)("div", {
									className: "crop-box",
									onPointerDown: (e) => Ue(e, "crop-move"),
									style: {
										height: A.height * Le,
										left: A.x * Ie,
										top: A.y * Le,
										width: A.width * Ie
									},
									children: /* @__PURE__ */ (0, K.jsx)("div", {
										className: "crop-handle",
										onPointerDown: (e) => Ue(e, "crop-resize")
									})
								}),
								/* @__PURE__ */ (0, K.jsx)("div", {
									className: "outpaint-frame",
									onPointerDown: (e) => {
										e.target.closest("[data-outpaint-handle]") || Ue(e, "image");
									},
									style: {
										height: Be.height,
										width: Be.width
									},
									children: [
										"top",
										"right",
										"bottom",
										"left",
										"corner"
									].map((e) => /* @__PURE__ */ (0, K.jsx)("div", {
										className: "outpaint-handle",
										"data-outpaint-handle": e,
										onPointerDown: (t) => Ue(t, `outpaint-${e}`)
									}, e))
								}),
								/* @__PURE__ */ (0, K.jsxs)("div", {
									className: "outpaint-resolution",
									children: [
										Math.round(M.width),
										" x ",
										Math.round(M.height)
									]
								})
							]
						})
					})
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "image-edit-actions",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("span", {
							onDoubleClick: () => {
								F(1), f.current && (f.current.scrollLeft = 0, f.current.scrollTop = 0);
							},
							style: {
								color: "#94a3b8",
								cursor: "pointer",
								fontSize: 11,
								fontWeight: 800,
								marginRight: "auto",
								padding: "0 4px",
								userSelect: "none"
							},
							title: "双击重置缩放",
							children: [Math.round(P * 100), "%"]
						}),
						/* @__PURE__ */ (0, K.jsxs)("button", {
							className: "image-edit-btn secondary",
							disabled: !w || je,
							onClick: () => Ve(),
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": "rotate-ccw"
							}), /* @__PURE__ */ (0, K.jsx)("span", { children: "重置" })]
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							className: "image-edit-btn secondary",
							disabled: je,
							onClick: i,
							type: "button",
							children: "取消"
						}),
						S === "preview" ? null : /* @__PURE__ */ (0, K.jsxs)("button", {
							className: "image-edit-btn primary",
							disabled: !w || je,
							onClick: () => void nt(),
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": Gt(S)
							}), /* @__PURE__ */ (0, K.jsx)("span", { children: je ? "正在上传…" : S === "grid" && ve === "join" ? "输出拼接" : Kt(S) })]
						})
					]
				}),
				Ne ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "image-edit-sub",
					"data-testid": "image-transform-status",
					children: Ne
				}) : null
			]
		})
	});
}
function Vt({ active: e, icon: t, label: n, onClick: r }) {
	return /* @__PURE__ */ (0, K.jsxs)("button", {
		className: e ? "active" : "",
		onClick: r,
		type: "button",
		children: [/* @__PURE__ */ (0, K.jsx)("i", {
			className: "w-3.5 h-3.5",
			"data-lucide": t
		}), /* @__PURE__ */ (0, K.jsx)("span", { children: n })]
	});
}
function Ht({ disabled: e, icon: t, label: n, onClick: r }) {
	return /* @__PURE__ */ (0, K.jsx)("button", {
		"aria-label": n,
		className: "image-edit-btn secondary",
		disabled: e,
		onClick: r,
		style: { opacity: e ? .42 : 1 },
		title: n,
		type: "button",
		children: /* @__PURE__ */ (0, K.jsx)("i", {
			className: "w-4 h-4",
			"data-lucide": t
		})
	});
}
function Ut(e) {
	return e === "preview" ? "预览图片" : e === "crop" ? "裁剪图片" : e === "outpaint" ? "扩图" : e === "mask" ? "遮罩编辑" : e === "brush" ? "画笔编辑" : "宫格切分";
}
function Wt(e) {
	return e === "preview" ? "滚轮缩放查看图片" : e === "crop" ? "拖动裁剪区域并调整右下角控制点" : e === "outpaint" ? "拖动原图或边缘控制点调整画布" : e === "mask" ? "白色绘制区域将生成黑白遮罩图" : e === "brush" ? "使用画笔、图形、数字或文字标记图片" : "使用预设或自定义切割线批量拆分图片";
}
function Gt(e) {
	return e === "crop" ? "crop" : e === "outpaint" ? "expand" : e === "mask" ? "brush" : e === "brush" ? "paintbrush" : "grid-3x3";
}
function Kt(e) {
	return e === "crop" ? "应用裁剪" : e === "outpaint" ? "应用扩图" : e === "mask" ? "应用遮罩" : e === "brush" ? "应用画笔" : "应用切分";
}
function qt(e) {
	let t = e.getContext("2d")?.getImageData(0, 0, e.width, e.height).data;
	if (!t) return !1;
	for (let e = 3; e < t.length; e += 4) if (t[e] > 0) return !0;
	return !1;
}
function Jt(e) {
	let t = e.getContext("2d");
	if (!t) return;
	let n = t.getImageData(0, 0, e.width, e.height), r = !1;
	for (let e = 0; e < n.data.length; e += 4) n.data[e + 3] && (n.data[e] = 255, n.data[e + 1] = 255, n.data[e + 2] = 255, n.data[e + 3] > 115 && (n.data[e + 3] = 115), r = !0);
	r && t.putImageData(n, 0, 0);
}
function Yt(e, t) {
	return `${String(e || "image").replace(/\.[^.]+$/, "") || "image"}_${t}.png`;
}
function Xt(e, t) {
	let n = Math.max(24, Math.min(t.width, Number(e.width) || 24)), r = Math.max(24, Math.min(t.height, Number(e.height) || 24));
	return {
		width: n,
		height: r,
		x: Math.max(0, Math.min(t.width - n, Number(e.x) || 0)),
		y: Math.max(0, Math.min(t.height - r, Number(e.y) || 0))
	};
}
function Zt(e, t) {
	let n = Math.max(t.width, Number(e.width) || t.width), r = Math.max(t.height, Number(e.height) || t.height);
	return {
		width: n,
		height: r,
		offsetX: Math.max(0, Math.min(n - t.width, Number(e.offsetX) || 0)),
		offsetY: Math.max(0, Math.min(r - t.height, Number(e.offsetY) || 0))
	};
}
function Qt(e, t, n, r, i) {
	let a = Math.max(1, Number(r) || 1), o = Math.max(1, Number(n) || 1, Math.ceil(e.length / a)), s = Math.max(0, Math.min(240, Number(i) || 0)), c = e.map((e) => Math.max(1, Number(e.natural_w) || 512)), l = e.map((e) => Math.max(1, Number(e.natural_h) || 512)), u = Math.max(1, ...c), d = Math.max(1, ...l), f = Math.min(1, 420 / Math.max(u, d)), p = Math.max(1, Math.round(u * f)), m = Math.max(1, Math.round(d * f)), h = [...new Set(t.filter((t) => Number.isInteger(t) && t >= 0 && t < e.length)), ...e.map((e, t) => t).filter((e) => !t.includes(e))].map((e, t) => ({
		height: m,
		index: e,
		width: p,
		x: t % a * (p + s),
		y: Math.floor(t / a) * (m + s)
	}));
	return {
		cols: a,
		gap: s,
		height: Math.max(o * m + Math.max(0, o - 1) * s, ...h.map((e) => e.y + e.height), 1),
		items: h,
		rows: o,
		width: Math.max(a * p + Math.max(0, a - 1) * s, ...h.map((e) => e.x + e.width), 1)
	};
}
async function $t(e, t, n, r) {
	let i = Math.max(1, Math.max(256, Number(n) || 2048) / Math.max(1, t.width, t.height)), a = document.createElement("canvas");
	a.width = Math.max(1, Math.round(t.width * i)), a.height = Math.max(1, Math.round(t.height * i));
	let o = a.getContext("2d");
	if (!o) throw Error("无法创建拼接画布");
	o.fillStyle = "#ffffff", o.fillRect(0, 0, a.width, a.height);
	for (let n of t.items) {
		let t = e[n.index];
		t && tn(o, await en(t.url), Math.round(n.x * i), Math.round(n.y * i), Math.round(n.width * i), Math.round(n.height * i));
	}
	let s = String(r || e[0]?.name || "image").replace(/\.[^.]+$/, "") || "image";
	return {
		blob: await nn(a),
		height: a.height,
		name: `${s}_join.png`,
		width: a.width
	};
}
function en(e) {
	return new Promise((t, n) => {
		let r = new Image();
		r.crossOrigin = "anonymous", r.onload = () => t(r), r.onerror = () => n(/* @__PURE__ */ Error("图片加载失败")), r.src = e;
	});
}
function tn(e, t, n, r, i, a) {
	let o = Math.max(1, t.naturalWidth || t.width || 1), s = Math.max(1, t.naturalHeight || t.height || 1), c = Math.max(i / o, a / s), l = Math.max(1, i / c), u = Math.max(1, a / c);
	e.drawImage(t, Math.max(0, (o - l) / 2), Math.max(0, (s - u) / 2), l, u, n, r, i, a);
}
function nn(e) {
	return new Promise((t, n) => e.toBlob((e) => e ? t(e) : n(/* @__PURE__ */ Error("无法生成编辑后的 PNG 图片")), "image/png"));
}
//#endregion
//#region src/canvas/domain/output-preview.ts
function rn(e) {
	return typeof e == "string" ? e : String(dn(e).url || "");
}
function an(e) {
	let t = dn(e), n = String(t.kind || t.mediaKind || "").toLowerCase();
	if (n) return n;
	let r = rn(e).split(/[?#]/, 1)[0].toLowerCase();
	return /\.(mp4|webm|mov|m4v)$/.test(r) ? "video" : /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(r) ? "audio" : "image";
}
function on(e) {
	return (e.type === "image" && e.url ? [{
		kind: e.mediaKind || "image",
		name: e.name,
		url: e.url
	}] : Array.isArray(e.images) ? e.images : []).map((e, t) => {
		let n = dn(e), r = rn(e), i = an(e);
		return !r || i !== "image" && i !== "video" ? null : {
			kind: i,
			meta: n,
			name: String(n.name || r.split(/[?#]/, 1)[0].split("/").pop() || `output-${t + 1}`),
			url: r
		};
	}).filter((e) => !!e);
}
function sn(e, t) {
	return dn((Array.isArray(e.images) ? e.images : []).find((e) => rn(e) === t));
}
function cn(e, t) {
	let n = dn(e.imageComparisons)[t];
	if (typeof n == "string") return n;
	let r = String(dn(n).url || "");
	if (r) return r;
	let i = dn(sn(e, t).run), a = (Array.isArray(i.refs) ? i.refs : []).map(dn).find((e) => e.url);
	return String(a?.url || "");
}
function ln(e) {
	let t = Math.max(0, Math.round(Number(e || 0) / 1e3)), n = Math.floor(t / 60), r = t % 60;
	return n ? `${n}m ${String(r).padStart(2, "0")}s` : `${r}s`;
}
function un(e, t = Date.now()) {
	let n = String(e || "").split(/[?#]/, 1)[0];
	return `canvas-output-${t}.${(n.includes(".") ? n.split(".").pop() : "png") || "png"}`;
}
function dn(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
//#endregion
//#region src/canvas/ui/legacy-output-lightbox.tsx
function fn({ node: e, onClose: t, onNavigate: n, onRerun: r, onViewed: i, url: a }) {
	let o = (0, G.useMemo)(() => on(e), [e]), s = sn(e, a), c = mn(s.run), l = String(c.prompt || ""), u = cn(e, a), d = o.find((e) => e.url === a)?.kind === "video", [f, p] = (0, G.useState)(!1), [m, h] = (0, G.useState)(50), [g, _] = (0, G.useState)(!1), [v, y] = (0, G.useState)(!1), [b, x] = (0, G.useState)({
		x: 0,
		y: 0
	}), [S, C] = (0, G.useState)("--"), [w, T] = (0, G.useState)(1), E = (0, G.useRef)(null), D = (0, G.useRef)(null), O = (0, G.useRef)(null), k = (0, G.useRef)(!1), A = (0, G.useRef)(i);
	(0, G.useEffect)(() => {
		A.current = i;
	}, [i]), (0, G.useEffect)(() => {
		p(!1), h(50), x({
			x: 0,
			y: 0
		}), y(!1), C("--"), T(1), A.current(a);
	}, [a]), (0, G.useEffect)(() => {
		let e = window.requestAnimationFrame(() => window.lucide?.createIcons());
		return () => window.cancelAnimationFrame(e);
	}, [
		f,
		g,
		a
	]), (0, G.useEffect)(() => {
		let e = (e) => {
			if (e.key === "Escape") {
				e.preventDefault(), e.stopImmediatePropagation(), t();
				return;
			}
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" || o.length < 2) return;
			let r = Math.max(0, o.findIndex((e) => e.url === a)), i = e.key === "ArrowRight" ? 1 : -1;
			e.preventDefault(), e.stopImmediatePropagation(), n(o[(r + i + o.length) % o.length].url);
		};
		return window.addEventListener("keydown", e, !0), () => window.removeEventListener("keydown", e, !0);
	}, [
		o,
		t,
		n,
		a
	]), (0, G.useEffect)(() => {
		let e = (e) => {
			k.current && pn(e.clientX, D.current, h), O.current && x({
				x: O.current.origin.x + e.clientX - O.current.start.x,
				y: O.current.origin.y + e.clientY - O.current.start.y
			});
		}, t = () => {
			k.current = !1, O.current = null, y(!1);
		};
		return window.addEventListener("pointermove", e), window.addEventListener("pointerup", t), () => {
			window.removeEventListener("pointermove", e), window.removeEventListener("pointerup", t);
		};
	}, []);
	let j = `translate(${b.x}px, ${b.y}px) scale(${w})`, M = s.runMs ? ln(s.runMs) : "", N = !!(l || s.run), P = (e) => {
		k.current = !0, pn(e.clientX, D.current, h), e.preventDefault(), e.stopPropagation();
	}, F = (e) => {
		let t = e.target;
		d || e.button !== 0 || w <= 1.001 || t.closest(".output-preview-actions, .output-resolution, .output-compare-slider") || (O.current = {
			origin: b,
			start: {
				x: e.clientX,
				y: e.clientY
			}
		}, y(!0), e.preventDefault(), e.stopPropagation());
	}, I = (e) => {
		if (d) return;
		e.preventDefault(), e.stopPropagation();
		let t = E.current?.getBoundingClientRect();
		if (!t) return;
		let n = {
			x: e.clientX - t.left,
			y: e.clientY - t.top
		}, r = {
			x: (n.x - b.x) / w,
			y: (n.y - b.y) / w
		}, i = Math.max(1, Math.min(6, w * (e.deltaY > 0 ? .9 : 1.1)));
		T(i), x(i <= 1.001 ? {
			x: 0,
			y: 0
		} : {
			x: n.x - r.x * i,
			y: n.y - r.y * i
		});
	}, ee = async () => {
		l && (await navigator.clipboard.writeText(l), _(!0), window.setTimeout(() => _(!1), 1200));
	};
	return (0, Dt.createPortal)(/* @__PURE__ */ (0, K.jsx)("div", {
		"aria-label": "输出预览",
		className: "output-lightbox open canvas-v2-lightbox",
		onClick: t,
		role: "dialog",
		style: { zIndex: 1100 },
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "output-lightbox-shell",
			onClick: (e) => e.stopPropagation(),
			onPointerDown: (e) => e.stopPropagation(),
			children: [/* @__PURE__ */ (0, K.jsxs)("div", {
				className: `output-preview ${f ? "compare-mode" : ""} ${v ? "panning" : ""} ${w > 1.001 ? "zoomed" : ""}`.trim(),
				"data-preview-url": a,
				"data-preview-zoom": w.toFixed(3),
				onDoubleClick: (e) => {
					e.stopPropagation(), !d && u && p((e) => !e);
				},
				onPointerDown: F,
				onWheel: I,
				ref: E,
				children: [
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "output-compare",
						onPointerDown: P,
						ref: D,
						children: [
							/* @__PURE__ */ (0, K.jsx)("img", {
								alt: "result image",
								draggable: !1,
								src: d ? "" : a,
								style: {
									transform: j,
									transformOrigin: "0 0"
								}
							}),
							/* @__PURE__ */ (0, K.jsx)("div", {
								className: "output-compare-original-wrap",
								style: { clipPath: `inset(0 ${100 - m}% 0 0)` },
								children: /* @__PURE__ */ (0, K.jsx)("img", {
									alt: "input image",
									draggable: !1,
									src: u,
									style: {
										transform: j,
										transformOrigin: "0 0"
									}
								})
							}),
							/* @__PURE__ */ (0, K.jsx)("div", {
								className: "output-compare-slider",
								onPointerDown: P,
								style: { left: `${m}%` },
								children: /* @__PURE__ */ (0, K.jsx)("div", {
									className: "output-compare-handle",
									children: /* @__PURE__ */ (0, K.jsx)("i", {
										className: "w-4 h-4",
										"data-lucide": "move-horizontal"
									})
								})
							})
						]
					}),
					d ? null : /* @__PURE__ */ (0, K.jsx)("img", {
						alt: "output preview",
						className: "output-single-img",
						draggable: !1,
						onLoad: (e) => C(`${e.currentTarget.naturalWidth} x ${e.currentTarget.naturalHeight}`),
						src: a,
						style: {
							transform: j,
							transformOrigin: "0 0"
						}
					}),
					d ? /* @__PURE__ */ (0, K.jsx)("video", {
						className: "output-single-video",
						controls: !0,
						controlsList: "nodownload noplaybackrate noremoteplayback",
						disablePictureInPicture: !0,
						onLoadedMetadata: (e) => C(e.currentTarget.videoWidth && e.currentTarget.videoHeight ? `${e.currentTarget.videoWidth} x ${e.currentTarget.videoHeight}` : "Video"),
						playsInline: !0,
						src: a
					}) : null,
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "output-preview-bar",
						children: [/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "output-resolution",
							children: [S, M ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("span", {
								style: { opacity: .38 },
								children: "|"
							}), /* @__PURE__ */ (0, K.jsx)("span", { children: M })] }) : null]
						}), /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "output-preview-actions",
							children: [/* @__PURE__ */ (0, K.jsx)("a", {
								"aria-label": "下载",
								className: "preview-icon-btn",
								download: un(a),
								href: a,
								onClick: (e) => e.stopPropagation(),
								title: "下载",
								children: /* @__PURE__ */ (0, K.jsx)("i", {
									className: "w-4 h-4",
									"data-lucide": "download"
								})
							}), /* @__PURE__ */ (0, K.jsx)("button", {
								"aria-label": "关闭",
								className: "preview-icon-btn",
								onClick: t,
								title: "关闭",
								type: "button",
								children: /* @__PURE__ */ (0, K.jsx)("i", {
									className: "w-4 h-4",
									"data-lucide": "x"
								})
							})]
						})]
					})
				]
			}), /* @__PURE__ */ (0, K.jsxs)("div", {
				className: `output-prompt-panel ${N ? "open" : ""}`,
				children: [/* @__PURE__ */ (0, K.jsx)("div", {
					className: "output-prompt-text",
					children: l || "暂无提示词元数据"
				}), /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "output-prompt-actions",
					children: [/* @__PURE__ */ (0, K.jsxs)("button", {
						className: `preview-text-btn secondary ${g ? "copied" : ""}`,
						disabled: !l,
						onClick: () => void ee(),
						type: "button",
						children: [/* @__PURE__ */ (0, K.jsx)("i", {
							className: "w-3.5 h-3.5",
							"data-lucide": "copy"
						}), /* @__PURE__ */ (0, K.jsx)("span", { children: g ? "已复制" : "复制提示词" })]
					}), /* @__PURE__ */ (0, K.jsxs)("button", {
						className: "preview-text-btn",
						onClick: () => r(s),
						type: "button",
						children: [/* @__PURE__ */ (0, K.jsx)("i", {
							className: "w-3.5 h-3.5",
							"data-lucide": "refresh-cw"
						}), /* @__PURE__ */ (0, K.jsx)("span", { children: "再次运行" })]
					})]
				})]
			})]
		})
	}), document.querySelector(".shell") || document.body);
}
function pn(e, t, n) {
	let r = t?.getBoundingClientRect();
	r?.width && n(Math.max(0, Math.min(100, (e - r.left) / r.width * 100)));
}
function mn(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
//#endregion
//#region src/canvas/infrastructure/asset-library-client.ts
var hn = {
	list: () => gn("/api/asset-library"),
	createLibrary: (e) => gn("/api/asset-library/libraries", _n("POST", { name: e })),
	renameLibrary: (e, t) => gn(`/api/asset-library/libraries/${encodeURIComponent(e)}`, _n("PATCH", { name: t })),
	deleteLibrary: (e) => gn(`/api/asset-library/libraries/${encodeURIComponent(e)}`, _n("DELETE")),
	createCategory: (e, t, n = "image") => gn("/api/asset-library/categories", _n("POST", {
		library_id: e,
		name: t,
		type: n
	})),
	renameCategory: (e, t, n) => gn(`/api/asset-library/categories/${encodeURIComponent(t)}`, _n("PATCH", {
		library_id: e,
		name: n
	})),
	deleteCategory: (e, t) => gn(`/api/asset-library/categories/${encodeURIComponent(t)}?library_id=${encodeURIComponent(e)}`, _n("DELETE")),
	addUrl: (e, t, n, r) => gn("/api/asset-library/items", _n("POST", {
		category_id: t,
		library_id: e,
		name: r,
		url: n
	})),
	addBatch: (e, t, n) => gn("/api/asset-library/items/batch", _n("POST", {
		category_id: t,
		items: n.map((n) => ({
			...n,
			category_id: t,
			library_id: e
		})),
		library_id: e
	})),
	upload: async (e) => {
		let t = new FormData();
		return e.forEach((e) => t.append("files", e, e.name || "media")), gn("/api/ai/upload", {
			method: "POST",
			body: t
		});
	},
	renameItem: (e, t) => gn(`/api/asset-library/items/${encodeURIComponent(e)}`, _n("PATCH", { name: t })),
	deleteItem: (e, t) => gn("/api/asset-library/items/delete", _n("POST", {
		ids: [t],
		library_id: e
	})),
	saveWorkflow: (e, t, n) => gn("/api/canvas-workflows/export-to-library", _n("POST", {
		...n,
		category_id: t,
		include_resources: !0,
		library_id: e
	}))
};
async function gn(e, t) {
	let n = await fetch(e, t), r = await n.json().catch(() => ({}));
	if (!n.ok) {
		let e = r.detail;
		throw Error(typeof e == "string" ? e : e?.message || `请求失败 (${n.status})`);
	}
	return r;
}
function _n(e, t) {
	return {
		method: e,
		headers: t === void 0 ? void 0 : { "Content-Type": "application/json" },
		body: t === void 0 ? void 0 : JSON.stringify(t)
	};
}
//#endregion
//#region src/canvas/ui/smart-canvas-mention-picker.tsx
function vn({ inputRef: e, inputItems: t, onPromptChange: n, outputId: r, readOnly: i }) {
	let a = (0, G.useRef)(null), o = (0, G.useRef)(null), [s, c] = (0, G.useState)(!1), [l, u] = (0, G.useState)("input"), [d, f] = (0, G.useState)(null), [p, m] = (0, G.useState)(!1), [h, g] = (0, G.useState)(""), [_, v] = (0, G.useState)(""), [y, b] = (0, G.useState)({
		left: 8,
		top: 2
	}), [x, S] = (0, G.useState)(null);
	(0, G.useEffect)(() => {
		let e = !0;
		return hn.list().then((t) => {
			if (!e) return;
			f(t.library);
			let n = t.library?.libraries || [], r = t.library?.active_library_id || n[0]?.id || "";
			g(r), m(!0);
		}).catch(() => {
			e && m(!0);
		}), () => {
			e = !1;
		};
	}, []);
	let C = (0, G.useMemo)(() => xn(d), [d]), w = C.find((e) => e.id === h) || C[0] || null, T = (0, G.useMemo)(() => (w?.categories || []).filter((e) => (e.type || "image") === "image"), [w]), E = T.find((e) => e.id === _) || T[0] || null, D = (0, G.useMemo)(() => bn(E).slice(0, 36), [E]), O = l === "asset" ? D : t.map((e) => ({
		...e,
		alias: e.name
	})).slice(0, 36), k = t.length > 0, A = C.some((e) => e.categories.some((e) => (e.type || "image") === "image" && e.items.some((e) => e.url)));
	(0, G.useEffect)(() => {
		!h && C[0]?.id && g(C[0].id);
	}, [h, C]), (0, G.useEffect)(() => {
		T.some((e) => e.id === _) || v(T[0]?.id || "");
	}, [_, T]), (0, G.useEffect)(() => {
		c(!1), S(null), o.current = null;
	}, [r]), (0, G.useEffect)(() => {
		let t = e.current;
		if (!t || i) return;
		let n = () => {
			let e = window.getSelection();
			e?.rangeCount && t.contains(e.anchorNode) && (o.current = e.getRangeAt(0).cloneRange());
		}, r = () => {
			let e = window.getSelection();
			if (!e?.rangeCount || !t.contains(e.anchorNode)) return "";
			let n = e.getRangeAt(0).cloneRange();
			return n.selectNodeContents(t), n.setEnd(e.anchorNode, e.anchorOffset), n.toString();
		}, s = () => {
			let e = t.closest(".prompt-row");
			if (!e) return;
			let n = e.getBoundingClientRect(), r = t.getBoundingClientRect(), i = window.getSelection(), o = i?.rangeCount ? i.getRangeAt(0).cloneRange().getBoundingClientRect() : null, s = e.offsetWidth > 0 ? n.width / e.offsetWidth : 1, c = s > 0 ? s : 1, l = a.current?.offsetWidth || 340, u = Math.max(4, e.offsetWidth - l - 4), d = ((o?.left || r.left) - n.left) / c - 6, f = ((o?.bottom || r.top + 24) - n.top) / c + 2;
			b({
				left: Math.max(4, Math.min(d, u)),
				top: Math.max(2, f)
			});
		}, l = () => {
			if (n(), !/@$/.test(r())) {
				c(!1);
				return;
			}
			if (k) u("input");
			else if (A || !p) u("asset");
			else {
				c(!1);
				return;
			}
			s(), c(!0), window.requestAnimationFrame(s);
		}, d = (e) => {
			e.key === "Escape" && c(!1);
		}, f = (e) => {
			let t = e.target?.closest?.(".mention-image-token");
			if (!t) return;
			let n = t.dataset.url || "";
			if (!n) return;
			let r = t.getBoundingClientRect();
			S({
				item: {
					alias: t.dataset.name || "图片",
					assetUris: Sn(t.dataset.assetUris),
					imageIndex: Number(t.dataset.imageIndex || 0),
					kind: t.dataset.kind === "video" ? "video" : "image",
					name: t.dataset.name || "图片",
					nodeId: t.dataset.nodeId || "",
					url: n
				},
				left: Math.min(window.innerWidth - 236, r.left),
				top: Math.min(window.innerHeight - 236, r.bottom + 8)
			});
		}, m = (e) => {
			e.target?.closest?.(".mention-image-token") && S(null);
		};
		return t.addEventListener("input", l), t.addEventListener("keyup", l), t.addEventListener("mouseup", n), t.addEventListener("focus", n), t.addEventListener("keydown", d), t.addEventListener("mouseover", f), t.addEventListener("mouseout", m), () => {
			t.removeEventListener("input", l), t.removeEventListener("keyup", l), t.removeEventListener("mouseup", n), t.removeEventListener("focus", n), t.removeEventListener("keydown", d), t.removeEventListener("mouseover", f), t.removeEventListener("mouseout", m);
		};
	}, [
		p,
		A,
		k,
		e,
		i
	]), (0, G.useEffect)(() => {
		let e = (e) => {
			let t = e.target;
			!t?.closest(".mention-picker") && !t?.closest("#promptInput") && c(!1);
		};
		return document.addEventListener("click", e), () => document.removeEventListener("click", e);
	}, []), (0, G.useEffect)(() => {
		s && window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		_,
		h,
		O.length,
		s,
		l
	]);
	let j = (t) => {
		let r = e.current;
		if (!r || !t.url) return;
		r.focus();
		let i = window.getSelection(), a = o.current;
		a && r.contains(a.commonAncestorContainer) && (i?.removeAllRanges(), i?.addRange(a));
		let s = i?.rangeCount ? i.getRangeAt(0) : document.createRange(), l = !1;
		if (s.startContainer.nodeType === Node.TEXT_NODE && s.startOffset > 0 && (s.startContainer.textContent || "")[s.startOffset - 1] === "@" && (s.setStart(s.startContainer, s.startOffset - 1), s.deleteContents(), l = !0), !l) {
			let e = document.createTreeWalker(r, NodeFilter.SHOW_TEXT), t = null;
			for (; e.nextNode();) t = e.currentNode;
			t && /@$/.test(t.textContent || "") && (t.textContent = (t.textContent || "").slice(0, -1), s.selectNodeContents(r), s.collapse(!1));
		}
		let u = document.createElement("span");
		u.className = "mention-image-token", u.contentEditable = "false", u.dataset.url = t.url, u.dataset.name = t.alias || t.name || "图片", u.dataset.kind = t.kind, u.dataset.nodeId = t.nodeId || "", u.dataset.imageIndex = String(t.imageIndex ?? ""), u.dataset.assetUris = JSON.stringify(t.assetUris || {});
		let d = document.createElement(t.kind === "video" ? "video" : "img");
		d.setAttribute("src", t.url), d.setAttribute("alt", ""), d instanceof HTMLVideoElement ? (d.muted = !0, d.playsInline = !0, d.preload = "metadata") : d.draggable = !1;
		let f = document.createElement("span");
		f.textContent = u.dataset.name, u.append(d, f), s.insertNode(u);
		let p = document.createTextNode(" ");
		u.after(p), s.setStartAfter(p), s.collapse(!0), i?.removeAllRanges(), i?.addRange(s), o.current = s.cloneRange(), c(!1), n(yn(r), !0), r.focus();
	}, M = {
		left: y.left,
		top: y.top
	}, N = x ? /* @__PURE__ */ (0, K.jsx)("div", {
		className: "mention-preview",
		id: "mentionPreview",
		style: {
			display: "block",
			left: x.left,
			top: x.top
		},
		children: x.item.kind === "video" ? /* @__PURE__ */ (0, K.jsx)("video", {
			autoPlay: !0,
			disablePictureInPicture: !0,
			loop: !0,
			muted: !0,
			playsInline: !0,
			preload: "metadata",
			src: x.item.url
		}) : /* @__PURE__ */ (0, K.jsx)("img", {
			alt: "preview",
			src: x.item.url
		})
	}) : /* @__PURE__ */ (0, K.jsx)("div", {
		className: "mention-preview",
		id: "mentionPreview",
		children: /* @__PURE__ */ (0, K.jsx)("img", { alt: "preview" })
	});
	return /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("div", {
		className: `mention-picker ${s ? "open" : ""}`,
		id: "mentionPicker",
		onMouseDown: (e) => e.stopPropagation(),
		ref: a,
		style: M,
		children: s ? /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "mention-picker-shell",
			children: [
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "mention-source-tabs",
					children: [/* @__PURE__ */ (0, K.jsxs)("button", {
						className: `mention-source-tab ${l === "input" ? "active" : ""}`,
						"data-mention-source": "input",
						disabled: !k,
						onMouseDown: (e) => {
							e.preventDefault(), e.stopPropagation(), k && u("input");
						},
						title: "画布输入",
						type: "button",
						children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "image" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "画布输入" })]
					}), /* @__PURE__ */ (0, K.jsxs)("button", {
						className: `mention-source-tab ${l === "asset" ? "active" : ""}`,
						"data-mention-source": "asset",
						disabled: p && !A,
						onMouseDown: (e) => {
							e.preventDefault(), e.stopPropagation(), (A || !p) && u("asset");
						},
						title: "资产库",
						type: "button",
						children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "library" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "资产库" })]
					})]
				}),
				l === "asset" && C.length ? /* @__PURE__ */ (0, K.jsxs)("label", {
					className: "mention-library-row",
					children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "资产库" }), /* @__PURE__ */ (0, K.jsx)("select", {
						className: "mention-library-select",
						"data-mention-library": !0,
						onChange: (e) => {
							g(e.target.value), v("");
						},
						onMouseDown: (e) => e.stopPropagation(),
						value: w?.id || "",
						children: C.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
							value: e.id,
							children: e.name || "资产库"
						}, e.id))
					})]
				}) : null,
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: `mention-folder-chips ${l === "asset" && T.length ? "" : "hidden"}`,
					children: T.map((e) => /* @__PURE__ */ (0, K.jsx)("button", {
						className: `mention-folder-chip ${e.id === E?.id ? "active" : ""}`,
						"data-mention-folder": e.id,
						onMouseDown: (t) => {
							t.preventDefault(), t.stopPropagation(), v(e.id);
						},
						title: e.name || "资产文件夹",
						type: "button",
						children: e.name || "资产文件夹"
					}, e.id))
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "mention-content",
					children: O.length ? /* @__PURE__ */ (0, K.jsx)("div", {
						className: "mention-option-grid",
						children: O.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("button", {
							className: "mention-option",
							"data-mention-index": t,
							onMouseDown: (t) => {
								t.preventDefault(), t.stopPropagation(), j(e);
							},
							type: "button",
							children: [e.kind === "video" ? /* @__PURE__ */ (0, K.jsx)("video", {
								muted: !0,
								preload: "metadata",
								src: e.url
							}) : /* @__PURE__ */ (0, K.jsx)("img", {
								alt: "",
								draggable: !1,
								src: e.url
							}), /* @__PURE__ */ (0, K.jsx)("span", { children: e.alias })]
						}, `${e.url}-${t}`))
					}) : /* @__PURE__ */ (0, K.jsx)("div", {
						className: "mention-empty",
						children: "暂无可引用素材"
					})
				})
			]
		}) : null
	}), typeof document < "u" ? (0, Dt.createPortal)(N, document.body) : null] });
}
function yn(e) {
	let t = [];
	return e.querySelectorAll(".mention-image-token").forEach((e, n) => {
		let r = e.dataset.url || "";
		r && t.push({
			asset_uris: Sn(e.dataset.assetUris),
			imageIndex: Number.isFinite(Number(e.dataset.imageIndex)) ? Number(e.dataset.imageIndex) : n,
			kind: e.dataset.kind === "video" ? "video" : "image",
			name: e.dataset.name || `图片${n + 1}`,
			nodeId: e.dataset.nodeId || "",
			url: r
		});
	}), {
		html: e.innerHTML,
		refs: t,
		text: e.innerText.replace(/\u00a0/g, " ").trim()
	};
}
function bn(e) {
	let t = /* @__PURE__ */ new Set();
	return (e?.items || []).flatMap((e, n) => {
		if (!e.url || t.has(e.url)) return [];
		t.add(e.url);
		let r = e.registrations?.volcengine, i = r?.status === "Active" && r.asset_uri ? { volcengine: r.asset_uri } : {};
		return [{
			alias: e.name || `资产${n + 1}`,
			assetUris: i,
			imageIndex: n,
			kind: e.kind === "video" ? "video" : "image",
			name: e.name || `资产${n + 1}`,
			nodeId: "",
			url: e.url
		}];
	});
}
function xn(e) {
	return e?.libraries || [];
}
function Sn(e) {
	try {
		let t = JSON.parse(e || "{}");
		return t && typeof t == "object" && !Array.isArray(t) ? t : {};
	} catch {
		return {};
	}
}
//#endregion
//#region src/canvas/ui/smart-canvas-mention-picker-state.ts
function Cn(e) {
	return e.nodeId ? `${e.nodeId}|${e.imageIndex}` : `url|${e.url}`;
}
function wn(e, t, n) {
	if (!e || !t) return [];
	let r = new Map(e.nodes.map((e) => [e.id, e])), i = /* @__PURE__ */ new Map();
	e.connections.forEach((e) => i.set(e.to, [...i.get(e.to) || [], e.from]));
	let a = [], o = /* @__PURE__ */ new Set(), s = (e) => {
		o.has(e.id) || (o.add(e.id), (i.get(e.id) || []).forEach((e) => {
			let t = r.get(e);
			t && s(t);
		}), a.push(e));
	};
	return s(n || t), o.has(t.id) || a.push(t), An(a.flatMap(kn));
}
function Tn(e, t, n) {
	if (!e || !t) return [];
	let r = new Map(e.nodes.map((e) => [e.id, e])), i = n ? e.connections.filter((e) => e.to === n.id).map((e) => r.get(e.from)).filter(Boolean) : [], a = En(t).map((e) => ({
		assetUris: e.asset_uris,
		imageIndex: e.imageIndex,
		kind: e.kind,
		name: e.name,
		nodeId: e.nodeId,
		url: e.url
	})), o = An([...i, t].flatMap(kn).concat(a)), s = Array.isArray(t.inputRefOrder) ? t.inputRefOrder.map(String) : [];
	if (!s.length) return o.slice(0, 12);
	let c = new Map(s.map((e, t) => [e, t]));
	return o.slice().sort((e, t) => (c.get(Cn(e)) ?? 2 ** 53 - 1) - (c.get(Cn(t)) ?? 2 ** 53 - 1)).slice(0, 12);
}
function En(e) {
	return (Array.isArray(e?.runPromptRefs) ? e.runPromptRefs : []).flatMap((e, t) => {
		let n = Pn(e), r = String(n.url || ""), i = Mn(r, n.kind);
		return !r || i === "audio" ? [] : [{
			asset_uris: Pn(n.asset_uris),
			imageIndex: Nn(n.imageIndex, t),
			kind: i,
			name: String(n.name || `图片${t + 1}`),
			nodeId: String(n.nodeId || ""),
			url: r
		}];
	});
}
function Dn(e, t) {
	let n = t.filter((e) => e.url && e.name).slice().sort((e, t) => t.name.length - e.name.length);
	if (!e || !n.length || !e.includes("@")) return "";
	let r = "", i = 0;
	for (; i < e.length;) {
		if (e[i] === "@") {
			let t = n.find((t) => e.slice(i + 1, i + 1 + t.name.length) === t.name);
			if (t) {
				r += jn(t), i += t.name.length + 1;
				continue;
			}
		}
		r += In(e[i]), i += 1;
	}
	return r;
}
function On(e, t, n, r) {
	let i = e.map(Cn);
	if (t < 0 || n < 0 || t >= i.length || n >= i.length || t === n) return i;
	let [a] = i.splice(t, 1), o = i.indexOf(Cn(e[n]));
	return o < 0 ? e.map(Cn) : (r === "after" && (o += 1), i.splice(o, 0, a), i);
}
function kn(e) {
	let t = [];
	return e.url && t.push({
		kind: e.mediaKind,
		name: e.name,
		url: e.url
	}), Array.isArray(e.images) && t.push(...e.images), Array.isArray(e.generatedOutputs) && t.push(...e.generatedOutputs), t.flatMap((t, n) => {
		let r = Pn(t), i = typeof t == "string" ? t : String(r.url || r.path || r.src || ""), a = Mn(i, r.kind || r.type || e.mediaKind);
		return !i || a === "audio" ? [] : [{
			assetUris: Pn(r.asset_uris),
			imageIndex: n,
			kind: a,
			name: String(r.name || e.name || `图片${n + 1}`),
			nodeId: e.id,
			url: i
		}];
	});
}
function An(e) {
	let t = /* @__PURE__ */ new Set();
	return e.filter((e) => !!(e.url && !t.has(e.url) && t.add(e.url)));
}
function jn(e) {
	let t = e.kind === "video" ? `<video muted playsinline preload="metadata" src="${Fn(e.url)}"></video>` : `<img alt="" draggable="false" src="${Fn(e.url)}">`;
	return `<span class="mention-image-token" contenteditable="false" data-url="${Fn(e.url)}" data-kind="${e.kind}" data-name="${Fn(e.name)}" data-node-id="${Fn(e.nodeId)}" data-image-index="${e.imageIndex}" data-asset-uris="${Fn(JSON.stringify(e.asset_uris || {}))}">${t}<span>${In(e.name)}</span></span>`;
}
function Mn(e, t) {
	let n = String(t || "").toLowerCase();
	return n === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(e) ? "video" : n === "audio" || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(e) ? "audio" : "image";
}
function Nn(e, t) {
	let n = Number(e);
	return Number.isFinite(n) ? n : t;
}
function Pn(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
function Fn(e) {
	return In(e).replace(/"/g, "&quot;");
}
function In(e) {
	return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}
//#endregion
//#region src/canvas/ui/smart-canvas-composer.tsx
var Ln = [
	["1k", "1K"],
	["2k", "2K"],
	["4k", "4K"],
	["custom", "自定义"]
], Rn = [
	["square", "1:1"],
	["portrait", "2:3"],
	["landscape", "3:2"],
	["portrait43", "3:4"],
	["landscape43", "4:3"],
	["story", "9:16"],
	["wide", "16:9"],
	["ultrawide", "21:9"],
	["tall", "9:21"],
	["source", "自适应"],
	["custom", "自定义"]
];
function zn({ canvasRuntime: e, document: t, generator: n, onOpenTemplate: r, onPatchGenerator: i, onPatchOutput: a, onRun: o, output: s, readOnly: c }) {
	let [l, u] = (0, G.useState)(() => Wn(n)), [d, f] = (0, G.useState)(() => n?.type === "video" ? "video" : "image"), [p, m] = (0, G.useState)(() => qn(s)), [h, g] = (0, G.useState)(() => Jn(s)), [_, v] = (0, G.useState)([]), [y, b] = (0, G.useState)(-1), [x, S] = (0, G.useState)(null), C = (0, G.useRef)(null), w = n ?? Gn(l, d), T = (0, G.useMemo)(() => wn(t, s, n), [
		t,
		n,
		s
	]), E = (0, G.useMemo)(() => Tn(t, s, n), [
		t,
		n,
		s
	]), D = (0, G.useMemo)(() => new Set(Array.isArray(s?.blockedInputRefs) ? s.blockedInputRefs.map(String) : []), [s?.blockedInputRefs]), O = (0, G.useMemo)(() => Zn(t, n), [t, n]), k = !!(n && t?.connections.some((e) => e.to === n.id));
	(0, G.useEffect)(() => {
		u(Wn(n)), f(n?.type === "video" ? "video" : "image"), m(qn(s)), g(Jn(s));
	}, [n?.id, s?.id]), (0, G.useLayoutEffect)(() => {
		let e = C.current;
		e && (e.innerHTML = Qn(s));
	}, [s?.id]), (0, G.useEffect)(() => {
		let t = !0, n = String(w.comfyWorkflow || "");
		if (l !== "comfy" || w.mode !== "custom" || !n) {
			v([]);
			return;
		}
		return e.getComfyFields(n).then((e) => {
			t && v(e);
		}), () => {
			t = !1;
		};
	}, [
		w.comfyWorkflow,
		w.mode,
		e,
		l
	]), (0, G.useEffect)(() => {
		window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		l,
		n,
		d,
		s,
		E.length,
		O
	]);
	let A = (e) => {
		u(e), e === "modelscope" ? i({
			count: Number(w.count || 1),
			msRatio: w.msRatio || "square",
			msResolution: w.msResolution || "1k",
			msgenModel: w.msgenModel || "zimage"
		}, "msgen") : e === "comfy" ? i({
			comfyParams: w.comfyParams || {},
			comfyRandomActive: w.comfyRandomActive || {},
			height: Number(w.height || 1024),
			mode: w.mode || "text",
			width: Number(w.width || 1024)
		}, "comfy") : d === "video" ? i({
			apiProvider: e === "volcengine" ? "volcengine" : w.apiProvider || "",
			aspectRatio: w.aspectRatio || "16:9",
			duration: Number(w.duration || 5),
			resolution: w.resolution || ""
		}, "video") : i({
			apiProvider: e === "volcengine" ? "volcengine" : w.apiProvider === "volcengine" ? "" : w.apiProvider || "",
			count: Number(w.count || 1),
			quality: w.quality || "auto",
			ratio: w.ratio || "square",
			resolution: w.resolution || "1k"
		}, "generator");
	}, j = (e) => {
		f(e), e === "video" ? i({
			apiProvider: l === "volcengine" ? "volcengine" : w.apiProvider || "",
			aspectRatio: w.aspectRatio || "16:9",
			duration: Number(w.duration || 5),
			resolution: w.resolution || ""
		}, "video") : i({
			apiProvider: l === "volcengine" ? "volcengine" : w.apiProvider === "volcengine" ? "" : w.apiProvider || "",
			count: Number(w.count || 1),
			quality: w.quality || "auto",
			ratio: w.ratio || "square",
			resolution: w.resolution || "1k"
		}, "generator");
	}, M = (e, t) => {
		m(e.text), a({
			promptDraftHtml: e.html,
			promptDraftText: e.text,
			promptDraftTouched: !0,
			runPromptRefs: e.refs
		}, t);
	}, N = (e = p) => {
		let t = C.current;
		t && (t.textContent = e, M(yn(t), !0));
	}, P = (e) => {
		if (c || !s) return;
		let t = E[e];
		if (!t) return;
		let n = Cn(t), r = new Set(D);
		r.has(n) ? r.delete(n) : r.add(n), a({ blockedInputRefs: [...r] }, !0);
	}, F = (e, t) => {
		if (y < 0 || y === t || c) return;
		e.preventDefault(), e.stopPropagation();
		let n = e.currentTarget.getBoundingClientRect(), r = e.clientX < n.left + n.width / 2 ? "before" : "after";
		S({
			index: t,
			placement: r
		});
	}, I = (e, t) => {
		if (y < 0 || y === t || c) return;
		e.preventDefault(), e.stopPropagation();
		let n = e.currentTarget.getBoundingClientRect(), r = e.clientX < n.left + n.width / 2 ? "before" : "after";
		a({ inputRefOrder: On(E, y, t, r) }, !0), b(-1), S(null);
	}, ee = (e) => {
		e.preventDefault(), e.stopPropagation();
		let t = {
			height: h,
			y: e.clientY
		}, n = e.clientY, r = (e) => {
			n = e.clientY, g(Math.max(60, Math.min(380, t.height + e.clientY - t.y)));
		};
		window.addEventListener("pointermove", r), window.addEventListener("pointerup", () => {
			window.removeEventListener("pointermove", r);
			let e = Math.max(60, Math.min(380, t.height + n - t.y));
			g(e), a({ promptH: e }, !0);
		}, { once: !0 });
	}, te = s ? {
		left: Number(s.x || 0) + Yn(s) / 2 - 270,
		top: Number(s.y || 0) + Xn(s) + 14,
		width: 540,
		"--prompt-h": `${h}px`
	} : {
		width: 540,
		"--prompt-h": `${h}px`
	};
	return /* @__PURE__ */ (0, K.jsx)("div", {
		className: `composer ${s ? "open" : ""}`,
		id: "composer",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		style: te,
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "composer-card",
			children: [
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "composer-head",
					children: /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "composer-head-left",
						children: [/* @__PURE__ */ (0, K.jsxs)("select", {
							className: "engine-select",
							disabled: !s || c,
							id: "engineSelect",
							onChange: (e) => A(e.target.value),
							value: l,
							children: [
								/* @__PURE__ */ (0, K.jsx)("option", {
									value: "api",
									children: "API生成"
								}),
								/* @__PURE__ */ (0, K.jsx)("option", {
									value: "volcengine",
									children: "火山引擎"
								}),
								/* @__PURE__ */ (0, K.jsx)("option", {
									value: "modelscope",
									children: "Modelscope生成"
								}),
								/* @__PURE__ */ (0, K.jsx)("option", {
									value: "comfy",
									children: "ComfyUI生成"
								})
							]
						}), /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "kind-toggle",
							id: "apiKindToggle",
							style: { display: l === "api" || l === "volcengine" ? "inline-flex" : "none" },
							children: [/* @__PURE__ */ (0, K.jsxs)("button", {
								className: d === "image" ? "active" : "",
								"data-kind": "image",
								disabled: !s || c,
								onClick: () => j("image"),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "image" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "图片" })]
							}), /* @__PURE__ */ (0, K.jsxs)("button", {
								className: d === "video" ? "active" : "",
								"data-kind": "video",
								disabled: !s || c,
								onClick: () => j("video"),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "film" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "视频" })]
							})]
						})]
					})
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: `input-thumbs-row ${E.length ? "has-items" : ""}`,
					id: "inputThumbsRow",
					children: E.length ? /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "input-thumb-list",
						children: [E.map((e, t) => {
							let n = D.has(Cn(e)), r = x?.index === t ? x.placement === "before" ? "drop-before" : "drop-after" : "";
							return /* @__PURE__ */ (0, K.jsxs)("div", {
								className: `input-thumb ${n ? "input-blocked" : ""} ${y === t ? "dragging" : ""} ${r}`.trim(),
								"data-blocked-label": n ? "已阻止" : void 0,
								"data-node-id": e.nodeId,
								"data-url": e.url,
								draggable: !c && E.length > 1,
								onClick: (e) => {
									e.preventDefault(), e.stopPropagation(), P(t);
								},
								onDragEnd: () => {
									b(-1), S(null);
								},
								onDragOver: (e) => F(e, t),
								onDragStart: (e) => {
									e.stopPropagation(), b(t), e.dataTransfer.effectAllowed = "move", e.dataTransfer.setData("application/x-smart-input-thumb", String(t));
								},
								onDrop: (e) => I(e, t),
								title: `${e.name} · ${n ? "点击恢复引用" : "点击阻止引用"}`,
								children: [e.kind === "video" ? /* @__PURE__ */ (0, K.jsx)("video", {
									muted: !0,
									preload: "metadata",
									src: e.url
								}) : /* @__PURE__ */ (0, K.jsx)("img", {
									alt: "",
									draggable: !1,
									src: e.url
								}), /* @__PURE__ */ (0, K.jsxs)("span", {
									className: "input-thumb-label",
									children: ["图", t + 1]
								})]
							}, `${e.url}-${t}`);
						}), E.length > 1 ? /* @__PURE__ */ (0, K.jsxs)("span", {
							className: "input-thumb-count",
							children: [
								"共 ",
								E.length,
								" 个输入"
							]
						}) : null]
					}) : null
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: `input-prompt-preview ${O ? "has-text" : ""}`,
					id: "inputPromptPreview",
					children: O ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("div", {
						className: "input-prompt-preview-label",
						children: "上游提示词"
					}), /* @__PURE__ */ (0, K.jsx)("div", {
						className: "input-prompt-preview-text",
						children: O
					})] }) : null
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "prompt-row",
					children: [
						/* @__PURE__ */ (0, K.jsx)("div", {
							className: "prompt-input",
							contentEditable: !c,
							"data-placeholder": d === "video" ? "描述你想生成或编辑的视频..." : "描述你想生成或编辑的图片...",
							id: "promptInput",
							onBlur: (e) => M(yn(e.currentTarget), !0),
							onInput: (e) => M(yn(e.currentTarget), !1),
							ref: C,
							suppressContentEditableWarning: !0
						}),
						/* @__PURE__ */ (0, K.jsxs)("button", {
							"aria-label": "模板库",
							className: "composer-template-btn",
							disabled: !s || c,
							id: "composerTemplateBtn",
							onClick: () => r?.(p, N),
							title: "模板库",
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "library" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "模板库" })]
						}),
						/* @__PURE__ */ (0, K.jsx)(vn, {
							inputItems: T,
							inputRef: C,
							onPromptChange: M,
							outputId: s?.id || "",
							readOnly: c
						}),
						/* @__PURE__ */ (0, K.jsx)("div", {
							className: "prompt-resize",
							id: "promptResize",
							onPointerDown: ee,
							title: "拖拽调整文本框高度"
						})
					]
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "param-row",
					children: /* @__PURE__ */ (0, K.jsx)("div", {
						className: "dynamic-params",
						id: "dynamicParams",
						children: /* @__PURE__ */ (0, K.jsx)(Bn, {
							canvasRuntime: e,
							comfyFields: _,
							engine: l,
							generator: w,
							kind: d,
							onPatch: i,
							readOnly: !s || c
						})
					})
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "composer-actions",
					children: [/* @__PURE__ */ (0, K.jsxs)("button", {
						className: "run-btn cascade-run-btn",
						disabled: !s || c || !!w.running,
						id: "cascadeRunBtn",
						onClick: () => o("cascade"),
						style: { display: k ? "inline-flex" : "none" },
						type: "button",
						children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "workflow" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "一键运行" })]
					}), /* @__PURE__ */ (0, K.jsxs)("button", {
						className: "run-btn",
						disabled: !s || c || !!w.running,
						id: "runBtn",
						onClick: () => o("node"),
						type: "button",
						children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "sparkles" }), /* @__PURE__ */ (0, K.jsx)("span", { children: w.running ? "运行中…" : "运行" })]
					})]
				})
			]
		})
	});
}
function Bn({ canvasRuntime: e, comfyFields: t, engine: n, generator: r, kind: i, onPatch: a, readOnly: o }) {
	if (n === "modelscope") {
		let t = e.getNodeOptions("msgen", "model", r);
		return /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
			/* @__PURE__ */ (0, K.jsx)(Vn, {
				icon: "sparkles",
				label: "功能",
				onChange: (e) => a({ msgenModel: e }, "msgen"),
				options: t,
				value: String(r.msgenModel || "zimage")
			}),
			/* @__PURE__ */ (0, K.jsx)(Vn, {
				label: "分辨率",
				onChange: (e) => a({ msResolution: e }, "msgen"),
				options: Ln.map(([e, t]) => ({
					value: e,
					label: t
				})),
				value: String(r.msResolution || "1k")
			}),
			/* @__PURE__ */ (0, K.jsx)(Vn, {
				label: "比例",
				onChange: (e) => a({ msRatio: e }, "msgen"),
				options: Rn.filter(([e]) => e !== "source").map(([e, t]) => ({
					value: e,
					label: t
				})),
				value: String(r.msRatio || "square")
			}),
			/* @__PURE__ */ (0, K.jsx)(Hn, {
				disabled: o,
				onChange: (e) => a({ count: e }, "msgen"),
				value: Number(r.count || 1)
			})
		] });
	}
	if (n === "comfy") {
		let n = [
			["text", "文生图"],
			["enhance", "图片增强"],
			["edit", "图片编辑"],
			["custom", "自定义"]
		], i = e.getNodeOptions("comfy", "workflow", r), o = r.comfyParams && typeof r.comfyParams == "object" ? r.comfyParams : {};
		return /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
			/* @__PURE__ */ (0, K.jsx)(Vn, {
				icon: "workflow",
				label: "ComfyUI 模式",
				onChange: (e) => a({ mode: e }, "comfy"),
				options: n.map(([e, t]) => ({
					value: e,
					label: t
				})),
				value: String(r.mode || "text")
			}),
			r.mode === "custom" ? /* @__PURE__ */ (0, K.jsx)(Vn, {
				label: "工作流",
				onChange: (e) => a({
					comfyParams: {},
					comfyWorkflow: e
				}, "comfy"),
				options: i,
				value: String(r.comfyWorkflow || "")
			}) : null,
			r.mode === "text" ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)(Un, {
				label: "宽",
				onChange: (e) => a({ width: e }, "comfy"),
				value: Number(r.width || 1024)
			}), /* @__PURE__ */ (0, K.jsx)(Un, {
				label: "高",
				onChange: (e) => a({ height: e }, "comfy"),
				value: Number(r.height || 1024)
			})] }) : null,
			t.map((e) => {
				let t = String(e.id || ""), n = o[t] ?? e.default ?? "";
				return t ? e.type === "boolean" ? /* @__PURE__ */ (0, K.jsxs)("button", {
					className: `setting-check ${n ? "active" : ""}`,
					onClick: () => a({ comfyParams: {
						...o,
						[t]: !n
					} }, "comfy"),
					type: "button",
					children: [/* @__PURE__ */ (0, K.jsx)("span", { className: "check-box" }), /* @__PURE__ */ (0, K.jsx)("span", { children: e.name || t })]
				}, t) : e.type === "dropdown" ? /* @__PURE__ */ (0, K.jsx)(Vn, {
					label: e.name || t,
					onChange: (e) => a({ comfyParams: {
						...o,
						[t]: e
					} }, "comfy"),
					options: (e.options || []).map((e) => ({
						label: e,
						value: e
					})),
					value: String(n)
				}, t) : /* @__PURE__ */ (0, K.jsx)(Un, {
					label: e.name || t,
					max: e.max,
					min: e.min,
					onChange: (e) => a({ comfyParams: {
						...o,
						[t]: e
					} }, "comfy"),
					step: e.step,
					value: Number(n || 0)
				}, t) : null;
			})
		] });
	}
	if (i === "video") {
		let t = Kn(e.getNodeOptions("video", "provider", r), n), i = String(r.apiProvider || t[0]?.value || (n === "volcengine" ? "volcengine" : "")), o = e.getNodeOptions("video", "model", {
			...r,
			apiProvider: i
		});
		return /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
			/* @__PURE__ */ (0, K.jsx)(Vn, {
				icon: "server",
				label: "平台",
				onChange: (t) => a({
					apiProvider: t,
					model: e.getNodeOptions("video", "model", {
						...r,
						apiProvider: t
					})[0]?.value || ""
				}, "video"),
				options: t,
				value: i
			}),
			/* @__PURE__ */ (0, K.jsx)(Vn, {
				label: "模型",
				onChange: (e) => a({ model: e }, "video"),
				options: o,
				value: String(r.model || o[0]?.value || "")
			}),
			/* @__PURE__ */ (0, K.jsx)(Vn, {
				label: "分辨率",
				onChange: (e) => a({ resolution: e }, "video"),
				options: [
					"",
					"480p",
					"720p",
					"1080p"
				].map((e) => ({
					value: e,
					label: e || "Auto"
				})),
				value: String(r.resolution || "")
			}),
			/* @__PURE__ */ (0, K.jsx)(Vn, {
				label: "比例",
				onChange: (e) => a({ aspectRatio: e }, "video"),
				options: [
					"16:9",
					"9:16",
					"1:1",
					"4:3",
					"3:4",
					"21:9",
					"9:21",
					"keep_ratio",
					"adaptive"
				].map((e) => ({
					value: e,
					label: e
				})),
				value: String(r.aspectRatio || "16:9")
			}),
			/* @__PURE__ */ (0, K.jsx)(Un, {
				label: "时长",
				max: 60,
				min: -1,
				onChange: (e) => a({ duration: e }, "video"),
				value: Number(r.duration || 5)
			}),
			[
				["enhancePrompt", "增强提示词"],
				["enableUpsample", "超分辨率"],
				["generateAudio", "生成音频"],
				["cameraFixed", "固定镜头"],
				["watermark", "水印"],
				["multimodal", "多模态"]
			].map(([e, t]) => /* @__PURE__ */ (0, K.jsxs)("button", {
				className: `setting-check ${r[e] ? "active" : ""}`,
				onClick: () => a({ [e]: !r[e] }, "video"),
				type: "button",
				children: [/* @__PURE__ */ (0, K.jsx)("span", { className: "check-box" }), /* @__PURE__ */ (0, K.jsx)("span", { children: t })]
			}, e))
		] });
	}
	let s = Kn(e.getNodeOptions("generator", "provider", r), n), c = String(r.apiProvider || s[0]?.value || (n === "volcengine" ? "volcengine" : "")), l = e.getNodeOptions("generator", "model", {
		...r,
		apiProvider: c
	});
	return /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
		/* @__PURE__ */ (0, K.jsx)(Vn, {
			icon: "server",
			label: "平台",
			onChange: (t) => a({
				apiProvider: t,
				model: e.getNodeOptions("generator", "model", {
					...r,
					apiProvider: t
				})[0]?.value || ""
			}, "generator"),
			options: s,
			value: c
		}),
		/* @__PURE__ */ (0, K.jsx)(Vn, {
			label: "模型",
			onChange: (e) => a({ model: e }, "generator"),
			options: l,
			value: String(r.model || l[0]?.value || "")
		}),
		/* @__PURE__ */ (0, K.jsx)(Vn, {
			label: "分辨率",
			onChange: (e) => a({ resolution: e }, "generator"),
			options: Ln.map(([e, t]) => ({
				value: e,
				label: t
			})),
			value: String(r.resolution || "1k")
		}),
		/* @__PURE__ */ (0, K.jsx)(Vn, {
			label: "比例",
			onChange: (e) => a({ ratio: e }, "generator"),
			options: Rn.map(([e, t]) => ({
				value: e,
				label: t
			})),
			value: String(r.ratio || "square")
		}),
		/* @__PURE__ */ (0, K.jsx)(Vn, {
			label: "质量",
			onChange: (e) => a({ quality: e }, "generator"),
			options: [
				"auto",
				"low",
				"medium",
				"high"
			].map((e) => ({
				value: e,
				label: `Q ${e}`
			})),
			value: String(r.quality || "auto")
		}),
		/* @__PURE__ */ (0, K.jsx)(Hn, {
			disabled: o,
			onChange: (e) => a({ count: e }, "generator"),
			value: Number(r.count || 1)
		}),
		r.resolution === "custom" ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)(Un, {
			label: "宽",
			min: 64,
			onChange: (e) => a({
				customWidth: e,
				customSize: `${e}x${String(r.customHeight || "")}`
			}, "generator"),
			step: 64,
			value: Number(r.customWidth || 1024)
		}), /* @__PURE__ */ (0, K.jsx)(Un, {
			label: "高",
			min: 64,
			onChange: (e) => a({
				customHeight: e,
				customSize: `${String(r.customWidth || "")}x${e}`
			}, "generator"),
			step: 64,
			value: Number(r.customHeight || 1024)
		})] }) : null
	] });
}
function Vn({ icon: e, label: t, onChange: n, options: r, value: i }) {
	let [a, o] = (0, G.useState)(!1), s = r.find((e) => e.value === i);
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: `smart-control ${a ? "pinned" : ""}`,
		children: [/* @__PURE__ */ (0, K.jsxs)("button", {
			"aria-label": t,
			className: "smart-pill",
			onClick: () => o((e) => !e),
			type: "button",
			children: [
				e ? /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": e }) : null,
				/* @__PURE__ */ (0, K.jsx)("span", {
					className: "sub",
					children: s?.label || i || t
				}),
				/* @__PURE__ */ (0, K.jsx)("i", {
					className: "pill-caret",
					"data-lucide": "chevron-down"
				})
			]
		}), /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "smart-popover compact-popover",
			children: [/* @__PURE__ */ (0, K.jsx)("div", {
				className: "smart-popover-title",
				children: t
			}), /* @__PURE__ */ (0, K.jsx)("div", {
				className: "model-list",
				children: r.map((e) => /* @__PURE__ */ (0, K.jsx)("button", {
					className: `direct-option ${e.value === i ? "active" : ""}`,
					"data-param": t,
					"data-value": e.value,
					onClick: () => {
						n(e.value), o(!1);
					},
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)("span", { children: e.label })
				}, e.value))
			})]
		})]
	});
}
function Hn({ disabled: e, onChange: t, value: n }) {
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "num-compact",
		children: [/* @__PURE__ */ (0, K.jsx)("span", {
			className: "num-label",
			children: "数量"
		}), /* @__PURE__ */ (0, K.jsx)("input", {
			"aria-label": "生成数量",
			disabled: e,
			max: "8",
			min: "1",
			onChange: (e) => t(Math.max(1, Math.min(8, Number(e.target.value) || 1))),
			type: "number",
			value: Math.max(1, Math.min(8, n))
		})]
	});
}
function Un({ label: e, max: t, min: n, onChange: r, step: i, value: a }) {
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "num-compact",
		children: [/* @__PURE__ */ (0, K.jsx)("span", {
			className: "num-label",
			children: e
		}), /* @__PURE__ */ (0, K.jsx)("input", {
			"aria-label": e,
			max: t,
			min: n,
			onChange: (e) => r(Number(e.target.value) || 0),
			step: i,
			type: "number",
			value: a
		})]
	});
}
function Wn(e) {
	return e?.type === "msgen" ? "modelscope" : e?.type === "comfy" ? "comfy" : e?.apiProvider === "volcengine" ? "volcengine" : "api";
}
function Gn(e, t) {
	return {
		id: "",
		type: e === "modelscope" ? "msgen" : e === "comfy" ? "comfy" : t === "video" ? "video" : "generator",
		apiProvider: e === "volcengine" ? "volcengine" : "",
		count: 1,
		quality: "auto",
		ratio: "square",
		resolution: "1k"
	};
}
function Kn(e, t) {
	return t === "volcengine" ? e.filter((e) => e.value === "volcengine") : e.filter((e) => e.value !== "volcengine");
}
function qn(e) {
	return String(e?.promptDraftText || e?.runPrompt || "");
}
function Jn(e) {
	return Math.max(60, Math.min(380, Number(e?.promptH || 124)));
}
function Yn(e) {
	return Number(e.w || 460);
}
function Xn(e) {
	return Number(e.h || 320);
}
function Zn(e, t) {
	if (!e || !t) return "";
	let n = new Map(e.nodes.map((e) => [e.id, e]));
	return e.connections.filter((e) => e.to === t.id).map((e) => n.get(e.from)).flatMap((e) => e ? e.type === "prompt" ? [String(e.text || "")] : e.type === "loop" ? [String(e.fixedPrompt || e.variablePrompt || "")] : e.type === "llm" ? [String(e.outputText || e.userInput || "")] : e.type === "promptGroup" && Array.isArray(e.items) ? e.items.map((e) => String(n.get(String(e))?.text || "")) : [] : []).map((e) => e.trim()).filter(Boolean).join("\n");
}
function Qn(e) {
	let t = String(e?.promptDraftHtml || "");
	return t.includes("mention-image-token") ? t : Dn(qn(e), En(e)) || t || $n(qn(e));
}
function $n(e) {
	return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}
//#endregion
//#region src/canvas/ui/smart-canvas-connections.tsx
function er(e, t, n, r = !1) {
	let i = String(e.kind || "flow"), a = i === "history", o = a ? t.x + t.width / 2 : t.x + t.width, s = a ? t.y + t.height : t.y + t.height / 2, c = a ? n.x + n.width / 2 : n.x, l = a ? n.y : n.y + n.height / 2, u = Math.max(50, Math.abs(c - o) * .45), d = Math.max(36, Math.abs(l - s) * .45);
	return {
		color: r ? "#16a34a" : a ? "rgba(100,116,139,0.46)" : i === "input" ? "rgba(100,116,139,0.62)" : "rgba(148,163,184,0.62)",
		curve: a ? `M${o} ${s} C ${o} ${s + d}, ${c} ${l - d}, ${c} ${l}` : `M${o} ${s} C ${o + u} ${s}, ${c - u} ${l}, ${c} ${l}`,
		midpoint: {
			x: (o + c) / 2,
			y: (s + l) / 2
		},
		target: {
			x: c,
			y: l
		},
		width: i === "input" ? 1.9 : 1.6
	};
}
function tr(e, t) {
	let n = e.fromPort === "out", r = n ? t.x + t.width : t.x, i = t.y + t.height / 2, a = e.currentWorld.x, o = e.currentWorld.y, s = Math.max(50, Math.abs(a - r) * .45), c = n ? 1 : -1;
	return `M${r} ${i} C ${r + s * c} ${i}, ${a - s * c} ${o}, ${a} ${o}`;
}
function nr(e) {
	let t = /* @__PURE__ */ new Map();
	e.connections.forEach((e) => {
		if (String(e.kind || "flow") === "history") return;
		let n = t.get(e.from) || [];
		n.push(e), t.set(e.from, n);
	});
	let n = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Set(), i = (e) => {
		r.has(e) || (r.add(e), (t.get(e) || []).forEach((e) => {
			n.add(`${e.from}->${e.to}`), i(e.to);
		}));
	};
	return e.nodes.filter((e) => e.type === "loop").forEach((e) => i(e.id)), n;
}
function rr(e, t, n) {
	let r = String(e.cascadeState || e.runState || "");
	return r === "active" || r === "done" || r === "wait" ? r : t.running || n.running ? "active" : t.runStatus === "done" && n.runStatus === "done" ? "done" : "";
}
function ir({ document: e, drag: t, nodeRect: n, onCut: r, onSelect: i, selectedIndex: a = -1 }) {
	let o = new Map(e.nodes.map((e) => [e.id, e])), s = nr(e), c = e.connections.map((e, t) => {
		let c = o.get(e.from), l = o.get(e.to);
		if (!c || !l) return null;
		let u = String(e.kind || "flow") === "history", d = rr(e, c, l), f = !u && (s.has(`${e.from}->${e.to}`) || !!d), p = !!l.pending && !f, m = er(e, n(c), n(l), f), h = [
			p ? "conn-pending" : "",
			f ? "conn-cascade" : "",
			f && d === "done" ? "conn-cascade-done" : "",
			f && d && d !== "done" ? "conn-cascade-wait" : "",
			f && d === "active" ? "conn-cascade-active" : "",
			u ? "conn-history" : ""
		].filter(Boolean).join(" ");
		return /* @__PURE__ */ (0, K.jsxs)("g", {
			"data-selected": a === t ? "true" : "false",
			children: [
				/* @__PURE__ */ (0, K.jsx)("path", {
					className: h,
					d: m.curve,
					fill: "none",
					opacity: p ? .82 : 1,
					stroke: m.color,
					strokeWidth: m.width
				}),
				/* @__PURE__ */ (0, K.jsx)("path", {
					className: "conn-hit",
					d: m.curve,
					"data-conn-index": t,
					fill: "none",
					onClick: (e) => {
						e.preventDefault(), e.stopPropagation(), i(t);
					},
					onDoubleClick: (e) => {
						e.preventDefault(), e.stopPropagation(), r(t);
					},
					onPointerDown: (e) => e.stopPropagation(),
					stroke: "transparent",
					strokeWidth: "14"
				}),
				/* @__PURE__ */ (0, K.jsx)("circle", {
					cx: m.target.x,
					cy: m.target.y,
					fill: m.color,
					opacity: ".66",
					r: "3.5"
				}),
				/* @__PURE__ */ (0, K.jsxs)("g", {
					className: "conn-cut",
					"data-conn-index": t,
					onClick: (e) => {
						e.preventDefault(), e.stopPropagation(), r(t);
					},
					onPointerDown: (e) => e.stopPropagation(),
					transform: `translate(${m.midpoint.x} ${m.midpoint.y})`,
					children: [/* @__PURE__ */ (0, K.jsx)("circle", {
						fill: "var(--card)",
						r: "8",
						stroke: m.color,
						strokeWidth: "1.4"
					}), /* @__PURE__ */ (0, K.jsx)("path", {
						d: "M-3 -3 L3 3 M3 -3 L-3 3",
						stroke: m.color,
						strokeLinecap: "round",
						strokeWidth: "1.5"
					})]
				})
			]
		}, `${e.from}-${e.to}-${t}`);
	}), l = t ? o.get(t.fromId) : null;
	return /* @__PURE__ */ (0, K.jsxs)("svg", {
		className: "connection-layer",
		height: "4000",
		viewBox: "0 0 6000 4000",
		width: "6000",
		xmlns: "http://www.w3.org/2000/svg",
		children: [c, t && l ? /* @__PURE__ */ (0, K.jsx)("path", {
			className: "port-drag-temp conn-pending",
			d: tr(t, n(l)),
			fill: "none",
			stroke: "rgba(100,116,139,0.92)",
			strokeLinecap: "round",
			strokeWidth: "1.9"
		}) : null]
	});
}
//#endregion
//#region src/canvas/ui/smart-canvas-create-menu.tsx
var ar = [
	{
		icon: "upload-cloud",
		subtitle: "支持图片/音频/视频/批量上传",
		title: "上传节点",
		type: "image"
	},
	{
		icon: "text-cursor-input",
		subtitle: "手写或用 LLM 生成文本",
		title: "提示词",
		type: "prompt"
	},
	{
		icon: "repeat-2",
		subtitle: "控制一键运行轮数和批次",
		title: "循环节点",
		type: "loop"
	}
];
function or({ left: e, onCreate: t, top: n }) {
	return /* @__PURE__ */ (0, K.jsx)("div", {
		className: "create-menu open",
		id: "createMenu",
		onPointerDown: (e) => e.stopPropagation(),
		style: {
			left: e,
			top: n
		},
		children: /* @__PURE__ */ (0, K.jsx)("div", {
			className: "create-menu-grid",
			children: ar.map((e) => /* @__PURE__ */ (0, K.jsxs)("button", {
				className: "create-card",
				"data-create-type": e.type,
				onClick: (n) => {
					n.stopPropagation(), t(e.type);
				},
				type: "button",
				children: [/* @__PURE__ */ (0, K.jsx)("span", {
					className: "create-card-icon",
					children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": e.icon })
				}), /* @__PURE__ */ (0, K.jsxs)("span", { children: [/* @__PURE__ */ (0, K.jsx)("div", {
					className: "create-card-title",
					children: e.title
				}), /* @__PURE__ */ (0, K.jsx)("div", {
					className: "create-card-sub",
					children: e.subtitle
				})] })]
			}, e.type))
		})
	});
}
//#endregion
//#region src/canvas/ui/smart-image-node.tsx
var sr = /* @__PURE__ */ new Map();
function cr(e) {
	let t = String(e.kind || "").toLowerCase(), n = String(e.url || "").toLowerCase();
	return t === "file" ? "file" : t === "text" || /\.(txt|json|csv|srt|vtt|md)(\?|$)/.test(n) ? "text" : t === "audio" || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(n) ? "audio" : t === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/.test(n) ? "video" : "image";
}
function lr(e) {
	return {
		height: Number(e.natural_h || e.height || e.h || e.layout_h || e.preview_h || 0),
		width: Number(e.natural_w || e.width || e.w || e.layout_w || e.preview_w || 0)
	};
}
function ur(e) {
	let t = fr(e), n = t.length, r = Number(e.scale), i = Number.isFinite(r) && r > 0 ? n > 1 && r === 1.6 ? .8 : r : n > 1 ? .8 : 2, a = Number(e.w), o = Number(e.h);
	if (!n) {
		let t = Number(e.pending) > 0 || !!e.queued;
		return {
			cols: 1,
			rows: 1,
			thumb: Math.round(96 * i),
			width: Number.isFinite(a) && a > 24 ? a : Math.round(t ? 260 * i : 316),
			height: Number.isFinite(o) && o > 24 ? o : Math.round(t ? 180 * i : 194)
		};
	}
	if (n === 1) {
		if (Number.isFinite(a) && a > 24 && Number.isFinite(o) && o > 24) return {
			cols: 1,
			rows: 1,
			thumb: Math.round(96 * i),
			width: Math.round(a),
			height: Math.round(o)
		};
		let e = lr(t[0]);
		if (e.width > 0 && e.height > 0) {
			let t = Math.min(260 * i / e.width, 220 * i / e.height);
			return {
				cols: 1,
				rows: 1,
				thumb: Math.round(96 * i),
				width: Math.max(72, Math.round(e.width * t)),
				height: Math.max(72, Math.round(e.height * t))
			};
		}
		return {
			cols: 1,
			rows: 1,
			thumb: Math.round(96 * i),
			width: Math.round(260 * i),
			height: Math.round(180 * i)
		};
	}
	let s = Math.round(224 * i), c = t.find((e) => e.grid?.type === "grid-split")?.grid, l = c ? Math.max(1, Number(c.cols || 1)) : Math.min(4, Math.max(2, Math.ceil(Math.sqrt(n)))), u = c ? Math.max(1, Number(c.rows || 1)) : Math.ceil(n / l), d = Math.min(3, u);
	if (Number.isFinite(a) && a > 40 && Number.isFinite(o) && o > 40) {
		let e = dr(n, a, o, s, c ? l : void 0);
		return {
			cols: e.cols,
			rows: e.rows,
			visibleRows: e.visibleRows,
			thumb: e.thumb,
			width: Math.round(a),
			height: e.visibleRows * (e.thumb + 8) - 8 + 32
		};
	}
	return {
		cols: l,
		rows: u,
		visibleRows: d,
		thumb: s,
		width: Number.isFinite(a) && a > 40 ? a : Math.max(Math.round(226 * i), l * (s + 8) + 24),
		height: d * (s + 8) - 8 + 32
	};
}
function dr(e, t, n, r, i) {
	let a = null, o = i || 1, s = i || e;
	for (let i = o; i <= s; i += 1) {
		let o = Math.ceil(e / i), s = Math.min(3, o), c = Math.floor(Math.min((t - 32 - (i - 1) * 8) / i, (n - 32 - (s - 1) * 8) / s)), l = Math.max(28, Math.min(r, c)), u = i * l + (i - 1) * 8 + 32, d = s * l + (s - 1) * 8 + 32, f = [
			+(c >= 28),
			l,
			l >= r ? i : 0,
			-(Math.max(0, t - u) + Math.max(0, n - d) * .35),
			-o
		];
		(!a || f.some((e, t) => e !== a.score[t] && e > a.score[t] && f.slice(0, t).every((e, t) => e === a.score[t]))) && (a = {
			cols: i,
			rows: o,
			score: f,
			thumb: l,
			visibleRows: s
		});
	}
	return a || {
		cols: Math.min(e, 2),
		rows: Math.ceil(e / Math.min(e, 2)),
		thumb: 28,
		visibleRows: Math.min(3, Math.ceil(e / Math.min(e, 2)))
	};
}
function fr(e) {
	return (Array.isArray(e.images) ? e.images : e.url ? [{
		url: e.url,
		name: e.name,
		kind: e.kind
	}] : []).flatMap((e) => {
		if (typeof e == "string") return [{
			url: e,
			name: "Image",
			kind: cr({ url: e })
		}];
		if (!e || typeof e != "object") return [];
		let t = e, n = String(t.originalLocalUrl || t.localUrl || t.sourceUrl || t.local_url || t.source_url || t.url || "");
		return n ? [{
			...t,
			url: n,
			kind: t.kind || cr({
				...t,
				url: n
			})
		}] : [];
	});
}
function pr(e) {
	return {
		asset_item_id: e.asset_item_id,
		asset_uris: e.asset_uris,
		kind: cr(e),
		name: String(e.name || "asset"),
		url: String(e.url || "")
	};
}
function mr(e, t) {
	e.stopPropagation(), e.dataTransfer.effectAllowed = "copy", e.dataTransfer.setData("application/x-smart-canvas-image", JSON.stringify(pr(t))), e.dataTransfer.setData("text/plain", String(t.url || ""));
}
function hr(e) {
	return Array.isArray(e.pendingTasks) ? e.pendingTasks.filter((e) => !!(e && typeof e == "object" && String(e.taskId || ""))) : [];
}
function gr(e, t, n) {
	let r = hr(e), i = r.find((e) => e.taskId === t), a = r.filter((e) => e.taskId !== t), o = Array.isArray(n.images) ? n.images : Array.isArray(n.outputs) ? n.outputs : [], s = String(i?.kind || "image"), c = s === "video" ? "mp4" : s === "audio" ? "mp3" : s === "text" ? "txt" : "png", l = o.flatMap((e, t) => {
		let n = typeof e == "string" ? { url: e } : e && typeof e == "object" ? e : null;
		return n?.url ? [{
			...n,
			kind: n.kind || s,
			name: n.name || `output-${t + 1}.${c}`,
			generatedResult: !0
		}] : [];
	}), u = [...fr(e), ...l], d = Math.max(0, Number(e.pending || r.length) - 1);
	return {
		images: u,
		outputKind: l.length ? s : e.outputKind,
		pending: d,
		pendingTasks: a.length ? a : void 0,
		...d || a.length ? {} : {
			h: void 0,
			queued: !1,
			runElapsedMs: Math.max(0, Date.now() - Number(e.runStartedAt || Date.now())),
			runFinishedAt: Date.now(),
			runTimerHidden: !1,
			running: !1,
			title: u.length > 1 ? s === "video" ? "Videos" : s === "audio" ? "Audios" : "Group" : s === "video" ? "Video" : s === "audio" ? "Audio" : "Image",
			w: void 0
		}
	};
}
async function _r(e) {
	let t = sr.get(e);
	if (t) return t;
	let n = (async () => {
		for (let t = 0; t < 900; t += 1) {
			let t = await fetch(`/api/canvas-image-tasks/${encodeURIComponent(e)}`), n = await t.json().catch(() => ({}));
			if (!t.ok) throw Error(String(n.detail || `任务查询失败 (${t.status})`));
			if (n.status === "succeeded") return n.result && typeof n.result == "object" ? n.result : {};
			if (n.status === "failed") throw Object.assign(Error(String(n.error || "任务失败")), { upstreamTaskId: String(n.upstream_task_id || "") });
			await new Promise((e) => setTimeout(e, 2e3));
		}
		throw Error("任务查询超时");
	})();
	sr.set(e, n);
	try {
		return await n;
	} finally {
		sr.delete(e);
	}
}
function vr(e, t) {
	let n = String(e.url || "");
	return !n || n.startsWith("data:") || n.startsWith("blob:") || !n.startsWith("/output/") && !n.startsWith("/assets/") ? n : /\.(png|jpe?g|webp|gif|bmp|avif|tiff?|mp4|webm|mov|m4v)(\?|#|$)/i.test(n) ? `/api/media-preview?w=${t}&url=${encodeURIComponent(n)}` : n;
}
function yr(e) {
	let t = lr(e);
	return t.width > 0 && t.height > 0 ? `${Math.round(t.width)} x ${Math.round(t.height)}` : "";
}
function br({ active: e, group: t, item: n, onPlay: r }) {
	let i = cr(n), a = String(n.url || "");
	return i === "audio" ? t ? /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "media-thumb audio-thumb",
		"data-media-kind": "audio",
		"data-media-url": a,
		children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "file-audio" }), /* @__PURE__ */ (0, K.jsx)("span", { children: String(n.name || "Audio") })]
	}) : /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "node-img media-card media-audio-card",
		children: [
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "media-card-icon",
				children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "file-audio" })
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "media-card-title",
				children: String(n.name || "Audio")
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "media-card-sub",
				children: "AUDIO"
			}),
			/* @__PURE__ */ (0, K.jsx)("audio", {
				controls: !0,
				"data-url": a,
				preload: "metadata",
				src: a
			})
		]
	}) : i === "file" || i === "text" ? /* @__PURE__ */ (0, K.jsxs)("div", {
		className: `${t ? "media-thumb" : "node-img media-card"} file-thumb media-file-card`,
		"data-media-kind": i,
		"data-media-url": a,
		children: [
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "media-card-icon",
				children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": i === "text" ? "file-text" : "file" })
			}),
			/* @__PURE__ */ (0, K.jsx)("span", {
				className: "media-card-title",
				children: String(n.name || (i === "text" ? "Text" : "File"))
			}),
			t ? null : /* @__PURE__ */ (0, K.jsx)("div", {
				className: "media-card-sub",
				children: i.toUpperCase()
			})
		]
	}) : i === "video" ? /* @__PURE__ */ (0, K.jsx)("div", {
		className: `${t ? "media-thumb video-thumb" : "node-img media-card media-video-card"}`,
		children: e ? /* @__PURE__ */ (0, K.jsx)("video", {
			autoPlay: !0,
			controls: !0,
			"data-inline-video-active": "1",
			"data-url": a,
			playsInline: !0,
			preload: "metadata",
			src: a
		}) : /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("img", {
			alt: "",
			"data-original-src": a,
			"data-preview-kind": "video",
			"data-preview-src": vr(n, t ? 512 : 768),
			"data-url": a,
			loading: "lazy",
			src: vr(n, t ? 512 : 768)
		}), /* @__PURE__ */ (0, K.jsx)("button", {
			className: `smart-video-play ${t ? "thumb-video-play" : ""}`,
			onClick: (e) => e.stopPropagation(),
			onPointerDown: (e) => {
				e.preventDefault(), e.stopPropagation(), r();
			},
			title: "播放",
			type: "button",
			children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "play" })
		})] })
	}) : /* @__PURE__ */ (0, K.jsx)("img", {
		alt: "",
		className: t ? void 0 : "node-img",
		"data-original-src": a,
		"data-preview-src": vr(n, t ? 512 : 768),
		draggable: !1,
		loading: "lazy",
		src: vr(n, t ? 512 : 768)
	});
}
function xr({ connecting: e, node: t, onAppendFiles: n, onConnectIn: r, onConnectOut: i, onDelete: a, onDeleteImage: o, onMoveStart: s, onPatch: c, onPreview: l, onSelect: u, readOnly: d, selected: f }) {
	let p = (0, G.useMemo)(() => fr(t), [t]), m = hr(t), h = m.find((e) => e.failed && e.recoverTaskId), g = ur(t), [_, v] = (0, G.useState)(0), [y, b] = (0, G.useState)([]), [x, S] = (0, G.useState)(0), C = p.length > 1, w = !!(t.queued && !p.length && !t.pending), T = !!((t.pending || w) && !p.length), E = !p.length && !t.pending && !w && !h, D = !!(t.isHistoryGroup || t.historyFor);
	(0, G.useEffect)(() => {
		if (!t.running && !t.pending) return;
		let e = () => S(Date.now());
		e();
		let n = setInterval(e, 1e3);
		return () => clearInterval(n);
	}, [t.pending, t.running]), (0, G.useEffect)(() => {
		m.filter((e) => !e.failed && !e.recoverTaskId).forEach((e) => {
			_r(e.taskId).then((t) => c((n) => gr(n, e.taskId, t), !0)).catch((t) => {
				t.upstreamTaskId ? c((n) => {
					let r = hr(n);
					return {
						pending: Math.max(1, r.length),
						running: !1,
						pendingTasks: r.map((n) => n.taskId === e.taskId ? {
							...n,
							error: t.message,
							failed: !0,
							querying: !1,
							recoverTaskId: t.upstreamTaskId
						} : n)
					};
				}, !0) : c((t) => {
					let n = hr(t);
					return {
						pending: Math.max(0, Number(t.pending || n.length) - 1),
						pendingTasks: n.filter((t) => t.taskId !== e.taskId),
						running: !1
					};
				}, !0);
			});
		});
	}, [m.filter((e) => !e.failed).map((e) => e.taskId).join("|")]), (0, G.useEffect)(() => {
		requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		y,
		p.length,
		T,
		h?.querying
	]);
	let O = () => {
		if (d) return;
		let e = document.createElement("input");
		e.type = "file", e.accept = "image/*,video/*,audio/*", e.multiple = !0, e.onchange = () => {
			e.files?.length && n([...e.files]), e.remove();
		}, e.click();
	}, k = async () => {
		if (!(!h || h.querying)) {
			c({ pendingTasks: m.map((e) => e.taskId === h.taskId ? {
				...e,
				querying: !0
			} : e) });
			try {
				let e = await fetch("/api/image-task-query", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						provider_id: h.providerId || "",
						task_id: h.recoverTaskId
					})
				}), t = await e.json();
				if (!e.ok) throw Error(String(t.detail || "查询失败"));
				t.status === "succeeded" || Array.isArray(t.images) ? c((e) => gr(e, h.taskId, t), !0) : c({ pendingTasks: m.map((e) => e.taskId === h.taskId ? {
					...e,
					querying: !1
				} : e) });
			} catch (e) {
				c({ pendingTasks: m.map((t) => t.taskId === h.taskId ? {
					...t,
					error: e instanceof Error ? e.message : String(e),
					querying: !1
				} : t) }, !0);
			}
		}
	}, A = C ? "Group" : p.length ? "Image" : "上传节点", j = T ? "生成中，请稍候" : C ? "点击缩略图选择，拖拽节点移动" : p.length ? "点击选择，拖拽节点移动" : "双击画布创建，或拖入素材", M = Number(t.runStartedAt || 0), N = t.running || t.pending ? x || Date.now() : Number(t.runFinishedAt || M), P = Number(t.runElapsedMs || (M ? Math.max(0, N - M) : 0));
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		"aria-label": `smart-image ${t.id}`,
		className: `image-node ${E ? "empty-node" : ""} ${C ? "group-node" : ""} ${D ? "history-group-node" : ""} ${f ? "selected" : ""} ${t.running ? "node-running" : ""} ${T || h ? "node-pending" : ""}`.trim(),
		"data-id": t.id,
		"data-node-id": t.id,
		"data-node-type": "smart-image",
		onClick: (e) => {
			e.stopPropagation(), u(e);
		},
		onPointerDown: s,
		role: "button",
		style: {
			height: g.height,
			left: Number(t.x || 0),
			top: Number(t.y || 0),
			width: g.width
		},
		tabIndex: 0,
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "node-head",
				children: [/* @__PURE__ */ (0, K.jsx)("div", {
					className: "node-title",
					children: A
				}), /* @__PURE__ */ (0, K.jsx)("div", {
					className: "node-actions",
					children: C ? null : /* @__PURE__ */ (0, K.jsx)("button", {
						className: "mini-x node-delete",
						disabled: d,
						onClick: (e) => {
							e.stopPropagation(), a();
						},
						title: "删除节点",
						type: "button",
						children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "trash-2" })
					})
				})]
			}),
			!E && !C ? /* @__PURE__ */ (0, K.jsx)("div", {
				className: "floating-node-actions",
				children: /* @__PURE__ */ (0, K.jsx)("button", {
					className: "mini-x node-delete",
					disabled: d,
					onClick: (e) => {
						e.stopPropagation(), a();
					},
					title: "删除节点",
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "trash-2" })
				})
			}) : null,
			p.length ? /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "smart-node-floating-menu",
				"data-smart-node-menu": "1",
				children: [/* @__PURE__ */ (0, K.jsxs)("button", {
					disabled: !["image", "video"].includes(cr(p[_] || p[0])),
					onClick: (e) => {
						e.stopPropagation(), l(String((p[_] || p[0]).url || ""));
					},
					title: "预览",
					type: "button",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "eye" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "预览" })]
				}), /* @__PURE__ */ (0, K.jsxs)("button", {
					onClick: (e) => {
						e.stopPropagation();
						let t = document.createElement("a");
						t.href = String((p[_] || p[0]).url || ""), t.download = String((p[_] || p[0]).name || "media"), t.click();
					},
					title: "下载",
					type: "button",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "download" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "下载" })]
				})]
			}) : null,
			M && !t.runTimerHidden ? /* @__PURE__ */ (0, K.jsx)("span", {
				className: `run-time-pill ${!t.pending && !t.running && t.runFinishedAt ? "done" : ""}`.trim(),
				"data-run-timer": t.id,
				children: `${Math.floor(P / 6e4).toString().padStart(2, "0")}:${Math.floor(P % 6e4 / 1e3).toString().padStart(2, "0")}`
			}) : null,
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "node-body",
				children: h && !p.length ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "image-task-pending-cell loading-cell single",
					style: {
						height: g.height,
						width: g.width
					},
					children: /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "image-task-pending-overlay",
						children: [
							/* @__PURE__ */ (0, K.jsx)("div", {
								className: "image-task-pending-spinner",
								children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": h.querying ? "loader-2" : "refresh-cw" })
							}),
							/* @__PURE__ */ (0, K.jsx)("div", {
								className: "image-task-pending-text",
								children: h.querying ? "查询中" : "任务未丢失"
							}),
							/* @__PURE__ */ (0, K.jsx)("div", {
								className: "image-task-pending-sub",
								children: `任务 ID：${h.recoverTaskId || ""}`
							}),
							/* @__PURE__ */ (0, K.jsxs)("button", {
								className: "image-task-pending-query",
								disabled: !!h.querying,
								onClick: (e) => {
									e.stopPropagation(), k();
								},
								onPointerDown: (e) => e.stopPropagation(),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": h.querying ? "loader-2" : "refresh-cw" }), /* @__PURE__ */ (0, K.jsx)("span", { children: h.querying ? "查询中…" : "查询结果" })]
							})
						]
					})
				}) : w ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "loading-cell single queued",
					style: {
						height: g.height,
						width: g.width
					}
				}) : t.pending && !p.length ? Number(t.pending) <= 1 ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "loading-cell single",
					style: {
						height: g.height,
						width: g.width
					}
				}) : /* @__PURE__ */ (0, K.jsx)("div", {
					className: "loading-skeleton",
					style: {
						boxSizing: "border-box",
						gridTemplateColumns: `repeat(${Math.min(4, Math.max(2, Math.ceil(Math.sqrt(Number(t.pending)))))}, 1fr)`,
						gridTemplateRows: `repeat(${Math.ceil(Number(t.pending) / Math.min(4, Math.max(2, Math.ceil(Math.sqrt(Number(t.pending))))))}, 1fr)`,
						height: g.height,
						padding: 8,
						width: g.width
					},
					children: Array.from({ length: Number(t.pending) }, (e, t) => /* @__PURE__ */ (0, K.jsx)("div", { className: "loading-cell" }, t))
				}) : C ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "thumb-grid",
					"data-thumb-scroll": "1",
					style: {
						"--thumb-cols": g.cols,
						"--thumb-max-height": `${(g.visibleRows || g.rows) * g.thumb + Math.max(0, (g.visibleRows || g.rows) - 1) * 8}px`,
						"--thumb-size": `${g.thumb}px`
					},
					children: p.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("div", {
						className: `thumb-item ${_ === t ? "image-selected" : ""}`,
						"data-image-index": t,
						"data-media-signature": `${cr(e)}:${e.url || ""}`,
						draggable: !0,
						onClick: (e) => {
							e.stopPropagation(), v(t);
						},
						onDragStart: (t) => mr(t, e),
						onPointerDown: (e) => e.stopPropagation(),
						children: [
							/* @__PURE__ */ (0, K.jsx)(br, {
								active: y.includes(t),
								group: !0,
								item: e,
								onPlay: () => b((e) => e.includes(t) ? e : [...e, t])
							}),
							yr(e) ? /* @__PURE__ */ (0, K.jsx)("span", {
								className: "image-resolution-badge",
								children: yr(e)
							}) : null,
							/* @__PURE__ */ (0, K.jsx)("button", {
								className: "mini-x image-delete",
								disabled: d,
								onClick: (e) => {
									e.stopPropagation(), o(t);
								},
								title: "删除图片",
								type: "button",
								children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "trash-2" })
							})
						]
					}, `${e.url}-${t}`))
				}) : p[0] ? /* @__PURE__ */ (0, K.jsxs)("div", {
					className: `image-wrap ${_ === 0 ? "image-selected" : ""}`,
					"data-image-index": "0",
					"data-media-signature": `${cr(p[0])}:${p[0].url || ""}`,
					draggable: !0,
					onClick: (e) => {
						e.stopPropagation(), v(0);
					},
					onDragStart: (e) => mr(e, p[0]),
					onPointerDown: (e) => e.stopPropagation(),
					style: {
						"--node-img-h": `${g.height}px`,
						"--node-img-w": `${g.width}px`
					},
					children: [
						/* @__PURE__ */ (0, K.jsx)(br, {
							active: y.includes(0),
							group: !1,
							item: p[0],
							onPlay: () => b((e) => e.includes(0) ? e : [...e, 0])
						}),
						yr(p[0]) ? /* @__PURE__ */ (0, K.jsx)("span", {
							className: "image-resolution-badge",
							children: yr(p[0])
						}) : null,
						/* @__PURE__ */ (0, K.jsx)("button", {
							className: "mini-x image-delete",
							disabled: d,
							onClick: (e) => {
								e.stopPropagation(), o(0);
							},
							title: "删除图片",
							type: "button",
							children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "trash-2" })
						})
					]
				}) : /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "node-drop",
					"data-upload-action": "files",
					onClick: (e) => {
						e.stopPropagation(), O();
					},
					onDragOver: (e) => e.preventDefault(),
					onDrop: (e) => {
						e.preventDefault(), e.stopPropagation(), n([...e.dataTransfer.files]);
					},
					children: [
						/* @__PURE__ */ (0, K.jsx)("span", {
							className: "upload-node-main",
							children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "upload-cloud" })
						}),
						/* @__PURE__ */ (0, K.jsx)("span", {
							className: "upload-node-title",
							children: "上传节点"
						}),
						/* @__PURE__ */ (0, K.jsx)("span", {
							className: "upload-node-sub",
							children: "拖拽 / 粘贴 / 点击上传"
						})
					]
				})
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "node-hint",
				children: j
			}),
			p.length || t.pending || w ? /* @__PURE__ */ (0, K.jsx)("div", {
				className: "node-resize-handle",
				"data-resize": "1"
			}) : null,
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: `node-port port-in ${e ? "port-hover" : ""}`,
				"data-port": "in",
				onClick: (e) => {
					e.stopPropagation(), r();
				},
				title: "input"
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "node-port port-out",
				"data-port": "out",
				onPointerDown: (e) => {
					e.stopPropagation(), i();
				},
				title: "output"
			})
		]
	});
}
//#endregion
//#region src/canvas/ui/smart-canvas-image-editor.tsx
function Sr({ imageIndex: e, initialMode: t, node: n, onApply: r, onClose: i, onCreateMask: a, onGridJoin: o, onGridSplit: s }) {
	let c = (0, G.useMemo)(() => fr(n), [n]), l = c[e] || c[0], u = c.map((e) => [
		e.url,
		e.name,
		e.natural_w || e.width,
		e.natural_h || e.height
	].join("|")).join("::"), d = (0, G.useMemo)(() => c.filter((e) => cr(e) === "image").map((e) => ({
		name: String(e.name || ""),
		natural_h: Number(e.natural_h || e.height || 0),
		natural_w: Number(e.natural_w || e.width || 0),
		url: wr(e)
	})), [u]);
	return !l?.url || cr(l) !== "image" ? null : /* @__PURE__ */ (0, K.jsx)(Bt, {
		initialMode: t,
		joinItems: d,
		name: String(l.name || Tr(String(l.url)) || "image"),
		onApply: r,
		onClose: i,
		onCreateMask: a,
		onGridJoin: o,
		onGridSplit: s,
		url: wr(l)
	});
}
async function Cr(e, t, n) {
	if (e.readyState < 2 && await Er(e, "loadeddata", 2200), !e.videoWidth || !e.videoHeight) throw Error("视频还没有加载完成");
	let r = Number(e.currentTime || 0), i = Number.isFinite(e.duration) && e.duration > 0 ? e.duration : 0, a = Number(t.fps || t.frameRate || t.frame_rate || t.framespersecond || t.frames_per_second || 0), o = 1 / Math.max(1, Math.min(120, Number.isFinite(a) && a > 0 ? a : 30)), s = n === "first" ? 0 : n === "last" ? Math.max(0, i - o / 2) : r;
	e.pause(), await Dr(e, s);
	let c = document.createElement("canvas");
	c.width = e.videoWidth, c.height = e.videoHeight;
	let l = c.getContext("2d");
	if (!l) throw Error("导出帧失败");
	l.drawImage(e, 0, 0, c.width, c.height);
	let u = await new Promise((e, t) => c.toBlob((n) => n ? e(n) : t(/* @__PURE__ */ Error("导出帧失败")), "image/png")), d = n === "first" ? "first-frame" : n === "last" ? "last-frame" : "current-frame", f = String(t.name || Tr(String(t.url || "")) || "video").replace(/\.[a-z0-9]{2,8}$/i, "") || "video";
	return n !== "current" && await Dr(e, r), {
		blob: u,
		height: c.height,
		name: `${f}-${d}.png`.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_"),
		width: c.width
	};
}
function wr(e) {
	let t = String(e.url || "");
	return /^https?:\/\//i.test(t) ? `/api/download-output?inline=1&url=${encodeURIComponent(t)}&name=${encodeURIComponent(String(e.name || Tr(t) || "image"))}` : t;
}
function Tr(e) {
	try {
		return decodeURIComponent(e.split(/[?#]/, 1)[0].split("/").pop() || "").replace(/[\\/:*?"<>|]/g, "_");
	} catch {
		return "media";
	}
}
function Er(e, t, n) {
	return new Promise((r) => {
		let i = !1, a = () => {
			i || (i = !0, clearTimeout(o), e.removeEventListener(t, a), r());
		}, o = window.setTimeout(a, n);
		e.addEventListener(t, a, { once: !0 });
	});
}
async function Dr(e, t) {
	Math.abs(Number(e.currentTime || 0) - t) <= .002 || (e.currentTime = t, await Er(e, "seeked", 2200));
}
//#endregion
//#region src/canvas/ui/smart-canvas-minimap.tsx
var Or = {
	height: 108,
	width: 170
};
function kr({ boardHeight: e, boardWidth: t, nodes: n, onLocate: r, viewport: i }) {
	let a = (0, G.useRef)(null), [o, s] = (0, G.useState)(Or);
	(0, G.useEffect)(() => {
		let e = a.current;
		if (!e) return;
		let t = () => s({
			height: e.clientHeight || Or.height,
			width: e.clientWidth || Or.width
		});
		t();
		let n = new ResizeObserver(t);
		return n.observe(e), () => n.disconnect();
	}, []);
	let c = Ar(n, i, t, e, o.width, o.height), l = (e) => {
		let t = a.current;
		if (!t) return;
		let n = t.getBoundingClientRect();
		r(jr(e.clientX - n.left, e.clientY - n.top, c.state));
	};
	return /* @__PURE__ */ (0, K.jsx)("div", {
		"aria-hidden": "true",
		className: "smart-minimap",
		id: "minimap",
		onPointerDown: (e) => {
			if (e.button !== 0) return;
			e.preventDefault(), e.stopPropagation();
			let t = e.currentTarget;
			l(e.nativeEvent), t.setPointerCapture(e.pointerId);
			let n = (e) => l(e);
			t.addEventListener("pointermove", n), t.addEventListener("pointerup", () => t.removeEventListener("pointermove", n), { once: !0 });
		},
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "smart-minimap-content",
			id: "minimapContent",
			ref: a,
			children: [c.nodes.map((e) => /* @__PURE__ */ (0, K.jsx)("div", {
				className: "minimap-node",
				"data-minimap-node-id": e.id,
				style: e.style
			}, e.id)), /* @__PURE__ */ (0, K.jsx)("div", {
				className: "smart-minimap-viewport",
				id: "minimapViewport",
				style: c.viewport
			})]
		})
	});
}
function Ar(e, t, n, r, i, a) {
	let o = {
		height: r / t.zoom,
		width: n / t.zoom,
		x: -t.x / t.zoom,
		y: -t.y / t.zoom
	}, s = [...e, o], c = Math.min(...s.map((e) => e.x), -200), l = Math.min(...s.map((e) => e.y), -200), u = Math.max(...s.map((e) => e.x + e.width), o.x + o.width + 200), d = Math.max(...s.map((e) => e.y + e.height), o.y + o.height + 200), f = Math.min(i / Math.max(1, u - c), a / Math.max(1, d - l)), p = (i - (u - c) * f) / 2, m = (a - (d - l) * f) / 2, h = {
		height: a,
		minX: c,
		minY: l,
		offsetX: p,
		offsetY: m,
		scale: f,
		width: i
	}, g = (e) => ({
		height: Math.max(4, e.height * f),
		left: p + (e.x - c) * f,
		top: m + (e.y - l) * f,
		width: Math.max(4, e.width * f)
	});
	return {
		nodes: e.map((e) => ({
			id: e.id,
			style: g(e)
		})),
		state: h,
		viewport: g(o)
	};
}
function jr(e, t, n) {
	return {
		x: n.minX + (e - n.offsetX) / Math.max(1e-4, n.scale),
		y: n.minY + (t - n.offsetY) / Math.max(1e-4, n.scale)
	};
}
//#endregion
//#region src/canvas/ui/smart-canvas-prompt-preset.tsx
var Mr = "smart_canvas_prompt_presets_v1";
function Nr(e = localStorage) {
	try {
		let t = JSON.parse(e.getItem("smart_canvas_prompt_presets_v1") || "[]");
		return Array.isArray(t) ? t.filter((e) => !!(e && typeof e == "object" && String(e.id || "") && typeof e.text == "string")).map((e) => ({
			createdAt: Number(e.createdAt || Date.now()),
			id: String(e.id),
			name: String(e.name || "提示词预设"),
			text: e.text,
			updatedAt: Number(e.updatedAt || e.createdAt || Date.now())
		})) : [];
	} catch {
		return [];
	}
}
function Pr(e) {
	return e.trim().split(/\r?\n/, 1)[0]?.trim().slice(0, 28) || "提示词预设";
}
function Fr(e) {
	localStorage.setItem(Mr, JSON.stringify(e));
}
function Ir() {
	return `preset_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}
function Lr({ boardRef: e, node: t, onClearPreset: n, onClose: r, onPatchNode: i, readOnly: a = !1 }) {
	let o = (0, G.useRef)(null), s = (0, G.useRef)(null), [c, l] = (0, G.useState)(() => Nr()), [u, d] = (0, G.useState)(""), [f, p] = (0, G.useState)(""), [m, h] = (0, G.useState)(""), [g, _] = (0, G.useState)(""), [v, y] = (0, G.useState)(""), [b, x] = (0, G.useState)(!1), [S, C] = (0, G.useState)({
		left: 80,
		top: 80
	}), w = (e, t = c) => {
		let n = t.find((t) => t.id === e);
		d(n?.id || ""), p(n?.name || ""), h(n?.text || ""), x(!1), _(n ? "选择预设后可直接修改名称和内容。" : "暂无预设，可将当前提示词存为新预设。"), y("");
	};
	(0, G.useEffect)(() => {
		w(String(t.promptPresetId || c[0]?.id || ""), c);
	}, [t.id]), (0, G.useLayoutEffect)(() => {
		let n = e.current, r = n?.querySelector(`[data-node-id="${CSS.escape(t.id)}"]`);
		if (!n || !r) return;
		let i = n.getBoundingClientRect(), a = r.getBoundingClientRect();
		C({
			left: Math.max(18, Math.min(Math.max(18, i.width - 410), a.right - i.left + 12)),
			top: Math.max(18, Math.min(Math.max(18, i.height - 330), a.top - i.top))
		});
	}, [e, t.id]), (0, G.useEffect)(() => {
		let e = (e) => {
			let t = e.target;
			!o.current?.contains(t) && !t?.closest(".prompt-preset-save") && r();
		}, t = (e) => {
			e.key === "Escape" && r();
		};
		return document.addEventListener("pointerdown", e), window.addEventListener("keydown", t), () => {
			document.removeEventListener("pointerdown", e), window.removeEventListener("keydown", t);
		};
	}, [r]);
	let T = () => {
		x(!1), _("编辑完成后点击保存修改。"), y("");
	}, E = c.find((e) => e.id === u), D = String(t.text || "").trim();
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "prompt-preset-panel open",
		id: "promptPresetPanel",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		ref: o,
		style: S,
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "prompt-preset-panel-head",
				children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "提示词预设" }), /* @__PURE__ */ (0, K.jsx)("button", {
					"aria-label": "关闭",
					id: "promptPresetClose",
					onClick: r,
					title: "关闭",
					type: "button",
					children: "×"
				})]
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: `prompt-preset-status ${v}`,
				id: "promptPresetStatus",
				children: g
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "prompt-preset-fields",
				children: [
					/* @__PURE__ */ (0, K.jsxs)("select", {
						id: "promptPresetSelect",
						onChange: (e) => w(e.target.value),
						value: u,
						children: [c.length ? null : /* @__PURE__ */ (0, K.jsx)("option", {
							value: "",
							children: "暂无预设"
						}), c.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
							value: e.id,
							children: e.name
						}, e.id))]
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						id: "promptPresetName",
						onChange: (e) => {
							p(e.target.value), T();
						},
						placeholder: "预设名称",
						ref: s,
						type: "text",
						value: f
					}),
					/* @__PURE__ */ (0, K.jsx)("textarea", {
						id: "promptPresetText",
						onChange: (e) => {
							h(e.target.value), T();
						},
						placeholder: "预设内容",
						value: m
					})
				]
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "prompt-preset-actions",
				children: [
					/* @__PURE__ */ (0, K.jsx)("button", {
						disabled: !E || a,
						id: "promptPresetApply",
						onClick: () => {
							!E || a || (i(t.id, {
								promptPresetId: E.id,
								text: E.text
							}), r());
						},
						type: "button",
						children: "应用"
					}),
					/* @__PURE__ */ (0, K.jsx)("button", {
						className: `danger ${b ? "confirm-danger" : ""}`.trim(),
						disabled: !E || a,
						id: "promptPresetDelete",
						onClick: () => {
							if (!E || a) return;
							if (!b) {
								x(!0), _(`将删除“${E.name}”，再次点击确认。`), y("warn");
								return;
							}
							let e = c.filter((e) => e.id !== E.id);
							Fr(e), l(e), n(E.id), w(e[0]?.id || "", e), _("预设已删除。"), y("ok");
						},
						type: "button",
						children: b ? "再次点击删除" : "删除"
					}),
					/* @__PURE__ */ (0, K.jsx)("span", { style: { flex: 1 } }),
					/* @__PURE__ */ (0, K.jsx)("button", {
						disabled: !D || a,
						id: "promptPresetNew",
						onClick: () => {
							if (!D || a) return;
							let e = Date.now(), n = {
								createdAt: e,
								id: Ir(),
								name: Pr(D),
								text: String(t.text || ""),
								updatedAt: e
							}, r = [n, ...c];
							Fr(r), l(r), i(t.id, { promptPresetId: n.id }), w(n.id, r), _("已存为新预设。"), y("ok"), requestAnimationFrame(() => {
								s.current?.focus(), s.current?.select();
							});
						},
						type: "button",
						children: "存为新预设"
					}),
					/* @__PURE__ */ (0, K.jsx)("button", {
						className: "primary",
						disabled: !E || a,
						id: "promptPresetSave",
						onClick: () => {
							if (!E || a) return;
							let e = f.trim(), n = m.trim();
							if (!e || !n) {
								_("预设名称和内容不能为空。"), y("warn");
								return;
							}
							let r = c.map((t) => t.id === E.id ? {
								...t,
								name: e,
								text: m,
								updatedAt: Date.now()
							} : t);
							Fr(r), l(r), String(t.promptPresetId || "") === E.id && i(t.id, { text: m }), _("预设修改已保存。"), y("ok"), x(!1);
						},
						type: "button",
						children: "保存修改"
					})
				]
			})
		]
	});
}
//#endregion
//#region src/canvas/infrastructure/prompt-library-client.ts
var Rr = {
	list: () => zr("/api/prompt-libraries"),
	createLibrary: (e) => zr("/api/prompt-libraries", Br("POST", { name: e })),
	renameLibrary: (e, t) => zr(`/api/prompt-libraries/${encodeURIComponent(e)}`, Br("PATCH", { name: t })),
	deleteLibrary: (e) => zr(`/api/prompt-libraries/${encodeURIComponent(e)}`, Br("DELETE")),
	savePrompt: (e, t) => zr(t.id ? `/api/prompt-libraries/items/${encodeURIComponent(t.id)}` : "/api/prompt-libraries/items", Br(t.id ? "PATCH" : "POST", {
		library_id: e,
		...t
	})),
	deletePrompts: (e) => zr("/api/prompt-libraries/items/delete", Br("POST", { ids: e })),
	createCategory: (e, t) => zr("/api/prompt-libraries/categories", Br("POST", {
		library_id: e,
		name: t
	})),
	renameCategory: (e, t, n) => zr(`/api/prompt-libraries/categories/${encodeURIComponent(t)}`, Br("PATCH", {
		library_id: e,
		name: n
	})),
	deleteCategory: (e) => zr(`/api/prompt-libraries/categories/${encodeURIComponent(e)}`, Br("DELETE"))
};
async function zr(e, t) {
	let n = await fetch(e, t), r = await n.json().catch(() => ({}));
	if (!n.ok) throw Error(r.detail || `请求失败 (${n.status})`);
	return r;
}
function Br(e, t) {
	return {
		method: e,
		headers: t === void 0 ? void 0 : { "Content-Type": "application/json" },
		body: t === void 0 ? void 0 : JSON.stringify(t)
	};
}
//#endregion
//#region src/canvas/ui/smart-canvas-prompt-template.tsx
var Vr = [
	{
		id: "view",
		name: "视角"
	},
	{
		id: "storyboard",
		name: "分镜"
	},
	{
		id: "character",
		name: "角色"
	},
	{
		id: "product",
		name: "产品"
	},
	{
		id: "lighting",
		name: "光影"
	},
	{
		id: "mine",
		name: "我的"
	}
];
function Hr(e, t) {
	let n = String(e.positive || "").trim();
	if (t === "positive" || !e.builtin) return n;
	let r = String(e.negative || "").trim(), i = Object.entries(e.params || {}).map(([e, t]) => `${e}: ${t}`).join("\n");
	return [
		n,
		r ? `Negative prompt:\n${r}` : "",
		i ? `Params:\n${i}` : ""
	].filter(Boolean).join("\n\n");
}
function Ur(e, t) {
	let n = t.trim().toLocaleLowerCase();
	return !n || [
		e.name,
		e.positive,
		e.negative,
		e.scene,
		e.name_en,
		e.scene_en
	].some((e) => String(e || "").toLocaleLowerCase().includes(n));
}
function Wr(e) {
	return e ? (e.items || []).filter((e) => e?.id && e?.positive).map((t) => ({
		...t,
		builtin: e.id === "system",
		libraryId: e.id,
		params: t.params || {}
	})) : [];
}
function Gr(e) {
	return {
		category: e?.category || "mine",
		name: e?.name || "",
		positive: e?.positive || ""
	};
}
function Kr({ initialText: e, onApply: t, onClose: n, readOnly: r = !1, target: i }) {
	let [a, o] = (0, G.useState)({
		active_library_id: "",
		libraries: []
	}), [s, c] = (0, G.useState)(""), [l, u] = (0, G.useState)("all"), [d, f] = (0, G.useState)(""), [p, m] = (0, G.useState)(""), [h, g] = (0, G.useState)(!1), [_, v] = (0, G.useState)(!1), [y, b] = (0, G.useState)(Gr(void 0)), [x, S] = (0, G.useState)("正在加载提示词库…"), C = a.libraries.find((e) => e.id === s) ?? a.libraries[0], w = C?.categories?.length ? C.categories : C?.id === "system" ? Vr : [], T = (0, G.useMemo)(() => Wr(C), [C]), E = (0, G.useMemo)(() => T.filter((e) => (l === "all" || e.category === l) && Ur(e, p)), [
		T,
		l,
		p
	]), D = E.find((e) => e.id === d) ?? E[0], O = !!(C && !C.readonly && !r), k = T.reduce((e, t) => ({
		...e,
		[t.category || "mine"]: (e[t.category || "mine"] || 0) + 1
	}), { all: T.length }), A = (e, t = s, n = d) => {
		o(e);
		let r = e.libraries.find((e) => e.id === t) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0];
		c(r?.id || "");
		let i = Wr(r), a = i.find((e) => e.id === n) ?? i[0];
		f(a?.id || ""), b(Gr(a));
	};
	(0, G.useEffect)(() => {
		let e = !0;
		Rr.list().then((t) => {
			e && (A(t.library, t.library.active_library_id, ""), S(""));
		}).catch(async (t) => {
			if (e) try {
				let e = {
					active_library_id: "system",
					libraries: [{
						categories: Vr,
						id: "system",
						items: (await (await fetch("/api/smart-canvas/prompt-templates")).json()).templates || [],
						name: "系统提示词库",
						readonly: !0
					}]
				};
				A(e, "system", ""), S("");
			} catch {
				S(t instanceof Error ? t.message : String(t));
			}
		});
		let t = (e) => {
			e.key === "Escape" && n();
		};
		return window.addEventListener("keydown", t), () => {
			e = !1, window.removeEventListener("keydown", t);
		};
	}, []), (0, G.useEffect)(() => {
		let e = E.find((e) => e.id === d) ?? E[0];
		e?.id !== d && f(e?.id || ""), h || b(Gr(e));
	}, [
		l,
		E,
		p,
		d,
		h
	]), (0, G.useEffect)(() => {
		requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		h,
		_,
		E,
		D
	]);
	let j = (e, t) => S(e instanceof Error ? e.message : t), M = (e) => {
		let t = Wr(a.libraries.find((t) => t.id === e))[0];
		c(e), u("all"), f(t?.id || ""), b(Gr(t)), g(!1), v(!1);
	}, N = async () => {
		if (!C || !O) return;
		let t = e.trim();
		if (!t) {
			S("当前提示词为空");
			return;
		}
		try {
			let e = await Rr.savePrompt(C.id, {
				category: l === "all" ? "custom" : l,
				name: t.split(/\r?\n/, 1)[0].slice(0, 28) || "提示词预设",
				negative: "",
				positive: t,
				scene: "我的提示词预设"
			});
			A(e.library, C.id, e.item?.id || ""), u(e.item?.category || "custom"), g(!0), S("当前提示词已保存");
		} catch (e) {
			j(e, "保存失败");
		}
	}, P = async () => {
		if (!C || !O) return;
		let e = l === "all" ? "custom" : l;
		try {
			let t = await Rr.savePrompt(C.id, {
				category: e,
				name: "新模板",
				negative: "",
				positive: "新提示词",
				scene: "我的提示词预设"
			});
			A(t.library, C.id, t.item?.id || ""), u(e), g(!0), S("模板已创建");
		} catch (e) {
			j(e, "创建失败");
		}
	}, F = async () => {
		if (!C || !D || !O) return;
		let e = y.name.trim(), t = y.positive.trim();
		if (!e || !t) {
			S("名称和内容不能为空");
			return;
		}
		try {
			let n = await Rr.savePrompt(C.id, {
				id: D.id,
				category: y.category || "mine",
				name: e,
				negative: D.negative || "",
				positive: t,
				scene: D.scene || ""
			});
			A(n.library, C.id, n.item?.id || D.id), g(!1), S("模板已保存");
		} catch (e) {
			j(e, "保存失败");
		}
	}, I = async () => {
		if (!(!D || !O)) try {
			let e = await Rr.deletePrompts([D.id]);
			A(e.library, C?.id, ""), g(!1), S("模板已删除");
		} catch (e) {
			j(e, "删除失败");
		}
	}, ee = async () => {
		if (!C || !O) return;
		let e = window.prompt("新分组名称", "新分组")?.trim().slice(0, 24);
		if (e) try {
			let t = await Rr.createCategory(C.id, e);
			A(t.library, C.id, d), u(t.category?.id || l), S("分组已创建");
		} catch (e) {
			j(e, "新增分组失败");
		}
	}, te = async (e) => {
		if (!C || !O) return;
		let t = window.prompt("分组名称", e.name)?.trim().slice(0, 24);
		if (t) try {
			let n = await Rr.renameCategory(C.id, e.id, t);
			A(n.library, C.id, d), S("分组已重命名");
		} catch (e) {
			j(e, "重命名失败");
		}
	}, L = async (e) => {
		if (!(!C || !O || !window.confirm("删除该分组？分组内模板将移到其他分组。"))) try {
			let t = await Rr.deleteCategory(e.id);
			A(t.library, C.id, d), l === e.id && u("all"), S("分组已删除");
		} catch (e) {
			j(e, "删除失败");
		}
	}, R = (e) => {
		D && (t(Hr(D, e), D.builtin ? "" : D.id), n());
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "prompt-template-panel open",
		"data-status": x,
		"data-target": i,
		id: "promptTemplatePanel",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		onWheel: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "prompt-template-head",
				children: [/* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: "提示词模板库" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "内置标准库 + 我的预设" })] }), /* @__PURE__ */ (0, K.jsx)("button", {
					"aria-label": "关闭",
					id: "promptTemplateClose",
					onClick: n,
					title: "关闭",
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "x" })
				})]
			}),
			/* @__PURE__ */ (0, K.jsx)("select", {
				className: "prompt-template-library-select",
				id: "promptTemplateLibrarySelect",
				onChange: (e) => M(e.target.value),
				title: "选择提示词库",
				value: C?.id || "",
				children: a.libraries.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
					value: e.id,
					children: e.name
				}, e.id))
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "prompt-template-search",
				children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "search" }), /* @__PURE__ */ (0, K.jsx)("input", {
					autoFocus: !0,
					id: "promptTemplateSearch",
					onChange: (e) => m(e.target.value),
					placeholder: "搜索模板...",
					type: "search",
					value: p
				})]
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "prompt-template-cats",
				id: "promptTemplateCats",
				children: _ ? /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "prompt-template-group-panel",
					children: [/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "prompt-template-group-title",
						children: [/* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: "管理分组" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "新增、重命名或删除模板分组" })] }), /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "prompt-template-group-tools",
							children: [/* @__PURE__ */ (0, K.jsxs)("button", {
								onClick: () => void ee(),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "plus" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "新增" })]
							}), /* @__PURE__ */ (0, K.jsxs)("button", {
								className: "primary",
								onClick: () => v(!1),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "check" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "完成" })]
							})]
						})]
					}), /* @__PURE__ */ (0, K.jsx)("div", {
						className: "prompt-template-group-list",
						children: w.map((e) => /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "prompt-template-group-row has-delete",
							children: [
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: `group-name ${e.id === l ? "active" : ""}`,
									onClick: () => u(e.id),
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("span", { children: e.name }), /* @__PURE__ */ (0, K.jsx)("small", { children: k[e.id] || 0 })]
								}),
								/* @__PURE__ */ (0, K.jsx)("button", {
									"aria-label": `重命名 ${e.name}`,
									className: "group-tool",
									disabled: !O,
									onClick: () => void te(e),
									title: "重命名",
									type: "button",
									children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "pencil" })
								}),
								/* @__PURE__ */ (0, K.jsx)("button", {
									"aria-label": `删除 ${e.name}`,
									className: "group-tool danger",
									disabled: !O,
									onClick: () => void L(e),
									title: "删除",
									type: "button",
									children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "trash-2" })
								})
							]
						}, e.id))
					})]
				}) : /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "prompt-template-nav",
					children: [/* @__PURE__ */ (0, K.jsx)("div", {
						className: "prompt-template-tabs",
						children: [{
							id: "all",
							name: "全部"
						}, ...w].map((e) => /* @__PURE__ */ (0, K.jsxs)("button", {
							className: e.id === l ? "active" : "",
							onClick: () => {
								u(e.id), g(!1);
							},
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("span", { children: e.name }), /* @__PURE__ */ (0, K.jsx)("small", { children: k[e.id] || 0 })]
						}, e.id))
					}), /* @__PURE__ */ (0, K.jsxs)("button", {
						className: "prompt-template-manage-groups",
						onClick: () => v(!0),
						type: "button",
						children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "settings-2" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "管理分组" })]
					})]
				})
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "prompt-template-body",
				id: "promptTemplateBody",
				children: [/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "prompt-template-list",
					children: [/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "prompt-template-list-tools",
						children: [/* @__PURE__ */ (0, K.jsxs)("button", {
							disabled: !O || !e.trim(),
							onClick: () => void N(),
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "bookmark-plus" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "保存当前" })]
						}), /* @__PURE__ */ (0, K.jsxs)("button", {
							disabled: !O,
							onClick: () => void P(),
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "file-plus-2" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "新建模板" })]
						})]
					}), E.length ? E.map((e) => /* @__PURE__ */ (0, K.jsxs)("button", {
						className: `prompt-template-card ${e.id === D?.id ? "active" : ""}`,
						"data-template-id": e.id,
						onClick: () => {
							f(e.id), b(Gr(e)), g(!1);
						},
						type: "button",
						children: [
							/* @__PURE__ */ (0, K.jsxs)("span", {
								className: "prompt-template-card-top",
								children: [/* @__PURE__ */ (0, K.jsx)("span", {
									className: "prompt-template-name",
									children: e.name
								}), /* @__PURE__ */ (0, K.jsx)("span", {
									className: "prompt-template-source",
									children: e.builtin ? "内置" : "我的"
								})]
							}),
							/* @__PURE__ */ (0, K.jsx)("span", {
								className: "prompt-template-scene",
								children: e.scene || e.positive
							}),
							/* @__PURE__ */ (0, K.jsx)("span", {
								className: "prompt-template-tag",
								children: w.find((t) => t.id === e.category)?.name || e.category
							})
						]
					}, e.id)) : /* @__PURE__ */ (0, K.jsx)("div", {
						className: "prompt-template-list-empty",
						children: "没有匹配的模板"
					})]
				}), /* @__PURE__ */ (0, K.jsx)("div", {
					className: "prompt-template-detail",
					children: D ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "prompt-template-detail-head",
							children: [/* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: D.name }), /* @__PURE__ */ (0, K.jsxs)("span", { children: [
								w.find((e) => e.id === D.category)?.name || D.category,
								" · ",
								D.builtin ? "内置模板" : "我的模板"
							] })] }), h ? null : /* @__PURE__ */ (0, K.jsxs)("div", {
								className: "prompt-template-icon-actions",
								children: [/* @__PURE__ */ (0, K.jsxs)("button", {
									disabled: !O,
									onClick: () => {
										b(Gr(D)), g(!0);
									},
									title: "编辑模板",
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "pencil" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "编辑" })]
								}), /* @__PURE__ */ (0, K.jsxs)("button", {
									className: "danger",
									disabled: !O,
									onClick: () => void I(),
									title: "删除模板",
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "trash-2" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "删除" })]
								})]
							})]
						}),
						h ? /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "prompt-template-edit-fields",
							children: [
								/* @__PURE__ */ (0, K.jsx)("label", { children: "名称" }),
								/* @__PURE__ */ (0, K.jsx)("input", {
									"data-template-edit-name": !0,
									onChange: (e) => b((t) => ({
										...t,
										name: e.target.value
									})),
									placeholder: "名称",
									value: y.name
								}),
								/* @__PURE__ */ (0, K.jsx)("label", { children: "分组" }),
								/* @__PURE__ */ (0, K.jsx)("select", {
									"data-template-edit-category": !0,
									onChange: (e) => b((t) => ({
										...t,
										category: e.target.value
									})),
									value: y.category,
									children: w.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
										value: e.id,
										children: e.name
									}, e.id))
								}),
								/* @__PURE__ */ (0, K.jsx)("label", { children: "内容" }),
								/* @__PURE__ */ (0, K.jsx)("textarea", {
									"data-template-edit-text": !0,
									onChange: (e) => b((t) => ({
										...t,
										positive: e.target.value
									})),
									placeholder: "内容",
									value: y.positive
								})
							]
						}) : /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "prompt-template-preview-content",
							children: [
								/* @__PURE__ */ (0, K.jsxs)("div", {
									className: "prompt-template-section",
									children: [/* @__PURE__ */ (0, K.jsx)("label", { children: "正向提示词" }), /* @__PURE__ */ (0, K.jsx)("p", { children: D.positive })]
								}),
								D.negative ? /* @__PURE__ */ (0, K.jsxs)("div", {
									className: "prompt-template-section",
									children: [/* @__PURE__ */ (0, K.jsx)("label", { children: "负向提示词" }), /* @__PURE__ */ (0, K.jsx)("p", { children: D.negative })]
								}) : null,
								Object.keys(D.params || {}).length ? /* @__PURE__ */ (0, K.jsxs)("div", {
									className: "prompt-template-section",
									children: [/* @__PURE__ */ (0, K.jsx)("label", { children: "参数建议" }), /* @__PURE__ */ (0, K.jsx)("p", { children: Object.entries(D.params || {}).map(([e, t]) => `${e}: ${t}`).join("\n") })]
								}) : null
							]
						}),
						/* @__PURE__ */ (0, K.jsx)("div", {
							className: "prompt-template-actions",
							children: h ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
								/* @__PURE__ */ (0, K.jsxs)("button", {
									onClick: () => g(!1),
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "x" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "取消" })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: "danger",
									disabled: !O,
									onClick: () => void I(),
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "trash-2" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "删除" })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: "primary",
									disabled: !O,
									onClick: () => void F(),
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "save" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "保存" })]
								})
							] }) : /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsxs)("button", {
								onClick: () => R("positive"),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "corner-down-left" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "正向" })]
							}), /* @__PURE__ */ (0, K.jsxs)("button", {
								className: "primary",
								onClick: () => R("full"),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "wand-sparkles" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "完整应用" })]
							})] })
						})
					] }) : /* @__PURE__ */ (0, K.jsx)("div", {
						className: "prompt-template-empty",
						children: "选择或新建一个模板"
					})
				})]
			})
		]
	});
}
//#endregion
//#region src/canvas/ui/smart-canvas-preview.tsx
var qr = {
	square: {
		w: 1,
		h: 1
	},
	portrait: {
		w: 2,
		h: 3
	},
	landscape: {
		w: 3,
		h: 2
	},
	portrait43: {
		w: 3,
		h: 4
	},
	landscape43: {
		w: 4,
		h: 3
	},
	story: {
		w: 9,
		h: 16
	},
	wide: {
		w: 16,
		h: 9
	},
	ultrawide: {
		w: 21,
		h: 9
	},
	ultratall: {
		w: 9,
		h: 21
	}
};
function Jr(e, t, n = "") {
	let r = t.imageComparisons?.[n], i = Array.isArray(t.runInputRefs) ? t.runInputRefs : [], a = new Map(e.nodes.map((e) => [e.id, e])), o = i.some((e) => e?.url) ? i : e.connections.filter((e) => e.to === t.id && String(e.kind || "flow") !== "history").flatMap((e) => fr(a.get(e.from) || {
		id: "",
		type: ""
	})), s = t.sourceNodeId ? fr(a.get(String(t.sourceNodeId)) || {
		id: "",
		type: ""
	}) : [], c = /* @__PURE__ */ new Set();
	return [
		r,
		...o,
		...s
	].flatMap((e) => !e?.url || cr(e) !== "image" || c.has(e.url) ? [] : (c.add(e.url), [e]));
}
function Yr(e) {
	let t = fr(e).map((e, t) => ({
		...e,
		__index: t
	})).sort((e, t) => {
		let n = e.grid || {}, r = t.grid || {};
		return Number(n.row ?? e.__index) - Number(r.row ?? t.__index) || Number(n.col ?? e.__index) - Number(r.col ?? t.__index) || e.__index - t.__index;
	}).map((e, t) => ({
		url: String(e.url || ""),
		name: ti(e, `image-${String(t + 1).padStart(2, "0")}`)
	}));
	return {
		filename: ii(`${String(e.title || "image-group")}.zip`, "image-group.zip"),
		items: t,
		urls: t.map((e) => e.url)
	};
}
function Xr({ document: e, node: t, onClose: n, onEdit: r, onExportVideoFrame: i, onNavigate: a, onRememberSize: o, url: s }) {
	let c = (0, G.useMemo)(() => fr(t), [t]), l = Math.max(0, c.findIndex((e) => e.url === s)), [u, d] = (0, G.useState)(l), f = c[u] || c[0], p = f ? cr(f) : "image", m = p === "video", h = (0, G.useMemo)(() => Jr(e, t, String(f?.url || "")), [
		e,
		f?.url,
		t
	]), [g, _] = (0, G.useState)(!1), [v, y] = (0, G.useState)(-1), [b, x] = (0, G.useState)(50), [S, C] = (0, G.useState)(1), [w, T] = (0, G.useState)({
		x: 0,
		y: 0
	}), [E, D] = (0, G.useState)(!1), [O, k] = (0, G.useState)(!1), [A, j] = (0, G.useState)(!1), [M, N] = (0, G.useState)("wide"), [P, F] = (0, G.useState)({
		w: 16,
		h: 9
	}), [I, ee] = (0, G.useState)({
		fov: 75,
		pitch: 0,
		yaw: 0
	}), [te, L] = (0, G.useState)({
		height: Number(f?.natural_h || f?.height || 0),
		width: Number(f?.natural_w || f?.width || 0)
	}), [R, z] = (0, G.useState)(!1), [B, ne] = (0, G.useState)(""), re = (0, G.useRef)(null), ie = (0, G.useRef)(null), ae = (0, G.useRef)(null), V = (0, G.useRef)(null), oe = (0, G.useRef)({}), se = (0, G.useRef)(null);
	(0, G.useEffect)(() => {
		let e = Math.max(0, c.findIndex((e) => e.url === s));
		d(e);
	}, [c, s]), (0, G.useEffect)(() => {
		_(!1), y(-1), x(50), C(1), T({
			x: 0,
			y: 0
		}), k(!1), j(!1), ee({
			fov: 75,
			pitch: 0,
			yaw: 0
		}), L({
			height: Number(f?.natural_h || f?.height || 0),
			width: Number(f?.natural_w || f?.width || 0)
		});
	}, [f?.url]), (0, G.useEffect)(() => {
		let e = (e) => {
			if (e.key === "Escape") {
				e.preventDefault(), n();
				return;
			}
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
			e.preventDefault();
			let t = e.key === "ArrowLeft" ? -1 : 1;
			m && oi(ae.current, t, f) || me(t);
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}), (0, G.useEffect)(() => {
		requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		v,
		g,
		u,
		O,
		M
	]), (0, G.useEffect)(() => {
		if (!O || !f?.url) return;
		let e = !1;
		return j(!1), li(oe.current, V.current, Zr(f), () => {
			e || j(!0);
		}).catch(() => {
			e || j(!0);
		}), () => {
			e = !0, di(oe.current);
		};
	}, [f?.url, O]), (0, G.useEffect)(() => {
		O && ui(oe.current, V.current, I);
	}, [
		O,
		A,
		I
	]), (0, G.useEffect)(() => () => fi(oe.current), []);
	let ce = M === "custom" ? P : qr[M], H = si(ce.w, ce.h), le = c.length > 1, ue = g && v >= 0 && v < h.length, de = ue ? h[v] : null, fe = t.runPrompt ? `提示词：${String(t.runPrompt).slice(0, 60)}` : "", pe = [`分辨率: ${Math.round(te.width)} x ${Math.round(te.height)}`.replace(/^分辨率: 0 x 0$/, ""), O ? "拖动查看全景，滚轮缩放视野" : g && !ue ? "请选择一张原图进行对比" : fe].filter(Boolean).join(" · "), me = (e) => {
		if (c.length <= 1) return;
		let t = (u + e + c.length) % c.length;
		d(t), a(String(c[t].url || ""));
	}, he = () => {
		x(50), T({
			x: 0,
			y: 0
		}), C(1), ee({
			fov: 75,
			pitch: 0,
			yaw: 0
		});
	}, ge = (e, t) => {
		e > 0 && t > 0 && (L({
			width: e,
			height: t
		}), (!f?.natural_w || !f?.natural_h) && o?.(u, e, t));
	}, _e = (e) => {
		let t = re.current?.getBoundingClientRect();
		t && x(Math.max(0, Math.min(100, (e - t.left) / Math.max(1, t.width) * 100)));
	}, U = (e, t) => {
		e.button === 0 && (e.preventDefault(), e.stopPropagation(), e.currentTarget.setPointerCapture(e.pointerId), se.current = {
			mode: t,
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			startPan: w,
			startPitch: I.pitch,
			startYaw: I.yaw
		}, D(!0), t === "compare" && _e(e.clientX));
	}, ve = (e) => {
		let t = se.current;
		!t || t.pointerId !== e.pointerId || (e.preventDefault(), e.stopPropagation(), t.mode === "compare" ? _e(e.clientX) : t.mode === "panorama" ? ee((n) => ({
			...n,
			yaw: t.startYaw - (e.clientX - t.startClientX) * .18,
			pitch: Math.max(-85, Math.min(85, t.startPitch + (e.clientY - t.startClientY) * .18))
		})) : T({
			x: t.startPan.x + e.clientX - t.startClientX,
			y: t.startPan.y + e.clientY - t.startClientY
		}));
	}, ye = (e) => {
		se.current?.pointerId === e.pointerId && (se.current = null, D(!1), e.currentTarget.releasePointerCapture?.(e.pointerId));
	}, W = (e) => {
		if (e.preventDefault(), e.stopPropagation(), m && oi(ae.current, e.deltaY > 0 ? 1 : -1, f)) return;
		if (O) {
			let t = e.deltaY < 0 ? .92 : 1 / .92;
			ee((e) => ({
				...e,
				fov: Math.max(35, Math.min(100, e.fov * t))
			}));
			return;
		}
		let t = S, n = Math.max(.05, S * (e.deltaY < 0 ? 1.12 : 1 / 1.12)), r = re.current?.getBoundingClientRect();
		if (C(n), r) {
			let i = e.clientX - r.left - r.width / 2, a = e.clientY - r.top - r.height / 2, o = n / t;
			T((e) => ({
				x: e.x - i * (o - 1),
				y: e.y - a * (o - 1)
			}));
		}
	}, be = () => {
		h.length && (k(!1), _((e) => (!e && (v < 0 || v >= h.length) && y(0), e && y(-1), !e)));
	}, xe = () => {
		k((e) => (e || (_(!1), y(-1), T({
			x: 0,
			y: 0
		}), C(1)), !e));
	}, Se = async (e) => {
		let t = ae.current;
		if (!(!t || !f || !i || R)) {
			z(!0), ne("正在导出视频帧…");
			try {
				await i(await Cr(t, f, e)), ne("已导出到画布");
			} catch (e) {
				ne((e instanceof Error ? e.message : String(e)) || "导出帧失败");
			} finally {
				z(!1);
			}
		}
	};
	if (!f?.url || !["image", "video"].includes(p)) return null;
	let Ce = O ? {
		height: `${H.height}px`,
		transform: "",
		width: `${H.width}px`
	} : { transform: `translate(${w.x}px, ${w.y}px) scale(${S})` }, we = { "--compare-pos": `${b}%` };
	return /* @__PURE__ */ (0, K.jsx)("div", {
		"aria-label": m ? "预览视频" : "预览图片",
		"aria-modal": "true",
		className: "image-edit-modal open smart-canvas-preview",
		"data-testid": "smart-canvas-preview",
		id: "imageEditModal",
		onClick: (e) => {
			e.target === e.currentTarget && n();
		},
		onPointerDown: (e) => e.stopPropagation(),
		role: "dialog",
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: `image-edit-panel ${m ? "video-preview-mode" : ""}`,
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "image-edit-head",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("div", {
							className: "image-edit-title",
							id: "imageEditTitle",
							children: m ? "预览视频" : "预览图片"
						}), /* @__PURE__ */ (0, K.jsx)("div", {
							className: "image-edit-sub",
							id: "imageEditSub",
							children: m ? "" : "滚轮缩放 · 拖动平移 · 双击百分比复位"
						})] }),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "image-edit-mode",
							style: { display: m ? "none" : void 0 },
							children: [/* @__PURE__ */ (0, K.jsxs)("button", {
								className: "active",
								"data-image-edit-mode": "preview",
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "eye" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "预览" })]
							}), [
								[
									"crop",
									"crop",
									"裁剪"
								],
								[
									"outpaint",
									"expand",
									"扩图"
								],
								[
									"mask",
									"brush",
									"遮罩"
								],
								[
									"brush",
									"paintbrush",
									"画笔"
								],
								[
									"grid",
									"grid-3x3",
									"宫格切分"
								]
							].map(([e, t, n]) => /* @__PURE__ */ (0, K.jsxs)("button", {
								"data-image-edit-mode": e,
								onClick: () => r?.(u, e),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": t }), /* @__PURE__ */ (0, K.jsx)("span", { children: n })]
							}, e))]
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							"aria-label": "关闭预览",
							className: "preview-icon-btn",
							onClick: n,
							title: "关闭",
							type: "button",
							children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "x" })
						})
					]
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: `image-edit-tools active ${O ? "panorama-tools-on" : ""}`,
					id: "imagePreviewTools",
					children: [/* @__PURE__ */ (0, K.jsx)("span", {
						className: "image-edit-sub",
						id: "previewMetaHint",
						style: { marginLeft: "auto" },
						children: pe
					}), /* @__PURE__ */ (0, K.jsx)("div", {
						className: "panorama-controls",
						id: "panoramaControls",
						style: { display: O ? "inline-flex" : "none" },
						children: /* @__PURE__ */ (0, K.jsx)("div", {
							className: "panorama-control-group",
							children: /* @__PURE__ */ (0, K.jsxs)("div", {
								className: "panorama-control-line",
								children: [
									/* @__PURE__ */ (0, K.jsx)("span", {
										className: "panorama-control-label",
										children: "视窗比例"
									}),
									Object.entries(qr).map(([e, t]) => /* @__PURE__ */ (0, K.jsxs)("button", {
										className: M === e ? "active" : "",
										"data-panorama-ratio": e,
										onClick: () => N(e),
										type: "button",
										children: [
											t.w,
											":",
											t.h
										]
									}, e)),
									/* @__PURE__ */ (0, K.jsx)("button", {
										className: M === "custom" ? "active" : "",
										"data-panorama-ratio": "custom",
										onClick: () => N("custom"),
										type: "button",
										children: "自定义"
									}),
									/* @__PURE__ */ (0, K.jsxs)("label", {
										className: "panorama-custom-ratio",
										id: "panoramaCustomRatio",
										style: { display: M === "custom" ? "inline-flex" : "none" },
										children: [
											/* @__PURE__ */ (0, K.jsx)("input", {
												"aria-label": "ratio width",
												max: "999",
												min: "1",
												onChange: (e) => F((t) => ({
													...t,
													w: ai(e.target.value)
												})),
												type: "number",
												value: P.w
											}),
											/* @__PURE__ */ (0, K.jsx)("span", { children: ":" }),
											/* @__PURE__ */ (0, K.jsx)("input", {
												"aria-label": "ratio height",
												max: "999",
												min: "1",
												onChange: (e) => F((t) => ({
													...t,
													h: ai(e.target.value)
												})),
												type: "number",
												value: P.h
											})
										]
									})
								]
							})
						})
					})]
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "image-edit-stage preview-mode",
					id: "imageEditStage",
					onWheel: W,
					children: [
						/* @__PURE__ */ (0, K.jsx)("button", {
							className: `preview-nav-btn prev ${le ? "visible" : ""}`,
							id: "previewPrevBtn",
							onClick: () => me(-1),
							title: "上一张",
							type: "button",
							children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "chevron-left" })
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							className: `preview-nav-btn next ${le ? "visible" : ""}`,
							id: "previewNextBtn",
							onClick: () => me(1),
							title: "下一张",
							type: "button",
							children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "chevron-right" })
						}),
						/* @__PURE__ */ (0, K.jsx)("div", {
							className: "image-edit-stage-inner",
							children: /* @__PURE__ */ (0, K.jsx)("div", {
								className: `preview-stage ${ue ? "compare-on" : ""} ${O ? "panorama-on" : ""} ${E ? "panning" : ""}`,
								id: "previewStage",
								onPointerCancel: ye,
								onPointerDown: (e) => {
									!m && (e.target === e.currentTarget || e.target.closest?.("#previewFrame")) && U(e, O ? "panorama" : "pan");
								},
								onPointerMove: ve,
								onPointerUp: ye,
								style: we,
								children: /* @__PURE__ */ (0, K.jsxs)("div", {
									className: "preview-frame",
									id: "previewFrame",
									ref: re,
									style: Ce,
									children: [
										m ? /* @__PURE__ */ (0, K.jsx)("video", {
											autoPlay: !0,
											controls: !0,
											controlsList: "nodownload noplaybackrate noremoteplayback",
											crossOrigin: "anonymous",
											disablePictureInPicture: !0,
											id: "previewCurrentVideo",
											onLoadedMetadata: (e) => ge(e.currentTarget.videoWidth, e.currentTarget.videoHeight),
											playsInline: !0,
											preload: "metadata",
											ref: ae,
											src: Zr(f)
										}) : /* @__PURE__ */ (0, K.jsx)("img", {
											alt: "current",
											className: "preview-current",
											crossOrigin: "anonymous",
											id: "previewCurrentImage",
											onLoad: (e) => ge(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight),
											ref: ie,
											src: Zr(f),
											style: { display: O ? "none" : "block" }
										}),
										m ? null : /* @__PURE__ */ (0, K.jsxs)("div", {
											className: `panorama-stage ${A ? "ready" : ""}`,
											id: "panoramaStage",
											style: {
												display: O ? "block" : "none",
												height: H.height,
												width: H.width
											},
											children: [/* @__PURE__ */ (0, K.jsx)("canvas", {
												height: ci(ce).height,
												id: "panoramaCanvas",
												ref: V,
												width: ci(ce).width
											}), /* @__PURE__ */ (0, K.jsx)("div", {
												className: "panorama-loading",
												id: "panoramaLoading",
												children: "加载中..."
											})]
										}),
										m ? null : /* @__PURE__ */ (0, K.jsx)("div", {
											className: "preview-compare-layer",
											id: "previewCompareLayer",
											style: { display: ue && !O ? "" : "none" },
											children: de ? /* @__PURE__ */ (0, K.jsx)("img", {
												alt: "original",
												id: "previewCompareImage",
												src: Zr(de)
											}) : null
										}),
										m ? null : /* @__PURE__ */ (0, K.jsx)("div", {
											className: "preview-compare-handle",
											id: "previewCompareHandle",
											onPointerCancel: ye,
											onPointerDown: (e) => U(e, "compare"),
											onPointerMove: ve,
											onPointerUp: ye,
											style: { display: ue && !O ? "" : "none" },
											title: "拖动对比"
										})
									]
								})
							})
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "preview-download-overlay",
							children: [/* @__PURE__ */ (0, K.jsxs)("button", {
								className: "compare-toggle",
								id: "previewDownloadBtn",
								onClick: () => $r(f),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "download" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "下载" })]
							}), !m && c.length > 1 ? /* @__PURE__ */ (0, K.jsxs)("button", {
								className: "compare-toggle",
								id: "previewDownloadAllBtn",
								onClick: () => void ei(t),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "archive" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "下载全部" })]
							}) : null]
						}),
						m ? null : /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "preview-tools-overlay",
							children: [/* @__PURE__ */ (0, K.jsx)("div", {
								className: "compare-thumbs",
								id: "compareThumbs",
								style: { display: g && !O ? "inline-flex" : "none" },
								children: h.map((e, t) => /* @__PURE__ */ (0, K.jsx)("button", {
									className: `compare-thumb ${t === v ? "active" : ""}`,
									"data-compare-idx": t,
									onClick: () => y((e) => e === t ? -1 : t),
									title: t === v ? "取消当前对比" : "使用此原图对比",
									type: "button",
									children: /* @__PURE__ */ (0, K.jsx)("img", {
										alt: "",
										src: Qr(e)
									})
								}, `${e.url}-${t}`))
							}), /* @__PURE__ */ (0, K.jsxs)("div", {
								className: "preview-action-row",
								children: [/* @__PURE__ */ (0, K.jsxs)("button", {
									className: `compare-toggle ${O ? "active" : ""}`,
									id: "panoramaToggleBtn",
									onClick: xe,
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "globe-2" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "360全景" })]
								}), /* @__PURE__ */ (0, K.jsxs)("button", {
									className: `compare-toggle ${g ? "active" : ""}`,
									disabled: !h.length || O,
									id: "compareToggleBtn",
									onClick: be,
									style: { opacity: h.length && !O ? 1 : .45 },
									title: h.length ? "对比原图" : "没有可用原图",
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "columns-2" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "对比原图" })]
								})]
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "image-edit-actions",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("span", {
							id: "imageEditZoomLabel",
							onDoubleClick: he,
							style: {
								color: "#94a3b8",
								cursor: "pointer",
								display: m ? "none" : void 0,
								fontSize: 11,
								fontWeight: 800,
								marginRight: "auto",
								padding: "0 4px",
								userSelect: "none"
							},
							title: "双击重置缩放",
							children: [Math.round((O ? 75 / Math.max(1, I.fov) : S) * 100), "%"]
						}),
						m ? /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "video-frame-tools",
							id: "videoFrameTools",
							style: {
								display: "flex",
								marginRight: "auto"
							},
							children: [
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: "image-edit-btn secondary",
									disabled: R || !i,
									onClick: () => void Se("first"),
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "skip-back" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "导出首帧" })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: "image-edit-btn primary",
									disabled: R || !i,
									onClick: () => void Se("current"),
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "image-down" }), /* @__PURE__ */ (0, K.jsx)("span", { children: R ? "正在导出…" : "导出当前帧" })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: "image-edit-btn secondary",
									disabled: R || !i,
									onClick: () => void Se("last"),
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "skip-forward" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "导出尾帧" })]
								})
							]
						}) : null,
						/* @__PURE__ */ (0, K.jsx)("button", {
							className: "image-edit-btn secondary",
							id: "imageEditCancelBtn",
							onClick: n,
							type: "button",
							children: "关闭"
						})
					]
				}),
				B ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "image-edit-sub",
					"data-testid": "video-frame-status",
					children: B
				}) : null
			]
		})
	});
}
function Zr(e) {
	let t = String(e.url || "");
	return /^https?:\/\//i.test(t) ? `/api/download-output?inline=1&url=${encodeURIComponent(t)}&name=${encodeURIComponent(String(e.name || ri(t) || "preview"))}` : t;
}
function Qr(e) {
	let t = String(e.url || "");
	return t.startsWith("/assets/") || t.startsWith("/output/") ? `/api/media-preview?w=256&url=${encodeURIComponent(t)}` : Zr(e);
}
function $r(e) {
	if (!e.url) return;
	let t = ti(e, "image"), n = document.createElement("a");
	n.href = `/api/download-output?url=${encodeURIComponent(e.url)}&name=${encodeURIComponent(t)}`, n.download = t, document.body.append(n), n.click(), n.remove();
}
async function ei(e) {
	let t = Yr(e), n = await fetch("/api/canvas-assets/download", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(t)
	});
	if (!n.ok) throw Error(await n.text() || "批量下载失败");
	let r = URL.createObjectURL(await n.blob()), i = document.createElement("a");
	i.href = r, i.download = t.filename, document.body.append(i), i.click(), i.remove(), setTimeout(() => URL.revokeObjectURL(r), 1200);
}
function ti(e, t) {
	let n = ri(String(e.url || "")) || String(e.name || ""), r = ni(e), i = `${t}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}${r}`, a = ii(n || i, i);
	return /\.[a-z0-9]{2,8}$/i.test(a) || (a += r), a;
}
function ni(e) {
	let t = [e.name, e.url].map((e) => String(e || "").split(/[?#]/, 1)[0]).find((e) => /\.[a-z0-9]{2,8}$/i.test(e));
	return t ? t.match(/(\.[a-z0-9]{2,8})$/i)?.[1] || ".png" : cr(e) === "video" ? ".mp4" : cr(e) === "audio" ? ".mp3" : cr(e) === "text" ? ".txt" : ".png";
}
function ri(e) {
	return decodeURIComponent(e.split(/[?#]/, 1)[0].split("/").pop() || "").replace(/[\\/:*?"<>|]/g, "_");
}
function ii(e, t) {
	return String(e || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || t;
}
function ai(e) {
	return Math.max(1, Math.min(999, Number(e) || 1));
}
function oi(e, t, n) {
	if (!e || e.readyState < 1) return !1;
	e.pause();
	let r = Number(n.fps || n.frameRate || n.frame_rate || n.framespersecond || n.frames_per_second || 0), i = 1 / Math.max(1, Math.min(120, Number.isFinite(r) && r > 0 ? r : 30)), a = Number.isFinite(e.duration) && e.duration > 0 ? Math.max(0, e.duration - i / 2) : 2 ** 53 - 1;
	return e.currentTime = Math.max(0, Math.min(a, Number(e.currentTime || 0) + t * i)), !0;
}
function si(e, t) {
	let n = Math.max(.08, Math.min(12, e / Math.max(1, t))), r = Math.max(260, Math.min(1180, window.innerWidth - 116)), i = Math.max(220, Math.min(780, window.innerHeight - 220)), a = r, o = a / n;
	return o > i && (o = i, a = o * n), {
		width: Math.max(160, Math.round(a)),
		height: Math.max(160, Math.round(o))
	};
}
function ci(e) {
	let t = e.w / Math.max(1, e.h);
	return t >= 1 ? {
		width: 1536,
		height: Math.max(1, Math.round(1536 / t))
	} : {
		width: Math.max(1, Math.round(1536 * t)),
		height: 1536
	};
}
async function li(e, t, n, r) {
	if (!t || !n) return;
	e.three ||= await import(
		/* @vite-ignore */
		"/static/vendor/js/three-0.160.0.module.js?v=2026.05.30"
);
	let i = e.three;
	if (e.renderer || (e.renderer = new i.WebGLRenderer({
		canvas: t,
		antialias: !0,
		alpha: !1,
		preserveDrawingBuffer: !0
	}), e.renderer.setPixelRatio(1), e.renderer.outputColorSpace = i.SRGBColorSpace), !e.scene) {
		e.scene = new i.Scene(), e.camera = new i.PerspectiveCamera(75, 16 / 9, 1, 1200);
		let t = new i.SphereGeometry(500, 96, 64);
		t.scale(-1, 1, 1), e.sphere = new i.Mesh(t, new i.MeshBasicMaterial({ color: 16777215 })), e.scene.add(e.sphere);
	}
	let a = new Image();
	a.crossOrigin = "anonymous", await new Promise((e, t) => {
		a.onload = () => e(), a.onerror = () => t(/* @__PURE__ */ Error("全景图片加载失败")), a.src = n;
	}), di(e), e.texture = new i.Texture(a), e.texture.colorSpace = i.SRGBColorSpace, e.texture.needsUpdate = !0, e.sphere.material.map = e.texture, e.sphere.material.needsUpdate = !0, r();
}
function ui(e, t, n) {
	let { renderer: r, scene: i, camera: a, sphere: o, three: s } = e;
	if (!t || !r || !i || !a || !o || !s || !e.texture) return;
	r.setSize(Math.max(1, t.width), Math.max(1, t.height), !1), a.fov = Math.max(35, Math.min(100, n.fov)), a.aspect = t.width / Math.max(1, t.height), a.updateProjectionMatrix();
	let c = s.MathUtils.degToRad(90 - Math.max(-85, Math.min(85, n.pitch))), l = s.MathUtils.degToRad(n.yaw);
	a.position.set(0, 0, 0), a.lookAt(new s.Vector3(500 * Math.sin(c) * Math.cos(l), 500 * Math.cos(c), 500 * Math.sin(c) * Math.sin(l))), r.render(i, a);
}
function di(e) {
	e.texture?.dispose?.(), e.texture = void 0, e.sphere?.material && (e.sphere.material.map = null, e.sphere.material.needsUpdate = !0);
}
function fi(e) {
	di(e), e.renderer?.dispose?.(), e.sphere?.geometry?.dispose?.(), e.sphere?.material?.dispose?.();
}
//#endregion
//#region src/canvas/ui/smart-canvas-shortcut-panel.tsx
var pi = [
	{
		keys: ["Ctrl"],
		text: "按住并拖拽框选节点"
	},
	{
		keys: ["Ctrl", "G"],
		text: "合并选中的图片为组"
	},
	{
		keys: [
			"Ctrl",
			"Shift",
			"G"
		],
		text: "释放选中的分组"
	},
	{
		keys: ["Ctrl", "Z"],
		text: "撤销上一步操作"
	},
	{
		keys: ["Ctrl", "C"],
		text: "复制选中的节点"
	},
	{
		keys: ["Ctrl", "V"],
		text: "粘贴节点或剪贴板图片"
	},
	{
		keys: ["A"],
		text: "打开/关闭资源库"
	},
	{
		keys: ["Z"],
		text: "缩小画布视图"
	},
	{
		keys: ["双击"],
		text: "打开快捷菜单"
	},
	{
		keys: ["空白处"],
		text: "拖动画布"
	},
	{
		keys: ["滚轮"],
		text: "缩放画布或预览图片"
	},
	{
		keys: ["Del"],
		text: "删除选中节点"
	}
];
function mi(e) {
	return !!(e instanceof Element ? e : document.activeElement)?.closest("input, textarea, select, option, [contenteditable=\"true\"], .prompt-node-control, .prompt-input");
}
function hi(e) {
	let t = String(e.type || "").toLowerCase(), n = String(e.name || "").toLowerCase();
	return t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/") || /\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(n);
}
function gi({ onClose: e, onToggleAssets: t, open: n }) {
	return (0, G.useEffect)(() => {
		let n = (n) => {
			n.key === "Escape" && e(), !(String(n.key || "").toLowerCase() !== "a" || n.ctrlKey || n.metaKey || n.altKey || n.repeat || mi(n.target)) && (n.preventDefault(), t());
		};
		return window.addEventListener("keydown", n), () => window.removeEventListener("keydown", n);
	}, [e, t]), /* @__PURE__ */ (0, K.jsx)("div", {
		className: `shortcut-modal ${n ? "open" : ""}`,
		id: "smartShortcutModal",
		onClick: e,
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "shortcut-panel",
			onClick: (e) => e.stopPropagation(),
			children: [/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "shortcut-head",
				children: [/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "shortcut-title",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "keyboard" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "快捷键" })]
				}), /* @__PURE__ */ (0, K.jsx)("button", {
					className: "preview-icon-btn",
					onClick: e,
					title: "关闭",
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)("i", {
						className: "w-4 h-4",
						"data-lucide": "x"
					})
				})]
			}), /* @__PURE__ */ (0, K.jsx)("div", {
				className: "shortcut-list",
				children: pi.map((e) => /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "shortcut-item",
					children: [/* @__PURE__ */ (0, K.jsx)("span", {
						className: "shortcut-keys",
						children: e.keys.map((e) => /* @__PURE__ */ (0, K.jsx)("kbd", { children: e }, e))
					}), /* @__PURE__ */ (0, K.jsx)("span", { children: e.text })]
				}, e.text))
			})]
		})
	});
}
//#endregion
//#region src/canvas/ui/smart-loop-node.tsx
function _i(e) {
	if (Array.isArray(e.variablePrompts) && e.variablePrompts.length) return e.variablePrompts.map((e) => String(e || "").trim());
	let t = String(e.variablePrompt || "").trim();
	if (!t) return [];
	let n = t.split(/\r?\n+/).map((e) => e.trim()).filter(Boolean);
	return n.length >= 2 ? n : [t];
}
function vi(e, t, n) {
	if (!e.showPrompt) return "";
	let r = _i(e).filter(Boolean), i = Math.max(1, Number(e.loopStart || 1)), a = Math.max(1, Math.min(100, Number(e.count || 1))), o = Math.max(1, n || i);
	return [t.length ? t[(o - 1) % t.length] : "", r.length ? r[(o - 1) % r.length] : ""].map((e) => e.trim()).filter(Boolean).join("\n\n").replaceAll("《计数》", String(o)).replaceAll("[计数]", String(o)).replaceAll("《总数》", String(a)).replaceAll("[总数]", String(a)).replaceAll("《进度》", `${o}/${a}`).replaceAll("[进度]", `${o}/${a}`).trim();
}
function yi(e, t, n) {
	if (!e.imageInput) return [];
	let r = Math.max(1, n || Number(e.loopStart || 1)), i = Math.max(1, Math.min(100, Number(e.imageBatchSize || 1)));
	return t.slice(r - 1, r - 1 + i);
}
function bi(e, t = 0, n = 0) {
	let r = _i(e), i = 168;
	if (e.imageInput && (i += 72), e.showPrompt && (i += 94 + Math.max(1, r.length) * 58 + (n ? 78 : 0)), e.imageInput && t) {
		let e = Math.ceil(Math.min(10, t) / 5);
		i += e * 44 + (e - 1) * 6 + 8;
	}
	return {
		width: 340,
		height: Math.max(i, Number(e.h || 0))
	};
}
function xi({ disabled: e, label: t, max: n, onChange: r, value: i }) {
	let a = [
		1,
		2,
		3,
		4,
		5,
		6,
		8,
		10
	], o = (e) => r(Math.max(1, Math.min(n, Number(e) || 1)));
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "loop-number-control",
		children: [/* @__PURE__ */ (0, K.jsxs)("button", {
			className: "loop-smart-control loop-number-trigger",
			disabled: e,
			type: "button",
			children: [/* @__PURE__ */ (0, K.jsx)("span", { children: t }), /* @__PURE__ */ (0, K.jsx)("strong", { children: i })]
		}), /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "loop-number-popover",
			children: [/* @__PURE__ */ (0, K.jsx)("div", {
				className: "loop-number-grid",
				children: a.map((t) => /* @__PURE__ */ (0, K.jsx)("button", {
					className: `loop-smart-control loop-number-cell ${t === i ? "active" : ""}`,
					"data-loop-value": t,
					disabled: e,
					onClick: () => o(t),
					type: "button",
					children: t
				}, t))
			}), /* @__PURE__ */ (0, K.jsxs)("label", {
				className: "loop-number-custom",
				children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "自定义" }), /* @__PURE__ */ (0, K.jsx)("input", {
					"aria-label": t,
					className: "loop-smart-control loop-number-input",
					disabled: e,
					max: n,
					min: "1",
					onChange: (e) => o(Number(e.target.value)),
					step: "1",
					type: "number",
					value: i
				})]
			})]
		})]
	});
}
function Si({ media: e }) {
	return e.length ? /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "smart-node-input-thumbs",
		children: [e.slice(0, 10).map((e, t) => {
			let n = cr(e), r = String(e.url || "");
			return /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "smart-node-input-thumb",
				children: [n === "video" ? /* @__PURE__ */ (0, K.jsx)("video", {
					muted: !0,
					preload: "metadata",
					src: r
				}) : n === "audio" ? /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "audio-thumb",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "file-audio" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "Audio" })]
				}) : /* @__PURE__ */ (0, K.jsx)("img", {
					alt: "",
					src: r
				}), /* @__PURE__ */ (0, K.jsx)("span", {
					className: "smart-node-input-badge",
					children: t + 1
				})]
			}, `${r}-${t}`);
		}), e.length > 10 ? /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "smart-node-input-thumb smart-node-input-more",
			children: ["+", e.length - 10]
		}) : null]
	}) : null;
}
function Ci({ text: e, onRemove: t }) {
	let n = e.split(/(《计数》|\[计数\])/g);
	return /* @__PURE__ */ (0, K.jsx)(K.Fragment, { children: n.map((e, n) => e === "《计数》" || e === "[计数]" ? /* @__PURE__ */ (0, K.jsxs)("span", {
		className: "loop-smart-token-chip",
		contentEditable: !1,
		"data-token": "《计数》",
		children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "计数" }), /* @__PURE__ */ (0, K.jsx)("button", {
			"aria-label": "删除变量",
			onClick: (e) => {
				e.preventDefault(), e.stopPropagation(), t();
			},
			title: "删除",
			type: "button",
			children: "×"
		})]
	}, n) : e) });
}
function wi(e) {
	let t = (e) => {
		if (e.nodeType === Node.TEXT_NODE) return e.nodeValue || "";
		if (e.nodeType !== Node.ELEMENT_NODE) return "";
		let n = e;
		return n.classList.contains("loop-smart-token-chip") ? n.dataset.token || "" : n.tagName === "BR" ? "\n" : [...n.childNodes].map(t).join("");
	};
	return [...e.childNodes].map(t).join("").replace(/\u00a0/g, " ");
}
function Ti({ connecting: e, media: t, node: n, onConnectIn: r, onConnectOut: i, onDelete: a, onMoveStart: o, onPatch: s, onRun: c, onSelect: l, readOnly: u, selected: d, upstreamPrompts: f }) {
	let p = _i(n), m = p.length ? p : [""], h = Math.max(1, Math.min(100, Number(n.count || 1))), g = Math.max(1, Number(n.loopStart || 1)), _ = Math.max(1, Math.min(100, Number(n.imageBatchSize || 1))), v = n.imageInput ? t : [], y = yi(n, t, g), b = bi(n, v.length, f.length), x = f.length ? f[(g - 1) % f.length] : "", [S, C] = (0, G.useState)(0);
	(0, G.useEffect)(() => {
		requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		n.imageInput,
		n.showPrompt,
		n.running,
		p.length,
		t.length
	]);
	let w = (e, t = !1) => s({
		variablePrompts: e.length ? e : [""],
		variablePrompt: e.filter(Boolean).join("\n"),
		h: bi({
			...n,
			variablePrompts: e
		}, v.length, f.length).height,
		w: 340
	}, t), T = (e) => {
		let r = { [e]: !n[e] };
		e === "showPrompt" && !n.showPrompt && !p.length && Object.assign(r, {
			variablePrompts: ["现在生成第《计数》张卖点图片"],
			variablePrompt: "现在生成第《计数》张卖点图片"
		});
		let i = {
			...n,
			...r
		};
		s({
			...r,
			...bi(i, e === "imageInput" && n.imageInput ? 0 : t.length, f.length)
		}, !0);
	}, E = (e, t, n = !1) => {
		let r = [...m];
		r[e] = t, w(r, n);
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		"aria-label": `smart-loop ${n.id}`,
		className: `image-node loop-smart-node ${d ? "selected" : ""} ${n.running ? "node-running" : ""}`.trim(),
		"data-id": n.id,
		"data-node-id": n.id,
		"data-node-type": "smart-loop",
		onClick: (e) => {
			e.stopPropagation(), l(e);
		},
		onPointerDown: o,
		role: "button",
		style: {
			height: b.height,
			left: Number(n.x || 0),
			top: Number(n.y || 0),
			width: b.width
		},
		tabIndex: 0,
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "node-head",
				children: [/* @__PURE__ */ (0, K.jsx)("div", {
					className: "node-title",
					children: "Loop"
				}), /* @__PURE__ */ (0, K.jsx)("div", { className: "node-actions" })]
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "floating-node-actions",
				children: /* @__PURE__ */ (0, K.jsx)("button", {
					className: "mini-x node-delete",
					disabled: u,
					onClick: (e) => {
						e.stopPropagation(), a();
					},
					title: "删除节点",
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "trash-2" })
				})
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "node-body",
				children: /* @__PURE__ */ (0, K.jsxs)("div", {
					className: `loop-smart-card ${n.imageInput ? "has-image" : ""} ${n.showPrompt ? "has-prompt" : ""}`,
					onClick: (e) => e.stopPropagation(),
					onPointerDown: (e) => e.stopPropagation(),
					children: [
						/* @__PURE__ */ (0, K.jsx)("div", {
							className: "loop-smart-row loop-smart-top",
							children: /* @__PURE__ */ (0, K.jsxs)("div", {
								className: "loop-smart-seg",
								children: [/* @__PURE__ */ (0, K.jsx)("button", {
									className: `loop-smart-control ${n.mode === "parallel" ? "" : "active"}`,
									disabled: u || !!n.running,
									onClick: () => s({ mode: "serial" }, !0),
									type: "button",
									children: "串行"
								}), /* @__PURE__ */ (0, K.jsx)("button", {
									className: `loop-smart-control ${n.mode === "parallel" ? "active" : ""}`,
									disabled: u || !!n.running,
									onClick: () => s({ mode: "parallel" }, !0),
									title: "并行运行多个循环轮次",
									type: "button",
									children: "并行"
								})]
							})
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "loop-smart-row",
							children: [/* @__PURE__ */ (0, K.jsxs)("button", {
								className: `loop-smart-control loop-smart-toggle ${n.imageInput ? "active" : ""}`,
								disabled: u || !!n.running,
								onClick: () => T("imageInput"),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "image" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "图片输入" })]
							}), /* @__PURE__ */ (0, K.jsxs)("button", {
								className: `loop-smart-control loop-smart-toggle ${n.showPrompt ? "active" : ""}`,
								disabled: u || !!n.running,
								onClick: () => T("showPrompt"),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "text-cursor-input" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "提示词输入" })]
							})]
						}),
						n.imageInput ? /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "loop-smart-panel",
							children: [
								/* @__PURE__ */ (0, K.jsx)(Si, { media: v }),
								/* @__PURE__ */ (0, K.jsx)("div", {
									className: "loop-smart-mini",
									children: /* @__PURE__ */ (0, K.jsx)(xi, {
										disabled: u || !!n.running,
										label: "每轮图片",
										max: 100,
										onChange: (e) => s({ imageBatchSize: e }, !0),
										value: _
									})
								}),
								/* @__PURE__ */ (0, K.jsx)("div", {
									className: "loop-smart-note",
									children: y.length ? `本轮将输出 ${y.length} 张图片` : "请连接图片输入"
								})
							]
						}) : null,
						n.showPrompt ? /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "loop-smart-panel prompt-panel",
							children: [
								x ? /* @__PURE__ */ (0, K.jsxs)("div", {
									className: "loop-smart-upstream",
									children: [/* @__PURE__ */ (0, K.jsxs)("div", {
										className: "loop-smart-upstream-label",
										children: [
											"已找到 ",
											f.length,
											" 个上游提示词"
										]
									}), /* @__PURE__ */ (0, K.jsx)("div", {
										className: "loop-smart-upstream-text",
										children: x
									})]
								}) : null,
								/* @__PURE__ */ (0, K.jsx)("div", {
									className: "loop-smart-prompt-list",
									children: m.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("div", {
										className: "loop-smart-prompt-item",
										children: [
											/* @__PURE__ */ (0, K.jsx)("div", {
												className: "loop-smart-prompt-index",
												children: t + 1
											}),
											/* @__PURE__ */ (0, K.jsx)("div", {
												className: "loop-smart-control loop-smart-text",
												contentEditable: !u && !n.running,
												"data-loop-prompt-index": t,
												"data-placeholder": "输入每轮变化的提示词",
												onBlur: (e) => E(t, wi(e.currentTarget), !0),
												onFocus: () => C(t),
												suppressContentEditableWarning: !0,
												children: /* @__PURE__ */ (0, K.jsx)(Ci, {
													onRemove: () => E(t, e.replace(/《计数》|\[计数\]/, ""), !0),
													text: e || (t === 0 && !p.length ? "现在生成第《计数》张卖点图片" : "")
												})
											}),
											/* @__PURE__ */ (0, K.jsx)("button", {
												"aria-label": "删除提示词字段",
												className: "loop-smart-control loop-smart-icon-btn",
												disabled: u || !!n.running || m.length <= 1,
												onClick: () => w(m.filter((e, n) => n !== t), !0),
												title: "删除",
												type: "button",
												children: "×"
											})
										]
									}, t))
								}),
								/* @__PURE__ */ (0, K.jsxs)("div", {
									className: "loop-smart-row loop-smart-prompt-actions",
									children: [
										/* @__PURE__ */ (0, K.jsx)("button", {
											className: "loop-smart-control loop-smart-token loop-smart-counter-token",
											disabled: u || !!n.running,
											onClick: () => E(Math.min(S, m.length - 1), `${m[Math.min(S, m.length - 1)] || ""}《计数》`, !0),
											type: "button",
											children: "计数"
										}),
										/* @__PURE__ */ (0, K.jsx)("span", {
											className: "loop-smart-note",
											children: f.length ? `已找到 ${f.length} 个上游提示词` : "每轮使用对应的变量提示词"
										}),
										/* @__PURE__ */ (0, K.jsx)("button", {
											"aria-label": "新增",
											className: "loop-smart-control loop-smart-add-prompt",
											disabled: u || !!n.running,
											onClick: () => w([...m, ""], !0),
											title: "新增",
											type: "button",
											children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "plus" })
										})
									]
								})
							]
						}) : null,
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "loop-smart-footer",
							children: [
								/* @__PURE__ */ (0, K.jsx)(xi, {
									disabled: u || !!n.running,
									label: "起始",
									max: 9999,
									onChange: (e) => s({ loopStart: e }, !0),
									value: g
								}),
								/* @__PURE__ */ (0, K.jsx)(xi, {
									disabled: u || !!n.running,
									label: "轮次",
									max: 100,
									onChange: (e) => s({ count: e }, !0),
									value: h
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: `loop-smart-control loop-smart-run ${n.running ? "is-stop" : ""}`,
									disabled: u,
									onClick: () => void c(),
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": n.running ? "square" : "workflow" }), /* @__PURE__ */ (0, K.jsx)("span", { children: n.running ? "停止运行" : "运行全部" })]
								})
							]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "node-hint",
				children: "拖拽节点移动"
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "node-resize-handle",
				"data-resize": "1"
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: `node-port port-in ${e ? "port-hover" : ""}`,
				"data-port": "in",
				onClick: (e) => {
					e.stopPropagation(), r();
				},
				title: "输入"
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "node-port port-out",
				"data-port": "out",
				onPointerDown: (e) => {
					e.stopPropagation(), i();
				},
				title: "输出"
			})
		]
	});
}
//#endregion
//#region src/canvas/ui/smart-prompt-node.tsx
var Ei = 58, q = 44, Di = 240;
function Oi(e, t = 0) {
	let n = Number(e.llmInstructionHeight), r = Number.isFinite(n) ? Math.max(q, Math.min(Di, Math.round(n))) : Ei, i = Number(e.w), a = Number(e.h), o = !Number.isFinite(i) || i === 360 ? 316 : Math.max(316, Math.round(i)), s = t ? Math.ceil(Math.min(10, t) / 5) : 0, c = s ? s * 44 + (s - 1) * 6 + 8 : 0, l = e.llmEnabled ? (e.llmSystemEnabled ? 344 : 292) + c + Math.max(0, r - Ei) : 194, u = e.llmSystemEnabled ? 344 : 292;
	return {
		height: !Number.isFinite(a) || [
			194,
			230,
			340,
			400,
			u
		].includes(a) ? l : Math.max(Math.round(a), l),
		instructionHeight: r,
		width: o
	};
}
function ki(e, t) {
	let n = String(e.llmProvider || "comfly"), r = String(e.llmModel || e.model || "gpt-4o-mini");
	return {
		message: String(e.llmInstruction || e.text || "").trim(),
		messages: [],
		images: t.filter((e) => cr(e) === "image").map((e) => String(e.url || "")).filter(Boolean),
		videos: t.filter((e) => cr(e) === "video").map((e) => String(e.url || "")).filter(Boolean),
		model: r,
		provider: n,
		ms_model: n === "modelscope" ? r : "",
		system_prompt: e.llmSystemEnabled ? String(e.llmSystemPrompt || "").trim() || "You are a helpful prompt assistant." : ""
	};
}
function Ai(e) {
	let t = document.getElementById("toast");
	t && (t.textContent = e, t.classList.add("show"), window.setTimeout(() => t.classList.remove("show"), 1800));
}
function ji({ media: e }) {
	return e.length ? /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "smart-node-input-thumbs",
		children: [e.slice(0, 10).map((e, t) => {
			let n = cr(e), r = String(e.url || "");
			return /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "smart-node-input-thumb",
				"data-input-index": t,
				children: [n === "video" ? /* @__PURE__ */ (0, K.jsx)("video", {
					muted: !0,
					preload: "metadata",
					src: r
				}) : n === "audio" ? /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "audio-thumb",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "file-audio" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "Audio" })]
				}) : /* @__PURE__ */ (0, K.jsx)("img", {
					alt: "",
					src: r
				}), /* @__PURE__ */ (0, K.jsx)("span", {
					className: "smart-node-input-badge",
					children: t + 1
				})]
			}, `${r}-${t}`);
		}), e.length > 10 ? /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "smart-node-input-thumb smart-node-input-more",
			children: ["+", e.length - 10]
		}) : null]
	}) : null;
}
function Mi({ connecting: e, media: t, node: n, onConnectIn: r, onConnectOut: i, onDelete: a, onMoveStart: o, onOpenPreset: s, onOpenTemplate: c, onPatch: l, onRun: u, onSelect: d, providers: f, readOnly: p, selected: m }) {
	let [h, g] = (0, G.useState)(f), _ = Oi(n, n.llmEnabled ? t.length : 0), v = h.find((e) => e.value === n.llmProvider) || h[0], y = v?.models || [String(n.llmModel || n.model || "gpt-4o-mini")].filter(Boolean), b = y.includes(String(n.llmModel || "")) ? String(n.llmModel) : y[0] || String(n.llmModel || "gpt-4o-mini");
	(0, G.useEffect)(() => {
		requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		n.llmEnabled,
		n.llmSystemEnabled,
		n.running,
		t.length
	]), (0, G.useEffect)(() => {
		let e = !0;
		return fetch("/api/config").then((e) => e.json()).then((t) => {
			let n = (t.api_providers || []).filter((e) => e.enabled !== !1 && e.id && e.chat_models?.length).map((e) => ({
				label: String(e.name || e.id),
				models: [...new Set((e.chat_models || []).map(String).filter(Boolean))],
				value: String(e.id)
			}));
			e && n.length && g(n);
		}).catch(() => void 0), () => {
			e = !1;
		};
	}, []);
	let x = async () => {
		let e = ki({
			...n,
			llmProvider: v?.value || n.llmProvider,
			llmModel: b
		}, t);
		if (!e.message) {
			Ai("请输入要处理的提示词或 LLM 指令");
			return;
		}
		l({
			llmEnabled: !0,
			llmProvider: e.provider,
			llmModel: e.model
		});
		try {
			await u();
		} catch (e) {
			Ai((e instanceof Error ? e.message : String(e)).slice(0, 160));
		}
	}, S = () => {
		let e = !n.llmEnabled, r = Oi({
			...n,
			llmEnabled: e
		}, e ? t.length : 0);
		l({
			llmEnabled: e,
			llmProvider: v?.value || n.llmProvider || "comfly",
			llmModel: b,
			h: r.height,
			w: r.width
		}, !0);
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		"aria-label": `smart-prompt ${n.id}`,
		className: `image-node prompt-smart-node ${m ? "selected" : ""} ${n.running ? "node-running" : ""}`.trim(),
		"data-id": n.id,
		"data-node-id": n.id,
		"data-node-type": "smart-prompt",
		onClick: (e) => {
			e.stopPropagation(), d(e);
		},
		onPointerDown: o,
		role: "button",
		style: {
			height: _.height,
			left: Number(n.x || 0),
			top: Number(n.y || 0),
			width: _.width
		},
		tabIndex: 0,
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "node-head",
				children: [/* @__PURE__ */ (0, K.jsx)("div", {
					className: "node-title",
					children: "Prompt"
				}), /* @__PURE__ */ (0, K.jsx)("div", { className: "node-actions" })]
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "floating-node-actions",
				children: /* @__PURE__ */ (0, K.jsx)("button", {
					className: "mini-x node-delete",
					disabled: p,
					onClick: (e) => {
						e.stopPropagation(), a();
					},
					title: "删除节点",
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "trash-2" })
				})
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "node-body",
				children: /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "prompt-node-card",
					onClick: (e) => e.stopPropagation(),
					onPointerDown: (e) => e.stopPropagation(),
					children: [
						/* @__PURE__ */ (0, K.jsx)("textarea", {
							className: "prompt-node-text prompt-node-control",
							onBlur: () => l({}, !0),
							onChange: (e) => l({ text: e.target.value }),
							onClick: (e) => e.stopPropagation(),
							onPointerDown: (e) => e.stopPropagation(),
							placeholder: "输入提示词",
							readOnly: p || !!n.llmEnabled,
							value: String(n.text || "")
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "prompt-node-tools",
							children: [
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: `prompt-node-pill prompt-node-control prompt-preset-edit ${n.promptPresetId ? "active" : ""}`,
									disabled: p,
									onClick: (e) => {
										e.stopPropagation(), c();
									},
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "library" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "模板库" })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: "prompt-node-pill prompt-node-control prompt-preset-save",
									disabled: p,
									onClick: (e) => {
										e.stopPropagation(), s();
									},
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "bookmark-plus" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "预设" })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: `prompt-node-pill prompt-llm-toggle ${n.llmEnabled ? "active" : ""}`,
									disabled: p,
									onClick: (e) => {
										e.stopPropagation(), S();
									},
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "sparkles" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "LLM" })]
								})
							]
						}),
						n.llmEnabled ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)(ji, { media: t }), /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "prompt-node-llm",
							children: [
								/* @__PURE__ */ (0, K.jsx)("select", {
									"aria-label": "LLM 平台",
									className: "prompt-node-control prompt-llm-provider",
									disabled: p,
									onChange: (e) => {
										let t = h.find((t) => t.value === e.target.value);
										l({
											llmProvider: e.target.value,
											llmModel: t?.models[0] || ""
										}, !0);
									},
									value: v?.value || String(n.llmProvider || ""),
									children: h.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
										value: e.value,
										children: e.label
									}, e.value))
								}),
								/* @__PURE__ */ (0, K.jsx)("select", {
									"aria-label": "LLM 模型",
									className: "prompt-node-control prompt-llm-model",
									disabled: p,
									onChange: (e) => l({ llmModel: e.target.value }, !0),
									value: b,
									children: y.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
										value: e,
										children: e
									}, e))
								}),
								/* @__PURE__ */ (0, K.jsxs)("div", {
									className: "prompt-llm-instruction-wrap",
									children: [/* @__PURE__ */ (0, K.jsx)("textarea", {
										"aria-label": "LLM 指令",
										className: "prompt-node-control prompt-llm-instruction",
										disabled: p,
										onBlur: () => l({}, !0),
										onChange: (e) => l({ llmInstruction: e.target.value }),
										placeholder: "输入发送给 LLM 的指令",
										style: { height: _.instructionHeight },
										value: String(n.llmInstruction || "")
									}), /* @__PURE__ */ (0, K.jsx)("div", {
										className: "prompt-llm-instruction-resize prompt-node-control",
										"data-llm-instruction-resize": "1",
										onPointerDown: (e) => {
											if (p || e.button !== 0) return;
											e.preventDefault(), e.stopPropagation();
											let t = e.clientY, r = _.instructionHeight, i = _.height;
											document.body.classList.add("smart-node-resize", "smart-llm-instr-resize");
											let a = (e) => {
												let a = Math.max(q, Math.min(Di, Math.round(r + e.clientY - t)));
												l({
													llmInstructionHeight: a,
													h: Math.max(n.llmSystemEnabled ? 344 : 292, i + a - r)
												});
											};
											window.addEventListener("pointermove", a), window.addEventListener("pointerup", () => {
												window.removeEventListener("pointermove", a), document.body.classList.remove("smart-node-resize", "smart-llm-instr-resize"), l({}, !0);
											}, { once: !0 });
										},
										title: "拖动调整高度",
										children: /* @__PURE__ */ (0, K.jsx)("span", {})
									})]
								}),
								/* @__PURE__ */ (0, K.jsxs)("div", {
									className: "prompt-node-llm-actions",
									children: [/* @__PURE__ */ (0, K.jsxs)("button", {
										className: "prompt-node-run prompt-node-control",
										disabled: p || !!n.running,
										onClick: (e) => {
											e.stopPropagation(), x();
										},
										type: "button",
										children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": n.running ? "loader-2" : "play" }), /* @__PURE__ */ (0, K.jsx)("span", { children: n.running ? "运行中" : "运行" })]
									}), /* @__PURE__ */ (0, K.jsxs)("button", {
										className: `prompt-node-pill prompt-node-control prompt-system-toggle ${n.llmSystemEnabled ? "active" : ""}`,
										disabled: p,
										onClick: (e) => {
											e.stopPropagation();
											let r = !n.llmSystemEnabled;
											l({
												llmSystemEnabled: r,
												h: Oi({
													...n,
													llmSystemEnabled: r
												}, t.length).height
											}, !0);
										},
										type: "button",
										children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": n.llmSystemEnabled ? "toggle-right" : "toggle-left" }), /* @__PURE__ */ (0, K.jsx)("span", { children: n.llmSystemEnabled ? "关闭 System" : "启用 System" })]
									})]
								}),
								n.llmSystemEnabled ? /* @__PURE__ */ (0, K.jsx)("textarea", {
									"aria-label": "System 提示词",
									className: "prompt-node-control prompt-llm-system",
									disabled: p,
									onBlur: () => l({}, !0),
									onChange: (e) => l({ llmSystemPrompt: e.target.value }),
									placeholder: "输入 System 提示词",
									value: String(n.llmSystemPrompt || "You are a helpful prompt assistant.")
								}) : null
							]
						})] }) : null
					]
				})
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "node-hint",
				children: "拖拽节点移动"
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "node-resize-handle",
				"data-resize": "1"
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: `node-port port-in ${e ? "port-hover" : ""}`,
				"data-port": "in",
				onClick: (e) => {
					e.stopPropagation(), r();
				},
				title: "输入"
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "node-port port-out",
				"data-port": "out",
				onPointerDown: (e) => {
					e.stopPropagation(), i();
				},
				title: "输出"
			})
		]
	});
}
//#endregion
//#region src/canvas/ui/canvas-board-v2.tsx
var Ni = 6e3, Pi = 4e3, Fi = "canvas_session_viewports_v1", Ii = [
	[
		"image",
		"上传节点",
		"image-plus"
	],
	[
		"prompt",
		"提示词",
		"text-cursor-input"
	],
	[
		"loop",
		"循环节点",
		"repeat-2"
	],
	[
		"llm",
		"LLM 节点",
		"message-square-text"
	],
	[
		"generator",
		"API生成",
		"wand-sparkles"
	],
	[
		"msgen",
		"ModelScope生成",
		"cloud-lightning"
	],
	[
		"video",
		"视频生成",
		"clapperboard"
	],
	[
		"comfy",
		"ComfyUI 生成",
		"workflow"
	],
	[
		"ltxDirector",
		"LTX Director",
		"film"
	],
	[
		"output",
		"Output",
		"circle-dot"
	]
], Li = {
	"smart-image": "Image",
	comfy: "ComfyUI",
	generator: "API 生成",
	group: "分组",
	image: "上传",
	llm: "LLM",
	loop: "循环",
	ltxDirector: "LTX Director",
	msgen: "ModelScope",
	output: "Output",
	prompt: "提示词",
	promptGroup: "提示词组",
	video: "视频"
};
function Ri() {
	return window.CanvasModernCore?.canvasRuntime ?? null;
}
function zi(e) {
	return {
		x: Number(e.x || 0),
		y: Number(e.y || 0)
	};
}
function Bi(e) {
	try {
		let t = JSON.parse(sessionStorage.getItem(Fi) || "{}")[e];
		return t ? {
			x: Number.isFinite(Number(t.x)) ? Number(t.x) : 0,
			y: Number.isFinite(Number(t.y)) ? Number(t.y) : 0,
			zoom: Math.min(1.5, Math.max(.25, Number(t.zoom || 1)))
		} : {
			x: 0,
			y: 0,
			zoom: 1
		};
	} catch {
		return {
			x: 0,
			y: 0,
			zoom: 1
		};
	}
}
function Vi(e, t) {
	if (e) try {
		let n = JSON.parse(sessionStorage.getItem(Fi) || "{}");
		n[e] = t, sessionStorage.setItem(Fi, JSON.stringify(n));
	} catch {}
}
function Hi(e, t) {
	return e.x <= t.x + t.width && e.x + e.width >= t.x && e.y <= t.y + t.height && e.y + e.height >= t.y;
}
function Ui(e) {
	if (e.type === "smart-image") {
		let t = ur(e);
		return {
			height: t.height,
			width: t.width
		};
	}
	if (e.type === "prompt") {
		let t = Oi(e);
		return {
			height: t.height,
			width: t.width
		};
	}
	if (e.type === "loop") return bi(e);
	let t = e.type === "image" ? {
		height: 336,
		width: 260
	} : e.type === "promptGroup" ? {
		height: 220,
		width: 260
	} : e.type === "generator" || e.type === "msgen" ? {
		height: 340,
		width: 380
	} : e.type === "output" ? {
		height: 320,
		width: 460
	} : e.type === "video" ? {
		height: 410,
		width: 400
	} : e.type === "comfy" ? {
		height: 460,
		width: 420
	} : e.type === "llm" ? {
		height: 590,
		width: 420
	} : e.type === "ltxDirector" ? {
		height: 800,
		width: 1e3
	} : e.type === "group" ? {
		height: 220,
		width: 300
	} : {
		height: 110,
		width: 240
	};
	return {
		height: Number(e.h || t.height),
		width: Number(e.w || t.width)
	};
}
function Wi(e) {
	return [
		"generator",
		"comfy",
		"ltxDirector",
		"output",
		"llm",
		"msgen",
		"smart-image",
		"video"
	].includes(e.type) || e.type === "loop" && (!!e.imageInput || !!e.showPrompt);
}
function Gi(e) {
	return [
		"image",
		"prompt",
		"loop",
		"group",
		"promptGroup",
		"generator",
		"comfy",
		"ltxDirector",
		"llm",
		"msgen",
		"smart-image",
		"video",
		"output"
	].includes(e.type);
}
function Ki(e) {
	let t = typeof e == "string" ? { url: e } : e && typeof e == "object" ? structuredClone(e) : null;
	return t ? ([
		"runPrompt",
		"runModelPrompt",
		"runSettings",
		"sourceNodeId",
		"runAt",
		"promptDraftHtml",
		"promptDraftText"
	].forEach((e) => delete t[e]), t) : null;
}
function qi(e, t) {
	let n = new Set(t), r = e.nodes.filter((e) => n.has(e.id) && Array.isArray(e.images) && e.images.length);
	if (r.length < 2) return null;
	let i = `smart_${crypto.randomUUID()}`, a = r.flatMap((e) => e.images.map(Ki).filter((e) => !!e)), o = {
		created_at: Date.now(),
		id: i,
		images: a,
		scale: .8,
		title: "Group",
		type: "smart-image",
		x: Math.min(...r.map((e) => Number(e.x || 0))),
		y: Math.min(...r.map((e) => Number(e.y || 0)))
	}, s = e.connections.map((e) => ({
		...e,
		from: n.has(e.from) ? i : e.from,
		to: n.has(e.to) ? i : e.to
	})), c = /* @__PURE__ */ new Set(), l = s.filter((e) => {
		let t = `${e.from}\u0000${e.to}\u0000${String(e.kind || "flow")}`;
		return e.from === e.to || c.has(t) ? !1 : (c.add(t), !0);
	});
	return {
		document: {
			...e,
			connections: l,
			nodes: [...e.nodes.filter((e) => !n.has(e.id)), o]
		},
		id: i
	};
}
function Ji(e, t) {
	let n = e.nodes.find((e) => e.id === t), r = Array.isArray(n?.images) ? n.images.map(Ki).filter((e) => !!e) : [];
	if (!n || r.length < 2) return null;
	let i = ur(n), a = Math.max(28, Math.round(i.thumb || 96)), o = r.map((e, t) => {
		let r = t % Math.max(1, i.cols || 1), o = Math.floor(t / Math.max(1, i.cols || 1)), s = Number(e.natural_w || e.width || e.w || 0), c = Number(e.natural_h || e.height || e.h || 0), l = s > 0 && c > 0 ? Math.min(a / s, a / c) : 1, u = s > 0 && c > 0 ? Math.max(28, Math.round(s * l)) : a, d = s > 0 && c > 0 ? Math.max(28, Math.round(c * l)) : a;
		return {
			created_at: Date.now(),
			h: d,
			id: `smart_${crypto.randomUUID()}`,
			images: [e],
			scale: 2,
			title: "Image",
			type: "smart-image",
			w: u,
			x: Math.round(Number(n.x || 0) + 16 + r * (a + 8) + Math.max(0, (a - u) / 2)),
			y: Math.round(Number(n.y || 0) + 16 + o * (a + 8) + Math.max(0, (a - d) / 2))
		};
	}), s = o.map((e) => e.id), c = e.nodes.filter((e) => e.id !== t).map((e) => Array.isArray(e.inputNodeIds) ? {
		...e,
		inputNodeIds: e.inputNodeIds.filter((e) => String(e) !== t)
	} : e);
	return {
		document: {
			...e,
			connections: e.connections.filter((e) => e.from !== t && e.to !== t),
			nodes: [...c, ...o]
		},
		ids: s
	};
}
function Yi(e) {
	let t = e.runSettings && typeof e.runSettings == "object" ? e.runSettings : {}, n = String(t.engine || "api"), r = n === "modelscope" ? "msgen" : n === "comfy" ? "comfy" : String(t.apiKind || t.kind || "image") === "video" ? "video" : "generator";
	return {
		...t,
		id: e.id,
		type: r,
		apiProvider: t.apiProvider || t.provider_id || t.providerId || "",
		model: t.model || "",
		ratio: t.ratio || t.apiRatio || "square",
		resolution: t.resolution || t.apiResolution || "1k",
		running: e.running
	};
}
function Xi({ commit: e, node: t, onOpenPreset: n, onOpenTemplate: r, store: i }) {
	let a = String(t.text || "");
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "prompt-editor",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [/* @__PURE__ */ (0, K.jsxs)("div", {
			className: "prompt-toolbar",
			children: [
				/* @__PURE__ */ (0, K.jsx)("button", {
					className: "prompt-template-btn prompt-preset-edit",
					onClick: () => r ? r(t.id) : window.CanvasBoardV2?.openPromptTemplates(t.id),
					type: "button",
					children: "模板"
				}),
				n ? /* @__PURE__ */ (0, K.jsx)("button", {
					className: "prompt-template-btn prompt-preset-save",
					onClick: () => n(t.id),
					type: "button",
					children: "预设"
				}) : null,
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: `prompt-counter ${a.length > 2e4 ? "over" : ""}`,
					children: [/* @__PURE__ */ (0, K.jsx)("span", { children: a.length.toLocaleString() }), /* @__PURE__ */ (0, K.jsx)("span", { children: "/ 20,000" })]
				})
			]
		}), /* @__PURE__ */ (0, K.jsx)("textarea", {
			"data-field": "text",
			maxLength: 2e4,
			onBlur: e,
			onChange: (e) => i.getState().updateNode(t.id, { text: e.target.value }),
			placeholder: "输入提示词",
			value: a
		})]
	});
}
function Zi({ node: e, nodesById: t }) {
	let n = Array.isArray(e.items) ? e.items.map((e) => t.get(String(e))).filter((e) => e?.type === "prompt") : [];
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "text-[11px] text-gray-400",
		"data-prompt-count": n.length,
		children: [n.length, " 个提示词已分组"]
	});
}
function Qi({ commit: e, node: t, store: n }) {
	let r = Math.max(1, Math.min(100, Number(t.count || 1))), i = Math.max(1, Number(t.loopStart || 1)), a = Math.max(1, Math.min(100, Number(t.imageBatchSize || 1))), o = (r, i = !1) => {
		n.getState().updateNode(t.id, r), i && e();
	}, s = (e) => {
		let n = e === "showPrompt" ? !t.showPrompt : !!t.showPrompt, r = e === "imageInput" ? !t.imageInput : !!t.imageInput, i = Number(n) + Number(r);
		o({
			[e]: e === "showPrompt" ? n : r,
			w: Math.max(336, Number(t.w || 0)),
			h: i === 0 ? void 0 : i === 1 ? n ? 330 : 320 : 390
		}, !0);
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "loop-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "loop-count-row",
				children: [/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "loop-run-row",
					children: [/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "loop-count-group",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "loop-count-label",
							children: "循环次数"
						}), /* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "循环次数",
							className: "loop-count-input",
							max: "100",
							min: "1",
							onBlur: e,
							onChange: (e) => o({ count: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }),
							type: "number",
							value: r
						})]
					}), /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "seg loop-mode",
						children: [/* @__PURE__ */ (0, K.jsx)("button", {
							className: t.mode === "parallel" ? "" : "active",
							onClick: () => o({ mode: "serial" }, !0),
							type: "button",
							children: "串行"
						}), /* @__PURE__ */ (0, K.jsx)("button", {
							className: t.mode === "parallel" ? "active" : "",
							onClick: () => o({ mode: "parallel" }, !0),
							type: "button",
							children: "并行"
						})]
					})]
				}), /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "loop-toggle-row",
					children: [/* @__PURE__ */ (0, K.jsx)("button", {
						className: `loop-toggle loop-image-toggle ${t.imageInput ? "active" : ""}`,
						onClick: () => s("imageInput"),
						type: "button",
						children: "图片输入"
					}), /* @__PURE__ */ (0, K.jsx)("button", {
						className: `loop-toggle loop-prompt-toggle ${t.showPrompt ? "active" : ""}`,
						onClick: () => s("showPrompt"),
						type: "button",
						children: "提示词输入"
					})]
				})]
			}),
			t.imageInput ? /* @__PURE__ */ (0, K.jsx)("div", {
				className: "loop-image-panel",
				children: /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "loop-image-row",
					children: [
						/* @__PURE__ */ (0, K.jsx)("span", {
							className: "loop-count-label",
							children: "起始"
						}),
						/* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "图片起始序号",
							className: "loop-count-input",
							min: "1",
							onBlur: e,
							onChange: (e) => o({ loopStart: Math.max(1, Number(e.target.value) || 1) }),
							type: "number",
							value: i
						}),
						/* @__PURE__ */ (0, K.jsx)("span", {
							className: "loop-count-label",
							children: "批量"
						}),
						/* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "图片批量大小",
							className: "loop-count-input",
							max: "100",
							min: "1",
							onBlur: e,
							onChange: (e) => o({ imageBatchSize: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }),
							type: "number",
							value: a
						})
					]
				})
			}) : null,
			t.showPrompt ? /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "loop-prompt-panel",
				children: [/* @__PURE__ */ (0, K.jsx)("div", {
					className: "loop-field",
					children: /* @__PURE__ */ (0, K.jsx)("textarea", {
						"aria-label": "循环变量提示词",
						onBlur: e,
						onChange: (e) => o({ variablePrompt: e.target.value }),
						placeholder: "每轮变化的提示词",
						value: String(t.variablePrompt || "")
					})
				}), /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "loop-start-row",
					children: [
						/* @__PURE__ */ (0, K.jsx)("button", {
							className: "loop-token-btn loop-counter-token-btn",
							onClick: () => o({ variablePrompt: `${String(t.variablePrompt || "")}《计数》` }, !0),
							type: "button",
							children: "计数"
						}),
						/* @__PURE__ */ (0, K.jsx)("span", {
							className: "loop-count-label",
							children: "起始"
						}),
						/* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "提示词起始序号",
							className: "loop-count-input",
							min: "1",
							onBlur: e,
							onChange: (e) => o({ loopStart: Math.max(1, Number(e.target.value) || 1) }),
							type: "number",
							value: i
						})
					]
				})]
			}) : null
		]
	});
}
var $i = [
	["square", "1:1"],
	["portrait", "2:3"],
	["landscape", "3:2"],
	["portrait43", "3:4"],
	["landscape43", "4:3"],
	["story", "9:16"],
	["wide", "16:9"],
	["ultrawide", "21:9"],
	["ultratall", "9:21"],
	["source", "自适应"],
	["custom", "自定义"]
], ea = [
	["1k", "1K"],
	["2k", "2K"],
	["4k", "4K"],
	["custom", "自定义"]
];
function ta({ ariaLabel: e, onChange: t, options: n, value: r }) {
	return /* @__PURE__ */ (0, K.jsxs)("select", {
		"aria-label": e,
		className: "select-lite",
		onChange: (e) => t(e.target.value),
		value: r,
		children: [!n.some(([e]) => e === r) && r ? /* @__PURE__ */ (0, K.jsx)("option", {
			value: r,
			children: r
		}) : null, n.map(([e, t]) => /* @__PURE__ */ (0, K.jsx)("option", {
			value: e,
			children: t
		}, e))]
	});
}
function na({ label: e = "运行", mode: t, node: n }) {
	let [r, i] = (0, G.useState)(!1);
	return /* @__PURE__ */ (0, K.jsx)("button", {
		className: `gen-btn ${r || n.running ? "running" : ""}`,
		disabled: r || !!n.running,
		onClick: async () => {
			i(!0);
			try {
				await window.CanvasBoardV2?.runNode(n.id, t);
			} catch (e) {
				window.alert(e instanceof Error ? e.message : String(e));
			} finally {
				i(!1);
			}
		},
		type: "button",
		children: r || n.running ? "运行中…" : e
	});
}
var ra = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"video",
	"comfy",
	"llm",
	"ltxDirector"
]);
function ia(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = /* @__PURE__ */ new Set(), i = e.connections.filter((e) => e.to === t).map((e) => e.from);
	for (; i.length;) {
		let t = i.pop();
		if (!r.has(t)) {
			if (r.add(t), ra.has(n.get(t)?.type || "")) return !0;
			e.connections.filter((e) => e.to === t).forEach((e) => i.push(e.from));
		}
	}
	return !1;
}
function aa({ document: e, node: t }) {
	let n = ia(e, t.id), r = t.runStatus === "failed" && !!t._cascadeFailed;
	return /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsxs)("div", {
		className: "gen-run-row",
		children: [
			/* @__PURE__ */ (0, K.jsx)(na, { node: t }),
			n ? /* @__PURE__ */ (0, K.jsx)(na, {
				label: "一键运行",
				mode: "cascade",
				node: t
			}) : null,
			t.running ? /* @__PURE__ */ (0, K.jsx)("button", {
				className: "node-stop-btn",
				onClick: () => void window.CanvasBoardV2?.controlExecution("stop-execution", t.id),
				type: "button",
				children: "停止"
			}) : null
		]
	}), r ? /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "node-retry-bar",
		children: [
			/* @__PURE__ */ (0, K.jsx)("span", {
				className: "node-retry-msg",
				title: String(t.runError || ""),
				children: String(t.runError || "生成失败").slice(0, 60)
			}),
			/* @__PURE__ */ (0, K.jsx)("button", {
				className: "node-retry-btn",
				onClick: () => void window.CanvasBoardV2?.controlExecution("retry-execution", t.id),
				type: "button",
				children: "重试"
			}),
			/* @__PURE__ */ (0, K.jsx)("button", {
				className: "node-stop-btn",
				onClick: () => void window.CanvasBoardV2?.controlExecution("stop-execution", t.id),
				type: "button",
				children: "停止"
			})
		]
	}) : null] });
}
function oa(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e]));
	return e.connections.filter((e) => e.to === t.id).map((e) => n.get(e.from)).filter(Boolean).flatMap((e) => e.type === "image" && e.url ? [{
		kind: String(e.mediaKind || "image"),
		name: String(e.name || ""),
		url: String(e.url)
	}] : e.type === "output" && Array.isArray(e.images) ? e.images.map((e) => typeof e == "string" ? {
		kind: "image",
		name: "",
		url: e
	} : {
		kind: String(e.kind || "image"),
		name: String(e.name || ""),
		url: String(e.url || "")
	}).filter((e) => e.url) : e.type === "smart-image" ? fr(e).map((e) => ({
		...e,
		kind: String(e.kind || "image"),
		name: String(e.name || ""),
		url: String(e.url || "")
	})) : e.type === "group" && Array.isArray(e.items) ? e.items.map((e) => n.get(String(e))).filter((e) => e?.type === "image" && e.url).map((e) => ({
		kind: String(e.mediaKind || "image"),
		name: String(e.name || ""),
		url: String(e.url)
	})) : []);
}
function sa(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e]));
	return e.connections.filter((e) => e.to === t.id).map((e) => n.get(e.from)).filter(Boolean).flatMap((e) => e?.type === "prompt" ? String(e.text || "").trim() ? [String(e.text).trim()] : [] : e?.type === "loop" && vi(e, [], Math.max(1, Number(e.loopStart || 1))) || []);
}
async function ca(e) {
	return new Promise((t, n) => {
		let r = new Image();
		r.onload = () => t({
			height: r.naturalHeight,
			width: r.naturalWidth
		}), r.onerror = () => n(/* @__PURE__ */ Error("无法读取参考图尺寸")), r.src = e;
	});
}
function la({ document: e, node: t }) {
	let n = e.connections.filter((e) => e.to === t.id).map((t) => e.nodes.find((e) => e.id === t.from)).filter(Boolean).filter((e) => [
		"prompt",
		"promptGroup",
		"loop",
		"llm"
	].includes(e.type)).length, r = oa(e, t);
	return /* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsxs)("div", {
		className: "text-[10px] text-gray-400",
		children: [
			"提示词 ",
			n,
			" · 图片/媒体 ",
			r.length
		]
	}), r.length ? /* @__PURE__ */ (0, K.jsx)("div", {
		className: "input-list mt-1",
		children: r.slice(0, 8).map((e, t) => /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "input-item",
			children: [e.kind === "video" ? /* @__PURE__ */ (0, K.jsx)("video", {
				muted: !0,
				preload: "metadata",
				src: e.url
			}) : /* @__PURE__ */ (0, K.jsx)("img", {
				alt: e.name || `参考 ${t + 1}`,
				src: e.url
			}), /* @__PURE__ */ (0, K.jsx)("span", {
				className: "input-index",
				children: t + 1
			})]
		}, `${e.url}-${t}`))
	}) : null] });
}
function ua({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = (Ri()?.getNodeOptions("generator", "provider", n) ?? []).map((e) => [e.value, e.label]), o = (Ri()?.getNodeOptions("generator", "model", n) ?? []).map((e) => [e.value, e.label]), s = String(n.apiProvider || a[0]?.[0] || ""), c = async () => {
		let e = oa(t, n).find((e) => e.kind !== "video" && e.kind !== "audio");
		if (!e) throw Error("请先连接一张参考图");
		let r = await ca(e.url);
		i({
			fitImage: !0,
			resolution: "custom",
			customWidth: r.width,
			customHeight: r.height,
			customSize: `${r.width}x${r.height}`
		});
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, K.jsx)(la, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, K.jsx)(ta, {
							ariaLabel: "图片平台",
							onChange: (e) => {
								let t = Ri()?.getNodeOptions("generator", "model", {
									...n,
									apiProvider: e
								}) ?? [];
								i({
									apiProvider: e,
									model: t[0]?.value || ""
								});
							},
							options: a,
							value: s
						}), /* @__PURE__ */ (0, K.jsx)(ta, {
							ariaLabel: "图片模型",
							onChange: (e) => i({ model: e }),
							options: o,
							value: String(n.model || "")
						})]
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, K.jsx)(ta, {
								ariaLabel: "分辨率",
								onChange: (e) => i({
									resolution: e,
									...e === "custom" ? { ratio: "" } : {}
								}),
								options: ea,
								value: String(n.resolution || "1k")
							}),
							/* @__PURE__ */ (0, K.jsx)(ta, {
								ariaLabel: "比例",
								onChange: (e) => i({ ratio: e }),
								options: $i,
								value: String(n.ratio || "square")
							}),
							/* @__PURE__ */ (0, K.jsx)(ta, {
								ariaLabel: "质量",
								onChange: (e) => i({ quality: e }),
								options: [
									"auto",
									"low",
									"medium",
									"high"
								].map((e) => [e, `Q ${e}`]),
								value: String(n.quality || "auto")
							}),
							/* @__PURE__ */ (0, K.jsx)("input", {
								"aria-label": "生成数量",
								className: "gen-count-input",
								max: "8",
								min: "1",
								onBlur: e,
								onChange: (e) => r.getState().updateNode(n.id, { count: Math.max(1, Math.min(8, Number(e.target.value) || 1)) }),
								type: "number",
								value: Math.max(1, Math.min(8, Number(n.count || 1)))
							})
						]
					}),
					n.ratio === "custom" ? /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "比例宽",
							className: "setting-input",
							min: "1",
							onBlur: e,
							onChange: (e) => r.getState().updateNode(n.id, {
								customRatioWidth: e.target.value,
								customRatio: `${e.target.value}:${String(n.customRatioHeight || "")}`
							}),
							type: "number",
							value: String(n.customRatioWidth || "")
						}), /* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "比例高",
							className: "setting-input",
							min: "1",
							onBlur: e,
							onChange: (e) => r.getState().updateNode(n.id, {
								customRatioHeight: e.target.value,
								customRatio: `${String(n.customRatioWidth || "")}:${e.target.value}`
							}),
							type: "number",
							value: String(n.customRatioHeight || "")
						})]
					}) : null,
					n.resolution === "custom" ? /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, K.jsx)("input", {
								"aria-label": "自定义宽度",
								className: "setting-input",
								min: "64",
								onBlur: e,
								onChange: (e) => r.getState().updateNode(n.id, {
									customWidth: e.target.value,
									customSize: `${e.target.value}x${String(n.customHeight || "")}`
								}),
								step: "64",
								type: "number",
								value: String(n.customWidth || "")
							}),
							/* @__PURE__ */ (0, K.jsx)("input", {
								"aria-label": "自定义高度",
								className: "setting-input",
								min: "64",
								onBlur: e,
								onChange: (e) => r.getState().updateNode(n.id, {
									customHeight: e.target.value,
									customSize: `${String(n.customWidth || "")}x${e.target.value}`
								}),
								step: "64",
								type: "number",
								value: String(n.customHeight || "")
							}),
							/* @__PURE__ */ (0, K.jsx)("button", {
								className: "secondary-btn",
								onClick: () => void c().catch((e) => window.alert(e.message)),
								type: "button",
								children: "适配参考图"
							})
						]
					}) : null
				]
			}),
			/* @__PURE__ */ (0, K.jsx)(aa, {
				document: t,
				node: n
			})
		]
	});
}
function da({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = (Ri()?.getNodeOptions("msgen", "model", n) ?? []).map((e) => [e.value, e.label]), o = (Ri()?.getNodeOptions("msgen", "custom-model", n) ?? []).map((e) => [e.value, e.label]), s = Ri()?.getNodeOptions("msgen", "lora", n) ?? [], c = s.find((e) => e.value === n.msLoraId) ?? s[0], l = async () => {
		let e = oa(t, n).find((e) => e.kind !== "video" && e.kind !== "audio");
		if (!e) throw Error("请先连接一张参考图");
		let r = await ca(e.url);
		i({
			fitImage: !0,
			msResolution: "custom",
			msCustomWidth: r.width,
			msCustomHeight: r.height,
			msCustomSize: `${r.width}x${r.height}`
		});
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, K.jsx)(la, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "ms-model-tabs",
				children: a.map(([e, t]) => /* @__PURE__ */ (0, K.jsx)("button", {
					className: n.msgenModel === e ? "active" : "",
					onClick: () => i({
						msgenModel: e,
						msLoraEnabled: !1,
						msLoraId: ""
					}),
					type: "button",
					children: t
				}, e))
			}),
			n.msgenModel === "custom" ? /* @__PURE__ */ (0, K.jsx)(ta, {
				ariaLabel: "ModelScope 模型",
				onChange: (e) => i({
					msCustomModel: e,
					msLoraEnabled: !1,
					msLoraId: ""
				}),
				options: o,
				value: String(n.msCustomModel || o[0]?.[0] || "")
			}) : null,
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, K.jsx)(ta, {
								ariaLabel: "ModelScope 分辨率",
								onChange: (e) => i({
									msResolution: e,
									...e === "custom" ? { msRatio: "" } : {}
								}),
								options: ea,
								value: String(n.msResolution || "1k")
							}),
							/* @__PURE__ */ (0, K.jsx)(ta, {
								ariaLabel: "ModelScope 比例",
								onChange: (e) => i({ msRatio: e }),
								options: $i.filter(([e]) => e !== "source"),
								value: String(n.msRatio || "square")
							}),
							/* @__PURE__ */ (0, K.jsx)("input", {
								"aria-label": "ModelScope 生成数量",
								className: "gen-count-input",
								max: "8",
								min: "1",
								onBlur: e,
								onChange: (e) => r.getState().updateNode(n.id, { count: Math.max(1, Math.min(8, Number(e.target.value) || 1)) }),
								type: "number",
								value: Math.max(1, Math.min(8, Number(n.count || 1)))
							})
						]
					}),
					n.msRatio === "custom" ? /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "ModelScope 比例宽",
							className: "setting-input",
							min: "1",
							onBlur: e,
							onChange: (e) => r.getState().updateNode(n.id, {
								msCustomRatioWidth: e.target.value,
								msCustomRatio: `${e.target.value}:${String(n.msCustomRatioHeight || "")}`
							}),
							type: "number",
							value: String(n.msCustomRatioWidth || "")
						}), /* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "ModelScope 比例高",
							className: "setting-input",
							min: "1",
							onBlur: e,
							onChange: (e) => r.getState().updateNode(n.id, {
								msCustomRatioHeight: e.target.value,
								msCustomRatio: `${String(n.msCustomRatioWidth || "")}:${e.target.value}`
							}),
							type: "number",
							value: String(n.msCustomRatioHeight || "")
						})]
					}) : null,
					n.msResolution === "custom" ? /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, K.jsx)("input", {
								"aria-label": "ModelScope 自定义宽度",
								className: "setting-input",
								min: "64",
								onBlur: e,
								onChange: (e) => r.getState().updateNode(n.id, {
									msCustomWidth: e.target.value,
									msCustomSize: `${e.target.value}x${String(n.msCustomHeight || "")}`
								}),
								step: "64",
								type: "number",
								value: String(n.msCustomWidth || "")
							}),
							/* @__PURE__ */ (0, K.jsx)("input", {
								"aria-label": "ModelScope 自定义高度",
								className: "setting-input",
								min: "64",
								onBlur: e,
								onChange: (e) => r.getState().updateNode(n.id, {
									msCustomHeight: e.target.value,
									msCustomSize: `${String(n.msCustomWidth || "")}x${e.target.value}`
								}),
								step: "64",
								type: "number",
								value: String(n.msCustomHeight || "")
							}),
							/* @__PURE__ */ (0, K.jsx)("button", {
								className: "secondary-btn",
								onClick: () => void l().catch((e) => window.alert(e.message)),
								type: "button",
								children: "适配参考图"
							})
						]
					}) : null,
					s.length ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("button", {
						className: `setting-check ${n.msLoraEnabled ? "active" : ""}`,
						onClick: () => i({
							msLoraEnabled: !n.msLoraEnabled,
							...n.msLoraEnabled ? {} : {
								msLoraId: c?.value || "",
								msLoraStrength: Number(c?.meta?.strength ?? .8)
							}
						}),
						type: "button",
						children: "启用 LoRA"
					}), n.msLoraEnabled ? /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, K.jsx)(ta, {
							ariaLabel: "ModelScope LoRA",
							onChange: (e) => {
								let t = s.find((t) => t.value === e);
								i({
									msLoraId: e,
									msLoraStrength: Number(t?.meta?.strength ?? n.msLoraStrength ?? .8)
								});
							},
							options: s.map((e) => [e.value, e.label]),
							value: String(n.msLoraId || c?.value || "")
						}), /* @__PURE__ */ (0, K.jsxs)("label", {
							className: "field",
							children: [/* @__PURE__ */ (0, K.jsxs)("span", {
								className: "setting-title",
								children: ["LoRA 强度 ", Number(n.msLoraStrength ?? .8).toFixed(2)]
							}), /* @__PURE__ */ (0, K.jsx)("input", {
								"aria-label": "LoRA 强度",
								className: "canvas-range",
								max: "1",
								min: "0.1",
								onChange: (e) => r.getState().updateNode(n.id, { msLoraStrength: Number(e.target.value) }),
								onPointerUp: e,
								step: "0.05",
								type: "range",
								value: Number(n.msLoraStrength ?? .8)
							})]
						})]
					}) : null] }) : /* @__PURE__ */ (0, K.jsx)("div", {
						className: "text-[11px] text-gray-400",
						children: "当前模型没有绑定 LoRA"
					})
				]
			}),
			/* @__PURE__ */ (0, K.jsx)(aa, {
				document: t,
				node: n
			})
		]
	});
}
function fa({ commit: e, node: t, store: n }) {
	let r = Array.isArray(t.images) ? t.images : [], i = Array.isArray(t._pending) ? t._pending : [], a = (e) => typeof e == "string" ? e : String(e?.url || ""), o = (i) => {
		n.getState().updateNode(t.id, { images: r.filter((e) => a(e) !== i) }), e();
	}, s = (e) => window.CanvasBoardV2?.openOutputLightbox(t, e), c = (r) => {
		let a = String(r.run?.node?.id || r.nodeId || "");
		n.getState().updateNode(t.id, { _pending: i.filter((e) => e !== r) }), e(), a && window.CanvasBoardV2?.runNode(a);
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "output-grid",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [r.map((e, t) => {
			let n = a(e), r = String(e?.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(n) ? "video" : /\.(mp3|wav|m4a)(\?|$)/i.test(n) ? "audio" : "image")), i = String(e.name || n.split(/[?#]/, 1)[0].split("/").pop() || `生成结果 ${t + 1}`);
			return /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "output-img-wrap",
				"data-output-url": n,
				children: [
					r === "video" ? /* @__PURE__ */ (0, K.jsx)("video", {
						controls: !0,
						onDoubleClick: () => s(n),
						preload: "metadata",
						src: n
					}) : r === "audio" ? /* @__PURE__ */ (0, K.jsx)("audio", {
						controls: !0,
						preload: "metadata",
						src: n
					}) : /* @__PURE__ */ (0, K.jsx)("img", {
						alt: "generated output",
						draggable: !0,
						onClick: () => s(n),
						onDragStart: (e) => {
							e.dataTransfer.effectAllowed = "copy", e.dataTransfer.setData("application/x-canvas-output-image", JSON.stringify({
								kind: r,
								name: i,
								url: n
							})), e.dataTransfer.setData("text/uri-list", n);
						},
						src: n
					}),
					/* @__PURE__ */ (0, K.jsx)("button", {
						"aria-label": "保存到资产库",
						className: "output-save",
						onClick: () => window.openCanvasAssetLibrary?.({ saveItem: {
							kind: r,
							name: i,
							url: n
						} }),
						type: "button",
						children: "存"
					}),
					/* @__PURE__ */ (0, K.jsx)("a", {
						className: "output-download",
						download: !0,
						href: n,
						onClick: (e) => e.stopPropagation(),
						children: "↓"
					}),
					/* @__PURE__ */ (0, K.jsx)("button", {
						"aria-label": "删除输出",
						className: "output-del",
						onClick: () => o(n),
						type: "button",
						children: "×"
					})
				]
			}, `${n}-${t}`);
		}), i.map((e, t) => {
			let n = String(e.recoveryStatus || ""), r = !!e.failed || [
				"interrupted",
				"failed",
				"cancelled"
			].includes(n), i = n === "recovering" ? "正在恢复任务…" : n === "interrupted" ? "任务追踪已中断" : n === "cancelled" ? "任务已取消" : String(n === "failed" ? e.recoveryError || "任务失败" : e.label || e.status || "正在生成…");
			return /* @__PURE__ */ (0, K.jsxs)("div", {
				className: `output-pending ${r ? "failed" : ""}`,
				"data-pending-id": String(e.id || ""),
				children: [
					/* @__PURE__ */ (0, K.jsx)("span", { className: "pending-spinner" }),
					/* @__PURE__ */ (0, K.jsx)("span", { children: i }),
					e.canvasTaskId ? /* @__PURE__ */ (0, K.jsx)("small", { children: String(e.canvasTaskId) }) : null,
					r ? /* @__PURE__ */ (0, K.jsx)("button", {
						onClick: () => c(e),
						type: "button",
						children: "重新生成"
					}) : null
				]
			}, String(e.id || t));
		})]
	});
}
function pa({ commit: e, document: t, node: n, store: r }) {
	let [i, a] = (0, G.useState)(String(n.manualVideoUrl || (Array.isArray(n.manualVideoUrls) ? n.manualVideoUrls[0] : "") || "")), [o, s] = (0, G.useState)(!1), c = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, l = (Ri()?.getNodeOptions("video", "provider", n) ?? []).map((e) => [e.value, e.label]), u = (Ri()?.getNodeOptions("video", "model", n) ?? []).map((e) => [e.value, e.label]);
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, K.jsx)(la, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "video-input-actions",
				children: [
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": "视频手动 URL",
						className: "setting-input",
						onChange: (e) => a(e.target.value),
						placeholder: "https://… 或 asset://…",
						value: i
					}),
					/* @__PURE__ */ (0, K.jsx)("button", {
						className: "tool-btn",
						disabled: o,
						onClick: async () => {
							s(!0);
							try {
								await window.CanvasBoardV2?.prepareVideoMedia(n.id, "manual", i);
							} catch (e) {
								window.alert(e instanceof Error ? e.message : String(e));
							} finally {
								s(!1);
							}
						},
						type: "button",
						children: "应用网址"
					}),
					/* @__PURE__ */ (0, K.jsx)("button", {
						className: "tool-btn",
						disabled: o,
						onClick: async () => {
							s(!0);
							try {
								await window.CanvasBoardV2?.prepareVideoMedia(n.id, "cloud");
							} catch (e) {
								window.alert(e instanceof Error ? e.message : String(e));
							} finally {
								s(!1);
							}
						},
						type: "button",
						children: o ? "处理中…" : "上传云端"
					})
				]
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, K.jsx)(ta, {
							ariaLabel: "视频平台",
							onChange: (e) => {
								let t = Ri()?.getNodeOptions("video", "model", {
									...n,
									apiProvider: e
								}) ?? [];
								c({
									apiProvider: e,
									model: t[0]?.value || ""
								});
							},
							options: l,
							value: String(n.apiProvider || l[0]?.[0] || "")
						}), /* @__PURE__ */ (0, K.jsx)(ta, {
							ariaLabel: "视频模型",
							onChange: (e) => c({ model: e }),
							options: u,
							value: String(n.model || "")
						})]
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, K.jsx)("input", {
								"aria-label": "视频时长",
								className: "setting-input",
								max: "60",
								min: "-1",
								onBlur: e,
								onChange: (e) => r.getState().updateNode(n.id, { duration: Math.max(-1, Math.min(60, Number(e.target.value) || 5)) }),
								type: "number",
								value: Number(n.duration ?? 5)
							}),
							/* @__PURE__ */ (0, K.jsx)(ta, {
								ariaLabel: "视频比例",
								onChange: (e) => c({ aspectRatio: e }),
								options: [
									"16:9",
									"9:16",
									"1:1",
									"4:3",
									"3:4",
									"21:9",
									"9:21",
									"keep_ratio",
									"adaptive"
								].map((e) => [e, e]),
								value: String(n.aspectRatio || "16:9")
							}),
							/* @__PURE__ */ (0, K.jsx)(ta, {
								ariaLabel: "视频分辨率",
								onChange: (e) => c({ resolution: e }),
								options: [
									"",
									"480p",
									"720p",
									"1080p",
									"780P"
								].map((e) => [e, e || "Auto"]),
								value: String(n.resolution || "")
							}),
							/* @__PURE__ */ (0, K.jsx)(ta, {
								ariaLabel: "视频任务模式",
								onChange: (e) => c({ taskMode: e }),
								options: [
									["auto", "自动"],
									["edit", "编辑"],
									["extend_backward", "向后延长"],
									["extend_forward", "向前延长"]
								],
								value: String(n.taskMode || "auto")
							})
						]
					}),
					/* @__PURE__ */ (0, K.jsx)("div", {
						className: "gen-settings-row",
						style: { flexWrap: "wrap" },
						children: [
							["enhancePrompt", "增强提示词"],
							["enableUpsample", "超分辨率"],
							["watermark", "水印"],
							["cameraFixed", "固定镜头"],
							["generateAudio", "生成音频"],
							["multimodal", "多模态"],
							["useFrameRoles", "首尾帧"]
						].map(([e, t]) => /* @__PURE__ */ (0, K.jsxs)("button", {
							className: `setting-check ${n[e] ? "active" : ""}`,
							onClick: () => c({
								[e]: !n[e],
								...e === "multimodal" && !n[e] ? { useFrameRoles: !1 } : e === "useFrameRoles" && !n[e] ? { multimodal: !1 } : {}
							}),
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("span", { className: "check-dot" }), t]
						}, e))
					})
				]
			}),
			/* @__PURE__ */ (0, K.jsx)(aa, {
				document: t,
				node: n
			})
		]
	});
}
function ma({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = (Ri()?.getNodeOptions("llm", "provider", n) ?? []).map((e) => [e.value, e.label]), o = (Ri()?.getNodeOptions("llm", "model", n) ?? []).map((e) => [e.value, e.label]), s = Array.isArray(n.messages) ? n.messages : [];
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "llm-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "llm-row",
				children: [
					/* @__PURE__ */ (0, K.jsx)(ta, {
						ariaLabel: "LLM 平台",
						onChange: (e) => {
							let t = Ri()?.getNodeOptions("llm", "model", {
								...n,
								llmProvider: e
							}) ?? [];
							i({
								llmProvider: e,
								model: t[0]?.value || ""
							});
						},
						options: a,
						value: String(n.llmProvider || a[0]?.[0] || "")
					}),
					/* @__PURE__ */ (0, K.jsx)(ta, {
						ariaLabel: "LLM 模型",
						onChange: (e) => i({
							model: e,
							...n.llmProvider === "modelscope" ? { llmMsModel: e } : {}
						}),
						options: o,
						value: String(n.model || "")
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "llm-mode",
						children: [/* @__PURE__ */ (0, K.jsx)("button", {
							className: n.mode === "chat" ? "" : "active",
							onClick: () => i({ mode: "node" }),
							type: "button",
							children: "节点"
						}), /* @__PURE__ */ (0, K.jsx)("button", {
							className: n.mode === "chat" ? "active" : "",
							onClick: () => i({ mode: "chat" }),
							type: "button",
							children: "聊天"
						})]
					}),
					/* @__PURE__ */ (0, K.jsx)("button", {
						className: `llm-sys-toggle ${n.showSystem ? "active" : ""}`,
						onClick: () => i({ showSystem: !n.showSystem }),
						type: "button",
						children: "System"
					})
				]
			}),
			/* @__PURE__ */ (0, K.jsx)(la, {
				document: t,
				node: n
			}),
			n.showSystem ? /* @__PURE__ */ (0, K.jsx)("textarea", {
				"aria-label": "系统提示词",
				className: "llm-system",
				onBlur: e,
				onChange: (e) => r.getState().updateNode(n.id, { systemPrompt: e.target.value }),
				value: String(n.systemPrompt || "")
			}) : null,
			n.mode === "chat" ? /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "llm-chat-pane",
				children: [
					/* @__PURE__ */ (0, K.jsx)("div", {
						className: "llm-chat-log",
						children: s.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("div", {
							className: `llm-bubble ${e.role === "user" ? "user" : "assistant"}`,
							children: [e.content, e.role === "assistant" ? /* @__PURE__ */ (0, K.jsx)("button", {
								"aria-label": `复制消息 ${t + 1}`,
								className: "llm-bubble-copy",
								onClick: () => void navigator.clipboard.writeText(String(e.content || "")),
								type: "button",
								children: "复制"
							}) : null]
						}, t))
					}),
					/* @__PURE__ */ (0, K.jsx)("textarea", {
						"aria-label": "聊天输入",
						className: "llm-chat-input",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { chatInput: e.target.value }),
						onKeyDown: (e) => {
							e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), window.CanvasBoardV2?.runNode(n.id, "chat"));
						},
						value: String(n.chatInput || "")
					}),
					/* @__PURE__ */ (0, K.jsx)(na, {
						label: "发送",
						mode: "chat",
						node: n
					})
				]
			}) : /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "llm-node-pane",
				children: [
					/* @__PURE__ */ (0, K.jsx)("div", {
						className: "llm-pane-label",
						children: "Input"
					}),
					/* @__PURE__ */ (0, K.jsx)("textarea", {
						"aria-label": "LLM 输入",
						className: "llm-input-area llm-input-output",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { userInput: e.target.value }),
						value: String(n.userInput || "")
					}),
					/* @__PURE__ */ (0, K.jsx)("div", {
						className: "llm-pane-label",
						children: "Output"
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "llm-output-wrap",
						children: [/* @__PURE__ */ (0, K.jsx)("button", {
							"aria-label": "复制 LLM 输出",
							className: "llm-copy-btn",
							onClick: () => navigator.clipboard.writeText(String(n.outputText || "")),
							type: "button",
							children: "复制"
						}), /* @__PURE__ */ (0, K.jsx)("div", {
							className: "llm-output",
							children: String(n.outputText || "暂无输出")
						})]
					}),
					/* @__PURE__ */ (0, K.jsx)(aa, {
						document: t,
						node: n
					})
				]
			})
		]
	});
}
function ha(e) {
	return e.type === "image" || e.type === "video" || e.type === "audio" ? e.type : e.type === "textarea" || /prompt|text|提示词|正向|负向/i.test(`${e.input || ""} ${e.name || ""}`) ? "prompt" : "setting";
}
function ga({ commit: e, document: t, node: n, store: r }) {
	let [i, a] = (0, G.useState)([]), o = String(n.comfyWorkflow || "");
	(0, G.useEffect)(() => {
		let e = !0;
		if (n.mode !== "custom" || !o) {
			a([]);
			return;
		}
		return (Ri()?.getComfyFields(o) ?? Promise.resolve([])).then((t) => {
			e && a(t);
		}), () => {
			e = !1;
		};
	}, [n.mode, o]);
	let s = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, c = n.comfyParams && typeof n.comfyParams == "object" ? n.comfyParams : {}, l = n.comfyRandomActive && typeof n.comfyRandomActive == "object" ? n.comfyRandomActive : {}, u = i.filter((e) => ha(e) === "setting"), d = i.filter((e) => [
		"audio",
		"image",
		"video"
	].includes(ha(e))), f = (Ri()?.getNodeOptions("comfy", "workflow", n) ?? []).map((e) => [e.value, e.label]), p = (t, i, a = !0) => {
		r.getState().updateNode(n.id, { comfyParams: {
			...c,
			[String(t.id)]: i
		} }), a && e();
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "comfy-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "mode-tabs",
				children: [
					["text", "文生图"],
					["enhance", "增强"],
					["edit", "编辑"],
					["custom", "工作流"]
				].map(([e, t]) => /* @__PURE__ */ (0, K.jsx)("button", {
					className: n.mode === e ? "active" : "",
					onClick: () => s({ mode: e }),
					type: "button",
					children: t
				}, e))
			}),
			/* @__PURE__ */ (0, K.jsx)(la, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "gen-settings comfy-settings",
				children: n.mode === "text" ? /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "gen-settings-row",
					children: [/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": "Comfy 宽度",
						className: "setting-input",
						min: "64",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { width: Number(e.target.value) || 1024 }),
						step: "64",
						type: "number",
						value: Number(n.width || 1024)
					}), /* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": "Comfy 高度",
						className: "setting-input",
						min: "64",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { height: Number(e.target.value) || 1024 }),
						step: "64",
						type: "number",
						value: Number(n.height || 1024)
					})]
				}) : n.mode === "enhance" ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("input", {
					"aria-label": "增强强度",
					className: "canvas-range",
					max: "1",
					min: "0.1",
					onChange: (e) => r.getState().updateNode(n.id, { enhanceStrength: Number(e.target.value) }),
					onPointerUp: e,
					step: "0.05",
					type: "range",
					value: Number(n.enhanceStrength ?? .5)
				}), /* @__PURE__ */ (0, K.jsx)("button", {
					className: `setting-check ${n.enhanceUpscale ? "active" : ""}`,
					onClick: () => s({ enhanceUpscale: !n.enhanceUpscale }),
					type: "button",
					children: "超分辨率"
				})] }) : n.mode === "edit" ? /* @__PURE__ */ (0, K.jsx)("button", {
					className: `setting-check ${n.editUpscale ? "active" : ""}`,
					onClick: () => s({ editUpscale: !n.editUpscale }),
					type: "button",
					children: "超分辨率"
				}) : /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
					/* @__PURE__ */ (0, K.jsx)(ta, {
						ariaLabel: "Comfy 工作流",
						onChange: (e) => s({
							comfyWorkflow: e,
							comfyParams: {},
							comfyRandomActive: {}
						}),
						options: f,
						value: o
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "text-[10px] text-gray-400",
						children: [
							"动态媒体字段 ",
							d.length,
							" · 参数字段 ",
							u.length
						]
					}),
					u.map((t) => {
						let n = String(t.id || ""), r = c[n] ?? t.default ?? "";
						if (t.type === "boolean") return /* @__PURE__ */ (0, K.jsx)("button", {
							className: `setting-check ${r ? "active" : ""}`,
							onClick: () => p(t, !r),
							type: "button",
							children: t.name || n
						}, n);
						if (t.type === "dropdown") return /* @__PURE__ */ (0, K.jsx)(ta, {
							ariaLabel: t.name || n,
							onChange: (e) => p(t, e),
							options: (t.options || []).map((e) => [e, e]),
							value: String(r)
						}, n);
						if (t.type === "textarea") return /* @__PURE__ */ (0, K.jsx)("textarea", {
							"aria-label": t.name || n,
							className: "setting-input",
							onBlur: e,
							onChange: (e) => p(t, e.target.value, !1),
							value: String(r)
						}, n);
						let i = /* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": t.name || n,
							className: "setting-input",
							max: t.max,
							min: t.min,
							onBlur: e,
							onChange: (e) => p(t, t.type === "number" || t.type === "slider" ? Number(e.target.value) : e.target.value, !1),
							step: t.step,
							type: t.type === "number" || t.type === "slider" ? "number" : "text",
							value: String(r)
						});
						return t.type === "number" && t.random_enabled ? /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "comfy-random-field",
							children: [i, /* @__PURE__ */ (0, K.jsx)("button", {
								"aria-label": `${t.name || n} 随机`,
								className: `tool-btn comfy-random-btn ${l[n] === !1 ? "" : "active"}`,
								onClick: () => s({ comfyRandomActive: {
									...l,
									[n]: l[n] === !1
								} }),
								type: "button",
								children: "随机"
							})]
						}, n) : /* @__PURE__ */ (0, K.jsx)("div", { children: i }, n);
					})
				] })
			}),
			/* @__PURE__ */ (0, K.jsx)(aa, {
				document: t,
				node: n
			})
		]
	});
}
function _a({ canvasRuntime: e, commit: t, node: n, onEdit: r, store: i }) {
	let a = (0, G.useRef)(null);
	(0, G.useEffect)(() => () => {
		a.current?.pause(), a.current?.removeAttribute("src"), a.current?.load();
	}, []);
	let o = async (r) => {
		if (!r.length) return;
		let a = (await e.uploadMedia(r)).files ?? [];
		if (!a.length) return;
		i.getState().updateNode(n.id, {
			url: a[0].url || "",
			name: a[0].name || "media",
			mediaKind: a[0].kind || "image"
		});
		let o = [n.id];
		a.slice(1).forEach((e, t) => {
			let r = i.getState().addNode("image", {
				x: Number(n.x || 0) + (t + 1) * 36,
				y: Number(n.y || 0) + (t + 1) * 36
			});
			r && (i.getState().updateNode(r, {
				url: e.url || "",
				name: e.name || "media",
				mediaKind: e.kind || "image"
			}), o.push(r));
		}), o.length > 1 && i.getState().groupNodes(o), t();
	}, s = String(n.url || ""), c = Array.isArray(n.imageEditHistory) ? n.imageEditHistory : [], l = String(n.mediaKind || (/\.(mp4|webm|mov)(\?|$)/i.test(s) ? "video" : /\.(mp3|wav|m4a)(\?|$)/i.test(s) ? "audio" : "image"));
	return s ? /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "image-preview-wrap",
		onClick: (e) => e.stopPropagation(),
		onDoubleClick: () => window.open(s, "_blank", "noopener"),
		onDragOver: (e) => e.preventDefault(),
		onDrop: (e) => {
			e.preventDefault(), o([...e.dataTransfer.files]);
		},
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			l === "video" ? /* @__PURE__ */ (0, K.jsx)("video", {
				controls: !0,
				preload: "metadata",
				ref: (e) => {
					a.current = e;
				},
				src: s
			}) : l === "audio" ? /* @__PURE__ */ (0, K.jsx)("audio", {
				controls: !0,
				preload: "metadata",
				ref: (e) => {
					a.current = e;
				},
				src: s
			}) : /* @__PURE__ */ (0, K.jsx)("img", {
				alt: String(n.name || "image"),
				draggable: !0,
				src: s
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "image-caption text-[11px] text-gray-400 truncate",
				children: String(n.name || l)
			}),
			l === "image" ? /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "image-edit-actions",
				children: [
					/* @__PURE__ */ (0, K.jsx)("button", {
						className: "tool-btn",
						onClick: r,
						type: "button",
						children: "编辑图片"
					}),
					c.length ? /* @__PURE__ */ (0, K.jsx)("button", {
						className: "tool-btn",
						onClick: () => {
							let e = c[c.length - 1];
							i.getState().updateNode(n.id, {
								imageEditHistory: c.slice(0, -1),
								mediaKind: e.kind || "image",
								name: e.name || "image",
								url: e.url || "",
								...e.outpaintSize ? { outpaintSize: e.outpaintSize } : { outpaintSize: void 0 }
							}), t();
						},
						type: "button",
						children: "恢复上版"
					}) : null,
					n.editOriginalUrl ? /* @__PURE__ */ (0, K.jsx)("a", {
						href: String(n.editOriginalUrl),
						rel: "noreferrer",
						target: "_blank",
						children: "查看原图"
					}) : null
				]
			}) : null,
			/* @__PURE__ */ (0, K.jsx)("button", {
				"aria-label": "清空媒体",
				className: "output-del",
				onClick: () => {
					i.getState().updateNode(n.id, {
						url: "",
						name: "空白图片",
						mediaKind: "image"
					}), t();
				},
				type: "button",
				children: "×"
			})
		]
	}) : /* @__PURE__ */ (0, K.jsxs)("label", {
		className: "blank-image",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: ["选择或拖入媒体", /* @__PURE__ */ (0, K.jsx)("input", {
			accept: "image/*,video/*,audio/*",
			hidden: !0,
			multiple: !0,
			onChange: (e) => void o([...e.target.files ?? []]),
			type: "file"
		})]
	});
}
function va({ node: e, nodesById: t }) {
	let n = Array.isArray(e.items) ? e.items.map((e) => t.get(String(e))).filter(Boolean) : [], r = n.filter((e) => e.type === "image" && e.url);
	return /* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsxs)("div", {
		className: "text-[11px] text-gray-400",
		children: [
			r.length,
			" 个媒体 · ",
			n.filter((e) => e.type === "prompt").length,
			" 个提示词"
		]
	}), r.length ? /* @__PURE__ */ (0, K.jsx)("div", {
		className: "output-grid",
		children: r.slice(0, 6).map((e) => /* @__PURE__ */ (0, K.jsx)("img", {
			alt: String(e.name || "media"),
			onDoubleClick: () => window.open(String(e.url), "_blank", "noopener"),
			src: String(e.url)
		}, e.id))
	}) : null] });
}
function ya({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = Ri()?.normalizeLtxNode(n) ?? n;
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "ltx-director-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, K.jsx)(la, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, K.jsx)("textarea", {
				"aria-label": "LTX 全局提示词",
				className: "setting-input",
				onBlur: e,
				onChange: (e) => r.getState().updateNode(n.id, { globalPrompt: e.target.value }),
				placeholder: "全局提示词",
				value: String(n.globalPrompt || "")
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "ltx-params-row",
				children: [
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": "LTX 秒数",
						className: "setting-input",
						min: "0.1",
						onChange: (e) => i({
							durationSeconds: Math.max(.1, Number(e.target.value) || 5),
							durationFrames: Math.max(1, Math.round((Number(e.target.value) || 5) * Number(n.frameRate || 24)))
						}),
						step: "0.01",
						type: "number",
						value: Number(n.durationSeconds || 5)
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": "LTX 帧数",
						className: "setting-input",
						min: "1",
						onChange: (e) => i({
							durationFrames: Math.max(1, Number(e.target.value) || 120),
							durationSeconds: Math.max(1, Number(e.target.value) || 120) / Number(n.frameRate || 24)
						}),
						type: "number",
						value: Number(n.durationFrames || 120)
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": "LTX FPS",
						className: "setting-input",
						min: "1",
						onChange: (e) => i({ frameRate: Math.max(1, Number(e.target.value) || 24) }),
						type: "number",
						value: Number(n.frameRate || 24)
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": "LTX 宽度",
						className: "setting-input",
						min: "0",
						onChange: (e) => i({ customWidth: Math.max(0, Number(e.target.value) || 0) }),
						step: "32",
						type: "number",
						value: Number(n.customWidth || 0)
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": "LTX 高度",
						className: "setting-input",
						min: "0",
						onChange: (e) => i({ customHeight: Math.max(0, Number(e.target.value) || 0) }),
						step: "32",
						type: "number",
						value: Number(n.customHeight || 0)
					})
				]
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "ltx-params-row",
				children: [
					/* @__PURE__ */ (0, K.jsx)(ta, {
						ariaLabel: "LTX 时间显示",
						onChange: (e) => i({ displayMode: e }),
						options: [["seconds", "秒"], ["frames", "帧"]],
						value: String(n.displayMode || "seconds")
					}),
					/* @__PURE__ */ (0, K.jsx)("button", {
						className: `setting-check ${n.useCustomAudio ? "active" : ""}`,
						onClick: () => i({ useCustomAudio: !n.useCustomAudio }),
						type: "button",
						children: "自定义音频"
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": "LTX 图片压缩",
						className: "setting-input",
						max: "100",
						min: "0",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { imgCompression: Number(e.target.value) }),
						type: "number",
						value: Number(n.imgCompression ?? 18)
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": "LTX Epsilon",
						className: "setting-input",
						min: "0",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { epsilon: Number(e.target.value) }),
						step: "0.0001",
						type: "number",
						value: Number(n.epsilon ?? .001)
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": "LTX Divisible By",
						className: "setting-input",
						min: "1",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { divisibleBy: Math.max(1, Number(e.target.value) || 32) }),
						type: "number",
						value: Number(n.divisibleBy || 32)
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": "LTX Noise Seed",
						className: "setting-input",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { noiseSeed: Number(e.target.value) }),
						type: "number",
						value: Number(n.noiseSeed ?? 12)
					})
				]
			}),
			/* @__PURE__ */ (0, K.jsx)(ba, {
				commit: e,
				node: a,
				store: r
			}),
			/* @__PURE__ */ (0, K.jsx)(aa, {
				document: t,
				node: n
			})
		]
	});
}
function ba({ commit: e, node: t, store: n }) {
	let r;
	try {
		let e = JSON.parse(String(t.ltxTimelineData || "{}"));
		r = {
			audioSegments: Array.isArray(e.audioSegments) ? e.audioSegments : [],
			segments: Array.isArray(e.segments) ? e.segments : []
		};
	} catch {
		r = {
			audioSegments: [],
			segments: []
		};
	}
	let i = (r) => {
		n.getState().updateNode(t.id, { ltxTimelineData: JSON.stringify(r) }), e();
	}, a = (e, t) => i({
		...r,
		segments: r.segments.map((n, r) => r === e ? {
			...n,
			...t
		} : n)
	}), o = (e, t) => i({
		...r,
		audioSegments: r.audioSegments.map((n, r) => r === e ? {
			...n,
			...t
		} : n)
	}), s = async (e, t) => {
		let n = (await Ri()?.uploadMedia([e]))?.files?.[0];
		n?.url && t(n);
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "ltx-director-timeline-host canvas-modern-timeline",
		"data-testid": "ltx-timeline-editor",
		children: [
			/* @__PURE__ */ (0, K.jsxs)("header", { children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: "时间线" }), /* @__PURE__ */ (0, K.jsx)("button", {
				onClick: () => i({
					...r,
					segments: [...r.segments, {
						id: `segment_${crypto.randomUUID?.() || Date.now()}`,
						start: r.segments.reduce((e, t) => Math.max(e, Number(t.start) + Number(t.length)), 0),
						length: 24,
						prompt: "",
						type: "text"
					}]
				}),
				type: "button",
				children: "添加片段"
			})] }),
			r.segments.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "canvas-modern-segment",
				children: [
					/* @__PURE__ */ (0, K.jsxs)("select", {
						"aria-label": `片段 ${t + 1} 类型`,
						onChange: (e) => a(t, { type: e.target.value }),
						value: e.type || "text",
						children: [/* @__PURE__ */ (0, K.jsx)("option", {
							value: "text",
							children: "文本"
						}), /* @__PURE__ */ (0, K.jsx)("option", {
							value: "image",
							children: "图片"
						})]
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": `片段 ${t + 1} 起始帧`,
						min: "0",
						onChange: (e) => a(t, { start: Math.max(0, Number(e.target.value) || 0) }),
						type: "number",
						value: Number(e.start || 0)
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": `片段 ${t + 1} 长度`,
						min: "1",
						onChange: (e) => a(t, { length: Math.max(1, Number(e.target.value) || 1) }),
						type: "number",
						value: Number(e.length || 1)
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": `片段 ${t + 1} 提示词`,
						onChange: (e) => a(t, { prompt: e.target.value }),
						placeholder: "片段提示词",
						value: e.prompt || ""
					}),
					e.type === "image" ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
						/* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": `片段 ${t + 1} 图片`,
							onChange: (e) => a(t, {
								imageB64: e.target.value,
								imageFile: ""
							}),
							placeholder: "图片 URL",
							value: e.imageB64 || e.imageFile || ""
						}),
						/* @__PURE__ */ (0, K.jsxs)("label", {
							className: "tool-btn",
							children: ["上传", /* @__PURE__ */ (0, K.jsx)("input", {
								accept: "image/*",
								hidden: !0,
								onChange: (e) => {
									let n = e.target.files?.[0];
									n && s(n, (e) => a(t, {
										imageB64: e.url,
										imageFile: ""
									}));
								},
								type: "file"
							})]
						}),
						/* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": `片段 ${t + 1} 引导强度`,
							max: "2",
							min: "0",
							onChange: (e) => a(t, { guideStrength: Number(e.target.value) }),
							step: "0.05",
							type: "number",
							value: Number(e.guideStrength ?? 1)
						})
					] }) : null,
					/* @__PURE__ */ (0, K.jsx)("button", {
						"aria-label": `删除片段 ${t + 1}`,
						onClick: () => i({
							...r,
							segments: r.segments.filter((e, n) => n !== t)
						}),
						type: "button",
						children: "×"
					})
				]
			}, e.id || t)),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "canvas-modern-audio-row",
				children: [/* @__PURE__ */ (0, K.jsxs)("span", { children: ["音频片段 ", r.audioSegments.length] }), /* @__PURE__ */ (0, K.jsx)("button", {
					onClick: () => i({
						...r,
						audioSegments: [...r.audioSegments, {
							id: `audio_${crypto.randomUUID?.() || Date.now()}`,
							start: 0,
							length: 24,
							url: ""
						}]
					}),
					type: "button",
					children: "添加音频"
				})]
			}),
			r.audioSegments.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "canvas-modern-segment canvas-modern-audio-segment",
				children: [
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": `音频 ${t + 1} 起始帧`,
						min: "0",
						onChange: (e) => o(t, { start: Math.max(0, Number(e.target.value) || 0) }),
						type: "number",
						value: Number(e.start || 0)
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": `音频 ${t + 1} 长度`,
						min: "1",
						onChange: (e) => o(t, { length: Math.max(1, Number(e.target.value) || 1) }),
						type: "number",
						value: Number(e.length || 1)
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						"aria-label": `音频 ${t + 1} URL`,
						onChange: (e) => o(t, { url: e.target.value }),
						placeholder: "音频 URL",
						value: e.url || ""
					}),
					/* @__PURE__ */ (0, K.jsxs)("label", {
						className: "tool-btn",
						children: ["上传", /* @__PURE__ */ (0, K.jsx)("input", {
							accept: "audio/*",
							hidden: !0,
							onChange: (e) => {
								let n = e.target.files?.[0];
								n && s(n, (e) => o(t, {
									name: e.name,
									url: String(e.url || "")
								}));
							},
							type: "file"
						})]
					}),
					/* @__PURE__ */ (0, K.jsx)("button", {
						"aria-label": `删除音频 ${t + 1}`,
						onClick: () => i({
							...r,
							audioSegments: r.audioSegments.filter((e, n) => n !== t)
						}),
						type: "button",
						children: "×"
					})
				]
			}, e.id || t))
		]
	});
}
function xa({ canvasRuntime: e, commit: t, initialReadOnly: n = !1, legacyUi: r = !1, onSelectionChange: i, smartUi: a = !1, store: o }) {
	let s = ct(o, ({ document: e }) => e), c = String(s?.id || ""), l = (0, G.useRef)(null), u = (0, G.useRef)(null), f = (0, G.useRef)(0), p = (0, G.useRef)(null), m = (0, G.useRef)(0), h = (0, G.useRef)(!1), g = (0, G.useRef)(/* @__PURE__ */ new Set()), [_, v] = (0, G.useState)(""), [y, b] = (0, G.useState)(null), [x, S] = (0, G.useState)(-1), [C, w] = (0, G.useState)(/* @__PURE__ */ new Set()), [T, E] = (0, G.useState)("ready"), [D, O] = (0, G.useState)(null), [k, A] = (0, G.useState)(null), [j, M] = (0, G.useState)(""), [N, P] = (0, G.useState)(n), [F, I] = (0, G.useState)(() => r ? Bi(c) : {
		x: 0,
		y: 0,
		zoom: 1
	}), [ee, te] = (0, G.useState)(null), [L, R] = (0, G.useState)({
		height: 0,
		width: 0
	}), [z, B] = (0, G.useState)(null), [ne, re] = (0, G.useState)(null), [ie, ae] = (0, G.useState)(!1), [V, oe] = (0, G.useState)(""), [se, ce] = (0, G.useState)(null);
	g.current = C;
	let H = new Map((s?.nodes ?? []).map((e) => [e.id, e])), le = {
		connections: s?.connections ?? [],
		nodes: s?.nodes ?? []
	}, ue = s ? d(s) : null;
	(0, G.useEffect)(() => {
		v(""), b(null), S(-1), w(/* @__PURE__ */ new Set()), B(null), oe(""), ce(null), te(null), I(r ? Bi(c) : {
			x: 0,
			y: 0,
			zoom: 1
		});
	}, [c, r]), (0, G.useEffect)(() => {
		let e = l.current;
		if (!e) return;
		let t = () => R({
			height: e.clientHeight,
			width: e.clientWidth
		});
		t();
		let n = new ResizeObserver(t);
		return n.observe(e), () => n.disconnect();
	}, []);
	let de = (e, t) => {
		if (!ee) return !1;
		let n = ee.viewport, r = n;
		if (t) {
			let e = Ui(t), i = {
				x: Number(t.x || 0) + e.width / 2,
				y: Number(t.y || 0) + e.height / 2
			}, a = Math.min(1.15, (L.width - 160) / Math.max(1, e.width), (L.height - 160) / Math.max(1, e.height)), o = Math.max(n.zoom, Math.min(1.15, Math.max(.72, a)));
			r = {
				x: L.width / 2 - i.x * o,
				y: L.height / 2 - i.y * o,
				zoom: o
			};
		} else e && (r = {
			x: L.width / 2 - e.x * n.zoom,
			y: L.height / 2 - e.y * n.zoom,
			zoom: n.zoom
		});
		return te(null), I(r), Vi(c, r), !0;
	}, fe = () => {
		if (!a) return;
		if (ee) {
			de();
			return;
		}
		let e = o.getState().document?.nodes ?? [];
		if (!e.length || !L.width || !L.height) return;
		let t = e.map((e) => ({
			...zi(e),
			...Ui(e)
		})), n = Math.min(...t.map((e) => e.x)), r = Math.min(...t.map((e) => e.y)), i = Math.max(...t.map((e) => e.x + e.width)), s = Math.max(...t.map((e) => e.y + e.height)), l = Math.max(1, i - n + 320), u = Math.max(1, s - r + 320), d = Math.max(.06, Math.min(.82, (L.width - 80) / l, (L.height - 80) / u)), f = {
			x: L.width / 2 - (n + i) / 2 * d,
			y: L.height / 2 - (r + s) / 2 * d,
			zoom: d
		};
		B(null), te({ viewport: F }), I(f), Vi(c, f);
	};
	(0, G.useEffect)(() => {
		let e = l.current?.closest(".shell");
		return e?.classList.toggle("zoom-preview", !!ee), () => e?.classList.remove("zoom-preview");
	}, [ee]), (0, G.useEffect)(() => {
		let e = (e) => {
			e.key.toLowerCase() === "r" && !mi(e.target) && (h.current = !0);
		}, t = (e) => {
			e.key.toLowerCase() === "r" && (h.current = !1);
		}, n = () => {
			h.current = !1;
		};
		return window.addEventListener("keydown", e), window.addEventListener("keyup", t), window.addEventListener("blur", n), () => {
			window.removeEventListener("keydown", e), window.removeEventListener("keyup", t), window.removeEventListener("blur", n);
		};
	}, []), (0, G.useEffect)(() => {
		let e = (e) => P(!!e.detail);
		return window.addEventListener("canvas-board-v2-readonly", e), () => window.removeEventListener("canvas-board-v2-readonly", e);
	}, []), (0, G.useEffect)(() => {
		N && M("");
	}, [N]), (0, G.useEffect)(() => {
		let e = (e) => {
			let n = mi(e.target), r = String(e.key || "").toLowerCase();
			if (e.key === "Escape") {
				v(""), b(null), S(-1), B(null), re(null);
				return;
			}
			if (!n) {
				if (a && !e.ctrlKey && !e.metaKey && !e.altKey && r === "z") {
					if (e.repeat) return;
					e.preventDefault(), fe();
					return;
				}
				if (!N) {
					if ((e.ctrlKey || e.metaKey) && r === "z") {
						e.preventDefault(), !a && e.shiftKey ? window.CanvasBoardV2?.redo() : window.CanvasBoardV2?.undo();
						return;
					}
					if (!a && (e.ctrlKey || e.metaKey) && r === "y") {
						e.preventDefault(), window.CanvasBoardV2?.redo();
						return;
					}
					if ((e.ctrlKey || e.metaKey) && r === "c") {
						if (window.getSelection?.()?.toString()) return;
						e.preventDefault();
						let t = o.getState().copyNodes([...g.current]);
						u.current = t, t.nodes.length && window.dispatchEvent(new CustomEvent("canvas-board-v2-shortcut-status", { detail: `已复制 ${t.nodes.length} 个节点` }));
						return;
					}
					if ((e.ctrlKey || e.metaKey) && r === "v" && u.current) {
						let e = Date.now();
						window.setTimeout(() => {
							if (f.current >= e || m.current >= e || !u.current) return;
							let n = o.getState().pasteNodes(u.current);
							n.length && (m.current = Date.now(), w(new Set(n)), t(), window.dispatchEvent(new CustomEvent("canvas-board-v2-shortcut-status", { detail: `已粘贴 ${n.length} 个节点` })));
						}, 90);
						return;
					}
					if ((e.ctrlKey || e.metaKey) && r === "g") {
						e.preventDefault();
						let n = o.getState().document;
						if (a && n) {
							if (e.shiftKey) {
								let e = n, r = [];
								[...g.current].forEach((t) => {
									let n = Ji(e, t);
									n && (e = n.document, r.push(...n.ids));
								}), r.length && (o.getState().projectDocument(e), w(new Set(r)), t());
							} else {
								let e = qi(n, [...g.current]);
								e && (o.getState().projectDocument(e.document), w(/* @__PURE__ */ new Set([e.id])), t());
							}
						} else if (!e.shiftKey) {
							let e = (n?.nodes.filter((e) => g.current.has(e.id)) ?? []).some((e) => e.type === "image") ? o.getState().groupNodes([...g.current]) : o.getState().groupPromptNodes([...g.current]);
							e && (w(/* @__PURE__ */ new Set([e])), t());
						}
						return;
					}
					if (e.key === "Delete" || e.key === "Backspace") {
						if (g.current.size) g.current.forEach((e) => o.getState().deleteNode(e));
						else if (x >= 0) o.getState().deleteConnection(x);
						else return;
						e.preventDefault(), w(/* @__PURE__ */ new Set()), S(-1), t();
					}
				}
			}
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [
		L,
		t,
		N,
		x,
		C,
		a,
		o,
		F,
		ee
	]), (0, G.useEffect)(() => {
		let e = () => {
			if (N) return;
			let e = o.getState().document;
			if (a && e) {
				let n = qi(e, [...C]);
				n && (o.getState().projectDocument(n.document), w(/* @__PURE__ */ new Set([n.id])), t());
			} else {
				let n = (e?.nodes.filter((e) => C.has(e.id)) ?? []).some((e) => e.type === "image") ? o.getState().groupNodes([...C]) : o.getState().groupPromptNodes([...C]);
				n && (w(/* @__PURE__ */ new Set([n])), t());
			}
		};
		return window.addEventListener("canvas-board-v2-group-selected", e), () => window.removeEventListener("canvas-board-v2-group-selected", e);
	}, [
		t,
		N,
		C,
		a,
		o
	]), (0, G.useEffect)(() => {
		let e = (e) => E(String(e.detail || "ready"));
		return window.addEventListener("canvas-board-v2-save-state", e), () => window.removeEventListener("canvas-board-v2-save-state", e);
	}, []), (0, G.useEffect)(() => {
		let e = (e) => O(e.detail);
		return window.addEventListener("canvas-v2-open-lightbox", e), () => window.removeEventListener("canvas-v2-open-lightbox", e);
	}, []);
	let pe = (e) => {
		let n = o.getState().document;
		_ && y?.fromPort !== "in" && n && d(n).canConnect(_, e) && o.getState().connectNodes(_, e) && t(), v(""), b(null);
	}, me = (e, t = "out") => {
		if (N) return;
		let n = o.getState().document?.nodes.find((t) => t.id === e);
		if (!n) return;
		let r = zi(n), i = Ui(n);
		v(e), b({
			currentWorld: {
				x: t === "out" ? r.x + i.width : r.x,
				y: r.y + i.height / 2
			},
			fromId: e,
			fromPort: t
		});
	};
	(0, G.useEffect)(() => {
		if (!_ || N || !a) return;
		let e = l.current;
		if (!e) return;
		let n = e.closest(".shell");
		n?.classList.add("port-dragging");
		let r = !1, i = () => {
			e.querySelectorAll(".node-port.is-active").forEach((e) => e.classList.remove("is-active")), e.querySelectorAll(".image-node.port-hover").forEach((e) => e.classList.remove("port-hover"));
		}, s = (e, t) => {
			let n = window.document.elementFromPoint(e, t), r = n?.closest(".node-port, [data-port]") || null;
			r ||= [...window.document.querySelectorAll("#smartCanvasApp .node-port[data-port]")].map((n) => {
				let r = n.getBoundingClientRect();
				return {
					distance: Math.hypot(e - (r.left + r.width / 2), t - (r.top + r.height / 2)),
					element: n
				};
			}).filter((e) => e.distance <= 22).sort((e, t) => e.distance - t.distance)[0]?.element || null;
			let i = (r?.closest(".image-node, [data-node-id]") || n?.closest(".image-node, [data-node-id]")) ?? null, a = String(i?.dataset.id || i?.dataset.nodeId || ""), s = String(r?.dataset.port || "");
			if (!s && i) {
				let t = i.getBoundingClientRect();
				s = e - t.left < t.width / 2 ? "in" : "out";
			}
			if (!a || a === _ || s !== "in" && s !== "out") return {
				hit: n,
				id: "",
				port: "",
				valid: !1
			};
			let c = y?.fromPort || "out", l = c === "out" && s === "in" || c === "in" && s === "out", u = c === "out" ? _ : a, f = c === "out" ? a : _, p = o.getState().document;
			return {
				hit: n,
				id: a,
				port: s,
				valid: !!(l && p && d(p).canConnect(u, f))
			};
		}, c = (t) => {
			r = !0;
			let n = e.getBoundingClientRect(), a = {
				x: (t.clientX - n.left - F.x) / F.zoom,
				y: (t.clientY - n.top - F.y) / F.zoom
			}, o = s(t.clientX, t.clientY);
			if (i(), o.valid) {
				let t = e.querySelector(`.image-node[data-id="${CSS.escape(o.id)}"], [data-node-id="${CSS.escape(o.id)}"]`);
				t?.classList.add("port-hover"), t?.querySelector(`[data-port="${o.port}"]`)?.classList.add("is-active");
			}
			b((e) => e && {
				...e,
				currentWorld: a,
				hoverPort: o.valid ? o.port : "",
				hoverTargetId: o.valid ? o.id : ""
			});
		}, u = (n) => {
			let a = y, c = s(n.clientX, n.clientY);
			if (c.valid && a) {
				let e = a.fromPort === "out" ? a.fromId : c.id, n = a.fromPort === "out" ? c.id : a.fromId;
				o.getState().connectNodes(e, n) && t();
			} else if (r && a && !c.id && !c.hit?.closest(".composer,.smart-nav,.asset-panel,.create-menu,.smart-minimap,.log-modal,.shortcut-modal,.image-edit-modal")) {
				let r = e.getBoundingClientRect(), i = {
					x: (n.clientX - r.left - F.x) / F.zoom,
					y: (n.clientY - r.top - F.y) / F.zoom
				}, s = o.getState().addNode("smart-image", {
					x: i.x - 158,
					y: i.y - 97
				});
				if (s) {
					let e = a.fromPort === "out" ? a.fromId : s, n = a.fromPort === "out" ? s : a.fromId;
					o.getState().connectNodes(e, n) && t();
				}
			}
			v(""), b(null), i();
		};
		return window.addEventListener("pointermove", c), window.addEventListener("pointerup", u, { once: !0 }), () => {
			window.removeEventListener("pointermove", c), window.removeEventListener("pointerup", u), n?.classList.remove("port-dragging"), i();
		};
	}, [
		t,
		_,
		y?.fromPort,
		N,
		a,
		o,
		F
	]);
	let he = D ? H.get(D.nodeId) : null, ge = k ? H.get(k.nodeId) : null, _e = j ? H.get(j) : null;
	(0, G.useEffect)(() => {
		i?.(C);
	}, [i, C]), (0, G.useEffect)(() => {
		!r && !a || !z || window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		z,
		r,
		a
	]);
	let U = (e, t) => {
		let n = l.current?.querySelector(".minimap-content")?.getBoundingClientRect();
		if (!n || !L.width || !L.height) return;
		let r = {
			x: Math.min(Ni, Math.max(0, (e - n.left) / n.width * Ni)),
			y: Math.min(Pi, Math.max(0, (t - n.top) / n.height * Pi))
		};
		I((e) => {
			let t = {
				...e,
				x: L.width / 2 - r.x * e.zoom,
				y: L.height / 2 - r.y * e.zoom
			};
			return Vi(c, t), t;
		});
	}, ve = (e) => {
		I((t) => {
			let n = {
				...t,
				x: L.width / 2 - e.x * t.zoom,
				y: L.height / 2 - e.y * t.zoom
			};
			return Vi(c, n), n;
		});
	}, ye = (e) => {
		if (!z || N) return;
		let n = "";
		if (e === "image") n = o.getState().addNode("smart-image", {
			x: z.point.x - 158,
			y: z.point.y - 97
		}) || "";
		else {
			let t = e === "prompt" ? {
				x: 158,
				y: 97
			} : {
				x: 135,
				y: 95
			};
			n = o.getState().addNode(e, {
				x: z.point.x - t.x,
				y: z.point.y - t.y
			}) || "";
		}
		n && (w(/* @__PURE__ */ new Set([n])), t()), B(null);
	}, W = a && C.size === 1 ? s?.nodes.find((e) => C.has(e.id) && ["output", "smart-image"].includes(e.type)) ?? null : null, be = (e, t = o.getState().document) => {
		if (!e || !t) return null;
		let n = t.connections.filter((t) => t.to === e.id).map((e) => e.from);
		return t.nodes.find((e) => n.includes(e.id) && [
			"comfy",
			"generator",
			"msgen",
			"video"
		].includes(e.type)) ?? null;
	}, xe = W?.type === "smart-image" ? Yi(W) : be(W, s), Se = (e, n = "generator") => {
		if (!W || N) return "";
		if (W.type === "smart-image") {
			let r = W.runSettings && typeof W.runSettings == "object" ? W.runSettings : {}, i = n === "msgen" ? "modelscope" : n === "comfy" ? "comfy" : "api";
			return o.getState().updateNode(W.id, { runSettings: {
				...r,
				...e,
				engine: i,
				apiKind: n === "video" ? "video" : "image"
			} }), t(), W.id;
		}
		let r = o.getState().document;
		if (!r) return "";
		let i = be(W, r);
		if (!i) {
			let e = o.getState().addNode(n, {
				x: Number(W.x || 0) - 420,
				y: Number(W.y || 0)
			});
			if (!e) return "";
			o.getState().connectNodes(e, W.id), r = o.getState().document, i = r?.nodes.find((t) => t.id === e) ?? null;
		}
		return i ? (i.type !== n && r && o.getState().projectDocument({
			...r,
			nodes: r.nodes.map((e) => e.id === i.id ? {
				...e,
				type: n
			} : e)
		}), o.getState().updateNode(i.id, e), t(), i.id) : "";
	}, Ce = (e, n = !1) => {
		!W || N || (o.getState().updateNode(W.id, e), n && t());
	}, we = (e) => {
		let t = W?.type === "smart-image" ? W.id : xe?.id || Se({});
		t && window.CanvasBoardV2?.runNode(t, e);
	}, Te = async (n, r) => {
		if (N || !r.length) return;
		let i = await e.uploadMedia(r), a = o.getState().document?.nodes.find((e) => e.id === n && e.type === "smart-image");
		if (!a) return;
		let s = (i.files ?? []).filter((e) => e.url).map((e) => ({
			...e,
			kind: e.kind || "image",
			name: e.name || "media",
			url: e.url || ""
		}));
		if (!s.length) return;
		let c = [...fr(a), ...s];
		o.getState().updateNode(n, {
			h: void 0,
			images: c,
			scale: c.length > 1 ? .8 : Number(a.scale || 2),
			title: c.length > 1 ? "Group" : s[0].kind === "video" ? "Video" : s[0].kind === "audio" ? "Audio" : "Image",
			w: void 0
		}), t();
	};
	(0, G.useEffect)(() => {
		if (!a) return;
		let e = (e) => {
			if (N) return;
			let n = [...e.clipboardData?.files || []].filter(hi);
			if (n.length) {
				f.current = Date.now();
				let e = g.current.size === 1 ? [...g.current][0] : "", t = o.getState().document?.nodes.find((t) => t.id === e && t.type === "smart-image");
				if (t) {
					Te(t.id, n);
					return;
				}
				let r = p.current || {
					x: (L.width / 2 - F.x) / F.zoom,
					y: (L.height / 2 - F.y) / F.zoom
				};
				window.CanvasBoardV2?.importFiles(n, r);
				return;
			}
			if (e.defaultPrevented || mi(e.target) || !u.current) return;
			e.preventDefault();
			let r = o.getState().pasteNodes(u.current);
			r.length && (m.current = Date.now(), w(new Set(r)), t(), window.dispatchEvent(new CustomEvent("canvas-board-v2-shortcut-status", { detail: `已粘贴 ${r.length} 个节点` })));
		}, n = () => {
			m.current = Date.now();
		};
		return window.addEventListener("paste", e), window.addEventListener("canvas-board-v2-asset-inbox-pasted", n), () => {
			window.removeEventListener("paste", e), window.removeEventListener("canvas-board-v2-asset-inbox-pasted", n);
		};
	}, [
		L.height,
		L.width,
		N,
		C,
		a,
		o,
		F
	]);
	let Ee = async (t, n) => {
		let r = (await e.uploadMedia([new File([t], n, { type: "image/png" })])).files?.[0];
		if (!r?.url) throw Error("图片上传失败");
		return {
			...r,
			kind: "image",
			name: r.name || n,
			url: r.url
		};
	}, De = (e, n, r, i = "centered") => {
		let a = ur(e), s = n.length > 1 ? .8 : 2, c = ur({
			id: "",
			images: n,
			scale: s,
			type: "smart-image"
		}), l = i === "split" ? {
			x: Number(e.x || 0) + a.width + 40,
			y: Number(e.y || 0)
		} : {
			x: Number(e.x || 0) + a.width + 240 - c.width / 2,
			y: Number(e.y || 0) + a.height / 2 - c.height / 2
		}, u = o.getState().addNode("smart-image", l);
		if (!u) throw Error("无法创建图片节点");
		return o.getState().updateNode(u, {
			h: void 0,
			images: n,
			scale: s,
			title: r,
			w: void 0
		}), w(/* @__PURE__ */ new Set([u])), t(), u;
	}, Oe = async (e) => {
		if (N || !k) throw Error("只读模式不能编辑图片");
		let n = await Ee(e.blob, e.name), r = o.getState().document?.nodes.find((e) => e.id === k.nodeId && e.type === "smart-image");
		if (!r) throw Error("图片节点已经被移除");
		let i = fr(r), a = i[k.imageIndex];
		if (!a) throw Error("图片已经被移除");
		i[k.imageIndex] = {
			...a,
			...n,
			natural_h: e.height,
			natural_w: e.width
		};
		let s = {
			h: void 0,
			images: i,
			lastImageEdit: {
				height: e.height,
				mode: e.mode,
				width: e.width
			},
			w: void 0
		};
		e.mode === "outpaint" && (s.outpaintSize = {
			height: e.height,
			width: e.width
		}, s.runSettings = Sa(r.runSettings, e.width, e.height), s.promptDraftHtml = "Remove white area and fill the scene", s.promptDraftText = "Remove white area and fill the scene", s.promptDraftTouched = !0), o.getState().updateNode(r.id, s), t();
	}, ke = async (e) => {
		if (N || !k) throw Error("只读模式不能编辑图片");
		let n = await Ee(e.blob, e.name), r = o.getState().document?.nodes.find((e) => e.id === k.nodeId && e.type === "smart-image");
		if (!r) throw Error("图片节点已经被移除");
		let i = [...fr(r), {
			...n,
			natural_h: e.height,
			natural_w: e.width,
			role: "mask"
		}];
		o.getState().updateNode(r.id, {
			h: void 0,
			images: i,
			scale: i.length > 1 ? .8 : Number(r.scale || 2),
			title: i.length > 1 ? "Group" : r.title,
			w: void 0
		}), t();
	}, Ae = async (t) => {
		if (N || !k) throw Error("只读模式不能编辑图片");
		let n = await e.uploadMedia(t.items.map((e) => new File([e.blob], e.name, { type: "image/png" }))), r = o.getState().document?.nodes.find((e) => e.id === k.nodeId && e.type === "smart-image");
		if (!r) throw Error("图片节点已经被移除");
		let i = fr(r)[k.imageIndex], a = n.files.slice(0, t.items.length).map((e, n) => ({
			grid: {
				...t.layout,
				...t.items[n].rect
			},
			kind: e.kind || "image",
			name: e.name || t.items[n].name,
			run: {
				prompt: "宫格切分",
				refs: i ? [{
					name: i.name || "source image",
					url: i.url || ""
				}] : []
			},
			runMs: 0,
			url: String(e.url || ""),
			viewed: !1
		})).filter((e) => !!e.url);
		if (!a.length) throw Error("切分图片上传结果为空");
		De(r, a, "Grid", "split");
	}, je = async (e) => {
		if (N || !k) throw Error("只读模式不能编辑图片");
		let t = await Ee(e.blob, e.name), n = o.getState().document?.nodes.find((e) => e.id === k.nodeId && e.type === "smart-image");
		if (!n) throw Error("图片节点已经被移除");
		De(n, [{
			...t,
			natural_h: e.height,
			natural_w: e.width
		}], "Grid Join");
	}, Me = async (e, t) => {
		if (N) throw Error("只读模式不能导出视频帧");
		let n = await Ee(t.blob, t.name);
		De(e, [{
			...n,
			natural_h: t.height,
			natural_w: t.width
		}], "Image");
	}, Ne = async (e) => {
		if (e.running) {
			await window.CanvasBoardV2?.controlExecution("stop-execution", e.id);
			return;
		}
		try {
			await window.CanvasBoardV2?.runNode(e.id, "cascade");
		} catch (e) {
			let t = window.document.getElementById("toast");
			t && (t.textContent = e instanceof Error ? e.message : String(e), t.classList.add("show"), window.setTimeout(() => t.classList.remove("show"), 1800));
		}
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		"aria-label": "CanvasBoard V2",
		"aria-readonly": N,
		className: `${r ? "board" : ""} ${N ? "canvas-board-v2-readonly" : ""}`.trim() || void 0,
		"data-testid": "canvas-board-v2",
		"data-viewport": `${F.x},${F.y},${F.zoom.toFixed(2)}`,
		onClickCapture: (e) => {
			if (!ee || e.button !== 0) return;
			let t = e.target;
			if (t.closest(".composer,.smart-nav,.asset-panel,.create-menu,.smart-minimap,.log-modal,.shortcut-modal,.image-edit-modal")) return;
			e.preventDefault(), e.stopPropagation();
			let n = String(t.closest(".image-node,[data-node-id]")?.dataset.id || t.closest("[data-node-id]")?.dataset.nodeId || ""), r = o.getState().document?.nodes.find((e) => e.id === n), i = e.currentTarget.getBoundingClientRect(), a = {
				x: (e.clientX - i.left - F.x) / F.zoom,
				y: (e.clientY - i.top - F.y) / F.zoom
			};
			de(a, r);
		},
		onPointerDownCapture: (e) => {
			if (ee && e.button === 0 && !e.target.closest(".composer,.asset-panel,.create-menu,.smart-minimap,.log-modal,.shortcut-modal,.image-edit-modal")) {
				e.preventDefault(), e.stopPropagation();
				return;
			}
			if (!a || N || e.button !== 0 || _) return;
			let t = e.target.closest(".node-port[data-port]"), n = t?.closest(".image-node, [data-node-id]"), r = String(n?.dataset.id || n?.dataset.nodeId || ""), i = t?.dataset.port;
			r && (i === "in" || i === "out") && me(r, i);
		},
		onDoubleClick: (e) => {
			if (!a || N || e.target.closest(".node, .composer, .create-menu, .smart-minimap, input, textarea, select, button")) return;
			e.preventDefault();
			let t = e.currentTarget.getBoundingClientRect();
			B({
				left: Math.max(14, Math.min(window.innerWidth - 420 - 14, e.clientX + 8)),
				point: {
					x: (e.clientX - t.left - F.x) / F.zoom,
					y: (e.clientY - t.top - F.y) / F.zoom
				},
				top: Math.max(14, Math.min(window.innerHeight - 286 - 14, e.clientY + 8))
			});
		},
		onContextMenu: (e) => {
			if (!r || e.target.closest(".node, .create-menu, .minimap, input, textarea, select, button") || (e.preventDefault(), N)) return;
			let t = e.currentTarget.getBoundingClientRect();
			B({
				left: e.clientX - t.left,
				point: {
					x: (e.clientX - t.left - F.x) / F.zoom,
					y: (e.clientY - t.top - F.y) / F.zoom
				},
				top: e.clientY - t.top
			});
		},
		onDragLeave: (e) => {
			r && !e.currentTarget.contains(e.relatedTarget) && ae(!1);
		},
		onDragOver: (e) => {
			e.preventDefault(), r && !N && ae(!0);
		},
		onDrop: (e) => {
			if (e.preventDefault(), e.stopPropagation(), r && ae(!1), N) return;
			let n = e.currentTarget.getBoundingClientRect(), i = {
				x: (e.clientX - n.left - F.x) / F.zoom,
				y: (e.clientY - n.top - F.y) / F.zoom
			}, s = e.dataTransfer.getData("application/x-smart-asset");
			if (s) try {
				let e = JSON.parse(s);
				if (e.url) {
					let n = o.getState().addNode(a ? "smart-image" : "image", i);
					n && (a ? o.getState().updateNode(n, {
						images: [{
							asset_item_id: e.asset_item_id,
							asset_uris: e.asset_uris,
							kind: e.kind || "image",
							name: e.name || "asset",
							url: e.url
						}],
						scale: 2,
						title: e.kind === "video" ? "Video" : e.kind === "audio" ? "Audio" : "Image"
					}) : o.getState().updateNode(n, {
						mediaKind: e.kind || "image",
						name: e.name || "asset",
						url: e.url
					}), t());
					return;
				}
			} catch (e) {
				console.warn("[canvas-modern-core] invalid smart asset drag payload", e);
			}
			let c = e.dataTransfer.getData("application/x-canvas-output-image");
			if (c) try {
				let e = JSON.parse(c);
				if (e.url) {
					let n = o.getState().addNode("image", i);
					n && (o.getState().updateNode(n, {
						mediaKind: e.kind || "image",
						name: e.name || "output",
						url: e.url
					}), t());
					return;
				}
			} catch (e) {
				console.warn("[canvas-modern-core] invalid output drag payload", e);
			}
			let l = [...e.dataTransfer.files].filter((e) => /^(image|video|audio)\//.test(e.type));
			l.length && window.CanvasBoardV2?.importFiles(l, i);
		},
		onPointerDown: (e) => {
			if (e.button !== 0 && e.button !== 1) return;
			e.preventDefault();
			let t = e.currentTarget;
			if (!r) {
				if (e.button !== 0) return;
				let n = {
					x: e.clientX,
					y: e.clientY,
					viewport: F
				};
				t.setPointerCapture(e.pointerId), w(/* @__PURE__ */ new Set()), S(-1);
				let r = (e) => I((t) => ({
					...t,
					x: n.viewport.x + e.clientX - n.x,
					y: n.viewport.y + e.clientY - n.y
				}));
				t.addEventListener("pointermove", r), t.addEventListener("pointerup", () => t.removeEventListener("pointermove", r), { once: !0 });
				return;
			}
			let n = t.getBoundingClientRect(), i = {
				localX: e.clientX - n.left,
				localY: e.clientY - n.top,
				x: e.clientX,
				y: e.clientY,
				viewport: F
			};
			t.setPointerCapture(e.pointerId), B(null), S(-1);
			let a = e.button === 0 && (e.ctrlKey || e.metaKey || h.current), s = !1, l = i.viewport, u = {
				height: 0,
				left: i.localX,
				top: i.localY,
				width: 0
			}, d = (e) => {
				if (s ||= Math.hypot(e.clientX - i.x, e.clientY - i.y) > 4, a) {
					let t = e.clientX - n.left, r = e.clientY - n.top;
					u = {
						height: Math.abs(r - i.localY),
						left: Math.min(t, i.localX),
						top: Math.min(r, i.localY),
						width: Math.abs(t - i.localX)
					}, re(u);
					return;
				}
				l = {
					...i.viewport,
					x: i.viewport.x + e.clientX - i.x,
					y: i.viewport.y + e.clientY - i.y
				}, I(l);
			};
			t.addEventListener("pointermove", d), t.addEventListener("pointerup", () => {
				if (t.removeEventListener("pointermove", d), a) {
					let e = {
						height: u.height / i.viewport.zoom,
						width: u.width / i.viewport.zoom,
						x: (u.left - i.viewport.x) / i.viewport.zoom,
						y: (u.top - i.viewport.y) / i.viewport.zoom
					}, t = (o.getState().document?.nodes ?? []).filter((t) => {
						let n = zi(t), r = Ui(t);
						return Hi({
							...n,
							...r
						}, e);
					}).map((e) => e.id);
					w(new Set(t)), re(null);
				} else s ? Vi(c, l) : e.button === 0 && w(/* @__PURE__ */ new Set());
			}, { once: !0 });
		},
		onPointerMove: (e) => {
			let t = e.currentTarget.getBoundingClientRect();
			p.current = {
				x: (e.clientX - t.left - F.x) / F.zoom,
				y: (e.clientY - t.top - F.y) / F.zoom
			};
		},
		onWheel: (e) => {
			if (e.preventDefault(), !r) {
				I((t) => ({
					...t,
					zoom: Math.min(1.5, Math.max(.25, t.zoom * (e.deltaY < 0 ? 1.1 : .9)))
				}));
				return;
			}
			B(null);
			let t = e.currentTarget.getBoundingClientRect(), n = {
				x: e.clientX - t.left,
				y: e.clientY - t.top
			};
			I((t) => {
				let r = {
					x: (n.x - t.x) / t.zoom,
					y: (n.y - t.y) / t.zoom
				}, i = Math.min(1.5, Math.max(.25, t.zoom * (e.deltaY < 0 ? 1.08 : .92))), a = {
					x: n.x - r.x * i,
					y: n.y - r.y * i,
					zoom: i
				};
				return Vi(c, a), a;
			});
		},
		ref: l,
		style: {
			backgroundColor: r ? void 0 : "var(--page)",
			backgroundImage: r ? void 0 : "radial-gradient(var(--grid) 1px, transparent 1px)",
			backgroundSize: r ? void 0 : "24px 24px",
			inset: 0,
			overflow: "hidden",
			position: "absolute",
			touchAction: "none"
		},
		children: [
			r ? /* @__PURE__ */ (0, K.jsx)("div", {
				className: `drop-overlay ${ie ? "active" : ""}`,
				children: "拖放素材到画布"
			}) : null,
			r && ne ? /* @__PURE__ */ (0, K.jsx)("div", {
				className: "selection-box",
				style: {
					...ne,
					display: "block"
				}
			}) : null,
			/* @__PURE__ */ (0, K.jsx)("div", {
				"aria-live": "polite",
				"data-testid": "canvas-board-v2-save-status",
				style: {
					position: "absolute",
					right: 18,
					top: 74,
					zIndex: 20
				},
				children: T === "saving" ? "正在保存" : T === "error" ? "保存失败，本地修改仍保留" : T === "saved" ? "已保存" : ""
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: r ? `world ${Math.abs(F.zoom - 1) > .001 ? "canvas-scaled" : ""}`.trim() : void 0,
				style: {
					height: r ? void 0 : Pi,
					position: "absolute",
					transform: `translate(${F.x}px, ${F.y}px) scale(${F.zoom})`,
					transformOrigin: r ? void 0 : "0 0",
					width: r ? void 0 : Ni
				},
				children: [
					a ? /* @__PURE__ */ (0, K.jsx)(ir, {
						document: le,
						drag: y,
						nodeRect: (e) => ({
							...zi(e),
							...Ui(e)
						}),
						onCut: (e) => {
							N || (o.getState().deleteConnection(e), S(-1), t());
						},
						onSelect: (e) => {
							S(e), w(/* @__PURE__ */ new Set());
						},
						selectedIndex: x
					}) : /* @__PURE__ */ (0, K.jsx)("svg", {
						className: r ? "links" : void 0,
						height: Pi,
						style: r ? void 0 : {
							inset: 0,
							overflow: "visible",
							position: "absolute"
						},
						width: Ni,
						children: (s?.connections ?? []).map((e, t) => {
							let n = H.get(e.from), r = H.get(e.to);
							if (!n || !r) return null;
							let i = zi(n), a = zi(r), o = Ui(n), s = Ui(r), c = {
								x1: i.x + o.width,
								x2: a.x,
								y1: i.y + o.height / 2,
								y2: a.y + s.height / 2
							};
							return /* @__PURE__ */ (0, K.jsxs)("g", { children: [/* @__PURE__ */ (0, K.jsx)("line", {
								...c,
								stroke: x === t ? "var(--strong)" : "var(--line-2)",
								strokeWidth: "2"
							}), /* @__PURE__ */ (0, K.jsx)("line", {
								...c,
								"data-edge-index": t,
								"data-selected": x === t ? "true" : "false",
								onClick: (e) => {
									e.stopPropagation(), S(t), w(/* @__PURE__ */ new Set());
								},
								onPointerDown: (e) => e.stopPropagation(),
								pointerEvents: "stroke",
								stroke: "rgba(0,0,0,.001)",
								strokeWidth: "16"
							})] }, `${e.from}-${e.to}-${t}`);
						})
					}),
					(s?.nodes ?? []).map((n) => {
						let i = zi(n), s = Ui(n);
						if (a && n.type === "smart-image") return /* @__PURE__ */ (0, K.jsx)(xr, {
							connecting: !!(_ && y?.fromPort === "out" && ue?.canConnect(_, n.id)),
							node: n,
							onAppendFiles: (e) => void Te(n.id, e),
							onConnectIn: () => pe(n.id),
							onConnectOut: () => me(n.id),
							onDelete: () => {
								o.getState().deleteNode(n.id), w(/* @__PURE__ */ new Set()), t();
							},
							onDeleteImage: (e) => {
								let r = o.getState().document?.nodes.find((e) => e.id === n.id);
								if (!r) return;
								let i = fr(r).filter((t, n) => n !== e);
								o.getState().updateNode(n.id, {
									h: void 0,
									images: i,
									scale: i.length > 1 ? .8 : 2,
									title: i.length > 1 ? "Group" : i.length ? "Image" : "上传节点",
									w: void 0
								}), t();
							},
							onMoveStart: (e) => {
								if (e.button !== 0 || N || e.target.closest("button, audio, video, .node-drop")) return;
								e.stopPropagation();
								let r = e.currentTarget, i = C.has(n.id) ? new Set(C) : /* @__PURE__ */ new Set([n.id]), a = new Map((o.getState().document?.nodes ?? []).filter((e) => i.has(e.id)).map((e) => [e.id, zi(e)])), s = {
									clientX: e.clientX,
									clientY: e.clientY
								}, c = !1;
								r.setPointerCapture(e.pointerId), !C.has(n.id) && !e.ctrlKey && !e.metaKey && w(i);
								let l = (e) => {
									c = !0;
									let t = {
										x: (e.clientX - s.clientX) / F.zoom,
										y: (e.clientY - s.clientY) / F.zoom
									};
									a.forEach((e, n) => o.getState().moveNode(n, e.x + t.x, e.y + t.y));
								};
								r.addEventListener("pointermove", l), r.addEventListener("pointerup", () => {
									r.removeEventListener("pointermove", l), c && t();
								}, { once: !0 });
							},
							onPatch: (e, r = !1) => {
								let i = o.getState().document?.nodes.find((e) => e.id === n.id);
								i && (o.getState().updateNode(n.id, typeof e == "function" ? e(i) : e), r && t());
							},
							onPreview: (e) => O({
								nodeId: n.id,
								url: e
							}),
							onSelect: (e) => {
								S(-1), w((t) => {
									if (!e.ctrlKey && !e.metaKey) return /* @__PURE__ */ new Set([n.id]);
									let r = new Set(t);
									return r.has(n.id) ? r.delete(n.id) : r.add(n.id), r;
								});
							},
							readOnly: N,
							selected: C.has(n.id)
						}, n.id);
						if (a && n.type === "prompt") {
							let e = Ri()?.getNodeOptions("llm", "provider", n) ?? [], r = {
								label: String(n.llmProvider || "comfly"),
								models: [String(n.llmModel || "gpt-4o-mini")],
								value: String(n.llmProvider || "comfly")
							}, i = e.length ? e.map((e) => ({
								label: e.label,
								models: (Ri()?.getNodeOptions("llm", "model", {
									...n,
									llmProvider: e.value
								}) ?? []).map((e) => e.value),
								value: e.value
							})) : [r];
							return /* @__PURE__ */ (0, K.jsx)(Mi, {
								connecting: !!(_ && y?.fromPort === "out" && ue?.canConnect(_, n.id)),
								media: oa(le, n),
								node: n,
								onConnectIn: () => pe(n.id),
								onConnectOut: () => me(n.id),
								onDelete: () => {
									o.getState().deleteNode(n.id), w(/* @__PURE__ */ new Set()), t();
								},
								onMoveStart: (e) => {
									if (e.button !== 0 || N || e.target.closest("button, textarea, select, .node-port, .prompt-llm-instruction-resize")) return;
									e.stopPropagation();
									let r = e.currentTarget, i = C.has(n.id) ? new Set(C) : /* @__PURE__ */ new Set([n.id]), a = new Map((o.getState().document?.nodes ?? []).filter((e) => i.has(e.id)).map((e) => [e.id, zi(e)])), s = {
										clientX: e.clientX,
										clientY: e.clientY
									}, c = !1;
									r.setPointerCapture(e.pointerId), !C.has(n.id) && !e.ctrlKey && !e.metaKey && w(i);
									let l = (e) => {
										c = !0;
										let t = {
											x: (e.clientX - s.clientX) / F.zoom,
											y: (e.clientY - s.clientY) / F.zoom
										};
										a.forEach((e, n) => o.getState().moveNode(n, e.x + t.x, e.y + t.y));
									};
									r.addEventListener("pointermove", l), r.addEventListener("pointerup", () => {
										r.removeEventListener("pointermove", l), c && t();
									}, { once: !0 });
								},
								onOpenTemplate: () => ce({
									initialText: String(n.text || ""),
									nodeId: n.id,
									target: "node"
								}),
								onOpenPreset: () => oe(n.id),
								onPatch: (e, r = !1) => {
									o.getState().updateNode(n.id, e), r && t();
								},
								onRun: () => window.CanvasBoardV2?.runNode(n.id),
								onSelect: (e) => {
									S(-1), w((t) => {
										if (!e.ctrlKey && !e.metaKey) return /* @__PURE__ */ new Set([n.id]);
										let r = new Set(t);
										return r.has(n.id) ? r.delete(n.id) : r.add(n.id), r;
									});
								},
								providers: i,
								readOnly: N,
								selected: C.has(n.id)
							}, n.id);
						}
						return a && n.type === "loop" ? /* @__PURE__ */ (0, K.jsx)(Ti, {
							connecting: !!(_ && y?.fromPort === "out" && ue?.canConnect(_, n.id)),
							media: oa(le, n),
							node: n,
							onConnectIn: () => pe(n.id),
							onConnectOut: () => me(n.id),
							onDelete: () => {
								o.getState().deleteNode(n.id), w(/* @__PURE__ */ new Set()), t();
							},
							onMoveStart: (e) => {
								if (e.button !== 0 || N || e.target.closest("button, input, [contenteditable=\"true\"], .node-port")) return;
								e.stopPropagation();
								let r = e.currentTarget, i = C.has(n.id) ? new Set(C) : /* @__PURE__ */ new Set([n.id]), a = new Map((o.getState().document?.nodes ?? []).filter((e) => i.has(e.id)).map((e) => [e.id, zi(e)])), s = {
									clientX: e.clientX,
									clientY: e.clientY
								}, c = !1;
								r.setPointerCapture(e.pointerId), !C.has(n.id) && !e.ctrlKey && !e.metaKey && w(i);
								let l = (e) => {
									c = !0;
									let t = {
										x: (e.clientX - s.clientX) / F.zoom,
										y: (e.clientY - s.clientY) / F.zoom
									};
									a.forEach((e, n) => o.getState().moveNode(n, e.x + t.x, e.y + t.y));
								};
								r.addEventListener("pointermove", l), r.addEventListener("pointerup", () => {
									r.removeEventListener("pointermove", l), c && t();
								}, { once: !0 });
							},
							onPatch: (e, r = !1) => {
								o.getState().updateNode(n.id, e), r && t();
							},
							onRun: () => Ne(n),
							onSelect: (e) => {
								S(-1), w((t) => {
									if (!e.ctrlKey && !e.metaKey) return /* @__PURE__ */ new Set([n.id]);
									let r = new Set(t);
									return r.has(n.id) ? r.delete(n.id) : r.add(n.id), r;
								});
							},
							readOnly: N,
							selected: C.has(n.id),
							upstreamPrompts: sa(le, n)
						}, n.id) : /* @__PURE__ */ (0, K.jsxs)("article", {
							"aria-label": `${n.type} ${n.id}`,
							className: `node ${n.type}-node sized ${n.url ? "has-image" : ""} ${C.has(n.id) ? "selected" : ""}`,
							"data-node-id": n.id,
							"data-node-type": n.type,
							onClick: (e) => {
								e.stopPropagation(), S(-1), w((t) => {
									if (!e.ctrlKey && !e.metaKey) return /* @__PURE__ */ new Set([n.id]);
									let r = new Set(t);
									return r.has(n.id) ? r.delete(n.id) : r.add(n.id), r;
								});
							},
							onKeyDown: (e) => {
								(e.key === "Enter" || e.key === " ") && w(/* @__PURE__ */ new Set([n.id]));
							},
							onPointerDown: (e) => {
								if (e.button !== 0 || (e.stopPropagation(), e.ctrlKey || e.metaKey)) return;
								let i = e.currentTarget, a = r && C.has(n.id) ? new Set(C) : /* @__PURE__ */ new Set([n.id]), s = new Map((o.getState().document?.nodes ?? []).filter((e) => a.has(e.id)).map((e) => [e.id, zi(e)])), c = {
									clientX: e.clientX,
									clientY: e.clientY
								}, l = !1;
								i.setPointerCapture(e.pointerId), S(-1), !C.has(n.id) && !e.ctrlKey && !e.metaKey && w(a);
								let u = (e) => {
									l = !0;
									let t = {
										x: (e.clientX - c.clientX) / F.zoom,
										y: (e.clientY - c.clientY) / F.zoom
									};
									s.forEach((e, n) => o.getState().moveNode(n, e.x + t.x, e.y + t.y));
								};
								i.addEventListener("pointermove", u), i.addEventListener("pointerup", () => {
									i.removeEventListener("pointermove", u), l && t();
								}, { once: !0 });
							},
							role: "button",
							style: {
								height: s.height,
								left: i.x,
								minHeight: s.height,
								minWidth: s.width,
								top: i.y,
								width: s.width
							},
							tabIndex: 0,
							children: [
								Wi(n) ? /* @__PURE__ */ (0, K.jsx)("button", {
									"aria-label": `连接到 ${n.id}`,
									className: "port in node-port port-in",
									"data-port": "in",
									onClick: () => pe(n.id),
									onPointerDown: (e) => e.stopPropagation(),
									type: "button"
								}) : null,
								Gi(n) ? /* @__PURE__ */ (0, K.jsx)("button", {
									"aria-label": `从 ${n.id} 连线`,
									className: "port out node-port port-out",
									"data-port": "out",
									onClick: () => me(n.id),
									onPointerDown: (e) => {
										e.stopPropagation(), me(n.id);
									},
									type: "button"
								}) : null,
								/* @__PURE__ */ (0, K.jsx)("header", {
									className: "node-head",
									children: /* @__PURE__ */ (0, K.jsx)("strong", {
										className: "node-title",
										children: Li[n.type] ?? n.type
									})
								}),
								/* @__PURE__ */ (0, K.jsx)("div", {
									className: "node-body",
									children: n.type === "prompt" ? /* @__PURE__ */ (0, K.jsx)(Xi, {
										commit: t,
										node: n,
										onOpenPreset: a && !N ? oe : void 0,
										onOpenTemplate: a ? (e) => {
											let t = o.getState().document?.nodes.find((t) => t.id === e);
											t && ce({
												initialText: String(t.text || ""),
												nodeId: e,
												target: "node"
											});
										} : void 0,
										store: o
									}) : n.type === "image" ? /* @__PURE__ */ (0, K.jsx)(_a, {
										canvasRuntime: e,
										commit: t,
										node: n,
										onEdit: () => M(n.id),
										store: o
									}) : n.type === "group" ? /* @__PURE__ */ (0, K.jsx)(va, {
										node: n,
										nodesById: H
									}) : n.type === "promptGroup" ? /* @__PURE__ */ (0, K.jsx)(Zi, {
										node: n,
										nodesById: H
									}) : n.type === "loop" ? /* @__PURE__ */ (0, K.jsx)(Qi, {
										commit: t,
										node: n,
										store: o
									}) : n.type === "generator" ? /* @__PURE__ */ (0, K.jsx)(ua, {
										commit: t,
										document: le,
										node: n,
										store: o
									}) : n.type === "msgen" ? /* @__PURE__ */ (0, K.jsx)(da, {
										commit: t,
										document: le,
										node: n,
										store: o
									}) : n.type === "output" ? /* @__PURE__ */ (0, K.jsx)(fa, {
										commit: t,
										node: n,
										store: o
									}) : n.type === "video" ? /* @__PURE__ */ (0, K.jsx)(pa, {
										commit: t,
										document: le,
										node: n,
										store: o
									}) : n.type === "llm" ? /* @__PURE__ */ (0, K.jsx)(ma, {
										commit: t,
										document: le,
										node: n,
										store: o
									}) : n.type === "comfy" ? /* @__PURE__ */ (0, K.jsx)(ga, {
										commit: t,
										document: le,
										node: n,
										store: o
									}) : n.type === "ltxDirector" ? /* @__PURE__ */ (0, K.jsx)(ya, {
										commit: t,
										document: le,
										node: n,
										store: o
									}) : String(n.title || n.name || n.id)
								})
							]
						}, n.id);
					}),
					a ? /* @__PURE__ */ (0, K.jsx)(zn, {
						canvasRuntime: e,
						document: s,
						generator: xe,
						onPatchGenerator: Se,
						onPatchOutput: Ce,
						onOpenTemplate: (e, t) => ce({
							initialText: e,
							onApply: t,
							target: "composer"
						}),
						onRun: we,
						output: W,
						readOnly: N
					}) : null
				]
			}),
			r && z ? /* @__PURE__ */ (0, K.jsx)("div", {
				className: "create-menu open",
				onPointerDown: (e) => e.stopPropagation(),
				style: {
					left: z.left,
					top: z.top
				},
				children: Ii.map(([e, n, r]) => /* @__PURE__ */ (0, K.jsxs)("button", {
					className: "menu-btn",
					onClick: () => {
						let n = o.getState().addNode(e, z.point);
						n && (w(/* @__PURE__ */ new Set([n])), t()), B(null);
					},
					type: "button",
					children: [/* @__PURE__ */ (0, K.jsx)("i", {
						className: "w-4 h-4",
						"data-lucide": r
					}), /* @__PURE__ */ (0, K.jsx)("span", { children: n })]
				}, e))
			}) : null,
			a && z ? /* @__PURE__ */ (0, K.jsx)(or, {
				left: z.left,
				onCreate: ye,
				top: z.top
			}) : null,
			a && V && H.get(V) ? /* @__PURE__ */ (0, K.jsx)(Lr, {
				boardRef: l,
				node: H.get(V),
				onClearPreset: (e) => {
					let n = o.getState().document;
					n && (o.getState().projectDocument({
						...n,
						nodes: n.nodes.map((t) => String(t.promptPresetId || "") === e ? {
							...t,
							promptPresetId: void 0
						} : t)
					}), t());
				},
				onClose: () => oe(""),
				onPatchNode: (e, n) => {
					o.getState().updateNode(e, n), t();
				},
				readOnly: N
			}) : null,
			a && se ? /* @__PURE__ */ (0, K.jsx)(Kr, {
				initialText: se.initialText,
				onApply: (e, n) => {
					se.target === "composer" ? se.onApply?.(e) : se.nodeId && (o.getState().updateNode(se.nodeId, {
						promptPresetId: n,
						text: e
					}), t());
				},
				onClose: () => ce(null),
				readOnly: N,
				target: se.target
			}) : null,
			a ? /* @__PURE__ */ (0, K.jsx)("input", {
				accept: "image/*,video/*,audio/*",
				hidden: !0,
				id: "fileInput",
				multiple: !0,
				type: "file"
			}) : null,
			r ? /* @__PURE__ */ (0, K.jsx)("div", {
				className: "minimap",
				onPointerDown: (e) => {
					e.preventDefault(), e.stopPropagation();
					let t = e.currentTarget;
					U(e.clientX, e.clientY), t.setPointerCapture(e.pointerId);
					let n = (e) => U(e.clientX, e.clientY);
					t.addEventListener("pointermove", n), t.addEventListener("pointerup", () => t.removeEventListener("pointermove", n), { once: !0 });
				},
				title: "导航地图",
				children: /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "minimap-content",
					children: [
						(s?.nodes ?? []).map((e) => {
							let t = zi(e), n = Ui(e);
							return /* @__PURE__ */ (0, K.jsx)("div", {
								className: `minimap-node ${C.has(e.id) ? "selected" : ""}`,
								"data-minimap-node-id": e.id,
								style: {
									height: `${Math.max(2, n.height / Pi * 110)}px`,
									left: `${t.x / Ni * 100}%`,
									top: `${t.y / Pi * 100}%`,
									width: `${Math.max(2, n.width / Ni * 172)}px`
								}
							}, e.id);
						}),
						(s?.nodes ?? []).length ? null : /* @__PURE__ */ (0, K.jsx)("div", {
							className: "minimap-empty",
							children: "暂无节点"
						}),
						/* @__PURE__ */ (0, K.jsx)("div", {
							className: "minimap-viewport",
							style: {
								height: `${Math.max(4, L.height / F.zoom / Pi * 100)}%`,
								left: `${-F.x / F.zoom / Ni * 100}%`,
								top: `${-F.y / F.zoom / Pi * 100}%`,
								width: `${Math.max(4, L.width / F.zoom / Ni * 100)}%`
							}
						})
					]
				})
			}) : null,
			a ? /* @__PURE__ */ (0, K.jsx)(kr, {
				boardHeight: L.height,
				boardWidth: L.width,
				nodes: (s?.nodes ?? []).map((e) => ({
					...zi(e),
					...Ui(e),
					id: e.id
				})),
				onLocate: ve,
				viewport: F
			}) : null,
			D && he ? a ? /* @__PURE__ */ (0, K.jsx)(Xr, {
				document: s,
				node: he,
				onClose: () => O(null),
				onEdit: (e, t) => {
					A({
						imageIndex: e,
						mode: t,
						nodeId: he.id
					}), O(null);
				},
				onExportVideoFrame: (e) => Me(he, e),
				onNavigate: (e) => O({
					nodeId: he.id,
					url: e
				}),
				onRememberSize: (e, n, r) => {
					let i = o.getState().document?.nodes.find((e) => e.id === he.id);
					if (!i || !Array.isArray(i.images)) return;
					let a = i.images.map((t, i) => i === e && t && typeof t == "object" && !Array.isArray(t) ? {
						...t,
						natural_h: r,
						natural_w: n
					} : t);
					o.getState().updateNode(i.id, { images: a }), t();
				},
				url: D.url
			}) : r ? /* @__PURE__ */ (0, K.jsx)(fn, {
				node: he,
				onClose: () => O(null),
				onNavigate: (e) => O({
					nodeId: he.id,
					url: e
				}),
				onRerun: (e) => {
					window.CanvasBoardV2?.rerunFromOutputMeta(e), O(null);
				},
				onViewed: (e) => {
					let n = o.getState().document?.nodes.find((e) => e.id === he.id);
					if (!n || !Array.isArray(n.images)) return;
					let r = !1, i = n.images.map((t) => !t || typeof t != "object" || Array.isArray(t) || String(t.url || "") !== e || t.viewed ? t : (r = !0, {
						...t,
						viewed: !0
					}));
					r && (o.getState().updateNode(n.id, { images: i }), t());
				},
				url: D.url
			}) : /* @__PURE__ */ (0, K.jsx)(Ca, {
				node: he,
				onClose: () => O(null),
				url: D.url
			}) : null,
			a && k && ge ? /* @__PURE__ */ (0, K.jsx)(Sr, {
				imageIndex: k.imageIndex,
				initialMode: k.mode,
				node: ge,
				onApply: Oe,
				onClose: () => A(null),
				onCreateMask: ke,
				onGridJoin: je,
				onGridSplit: Ae
			}) : null,
			_e?.url ? r ? /* @__PURE__ */ (0, K.jsx)(Bt, {
				name: String(_e.name || "image"),
				onApply: async (n) => {
					if (N) throw Error("只读模式不能编辑图片");
					let r = (await e.uploadMedia([new File([n.blob], n.name, { type: "image/png" })])).files?.[0];
					if (!r?.url) throw Error("图片上传失败");
					let i = o.getState().document?.nodes.find((e) => e.id === _e.id);
					if (!i?.url) throw Error("图片节点已经被移除");
					let a = Array.isArray(i.imageEditHistory) ? i.imageEditHistory : [], s = {
						kind: i.mediaKind || "image",
						name: i.name || "image",
						outpaintSize: i.outpaintSize,
						url: i.url
					};
					o.getState().updateNode(i.id, {
						editOriginalUrl: i.editOriginalUrl || i.url,
						imageEditHistory: [...a, s].slice(-10),
						lastImageEdit: {
							height: n.height,
							mode: n.mode,
							width: n.width
						},
						mediaKind: r.kind || "image",
						name: r.name || n.name,
						natural_h: n.height,
						natural_w: n.width,
						outpaintSize: n.mode === "outpaint" ? {
							height: n.height,
							width: n.width
						} : void 0,
						url: r.url
					}), t();
				},
				onClose: () => M(""),
				onCreateMask: async (n) => {
					if (N) throw Error("只读模式不能编辑图片");
					let r = (await e.uploadMedia([new File([n.blob], n.name, { type: "image/png" })])).files?.[0];
					if (!r?.url) throw Error("遮罩上传失败");
					let i = o.getState().document?.nodes.find((e) => e.id === _e.id);
					if (!i) throw Error("图片节点已经被移除");
					let a = o.getState().addNode("image", {
						x: Number(i.x || 0) + Number(i.w || 260) + 36,
						y: Number(i.y || 0) + 28
					});
					if (!a) throw Error("无法创建遮罩节点");
					o.getState().updateNode(a, {
						mediaKind: r.kind || "image",
						name: r.name || n.name,
						natural_h: n.height,
						natural_w: n.width,
						role: "mask",
						url: r.url
					}), t();
				},
				onGridSplit: async (n) => {
					if (N) throw Error("只读模式不能编辑图片");
					let r = n.items.map((e) => new File([e.blob], e.name, { type: "image/png" })), i = await e.uploadMedia(r);
					if (!i.files?.length) throw Error("切分图片上传失败");
					let a = o.getState().document, s = a?.nodes.find((e) => e.id === _e.id);
					if (!a || !s) throw Error("图片节点已经被移除");
					let c = a.connections.filter((e) => e.from === s.id).map((e) => a.nodes.find((t) => t.id === e.to)).find((e) => e?.type === "output")?.id || o.getState().addNode("output", {
						x: Number(s.x || 0) + Number(s.w || 260) + 36,
						y: Number(s.y || 0)
					});
					if (!c) throw Error("无法创建 Output 节点");
					let l = {
						name: String(s.name || "source image"),
						url: String(s.url || "")
					}, u = i.files.slice(0, n.items.length).map((e, t) => ({
						grid: {
							...n.layout,
							...n.items[t].rect
						},
						kind: e.kind || "image",
						name: e.name || n.items[t].name,
						run: {
							prompt: "宫格切分",
							refs: [l]
						},
						runMs: 0,
						url: e.url || "",
						viewed: !1
					})).filter((e) => e.url);
					if (!u.length) throw Error("切分图片上传结果为空");
					o.getState().updateNode(c, {
						imageComparisons: Object.fromEntries(u.map((e) => [e.url, l])),
						images: u,
						outputLayout: n.layout
					}), t();
				},
				url: String(_e.url)
			}) : /* @__PURE__ */ (0, K.jsx)(Lt, {
				name: String(_e.name || "image"),
				onApply: async (n) => {
					if (N) throw Error("只读模式不能编辑图片");
					let r = (await e.uploadMedia([new File([n.blob], n.name, { type: "image/png" })])).files?.[0];
					if (!r?.url) throw Error("图片上传失败");
					let i = o.getState().document?.nodes.find((e) => e.id === _e.id);
					if (!i?.url) throw Error("图片节点已经被移除");
					let a = Array.isArray(i.imageEditHistory) ? i.imageEditHistory : [], s = {
						kind: i.mediaKind || "image",
						name: i.name || "image",
						outpaintSize: i.outpaintSize,
						url: i.url
					};
					o.getState().updateNode(i.id, {
						editOriginalUrl: i.editOriginalUrl || i.url,
						imageEditHistory: [...a, s].slice(-10),
						lastImageEdit: {
							height: n.height,
							mode: n.mode,
							width: n.width
						},
						mediaKind: r.kind || "image",
						name: r.name || n.name,
						natural_h: n.height,
						natural_w: n.width,
						outpaintSize: n.mode === "outpaint" ? {
							height: n.height,
							width: n.width
						} : void 0,
						url: r.url
					}), t();
				},
				onClose: () => M(""),
				url: String(_e.url)
			}) : null,
			N ? /* @__PURE__ */ (0, K.jsx)("div", {
				"aria-hidden": "true",
				className: "canvas-board-readonly-shield",
				"data-testid": "canvas-board-readonly-shield",
				style: { pointerEvents: "none" }
			}) : null
		]
	});
}
function Sa(e, t, n) {
	let r = e && typeof e == "object" && !Array.isArray(e) ? { ...e } : {}, i = [
		"api",
		"volcengine",
		"modelscope",
		"comfy"
	].includes(String(r.engine || "")) ? String(r.engine) : "api", a = {
		...r,
		customHeight: n,
		customSize: `${t}x${n}`,
		customWidth: t,
		engine: i,
		outpaintResolutionLocked: !0,
		ratio: "",
		resolution: "custom"
	};
	return (i === "api" || i === "volcengine") && (a.apiKind = "image"), i === "modelscope" && Object.assign(a, {
		msCustomHeight: n,
		msCustomSize: `${t}x${n}`,
		msCustomWidth: t,
		msRatio: "",
		msResolution: "custom"
	}), i === "comfy" && Object.assign(a, {
		height: n,
		width: t
	}), a;
}
function Ca({ node: e, onClose: t, url: n }) {
	let [r, i] = (0, G.useState)(50), a = e.imageComparisons?.[n]?.url || "", o = /\.(mp4|webm|mov)(\?|$)/i.test(n);
	return /* @__PURE__ */ (0, K.jsx)("div", {
		className: "output-lightbox open canvas-v2-lightbox",
		onClick: t,
		role: "dialog",
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "output-lightbox-shell",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, K.jsx)("button", {
					"aria-label": "关闭预览",
					className: "output-lightbox-close",
					onClick: t,
					type: "button",
					children: "×"
				}),
				o ? /* @__PURE__ */ (0, K.jsx)("video", {
					autoPlay: !0,
					controls: !0,
					src: n
				}) : /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "output-compare",
					children: [
						" ",
						/* @__PURE__ */ (0, K.jsx)("img", {
							alt: "生成结果",
							src: n
						}),
						a ? /* @__PURE__ */ (0, K.jsx)("div", {
							className: "output-compare-original-wrap",
							style: { width: `${r}%` },
							children: /* @__PURE__ */ (0, K.jsx)("img", {
								alt: "原始参考",
								src: a
							})
						}) : null
					]
				}),
				a && !o ? /* @__PURE__ */ (0, K.jsx)("input", {
					"aria-label": "对比滑块",
					max: "100",
					min: "0",
					onChange: (e) => i(Number(e.target.value)),
					type: "range",
					value: r
				}) : null,
				/* @__PURE__ */ (0, K.jsx)("a", {
					download: !0,
					href: n,
					children: "下载"
				})
			]
		})
	});
}
function wa(e, t, n = {}) {
	let r = window.CanvasLegacyBridge, i = n.repository ?? window.CanvasModernCore?.canvasRepository, a = n.runtime ?? Ri(), o = n.initialDocument !== void 0, s = n.initialDocument ?? r?.getDocumentSnapshot();
	if (!i || !a || o && !s || !o && !r) throw Error("Canvas V2 dependencies are unavailable");
	let c = wt(s), l = c.getState().document, u = Ta(c.getState().document), d = [], f = [], p = (e) => {
		let t = c.getState().document?.id;
		c.getState().adoptDocument(e.detail);
		let n = c.getState().document;
		n?.id !== t && (l = n);
	}, m = (e) => c.getState().projectExecutionDocument(e.detail);
	o || (window.addEventListener("canvas-legacy-document", p), window.addEventListener("canvas-legacy-execution-document", m));
	let h = (0, Ze.createRoot)(e), g = t?.hidden ?? !0, _ = !1, v = !1, y = !1, b = null, x = (e) => ({
		...Ie(e),
		...n.clientId ? { client_id: n.clientId } : {}
	}), S = (t) => {
		e.dataset.saveState = t, window.dispatchEvent(new CustomEvent("canvas-board-v2-save-state", { detail: t }));
	}, C = (e = !0) => {
		let t = c.getState().document;
		if (t && (e && u && Ea(t) !== Ea(u) && (d.push(structuredClone(u)), d.length > 60 && d.shift(), f.length = 0), u = structuredClone(t), window.dispatchEvent(new CustomEvent("canvas-board-v2-history-state", { detail: {
			canRedo: f.length > 0,
			canUndo: d.length > 0
		} }))), v = !0, y) return;
		y = !0;
		let n = (async () => {
			for (; v && !_;) {
				v = !1;
				let e = c.getState().document;
				if (!(!e || typeof e.id != "string")) {
					S("saving");
					try {
						let t = await i.save(e.id, x(e));
						l = t, _ || c.getState().acceptSavedDocument(t, e), window.dispatchEvent(new CustomEvent("canvas-board-v2-document-saved", { detail: structuredClone(t) })), S("saved"), window.CanvasModernCore?.recordRolloutEvent("save-succeeded", { dimensions: { reason: "none" } });
					} catch (t) {
						if (t instanceof Pe && window.CanvasModernCore?.recordRolloutEvent("save-conflict", { dimensions: { reason: "save-conflict" } }), t instanceof Pe && t.serverCanvas && l) {
							let n = c.getState().document;
							if (n?.id === e.id) {
								let r = ut(l, n, t.serverCanvas);
								if (r.conflicts.length) console.warn("[canvas-modern-core] CanvasBoard V2 save conflict requires resolution", r.conflicts);
								else {
									S("merging"), c.setState({ document: r.document }), u = structuredClone(r.document);
									try {
										let t = await i.save(e.id, x(r.document));
										l = t, _ || c.getState().acceptSavedDocument(t, r.document), window.dispatchEvent(new CustomEvent("canvas-board-v2-document-saved", { detail: structuredClone(t) })), S("saved"), window.CanvasModernCore?.recordRolloutEvent("save-rebased", { dimensions: { reason: "none" } }), window.CanvasModernCore?.recordRolloutEvent("save-succeeded", { dimensions: { reason: "none" } });
										continue;
									} catch (e) {
										console.warn("[canvas-modern-core] CanvasBoard V2 rebased save failed", e);
									}
								}
							}
						}
						window.CanvasModernCore?.recordRolloutEvent("save-failed", { dimensions: { reason: "save-request-failed" } }), S("error"), console.warn("[canvas-modern-core] CanvasBoard V2 save failed", t);
						break;
					}
				}
			}
			y = !1;
		})();
		b = n, n.finally(() => {
			b === n && (b = null);
		});
	}, w = () => {
		let e = c.getState().document, t = d.pop();
		return !e || !t ? !1 : (f.push(structuredClone(e)), c.getState().projectDocument(t), u = structuredClone(t), C(!1), !0);
	}, T = () => {
		let e = c.getState().document, t = f.pop();
		return !e || !t ? !1 : (d.push(structuredClone(e)), c.getState().projectDocument(t), u = structuredClone(t), C(!1), !0);
	}, E = /* @__PURE__ */ new Set(), D = !!n.readOnly, O = (e) => {
		let t = Me(e), n = c.getState().document;
		if (!n || n.id !== t.id) return {
			conflicts: ["document.id"],
			merged: !1,
			updated: !1
		};
		if (y && !D) return {
			conflicts: ["save-in-progress"],
			merged: !1,
			updated: !1
		};
		let r = !!(l && Ea(n) !== Ea(l)), i = t, a = !1;
		if (!D && l && (r || dt(n))) {
			let e = ut(l, n, t);
			if (e.conflicts.length) return S("conflict"), {
				conflicts: e.conflicts,
				merged: !1,
				updated: !1
			};
			i = e.document, a = !0;
		}
		return l = t, c.getState().projectDocument(i), u = structuredClone(i), d.length = 0, f.length = 0, window.dispatchEvent(new CustomEvent("canvas-board-v2-history-state", { detail: {
			canRedo: !1,
			canUndo: !1
		} })), S(a ? "merging" : "saved"), a && C(!1), {
			conflicts: [],
			merged: a,
			updated: !0
		};
	}, k = window.CanvasBoardV2;
	return window.CanvasBoardV2 = {
		addNode(e, t) {
			if (D) return null;
			let n = c.getState().addNode(e, t);
			return n && C(), n;
		},
		groupSelected() {
			D || window.dispatchEvent(new Event("canvas-board-v2-group-selected"));
		},
		exportSelection() {
			let e = c.getState().document;
			if (!e) return {
				connections: [],
				nodes: []
			};
			let t = E.size ? new Set(E) : new Set(e.nodes.map((e) => e.id)), n = !0;
			for (; n;) n = !1, e.nodes.forEach((e) => {
				!t.has(e.id) || !["group", "promptGroup"].includes(e.type) || !Array.isArray(e.items) || e.items.forEach((e) => {
					let r = String(e || "");
					r && !t.has(r) && (t.add(r), n = !0);
				});
			});
			return {
				connections: structuredClone(e.connections.filter((e) => t.has(e.from) && t.has(e.to))),
				nodes: structuredClone(e.nodes.filter((e) => t.has(e.id)))
			};
		},
		importWorkflow(e) {
			if (D) return [];
			let t = Array.isArray(e.nodes) ? e.nodes : [], n = Array.isArray(e.connections) ? e.connections : [], r = [
				"comfy",
				"generator",
				"group",
				"image",
				"llm",
				"loop",
				"ltxDirector",
				"msgen",
				"output",
				"prompt",
				"promptGroup",
				"smart-image",
				"video"
			], i = /* @__PURE__ */ new Map();
			return t.forEach((e, t) => {
				if (!e || typeof e != "object") return;
				let n = e, a = String(n.type || "");
				if (!r.includes(a)) return;
				let o = c.getState().addNode(a, {
					x: Number(n.x || 0) + 48 + t % 3 * 12,
					y: Number(n.y || 0) + 48 + t % 3 * 12
				});
				if (!o) return;
				let s = String(n.id || "");
				s && i.set(s, o);
				let { id: l, type: u, x: d, y: f, ...p } = n;
				c.getState().updateNode(o, structuredClone(p));
			}), n.forEach((e) => {
				if (!e || typeof e != "object") return;
				let t = e, n = i.get(String(t.from || "")), r = i.get(String(t.to || ""));
				n && r && c.getState().connectNodes(n, r);
			}), i.size && C(), [...i.values()];
		},
		async controlExecution(e, t) {
			if (D) return;
			let n = c.getState().document;
			if (!n) return;
			let r = await a.runCommand(e, t, n, async (e) => {
				c.getState().projectExecutionDocument(e), C(!1);
			});
			c.getState().projectDocument(r), C(!1);
		},
		async importFiles(e, t) {
			if (D || !e.length) return;
			let r = await a.uploadMedia(e);
			if (n.smartUi) {
				let e = (r.files ?? []).filter((e) => e.url).map((e) => ({
					...e,
					kind: e.kind || "image",
					name: e.name || "media",
					url: e.url || ""
				}));
				if (!e.length) return;
				let n = t ?? {
					x: 500,
					y: 400
				}, i = c.getState().addNode("smart-image", {
					x: n.x - 158,
					y: n.y - 97
				});
				i && (c.getState().updateNode(i, {
					images: e,
					scale: e.length > 1 ? .8 : 2,
					title: e.length > 1 ? "Group" : e[0].kind === "video" ? "Video" : e[0].kind === "audio" ? "Audio" : "Image"
				}), C());
				return;
			}
			let i = (r.files ?? []).map((e, n) => {
				let r = c.getState().addNode("image", t ? {
					x: t.x + n * 36,
					y: t.y + n * 36
				} : void 0);
				return r && c.getState().updateNode(r, {
					url: e.url || "",
					name: e.name || "media",
					mediaKind: e.kind || "image"
				}), r;
			}).filter(Boolean);
			i.length > 1 && c.getState().groupNodes(i), i.length && C();
		},
		openPromptTemplates(e) {
			window.openPromptTemplateModal?.(e);
		},
		openOutputLightbox(e, t) {
			if (D) {
				n.initialDocument ? window.dispatchEvent(new CustomEvent("canvas-v2-open-lightbox", { detail: {
					nodeId: String(e.id || ""),
					url: t
				} })) : r && r.openOutputLightbox(e, t);
				return;
			}
			let i = Array.isArray(e.images) ? e.images.map((e) => typeof e == "string" ? e : String(e.url || "") === t ? {
				...e,
				viewed: !0
			} : e) : [];
			c.getState().updateNode(String(e.id || ""), { images: i }), C(!1), n.legacyUi || n.initialDocument ? window.dispatchEvent(new CustomEvent("canvas-v2-open-lightbox", { detail: {
				nodeId: String(e.id || ""),
				url: t
			} })) : r && r.openOutputLightbox(e, t);
		},
		async prepareVideoMedia(e, t, n) {
			if (D) return;
			let r = c.getState().document;
			if (!r) return;
			let i = await a.prepareVideoMedia(e, r, t, n);
			c.getState().projectDocument(i), C();
		},
		rerunFromOutputMeta(e) {
			if (D) return;
			let t = e.run && typeof e.run == "object" ? e.run : {}, n = t.node && typeof t.node == "object" ? structuredClone(t.node) : {}, r = String(n.type || t.nodeType || "");
			if (![
				"comfy",
				"generator",
				"llm",
				"ltxDirector",
				"msgen",
				"video"
			].includes(r)) return;
			let i = c.getState().addNode(r);
			if (!i) return;
			let { id: a, inputs: o, running: s, type: l, x: u, y: d, ...f } = n;
			c.getState().updateNode(i, {
				...f,
				runStatus: void 0,
				runError: ""
			});
			let p = c.getState().document?.nodes.find((e) => e.id === i), m = String(t.prompt || "");
			if (m) {
				let e = c.getState().addNode("prompt", {
					x: Number(p?.x || 0) - 340,
					y: Number(p?.y || 0)
				});
				e && (c.getState().updateNode(e, { text: m }), c.getState().connectNodes(e, i));
			}
			(Array.isArray(t.refs) ? t.refs : []).slice(0, 8).forEach((e, t) => {
				if (!e.url) return;
				let n = c.getState().addNode("image", {
					x: Number(p?.x || 0) - 340,
					y: Number(p?.y || 0) + 110 + t * 86
				});
				n && (c.getState().updateNode(n, {
					mediaKind: e.kind || "image",
					name: e.name || "image",
					url: e.url
				}), c.getState().connectNodes(n, i));
			}), C();
		},
		redo() {
			return !D && T();
		},
		async runNode(e, t) {
			if (D) return;
			let n = c.getState().document;
			if (!n) return;
			let r = await a.runNode(e, n, t, async (e) => {
				c.getState().projectExecutionDocument(e), C(!1);
			});
			c.getState().projectDocument(r), C(!1);
		},
		async flushSaves() {
			for (; y || v;) {
				v && !y && C(!1);
				let e = b;
				e ? await e : await new Promise((e) => window.setTimeout(e, 0));
			}
		},
		selectedNodeIds() {
			return [...E];
		},
		setReadOnly(e) {
			D = !!e, window.dispatchEvent(new CustomEvent("canvas-board-v2-readonly", { detail: D }));
		},
		syncRemote(e) {
			return O(e);
		},
		undo() {
			return !D && w();
		},
		updateNode(e, t) {
			return D || !c.getState().document?.nodes.some((t) => t.id === e) ? !1 : (c.getState().updateNode(e, t), C(), !0);
		}
	}, h.render(/* @__PURE__ */ (0, K.jsx)(xa, {
		canvasRuntime: a,
		commit: C,
		initialReadOnly: D,
		legacyUi: !!n.legacyUi,
		onSelectionChange: (e) => {
			E = new Set(e), window.dispatchEvent(new Event("canvas-board-v2-selection"));
		},
		smartUi: !!n.smartUi,
		store: c
	})), t && (t.hidden = !0), e.hidden = !1, () => {
		_ = !0, k ? window.CanvasBoardV2 = k : delete window.CanvasBoardV2, o || (window.removeEventListener("canvas-legacy-document", p), window.removeEventListener("canvas-legacy-execution-document", m)), h.unmount(), e.hidden = !0, t && (t.hidden = g);
	};
}
function Ta(e) {
	return e ? structuredClone(e) : null;
}
function Ea(e) {
	let t = structuredClone(e);
	return delete t.updated_at, JSON.stringify(t);
}
//#endregion
//#region src/canvas/ui/canvas-app-domain.ts
function Da(e) {
	return (Array.isArray(e.logs) ? e.logs : []).reduce((e, t) => {
		if (!t || typeof t != "object") return e;
		let n = t;
		if ([
			"cancelled",
			"error",
			"failed"
		].includes(String(n.status || "").toLowerCase())) return e;
		let r = n.cost;
		if (r && typeof r == "object") {
			let t = r;
			if (String(t.status || "priced") === "priced" && Number.isFinite(Number(t.amount_micros))) return e + Math.max(0, Number(t.amount_micros)) / 1e6;
		}
		let i = typeof r == "number" ? r : Number(n.cost_cny || 0);
		return e + (Number.isFinite(i) ? Math.max(0, i) : 0);
	}, 0);
}
function Oa(e, t = Date.now()) {
	if (!e) return [];
	try {
		let n = JSON.parse(localStorage.getItem(e) || "null"), r = Number(n?.created_at || n?.ts || 0);
		return r && t - r > 18e5 ? [] : (Array.isArray(n?.items) ? n.items : []).flatMap((e) => {
			if (!e || typeof e != "object") return [];
			let t = e, n = String(t.url || "").trim();
			return n ? [{
				kind: String(t.kind || t.type || "image"),
				name: String(t.name || t.title || "素材"),
				url: n
			}] : [];
		});
	} catch {
		return [];
	}
}
//#endregion
//#region src/canvas/ui/asset-library-dialog.tsx
var ka = {
	active_library_id: "",
	libraries: []
};
function Aa({ onClose: e, request: t }) {
	let [n, r] = (0, G.useState)(ka), [i, a] = (0, G.useState)(""), [o, s] = (0, G.useState)(""), [c, l] = (0, G.useState)(""), [u, d] = (0, G.useState)(t.saveItem?.url || ""), [f, p] = (0, G.useState)(t.saveItem?.name || Ma(t.saveItem?.url || "")), [m, h] = (0, G.useState)("正在加载资产库…"), g = n.libraries.find((e) => e.id === i) ?? n.libraries[0], _ = g?.categories || [], v = _.find((e) => e.id === o) ?? _[0], y = (0, G.useMemo)(() => (v?.items || []).filter((e) => {
		let t = c.trim().toLocaleLowerCase();
		return !t || e.name.toLocaleLowerCase().includes(t) || e.url.toLocaleLowerCase().includes(t);
	}), [v, c]), b = (e, n = i, c = o) => {
		r(e);
		let l = e.libraries.find((e) => e.id === n) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0], u = t.saveWorkflow ? "workflow" : "image", d = l?.categories.find((e) => e.id === c) ?? l?.categories.find((e) => e.type === u) ?? l?.categories[0];
		a(l?.id || ""), s(d?.id || "");
	};
	(0, G.useEffect)(() => {
		let e = !0;
		return hn.list().then((t) => {
			e && (b(t.library, t.library.active_library_id, ""), h(""));
		}).catch((t) => e && h(Na(t))), () => {
			e = !1;
		};
	}, []);
	let x = (e) => {
		let r = n.libraries.find((t) => t.id === e);
		a(e);
		let i = t.saveWorkflow ? "workflow" : "image";
		s(r?.categories.find((e) => e.type === i)?.id || r?.categories[0]?.id || "");
	}, S = async (e, t, n = v?.id || "") => {
		try {
			let r = await e();
			return b(r.library, g?.id, n), h(t), r;
		} catch (e) {
			return h(Na(e)), null;
		}
	}, C = async () => {
		let e = window.prompt("新资产库名称")?.trim();
		if (!e) return;
		let t = await S(() => hn.createLibrary(e), "资产库已创建", "");
		t && b(t.library, t.library.active_library_id, "");
	}, w = async () => {
		if (!g) return;
		let e = window.prompt("资产库名称", g.name)?.trim();
		e && await S(() => hn.renameLibrary(g.id, e), "资产库已重命名");
	}, T = async () => {
		if (!g || !window.confirm(`删除资产库“${g.name}”？其中素材文件也会被删除。`)) return;
		let e = await S(() => hn.deleteLibrary(g.id), "资产库已删除", "");
		e && b(e.library, e.library.active_library_id, "");
	}, E = async () => {
		if (!g) return;
		let e = window.prompt("新分组名称")?.trim();
		if (!e) return;
		let n = t.saveWorkflow || v?.type === "workflow" ? "workflow" : "image", r = await S(() => hn.createCategory(g.id, e, n), "分组已创建");
		r?.category && b(r.library, g.id, r.category.id);
	}, D = async () => {
		if (!g || !v) return;
		let e = window.prompt("分组名称", v.name)?.trim();
		e && await S(() => hn.renameCategory(g.id, v.id, e), "分组已重命名");
	}, O = async () => {
		!g || !v || !window.confirm(`删除分组“${v.name}”？其中素材文件也会被删除。`) || await S(() => hn.deleteCategory(g.id, v.id), "分组已删除", "");
	}, k = async () => {
		if (!g || !v) {
			h("请先选择资产库与媒体分组");
			return;
		}
		if (v.type !== "image") {
			h("工作流分组不能保存媒体");
			return;
		}
		if (!u.trim()) {
			h("请输入本地 /assets 或 /output 媒体地址");
			return;
		}
		(await S(() => hn.addUrl(g.id, v.id, u.trim(), f.trim() || Ma(u)), "素材已保存"))?.item && (d(""), p(""), t.saveItem && e());
	}, A = async (e) => {
		let t = window.prompt("素材名称", e.name)?.trim();
		t && await S(() => hn.renameItem(e.id, t), "素材已重命名");
	}, j = async (e) => {
		!g || !window.confirm(`删除素材“${e.name}”？本地文件副本也会被删除。`) || await S(() => hn.deleteItem(g.id, e.id), "素材已删除");
	}, M = async () => {
		if (!(!g || !v || !t.saveWorkflow)) {
			if (v.type !== "workflow") {
				h("请选择工作流分组");
				return;
			}
			(await S(() => hn.saveWorkflow(g.id, v.id, t.saveWorkflow), "工作流已保存到资产库"))?.item && e();
		}
	}, N = async (n) => {
		try {
			n.kind === "workflow" ? await t.onImportWorkflow?.(n) : t.onInsert?.(n), e();
		} catch (e) {
			h(Na(e));
		}
	};
	return /* @__PURE__ */ (0, K.jsx)("div", {
		"aria-modal": "true",
		className: "modal open canvas-modern-backups canvas-asset-dialog",
		role: "dialog",
		children: /* @__PURE__ */ (0, K.jsxs)("section", {
			className: "modal-panel",
			children: [
				/* @__PURE__ */ (0, K.jsxs)("header", { children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: t.saveWorkflow ? "保存工作流到资产库" : t.saveItem ? "保存到资产库" : "资产库" }), /* @__PURE__ */ (0, K.jsx)("button", {
					onClick: e,
					type: "button",
					children: "关闭"
				})] }),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "canvas-asset-toolbar",
					children: [
						/* @__PURE__ */ (0, K.jsx)("select", {
							"aria-label": "资产库",
							onChange: (e) => x(e.target.value),
							value: g?.id || "",
							children: n.libraries.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
								value: e.id,
								children: e.name
							}, e.id))
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							onClick: () => void C(),
							type: "button",
							children: "新建库"
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							disabled: !g,
							onClick: () => void w(),
							type: "button",
							children: "重命名库"
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							disabled: !g || n.libraries.length <= 1,
							onClick: () => void T(),
							type: "button",
							children: "删除库"
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							disabled: !g,
							onClick: () => void E(),
							type: "button",
							children: "新建分组"
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							disabled: !v,
							onClick: () => void D(),
							type: "button",
							children: "重命名分组"
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							disabled: !v,
							onClick: () => void O(),
							type: "button",
							children: "删除分组"
						}),
						/* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "搜索资产",
							onChange: (e) => l(e.target.value),
							placeholder: "搜索名称或地址",
							value: c
						})
					]
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "canvas-asset-body",
					children: [/* @__PURE__ */ (0, K.jsx)("aside", { children: _.map((e) => /* @__PURE__ */ (0, K.jsxs)("button", {
						className: e.id === v?.id ? "active" : "",
						onClick: () => s(e.id),
						type: "button",
						children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: e.name }), /* @__PURE__ */ (0, K.jsx)("small", { children: e.type === "workflow" ? "工作流" : `${e.items.length} 项` })]
					}, e.id)) }), /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "canvas-asset-content",
						children: [
							v?.type === "image" ? /* @__PURE__ */ (0, K.jsxs)("div", {
								className: "canvas-asset-add",
								children: [
									/* @__PURE__ */ (0, K.jsx)("input", {
										"aria-label": "素材地址",
										onChange: (e) => d(e.target.value),
										placeholder: "/output/result.png 或 /assets/…",
										value: u
									}),
									/* @__PURE__ */ (0, K.jsx)("input", {
										"aria-label": "素材名称",
										onChange: (e) => p(e.target.value),
										placeholder: "素材名称（可选）",
										value: f
									}),
									/* @__PURE__ */ (0, K.jsx)("button", {
										className: "primary-btn",
										onClick: () => void k(),
										type: "button",
										children: t.saveItem ? "保存输出" : "添加地址"
									})
								]
							}) : null,
							t.saveWorkflow ? /* @__PURE__ */ (0, K.jsxs)("div", {
								className: "canvas-asset-workflow-save",
								children: [/* @__PURE__ */ (0, K.jsxs)("span", { children: [
									"将“",
									t.saveWorkflow.name,
									"”及可找到的本地资源保存到当前工作流分组。"
								] }), /* @__PURE__ */ (0, K.jsx)("button", {
									className: "primary-btn",
									disabled: v?.type !== "workflow",
									onClick: () => void M(),
									type: "button",
									children: "保存工作流"
								})]
							}) : null,
							/* @__PURE__ */ (0, K.jsx)("div", {
								className: "canvas-modern-asset-grid",
								children: y.map((e) => /* @__PURE__ */ (0, K.jsxs)("article", { children: [/* @__PURE__ */ (0, K.jsxs)("button", {
									className: "canvas-asset-preview",
									disabled: e.kind === "workflow" ? !t.onImportWorkflow : !t.onInsert,
									onClick: () => void N(e),
									type: "button",
									children: [ja(e), /* @__PURE__ */ (0, K.jsx)("small", { children: e.name })]
								}), /* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("button", {
									onClick: () => void A(e),
									type: "button",
									children: "重命名"
								}), /* @__PURE__ */ (0, K.jsx)("button", {
									onClick: () => void j(e),
									type: "button",
									children: "删除"
								})] })] }, e.id))
							}),
							y.length ? null : /* @__PURE__ */ (0, K.jsx)("p", { children: "当前分组暂无匹配内容" })
						]
					})]
				}),
				m ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "gate-status",
					role: "status",
					children: m
				}) : null
			]
		})
	});
}
function ja(e) {
	return e.kind === "image" ? /* @__PURE__ */ (0, K.jsx)("img", {
		alt: e.name,
		src: e.url
	}) : /* @__PURE__ */ (0, K.jsx)("span", { children: e.kind === "video" ? "视频" : e.kind === "audio" ? "音频" : "工作流" });
}
function Ma(e) {
	let t = e.split(/[?#]/, 1)[0];
	return decodeURIComponent(t.split("/").pop() || "生成结果");
}
function Na(e) {
	return e instanceof Error ? e.message : String(e);
}
//#endregion
//#region src/canvas/ui/smart-canvas-asset-panel.tsx
var Pa = {
	active_library_id: "",
	libraries: []
};
function Fa({ onClose: e, request: t }) {
	let [n, r] = (0, G.useState)(Pa), [i, a] = (0, G.useState)(""), [o, s] = (0, G.useState)({
		image: "",
		workflow: ""
	}), [c, l] = (0, G.useState)(t.saveWorkflow ? "workflow" : "image"), [u, d] = (0, G.useState)(""), [f, p] = (0, G.useState)("正在加载资产库…"), [m, h] = (0, G.useState)(!1), [g, _] = (0, G.useState)(""), [v, y] = (0, G.useState)(""), [b, x] = (0, G.useState)(null), [S, C] = (0, G.useState)(null), w = n.libraries.find((e) => e.id === i) ?? n.libraries[0], T = (0, G.useMemo)(() => (w?.categories || []).filter((e) => e.type === c), [w, c]), E = T.find((e) => e.id === o[c]) ?? T[0], D = (0, G.useMemo)(() => La(E, u), [E, u]), O = (e, t = w?.id || i, n = E?.id || "") => {
		r(e);
		let o = e.libraries.find((e) => e.id === t) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0];
		a(o?.id || ""), s((e) => ({
			image: o?.categories.find((t) => t.type === "image" && t.id === (c === "image" ? n : e.image))?.id || o?.categories.find((e) => e.type === "image")?.id || "",
			workflow: o?.categories.find((t) => t.type === "workflow" && t.id === (c === "workflow" ? n : e.workflow))?.id || o?.categories.find((e) => e.type === "workflow")?.id || ""
		}));
	};
	(0, G.useEffect)(() => {
		let e = !0;
		return hn.list().then((t) => {
			e && (O(t.library, t.library.active_library_id, ""), p(""));
		}).catch((t) => e && p(Ga(t))), () => {
			e = !1;
		};
	}, []), (0, G.useEffect)(() => {
		window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		D.length,
		b,
		g,
		c
	]);
	let k = async (e, t, n = E?.id || "") => {
		try {
			let r = await e();
			return O(r.library, w?.id, n), p(t), r;
		} catch (e) {
			return p(Ga(e)), null;
		}
	}, A = (e) => {
		let t = n.libraries.find((t) => t.id === e);
		a(e), s({
			image: t?.categories.find((e) => e.type === "image")?.id || "",
			workflow: t?.categories.find((e) => e.type === "workflow")?.id || ""
		});
	}, j = async () => {
		if (!(!b || !w || !b.value.trim())) {
			if (b.kind === "category-new") {
				let e = await k(() => hn.createCategory(w.id, b.value.trim(), c), "文件夹已创建", "");
				e?.category && O(e.library, w.id, e.category.id);
			} else b.category && await k(() => hn.renameCategory(w.id, b.category.id, b.value.trim()), "文件夹已重命名");
			x(null);
		}
	}, M = async (e) => {
		let t = g, n = v.trim();
		_(""), y(""), !(!e || !t || !n) && await k(() => hn.renameItem(t, n), "素材已重命名");
	}, N = async (e) => {
		if (!w || !E || E.type !== "image" || w.readonly || E.readonly) {
			p("请先选择可编辑的图片文件夹");
			return;
		}
		let t = e.filter((e) => e.url);
		t.length && await k(() => t.length === 1 ? hn.addUrl(w.id, E.id, t[0].url, t[0].name) : hn.addBatch(w.id, E.id, t), `已保存 ${t.length} 个素材`);
	}, P = async (e) => {
		if (e.preventDefault(), e.stopPropagation(), h(!1), c !== "image") return;
		let t = e.dataTransfer.getData("application/x-smart-canvas-image");
		if (t) {
			try {
				let e = JSON.parse(t);
				e.url && await N([{
					name: e.name || Wa(e.url),
					url: e.url
				}]);
			} catch {
				p("素材拖入失败");
			}
			return;
		}
		let n = [...e.dataTransfer.files].filter((e) => /^(image|video|audio)\//.test(e.type));
		if (n.length) {
			try {
				let e = await hn.upload(n);
				await N((e.files || []).flatMap((e, t) => e.url ? [{
					name: e.name || n[t]?.name || "asset",
					url: e.url
				}] : []));
			} catch (e) {
				p(Ga(e));
			}
			return;
		}
		let r = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
		/^(?:https?:\/\/|\/)/i.test(r) && await N([{
			name: Wa(r),
			url: r
		}]);
	}, F = async () => {
		if (t.saveWorkflow) {
			if (!w || !E || E.type !== "workflow") {
				p("请选择工作流文件夹");
				return;
			}
			(await k(() => hn.saveWorkflow(w.id, E.id, t.saveWorkflow), "工作流已保存到资产库"))?.item && e();
			return;
		}
		t.saveItem?.url && (await N([{
			name: t.saveItem.name || Wa(t.saveItem.url),
			url: t.saveItem.url
		}]), e());
	};
	return /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
		/* @__PURE__ */ (0, K.jsxs)("aside", {
			className: `asset-panel open ${m ? "drag-over" : ""}`,
			id: "assetPanel",
			onDragLeave: (e) => {
				e.currentTarget.contains(e.relatedTarget) || h(!1);
			},
			onDragOver: (e) => {
				c === "image" && (e.preventDefault(), e.stopPropagation(), e.dataTransfer.dropEffect = "copy", h(!0));
			},
			onDrop: (e) => void P(e),
			onPointerDown: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "asset-head",
					children: [/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "asset-title",
						children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "library" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "资产库" })]
					}), /* @__PURE__ */ (0, K.jsx)("button", {
						className: "asset-mini-btn",
						id: "assetCloseBtn",
						onClick: e,
						title: "关闭",
						type: "button",
						children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "chevron-right" })
					})]
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "asset-tabs",
					children: ["image", "workflow"].map((e) => /* @__PURE__ */ (0, K.jsx)("button", {
						className: `asset-tab ${c === e ? "active" : ""}`,
						"data-asset-tab": e,
						onClick: () => {
							l(e), d("");
						},
						type: "button",
						children: e === "image" ? "图片资产" : "工作流"
					}, e))
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					id: "assetImageControls",
					children: [/* @__PURE__ */ (0, K.jsx)("select", {
						className: "asset-category-select asset-library-select",
						id: "assetLibrarySelect",
						onChange: (e) => A(e.target.value),
						title: "选择资产库",
						value: w?.id || "",
						children: n.libraries.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
							value: e.id,
							children: e.name
						}, e.id))
					}), /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "asset-category-row",
						children: [
							/* @__PURE__ */ (0, K.jsx)("select", {
								className: "asset-category-select",
								id: "assetCategorySelect",
								onChange: (e) => s((t) => ({
									...t,
									[c]: e.target.value
								})),
								value: E?.id || "",
								children: T.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
									value: e.id,
									children: e.name
								}, e.id))
							}),
							/* @__PURE__ */ (0, K.jsx)("button", {
								className: "asset-mini-btn",
								disabled: !w || w.readonly,
								id: "assetAddCategoryBtn",
								onClick: () => x({
									kind: "category-new",
									value: c === "workflow" ? "工作流" : "素材"
								}),
								title: "新建文件夹",
								type: "button",
								children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "folder-plus" })
							}),
							/* @__PURE__ */ (0, K.jsx)("button", {
								className: "asset-mini-btn",
								disabled: !E || w?.readonly || E?.readonly,
								id: "assetRenameCategoryBtn",
								onClick: () => E && x({
									category: E,
									kind: "category-rename",
									value: E.name
								}),
								title: "重命名文件夹",
								type: "button",
								children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "pencil" })
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, K.jsxs)("label", {
					className: "asset-name-search",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "search" }), /* @__PURE__ */ (0, K.jsx)("input", {
						autoComplete: "off",
						id: "assetNameSearch",
						onChange: (e) => d(e.target.value),
						placeholder: "搜索素材名称",
						type: "search",
						value: u
					})]
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: `asset-drop-zone ${m ? "drag-over" : ""}`,
					id: "assetDropZone",
					onClick: () => {
						(t.saveItem || t.saveWorkflow) && F();
					},
					children: t.saveWorkflow ? "保存当前工作流到当前文件夹" : t.saveItem ? "保存当前素材到当前文件夹" : "把画布图片拖到这里保存到当前文件夹"
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "asset-grid",
					id: "assetGrid",
					children: D.length ? D.map((e) => /* @__PURE__ */ (0, K.jsxs)("article", {
						className: `asset-item ${c === "workflow" ? "workflow-asset-item" : ""}`,
						"data-asset-id": e.id,
						"data-kind": e.kind,
						"data-name": e.name,
						"data-url": e.url,
						draggable: c === "image",
						onDoubleClick: () => {
							if (e.kind === "workflow") {
								let n = t.onImportWorkflow?.(e);
								n instanceof Promise && n.catch((e) => p(Ga(e)));
							} else t.onInsert?.(e);
						},
						onDragStart: (t) => {
							if (c !== "image") {
								t.preventDefault();
								return;
							}
							t.dataTransfer.effectAllowed = "copy", t.dataTransfer.setData("application/x-smart-asset", JSON.stringify({
								asset_item_id: e.id,
								asset_uris: e.asset_uris || Ba(e),
								kind: e.kind,
								name: e.name,
								url: e.url
							})), t.dataTransfer.setData("text/plain", e.url);
						},
						children: [/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "asset-thumb-wrap",
							onMouseEnter: (t) => Ua(t, e, C),
							onMouseLeave: () => C(null),
							onMouseMove: (t) => Ua(t, e, C),
							children: [Ia(e), Va(e)]
						}), /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "asset-meta",
							children: [
								g === e.id ? /* @__PURE__ */ (0, K.jsx)("input", {
									"aria-label": "重命名素材",
									autoFocus: !0,
									className: "asset-rename-input",
									onBlur: () => void M(!0),
									onChange: (e) => y(e.target.value),
									onKeyDown: (e) => {
										e.key === "Enter" && M(!0), e.key === "Escape" && M(!1);
									},
									onPointerDown: (e) => e.stopPropagation(),
									value: v
								}) : /* @__PURE__ */ (0, K.jsx)("span", {
									className: "asset-name",
									title: e.name,
									children: e.name || "asset"
								}),
								Ha(e),
								!w?.readonly && !E?.readonly ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("button", {
									className: "asset-mini-btn",
									"data-rename-asset": e.id,
									onClick: (t) => {
										t.stopPropagation(), _(e.id), y(e.name || "asset");
									},
									title: "重命名",
									type: "button",
									children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "pencil" })
								}), /* @__PURE__ */ (0, K.jsx)("button", {
									className: "asset-mini-btn",
									"data-delete-asset": e.id,
									onClick: (t) => {
										t.stopPropagation(), k(() => hn.deleteItem(w.id, e.id), "素材已删除");
									},
									title: "删除",
									type: "button",
									children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "trash-2" })
								})] }) : null
							]
						})]
					}, e.id)) : /* @__PURE__ */ (0, K.jsx)("div", {
						className: "asset-empty",
						children: u && E?.items.length ? "没有找到匹配名称的素材" : c === "workflow" ? "暂无工作流资产" : "当前文件夹暂无素材"
					})
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "workflow-empty",
					id: "workflowEmpty",
					style: { display: "none" },
					children: "工作流资产先预留在这里，后续接入。"
				}),
				f ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "asset-empty",
					role: "status",
					children: f
				}) : null
			]
		}),
		/* @__PURE__ */ (0, K.jsx)("div", {
			className: `asset-dialog-backdrop ${b ? "open" : ""}`,
			hidden: !b,
			id: "assetDialogBackdrop",
			onMouseDown: (e) => {
				e.target === e.currentTarget && x(null);
			},
			children: /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "asset-dialog",
				children: [
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "asset-dialog-title",
						children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "folder-pen" }), /* @__PURE__ */ (0, K.jsx)("span", {
							id: "assetDialogTitle",
							children: b?.kind === "category-new" ? "新建文件夹" : "重命名文件夹"
						})]
					}),
					/* @__PURE__ */ (0, K.jsx)("textarea", {
						autoComplete: "off",
						className: "asset-dialog-input",
						id: "assetDialogInput",
						onChange: (e) => x((t) => t && {
							...t,
							value: e.target.value
						}),
						onKeyDown: (e) => {
							e.key === "Enter" && (e.preventDefault(), j()), e.key === "Escape" && x(null);
						},
						rows: 1,
						value: b?.value || ""
					}),
					/* @__PURE__ */ (0, K.jsx)("select", {
						className: "asset-dialog-input",
						hidden: !0,
						id: "assetDialogTarget"
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "asset-dialog-actions",
						children: [/* @__PURE__ */ (0, K.jsx)("button", {
							className: "asset-dialog-btn secondary",
							id: "assetDialogCancel",
							onClick: () => x(null),
							type: "button",
							children: "取消"
						}), /* @__PURE__ */ (0, K.jsx)("button", {
							className: "asset-dialog-btn primary",
							id: "assetDialogOk",
							onClick: () => void j(),
							type: "button",
							children: "确定"
						})]
					})
				]
			})
		}),
		S ? /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "asset-hover-preview",
			id: "assetHoverPreview",
			style: {
				display: "block",
				left: S.left,
				top: S.top
			},
			children: [S.item.kind === "video" ? /* @__PURE__ */ (0, K.jsx)("video", {
				autoPlay: !0,
				loop: !0,
				muted: !0,
				playsInline: !0,
				src: S.item.url
			}) : /* @__PURE__ */ (0, K.jsx)("img", {
				alt: "asset preview",
				src: S.item.thumbnail || S.item.url
			}), /* @__PURE__ */ (0, K.jsx)("div", {
				className: "asset-hover-name",
				children: S.item.name
			})]
		}) : null
	] });
}
function Ia(e) {
	return e.kind === "video" ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("video", {
		className: "asset-thumb",
		muted: !0,
		preload: "metadata",
		src: e.thumbnail || e.url
	}), /* @__PURE__ */ (0, K.jsxs)("span", {
		className: "asset-video-badge",
		children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "film" }), "VIDEO"]
	})] }) : e.kind === "audio" ? /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "media-thumb audio-thumb asset-thumb",
		children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "file-audio" }), /* @__PURE__ */ (0, K.jsx)("span", { children: e.name || "Audio" })]
	}) : e.kind === "workflow" ? /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "media-thumb workflow-thumb asset-thumb",
		children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "workflow" }), /* @__PURE__ */ (0, K.jsx)("span", { children: e.name || "Workflow" })]
	}) : /* @__PURE__ */ (0, K.jsx)("img", {
		alt: "",
		className: "asset-thumb",
		src: e.thumbnail || e.url
	});
}
function La(e, t) {
	let n = t.trim().toLocaleLowerCase();
	return (e?.items || []).filter((e) => !n || String(e.name || "").toLocaleLowerCase().includes(n));
}
function Ra(e) {
	return e.registrations?.volcengine;
}
function za(e) {
	return e.asset_uris?.volcengine || Ra(e)?.status === "Active" ? "active" : Ra(e)?.status === "Processing" ? "processing" : Ra(e)?.status === "Failed" ? "failed" : "none";
}
function Ba(e) {
	let t = Ra(e);
	return t?.status === "Active" && t.asset_uri ? { volcengine: t.asset_uri } : {};
}
function Va(e) {
	return za(e) === "active" ? /* @__PURE__ */ (0, K.jsx)("span", {
		className: "smart-face-verified-badge",
		title: "头像认证已通过",
		children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "badge-check" })
	}) : null;
}
function Ha(e) {
	let t = za(e);
	return t === "processing" ? /* @__PURE__ */ (0, K.jsx)("span", {
		className: "asset-local-tag",
		title: "头像认证中",
		children: "认证中"
	}) : t === "failed" ? /* @__PURE__ */ (0, K.jsx)("span", {
		className: "asset-local-tag",
		title: Ra(e)?.detail || "头像认证失败",
		children: "认证失败"
	}) : null;
}
function Ua(e, t, n) {
	let r = e.clientX - 260 - 16;
	r < 14 && (r = e.clientX + 16), n({
		item: t,
		left: Math.max(14, Math.min(window.innerWidth - 260 - 14, r)),
		top: Math.max(14, Math.min(window.innerHeight - 300 - 14, e.clientY + 12))
	});
}
function Wa(e) {
	try {
		return decodeURIComponent(e.split(/[?#]/, 1)[0].split("/").pop() || "asset");
	} catch {
		return "asset";
	}
}
function Ga(e) {
	return e instanceof Error ? e.message : String(e);
}
//#endregion
//#region src/canvas/ui/smart-canvas-workflow-panel.tsx
function Ka({ onClose: e, onImport: t, onSaveToLibrary: n, onStatus: r, title: i }) {
	let [a, o] = (0, G.useState)(() => Ya()), [s, c] = (0, G.useState)(!1), [l, u] = (0, G.useState)(""), [d, f] = (0, G.useState)(""), p = (0, G.useRef)(null);
	(0, G.useEffect)(() => {
		let e = () => o(Ya());
		return window.addEventListener("canvas-board-v2-selection", e), window.requestAnimationFrame(() => window.lucide?.createIcons()), () => window.removeEventListener("canvas-board-v2-selection", e);
	}, []);
	let m = () => {
		let e = Ya();
		return o(e), e;
	}, h = () => {
		let e = m();
		if (!e.nodes.length) {
			u("未选择节点，请先选中要导出的组件"), r("未选择节点，请先选中要导出的组件");
			return;
		}
		let t = qa(e);
		Qa(new Blob([JSON.stringify(t, null, 2)], { type: "application/json" }), Za(i, "json")), r("已导出智能画布工作流 JSON");
	}, g = async () => {
		let e = m();
		if (!e.nodes.length) {
			u("未选择节点，请先选中要导出的组件"), r("未选择节点，请先选中要导出的组件");
			return;
		}
		let t = Za(i, "zip");
		f("busy"), u("正在打包资源...");
		try {
			let n = await fetch("/api/canvas-workflows/export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...qa(e),
					filename: t,
					include_resources: !0
				})
			});
			if (!n.ok) throw Error(await $a(n, "导出工作流失败"));
			Qa(await n.blob(), t, n.headers.get("Content-Disposition")), f("success"), u(`已导出 ${e.nodes.length} 个节点，包含可找到的本地资源`), r("已导出包含资源的智能画布工作流包");
		} catch (e) {
			f(""), u(eo(e)), r(eo(e));
		}
	}, _ = async (e) => {
		if (e) {
			f("busy"), u("正在导入工作流...");
			try {
				let n = await t(e);
				r(n ? `已导入 ${n} 个节点` : "文件中没有可导入节点");
			} catch (e) {
				f(""), u(eo(e)), r(eo(e));
			}
		}
	}, v = () => {
		let e = m();
		if (!e.nodes.length) {
			u("未选择节点，请先选中要导出的组件");
			return;
		}
		n(e);
	}, y = async () => {
		let e = Ja(m().nodes);
		if (!e.length) {
			u("选区中没有可批量导出的媒体或文本"), r("选区中没有可批量导出的媒体或文本");
			return;
		}
		let t = window.prompt("导出到服务器文件夹（留空使用默认导出目录）", "");
		if (t !== null) {
			f("busy"), u("正在批量导出选区结果...");
			try {
				let n = await fetch("/api/smart-canvas/group-export", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						folder: t.trim(),
						group_name: i || "canvas",
						items: e
					})
				}), a = await n.json().catch(() => ({}));
				if (!n.ok) throw Error(a.detail || "批量导出失败");
				let o = `已导出 ${Number(a.count || e.length)} 项到 ${String(a.folder || "默认导出目录")}`;
				f("success"), u(o), r(o);
			} catch (e) {
				f(""), u(eo(e)), r(eo(e));
			}
		}
	}, b = (e) => {
		e.preventDefault(), e.stopPropagation(), c(!1);
		let t = [...e.dataTransfer.files].find((e) => /\.(json|zip)$/i.test(e.name));
		t && _(t);
	}, x = a.nodes.length ? `已选择 ${a.nodes.length} 个节点，${a.connections.length} 条连线` : "未选择节点，请先选中要导出的组件", S = a.nodes.length ? "导出当前选中内容，或把工作流导入到当前画布" : "请先选中节点再导出；导入会追加到当前画布";
	return /* @__PURE__ */ (0, K.jsxs)("aside", {
		className: "workflow-transfer-panel open",
		id: "smartWorkflowTransferModal",
		onPointerDown: (e) => e.stopPropagation(),
		children: [/* @__PURE__ */ (0, K.jsxs)("div", {
			className: "workflow-transfer-head",
			children: [/* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("div", {
				className: "workflow-transfer-title",
				children: "导入导出工作流"
			}), /* @__PURE__ */ (0, K.jsx)("div", {
				className: "workflow-transfer-sub",
				id: "smartWorkflowTransferSub",
				children: S
			})] }), /* @__PURE__ */ (0, K.jsx)("button", {
				className: "asset-mini-btn",
				onClick: e,
				title: "关闭",
				type: "button",
				children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "x" })
			})]
		}), /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "workflow-transfer-body",
			children: [/* @__PURE__ */ (0, K.jsxs)("section", {
				className: "workflow-transfer-card",
				children: [
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "workflow-transfer-card-head",
						children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "upload" }), /* @__PURE__ */ (0, K.jsx)("strong", { children: "导出工作流" })]
					}),
					/* @__PURE__ */ (0, K.jsx)("p", { children: "使用当前选中的节点和它们之间的连线生成工作流。" }),
					/* @__PURE__ */ (0, K.jsx)("div", {
						className: `workflow-transfer-meta ${d}`,
						id: "smartWorkflowExportMeta",
						children: l || x
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "workflow-transfer-actions workflow-export-actions",
						children: [
							/* @__PURE__ */ (0, K.jsxs)("button", {
								className: "workflow-transfer-btn secondary",
								onClick: h,
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "file-json" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "导出 JSON" })]
							}),
							/* @__PURE__ */ (0, K.jsxs)("button", {
								className: "workflow-transfer-btn primary",
								onClick: () => void g(),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "package" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "导出并包含资源" })]
							}),
							/* @__PURE__ */ (0, K.jsxs)("button", {
								className: "workflow-transfer-btn secondary",
								onClick: v,
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "library" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "保存到工作流库" })]
							}),
							/* @__PURE__ */ (0, K.jsxs)("button", {
								className: "workflow-transfer-btn secondary",
								onClick: () => void y(),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "folder-output" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "批量导出选区结果" })]
							})
						]
					})
				]
			}), /* @__PURE__ */ (0, K.jsxs)("section", {
				className: "workflow-transfer-card",
				children: [
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "workflow-transfer-card-head",
						children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "download" }), /* @__PURE__ */ (0, K.jsx)("strong", { children: "导入工作流" })]
					}),
					/* @__PURE__ */ (0, K.jsx)("p", { children: "支持工作流 JSON，也支持包含资源的 ZIP 包。导入内容会追加到当前画布。" }),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: `workflow-import-drop ${s ? "drag-over" : ""}`,
						id: "smartWorkflowImportDropZone",
						onClick: () => p.current?.click(),
						onDragLeave: () => c(!1),
						onDragOver: (e) => {
							e.preventDefault(), e.stopPropagation(), e.dataTransfer.dropEffect = "copy", c(!0);
						},
						onDrop: b,
						children: [
							/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "file-up" }),
							/* @__PURE__ */ (0, K.jsx)("span", { children: "拖入 JSON / ZIP 工作流" }),
							/* @__PURE__ */ (0, K.jsx)("small", { children: "或点击选择文件" })
						]
					}),
					/* @__PURE__ */ (0, K.jsx)("input", {
						accept: ".json,.zip,application/json,application/zip",
						hidden: !0,
						id: "smartWorkflowImportInput",
						onChange: (e) => {
							let t = e.target.files?.[0];
							e.target.value = "", _(t);
						},
						ref: p,
						type: "file"
					})
				]
			})]
		})]
	});
}
function qa(e, t = Date.now()) {
	return {
		format: "infinite-smart-canvas-workflow",
		version: 1,
		canvas_type: "smart",
		exported_at: t,
		nodes: e.nodes.map(Xa),
		connections: structuredClone(e.connections)
	};
}
function Ja(e) {
	let t = [], n = /* @__PURE__ */ new Set(), r = (e, r) => {
		let i = e && typeof e == "object" ? e : {}, a = typeof e == "string" ? e : String(i.url || "");
		if (!a || n.has(a)) return;
		n.add(a);
		let o = String(i.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(a) ? "video" : /\.(mp3|wav|m4a)(\?|$)/i.test(a) ? "audio" : "image"));
		t.push({
			kind: o,
			name: String(i.name || r),
			url: a
		});
	};
	return e.forEach((e, n) => {
		if (!e || typeof e != "object") return;
		let i = e, a = String(i.title || i.name || `${String(i.type || "node")}-${n + 1}`);
		i.url && r(i, a), Array.isArray(i.images) && i.images.forEach((e, t) => r(e, `${a}-${t + 1}`));
		let o = String(i.outputText || i.type === "prompt" && i.text || "").trim();
		o && t.push({
			kind: "text",
			name: `${a}.txt`,
			text: o
		});
	}), t;
}
function Ya() {
	return window.CanvasBoardV2?.selectedNodeIds().length ? window.CanvasBoardV2.exportSelection() : {
		connections: [],
		nodes: []
	};
}
function Xa(e) {
	let t = structuredClone(e && typeof e == "object" ? e : {});
	return t.running = !1, t.pending = 0, t.queued = !1, delete t.pendingTasks, delete t._dom, t;
}
function Za(e, t) {
	return `${(e || "smart-canvas").trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "-").slice(0, 48) || "smart-canvas"}-workflow-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[-:T]/g, "")}.${t}`;
}
function Qa(e, t, n) {
	let r = n?.match(/filename\*=UTF-8''([^;]+)/i)?.[1], i = n?.match(/filename="?([^";]+)"?/i)?.[1], a = URL.createObjectURL(e);
	Object.assign(document.createElement("a"), {
		download: r ? decodeURIComponent(r) : i || t,
		href: a
	}).click(), URL.revokeObjectURL(a);
}
async function $a(e, t) {
	return (await e.json().catch(() => ({}))).detail || t;
}
function eo(e) {
	return e instanceof Error ? e.message : String(e);
}
//#endregion
//#region src/canvas/ui/smart-canvas-log-cost-panel.tsx
function to({ document: e, mode: t, onClose: n }) {
	let r = Array.isArray(e.logs) ? e.logs.filter((e) => !!(e && typeof e == "object")) : [], i = ro(r), [a, o] = (0, G.useState)("");
	(0, G.useEffect)(() => {
		window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [r.length, t]);
	let s = (e, t) => {
		t && navigator.clipboard?.writeText(t).catch(() => void 0), o(e), window.setTimeout(() => o((t) => t === e ? "" : t), 900);
	};
	return /* @__PURE__ */ (0, K.jsx)("div", {
		className: "log-modal open",
		id: "smartLogModal",
		onClick: n,
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: `log-panel ${t === "cost" ? "cost-mode" : ""}`,
			id: "smartLogPanel",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "log-head",
					children: [/* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("div", {
						className: "log-title",
						id: "smartLogTitle",
						children: t === "cost" ? "费用仪表盘" : "生成日志"
					}), /* @__PURE__ */ (0, K.jsx)("div", {
						className: "log-cost-summary",
						id: "smartCostSummary",
						children: `总计 ${io(i.total)} · 已计费 ${i.calls} 次${i.unknown ? ` · 待定价 ${i.unknown} 笔` : ""}`
					})] }), /* @__PURE__ */ (0, K.jsx)("button", {
						className: "preview-icon-btn",
						onClick: n,
						title: "关闭",
						type: "button",
						children: /* @__PURE__ */ (0, K.jsx)("i", {
							className: "w-4 h-4",
							"data-lucide": "x"
						})
					})]
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "cost-dashboard",
					id: "smartCostDashboard",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "cost-card cost-card-total",
							children: [
								/* @__PURE__ */ (0, K.jsx)("span", { children: "画布总费用" }),
								/* @__PURE__ */ (0, K.jsx)("strong", {
									id: "smartCostTotal",
									children: io(i.total)
								}),
								/* @__PURE__ */ (0, K.jsx)("small", {
									id: "smartCostMeta",
									children: i.estimated ? `含历史预估 ${io(i.estimated)}` : "按调用时价格快照"
								})
							]
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "cost-card",
							children: [
								/* @__PURE__ */ (0, K.jsx)("span", { children: "图片费用" }),
								/* @__PURE__ */ (0, K.jsx)("strong", {
									id: "smartCostImage",
									children: io(i.image)
								}),
								/* @__PURE__ */ (0, K.jsx)("small", { children: "按张 / 次" })
							]
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "cost-card",
							children: [
								/* @__PURE__ */ (0, K.jsx)("span", { children: "视频费用" }),
								/* @__PURE__ */ (0, K.jsx)("strong", {
									id: "smartCostVideo",
									children: io(i.video)
								}),
								/* @__PURE__ */ (0, K.jsx)("small", { children: "按秒 / 次" })
							]
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "cost-card",
							children: [
								/* @__PURE__ */ (0, K.jsx)("span", { children: "已计费调用" }),
								/* @__PURE__ */ (0, K.jsx)("strong", {
									id: "smartCostCalls",
									children: i.calls
								}),
								/* @__PURE__ */ (0, K.jsxs)("small", {
									id: "smartCostUnknown",
									children: [
										"待定价 ",
										i.unknown,
										" 笔"
									]
								})
							]
						})
					]
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "log-list",
					id: "smartLogList",
					children: r.length ? r.map((t, n) => {
						let r = String(t.id || n), i = ["error", "failed"].includes(String(t.status || "").toLowerCase()), o = co(t.request), c = (Array.isArray(t.outputs) ? t.outputs : []).flatMap(J), l = no(t), u = String(o.task_id || o.taskId || o.prompt_id || o.promptId || ""), d = String(o.workflow_json || o.workflow || o.provider_id || o.providerId || o.backend || ""), f = [
							oo(t.createdAt || t.created_at),
							`输出 ${c.length}`,
							u ? `ID ${u}` : "",
							d
						].filter(Boolean), p = String(t.prompt || "暂无提示词信息");
						return /* @__PURE__ */ (0, K.jsxs)("div", {
							className: `log-item ${i ? "failed" : ""}`,
							"data-log-id": r,
							children: [/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "log-main",
								children: [
									/* @__PURE__ */ (0, K.jsxs)("div", {
										className: "log-meta",
										children: [
											/* @__PURE__ */ (0, K.jsx)("span", {
												className: `log-chip ${i ? "status-failed" : "status-ok"}`,
												children: i ? "失败" : "成功"
											}),
											/* @__PURE__ */ (0, K.jsx)("span", {
												className: "log-chip",
												children: String(t.platform || "-")
											}),
											t.model ? /* @__PURE__ */ (0, K.jsx)("span", {
												className: "log-chip",
												children: String(t.model)
											}) : null,
											l?.status === "priced" ? /* @__PURE__ */ (0, K.jsx)("span", {
												className: `log-chip ${l.source === "estimated" ? "cost-estimated" : ""}`,
												title: l.source === "estimated" ? "根据历史价格回算" : "调用时价格快照",
												children: `${io(l.amount_micros)}${l.source === "estimated" ? " 预估" : ""}`
											}) : l?.status === "unknown" ? /* @__PURE__ */ (0, K.jsx)("span", {
												className: "log-chip cost-unknown",
												children: "待定价"
											}) : null,
											/* @__PURE__ */ (0, K.jsx)("span", {
												className: "log-chip",
												children: so(Number(t.runMs || t.run_ms || 0))
											})
										]
									}),
									/* @__PURE__ */ (0, K.jsx)("div", {
										className: "log-subline",
										children: f.map((e, t) => /* @__PURE__ */ (0, K.jsx)("span", {
											title: e,
											children: e
										}, t))
									}),
									t.error ? /* @__PURE__ */ (0, K.jsx)("div", {
										className: "log-error",
										title: String(t.error),
										children: String(t.error)
									}) : null,
									/* @__PURE__ */ (0, K.jsx)("div", {
										className: `log-prompt ${a === r ? "copied" : ""}`,
										"data-prompt": String(t.prompt || ""),
										onClick: () => s(r, String(t.prompt || "")),
										title: p,
										children: a === r ? "已复制" : p
									})
								]
							}), /* @__PURE__ */ (0, K.jsx)("div", {
								className: "log-thumbs",
								children: c.slice(0, 8).map((n, r) => n.kind === "video" ? /* @__PURE__ */ (0, K.jsx)("video", {
									"data-kind": "video",
									"data-url": n.url,
									muted: !0,
									onClick: () => lo(e, t, n.url),
									preload: "metadata",
									src: n.url
								}, `${n.url}-${r}`) : /* @__PURE__ */ (0, K.jsx)("img", {
									alt: "output",
									"data-kind": "image",
									"data-url": n.url,
									loading: "lazy",
									onClick: () => lo(e, t, n.url),
									src: n.url
								}, `${n.url}-${r}`))
							})]
						}, r);
					}) : /* @__PURE__ */ (0, K.jsx)("div", {
						className: "log-empty",
						children: "暂无生成日志"
					})
				})
			]
		})
	});
}
function no(e) {
	if (["error", "failed"].includes(String(e.status || "").toLowerCase())) return null;
	let t = co(e.cost), n = String(t.kind || e.billingKind || e.kind || co(e.request).kind || ao(e)), r = String(t.source || "actual");
	if (String(t.status || "") === "priced" && Number.isFinite(Number(t.amount_micros))) return {
		amount_micros: Math.max(0, Number(t.amount_micros)),
		kind: n,
		source: r,
		status: "priced"
	};
	let i = typeof e.cost == "number" ? Number(e.cost) : Number(e.cost_cny || 0);
	return Number.isFinite(i) && i > 0 ? {
		amount_micros: Math.round(i * 1e6),
		kind: n,
		source: r,
		status: "priced"
	} : {
		kind: n,
		source: r || "estimated",
		status: "unknown"
	};
}
function ro(e) {
	return e.reduce((e, t) => {
		if (!t || typeof t != "object") return e;
		let n = no(t);
		return n?.status === "priced" ? (e.total += n.amount_micros, n.kind === "video" ? e.video += n.amount_micros : e.image += n.amount_micros, e.calls += 1, n.source === "estimated" && (e.estimated += n.amount_micros)) : n?.status === "unknown" && (e.unknown += 1), e;
	}, {
		calls: 0,
		estimated: 0,
		image: 0,
		total: 0,
		unknown: 0,
		video: 0
	});
}
function io(e) {
	return `¥${new Intl.NumberFormat("zh-CN", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 6
	}).format(Number(e || 0) / 1e6)}`;
}
function J(e) {
	let t = co(e), n = typeof e == "string" ? e : String(t.url || "");
	return n ? [{
		kind: String(t.kind || "").toLowerCase() === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(n) ? "video" : "image",
		url: n
	}] : [];
}
function ao(e) {
	return (Array.isArray(e.outputs) ? e.outputs : []).some((e) => J(e)[0]?.kind === "video") ? "video" : "image";
}
function oo(e) {
	let t = Number(e || Date.now());
	return new Date(t < 1e10 ? t * 1e3 : t).toLocaleString("zh-CN");
}
function so(e) {
	return e ? e < 6e4 ? `${(e / 1e3).toFixed(1)}s` : `${Math.floor(e / 6e4)}m ${Math.floor(e % 6e4 / 1e3)}s` : "0.0s";
}
function co(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
function lo(e, t, n) {
	let r = (Array.isArray(e.nodes) ? e.nodes : []).find((e) => e && typeof e == "object" && String(e.id || "") === String(t.nodeId || ""));
	r && window.CanvasBoardV2?.openOutputLightbox(r, n);
}
//#endregion
//#region src/canvas/ui/smart-canvas-backup-and-lock.tsx
function uo({ backups: e, lockHolder: t, lockIssue: n, onAcquireLock: r, onCloseBackups: i, onCreateBackup: a, onDeleteBackup: o, onRestoreBackup: s, onStatus: c }) {
	let [l, u] = (0, G.useState)("");
	(0, G.useEffect)(() => {
		window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		e,
		l,
		t
	]);
	let d = async (e, t) => {
		if (!l) {
			u(e);
			try {
				await t();
			} catch (e) {
				c(e instanceof Error ? e.message : String(e));
			} finally {
				u("");
			}
		}
	}, f = (e) => {
		if (t) {
			c("画布正在被其他人编辑，无法恢复备份");
			return;
		}
		window.confirm("恢复此备份？当前画布将被覆盖。") && d(`restore:${e}`, () => s(e));
	};
	return /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("div", {
		className: "smart-lock-overlay",
		hidden: !t,
		id: "smartLockOverlay",
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "smart-lock-card",
			children: [
				/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "lock" }),
				/* @__PURE__ */ (0, K.jsx)("strong", { children: "画布编辑中" }),
				/* @__PURE__ */ (0, K.jsx)("span", {
					id: "smartLockMessage",
					children: t ? `${mo(t)} 正在编辑此画布` : ""
				}),
				/* @__PURE__ */ (0, K.jsx)("small", { children: "你只能查看、移动和缩放画布，等对方退出后会自动解锁。" }),
				n ? /* @__PURE__ */ (0, K.jsx)("small", {
					title: n,
					children: n
				}) : null,
				/* @__PURE__ */ (0, K.jsxs)("button", {
					disabled: l === "lock",
					id: "smartLockRetryBtn",
					onClick: () => void d("lock", async () => {
						await r();
					}),
					type: "button",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "refresh-cw" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "刷新状态" })]
				})
			]
		})
	}), e ? /* @__PURE__ */ (0, K.jsx)("div", {
		className: "log-modal open",
		id: "smartBackupModal",
		onClick: (e) => {
			e.target === e.currentTarget && i();
		},
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "log-panel backup-panel",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "log-head",
					children: [/* @__PURE__ */ (0, K.jsx)("div", {
						className: "log-title",
						children: "画布备份"
					}), /* @__PURE__ */ (0, K.jsx)("button", {
						className: "preview-icon-btn",
						onClick: i,
						title: "关闭",
						type: "button",
						children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "x" })
					})]
				}),
				/* @__PURE__ */ (0, K.jsxs)("button", {
					className: "run-btn backup-create",
					disabled: !!l,
					onClick: () => void d("create", a),
					type: "button",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "hard-drive" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "立即备份" })]
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "log-list",
					children: e.length ? e.map((e) => {
						let t = String(e.filename || "");
						return /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "log-item",
							"data-backup-filename": t,
							children: [/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "log-main",
								children: [/* @__PURE__ */ (0, K.jsx)("div", {
									className: "log-meta",
									children: /* @__PURE__ */ (0, K.jsx)("span", {
										className: "log-chip",
										children: String(e.title || "未命名画布")
									})
								}), /* @__PURE__ */ (0, K.jsxs)("div", {
									className: "log-subline",
									children: [
										/* @__PURE__ */ (0, K.jsx)("span", { children: po(e.timestamp) }),
										/* @__PURE__ */ (0, K.jsxs)("span", { children: [Number(e.node_count || 0), " 个节点"] }),
										/* @__PURE__ */ (0, K.jsx)("span", { children: fo(e.size) })
									]
								})]
							}), /* @__PURE__ */ (0, K.jsxs)("div", {
								className: "backup-row-actions",
								children: [/* @__PURE__ */ (0, K.jsx)("button", {
									className: "preview-icon-btn",
									"data-backup-restore": t,
									disabled: l === `restore:${t}`,
									onClick: () => f(t),
									title: "恢复",
									type: "button",
									children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "rotate-ccw" })
								}), /* @__PURE__ */ (0, K.jsx)("button", {
									className: "preview-icon-btn",
									"data-backup-delete": t,
									disabled: l === `delete:${t}`,
									onClick: () => void d(`delete:${t}`, () => o(t)),
									title: "删除",
									type: "button",
									children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "trash-2" })
								})]
							})]
						}, t);
					}) : /* @__PURE__ */ (0, K.jsx)("div", {
						className: "log-empty",
						children: "暂无备份"
					})
				})
			]
		})
	}) : null] });
}
function fo(e) {
	let t = Math.max(0, Number(e || 0));
	return t > 1024 ? `${(t / 1024).toFixed(1)} KB` : `${t} B`;
}
function po(e) {
	let t = Number(e || 0);
	return t ? new Date(t).toLocaleString() : "--";
}
function mo(e) {
	return String(e.username || e.ip || "其他用户");
}
//#endregion
//#region src/canvas/ui/prompt-library-dialog.tsx
function ho({ onClose: e, request: t }) {
	let [n, r] = (0, G.useState)({
		active_library_id: "",
		libraries: []
	}), [i, a] = (0, G.useState)(""), [o, s] = (0, G.useState)(""), [c, l] = (0, G.useState)(""), [u, d] = (0, G.useState)("正在加载提示词库…"), [f, p] = (0, G.useState)({
		category: "",
		name: "",
		negative: "",
		positive: t.initialText || "",
		scene: ""
	}), m = n.libraries.find((e) => e.id === i) ?? n.libraries[0], h = (0, G.useMemo)(() => (m?.items || []).filter((e) => _o(e, c)), [m, c]), g = m?.items.find((e) => e.id === o), _ = (e, t = i, n = o) => {
		r(e);
		let c = e.libraries.find((e) => e.id === t) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0];
		a(c?.id || "");
		let l = c?.items.find((e) => e.id === n) ?? c?.items[0];
		s(l?.id || ""), l && p(go(l));
	};
	(0, G.useEffect)(() => {
		let e = !0;
		return Rr.list().then((t) => {
			e && (_(t.library, t.library.active_library_id, ""), d(""));
		}).catch((t) => e && d(t instanceof Error ? t.message : String(t))), () => {
			e = !1;
		};
	}, []);
	let v = (e) => {
		let r = n.libraries.find((t) => t.id === e);
		a(e), s(r?.items[0]?.id || ""), p(r?.items[0] ? go(r.items[0]) : {
			category: r?.categories[0]?.id || "",
			name: "",
			negative: "",
			positive: t.initialText || "",
			scene: ""
		});
	}, y = (e) => {
		s(e.id), p(go(e));
	}, b = () => {
		s(""), p({
			category: m?.categories[0]?.id || "",
			name: "",
			negative: "",
			positive: t.initialText || "",
			scene: ""
		}), d("正在新建提示词");
	}, x = async () => {
		if (!m) {
			d("请先创建提示词库");
			return;
		}
		if (!f.positive.trim()) {
			d("提示词内容不能为空");
			return;
		}
		try {
			let e = await Rr.savePrompt(m.id, {
				...g ? { id: g.id } : {},
				category: f.category,
				name: f.name.trim() || f.positive.trim().slice(0, 28),
				negative: f.negative,
				positive: f.positive,
				scene: f.scene
			}), t = String(e.item?.id || g?.id || "");
			_(e.library, m.id, t), d(g ? "提示词已更新" : "提示词已创建");
		} catch (e) {
			d(e instanceof Error ? e.message : String(e));
		}
	}, S = async () => {
		if (!(!g || !window.confirm(`删除提示词“${g.name}”？`))) try {
			let e = await Rr.deletePrompts([g.id]);
			_(e.library, m?.id, ""), d("提示词已删除");
		} catch (e) {
			d(e instanceof Error ? e.message : String(e));
		}
	}, C = async () => {
		let e = window.prompt("新提示词库名称")?.trim();
		if (e) try {
			let t = await Rr.createLibrary(e);
			_(t.library, t.library.active_library_id, ""), d("提示词库已创建");
		} catch (e) {
			d(e instanceof Error ? e.message : String(e));
		}
	}, w = async () => {
		if (!m || m.id === "system") return;
		let e = window.prompt("提示词库名称", m.name)?.trim();
		if (e) try {
			let t = await Rr.renameLibrary(m.id, e);
			_(t.library, m.id, o), d("提示词库已重命名");
		} catch (e) {
			d(e instanceof Error ? e.message : String(e));
		}
	}, T = async () => {
		if (!(!m || m.id === "system" || !window.confirm(`删除提示词库“${m.name}”？`))) try {
			let e = await Rr.deleteLibrary(m.id);
			_(e.library, e.library.active_library_id, ""), d("提示词库已删除");
		} catch (e) {
			d(e instanceof Error ? e.message : String(e));
		}
	}, E = async () => {
		if (!m) return;
		let e = window.prompt("新分组名称")?.trim();
		if (e) try {
			let t = await Rr.createCategory(m.id, e);
			_(t.library, m.id, o), d("分组已创建");
		} catch (e) {
			d(e instanceof Error ? e.message : String(e));
		}
	}, D = (n = !1) => {
		let r = f.positive.trim();
		if (!r) {
			d("提示词内容不能为空");
			return;
		}
		t.onApply(n && f.negative.trim() ? `${r}\n\nNegative prompt:\n${f.negative.trim()}` : r), e();
	};
	return /* @__PURE__ */ (0, K.jsx)("div", {
		"aria-modal": "true",
		className: "modal open canvas-modern-backups prompt-library-dialog",
		role: "dialog",
		children: /* @__PURE__ */ (0, K.jsxs)("section", {
			className: "modal-panel",
			children: [
				/* @__PURE__ */ (0, K.jsxs)("header", { children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: "提示词库" }), /* @__PURE__ */ (0, K.jsx)("button", {
					onClick: e,
					type: "button",
					children: "关闭"
				})] }),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "prompt-library-toolbar",
					children: [
						/* @__PURE__ */ (0, K.jsx)("select", {
							"aria-label": "提示词库",
							onChange: (e) => v(e.target.value),
							value: m?.id || "",
							children: n.libraries.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
								value: e.id,
								children: e.name
							}, e.id))
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							onClick: () => void C(),
							type: "button",
							children: "新建库"
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							disabled: !m || m.id === "system",
							onClick: () => void w(),
							type: "button",
							children: "重命名库"
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							disabled: !m || m.id === "system",
							onClick: () => void T(),
							type: "button",
							children: "删除库"
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							disabled: !m,
							onClick: () => void E(),
							type: "button",
							children: "新建分组"
						}),
						/* @__PURE__ */ (0, K.jsx)("input", {
							"aria-label": "搜索提示词",
							onChange: (e) => l(e.target.value),
							placeholder: "搜索名称、场景或内容",
							value: c
						})
					]
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "prompt-library-body",
					children: [/* @__PURE__ */ (0, K.jsxs)("aside", { children: [
						/* @__PURE__ */ (0, K.jsx)("button", {
							className: "primary-btn",
							onClick: b,
							type: "button",
							children: "新建提示词"
						}),
						h.map((e) => /* @__PURE__ */ (0, K.jsxs)("button", {
							className: e.id === o ? "active" : "",
							onClick: () => y(e),
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: e.name || "未命名" }), /* @__PURE__ */ (0, K.jsx)("small", { children: e.scene || e.positive.slice(0, 60) })]
						}, e.id)),
						h.length ? null : /* @__PURE__ */ (0, K.jsx)("p", { children: "当前库暂无匹配内容" })
					] }), /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "prompt-library-editor",
						children: [
							/* @__PURE__ */ (0, K.jsxs)("label", { children: ["名称", /* @__PURE__ */ (0, K.jsx)("input", {
								"aria-label": "提示词名称",
								onChange: (e) => p((t) => ({
									...t,
									name: e.target.value
								})),
								value: f.name
							})] }),
							/* @__PURE__ */ (0, K.jsxs)("label", { children: ["分组", /* @__PURE__ */ (0, K.jsxs)("select", {
								"aria-label": "提示词分组",
								onChange: (e) => p((t) => ({
									...t,
									category: e.target.value
								})),
								value: f.category,
								children: [/* @__PURE__ */ (0, K.jsx)("option", {
									value: "",
									children: "未分组"
								}), (m?.categories || []).map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
									value: e.id,
									children: e.name
								}, e.id))]
							})] }),
							/* @__PURE__ */ (0, K.jsxs)("label", { children: ["场景", /* @__PURE__ */ (0, K.jsx)("input", {
								"aria-label": "提示词场景",
								onChange: (e) => p((t) => ({
									...t,
									scene: e.target.value
								})),
								value: f.scene
							})] }),
							/* @__PURE__ */ (0, K.jsxs)("label", { children: ["正向提示词", /* @__PURE__ */ (0, K.jsx)("textarea", {
								"aria-label": "正向提示词",
								onChange: (e) => p((t) => ({
									...t,
									positive: e.target.value
								})),
								value: f.positive
							})] }),
							/* @__PURE__ */ (0, K.jsxs)("label", { children: ["负向提示词", /* @__PURE__ */ (0, K.jsx)("textarea", {
								"aria-label": "负向提示词",
								onChange: (e) => p((t) => ({
									...t,
									negative: e.target.value
								})),
								value: f.negative
							})] }),
							/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "prompt-library-actions",
								children: [
									/* @__PURE__ */ (0, K.jsx)("button", {
										onClick: () => void x(),
										type: "button",
										children: g ? "保存修改" : "创建提示词"
									}),
									/* @__PURE__ */ (0, K.jsx)("button", {
										disabled: !g,
										onClick: () => void S(),
										type: "button",
										children: "删除提示词"
									}),
									/* @__PURE__ */ (0, K.jsx)("button", {
										onClick: () => D(!1),
										type: "button",
										children: "应用正向"
									}),
									/* @__PURE__ */ (0, K.jsx)("button", {
										className: "primary-btn",
										onClick: () => D(!0),
										type: "button",
										children: "应用完整提示词"
									})
								]
							})
						]
					})]
				}),
				u ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "gate-status",
					role: "status",
					children: u
				}) : null
			]
		})
	});
}
function go(e) {
	return {
		category: e.category || "",
		name: e.name || "",
		negative: e.negative || "",
		positive: e.positive || "",
		scene: e.scene || ""
	};
}
function _o(e, t) {
	let n = t.trim().toLocaleLowerCase();
	return !n || [
		e.name,
		e.positive,
		e.negative,
		e.scene
	].some((e) => e?.toLocaleLowerCase().includes(n));
}
//#endregion
//#region src/canvas/ui/canvas-manager.tsx
var vo = [
	"red",
	"orange",
	"amber",
	"green",
	"teal",
	"blue",
	"violet",
	"pink",
	"slate"
], yo = [
	"layers",
	"sparkles",
	"image",
	"palette",
	"wand-2",
	"star",
	"heart",
	"rocket",
	"flame",
	"moon",
	"cloud",
	"leaf",
	"gem",
	"compass",
	"pin",
	"flag",
	"bookmark",
	"crown"
];
function bo({ canvases: e, configuration: t, folders: n, management: r, onOpen: i, onRefresh: a, onStatus: o, status: s, trash: c }) {
	let [l, u] = (0, G.useState)("all"), [d, f] = (0, G.useState)(t.kind ?? "classic"), [p, m] = (0, G.useState)(""), [h, g] = (0, G.useState)(!1), [_, v] = (0, G.useState)(""), [y, b] = (0, G.useState)({
		left: 0,
		top: 0
	}), [x, S] = (0, G.useState)(""), [C, w] = (0, G.useState)(""), [T, E] = (0, G.useState)(""), [D, O] = (0, G.useState)(""), [k, A] = (0, G.useState)(!1), [j, M] = (0, G.useState)(() => localStorage.getItem("canvasSortMode") === "name" ? "name" : "recent"), N = (0, G.useRef)(null), P = (0, G.useMemo)(() => k ? [...c] : (l === "all" ? e : e.filter((e) => Po(e.folder_id) === l)).sort((e, t) => ko(e, t, j)), [
		l,
		e,
		k,
		j,
		c
	]);
	(0, G.useEffect)(() => {
		l !== "all" && l && !n.some((e) => e.id === l) && u("");
	}, [l, n]), (0, G.useEffect)(() => {
		h && (N.current?.focus(), N.current?.select());
	}, [h]), (0, G.useEffect)(() => {
		Lo();
	}, [
		l,
		h,
		_,
		n,
		x,
		C,
		T,
		D,
		k,
		j,
		P
	]), (0, G.useEffect)(() => {
		let e = (e) => {
			let t = e.target;
			C && !t?.closest(".canvas-folder-menu,.canvas-folder-btn") && w(""), x && !t?.closest(".canvas-meta-pop,.canvas-preview-mark,.canvas-owner-chip") && S("");
		};
		return document.addEventListener("mousedown", e), () => document.removeEventListener("mousedown", e);
	}, [x, C]);
	let F = (e) => {
		f(e), g(!0), A(!1), m(""), o("请输入画布名称");
	}, I = () => {
		g(!1), m(""), o(e.length ? "请选择一个画布" : "还没有画布，新建一个开始创作。");
	}, ee = async () => {
		let e = t.kind ?? d, n = t.defaultTitle || (e === "smart" ? "新智能画布" : "新画布"), s = p.trim() || `${n} ${(/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", {
			hour: "2-digit",
			minute: "2-digit"
		})}`;
		o("正在创建…");
		try {
			let n = await r.create(s, {
				folderId: l === "all" ? "" : l,
				icon: e === "smart" ? "sparkles" : "🧩",
				kind: e
			});
			if (g(!1), m(""), await a(), e === "smart" && t.kind !== "smart") {
				window.location.href = `/static/smart-canvas.html?id=${encodeURIComponent(n.id)}&v=2026.07.23.3`;
				return;
			}
			await i(n);
		} catch (e) {
			o(Io(e, "新建画布失败"));
		}
	}, te = async (e) => {
		if (e.kind === "smart" && t.kind !== "smart") {
			window.location.href = `/static/smart-canvas.html?id=${encodeURIComponent(e.id)}&v=2026.07.23.3`;
			return;
		}
		await i(e);
	}, L = async (e = "") => {
		let t = window.prompt("文件夹名称")?.trim();
		if (t) try {
			let n = await r.createFolder(t, e);
			u(n.id), await a();
		} catch (e) {
			o(Io(e, "新建文件夹失败"));
		}
	}, R = async (e) => {
		let t = window.prompt("文件夹名称", String(e.name || ""))?.trim();
		if (!(!t || t === e.name)) try {
			await r.updateFolder(e.id, { name: t }), await a();
		} catch (e) {
			o(Io(e, "重命名文件夹失败"));
		}
	}, z = async (e) => {
		if (window.confirm("删除该文件夹？其中的画布和子文件夹会移动到上一级。")) try {
			await r.deleteFolder(e.id), l === e.id && u(Po(e.parent_id)), await a();
		} catch (e) {
			o(Io(e, "删除文件夹失败"));
		}
	}, B = async (e, t) => {
		w("");
		try {
			await r.moveToFolder(e, t), await a();
		} catch (e) {
			o(Io(e, "移动画布失败"));
		}
	}, ne = async (e, t, n) => {
		try {
			await r.patchMeta(e, t), await a();
		} catch (e) {
			o(Io(e, n));
		}
	}, re = async (e) => {
		o("正在移入回收站…");
		try {
			await r.delete(e), E(""), await a(), o("已移入回收站");
		} catch (e) {
			o(Io(e, "移入回收站失败"));
		}
	}, ie = async (e) => {
		o("正在恢复…");
		try {
			await r.restore(e), await a(), o("已恢复");
		} catch (e) {
			o(Io(e, "恢复失败"));
		}
	}, ae = async (e) => {
		o("正在删除…");
		try {
			await r.purge(e), O(""), await a(), o("已彻底删除");
		} catch (e) {
			o(Io(e, "彻底删除失败"));
		}
	}, V = (e, t) => {
		e.preventDefault();
		let n = e.dataTransfer.getData("text/canvas-id");
		n && B(n, t === "all" ? "" : t);
	}, oe = (e) => {
		M(e), localStorage.setItem("canvasSortMode", e);
	}, se = !t.kind;
	return /* @__PURE__ */ (0, K.jsx)("main", {
		className: "canvas-modern-manager",
		children: /* @__PURE__ */ (0, K.jsx)("div", {
			className: `canvas-gate${h ? " creating" : ""}${k ? " trash-mode" : ""}`,
			children: /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "gate-panel",
				children: [
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gate-head",
						children: [/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "gate-head-text",
							children: [
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: "gate-back-link",
									onClick: () => A(!1),
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)(Y, {
										name: "arrow-left",
										size: 14
									}), /* @__PURE__ */ (0, K.jsx)("span", { children: "返回画布列表" })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("div", {
									className: "gate-title-row",
									children: [/* @__PURE__ */ (0, K.jsx)("div", {
										className: "gate-title",
										children: k ? "回收站" : t.heading || "选择画布"
									}), /* @__PURE__ */ (0, K.jsx)("span", {
										className: "gate-count-pill",
										children: P.length
									})]
								}),
								/* @__PURE__ */ (0, K.jsx)("div", {
									className: "gate-subtitle",
									children: k ? "恢复误删的画布，或彻底删除不再需要的内容。" : t.subtitle || "打开已有画布，或新建一个开始创作。"
								})
							]
						}), /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "gate-head-actions",
							children: [
								/* @__PURE__ */ (0, K.jsxs)("div", {
									className: `gate-sort${k ? " hidden" : ""}`,
									role: "group",
									"aria-label": "排序方式",
									children: [/* @__PURE__ */ (0, K.jsx)("button", {
										className: `gate-sort-btn${j === "recent" ? " active" : ""}`,
										"data-sort": "recent",
										onClick: () => oe("recent"),
										type: "button",
										children: "最近编辑"
									}), /* @__PURE__ */ (0, K.jsx)("button", {
										className: `gate-sort-btn${j === "name" ? " active" : ""}`,
										"data-sort": "name",
										onClick: () => oe("name"),
										type: "button",
										children: "名称"
									})]
								}),
								t.managerBackHref ? /* @__PURE__ */ (0, K.jsx)("a", {
									className: "gate-icon-btn",
									href: t.managerBackHref,
									title: "返回画布列表",
									"aria-label": "返回画布列表",
									children: /* @__PURE__ */ (0, K.jsx)(Y, { name: "arrow-left" })
								}) : null,
								/* @__PURE__ */ (0, K.jsx)("button", {
									className: "gate-icon-btn",
									onClick: () => void a(),
									title: "刷新列表",
									"aria-label": "刷新列表",
									type: "button",
									children: /* @__PURE__ */ (0, K.jsx)(Y, { name: "refresh-cw" })
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: "gate-icon-btn gate-trash-entry",
									onClick: () => {
										A(!0), g(!1);
									},
									title: "打开回收站",
									"aria-label": "打开回收站",
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)(Y, { name: "trash-2" }), /* @__PURE__ */ (0, K.jsx)("span", {
										className: `gate-trash-badge${c.length ? " visible" : ""}`,
										children: c.length
									})]
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: "gate-icon-btn gate-manager-btn",
									hidden: !0,
									title: "资产库管理",
									"aria-label": "资产库管理",
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)(Y, { name: "library" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "素材库管理" })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									className: "primary-btn",
									onClick: () => F(t.kind ?? "classic"),
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)(Y, { name: "plus" }), /* @__PURE__ */ (0, K.jsx)("span", { children: t.createLabel || "新建画布" })]
								}),
								se ? /* @__PURE__ */ (0, K.jsxs)("button", {
									className: "smart-create-btn",
									onClick: () => F("smart"),
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)(Y, { name: "sparkles" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "新建智能画布" })]
								}) : null
							]
						})]
					}),
					/* @__PURE__ */ (0, K.jsx)("div", {
						className: "gate-status",
						children: s
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gate-create-row",
						children: [
							/* @__PURE__ */ (0, K.jsx)("input", {
								className: "gate-name-input",
								maxLength: 80,
								onChange: (e) => m(e.target.value),
								onKeyDown: (e) => {
									e.key === "Enter" && ee(), e.key === "Escape" && I();
								},
								placeholder: d === "smart" ? "新智能画布名称（可留空使用默认）" : "新画布名称（可留空使用默认）",
								ref: N,
								type: "text",
								value: p
							}),
							/* @__PURE__ */ (0, K.jsx)("button", {
								className: "create-confirm",
								onClick: () => void ee(),
								title: "确定",
								"aria-label": "确定",
								type: "button",
								children: /* @__PURE__ */ (0, K.jsx)(Y, { name: "check" })
							}),
							/* @__PURE__ */ (0, K.jsx)("button", {
								className: "create-cancel",
								onClick: I,
								title: "取消",
								"aria-label": "取消",
								type: "button",
								children: /* @__PURE__ */ (0, K.jsx)(Y, { name: "x" })
							})
						]
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "trash-note",
						children: [/* @__PURE__ */ (0, K.jsx)(Y, {
							name: "info",
							size: 14
						}), /* @__PURE__ */ (0, K.jsx)("span", { children: "回收站中的画布会在 30 天后自动清理。" })]
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gate-browser",
						children: [/* @__PURE__ */ (0, K.jsxs)("aside", {
							className: "gate-folder-pane",
							"aria-label": "画布文件夹",
							children: [/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "gate-folder-head",
								children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "文件夹" }), /* @__PURE__ */ (0, K.jsx)("button", {
									className: "gate-folder-add",
									onClick: () => void L(""),
									title: "新建文件夹",
									"aria-label": "新建文件夹",
									type: "button",
									children: /* @__PURE__ */ (0, K.jsx)(Y, {
										name: "folder-plus",
										size: 14
									})
								})]
							}), /* @__PURE__ */ (0, K.jsxs)("div", {
								className: "gate-folder-tree",
								children: [
									/* @__PURE__ */ (0, K.jsx)(Eo, {
										active: l === "all",
										count: e.length,
										icon: "layout-grid",
										id: "all",
										name: "全部画布",
										onDrop: V,
										onSelect: u
									}),
									/* @__PURE__ */ (0, K.jsx)(Eo, {
										active: l === "",
										count: Mo(e, ""),
										icon: "inbox",
										id: "",
										name: "未分类",
										onDrop: V,
										onSelect: u
									}),
									/* @__PURE__ */ (0, K.jsx)("div", { className: "gate-folder-separator" }),
									Ao(n, "").map((t) => /* @__PURE__ */ (0, K.jsx)(To, {
										activeFolder: l,
										canvases: e,
										folder: t,
										folders: n,
										onCreate: L,
										onDelete: z,
										onDrop: V,
										onRename: R,
										onSelect: u
									}, t.id))
								]
							})]
						}), /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "gate-canvas-pane",
							children: [/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "gate-folder-bar",
								children: [/* @__PURE__ */ (0, K.jsxs)("div", {
									className: "gate-folder-current",
									children: [/* @__PURE__ */ (0, K.jsx)(Y, {
										name: l === "all" ? "layout-grid" : l ? "folder" : "inbox",
										size: 14
									}), /* @__PURE__ */ (0, K.jsx)("span", { children: No(l, n) })]
								}), /* @__PURE__ */ (0, K.jsx)("span", {
									className: "gate-folder-current-count",
									children: P.length
								})]
							}), /* @__PURE__ */ (0, K.jsx)("div", {
								className: "gate-list",
								children: P.length ? P.map((e) => /* @__PURE__ */ (0, K.jsx)(So, {
									editing: _ === e.id,
									folders: n,
									item: e,
									metaOpen: x === e.id,
									metaPosition: y,
									moving: C === e.id,
									onDelete: () => E(e.id),
									onConfirmDelete: () => void re(e.id),
									onConfirmPurge: () => void ae(e.id),
									onCancelConfirm: () => {
										E(""), O("");
									},
									onEdit: () => v(e.id),
									onMeta: (t) => {
										let n = t.currentTarget.getBoundingClientRect();
										b({
											left: Math.min(Math.max(n.left, 12), window.innerWidth - 224),
											top: Math.min(n.bottom + 8, window.innerHeight - 280)
										}), S(x === e.id ? "" : e.id);
									},
									onMove: (t) => void B(e.id, t),
									onMoveMenu: () => w(C === e.id ? "" : e.id),
									onOpen: () => void te(e),
									onPatch: (t, n) => void ne(e.id, t, n),
									onPurge: () => O(e.id),
									onRestore: () => void ie(e.id),
									onTitle: (t) => {
										v(""), t && t !== e.title && ne(e.id, { title: t }, "重命名失败");
									},
									pendingDelete: T === e.id,
									pendingPurge: D === e.id,
									showTrash: k
								}, e.id)) : /* @__PURE__ */ (0, K.jsxs)("div", {
									className: "gate-list-empty",
									children: [/* @__PURE__ */ (0, K.jsx)("div", {
										className: "gate-list-empty-icon",
										children: /* @__PURE__ */ (0, K.jsx)(Y, {
											name: k ? "trash-2" : "layout-grid",
											size: 24
										})
									}), k ? "回收站为空" : /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
										"还没有画布",
										/* @__PURE__ */ (0, K.jsx)("br", {}),
										"新建一个开始创作"
									] })]
								})
							})]
						})]
					})
				]
			})
		})
	});
}
function xo({ canvases: e, configuration: t, folders: n, management: r, onOpen: i, onRefresh: a, onStatus: o, status: s, trash: c }) {
	let [l, u] = (0, G.useState)("all"), [d, f] = (0, G.useState)(""), [p, m] = (0, G.useState)(!1), h = p ? c : l === "all" ? e : l === "root" ? e.filter((e) => !e.folder_id) : e.filter((e) => e.folder_id === l), g = async () => {
		try {
			let e = await r.create(d || t.defaultTitle || "", {
				icon: t.kind === "smart" ? "sparkles" : void 0,
				kind: t.kind ?? "classic"
			});
			f(""), await a(), await i(e);
		} catch (e) {
			o(Io(e, "新建画布失败"));
		}
	};
	return /* @__PURE__ */ (0, K.jsx)("main", {
		className: "canvas-modern-manager",
		children: /* @__PURE__ */ (0, K.jsxs)("section", {
			className: "gate-panel canvas-modern-gate",
			children: [
				/* @__PURE__ */ (0, K.jsxs)("header", {
					className: "gate-head",
					children: [/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gate-head-text",
						children: [/* @__PURE__ */ (0, K.jsx)("h1", {
							className: "gate-title",
							children: p ? "回收站" : t.heading || "经典画布 V2"
						}), /* @__PURE__ */ (0, K.jsx)("p", {
							className: "gate-subtitle",
							children: t.subtitle || "React + TypeScript 独立文档与执行路径"
						})]
					}), /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "gate-head-actions",
						children: [
							t.managerBackHref ? /* @__PURE__ */ (0, K.jsx)("a", {
								className: "gate-icon-btn",
								href: t.managerBackHref,
								children: "返回首页"
							}) : null,
							p ? null : /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
								/* @__PURE__ */ (0, K.jsxs)("select", {
									"aria-label": "画布文件夹",
									onChange: (e) => u(e.target.value),
									value: l,
									children: [
										/* @__PURE__ */ (0, K.jsx)("option", {
											value: "all",
											children: "全部画布"
										}),
										/* @__PURE__ */ (0, K.jsx)("option", {
											value: "root",
											children: "未分类"
										}),
										n.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
											value: e.id,
											children: String(e.name || "未命名文件夹")
										}, e.id))
									]
								}),
								/* @__PURE__ */ (0, K.jsx)("button", {
									className: "gate-icon-btn",
									onClick: async () => {
										let e = window.prompt("文件夹名称")?.trim();
										e && (await r.createFolder(e), await a());
									},
									type: "button",
									children: "新建文件夹"
								}),
								["all", "root"].includes(l) ? null : /* @__PURE__ */ (0, K.jsx)("button", {
									className: "gate-icon-btn",
									onClick: async () => {
										window.confirm("删除此文件夹？文件夹内画布不会被永久删除。") && (await r.deleteFolder(l), u("all"), await a());
									},
									type: "button",
									children: "删除文件夹"
								})
							] }),
							/* @__PURE__ */ (0, K.jsx)("button", {
								className: "gate-icon-btn",
								onClick: () => void a(),
								type: "button",
								children: "刷新"
							}),
							/* @__PURE__ */ (0, K.jsx)("button", {
								className: "gate-icon-btn",
								onClick: () => m((e) => !e),
								type: "button",
								children: p ? "返回画布" : `回收站 ${c.length}`
							})
						]
					})]
				}),
				p ? null : /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "gate-create-row canvas-modern-create",
					children: [/* @__PURE__ */ (0, K.jsx)("input", {
						className: "gate-name-input",
						maxLength: 80,
						onChange: (e) => f(e.target.value),
						onKeyDown: (e) => {
							e.key === "Enter" && g();
						},
						placeholder: "新画布名称",
						value: d
					}), /* @__PURE__ */ (0, K.jsx)("button", {
						className: "primary-btn",
						onClick: () => void g(),
						type: "button",
						children: t.createLabel || "新建画布"
					})]
				}),
				s ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "gate-status",
					children: s
				}) : null,
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "gate-list canvas-modern-list",
					children: h.map((e) => /* @__PURE__ */ (0, K.jsxs)("article", {
						className: "gate-card",
						"data-canvas-id": e.id,
						children: [/* @__PURE__ */ (0, K.jsxs)("button", {
							className: "canvas-modern-card-main",
							disabled: p,
							onClick: () => void i(e),
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: String(e.title || "未命名画布") }), /* @__PURE__ */ (0, K.jsx)("small", { children: Fo(e.updated_at) })]
						}), p ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("button", {
							onClick: async () => {
								await r.restore(e.id), await a();
							},
							type: "button",
							children: "恢复"
						}), /* @__PURE__ */ (0, K.jsx)("button", {
							onClick: async () => {
								window.confirm("永久删除后无法恢复，确定继续？") && (await r.purge(e.id), await a());
							},
							type: "button",
							children: "永久删除"
						})] }) : /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsxs)("select", {
							"aria-label": `移动 ${String(e.title || "画布")}`,
							onChange: async (t) => {
								await r.moveToFolder(e.id, t.target.value), await a();
							},
							value: String(e.folder_id || ""),
							children: [/* @__PURE__ */ (0, K.jsx)("option", {
								value: "",
								children: "未分类"
							}), n.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
								value: e.id,
								children: String(e.name || "未命名文件夹")
							}, e.id))]
						}), /* @__PURE__ */ (0, K.jsx)("button", {
							"aria-label": "移入回收站",
							onClick: async () => {
								window.confirm("将此画布移入回收站？") && (await r.delete(e.id), await a());
							},
							type: "button",
							children: "删除"
						})] })]
					}, e.id))
				})
			]
		})
	});
}
function So({ editing: e, folders: t, item: n, metaOpen: r, metaPosition: i, moving: a, onCancelConfirm: o, onConfirmDelete: s, onConfirmPurge: c, onDelete: l, onEdit: u, onMeta: d, onMove: f, onMoveMenu: p, onOpen: m, onPatch: h, onPurge: g, onRestore: _, onTitle: v, pendingDelete: y, pendingPurge: b, showTrash: x }) {
	let S = String(n.color || ""), C = String(n.owner || ""), w = n.kind === "smart", T = !!n.pinned && !x;
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: `canvas-item${w ? " smart-canvas" : ""}${T ? " pinned" : ""}${S ? " has-color" : ""}`,
		"data-canvas-id": n.id,
		draggable: !x,
		onDragEnd: (e) => e.currentTarget.classList.remove("dragging"),
		onDragStart: (e) => {
			e.dataTransfer.setData("text/canvas-id", n.id), e.dataTransfer.setData("text/plain", n.id), e.dataTransfer.effectAllowed = "move", e.currentTarget.classList.add("dragging");
		},
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "canvas-open",
				onClick: x ? void 0 : m,
				onKeyDown: (e) => {
					!x && (e.key === "Enter" || e.key === " ") && m();
				},
				role: "button",
				tabIndex: x ? -1 : 0,
				children: [
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "canvas-card-icon-row",
						children: [/* @__PURE__ */ (0, K.jsx)("button", {
							className: `canvas-preview-mark${S ? ` icon-has-color cc-${S}` : ""}`,
							onClick: (e) => {
								e.stopPropagation(), x || d(e);
							},
							title: x ? "已删除画布" : "编辑图标 / 颜色 / 负责人",
							type: "button",
							children: /* @__PURE__ */ (0, K.jsx)(Oo, {
								icon: w && /[^\x00-\x7F]/.test(String(n.icon || "")) ? "sparkles" : String(n.icon || ""),
								size: 16
							})
						}), w ? /* @__PURE__ */ (0, K.jsx)("span", {
							className: "canvas-kind-chip",
							children: "智能"
						}) : null]
					}),
					/* @__PURE__ */ (0, K.jsx)("div", {
						className: "canvas-card-title",
						children: e ? /* @__PURE__ */ (0, K.jsx)(wo, {
							title: String(n.title || ""),
							onFinish: v
						}) : String(n.title || "未命名画布")
					}),
					C ? /* @__PURE__ */ (0, K.jsxs)("button", {
						className: "canvas-owner-chip",
						onClick: (e) => {
							e.stopPropagation(), d(e);
						},
						title: C,
						type: "button",
						children: [/* @__PURE__ */ (0, K.jsx)(Y, {
							name: "user-round",
							size: 12
						}), /* @__PURE__ */ (0, K.jsx)("span", {
							className: "canvas-owner-text",
							children: C
						})]
					}) : null,
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "canvas-card-meta",
						children: [/* @__PURE__ */ (0, K.jsx)("span", { className: "canvas-card-meta-dot" }), /* @__PURE__ */ (0, K.jsx)("div", {
							className: "canvas-card-time",
							children: x ? `删除于 ${Fo(n.deleted_at)}` : Fo(n.updated_at || n.created_at)
						})]
					})
				]
			}),
			x ? b ? /* @__PURE__ */ (0, K.jsx)(Do, {
				text: "彻底删除后无法恢复，确定继续？",
				onCancel: o,
				onConfirm: c
			}) : /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("button", {
				className: "canvas-delete canvas-restore",
				onClick: _,
				style: { right: 42 },
				title: "恢复画布",
				"aria-label": `恢复画布 ${String(n.title || "")}`,
				type: "button",
				children: /* @__PURE__ */ (0, K.jsx)(Y, {
					name: "rotate-ccw",
					size: 14
				})
			}), /* @__PURE__ */ (0, K.jsx)("button", {
				className: "canvas-delete canvas-purge",
				onClick: g,
				title: "彻底删除",
				"aria-label": `彻底删除 ${String(n.title || "")}`,
				type: "button",
				children: /* @__PURE__ */ (0, K.jsx)(Y, {
					name: "x",
					size: 14
				})
			})] }) : y ? /* @__PURE__ */ (0, K.jsx)(Do, {
				text: "将此画布移入回收站？",
				onCancel: o,
				onConfirm: s
			}) : /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
				/* @__PURE__ */ (0, K.jsx)("button", {
					className: `canvas-pin-btn${T ? " active" : ""}`,
					onClick: () => h({ pinned: !T }, "置顶状态保存失败"),
					title: T ? "取消置顶" : "置顶",
					"aria-label": T ? "取消置顶" : "置顶",
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)(Y, {
						name: "pin",
						size: 14
					})
				}),
				/* @__PURE__ */ (0, K.jsx)("button", {
					className: "canvas-card-edit",
					onClick: u,
					title: "重命名",
					"aria-label": `重命名 ${String(n.title || "")}`,
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)(Y, {
						name: "pencil",
						size: 14
					})
				}),
				/* @__PURE__ */ (0, K.jsx)("button", {
					className: "canvas-folder-btn",
					onClick: p,
					title: "移动到文件夹",
					"aria-label": `移动到文件夹 ${String(n.title || "")}`,
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)(Y, {
						name: "folder-input",
						size: 14
					})
				}),
				/* @__PURE__ */ (0, K.jsx)("button", {
					className: "canvas-delete",
					onClick: l,
					title: "移入回收站",
					"aria-label": `移入回收站 ${String(n.title || "")}`,
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)(Y, {
						name: "trash-2",
						size: 14
					})
				}),
				a ? /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "canvas-folder-menu",
					children: [/* @__PURE__ */ (0, K.jsxs)("button", {
						className: n.folder_id ? "" : "active",
						onClick: () => f(""),
						style: { "--depth": 0 },
						type: "button",
						children: [/* @__PURE__ */ (0, K.jsx)(Y, {
							name: "inbox",
							size: 12
						}), /* @__PURE__ */ (0, K.jsx)("span", { children: "未分类" })]
					}), t.map((e) => /* @__PURE__ */ (0, K.jsxs)("button", {
						className: n.folder_id === e.id ? "active" : "",
						onClick: () => f(e.id),
						style: { "--depth": jo(e.id, t) },
						type: "button",
						children: [/* @__PURE__ */ (0, K.jsx)(Y, {
							name: "folder",
							size: 12
						}), /* @__PURE__ */ (0, K.jsx)("span", { children: String(e.name || "未命名文件夹") })]
					}, e.id))]
				}) : null
			] }),
			r ? /* @__PURE__ */ (0, K.jsx)(Co, {
				item: n,
				onPatch: h,
				position: i
			}) : null
		]
	});
}
function Co({ item: e, onPatch: t, position: n }) {
	let [r, i] = (0, G.useState)(String(e.owner || "")), a = /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "canvas-meta-pop",
		"data-canvas-meta-pop": e.id,
		onMouseDown: (e) => e.stopPropagation(),
		style: {
			...n,
			zIndex: 1120
		},
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "canvas-meta-section",
				children: [/* @__PURE__ */ (0, K.jsx)("div", {
					className: "canvas-meta-label",
					children: "负责人 / 项目"
				}), /* @__PURE__ */ (0, K.jsx)("input", {
					className: "canvas-owner-input",
					maxLength: 40,
					onBlur: () => {
						let n = r.trim();
						n !== String(e.owner || "") && t({ owner: n }, "负责人保存失败");
					},
					onChange: (e) => i(e.target.value),
					onKeyDown: (e) => {
						e.key === "Enter" && e.currentTarget.blur();
					},
					placeholder: "如：张三 / 双十一项目",
					type: "text",
					value: r
				})]
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "canvas-meta-section",
				children: [/* @__PURE__ */ (0, K.jsx)("div", {
					className: "canvas-meta-label",
					children: "颜色标记"
				}), /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "canvas-color-row",
					children: [/* @__PURE__ */ (0, K.jsx)("button", {
						className: `canvas-color-swatch cc-none${e.color ? "" : " active"}`,
						onClick: () => t({ color: "" }, "颜色保存失败"),
						title: "无",
						type: "button",
						children: /* @__PURE__ */ (0, K.jsx)(Y, {
							name: "ban",
							size: 12
						})
					}), vo.map((n) => /* @__PURE__ */ (0, K.jsx)("button", {
						"aria-label": n,
						className: `canvas-color-swatch cc-${n}${e.color === n ? " active" : ""}`,
						onClick: () => t({ color: n }, "颜色保存失败"),
						type: "button"
					}, n))]
				})]
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "canvas-meta-section",
				children: [/* @__PURE__ */ (0, K.jsx)("div", {
					className: "canvas-meta-label",
					children: "更换图标"
				}), /* @__PURE__ */ (0, K.jsx)("div", {
					className: "emoji-picker-grid",
					children: yo.map((e) => /* @__PURE__ */ (0, K.jsx)("button", {
						className: "emoji-option",
						"data-icon": e,
						onClick: () => t({ icon: e }, "图标保存失败"),
						type: "button",
						children: /* @__PURE__ */ (0, K.jsx)(Y, {
							name: e,
							size: 14
						})
					}, e))
				})]
			})
		]
	});
	return (0, Dt.createPortal)(a, document.body);
}
function wo({ onFinish: e, title: t }) {
	let [n, r] = (0, G.useState)(t), i = (0, G.useRef)(!1), a = (r) => {
		i.current || (i.current = !0, e(r ? n.trim() : t));
	};
	return /* @__PURE__ */ (0, K.jsx)("input", {
		autoFocus: !0,
		className: "canvas-card-title-input",
		maxLength: 80,
		onBlur: () => a(!0),
		onChange: (e) => r(e.target.value),
		onClick: (e) => e.stopPropagation(),
		onKeyDown: (e) => {
			e.stopPropagation(), e.key === "Enter" && a(!0), e.key === "Escape" && a(!1);
		},
		onMouseDown: (e) => e.stopPropagation(),
		type: "text",
		value: n
	});
}
function To({ activeFolder: e, canvases: t, folder: n, folders: r, onCreate: i, onDelete: a, onDrop: o, onRename: s, onSelect: c }) {
	let l = jo(n.id, r);
	return /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsxs)("div", {
		className: `gate-folder-node${e === n.id ? " active" : ""}`,
		"data-folder-id": n.id,
		onDragOver: (e) => e.preventDefault(),
		onDrop: (e) => o(e, n.id),
		style: { "--depth": l },
		children: [/* @__PURE__ */ (0, K.jsxs)("button", {
			className: "gate-folder-main",
			onClick: () => c(n.id),
			title: String(n.name || ""),
			type: "button",
			children: [
				/* @__PURE__ */ (0, K.jsx)(Y, {
					name: "folder",
					size: 14
				}),
				/* @__PURE__ */ (0, K.jsx)("span", {
					className: "gate-folder-name",
					children: String(n.name || "未命名文件夹")
				}),
				/* @__PURE__ */ (0, K.jsx)("span", {
					className: "gate-folder-count",
					children: Mo(t, n.id)
				})
			]
		}), /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "gate-folder-actions",
			children: [
				/* @__PURE__ */ (0, K.jsx)("button", {
					className: "gate-folder-action",
					onClick: () => void i(n.id),
					title: "新建子文件夹",
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)(Y, {
						name: "folder-plus",
						size: 12
					})
				}),
				/* @__PURE__ */ (0, K.jsx)("button", {
					className: "gate-folder-action",
					onClick: () => void s(n),
					title: "重命名",
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)(Y, {
						name: "pencil",
						size: 12
					})
				}),
				/* @__PURE__ */ (0, K.jsx)("button", {
					className: "gate-folder-action",
					onClick: () => void a(n),
					title: "删除文件夹",
					type: "button",
					children: /* @__PURE__ */ (0, K.jsx)(Y, {
						name: "trash-2",
						size: 12
					})
				})
			]
		})]
	}), Ao(r, n.id).map((n) => /* @__PURE__ */ (0, K.jsx)(To, {
		activeFolder: e,
		canvases: t,
		folder: n,
		folders: r,
		onCreate: i,
		onDelete: a,
		onDrop: o,
		onRename: s,
		onSelect: c
	}, n.id))] });
}
function Eo({ active: e, count: t, icon: n, id: r, name: i, onDrop: a, onSelect: o }) {
	return /* @__PURE__ */ (0, K.jsx)("div", {
		className: `gate-folder-node gate-folder-special${e ? " active" : ""}`,
		"data-folder-id": r,
		onDragOver: (e) => e.preventDefault(),
		onDrop: (e) => a(e, r),
		children: /* @__PURE__ */ (0, K.jsxs)("button", {
			className: "gate-folder-main",
			onClick: () => o(r),
			type: "button",
			children: [
				/* @__PURE__ */ (0, K.jsx)(Y, {
					name: n,
					size: 14
				}),
				/* @__PURE__ */ (0, K.jsx)("span", {
					className: "gate-folder-name",
					children: i
				}),
				/* @__PURE__ */ (0, K.jsx)("span", {
					className: "gate-folder-count",
					children: t
				})
			]
		})
	});
}
function Do({ onCancel: e, onConfirm: t, text: n }) {
	return /* @__PURE__ */ (0, K.jsx)("div", {
		className: "canvas-delete-confirm",
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "canvas-delete-box",
			children: [/* @__PURE__ */ (0, K.jsx)("div", {
				className: "canvas-delete-title",
				children: n
			}), /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "canvas-delete-actions",
				children: [/* @__PURE__ */ (0, K.jsx)("button", {
					className: "canvas-confirm-btn",
					onClick: t,
					type: "button",
					children: "确定"
				}), /* @__PURE__ */ (0, K.jsx)("button", {
					className: "canvas-cancel-btn",
					onClick: e,
					type: "button",
					children: "取消"
				})]
			})]
		})
	});
}
function Y({ name: e, size: t = 16 }) {
	return /* @__PURE__ */ (0, K.jsx)("i", {
		"aria-hidden": "true",
		"data-lucide": e,
		style: {
			height: t,
			width: t
		}
	});
}
function Oo({ icon: e, size: t }) {
	return e && /[^\x00-\x7F]/.test(e) && e !== "🧩" ? /* @__PURE__ */ (0, K.jsx)(K.Fragment, { children: e }) : /* @__PURE__ */ (0, K.jsx)(Y, {
		name: !e || e === "🧩" ? "layers" : e,
		size: t
	});
}
function ko(e, t, n) {
	let r = Number(!!t.pinned) - Number(!!e.pinned);
	if (r) return r;
	if (n === "name") {
		let n = String(e.title || "").localeCompare(String(t.title || ""), "zh-Hans-CN", {
			numeric: !0,
			sensitivity: "base"
		});
		if (n) return n;
	}
	return Number(t.updated_at || t.created_at || 0) - Number(e.updated_at || e.created_at || 0);
}
function Ao(e, t) {
	return e.filter((e) => Po(e.parent_id) === t).sort((e, t) => Number(e.order || 0) - Number(t.order || 0) || String(e.name || "").localeCompare(String(t.name || ""), "zh-Hans-CN", {
		numeric: !0,
		sensitivity: "base"
	}));
}
function jo(e, t) {
	let n = 0, r = t.find((t) => t.id === e), i = /* @__PURE__ */ new Set();
	for (; r?.parent_id && !i.has(r.id);) i.add(r.id), n += 1, r = t.find((e) => e.id === r?.parent_id);
	return n;
}
function Mo(e, t) {
	return e.filter((e) => Po(e.folder_id) === t).length;
}
function No(e, t) {
	return e === "all" ? "全部画布" : e ? String(t.find((t) => t.id === e)?.name || "文件夹") : "未分类";
}
function Po(e) {
	return String(e || "").replace(/[^a-zA-Z0-9_-]/g, "");
}
function Fo(e) {
	let t = Number(e || 0);
	return t ? new Date(t < 1e10 ? t * 1e3 : t).toLocaleString() : "--";
}
function Io(e, t) {
	return e instanceof Error && e.message || t;
}
function Lo() {
	window.lucide?.createIcons();
}
//#endregion
//#region src/canvas/ui/canvas-app-v2.tsx
var Ro = [
	[
		"image",
		"上传",
		"image-plus"
	],
	[
		"prompt",
		"提示词",
		"text-cursor-input"
	],
	[
		"loop",
		"循环",
		"repeat-2"
	],
	[
		"llm",
		"LLM",
		"message-square-text"
	],
	[
		"generator",
		"API生成",
		"wand-sparkles"
	],
	[
		"msgen",
		"ModelScope生成",
		"cloud-lightning"
	],
	[
		"video",
		"视频生成",
		"clapperboard"
	],
	[
		"comfy",
		"ComfyUI",
		"workflow"
	],
	[
		"ltxDirector",
		"LTX Director",
		"film"
	],
	[
		"output",
		"Output",
		"circle-dot"
	]
];
function zo({ configuration: e = {}, management: t = et(), repository: n, runtime: r }) {
	let i = e.kind ?? "classic", [a, o] = (0, G.useState)([]), [s, c] = (0, G.useState)([]), [l, u] = (0, G.useState)([]), [d, f] = (0, G.useState)(null), [p, m] = (0, G.useState)("正在加载画布列表…"), [h, g] = (0, G.useState)(null), [_, v] = (0, G.useState)(null), [y, b] = (0, G.useState)(null), [x, S] = (0, G.useState)(!1), [C, w] = (0, G.useState)(null), [T, E] = (0, G.useState)(null), [D, O] = (0, G.useState)(null), [k, A] = (0, G.useState)(""), [j, M] = (0, G.useState)(""), [N, P] = (0, G.useState)(() => localStorage.getItem("canvasUserName") || ""), [F, I] = (0, G.useState)(!1), [ee, te] = (0, G.useState)(() => localStorage.getItem("canvas_quick_toolbar_collapsed") === "1"), L = (0, G.useRef)(null), R = (0, G.useRef)(Vo()), z = (0, G.useRef)(!1), B = (0, G.useRef)(0), ne = (0, G.useRef)(!1), re = (0, G.useRef)(!1), ie = (0, G.useCallback)(async () => {
		m("正在加载画布列表…");
		try {
			let [n, r, a] = await Promise.all([
				t.list(),
				t.listTrash(),
				t.listFolders()
			]), s = (t) => !e.kind || String(t.kind || "classic") === i, l = n.filter(s), d = r.filter(s);
			o(l.sort((e, t) => Number(t.updated_at || 0) - Number(e.updated_at || 0))), c(d), u(a), m(l.length ? "" : "还没有画布，新建一个开始创作。");
		} catch (e) {
			m(e instanceof Error ? e.message : String(e));
		}
	}, [
		i,
		e.kind,
		t
	]);
	(0, G.useEffect)(() => {
		ie();
	}, [ie]), (0, G.useEffect)(() => {
		let t = L.current;
		if (!t || !d) return;
		let i = wa(t, null, {
			clientId: R.current,
			initialDocument: d,
			legacyUi: !e.kind,
			readOnly: !!T,
			repository: n,
			runtime: r,
			smartUi: e.kind === "smart"
		});
		return window.CanvasBoardV2?.setReadOnly(!!T), i;
	}, [
		e.kind,
		d,
		n,
		r
	]), (0, G.useEffect)(() => {
		window.CanvasBoardV2?.setReadOnly(!!T);
	}, [T]), (0, G.useEffect)(() => {
		!d || e.kind && e.kind !== "smart" || window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		C,
		h,
		e.kind,
		d,
		N,
		y,
		T,
		F,
		ee,
		x
	]), (0, G.useEffect)(() => {
		let e = (e) => {
			let t = e.detail;
			t?.id === d?.id && (B.current = Math.max(B.current, Number(t.updated_at || 0)), M(""));
		};
		return window.addEventListener("canvas-board-v2-document-saved", e), () => window.removeEventListener("canvas-board-v2-document-saved", e);
	}, [d?.id]), (0, G.useEffect)(() => {
		let e = (e) => m(String(e.detail || ""));
		return window.addEventListener("canvas-board-v2-shortcut-status", e), () => window.removeEventListener("canvas-board-v2-shortcut-status", e);
	}, []), (0, G.useEffect)(() => {
		let e = () => {
			d?.id && ne.current && t.releaseLock(String(d.id), R.current, !0);
		};
		return window.addEventListener("pagehide", e, { once: !0 }), () => window.removeEventListener("pagehide", e);
	}, [d?.id, t]), (0, G.useEffect)(() => {
		let e = window.openPromptTemplateModal, t = window.openCanvasPromptLibrary, n = window.openCanvasAssetLibrary;
		return window.openPromptTemplateModal = (e) => {
			v({ onApply: (t) => {
				window.CanvasBoardV2?.updateNode(e, { text: t });
			} });
		}, window.openCanvasPromptLibrary = (e) => v(e), window.openCanvasAssetLibrary = (e) => w(e), () => {
			e ? window.openPromptTemplateModal = e : delete window.openPromptTemplateModal, t ? window.openCanvasPromptLibrary = t : delete window.openCanvasPromptLibrary, n ? window.openCanvasAssetLibrary = n : delete window.openCanvasAssetLibrary;
		};
	}, []);
	let ae = async (e) => {
		m("正在打开画布…");
		try {
			let i = await t.acquireLock(e.id, R.current, localStorage.getItem("canvasUserName") || ""), a = await n.get(e.id);
			if (ne.current = i.ok, E(i.ok ? null : i.holder || {}), O(i.ok ? i.holder || {} : null), A(""), M(""), B.current = Number(a.updated_at || 0), f(a), !i.ok) {
				m(`只读模式：画布正由 ${Wo(i.holder)} 编辑`);
				return;
			}
			m(""), r.recoverDocument(a).then(async (t) => {
				if (JSON.stringify(t) === JSON.stringify(a)) return;
				let r = await n.save(e.id, {
					...Ie(t),
					client_id: R.current
				});
				B.current = Number(r.updated_at || 0), f((e) => e?.id === r.id ? r : e);
			}).catch((e) => m(`任务恢复失败：${e instanceof Error ? e.message : String(e)}`));
		} catch (e) {
			m(e instanceof Error ? e.message : String(e));
		}
	}, V = (0, G.useCallback)(async () => {
		if (!d?.id) return !1;
		try {
			let e = ne.current, r = await t.acquireLock(String(d.id), R.current, localStorage.getItem("canvasUserName") || "");
			if (!r.ok) return ne.current = !1, E(r.holder || {}), O(null), A(""), m(`只读模式：画布正由 ${Wo(r.holder)} 编辑`), !1;
			if (ne.current = !0, E(null), O(r.holder || {}), A(""), !e) {
				let e = await n.get(String(d.id));
				B.current = Number(e.updated_at || 0), f(e), m("已取得编辑锁，并同步到最新画布");
			}
			return !0;
		} catch (e) {
			ne.current = !1, E({ username: "锁状态未知" }), O(null);
			let t = `编辑锁续期失败，已切换只读并将自动重试：${e instanceof Error ? e.message : String(e)}`;
			return A(t), m(t), !1;
		}
	}, [
		d?.id,
		t,
		n
	]), oe = (0, G.useCallback)(async () => {
		if (!d?.id || !t.checkLock) return V();
		try {
			let e = (await t.checkLock(String(d.id))).holder || null;
			return !e || String(e.client_id || "") === R.current ? V() : (ne.current = !1, E(e), O(null), A(""), !1);
		} catch (e) {
			let t = `编辑锁检查失败，保持只读并将自动重试：${e instanceof Error ? e.message : String(e)}`;
			return ne.current = !1, E({ username: "锁状态未知" }), O(null), A(t), m(t), !1;
		}
	}, [
		V,
		d?.id,
		t
	]), se = (0, G.useCallback)(async (e = 0) => {
		if (!(!d?.id || re.current)) {
			re.current = !0;
			try {
				let r = e || Number((await t.getMeta(String(d.id))).updated_at || 0);
				if (!r || r <= B.current) return;
				let i = await n.get(String(d.id)), a = window.CanvasBoardV2?.syncRemote(i);
				if (!a?.updated) {
					a?.conflicts.includes("save-in-progress") ? M("检测到远端更新，等待当前保存完成后同步") : M(`远端更新与本地修改冲突：${a?.conflicts.join("、") || "无法自动合并"}`);
					return;
				}
				B.current = Math.max(r, Number(i.updated_at || 0)), M(a.merged ? "已合并远端更新，正在保存" : "");
			} catch (e) {
				console.warn("[canvas-modern] remote canvas synchronization failed", e);
			} finally {
				re.current = !1;
			}
		}
	}, [
		d?.id,
		t,
		n
	]);
	(0, G.useEffect)(() => {
		if (!d?.id) return;
		let e = window.setInterval(() => {
			se();
		}, 5e3), t = (e) => {
			let t = e.data && typeof e.data == "object" ? e.data : {};
			t.type === "canvas_updated" && String(t.canvas_id || "") === String(d.id) && String(t.client_id || "") !== R.current && se(Number(t.updated_at || 0));
		};
		return window.addEventListener("message", t), () => {
			window.clearInterval(e), window.removeEventListener("message", t);
		};
	}, [d?.id, se]), (0, G.useEffect)(() => {
		if (!d?.id || e.kind !== "smart") return;
		let t = !1, n = 0, r = null, i = () => {
			if (!t) try {
				let e = window.location.protocol === "https:" ? "wss:" : "ws:";
				r = new WebSocket(`${e}//${window.location.host}/ws/stats?client_id=${encodeURIComponent(R.current)}`), r.onmessage = (e) => {
					try {
						let t = JSON.parse(String(e.data || "{}"));
						if (t.type !== "canvas_updated" || String(t.canvas_id || "") !== String(d.id) || String(t.client_id || "") === R.current) return;
						se(Number(t.updated_at || 0));
					} catch {}
				}, r.onclose = () => {
					t || (n = window.setTimeout(i, 3e3));
				};
			} catch {
				n = window.setTimeout(i, 3e3);
			}
		};
		return i(), () => {
			t = !0, window.clearTimeout(n), r?.close();
		};
	}, [
		e.kind,
		d?.id,
		se
	]), (0, G.useEffect)(() => {
		if (!d?.id) return;
		let e = window.setInterval(() => {
			oe();
		}, 5e3);
		return () => window.clearInterval(e);
	}, [oe, d?.id]), (0, G.useEffect)(() => {
		let t = String(e.initialCanvasId || "").trim();
		!t || d || z.current || (z.current = !0, ae(a.find((e) => e.id === t) ?? {
			id: t,
			kind: i
		}));
	}, [
		a,
		i,
		e.initialCanvasId,
		d
	]);
	let ce = async () => {
		d?.id && ne.current && await t.releaseLock(String(d.id), R.current).catch(() => void 0), ne.current = !1, E(null), O(null), A(""), M(""), B.current = 0, f(null), g(null), await ie();
	}, H = async () => {
		let e = localStorage.getItem("canvasUserName") || "", t = window.prompt("编辑身份名称", e);
		t !== null && (localStorage.setItem("canvasUserName", t.trim()), P(t.trim()), d?.id && await V());
	}, le = async () => {
		await ce(), window.location.href = e.managerBackHref || "/static/canvas.html";
	}, ue = async () => {
		d?.id && g(await n.listBackups(String(d.id)));
	}, de = async (e) => {
		d?.id && b({
			mode: e,
			document: await n.get(String(d.id))
		});
	}, fe = () => {
		let e = window.CanvasBoardV2?.exportSelection();
		if (!e?.nodes.length) {
			m("没有可导出的节点");
			return;
		}
		let t = new Blob([JSON.stringify({
			version: 2,
			...e
		}, null, 2)], { type: "application/json" }), n = URL.createObjectURL(t);
		Object.assign(document.createElement("a"), {
			download: `${String(d?.title || "canvas")}-workflow.json`,
			href: n
		}).click(), URL.revokeObjectURL(n), S(!1);
	}, pe = async () => {
		let e = window.CanvasBoardV2?.exportSelection();
		if (!e?.nodes.length) {
			m("没有可导出的节点");
			return;
		}
		try {
			m("正在收集工作流资源…");
			let t = `${String(d?.title || "canvas")}-workflow.zip`, n = await fetch("/api/canvas-workflows/export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...e,
					filename: t,
					include_resources: !0
				})
			});
			if (!n.ok) {
				let e = await n.json().catch(() => ({}));
				throw Error(e.detail || "导出工作流失败");
			}
			Jo(await n.blob(), n.headers.get("Content-Disposition"), t), m("已导出含本地资源的工作流 ZIP"), S(!1);
		} catch (e) {
			m(e instanceof Error ? e.message : String(e));
		}
	}, me = (e) => {
		let t = e || window.CanvasBoardV2?.exportSelection();
		if (!t?.nodes.length) {
			m("没有可保存的节点");
			return;
		}
		let n = String(d?.title || "canvas");
		S(!1), w({ saveWorkflow: {
			...t,
			filename: `${n}-workflow.zip`,
			name: n
		} });
	}, he = async () => {
		let e = window.CanvasBoardV2?.exportSelection(), t = Yo(e?.nodes || []);
		if (!t.length) {
			m("选区中没有可批量导出的媒体或文本");
			return;
		}
		let n = window.prompt("导出到服务器文件夹（留空使用默认导出目录）", "");
		if (n !== null) try {
			let e = await fetch("/api/smart-canvas/group-export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					folder: n.trim(),
					group_name: String(d?.title || "canvas"),
					items: t
				})
			}), r = await e.json().catch(() => ({}));
			if (!e.ok) throw Error(r.detail || "批量导出失败");
			m(`已导出 ${Number(r.count || t.length)} 项到 ${String(r.folder || "默认导出目录")}`), S(!1);
		} catch (e) {
			m(e instanceof Error ? e.message : String(e));
		}
	}, ge = async (e) => {
		try {
			let t = new FormData();
			t.append("file", e);
			let n = await fetch("/api/canvas-workflows/import", {
				method: "POST",
				body: t
			});
			if (!n.ok) throw Error("导入工作流失败");
			let r = qo(await n.json()), i = window.CanvasBoardV2?.importWorkflow(r) ?? [];
			return m(i.length ? `已导入 ${i.length} 个节点` : "文件中没有可导入节点"), S(!1), i.length;
		} catch (e) {
			throw m(e instanceof Error ? e.message : String(e)), e;
		}
	}, _e = () => w({
		onInsert: (t) => {
			let n = e.kind === "smart", r = window.CanvasBoardV2?.addNode(n ? "smart-image" : "image", {
				x: 100,
				y: 100
			});
			r && window.CanvasBoardV2?.updateNode(r, n ? {
				images: [{
					asset_item_id: t.id,
					asset_uris: t.asset_uris,
					kind: t.kind,
					name: t.name,
					url: t.url
				}],
				scale: 2,
				title: t.kind === "video" ? "Video" : t.kind === "audio" ? "Audio" : "Image"
			} : {
				mediaKind: t.kind,
				name: t.name,
				url: t.url
			});
		},
		onImportWorkflow: async (e) => {
			let t = await fetch(e.url);
			if (!t.ok) throw Error("读取资产库工作流失败");
			let n = /\.json(?:[?#]|$)/i.test(e.url) ? ".json" : ".zip";
			await ge(new File([await t.blob()], `${e.name || "workflow"}${n}`));
		}
	}), U = () => C ? w(null) : _e(), ve = () => {
		let t = e.assetInboxKey || "", n = Oa(t);
		if (!n.length) return m("素材收件箱为空或已过期"), 0;
		let r = Math.max(1, Math.min(n.length, Math.ceil(Math.sqrt(n.length)))), i = n.map((t, n) => {
			let i = e.kind === "smart", a = window.CanvasBoardV2?.addNode(i ? "smart-image" : "image", {
				x: 100 + n % r * 280,
				y: 100 + Math.floor(n / r) * 220
			});
			return a && window.CanvasBoardV2?.updateNode(a, i ? {
				images: [{
					kind: t.kind,
					name: t.name,
					url: t.url
				}],
				scale: 2,
				title: t.kind === "video" ? "Video" : t.kind === "audio" ? "Audio" : "Image"
			} : {
				mediaKind: t.kind,
				name: t.name,
				url: t.url
			}), a;
		}).filter(Boolean);
		return localStorage.removeItem(t), m(`已从素材库导入 ${i.length} 个素材`), i.length;
	};
	if ((0, G.useEffect)(() => {
		if (!d || !e.assetInboxKey) return;
		let t = (t) => {
			mi(t.target) || [...t.clipboardData?.files || []].some(hi) || Oa(e.assetInboxKey || "").length && (t.preventDefault(), ve(), window.dispatchEvent(new Event("canvas-board-v2-asset-inbox-pasted")));
		};
		return window.addEventListener("paste", t, !0), () => window.removeEventListener("paste", t, !0);
	}, [e.assetInboxKey, d]), (0, G.useEffect)(() => {
		if (e.kind !== "smart" || !d) {
			document.body.classList.remove("smart-canvas-readonly");
			return;
		}
		return document.body.classList.toggle("smart-canvas-readonly", !!T), () => document.body.classList.remove("smart-canvas-readonly");
	}, [
		e.kind,
		d,
		T
	]), !d) {
		let n = e.kind === "classic" ? xo : bo;
		return /* @__PURE__ */ (0, K.jsx)(n, {
			canvases: a,
			configuration: e,
			folders: l,
			management: t,
			onOpen: ae,
			onRefresh: ie,
			onStatus: m,
			status: p,
			trash: s
		});
	}
	let ye = !e.kind, W = e.kind === "smart", be = W ? ro(Array.isArray(d.logs) ? d.logs : []) : null, xe = () => {
		te((e) => {
			let t = !e;
			return localStorage.setItem("canvas_quick_toolbar_collapsed", t ? "1" : "0"), t;
		});
	}, Se = async () => {
		if (!d?.id) return;
		let e = await n.createBackup(String(d.id)), t = Number(e.updated_at || 0);
		m(t ? `备份已保存 (${new Date(t).toLocaleTimeString()})` : "备份已保存"), await ue();
	}, Ce = async (e) => {
		if (!d?.id) return;
		if (T) {
			m("画布正在被其他人编辑，无法恢复备份");
			return;
		}
		await window.CanvasBoardV2?.flushSaves();
		let t = await n.restoreBackup(String(d.id), e);
		B.current = Number(t.updated_at || 0), f(t), g(null), m("备份已恢复");
	}, we = async (e) => {
		d?.id && (await t.deleteBackup(String(d.id), e), await ue());
	};
	return /* @__PURE__ */ (0, K.jsxs)("main", {
		className: `canvas-modern-editor ${ye || W ? "shell" : ""}`,
		id: W ? "shell" : void 0,
		children: [
			ye ? /* @__PURE__ */ (0, K.jsxs)("header", {
				className: "topbar canvas-modern-topbar",
				children: [/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "panel canvas-nav",
					children: [
						/* @__PURE__ */ (0, K.jsx)("button", {
							"aria-label": "返回画布管理",
							className: "tool-btn",
							onClick: () => void ce(),
							title: "返回画布管理",
							type: "button",
							children: /* @__PURE__ */ (0, K.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": "arrow-left"
							})
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "canvas-nav-meta",
							children: [/* @__PURE__ */ (0, K.jsx)("div", {
								className: "current-canvas-title",
								children: String(d.title || "未命名画布")
							}), /* @__PURE__ */ (0, K.jsx)("div", {
								className: "current-canvas-time",
								children: T ? `只读 · ${Wo(T)} 编辑中` : j || Ho(d.updated_at)
							})]
						}),
						T ? /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "canvas-lock-badge locked-by-other",
							title: `${Wo(T)} 正在编辑`,
							children: [/* @__PURE__ */ (0, K.jsx)("i", {
								className: "w-3.5 h-3.5",
								"data-lucide": "lock"
							}), /* @__PURE__ */ (0, K.jsx)("span", { children: Wo(T) })]
						}) : null,
						/* @__PURE__ */ (0, K.jsxs)("button", {
							"aria-label": "设置我的名称",
							className: "canvas-identity-btn",
							onClick: () => void H(),
							title: "设置我的名称",
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("i", {
								className: "w-3.5 h-3.5",
								"data-lucide": "user-pen"
							}), /* @__PURE__ */ (0, K.jsx)("span", { children: "我的名称" })]
						})
					]
				}), /* @__PURE__ */ (0, K.jsxs)("div", {
					className: `panel toolbar editor-only canvas-modern-toolbar ${ee ? "collapsed" : ""}`,
					children: [
						/* @__PURE__ */ (0, K.jsx)("button", {
							"aria-label": ee ? "展开快捷菜单" : "折叠快捷菜单",
							className: "tool-btn toolbar-toggle",
							onClick: xe,
							title: ee ? "展开快捷菜单" : "折叠快捷菜单",
							type: "button",
							children: /* @__PURE__ */ (0, K.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": "chevron-left"
							})
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "toolbar-items",
							children: [Ro.map(([e, t, n]) => /* @__PURE__ */ (0, K.jsxs)("button", {
								className: "tool-btn",
								disabled: !!T,
								onClick: () => window.CanvasBoardV2?.addNode(e),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", {
									className: "w-4 h-4",
									"data-lucide": n
								}), /* @__PURE__ */ (0, K.jsx)("span", { children: t })]
							}, e)), /* @__PURE__ */ (0, K.jsxs)("button", {
								className: "tool-btn",
								disabled: !!T,
								onClick: () => window.CanvasBoardV2?.groupSelected(),
								type: "button",
								children: [/* @__PURE__ */ (0, K.jsx)("i", {
									className: "w-4 h-4",
									"data-lucide": "group"
								}), /* @__PURE__ */ (0, K.jsx)("span", { children: "分组" })]
							})]
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "toolbar-fixed",
							children: [
								/* @__PURE__ */ (0, K.jsxs)("button", {
									"aria-label": "导入导出工作流",
									className: "tool-btn toolbar-workflow",
									onClick: () => S(!0),
									title: "导入导出工作流",
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", {
										className: "w-4 h-4",
										"data-lucide": "package-open"
									}), /* @__PURE__ */ (0, K.jsx)("span", { children: "工作流" })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									"aria-label": "资产库",
									className: "tool-btn toolbar-asset canvas-asset-toggle",
									onClick: _e,
									title: "资产库",
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", {
										className: "w-4 h-4",
										"data-lucide": "library"
									}), /* @__PURE__ */ (0, K.jsx)("span", { children: "资产库" })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									"aria-label": "费用仪表盘",
									className: "tool-btn toolbar-cost",
									onClick: () => void de("cost"),
									title: "费用仪表盘",
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", {
										className: "w-4 h-4",
										"data-lucide": "circle-dollar-sign"
									}), /* @__PURE__ */ (0, K.jsxs)("span", { children: ["费用 ¥", Da(d).toFixed(2)] })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									"aria-label": "日志",
									className: "tool-btn toolbar-log",
									onClick: () => void de("logs"),
									title: "日志",
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", {
										className: "w-4 h-4",
										"data-lucide": "list-todo"
									}), /* @__PURE__ */ (0, K.jsx)("span", { children: "日志" })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("button", {
									"aria-label": "备份",
									className: "tool-btn toolbar-backup",
									disabled: !!T,
									onClick: () => void ue(),
									title: "备份",
									type: "button",
									children: [/* @__PURE__ */ (0, K.jsx)("i", {
										className: "w-4 h-4",
										"data-lucide": "hard-drive"
									}), /* @__PURE__ */ (0, K.jsx)("span", { children: "备份" })]
								})
							]
						})
					]
				})]
			}) : /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "smart-nav",
					children: [
						/* @__PURE__ */ (0, K.jsx)("button", {
							"aria-label": "返回画布管理",
							className: "smart-nav-back",
							onClick: () => void le(),
							title: "返回画布管理",
							type: "button",
							children: /* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "arrow-left" })
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "smart-nav-meta",
							children: [/* @__PURE__ */ (0, K.jsx)("div", {
								className: "smart-title",
								id: "smartTitle",
								children: String(d.title || "智能画布")
							}), /* @__PURE__ */ (0, K.jsx)("div", {
								className: "smart-canvas-time",
								id: "smartCanvasTime",
								children: j || Uo(d.updated_at)
							})]
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: `smart-lock-badge ${T ? "other" : "mine"}`,
							id: "smartLockBadge",
							title: T ? `${Wo(T)} 正在编辑` : Ko(D),
							children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "lock" }), /* @__PURE__ */ (0, K.jsx)("span", {
								id: "smartLockLabel",
								children: T ? `${Wo(T)} 编辑中` : Go(D)
							})]
						}),
						/* @__PURE__ */ (0, K.jsxs)("button", {
							className: "smart-identity-btn",
							id: "smartIdentityBtn",
							onClick: () => void H(),
							title: "设置我的名称",
							type: "button",
							children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "user-pen" }), /* @__PURE__ */ (0, K.jsx)("span", {
								id: "smartIdentityLabel",
								children: N || "未命名用户"
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, K.jsxs)("button", {
					"aria-label": "导入导出工作流",
					className: `smart-workflow-toggle ${x ? "active" : ""}`,
					id: "smartWorkflowToggle",
					onClick: () => S(!0),
					title: "导入导出工作流",
					type: "button",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "package-open" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "工作流" })]
				}),
				/* @__PURE__ */ (0, K.jsxs)("button", {
					"aria-label": "快捷键",
					className: `smart-shortcut-toggle ${F ? "active" : ""}`,
					id: "smartShortcutToggle",
					onClick: () => I(!0),
					title: "快捷键",
					type: "button",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "keyboard" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "快捷键" })]
				}),
				/* @__PURE__ */ (0, K.jsxs)("button", {
					"aria-label": "费用仪表盘",
					className: `smart-cost-toggle ${y?.mode === "cost" ? "active" : ""}`,
					id: "smartCostToggle",
					onClick: () => void de("cost"),
					title: be?.unknown ? `费用仪表盘 · ${be.unknown} 笔待定价` : "费用仪表盘",
					type: "button",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "circle-dollar-sign" }), /* @__PURE__ */ (0, K.jsxs)("span", {
						id: "smartCostToggleLabel",
						children: ["费用 ", io(be?.total || 0)]
					})]
				}),
				/* @__PURE__ */ (0, K.jsxs)("button", {
					"aria-label": "日志",
					className: `smart-log-toggle ${y?.mode === "logs" ? "active" : ""}`,
					id: "smartLogToggle",
					onClick: () => void de("logs"),
					title: "日志",
					type: "button",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "list-todo" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "日志" })]
				}),
				/* @__PURE__ */ (0, K.jsxs)("button", {
					"aria-label": "备份",
					className: `smart-backup-toggle ${h ? "active" : ""}`,
					id: "smartBackupToggle",
					onClick: () => void ue(),
					title: "备份",
					type: "button",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "hard-drive" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "备份" })]
				}),
				/* @__PURE__ */ (0, K.jsxs)("button", {
					className: `asset-toggle ${C ? "active" : ""}`,
					id: "assetToggle",
					onClick: _e,
					type: "button",
					children: [/* @__PURE__ */ (0, K.jsx)("i", { "data-lucide": "library" }), /* @__PURE__ */ (0, K.jsx)("span", { children: "资产库" })]
				}),
				/* @__PURE__ */ (0, K.jsx)(gi, {
					onClose: () => I(!1),
					onToggleAssets: U,
					open: F
				})
			] }),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: `canvas-modern-board ${W ? "world" : ""}`,
				id: W ? "world" : void 0,
				ref: L,
				style: W ? {
					height: "100%",
					inset: 0,
					position: "absolute",
					transform: "none",
					width: "100%"
				} : ye ? { inset: 0 } : void 0
			}),
			W ? /* @__PURE__ */ (0, K.jsx)("div", {
				className: "selection-box",
				id: "selectionBox"
			}) : null,
			W ? /* @__PURE__ */ (0, K.jsx)("div", {
				"aria-live": "polite",
				className: `toast ${p ? "show" : ""}`,
				id: "toast",
				children: p
			}) : null,
			W ? /* @__PURE__ */ (0, K.jsx)(uo, {
				backups: h,
				lockHolder: T,
				lockIssue: k,
				onAcquireLock: V,
				onCloseBackups: () => g(null),
				onCreateBackup: Se,
				onDeleteBackup: we,
				onRestoreBackup: Ce,
				onStatus: m
			}) : null,
			ye ? /* @__PURE__ */ (0, K.jsx)("div", {
				className: "hint editor-only",
				children: "拖拽画布移动，Ctrl 框选多选，拖动选中节点可一起移动。上传/提示词节点右下端口拖线到生成节点。"
			}) : null,
			e.editorAddon,
			T && !W ? /* @__PURE__ */ (0, K.jsx)("div", {
				className: "canvas-modern-readonly-overlay",
				children: /* @__PURE__ */ (0, K.jsxs)("section", { children: [
					/* @__PURE__ */ (0, K.jsx)("strong", { children: "只读模式" }),
					/* @__PURE__ */ (0, K.jsxs)("span", { children: [Wo(T), " 正在编辑此画布"] }),
					k ? /* @__PURE__ */ (0, K.jsx)("small", { children: k }) : null,
					/* @__PURE__ */ (0, K.jsx)("button", {
						className: "primary-btn",
						onClick: () => void V(),
						type: "button",
						children: "尝试取得编辑锁"
					})
				] })
			}) : null,
			h && !W ? /* @__PURE__ */ (0, K.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, K.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("header", { children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: "画布备份" }), /* @__PURE__ */ (0, K.jsx)("button", {
							onClick: () => g(null),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, K.jsx)("button", {
							onClick: Se,
							type: "button",
							children: "立即备份"
						}),
						h.map((e) => /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "backup-item",
							children: [
								/* @__PURE__ */ (0, K.jsx)("span", { children: String(e.filename) }),
								/* @__PURE__ */ (0, K.jsx)("button", {
									onClick: () => void Ce(String(e.filename)),
									type: "button",
									children: "恢复"
								}),
								/* @__PURE__ */ (0, K.jsx)("button", {
									onClick: () => void we(String(e.filename)),
									type: "button",
									children: "删除"
								})
							]
						}, String(e.filename)))
					]
				})
			}) : null,
			_ ? /* @__PURE__ */ (0, K.jsx)(ho, {
				onClose: () => v(null),
				request: _
			}) : null,
			x ? W ? /* @__PURE__ */ (0, K.jsx)(Ka, {
				onClose: () => S(!1),
				onImport: ge,
				onSaveToLibrary: me,
				onStatus: m,
				title: String(d.title || "canvas")
			}) : /* @__PURE__ */ (0, K.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, K.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("header", { children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: "工作流导入 / 导出" }), /* @__PURE__ */ (0, K.jsx)("button", {
							onClick: () => S(!1),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, K.jsx)("p", { children: "有选中节点时仅导出选区；分组会自动包含其成员。ZIP 会携带节点引用的本地媒体，导入后自动恢复资源地址。" }),
						/* @__PURE__ */ (0, K.jsx)("button", {
							onClick: fe,
							type: "button",
							children: "导出 JSON"
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							className: "primary-btn",
							onClick: () => void pe(),
							type: "button",
							children: "导出 ZIP（含资源）"
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							onClick: () => me(),
							type: "button",
							children: "保存到工作流库"
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							onClick: () => void he(),
							type: "button",
							children: "批量导出选区结果"
						}),
						/* @__PURE__ */ (0, K.jsxs)("label", {
							className: "primary-btn",
							children: ["导入 JSON / ZIP", /* @__PURE__ */ (0, K.jsx)("input", {
								accept: ".json,.zip,application/json,application/zip",
								hidden: !0,
								onChange: (e) => {
									let t = e.target.files?.[0];
									t && ge(t);
								},
								type: "file"
							})]
						})
					]
				})
			}) : null,
			C ? W ? /* @__PURE__ */ (0, K.jsx)(Fa, {
				onClose: () => w(null),
				request: C
			}) : /* @__PURE__ */ (0, K.jsx)(Aa, {
				onClose: () => w(null),
				request: C
			}) : null,
			y ? W ? /* @__PURE__ */ (0, K.jsx)(to, {
				document: y.document,
				mode: y.mode,
				onClose: () => b(null)
			}) : /* @__PURE__ */ (0, K.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, K.jsxs)("section", {
					className: "modal-panel",
					children: [/* @__PURE__ */ (0, K.jsxs)("header", { children: [/* @__PURE__ */ (0, K.jsx)("strong", { children: y.mode === "logs" ? "生成日志" : "费用汇总" }), /* @__PURE__ */ (0, K.jsx)("button", {
						onClick: () => b(null),
						type: "button",
						children: "关闭"
					})] }), y.mode === "logs" ? /* @__PURE__ */ (0, K.jsx)(K.Fragment, { children: (Array.isArray(y.document.logs) ? y.document.logs : []).slice().reverse().map((e, t) => /* @__PURE__ */ (0, K.jsx)("pre", { children: JSON.stringify(e, null, 2) }, String(e.id || t))) }) : /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsxs)("h2", { children: ["¥ ", Da(y.document).toFixed(4)] }), /* @__PURE__ */ (0, K.jsx)("p", { children: "仅汇总任务记录中已返回的费用字段；供应商未返回价格时显示为 0。" })] })]
				})
			}) : null
		]
	});
}
function Bo(e, t) {
	let n = (0, Ze.createRoot)(e);
	return n.render(/* @__PURE__ */ (0, K.jsx)(zo, { ...t })), () => n.unmount();
}
function Vo() {
	let e = sessionStorage.getItem("canvasClientId");
	if (e) return e;
	let t = `canvas_${crypto.randomUUID?.() || Date.now()}`;
	return sessionStorage.setItem("canvasClientId", t), t;
}
function Ho(e) {
	let t = Number(e || 0);
	return t ? new Date(t < 1e10 ? t * 1e3 : t).toLocaleString() : "--";
}
function Uo(e) {
	let t = Number(e || 0);
	if (!t) return "--";
	let n = new Date(t < 1e10 ? t * 1e3 : t);
	return Number.isNaN(n.getTime()) ? "--" : n.toLocaleString("zh-CN", {
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		month: "2-digit"
	});
}
function Wo(e) {
	return String(e?.username || e?.ip || "其他用户");
}
function Go(e) {
	return `你正在编辑${e?.ip ? ` · ${String(e.ip)}` : ""}`;
}
function Ko(e) {
	return [`用户：${String(e?.username || "").trim() || "未命名用户"}`, e?.ip ? `IP：${String(e.ip)}` : ""].filter(Boolean).join("\n");
}
function qo(e) {
	let t = e && typeof e == "object" ? e : {}, n = t.workflow && typeof t.workflow == "object" ? t.workflow : t;
	return {
		connections: Array.isArray(n.connections) ? n.connections : [],
		nodes: Array.isArray(n.nodes) ? n.nodes : []
	};
}
function Jo(e, t, n) {
	let r = t?.match(/filename\*=UTF-8''([^;]+)/i)?.[1], i = t?.match(/filename="?([^";]+)"?/i)?.[1], a = r ? decodeURIComponent(r) : i || n, o = URL.createObjectURL(e);
	Object.assign(document.createElement("a"), {
		download: a,
		href: o
	}).click(), URL.revokeObjectURL(o);
}
function Yo(e) {
	let t = [], n = /* @__PURE__ */ new Set(), r = (e, r) => {
		let i = e && typeof e == "object" ? e : {}, a = typeof e == "string" ? e : String(i.url || "");
		if (!a || n.has(a)) return;
		n.add(a);
		let o = String(i.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(a) ? "video" : /\.(mp3|wav|m4a)(\?|$)/i.test(a) ? "audio" : "image"));
		t.push({
			kind: o,
			name: String(i.name || r),
			url: a
		});
	};
	return e.forEach((e, n) => {
		if (!e || typeof e != "object") return;
		let i = e, a = String(i.title || i.name || `${String(i.type || "node")}-${n + 1}`);
		i.url && r(i, a), Array.isArray(i.images) && i.images.forEach((e, t) => r(e, `${a}-${t + 1}`));
		let o = String(i.outputText || i.type === "prompt" && i.text || "").trim();
		o && t.push({
			kind: "text",
			name: `${a}.txt`,
			text: o
		});
	}), t;
}
//#endregion
//#region src/features/smart-canvas/domain.ts
var Xo = /* @__PURE__ */ new Set([
	"smart-image",
	"smart-prompt",
	"smart-loop"
]);
function Zo(e) {
	if (String(e.kind || "") !== "smart" || !e.nodes.some((e) => Xo.has(e.type) || !e.type)) return e;
	let t = structuredClone(e), n = t.nodes.map((e) => e.type === "smart-prompt" ? {
		...e,
		type: "prompt",
		text: String(e.text || e.prompt || "")
	} : e.type === "smart-loop" ? {
		...e,
		type: "loop",
		count: Math.max(1, Number(e.count || e.loopCount || 1))
	} : !e.type || e.type === "smart-image" ? {
		...e,
		type: "smart-image",
		images: Qo(e)
	} : e);
	return {
		...t,
		nodes: n,
		schemaVersion: Math.max(1, Number(t.schemaVersion || 1))
	};
}
function Qo(e) {
	return (Array.isArray(e.images) ? e.images : e.url ? [{
		url: e.url,
		name: e.name,
		kind: e.kind
	}] : []).flatMap((e) => {
		if (typeof e == "string") return [{
			url: e,
			name: "Image",
			kind: "image"
		}];
		if (!e || typeof e != "object") return [];
		let t = e, n = String(t.url || t.src || "").trim();
		return n ? [{
			...t,
			url: n,
			kind: t.kind || $o(n)
		}] : [];
	});
}
function $o(e) {
	return /\.(mp4|webm|mov)(\?|$)/i.test(e) ? "video" : /\.(mp3|wav|m4a|ogg)(\?|$)/i.test(e) ? "audio" : "image";
}
//#endregion
//#region src/shared/theme.ts
function es(e) {
	return e === "dark" ? "dark" : "light";
}
function ts(e) {
	let t = es(e), n = t === "dark";
	return document.documentElement.classList.toggle("studio-theme-dark", n), document.documentElement.classList.toggle("theme-dark", n), document.body.classList.toggle("studio-theme-dark", n), t;
}
function ns() {
	ts(localStorage.getItem("studio_theme") || localStorage.getItem("canvas_theme") || "light");
	let e = (e) => {
		e.data?.type === "studio-theme" && ts(e.data.theme);
	};
	return window.addEventListener("message", e), () => window.removeEventListener("message", e);
}
//#endregion
//#region src/pages/smart-canvas.tsx
async function rs() {
	ns();
	let e = document.getElementById("smartCanvasApp");
	if (!e) throw Error("Missing #smartCanvasApp");
	let t = re(ze());
	await t.initialize();
	let n = Fe();
	Bo(e, {
		configuration: {
			assetInboxKey: "smart_canvas_asset_inbox",
			createLabel: "新建智能画布",
			defaultTitle: "智能画布",
			heading: "智能画布",
			initialCanvasId: new URLSearchParams(window.location.search).get("id") || "",
			kind: "smart",
			managerBackHref: "/static/canvas.html",
			subtitle: "React + TypeScript 智能工作流与多模型生成画布"
		},
		repository: {
			...n,
			get: async (e, t) => Zo(await n.get(e, t)),
			restoreBackup: async (e, t, r) => Zo(await n.restoreBackup(e, t, r))
		},
		runtime: t
	});
}
try {
	await rs();
} catch (e) {
	if (console.error("[smart-canvas] React entry failed", e), !window.__loadSmartCanvasLegacyFallback) throw e;
	await window.__loadSmartCanvasLegacyFallback();
}
//#endregion
