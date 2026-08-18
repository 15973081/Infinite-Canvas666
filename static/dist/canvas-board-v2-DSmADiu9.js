import { c as e, i as t, o as n, r, s as i, t as a } from "./jsx-runtime-DYrc4mMT.js";
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
	let t = e.type === "prompt" ? {
		height: 230,
		width: 310
	} : e.type === "loop" ? {
		height: e.showPrompt || e.imageInput ? 390 : 180,
		width: 336
	} : e.type === "promptGroup" ? {
		height: 220,
		width: 260
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
function v({ commit: e, store: n }) {
	let r = t(n, ({ document: e }) => e), i = (0, s.useRef)(null), [a, o] = (0, s.useState)(""), [c, v] = (0, s.useState)(-1), [y, b] = (0, s.useState)(/* @__PURE__ */ new Set()), [x, S] = (0, s.useState)("ready"), [C, w] = (0, s.useState)({
		x: 0,
		y: 0,
		zoom: 1
	}), T = String(r?.id || ""), E = new Map((r?.nodes ?? []).map((e) => [e.id, e]));
	(0, s.useEffect)(() => {
		o(""), v(-1), b(/* @__PURE__ */ new Set());
	}, [T]), (0, s.useEffect)(() => {
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
					let r = n.getState().groupPromptNodes([...y]);
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
			let t = n.getState().groupPromptNodes([...y]);
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
	let D = (t) => {
		a && n.getState().connectNodes(a, t) && e(), o("");
	};
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		"aria-label": "CanvasBoard V2",
		"data-testid": "canvas-board-v2",
		"data-viewport": `${C.x},${C.y},${C.zoom.toFixed(2)}`,
		onPointerDown: (e) => {
			if (e.button !== 0) return;
			let t = e.currentTarget, n = {
				x: e.clientX,
				y: e.clientY,
				viewport: C
			};
			t.setPointerCapture(e.pointerId), b(/* @__PURE__ */ new Set()), v(-1);
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
				transform: `translate(${C.x}px, ${C.y}px) scale(${C.zoom})`,
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
					let n = E.get(e.from), r = E.get(e.to);
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
					className: `node ${t.type}-node sized ${y.has(t.id) ? "selected" : ""}`,
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
							s = !0, n.getState().moveNode(t.id, o.point.x + (e.clientX - o.clientX) / C.zoom, o.point.y + (e.clientY - o.clientY) / C.zoom);
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
							onClick: () => D(t.id),
							onPointerDown: (e) => e.stopPropagation(),
							onPointerUp: () => D(t.id),
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
							}) : t.type === "promptGroup" ? /* @__PURE__ */ (0, l.jsx)(g, {
								node: t,
								nodesById: E
							}) : t.type === "loop" ? /* @__PURE__ */ (0, l.jsx)(_, {
								commit: e,
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
function y(e, t) {
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
		openPromptTemplates(e) {
			window.openPromptTemplateModal?.(e);
		},
		updateNode(e, t) {
			return a.getState().document?.nodes.some((t) => t.id === e) ? (a.getState().updateNode(e, t), g(), !0) : !1;
		}
	}, u.render(/* @__PURE__ */ (0, l.jsx)(v, {
		commit: g,
		store: a
	})), t.hidden = !0, e.hidden = !1, () => {
		f = !0, _ ? window.CanvasBoardV2 = _ : delete window.CanvasBoardV2, window.removeEventListener("canvas-legacy-document", s), u.unmount(), e.hidden = !0, t.hidden = d;
	};
}
//#endregion
export { y as mountCanvasBoardV2 };
