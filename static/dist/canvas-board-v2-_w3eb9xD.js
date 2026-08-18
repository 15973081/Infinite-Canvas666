import { c as e, i as t, o as n, r, s as i, t as a } from "./jsx-runtime-Ckg77XP3.js";
import { n as o, r as s, t as c } from "./document-merge-DziDwlrU.js";
//#region src/canvas/ui/canvas-board-v2.tsx
var l = /* @__PURE__ */ e(i(), 1), u = n(), d = a(), f = {
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
function p() {
	return window.CanvasModernCore?.canvasRuntime ?? null;
}
function m(e) {
	return {
		x: Number(e.x || 0),
		y: Number(e.y || 0)
	};
}
function h(e) {
	let t = e.type === "image" ? {
		height: 336,
		width: 260
	} : e.type === "prompt" ? {
		height: 230,
		width: 310
	} : e.type === "loop" ? {
		height: e.showPrompt || e.imageInput ? 390 : 180,
		width: 336
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
function g(e) {
	return [
		"generator",
		"comfy",
		"ltxDirector",
		"output",
		"llm",
		"msgen",
		"video"
	].includes(e.type) || e.type === "loop" && (!!e.imageInput || !!e.showPrompt);
}
function _(e) {
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
		"video",
		"output"
	].includes(e.type);
}
function v({ commit: e, node: t, store: n }) {
	let r = String(t.text || "");
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "prompt-editor",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [/* @__PURE__ */ (0, d.jsxs)("div", {
			className: "prompt-toolbar",
			children: [/* @__PURE__ */ (0, d.jsx)("button", {
				className: "prompt-template-btn",
				onClick: () => window.CanvasBoardV2?.openPromptTemplates(t.id),
				type: "button",
				children: "模板"
			}), /* @__PURE__ */ (0, d.jsxs)("div", {
				className: `prompt-counter ${r.length > 2e4 ? "over" : ""}`,
				children: [/* @__PURE__ */ (0, d.jsx)("span", { children: r.length.toLocaleString() }), /* @__PURE__ */ (0, d.jsx)("span", { children: "/ 20,000" })]
			})]
		}), /* @__PURE__ */ (0, d.jsx)("textarea", {
			"data-field": "text",
			maxLength: 2e4,
			onBlur: e,
			onChange: (e) => n.getState().updateNode(t.id, { text: e.target.value }),
			placeholder: "输入提示词",
			value: r
		})]
	});
}
function y({ node: e, nodesById: t }) {
	let n = Array.isArray(e.items) ? e.items.map((e) => t.get(String(e))).filter((e) => e?.type === "prompt") : [];
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "text-[11px] text-gray-400",
		"data-prompt-count": n.length,
		children: [n.length, " 个提示词已分组"]
	});
}
function b({ commit: e, node: t, store: n }) {
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
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "loop-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "loop-count-row",
				children: [/* @__PURE__ */ (0, d.jsxs)("div", {
					className: "loop-run-row",
					children: [/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "loop-count-group",
						children: [/* @__PURE__ */ (0, d.jsx)("span", {
							className: "loop-count-label",
							children: "循环次数"
						}), /* @__PURE__ */ (0, d.jsx)("input", {
							"aria-label": "循环次数",
							className: "loop-count-input",
							max: "100",
							min: "1",
							onBlur: e,
							onChange: (e) => o({ count: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }),
							type: "number",
							value: r
						})]
					}), /* @__PURE__ */ (0, d.jsxs)("div", {
						className: "seg loop-mode",
						children: [/* @__PURE__ */ (0, d.jsx)("button", {
							className: t.mode === "parallel" ? "" : "active",
							onClick: () => o({ mode: "serial" }, !0),
							type: "button",
							children: "串行"
						}), /* @__PURE__ */ (0, d.jsx)("button", {
							className: t.mode === "parallel" ? "active" : "",
							onClick: () => o({ mode: "parallel" }, !0),
							type: "button",
							children: "并行"
						})]
					})]
				}), /* @__PURE__ */ (0, d.jsxs)("div", {
					className: "loop-toggle-row",
					children: [/* @__PURE__ */ (0, d.jsx)("button", {
						className: `loop-toggle loop-image-toggle ${t.imageInput ? "active" : ""}`,
						onClick: () => s("imageInput"),
						type: "button",
						children: "图片输入"
					}), /* @__PURE__ */ (0, d.jsx)("button", {
						className: `loop-toggle loop-prompt-toggle ${t.showPrompt ? "active" : ""}`,
						onClick: () => s("showPrompt"),
						type: "button",
						children: "提示词输入"
					})]
				})]
			}),
			t.imageInput ? /* @__PURE__ */ (0, d.jsx)("div", {
				className: "loop-image-panel",
				children: /* @__PURE__ */ (0, d.jsxs)("div", {
					className: "loop-image-row",
					children: [
						/* @__PURE__ */ (0, d.jsx)("span", {
							className: "loop-count-label",
							children: "起始"
						}),
						/* @__PURE__ */ (0, d.jsx)("input", {
							"aria-label": "图片起始序号",
							className: "loop-count-input",
							min: "1",
							onBlur: e,
							onChange: (e) => o({ loopStart: Math.max(1, Number(e.target.value) || 1) }),
							type: "number",
							value: i
						}),
						/* @__PURE__ */ (0, d.jsx)("span", {
							className: "loop-count-label",
							children: "批量"
						}),
						/* @__PURE__ */ (0, d.jsx)("input", {
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
			t.showPrompt ? /* @__PURE__ */ (0, d.jsxs)("div", {
				className: "loop-prompt-panel",
				children: [/* @__PURE__ */ (0, d.jsx)("div", {
					className: "loop-field",
					children: /* @__PURE__ */ (0, d.jsx)("textarea", {
						"aria-label": "循环变量提示词",
						onBlur: e,
						onChange: (e) => o({ variablePrompt: e.target.value }),
						placeholder: "每轮变化的提示词",
						value: String(t.variablePrompt || "")
					})
				}), /* @__PURE__ */ (0, d.jsxs)("div", {
					className: "loop-start-row",
					children: [
						/* @__PURE__ */ (0, d.jsx)("button", {
							className: "loop-token-btn loop-counter-token-btn",
							onClick: () => o({ variablePrompt: `${String(t.variablePrompt || "")}《计数》` }, !0),
							type: "button",
							children: "计数"
						}),
						/* @__PURE__ */ (0, d.jsx)("span", {
							className: "loop-count-label",
							children: "起始"
						}),
						/* @__PURE__ */ (0, d.jsx)("input", {
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
var x = [
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
], S = [
	["1k", "1K"],
	["2k", "2K"],
	["4k", "4K"],
	["custom", "自定义"]
];
function C({ ariaLabel: e, onChange: t, options: n, value: r }) {
	return /* @__PURE__ */ (0, d.jsxs)("select", {
		"aria-label": e,
		className: "select-lite",
		onChange: (e) => t(e.target.value),
		value: r,
		children: [!n.some(([e]) => e === r) && r ? /* @__PURE__ */ (0, d.jsx)("option", {
			value: r,
			children: r
		}) : null, n.map(([e, t]) => /* @__PURE__ */ (0, d.jsx)("option", {
			value: e,
			children: t
		}, e))]
	});
}
function w({ label: e = "运行", mode: t, node: n }) {
	let [r, i] = (0, l.useState)(!1);
	return /* @__PURE__ */ (0, d.jsx)("button", {
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
var T = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"video",
	"comfy",
	"llm",
	"ltxDirector"
]);
function E(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = /* @__PURE__ */ new Set(), i = e.connections.filter((e) => e.to === t).map((e) => e.from);
	for (; i.length;) {
		let t = i.pop();
		if (!r.has(t)) {
			if (r.add(t), T.has(n.get(t)?.type || "")) return !0;
			e.connections.filter((e) => e.to === t).forEach((e) => i.push(e.from));
		}
	}
	return !1;
}
function D({ document: e, node: t }) {
	let n = E(e, t.id), r = t.runStatus === "failed" && !!t._cascadeFailed;
	return /* @__PURE__ */ (0, d.jsxs)(d.Fragment, { children: [/* @__PURE__ */ (0, d.jsxs)("div", {
		className: "gen-run-row",
		children: [
			/* @__PURE__ */ (0, d.jsx)(w, { node: t }),
			n ? /* @__PURE__ */ (0, d.jsx)(w, {
				label: "一键运行",
				mode: "cascade",
				node: t
			}) : null,
			t.running ? /* @__PURE__ */ (0, d.jsx)("button", {
				className: "node-stop-btn",
				onClick: () => void window.CanvasBoardV2?.controlExecution("stop-execution", t.id),
				type: "button",
				children: "停止"
			}) : null
		]
	}), r ? /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "node-retry-bar",
		children: [
			/* @__PURE__ */ (0, d.jsx)("span", {
				className: "node-retry-msg",
				title: String(t.runError || ""),
				children: String(t.runError || "生成失败").slice(0, 60)
			}),
			/* @__PURE__ */ (0, d.jsx)("button", {
				className: "node-retry-btn",
				onClick: () => void window.CanvasBoardV2?.controlExecution("retry-execution", t.id),
				type: "button",
				children: "重试"
			}),
			/* @__PURE__ */ (0, d.jsx)("button", {
				className: "node-stop-btn",
				onClick: () => void window.CanvasBoardV2?.controlExecution("stop-execution", t.id),
				type: "button",
				children: "停止"
			})
		]
	}) : null] });
}
function O(e, t) {
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
	}).filter((e) => e.url) : e.type === "group" && Array.isArray(e.items) ? e.items.map((e) => n.get(String(e))).filter((e) => e?.type === "image" && e.url).map((e) => ({
		kind: String(e.mediaKind || "image"),
		name: String(e.name || ""),
		url: String(e.url)
	})) : []);
}
async function k(e) {
	return new Promise((t, n) => {
		let r = new Image();
		r.onload = () => t({
			height: r.naturalHeight,
			width: r.naturalWidth
		}), r.onerror = () => n(/* @__PURE__ */ Error("无法读取参考图尺寸")), r.src = e;
	});
}
function A({ document: e, node: t }) {
	let n = e.connections.filter((e) => e.to === t.id).map((t) => e.nodes.find((e) => e.id === t.from)).filter(Boolean).filter((e) => [
		"prompt",
		"promptGroup",
		"loop",
		"llm"
	].includes(e.type)).length, r = O(e, t);
	return /* @__PURE__ */ (0, d.jsxs)("div", { children: [/* @__PURE__ */ (0, d.jsxs)("div", {
		className: "text-[10px] text-gray-400",
		children: [
			"提示词 ",
			n,
			" · 图片/媒体 ",
			r.length
		]
	}), r.length ? /* @__PURE__ */ (0, d.jsx)("div", {
		className: "input-list mt-1",
		children: r.slice(0, 8).map((e, t) => /* @__PURE__ */ (0, d.jsxs)("div", {
			className: "input-item",
			children: [e.kind === "video" ? /* @__PURE__ */ (0, d.jsx)("video", {
				muted: !0,
				preload: "metadata",
				src: e.url
			}) : /* @__PURE__ */ (0, d.jsx)("img", {
				alt: e.name || `参考 ${t + 1}`,
				src: e.url
			}), /* @__PURE__ */ (0, d.jsx)("span", {
				className: "input-index",
				children: t + 1
			})]
		}, `${e.url}-${t}`))
	}) : null] });
}
function j({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = (p()?.getNodeOptions("generator", "provider", n) ?? []).map((e) => [e.value, e.label]), o = (p()?.getNodeOptions("generator", "model", n) ?? []).map((e) => [e.value, e.label]), s = String(n.apiProvider || a[0]?.[0] || ""), c = async () => {
		let e = O(t, n).find((e) => e.kind !== "video" && e.kind !== "audio");
		if (!e) throw Error("请先连接一张参考图");
		let r = await k(e.url);
		i({
			fitImage: !0,
			resolution: "custom",
			customWidth: r.width,
			customHeight: r.height,
			customSize: `${r.width}x${r.height}`
		});
	};
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, d.jsx)(A, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, d.jsx)(C, {
							ariaLabel: "图片平台",
							onChange: (e) => {
								let t = p()?.getNodeOptions("generator", "model", {
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
						}), /* @__PURE__ */ (0, d.jsx)(C, {
							ariaLabel: "图片模型",
							onChange: (e) => i({ model: e }),
							options: o,
							value: String(n.model || "")
						})]
					}),
					/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, d.jsx)(C, {
								ariaLabel: "分辨率",
								onChange: (e) => i({
									resolution: e,
									...e === "custom" ? { ratio: "" } : {}
								}),
								options: S,
								value: String(n.resolution || "1k")
							}),
							/* @__PURE__ */ (0, d.jsx)(C, {
								ariaLabel: "比例",
								onChange: (e) => i({ ratio: e }),
								options: x,
								value: String(n.ratio || "square")
							}),
							/* @__PURE__ */ (0, d.jsx)(C, {
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
							/* @__PURE__ */ (0, d.jsx)("input", {
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
					n.ratio === "custom" ? /* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, d.jsx)("input", {
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
						}), /* @__PURE__ */ (0, d.jsx)("input", {
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
					n.resolution === "custom" ? /* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, d.jsx)("input", {
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
							/* @__PURE__ */ (0, d.jsx)("input", {
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
							/* @__PURE__ */ (0, d.jsx)("button", {
								className: "secondary-btn",
								onClick: () => void c().catch((e) => window.alert(e.message)),
								type: "button",
								children: "适配参考图"
							})
						]
					}) : null
				]
			}),
			/* @__PURE__ */ (0, d.jsx)(D, {
				document: t,
				node: n
			})
		]
	});
}
function M({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = (p()?.getNodeOptions("msgen", "model", n) ?? []).map((e) => [e.value, e.label]), o = (p()?.getNodeOptions("msgen", "custom-model", n) ?? []).map((e) => [e.value, e.label]), s = p()?.getNodeOptions("msgen", "lora", n) ?? [], c = s.find((e) => e.value === n.msLoraId) ?? s[0], l = async () => {
		let e = O(t, n).find((e) => e.kind !== "video" && e.kind !== "audio");
		if (!e) throw Error("请先连接一张参考图");
		let r = await k(e.url);
		i({
			fitImage: !0,
			msResolution: "custom",
			msCustomWidth: r.width,
			msCustomHeight: r.height,
			msCustomSize: `${r.width}x${r.height}`
		});
	};
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, d.jsx)(A, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, d.jsx)("div", {
				className: "ms-model-tabs",
				children: a.map(([e, t]) => /* @__PURE__ */ (0, d.jsx)("button", {
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
			n.msgenModel === "custom" ? /* @__PURE__ */ (0, d.jsx)(C, {
				ariaLabel: "ModelScope 模型",
				onChange: (e) => i({
					msCustomModel: e,
					msLoraEnabled: !1,
					msLoraId: ""
				}),
				options: o,
				value: String(n.msCustomModel || o[0]?.[0] || "")
			}) : null,
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, d.jsx)(C, {
								ariaLabel: "ModelScope 分辨率",
								onChange: (e) => i({
									msResolution: e,
									...e === "custom" ? { msRatio: "" } : {}
								}),
								options: S,
								value: String(n.msResolution || "1k")
							}),
							/* @__PURE__ */ (0, d.jsx)(C, {
								ariaLabel: "ModelScope 比例",
								onChange: (e) => i({ msRatio: e }),
								options: x.filter(([e]) => e !== "source"),
								value: String(n.msRatio || "square")
							}),
							/* @__PURE__ */ (0, d.jsx)("input", {
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
					n.msRatio === "custom" ? /* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, d.jsx)("input", {
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
						}), /* @__PURE__ */ (0, d.jsx)("input", {
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
					n.msResolution === "custom" ? /* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, d.jsx)("input", {
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
							/* @__PURE__ */ (0, d.jsx)("input", {
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
							/* @__PURE__ */ (0, d.jsx)("button", {
								className: "secondary-btn",
								onClick: () => void l().catch((e) => window.alert(e.message)),
								type: "button",
								children: "适配参考图"
							})
						]
					}) : null,
					s.length ? /* @__PURE__ */ (0, d.jsxs)(d.Fragment, { children: [/* @__PURE__ */ (0, d.jsx)("button", {
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
					}), n.msLoraEnabled ? /* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, d.jsx)(C, {
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
						}), /* @__PURE__ */ (0, d.jsxs)("label", {
							className: "field",
							children: [/* @__PURE__ */ (0, d.jsxs)("span", {
								className: "setting-title",
								children: ["LoRA 强度 ", Number(n.msLoraStrength ?? .8).toFixed(2)]
							}), /* @__PURE__ */ (0, d.jsx)("input", {
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
					}) : null] }) : /* @__PURE__ */ (0, d.jsx)("div", {
						className: "text-[11px] text-gray-400",
						children: "当前模型没有绑定 LoRA"
					})
				]
			}),
			/* @__PURE__ */ (0, d.jsx)(D, {
				document: t,
				node: n
			})
		]
	});
}
function N({ commit: e, node: t, store: n }) {
	let r = Array.isArray(t.images) ? t.images : [], i = Array.isArray(t._pending) ? t._pending : [], a = (e) => typeof e == "string" ? e : String(e?.url || ""), o = (i) => {
		n.getState().updateNode(t.id, { images: r.filter((e) => a(e) !== i) }), e();
	}, s = (e) => window.CanvasBoardV2?.openOutputLightbox(t, e), c = (r) => {
		let a = String(r.run?.node?.id || r.nodeId || "");
		n.getState().updateNode(t.id, { _pending: i.filter((e) => e !== r) }), e(), a && window.CanvasBoardV2?.runNode(a);
	};
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "output-grid",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [r.map((e, t) => {
			let n = a(e), r = String(e?.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(n) ? "video" : /\.(mp3|wav|m4a)(\?|$)/i.test(n) ? "audio" : "image")), i = String(e.name || n.split(/[?#]/, 1)[0].split("/").pop() || `生成结果 ${t + 1}`);
			return /* @__PURE__ */ (0, d.jsxs)("div", {
				className: "output-img-wrap",
				"data-output-url": n,
				children: [
					r === "video" ? /* @__PURE__ */ (0, d.jsx)("video", {
						controls: !0,
						onDoubleClick: () => s(n),
						preload: "metadata",
						src: n
					}) : r === "audio" ? /* @__PURE__ */ (0, d.jsx)("audio", {
						controls: !0,
						preload: "metadata",
						src: n
					}) : /* @__PURE__ */ (0, d.jsx)("img", {
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
					/* @__PURE__ */ (0, d.jsx)("button", {
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
					/* @__PURE__ */ (0, d.jsx)("a", {
						className: "output-download",
						download: !0,
						href: n,
						onClick: (e) => e.stopPropagation(),
						children: "↓"
					}),
					/* @__PURE__ */ (0, d.jsx)("button", {
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
			return /* @__PURE__ */ (0, d.jsxs)("div", {
				className: `output-pending ${r ? "failed" : ""}`,
				"data-pending-id": String(e.id || ""),
				children: [
					/* @__PURE__ */ (0, d.jsx)("span", { className: "pending-spinner" }),
					/* @__PURE__ */ (0, d.jsx)("span", { children: i }),
					e.canvasTaskId ? /* @__PURE__ */ (0, d.jsx)("small", { children: String(e.canvasTaskId) }) : null,
					r ? /* @__PURE__ */ (0, d.jsx)("button", {
						onClick: () => c(e),
						type: "button",
						children: "重新生成"
					}) : null
				]
			}, String(e.id || t));
		})]
	});
}
function P({ commit: e, document: t, node: n, store: r }) {
	let [i, a] = (0, l.useState)(String(n.manualVideoUrl || (Array.isArray(n.manualVideoUrls) ? n.manualVideoUrls[0] : "") || "")), [o, s] = (0, l.useState)(!1), c = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, u = (p()?.getNodeOptions("video", "provider", n) ?? []).map((e) => [e.value, e.label]), f = (p()?.getNodeOptions("video", "model", n) ?? []).map((e) => [e.value, e.label]);
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, d.jsx)(A, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "video-input-actions",
				children: [
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": "视频手动 URL",
						className: "setting-input",
						onChange: (e) => a(e.target.value),
						placeholder: "https://… 或 asset://…",
						value: i
					}),
					/* @__PURE__ */ (0, d.jsx)("button", {
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
					/* @__PURE__ */ (0, d.jsx)("button", {
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
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, d.jsx)(C, {
							ariaLabel: "视频平台",
							onChange: (e) => {
								let t = p()?.getNodeOptions("video", "model", {
									...n,
									apiProvider: e
								}) ?? [];
								c({
									apiProvider: e,
									model: t[0]?.value || ""
								});
							},
							options: u,
							value: String(n.apiProvider || u[0]?.[0] || "")
						}), /* @__PURE__ */ (0, d.jsx)(C, {
							ariaLabel: "视频模型",
							onChange: (e) => c({ model: e }),
							options: f,
							value: String(n.model || "")
						})]
					}),
					/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, d.jsx)("input", {
								"aria-label": "视频时长",
								className: "setting-input",
								max: "60",
								min: "-1",
								onBlur: e,
								onChange: (e) => r.getState().updateNode(n.id, { duration: Math.max(-1, Math.min(60, Number(e.target.value) || 5)) }),
								type: "number",
								value: Number(n.duration ?? 5)
							}),
							/* @__PURE__ */ (0, d.jsx)(C, {
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
							/* @__PURE__ */ (0, d.jsx)(C, {
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
							/* @__PURE__ */ (0, d.jsx)(C, {
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
					/* @__PURE__ */ (0, d.jsx)("div", {
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
						].map(([e, t]) => /* @__PURE__ */ (0, d.jsxs)("button", {
							className: `setting-check ${n[e] ? "active" : ""}`,
							onClick: () => c({
								[e]: !n[e],
								...e === "multimodal" && !n[e] ? { useFrameRoles: !1 } : e === "useFrameRoles" && !n[e] ? { multimodal: !1 } : {}
							}),
							type: "button",
							children: [/* @__PURE__ */ (0, d.jsx)("span", { className: "check-dot" }), t]
						}, e))
					})
				]
			}),
			/* @__PURE__ */ (0, d.jsx)(D, {
				document: t,
				node: n
			})
		]
	});
}
function F({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = (p()?.getNodeOptions("llm", "provider", n) ?? []).map((e) => [e.value, e.label]), o = (p()?.getNodeOptions("llm", "model", n) ?? []).map((e) => [e.value, e.label]), s = Array.isArray(n.messages) ? n.messages : [];
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "llm-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "llm-row",
				children: [
					/* @__PURE__ */ (0, d.jsx)(C, {
						ariaLabel: "LLM 平台",
						onChange: (e) => {
							let t = p()?.getNodeOptions("llm", "model", {
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
					/* @__PURE__ */ (0, d.jsx)(C, {
						ariaLabel: "LLM 模型",
						onChange: (e) => i({
							model: e,
							...n.llmProvider === "modelscope" ? { llmMsModel: e } : {}
						}),
						options: o,
						value: String(n.model || "")
					}),
					/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "llm-mode",
						children: [/* @__PURE__ */ (0, d.jsx)("button", {
							className: n.mode === "chat" ? "" : "active",
							onClick: () => i({ mode: "node" }),
							type: "button",
							children: "节点"
						}), /* @__PURE__ */ (0, d.jsx)("button", {
							className: n.mode === "chat" ? "active" : "",
							onClick: () => i({ mode: "chat" }),
							type: "button",
							children: "聊天"
						})]
					}),
					/* @__PURE__ */ (0, d.jsx)("button", {
						className: `llm-sys-toggle ${n.showSystem ? "active" : ""}`,
						onClick: () => i({ showSystem: !n.showSystem }),
						type: "button",
						children: "System"
					})
				]
			}),
			/* @__PURE__ */ (0, d.jsx)(A, {
				document: t,
				node: n
			}),
			n.showSystem ? /* @__PURE__ */ (0, d.jsx)("textarea", {
				"aria-label": "系统提示词",
				className: "llm-system",
				onBlur: e,
				onChange: (e) => r.getState().updateNode(n.id, { systemPrompt: e.target.value }),
				value: String(n.systemPrompt || "")
			}) : null,
			n.mode === "chat" ? /* @__PURE__ */ (0, d.jsxs)("div", {
				className: "llm-chat-pane",
				children: [
					/* @__PURE__ */ (0, d.jsx)("div", {
						className: "llm-chat-log",
						children: s.map((e, t) => /* @__PURE__ */ (0, d.jsxs)("div", {
							className: `llm-bubble ${e.role === "user" ? "user" : "assistant"}`,
							children: [e.content, e.role === "assistant" ? /* @__PURE__ */ (0, d.jsx)("button", {
								"aria-label": `复制消息 ${t + 1}`,
								className: "llm-bubble-copy",
								onClick: () => void navigator.clipboard.writeText(String(e.content || "")),
								type: "button",
								children: "复制"
							}) : null]
						}, t))
					}),
					/* @__PURE__ */ (0, d.jsx)("textarea", {
						"aria-label": "聊天输入",
						className: "llm-chat-input",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { chatInput: e.target.value }),
						onKeyDown: (e) => {
							e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), window.CanvasBoardV2?.runNode(n.id, "chat"));
						},
						value: String(n.chatInput || "")
					}),
					/* @__PURE__ */ (0, d.jsx)(w, {
						label: "发送",
						mode: "chat",
						node: n
					})
				]
			}) : /* @__PURE__ */ (0, d.jsxs)("div", {
				className: "llm-node-pane",
				children: [
					/* @__PURE__ */ (0, d.jsx)("div", {
						className: "llm-pane-label",
						children: "Input"
					}),
					/* @__PURE__ */ (0, d.jsx)("textarea", {
						"aria-label": "LLM 输入",
						className: "llm-input-area llm-input-output",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { userInput: e.target.value }),
						value: String(n.userInput || "")
					}),
					/* @__PURE__ */ (0, d.jsx)("div", {
						className: "llm-pane-label",
						children: "Output"
					}),
					/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "llm-output-wrap",
						children: [/* @__PURE__ */ (0, d.jsx)("button", {
							"aria-label": "复制 LLM 输出",
							className: "llm-copy-btn",
							onClick: () => navigator.clipboard.writeText(String(n.outputText || "")),
							type: "button",
							children: "复制"
						}), /* @__PURE__ */ (0, d.jsx)("div", {
							className: "llm-output",
							children: String(n.outputText || "暂无输出")
						})]
					}),
					/* @__PURE__ */ (0, d.jsx)(D, {
						document: t,
						node: n
					})
				]
			})
		]
	});
}
function I(e) {
	return e.type === "image" || e.type === "video" || e.type === "audio" ? e.type : e.type === "textarea" || /prompt|text|提示词|正向|负向/i.test(`${e.input || ""} ${e.name || ""}`) ? "prompt" : "setting";
}
function L({ commit: e, document: t, node: n, store: r }) {
	let [i, a] = (0, l.useState)([]), o = String(n.comfyWorkflow || "");
	(0, l.useEffect)(() => {
		let e = !0;
		if (n.mode !== "custom" || !o) {
			a([]);
			return;
		}
		return (p()?.getComfyFields(o) ?? Promise.resolve([])).then((t) => {
			e && a(t);
		}), () => {
			e = !1;
		};
	}, [n.mode, o]);
	let s = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, c = n.comfyParams && typeof n.comfyParams == "object" ? n.comfyParams : {}, u = n.comfyRandomActive && typeof n.comfyRandomActive == "object" ? n.comfyRandomActive : {}, f = i.filter((e) => I(e) === "setting"), m = i.filter((e) => [
		"audio",
		"image",
		"video"
	].includes(I(e))), h = (p()?.getNodeOptions("comfy", "workflow", n) ?? []).map((e) => [e.value, e.label]), g = (t, i, a = !0) => {
		r.getState().updateNode(n.id, { comfyParams: {
			...c,
			[String(t.id)]: i
		} }), a && e();
	};
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "comfy-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, d.jsx)("div", {
				className: "mode-tabs",
				children: [
					["text", "文生图"],
					["enhance", "增强"],
					["edit", "编辑"],
					["custom", "工作流"]
				].map(([e, t]) => /* @__PURE__ */ (0, d.jsx)("button", {
					className: n.mode === e ? "active" : "",
					onClick: () => s({ mode: e }),
					type: "button",
					children: t
				}, e))
			}),
			/* @__PURE__ */ (0, d.jsx)(A, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, d.jsx)("div", {
				className: "gen-settings comfy-settings",
				children: n.mode === "text" ? /* @__PURE__ */ (0, d.jsxs)("div", {
					className: "gen-settings-row",
					children: [/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": "Comfy 宽度",
						className: "setting-input",
						min: "64",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { width: Number(e.target.value) || 1024 }),
						step: "64",
						type: "number",
						value: Number(n.width || 1024)
					}), /* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": "Comfy 高度",
						className: "setting-input",
						min: "64",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { height: Number(e.target.value) || 1024 }),
						step: "64",
						type: "number",
						value: Number(n.height || 1024)
					})]
				}) : n.mode === "enhance" ? /* @__PURE__ */ (0, d.jsxs)(d.Fragment, { children: [/* @__PURE__ */ (0, d.jsx)("input", {
					"aria-label": "增强强度",
					className: "canvas-range",
					max: "1",
					min: "0.1",
					onChange: (e) => r.getState().updateNode(n.id, { enhanceStrength: Number(e.target.value) }),
					onPointerUp: e,
					step: "0.05",
					type: "range",
					value: Number(n.enhanceStrength ?? .5)
				}), /* @__PURE__ */ (0, d.jsx)("button", {
					className: `setting-check ${n.enhanceUpscale ? "active" : ""}`,
					onClick: () => s({ enhanceUpscale: !n.enhanceUpscale }),
					type: "button",
					children: "超分辨率"
				})] }) : n.mode === "edit" ? /* @__PURE__ */ (0, d.jsx)("button", {
					className: `setting-check ${n.editUpscale ? "active" : ""}`,
					onClick: () => s({ editUpscale: !n.editUpscale }),
					type: "button",
					children: "超分辨率"
				}) : /* @__PURE__ */ (0, d.jsxs)(d.Fragment, { children: [
					/* @__PURE__ */ (0, d.jsx)(C, {
						ariaLabel: "Comfy 工作流",
						onChange: (e) => s({
							comfyWorkflow: e,
							comfyParams: {},
							comfyRandomActive: {}
						}),
						options: h,
						value: o
					}),
					/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "text-[10px] text-gray-400",
						children: [
							"动态媒体字段 ",
							m.length,
							" · 参数字段 ",
							f.length
						]
					}),
					f.map((t) => {
						let n = String(t.id || ""), r = c[n] ?? t.default ?? "";
						if (t.type === "boolean") return /* @__PURE__ */ (0, d.jsx)("button", {
							className: `setting-check ${r ? "active" : ""}`,
							onClick: () => g(t, !r),
							type: "button",
							children: t.name || n
						}, n);
						if (t.type === "dropdown") return /* @__PURE__ */ (0, d.jsx)(C, {
							ariaLabel: t.name || n,
							onChange: (e) => g(t, e),
							options: (t.options || []).map((e) => [e, e]),
							value: String(r)
						}, n);
						if (t.type === "textarea") return /* @__PURE__ */ (0, d.jsx)("textarea", {
							"aria-label": t.name || n,
							className: "setting-input",
							onBlur: e,
							onChange: (e) => g(t, e.target.value, !1),
							value: String(r)
						}, n);
						let i = /* @__PURE__ */ (0, d.jsx)("input", {
							"aria-label": t.name || n,
							className: "setting-input",
							max: t.max,
							min: t.min,
							onBlur: e,
							onChange: (e) => g(t, t.type === "number" || t.type === "slider" ? Number(e.target.value) : e.target.value, !1),
							step: t.step,
							type: t.type === "number" || t.type === "slider" ? "number" : "text",
							value: String(r)
						});
						return t.type === "number" && t.random_enabled ? /* @__PURE__ */ (0, d.jsxs)("div", {
							className: "comfy-random-field",
							children: [i, /* @__PURE__ */ (0, d.jsx)("button", {
								"aria-label": `${t.name || n} 随机`,
								className: `tool-btn comfy-random-btn ${u[n] === !1 ? "" : "active"}`,
								onClick: () => s({ comfyRandomActive: {
									...u,
									[n]: u[n] === !1
								} }),
								type: "button",
								children: "随机"
							})]
						}, n) : /* @__PURE__ */ (0, d.jsx)("div", { children: i }, n);
					})
				] })
			}),
			/* @__PURE__ */ (0, d.jsx)(D, {
				document: t,
				node: n
			})
		]
	});
}
function R({ commit: e, node: t, store: n }) {
	let r = (0, l.useRef)(null);
	(0, l.useEffect)(() => () => {
		r.current?.pause(), r.current?.removeAttribute("src"), r.current?.load();
	}, []);
	let i = async (r) => {
		if (!r.length) return;
		let i = (await p()?.uploadMedia(r))?.files ?? [];
		if (!i.length) return;
		n.getState().updateNode(t.id, {
			url: i[0].url || "",
			name: i[0].name || "media",
			mediaKind: i[0].kind || "image"
		});
		let a = [t.id];
		i.slice(1).forEach((e, r) => {
			let i = n.getState().addNode("image", {
				x: Number(t.x || 0) + (r + 1) * 36,
				y: Number(t.y || 0) + (r + 1) * 36
			});
			i && (n.getState().updateNode(i, {
				url: e.url || "",
				name: e.name || "media",
				mediaKind: e.kind || "image"
			}), a.push(i));
		}), a.length > 1 && n.getState().groupNodes(a), e();
	}, a = String(t.url || ""), o = String(t.mediaKind || (/\.(mp4|webm|mov)(\?|$)/i.test(a) ? "video" : /\.(mp3|wav|m4a)(\?|$)/i.test(a) ? "audio" : "image"));
	return a ? /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "image-preview-wrap",
		onClick: (e) => e.stopPropagation(),
		onDoubleClick: () => window.open(a, "_blank", "noopener"),
		onDragOver: (e) => e.preventDefault(),
		onDrop: (e) => {
			e.preventDefault(), i([...e.dataTransfer.files]);
		},
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			o === "video" ? /* @__PURE__ */ (0, d.jsx)("video", {
				controls: !0,
				preload: "metadata",
				ref: (e) => {
					r.current = e;
				},
				src: a
			}) : o === "audio" ? /* @__PURE__ */ (0, d.jsx)("audio", {
				controls: !0,
				preload: "metadata",
				ref: (e) => {
					r.current = e;
				},
				src: a
			}) : /* @__PURE__ */ (0, d.jsx)("img", {
				alt: String(t.name || "image"),
				draggable: !0,
				src: a
			}),
			/* @__PURE__ */ (0, d.jsx)("div", {
				className: "image-caption text-[11px] text-gray-400 truncate",
				children: String(t.name || o)
			}),
			/* @__PURE__ */ (0, d.jsx)("button", {
				"aria-label": "清空媒体",
				className: "output-del",
				onClick: () => {
					n.getState().updateNode(t.id, {
						url: "",
						name: "空白图片",
						mediaKind: "image"
					}), e();
				},
				type: "button",
				children: "×"
			})
		]
	}) : /* @__PURE__ */ (0, d.jsxs)("label", {
		className: "blank-image",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: ["选择或拖入媒体", /* @__PURE__ */ (0, d.jsx)("input", {
			accept: "image/*,video/*,audio/*",
			hidden: !0,
			multiple: !0,
			onChange: (e) => void i([...e.target.files ?? []]),
			type: "file"
		})]
	});
}
function z({ node: e, nodesById: t }) {
	let n = Array.isArray(e.items) ? e.items.map((e) => t.get(String(e))).filter(Boolean) : [], r = n.filter((e) => e.type === "image" && e.url);
	return /* @__PURE__ */ (0, d.jsxs)("div", { children: [/* @__PURE__ */ (0, d.jsxs)("div", {
		className: "text-[11px] text-gray-400",
		children: [
			r.length,
			" 个媒体 · ",
			n.filter((e) => e.type === "prompt").length,
			" 个提示词"
		]
	}), r.length ? /* @__PURE__ */ (0, d.jsx)("div", {
		className: "output-grid",
		children: r.slice(0, 6).map((e) => /* @__PURE__ */ (0, d.jsx)("img", {
			alt: String(e.name || "media"),
			onDoubleClick: () => window.open(String(e.url), "_blank", "noopener"),
			src: String(e.url)
		}, e.id))
	}) : null] });
}
function B({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = p()?.normalizeLtxNode(n) ?? n;
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "ltx-director-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, d.jsx)(A, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, d.jsx)("textarea", {
				"aria-label": "LTX 全局提示词",
				className: "setting-input",
				onBlur: e,
				onChange: (e) => r.getState().updateNode(n.id, { globalPrompt: e.target.value }),
				placeholder: "全局提示词",
				value: String(n.globalPrompt || "")
			}),
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "ltx-params-row",
				children: [
					/* @__PURE__ */ (0, d.jsx)("input", {
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
					/* @__PURE__ */ (0, d.jsx)("input", {
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
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": "LTX FPS",
						className: "setting-input",
						min: "1",
						onChange: (e) => i({ frameRate: Math.max(1, Number(e.target.value) || 24) }),
						type: "number",
						value: Number(n.frameRate || 24)
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": "LTX 宽度",
						className: "setting-input",
						min: "0",
						onChange: (e) => i({ customWidth: Math.max(0, Number(e.target.value) || 0) }),
						step: "32",
						type: "number",
						value: Number(n.customWidth || 0)
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
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
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "ltx-params-row",
				children: [
					/* @__PURE__ */ (0, d.jsx)(C, {
						ariaLabel: "LTX 时间显示",
						onChange: (e) => i({ displayMode: e }),
						options: [["seconds", "秒"], ["frames", "帧"]],
						value: String(n.displayMode || "seconds")
					}),
					/* @__PURE__ */ (0, d.jsx)("button", {
						className: `setting-check ${n.useCustomAudio ? "active" : ""}`,
						onClick: () => i({ useCustomAudio: !n.useCustomAudio }),
						type: "button",
						children: "自定义音频"
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": "LTX 图片压缩",
						className: "setting-input",
						max: "100",
						min: "0",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { imgCompression: Number(e.target.value) }),
						type: "number",
						value: Number(n.imgCompression ?? 18)
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": "LTX Epsilon",
						className: "setting-input",
						min: "0",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { epsilon: Number(e.target.value) }),
						step: "0.0001",
						type: "number",
						value: Number(n.epsilon ?? .001)
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": "LTX Divisible By",
						className: "setting-input",
						min: "1",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { divisibleBy: Math.max(1, Number(e.target.value) || 32) }),
						type: "number",
						value: Number(n.divisibleBy || 32)
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": "LTX Noise Seed",
						className: "setting-input",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { noiseSeed: Number(e.target.value) }),
						type: "number",
						value: Number(n.noiseSeed ?? 12)
					})
				]
			}),
			/* @__PURE__ */ (0, d.jsx)(V, {
				commit: e,
				node: a,
				store: r
			}),
			/* @__PURE__ */ (0, d.jsx)(D, {
				document: t,
				node: n
			})
		]
	});
}
function V({ commit: e, node: t, store: n }) {
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
		let n = (await p()?.uploadMedia([e]))?.files?.[0];
		n?.url && t(n);
	};
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "ltx-director-timeline-host canvas-modern-timeline",
		"data-testid": "ltx-timeline-editor",
		children: [
			/* @__PURE__ */ (0, d.jsxs)("header", { children: [/* @__PURE__ */ (0, d.jsx)("strong", { children: "时间线" }), /* @__PURE__ */ (0, d.jsx)("button", {
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
			r.segments.map((e, t) => /* @__PURE__ */ (0, d.jsxs)("div", {
				className: "canvas-modern-segment",
				children: [
					/* @__PURE__ */ (0, d.jsxs)("select", {
						"aria-label": `片段 ${t + 1} 类型`,
						onChange: (e) => a(t, { type: e.target.value }),
						value: e.type || "text",
						children: [/* @__PURE__ */ (0, d.jsx)("option", {
							value: "text",
							children: "文本"
						}), /* @__PURE__ */ (0, d.jsx)("option", {
							value: "image",
							children: "图片"
						})]
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": `片段 ${t + 1} 起始帧`,
						min: "0",
						onChange: (e) => a(t, { start: Math.max(0, Number(e.target.value) || 0) }),
						type: "number",
						value: Number(e.start || 0)
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": `片段 ${t + 1} 长度`,
						min: "1",
						onChange: (e) => a(t, { length: Math.max(1, Number(e.target.value) || 1) }),
						type: "number",
						value: Number(e.length || 1)
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": `片段 ${t + 1} 提示词`,
						onChange: (e) => a(t, { prompt: e.target.value }),
						placeholder: "片段提示词",
						value: e.prompt || ""
					}),
					e.type === "image" ? /* @__PURE__ */ (0, d.jsxs)(d.Fragment, { children: [
						/* @__PURE__ */ (0, d.jsx)("input", {
							"aria-label": `片段 ${t + 1} 图片`,
							onChange: (e) => a(t, {
								imageB64: e.target.value,
								imageFile: ""
							}),
							placeholder: "图片 URL",
							value: e.imageB64 || e.imageFile || ""
						}),
						/* @__PURE__ */ (0, d.jsxs)("label", {
							className: "tool-btn",
							children: ["上传", /* @__PURE__ */ (0, d.jsx)("input", {
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
						/* @__PURE__ */ (0, d.jsx)("input", {
							"aria-label": `片段 ${t + 1} 引导强度`,
							max: "2",
							min: "0",
							onChange: (e) => a(t, { guideStrength: Number(e.target.value) }),
							step: "0.05",
							type: "number",
							value: Number(e.guideStrength ?? 1)
						})
					] }) : null,
					/* @__PURE__ */ (0, d.jsx)("button", {
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
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "canvas-modern-audio-row",
				children: [/* @__PURE__ */ (0, d.jsxs)("span", { children: ["音频片段 ", r.audioSegments.length] }), /* @__PURE__ */ (0, d.jsx)("button", {
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
			r.audioSegments.map((e, t) => /* @__PURE__ */ (0, d.jsxs)("div", {
				className: "canvas-modern-segment canvas-modern-audio-segment",
				children: [
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": `音频 ${t + 1} 起始帧`,
						min: "0",
						onChange: (e) => o(t, { start: Math.max(0, Number(e.target.value) || 0) }),
						type: "number",
						value: Number(e.start || 0)
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": `音频 ${t + 1} 长度`,
						min: "1",
						onChange: (e) => o(t, { length: Math.max(1, Number(e.target.value) || 1) }),
						type: "number",
						value: Number(e.length || 1)
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": `音频 ${t + 1} URL`,
						onChange: (e) => o(t, { url: e.target.value }),
						placeholder: "音频 URL",
						value: e.url || ""
					}),
					/* @__PURE__ */ (0, d.jsxs)("label", {
						className: "tool-btn",
						children: ["上传", /* @__PURE__ */ (0, d.jsx)("input", {
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
					/* @__PURE__ */ (0, d.jsx)("button", {
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
function H({ commit: e, onSelectionChange: n, store: r }) {
	let i = t(r, ({ document: e }) => e), a = (0, l.useRef)(null), [o, s] = (0, l.useState)(""), [c, u] = (0, l.useState)(-1), [p, x] = (0, l.useState)(/* @__PURE__ */ new Set()), [S, C] = (0, l.useState)("ready"), [w, T] = (0, l.useState)(null), [E, D] = (0, l.useState)({
		x: 0,
		y: 0,
		zoom: 1
	}), O = String(i?.id || ""), k = new Map((i?.nodes ?? []).map((e) => [e.id, e])), A = {
		connections: i?.connections ?? [],
		nodes: i?.nodes ?? []
	};
	(0, l.useEffect)(() => {
		s(""), u(-1), x(/* @__PURE__ */ new Set());
	}, [O]), (0, l.useEffect)(() => {
		let t = (t) => {
			let n = t.target, i = n?.isContentEditable || n?.matches("input, textarea, select");
			if (t.key === "Escape") {
				s(""), u(-1), x(/* @__PURE__ */ new Set());
				return;
			}
			if (!i) {
				if ((t.ctrlKey || t.metaKey) && t.key.toLowerCase() === "z") {
					t.preventDefault(), t.shiftKey ? window.CanvasBoardV2?.redo() : window.CanvasBoardV2?.undo();
					return;
				}
				if ((t.ctrlKey || t.metaKey) && t.key.toLowerCase() === "y") {
					t.preventDefault(), window.CanvasBoardV2?.redo();
					return;
				}
				if ((t.ctrlKey || t.metaKey) && t.key.toLowerCase() === "c") {
					a.current = r.getState().copyNodes([...p]);
					return;
				}
				if ((t.ctrlKey || t.metaKey) && t.key.toLowerCase() === "v" && a.current) {
					t.preventDefault();
					let n = r.getState().pasteNodes(a.current);
					n.length && (x(new Set(n)), e());
					return;
				}
				if ((t.ctrlKey || t.metaKey) && t.key.toLowerCase() === "g") {
					t.preventDefault();
					let n = (r.getState().document?.nodes.filter((e) => p.has(e.id)) ?? []).some((e) => e.type === "image") ? r.getState().groupNodes([...p]) : r.getState().groupPromptNodes([...p]);
					n && (x(/* @__PURE__ */ new Set([n])), e());
					return;
				}
				if (t.key === "Delete" || t.key === "Backspace") {
					if (p.size) p.forEach((e) => r.getState().deleteNode(e));
					else if (c >= 0) r.getState().deleteConnection(c);
					else return;
					t.preventDefault(), x(/* @__PURE__ */ new Set()), u(-1), e();
				}
			}
		};
		return window.addEventListener("keydown", t), () => window.removeEventListener("keydown", t);
	}, [
		e,
		c,
		p,
		r
	]), (0, l.useEffect)(() => {
		let t = () => {
			let t = (r.getState().document?.nodes.filter((e) => p.has(e.id)) ?? []).some((e) => e.type === "image") ? r.getState().groupNodes([...p]) : r.getState().groupPromptNodes([...p]);
			t && (x(/* @__PURE__ */ new Set([t])), e());
		};
		return window.addEventListener("canvas-board-v2-group-selected", t), () => window.removeEventListener("canvas-board-v2-group-selected", t);
	}, [
		e,
		p,
		r
	]), (0, l.useEffect)(() => {
		let e = (e) => C(String(e.detail || "ready"));
		return window.addEventListener("canvas-board-v2-save-state", e), () => window.removeEventListener("canvas-board-v2-save-state", e);
	}, []), (0, l.useEffect)(() => {
		let e = (e) => T(e.detail);
		return window.addEventListener("canvas-v2-open-lightbox", e), () => window.removeEventListener("canvas-v2-open-lightbox", e);
	}, []);
	let I = (t) => {
		o && r.getState().connectNodes(o, t) && e(), s("");
	}, V = w ? k.get(w.nodeId) : null;
	return (0, l.useEffect)(() => {
		n?.(p);
	}, [n, p]), /* @__PURE__ */ (0, d.jsxs)("div", {
		"aria-label": "CanvasBoard V2",
		"data-testid": "canvas-board-v2",
		"data-viewport": `${E.x},${E.y},${E.zoom.toFixed(2)}`,
		onDragOver: (e) => e.preventDefault(),
		onDrop: (t) => {
			t.preventDefault(), t.stopPropagation();
			let n = t.currentTarget.getBoundingClientRect(), i = {
				x: (t.clientX - n.left - E.x) / E.zoom,
				y: (t.clientY - n.top - E.y) / E.zoom
			}, a = t.dataTransfer.getData("application/x-canvas-output-image");
			if (a) try {
				let t = JSON.parse(a);
				if (t.url) {
					let n = r.getState().addNode("image", i);
					n && (r.getState().updateNode(n, {
						mediaKind: t.kind || "image",
						name: t.name || "output",
						url: t.url
					}), e());
					return;
				}
			} catch (e) {
				console.warn("[canvas-modern-core] invalid output drag payload", e);
			}
			let o = [...t.dataTransfer.files].filter((e) => /^(image|video|audio)\//.test(e.type));
			o.length && window.CanvasBoardV2?.importFiles(o, i);
		},
		onPointerDown: (e) => {
			if (e.button !== 0) return;
			let t = e.currentTarget, n = {
				x: e.clientX,
				y: e.clientY,
				viewport: E
			};
			t.setPointerCapture(e.pointerId), x(/* @__PURE__ */ new Set()), u(-1);
			let r = (e) => D((t) => ({
				...t,
				x: n.viewport.x + e.clientX - n.x,
				y: n.viewport.y + e.clientY - n.y
			}));
			t.addEventListener("pointermove", r), t.addEventListener("pointerup", () => t.removeEventListener("pointermove", r), { once: !0 });
		},
		onWheel: (e) => {
			e.preventDefault(), D((t) => ({
				...t,
				zoom: Math.min(1.5, Math.max(.25, t.zoom * (e.deltaY < 0 ? 1.1 : .9)))
			}));
		},
		style: {
			backgroundColor: "var(--page)",
			backgroundImage: "radial-gradient(var(--grid) 1px, transparent 1px)",
			backgroundSize: "24px 24px",
			inset: 0,
			overflow: "hidden",
			position: "absolute",
			touchAction: "none"
		},
		children: [
			/* @__PURE__ */ (0, d.jsx)("div", {
				"aria-live": "polite",
				"data-testid": "canvas-board-v2-save-status",
				style: {
					position: "absolute",
					right: 18,
					top: 74,
					zIndex: 20
				},
				children: S === "saving" ? "正在保存" : S === "error" ? "保存失败，本地修改仍保留" : S === "saved" ? "已保存" : ""
			}),
			/* @__PURE__ */ (0, d.jsxs)("div", {
				style: {
					height: 4e3,
					position: "absolute",
					transform: `translate(${E.x}px, ${E.y}px) scale(${E.zoom})`,
					transformOrigin: "0 0",
					width: 6e3
				},
				children: [/* @__PURE__ */ (0, d.jsx)("svg", {
					height: "4000",
					style: {
						inset: 0,
						overflow: "visible",
						position: "absolute"
					},
					width: "6000",
					children: (i?.connections ?? []).map((e, t) => {
						let n = k.get(e.from), r = k.get(e.to);
						if (!n || !r) return null;
						let i = m(n), a = m(r), o = h(n), s = h(r), l = {
							x1: i.x + o.width,
							x2: a.x,
							y1: i.y + o.height / 2,
							y2: a.y + s.height / 2
						};
						return /* @__PURE__ */ (0, d.jsxs)("g", { children: [/* @__PURE__ */ (0, d.jsx)("line", {
							...l,
							stroke: c === t ? "var(--strong)" : "var(--line-2)",
							strokeWidth: "2"
						}), /* @__PURE__ */ (0, d.jsx)("line", {
							...l,
							"data-edge-index": t,
							"data-selected": c === t ? "true" : "false",
							onClick: (e) => {
								e.stopPropagation(), u(t), x(/* @__PURE__ */ new Set());
							},
							onPointerDown: (e) => e.stopPropagation(),
							pointerEvents: "stroke",
							stroke: "rgba(0,0,0,.001)",
							strokeWidth: "16"
						})] }, `${e.from}-${e.to}-${t}`);
					})
				}), (i?.nodes ?? []).map((t) => {
					let n = m(t), i = h(t);
					return /* @__PURE__ */ (0, d.jsxs)("article", {
						"aria-label": `${t.type} ${t.id}`,
						className: `node ${t.type}-node sized ${t.url ? "has-image" : ""} ${p.has(t.id) ? "selected" : ""}`,
						"data-node-id": t.id,
						"data-node-type": t.type,
						onClick: (e) => {
							e.stopPropagation(), u(-1), x((n) => {
								if (!e.ctrlKey && !e.metaKey) return /* @__PURE__ */ new Set([t.id]);
								let r = new Set(n);
								return r.has(t.id) ? r.delete(t.id) : r.add(t.id), r;
							});
						},
						onKeyDown: (e) => {
							(e.key === "Enter" || e.key === " ") && x(/* @__PURE__ */ new Set([t.id]));
						},
						onPointerDown: (i) => {
							if (i.button !== 0 || (i.stopPropagation(), i.ctrlKey || i.metaKey)) return;
							let a = i.currentTarget, o = {
								clientX: i.clientX,
								clientY: i.clientY,
								point: n
							}, s = !1;
							a.setPointerCapture(i.pointerId), u(-1), p.has(t.id) || x(/* @__PURE__ */ new Set([t.id]));
							let c = (e) => {
								s = !0, r.getState().moveNode(t.id, o.point.x + (e.clientX - o.clientX) / E.zoom, o.point.y + (e.clientY - o.clientY) / E.zoom);
							};
							a.addEventListener("pointermove", c), a.addEventListener("pointerup", () => {
								a.removeEventListener("pointermove", c), s && e();
							}, { once: !0 });
						},
						role: "button",
						style: {
							height: i.height,
							left: n.x,
							minHeight: i.height,
							minWidth: i.width,
							top: n.y,
							width: i.width
						},
						tabIndex: 0,
						children: [
							g(t) ? /* @__PURE__ */ (0, d.jsx)("button", {
								"aria-label": `连接到 ${t.id}`,
								className: "port in",
								"data-port": "in",
								onClick: () => I(t.id),
								onPointerDown: (e) => e.stopPropagation(),
								onPointerUp: () => I(t.id),
								type: "button"
							}) : null,
							_(t) ? /* @__PURE__ */ (0, d.jsx)("button", {
								"aria-label": `从 ${t.id} 连线`,
								className: "port out",
								"data-port": "out",
								onClick: () => s(t.id),
								onPointerDown: (e) => {
									e.stopPropagation(), s(t.id);
								},
								type: "button"
							}) : null,
							/* @__PURE__ */ (0, d.jsx)("header", {
								className: "node-head",
								children: /* @__PURE__ */ (0, d.jsx)("strong", {
									className: "node-title",
									children: f[t.type] ?? t.type
								})
							}),
							/* @__PURE__ */ (0, d.jsx)("div", {
								className: "node-body",
								children: t.type === "prompt" ? /* @__PURE__ */ (0, d.jsx)(v, {
									commit: e,
									node: t,
									store: r
								}) : t.type === "image" ? /* @__PURE__ */ (0, d.jsx)(R, {
									commit: e,
									node: t,
									store: r
								}) : t.type === "group" ? /* @__PURE__ */ (0, d.jsx)(z, {
									node: t,
									nodesById: k
								}) : t.type === "promptGroup" ? /* @__PURE__ */ (0, d.jsx)(y, {
									node: t,
									nodesById: k
								}) : t.type === "loop" ? /* @__PURE__ */ (0, d.jsx)(b, {
									commit: e,
									node: t,
									store: r
								}) : t.type === "generator" ? /* @__PURE__ */ (0, d.jsx)(j, {
									commit: e,
									document: A,
									node: t,
									store: r
								}) : t.type === "msgen" ? /* @__PURE__ */ (0, d.jsx)(M, {
									commit: e,
									document: A,
									node: t,
									store: r
								}) : t.type === "output" ? /* @__PURE__ */ (0, d.jsx)(N, {
									commit: e,
									node: t,
									store: r
								}) : t.type === "video" ? /* @__PURE__ */ (0, d.jsx)(P, {
									commit: e,
									document: A,
									node: t,
									store: r
								}) : t.type === "llm" ? /* @__PURE__ */ (0, d.jsx)(F, {
									commit: e,
									document: A,
									node: t,
									store: r
								}) : t.type === "comfy" ? /* @__PURE__ */ (0, d.jsx)(L, {
									commit: e,
									document: A,
									node: t,
									store: r
								}) : t.type === "ltxDirector" ? /* @__PURE__ */ (0, d.jsx)(B, {
									commit: e,
									document: A,
									node: t,
									store: r
								}) : String(t.title || t.name || t.id)
							})
						]
					}, t.id);
				})]
			}),
			w && V ? /* @__PURE__ */ (0, d.jsx)(U, {
				node: V,
				onClose: () => T(null),
				url: w.url
			}) : null
		]
	});
}
function U({ node: e, onClose: t, url: n }) {
	let [r, i] = (0, l.useState)(50), a = e.imageComparisons?.[n]?.url || "", o = /\.(mp4|webm|mov)(\?|$)/i.test(n);
	return /* @__PURE__ */ (0, d.jsx)("div", {
		className: "output-lightbox open canvas-v2-lightbox",
		onClick: t,
		role: "dialog",
		children: /* @__PURE__ */ (0, d.jsxs)("div", {
			className: "output-lightbox-shell",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, d.jsx)("button", {
					"aria-label": "关闭预览",
					className: "output-lightbox-close",
					onClick: t,
					type: "button",
					children: "×"
				}),
				o ? /* @__PURE__ */ (0, d.jsx)("video", {
					autoPlay: !0,
					controls: !0,
					src: n
				}) : /* @__PURE__ */ (0, d.jsxs)("div", {
					className: "output-compare",
					children: [
						" ",
						/* @__PURE__ */ (0, d.jsx)("img", {
							alt: "生成结果",
							src: n
						}),
						a ? /* @__PURE__ */ (0, d.jsx)("div", {
							className: "output-compare-original-wrap",
							style: { width: `${r}%` },
							children: /* @__PURE__ */ (0, d.jsx)("img", {
								alt: "原始参考",
								src: a
							})
						}) : null
					]
				}),
				a && !o ? /* @__PURE__ */ (0, d.jsx)("input", {
					"aria-label": "对比滑块",
					max: "100",
					min: "0",
					onChange: (e) => i(Number(e.target.value)),
					type: "range",
					value: r
				}) : null,
				/* @__PURE__ */ (0, d.jsx)("a", {
					download: !0,
					href: n,
					children: "下载"
				})
			]
		})
	});
}
function W(e, t, n = {}) {
	let i = window.CanvasLegacyBridge, a = n.repository ?? window.CanvasModernCore?.canvasRepository, l = n.runtime ?? p(), f = n.initialDocument !== void 0, m = n.initialDocument ?? i?.getDocumentSnapshot();
	if (!a || !l || f && !m || !f && !i) throw Error("Canvas V2 dependencies are unavailable");
	let h = r(m), g = h.getState().document, _ = G(h.getState().document), v = [], y = [], b = (e) => {
		let t = h.getState().document?.id;
		h.getState().adoptDocument(e.detail);
		let n = h.getState().document;
		n?.id !== t && (g = n);
	}, x = (e) => h.getState().projectExecutionDocument(e.detail);
	f || (window.addEventListener("canvas-legacy-document", b), window.addEventListener("canvas-legacy-execution-document", x));
	let S = (0, u.createRoot)(e), C = t?.hidden ?? !0, w = !1, T = !1, E = !1, D = (t) => {
		e.dataset.saveState = t, window.dispatchEvent(new CustomEvent("canvas-board-v2-save-state", { detail: t }));
	}, O = (e = !0) => {
		let t = h.getState().document;
		t && (e && _ && K(t) !== K(_) && (v.push(structuredClone(_)), v.length > 60 && v.shift(), y.length = 0), _ = structuredClone(t), window.dispatchEvent(new CustomEvent("canvas-board-v2-history-state", { detail: {
			canRedo: y.length > 0,
			canUndo: v.length > 0
		} }))), T = !0, !E && (E = !0, (async () => {
			for (; T && !w;) {
				T = !1;
				let e = h.getState().document;
				if (!(!e || typeof e.id != "string")) {
					D("saving");
					try {
						let t = await a.save(e.id, s(e));
						g = t, w || h.getState().acceptSavedDocument(t, e), D("saved"), window.CanvasModernCore?.recordRolloutEvent("save-succeeded", { dimensions: { reason: "none" } });
					} catch (t) {
						if (t instanceof o && window.CanvasModernCore?.recordRolloutEvent("save-conflict", { dimensions: { reason: "save-conflict" } }), t instanceof o && t.serverCanvas && g) {
							let n = h.getState().document;
							if (n?.id === e.id) {
								let r = c(g, n, t.serverCanvas);
								if (r.conflicts.length) console.warn("[canvas-modern-core] CanvasBoard V2 save conflict requires resolution", r.conflicts);
								else {
									D("merging"), h.setState({ document: r.document }), _ = structuredClone(r.document);
									try {
										let t = await a.save(e.id, s(r.document));
										g = t, w || h.getState().acceptSavedDocument(t, r.document), D("saved"), window.CanvasModernCore?.recordRolloutEvent("save-rebased", { dimensions: { reason: "none" } }), window.CanvasModernCore?.recordRolloutEvent("save-succeeded", { dimensions: { reason: "none" } });
										continue;
									} catch (e) {
										console.warn("[canvas-modern-core] CanvasBoard V2 rebased save failed", e);
									}
								}
							}
						}
						window.CanvasModernCore?.recordRolloutEvent("save-failed", { dimensions: { reason: "save-request-failed" } }), D("error"), console.warn("[canvas-modern-core] CanvasBoard V2 save failed", t);
						break;
					}
				}
			}
			E = !1;
		})());
	}, k = () => {
		let e = h.getState().document, t = v.pop();
		return !e || !t ? !1 : (y.push(structuredClone(e)), h.getState().projectDocument(t), _ = structuredClone(t), O(!1), !0);
	}, A = () => {
		let e = h.getState().document, t = y.pop();
		return !e || !t ? !1 : (v.push(structuredClone(e)), h.getState().projectDocument(t), _ = structuredClone(t), O(!1), !0);
	}, j = /* @__PURE__ */ new Set(), M = window.CanvasBoardV2;
	return window.CanvasBoardV2 = {
		addNode(e, t) {
			let n = h.getState().addNode(e, t);
			return n && O(), n;
		},
		groupSelected() {
			window.dispatchEvent(new Event("canvas-board-v2-group-selected"));
		},
		exportSelection() {
			let e = h.getState().document;
			if (!e) return {
				connections: [],
				nodes: []
			};
			let t = j.size ? new Set(j) : new Set(e.nodes.map((e) => e.id)), n = !0;
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
				"video"
			], i = /* @__PURE__ */ new Map();
			return t.forEach((e, t) => {
				if (!e || typeof e != "object") return;
				let n = e, a = String(n.type || "");
				if (!r.includes(a)) return;
				let o = h.getState().addNode(a, {
					x: Number(n.x || 0) + 48 + t % 3 * 12,
					y: Number(n.y || 0) + 48 + t % 3 * 12
				});
				if (!o) return;
				let s = String(n.id || "");
				s && i.set(s, o);
				let { id: c, type: l, x: u, y: d, ...f } = n;
				h.getState().updateNode(o, structuredClone(f));
			}), n.forEach((e) => {
				if (!e || typeof e != "object") return;
				let t = e, n = i.get(String(t.from || "")), r = i.get(String(t.to || ""));
				n && r && h.getState().connectNodes(n, r);
			}), i.size && O(), [...i.values()];
		},
		async controlExecution(e, t) {
			let n = h.getState().document;
			if (!n) return;
			let r = await l.runCommand(e, t, n, async (e) => {
				h.getState().projectExecutionDocument(e), O(!1);
			});
			h.getState().projectDocument(r), O(!1);
		},
		async importFiles(e, t) {
			if (!e.length) return;
			let n = ((await l.uploadMedia(e)).files ?? []).map((e, n) => {
				let r = h.getState().addNode("image", t ? {
					x: t.x + n * 36,
					y: t.y + n * 36
				} : void 0);
				return r && h.getState().updateNode(r, {
					url: e.url || "",
					name: e.name || "media",
					mediaKind: e.kind || "image"
				}), r;
			}).filter(Boolean);
			n.length > 1 && h.getState().groupNodes(n), n.length && O();
		},
		openPromptTemplates(e) {
			window.openPromptTemplateModal?.(e);
		},
		openOutputLightbox(e, t) {
			let r = Array.isArray(e.images) ? e.images.map((e) => typeof e == "string" ? e : String(e.url || "") === t ? {
				...e,
				viewed: !0
			} : e) : [];
			h.getState().updateNode(String(e.id || ""), { images: r }), O(!1), n.initialDocument ? window.dispatchEvent(new CustomEvent("canvas-v2-open-lightbox", { detail: {
				nodeId: String(e.id || ""),
				url: t
			} })) : i && i.openOutputLightbox(e, t);
		},
		async prepareVideoMedia(e, t, n) {
			let r = h.getState().document;
			if (!r) return;
			let i = await l.prepareVideoMedia(e, r, t, n);
			h.getState().projectDocument(i), O();
		},
		rerunFromOutputMeta(e) {
			let t = e.run && typeof e.run == "object" ? e.run : {}, n = t.node && typeof t.node == "object" ? structuredClone(t.node) : {}, r = String(n.type || t.nodeType || "");
			if (![
				"comfy",
				"generator",
				"llm",
				"ltxDirector",
				"msgen",
				"video"
			].includes(r)) return;
			let i = h.getState().addNode(r);
			if (!i) return;
			let { id: a, inputs: o, running: s, type: c, x: l, y: u, ...d } = n;
			h.getState().updateNode(i, {
				...d,
				runStatus: void 0,
				runError: ""
			});
			let f = h.getState().document?.nodes.find((e) => e.id === i), p = String(t.prompt || "");
			if (p) {
				let e = h.getState().addNode("prompt", {
					x: Number(f?.x || 0) - 340,
					y: Number(f?.y || 0)
				});
				e && (h.getState().updateNode(e, { text: p }), h.getState().connectNodes(e, i));
			}
			(Array.isArray(t.refs) ? t.refs : []).slice(0, 8).forEach((e, t) => {
				if (!e.url) return;
				let n = h.getState().addNode("image", {
					x: Number(f?.x || 0) - 340,
					y: Number(f?.y || 0) + 110 + t * 86
				});
				n && (h.getState().updateNode(n, {
					mediaKind: e.kind || "image",
					name: e.name || "image",
					url: e.url
				}), h.getState().connectNodes(n, i));
			}), O();
		},
		redo: A,
		async runNode(e, t) {
			let n = h.getState().document;
			if (!n) return;
			let r = await l.runNode(e, n, t, async (e) => {
				h.getState().projectExecutionDocument(e), O(!1);
			});
			h.getState().projectDocument(r), O(!1);
		},
		undo: k,
		updateNode(e, t) {
			return h.getState().document?.nodes.some((t) => t.id === e) ? (h.getState().updateNode(e, t), O(), !0) : !1;
		}
	}, S.render(/* @__PURE__ */ (0, d.jsx)(H, {
		commit: O,
		onSelectionChange: (e) => {
			j = new Set(e);
		},
		store: h
	})), t && (t.hidden = !0), e.hidden = !1, () => {
		w = !0, M ? window.CanvasBoardV2 = M : delete window.CanvasBoardV2, f || (window.removeEventListener("canvas-legacy-document", b), window.removeEventListener("canvas-legacy-execution-document", x)), S.unmount(), e.hidden = !0, t && (t.hidden = C);
	};
}
function G(e) {
	return e ? structuredClone(e) : null;
}
function K(e) {
	let t = structuredClone(e);
	return delete t.updated_at, JSON.stringify(t);
}
//#endregion
export { W as t };
