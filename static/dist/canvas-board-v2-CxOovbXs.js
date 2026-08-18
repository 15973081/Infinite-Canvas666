import { c as e, i as t, o as n, r, s as i, t as a } from "./jsx-runtime-wjSux2PQ.js";
import { t as o } from "./canvas-repository-CzEg4emL.js";
//#region src/canvas/ui/canvas-board-v2.tsx
var s = /* @__PURE__ */ e(i(), 1), c = n(), l = a(), u = {
	height: 110,
	width: 240
}, d = {
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
function f(e) {
	return {
		x: Number(e.x || 0),
		y: Number(e.y || 0)
	};
}
function p({ commit: e, store: n }) {
	let r = t(n, ({ document: e }) => e), [i, a] = (0, s.useState)(""), [o, c] = (0, s.useState)(-1), [p, m] = (0, s.useState)(""), [h, g] = (0, s.useState)("ready"), [_, v] = (0, s.useState)({
		x: 0,
		y: 0,
		zoom: 1
	}), y = String(r?.id || ""), b = new Map((r?.nodes ?? []).map((e) => [e.id, e]));
	(0, s.useEffect)(() => {
		a(""), c(-1), m("");
	}, [y]), (0, s.useEffect)(() => {
		let t = (t) => {
			if (t.key === "Escape") {
				a(""), c(-1), m("");
				return;
			}
			if (t.key === "Delete" || t.key === "Backspace") {
				if (p) n.getState().deleteNode(p);
				else if (o >= 0) n.getState().deleteConnection(o);
				else return;
				t.preventDefault(), m(""), c(-1), e();
			}
		};
		return window.addEventListener("keydown", t), () => window.removeEventListener("keydown", t);
	}, [
		e,
		o,
		p,
		n
	]), (0, s.useEffect)(() => {
		let e = (e) => g(String(e.detail || "ready"));
		return window.addEventListener("canvas-board-v2-save-state", e), () => window.removeEventListener("canvas-board-v2-save-state", e);
	}, []);
	let x = (t) => {
		i && n.getState().connectNodes(i, t) && e(), a("");
	};
	return /* @__PURE__ */ (0, l.jsxs)("div", {
		"aria-label": "CanvasBoard V2",
		"data-testid": "canvas-board-v2",
		"data-viewport": `${_.x},${_.y},${_.zoom.toFixed(2)}`,
		onPointerDown: (e) => {
			if (e.button !== 0) return;
			let t = e.currentTarget, n = {
				x: e.clientX,
				y: e.clientY,
				viewport: _
			};
			t.setPointerCapture(e.pointerId), m(""), c(-1);
			let r = (e) => v((t) => ({
				...t,
				x: n.viewport.x + e.clientX - n.x,
				y: n.viewport.y + e.clientY - n.y
			}));
			t.addEventListener("pointermove", r), t.addEventListener("pointerup", () => t.removeEventListener("pointermove", r), { once: !0 });
		},
		onWheel: (e) => {
			e.preventDefault(), v((t) => ({
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
			children: h === "saving" ? "正在保存" : h === "error" ? "保存失败，本地修改仍保留" : h === "saved" ? "已保存" : ""
		}), /* @__PURE__ */ (0, l.jsxs)("div", {
			style: {
				height: 4e3,
				position: "absolute",
				transform: `translate(${_.x}px, ${_.y}px) scale(${_.zoom})`,
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
					let n = b.get(e.from), r = b.get(e.to);
					if (!n || !r) return null;
					let i = f(n), a = f(r), s = {
						x1: i.x + u.width,
						x2: a.x,
						y1: i.y + u.height / 2,
						y2: a.y + u.height / 2
					};
					return /* @__PURE__ */ (0, l.jsxs)("g", { children: [/* @__PURE__ */ (0, l.jsx)("line", {
						...s,
						stroke: o === t ? "var(--strong)" : "var(--line-2)",
						strokeWidth: "2"
					}), /* @__PURE__ */ (0, l.jsx)("line", {
						...s,
						"data-edge-index": t,
						"data-selected": o === t ? "true" : "false",
						onClick: (e) => {
							e.stopPropagation(), c(t), m("");
						},
						onPointerDown: (e) => e.stopPropagation(),
						pointerEvents: "stroke",
						stroke: "rgba(0,0,0,.001)",
						strokeWidth: "16"
					})] }, `${e.from}-${e.to}-${t}`);
				})
			}), (r?.nodes ?? []).map((t) => {
				let r = f(t);
				return /* @__PURE__ */ (0, l.jsxs)("article", {
					"aria-label": `${t.type} ${t.id}`,
					className: `node ${p === t.id ? "selected" : ""}`,
					"data-node-id": t.id,
					onClick: (e) => {
						e.stopPropagation(), c(-1), m(t.id);
					},
					onKeyDown: (e) => {
						(e.key === "Enter" || e.key === " ") && m(t.id);
					},
					onPointerDown: (i) => {
						if (i.button !== 0) return;
						i.stopPropagation();
						let a = i.currentTarget, o = {
							clientX: i.clientX,
							clientY: i.clientY,
							point: r
						}, s = !1;
						a.setPointerCapture(i.pointerId), c(-1), m(t.id);
						let l = (e) => {
							s = !0, n.getState().moveNode(t.id, o.point.x + (e.clientX - o.clientX) / _.zoom, o.point.y + (e.clientY - o.clientY) / _.zoom);
						};
						a.addEventListener("pointermove", l), a.addEventListener("pointerup", () => {
							a.removeEventListener("pointermove", l), s && e();
						}, { once: !0 });
					},
					role: "button",
					style: {
						height: u.height,
						left: r.x,
						minHeight: u.height,
						minWidth: u.width,
						top: r.y,
						width: u.width
					},
					tabIndex: 0,
					children: [
						/* @__PURE__ */ (0, l.jsx)("button", {
							"aria-label": `连接到 ${t.id}`,
							className: "port in",
							"data-port": "in",
							onClick: () => x(t.id),
							onPointerDown: (e) => e.stopPropagation(),
							onPointerUp: () => x(t.id),
							type: "button"
						}),
						/* @__PURE__ */ (0, l.jsx)("button", {
							"aria-label": `从 ${t.id} 连线`,
							className: "port out",
							"data-port": "out",
							onClick: () => a(t.id),
							onPointerDown: (e) => {
								e.stopPropagation(), a(t.id);
							},
							type: "button"
						}),
						/* @__PURE__ */ (0, l.jsx)("header", {
							className: "node-head",
							children: /* @__PURE__ */ (0, l.jsx)("strong", {
								className: "node-title",
								children: d[t.type] ?? t.type
							})
						}),
						/* @__PURE__ */ (0, l.jsx)("div", {
							className: "node-body",
							children: String(t.title || t.name || t.id)
						})
					]
				}, t.id);
			})]
		})]
	});
}
function m(e, t) {
	let n = window.CanvasLegacyBridge, i = window.CanvasModernCore?.canvasRepository;
	if (!n || !i) throw Error("Canvas V2 dependencies are unavailable");
	let a = r(n.getDocumentSnapshot()), s = (e) => a.getState().adoptDocument(e.detail);
	window.addEventListener("canvas-legacy-document", s);
	let u = (0, c.createRoot)(e), d = t.hidden, f = !1, m = !1, h = !1, g = (t) => {
		e.dataset.saveState = t, window.dispatchEvent(new CustomEvent("canvas-board-v2-save-state", { detail: t }));
	};
	return u.render(/* @__PURE__ */ (0, l.jsx)(p, {
		commit: () => {
			m = !0, !h && (h = !0, (async () => {
				for (; m && !f;) {
					m = !1;
					let e = a.getState().document;
					if (!(!e || typeof e.id != "string")) {
						g("saving");
						try {
							let t = await i.save(e.id, o(e));
							f || a.getState().acceptSavedDocument(t, e), g("saved");
						} catch (e) {
							g("error"), console.warn("[canvas-modern-core] CanvasBoard V2 save failed", e);
							break;
						}
					}
				}
				h = !1;
			})());
		},
		store: a
	})), t.hidden = !0, e.hidden = !1, () => {
		f = !0, window.removeEventListener("canvas-legacy-document", s), u.unmount(), e.hidden = !0, t.hidden = d;
	};
}
//#endregion
export { m as mountCanvasBoardV2 };
