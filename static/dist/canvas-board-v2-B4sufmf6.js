import { c as e, i as t, o as n, r, s as i, t as a } from "./jsx-runtime-D6NhhM0V.js";
import { n as o, o as s, t as c } from "./canvas-repository-H8iEsEgy.js";
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
function p(e) {
	return {
		x: Number(e.x || 0),
		y: Number(e.y || 0)
	};
}
function m(e) {
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
function h(e) {
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
function g(e) {
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
function _({ commit: e, node: t, store: n }) {
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
function v({ node: e, nodesById: t }) {
	let n = Array.isArray(e.items) ? e.items.map((e) => t.get(String(e))).filter((e) => e?.type === "prompt") : [];
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "text-[11px] text-gray-400",
		"data-prompt-count": n.length,
		children: [n.length, " 个提示词已分组"]
	});
}
function y({ commit: e, node: t, store: n }) {
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
var b = [
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
], x = [
	["1k", "1K"],
	["2k", "2K"],
	["4k", "4K"],
	["custom", "自定义"]
];
function S({ ariaLabel: e, onChange: t, options: n, value: r }) {
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
function C({ label: e = "运行", mode: t, node: n }) {
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
var w = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"video",
	"comfy",
	"llm",
	"ltxDirector"
]);
function T(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = /* @__PURE__ */ new Set(), i = e.connections.filter((e) => e.to === t).map((e) => e.from);
	for (; i.length;) {
		let t = i.pop();
		if (!r.has(t)) {
			if (r.add(t), w.has(n.get(t)?.type || "")) return !0;
			e.connections.filter((e) => e.to === t).forEach((e) => i.push(e.from));
		}
	}
	return !1;
}
function E({ document: e, node: t }) {
	let n = T(e, t.id), r = t.runStatus === "failed" && !!t._cascadeFailed;
	return /* @__PURE__ */ (0, d.jsxs)(d.Fragment, { children: [/* @__PURE__ */ (0, d.jsxs)("div", {
		className: "gen-run-row",
		children: [
			/* @__PURE__ */ (0, d.jsx)(C, { node: t }),
			n ? /* @__PURE__ */ (0, d.jsx)(C, {
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
function D(e, t) {
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
async function O(e) {
	return new Promise((t, n) => {
		let r = new Image();
		r.onload = () => t({
			height: r.naturalHeight,
			width: r.naturalWidth
		}), r.onerror = () => n(/* @__PURE__ */ Error("无法读取参考图尺寸")), r.src = e;
	});
}
function k({ document: e, node: t }) {
	let n = e.connections.filter((e) => e.to === t.id).map((t) => e.nodes.find((e) => e.id === t.from)).filter(Boolean).filter((e) => [
		"prompt",
		"promptGroup",
		"loop",
		"llm"
	].includes(e.type)).length, r = D(e, t);
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
function A({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = window.CanvasLegacyBridge, o = (a?.getNodeOptions("generator", "provider", n) ?? []).map((e) => [e.value, e.label]), s = (a?.getNodeOptions("generator", "model", n) ?? []).map((e) => [e.value, e.label]), c = String(n.apiProvider || o[0]?.[0] || ""), l = async () => {
		let e = D(t, n).find((e) => e.kind !== "video" && e.kind !== "audio");
		if (!e) throw Error("请先连接一张参考图");
		let r = await O(e.url);
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
			/* @__PURE__ */ (0, d.jsx)(k, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, d.jsx)(S, {
							ariaLabel: "图片平台",
							onChange: (e) => {
								let t = a?.getNodeOptions("generator", "model", {
									...n,
									apiProvider: e
								}) ?? [];
								i({
									apiProvider: e,
									model: t[0]?.value || ""
								});
							},
							options: o,
							value: c
						}), /* @__PURE__ */ (0, d.jsx)(S, {
							ariaLabel: "图片模型",
							onChange: (e) => i({ model: e }),
							options: s,
							value: String(n.model || "")
						})]
					}),
					/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, d.jsx)(S, {
								ariaLabel: "分辨率",
								onChange: (e) => i({
									resolution: e,
									...e === "custom" ? { ratio: "" } : {}
								}),
								options: x,
								value: String(n.resolution || "1k")
							}),
							/* @__PURE__ */ (0, d.jsx)(S, {
								ariaLabel: "比例",
								onChange: (e) => i({ ratio: e }),
								options: b,
								value: String(n.ratio || "square")
							}),
							/* @__PURE__ */ (0, d.jsx)(S, {
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
								onClick: () => void l().catch((e) => window.alert(e.message)),
								type: "button",
								children: "适配参考图"
							})
						]
					}) : null
				]
			}),
			/* @__PURE__ */ (0, d.jsx)(E, {
				document: t,
				node: n
			})
		]
	});
}
function j({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = window.CanvasLegacyBridge, o = (a?.getNodeOptions("msgen", "model", n) ?? []).map((e) => [e.value, e.label]), s = (a?.getNodeOptions("msgen", "custom-model", n) ?? []).map((e) => [e.value, e.label]), c = a?.getNodeOptions("msgen", "lora", n) ?? [], l = c.find((e) => e.value === n.msLoraId) ?? c[0], u = async () => {
		let e = D(t, n).find((e) => e.kind !== "video" && e.kind !== "audio");
		if (!e) throw Error("请先连接一张参考图");
		let r = await O(e.url);
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
			/* @__PURE__ */ (0, d.jsx)(k, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, d.jsx)("div", {
				className: "ms-model-tabs",
				children: o.map(([e, t]) => /* @__PURE__ */ (0, d.jsx)("button", {
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
			n.msgenModel === "custom" ? /* @__PURE__ */ (0, d.jsx)(S, {
				ariaLabel: "ModelScope 模型",
				onChange: (e) => i({
					msCustomModel: e,
					msLoraEnabled: !1,
					msLoraId: ""
				}),
				options: s,
				value: String(n.msCustomModel || s[0]?.[0] || "")
			}) : null,
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, d.jsx)(S, {
								ariaLabel: "ModelScope 分辨率",
								onChange: (e) => i({
									msResolution: e,
									...e === "custom" ? { msRatio: "" } : {}
								}),
								options: x,
								value: String(n.msResolution || "1k")
							}),
							/* @__PURE__ */ (0, d.jsx)(S, {
								ariaLabel: "ModelScope 比例",
								onChange: (e) => i({ msRatio: e }),
								options: b.filter(([e]) => e !== "source"),
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
								onClick: () => void u().catch((e) => window.alert(e.message)),
								type: "button",
								children: "适配参考图"
							})
						]
					}) : null,
					c.length ? /* @__PURE__ */ (0, d.jsxs)(d.Fragment, { children: [/* @__PURE__ */ (0, d.jsx)("button", {
						className: `setting-check ${n.msLoraEnabled ? "active" : ""}`,
						onClick: () => i({
							msLoraEnabled: !n.msLoraEnabled,
							...n.msLoraEnabled ? {} : {
								msLoraId: l?.value || "",
								msLoraStrength: Number(l?.meta?.strength ?? .8)
							}
						}),
						type: "button",
						children: "启用 LoRA"
					}), n.msLoraEnabled ? /* @__PURE__ */ (0, d.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, d.jsx)(S, {
							ariaLabel: "ModelScope LoRA",
							onChange: (e) => {
								let t = c.find((t) => t.value === e);
								i({
									msLoraId: e,
									msLoraStrength: Number(t?.meta?.strength ?? n.msLoraStrength ?? .8)
								});
							},
							options: c.map((e) => [e.value, e.label]),
							value: String(n.msLoraId || l?.value || "")
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
			/* @__PURE__ */ (0, d.jsx)(E, {
				document: t,
				node: n
			})
		]
	});
}
function M({ commit: e, node: t, store: n }) {
	let r = Array.isArray(t.images) ? t.images : [], i = Array.isArray(t._pending) ? t._pending : [], a = (e) => typeof e == "string" ? e : String(e?.url || ""), o = (i) => {
		n.getState().updateNode(t.id, { images: r.filter((e) => a(e) !== i) }), e();
	}, s = (e) => window.CanvasBoardV2?.openOutputLightbox(t, e);
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "output-grid",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [r.map((e, t) => {
			let n = a(e), r = String(e?.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(n) ? "video" : /\.(mp3|wav|m4a)(\?|$)/i.test(n) ? "audio" : "image"));
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
						onDragStart: (t) => {
							t.dataTransfer.effectAllowed = "copy", t.dataTransfer.setData("application/x-canvas-output-image", JSON.stringify({
								kind: r,
								name: String(e.name || ""),
								url: n
							})), t.dataTransfer.setData("text/uri-list", n);
						},
						src: n
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
		}), i.map((e, t) => /* @__PURE__ */ (0, d.jsxs)("div", {
			className: "output-pending",
			"data-pending-id": String(e.id || ""),
			children: [
				/* @__PURE__ */ (0, d.jsx)("span", { className: "pending-spinner" }),
				/* @__PURE__ */ (0, d.jsx)("span", { children: String(e.label || e.status || "正在生成…") }),
				e.taskId ? /* @__PURE__ */ (0, d.jsx)("small", { children: String(e.taskId) }) : null
			]
		}, String(e.id || t)))]
	});
}
function N({ commit: e, document: t, node: n, store: r }) {
	let [i, a] = (0, l.useState)(String((Array.isArray(n.manualVideoUrls) ? n.manualVideoUrls[0] : "") || "")), [o, s] = (0, l.useState)(!1), c = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, u = window.CanvasLegacyBridge, f = (u?.getNodeOptions("video", "provider", n) ?? []).map((e) => [e.value, e.label]), p = (u?.getNodeOptions("video", "model", n) ?? []).map((e) => [e.value, e.label]);
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, d.jsx)(k, {
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
						children: [/* @__PURE__ */ (0, d.jsx)(S, {
							ariaLabel: "视频平台",
							onChange: (e) => {
								let t = u?.getNodeOptions("video", "model", {
									...n,
									apiProvider: e
								}) ?? [];
								c({
									apiProvider: e,
									model: t[0]?.value || ""
								});
							},
							options: f,
							value: String(n.apiProvider || f[0]?.[0] || "")
						}), /* @__PURE__ */ (0, d.jsx)(S, {
							ariaLabel: "视频模型",
							onChange: (e) => c({ model: e }),
							options: p,
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
							/* @__PURE__ */ (0, d.jsx)(S, {
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
							/* @__PURE__ */ (0, d.jsx)(S, {
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
							/* @__PURE__ */ (0, d.jsx)(S, {
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
			/* @__PURE__ */ (0, d.jsx)(E, {
				document: t,
				node: n
			})
		]
	});
}
function P({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = window.CanvasLegacyBridge, o = (a?.getNodeOptions("llm", "provider", n) ?? []).map((e) => [e.value, e.label]), s = (a?.getNodeOptions("llm", "model", n) ?? []).map((e) => [e.value, e.label]), c = Array.isArray(n.messages) ? n.messages : [];
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "llm-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "llm-row",
				children: [
					/* @__PURE__ */ (0, d.jsx)(S, {
						ariaLabel: "LLM 平台",
						onChange: (e) => {
							let t = a?.getNodeOptions("llm", "model", {
								...n,
								llmProvider: e
							}) ?? [];
							i({
								llmProvider: e,
								model: t[0]?.value || ""
							});
						},
						options: o,
						value: String(n.llmProvider || o[0]?.[0] || "")
					}),
					/* @__PURE__ */ (0, d.jsx)(S, {
						ariaLabel: "LLM 模型",
						onChange: (e) => i({
							model: e,
							...n.llmProvider === "modelscope" ? { llmMsModel: e } : {}
						}),
						options: s,
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
			/* @__PURE__ */ (0, d.jsx)(k, {
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
						children: c.map((e, t) => /* @__PURE__ */ (0, d.jsxs)("div", {
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
					/* @__PURE__ */ (0, d.jsx)(C, {
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
					/* @__PURE__ */ (0, d.jsx)(E, {
						document: t,
						node: n
					})
				]
			})
		]
	});
}
function F(e) {
	return e.type === "image" || e.type === "video" || e.type === "audio" ? e.type : e.type === "textarea" || /prompt|text|提示词|正向|负向/i.test(`${e.input || ""} ${e.name || ""}`) ? "prompt" : "setting";
}
function I({ commit: e, document: t, node: n, store: r }) {
	let [i, a] = (0, l.useState)([]), o = String(n.comfyWorkflow || "");
	(0, l.useEffect)(() => {
		let e = !0;
		if (n.mode !== "custom" || !o) {
			a([]);
			return;
		}
		return window.CanvasLegacyBridge?.getComfyFields(o).then((t) => {
			e && a(t);
		}), () => {
			e = !1;
		};
	}, [n.mode, o]);
	let s = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, c = n.comfyParams && typeof n.comfyParams == "object" ? n.comfyParams : {}, u = n.comfyRandomActive && typeof n.comfyRandomActive == "object" ? n.comfyRandomActive : {}, f = i.filter((e) => F(e) === "setting"), p = i.filter((e) => [
		"audio",
		"image",
		"video"
	].includes(F(e))), m = (window.CanvasLegacyBridge?.getNodeOptions("comfy", "workflow", n) ?? []).map((e) => [e.value, e.label]), h = (t, i, a = !0) => {
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
			/* @__PURE__ */ (0, d.jsx)(k, {
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
					/* @__PURE__ */ (0, d.jsx)(S, {
						ariaLabel: "Comfy 工作流",
						onChange: (e) => s({
							comfyWorkflow: e,
							comfyParams: {},
							comfyRandomActive: {}
						}),
						options: m,
						value: o
					}),
					/* @__PURE__ */ (0, d.jsxs)("div", {
						className: "text-[10px] text-gray-400",
						children: [
							"动态媒体字段 ",
							p.length,
							" · 参数字段 ",
							f.length
						]
					}),
					f.map((t) => {
						let n = String(t.id || ""), r = c[n] ?? t.default ?? "";
						if (t.type === "boolean") return /* @__PURE__ */ (0, d.jsx)("button", {
							className: `setting-check ${r ? "active" : ""}`,
							onClick: () => h(t, !r),
							type: "button",
							children: t.name || n
						}, n);
						if (t.type === "dropdown") return /* @__PURE__ */ (0, d.jsx)(S, {
							ariaLabel: t.name || n,
							onChange: (e) => h(t, e),
							options: (t.options || []).map((e) => [e, e]),
							value: String(r)
						}, n);
						if (t.type === "textarea") return /* @__PURE__ */ (0, d.jsx)("textarea", {
							"aria-label": t.name || n,
							className: "setting-input",
							onBlur: e,
							onChange: (e) => h(t, e.target.value, !1),
							value: String(r)
						}, n);
						let i = /* @__PURE__ */ (0, d.jsx)("input", {
							"aria-label": t.name || n,
							className: "setting-input",
							max: t.max,
							min: t.min,
							onBlur: e,
							onChange: (e) => h(t, t.type === "number" || t.type === "slider" ? Number(e.target.value) : e.target.value, !1),
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
			/* @__PURE__ */ (0, d.jsx)(E, {
				document: t,
				node: n
			})
		]
	});
}
function L({ commit: e, node: t, store: n }) {
	let r = (0, l.useRef)(null);
	(0, l.useEffect)(() => () => {
		r.current?.pause(), r.current?.removeAttribute("src"), r.current?.load();
	}, []);
	let i = async (r) => {
		if (!r.length) return;
		let i = (await window.CanvasLegacyBridge?.uploadMedia(r))?.files ?? [];
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
function R({ node: e, nodesById: t }) {
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
function z({ commit: e, document: t, node: n, store: r }) {
	let i = (0, l.useRef)(null), a = (0, l.useRef)(null);
	(!a.current || a.current.id !== n.id) && (a.current = window.CanvasLegacyBridge?.normalizeLtxNode(n) ?? structuredClone(n)), (0, l.useEffect)(() => {
		let t = i.current, o = window.CanvasLTXTimelineEditor, s = a.current;
		if (!t || !o || !s) return;
		r.getState().updateNode(n.id, s);
		let c = new o(s, t, null), l = () => {
			r.getState().updateNode(n.id, structuredClone(s)), e();
		};
		return c._onCanvasCommit = l, c._onCanvasResize = l, () => c.destroy();
	}, [
		e,
		n.id,
		r
	]);
	let o = (t) => {
		Object.assign(a.current ?? {}, t), r.getState().updateNode(n.id, t), e();
	};
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		className: "ltx-director-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, d.jsx)(k, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, d.jsx)("textarea", {
				"aria-label": "LTX 全局提示词",
				className: "setting-input",
				onBlur: e,
				onChange: (e) => {
					Object.assign(a.current ?? {}, { globalPrompt: e.target.value }), r.getState().updateNode(n.id, { globalPrompt: e.target.value });
				},
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
						onChange: (e) => o({
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
						onChange: (e) => o({
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
						onChange: (e) => o({ frameRate: Math.max(1, Number(e.target.value) || 24) }),
						type: "number",
						value: Number(n.frameRate || 24)
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": "LTX 宽度",
						className: "setting-input",
						min: "0",
						onChange: (e) => o({ customWidth: Math.max(0, Number(e.target.value) || 0) }),
						step: "32",
						type: "number",
						value: Number(n.customWidth || 0)
					}),
					/* @__PURE__ */ (0, d.jsx)("input", {
						"aria-label": "LTX 高度",
						className: "setting-input",
						min: "0",
						onChange: (e) => o({ customHeight: Math.max(0, Number(e.target.value) || 0) }),
						step: "32",
						type: "number",
						value: Number(n.customHeight || 0)
					})
				]
			}),
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "ltx-params-row",
				children: [
					/* @__PURE__ */ (0, d.jsx)(S, {
						ariaLabel: "LTX 时间显示",
						onChange: (e) => o({ displayMode: e }),
						options: [["seconds", "秒"], ["frames", "帧"]],
						value: String(n.displayMode || "seconds")
					}),
					/* @__PURE__ */ (0, d.jsx)("button", {
						className: `setting-check ${n.useCustomAudio ? "active" : ""}`,
						onClick: () => o({ useCustomAudio: !n.useCustomAudio }),
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
			/* @__PURE__ */ (0, d.jsx)("div", {
				className: "ltx-director-timeline-host",
				ref: i,
				children: window.CanvasLTXTimelineEditor ? null : "LTX 时间线脚本未加载"
			}),
			/* @__PURE__ */ (0, d.jsx)(E, {
				document: t,
				node: n
			})
		]
	});
}
function B({ commit: e, store: n }) {
	let r = t(n, ({ document: e }) => e), i = (0, l.useRef)(null), [a, o] = (0, l.useState)(""), [s, c] = (0, l.useState)(-1), [u, b] = (0, l.useState)(/* @__PURE__ */ new Set()), [x, S] = (0, l.useState)("ready"), [C, w] = (0, l.useState)({
		x: 0,
		y: 0,
		zoom: 1
	}), T = String(r?.id || ""), E = new Map((r?.nodes ?? []).map((e) => [e.id, e])), D = {
		connections: r?.connections ?? [],
		nodes: r?.nodes ?? []
	};
	(0, l.useEffect)(() => {
		o(""), c(-1), b(/* @__PURE__ */ new Set());
	}, [T]), (0, l.useEffect)(() => {
		let t = (t) => {
			let r = t.target, a = r?.isContentEditable || r?.matches("input, textarea, select");
			if (t.key === "Escape") {
				o(""), c(-1), b(/* @__PURE__ */ new Set());
				return;
			}
			if (!a) {
				if ((t.ctrlKey || t.metaKey) && t.key.toLowerCase() === "c") {
					i.current = n.getState().copyNodes([...u]);
					return;
				}
				if ((t.ctrlKey || t.metaKey) && t.key.toLowerCase() === "v" && i.current) {
					t.preventDefault();
					let r = n.getState().pasteNodes(i.current);
					r.length && (b(new Set(r)), e());
					return;
				}
				if ((t.ctrlKey || t.metaKey) && t.key.toLowerCase() === "g") {
					t.preventDefault();
					let r = (n.getState().document?.nodes.filter((e) => u.has(e.id)) ?? []).some((e) => e.type === "image") ? n.getState().groupNodes([...u]) : n.getState().groupPromptNodes([...u]);
					r && (b(/* @__PURE__ */ new Set([r])), e());
					return;
				}
				if (t.key === "Delete" || t.key === "Backspace") {
					if (u.size) u.forEach((e) => n.getState().deleteNode(e));
					else if (s >= 0) n.getState().deleteConnection(s);
					else return;
					t.preventDefault(), b(/* @__PURE__ */ new Set()), c(-1), e();
				}
			}
		};
		return window.addEventListener("keydown", t), () => window.removeEventListener("keydown", t);
	}, [
		e,
		s,
		u,
		n
	]), (0, l.useEffect)(() => {
		let t = () => {
			let t = (n.getState().document?.nodes.filter((e) => u.has(e.id)) ?? []).some((e) => e.type === "image") ? n.getState().groupNodes([...u]) : n.getState().groupPromptNodes([...u]);
			t && (b(/* @__PURE__ */ new Set([t])), e());
		};
		return window.addEventListener("canvas-board-v2-group-selected", t), () => window.removeEventListener("canvas-board-v2-group-selected", t);
	}, [
		e,
		u,
		n
	]), (0, l.useEffect)(() => {
		let e = (e) => S(String(e.detail || "ready"));
		return window.addEventListener("canvas-board-v2-save-state", e), () => window.removeEventListener("canvas-board-v2-save-state", e);
	}, []);
	let O = (t) => {
		a && n.getState().connectNodes(a, t) && e(), o("");
	};
	return /* @__PURE__ */ (0, d.jsxs)("div", {
		"aria-label": "CanvasBoard V2",
		"data-testid": "canvas-board-v2",
		"data-viewport": `${C.x},${C.y},${C.zoom.toFixed(2)}`,
		onDragOver: (e) => e.preventDefault(),
		onDrop: (t) => {
			t.preventDefault(), t.stopPropagation();
			let r = t.currentTarget.getBoundingClientRect(), i = {
				x: (t.clientX - r.left - C.x) / C.zoom,
				y: (t.clientY - r.top - C.y) / C.zoom
			}, a = t.dataTransfer.getData("application/x-canvas-output-image");
			if (a) try {
				let t = JSON.parse(a);
				if (t.url) {
					let r = n.getState().addNode("image", i);
					r && (n.getState().updateNode(r, {
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
				viewport: C
			};
			t.setPointerCapture(e.pointerId), b(/* @__PURE__ */ new Set()), c(-1);
			let r = (e) => w((t) => ({
				...t,
				x: n.viewport.x + e.clientX - n.x,
				y: n.viewport.y + e.clientY - n.y
			}));
			t.addEventListener("pointermove", r), t.addEventListener("pointerup", () => t.removeEventListener("pointermove", r), { once: !0 });
		},
		onWheel: (e) => {
			e.preventDefault(), w((t) => ({
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
		children: [/* @__PURE__ */ (0, d.jsx)("div", {
			"aria-live": "polite",
			"data-testid": "canvas-board-v2-save-status",
			style: {
				position: "absolute",
				right: 18,
				top: 74,
				zIndex: 20
			},
			children: x === "saving" ? "正在保存" : x === "error" ? "保存失败，本地修改仍保留" : x === "saved" ? "已保存" : ""
		}), /* @__PURE__ */ (0, d.jsxs)("div", {
			style: {
				height: 4e3,
				position: "absolute",
				transform: `translate(${C.x}px, ${C.y}px) scale(${C.zoom})`,
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
				children: (r?.connections ?? []).map((e, t) => {
					let n = E.get(e.from), r = E.get(e.to);
					if (!n || !r) return null;
					let i = p(n), a = p(r), o = m(n), l = m(r), u = {
						x1: i.x + o.width,
						x2: a.x,
						y1: i.y + o.height / 2,
						y2: a.y + l.height / 2
					};
					return /* @__PURE__ */ (0, d.jsxs)("g", { children: [/* @__PURE__ */ (0, d.jsx)("line", {
						...u,
						stroke: s === t ? "var(--strong)" : "var(--line-2)",
						strokeWidth: "2"
					}), /* @__PURE__ */ (0, d.jsx)("line", {
						...u,
						"data-edge-index": t,
						"data-selected": s === t ? "true" : "false",
						onClick: (e) => {
							e.stopPropagation(), c(t), b(/* @__PURE__ */ new Set());
						},
						onPointerDown: (e) => e.stopPropagation(),
						pointerEvents: "stroke",
						stroke: "rgba(0,0,0,.001)",
						strokeWidth: "16"
					})] }, `${e.from}-${e.to}-${t}`);
				})
			}), (r?.nodes ?? []).map((t) => {
				let r = p(t), i = m(t);
				return /* @__PURE__ */ (0, d.jsxs)("article", {
					"aria-label": `${t.type} ${t.id}`,
					className: `node ${t.type}-node sized ${t.url ? "has-image" : ""} ${u.has(t.id) ? "selected" : ""}`,
					"data-node-id": t.id,
					"data-node-type": t.type,
					onClick: (e) => {
						e.stopPropagation(), c(-1), b((n) => {
							if (!e.ctrlKey && !e.metaKey) return /* @__PURE__ */ new Set([t.id]);
							let r = new Set(n);
							return r.has(t.id) ? r.delete(t.id) : r.add(t.id), r;
						});
					},
					onKeyDown: (e) => {
						(e.key === "Enter" || e.key === " ") && b(/* @__PURE__ */ new Set([t.id]));
					},
					onPointerDown: (i) => {
						if (i.button !== 0 || (i.stopPropagation(), i.ctrlKey || i.metaKey)) return;
						let a = i.currentTarget, o = {
							clientX: i.clientX,
							clientY: i.clientY,
							point: r
						}, s = !1;
						a.setPointerCapture(i.pointerId), c(-1), u.has(t.id) || b(/* @__PURE__ */ new Set([t.id]));
						let l = (e) => {
							s = !0, n.getState().moveNode(t.id, o.point.x + (e.clientX - o.clientX) / C.zoom, o.point.y + (e.clientY - o.clientY) / C.zoom);
						};
						a.addEventListener("pointermove", l), a.addEventListener("pointerup", () => {
							a.removeEventListener("pointermove", l), s && e();
						}, { once: !0 });
					},
					role: "button",
					style: {
						height: i.height,
						left: r.x,
						minHeight: i.height,
						minWidth: i.width,
						top: r.y,
						width: i.width
					},
					tabIndex: 0,
					children: [
						h(t) ? /* @__PURE__ */ (0, d.jsx)("button", {
							"aria-label": `连接到 ${t.id}`,
							className: "port in",
							"data-port": "in",
							onClick: () => O(t.id),
							onPointerDown: (e) => e.stopPropagation(),
							onPointerUp: () => O(t.id),
							type: "button"
						}) : null,
						g(t) ? /* @__PURE__ */ (0, d.jsx)("button", {
							"aria-label": `从 ${t.id} 连线`,
							className: "port out",
							"data-port": "out",
							onClick: () => o(t.id),
							onPointerDown: (e) => {
								e.stopPropagation(), o(t.id);
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
							children: t.type === "prompt" ? /* @__PURE__ */ (0, d.jsx)(_, {
								commit: e,
								node: t,
								store: n
							}) : t.type === "image" ? /* @__PURE__ */ (0, d.jsx)(L, {
								commit: e,
								node: t,
								store: n
							}) : t.type === "group" ? /* @__PURE__ */ (0, d.jsx)(R, {
								node: t,
								nodesById: E
							}) : t.type === "promptGroup" ? /* @__PURE__ */ (0, d.jsx)(v, {
								node: t,
								nodesById: E
							}) : t.type === "loop" ? /* @__PURE__ */ (0, d.jsx)(y, {
								commit: e,
								node: t,
								store: n
							}) : t.type === "generator" ? /* @__PURE__ */ (0, d.jsx)(A, {
								commit: e,
								document: D,
								node: t,
								store: n
							}) : t.type === "msgen" ? /* @__PURE__ */ (0, d.jsx)(j, {
								commit: e,
								document: D,
								node: t,
								store: n
							}) : t.type === "output" ? /* @__PURE__ */ (0, d.jsx)(M, {
								commit: e,
								node: t,
								store: n
							}) : t.type === "video" ? /* @__PURE__ */ (0, d.jsx)(N, {
								commit: e,
								document: D,
								node: t,
								store: n
							}) : t.type === "llm" ? /* @__PURE__ */ (0, d.jsx)(P, {
								commit: e,
								document: D,
								node: t,
								store: n
							}) : t.type === "comfy" ? /* @__PURE__ */ (0, d.jsx)(I, {
								commit: e,
								document: D,
								node: t,
								store: n
							}) : t.type === "ltxDirector" ? /* @__PURE__ */ (0, d.jsx)(z, {
								commit: e,
								document: D,
								node: t,
								store: n
							}) : String(t.title || t.name || t.id)
						})
					]
				}, t.id);
			})]
		})]
	});
}
function V(e, t) {
	let n = window.CanvasLegacyBridge, i = window.CanvasModernCore?.canvasRepository;
	if (!n || !i) throw Error("Canvas V2 dependencies are unavailable");
	let a = r(n.getDocumentSnapshot()), l = a.getState().document, f = (e) => {
		let t = a.getState().document?.id;
		a.getState().adoptDocument(e.detail);
		let n = a.getState().document;
		n?.id !== t && (l = n);
	}, p = (e) => a.getState().projectExecutionDocument(e.detail);
	window.addEventListener("canvas-legacy-document", f), window.addEventListener("canvas-legacy-execution-document", p);
	let m = (0, u.createRoot)(e), h = t.hidden, g = !1, _ = !1, v = !1, y = (t) => {
		e.dataset.saveState = t, window.dispatchEvent(new CustomEvent("canvas-board-v2-save-state", { detail: t }));
	}, b = () => {
		_ = !0, !v && (v = !0, (async () => {
			for (; _ && !g;) {
				_ = !1;
				let e = a.getState().document;
				if (!(!e || typeof e.id != "string")) {
					y("saving");
					try {
						let t = await i.save(e.id, o(e));
						l = t, g || a.getState().acceptSavedDocument(t, e), y("saved");
					} catch (t) {
						if (t instanceof c && t.serverCanvas && l) {
							let n = a.getState().document;
							if (n?.id === e.id) {
								let r = s(l, n, t.serverCanvas);
								if (r.conflicts.length) console.warn("[canvas-modern-core] CanvasBoard V2 save conflict requires resolution", r.conflicts);
								else {
									y("merging"), a.setState({ document: r.document });
									try {
										let t = await i.save(e.id, o(r.document));
										l = t, g || a.getState().acceptSavedDocument(t, r.document), y("saved");
										continue;
									} catch (e) {
										console.warn("[canvas-modern-core] CanvasBoard V2 rebased save failed", e);
									}
								}
							}
						}
						y("error"), console.warn("[canvas-modern-core] CanvasBoard V2 save failed", t);
						break;
					}
				}
			}
			v = !1;
		})());
	}, x = window.CanvasBoardV2;
	return window.CanvasBoardV2 = {
		addNode(e, t) {
			let n = a.getState().addNode(e, t);
			return n && b(), n;
		},
		groupSelected() {
			window.dispatchEvent(new Event("canvas-board-v2-group-selected"));
		},
		async controlExecution(e, t) {
			await n.runCommand(e, { targetId: t });
			let r = n.getDocumentSnapshot();
			r && a.getState().projectDocument(r), b();
		},
		async importFiles(e, t) {
			if (!e.length) return;
			let r = ((await n.uploadMedia(e)).files ?? []).map((e, n) => {
				let r = a.getState().addNode("image", t ? {
					x: t.x + n * 36,
					y: t.y + n * 36
				} : void 0);
				return r && a.getState().updateNode(r, {
					url: e.url || "",
					name: e.name || "media",
					mediaKind: e.kind || "image"
				}), r;
			}).filter(Boolean);
			r.length > 1 && a.getState().groupNodes(r), r.length && b();
		},
		openPromptTemplates(e) {
			window.openPromptTemplateModal?.(e);
		},
		openOutputLightbox(e, t) {
			let r = Array.isArray(e.images) ? e.images.map((e) => typeof e == "string" ? e : String(e.url || "") === t ? {
				...e,
				viewed: !0
			} : e) : [];
			a.getState().updateNode(String(e.id || ""), { images: r }), b(), n.openOutputLightbox(e, t);
		},
		async prepareVideoMedia(e, t, r) {
			let i = a.getState().document;
			if (!i) return;
			let o = await n.prepareVideoMedia(e, i, t, r);
			a.getState().projectDocument(o), b();
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
			let i = a.getState().addNode(r);
			if (!i) return;
			let { id: o, inputs: s, running: c, type: l, x: u, y: d, ...f } = n;
			a.getState().updateNode(i, {
				...f,
				runStatus: void 0,
				runError: ""
			});
			let p = a.getState().document?.nodes.find((e) => e.id === i), m = String(t.prompt || "");
			if (m) {
				let e = a.getState().addNode("prompt", {
					x: Number(p?.x || 0) - 340,
					y: Number(p?.y || 0)
				});
				e && (a.getState().updateNode(e, { text: m }), a.getState().connectNodes(e, i));
			}
			(Array.isArray(t.refs) ? t.refs : []).slice(0, 8).forEach((e, t) => {
				if (!e.url) return;
				let n = a.getState().addNode("image", {
					x: Number(p?.x || 0) - 340,
					y: Number(p?.y || 0) + 110 + t * 86
				});
				n && (a.getState().updateNode(n, {
					mediaKind: e.kind || "image",
					name: e.name || "image",
					url: e.url
				}), a.getState().connectNodes(n, i));
			}), b();
		},
		async runNode(e, t) {
			let r = a.getState().document;
			if (!r) return;
			let i = await n.runNode(e, r, t);
			a.getState().projectDocument(i);
		},
		updateNode(e, t) {
			return a.getState().document?.nodes.some((t) => t.id === e) ? (a.getState().updateNode(e, t), b(), !0) : !1;
		}
	}, m.render(/* @__PURE__ */ (0, d.jsx)(B, {
		commit: b,
		store: a
	})), t.hidden = !0, e.hidden = !1, () => {
		g = !0, x ? window.CanvasBoardV2 = x : delete window.CanvasBoardV2, window.removeEventListener("canvas-legacy-document", f), window.removeEventListener("canvas-legacy-execution-document", p), m.unmount(), e.hidden = !0, t.hidden = h;
	};
}
//#endregion
export { V as mountCanvasBoardV2 };
