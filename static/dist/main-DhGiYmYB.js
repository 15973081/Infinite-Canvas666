import { n as e, t } from "./http-F-lX8WKW.js";
import { n, r, t as i } from "./rollout-BcgAkMGv.js";
import { n as a, t as o } from "./graph-Dsb9toch.js";
import { a as s, n as c } from "./document-merge-BpHwnITQ.js";
//#region src/canvas/application/smart-canvas-execution.ts
var l = {
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
function u({ fetcher: t, getConfig: n, getWorkflow: r, taskClient: i }) {
	let a = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new WeakMap(), s = (e) => !!(e && (e.type === "smart-image" || e.type === "loop" || e.type === "prompt" && e.llmEnabled)), c = async (e, t) => {
		t && await t(structuredClone(e));
	}, l = (n, r, i) => e(t, n, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(r)
	}, { signal: i }), u = async (e, t, n = "node", r) => {
		let i = structuredClone(t), o = i.nodes.find((t) => t.id === e);
		if (!s(o)) throw Error(`不支持执行节点：${o?.type || e}`);
		a.get(e)?.abort();
		let c = new AbortController();
		a.set(e, c);
		try {
			if (o?.type === "loop") await ie(i, o, c.signal, r);
			else if (o?.type === "prompt") await O(i, o, c.signal, r);
			else {
				let t = n === "cascade" ? g(i, e) : [e];
				for (let e of t) {
					D(c.signal);
					let t = i.nodes.find((t) => t.id === e);
					t?.type === "prompt" && t.llmEnabled ? await O(i, t, c.signal, r) : t?.type === "smart-image" && await k(i, t, c.signal, r);
				}
			}
			return i;
		} finally {
			a.get(e) === c && a.delete(e);
		}
	}, S = async (e, t, n, r) => {
		if (e === "stop-execution") {
			a.get(t)?.abort();
			let e = structuredClone(n);
			return e.nodes.filter((e) => e.id === t || e.running).forEach((e) => {
				e.running = !1, e.queued = !1, e.runStatus = "stopped";
			}), await c(e, r), e;
		}
		let i = n.nodes.find((e) => e.id === t);
		if (!i) return structuredClone(n);
		let o = structuredClone(n), s = o.nodes.find((e) => e.id === t);
		return s.runError = "", s.runStatus = void 0, u(t, o, i.type === "loop" ? "cascade" : "node", r);
	}, E = async (e, t) => {
		let n = structuredClone(e), r = [];
		return n.nodes.filter((e) => e.type === "smart-image").forEach((e) => {
			y(e).filter((e) => !e.failed || !e.recoverTaskId).forEach((a) => {
				let o = String(a.taskId || ""), s = a.kind === "video" ? "video" : "image";
				o && (a.recoveryStatus = "recovering", r.push(i.watch(s, o).then(async (r) => {
					let i = b(e, a, r);
					i.length && x(n, e, i, !0), await c(n, t);
				}).catch(async (r) => {
					a.failed = !0, a.recoveryStatus = "interrupted", a.error = r instanceof Error ? r.message : String(r), e.running = !1, await c(n, t);
				})));
			});
		}), r.length && (await c(n, t), await Promise.all(r)), n;
	}, O = async (e, t, n, r, i) => {
		let a = String(t.llmInstruction || t.text || "").trim();
		if (!a) throw Error("请输入要处理的提示词或 LLM 指令");
		let o = h(e, t, i).media, s = String(t.llmProvider || ""), u = String(t.llmModel || t.model || ""), d = {
			message: a,
			messages: [],
			images: o.filter((e) => e.kind === "image").map((e) => e.url),
			videos: o.filter((e) => e.kind === "video").map((e) => e.url),
			model: u,
			provider: s,
			ms_model: s === "modelscope" ? u : "",
			system_prompt: t.llmSystemEnabled ? String(t.llmSystemPrompt || "You are a helpful prompt assistant.") : ""
		};
		t.running = !0, t.runStatus = "running", t.runError = "", await c(e, r);
		try {
			let r = await l("/api/canvas-llm", d, n);
			t.text = String(r.text || "").trim(), t.runStatus = "done", w(e, t, d, [], "");
		} catch (n) {
			throw C(e, t, n, d), n;
		} finally {
			t.running = !1, await c(e, r);
		}
	}, ie = async (e, t, n, r) => {
		let i = _(e, t.id);
		if (!i) throw Error("请把循环节点连接到下游图片链路");
		let a = Math.max(1, Number(t.loopStart || 1)), o = Math.max(1, Math.min(100, Number(t.count || 1))), s = Array.from({ length: o }, (e, t) => a + t);
		t.running = !0, t.runStatus = "running", t.runStartedAt = Date.now(), t.runTotal = o, await c(e, r);
		let l = async (a) => {
			D(n);
			let o = {
				images: ee(e, t, a),
				loopId: t.id,
				prompt: v(t, a)
			};
			t.activeRound = a, t.currentPrompt = o.prompt, t.currentImages = o.images, await c(e, r);
			for (let t of g(e, i.id)) {
				D(n);
				let i = e.nodes.find((e) => e.id === t);
				i?.type === "prompt" && i.llmEnabled ? await O(e, i, n, r, o) : i?.type === "smart-image" && await k(e, i, n, r, !0, o);
			}
		};
		try {
			if (t.mode === "parallel") await Promise.all(s.map(l));
			else for (let e of s) await l(e);
			t.runStatus = "done";
		} catch (e) {
			throw t.runStatus = n.aborted ? "stopped" : "failed", t.runError = e instanceof Error ? e.message : String(e), e;
		} finally {
			t.running = !1, t.activeRound = void 0, t.currentImages = void 0, t.currentPrompt = void 0, t.runFinishedAt = Date.now(), await c(e, r);
		}
	}, k = async (e, t, r, i, a = !1, s) => {
		let u = d(t), m = h(e, t, s), g = m.prompts.join("\n\n").trim() || String(t.runModelPrompt || t.runPrompt || t.promptDraftText || ""), _ = String(u.engine || "api"), v = (_ === "api" || _ === "volcengine") && String(u.apiKind || "image") === "video";
		if (!g && (_ !== "comfy" || String(u.comfyMode || u.mode || "text") === "text") && !m.media.some((e) => e.kind === "image")) throw Error("缺少提示词输入");
		let ee = _ === "api" || _ === "volcengine" || _ === "modelscope" ? Math.max(1, Math.min(8, Number(u.count || 1))) : 1;
		o.set(t, (o.get(t) || 0) + 1), t.running = !0, t.pending = v ? 1 : ee, t.runStartedAt = Date.now(), t.runStatus = "running", t.runError = "", await c(e, i);
		let b = {};
		try {
			let o = [];
			if (_ === "comfy") {
				let e = await A(u, g, m.media, r);
				b = e.request, o = e.outputs;
			} else if (_ === "modelscope") {
				let e = await oe(u, g, m.media, r);
				b = e.request, o = e.outputs;
			} else if (v) {
				let e = p(u, g, m.media, n());
				b = e, o = T(await l("/api/canvas-video", e, r), "video");
			} else {
				let n = f(u, g, m.media);
				if (b = n, o = await ae(e, t, u, n, r, i), y(t).some((e) => e.failed && e.recoverTaskId)) return;
			}
			if (!o.length) throw Error(v ? "没有返回视频" : "没有返回图片");
			x(e, t, o, a), w(e, t, b, o, "");
		} catch (n) {
			throw r.aborted ? (t.runStatus = "stopped", t.runError = "执行已停止") : C(e, t, n, b), n;
		} finally {
			let n = Math.max(0, (o.get(t) || 1) - 1);
			n ? o.set(t, n) : o.delete(t), t.running = n > 0, y(t).length || (t.pending = 0), await c(e, i);
		}
	}, ae = async (e, t, n, r, a, o) => {
		let s = Math.max(1, Math.min(8, Number(n.count || 1))), u = (await Promise.all(Array.from({ length: s }, () => l("/api/canvas-image-tasks", r, a)))).map((e) => ({
			taskId: String(e.task_id || e.id || ""),
			kind: "image",
			providerId: r.provider_id,
			model: r.model,
			startedAt: Date.now()
		})).filter((e) => e.taskId);
		t.pendingTasks = [...y(t), ...u], t.pending = y(t).length, t.running = !1, await c(e, o);
		let d = [];
		for (let n of [...y(t)]) {
			D(a);
			let r = b(t, n, await i.wait("image", String(n.taskId), { signal: a }));
			d.push(...r), await c(e, o);
		}
		return d;
	}, oe = async (e, n, r, i) => {
		let a = String(e.msgenModel || "zimage"), o = a === "qwen_edit" ? {
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
			model: String(e.msCustomModel || ""),
			needs: !1
		} : {
			accepts: !1,
			endpoint: "/generate",
			model: "Tongyi-MAI/Z-Image-Turbo",
			needs: !1
		}, s = r.filter((e) => e.kind === "image").slice(0, 3);
		if (o.needs && !s.length) throw Error("当前 ModelScope 模型需要图片输入");
		let c = m(e, "ms"), [u, d] = c.split("x").map(Number), f = [];
		if (o.accepts) for (let e of s) f.push(await re(t, e.url, i).catch(() => e.url));
		let p = a === "zimage" ? {
			prompt: n,
			resolution: c
		} : a === "qwen_edit" ? {
			prompt: n,
			image_urls: f,
			resolution: c
		} : {
			prompt: n,
			model: o.model,
			image_urls: f,
			width: u,
			height: d,
			size: c
		}, h = Math.max(1, Math.min(8, Number(e.count || 1)));
		return {
			request: p,
			outputs: (await Promise.all(Array.from({ length: h }, () => l(o.endpoint, p, i)))).flatMap((e) => T(e, "image"))
		};
	}, A = async (e, t, n, i) => {
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
				outputs: T(await l("/api/generate", n, i), "image")
			};
		}
		if (a === "enhance") {
			let t = ne(n, "image", "Comfy 增强"), r = {
				workflow_json: "Z-Image-Enhance.json",
				type: "enhance",
				params: {
					15: { image: await j(t, i) },
					204: { value: Number(e.enhanceStrength ?? .5) }
				}
			};
			return {
				request: r,
				outputs: T(await l("/api/generate", r, i), "image")
			};
		}
		if (a === "edit") {
			let e = n.filter((e) => e.kind === "image").slice(0, 3);
			if (!e.length) throw Error("Comfy 编辑需要图片输入");
			let r = await Promise.all(e.map((e) => j(e, i))), a = {
				prompt: t,
				workflow_json: "Flux2-Klein.json",
				type: "klein",
				params: {
					168: { text: t },
					158: { noise_seed: Math.floor(Math.random() * 1e6) },
					278: { image: r[0] || "" },
					270: { image: r[1] || "" },
					292: { image: r[2] || "" },
					313: { value: !!r[1] },
					314: { value: !!r[2] }
				}
			};
			return {
				request: a,
				outputs: T(await l("/api/generate", a, i), "image")
			};
		}
		let o = String(e.comfyWorkflow || "");
		if (!o) throw Error("请选择 ComfyUI 工作流");
		let s = await r(o), c = s.config && typeof s.config == "object" ? s.config : { fields: [] }, u = Array.isArray(c.fields) ? c.fields : [], d = {}, f = new Map([
			"image",
			"video",
			"audio"
		].map((e) => [e, n.filter((t) => t.kind === e)])), p = /* @__PURE__ */ new Map();
		for (let n of u) {
			let r = String(n.id || "");
			if (!r) continue;
			let a = te(n);
			if (a === "prompt") d[r] = t;
			else if (a === "image" || a === "video" || a === "audio") {
				let e = p.get(a) || 0, t = f.get(a)?.[e];
				p.set(a, e + 1), d[r] = t ? await j(t, i) : "";
			} else d[r] = e.comfyParams?.[r] ?? n.default;
		}
		let m = {
			config: c,
			fields: d
		};
		return {
			request: m,
			outputs: T(await l(`/api/workflows/${encodeURIComponent(o)}/run`, m, i), "image")
		};
	}, j = async (n, r) => {
		if (n.comfy_name) return String(n.comfy_name);
		let i = await t(n.url, { signal: r });
		if (!i.ok) return n.name || n.url;
		let a = new FormData();
		a.append("files", new File([await i.blob()], n.name || "smart-ref.png"));
		let o = await e(t, "/api/upload", {
			method: "POST",
			body: a
		}, { signal: r });
		return String(o.files?.[0]?.comfy_name || n.name || n.url);
	};
	return {
		canHandle: s,
		recoverDocument: E,
		runCommand: S,
		runNode: u
	};
}
function d(e) {
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
function f(e, t, n) {
	let r = String(e.provider_id || ""), i = String(e.model || "");
	if (!r || !i) throw Error("请选择 API 平台和模型");
	return {
		prompt: t,
		provider_id: r,
		model: i,
		size: m(e),
		quality: e.quality || "auto",
		n: 1,
		reference_images: n.filter((e) => e.kind === "image")
	};
}
function p(e, t, n, r) {
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
function m(e, t = "") {
	let n = String(e[t ? `${t}Ratio` : "ratio"] || "square"), r = String(e[t ? `${t}Resolution` : "resolution"] || "1k"), i = String(e[t ? `${t}CustomSize` : "customSize"] || "");
	return r === "custom" && /^\d{2,5}x\d{2,5}$/i.test(i) ? i : l[n]?.[r] || l.square[r] || l.square["1k"];
}
function h(e, t, n) {
	let r = new Map(e.nodes.map((e) => [e.id, e])), i = e.connections.filter((e) => e.to === t.id && String(e.kind || "flow") !== "history").map((e) => r.get(e.from)).filter(Boolean), a = [], o = [], s = (e, t = "image") => {
		if (!e) return;
		let n = typeof e == "string" ? { url: e } : e, r = String(n.url || n.sourceUrl || n.localUrl || "");
		if (!r) return;
		let i = E(n, t);
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
function g(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = [], i = /* @__PURE__ */ new Set(), a = (o) => {
		if (i.has(o)) return;
		i.add(o), e.connections.filter((e) => e.to === o && String(e.kind || "flow") !== "history").forEach((e) => a(e.from));
		let s = n.get(o);
		s && (s.type === "smart-image" && (o === t || s.runSettings) || s.type === "prompt" && s.llmEnabled) && r.push(o);
	};
	return a(t), r;
}
function _(e, t) {
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
function v(e, t) {
	let n = Array.isArray(e.variablePrompts) ? e.variablePrompts.map(String) : String(e.variablePrompt || "").split(/\r?\n/), r = Math.max(0, t - Math.max(1, Number(e.loopStart || 1)));
	return String(n[r % Math.max(1, n.length)] || "").replaceAll("《计数》", String(t)).replaceAll("《进度》", `${r + 1}/${Math.max(1, Number(e.count || 1))}`);
}
function ee(e, t, n) {
	let r = h(e, t).media.filter((e) => e.kind === "image"), i = Math.max(0, Number(t.loopStart || 1) - 1 + n - Math.max(1, Number(t.loopStart || 1)));
	return r.slice(i, i + Math.max(1, Number(t.imageBatchSize || 1)));
}
function y(e) {
	return Array.isArray(e.pendingTasks) ? e.pendingTasks.filter((e) => !!(e && typeof e == "object" && e.taskId)) : [];
}
function b(e, t, n) {
	if (n.status === "succeeded") {
		let r = T(n.result, String(t.kind || "image"));
		return e.pendingTasks = y(e).filter((e) => e.taskId !== t.taskId), e.pending = y(e).length, r;
	}
	return t.failed = !0, t.recoveryStatus = n.status, t.error = n.error || `任务状态：${n.status}`, n.upstream_task_id && (t.recoverTaskId = n.upstream_task_id), t.recoverTaskId || (e.pendingTasks = y(e).filter((e) => e.taskId !== t.taskId), e.pending = y(e).length), e.running = !1, e.runStatus = "failed", e.runError = String(t.error), [];
}
function x(e, t, n, r) {
	let i = (Array.isArray(t.images) ? t.images : []).filter(Boolean);
	i.length && !r && S(e, t, i), t.images = r ? [...i, ...n] : n, t.pendingTasks = void 0, t.pending = 0, t.running = !1, t.runStatus = "done", t.runError = "", t.runFinishedAt = Date.now(), t.runElapsedMs = Math.max(0, Number(t.runFinishedAt) - Number(t.runStartedAt || t.runFinishedAt)), t.outputKind = n[0]?.kind || "image";
	let a = Array.isArray(t.images) ? t.images.length : 0;
	t.title = a > 1 ? t.outputKind === "video" ? "Videos" : "Group" : t.outputKind === "video" ? "Video" : "Image", t.scale = a > 1 ? .8 : 2, t.w = void 0, t.h = void 0;
}
function S(e, t, n) {
	let r = e.nodes.find((e) => e.type === "smart-image" && e.historyFor === t.id);
	r || (r = {
		id: O("smart-history"),
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
function C(e, t, n, r) {
	t.running = !1, t.pending = y(t).length, t.runStatus = "failed", t.runError = n instanceof Error ? n.message : String(n), t._cascadeFailed = !0, w(e, t, r, [], String(t.runError || ""));
}
function w(e, t, n, r, i) {
	let a = Array.isArray(e.logs) ? e.logs : [];
	e.logs = [{
		id: O("log"),
		createdAt: Date.now(),
		status: i ? "failed" : "success",
		nodeId: t.id,
		nodeType: t.type,
		request: n,
		outputs: r,
		error: i
	}, ...a].slice(0, 500);
}
function T(e, t) {
	let n = [], r = (e) => {
		if (!e) return;
		if (typeof e == "string") {
			/^(https?:\/\/|\/|data:|blob:)/i.test(e) && n.push({
				kind: E({ url: e }, t),
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
			kind: E(i, t),
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
function E(e, t = "image") {
	let n = String(e.kind || e.type || t).toLowerCase(), r = String(e.url || "").toLowerCase();
	return n.includes("video") || /\.(mp4|webm|mov|m4v)(\?|$)/.test(r) ? "video" : n.includes("audio") || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(r) ? "audio" : n.includes("text") || /\.(txt|json|md)(\?|$)/.test(r) ? "text" : "image";
}
function te(e) {
	if (e.type === "image" || e.type === "video" || e.type === "audio") return e.type;
	let t = `${String(e.input || "")} ${String(e.name || "")}`.toLowerCase();
	return e.type === "textarea" || /prompt|text|提示词|正向|负向/.test(t) ? "prompt" : "setting";
}
function ne(e, t, n) {
	let r = e.find((e) => e.kind === t);
	if (!r) throw Error(`${n}需要${t === "image" ? "图片" : t}输入`);
	return r;
}
async function re(e, t, n) {
	let r = await e(t, { signal: n });
	if (!r.ok) throw Error("读取图片失败");
	let i = new Uint8Array(await (await r.blob()).arrayBuffer()), a = "";
	return i.forEach((e) => {
		a += String.fromCharCode(e);
	}), `data:${r.headers.get("content-type") || "application/octet-stream"};base64,${btoa(a)}`;
}
function D(e) {
	if (e.aborted) throw Error("执行已停止");
}
function O(e) {
	return `${e}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}
//#endregion
//#region src/canvas/application/modern-canvas-runtime.ts
var ie = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"llm",
	"video"
]), k = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"comfy",
	"ltxDirector",
	"video"
]);
function ae(t, n = fetch) {
	let r = {}, i = [], a = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), c = /* @__PURE__ */ new Map(), l = async () => {
		let [e, t] = await Promise.all([Ce(n, "/api/config", {}), Ce(n, "/api/workflows", { workflows: [] })]);
		r = e, i = Array.isArray(t.workflows) ? t.workflows : [];
	}, d = async (t) => {
		let r = String(t || "").trim();
		if (!r) return [];
		let i = a.get(r);
		return i || (i = await e(n, `/api/workflows/${encodeURIComponent(r)}`), a.set(r, i)), structuredClone(i.config?.fields ?? []);
	}, f = (e, t, n = {
		id: "",
		type: e
	}) => {
		if (e === "comfy" && t === "workflow") return i.map((e) => ({
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
		let a = p(e);
		if (t === "provider") return a.map((e) => ({
			value: String(e.id || ""),
			label: String(e.name || e.id || "")
		}));
		if (t === "model") {
			let t = a.find((t) => t.id === (e === "llm" ? n.llmProvider : n.apiProvider)) ?? a[0], i = e === "video" ? t?.video_models : e === "llm" ? t?.chat_models : t?.image_models, o = e === "video" ? r.video_models : e === "llm" ? r.chat_models : r.image_models;
			return [...new Set((i ?? o ?? []).map(String).filter(Boolean))].map((e) => ({
				value: e,
				label: e
			}));
		}
		if (e === "msgen" && t === "custom-model") {
			let e = (r.api_providers ?? []).find((e) => e.id === "modelscope");
			return [...new Set([...e?.image_models ?? [], String(n.msCustomModel || "")].filter(Boolean))].map((e) => ({
				value: e,
				label: e
			}));
		}
		if (e === "msgen" && t === "lora") {
			let e = (r.api_providers ?? []).find((e) => e.id === "modelscope"), t = String(n.msCustomModel || n.msgenModel || "");
			return (e?.ms_loras ?? []).filter((e) => !e.model && !e.model_id || [e.model, e.model_id].includes(t)).map((e) => ({
				value: String(e.id || ""),
				label: String(e.name || e.id || ""),
				meta: { strength: Number(e.strength ?? .8) }
			}));
		}
		return [];
	}, p = (e) => (r.api_providers ?? []).filter((t) => {
		let n = e === "video" ? t.video_models : e === "llm" ? t.chat_models : t.image_models;
		return t.enabled !== !1 && Array.isArray(n) && n.length > 0;
	}), m = async (t) => {
		let r = new FormData();
		return t.forEach((e) => r.append("files", e)), e(n, "/api/ai/upload", {
			method: "POST",
			body: r
		});
	}, h = (e) => {
		let t = structuredClone(e), n = Math.max(1, Number(t.frameRate || 24)), r = Math.max(1, Number(t.durationFrames || 120));
		return t.frameRate = n, t.durationFrames = r, t.durationSeconds = Math.round(r / n * 1e3) / 1e3, t.ltxTimelineData ||= JSON.stringify({
			segments: [{
				id: F("ltxseg"),
				start: 0,
				length: r,
				prompt: "",
				type: "text"
			}],
			audioSegments: []
		}), t;
	}, g = async (t, r, i, a = "") => {
		let o = structuredClone(r), s = o.nodes.find((e) => e.id === t && e.type === "video");
		if (!s) throw Error("Video node is missing from the active canvas");
		if (i === "manual") {
			let e = a.trim();
			if (e && !/^(https?:\/\/|asset:\/\/)/i.test(e)) throw Error("请输入 http/https 媒体网址或 asset:// 素材 URI");
			return s.manualVideoUrl = e, o;
		}
		let c = oe(o, s).media.filter((e) => e.kind === "video" || e.kind === "audio"), l = { ...s.uploadedMediaUrls ?? {} };
		for (let t of c) {
			if (/^(https?:\/\/|asset:\/\/)/i.test(t.url)) {
				l[t.url] = t.url;
				continue;
			}
			let r = await e(n, "/api/cloud-video/upload", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: t.url,
					service: "auto"
				})
			});
			if (!r.url) throw Error("云端没有返回媒体链接");
			l[t.url] = r.url;
		}
		return s.uploadedMediaUrls = l, o;
	}, _ = u({
		fetcher: n,
		getConfig: () => r,
		getWorkflow: async (t) => {
			let r = a.get(t);
			return r || (r = await e(n, `/api/workflows/${encodeURIComponent(t)}`), a.set(t, r)), r;
		},
		taskClient: t
	}), v = async (e, t, n = "node", r) => {
		if (t.kind === "smart" && _.canHandle(t.nodes.find((t) => t.id === e))) return _.runNode(e, t, n, r);
		let i = structuredClone(t), a = n === "cascade" ? o(i).cascadeOrder(e) : [e];
		if (!a.length) throw Error("没有可执行的节点");
		let c = new AbortController();
		s.get(e)?.abort(), s.set(e, c);
		try {
			for (let t of a) {
				if (c.signal.aborted) throw Error("执行已停止");
				await b(i, t, n === "chat" && t === e, c.signal, r);
			}
			return i;
		} finally {
			s.get(e) === c && s.delete(e);
		}
	}, ee = async (e, t, n, r) => {
		if (n.kind === "smart" && _.canHandle(n.nodes.find((e) => e.id === t))) return _.runCommand(e, t, n, r);
		if (e === "stop-execution") return s.get(t)?.abort(), structuredClone(n);
		let i = structuredClone(n), a = o(i).retryCascadeOrder(t), c = new AbortController();
		s.set(t, c);
		try {
			for (let e of a) await b(i, e, !1, c.signal, r);
			return i;
		} finally {
			s.get(t) === c && s.delete(t);
		}
	}, y = async (e, n) => {
		let r = await _.recoverDocument(e, n), i = [];
		for (let e of r.nodes.filter((e) => e.type === "output")) for (let a of Array.isArray(e._pending) ? e._pending : []) {
			let o = String(a.canvasTaskId || ""), s = a.canvasTaskType === "video" ? "video" : ["image", "online-image"].includes(String(a.canvasTaskType || "")) ? "image" : null;
			!o || !s || (a.recoveryStatus = "recovering", a.failed = !1, i.push(t.watch(s, o).then(async (t) => {
				let i = r.nodes.find((e) => e.id === String(a.nodeId || ""));
				if (t.status === "succeeded") {
					let n = M(t.result);
					i && (le(i, n), i.runStatus = "done", i.runError = ""), n.length && ce(e, n), e._pending = e._pending.filter((e) => e.id !== a.id), R(r, {
						id: F("log"),
						nodeId: i?.id || a.nodeId,
						nodeType: i?.type || a.type,
						recovered: !0,
						status: "done",
						outputs: n.map(N),
						...z(t, a)
					});
				} else a.recoveryStatus = t.status, a.recoveryError = t.error || `任务状态：${t.status}`, a.failed = !0, i && (i.runStatus = "failed", i.runError = String(a.recoveryError));
				await L(r, n);
			}).catch(async (e) => {
				a.recoveryStatus = "interrupted", a.recoveryError = e instanceof Error ? e.message : String(e), a.failed = !0, await L(r, n);
			})));
		}
		return i.length && (await L(r, n), await Promise.all(i)), r;
	}, b = async (e, t, n, r, i) => {
		let a = e.nodes.find((e) => e.id === t);
		if (!a || !ie.has(a.type)) throw Error(`不支持执行节点：${a?.type || t}`);
		a.running = !0, a.runStatus = "running", a.runError = "", await L(e, i);
		let o = oe(e, a), s = null, l = null, u = [], d = !1, f = Date.now(), p = `${String(e.id || "")}:${t}`;
		c.delete(p);
		try {
			a.type !== "llm" && (l = se(e, a), l && (s = {
				id: F("pending"),
				startedAt: Date.now(),
				nodeId: t,
				type: a.type
			}, l._pending = [...Array.isArray(l._pending) ? l._pending : [], s], await L(e, i))), u = await x(e, a, o, n, r, s, i), u.length && (le(a, u), l && ce(l, u, o.media[0])), a.runStatus = "done", a.runError = "", d = !0, R(e, {
				id: F("log"),
				nodeId: t,
				nodeType: a.type,
				status: "done",
				startedAt: f,
				finishedAt: Date.now(),
				outputs: u.map(N),
				...c.get(p)
			});
		} catch (n) {
			throw a.runStatus = "failed", a.runError = n instanceof Error ? n.message : String(n), s?.canvasTaskId && (s.failed = !0, s.recoveryStatus ||= "interrupted", s.recoveryError ||= a.runError), R(e, {
				id: F("log"),
				nodeId: t,
				nodeType: a.type,
				status: "failed",
				startedAt: f,
				finishedAt: Date.now(),
				error: a.runError,
				...c.get(p)
			}), n;
		} finally {
			a.running = !1, l && s && (d || !s.canvasTaskId) && (l._pending = (Array.isArray(l._pending) ? l._pending : []).filter((e) => e.id !== s?.id)), c.delete(p), await L(e, i);
		}
	}, x = async (e, t, n, i, a, o, s) => {
		let c = n.prompts.join("\n\n").trim() || String(t.userInput || t.globalPrompt || "");
		if (t.type === "llm") {
			let e = i ? String(t.chatInput || c) : c;
			if (!e) throw Error("LLM 缺少提示词输入");
			let r = Array.isArray(t.messages) ? t.messages : [], o = await T("/api/canvas-llm", {
				message: e,
				model: t.model || t.llmMsModel || "",
				ms_model: t.llmProvider === "modelscope" && (t.model || t.llmMsModel) || "",
				provider: t.llmProvider || "",
				system_prompt: t.systemPrompt || "You are a helpful assistant.",
				messages: r,
				images: n.media.filter((e) => e.kind === "image"),
				videos: n.media.filter((e) => e.kind === "video")
			}, a);
			return t.outputText = o.text || "", i && (t.messages = [
				...r,
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
		if (!c && t.type !== "comfy" && !(t.type === "generator" && n.media.some((e) => e.kind === "image"))) throw Error("缺少提示词输入");
		if (t.type === "video") {
			let r = {
				prompt: c,
				provider_id: t.apiProvider || "",
				model: t.model || "veo3-fast",
				duration: Number(t.duration || 5),
				aspect_ratio: t.aspectRatio || "16:9",
				resolution: t.resolution || "",
				images: n.media.filter((e) => e.kind === "image"),
				videos: [String(t.manualVideoUrl || ""), ...n.media.filter((e) => e.kind === "video").map((e) => Se(t, e.url))].filter(Boolean),
				audios: n.media.filter((e) => e.kind === "audio").map((e) => Se(t, e.url)),
				enhance_prompt: !!t.enhancePrompt,
				enable_upsample: !!t.enableUpsample,
				watermark: !!t.watermark,
				camerafixed: !!t.cameraFixed,
				generate_audio: !!t.generateAudio,
				multimodal: !!t.multimodal,
				task_mode: t.taskMode || "auto"
			};
			return w("video", e, t, r, a, o, s);
		}
		if (t.type === "generator") {
			let i = he(t, r.api_providers ?? []), l = n.media.filter((e) => e.kind === "image"), u = c || "Edit the reference images.", d = await pe(t, l);
			ge(i.providerId, i.model, d, l.length), Object.assign(t, {
				apiProvider: i.providerId,
				model: i.model
			});
			let f = {
				prompt: u,
				provider_id: i.providerId,
				model: i.model,
				size: d,
				reference_images: l,
				quality: _e(t.quality),
				n: Math.max(1, Math.min(8, Number(t.count || 1)))
			};
			return w("image", e, t, f, a, o, s);
		}
		if (t.type === "msgen") {
			let e = String(t.msgenModel || "zimage"), r = fe(t.msRatio, t.msResolution, t.msCustomSize, t.msWidth, t.msHeight), i = e === "qwen_edit" ? "/api/angle/generate" : "/generate", o = {
				prompt: c,
				resolution: r,
				client_id: I()
			};
			e !== "zimage" && (o.image_urls = n.media.filter((e) => e.kind === "image").map((e) => e.url)), e === "custom" && (o.model = t.msCustomModel || ""), t.msLoraEnabled && t.msLoraId && (o.loras = { [String(t.msLoraId)]: Number(t.msLoraStrength ?? .8) });
			let s = Math.max(1, Math.min(8, Number(t.count || 1)));
			return (await Promise.all(Array.from({ length: s }, () => T(i, o, a)))).flatMap(M);
		}
		if (t.type === "ltxDirector") {
			let e = h(t);
			Object.assign(t, e);
			let n = ue(t, c), r = JSON.parse(String(n.timeline_data || "{}"));
			for (let e of r.segments ?? []) e.type !== "image" || e.imageFile || !e.imageB64 || (e.imageFile = await E({
				kind: "image",
				name: `ltx-${String(e.id || "segment")}.png`,
				url: String(e.imageB64)
			}, a), delete e.imgObj);
			n.timeline_data = JSON.stringify(r), t.ltxTimelineData = n.timeline_data, t.ltxLocalPrompts = n.local_prompts, t.ltxSegmentLengths = n.segment_lengths, t.ltxGuideStrength = n.guide_strength;
			let i = {
				46: n,
				"94:28": { noise_seed: Number(t.noiseSeed ?? 12) }
			};
			return M(await T("/api/generate", {
				prompt: c,
				workflow_json: "LTXDirectorv2-API.json",
				params: i,
				type: "ltx-director",
				client_id: I()
			}, a));
		}
		return S(t, n, c, a);
	}, S = async (e, t, n, r) => {
		let a = String(e.mode || "text"), o;
		if (a === "text") o = {
			prompt: n,
			width: Number(e.width || 1024),
			height: Number(e.height || 1024),
			workflow_json: "Z-Image.json",
			type: "zimage",
			client_id: I()
		};
		else if (a === "enhance") {
			let n = A(t, "image", 1, "Comfy 增强")[0], i = j(await T("/api/generate", {
				workflow_json: "Z-Image-Enhance.json",
				params: {
					15: { image: await E(n, r) },
					204: { value: Number(e.enhanceStrength ?? .5) }
				},
				type: "enhance",
				client_id: I()
			}, r), "Comfy 增强");
			return e.enhanceUpscale ? C(i[0], Number(e.enhanceUpscaleRes || 2048), r) : i;
		} else if (a === "custom") {
			let a = String(e.comfyWorkflow || i[0]?.name || ""), s = await d(a), c = {}, l = new Map([
				"image",
				"video",
				"audio"
			].map((e) => [e, t.media.filter((t) => t.kind === e)])), u = /* @__PURE__ */ new Map();
			for (let e of [
				"image",
				"video",
				"audio"
			]) {
				let n = s.filter((t) => de(t) === e).length;
				n && A(t, e, n, `Comfy 工作流 ${a || "未命名"}`);
			}
			for (let t of s) {
				let i = String(t.node || ""), a = String(t.input || "");
				if (!i || !a) continue;
				c[i] ??= {};
				let o = de(t);
				if (o === "prompt") c[i][a] = n;
				else if ([
					"image",
					"video",
					"audio"
				].includes(o)) {
					let e = u.get(o) ?? 0, t = l.get(o)?.[e];
					u.set(o, e + 1), c[i][a] = t ? await E(t, r) : "";
				} else {
					let n = String(t.id || ""), r = (e.comfyParams ?? {})[n] ?? t.default, o = (e.comfyRandomActive ?? {})[n] !== !1;
					c[i][a] = t.random_enabled && o ? be(t) : r;
				}
			}
			o = {
				prompt: n,
				workflow_json: a,
				params: c,
				type: "workflow-custom",
				client_id: I()
			};
		} else {
			let i = A(t, "image", 1, "Comfy 编辑").slice(0, 3), a = [];
			for (let e of i) a.push(await E(e, r));
			let o = j(await T("/api/generate", {
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
				client_id: I()
			}, r), "Comfy 编辑");
			return e.editUpscale ? C(o[0], Number(e.editUpscaleRes || 2048), r) : o;
		}
		return M(await T("/api/generate", o, r));
	}, C = async (e, t, n) => {
		let r = N(e);
		if (!r) throw Error("Comfy 超分辨率缺少输入图片");
		let i = await E({
			kind: "image",
			name: "canvas-upscale.png",
			url: r
		}, n);
		return j(await T("/api/generate", {
			workflow_json: "upscale.json",
			params: {
				15: { image: i },
				172: {
					seed: Math.floor(Math.random() * 4294967295),
					resolution: Math.max(64, t || 2048)
				}
			},
			type: "enhance",
			client_id: I()
		}, n), "Comfy 超分辨率");
	}, w = async (e, n, r, i, a, o, s) => {
		let l = `${n.id}:${r.id}:${F("submit")}`, u = await t.submit(e, i, {
			idempotencyKey: l,
			signal: a
		}), d = String(u.task_id || u.id || ""), f = `${String(n.id || "")}:${r.id}`;
		c.set(f, z(u, {
			canvasTaskId: d,
			idempotencyKey: l
		})), o && Object.assign(o, {
			canvasTaskId: d,
			canvasTaskType: e,
			idempotencyKey: l
		}), await L(n, s);
		let p = await t.wait(e, d, { signal: a });
		if (c.set(f, z(p, {
			canvasTaskId: d,
			idempotencyKey: l
		})), p.status !== "succeeded") throw o && Object.assign(o, {
			failed: !0,
			recoveryStatus: p.status,
			recoveryError: p.error || `${e} task failed`
		}), Error(p.error || `${e} task failed`);
		return M(p.result);
	}, T = (t, r, i) => e(n, t, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(r)
	}, { signal: i }), E = async (t, r) => {
		let i = await n(/^https?:\/\//i.test(t.url) ? `/api/download-output?inline=1&url=${encodeURIComponent(t.url)}&name=${encodeURIComponent(t.name || "media")}` : t.url, { signal: r });
		if (!i.ok) throw Error(`读取 ComfyUI 输入媒体失败：${t.name || t.url}`);
		let a = await i.blob(), o = new FormData();
		o.append("files", new File([a], t.name || `canvas-${t.kind}`, { type: a.type }));
		let s = await e(n, "/api/upload", {
			method: "POST",
			body: o
		}, { signal: r }), c = String(s.files?.[0]?.comfy_name || "");
		if (!c) throw Error("ComfyUI 没有返回媒体文件名");
		return c;
	};
	return {
		getComfyFields: d,
		getNodeOptions: f,
		initialize: l,
		normalizeLtxNode: h,
		prepareVideoMedia: g,
		recoverDocument: y,
		runCommand: ee,
		runNode: v,
		uploadMedia: m
	};
}
function oe(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = e.connections.filter((e) => e.to === t.id).map((e) => n.get(e.from)).filter(Boolean), i = [], a = [], o = (e) => {
		e.type === "prompt" && e.text && i.push(String(e.text)), e.type === "llm" && e.outputText && i.push(String(e.outputText)), (e.type === "promptGroup" || e.type === "group") && (Array.isArray(e.items) ? e.items : []).map(String).map((e) => n.get(e)).filter(Boolean).forEach((e) => o(e)), e.type === "image" && e.url && a.push(ve(e.url, e.mediaKind, e.name)), e.type === "output" && (Array.isArray(e.images) ? e.images : []).slice(-1).forEach((e) => a.push(ve(N(e), P(e), "output"))), k.has(e.type) && (Array.isArray(e.generatedOutputs) ? e.generatedOutputs : []).forEach((t) => a.push(ve(N(t), P(t), e.type)));
	};
	return r.forEach(o), {
		prompts: i.filter(Boolean),
		media: xe(a)
	};
}
function A(e, t, n, r) {
	let i = e.media.filter((e) => e.kind === t);
	if (i.length < n) throw Error(`${r}需要连接 ${n} 个${{
		audio: "音频",
		image: "图片",
		video: "视频"
	}[t]}输入，当前只有 ${i.length} 个`);
	return i;
}
function j(e, t) {
	let n = M(e);
	if (!n.length) throw Error(`${t}未返回任何媒体`);
	return n;
}
function se(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = e.connections.filter((e) => e.from === t.id).map((e) => n.get(e.to)).find((e) => e?.type === "output");
	return r || (e.connections.filter((e) => e.from === t.id).map((e) => n.get(e.to)).some((e) => e && k.has(e.type)) ? null : (r || (r = {
		id: F("out"),
		type: "output",
		x: Number(t.x || 0) + 460,
		y: Number(t.y || 0),
		images: []
	}, e.nodes.push(r), e.connections.push({
		id: F("edge"),
		from: t.id,
		to: r.id
	})), r));
}
function ce(e, t, n) {
	let r = new Set((Array.isArray(e.images) ? e.images : []).map(N)), i = t.map((e) => ({
		url: N(e),
		kind: P(e),
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
function le(e, t) {
	e.generatedOutputs = t.map((e) => P(e) === "image" ? N(e) : {
		url: N(e),
		kind: P(e)
	}).filter((e) => typeof e == "string" ? e : e.url);
}
function M(e) {
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
		let t = N(e);
		return !!(t && !r.has(t) && r.add(t));
	});
}
function ue(e, t) {
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
function de(e) {
	let t = String(e.type || e.kind || e.input_type || "").toLowerCase();
	return t.includes("image") ? "image" : t.includes("video") ? "video" : t.includes("audio") ? "audio" : t.includes("prompt") || t.includes("text") ? "prompt" : "setting";
}
function fe(e, t, n, r, i, a = "") {
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
	if ((c === "custom" || c === "source") && me(a)) {
		let e = me(a), t = {
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
async function pe(e, t) {
	let n = e.customRatio;
	if (String(e.ratio || "") === "source" && !me(n)) {
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
	return fe(e.ratio, e.resolution, e.customSize, e.width, e.height, n);
}
function me(e) {
	let t = String(e || "").trim().match(/^(\d+(?:\.\d+)?)\s*[:x*]\s*(\d+(?:\.\d+)?)$/i);
	if (!t) return null;
	let n = Number(t[1]), r = Number(t[2]);
	return n > 0 && r > 0 ? n / r : null;
}
function he(e, t) {
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
function ge(e, t, n, r) {
	let i = t.toLowerCase(), a = e === "modelscope" ? 4 : /seedream|doubao/.test(i) || e === "volcengine" ? 10 : 16;
	if (r > a) throw Error(`${t} 最多支持 ${a} 张参考图，当前连接了 ${r} 张`);
	let o = String(n || "").match(/^(\d+)x(\d+)$/i);
	if (!o) throw Error("图片尺寸无效，请选择预设尺寸或填写完整的自定义宽高");
	let s = Number(o[1]), c = Number(o[2]);
	if (s < 64 || c < 64 || s % 16 || c % 16) throw Error("图片宽高必须不小于 64，且为 16 的倍数");
	if (/gpt[^a-z0-9]*image[^a-z0-9]*2/i.test(t) && (Math.max(s, c) > 3840 || s * c > 8294400)) throw Error(`GPT-Image-2 不支持尺寸 ${n}：最长边不能超过 3840，且总像素不能超过 8294400`);
}
function _e(e) {
	let t = String(e || "").trim().toLowerCase();
	return t === "low" || t === "medium" || t === "high" ? t : void 0;
}
function ve(e, t, n) {
	return {
		url: String(e || ""),
		kind: ye(String(t || ""), String(e || "")),
		name: String(n || "media")
	};
}
function N(e) {
	return typeof e == "string" ? e : e && typeof e == "object" ? String(e.url || "") : "";
}
function P(e) {
	return ye(e && typeof e == "object" ? String(e.kind || "") : "", N(e));
}
function ye(e, t) {
	return e === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(t) ? "video" : e === "audio" || /\.(mp3|wav|m4a|ogg)(\?|$)/i.test(t) ? "audio" : "image";
}
function be(e) {
	let t = Number.isFinite(Number(e.min)) ? Number(e.min) : 0, n = Number.isFinite(Number(e.max)) ? Number(e.max) : Math.max(t + 1, 1e6), r = Math.max(Number(e.step) || 1, 2 ** -52), i = Math.max(0, Math.floor((n - t) / r)), a = t + Math.floor(Math.random() * (i + 1)) * r;
	return Number(a.toFixed(Math.min(12, Math.max(0, String(r).split(".")[1]?.length || 0))));
}
function xe(e) {
	let t = /* @__PURE__ */ new Set();
	return e.filter((e) => !!(e.url && !t.has(e.url) && t.add(e.url)));
}
function Se(e, t) {
	return String((e.uploadedMediaUrls ?? {})[t] || t);
}
function F(e) {
	return `${e}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}
function I() {
	try {
		return typeof sessionStorage > "u" ? "canvas-modern" : sessionStorage.getItem("canvasClientId") || "canvas-modern";
	} catch {
		return "canvas-modern";
	}
}
async function L(e, t) {
	t && await t(structuredClone(e));
}
async function Ce(t, n, r) {
	try {
		return await e(t, n);
	} catch {
		return r;
	}
}
function R(e, t) {
	e.logs = [...Array.isArray(e.logs) ? e.logs : [], t].slice(-500);
}
function z(e, t = {}) {
	let n = e.result && typeof e.result == "object" ? e.result : {}, r = e.cost ?? n.cost;
	return {
		canvasTaskId: String(e.task_id || e.id || t.canvasTaskId || ""),
		upstreamTaskId: String(e.upstream_task_id || n.upstream_task_id || t.upstreamTaskId || ""),
		idempotencyKey: String(e.idempotency_key || t.idempotencyKey || ""),
		...r === void 0 ? {} : { cost: structuredClone(r) }
	};
}
//#endregion
//#region src/canvas/domain/execution.ts
function we() {
	return {
		completedNodeIds: [],
		completedRounds: 0,
		currentNodeId: "",
		error: "",
		mode: "serial",
		order: [],
		rounds: {},
		status: "idle",
		targetId: ""
	};
}
function B(e, t) {
	if (t.type === "queue") {
		if ([
			"idle",
			"done",
			"failed",
			"stopped"
		].includes(e.status) || V(e, t), !t.targetId || !t.order.length) throw Error("Execution queue requires a target and order");
		return {
			completedNodeIds: [],
			completedRounds: 0,
			currentNodeId: "",
			error: "",
			mode: t.mode,
			order: [...t.order],
			rounds: {},
			status: "queued",
			targetId: t.targetId
		};
	}
	if (t.type === "start") return e.status !== "queued" && V(e, t), {
		...e,
		status: "running"
	};
	if (t.type === "request-stop") return e.status === "stopping" ? e : (e.status !== "running" && V(e, t), {
		...e,
		status: "stopping"
	});
	if (t.type === "node-start") {
		if (e.mode === "parallel") return Te(e, t);
		(e.status !== "running" || e.currentNodeId) && V(e, t);
		let n = e.completedNodeIds.length === e.order.length ? [] : e.completedNodeIds, r = e.order[n.length];
		if (t.nodeId !== r) throw Error(`Expected execution node ${r || "<none>"}`);
		return {
			...e,
			completedNodeIds: n,
			currentNodeId: t.nodeId
		};
	}
	if (t.type === "node-done") {
		if (e.mode === "parallel") return Te(e, t);
		(!["running", "stopping"].includes(e.status) || e.currentNodeId !== t.nodeId) && V(e, t);
		let n = [...e.completedNodeIds, t.nodeId];
		return {
			...e,
			completedNodeIds: n,
			completedRounds: e.completedRounds + +(n.length === e.order.length),
			currentNodeId: ""
		};
	}
	return e.status !== "running" && e.status !== "stopping" && V(e, t), e.status === "stopping" && t.status === "done" && V(e, t), {
		...e,
		error: t.error || "",
		status: t.status
	};
}
function Te(e, t) {
	t.roundId || V(e, t);
	let n = e.rounds[t.roundId] ?? {
		completedNodeIds: [],
		currentNodeId: ""
	};
	if (t.type === "node-start") {
		e.status !== "running" && V(e, t), n.currentNodeId && V(e, t);
		let r = e.order[n.completedNodeIds.length];
		if (t.nodeId !== r) throw Error(`Expected execution node ${r || "<none>"}`);
		return {
			...e,
			rounds: {
				...e.rounds,
				[t.roundId]: {
					...n,
					currentNodeId: t.nodeId
				}
			}
		};
	}
	["running", "stopping"].includes(e.status) || V(e, t), n.currentNodeId !== t.nodeId && V(e, t);
	let r = [...n.completedNodeIds, t.nodeId];
	return {
		...e,
		completedRounds: e.completedRounds + +(r.length === e.order.length),
		rounds: {
			...e.rounds,
			[t.roundId]: {
				completedNodeIds: r,
				currentNodeId: ""
			}
		}
	};
}
async function Ee(e, t, n, r = {}) {
	let { mode: i = "serial", onTransition: a, signal: o } = r, s = H(we(), {
		type: "queue",
		targetId: e,
		order: [...t],
		mode: i
	}, a);
	s = H(s, { type: "start" }, a);
	let c = () => (s.status === "running" && (s = H(s, { type: "request-stop" }, a)), H(s, {
		type: "finish",
		status: "stopped"
	}, a));
	for (let e of t) {
		if (o?.aborted) return c();
		s = H(s, {
			type: "node-start",
			nodeId: e
		}, a);
		try {
			await n(e, o);
		} catch (e) {
			return o?.aborted ? c() : H(s, {
				type: "finish",
				status: "failed",
				error: e instanceof Error ? e.message : String(e)
			}, a);
		}
		if (o?.aborted) return s = H(s, { type: "request-stop" }, a), s = H(s, {
			type: "node-done",
			nodeId: e
		}, a), c();
		s = H(s, {
			type: "node-done",
			nodeId: e
		}, a);
	}
	return H(s, {
		type: "finish",
		status: "done"
	}, a);
}
async function De(e, t, n, r, i = {}) {
	let { onTransition: a, signal: o } = i, s = n.map((e, t) => ({
		id: i.roundId?.(e, t) || String(t + 1),
		round: e
	}));
	if (new Set(s.map(({ id: e }) => e)).size !== s.length) throw Error("Parallel execution round IDs must be unique");
	let c = H(we(), {
		type: "queue",
		targetId: e,
		order: [...t],
		mode: "parallel"
	}, a);
	c = H(c, { type: "start" }, a);
	let l = null, u = 0, d = () => {
		c.status === "running" && (c = H(c, { type: "request-stop" }, a));
	}, f = Math.max(1, Math.min(Math.floor(i.limit || 1), s.length || 1)), p = Array.from({ length: f }, async () => {
		for (; !l && !o?.aborted && u < s.length;) {
			let { id: e, round: n } = s[u++];
			for (let i of t) {
				if (l || o?.aborted) break;
				c = H(c, {
					type: "node-start",
					nodeId: i,
					roundId: e
				}, a);
				try {
					await r(i, n, o);
				} catch (e) {
					o?.aborted ? d() : l ||= e;
					break;
				}
				o?.aborted && d(), c = H(c, {
					type: "node-done",
					nodeId: i,
					roundId: e
				}, a);
			}
		}
	});
	return await Promise.all(p), o?.aborted ? (d(), H(c, {
		type: "finish",
		status: "stopped"
	}, a)) : l ? H(c, {
		type: "finish",
		status: "failed",
		error: l instanceof Error ? l.message : String(l)
	}, a) : H(c, {
		type: "finish",
		status: "done"
	}, a);
}
function V(e, t) {
	throw Error(`Invalid execution transition: ${e.status} -> ${t.type}`);
}
function H(e, t, n) {
	let r = B(e, t);
	return n?.(r, t), r;
}
//#endregion
//#region src/canvas/infrastructure/task-client.ts
var Oe = {
	image: "/api/canvas-image-tasks",
	video: "/api/canvas-video-tasks"
};
function ke(n = fetch) {
	let r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), a = {
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
	}, o = (r, o, s = {}) => {
		let c = String(s.idempotencyKey || "").trim(), l = c ? `${r}:${c}` : "", u = l ? i.get(l) : void 0;
		if (u) return a.deduplicatedSubmissions += 1, u;
		let d = o && typeof o == "object" && !Array.isArray(o) ? {
			...o,
			...c ? { idempotency_key: c } : {}
		} : o ?? {}, f = (async () => {
			let i = Math.max(0, Math.min(2, Number(s.retryCount ?? +!!c))), o = 0;
			for (;;) try {
				a.submissions += 1;
				let t = await e(n, Oe[r], {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(d)
				}, s);
				return Ae(t), t;
			} catch (e) {
				if (!(e instanceof t) || !e.retryable || o++ >= i) throw e;
				a.submissionRetries += 1;
			}
		})().finally(() => {
			l && i.delete(l);
		});
		return l && i.set(l, f), f;
	}, s = (t, r, i) => r ? e(n, `${Oe[t]}/${encodeURIComponent(r)}`, {}, i) : Promise.reject(/* @__PURE__ */ TypeError("Task ID is required")), c = async (e, n, r = {}) => {
		let { intervalMs: i = e === "video" ? 2500 : 1800, maxPollErrors: o = 3, requestTimeoutMs: c = 3e4 } = r, l = Date.now(), u = 0;
		for (;;) {
			je(r.signal, l, r.timeoutMs);
			try {
				a.polls += 1;
				let t = await s(e, n, {
					signal: r.signal,
					timeoutMs: c
				});
				if (u = 0, t.status === "succeeded" || t.status === "failed" || t.status === "cancelled") return t;
			} catch (e) {
				if (a.pollErrors += 1, !(e instanceof t) || !e.retryable || u++ >= o) throw e;
			}
			await Me(i, r.signal, l, r.timeoutMs);
		}
	}, l = (e, t, n = {}) => {
		let i = `${e}:${t}`, o = r.get(i);
		if (o) return a.deduplicatedWatches += 1, o.promise;
		let s = new AbortController(), l = () => s.abort(n.signal?.reason);
		n.signal?.aborted ? l() : n.signal?.addEventListener("abort", l, { once: !0 });
		let u = c(e, t, {
			...n,
			signal: s.signal
		}).finally(() => {
			n.signal?.removeEventListener("abort", l), r.delete(i);
		});
		return r.set(i, {
			controller: s,
			promise: u
		}), u;
	};
	return {
		cancel: (e, t) => {
			let n = r.get(`${e}:${t}`);
			return n ? (n.controller.abort(), a.cancelledWatches += 1, !0) : !1;
		},
		get: s,
		getDiagnostics: () => ({
			activeSubmissions: i.size,
			activeWatches: r.size,
			...a
		}),
		resume: async (e, t) => {
			a.resumeRequests += 1, a.resumedTasks += e.length;
			let n = await Promise.allSettled(e.map(({ kind: e, id: n }) => l(e, n, t)));
			return a.recoveredTasks += n.filter((e) => e.status === "fulfilled" && e.value.recovered_after_restart).length, n;
		},
		submit: o,
		wait: c,
		waitForResult: async (e, n, r) => {
			let i = await c(e, n, r);
			if (i.status !== "succeeded") throw new t(i.error || "Task failed", "task-failed", 0, i);
			return i.result;
		},
		watch: l
	};
}
function Ae(e) {
	let n = String(e.task_id || e.id || "");
	if (!n) throw new t("Task response did not include an ID", "validation", 200, e);
	return n;
}
function je(e, n, r = 0) {
	if (e?.aborted) throw new t("Task polling aborted", "aborted");
	if (r > 0 && Date.now() - n >= r) throw new t("Task polling timed out", "timeout");
}
function Me(e, n, r, i = 0) {
	je(n, r, i);
	let a = i > 0 ? Math.max(0, i - (Date.now() - r)) : e, o = Math.min(Math.max(0, e), a || e);
	return new Promise((e, r) => {
		let i = () => n?.removeEventListener("abort", s), a = setTimeout(() => {
			i(), e();
		}, o), s = () => {
			clearTimeout(a), i(), r(new t("Task polling aborted", "aborted"));
		};
		n?.addEventListener("abort", s, { once: !0 });
	});
}
//#endregion
//#region src/main.ts
var U = new URLSearchParams(window.location.search), Ne = "__CanvasBootstrapRolloutPolicy" in window ? window.__CanvasBootstrapRolloutPolicy ?? null : await i(), W = r(window.location.search, window.localStorage, window.sessionStorage.getItem("canvasClientId") || window.location.pathname, Ne);
n("rollout-decision", { dimensions: {
	mode: W.enabled ? "enabled" : "disabled",
	reason: W.blockedReasons[0] || (W.policyLoaded ? "none" : "policy-unavailable"),
	source: W.source
} });
var Pe = U.get("canvas_modern_core"), Fe = Pe === "execution-shadow", Ie = Pe === "graph-order", Le = Pe === "shadow", Re = U.get("canvas_m2") === "1" || U.get("canvas_m2") === null && W.enabled, G = Re || U.get("canvas_execution_engine") === "1", K = Re || U.get("canvas_task_client") === "1", q = Re || U.get("canvas_repository") === "1", J = G && K && q, Y = U.get("canvas_react_islands") === "1", ze = Y || U.get("canvas_react_activity") === "1", Be = Y || U.get("canvas_react_execution") === "1", Ve = Y || U.get("canvas_react_status") === "1", He = Y || U.get("canvas_react_toolbar") === "1", Ue = U.get("canvas_board_v2") === "1" || U.get("canvas_board_v2") === null && W.enabled, X = ke(), We = ae(X);
await We.initialize();
var Z = s(), Ge = /* @__PURE__ */ new Map(), Ke = 0, Q = 0, qe = [], Je = 0, Ye = 0, Xe = /* @__PURE__ */ new Map(), $ = {
	done: 0,
	failed: 0,
	stopped: 0
}, Ze = 0;
function Qe(e, t, n) {
	let r = window.CanvasLegacyBridge, i = r?.getDocumentSnapshot();
	if (!r || !i) return null;
	let s = o(a(i)), c = e === "cascade" ? s.cascadeOrder(t) : s.retryCascadeOrder(t), l = n ?? (e === "cascade" ? r.computeCascadeOrder(t) : r.computeRetryCascadeOrder(t));
	return {
		kind: e,
		legacy: [...l],
		modern: c,
		targetId: t,
		matches: l.length === c.length && l.every((e, t) => e === c[t])
	};
}
if (window.CanvasModernCore = Object.freeze({
	version: 30,
	canvasRepository: Z,
	canvasRepositoryEnabled: q,
	canvasRuntime: We,
	executionEngineEnabled: G,
	m2Enabled: J,
	taskClient: X,
	taskClientEnabled: K,
	activeOrder(e, t) {
		if (!Ie) return null;
		try {
			let n = window.CanvasLegacyBridge?.getDocumentSnapshot();
			if (!n) return null;
			let r = o(a(n));
			return e === "cascade" ? r.cascadeOrder(t) : r.retryCascadeOrder(t);
		} catch (e) {
			return console.warn("[canvas-modern-core] active graph order failed; using legacy order", e), null;
		}
	},
	compareOrder: Qe,
	recordRolloutEvent(e, t) {
		n(e, {
			...t,
			dimensions: {
				...t?.dimensions,
				mode: J ? "enabled" : "disabled",
				source: W.source
			}
		});
	},
	runOrdered(e) {
		return G ? Ee(e.targetId, e.order, e.execute, {
			mode: e.mode,
			signal: e.signal,
			onTransition: $e
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	runParallel(e) {
		return G ? De(e.targetId, e.order, e.rounds, e.execute, {
			limit: e.limit,
			roundId: e.roundId,
			signal: e.signal,
			onTransition: $e
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	observeExecution(e) {
		if (Fe) try {
			let t = Ge.get(e.targetId) ?? we();
			e.phase === "begin" ? (t = B(t, {
				type: "queue",
				targetId: e.targetId,
				order: e.order,
				mode: e.mode
			}), t = B(t, { type: "start" })) : t = e.phase === "node-start" ? B(t, {
				type: "node-start",
				nodeId: e.nodeId,
				roundId: e.roundId
			}) : e.phase === "node-done" ? B(t, {
				type: "node-done",
				nodeId: e.nodeId,
				roundId: e.roundId
			}) : e.phase === "stop" ? B(t, { type: "request-stop" }) : B(t, {
				type: "finish",
				status: e.status,
				error: e.error
			}), Ge.set(e.targetId, t), Ke += 1;
		} catch (t) {
			Q += 1, console.warn("[canvas-modern-core] execution shadow transition failed", t, e);
		}
	},
	observeOrder(e, t, n) {
		if (Le) try {
			let r = Qe(e, t, n);
			if (!r) return;
			Je += 1, r.matches || (qe.length < 50 && qe.push(r), console.warn("[canvas-modern-core] graph order mismatch", r));
		} catch (e) {
			Ye += 1, console.warn("[canvas-modern-core] graph shadow check failed", e);
		}
	},
	getShadowReport() {
		return {
			enabled: Le,
			checks: Je,
			errors: Ye,
			mismatches: qe.map((e) => ({
				...e,
				legacy: [...e.legacy],
				modern: [...e.modern]
			}))
		};
	},
	getExecutionShadowReport() {
		return {
			enabled: Fe,
			errors: Q,
			events: Ke,
			runs: [...Ge.values()].map((e) => ({
				...e,
				completedNodeIds: [...e.completedNodeIds],
				order: [...e.order],
				rounds: Object.fromEntries(Object.entries(e.rounds).map(([e, t]) => [e, {
					...t,
					completedNodeIds: [...t.completedNodeIds]
				}]))
			}))
		};
	},
	getM2Report() {
		return {
			enabled: J,
			rollout: W,
			execution: {
				active: [...Xe.values()].filter(({ status: e }) => ![
					"done",
					"failed",
					"stopped"
				].includes(e)).length,
				...$,
				transitions: Ze
			},
			flags: {
				executionEngine: G,
				repository: q,
				taskClient: K
			},
			repository: Z.getDiagnostics(),
			tasks: X.getDiagnostics()
		};
	},
	mergeConflict(e, t, n) {
		return c(e, t, n);
	}
}), Be) {
	let e = document.getElementById("canvasExecutionIsland");
	e && import("./react-execution-entry-B_uT0TJ2.js").then(({ mountReactExecutionIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React execution island failed to load", e));
}
if (Ve) {
	let e = document.getElementById("canvasStatusIsland");
	e && import("./react-execution-entry-B_uT0TJ2.js").then(({ mountReactStatusIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React status island failed to load", e));
}
if (He) {
	let e = document.getElementById("canvasToolbarIsland");
	e && import("./react-execution-entry-B_uT0TJ2.js").then(({ mountReactToolbarIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React toolbar island failed to load", e));
}
if (ze) {
	let e = document.getElementById("canvasActivityIsland");
	e && import("./react-execution-entry-B_uT0TJ2.js").then(({ mountReactActivityIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React activity island failed to load", e));
}
if (Ue && !W.enabled) {
	let e = document.getElementById("canvasBoardV2"), t = document.getElementById("board");
	e && t && import("./canvas-board-v2-4wea6C3O.js").then(({ mountCanvasBoardV2: n }) => {
		let r = n(e, t);
		window.CanvasModernCore?.recordRolloutEvent("board-mounted", { dimensions: { reason: "none" } }), window.addEventListener("pagehide", r, { once: !0 });
	}).catch((e) => {
		window.CanvasModernCore?.recordRolloutEvent("board-mount-failed", { dimensions: { reason: e instanceof Error && e.message.includes("dependencies") ? "dependency-unavailable" : "import-failed" } }), console.warn("[canvas-modern-core] CanvasBoard V2 failed to load; using Legacy Board", e);
	});
}
if (W.enabled) {
	let e = document.getElementById("canvasModernApp"), t = document.getElementById("shell");
	e && (t && (t.hidden = !0), e.hidden = !1, import("./canvas-app-v2-CN51C__l.js").then(({ mountCanvasAppV2: t }) => {
		let n = t(e, {
			runtime: We,
			repository: Z
		});
		window.CanvasModernCore?.recordRolloutEvent("board-mounted", { dimensions: { reason: "none" } }), window.addEventListener("pagehide", n, { once: !0 });
	}).catch(async (n) => {
		e.hidden = !0;
		try {
			await window.__loadCanvasLegacyFallback?.(), t && (t.hidden = !1);
		} catch (e) {
			console.error("[canvas-modern-core] Legacy Canvas fallback failed to load", e);
		}
		window.CanvasModernCore?.recordRolloutEvent("board-mount-failed", { dimensions: { reason: "import-failed" } }), console.warn("[canvas-modern-core] standalone Canvas V2 failed to load; restored Legacy Canvas", n);
	}));
}
function $e(e, t) {
	Ze += 1, Xe.set(e.targetId, e), t.type === "finish" && ($[t.status] += 1, window.CanvasModernCore?.recordRolloutEvent(t.status === "done" ? "execution-succeeded" : t.status === "failed" ? "execution-failed" : "execution-stopped", { dimensions: { reason: t.status === "failed" ? "execution-failed" : t.status === "stopped" ? "execution-stopped" : "none" } })), window.dispatchEvent(new CustomEvent("canvas-modern-execution", { detail: {
		event: t,
		state: e
	} }));
}
document.documentElement.dataset.canvasModernCore = "30", document.documentElement.dataset.canvasBoardV2 = Ue ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionEngine = G ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionShadow = Fe ? "enabled" : "disabled", document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? "ready" : "missing", document.documentElement.dataset.canvasModernGraphOrder = Ie ? "enabled" : "disabled", document.documentElement.dataset.canvasModernM2 = J ? "enabled" : "disabled", document.documentElement.dataset.canvasModernRepository = q ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactActivity = ze ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactExecution = Be ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactIslands = Y ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactStatus = Ve ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactToolbar = He ? "enabled" : "disabled", document.documentElement.dataset.canvasModernShadow = Le ? "enabled" : "disabled", document.documentElement.dataset.canvasModernTaskClient = K ? "enabled" : "disabled", document.documentElement.dataset.canvasV2Rollout = W.enabled ? "enabled" : "disabled", document.documentElement.dataset.canvasV2RolloutBucket = String(W.bucket), document.documentElement.dataset.canvasV2RolloutBlocked = W.blockedReasons.join(",") || "none", document.documentElement.dataset.canvasV2RolloutPercentage = String(W.percentage), document.documentElement.dataset.canvasV2RolloutPolicy = W.policyLoaded ? "loaded" : "fallback", window.addEventListener("pagehide", () => {
	let e = Z.getDiagnostics(), t = X.getDiagnostics();
	n("page-summary", {
		counters: {
			execution_errors: Q,
			execution_failed: $.failed,
			execution_runs: $.done + $.failed + $.stopped,
			repository_conflicts: e.conflicts,
			repository_errors: e.errors,
			repository_saves: e.saves,
			shadow_errors: Ye,
			task_poll_errors: t.pollErrors,
			task_polls: t.polls,
			task_recoveries: t.recoveredTasks,
			task_resumed: t.resumedTasks,
			task_submissions: t.submissions
		},
		dimensions: {
			mode: J ? "enabled" : "disabled",
			reason: "none",
			source: W.source
		}
	});
}, { once: !0 }), window.dispatchEvent(new CustomEvent("canvas-modern-core-ready"));
//#endregion
