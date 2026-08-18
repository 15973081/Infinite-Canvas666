import { n as e, t } from "./http-F-lX8WKW.js";
import { n, r, t as i } from "./rollout-BcgAkMGv.js";
import { n as a, t as o } from "./graph-DUr4u9Sb.js";
import { i as s, t as c } from "./document-merge-DziDwlrU.js";
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
	let r = {}, i = [], a = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), c = /* @__PURE__ */ new Map(), u = async () => {
		let [e, t] = await Promise.all([pe(n, "/api/config", {}), pe(n, "/api/workflows", { workflows: [] })]);
		r = e, i = Array.isArray(t.workflows) ? t.workflows : [];
	}, d = async (t) => {
		let r = String(t || "").trim();
		if (!r) return [];
		let i = a.get(r);
		return i || (i = await e(n, `/api/workflows/${encodeURIComponent(r)}`), a.set(r, i)), structuredClone(i.config?.fields ?? []);
	}, g = (e, t, n = {
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
		let a = _(e);
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
	}, _ = (e) => (r.api_providers ?? []).filter((t) => {
		let n = e === "video" ? t.video_models : e === "llm" ? t.chat_models : t.image_models;
		return t.enabled !== !1 && Array.isArray(n) && n.length > 0;
	}), y = async (t) => {
		let r = new FormData();
		return t.forEach((e) => r.append("files", e)), e(n, "/api/ai/upload", {
			method: "POST",
			body: r
		});
	}, b = (e) => {
		let t = structuredClone(e), n = Math.max(1, Number(t.frameRate || 24)), r = Math.max(1, Number(t.durationFrames || 120));
		return t.frameRate = n, t.durationFrames = r, t.durationSeconds = Math.round(r / n * 1e3) / 1e3, t.ltxTimelineData ||= JSON.stringify({
			segments: [{
				id: x("ltxseg"),
				start: 0,
				length: r,
				prompt: "",
				type: "text"
			}],
			audioSegments: []
		}), t;
	}, de = async (t, r, i, a = "") => {
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
	}, E = async (e, t, n = "node", r) => {
		let i = structuredClone(t), a = n === "cascade" ? o(i).cascadeOrder(e) : [e];
		if (!a.length) throw Error("没有可执行的节点");
		let c = new AbortController();
		s.get(e)?.abort(), s.set(e, c);
		try {
			for (let t of a) {
				if (c.signal.aborted) throw Error("执行已停止");
				await k(i, t, n === "chat" && t === e, c.signal, r);
			}
			return i;
		} finally {
			s.get(e) === c && s.delete(e);
		}
	}, D = async (e, t, n, r) => {
		if (e === "stop-execution") return s.get(t)?.abort(), structuredClone(n);
		let i = structuredClone(n), a = o(i).retryCascadeOrder(t), c = new AbortController();
		s.set(t, c);
		try {
			for (let e of a) await k(i, e, !1, c.signal, r);
			return i;
		} finally {
			s.get(t) === c && s.delete(t);
		}
	}, O = async (e, n) => {
		let r = structuredClone(e), i = [];
		for (let e of r.nodes.filter((e) => e.type === "output")) for (let a of Array.isArray(e._pending) ? e._pending : []) {
			let o = String(a.canvasTaskId || ""), s = a.canvasTaskType === "video" ? "video" : ["image", "online-image"].includes(String(a.canvasTaskType || "")) ? "image" : null;
			!o || !s || (a.recoveryStatus = "recovering", a.failed = !1, i.push(t.watch(s, o).then(async (t) => {
				let i = r.nodes.find((e) => e.id === String(a.nodeId || ""));
				if (t.status === "succeeded") {
					let n = h(t.result);
					i && (ne(i, n), i.runStatus = "done", i.runError = ""), n.length && te(e, n), e._pending = e._pending.filter((e) => e.id !== a.id), w(r, {
						id: x("log"),
						nodeId: i?.id || a.nodeId,
						nodeType: i?.type || a.type,
						recovered: !0,
						status: "done",
						outputs: n.map(v),
						...T(t, a)
					});
				} else a.recoveryStatus = t.status, a.recoveryError = t.error || `任务状态：${t.status}`, a.failed = !0, i && (i.runStatus = "failed", i.runError = String(a.recoveryError));
				await C(r, n);
			}).catch(async (e) => {
				a.recoveryStatus = "interrupted", a.recoveryError = e instanceof Error ? e.message : String(e), a.failed = !0, await C(r, n);
			})));
		}
		return i.length && (await C(r, n), await Promise.all(i)), r;
	}, k = async (e, t, n, r, i) => {
		let a = e.nodes.find((e) => e.id === t);
		if (!a || !l.has(a.type)) throw Error(`不支持执行节点：${a?.type || t}`);
		a.running = !0, a.runStatus = "running", a.runError = "", await C(e, i);
		let o = f(e, a), s = null, u = null, d = [], p = !1, m = Date.now(), h = `${String(e.id || "")}:${t}`;
		c.delete(h);
		try {
			a.type !== "llm" && (u = ee(e, a), s = {
				id: x("pending"),
				startedAt: Date.now(),
				nodeId: t,
				type: a.type
			}, u._pending = [...Array.isArray(u._pending) ? u._pending : [], s], await C(e, i)), d = await me(e, a, o, n, r, s, i), d.length && (ne(a, d), u && te(u, d, o.media[0])), a.runStatus = "done", a.runError = "", p = !0, w(e, {
				id: x("log"),
				nodeId: t,
				nodeType: a.type,
				status: "done",
				startedAt: m,
				finishedAt: Date.now(),
				outputs: d.map(v),
				...c.get(h)
			});
		} catch (n) {
			throw a.runStatus = "failed", a.runError = n instanceof Error ? n.message : String(n), s?.canvasTaskId && (s.failed = !0, s.recoveryStatus ||= "interrupted", s.recoveryError ||= a.runError), w(e, {
				id: x("log"),
				nodeId: t,
				nodeType: a.type,
				status: "failed",
				startedAt: m,
				finishedAt: Date.now(),
				error: a.runError,
				...c.get(h)
			}), n;
		} finally {
			a.running = !1, u && s && (p || !s.canvasTaskId) && (u._pending = (Array.isArray(u._pending) ? u._pending : []).filter((e) => e.id !== s?.id)), c.delete(h), await C(e, i);
		}
	}, me = async (e, t, n, i, a, o, s) => {
		let c = n.prompts.join("\n\n").trim() || String(t.userInput || t.globalPrompt || "");
		if (t.type === "llm") {
			let e = i ? String(t.chatInput || c) : c;
			if (!e) throw Error("LLM 缺少提示词输入");
			let r = Array.isArray(t.messages) ? t.messages : [], o = await N("/api/canvas-llm", {
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
				videos: [String(t.manualVideoUrl || ""), ...n.media.filter((e) => e.kind === "video").map((e) => fe(t, e.url))].filter(Boolean),
				audios: n.media.filter((e) => e.kind === "audio").map((e) => fe(t, e.url)),
				enhance_prompt: !!t.enhancePrompt,
				enable_upsample: !!t.enableUpsample,
				watermark: !!t.watermark,
				camerafixed: !!t.cameraFixed,
				generate_audio: !!t.generateAudio,
				multimodal: !!t.multimodal,
				task_mode: t.taskMode || "auto"
			};
			return M("video", e, t, r, a, o, s);
		}
		if (t.type === "generator") {
			let i = se(t, r.api_providers ?? []), l = n.media.filter((e) => e.kind === "image"), u = c || "Edit the reference images.", d = await oe(t, l);
			ce(i.providerId, i.model, d, l.length), Object.assign(t, {
				apiProvider: i.providerId,
				model: i.model
			});
			let f = {
				prompt: u,
				provider_id: i.providerId,
				model: i.model,
				size: d,
				reference_images: l,
				quality: le(t.quality),
				n: Math.max(1, Math.min(8, Number(t.count || 1)))
			};
			return M("image", e, t, f, a, o, s);
		}
		if (t.type === "msgen") {
			let e = String(t.msgenModel || "zimage"), r = ae(t.msRatio, t.msResolution, t.msCustomSize, t.msWidth, t.msHeight), i = e === "qwen_edit" ? "/api/angle/generate" : "/generate", o = {
				prompt: c,
				resolution: r,
				client_id: S()
			};
			e !== "zimage" && (o.image_urls = n.media.filter((e) => e.kind === "image").map((e) => e.url)), e === "custom" && (o.model = t.msCustomModel || ""), t.msLoraEnabled && t.msLoraId && (o.loras = { [String(t.msLoraId)]: Number(t.msLoraStrength ?? .8) });
			let s = Math.max(1, Math.min(8, Number(t.count || 1)));
			return (await Promise.all(Array.from({ length: s }, () => N(i, o, a)))).flatMap(h);
		}
		if (t.type === "ltxDirector") {
			let e = b(t);
			Object.assign(t, e);
			let n = re(t, c), r = JSON.parse(String(n.timeline_data || "{}"));
			for (let e of r.segments ?? []) e.type !== "image" || e.imageFile || !e.imageB64 || (e.imageFile = await P({
				kind: "image",
				name: `ltx-${String(e.id || "segment")}.png`,
				url: String(e.imageB64)
			}, a), delete e.imgObj);
			n.timeline_data = JSON.stringify(r), t.ltxTimelineData = n.timeline_data, t.ltxLocalPrompts = n.local_prompts, t.ltxSegmentLengths = n.segment_lengths, t.ltxGuideStrength = n.guide_strength;
			let i = {
				46: n,
				"94:28": { noise_seed: Number(t.noiseSeed ?? 12) }
			};
			return h(await N("/api/generate", {
				prompt: c,
				workflow_json: "LTXDirectorv2-API.json",
				params: i,
				type: "ltx-director",
				client_id: S()
			}, a));
		}
		return A(t, n, c, a);
	}, A = async (e, t, n, r) => {
		let a = String(e.mode || "text"), o;
		if (a === "text") o = {
			prompt: n,
			width: Number(e.width || 1024),
			height: Number(e.height || 1024),
			workflow_json: "Z-Image.json",
			type: "zimage",
			client_id: S()
		};
		else if (a === "enhance") {
			let n = p(t, "image", 1, "Comfy 增强")[0], i = m(await N("/api/generate", {
				workflow_json: "Z-Image-Enhance.json",
				params: {
					15: { image: await P(n, r) },
					204: { value: Number(e.enhanceStrength ?? .5) }
				},
				type: "enhance",
				client_id: S()
			}, r), "Comfy 增强");
			return e.enhanceUpscale ? j(i[0], Number(e.enhanceUpscaleRes || 2048), r) : i;
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
				let n = s.filter((t) => ie(t) === e).length;
				n && p(t, e, n, `Comfy 工作流 ${a || "未命名"}`);
			}
			for (let t of s) {
				let i = String(t.node || ""), a = String(t.input || "");
				if (!i || !a) continue;
				c[i] ??= {};
				let o = ie(t);
				if (o === "prompt") c[i][a] = n;
				else if ([
					"image",
					"video",
					"audio"
				].includes(o)) {
					let e = u.get(o) ?? 0, t = l.get(o)?.[e];
					u.set(o, e + 1), c[i][a] = t ? await P(t, r) : "";
				} else {
					let n = String(t.id || ""), r = (e.comfyParams ?? {})[n] ?? t.default, o = (e.comfyRandomActive ?? {})[n] !== !1;
					c[i][a] = t.random_enabled && o ? ue(t) : r;
				}
			}
			o = {
				prompt: n,
				workflow_json: a,
				params: c,
				type: "workflow-custom",
				client_id: S()
			};
		} else {
			let i = p(t, "image", 1, "Comfy 编辑").slice(0, 3), a = [];
			for (let e of i) a.push(await P(e, r));
			let o = m(await N("/api/generate", {
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
				client_id: S()
			}, r), "Comfy 编辑");
			return e.editUpscale ? j(o[0], Number(e.editUpscaleRes || 2048), r) : o;
		}
		return h(await N("/api/generate", o, r));
	}, j = async (e, t, n) => {
		let r = v(e);
		if (!r) throw Error("Comfy 超分辨率缺少输入图片");
		let i = await P({
			kind: "image",
			name: "canvas-upscale.png",
			url: r
		}, n);
		return m(await N("/api/generate", {
			workflow_json: "upscale.json",
			params: {
				15: { image: i },
				172: {
					seed: Math.floor(Math.random() * 4294967295),
					resolution: Math.max(64, t || 2048)
				}
			},
			type: "enhance",
			client_id: S()
		}, n), "Comfy 超分辨率");
	}, M = async (e, n, r, i, a, o, s) => {
		let l = `${n.id}:${r.id}:${x("submit")}`, u = await t.submit(e, i, {
			idempotencyKey: l,
			signal: a
		}), d = String(u.task_id || u.id || ""), f = `${String(n.id || "")}:${r.id}`;
		c.set(f, T(u, {
			canvasTaskId: d,
			idempotencyKey: l
		})), o && Object.assign(o, {
			canvasTaskId: d,
			canvasTaskType: e,
			idempotencyKey: l
		}), await C(n, s);
		let p = await t.wait(e, d, { signal: a });
		if (c.set(f, T(p, {
			canvasTaskId: d,
			idempotencyKey: l
		})), p.status !== "succeeded") throw o && Object.assign(o, {
			failed: !0,
			recoveryStatus: p.status,
			recoveryError: p.error || `${e} task failed`
		}), Error(p.error || `${e} task failed`);
		return h(p.result);
	}, N = (t, r, i) => e(n, t, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(r),
		signal: i
	}), P = async (t, r) => {
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
		getNodeOptions: g,
		initialize: u,
		normalizeLtxNode: b,
		prepareVideoMedia: de,
		recoverDocument: O,
		runCommand: D,
		runNode: E,
		uploadMedia: y
	};
}
function f(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = e.connections.filter((e) => e.to === t.id).map((e) => n.get(e.from)).filter(Boolean), i = [], a = [], o = (e) => {
		e.type === "prompt" && e.text && i.push(String(e.text)), e.type === "llm" && e.outputText && i.push(String(e.outputText)), (e.type === "promptGroup" || e.type === "group") && (Array.isArray(e.items) ? e.items : []).map(String).map((e) => n.get(e)).filter(Boolean).forEach((e) => o(e)), e.type === "image" && e.url && a.push(_(e.url, e.mediaKind, e.name)), e.type === "output" && (Array.isArray(e.images) ? e.images : []).slice(-1).forEach((e) => a.push(_(v(e), y(e), "output"))), u.has(e.type) && (Array.isArray(e.generatedOutputs) ? e.generatedOutputs : []).forEach((t) => a.push(_(v(t), y(t), e.type)));
	};
	return r.forEach(o), {
		prompts: i.filter(Boolean),
		media: de(a)
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
	let n = h(e);
	if (!n.length) throw Error(`${t}未返回任何媒体`);
	return n;
}
function ee(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = e.connections.filter((e) => e.from === t.id).map((e) => n.get(e.to)).find((e) => e?.type === "output");
	return r || (r = {
		id: x("out"),
		type: "output",
		x: Number(t.x || 0) + 460,
		y: Number(t.y || 0),
		images: []
	}, e.nodes.push(r), e.connections.push({
		id: x("edge"),
		from: t.id,
		to: r.id
	})), r;
}
function te(e, t, n) {
	let r = new Set((Array.isArray(e.images) ? e.images : []).map(v)), i = t.map((e) => ({
		url: v(e),
		kind: y(e),
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
function ne(e, t) {
	e.generatedOutputs = t.map((e) => y(e) === "image" ? v(e) : {
		url: v(e),
		kind: y(e)
	}).filter((e) => typeof e == "string" ? e : e.url);
}
function h(e) {
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
		let t = v(e);
		return !!(t && !r.has(t) && r.add(t));
	});
}
function re(e, t) {
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
function ie(e) {
	let t = String(e.type || e.kind || e.input_type || "").toLowerCase();
	return t.includes("image") ? "image" : t.includes("video") ? "video" : t.includes("audio") ? "audio" : t.includes("prompt") || t.includes("text") ? "prompt" : "setting";
}
function ae(e, t, n, r, i, a = "") {
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
	if ((c === "custom" || c === "source") && g(a)) {
		let e = g(a), t = {
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
async function oe(e, t) {
	let n = e.customRatio;
	if (String(e.ratio || "") === "source" && !g(n)) {
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
	return ae(e.ratio, e.resolution, e.customSize, e.width, e.height, n);
}
function g(e) {
	let t = String(e || "").trim().match(/^(\d+(?:\.\d+)?)\s*[:x*]\s*(\d+(?:\.\d+)?)$/i);
	if (!t) return null;
	let n = Number(t[1]), r = Number(t[2]);
	return n > 0 && r > 0 ? n / r : null;
}
function se(e, t) {
	let n = t.filter((e) => e.enabled !== !1 && Array.isArray(e.image_models) && e.image_models.length > 0), r = n.find((t) => t.id === e.apiProvider) ?? n[0];
	if (!r?.id) throw Error("没有可用的图片生成平台，请先完成 API 设置");
	let i = [...new Set((r.image_models ?? []).map(String).filter(Boolean))], a = String(e.model || ""), o = i.includes(a) ? a : i[0];
	if (!o) throw Error(`图片生成平台 ${r.name || r.id} 没有可用模型`);
	return {
		providerId: String(r.id),
		model: o
	};
}
function ce(e, t, n, r) {
	let i = t.toLowerCase(), a = e === "modelscope" ? 4 : /seedream|doubao/.test(i) || e === "volcengine" ? 10 : 16;
	if (r > a) throw Error(`${t} 最多支持 ${a} 张参考图，当前连接了 ${r} 张`);
	let o = String(n || "").match(/^(\d+)x(\d+)$/i);
	if (!o) throw Error("图片尺寸无效，请选择预设尺寸或填写完整的自定义宽高");
	let s = Number(o[1]), c = Number(o[2]);
	if (s < 64 || c < 64 || s % 16 || c % 16) throw Error("图片宽高必须不小于 64，且为 16 的倍数");
	if (/gpt[^a-z0-9]*image[^a-z0-9]*2/i.test(t) && (Math.max(s, c) > 3840 || s * c > 8294400)) throw Error(`GPT-Image-2 不支持尺寸 ${n}：最长边不能超过 3840，且总像素不能超过 8294400`);
}
function le(e) {
	let t = String(e || "").trim().toLowerCase();
	return t === "low" || t === "medium" || t === "high" ? t : void 0;
}
function _(e, t, n) {
	return {
		url: String(e || ""),
		kind: b(String(t || ""), String(e || "")),
		name: String(n || "media")
	};
}
function v(e) {
	return typeof e == "string" ? e : e && typeof e == "object" ? String(e.url || "") : "";
}
function y(e) {
	return b(e && typeof e == "object" ? String(e.kind || "") : "", v(e));
}
function b(e, t) {
	return e === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(t) ? "video" : e === "audio" || /\.(mp3|wav|m4a|ogg)(\?|$)/i.test(t) ? "audio" : "image";
}
function ue(e) {
	let t = Number.isFinite(Number(e.min)) ? Number(e.min) : 0, n = Number.isFinite(Number(e.max)) ? Number(e.max) : Math.max(t + 1, 1e6), r = Math.max(Number(e.step) || 1, 2 ** -52), i = Math.max(0, Math.floor((n - t) / r)), a = t + Math.floor(Math.random() * (i + 1)) * r;
	return Number(a.toFixed(Math.min(12, Math.max(0, String(r).split(".")[1]?.length || 0))));
}
function de(e) {
	let t = /* @__PURE__ */ new Set();
	return e.filter((e) => !!(e.url && !t.has(e.url) && t.add(e.url)));
}
function fe(e, t) {
	return String((e.uploadedMediaUrls ?? {})[t] || t);
}
function x(e) {
	return `${e}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}
function S() {
	try {
		return typeof sessionStorage > "u" ? "canvas-modern" : sessionStorage.getItem("canvasClientId") || "canvas-modern";
	} catch {
		return "canvas-modern";
	}
}
async function C(e, t) {
	t && await t(structuredClone(e));
}
async function pe(t, n, r) {
	try {
		return await e(t, n);
	} catch {
		return r;
	}
}
function w(e, t) {
	e.logs = [...Array.isArray(e.logs) ? e.logs : [], t].slice(-500);
}
function T(e, t = {}) {
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
function E() {
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
function D(e, t) {
	if (t.type === "queue") {
		if ([
			"idle",
			"done",
			"failed",
			"stopped"
		].includes(e.status) || A(e, t), !t.targetId || !t.order.length) throw Error("Execution queue requires a target and order");
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
	if (t.type === "start") return e.status !== "queued" && A(e, t), {
		...e,
		status: "running"
	};
	if (t.type === "request-stop") return e.status === "stopping" ? e : (e.status !== "running" && A(e, t), {
		...e,
		status: "stopping"
	});
	if (t.type === "node-start") {
		if (e.mode === "parallel") return O(e, t);
		(e.status !== "running" || e.currentNodeId) && A(e, t);
		let n = e.completedNodeIds.length === e.order.length ? [] : e.completedNodeIds, r = e.order[n.length];
		if (t.nodeId !== r) throw Error(`Expected execution node ${r || "<none>"}`);
		return {
			...e,
			completedNodeIds: n,
			currentNodeId: t.nodeId
		};
	}
	if (t.type === "node-done") {
		if (e.mode === "parallel") return O(e, t);
		(!["running", "stopping"].includes(e.status) || e.currentNodeId !== t.nodeId) && A(e, t);
		let n = [...e.completedNodeIds, t.nodeId];
		return {
			...e,
			completedNodeIds: n,
			completedRounds: e.completedRounds + +(n.length === e.order.length),
			currentNodeId: ""
		};
	}
	return e.status !== "running" && e.status !== "stopping" && A(e, t), e.status === "stopping" && t.status === "done" && A(e, t), {
		...e,
		error: t.error || "",
		status: t.status
	};
}
function O(e, t) {
	t.roundId || A(e, t);
	let n = e.rounds[t.roundId] ?? {
		completedNodeIds: [],
		currentNodeId: ""
	};
	if (t.type === "node-start") {
		e.status !== "running" && A(e, t), n.currentNodeId && A(e, t);
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
	["running", "stopping"].includes(e.status) || A(e, t), n.currentNodeId !== t.nodeId && A(e, t);
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
async function k(e, t, n, r = {}) {
	let { mode: i = "serial", onTransition: a, signal: o } = r, s = j(E(), {
		type: "queue",
		targetId: e,
		order: [...t],
		mode: i
	}, a);
	s = j(s, { type: "start" }, a);
	let c = () => (s.status === "running" && (s = j(s, { type: "request-stop" }, a)), j(s, {
		type: "finish",
		status: "stopped"
	}, a));
	for (let e of t) {
		if (o?.aborted) return c();
		s = j(s, {
			type: "node-start",
			nodeId: e
		}, a);
		try {
			await n(e, o);
		} catch (e) {
			return o?.aborted ? c() : j(s, {
				type: "finish",
				status: "failed",
				error: e instanceof Error ? e.message : String(e)
			}, a);
		}
		if (o?.aborted) return s = j(s, { type: "request-stop" }, a), s = j(s, {
			type: "node-done",
			nodeId: e
		}, a), c();
		s = j(s, {
			type: "node-done",
			nodeId: e
		}, a);
	}
	return j(s, {
		type: "finish",
		status: "done"
	}, a);
}
async function me(e, t, n, r, i = {}) {
	let { onTransition: a, signal: o } = i, s = n.map((e, t) => ({
		id: i.roundId?.(e, t) || String(t + 1),
		round: e
	}));
	if (new Set(s.map(({ id: e }) => e)).size !== s.length) throw Error("Parallel execution round IDs must be unique");
	let c = j(E(), {
		type: "queue",
		targetId: e,
		order: [...t],
		mode: "parallel"
	}, a);
	c = j(c, { type: "start" }, a);
	let l = null, u = 0, d = () => {
		c.status === "running" && (c = j(c, { type: "request-stop" }, a));
	}, f = Math.max(1, Math.min(Math.floor(i.limit || 1), s.length || 1)), p = Array.from({ length: f }, async () => {
		for (; !l && !o?.aborted && u < s.length;) {
			let { id: e, round: n } = s[u++];
			for (let i of t) {
				if (l || o?.aborted) break;
				c = j(c, {
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
				o?.aborted && d(), c = j(c, {
					type: "node-done",
					nodeId: i,
					roundId: e
				}, a);
			}
		}
	});
	return await Promise.all(p), o?.aborted ? (d(), j(c, {
		type: "finish",
		status: "stopped"
	}, a)) : l ? j(c, {
		type: "finish",
		status: "failed",
		error: l instanceof Error ? l.message : String(l)
	}, a) : j(c, {
		type: "finish",
		status: "done"
	}, a);
}
function A(e, t) {
	throw Error(`Invalid execution transition: ${e.status} -> ${t.type}`);
}
function j(e, t, n) {
	let r = D(e, t);
	return n?.(r, t), r;
}
//#endregion
//#region src/canvas/infrastructure/task-client.ts
var M = {
	image: "/api/canvas-image-tasks",
	video: "/api/canvas-video-tasks"
};
function N(n = fetch) {
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
				let t = await e(n, M[r], {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(d)
				}, s);
				return P(t), t;
			} catch (e) {
				if (!(e instanceof t) || !e.retryable || o++ >= i) throw e;
				a.submissionRetries += 1;
			}
		})().finally(() => {
			l && i.delete(l);
		});
		return l && i.set(l, f), f;
	}, s = (t, r, i) => r ? e(n, `${M[t]}/${encodeURIComponent(r)}`, {}, i) : Promise.reject(/* @__PURE__ */ TypeError("Task ID is required")), c = async (e, n, r = {}) => {
		let { intervalMs: i = e === "video" ? 2500 : 1800, maxPollErrors: o = 3, requestTimeoutMs: c = 3e4 } = r, l = Date.now(), u = 0;
		for (;;) {
			he(r.signal, l, r.timeoutMs);
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
			await ge(i, r.signal, l, r.timeoutMs);
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
function P(e) {
	let n = String(e.task_id || e.id || "");
	if (!n) throw new t("Task response did not include an ID", "validation", 200, e);
	return n;
}
function he(e, n, r = 0) {
	if (e?.aborted) throw new t("Task polling aborted", "aborted");
	if (r > 0 && Date.now() - n >= r) throw new t("Task polling timed out", "timeout");
}
function ge(e, n, r, i = 0) {
	he(n, r, i);
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
var F = new URLSearchParams(window.location.search), _e = "__CanvasBootstrapRolloutPolicy" in window ? window.__CanvasBootstrapRolloutPolicy ?? null : await i(), I = r(window.location.search, window.localStorage, window.sessionStorage.getItem("canvasClientId") || window.location.pathname, _e);
n("rollout-decision", { dimensions: {
	mode: I.enabled ? "enabled" : "disabled",
	reason: I.blockedReasons[0] || (I.policyLoaded ? "none" : "policy-unavailable"),
	source: I.source
} });
var L = F.get("canvas_modern_core"), R = L === "execution-shadow", ve = L === "graph-order", z = L === "shadow", B = F.get("canvas_m2") === "1" || F.get("canvas_m2") === null && I.enabled, V = B || F.get("canvas_execution_engine") === "1", H = B || F.get("canvas_task_client") === "1", U = B || F.get("canvas_repository") === "1", W = V && H && U, G = F.get("canvas_react_islands") === "1", ye = G || F.get("canvas_react_activity") === "1", be = G || F.get("canvas_react_execution") === "1", xe = G || F.get("canvas_react_status") === "1", Se = G || F.get("canvas_react_toolbar") === "1", Ce = F.get("canvas_board_v2") === "1" || F.get("canvas_board_v2") === null && I.enabled, K = N(), q = d(K);
await q.initialize();
var J = s(), Y = /* @__PURE__ */ new Map(), we = 0, X = 0, Z = [], Te = 0, Q = 0, Ee = /* @__PURE__ */ new Map(), $ = {
	done: 0,
	failed: 0,
	stopped: 0
}, De = 0;
function Oe(e, t, n) {
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
	canvasRepository: J,
	canvasRepositoryEnabled: U,
	canvasRuntime: q,
	executionEngineEnabled: V,
	m2Enabled: W,
	taskClient: K,
	taskClientEnabled: H,
	activeOrder(e, t) {
		if (!ve) return null;
		try {
			let n = window.CanvasLegacyBridge?.getDocumentSnapshot();
			if (!n) return null;
			let r = o(a(n));
			return e === "cascade" ? r.cascadeOrder(t) : r.retryCascadeOrder(t);
		} catch (e) {
			return console.warn("[canvas-modern-core] active graph order failed; using legacy order", e), null;
		}
	},
	compareOrder: Oe,
	recordRolloutEvent(e, t) {
		n(e, {
			...t,
			dimensions: {
				...t?.dimensions,
				mode: W ? "enabled" : "disabled",
				source: I.source
			}
		});
	},
	runOrdered(e) {
		return V ? k(e.targetId, e.order, e.execute, {
			mode: e.mode,
			signal: e.signal,
			onTransition: ke
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	runParallel(e) {
		return V ? me(e.targetId, e.order, e.rounds, e.execute, {
			limit: e.limit,
			roundId: e.roundId,
			signal: e.signal,
			onTransition: ke
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	observeExecution(e) {
		if (R) try {
			let t = Y.get(e.targetId) ?? E();
			e.phase === "begin" ? (t = D(t, {
				type: "queue",
				targetId: e.targetId,
				order: e.order,
				mode: e.mode
			}), t = D(t, { type: "start" })) : t = e.phase === "node-start" ? D(t, {
				type: "node-start",
				nodeId: e.nodeId,
				roundId: e.roundId
			}) : e.phase === "node-done" ? D(t, {
				type: "node-done",
				nodeId: e.nodeId,
				roundId: e.roundId
			}) : e.phase === "stop" ? D(t, { type: "request-stop" }) : D(t, {
				type: "finish",
				status: e.status,
				error: e.error
			}), Y.set(e.targetId, t), we += 1;
		} catch (t) {
			X += 1, console.warn("[canvas-modern-core] execution shadow transition failed", t, e);
		}
	},
	observeOrder(e, t, n) {
		if (z) try {
			let r = Oe(e, t, n);
			if (!r) return;
			Te += 1, r.matches || (Z.length < 50 && Z.push(r), console.warn("[canvas-modern-core] graph order mismatch", r));
		} catch (e) {
			Q += 1, console.warn("[canvas-modern-core] graph shadow check failed", e);
		}
	},
	getShadowReport() {
		return {
			enabled: z,
			checks: Te,
			errors: Q,
			mismatches: Z.map((e) => ({
				...e,
				legacy: [...e.legacy],
				modern: [...e.modern]
			}))
		};
	},
	getExecutionShadowReport() {
		return {
			enabled: R,
			errors: X,
			events: we,
			runs: [...Y.values()].map((e) => ({
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
			enabled: W,
			rollout: I,
			execution: {
				active: [...Ee.values()].filter(({ status: e }) => ![
					"done",
					"failed",
					"stopped"
				].includes(e)).length,
				...$,
				transitions: De
			},
			flags: {
				executionEngine: V,
				repository: U,
				taskClient: H
			},
			repository: J.getDiagnostics(),
			tasks: K.getDiagnostics()
		};
	},
	mergeConflict(e, t, n) {
		return c(e, t, n);
	}
}), be) {
	let e = document.getElementById("canvasExecutionIsland");
	e && import("./react-execution-entry-BmZkM1-g.js").then(({ mountReactExecutionIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React execution island failed to load", e));
}
if (xe) {
	let e = document.getElementById("canvasStatusIsland");
	e && import("./react-execution-entry-BmZkM1-g.js").then(({ mountReactStatusIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React status island failed to load", e));
}
if (Se) {
	let e = document.getElementById("canvasToolbarIsland");
	e && import("./react-execution-entry-BmZkM1-g.js").then(({ mountReactToolbarIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React toolbar island failed to load", e));
}
if (ye) {
	let e = document.getElementById("canvasActivityIsland");
	e && import("./react-execution-entry-BmZkM1-g.js").then(({ mountReactActivityIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React activity island failed to load", e));
}
if (Ce && !I.enabled) {
	let e = document.getElementById("canvasBoardV2"), t = document.getElementById("board");
	e && t && import("./canvas-board-v2-5lGjMv6z.js").then(({ mountCanvasBoardV2: n }) => {
		let r = n(e, t);
		window.CanvasModernCore?.recordRolloutEvent("board-mounted", { dimensions: { reason: "none" } }), window.addEventListener("pagehide", r, { once: !0 });
	}).catch((e) => {
		window.CanvasModernCore?.recordRolloutEvent("board-mount-failed", { dimensions: { reason: e instanceof Error && e.message.includes("dependencies") ? "dependency-unavailable" : "import-failed" } }), console.warn("[canvas-modern-core] CanvasBoard V2 failed to load; using Legacy Board", e);
	});
}
if (I.enabled) {
	let e = document.getElementById("canvasModernApp"), t = document.getElementById("shell");
	e && (t && (t.hidden = !0), e.hidden = !1, import("./canvas-app-v2-DapZIHFF.js").then(({ mountCanvasAppV2: t }) => {
		let n = t(e, {
			runtime: q,
			repository: J
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
function ke(e, t) {
	De += 1, Ee.set(e.targetId, e), t.type === "finish" && ($[t.status] += 1, window.CanvasModernCore?.recordRolloutEvent(t.status === "done" ? "execution-succeeded" : t.status === "failed" ? "execution-failed" : "execution-stopped", { dimensions: { reason: t.status === "failed" ? "execution-failed" : t.status === "stopped" ? "execution-stopped" : "none" } })), window.dispatchEvent(new CustomEvent("canvas-modern-execution", { detail: {
		event: t,
		state: e
	} }));
}
document.documentElement.dataset.canvasModernCore = "30", document.documentElement.dataset.canvasBoardV2 = Ce ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionEngine = V ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionShadow = R ? "enabled" : "disabled", document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? "ready" : "missing", document.documentElement.dataset.canvasModernGraphOrder = ve ? "enabled" : "disabled", document.documentElement.dataset.canvasModernM2 = W ? "enabled" : "disabled", document.documentElement.dataset.canvasModernRepository = U ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactActivity = ye ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactExecution = be ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactIslands = G ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactStatus = xe ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactToolbar = Se ? "enabled" : "disabled", document.documentElement.dataset.canvasModernShadow = z ? "enabled" : "disabled", document.documentElement.dataset.canvasModernTaskClient = H ? "enabled" : "disabled", document.documentElement.dataset.canvasV2Rollout = I.enabled ? "enabled" : "disabled", document.documentElement.dataset.canvasV2RolloutBucket = String(I.bucket), document.documentElement.dataset.canvasV2RolloutBlocked = I.blockedReasons.join(",") || "none", document.documentElement.dataset.canvasV2RolloutPercentage = String(I.percentage), document.documentElement.dataset.canvasV2RolloutPolicy = I.policyLoaded ? "loaded" : "fallback", window.addEventListener("pagehide", () => {
	let e = J.getDiagnostics(), t = K.getDiagnostics();
	n("page-summary", {
		counters: {
			execution_errors: X,
			execution_failed: $.failed,
			execution_runs: $.done + $.failed + $.stopped,
			repository_conflicts: e.conflicts,
			repository_errors: e.errors,
			repository_saves: e.saves,
			shadow_errors: Q,
			task_poll_errors: t.pollErrors,
			task_polls: t.polls,
			task_recoveries: t.recoveredTasks,
			task_resumed: t.resumedTasks,
			task_submissions: t.submissions
		},
		dimensions: {
			mode: W ? "enabled" : "disabled",
			reason: "none",
			source: I.source
		}
	});
}, { once: !0 }), window.dispatchEvent(new CustomEvent("canvas-modern-core-ready"));
//#endregion
