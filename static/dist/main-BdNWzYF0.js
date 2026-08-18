import { n as e, t } from "./http-F-lX8WKW.js";
import { n, r, t as i } from "./rollout-BcgAkMGv.js";
import { n as a, t as o } from "./graph-j9GyzERh.js";
import { i as s, t as c } from "./document-merge-cCXbjNpR.js";
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
	let r = {}, i = [], a = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), c = async () => {
		let [e, t] = await Promise.all([w(n, "/api/config", {}), w(n, "/api/workflows", { workflows: [] })]);
		r = e, i = Array.isArray(t.workflows) ? t.workflows : [];
	}, u = async (t) => {
		let r = String(t || "").trim();
		if (!r) return [];
		let i = a.get(r);
		return i || (i = await e(n, `/api/workflows/${encodeURIComponent(r)}`), a.set(r, i)), structuredClone(i.config?.fields ?? []);
	}, d = (e, t, n = {
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
		return Array.isArray(n) && n.length > 0;
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
	}, ie = async (t, r, i, a = "") => {
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
			let o = String(a.canvasTaskId || ""), s = a.canvasTaskType === "video" ? "video" : a.canvasTaskType === "image" ? "image" : null;
			!o || !s || (a.recoveryStatus = "recovering", i.push(t.watch(s, o).then(async (t) => {
				let i = r.nodes.find((e) => e.id === String(a.nodeId || ""));
				if (t.status === "succeeded") {
					let n = g(t.result);
					i && (h(i, n), i.runStatus = "done", i.runError = ""), n.length && m(e, n), e._pending = e._pending.filter((e) => e.id !== a.id), T(r, {
						id: x("log"),
						nodeId: i?.id || a.nodeId,
						nodeType: i?.type || a.type,
						recovered: !0,
						status: "done",
						outputs: n.map(v)
					});
				} else a.recoveryStatus = t.status, a.recoveryError = t.error || `任务状态：${t.status}`, i && (i.runStatus = "failed", i.runError = String(a.recoveryError));
				await C(r, n);
			}).catch(async (e) => {
				a.recoveryStatus = "interrupted", a.recoveryError = e instanceof Error ? e.message : String(e), await C(r, n);
			})));
		}
		return i.length && (await C(r, n), await Promise.all(i)), r;
	}, k = async (e, t, n, r, i) => {
		let a = e.nodes.find((e) => e.id === t);
		if (!a || !l.has(a.type)) throw Error(`不支持执行节点：${a?.type || t}`);
		a.running = !0, a.runStatus = "running", a.runError = "", await C(e, i);
		let o = f(e, a), s = null, c = null, u = [], d = Date.now();
		try {
			a.type !== "llm" && (c = p(e, a), s = {
				id: x("pending"),
				startedAt: Date.now(),
				nodeId: t,
				type: a.type
			}, c._pending = [...Array.isArray(c._pending) ? c._pending : [], s], await C(e, i)), u = await oe(e, a, o, n, r, s, i), u.length && (h(a, u), c && m(c, u, o.media[0])), a.runStatus = "done", a.runError = "", T(e, {
				id: x("log"),
				nodeId: t,
				nodeType: a.type,
				status: "done",
				startedAt: d,
				finishedAt: Date.now(),
				outputs: u.map(v)
			});
		} catch (n) {
			throw a.runStatus = "failed", a.runError = n instanceof Error ? n.message : String(n), T(e, {
				id: x("log"),
				nodeId: t,
				nodeType: a.type,
				status: "failed",
				startedAt: d,
				finishedAt: Date.now(),
				error: a.runError
			}), n;
		} finally {
			a.running = !1, c && s && (c._pending = (Array.isArray(c._pending) ? c._pending : []).filter((e) => e.id !== s?.id)), await C(e, i);
		}
	}, oe = async (e, t, n, r, i, a, o) => {
		let s = n.prompts.join("\n\n").trim() || String(t.userInput || t.globalPrompt || "");
		if (t.type === "llm") {
			let e = r ? String(t.chatInput || s) : s;
			if (!e) throw Error("LLM 缺少提示词输入");
			let a = Array.isArray(t.messages) ? t.messages : [], o = await M("/api/canvas-llm", {
				message: e,
				model: t.model || t.llmMsModel || "",
				ms_model: t.llmProvider === "modelscope" && (t.model || t.llmMsModel) || "",
				provider: t.llmProvider || "",
				system_prompt: t.systemPrompt || "You are a helpful assistant.",
				messages: a,
				images: n.media.filter((e) => e.kind === "image"),
				videos: n.media.filter((e) => e.kind === "video")
			}, i);
			return t.outputText = o.text || "", r && (t.messages = [
				...a,
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
		if (!s && t.type !== "comfy") throw Error("缺少提示词输入");
		if (t.type === "video") {
			let r = {
				prompt: s,
				provider_id: t.apiProvider || "",
				model: t.model || "veo3-fast",
				duration: Number(t.duration || 5),
				aspect_ratio: t.aspectRatio || "16:9",
				resolution: t.resolution || "",
				images: n.media.filter((e) => e.kind === "image"),
				videos: [String(t.manualVideoUrl || ""), ...n.media.filter((e) => e.kind === "video").map((e) => ae(t, e.url))].filter(Boolean),
				audios: n.media.filter((e) => e.kind === "audio").map((e) => ae(t, e.url)),
				enhance_prompt: !!t.enhancePrompt,
				enable_upsample: !!t.enableUpsample,
				watermark: !!t.watermark,
				camerafixed: !!t.cameraFixed,
				generate_audio: !!t.generateAudio,
				multimodal: !!t.multimodal,
				task_mode: t.taskMode || "auto"
			};
			return j("video", e, t, r, i, a, o);
		}
		if (t.type === "generator") {
			let r = {
				prompt: s,
				provider_id: t.apiProvider || "",
				model: t.model || "",
				size: ne(t.ratio, t.resolution, t.customSize, t.width, t.height),
				reference_images: n.media.filter((e) => e.kind === "image"),
				quality: t.quality || void 0,
				n: Math.max(1, Math.min(8, Number(t.count || 1)))
			};
			return j("image", e, t, r, i, a, o);
		}
		if (t.type === "msgen") {
			let e = String(t.msgenModel || "zimage"), r = ne(t.msRatio, t.msResolution, t.msCustomSize, t.msWidth, t.msHeight), a = e === "qwen_edit" ? "/api/angle/generate" : "/generate", o = {
				prompt: s,
				resolution: r,
				client_id: S()
			};
			e !== "zimage" && (o.image_urls = n.media.filter((e) => e.kind === "image").map((e) => e.url)), e === "custom" && (o.model = t.msCustomModel || ""), t.msLoraEnabled && t.msLoraId && (o.loras = { [String(t.msLoraId)]: Number(t.msLoraStrength ?? .8) });
			let c = Math.max(1, Math.min(8, Number(t.count || 1)));
			return (await Promise.all(Array.from({ length: c }, () => M(a, o, i)))).flatMap(g);
		}
		if (t.type === "ltxDirector") {
			let e = b(t);
			Object.assign(t, e);
			let n = ee(t, s), r = JSON.parse(String(n.timeline_data || "{}"));
			for (let e of r.segments ?? []) e.type !== "image" || e.imageFile || !e.imageB64 || (e.imageFile = await N({
				kind: "image",
				name: `ltx-${String(e.id || "segment")}.png`,
				url: String(e.imageB64)
			}, i), delete e.imgObj);
			n.timeline_data = JSON.stringify(r), t.ltxTimelineData = n.timeline_data, t.ltxLocalPrompts = n.local_prompts, t.ltxSegmentLengths = n.segment_lengths, t.ltxGuideStrength = n.guide_strength;
			let a = {
				46: n,
				"94:28": { noise_seed: Number(t.noiseSeed ?? 12) }
			};
			return g(await M("/api/generate", {
				prompt: s,
				workflow_json: "LTXDirectorv2-API.json",
				params: a,
				type: "ltx-director",
				client_id: S()
			}, i));
		}
		return A(t, n, s, i);
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
		else if (a === "custom") {
			let a = String(e.comfyWorkflow || i[0]?.name || ""), s = await u(a), c = {}, l = new Map([
				"image",
				"video",
				"audio"
			].map((e) => [e, t.media.filter((t) => t.kind === e)])), d = /* @__PURE__ */ new Map();
			for (let t of s) {
				let i = String(t.node || ""), a = String(t.input || "");
				if (!i || !a) continue;
				c[i] ??= {};
				let o = te(t);
				if (o === "prompt") c[i][a] = n;
				else if ([
					"image",
					"video",
					"audio"
				].includes(o)) {
					let e = d.get(o) ?? 0, t = l.get(o)?.[e];
					d.set(o, e + 1), c[i][a] = t ? await N(t, r) : "";
				} else {
					let n = String(t.id || ""), r = (e.comfyParams ?? {})[n] ?? t.default, o = (e.comfyRandomActive ?? {})[n] !== !1;
					c[i][a] = t.random_enabled && o ? re(t) : r;
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
			let e = t.media.find((e) => e.kind === "image");
			o = {
				prompt: n,
				workflow_json: "Flux2-Klein.json",
				type: "klein",
				params: {
					168: { text: n },
					158: { noise_seed: Math.floor(Math.random() * 1e6) },
					278: { image: e ? await N(e, r) : "" }
				},
				client_id: S()
			};
		}
		return g(await M("/api/generate", o, r));
	}, j = async (e, n, r, i, a, o, s) => {
		let c = await t.submit(e, i, {
			idempotencyKey: `${n.id}:${r.id}:${x("submit")}`,
			signal: a
		}), l = String(c.task_id || c.id || "");
		o && Object.assign(o, {
			canvasTaskId: l,
			canvasTaskType: e
		}), await C(n, s);
		let u = await t.wait(e, l, { signal: a });
		if (u.status !== "succeeded") throw Error(u.error || `${e} task failed`);
		return g(u.result);
	}, M = (t, r, i) => e(n, t, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(r),
		signal: i
	}), N = async (t, r) => {
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
		getComfyFields: u,
		getNodeOptions: d,
		initialize: c,
		normalizeLtxNode: b,
		prepareVideoMedia: ie,
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
		media: ie(a)
	};
}
function p(e, t) {
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
function m(e, t, n) {
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
function h(e, t) {
	e.generatedOutputs = t.map((e) => y(e) === "image" ? v(e) : {
		url: v(e),
		kind: y(e)
	}).filter((e) => typeof e == "string" ? e : e.url);
}
function g(e) {
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
function ee(e, t) {
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
function te(e) {
	let t = String(e.type || e.kind || e.input_type || "").toLowerCase();
	return t.includes("image") ? "image" : t.includes("video") ? "video" : t.includes("audio") ? "audio" : t.includes("prompt") || t.includes("text") ? "prompt" : "setting";
}
function ne(e, t, n, r, i) {
	if (n) return String(n);
	if (Number(r) > 0 && Number(i) > 0) return `${Number(r)}x${Number(i)}`;
	let a = String(t || "1k").toLowerCase() === "2k" ? 2048 : 1024, o = String(e || "square");
	return o === "landscape" || o === "16:9" ? `${a}x${Math.round(a * 9 / 16)}` : o === "portrait" || o === "9:16" ? `${Math.round(a * 9 / 16)}x${a}` : `${a}x${a}`;
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
function re(e) {
	let t = Number.isFinite(Number(e.min)) ? Number(e.min) : 0, n = Number.isFinite(Number(e.max)) ? Number(e.max) : Math.max(t + 1, 1e6), r = Math.max(Number(e.step) || 1, 2 ** -52), i = Math.max(0, Math.floor((n - t) / r)), a = t + Math.floor(Math.random() * (i + 1)) * r;
	return Number(a.toFixed(Math.min(12, Math.max(0, String(r).split(".")[1]?.length || 0))));
}
function ie(e) {
	let t = /* @__PURE__ */ new Set();
	return e.filter((e) => !!(e.url && !t.has(e.url) && t.add(e.url)));
}
function ae(e, t) {
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
async function w(t, n, r) {
	try {
		return await e(t, n);
	} catch {
		return r;
	}
}
function T(e, t) {
	e.logs = [...Array.isArray(e.logs) ? e.logs : [], t].slice(-500);
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
async function oe(e, t, n, r, i = {}) {
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
				return se(t), t;
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
			P(r.signal, l, r.timeoutMs);
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
function se(e) {
	let n = String(e.task_id || e.id || "");
	if (!n) throw new t("Task response did not include an ID", "validation", 200, e);
	return n;
}
function P(e, n, r = 0) {
	if (e?.aborted) throw new t("Task polling aborted", "aborted");
	if (r > 0 && Date.now() - n >= r) throw new t("Task polling timed out", "timeout");
}
function ce(e, n, r, i = 0) {
	P(n, r, i);
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
var F = new URLSearchParams(window.location.search), le = "__CanvasBootstrapRolloutPolicy" in window ? window.__CanvasBootstrapRolloutPolicy ?? null : await i(), I = r(window.location.search, window.localStorage, window.sessionStorage.getItem("canvasClientId") || window.location.pathname, le);
n("rollout-decision", { dimensions: {
	mode: I.enabled ? "enabled" : "disabled",
	reason: I.blockedReasons[0] || (I.policyLoaded ? "none" : "policy-unavailable"),
	source: I.source
} });
var L = F.get("canvas_modern_core"), R = L === "execution-shadow", ue = L === "graph-order", z = L === "shadow", B = F.get("canvas_m2") === "1" || F.get("canvas_m2") === null && I.enabled, V = B || F.get("canvas_execution_engine") === "1", H = B || F.get("canvas_task_client") === "1", U = B || F.get("canvas_repository") === "1", W = V && H && U, G = F.get("canvas_react_islands") === "1", K = G || F.get("canvas_react_activity") === "1", de = G || F.get("canvas_react_execution") === "1", fe = G || F.get("canvas_react_status") === "1", pe = G || F.get("canvas_react_toolbar") === "1", me = F.get("canvas_board_v2") === "1" || F.get("canvas_board_v2") === null && I.enabled, q = N(), J = d(q);
await J.initialize();
var Y = s(), X = /* @__PURE__ */ new Map(), he = 0, Z = 0, Q = [], ge = 0, $ = 0, _e = /* @__PURE__ */ new Map(), ve = {
	done: 0,
	failed: 0,
	stopped: 0
}, ye = 0;
function be(e, t, n) {
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
	version: 29,
	canvasRepository: Y,
	canvasRepositoryEnabled: U,
	canvasRuntime: J,
	executionEngineEnabled: V,
	m2Enabled: W,
	taskClient: q,
	taskClientEnabled: H,
	activeOrder(e, t) {
		if (!ue) return null;
		try {
			let n = window.CanvasLegacyBridge?.getDocumentSnapshot();
			if (!n) return null;
			let r = o(a(n));
			return e === "cascade" ? r.cascadeOrder(t) : r.retryCascadeOrder(t);
		} catch (e) {
			return console.warn("[canvas-modern-core] active graph order failed; using legacy order", e), null;
		}
	},
	compareOrder: be,
	recordRolloutEvent(e, t) {
		n(e, t);
	},
	runOrdered(e) {
		return V ? k(e.targetId, e.order, e.execute, {
			mode: e.mode,
			signal: e.signal,
			onTransition: xe
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	runParallel(e) {
		return V ? oe(e.targetId, e.order, e.rounds, e.execute, {
			limit: e.limit,
			roundId: e.roundId,
			signal: e.signal,
			onTransition: xe
		}) : Promise.reject(/* @__PURE__ */ Error("Modern execution engine is disabled"));
	},
	observeExecution(e) {
		if (R) try {
			let t = X.get(e.targetId) ?? E();
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
			}), X.set(e.targetId, t), he += 1;
		} catch (t) {
			Z += 1, console.warn("[canvas-modern-core] execution shadow transition failed", t, e);
		}
	},
	observeOrder(e, t, n) {
		if (z) try {
			let r = be(e, t, n);
			if (!r) return;
			ge += 1, r.matches || (Q.length < 50 && Q.push(r), console.warn("[canvas-modern-core] graph order mismatch", r));
		} catch (e) {
			$ += 1, console.warn("[canvas-modern-core] graph shadow check failed", e);
		}
	},
	getShadowReport() {
		return {
			enabled: z,
			checks: ge,
			errors: $,
			mismatches: Q.map((e) => ({
				...e,
				legacy: [...e.legacy],
				modern: [...e.modern]
			}))
		};
	},
	getExecutionShadowReport() {
		return {
			enabled: R,
			errors: Z,
			events: he,
			runs: [...X.values()].map((e) => ({
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
				active: [..._e.values()].filter(({ status: e }) => ![
					"done",
					"failed",
					"stopped"
				].includes(e)).length,
				...ve,
				transitions: ye
			},
			flags: {
				executionEngine: V,
				repository: U,
				taskClient: H
			},
			repository: Y.getDiagnostics(),
			tasks: q.getDiagnostics()
		};
	},
	mergeConflict(e, t, n) {
		return c(e, t, n);
	}
}), de) {
	let e = document.getElementById("canvasExecutionIsland");
	e && import("./react-execution-entry-BvXNr52W.js").then(({ mountReactExecutionIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React execution island failed to load", e));
}
if (fe) {
	let e = document.getElementById("canvasStatusIsland");
	e && import("./react-execution-entry-BvXNr52W.js").then(({ mountReactStatusIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React status island failed to load", e));
}
if (pe) {
	let e = document.getElementById("canvasToolbarIsland");
	e && import("./react-execution-entry-BvXNr52W.js").then(({ mountReactToolbarIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React toolbar island failed to load", e));
}
if (K) {
	let e = document.getElementById("canvasActivityIsland");
	e && import("./react-execution-entry-BvXNr52W.js").then(({ mountReactActivityIsland: t }) => {
		let n = t(e);
		window.addEventListener("pagehide", n, { once: !0 });
	}).catch((e) => console.warn("[canvas-modern-core] React activity island failed to load", e));
}
if (me && !I.enabled) {
	let e = document.getElementById("canvasBoardV2"), t = document.getElementById("board");
	e && t && import("./canvas-board-v2-C3g8ymB3.js").then(({ mountCanvasBoardV2: n }) => {
		let r = n(e, t);
		window.CanvasModernCore?.recordRolloutEvent("board-mounted", { dimensions: { reason: "none" } }), window.addEventListener("pagehide", r, { once: !0 });
	}).catch((e) => {
		window.CanvasModernCore?.recordRolloutEvent("board-mount-failed", { dimensions: { reason: e instanceof Error && e.message.includes("dependencies") ? "dependency-unavailable" : "import-failed" } }), console.warn("[canvas-modern-core] CanvasBoard V2 failed to load; using Legacy Board", e);
	});
}
if (I.enabled) {
	let e = document.getElementById("canvasModernApp"), t = document.getElementById("shell");
	e && (t && (t.hidden = !0), e.hidden = !1, import("./canvas-app-v2-DcmDRYvH.js").then(({ mountCanvasAppV2: t }) => {
		let n = t(e, {
			runtime: J,
			repository: Y
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
function xe(e, t) {
	ye += 1, _e.set(e.targetId, e), t.type === "finish" && (ve[t.status] += 1), window.dispatchEvent(new CustomEvent("canvas-modern-execution", { detail: {
		event: t,
		state: e
	} }));
}
document.documentElement.dataset.canvasModernCore = "29", document.documentElement.dataset.canvasBoardV2 = me ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionEngine = V ? "enabled" : "disabled", document.documentElement.dataset.canvasModernExecutionShadow = R ? "enabled" : "disabled", document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? "ready" : "missing", document.documentElement.dataset.canvasModernGraphOrder = ue ? "enabled" : "disabled", document.documentElement.dataset.canvasModernM2 = W ? "enabled" : "disabled", document.documentElement.dataset.canvasModernRepository = U ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactActivity = K ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactExecution = de ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactIslands = G ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactStatus = fe ? "enabled" : "disabled", document.documentElement.dataset.canvasModernReactToolbar = pe ? "enabled" : "disabled", document.documentElement.dataset.canvasModernShadow = z ? "enabled" : "disabled", document.documentElement.dataset.canvasModernTaskClient = H ? "enabled" : "disabled", document.documentElement.dataset.canvasV2Rollout = I.enabled ? "enabled" : "disabled", document.documentElement.dataset.canvasV2RolloutBucket = String(I.bucket), document.documentElement.dataset.canvasV2RolloutBlocked = I.blockedReasons.join(",") || "none", document.documentElement.dataset.canvasV2RolloutPercentage = String(I.percentage), document.documentElement.dataset.canvasV2RolloutPolicy = I.policyLoaded ? "loaded" : "fallback", window.addEventListener("pagehide", () => {
	let e = Y.getDiagnostics(), t = q.getDiagnostics();
	n("page-summary", {
		counters: {
			execution_errors: Z,
			repository_conflicts: e.conflicts,
			repository_errors: e.errors,
			shadow_errors: $,
			task_poll_errors: t.pollErrors,
			task_recoveries: t.recoveredTasks
		},
		dimensions: {
			mode: W ? "enabled" : "disabled",
			reason: "none",
			source: I.source
		}
	});
}, { once: !0 }), window.dispatchEvent(new CustomEvent("canvas-modern-core-ready"));
//#endregion
