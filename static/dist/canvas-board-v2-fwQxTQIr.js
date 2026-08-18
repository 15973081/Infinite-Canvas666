import { c as e, i as t, n, o as r, r as i, s as a, t as o } from "./jsx-runtime-DFw-LS-Z.js";
//#region src/canvas/ui/canvas-board-v2.tsx
var s = /* @__PURE__ */ e(a(), 1), c = r(), l = o(), u = {
	height: 110,
	width: 240
};
function d(e, t) {
	return t[e.id] ?? {
		x: Number(e.x || 0),
		y: Number(e.y || 0)
	};
}
function f({ store: e }) {
	let n = t(e, ({ document: e }) => e), [r, i] = (0, s.useState)({}), [a, o] = (0, s.useState)(""), [c, f] = (0, s.useState)({
		x: 0,
		y: 0,
		zoom: 1
	}), p = String(n?.id || ""), m = new Map((n?.nodes ?? []).map((e) => [e.id, e]));
	return (0, s.useEffect)(() => {
		i({}), o("");
	}, [p]), /* @__PURE__ */ (0, l.jsx)("div", {
		"aria-label": "CanvasBoard V2",
		"data-testid": "canvas-board-v2",
		"data-viewport": `${c.x},${c.y},${c.zoom.toFixed(2)}`,
		onPointerDown: (e) => {
			if (e.button !== 0) return;
			let t = e.currentTarget, n = {
				x: e.clientX,
				y: e.clientY,
				viewport: c
			};
			t.setPointerCapture(e.pointerId), o("");
			let r = (e) => f((t) => ({
				...t,
				x: n.viewport.x + e.clientX - n.x,
				y: n.viewport.y + e.clientY - n.y
			}));
			t.addEventListener("pointermove", r), t.addEventListener("pointerup", () => t.removeEventListener("pointermove", r), { once: !0 });
		},
		onWheel: (e) => {
			e.preventDefault(), f((t) => ({
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
		children: /* @__PURE__ */ (0, l.jsxs)("div", {
			style: {
				height: 4e3,
				position: "absolute",
				transform: `translate(${c.x}px, ${c.y}px) scale(${c.zoom})`,
				transformOrigin: "0 0",
				width: 6e3
			},
			children: [/* @__PURE__ */ (0, l.jsx)("svg", {
				"aria-hidden": "true",
				height: "4000",
				style: {
					inset: 0,
					overflow: "visible",
					position: "absolute"
				},
				width: "6000",
				children: (n?.connections ?? []).map((e, t) => {
					let n = m.get(e.from), i = m.get(e.to);
					if (!n || !i) return null;
					let a = d(n, r), o = d(i, r);
					return /* @__PURE__ */ (0, l.jsx)("line", {
						stroke: "var(--line-2)",
						strokeWidth: "2",
						x1: a.x + u.width,
						x2: o.x,
						y1: a.y + u.height / 2,
						y2: o.y + u.height / 2
					}, `${e.from}-${e.to}-${t}`);
				})
			}), (n?.nodes ?? []).map((e) => {
				let t = d(e, r);
				return /* @__PURE__ */ (0, l.jsxs)("article", {
					"aria-label": `${e.type} ${e.id}`,
					className: `node ${a === e.id ? "selected" : ""}`,
					"data-node-id": e.id,
					onClick: (t) => {
						t.stopPropagation(), o(e.id);
					},
					onKeyDown: (t) => {
						(t.key === "Enter" || t.key === " ") && o(e.id);
					},
					onPointerDown: (n) => {
						if (n.button !== 0) return;
						n.stopPropagation();
						let r = n.currentTarget, a = {
							clientX: n.clientX,
							clientY: n.clientY,
							point: t
						};
						r.setPointerCapture(n.pointerId), o(e.id);
						let s = (t) => i((n) => ({
							...n,
							[e.id]: {
								x: a.point.x + (t.clientX - a.clientX) / c.zoom,
								y: a.point.y + (t.clientY - a.clientY) / c.zoom
							}
						}));
						r.addEventListener("pointermove", s), r.addEventListener("pointerup", () => r.removeEventListener("pointermove", s), { once: !0 });
					},
					role: "button",
					style: {
						height: u.height,
						left: t.x,
						minHeight: u.height,
						minWidth: u.width,
						top: t.y,
						width: u.width
					},
					tabIndex: 0,
					children: [/* @__PURE__ */ (0, l.jsx)("header", {
						className: "node-head",
						children: /* @__PURE__ */ (0, l.jsx)("strong", {
							className: "node-title",
							children: e.type
						})
					}), /* @__PURE__ */ (0, l.jsx)("div", {
						className: "node-body",
						children: String(e.title || e.name || e.id)
					})]
				}, e.id);
			})]
		})
	});
}
function p(e, t) {
	let r = window.CanvasLegacyBridge;
	if (!r) throw Error("Canvas legacy bridge is unavailable");
	let a = i(r.getDocumentSnapshot()), o = n(window, a), s = (0, c.createRoot)(e), u = t.hidden;
	return s.render(/* @__PURE__ */ (0, l.jsx)(f, { store: a })), t.hidden = !0, e.hidden = !1, () => {
		o(), s.unmount(), e.hidden = !0, t.hidden = u;
	};
}
//#endregion
export { p as mountCanvasBoardV2 };
