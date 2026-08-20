import { n as e, t } from "./http-F-lX8WKW.js";
import { i as n, n as r, r as i, t as a } from "./legacy-fallback-DHHl9S0x.js";
import { a as o, n as s, t as c } from "./graph-CA3lT02r.js";
//#region src/canvas/application/modern-canvas-runtime.ts
var l = /* @__PURE__ */ new Set([
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
function d(t, n = fetch) {
	let r = {}, i = [], a = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), u = async () => {
		let [e, t] = await Promise.all([k(n, "/api/config", {}), k(n, "/api/workflows", { workflows: [] })]);
		r = e, i = Array.isArray(t.workflows) ? t.workflows : [];
	}, d = async (t) => {
		let r = String(t || "").trim();
		if (!r) return [];
		let i = a.get(r);
		return i || (i = await e(n, `/api/workflows/${encodeURIComponent(r)}`), a.set(r, i)), structuredClone(i.config?.fields ?? []);
	}, y = (e, t, n = {
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
		let a = b(e);
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
	}, b = (e) => (r.api_providers ?? []).filter((t) => {
		let n = e === "video" ? t.video_models : e === "llm" ? t.chat_models : t.image_models;
		return t.enabled !== !1 && Array.isArray(n) && n.length > 0;
	}), S = async (t) => {
		let r = new FormData();
		return t.forEach((e) => r.append("files", e)), e(n, "/api/ai/upload", {
			method: "POST",
			body: r
		});
	}, C = (e) => {
		let t = structuredClone(e), n = Math.max(1, Number(t.frameRate || 24)), r = Math.max(1, Number(t.durationFrames || 120));
		return t.frameRate = n, t.durationFrames = r, t.durationSeconds = Math.round(r / n * 1e3) / 1e3, t.ltxTimelineData ||= JSON.stringify({
			segments: [{
				id: E("ltxseg"),
				start: 0,
				length: r,
				prompt: "",
				type: "text"
			}],
			audioSegments: []
		}), t;
	}, w = async (t, r, i, a = "") => {
		let o = structuredClone(r), s = o.nodes.find((e) => e.id === t && e.type === "video");
		if (!s) throw Error("Video node is missing from the active canvas");
		if (i === "manual") {
			let e = a.trim();
			if (e && !/^(https?:\/\/|asset:\/\/)/i.test(e)) throw Error("请输入 http/https 媒体网址或 asset:// 素材 URI");
			return s.manualVideoUrl = e, o;
		}
		let c = f(o, s).media.filter((e) => e.kind === "video" || e.kind === "audio"), l = { ...s.uploadedMediaUrls ?? {} };
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
	}, M = async (e, t, n = "node", r) => {
		let i = structuredClone(t), a = n === "cascade" ? c(i).cascadeOrder(e) : [e];
		if (!a.length) throw Error("没有可执行的节点");
		let s = new AbortController();
		o.get(e)?.abort(), o.set(e, s);
		try {
			for (let t of a) {
				if (s.signal.aborted) throw Error("执行已停止");
				await F(i, t, n === "chat" && t === e, s.signal, r);
			}
			return i;
		} finally {
			o.get(e) === s && o.delete(e);
		}
	}, N = async (e, t, n, r) => {
		if (e === "stop-execution") return o.get(t)?.abort(), structuredClone(n);
		let i = structuredClone(n), a = c(i).retryCascadeOrder(t), s = new AbortController();
		o.set(t, s);
		try {
			for (let e of a) await F(i, e, !1, s.signal, r);
			return i;
		} finally {
			o.get(t) === s && o.delete(t);
		}
	}, P = async (e, n) => {
		let r = structuredClone(e), i = [];
		for (let e of r.nodes.filter((e) => e.type === "output")) for (let a of Array.isArray(e._pending) ? e._pending : []) {
			let o = String(a.canvasTaskId || ""), s = a.canvasTaskType === "video" ? "video" : ["image", "online-image"].includes(String(a.canvasTaskType || "")) ? "image" : null;
			!o || !s || (a.recoveryStatus = "recovering", a.failed = !1, i.push(t.watch(s, o).then(async (t) => {
				let i = r.nodes.find((e) => e.id === String(a.nodeId || ""));
				if (t.status === "succeeded") {
					let n = _(t.result);
					i && (g(i, n), i.runStatus = "done", i.runError = ""), n.length && h(e, n), e._pending = e._pending.filter((e) => e.id !== a.id), A(r, {
						id: E("log"),
						nodeId: i?.id || a.nodeId,
						nodeType: i?.type || a.type,
						recovered: !0,
						status: "done",
						outputs: n.map(x),
						...j(t, a)
					});
				} else a.recoveryStatus = t.status, a.recoveryError = t.error || `任务状态：${t.status}`, a.failed = !0, i && (i.runStatus = "failed", i.runError = String(a.recoveryError));
				await O(r, n);
			}).catch(async (e) => {
				a.recoveryStatus = "interrupted", a.recoveryError = e instanceof Error ? e.message : String(e), a.failed = !0, await O(r, n);
			})));
		}
		return i.length && (await O(r, n), await Promise.all(i)), r;
	}, F = async (e, t, n, r, i) => {
		let a = e.nodes.find((e) => e.id === t);
		if (!a || !l.has(a.type)) throw Error(`不支持执行节点：${a?.type || t}`);
		a.running = !0, a.runStatus = "running", a.runError = "", await O(e, i);
		let o = f(e, a), c = null, u = null, d = [], p = !1, m = Date.now(), _ = `${String(e.id || "")}:${t}`;
		s.delete(_);
		try {
			a.type !== "llm" && (u = ee(e, a), c = {
				id: E("pending"),
				startedAt: Date.now(),
				nodeId: t,
				type: a.type
			}, u._pending = [...Array.isArray(u._pending) ? u._pending : [], c], await O(e, i)), d = await I(e, a, o, n, r, c, i), d.length && (g(a, d), u && h(u, d, o.media[0])), a.runStatus = "done", a.runError = "", p = !0, A(e, {
				id: E("log"),
				nodeId: t,
				nodeType: a.type,
				status: "done",
				startedAt: m,
				finishedAt: Date.now(),
				outputs: d.map(x),
				...s.get(_)
			});
		} catch (n) {
			throw a.runStatus = "failed", a.runError = n instanceof Error ? n.message : String(n), c?.canvasTaskId && (c.failed = !0, c.recoveryStatus ||= "interrupted", c.recoveryError ||= a.runError), A(e, {
				id: E("log"),
				nodeId: t,
				nodeType: a.type,
				status: "failed",
				startedAt: m,
				finishedAt: Date.now(),
				error: a.runError,
				...s.get(_)
			}), n;
		} finally {
			a.running = !1, u && c && (p || !c.canvasTaskId) && (u._pending = (Array.isArray(u._pending) ? u._pending : []).filter((e) => e.id !== c?.id)), s.delete(_), await O(e, i);
		}
	}, I = async (e, t, n, i, a, o, s) => {
		let c = n.prompts.join("\n\n").trim() || String(t.userInput || t.globalPrompt || "");
		if (t.type === "llm") {
			let e = i ? String(t.chatInput || c) : c;
			if (!e) throw Error("LLM 缺少提示词输入");
			let r = Array.isArray(t.messages) ? t.messages : [], o = await B("/api/canvas-llm", {
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
				videos: [String(t.manualVideoUrl || ""), ...n.media.filter((e) => e.kind === "video").map((e) => T(t, e.url))].filter(Boolean),
				audios: n.media.filter((e) => e.kind === "audio").map((e) => T(t, e.url)),
				enhance_prompt: !!t.enhancePrompt,
				enable_upsample: !!t.enableUpsample,
				watermark: !!t.watermark,
				camerafixed: !!t.cameraFixed,
				generate_audio: !!t.generateAudio,
				multimodal: !!t.multimodal,
				task_mode: t.taskMode || "auto"
			};
			return z("video", e, t, r, a, o, s);
		}
		if (t.type === "generator") {
			let i = ie(t, r.api_providers ?? []), l = n.media.filter((e) => e.kind === "image"), u = c || "Edit the reference images.", d = await re(t, l);
			ae(i.providerId, i.model, d, l.length), Object.assign(t, {
				apiProvider: i.providerId,
				model: i.model
			});
			let f = {
				prompt: u,
				provider_id: i.providerId,
				model: i.model,
				size: d,
				reference_images: l,
				quality: oe(t.quality),
				n: Math.max(1, Math.min(8, Number(t.count || 1)))
			};
			return z("image", e, t, f, a, o, s);
		}
		if (t.type === "msgen") {
			let e = String(t.msgenModel || "zimage"), r = ne(t.msRatio, t.msResolution, t.msCustomSize, t.msWidth, t.msHeight), i = e === "qwen_edit" ? "/api/angle/generate" : "/generate", o = {
				prompt: c,
				resolution: r,
				client_id: D()
			};
			e !== "zimage" && (o.image_urls = n.media.filter((e) => e.kind === "image").map((e) => e.url)), e === "custom" && (o.model = t.msCustomModel || ""), t.msLoraEnabled && t.msLoraId && (o.loras = { [String(t.msLoraId)]: Number(t.msLoraStrength ?? .8) });
			let s = Math.max(1, Math.min(8, Number(t.count || 1)));
			return (await Promise.all(Array.from({ length: s }, () => B(i, o, a)))).flatMap(_);
		}
		if (t.type === "ltxDirector") {
			let e = C(t);
			Object.assign(t, e);
			let n = te(t, c), r = JSON.parse(String(n.timeline_data || "{}"));
			for (let e of r.segments ?? []) e.type !== "image" || e.imageFile || !e.imageB64 || (e.imageFile = await V({
				kind: "image",
				name: `ltx-${String(e.id || "segment")}.png`,
				url: String(e.imageB64)
			}, a), delete e.imgObj);
			n.timeline_data = JSON.stringify(r), t.ltxTimelineData = n.timeline_data, t.ltxLocalPrompts = n.local_prompts, t.ltxSegmentLengths = n.segment_lengths, t.ltxGuideStrength = n.guide_strength;
			let i = {
				46: n,
				"94:28": { noise_seed: Number(t.noiseSeed ?? 12) }
			};
			return _(await B("/api/generate", {
				prompt: c,
				workflow_json: "LTXDirectorv2-API.json",
				params: i,
				type: "ltx-director",
				client_id: D()
			}, a));
		}
		return L(t, n, c, a);
	}, L = async (e, t, n, r) => {
		let a = String(e.mode || "text"), o;
		if (a === "text") o = {
			prompt: n,
			width: Number(e.width || 1024),
			height: Number(e.height || 1024),
			workflow_json: "Z-Image.json",
			type: "zimage",
			client_id: D()
		};
		else if (a === "enhance") {
			let n = p(t, "image", 1, "Comfy 增强")[0], i = m(await B("/api/generate", {
				workflow_json: "Z-Image-Enhance.json",
				params: {
					15: { image: await V(n, r) },
					204: { value: Number(e.enhanceStrength ?? .5) }
				},
				type: "enhance",
				client_id: D()
			}, r), "Comfy 增强");
			return e.enhanceUpscale ? R(i[0], Number(e.enhanceUpscaleRes || 2048), r) : i;
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
				let n = s.filter((t) => v(t) === e).length;
				n && p(t, e, n, `Comfy 工作流 ${a || "未命名"}`);
			}
			for (let t of s) {
				let i = String(t.node || ""), a = String(t.input || "");
				if (!i || !a) continue;
				c[i] ??= {};
				let o = v(t);
				if (o === "prompt") c[i][a] = n;
				else if ([
					"image",
					"video",
					"audio"
				].includes(o)) {
					let e = u.get(o) ?? 0, t = l.get(o)?.[e];
					u.set(o, e + 1), c[i][a] = t ? await V(t, r) : "";
				} else {
					let n = String(t.id || ""), r = (e.comfyParams ?? {})[n] ?? t.default, o = (e.comfyRandomActive ?? {})[n] !== !1;
					c[i][a] = t.random_enabled && o ? se(t) : r;
				}
			}
			o = {
				prompt: n,
				workflow_json: a,
				params: c,
				type: "workflow-custom",
				client_id: D()
			};
		} else {
			let i = p(t, "image", 1, "Comfy 编辑").slice(0, 3), a = [];
			for (let e of i) a.push(await V(e, r));
			let o = m(await B("/api/generate", {
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
				client_id: D()
			}, r), "Comfy 编辑");
			return e.editUpscale ? R(o[0], Number(e.editUpscaleRes || 2048), r) : o;
		}
		return _(await B("/api/generate", o, r));
	}, R = async (e, t, n) => {
		let r = x(e);
		if (!r) throw Error("Comfy 超分辨率缺少输入图片");
		let i = await V({
			kind: "image",
			name: "canvas-upscale.png",
			url: r
		}, n);
		return m(await B("/api/generate", {
			workflow_json: "upscale.json",
			params: {
				15: { image: i },
				172: {
					seed: Math.floor(Math.random() * 4294967295),
					resolution: Math.max(64, t || 2048)
				}
			},
			type: "enhance",
			client_id: D()
		}, n), "Comfy 超分辨率");
	}, z = async (e, n, r, i, a, o, c) => {
		let l = `${n.id}:${r.id}:${E("submit")}`, u = await t.submit(e, i, {
			idempotencyKey: l,
			signal: a
		}), d = String(u.task_id || u.id || ""), f = `${String(n.id || "")}:${r.id}`;
		s.set(f, j(u, {
			canvasTaskId: d,
			idempotencyKey: l
		})), o && Object.assign(o, {
			canvasTaskId: d,
			canvasTaskType: e,
			idempotencyKey: l
		}), await O(n, c);
		let p = await t.wait(e, d, { signal: a });
		if (s.set(f, j(p, {
			canvasTaskId: d,
			idempotencyKey: l
		})), p.status !== "succeeded") throw o && Object.assign(o, {
			failed: !0,
			recoveryStatus: p.status,
			recoveryError: p.error || `${e} task failed`
		}), Error(p.error || `${e} task failed`);
		return _(p.result);
	}, B = (t, r, i) => e(n, t, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(r),
		signal: i
	}), V = async (t, r) => {
		let i = await n(/^https?:\/\//i.test(t.url) ? `/api/download-output?inline=1&url=${encodeURIComponent(t.url)}&name=${encodeURIComponent(t.name || "media")}` : t.url, { signal: r });
		if (!i.ok) throw Error(`读取 ComfyUI 输入媒体失败：${t.name || t.url}`);
		let a = await i.blob(), o = new FormData();
		o.append("files", new File([a], t.name || `canvas-${t.kind}`, { type: a.type }));
		let s = await e(n, "/api/upload", {
			method: "POST",
			body: o,
			signal: r
		}), c = String(s.files?.[0]?.comfy_name || "");
		if (!c) throw Error("ComfyUI 没有返回媒体文件名");
		return c;
	};
	return {
		getComfyFields: d,
		getNodeOptions: y,
		initialize: u,
		normalizeLtxNode: C,
		prepareVideoMedia: w,
		recoverDocument: P,
		runCommand: N,
		runNode: M,
		uploadMedia: S
	};
}
function f(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = e.connections.filter((e) => e.to === t.id).map((e) => n.get(e.from)).filter(Boolean), i = [], a = [], o = (e) => {
		e.type === "prompt" && e.text && i.push(String(e.text)), e.type === "llm" && e.outputText && i.push(String(e.outputText)), (e.type === "promptGroup" || e.type === "group") && (Array.isArray(e.items) ? e.items : []).map(String).map((e) => n.get(e)).filter(Boolean).forEach((e) => o(e)), e.type === "image" && e.url && a.push(b(e.url, e.mediaKind, e.name)), e.type === "output" && (Array.isArray(e.images) ? e.images : []).slice(-1).forEach((e) => a.push(b(x(e), S(e), "output"))), u.has(e.type) && (Array.isArray(e.generatedOutputs) ? e.generatedOutputs : []).forEach((t) => a.push(b(x(t), S(t), e.type)));
	};
	return r.forEach(o), {
		prompts: i.filter(Boolean),
		media: w(a)
	};
}
function p(e, t, n, r) {
	let i = e.media.filter((e) => e.kind === t);
	if (i.length < n) throw Error(`${r}需要连接 ${n} 个${{
		audio: "音频",
		image: "图片",
		video: "视频"
	}[t]}输入，当前只有 ${i.length} 个`);
	return i;
}
function m(e, t) {
	let n = _(e);
	if (!n.length) throw Error(`${t}未返回任何媒体`);
	return n;
}
function ee(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = e.connections.filter((e) => e.from === t.id).map((e) => n.get(e.to)).find((e) => e?.type === "output");
	return r || (r = {
		id: E("out"),
		type: "output",
		x: Number(t.x || 0) + 460,
		y: Number(t.y || 0),
		images: []
	}, e.nodes.push(r), e.connections.push({
		id: E("edge"),
		from: t.id,
		to: r.id
	})), r;
}
function h(e, t, n) {
	let r = new Set((Array.isArray(e.images) ? e.images : []).map(x)), i = t.map((e) => ({
		url: x(e),
		kind: S(e),
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
function g(e, t) {
	e.generatedOutputs = t.map((e) => S(e) === "image" ? x(e) : {
		url: x(e),
		kind: S(e)
	}).filter((e) => typeof e == "string" ? e : e.url);
}
function _(e) {
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
		let t = x(e);
		return !!(t && !r.has(t) && r.add(t));
	});
}
function te(e, t) {
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
function v(e) {
	let t = String(e.type || e.kind || e.input_type || "").toLowerCase();
	return t.includes("image") ? "image" : t.includes("video") ? "video" : t.includes("audio") ? "audio" : t.includes("prompt") || t.includes("text") ? "prompt" : "setting";
}
function ne(e, t, n, r, i, a = "") {
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
	if ((c === "custom" || c === "source") && y(a)) {
		let e = y(a), t = {
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
async function re(e, t) {
	let n = e.customRatio;
	if (String(e.ratio || "") === "source" && !y(n)) {
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
	return ne(e.ratio, e.resolution, e.customSize, e.width, e.height, n);
}
function y(e) {
	let t = String(e || "").trim().match(/^(\d+(?:\.\d+)?)\s*[:x*]\s*(\d+(?:\.\d+)?)$/i);
	if (!t) return null;
	let n = Number(t[1]), r = Number(t[2]);
	return n > 0 && r > 0 ? n / r : null;
}
function ie(e, t) {
	let n = t.filter((e) => e.enabled !== !1 && Array.isArray(e.image_models) && e.image_models.length > 0), r = n.find((t) => t.id === e.apiProvider) ?? n[0];
	if (!r?.id) throw Error("没有可用的图片生成平台，请先完成 API 设置");
	let i = [...new Set((r.image_models ?? []).map(String).filter(Boolean))], a = String(e.model || ""), o = i.includes(a) ? a : i[0];
	if (!o) throw Error(`图片生成平台 ${r.name || r.id} 没有可用模型`);
	return {
		providerId: String(r.id),
		model: o
	};
}
function ae(e, t, n, r) {
	let i = t.toLowerCase(), a = e === "modelscope" ? 4 : /seedream|doubao/.test(i) || e === "volcengine" ? 10 : 16;
	if (r > a) throw Error(`${t} 最多支持 ${a} 张参考图，当前连接了 ${r} 张`);
	let o = String(n || "").match(/^(\d+)x(\d+)$/i);
	if (!o) throw Error("图片尺寸无效，请选择预设尺寸或填写完整的自定义宽高");
	let s = Number(o[1]), c = Number(o[2]);
	if (s < 64 || c < 64 || s % 16 || c % 16) throw Error("图片宽高必须不小于 64，且为 16 的倍数");
	if (/gpt[^a-z0-9]*image[^a-z0-9]*2/i.test(t) && (Math.max(s, c) > 3840 || s * c > 8294400)) throw Error(`GPT-Image-2 不支持尺寸 ${n}：最长边不能超过 3840，且总像素不能超过 8294400`);
}
function oe(e) {
	let t = String(e || "").trim().toLowerCase();
	return t === "low" || t === "medium" || t === "high" ? t : void 0;
}
function b(e, t, n) {
	return {
		url: String(e || ""),
		kind: C(String(t || ""), String(e || "")),
		name: String(n || "media")
	};
}
function x(e) {
	return typeof e == "string" ? e : e && typeof e == "object" ? String(e.url || "") : "";
}
function S(e) {
	return C(e && typeof e == "object" ? String(e.kind || "") : "", x(e));
}
function C(e, t) {
	return e === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(t) ? "video" : e === "audio" || /\.(mp3|wav|m4a|ogg)(\?|$)/i.test(t) ? "audio" : "image";
}
function se(e) {
	let t = Number.isFinite(Number(e.min)) ? Number(e.min) : 0, n = Number.isFinite(Number(e.max)) ? Number(e.max) : Math.max(t + 1, 1e6), r = Math.max(Number(e.step) || 1, 2 ** -52), i = Math.max(0, Math.floor((n - t) / r)), a = t + Math.floor(Math.random() * (i + 1)) * r;
	return Number(a.toFixed(Math.min(12, Math.max(0, String(r).split(".")[1]?.length || 0))));
}
function w(e) {
	let t = /* @__PURE__ */ new Set();
	return e.filter((e) => !!(e.url && !t.has(e.url) && t.add(e.url)));
}
function T(e, t) {
	return String((e.uploadedMediaUrls ?? {})[t] || t);
}
function E(e) {
	return `${e}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}
function D() {
	try {
		return typeof sessionStorage > "u" ? "canvas-modern" : sessionStorage.getItem("canvasClientId") || "canvas-modern";
	} catch {
		return "canvas-modern";
	}
}
async function O(e, t) {
	t && await t(structuredClone(e));
}
async function k(t, n, r) {
	try {
		return await e(t, n);
	} catch {
		return r;
	}
}
function A(e, t) {
	e.logs = [...Array.isArray(e.logs) ? e.logs : [], t].slice(-500);
}
function j(e, t = {}) {
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
function M() {
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
function N(e, t) {
	if (t.type === "queue") {
		if ([
			"idle",
			"done",
			"failed",
			"stopped"
		].includes(e.status) || L(e, t), !t.targetId || !t.order.length) throw Error("Execution queue requires a target and order");
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
	if (t.type === "start") return e.status !== "queued" && L(e, t), {
		...e,
		status: "running"
	};
	if (t.type === "request-stop") return e.status === "stopping" ? e : (e.status !== "running" && L(e, t), {
		...e,
		status: "stopping"
	});
	if (t.type === "node-start") {
		if (e.mode === "parallel") return P(e, t);
		(e.status !== "running" || e.currentNodeId) && L(e, t);
		let n = e.completedNodeIds.length === e.order.length ? [] : e.completedNodeIds, r = e.order[n.length];
		if (t.nodeId !== r) throw Error(`Expected execution node ${r || "<none>"}`);
		return {
			...e,
			completedNodeIds: n,
			currentNodeId: t.nodeId
		};
	}
	if (t.type === "node-done") {
		if (e.mode === "parallel") return P(e, t);
		(!["running", "stopping"].includes(e.status) || e.currentNodeId !== t.nodeId) && L(e, t);
		let n = [...e.completedNodeIds, t.nodeId];
		return {
			...e,
			completedNodeIds: n,
			completedRounds: e.completedRounds + +(n.length === e.order.length),
			currentNodeId: ""
		};
	}
	return e.status !== "running" && e.status !== "stopping" && L(e, t), e.status === "stopping" && t.status === "done" && L(e, t), {
		...e,
		error: t.error || "",
		status: t.status
	};
}
function P(e, t) {
	t.roundId || L(e, t);
	let n = e.rounds[t.roundId] ?? {
		completedNodeIds: [],
		currentNodeId: ""
	};
	if (t.type === "node-start") {
		e.status !== "running" && L(e, t), n.currentNodeId && L(e, t);
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
	["running", "stopping"].includes(e.status) || L(e, t), n.currentNodeId !== t.nodeId && L(e, t);
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
async function F(e, t, n, r = {}) {
	let { mode: i = "serial", onTransition: a, signal: o } = r, s = R(M(), {
		type: "queue",
		targetId: e,
		order: [...t],
		mode: i
	}, a);
	s = R(s, { type: "start" }, a);
	let c = () => (s.status === "running" && (s = R(s, { type: "request-stop" }, a)), R(s, {
		type: "finish",
		status: "stopped"
	}, a));
	for (let e of t) {
		if (o?.aborted) return c();
		s = R(s, {
			type: "node-start",
			nodeId: e
		}, a);
		try {
			await n(e, o);
		} catch (e) {
			return o?.aborted ? c() : R(s, {
				type: "finish",
				status: "failed",
				error: e instanceof Error ? e.message : String(e)
			}, a);
		}
		if (o?.aborted) return s = R(s, { type: "request-stop" }, a), s = R(s, {
			type: "node-done",
			nodeId: e
		}, a), c();
		s = R(s, {
			type: "node-done",
			nodeId: e
		}, a);
	}
	return R(s, {
		type: "finish",
		status: "done"
	}, a);
}
async function I(e, t, n, r, i = {}) {
	let { onTransition: a, signal: o } = i, s = n.map((e, t) => ({
		id: i.roundId?.(e, t) || String(t + 1),
		round: e
	}));
	if (new Set(s.map(({ id: e }) => e)).size !== s.length) throw Error("Parallel execution round IDs must be unique");
	let c = R(M(), {
		type: "queue",
		targetId: e,
		order: [...t],
		mode: "parallel"
	}, a);
	c = R(c, { type: "start" }, a);
	let l = null, u = 0, d = () => {
		c.status === "running" && (c = R(c, { type: "request-stop" }, a));
	}, f = Math.max(1, Math.min(Math.floor(i.limit || 1), s.length || 1)), p = Array.from({ length: f }, async () => {
		for (; !l && !o?.aborted && u < s.length;) {
			let { id: e, round: n } = s[u++];
			for (let i of t) {
				if (l || o?.aborted) break;
				c = R(c, {
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
				o?.aborted && d(), c = R(c, {
					type: "node-done",
					nodeId: i,
					roundId: e
				}, a);
			}
		}
	});
	return await Promise.all(p), o?.aborted ? (d(), R(c, {
		type: "finish",
		status: "stopped"
	}, a)) : l ? R(c, {
		type: "finish",
		status: "failed",
		error: l instanceof Error ? l.message : String(l)
	}, a) : R(c, {
		type: "finish",
		status: "done"
	}, a);
}
function L(e, t) {
	throw Error(`Invalid execution transition: ${e.status} -> ${t.type}`);
}
function R(e, t, n) {
	let r = N(e, t);
	return n?.(r, t), r;
}
//#endregion
//#region src/canvas/infrastructure/task-client.ts
var z = {
	image: "/api/canvas-image-tasks",
	video: "/api/canvas-video-tasks"
};
function B(n = fetch) {
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
				let t = await e(n, z[r], {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(d)
				}, s);
				return V(t), t;
			} catch (e) {
				if (!(e instanceof t) || !e.retryable || o++ >= i) throw e;
				a.submissionRetries += 1;
			}
		})().finally(() => {
			l && i.delete(l);
		});
		return l && i.set(l, f), f;
	}, s = (t, r, i) => r ? e(n, `${z[t]}/${encodeURIComponent(r)}`, {}, i) : Promise.reject(/* @__PURE__ */ TypeError("Task ID is required")), c = async (e, n, r = {}) => {
		let { intervalMs: i = e === "video" ? 2500 : 1800, maxPollErrors: o = 3, requestTimeoutMs: c = 3e4 } = r, l = Date.now(), u = 0;
		for (;;) {
			H(r.signal, l, r.timeoutMs);
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
			await ce(i, r.signal, l, r.timeoutMs);
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
function V(e) {
	let n = String(e.task_id || e.id || "");
	if (!n) throw new t("Task response did not include an ID", "validation", 200, e);
	return n;
}
function H(e, n, r = 0) {
	if (e?.aborted) throw new t("Task polling aborted", "aborted");
	if (r > 0 && Date.now() - n >= r) throw new t("Task polling timed out", "timeout");
}
function ce(e, n, r, i = 0) {
	H(n, r, i);
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
var U = new URLSearchParams(window.location.search), le = "__CanvasBootstrapRolloutPolicy" in window ? window.__CanvasBootstrapRolloutPolicy ?? null : await r(), W = n(window.location.search, window.localStorage, window.sessionStorage.getItem("canvasClientId") || window.location.pathname, le);
i("rollout-decision", { dimensions: {
	mode: W.enabled ? "enabled" : "disabled",
	reason: W.blockedReasons[0] || (W.policyLoaded ? "none" : "policy-unavailable"),
	source: W.source
} });
var G = U.get("canvas_m2") === "1" || U.get("canvas_m2") === null && W.enabled, K = G || U.get("canvas_execution_engine") === "1", q = G || U.get("canvas_task_client") === "1", J = G || U.get("canvas_repository") === "1", Y = K && q && J, X = B(), Z = d(X);
await Z.initialize();
var Q = o(), ue = /* @__PURE__ */ new Map(), $ = {
	done: 0,
	failed: 0,
	stopped: 0
}, de = 0;
if (window.CanvasModernCore = Object.freeze({
	version: 30,
	canvasRepository: Q,
	canvasRepositoryEnabled: J,
	canvasRuntime: Z,
	executionEngineEnabled: K,
	m2Enabled: Y,
	taskClient: X,
	taskClientEnabled: q,
	recordRolloutEvent(e, t) {
		i(e, {
			...t,
			dimensions: {
				...t?.dimensions,
				mode: Y ? "enabled" : "disabled",
				source: W.source
			}
		});
	},
	runOrdered(e) {
		return K ? F(e.targetId, e.order, e.execute, {
			mode: e.mode,
			signal: e.signal,
			onTransition: fe
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	runParallel(e) {
		return K ? I(e.targetId, e.order, e.rounds, e.execute, {
			limit: e.limit,
			roundId: e.roundId,
			signal: e.signal,
			onTransition: fe
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	getM2Report() {
		return {
			enabled: Y,
			rollout: W,
			execution: {
				active: [...ue.values()].filter(({ status: e }) => ![
					"done",
					"failed",
					"stopped"
				].includes(e)).length,
				...$,
				transitions: de
			},
			flags: {
				executionEngine: K,
				repository: J,
				taskClient: q
			},
			repository: Q.getDiagnostics(),
			tasks: X.getDiagnostics()
		};
	},
	mergeConflict(e, t, n) {
		return s(e, t, n);
	}
}), W.enabled) {
	let e = document.getElementById("canvasModernApp");
	e && (e.hidden = !1, import("./canvas-app-v2-CIraHljV.js").then(({ mountCanvasAppV2: t }) => {
		let n = t(e, {
			runtime: Z,
			repository: Q
		});
		window.CanvasModernCore?.recordRolloutEvent("board-mounted", { dimensions: { reason: "none" } }), window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => {
		window.CanvasModernCore?.recordRolloutEvent("board-mount-failed", { dimensions: { reason: "import-failed" } }), console.warn("[canvas-modern-core] standalone Canvas V2 failed to load; redirecting to Classic Canvas", e), window.location.replace(a());
	}));
}
function fe(e, t) {
	de += 1, ue.set(e.targetId, e), t.type === "finish" && ($[t.status] += 1, window.CanvasModernCore?.recordRolloutEvent(t.status === "done" ? "execution-succeeded" : t.status === "failed" ? "execution-failed" : "execution-stopped", { dimensions: { reason: t.status === "failed" ? "execution-failed" : t.status === "stopped" ? "execution-stopped" : "none" } })), window.dispatchEvent(new CustomEvent("canvas-modern-execution", { detail: {
		event: t,
		state: e
	} }));
}
document.documentElement.dataset.canvasModernCore = "30", document.documentElement.dataset.canvasModernExecutionEngine = K ? "enabled" : "disabled", document.documentElement.dataset.canvasModernM2 = Y ? "enabled" : "disabled", document.documentElement.dataset.canvasModernRepository = J ? "enabled" : "disabled", document.documentElement.dataset.canvasModernTaskClient = q ? "enabled" : "disabled", document.documentElement.dataset.canvasV2Rollout = W.enabled ? "enabled" : "disabled", document.documentElement.dataset.canvasV2RolloutBucket = String(W.bucket), document.documentElement.dataset.canvasV2RolloutBlocked = W.blockedReasons.join(",") || "none", document.documentElement.dataset.canvasV2RolloutPercentage = String(W.percentage), document.documentElement.dataset.canvasV2RolloutPolicy = W.policyLoaded ? "loaded" : "fallback", window.addEventListener("pagehide", () => {
	let e = Q.getDiagnostics(), t = X.getDiagnostics();
	i("page-summary", {
		counters: {
			execution_failed: $.failed,
			execution_runs: $.done + $.failed + $.stopped,
			repository_conflicts: e.conflicts,
			repository_errors: e.errors,
			repository_saves: e.saves,
			task_poll_errors: t.pollErrors,
			task_polls: t.polls,
			task_recoveries: t.recoveredTasks,
			task_resumed: t.resumedTasks,
			task_submissions: t.submissions
		},
		dimensions: {
			mode: Y ? "enabled" : "disabled",
			reason: "none",
			source: W.source
		}
	});
}, { once: !0 }), window.dispatchEvent(new CustomEvent("canvas-modern-core-ready"));
//#endregion
