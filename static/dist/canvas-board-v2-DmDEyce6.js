import { c as e, i as t, o as n, r, s as i, t as a } from "./jsx-runtime-U2XIESeZ.js";
import { t as o } from "./canvas-repository-qZo_3rR8.js";
//#region src/canvas/ui/canvas-board-v2.tsx
var s = /* @__PURE__ */ e(i(), 1), c = n(), l = a(), u = {
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
function d(e) {
	return {
		x: Number(e.x || 0),
		y: Number(e.y || 0)
	};
}
function f(e) {
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
function p(e) {
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
function m(e) {
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
function h({ commit: e, node: t, store: n }) {
	let r = String(t.text || "");
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		className: "prompt-editor",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [/* @__PURE__ */ (0, l.jsxs)("div", {
			className: "prompt-toolbar",
			children: [/* @__PURE__ */ (0, l.jsx)("button", {
				className: "prompt-template-btn",
				onClick: () => window.CanvasBoardV2?.openPromptTemplates(t.id),
				type: "button",
				children: "模板"
			}), /* @__PURE__ */ (0, l.jsxs)("div", {
				className: `prompt-counter ${r.length > 2e4 ? "over" : ""}`,
				children: [/* @__PURE__ */ (0, l.jsx)("span", { children: r.length.toLocaleString() }), /* @__PURE__ */ (0, l.jsx)("span", { children: "/ 20,000" })]
			})]
		}), /* @__PURE__ */ (0, l.jsx)("textarea", {
			"data-field": "text",
			maxLength: 2e4,
			onBlur: e,
			onChange: (e) => n.getState().updateNode(t.id, { text: e.target.value }),
			placeholder: "输入提示词",
			value: r
		})]
	});
}
function g({ node: e, nodesById: t }) {
	let n = Array.isArray(e.items) ? e.items.map((e) => t.get(String(e))).filter((e) => e?.type === "prompt") : [];
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		className: "text-[11px] text-gray-400",
		"data-prompt-count": n.length,
		children: [n.length, " 个提示词已分组"]
	});
}
function _({ commit: e, node: t, store: n }) {
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
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		className: "loop-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, l.jsxs)("div", {
				className: "loop-count-row",
				children: [/* @__PURE__ */ (0, l.jsxs)("div", {
					className: "loop-run-row",
					children: [/* @__PURE__ */ (0, l.jsxs)("div", {
						className: "loop-count-group",
						children: [/* @__PURE__ */ (0, l.jsx)("span", {
							className: "loop-count-label",
							children: "循环次数"
						}), /* @__PURE__ */ (0, l.jsx)("input", {
							"aria-label": "循环次数",
							className: "loop-count-input",
							max: "100",
							min: "1",
							onBlur: e,
							onChange: (e) => o({ count: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }),
							type: "number",
							value: r
						})]
					}), /* @__PURE__ */ (0, l.jsxs)("div", {
						className: "seg loop-mode",
						children: [/* @__PURE__ */ (0, l.jsx)("button", {
							className: t.mode === "parallel" ? "" : "active",
							onClick: () => o({ mode: "serial" }, !0),
							type: "button",
							children: "串行"
						}), /* @__PURE__ */ (0, l.jsx)("button", {
							className: t.mode === "parallel" ? "active" : "",
							onClick: () => o({ mode: "parallel" }, !0),
							type: "button",
							children: "并行"
						})]
					})]
				}), /* @__PURE__ */ (0, l.jsxs)("div", {
					className: "loop-toggle-row",
					children: [/* @__PURE__ */ (0, l.jsx)("button", {
						className: `loop-toggle loop-image-toggle ${t.imageInput ? "active" : ""}`,
						onClick: () => s("imageInput"),
						type: "button",
						children: "图片输入"
					}), /* @__PURE__ */ (0, l.jsx)("button", {
						className: `loop-toggle loop-prompt-toggle ${t.showPrompt ? "active" : ""}`,
						onClick: () => s("showPrompt"),
						type: "button",
						children: "提示词输入"
					})]
				})]
			}),
			t.imageInput ? /* @__PURE__ */ (0, l.jsx)("div", {
				className: "loop-image-panel",
				children: /* @__PURE__ */ (0, l.jsxs)("div", {
					className: "loop-image-row",
					children: [
						/* @__PURE__ */ (0, l.jsx)("span", {
							className: "loop-count-label",
							children: "起始"
						}),
						/* @__PURE__ */ (0, l.jsx)("input", {
							"aria-label": "图片起始序号",
							className: "loop-count-input",
							min: "1",
							onBlur: e,
							onChange: (e) => o({ loopStart: Math.max(1, Number(e.target.value) || 1) }),
							type: "number",
							value: i
						}),
						/* @__PURE__ */ (0, l.jsx)("span", {
							className: "loop-count-label",
							children: "批量"
						}),
						/* @__PURE__ */ (0, l.jsx)("input", {
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
			t.showPrompt ? /* @__PURE__ */ (0, l.jsxs)("div", {
				className: "loop-prompt-panel",
				children: [/* @__PURE__ */ (0, l.jsx)("div", {
					className: "loop-field",
					children: /* @__PURE__ */ (0, l.jsx)("textarea", {
						"aria-label": "循环变量提示词",
						onBlur: e,
						onChange: (e) => o({ variablePrompt: e.target.value }),
						placeholder: "每轮变化的提示词",
						value: String(t.variablePrompt || "")
					})
				}), /* @__PURE__ */ (0, l.jsxs)("div", {
					className: "loop-start-row",
					children: [
						/* @__PURE__ */ (0, l.jsx)("button", {
							className: "loop-token-btn loop-counter-token-btn",
							onClick: () => o({ variablePrompt: `${String(t.variablePrompt || "")}《计数》` }, !0),
							type: "button",
							children: "计数"
						}),
						/* @__PURE__ */ (0, l.jsx)("span", {
							className: "loop-count-label",
							children: "起始"
						}),
						/* @__PURE__ */ (0, l.jsx)("input", {
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
var v = [
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
], y = [
	["1k", "1K"],
	["2k", "2K"],
	["4k", "4K"],
	["custom", "自定义"]
];
function b({ ariaLabel: e, onChange: t, options: n, value: r }) {
	return /* @__PURE__ */ (0, l.jsxs)("select", {
		"aria-label": e,
		className: "select-lite",
		onChange: (e) => t(e.target.value),
		value: r,
		children: [!n.some(([e]) => e === r) && r ? /* @__PURE__ */ (0, l.jsx)("option", {
			value: r,
			children: r
		}) : null, n.map(([e, t]) => /* @__PURE__ */ (0, l.jsx)("option", {
			value: e,
			children: t
		}, e))]
	});
}
function x({ mode: e, node: t }) {
	let [n, r] = (0, s.useState)(!1);
	return /* @__PURE__ */ (0, l.jsx)("button", {
		className: `gen-btn ${n ? "running" : ""}`,
		disabled: n,
		onClick: async () => {
			r(!0);
			try {
				await window.CanvasBoardV2?.runNode(t.id, e);
			} catch (e) {
				window.alert(e instanceof Error ? e.message : String(e));
			} finally {
				r(!1);
			}
		},
		type: "button",
		children: n ? "运行中…" : "运行"
	});
}
function S({ document: e, node: t }) {
	let n = e.connections.filter((e) => e.to === t.id).map((t) => e.nodes.find((e) => e.id === t.from)).filter(Boolean), r = n.filter((e) => [
		"prompt",
		"promptGroup",
		"loop",
		"llm"
	].includes(e.type)).length, i = n.filter((e) => [
		"image",
		"group",
		"output"
	].includes(e.type)).length;
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		className: "text-[10px] text-gray-400",
		children: [
			"提示词 ",
			r,
			" · 图片/媒体 ",
			i
		]
	});
}
function C({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = window.CanvasLegacyBridge, o = (a?.getNodeOptions("generator", "provider", n) ?? []).map((e) => [e.value, e.label]), s = (a?.getNodeOptions("generator", "model", n) ?? []).map((e) => [e.value, e.label]), c = String(n.apiProvider || o[0]?.[0] || "");
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, l.jsx)(S, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, l.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, l.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, l.jsx)(b, {
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
						}), /* @__PURE__ */ (0, l.jsx)(b, {
							ariaLabel: "图片模型",
							onChange: (e) => i({ model: e }),
							options: s,
							value: String(n.model || "")
						})]
					}),
					/* @__PURE__ */ (0, l.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, l.jsx)(b, {
								ariaLabel: "分辨率",
								onChange: (e) => i({
									resolution: e,
									...e === "custom" ? { ratio: "" } : {}
								}),
								options: y,
								value: String(n.resolution || "1k")
							}),
							/* @__PURE__ */ (0, l.jsx)(b, {
								ariaLabel: "比例",
								onChange: (e) => i({ ratio: e }),
								options: v,
								value: String(n.ratio || "square")
							}),
							/* @__PURE__ */ (0, l.jsx)(b, {
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
							/* @__PURE__ */ (0, l.jsx)("input", {
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
					n.ratio === "custom" ? /* @__PURE__ */ (0, l.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, l.jsx)("input", {
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
						}), /* @__PURE__ */ (0, l.jsx)("input", {
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
					n.resolution === "custom" ? /* @__PURE__ */ (0, l.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, l.jsx)("input", {
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
						}), /* @__PURE__ */ (0, l.jsx)("input", {
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
						})]
					}) : null
				]
			}),
			/* @__PURE__ */ (0, l.jsx)("div", {
				className: "gen-run-row",
				children: /* @__PURE__ */ (0, l.jsx)(x, { node: n })
			})
		]
	});
}
function w({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = (window.CanvasLegacyBridge?.getNodeOptions("msgen", "model", n) ?? []).map((e) => [e.value, e.label]);
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, l.jsx)(S, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, l.jsx)("div", {
				className: "ms-model-tabs",
				children: a.map(([e, t]) => /* @__PURE__ */ (0, l.jsx)("button", {
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
			n.msgenModel === "custom" ? /* @__PURE__ */ (0, l.jsx)("input", {
				"aria-label": "ModelScope 模型",
				className: "setting-input",
				onBlur: e,
				onChange: (e) => r.getState().updateNode(n.id, { msCustomModel: e.target.value }),
				value: String(n.msCustomModel || "")
			}) : null,
			/* @__PURE__ */ (0, l.jsx)("div", {
				className: "gen-settings",
				children: /* @__PURE__ */ (0, l.jsxs)("div", {
					className: "gen-settings-row",
					children: [
						/* @__PURE__ */ (0, l.jsx)(b, {
							ariaLabel: "ModelScope 分辨率",
							onChange: (e) => i({
								msResolution: e,
								...e === "custom" ? { msRatio: "" } : {}
							}),
							options: y,
							value: String(n.msResolution || "1k")
						}),
						/* @__PURE__ */ (0, l.jsx)(b, {
							ariaLabel: "ModelScope 比例",
							onChange: (e) => i({ msRatio: e }),
							options: v.filter(([e]) => e !== "source"),
							value: String(n.msRatio || "square")
						}),
						/* @__PURE__ */ (0, l.jsx)("input", {
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
				})
			}),
			/* @__PURE__ */ (0, l.jsx)("div", {
				className: "gen-run-row",
				children: /* @__PURE__ */ (0, l.jsx)(x, { node: n })
			})
		]
	});
}
function T({ commit: e, node: t, store: n }) {
	let r = Array.isArray(t.images) ? t.images : [], i = (e) => typeof e == "string" ? e : String(e?.url || ""), a = (a) => {
		n.getState().updateNode(t.id, { images: r.filter((e) => i(e) !== a) }), e();
	};
	return /* @__PURE__ */ (0, l.jsx)("div", {
		className: "output-grid",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: r.map((e, t) => {
			let n = i(e), r = String(e?.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(n) ? "video" : /\.(mp3|wav|m4a)(\?|$)/i.test(n) ? "audio" : "image"));
			return /* @__PURE__ */ (0, l.jsxs)("div", {
				className: "output-img-wrap",
				"data-output-url": n,
				children: [
					r === "video" ? /* @__PURE__ */ (0, l.jsx)("video", {
						controls: !0,
						onDoubleClick: () => window.open(n, "_blank", "noopener"),
						preload: "metadata",
						src: n
					}) : r === "audio" ? /* @__PURE__ */ (0, l.jsx)("audio", {
						controls: !0,
						preload: "metadata",
						src: n
					}) : /* @__PURE__ */ (0, l.jsx)("img", {
						alt: "generated output",
						draggable: !0,
						onClick: () => window.open(n, "_blank", "noopener"),
						src: n
					}),
					/* @__PURE__ */ (0, l.jsx)("a", {
						className: "output-download",
						download: !0,
						href: n,
						onClick: (e) => e.stopPropagation(),
						children: "↓"
					}),
					/* @__PURE__ */ (0, l.jsx)("button", {
						"aria-label": "删除输出",
						className: "output-del",
						onClick: () => a(n),
						type: "button",
						children: "×"
					})
				]
			}, `${n}-${t}`);
		})
	});
}
function E({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = window.CanvasLegacyBridge, o = (a?.getNodeOptions("video", "provider", n) ?? []).map((e) => [e.value, e.label]), s = (a?.getNodeOptions("video", "model", n) ?? []).map((e) => [e.value, e.label]);
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, l.jsx)(S, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, l.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, l.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, l.jsx)(b, {
							ariaLabel: "视频平台",
							onChange: (e) => {
								let t = a?.getNodeOptions("video", "model", {
									...n,
									apiProvider: e
								}) ?? [];
								i({
									apiProvider: e,
									model: t[0]?.value || ""
								});
							},
							options: o,
							value: String(n.apiProvider || o[0]?.[0] || "")
						}), /* @__PURE__ */ (0, l.jsx)(b, {
							ariaLabel: "视频模型",
							onChange: (e) => i({ model: e }),
							options: s,
							value: String(n.model || "")
						})]
					}),
					/* @__PURE__ */ (0, l.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, l.jsx)("input", {
								"aria-label": "视频时长",
								className: "setting-input",
								max: "60",
								min: "-1",
								onBlur: e,
								onChange: (e) => r.getState().updateNode(n.id, { duration: Math.max(-1, Math.min(60, Number(e.target.value) || 5)) }),
								type: "number",
								value: Number(n.duration ?? 5)
							}),
							/* @__PURE__ */ (0, l.jsx)(b, {
								ariaLabel: "视频比例",
								onChange: (e) => i({ aspectRatio: e }),
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
							/* @__PURE__ */ (0, l.jsx)(b, {
								ariaLabel: "视频分辨率",
								onChange: (e) => i({ resolution: e }),
								options: [
									"",
									"480p",
									"720p",
									"1080p",
									"780P"
								].map((e) => [e, e || "Auto"]),
								value: String(n.resolution || "")
							}),
							/* @__PURE__ */ (0, l.jsx)(b, {
								ariaLabel: "视频任务模式",
								onChange: (e) => i({ taskMode: e }),
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
					/* @__PURE__ */ (0, l.jsx)("div", {
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
						].map(([e, t]) => /* @__PURE__ */ (0, l.jsxs)("button", {
							className: `setting-check ${n[e] ? "active" : ""}`,
							onClick: () => i({
								[e]: !n[e],
								...e === "multimodal" && !n[e] ? { useFrameRoles: !1 } : e === "useFrameRoles" && !n[e] ? { multimodal: !1 } : {}
							}),
							type: "button",
							children: [/* @__PURE__ */ (0, l.jsx)("span", { className: "check-dot" }), t]
						}, e))
					})
				]
			}),
			/* @__PURE__ */ (0, l.jsx)("div", {
				className: "gen-run-row",
				children: /* @__PURE__ */ (0, l.jsx)(x, { node: n })
			})
		]
	});
}
function D({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = window.CanvasLegacyBridge, o = (a?.getNodeOptions("llm", "provider", n) ?? []).map((e) => [e.value, e.label]), s = (a?.getNodeOptions("llm", "model", n) ?? []).map((e) => [e.value, e.label]), c = Array.isArray(n.messages) ? n.messages : [];
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		className: "llm-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, l.jsxs)("div", {
				className: "llm-row",
				children: [
					/* @__PURE__ */ (0, l.jsx)(b, {
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
					/* @__PURE__ */ (0, l.jsx)(b, {
						ariaLabel: "LLM 模型",
						onChange: (e) => i({
							model: e,
							...n.llmProvider === "modelscope" ? { llmMsModel: e } : {}
						}),
						options: s,
						value: String(n.model || "")
					}),
					/* @__PURE__ */ (0, l.jsxs)("div", {
						className: "llm-mode",
						children: [/* @__PURE__ */ (0, l.jsx)("button", {
							className: n.mode === "chat" ? "" : "active",
							onClick: () => i({ mode: "node" }),
							type: "button",
							children: "节点"
						}), /* @__PURE__ */ (0, l.jsx)("button", {
							className: n.mode === "chat" ? "active" : "",
							onClick: () => i({ mode: "chat" }),
							type: "button",
							children: "聊天"
						})]
					}),
					/* @__PURE__ */ (0, l.jsx)("button", {
						className: `llm-sys-toggle ${n.showSystem ? "active" : ""}`,
						onClick: () => i({ showSystem: !n.showSystem }),
						type: "button",
						children: "System"
					})
				]
			}),
			/* @__PURE__ */ (0, l.jsx)(S, {
				document: t,
				node: n
			}),
			n.showSystem ? /* @__PURE__ */ (0, l.jsx)("textarea", {
				"aria-label": "系统提示词",
				className: "llm-system",
				onBlur: e,
				onChange: (e) => r.getState().updateNode(n.id, { systemPrompt: e.target.value }),
				value: String(n.systemPrompt || "")
			}) : null,
			n.mode === "chat" ? /* @__PURE__ */ (0, l.jsxs)("div", {
				className: "llm-chat-pane",
				children: [
					/* @__PURE__ */ (0, l.jsx)("div", {
						className: "llm-chat-log",
						children: c.map((e, t) => /* @__PURE__ */ (0, l.jsx)("div", {
							className: `llm-bubble ${e.role === "user" ? "user" : "assistant"}`,
							children: e.content
						}, t))
					}),
					/* @__PURE__ */ (0, l.jsx)("textarea", {
						"aria-label": "聊天输入",
						className: "llm-chat-input",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { chatInput: e.target.value }),
						value: String(n.chatInput || "")
					}),
					/* @__PURE__ */ (0, l.jsx)(x, {
						mode: "chat",
						node: n
					})
				]
			}) : /* @__PURE__ */ (0, l.jsxs)("div", {
				className: "llm-node-pane",
				children: [
					/* @__PURE__ */ (0, l.jsx)("div", {
						className: "llm-pane-label",
						children: "Input"
					}),
					/* @__PURE__ */ (0, l.jsx)("textarea", {
						"aria-label": "LLM 输入",
						className: "llm-input-area llm-input-output",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { userInput: e.target.value }),
						value: String(n.userInput || "")
					}),
					/* @__PURE__ */ (0, l.jsx)("div", {
						className: "llm-pane-label",
						children: "Output"
					}),
					/* @__PURE__ */ (0, l.jsxs)("div", {
						className: "llm-output-wrap",
						children: [/* @__PURE__ */ (0, l.jsx)("button", {
							"aria-label": "复制 LLM 输出",
							className: "llm-copy-btn",
							onClick: () => navigator.clipboard.writeText(String(n.outputText || "")),
							type: "button",
							children: "复制"
						}), /* @__PURE__ */ (0, l.jsx)("div", {
							className: "llm-output",
							children: String(n.outputText || "暂无输出")
						})]
					}),
					/* @__PURE__ */ (0, l.jsx)("div", {
						className: "gen-run-row",
						children: /* @__PURE__ */ (0, l.jsx)(x, { node: n })
					})
				]
			})
		]
	});
}
function O({ commit: e, document: t, node: n, store: r }) {
	let [i, a] = (0, s.useState)([]), o = String(n.comfyWorkflow || "");
	(0, s.useEffect)(() => {
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
	let c = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, u = n.comfyParams && typeof n.comfyParams == "object" ? n.comfyParams : {}, d = (window.CanvasLegacyBridge?.getNodeOptions("comfy", "workflow", n) ?? []).map((e) => [e.value, e.label]), f = (t, i, a = !0) => {
		r.getState().updateNode(n.id, { comfyParams: {
			...u,
			[String(t.id)]: i
		} }), a && e();
	};
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		className: "comfy-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, l.jsx)("div", {
				className: "mode-tabs",
				children: [
					["text", "文生图"],
					["enhance", "增强"],
					["edit", "编辑"],
					["custom", "工作流"]
				].map(([e, t]) => /* @__PURE__ */ (0, l.jsx)("button", {
					className: n.mode === e ? "active" : "",
					onClick: () => c({ mode: e }),
					type: "button",
					children: t
				}, e))
			}),
			/* @__PURE__ */ (0, l.jsx)(S, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, l.jsx)("div", {
				className: "gen-settings comfy-settings",
				children: n.mode === "text" ? /* @__PURE__ */ (0, l.jsxs)("div", {
					className: "gen-settings-row",
					children: [/* @__PURE__ */ (0, l.jsx)("input", {
						"aria-label": "Comfy 宽度",
						className: "setting-input",
						min: "64",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { width: Number(e.target.value) || 1024 }),
						step: "64",
						type: "number",
						value: Number(n.width || 1024)
					}), /* @__PURE__ */ (0, l.jsx)("input", {
						"aria-label": "Comfy 高度",
						className: "setting-input",
						min: "64",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { height: Number(e.target.value) || 1024 }),
						step: "64",
						type: "number",
						value: Number(n.height || 1024)
					})]
				}) : n.mode === "enhance" ? /* @__PURE__ */ (0, l.jsxs)(l.Fragment, { children: [/* @__PURE__ */ (0, l.jsx)("input", {
					"aria-label": "增强强度",
					className: "canvas-range",
					max: "1",
					min: "0.1",
					onChange: (e) => r.getState().updateNode(n.id, { enhanceStrength: Number(e.target.value) }),
					onPointerUp: e,
					step: "0.05",
					type: "range",
					value: Number(n.enhanceStrength ?? .5)
				}), /* @__PURE__ */ (0, l.jsx)("button", {
					className: `setting-check ${n.enhanceUpscale ? "active" : ""}`,
					onClick: () => c({ enhanceUpscale: !n.enhanceUpscale }),
					type: "button",
					children: "超分辨率"
				})] }) : n.mode === "edit" ? /* @__PURE__ */ (0, l.jsx)("button", {
					className: `setting-check ${n.editUpscale ? "active" : ""}`,
					onClick: () => c({ editUpscale: !n.editUpscale }),
					type: "button",
					children: "超分辨率"
				}) : /* @__PURE__ */ (0, l.jsxs)(l.Fragment, { children: [/* @__PURE__ */ (0, l.jsx)(b, {
					ariaLabel: "Comfy 工作流",
					onChange: (e) => c({
						comfyWorkflow: e,
						comfyParams: {}
					}),
					options: d,
					value: o
				}), i.map((t) => {
					let n = String(t.id || ""), r = u[n] ?? t.default ?? "";
					return t.type === "boolean" ? /* @__PURE__ */ (0, l.jsx)("button", {
						className: `setting-check ${r ? "active" : ""}`,
						onClick: () => f(t, !r),
						type: "button",
						children: t.name || n
					}, n) : t.type === "dropdown" ? /* @__PURE__ */ (0, l.jsx)(b, {
						ariaLabel: t.name || n,
						onChange: (e) => f(t, e),
						options: (t.options || []).map((e) => [e, e]),
						value: String(r)
					}, n) : t.type === "textarea" ? /* @__PURE__ */ (0, l.jsx)("textarea", {
						"aria-label": t.name || n,
						className: "setting-input",
						onBlur: e,
						onChange: (e) => f(t, e.target.value, !1),
						value: String(r)
					}, n) : /* @__PURE__ */ (0, l.jsx)("input", {
						"aria-label": t.name || n,
						className: "setting-input",
						max: t.max,
						min: t.min,
						onBlur: e,
						onChange: (e) => f(t, t.type === "number" || t.type === "slider" ? Number(e.target.value) : e.target.value, !1),
						step: t.step,
						type: t.type === "number" || t.type === "slider" ? "number" : "text",
						value: String(r)
					}, n);
				})] })
			}),
			/* @__PURE__ */ (0, l.jsx)("div", {
				className: "gen-run-row",
				children: /* @__PURE__ */ (0, l.jsx)(x, { node: n })
			})
		]
	});
}
function k({ commit: e, node: t, store: n }) {
	let r = (0, s.useRef)(null);
	(0, s.useEffect)(() => () => {
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
	return a ? /* @__PURE__ */ (0, l.jsxs)("div", {
		className: "image-preview-wrap",
		onClick: (e) => e.stopPropagation(),
		onDoubleClick: () => window.open(a, "_blank", "noopener"),
		onDragOver: (e) => e.preventDefault(),
		onDrop: (e) => {
			e.preventDefault(), i([...e.dataTransfer.files]);
		},
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			o === "video" ? /* @__PURE__ */ (0, l.jsx)("video", {
				controls: !0,
				preload: "metadata",
				ref: (e) => {
					r.current = e;
				},
				src: a
			}) : o === "audio" ? /* @__PURE__ */ (0, l.jsx)("audio", {
				controls: !0,
				preload: "metadata",
				ref: (e) => {
					r.current = e;
				},
				src: a
			}) : /* @__PURE__ */ (0, l.jsx)("img", {
				alt: String(t.name || "image"),
				draggable: !0,
				src: a
			}),
			/* @__PURE__ */ (0, l.jsx)("div", {
				className: "image-caption text-[11px] text-gray-400 truncate",
				children: String(t.name || o)
			}),
			/* @__PURE__ */ (0, l.jsx)("button", {
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
	}) : /* @__PURE__ */ (0, l.jsxs)("label", {
		className: "blank-image",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: ["选择或拖入媒体", /* @__PURE__ */ (0, l.jsx)("input", {
			accept: "image/*,video/*,audio/*",
			hidden: !0,
			multiple: !0,
			onChange: (e) => void i([...e.target.files ?? []]),
			type: "file"
		})]
	});
}
function A({ node: e, nodesById: t }) {
	let n = Array.isArray(e.items) ? e.items.map((e) => t.get(String(e))).filter(Boolean) : [], r = n.filter((e) => e.type === "image" && e.url);
	return /* @__PURE__ */ (0, l.jsxs)("div", { children: [/* @__PURE__ */ (0, l.jsxs)("div", {
		className: "text-[11px] text-gray-400",
		children: [
			r.length,
			" 个媒体 · ",
			n.filter((e) => e.type === "prompt").length,
			" 个提示词"
		]
	}), r.length ? /* @__PURE__ */ (0, l.jsx)("div", {
		className: "output-grid",
		children: r.slice(0, 6).map((e) => /* @__PURE__ */ (0, l.jsx)("img", {
			alt: String(e.name || "media"),
			onDoubleClick: () => window.open(String(e.url), "_blank", "noopener"),
			src: String(e.url)
		}, e.id))
	}) : null] });
}
function j({ commit: e, document: t, node: n, store: r }) {
	let i = (0, s.useRef)(null), a = (0, s.useRef)(null);
	(!a.current || a.current.id !== n.id) && (a.current = window.CanvasLegacyBridge?.normalizeLtxNode(n) ?? structuredClone(n)), (0, s.useEffect)(() => {
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
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		className: "ltx-director-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, l.jsx)(S, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, l.jsxs)("div", {
				className: "ltx-params-row",
				children: [
					/* @__PURE__ */ (0, l.jsx)("input", {
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
					/* @__PURE__ */ (0, l.jsx)("input", {
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
					/* @__PURE__ */ (0, l.jsx)("input", {
						"aria-label": "LTX FPS",
						className: "setting-input",
						min: "1",
						onChange: (e) => o({ frameRate: Math.max(1, Number(e.target.value) || 24) }),
						type: "number",
						value: Number(n.frameRate || 24)
					}),
					/* @__PURE__ */ (0, l.jsx)("input", {
						"aria-label": "LTX 宽度",
						className: "setting-input",
						min: "0",
						onChange: (e) => o({ customWidth: Math.max(0, Number(e.target.value) || 0) }),
						step: "32",
						type: "number",
						value: Number(n.customWidth || 0)
					}),
					/* @__PURE__ */ (0, l.jsx)("input", {
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
			/* @__PURE__ */ (0, l.jsx)("div", {
				className: "ltx-director-timeline-host",
				ref: i,
				children: window.CanvasLTXTimelineEditor ? null : "LTX 时间线脚本未加载"
			}),
			/* @__PURE__ */ (0, l.jsx)("div", {
				className: "gen-run-row",
				children: /* @__PURE__ */ (0, l.jsx)(x, { node: n })
			})
		]
	});
}
function M({ commit: e, store: n }) {
	let r = t(n, ({ document: e }) => e), i = (0, s.useRef)(null), [a, o] = (0, s.useState)(""), [c, v] = (0, s.useState)(-1), [y, b] = (0, s.useState)(/* @__PURE__ */ new Set()), [x, S] = (0, s.useState)("ready"), [M, N] = (0, s.useState)({
		x: 0,
		y: 0,
		zoom: 1
	}), P = String(r?.id || ""), F = new Map((r?.nodes ?? []).map((e) => [e.id, e])), I = {
		connections: r?.connections ?? [],
		nodes: r?.nodes ?? []
	};
	(0, s.useEffect)(() => {
		o(""), v(-1), b(/* @__PURE__ */ new Set());
	}, [P]), (0, s.useEffect)(() => {
		let t = (t) => {
			let r = t.target, a = r?.isContentEditable || r?.matches("input, textarea, select");
			if (t.key === "Escape") {
				o(""), v(-1), b(/* @__PURE__ */ new Set());
				return;
			}
			if (!a) {
				if ((t.ctrlKey || t.metaKey) && t.key.toLowerCase() === "c") {
					i.current = n.getState().copyNodes([...y]);
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
					let r = (n.getState().document?.nodes.filter((e) => y.has(e.id)) ?? []).some((e) => e.type === "image") ? n.getState().groupNodes([...y]) : n.getState().groupPromptNodes([...y]);
					r && (b(/* @__PURE__ */ new Set([r])), e());
					return;
				}
				if (t.key === "Delete" || t.key === "Backspace") {
					if (y.size) y.forEach((e) => n.getState().deleteNode(e));
					else if (c >= 0) n.getState().deleteConnection(c);
					else return;
					t.preventDefault(), b(/* @__PURE__ */ new Set()), v(-1), e();
				}
			}
		};
		return window.addEventListener("keydown", t), () => window.removeEventListener("keydown", t);
	}, [
		e,
		c,
		y,
		n
	]), (0, s.useEffect)(() => {
		let t = () => {
			let t = (n.getState().document?.nodes.filter((e) => y.has(e.id)) ?? []).some((e) => e.type === "image") ? n.getState().groupNodes([...y]) : n.getState().groupPromptNodes([...y]);
			t && (b(/* @__PURE__ */ new Set([t])), e());
		};
		return window.addEventListener("canvas-board-v2-group-selected", t), () => window.removeEventListener("canvas-board-v2-group-selected", t);
	}, [
		e,
		y,
		n
	]), (0, s.useEffect)(() => {
		let e = (e) => S(String(e.detail || "ready"));
		return window.addEventListener("canvas-board-v2-save-state", e), () => window.removeEventListener("canvas-board-v2-save-state", e);
	}, []);
	let L = (t) => {
		a && n.getState().connectNodes(a, t) && e(), o("");
	};
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		"aria-label": "CanvasBoard V2",
		"data-testid": "canvas-board-v2",
		"data-viewport": `${M.x},${M.y},${M.zoom.toFixed(2)}`,
		onDragOver: (e) => e.preventDefault(),
		onDrop: (e) => {
			e.preventDefault(), e.stopPropagation();
			let t = e.currentTarget.getBoundingClientRect(), n = {
				x: (e.clientX - t.left - M.x) / M.zoom,
				y: (e.clientY - t.top - M.y) / M.zoom
			}, r = [...e.dataTransfer.files].filter((e) => /^(image|video|audio)\//.test(e.type));
			r.length && window.CanvasBoardV2?.importFiles(r, n);
		},
		onPointerDown: (e) => {
			if (e.button !== 0) return;
			let t = e.currentTarget, n = {
				x: e.clientX,
				y: e.clientY,
				viewport: M
			};
			t.setPointerCapture(e.pointerId), b(/* @__PURE__ */ new Set()), v(-1);
			let r = (e) => N((t) => ({
				...t,
				x: n.viewport.x + e.clientX - n.x,
				y: n.viewport.y + e.clientY - n.y
			}));
			t.addEventListener("pointermove", r), t.addEventListener("pointerup", () => t.removeEventListener("pointermove", r), { once: !0 });
		},
		onWheel: (e) => {
			e.preventDefault(), N((t) => ({
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
		children: [/* @__PURE__ */ (0, l.jsx)("div", {
			"aria-live": "polite",
			"data-testid": "canvas-board-v2-save-status",
			style: {
				position: "absolute",
				right: 18,
				top: 74,
				zIndex: 20
			},
			children: x === "saving" ? "正在保存" : x === "error" ? "保存失败，本地修改仍保留" : x === "saved" ? "已保存" : ""
		}), /* @__PURE__ */ (0, l.jsxs)("div", {
			style: {
				height: 4e3,
				position: "absolute",
				transform: `translate(${M.x}px, ${M.y}px) scale(${M.zoom})`,
				transformOrigin: "0 0",
				width: 6e3
			},
			children: [/* @__PURE__ */ (0, l.jsx)("svg", {
				height: "4000",
				style: {
					inset: 0,
					overflow: "visible",
					position: "absolute"
				},
				width: "6000",
				children: (r?.connections ?? []).map((e, t) => {
					let n = F.get(e.from), r = F.get(e.to);
					if (!n || !r) return null;
					let i = d(n), a = d(r), o = f(n), s = f(r), u = {
						x1: i.x + o.width,
						x2: a.x,
						y1: i.y + o.height / 2,
						y2: a.y + s.height / 2
					};
					return /* @__PURE__ */ (0, l.jsxs)("g", { children: [/* @__PURE__ */ (0, l.jsx)("line", {
						...u,
						stroke: c === t ? "var(--strong)" : "var(--line-2)",
						strokeWidth: "2"
					}), /* @__PURE__ */ (0, l.jsx)("line", {
						...u,
						"data-edge-index": t,
						"data-selected": c === t ? "true" : "false",
						onClick: (e) => {
							e.stopPropagation(), v(t), b(/* @__PURE__ */ new Set());
						},
						onPointerDown: (e) => e.stopPropagation(),
						pointerEvents: "stroke",
						stroke: "rgba(0,0,0,.001)",
						strokeWidth: "16"
					})] }, `${e.from}-${e.to}-${t}`);
				})
			}), (r?.nodes ?? []).map((t) => {
				let r = d(t), i = f(t);
				return /* @__PURE__ */ (0, l.jsxs)("article", {
					"aria-label": `${t.type} ${t.id}`,
					className: `node ${t.type}-node sized ${t.url ? "has-image" : ""} ${y.has(t.id) ? "selected" : ""}`,
					"data-node-id": t.id,
					"data-node-type": t.type,
					onClick: (e) => {
						e.stopPropagation(), v(-1), b((n) => {
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
						a.setPointerCapture(i.pointerId), v(-1), y.has(t.id) || b(/* @__PURE__ */ new Set([t.id]));
						let c = (e) => {
							s = !0, n.getState().moveNode(t.id, o.point.x + (e.clientX - o.clientX) / M.zoom, o.point.y + (e.clientY - o.clientY) / M.zoom);
						};
						a.addEventListener("pointermove", c), a.addEventListener("pointerup", () => {
							a.removeEventListener("pointermove", c), s && e();
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
						p(t) ? /* @__PURE__ */ (0, l.jsx)("button", {
							"aria-label": `连接到 ${t.id}`,
							className: "port in",
							"data-port": "in",
							onClick: () => L(t.id),
							onPointerDown: (e) => e.stopPropagation(),
							onPointerUp: () => L(t.id),
							type: "button"
						}) : null,
						m(t) ? /* @__PURE__ */ (0, l.jsx)("button", {
							"aria-label": `从 ${t.id} 连线`,
							className: "port out",
							"data-port": "out",
							onClick: () => o(t.id),
							onPointerDown: (e) => {
								e.stopPropagation(), o(t.id);
							},
							type: "button"
						}) : null,
						/* @__PURE__ */ (0, l.jsx)("header", {
							className: "node-head",
							children: /* @__PURE__ */ (0, l.jsx)("strong", {
								className: "node-title",
								children: u[t.type] ?? t.type
							})
						}),
						/* @__PURE__ */ (0, l.jsx)("div", {
							className: "node-body",
							children: t.type === "prompt" ? /* @__PURE__ */ (0, l.jsx)(h, {
								commit: e,
								node: t,
								store: n
							}) : t.type === "image" ? /* @__PURE__ */ (0, l.jsx)(k, {
								commit: e,
								node: t,
								store: n
							}) : t.type === "group" ? /* @__PURE__ */ (0, l.jsx)(A, {
								node: t,
								nodesById: F
							}) : t.type === "promptGroup" ? /* @__PURE__ */ (0, l.jsx)(g, {
								node: t,
								nodesById: F
							}) : t.type === "loop" ? /* @__PURE__ */ (0, l.jsx)(_, {
								commit: e,
								node: t,
								store: n
							}) : t.type === "generator" ? /* @__PURE__ */ (0, l.jsx)(C, {
								commit: e,
								document: I,
								node: t,
								store: n
							}) : t.type === "msgen" ? /* @__PURE__ */ (0, l.jsx)(w, {
								commit: e,
								document: I,
								node: t,
								store: n
							}) : t.type === "output" ? /* @__PURE__ */ (0, l.jsx)(T, {
								commit: e,
								node: t,
								store: n
							}) : t.type === "video" ? /* @__PURE__ */ (0, l.jsx)(E, {
								commit: e,
								document: I,
								node: t,
								store: n
							}) : t.type === "llm" ? /* @__PURE__ */ (0, l.jsx)(D, {
								commit: e,
								document: I,
								node: t,
								store: n
							}) : t.type === "comfy" ? /* @__PURE__ */ (0, l.jsx)(O, {
								commit: e,
								document: I,
								node: t,
								store: n
							}) : t.type === "ltxDirector" ? /* @__PURE__ */ (0, l.jsx)(j, {
								commit: e,
								document: I,
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
function N(e, t) {
	let n = window.CanvasLegacyBridge, i = window.CanvasModernCore?.canvasRepository;
	if (!n || !i) throw Error("Canvas V2 dependencies are unavailable");
	let a = r(n.getDocumentSnapshot()), s = (e) => a.getState().adoptDocument(e.detail);
	window.addEventListener("canvas-legacy-document", s);
	let u = (0, c.createRoot)(e), d = t.hidden, f = !1, p = !1, m = !1, h = (t) => {
		e.dataset.saveState = t, window.dispatchEvent(new CustomEvent("canvas-board-v2-save-state", { detail: t }));
	}, g = () => {
		p = !0, !m && (m = !0, (async () => {
			for (; p && !f;) {
				p = !1;
				let e = a.getState().document;
				if (!(!e || typeof e.id != "string")) {
					h("saving");
					try {
						let t = await i.save(e.id, o(e));
						f || a.getState().acceptSavedDocument(t, e), h("saved");
					} catch (e) {
						h("error"), console.warn("[canvas-modern-core] CanvasBoard V2 save failed", e);
						break;
					}
				}
			}
			m = !1;
		})());
	}, _ = window.CanvasBoardV2;
	return window.CanvasBoardV2 = {
		addNode(e, t) {
			let n = a.getState().addNode(e, t);
			return n && g(), n;
		},
		groupSelected() {
			window.dispatchEvent(new Event("canvas-board-v2-group-selected"));
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
			r.length > 1 && a.getState().groupNodes(r), r.length && g();
		},
		openPromptTemplates(e) {
			window.openPromptTemplateModal?.(e);
		},
		async runNode(e, t) {
			let r = a.getState().document;
			if (!r) return;
			let i = await n.runNode(e, r, t);
			a.getState().projectDocument(i);
		},
		updateNode(e, t) {
			return a.getState().document?.nodes.some((t) => t.id === e) ? (a.getState().updateNode(e, t), g(), !0) : !1;
		}
	}, u.render(/* @__PURE__ */ (0, l.jsx)(M, {
		commit: g,
		store: a
	})), t.hidden = !0, e.hidden = !1, () => {
		f = !0, _ ? window.CanvasBoardV2 = _ : delete window.CanvasBoardV2, window.removeEventListener("canvas-legacy-document", s), u.unmount(), e.hidden = !0, t.hidden = d;
	};
}
//#endregion
export { N as mountCanvasBoardV2 };
