import { c as e, i as t, l as n, o as r, r as i, s as a, t as o } from "./jsx-runtime-BpAqVeUI.js";
import { n as s, t as c } from "./graph-Dsb9toch.js";
import { i as l, n as u, r as d, t as f } from "./document-merge-BpHwnITQ.js";
//#region src/canvas/domain/image-transform.ts
var p = /* @__PURE__ */ n(e(), 1), m = a(), h = r();
function g(e, t) {
	let n = S(t.width), r = S(t.height), i = C(e.x, 0, n - 1), a = C(e.y, 0, r - 1);
	return {
		x: i,
		y: a,
		width: C(e.width, 1, n - i),
		height: C(e.height, 1, r - a)
	};
}
function _(e, t, n = 4096) {
	let r = S(t.width), i = S(t.height), a = C(e.width, r, Math.max(r, n)), o = C(e.height, i, Math.max(i, n));
	return {
		width: a,
		height: o,
		offsetX: C(e.offsetX, 0, a - r),
		offsetY: C(e.offsetY, 0, o - i)
	};
}
function v(e, t) {
	return `${String(e || "image").replace(/\.[^.]+$/, "") || "image"}_${t}.png`;
}
function y(e) {
	let t = new Uint8ClampedArray(e.length);
	for (let n = 0; n < e.length; n += 4) {
		let r = e[n + 3] > 8 ? 255 : 0;
		t[n] = r, t[n + 1] = r, t[n + 2] = r, t[n + 3] = 255;
	}
	return t;
}
function b(e) {
	let t = Math.max(1, Math.round(Number(e) || 1));
	return t <= 20 ? String.fromCharCode(9312 + t - 1) : String(t);
}
function x(e, t, n = {}) {
	let r = S(e), i = S(t), a = Math.max(0, Math.min(240, Number(n.gap) || 0)) / 2, o = Array.isArray(n.lines), s = o ? [...new Set(n.lines.filter((e) => e.type === "h").map((e) => Math.max(.001, Math.min(.999, Number(e.pos) || .001)) * i))].sort((e, t) => e - t) : Array.from({ length: Math.max(1, Math.min(21, Math.round(Number(n.rows) || 1))) - 1 }, (e, t) => (t + 1) * i / Math.max(1, Math.min(21, Math.round(Number(n.rows) || 1)))), c = o ? [...new Set(n.lines.filter((e) => e.type === "v").map((e) => Math.max(.001, Math.min(.999, Number(e.pos) || .001)) * r))].sort((e, t) => e - t) : Array.from({ length: Math.max(1, Math.min(21, Math.round(Number(n.cols) || 1))) - 1 }, (e, t) => (t + 1) * r / Math.max(1, Math.min(21, Math.round(Number(n.cols) || 1)))), l = [
		0,
		...s,
		i
	], u = [
		0,
		...c,
		r
	], d = [];
	for (let e = 0; e < l.length - 1; e += 1) {
		let t = Math.round(e === 0 ? l[e] : l[e] + a), n = Math.round(e === l.length - 2 ? l[e + 1] : l[e + 1] - a);
		for (let r = 0; r < u.length - 1; r += 1) {
			let i = Math.round(r === 0 ? u[r] : u[r] + a), o = Math.round(r === u.length - 2 ? u[r + 1] : u[r + 1] - a);
			o > i && n > t && d.push({
				row: e,
				col: r,
				x: i,
				y: t,
				w: o - i,
				h: n - t
			});
		}
	}
	return d;
}
function S(e) {
	return Math.max(1, Math.round(Number(e) || 1));
}
function C(e, t, n) {
	return Math.min(n, Math.max(t, Math.round(Number(e) || 0)));
}
//#endregion
//#region src/canvas/ui/image-transform-dialog.tsx
var w = o();
function T({ name: e, onApply: t, onClose: n, url: r }) {
	let [i, a] = (0, p.useState)(null), o = (0, p.useRef)(null), [s, c] = (0, p.useState)("crop"), [l, u] = (0, p.useState)({
		x: 0,
		y: 0,
		width: 1,
		height: 1
	}), [d, f] = (0, p.useState)({
		offsetX: 0,
		offsetY: 0,
		width: 1,
		height: 1
	}), [h, y] = (0, p.useState)(!1), [b, x] = (0, p.useState)("");
	(0, p.useEffect)(() => {
		let e = !1, t = new Image();
		return /^https?:/i.test(r) && (t.crossOrigin = "anonymous"), t.onload = () => {
			if (e) return;
			let n = {
				width: t.naturalWidth,
				height: t.naturalHeight
			};
			o.current = t, a(n), u({
				x: 0,
				y: 0,
				...n
			}), f({
				offsetX: 0,
				offsetY: 0,
				...n
			});
		}, t.onerror = () => {
			e || x("无法读取图片，远程图片可能不允许跨域编辑");
		}, t.src = r, () => {
			e = !0, o.current = null, t.src = "";
		};
	}, [r]);
	let S = async () => {
		let r = o.current;
		if (!r || !i) {
			x("图片尚未加载完成");
			return;
		}
		y(!0), x("正在生成 PNG…");
		try {
			let a = document.createElement("canvas"), o = a.getContext("2d");
			if (!o) throw Error("当前浏览器无法创建图片编辑画布");
			if (s === "crop") {
				let e = g(l, i);
				a.width = e.width, a.height = e.height, o.drawImage(r, e.x, e.y, e.width, e.height, 0, 0, e.width, e.height);
			} else {
				let e = _(d, i);
				a.width = e.width, a.height = e.height, o.fillStyle = "#ffffff", o.fillRect(0, 0, e.width, e.height), o.drawImage(r, e.offsetX, e.offsetY, i.width, i.height);
			}
			let c = await E(a);
			x("正在上传编辑结果…"), await t({
				blob: c,
				height: a.height,
				mode: s,
				name: v(e, s),
				width: a.width
			}), n();
		} catch (e) {
			let t = e instanceof Error ? e.message || e.name || "图片转换失败" : String(e) || "图片转换失败";
			x(t);
		} finally {
			y(!1);
		}
	}, C = (e, t, n, r = 0) => /* @__PURE__ */ (0, w.jsxs)("label", {
		className: "field",
		children: [/* @__PURE__ */ (0, w.jsx)("span", { children: e }), /* @__PURE__ */ (0, w.jsx)("input", {
			"aria-label": e,
			className: "setting-input",
			min: r,
			onChange: (e) => n(Number(e.target.value)),
			type: "number",
			value: t
		})]
	});
	return (0, m.createPortal)(/* @__PURE__ */ (0, w.jsx)("div", {
		className: "modal open canvas-image-transform",
		onClick: n,
		onPointerDown: (e) => e.stopPropagation(),
		role: "dialog",
		children: /* @__PURE__ */ (0, w.jsxs)("section", {
			className: "modal-panel",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, w.jsxs)("header", { children: [/* @__PURE__ */ (0, w.jsx)("strong", { children: "编辑图片" }), /* @__PURE__ */ (0, w.jsx)("button", {
					disabled: h,
					onClick: n,
					type: "button",
					children: "关闭"
				})] }),
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: "mode-tabs",
					children: [/* @__PURE__ */ (0, w.jsx)("button", {
						className: s === "crop" ? "active" : "",
						onClick: () => c("crop"),
						type: "button",
						children: "裁剪"
					}), /* @__PURE__ */ (0, w.jsx)("button", {
						className: s === "outpaint" ? "active" : "",
						onClick: () => c("outpaint"),
						type: "button",
						children: "扩图"
					})]
				}),
				/* @__PURE__ */ (0, w.jsx)("img", {
					alt: "图片编辑预览",
					className: "canvas-image-transform-preview",
					src: r
				}),
				i ? /* @__PURE__ */ (0, w.jsxs)("p", { children: [
					i.width,
					" × ",
					i.height,
					"px"
				] }) : /* @__PURE__ */ (0, w.jsx)("p", { children: "正在读取图片…" }),
				s === "crop" ? /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "canvas-image-transform-fields",
					children: [
						C("裁剪 X", l.x, (e) => u((t) => ({
							...t,
							x: e
						}))),
						C("裁剪 Y", l.y, (e) => u((t) => ({
							...t,
							y: e
						}))),
						C("裁剪宽度", l.width, (e) => u((t) => ({
							...t,
							width: e
						})), 1),
						C("裁剪高度", l.height, (e) => u((t) => ({
							...t,
							height: e
						})), 1)
					]
				}) : /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "canvas-image-transform-fields",
					children: [
						C("扩图宽度", d.width, (e) => f((t) => ({
							...t,
							width: e
						})), i?.width || 1),
						C("扩图高度", d.height, (e) => f((t) => ({
							...t,
							height: e
						})), i?.height || 1),
						C("原图 X 偏移", d.offsetX, (e) => f((t) => ({
							...t,
							offsetX: e
						}))),
						C("原图 Y 偏移", d.offsetY, (e) => f((t) => ({
							...t,
							offsetY: e
						})))
					]
				}),
				b ? /* @__PURE__ */ (0, w.jsx)("small", {
					"data-testid": "image-transform-status",
					children: b
				}) : null,
				/* @__PURE__ */ (0, w.jsx)("button", {
					className: "primary-btn",
					disabled: !i || h,
					onClick: () => void S(),
					type: "button",
					children: h ? "正在上传…" : s === "crop" ? "应用裁剪" : "应用扩图"
				})
			]
		})
	}), document.body);
}
function E(e) {
	return new Promise((t, n) => e.toBlob((e) => e ? t(e) : n(/* @__PURE__ */ Error("无法生成编辑后的 PNG 图片")), "image/png"));
}
//#endregion
//#region src/canvas/ui/legacy-image-transform-dialog.tsx
var D = [];
function O({ initialMode: e = "crop", joinItems: t = D, name: n, onApply: r, onClose: i, onCreateMask: a, onGridJoin: o, onGridSplit: s, url: c }) {
	let l = (0, p.useRef)(null), u = (0, p.useRef)(null), d = (0, p.useRef)(null), f = (0, p.useRef)(null), m = (0, p.useRef)(null), h = (0, p.useRef)(null), g = (0, p.useRef)([]), _ = (0, p.useRef)([]), S = (0, p.useRef)(1), C = (0, p.useRef)(null), T = (0, p.useRef)(null), E = (0, p.useRef)(null), O = (0, p.useRef)([]), [R, ie] = (0, p.useState)(e), [B, V] = (0, p.useState)(null), [ae, oe] = (0, p.useState)({
		width: 1,
		height: 1
	}), [se, ce] = (0, p.useState)({
		width: 1,
		height: 1
	}), [le, H] = (0, p.useState)({
		x: 0,
		y: 0,
		width: 1,
		height: 1
	}), [U, ue] = (0, p.useState)({
		offsetX: 0,
		offsetY: 0,
		width: 1,
		height: 1
	}), [W, de] = (0, p.useState)(1), [G, K] = (0, p.useState)("free"), [fe, pe] = (0, p.useState)("#ff2d55"), [me, he] = (0, p.useState)(42), [ge, q] = (0, p.useState)(14), [_e, J] = (0, p.useState)([]), [ve, ye] = (0, p.useState)(""), [be, Y] = (0, p.useState)(3), [xe, Se] = (0, p.useState)(3), [Ce, we] = (0, p.useState)(0), [Te, Ee] = (0, p.useState)(!1), [De, Oe] = (0, p.useState)("h"), [ke, Ae] = (0, p.useState)([]), [je, X] = (0, p.useState)(0), [Me, Ne] = (0, p.useState)("split"), [Pe, Fe] = (0, p.useState)(() => t.map((e, t) => t)), [Ie, Le] = (0, p.useState)(() => Math.max(1, Math.ceil(t.length / Math.max(1, Math.ceil(Math.sqrt(Math.max(1, t.length))))))), [Re, ze] = (0, p.useState)(() => Math.max(1, Math.ceil(Math.sqrt(Math.max(1, t.length))))), [Be, Ve] = (0, p.useState)(2048), [He, Ue] = (0, p.useState)({
		x: 0,
		y: 0
	}), [We, Ge] = (0, p.useState)(0), [Ke, qe] = (0, p.useState)(!1), [Je, Ye] = (0, p.useState)(""), Xe = (0, p.useMemo)(() => ({
		width: Math.max(1, ae.width * W),
		height: Math.max(1, ae.height * W)
	}), [ae, W]), Ze = B ? Xe.width / B.width : 1, Z = B ? Xe.height / B.height : 1, Qe = (0, p.useMemo)(() => t.filter((e) => e?.url), [t]), $e = (0, p.useMemo)(() => L(Qe, Pe, Ie, Re, Ce), [
		Ce,
		Re,
		Pe,
		Ie,
		Qe
	]), et = R === "grid" && Me === "join" ? {
		width: $e.width * W,
		height: $e.height * W
	} : R === "outpaint" ? {
		width: U.width * Ze,
		height: U.height * Z
	} : Xe;
	(0, p.useEffect)(() => {
		Ye(""), V(null), de(1), m.current = null, h.current = null, g.current = [], _.current = [], S.current = 1, J([]), ye(""), C.current = null, O.current = [], Y(3), Se(3), we(0), Ee(!1), Oe("h"), Ae([]), ie(e), Ne("split"), Fe(t.map((e, t) => t));
		let n = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, t.length))));
		ze(n), Le(Math.max(1, Math.ceil(t.length / n))), Ve(2048), X((e) => e + 1), Ge((e) => e + 1);
	}, [
		e,
		t,
		c
	]), (0, p.useEffect)(() => {
		let e = f.current;
		if (!e) return;
		let t = () => ce({
			width: e.clientWidth,
			height: e.clientHeight
		});
		t();
		let n = new ResizeObserver(t);
		return n.observe(e), () => n.disconnect();
	}, []), (0, p.useEffect)(() => {
		window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [R, Ke]), (0, p.useEffect)(() => {
		let e = d.current;
		if (!e) return;
		let t = e.getContext("2d");
		t && (t.clearRect(0, 0, e.width, e.height), _e.forEach((e) => {
			t.save(), t.font = `800 ${e.size}px Arial, sans-serif`, t.textAlign = "center", t.textBaseline = "middle", t.lineWidth = Math.max(2, e.size / 10), t.strokeStyle = "rgba(255,255,255,0.92)", t.strokeText(e.text, e.x, e.y), t.fillStyle = e.color, t.fillText(e.text, e.x, e.y), t.restore();
		}));
	}, [_e, B]), (0, p.useEffect)(() => {
		if (!B) return;
		let e = u.current, t = d.current;
		!e || !t || (e.width = B.width, e.height = B.height, t.width = B.width, t.height = B.height, g.current = [], _.current = [], S.current = 1, J([]), Ge((e) => e + 1));
	}, [B]), (0, p.useEffect)(() => {
		if (R !== "grid" || !B) return;
		let e = u.current, t = e?.getContext("2d");
		!e || !t || (t.clearRect(0, 0, e.width, e.height), t.save(), t.strokeStyle = "rgba(248,250,252,.96)", t.lineWidth = Math.max(1, Math.min(e.width, e.height) / 420), t.setLineDash([8, 6]), (Te ? ke : [...Array.from({ length: be - 1 }, (e, t) => ({
			type: "h",
			pos: (t + 1) / be
		})), ...Array.from({ length: xe - 1 }, (e, t) => ({
			type: "v",
			pos: (t + 1) / xe
		}))]).forEach((n) => {
			let r = n.pos * (n.type === "h" ? e.height : e.width), i = (i) => {
				t.beginPath(), n.type === "h" ? (t.moveTo(0, r + i), t.lineTo(e.width, r + i)) : (t.moveTo(r + i, 0), t.lineTo(r + i, e.height)), t.stroke();
			};
			Ce > 0 ? (i(-Ce / 2), i(Ce / 2)) : i(0);
		}), t.restore());
	}, [
		xe,
		Te,
		Ce,
		ke,
		be,
		je,
		R,
		B
	]), (0, p.useEffect)(() => {
		let e = (e) => {
			let t = m.current;
			if (!t || !B) return;
			let n = (e.clientX - t.startX) / Math.max(Ze, 1e-4), r = (e.clientY - t.startY) / Math.max(Z, 1e-4);
			if (t.mode === "crop-move") H(I({
				...t.startCrop,
				x: t.startCrop.x + n,
				y: t.startCrop.y + r
			}, B));
			else if (t.mode === "crop-resize") H(I({
				...t.startCrop,
				width: t.startCrop.width + n,
				height: t.startCrop.height + r
			}, B));
			else if (t.mode === "image") ue(ne({
				...t.startOutpaint,
				offsetX: t.startOutpaint.offsetX + n,
				offsetY: t.startOutpaint.offsetY + r
			}, B));
			else {
				let e = t.mode === "outpaint-left" ? -n : t.mode === "outpaint-right" || t.mode === "outpaint-corner" ? n : 0, i = t.mode === "outpaint-top" ? -r : t.mode === "outpaint-bottom" || t.mode === "outpaint-corner" ? r : 0, a = Math.max(B.width, t.startOutpaint.width + e * 2), o = Math.max(B.height, t.startOutpaint.height + i * 2);
				ue(ne({
					width: a,
					height: o,
					offsetX: t.startOutpaint.offsetX + (a - t.startOutpaint.width) / 2,
					offsetY: t.startOutpaint.offsetY + (o - t.startOutpaint.height) / 2
				}, B));
			}
		}, t = () => {
			m.current = null;
		};
		return window.addEventListener("pointermove", e), window.addEventListener("pointerup", t), window.addEventListener("pointercancel", t), () => {
			window.removeEventListener("pointermove", e), window.removeEventListener("pointerup", t), window.removeEventListener("pointercancel", t);
		};
	}, [
		Ze,
		Z,
		B
	]);
	let tt = (e = R) => {
		B && (e === "outpaint" ? ue({
			offsetX: 0,
			offsetY: 0,
			width: B.width,
			height: B.height
		}) : H({
			x: B.width * .08,
			y: B.height * .08,
			width: B.width * .84,
			height: B.height * .84
		}));
	}, nt = (e) => {
		R === "grid" && e !== "grid" && lt(!0), ie(e), tt(e), ye(""), (e === "preview" || e === "crop" || e === "grid") && lt(!0);
	}, rt = (e, t) => {
		!B || Ke || (e.preventDefault(), e.stopPropagation(), m.current = {
			mode: t,
			startCrop: le,
			startOutpaint: U,
			startX: e.clientX,
			startY: e.clientY
		});
	}, it = () => {
		let e = u.current, t = e?.getContext("2d");
		return !e || !t ? null : {
			imageData: t.getImageData(0, 0, e.width, e.height),
			labelCounter: S.current,
			textItems: _e.map((e) => ({ ...e }))
		};
	}, at = (e) => {
		let t = u.current, n = t?.getContext("2d");
		!t || !n || !e || (n.putImageData(e.imageData, 0, 0), S.current = e.labelCounter, J(e.textItems.map((e) => ({ ...e }))), ye(""));
	}, ot = () => {
		let e = it();
		e && (g.current = [...g.current.slice(-19), e], _.current = [], Ge((e) => e + 1));
	}, st = () => {
		let e = g.current.pop(), t = it();
		!e || !t || (_.current.push(t), at(e), Ge((e) => e + 1));
	}, ct = () => {
		let e = _.current.pop(), t = it();
		!e || !t || (g.current.push(t), at(e), Ge((e) => e + 1));
	}, lt = (e = !1) => {
		let t = u.current, n = t?.getContext("2d");
		!t || !n || (!e && (F(t) || _e.length) && ot(), n.clearRect(0, 0, t.width, t.height), S.current = 1, J([]), ye(""), Ge((e) => e + 1));
	}, ut = (e) => {
		let t = e.currentTarget, n = t.getBoundingClientRect();
		return {
			x: (e.clientX - n.left) * t.width / Math.max(1, n.width),
			y: (e.clientY - n.top) * t.height / Math.max(1, n.height)
		};
	}, dt = (e) => {
		e.lineCap = "round", e.lineJoin = "round", e.lineWidth = R === "mask" ? me : ge, e.strokeStyle = R === "mask" ? "rgba(255,255,255,0.451)" : fe, e.fillStyle = e.strokeStyle, e.globalCompositeOperation = "source-over";
	}, ft = (e) => {
		if (R === "grid") {
			if (!Te || Ke) return;
			e.preventDefault(), e.stopPropagation();
			let t = e.currentTarget, n = ut(e), r = Math.max(8, Math.min(t.width, t.height) / 80), i = -1, a = Infinity;
			ke.forEach((e, o) => {
				let s = e.type === "h" ? Math.abs(n.y - e.pos * t.height) : Math.abs(n.x - e.pos * t.width);
				s <= r && s < a && (i = o, a = s);
			}), O.current.push(ke.map((e) => ({ ...e })));
			let o = {
				type: De,
				pos: De === "h" ? n.y / t.height : n.x / t.width
			}, s = i >= 0 ? i : ke.length;
			Ae((e) => i >= 0 ? e.map((e, t) => t === i ? {
				...e,
				pos: o.pos
			} : e) : [...e, o]), C.current = {
				index: s,
				pointerId: e.pointerId
			}, t.setPointerCapture(e.pointerId), X((e) => e + 1);
			return;
		}
		if (!["brush", "mask"].includes(R) || Ke || R === "brush" && G === "text") return;
		e.preventDefault(), e.stopPropagation();
		let t = e.currentTarget, n = t.getContext("2d");
		if (!n) return;
		let r = ut(e);
		if (ot(), t.setPointerCapture(e.pointerId), dt(n), R === "brush" && G === "label") {
			let i = Math.max(18, ge * 2.2), a = b(S.current++);
			n.save(), n.font = `900 ${i}px Arial, sans-serif`, n.textAlign = "center", n.textBaseline = "middle", n.lineWidth = Math.max(3, i / 8), n.strokeStyle = "rgba(255,255,255,0.92)", n.strokeText(a, r.x, r.y), n.fillStyle = fe, n.fillText(a, r.x, r.y), n.restore(), t.releasePointerCapture(e.pointerId), Ge((e) => e + 1);
			return;
		}
		let i = G === "rect" || G === "ellipse" ? n.getImageData(0, 0, t.width, t.height) : void 0;
		h.current = {
			imageData: i,
			lastX: r.x,
			lastY: r.y,
			pointerId: e.pointerId,
			startX: r.x,
			startY: r.y
		}, n.beginPath(), n.moveTo(r.x, r.y), n.lineTo(r.x + .01, r.y + .01), (R === "mask" || G === "free") && n.stroke(), R === "mask" && ee(t);
	}, pt = (e) => {
		let t = C.current;
		if (R === "grid" && Te && t?.pointerId === e.pointerId) {
			e.preventDefault();
			let n = ut(e);
			Ae((r) => r.map((r, i) => i === t.index ? {
				...r,
				pos: Math.max(.001, Math.min(.999, r.type === "h" ? n.y / e.currentTarget.height : n.x / e.currentTarget.width))
			} : r));
			return;
		}
		let n = h.current;
		if (!n || n.pointerId !== e.pointerId) return;
		e.preventDefault();
		let r = e.currentTarget, i = r.getContext("2d");
		if (!i) return;
		let a = ut(e);
		if (R === "brush" && G !== "free" && n.imageData) {
			i.putImageData(n.imageData, 0, 0), dt(i);
			let e = Math.min(n.startX, a.x), t = Math.min(n.startY, a.y), r = Math.abs(a.x - n.startX), o = Math.abs(a.y - n.startY);
			G === "rect" ? i.strokeRect(e, t, r, o) : G === "ellipse" && (i.beginPath(), i.ellipse(e + r / 2, t + o / 2, Math.max(1, r / 2), Math.max(1, o / 2), 0, 0, Math.PI * 2), i.stroke());
			return;
		}
		dt(i), i.beginPath(), i.moveTo(n.lastX, n.lastY), i.lineTo(a.x, a.y), i.stroke(), n.lastX = a.x, n.lastY = a.y, R === "mask" && ee(r);
	}, mt = (e) => {
		C.current?.pointerId === e.pointerId && (C.current = null, e.currentTarget.releasePointerCapture(e.pointerId), X((e) => e + 1)), h.current?.pointerId === e.pointerId && (h.current = null, e.currentTarget.releasePointerCapture(e.pointerId), Ge((e) => e + 1));
	}, ht = (e) => {
		if (R !== "brush" || G !== "text" || Ke) return;
		e.preventDefault(), e.stopPropagation();
		let t = ut(e), n = [..._e].reverse().find((e) => Math.abs(e.x - t.x) <= Math.max(30, e.text.length * e.size * .35) && Math.abs(e.y - t.y) <= e.size);
		if (n) {
			ye(n.id);
			return;
		}
		ot();
		let r = {
			color: fe,
			id: `text_${crypto.randomUUID?.() || Date.now()}`,
			size: Math.max(12, ge * 2),
			text: "文字",
			x: t.x,
			y: t.y
		};
		J((e) => [...e, r]), ye(r.id);
	}, gt = async () => {
		let e = l.current;
		if (!(!e || !B || R === "preview")) {
			qe(!0), Ye("正在生成 PNG…");
			try {
				let t = document.createElement("canvas"), c = t.getContext("2d");
				if (!c) throw Error("当前浏览器无法创建图片编辑画布");
				if (R === "crop") {
					let n = I(le, B);
					t.width = Math.max(1, Math.round(n.width)), t.height = Math.max(1, Math.round(n.height)), c.drawImage(e, Math.round(n.x), Math.round(n.y), t.width, t.height, 0, 0, t.width, t.height);
				} else if (R === "outpaint") {
					let n = ne(U, B);
					t.width = Math.max(1, Math.round(n.width)), t.height = Math.max(1, Math.round(n.height)), c.fillStyle = "#ffffff", c.fillRect(0, 0, t.width, t.height), c.drawImage(e, Math.round(n.offsetX), Math.round(n.offsetY), B.width, B.height);
				} else if (R === "grid") {
					if (Me === "join") {
						if (Qe.length <= 1 || !o) throw Error("请从包含多张图片的分组打开宫格拼接");
						Ye("正在生成拼接图片…");
						let e = await re(Qe, $e, Be, n);
						Ye("正在上传拼接图片…"), await o(e), i();
						return;
					}
					let t = x(B.width, B.height, Te ? {
						gap: Ce,
						lines: ke
					} : {
						cols: xe,
						gap: Ce,
						rows: be
					});
					if (!t.length) throw Error("当前切割线没有产生有效图片");
					let r = String(n || "image").replace(/\.[^.]+$/, "") || "image", a = [];
					for (let n of t) {
						let t = document.createElement("canvas");
						t.width = n.w, t.height = n.h, t.getContext("2d")?.drawImage(e, n.x, n.y, n.w, n.h, 0, 0, n.w, n.h), a.push({
							blob: await z(t),
							name: `${r}_r${n.row + 1}_c${n.col + 1}.png`,
							rect: n
						});
					}
					Ye(`正在上传 ${a.length} 张切分图片…`), await s({
						items: a,
						layout: {
							cols: Math.max(1, ...t.map((e) => e.col + 1)),
							groupId: `grid_${crypto.randomUUID?.() || Date.now()}`,
							rows: Math.max(1, ...t.map((e) => e.row + 1)),
							type: "grid-split"
						}
					}), i();
					return;
				} else if (R === "mask") {
					let e = u.current, r = e?.getContext("2d");
					if (!e || !r || !F(e)) throw Error("请先绘制遮罩区域");
					let o = y(r.getImageData(0, 0, e.width, e.height).data);
					t.width = e.width, t.height = e.height;
					let s = c.createImageData(t.width, t.height);
					s.data.set(o), c.putImageData(s, 0, 0);
					let l = await z(t);
					Ye("正在上传遮罩…"), await a({
						blob: l,
						height: t.height,
						name: te(n, "mask"),
						width: t.width
					}), i();
					return;
				} else {
					let n = u.current, r = d.current;
					if (!n || !r || !F(n) && !_e.length) throw Error("请先绘制图片内容");
					t.width = B.width, t.height = B.height, c.drawImage(e, 0, 0, B.width, B.height), c.drawImage(n, 0, 0), c.drawImage(r, 0, 0);
				}
				let l = await z(t);
				Ye("正在上传编辑结果…"), await r({
					blob: l,
					height: t.height,
					mode: R,
					name: R === "brush" ? te(n, "paint") : v(n, R),
					width: t.width
				}), i();
			} catch (e) {
				Ye(e instanceof Error ? e.message || e.name || "图片转换失败" : String(e) || "图片转换失败");
			} finally {
				qe(!1);
			}
		}
	}, _t = (e, t) => {
		Ee(!1), Y(e), Se(t), Ae([]), O.current = [], X((e) => e + 1);
	}, vt = (e, t) => {
		Le(e), ze(t);
	}, yt = (e, t) => {
		Ke || Me !== "join" || (e.preventDefault(), e.stopPropagation(), e.currentTarget.setPointerCapture(e.pointerId), E.current = {
			clientX: e.clientX,
			clientY: e.clientY,
			index: t,
			pointerId: e.pointerId
		}, Ue({
			x: 0,
			y: 0
		}));
	}, bt = (e) => {
		let t = E.current;
		!t || t.pointerId !== e.pointerId || (e.preventDefault(), e.stopPropagation(), Ue({
			x: e.clientX - t.clientX,
			y: e.clientY - t.clientY
		}));
	}, xt = (e) => {
		let t = E.current;
		if (!t || t.pointerId !== e.pointerId) return;
		let n = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-grid-join-index]"), r = Number(n?.dataset.gridJoinIndex);
		Number.isInteger(r) && r !== t.index && Fe((e) => {
			let n = [...e], i = n.indexOf(t.index), a = n.indexOf(r);
			return i >= 0 && a >= 0 && ([n[i], n[a]] = [n[a], n[i]]), n;
		}), E.current = null, Ue({
			x: 0,
			y: 0
		}), e.currentTarget.releasePointerCapture?.(e.pointerId);
	}, St = () => {
		let e = O.current.pop();
		e && (Ae(e), X((e) => e + 1));
	}, Ct = We >= 0 && g.current.length > 0, wt = We >= 0 && _.current.length > 0, Tt = _e.find((e) => e.id === ve);
	return /* @__PURE__ */ (0, w.jsx)("div", {
		"aria-label": "编辑图片",
		"aria-modal": "true",
		className: "image-edit-modal open canvas-modern-image-edit",
		onClick: i,
		role: "dialog",
		style: { zIndex: 1100 },
		children: /* @__PURE__ */ (0, w.jsxs)("div", {
			className: "image-edit-panel",
			onClick: (e) => e.stopPropagation(),
			onPointerDown: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: "image-edit-head",
					children: [
						/* @__PURE__ */ (0, w.jsxs)("div", {
							className: "image-edit-headline",
							children: [/* @__PURE__ */ (0, w.jsx)("div", {
								className: "image-edit-title",
								children: j(R)
							}), /* @__PURE__ */ (0, w.jsx)("div", {
								className: "image-edit-sub",
								children: M(R)
							})]
						}),
						/* @__PURE__ */ (0, w.jsxs)("div", {
							className: "image-edit-mode",
							children: [
								/* @__PURE__ */ (0, w.jsx)(k, {
									active: R === "preview",
									icon: "eye",
									label: "预览",
									onClick: () => nt("preview")
								}),
								/* @__PURE__ */ (0, w.jsx)(k, {
									active: R === "crop",
									icon: "crop",
									label: "裁剪",
									onClick: () => nt("crop")
								}),
								/* @__PURE__ */ (0, w.jsx)(k, {
									active: R === "outpaint",
									icon: "expand",
									label: "扩图",
									onClick: () => nt("outpaint")
								}),
								/* @__PURE__ */ (0, w.jsx)(k, {
									active: R === "mask",
									icon: "brush",
									label: "遮罩",
									onClick: () => nt("mask")
								}),
								/* @__PURE__ */ (0, w.jsx)(k, {
									active: R === "brush",
									icon: "paintbrush",
									label: "画笔",
									onClick: () => nt("brush")
								}),
								/* @__PURE__ */ (0, w.jsx)(k, {
									active: R === "grid",
									icon: "grid-3x3",
									label: "宫格切分",
									onClick: () => nt("grid")
								})
							]
						}),
						/* @__PURE__ */ (0, w.jsx)("div", {
							className: "image-edit-head-end",
							children: /* @__PURE__ */ (0, w.jsx)("button", {
								"aria-label": "关闭",
								className: "preview-icon-btn",
								disabled: Ke,
								onClick: i,
								title: "关闭",
								type: "button",
								children: /* @__PURE__ */ (0, w.jsx)("i", {
									className: "w-4 h-4",
									"data-lucide": "x"
								})
							})
						})
					]
				}),
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: `image-edit-tools ${R === "mask" ? "active" : ""}`,
					children: [
						/* @__PURE__ */ (0, w.jsxs)("label", { children: [/* @__PURE__ */ (0, w.jsx)("span", { children: "笔刷" }), /* @__PURE__ */ (0, w.jsx)("input", {
							"aria-label": "遮罩笔刷大小",
							max: "160",
							min: "4",
							onChange: (e) => he(Number(e.target.value)),
							type: "range",
							value: me
						})] }),
						/* @__PURE__ */ (0, w.jsx)(A, {
							disabled: !Ct,
							icon: "undo-2",
							label: "撤销遮罩",
							onClick: st
						}),
						/* @__PURE__ */ (0, w.jsx)(A, {
							disabled: !wt,
							icon: "redo-2",
							label: "恢复遮罩",
							onClick: ct
						}),
						/* @__PURE__ */ (0, w.jsxs)("button", {
							className: "image-edit-btn secondary",
							onClick: () => lt(),
							type: "button",
							children: [/* @__PURE__ */ (0, w.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": "eraser"
							}), /* @__PURE__ */ (0, w.jsx)("span", { children: "清空" })]
						}),
						/* @__PURE__ */ (0, w.jsx)("span", {
							className: "image-edit-sub",
							children: "白色区域为要编辑的遮罩"
						})
					]
				}),
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: `image-edit-tools ${R === "brush" ? "active" : ""}`,
					children: [
						[
							[
								"free",
								"paintbrush",
								"自由画笔"
							],
							[
								"rect",
								"square",
								"矩形"
							],
							[
								"ellipse",
								"circle",
								"椭圆"
							],
							[
								"label",
								"list-ordered",
								"数字标签"
							],
							[
								"text",
								"type",
								"文字标签"
							]
						].map(([e, t, n]) => /* @__PURE__ */ (0, w.jsx)("button", {
							"aria-label": n,
							className: `image-edit-btn ${G === e ? "primary" : "secondary"}`,
							onClick: () => {
								K(e), ye("");
							},
							title: n,
							type: "button",
							children: /* @__PURE__ */ (0, w.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": t
							})
						}, e)),
						/* @__PURE__ */ (0, w.jsxs)("label", { children: [/* @__PURE__ */ (0, w.jsx)("span", { children: "颜色" }), /* @__PURE__ */ (0, w.jsx)("input", {
							"aria-label": "画笔颜色",
							onChange: (e) => pe(e.target.value),
							type: "color",
							value: fe
						})] }),
						/* @__PURE__ */ (0, w.jsxs)("label", { children: [/* @__PURE__ */ (0, w.jsx)("span", { children: "笔刷" }), /* @__PURE__ */ (0, w.jsx)("input", {
							"aria-label": "画笔大小",
							max: "80",
							min: "2",
							onChange: (e) => q(Number(e.target.value)),
							type: "range",
							value: ge
						})] }),
						/* @__PURE__ */ (0, w.jsx)(A, {
							disabled: !Ct,
							icon: "undo-2",
							label: "撤销画笔",
							onClick: st
						}),
						/* @__PURE__ */ (0, w.jsx)(A, {
							disabled: !wt,
							icon: "redo-2",
							label: "恢复画笔",
							onClick: ct
						}),
						/* @__PURE__ */ (0, w.jsxs)("button", {
							className: "image-edit-btn secondary",
							onClick: () => lt(),
							type: "button",
							children: [/* @__PURE__ */ (0, w.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": "eraser"
							}), /* @__PURE__ */ (0, w.jsx)("span", { children: "清空" })]
						})
					]
				}),
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: `image-edit-tools ${R === "grid" ? `active grid-operation-${Me}` : ""}`,
					children: [
						Qe.length > 1 && o ? /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "grid-operation-toggle",
							children: [/* @__PURE__ */ (0, w.jsx)("button", {
								className: Me === "split" ? "active" : "",
								id: "gridSplitModeBtn",
								onClick: () => Ne("split"),
								type: "button",
								children: "拆分"
							}), /* @__PURE__ */ (0, w.jsx)("button", {
								className: Me === "join" ? "active" : "",
								id: "gridJoinModeBtn",
								onClick: () => {
									Ne("join"), Ee(!1);
								},
								type: "button",
								children: "拼接"
							})]
						}) : null,
						Me === "join" ? /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [/* @__PURE__ */ (0, w.jsxs)("div", {
							className: "grid-preset-row grid-join-control",
							id: "gridJoinPresetRow",
							children: [
								/* @__PURE__ */ (0, w.jsx)("span", {
									className: "image-edit-sub",
									children: "布局"
								}),
								[
									[1, 2],
									[2, 1],
									[2, 2],
									[2, 3],
									[3, 2],
									[3, 3]
								].map(([e, t]) => /* @__PURE__ */ (0, w.jsxs)("button", {
									className: `grid-preset-btn ${Ie === e && Re === t ? "active" : ""}`,
									onClick: () => vt(e, t),
									type: "button",
									children: [
										e,
										"×",
										t
									]
								}, `${e}x${t}`)),
								/* @__PURE__ */ (0, w.jsx)("button", {
									className: "grid-preset-btn",
									onClick: () => {
										let e = Math.max(1, Math.ceil(Math.sqrt(Qe.length)));
										vt(Math.ceil(Qe.length / e), e);
									},
									type: "button",
									children: "自动"
								})
							]
						}), /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "grid-preset-row grid-join-control",
							id: "gridJoinSizeRow",
							children: [/* @__PURE__ */ (0, w.jsx)("span", {
								className: "image-edit-sub",
								children: "输出"
							}), [
								1024,
								2048,
								4096
							].map((e) => /* @__PURE__ */ (0, w.jsx)("button", {
								className: `grid-preset-btn ${Be === e ? "active" : ""}`,
								"data-grid-join-size": e,
								onClick: () => Ve(e),
								type: "button",
								children: e
							}, e))]
						})] }) : null,
						/* @__PURE__ */ (0, w.jsx)("button", {
							className: `image-edit-btn ${Te ? "primary" : "secondary"}`,
							onClick: () => {
								Ee((e) => !e), Ae([]), O.current = [], X((e) => e + 1);
							},
							title: "自由放置切割线",
							type: "button",
							children: "自定义"
						}),
						/* @__PURE__ */ (0, w.jsxs)("div", {
							className: "grid-preset-row",
							children: [/* @__PURE__ */ (0, w.jsx)("span", {
								className: "image-edit-sub",
								children: "预设"
							}), [
								[1, 2],
								[2, 1],
								[2, 2],
								[2, 3],
								[3, 2],
								[3, 3]
							].map(([e, t]) => /* @__PURE__ */ (0, w.jsxs)("button", {
								className: "grid-preset-btn",
								onClick: () => _t(e, t),
								type: "button",
								children: [
									e,
									"×",
									t
								]
							}, `${e}x${t}`))]
						}),
						Te ? /* @__PURE__ */ (0, w.jsxs)("div", {
							style: {
								alignItems: "center",
								display: "flex",
								gap: 6
							},
							children: [
								/* @__PURE__ */ (0, w.jsx)("button", {
									className: `image-edit-btn ${De === "h" ? "primary" : "secondary"}`,
									onClick: () => Oe("h"),
									title: "点击图片放置水平线",
									type: "button",
									children: "水平"
								}),
								/* @__PURE__ */ (0, w.jsx)("button", {
									className: `image-edit-btn ${De === "v" ? "primary" : "secondary"}`,
									onClick: () => Oe("v"),
									title: "点击图片放置竖直线",
									type: "button",
									children: "垂直"
								}),
								/* @__PURE__ */ (0, w.jsx)("button", {
									"aria-label": "撤销切割线",
									className: "image-edit-btn secondary",
									disabled: !O.current.length,
									onClick: St,
									style: { opacity: O.current.length ? 1 : .4 },
									title: "撤销上一条线",
									type: "button",
									children: /* @__PURE__ */ (0, w.jsx)("i", {
										className: "w-3.5 h-3.5",
										"data-lucide": "undo-2"
									})
								}),
								/* @__PURE__ */ (0, w.jsx)("button", {
									"aria-label": "清除自定义线",
									className: "image-edit-btn secondary",
									onClick: () => {
										O.current = [], Ae([]), X((e) => e + 1);
									},
									title: "清除所有自定义线",
									type: "button",
									children: /* @__PURE__ */ (0, w.jsx)("i", {
										className: "w-3.5 h-3.5",
										"data-lucide": "eraser"
									})
								})
							]
						}) : /* @__PURE__ */ (0, w.jsxs)("span", {
							style: { display: "contents" },
							children: [/* @__PURE__ */ (0, w.jsxs)("label", { children: [/* @__PURE__ */ (0, w.jsx)("span", { children: "横向线" }), /* @__PURE__ */ (0, w.jsx)("input", {
								"aria-label": "横向线",
								max: "20",
								min: "0",
								onChange: (e) => Y(Math.max(1, Math.min(21, Number(e.target.value) + 1))),
								type: "number",
								value: be - 1
							})] }), /* @__PURE__ */ (0, w.jsxs)("label", { children: [/* @__PURE__ */ (0, w.jsx)("span", { children: "竖向线" }), /* @__PURE__ */ (0, w.jsx)("input", {
								"aria-label": "竖向线",
								max: "20",
								min: "0",
								onChange: (e) => Se(Math.max(1, Math.min(21, Number(e.target.value) + 1))),
								type: "number",
								value: xe - 1
							})] })]
						}),
						/* @__PURE__ */ (0, w.jsxs)("label", {
							className: "grid-gap-control",
							children: [
								/* @__PURE__ */ (0, w.jsx)("span", { children: "间隔(px)" }),
								/* @__PURE__ */ (0, w.jsx)("input", {
									"aria-label": "宫格间隔",
									max: "240",
									min: "0",
									onChange: (e) => we(Math.max(0, Math.min(240, Number(e.target.value)))),
									step: "1",
									type: "range",
									value: Ce
								}),
								/* @__PURE__ */ (0, w.jsx)("span", {
									className: "grid-gap-value",
									children: Ce
								})
							]
						}),
						/* @__PURE__ */ (0, w.jsxs)("span", {
							className: "image-edit-sub",
							children: [
								"将输出 ",
								Te ? (ke.filter((e) => e.type === "h").length + 1) * (ke.filter((e) => e.type === "v").length + 1) : be * xe,
								" 张图片"
							]
						})
					]
				}),
				/* @__PURE__ */ (0, w.jsx)("div", {
					className: `image-edit-stage ${et.width + 36 > se.width ? "overflow-x" : ""} ${et.height + 36 > se.height ? "overflow-y" : ""}`.trim(),
					onWheel: (e) => {
						if (!B) return;
						e.preventDefault(), e.stopPropagation();
						let t = f.current, n = W, r = Math.max(.15, Math.min(6, W * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
						if (t) {
							let i = t.getBoundingClientRect(), a = e.clientX - i.left, o = e.clientY - i.top, s = t.scrollLeft + a, c = t.scrollTop + o;
							window.requestAnimationFrame(() => {
								let e = r / n;
								t.scrollLeft = s * e - a, t.scrollTop = c * e - o;
							});
						}
						de(r);
					},
					ref: f,
					children: /* @__PURE__ */ (0, w.jsx)("div", {
						className: "image-edit-stage-inner",
						children: /* @__PURE__ */ (0, w.jsxs)("div", {
							className: `crop-canvas ${R === "preview" ? "preview-mode" : R === "outpaint" ? `outpaint-mode ${U.width > 4096 || U.height > 4096 ? "outpaint-warning" : ""}` : R === "mask" ? "mask-mode" : R === "brush" ? `brush-mode ${G === "text" ? "text-mode" : ""}` : R === "grid" ? `grid-mode ${Me === "join" ? "grid-join-mode" : Te ? `grid-custom-${De}` : ""}` : ""}`,
							style: B ? {
								height: et.height,
								width: et.width
							} : void 0,
							children: [
								/* @__PURE__ */ (0, w.jsx)("img", {
									alt: "crop source",
									className: R === "grid" && Me === "join" ? "grid-join-hidden" : void 0,
									crossOrigin: /^https?:/i.test(c) ? "anonymous" : void 0,
									onLoad: (e) => {
										let t = e.currentTarget, n = {
											width: t.naturalWidth,
											height: t.naturalHeight
										};
										l.current = t;
										let r = {
											width: t.clientWidth || n.width,
											height: t.clientHeight || n.height
										};
										oe(r), V(n), H({
											x: n.width * .08,
											y: n.height * .08,
											width: n.width * .84,
											height: n.height * .84
										}), ue({
											offsetX: 0,
											offsetY: 0,
											width: n.width,
											height: n.height
										});
									},
									onError: () => Ye("无法读取图片，远程图片可能不允许跨域编辑"),
									onPointerDown: (e) => {
										R === "outpaint" && rt(e, "image");
									},
									src: c,
									style: B ? R === "outpaint" ? {
										height: Xe.height,
										left: U.offsetX * Ze,
										maxHeight: "none",
										maxWidth: "none",
										top: U.offsetY * Z,
										width: Xe.width
									} : {
										height: Xe.height,
										maxHeight: "none",
										maxWidth: "none",
										width: Xe.width
									} : void 0
								}),
								R === "grid" && Me === "join" ? /* @__PURE__ */ (0, w.jsx)("div", {
									className: "grid-join-canvas",
									id: "gridJoinCanvas",
									ref: T,
									style: {
										display: "block",
										height: $e.height * W,
										width: $e.width * W
									},
									children: $e.items.map((e) => {
										let t = Qe[e.index], n = E.current?.index === e.index;
										return /* @__PURE__ */ (0, w.jsx)("img", {
											alt: t?.name || `grid ${e.index + 1}`,
											className: `grid-join-item ${n ? "dragging" : ""}`,
											crossOrigin: /^https?:/i.test(t?.url || "") ? "anonymous" : void 0,
											"data-grid-join-index": e.index,
											draggable: !1,
											onPointerCancel: xt,
											onPointerDown: (t) => yt(t, e.index),
											onPointerMove: bt,
											onPointerUp: xt,
											src: t?.url,
											style: {
												height: e.height * W,
												left: e.x * W,
												objectFit: "cover",
												top: e.y * W,
												transform: n ? `translate(${He.x}px, ${He.y}px)` : void 0,
												width: e.width * W
											}
										}, `${t?.url}-${e.index}`);
									})
								}) : null,
								/* @__PURE__ */ (0, w.jsx)("canvas", {
									className: "edit-draw-canvas",
									height: B?.height || 1,
									onPointerCancel: mt,
									onPointerDown: ft,
									onPointerLeave: mt,
									onPointerMove: pt,
									onPointerUp: mt,
									ref: u,
									style: {
										display: R === "grid" && Me === "join" ? "none" : void 0,
										height: Xe.height,
										left: R === "outpaint" ? U.offsetX * Ze : void 0,
										top: R === "outpaint" ? U.offsetY * Z : void 0,
										width: Xe.width
									},
									width: B?.width || 1
								}),
								/* @__PURE__ */ (0, w.jsx)("canvas", {
									className: "edit-text-canvas",
									height: B?.height || 1,
									onDoubleClick: ht,
									onPointerDown: ht,
									ref: d,
									style: {
										display: R === "grid" && Me === "join" ? "none" : void 0,
										height: Xe.height,
										left: R === "outpaint" ? U.offsetX * Ze : void 0,
										top: R === "outpaint" ? U.offsetY * Z : void 0,
										width: Xe.width
									},
									width: B?.width || 1
								}),
								Tt ? /* @__PURE__ */ (0, w.jsx)("div", {
									className: "edit-text-inline",
									contentEditable: !0,
									onBlur: (e) => {
										let t = e.currentTarget.textContent?.trim() || "";
										J((e) => t ? e.map((e) => e.id === Tt.id ? {
											...e,
											text: t
										} : e) : e.filter((e) => e.id !== Tt.id)), ye("");
									},
									onKeyDown: (e) => {
										e.key === "Enter" && !e.shiftKey && (e.preventDefault(), e.currentTarget.blur()), e.key === "Escape" && (e.preventDefault(), ye(""));
									},
									ref: (e) => {
										e && document.activeElement !== e && (e.textContent = Tt.text, window.requestAnimationFrame(() => e.focus()));
									},
									style: {
										color: Tt.color,
										fontSize: Tt.size * Z,
										left: Tt.x * Ze,
										top: Tt.y * Z,
										transform: "translate(-50%, -50%)"
									},
									suppressContentEditableWarning: !0
								}) : null,
								/* @__PURE__ */ (0, w.jsx)("div", {
									className: "crop-box",
									onPointerDown: (e) => rt(e, "crop-move"),
									style: {
										height: le.height * Z,
										left: le.x * Ze,
										top: le.y * Z,
										width: le.width * Ze
									},
									children: /* @__PURE__ */ (0, w.jsx)("div", {
										className: "crop-handle",
										onPointerDown: (e) => rt(e, "crop-resize")
									})
								}),
								/* @__PURE__ */ (0, w.jsx)("div", {
									className: "outpaint-frame",
									onPointerDown: (e) => {
										e.target.closest("[data-outpaint-handle]") || rt(e, "image");
									},
									style: {
										height: et.height,
										width: et.width
									},
									children: [
										"top",
										"right",
										"bottom",
										"left",
										"corner"
									].map((e) => /* @__PURE__ */ (0, w.jsx)("div", {
										className: "outpaint-handle",
										"data-outpaint-handle": e,
										onPointerDown: (t) => rt(t, `outpaint-${e}`)
									}, e))
								}),
								/* @__PURE__ */ (0, w.jsxs)("div", {
									className: "outpaint-resolution",
									children: [
										Math.round(U.width),
										" x ",
										Math.round(U.height)
									]
								})
							]
						})
					})
				}),
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: "image-edit-actions",
					children: [
						/* @__PURE__ */ (0, w.jsxs)("span", {
							onDoubleClick: () => {
								de(1), f.current && (f.current.scrollLeft = 0, f.current.scrollTop = 0);
							},
							style: {
								color: "#94a3b8",
								cursor: "pointer",
								fontSize: 11,
								fontWeight: 800,
								marginRight: "auto",
								padding: "0 4px",
								userSelect: "none"
							},
							title: "双击重置缩放",
							children: [Math.round(W * 100), "%"]
						}),
						/* @__PURE__ */ (0, w.jsxs)("button", {
							className: "image-edit-btn secondary",
							disabled: !B || Ke,
							onClick: () => tt(),
							type: "button",
							children: [/* @__PURE__ */ (0, w.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": "rotate-ccw"
							}), /* @__PURE__ */ (0, w.jsx)("span", { children: "重置" })]
						}),
						/* @__PURE__ */ (0, w.jsx)("button", {
							className: "image-edit-btn secondary",
							disabled: Ke,
							onClick: i,
							type: "button",
							children: "取消"
						}),
						R === "preview" ? null : /* @__PURE__ */ (0, w.jsxs)("button", {
							className: "image-edit-btn primary",
							disabled: !B || Ke,
							onClick: () => void gt(),
							type: "button",
							children: [/* @__PURE__ */ (0, w.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": N(R)
							}), /* @__PURE__ */ (0, w.jsx)("span", { children: Ke ? "正在上传…" : R === "grid" && Me === "join" ? "输出拼接" : P(R) })]
						})
					]
				}),
				Je ? /* @__PURE__ */ (0, w.jsx)("div", {
					className: "image-edit-sub",
					"data-testid": "image-transform-status",
					children: Je
				}) : null
			]
		})
	});
}
function k({ active: e, icon: t, label: n, onClick: r }) {
	return /* @__PURE__ */ (0, w.jsxs)("button", {
		className: e ? "active" : "",
		onClick: r,
		type: "button",
		children: [/* @__PURE__ */ (0, w.jsx)("i", {
			className: "w-3.5 h-3.5",
			"data-lucide": t
		}), /* @__PURE__ */ (0, w.jsx)("span", { children: n })]
	});
}
function A({ disabled: e, icon: t, label: n, onClick: r }) {
	return /* @__PURE__ */ (0, w.jsx)("button", {
		"aria-label": n,
		className: "image-edit-btn secondary",
		disabled: e,
		onClick: r,
		style: { opacity: e ? .42 : 1 },
		title: n,
		type: "button",
		children: /* @__PURE__ */ (0, w.jsx)("i", {
			className: "w-4 h-4",
			"data-lucide": t
		})
	});
}
function j(e) {
	return e === "preview" ? "预览图片" : e === "crop" ? "裁剪图片" : e === "outpaint" ? "扩图" : e === "mask" ? "遮罩编辑" : e === "brush" ? "画笔编辑" : "宫格切分";
}
function M(e) {
	return e === "preview" ? "滚轮缩放查看图片" : e === "crop" ? "拖动裁剪区域并调整右下角控制点" : e === "outpaint" ? "拖动原图或边缘控制点调整画布" : e === "mask" ? "白色绘制区域将生成黑白遮罩图" : e === "brush" ? "使用画笔、图形、数字或文字标记图片" : "使用预设或自定义切割线批量拆分图片";
}
function N(e) {
	return e === "crop" ? "crop" : e === "outpaint" ? "expand" : e === "mask" ? "brush" : e === "brush" ? "paintbrush" : "grid-3x3";
}
function P(e) {
	return e === "crop" ? "应用裁剪" : e === "outpaint" ? "应用扩图" : e === "mask" ? "应用遮罩" : e === "brush" ? "应用画笔" : "应用切分";
}
function F(e) {
	let t = e.getContext("2d")?.getImageData(0, 0, e.width, e.height).data;
	if (!t) return !1;
	for (let e = 3; e < t.length; e += 4) if (t[e] > 0) return !0;
	return !1;
}
function ee(e) {
	let t = e.getContext("2d");
	if (!t) return;
	let n = t.getImageData(0, 0, e.width, e.height), r = !1;
	for (let e = 0; e < n.data.length; e += 4) n.data[e + 3] && (n.data[e] = 255, n.data[e + 1] = 255, n.data[e + 2] = 255, n.data[e + 3] > 115 && (n.data[e + 3] = 115), r = !0);
	r && t.putImageData(n, 0, 0);
}
function te(e, t) {
	return `${String(e || "image").replace(/\.[^.]+$/, "") || "image"}_${t}.png`;
}
function I(e, t) {
	let n = Math.max(24, Math.min(t.width, Number(e.width) || 24)), r = Math.max(24, Math.min(t.height, Number(e.height) || 24));
	return {
		width: n,
		height: r,
		x: Math.max(0, Math.min(t.width - n, Number(e.x) || 0)),
		y: Math.max(0, Math.min(t.height - r, Number(e.y) || 0))
	};
}
function ne(e, t) {
	let n = Math.max(t.width, Number(e.width) || t.width), r = Math.max(t.height, Number(e.height) || t.height);
	return {
		width: n,
		height: r,
		offsetX: Math.max(0, Math.min(n - t.width, Number(e.offsetX) || 0)),
		offsetY: Math.max(0, Math.min(r - t.height, Number(e.offsetY) || 0))
	};
}
function L(e, t, n, r, i) {
	let a = Math.max(1, Number(r) || 1), o = Math.max(1, Number(n) || 1, Math.ceil(e.length / a)), s = Math.max(0, Math.min(240, Number(i) || 0)), c = e.map((e) => Math.max(1, Number(e.natural_w) || 512)), l = e.map((e) => Math.max(1, Number(e.natural_h) || 512)), u = Math.max(1, ...c), d = Math.max(1, ...l), f = Math.min(1, 420 / Math.max(u, d)), p = Math.max(1, Math.round(u * f)), m = Math.max(1, Math.round(d * f)), h = [...new Set(t.filter((t) => Number.isInteger(t) && t >= 0 && t < e.length)), ...e.map((e, t) => t).filter((e) => !t.includes(e))].map((e, t) => ({
		height: m,
		index: e,
		width: p,
		x: t % a * (p + s),
		y: Math.floor(t / a) * (m + s)
	}));
	return {
		cols: a,
		gap: s,
		height: Math.max(o * m + Math.max(0, o - 1) * s, ...h.map((e) => e.y + e.height), 1),
		items: h,
		rows: o,
		width: Math.max(a * p + Math.max(0, a - 1) * s, ...h.map((e) => e.x + e.width), 1)
	};
}
async function re(e, t, n, r) {
	let i = Math.max(1, Math.max(256, Number(n) || 2048) / Math.max(1, t.width, t.height)), a = document.createElement("canvas");
	a.width = Math.max(1, Math.round(t.width * i)), a.height = Math.max(1, Math.round(t.height * i));
	let o = a.getContext("2d");
	if (!o) throw Error("无法创建拼接画布");
	o.fillStyle = "#ffffff", o.fillRect(0, 0, a.width, a.height);
	for (let n of t.items) {
		let t = e[n.index];
		t && ie(o, await R(t.url), Math.round(n.x * i), Math.round(n.y * i), Math.round(n.width * i), Math.round(n.height * i));
	}
	let s = String(r || e[0]?.name || "image").replace(/\.[^.]+$/, "") || "image";
	return {
		blob: await z(a),
		height: a.height,
		name: `${s}_join.png`,
		width: a.width
	};
}
function R(e) {
	return new Promise((t, n) => {
		let r = new Image();
		r.crossOrigin = "anonymous", r.onload = () => t(r), r.onerror = () => n(/* @__PURE__ */ Error("图片加载失败")), r.src = e;
	});
}
function ie(e, t, n, r, i, a) {
	let o = Math.max(1, t.naturalWidth || t.width || 1), s = Math.max(1, t.naturalHeight || t.height || 1), c = Math.max(i / o, a / s), l = Math.max(1, i / c), u = Math.max(1, a / c);
	e.drawImage(t, Math.max(0, (o - l) / 2), Math.max(0, (s - u) / 2), l, u, n, r, i, a);
}
function z(e) {
	return new Promise((t, n) => e.toBlob((e) => e ? t(e) : n(/* @__PURE__ */ Error("无法生成编辑后的 PNG 图片")), "image/png"));
}
//#endregion
//#region src/canvas/domain/output-preview.ts
function B(e) {
	return typeof e == "string" ? e : String(H(e).url || "");
}
function V(e) {
	let t = H(e), n = String(t.kind || t.mediaKind || "").toLowerCase();
	if (n) return n;
	let r = B(e).split(/[?#]/, 1)[0].toLowerCase();
	return /\.(mp4|webm|mov|m4v)$/.test(r) ? "video" : /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(r) ? "audio" : "image";
}
function ae(e) {
	return (e.type === "image" && e.url ? [{
		kind: e.mediaKind || "image",
		name: e.name,
		url: e.url
	}] : Array.isArray(e.images) ? e.images : []).map((e, t) => {
		let n = H(e), r = B(e), i = V(e);
		return !r || i !== "image" && i !== "video" ? null : {
			kind: i,
			meta: n,
			name: String(n.name || r.split(/[?#]/, 1)[0].split("/").pop() || `output-${t + 1}`),
			url: r
		};
	}).filter((e) => !!e);
}
function oe(e, t) {
	return H((Array.isArray(e.images) ? e.images : []).find((e) => B(e) === t));
}
function se(e, t) {
	let n = H(e.imageComparisons)[t];
	if (typeof n == "string") return n;
	let r = String(H(n).url || "");
	if (r) return r;
	let i = H(oe(e, t).run), a = (Array.isArray(i.refs) ? i.refs : []).map(H).find((e) => e.url);
	return String(a?.url || "");
}
function ce(e) {
	let t = Math.max(0, Math.round(Number(e || 0) / 1e3)), n = Math.floor(t / 60), r = t % 60;
	return n ? `${n}m ${String(r).padStart(2, "0")}s` : `${r}s`;
}
function le(e, t = Date.now()) {
	let n = String(e || "").split(/[?#]/, 1)[0];
	return `canvas-output-${t}.${(n.includes(".") ? n.split(".").pop() : "png") || "png"}`;
}
function H(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
//#endregion
//#region src/canvas/ui/legacy-output-lightbox.tsx
function U({ node: e, onClose: t, onNavigate: n, onRerun: r, onViewed: i, url: a }) {
	let o = (0, p.useMemo)(() => ae(e), [e]), s = oe(e, a), c = W(s.run), l = String(c.prompt || ""), u = se(e, a), d = o.find((e) => e.url === a)?.kind === "video", [f, h] = (0, p.useState)(!1), [g, _] = (0, p.useState)(50), [v, y] = (0, p.useState)(!1), [b, x] = (0, p.useState)(!1), [S, C] = (0, p.useState)({
		x: 0,
		y: 0
	}), [T, E] = (0, p.useState)("--"), [D, O] = (0, p.useState)(1), k = (0, p.useRef)(null), A = (0, p.useRef)(null), j = (0, p.useRef)(null), M = (0, p.useRef)(!1), N = (0, p.useRef)(i);
	(0, p.useEffect)(() => {
		N.current = i;
	}, [i]), (0, p.useEffect)(() => {
		h(!1), _(50), C({
			x: 0,
			y: 0
		}), x(!1), E("--"), O(1), N.current(a);
	}, [a]), (0, p.useEffect)(() => {
		let e = window.requestAnimationFrame(() => window.lucide?.createIcons());
		return () => window.cancelAnimationFrame(e);
	}, [
		f,
		v,
		a
	]), (0, p.useEffect)(() => {
		let e = (e) => {
			if (e.key === "Escape") {
				e.preventDefault(), e.stopImmediatePropagation(), t();
				return;
			}
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" || o.length < 2) return;
			let r = Math.max(0, o.findIndex((e) => e.url === a)), i = e.key === "ArrowRight" ? 1 : -1;
			e.preventDefault(), e.stopImmediatePropagation(), n(o[(r + i + o.length) % o.length].url);
		};
		return window.addEventListener("keydown", e, !0), () => window.removeEventListener("keydown", e, !0);
	}, [
		o,
		t,
		n,
		a
	]), (0, p.useEffect)(() => {
		let e = (e) => {
			M.current && ue(e.clientX, A.current, _), j.current && C({
				x: j.current.origin.x + e.clientX - j.current.start.x,
				y: j.current.origin.y + e.clientY - j.current.start.y
			});
		}, t = () => {
			M.current = !1, j.current = null, x(!1);
		};
		return window.addEventListener("pointermove", e), window.addEventListener("pointerup", t), () => {
			window.removeEventListener("pointermove", e), window.removeEventListener("pointerup", t);
		};
	}, []);
	let P = `translate(${S.x}px, ${S.y}px) scale(${D})`, F = s.runMs ? ce(s.runMs) : "", ee = !!(l || s.run), te = (e) => {
		M.current = !0, ue(e.clientX, A.current, _), e.preventDefault(), e.stopPropagation();
	}, I = (e) => {
		let t = e.target;
		d || e.button !== 0 || D <= 1.001 || t.closest(".output-preview-actions, .output-resolution, .output-compare-slider") || (j.current = {
			origin: S,
			start: {
				x: e.clientX,
				y: e.clientY
			}
		}, x(!0), e.preventDefault(), e.stopPropagation());
	}, ne = (e) => {
		if (d) return;
		e.preventDefault(), e.stopPropagation();
		let t = k.current?.getBoundingClientRect();
		if (!t) return;
		let n = {
			x: e.clientX - t.left,
			y: e.clientY - t.top
		}, r = {
			x: (n.x - S.x) / D,
			y: (n.y - S.y) / D
		}, i = Math.max(1, Math.min(6, D * (e.deltaY > 0 ? .9 : 1.1)));
		O(i), C(i <= 1.001 ? {
			x: 0,
			y: 0
		} : {
			x: n.x - r.x * i,
			y: n.y - r.y * i
		});
	}, L = async () => {
		l && (await navigator.clipboard.writeText(l), y(!0), window.setTimeout(() => y(!1), 1200));
	};
	return (0, m.createPortal)(/* @__PURE__ */ (0, w.jsx)("div", {
		"aria-label": "输出预览",
		className: "output-lightbox open canvas-v2-lightbox",
		onClick: t,
		role: "dialog",
		style: { zIndex: 1100 },
		children: /* @__PURE__ */ (0, w.jsxs)("div", {
			className: "output-lightbox-shell",
			onClick: (e) => e.stopPropagation(),
			onPointerDown: (e) => e.stopPropagation(),
			children: [/* @__PURE__ */ (0, w.jsxs)("div", {
				className: `output-preview ${f ? "compare-mode" : ""} ${b ? "panning" : ""} ${D > 1.001 ? "zoomed" : ""}`.trim(),
				"data-preview-url": a,
				"data-preview-zoom": D.toFixed(3),
				onDoubleClick: (e) => {
					e.stopPropagation(), !d && u && h((e) => !e);
				},
				onPointerDown: I,
				onWheel: ne,
				ref: k,
				children: [
					/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "output-compare",
						onPointerDown: te,
						ref: A,
						children: [
							/* @__PURE__ */ (0, w.jsx)("img", {
								alt: "result image",
								draggable: !1,
								src: d ? "" : a,
								style: {
									transform: P,
									transformOrigin: "0 0"
								}
							}),
							/* @__PURE__ */ (0, w.jsx)("div", {
								className: "output-compare-original-wrap",
								style: { clipPath: `inset(0 ${100 - g}% 0 0)` },
								children: /* @__PURE__ */ (0, w.jsx)("img", {
									alt: "input image",
									draggable: !1,
									src: u,
									style: {
										transform: P,
										transformOrigin: "0 0"
									}
								})
							}),
							/* @__PURE__ */ (0, w.jsx)("div", {
								className: "output-compare-slider",
								onPointerDown: te,
								style: { left: `${g}%` },
								children: /* @__PURE__ */ (0, w.jsx)("div", {
									className: "output-compare-handle",
									children: /* @__PURE__ */ (0, w.jsx)("i", {
										className: "w-4 h-4",
										"data-lucide": "move-horizontal"
									})
								})
							})
						]
					}),
					d ? null : /* @__PURE__ */ (0, w.jsx)("img", {
						alt: "output preview",
						className: "output-single-img",
						draggable: !1,
						onLoad: (e) => E(`${e.currentTarget.naturalWidth} x ${e.currentTarget.naturalHeight}`),
						src: a,
						style: {
							transform: P,
							transformOrigin: "0 0"
						}
					}),
					d ? /* @__PURE__ */ (0, w.jsx)("video", {
						className: "output-single-video",
						controls: !0,
						controlsList: "nodownload noplaybackrate noremoteplayback",
						disablePictureInPicture: !0,
						onLoadedMetadata: (e) => E(e.currentTarget.videoWidth && e.currentTarget.videoHeight ? `${e.currentTarget.videoWidth} x ${e.currentTarget.videoHeight}` : "Video"),
						playsInline: !0,
						src: a
					}) : null,
					/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "output-preview-bar",
						children: [/* @__PURE__ */ (0, w.jsxs)("div", {
							className: "output-resolution",
							children: [T, F ? /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [/* @__PURE__ */ (0, w.jsx)("span", {
								style: { opacity: .38 },
								children: "|"
							}), /* @__PURE__ */ (0, w.jsx)("span", { children: F })] }) : null]
						}), /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "output-preview-actions",
							children: [/* @__PURE__ */ (0, w.jsx)("a", {
								"aria-label": "下载",
								className: "preview-icon-btn",
								download: le(a),
								href: a,
								onClick: (e) => e.stopPropagation(),
								title: "下载",
								children: /* @__PURE__ */ (0, w.jsx)("i", {
									className: "w-4 h-4",
									"data-lucide": "download"
								})
							}), /* @__PURE__ */ (0, w.jsx)("button", {
								"aria-label": "关闭",
								className: "preview-icon-btn",
								onClick: t,
								title: "关闭",
								type: "button",
								children: /* @__PURE__ */ (0, w.jsx)("i", {
									className: "w-4 h-4",
									"data-lucide": "x"
								})
							})]
						})]
					})
				]
			}), /* @__PURE__ */ (0, w.jsxs)("div", {
				className: `output-prompt-panel ${ee ? "open" : ""}`,
				children: [/* @__PURE__ */ (0, w.jsx)("div", {
					className: "output-prompt-text",
					children: l || "暂无提示词元数据"
				}), /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "output-prompt-actions",
					children: [/* @__PURE__ */ (0, w.jsxs)("button", {
						className: `preview-text-btn secondary ${v ? "copied" : ""}`,
						disabled: !l,
						onClick: () => void L(),
						type: "button",
						children: [/* @__PURE__ */ (0, w.jsx)("i", {
							className: "w-3.5 h-3.5",
							"data-lucide": "copy"
						}), /* @__PURE__ */ (0, w.jsx)("span", { children: v ? "已复制" : "复制提示词" })]
					}), /* @__PURE__ */ (0, w.jsxs)("button", {
						className: "preview-text-btn",
						onClick: () => r(s),
						type: "button",
						children: [/* @__PURE__ */ (0, w.jsx)("i", {
							className: "w-3.5 h-3.5",
							"data-lucide": "refresh-cw"
						}), /* @__PURE__ */ (0, w.jsx)("span", { children: "再次运行" })]
					})]
				})]
			})]
		})
	}), document.querySelector(".shell") || document.body);
}
function ue(e, t, n) {
	let r = t?.getBoundingClientRect();
	r?.width && n(Math.max(0, Math.min(100, (e - r.left) / r.width * 100)));
}
function W(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
//#endregion
//#region src/canvas/infrastructure/asset-library-client.ts
var de = {
	list: () => G("/api/asset-library"),
	createLibrary: (e) => G("/api/asset-library/libraries", K("POST", { name: e })),
	renameLibrary: (e, t) => G(`/api/asset-library/libraries/${encodeURIComponent(e)}`, K("PATCH", { name: t })),
	deleteLibrary: (e) => G(`/api/asset-library/libraries/${encodeURIComponent(e)}`, K("DELETE")),
	createCategory: (e, t, n = "image") => G("/api/asset-library/categories", K("POST", {
		library_id: e,
		name: t,
		type: n
	})),
	renameCategory: (e, t, n) => G(`/api/asset-library/categories/${encodeURIComponent(t)}`, K("PATCH", {
		library_id: e,
		name: n
	})),
	deleteCategory: (e, t) => G(`/api/asset-library/categories/${encodeURIComponent(t)}?library_id=${encodeURIComponent(e)}`, K("DELETE")),
	addUrl: (e, t, n, r) => G("/api/asset-library/items", K("POST", {
		category_id: t,
		library_id: e,
		name: r,
		url: n
	})),
	addBatch: (e, t, n) => G("/api/asset-library/items/batch", K("POST", {
		category_id: t,
		items: n.map((n) => ({
			...n,
			category_id: t,
			library_id: e
		})),
		library_id: e
	})),
	upload: async (e) => {
		let t = new FormData();
		return e.forEach((e) => t.append("files", e, e.name || "media")), G("/api/ai/upload", {
			method: "POST",
			body: t
		});
	},
	renameItem: (e, t) => G(`/api/asset-library/items/${encodeURIComponent(e)}`, K("PATCH", { name: t })),
	deleteItem: (e, t) => G("/api/asset-library/items/delete", K("POST", {
		ids: [t],
		library_id: e
	})),
	saveWorkflow: (e, t, n) => G("/api/canvas-workflows/export-to-library", K("POST", {
		...n,
		category_id: t,
		include_resources: !0,
		library_id: e
	}))
};
async function G(e, t) {
	let n = await fetch(e, t), r = await n.json().catch(() => ({}));
	if (!n.ok) {
		let e = r.detail;
		throw Error(typeof e == "string" ? e : e?.message || `请求失败 (${n.status})`);
	}
	return r;
}
function K(e, t) {
	return {
		method: e,
		headers: t === void 0 ? void 0 : { "Content-Type": "application/json" },
		body: t === void 0 ? void 0 : JSON.stringify(t)
	};
}
//#endregion
//#region src/canvas/ui/smart-canvas-mention-picker.tsx
function fe({ inputRef: e, inputItems: t, onPromptChange: n, outputId: r, readOnly: i }) {
	let a = (0, p.useRef)(null), o = (0, p.useRef)(null), [s, c] = (0, p.useState)(!1), [l, u] = (0, p.useState)("input"), [d, f] = (0, p.useState)(null), [h, g] = (0, p.useState)(!1), [_, v] = (0, p.useState)(""), [y, b] = (0, p.useState)(""), [x, S] = (0, p.useState)({
		left: 8,
		top: 2
	}), [C, T] = (0, p.useState)(null);
	(0, p.useEffect)(() => {
		let e = !0;
		return de.list().then((t) => {
			if (!e) return;
			f(t.library);
			let n = t.library?.libraries || [], r = t.library?.active_library_id || n[0]?.id || "";
			v(r), g(!0);
		}).catch(() => {
			e && g(!0);
		}), () => {
			e = !1;
		};
	}, []);
	let E = (0, p.useMemo)(() => he(d), [d]), D = E.find((e) => e.id === _) || E[0] || null, O = (0, p.useMemo)(() => (D?.categories || []).filter((e) => (e.type || "image") === "image"), [D]), k = O.find((e) => e.id === y) || O[0] || null, A = (0, p.useMemo)(() => me(k).slice(0, 36), [k]), j = l === "asset" ? A : t.map((e) => ({
		...e,
		alias: e.name
	})).slice(0, 36), M = t.length > 0, N = E.some((e) => e.categories.some((e) => (e.type || "image") === "image" && e.items.some((e) => e.url)));
	(0, p.useEffect)(() => {
		!_ && E[0]?.id && v(E[0].id);
	}, [_, E]), (0, p.useEffect)(() => {
		O.some((e) => e.id === y) || b(O[0]?.id || "");
	}, [y, O]), (0, p.useEffect)(() => {
		c(!1), T(null), o.current = null;
	}, [r]), (0, p.useEffect)(() => {
		let t = e.current;
		if (!t || i) return;
		let n = () => {
			let e = window.getSelection();
			e?.rangeCount && t.contains(e.anchorNode) && (o.current = e.getRangeAt(0).cloneRange());
		}, r = () => {
			let e = window.getSelection();
			if (!e?.rangeCount || !t.contains(e.anchorNode)) return "";
			let n = e.getRangeAt(0).cloneRange();
			return n.selectNodeContents(t), n.setEnd(e.anchorNode, e.anchorOffset), n.toString();
		}, s = () => {
			let e = t.closest(".prompt-row");
			if (!e) return;
			let n = e.getBoundingClientRect(), r = t.getBoundingClientRect(), i = window.getSelection(), o = i?.rangeCount ? i.getRangeAt(0).cloneRange().getBoundingClientRect() : null, s = e.offsetWidth > 0 ? n.width / e.offsetWidth : 1, c = s > 0 ? s : 1, l = a.current?.offsetWidth || 340, u = Math.max(4, e.offsetWidth - l - 4), d = ((o?.left || r.left) - n.left) / c - 6, f = ((o?.bottom || r.top + 24) - n.top) / c + 2;
			S({
				left: Math.max(4, Math.min(d, u)),
				top: Math.max(2, f)
			});
		}, l = () => {
			if (n(), !/@$/.test(r())) {
				c(!1);
				return;
			}
			if (M) u("input");
			else if (N || !h) u("asset");
			else {
				c(!1);
				return;
			}
			s(), c(!0), window.requestAnimationFrame(s);
		}, d = (e) => {
			e.key === "Escape" && c(!1);
		}, f = (e) => {
			let t = e.target?.closest?.(".mention-image-token");
			if (!t) return;
			let n = t.dataset.url || "";
			if (!n) return;
			let r = t.getBoundingClientRect();
			T({
				item: {
					alias: t.dataset.name || "图片",
					assetUris: ge(t.dataset.assetUris),
					imageIndex: Number(t.dataset.imageIndex || 0),
					kind: t.dataset.kind === "video" ? "video" : "image",
					name: t.dataset.name || "图片",
					nodeId: t.dataset.nodeId || "",
					url: n
				},
				left: Math.min(window.innerWidth - 236, r.left),
				top: Math.min(window.innerHeight - 236, r.bottom + 8)
			});
		}, p = (e) => {
			e.target?.closest?.(".mention-image-token") && T(null);
		};
		return t.addEventListener("input", l), t.addEventListener("keyup", l), t.addEventListener("mouseup", n), t.addEventListener("focus", n), t.addEventListener("keydown", d), t.addEventListener("mouseover", f), t.addEventListener("mouseout", p), () => {
			t.removeEventListener("input", l), t.removeEventListener("keyup", l), t.removeEventListener("mouseup", n), t.removeEventListener("focus", n), t.removeEventListener("keydown", d), t.removeEventListener("mouseover", f), t.removeEventListener("mouseout", p);
		};
	}, [
		h,
		N,
		M,
		e,
		i
	]), (0, p.useEffect)(() => {
		let e = (e) => {
			let t = e.target;
			!t?.closest(".mention-picker") && !t?.closest("#promptInput") && c(!1);
		};
		return document.addEventListener("click", e), () => document.removeEventListener("click", e);
	}, []), (0, p.useEffect)(() => {
		s && window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		y,
		_,
		j.length,
		s,
		l
	]);
	let P = (t) => {
		let r = e.current;
		if (!r || !t.url) return;
		r.focus();
		let i = window.getSelection(), a = o.current;
		a && r.contains(a.commonAncestorContainer) && (i?.removeAllRanges(), i?.addRange(a));
		let s = i?.rangeCount ? i.getRangeAt(0) : document.createRange(), l = !1;
		if (s.startContainer.nodeType === Node.TEXT_NODE && s.startOffset > 0 && (s.startContainer.textContent || "")[s.startOffset - 1] === "@" && (s.setStart(s.startContainer, s.startOffset - 1), s.deleteContents(), l = !0), !l) {
			let e = document.createTreeWalker(r, NodeFilter.SHOW_TEXT), t = null;
			for (; e.nextNode();) t = e.currentNode;
			t && /@$/.test(t.textContent || "") && (t.textContent = (t.textContent || "").slice(0, -1), s.selectNodeContents(r), s.collapse(!1));
		}
		let u = document.createElement("span");
		u.className = "mention-image-token", u.contentEditable = "false", u.dataset.url = t.url, u.dataset.name = t.alias || t.name || "图片", u.dataset.kind = t.kind, u.dataset.nodeId = t.nodeId || "", u.dataset.imageIndex = String(t.imageIndex ?? ""), u.dataset.assetUris = JSON.stringify(t.assetUris || {});
		let d = document.createElement(t.kind === "video" ? "video" : "img");
		d.setAttribute("src", t.url), d.setAttribute("alt", ""), d instanceof HTMLVideoElement ? (d.muted = !0, d.playsInline = !0, d.preload = "metadata") : d.draggable = !1;
		let f = document.createElement("span");
		f.textContent = u.dataset.name, u.append(d, f), s.insertNode(u);
		let p = document.createTextNode(" ");
		u.after(p), s.setStartAfter(p), s.collapse(!0), i?.removeAllRanges(), i?.addRange(s), o.current = s.cloneRange(), c(!1), n(pe(r), !0), r.focus();
	}, F = {
		left: x.left,
		top: x.top
	}, ee = C ? /* @__PURE__ */ (0, w.jsx)("div", {
		className: "mention-preview",
		id: "mentionPreview",
		style: {
			display: "block",
			left: C.left,
			top: C.top
		},
		children: C.item.kind === "video" ? /* @__PURE__ */ (0, w.jsx)("video", {
			autoPlay: !0,
			disablePictureInPicture: !0,
			loop: !0,
			muted: !0,
			playsInline: !0,
			preload: "metadata",
			src: C.item.url
		}) : /* @__PURE__ */ (0, w.jsx)("img", {
			alt: "preview",
			src: C.item.url
		})
	}) : /* @__PURE__ */ (0, w.jsx)("div", {
		className: "mention-preview",
		id: "mentionPreview",
		children: /* @__PURE__ */ (0, w.jsx)("img", { alt: "preview" })
	});
	return /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [/* @__PURE__ */ (0, w.jsx)("div", {
		className: `mention-picker ${s ? "open" : ""}`,
		id: "mentionPicker",
		onMouseDown: (e) => e.stopPropagation(),
		ref: a,
		style: F,
		children: s ? /* @__PURE__ */ (0, w.jsxs)("div", {
			className: "mention-picker-shell",
			children: [
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: "mention-source-tabs",
					children: [/* @__PURE__ */ (0, w.jsxs)("button", {
						className: `mention-source-tab ${l === "input" ? "active" : ""}`,
						"data-mention-source": "input",
						disabled: !M,
						onMouseDown: (e) => {
							e.preventDefault(), e.stopPropagation(), M && u("input");
						},
						title: "画布输入",
						type: "button",
						children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "image" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "画布输入" })]
					}), /* @__PURE__ */ (0, w.jsxs)("button", {
						className: `mention-source-tab ${l === "asset" ? "active" : ""}`,
						"data-mention-source": "asset",
						disabled: h && !N,
						onMouseDown: (e) => {
							e.preventDefault(), e.stopPropagation(), (N || !h) && u("asset");
						},
						title: "资产库",
						type: "button",
						children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "library" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "资产库" })]
					})]
				}),
				l === "asset" && E.length ? /* @__PURE__ */ (0, w.jsxs)("label", {
					className: "mention-library-row",
					children: [/* @__PURE__ */ (0, w.jsx)("span", { children: "资产库" }), /* @__PURE__ */ (0, w.jsx)("select", {
						className: "mention-library-select",
						"data-mention-library": !0,
						onChange: (e) => {
							v(e.target.value), b("");
						},
						onMouseDown: (e) => e.stopPropagation(),
						value: D?.id || "",
						children: E.map((e) => /* @__PURE__ */ (0, w.jsx)("option", {
							value: e.id,
							children: e.name || "资产库"
						}, e.id))
					})]
				}) : null,
				/* @__PURE__ */ (0, w.jsx)("div", {
					className: `mention-folder-chips ${l === "asset" && O.length ? "" : "hidden"}`,
					children: O.map((e) => /* @__PURE__ */ (0, w.jsx)("button", {
						className: `mention-folder-chip ${e.id === k?.id ? "active" : ""}`,
						"data-mention-folder": e.id,
						onMouseDown: (t) => {
							t.preventDefault(), t.stopPropagation(), b(e.id);
						},
						title: e.name || "资产文件夹",
						type: "button",
						children: e.name || "资产文件夹"
					}, e.id))
				}),
				/* @__PURE__ */ (0, w.jsx)("div", {
					className: "mention-content",
					children: j.length ? /* @__PURE__ */ (0, w.jsx)("div", {
						className: "mention-option-grid",
						children: j.map((e, t) => /* @__PURE__ */ (0, w.jsxs)("button", {
							className: "mention-option",
							"data-mention-index": t,
							onMouseDown: (t) => {
								t.preventDefault(), t.stopPropagation(), P(e);
							},
							type: "button",
							children: [e.kind === "video" ? /* @__PURE__ */ (0, w.jsx)("video", {
								muted: !0,
								preload: "metadata",
								src: e.url
							}) : /* @__PURE__ */ (0, w.jsx)("img", {
								alt: "",
								draggable: !1,
								src: e.url
							}), /* @__PURE__ */ (0, w.jsx)("span", { children: e.alias })]
						}, `${e.url}-${t}`))
					}) : /* @__PURE__ */ (0, w.jsx)("div", {
						className: "mention-empty",
						children: "暂无可引用素材"
					})
				})
			]
		}) : null
	}), typeof document < "u" ? (0, m.createPortal)(ee, document.body) : null] });
}
function pe(e) {
	let t = [];
	return e.querySelectorAll(".mention-image-token").forEach((e, n) => {
		let r = e.dataset.url || "";
		r && t.push({
			asset_uris: ge(e.dataset.assetUris),
			imageIndex: Number.isFinite(Number(e.dataset.imageIndex)) ? Number(e.dataset.imageIndex) : n,
			kind: e.dataset.kind === "video" ? "video" : "image",
			name: e.dataset.name || `图片${n + 1}`,
			nodeId: e.dataset.nodeId || "",
			url: r
		});
	}), {
		html: e.innerHTML,
		refs: t,
		text: e.innerText.replace(/\u00a0/g, " ").trim()
	};
}
function me(e) {
	let t = /* @__PURE__ */ new Set();
	return (e?.items || []).flatMap((e, n) => {
		if (!e.url || t.has(e.url)) return [];
		t.add(e.url);
		let r = e.registrations?.volcengine, i = r?.status === "Active" && r.asset_uri ? { volcengine: r.asset_uri } : {};
		return [{
			alias: e.name || `资产${n + 1}`,
			assetUris: i,
			imageIndex: n,
			kind: e.kind === "video" ? "video" : "image",
			name: e.name || `资产${n + 1}`,
			nodeId: "",
			url: e.url
		}];
	});
}
function he(e) {
	return e?.libraries || [];
}
function ge(e) {
	try {
		let t = JSON.parse(e || "{}");
		return t && typeof t == "object" && !Array.isArray(t) ? t : {};
	} catch {
		return {};
	}
}
//#endregion
//#region src/canvas/ui/smart-canvas-mention-picker-state.ts
function q(e) {
	return e.nodeId ? `${e.nodeId}|${e.imageIndex}` : `url|${e.url}`;
}
function _e(e, t, n) {
	if (!e || !t) return [];
	let r = new Map(e.nodes.map((e) => [e.id, e])), i = /* @__PURE__ */ new Map();
	e.connections.forEach((e) => i.set(e.to, [...i.get(e.to) || [], e.from]));
	let a = [], o = /* @__PURE__ */ new Set(), s = (e) => {
		o.has(e.id) || (o.add(e.id), (i.get(e.id) || []).forEach((e) => {
			let t = r.get(e);
			t && s(t);
		}), a.push(e));
	};
	return s(n || t), o.has(t.id) || a.push(t), xe(a.flatMap(Y));
}
function J(e, t, n) {
	if (!e || !t) return [];
	let r = new Map(e.nodes.map((e) => [e.id, e])), i = n ? e.connections.filter((e) => e.to === n.id).map((e) => r.get(e.from)).filter(Boolean) : [], a = ve(t).map((e) => ({
		assetUris: e.asset_uris,
		imageIndex: e.imageIndex,
		kind: e.kind,
		name: e.name,
		nodeId: e.nodeId,
		url: e.url
	})), o = xe([...i, t].flatMap(Y).concat(a)), s = Array.isArray(t.inputRefOrder) ? t.inputRefOrder.map(String) : [];
	if (!s.length) return o.slice(0, 12);
	let c = new Map(s.map((e, t) => [e, t]));
	return o.slice().sort((e, t) => (c.get(q(e)) ?? 2 ** 53 - 1) - (c.get(q(t)) ?? 2 ** 53 - 1)).slice(0, 12);
}
function ve(e) {
	return (Array.isArray(e?.runPromptRefs) ? e.runPromptRefs : []).flatMap((e, t) => {
		let n = Te(e), r = String(n.url || ""), i = Ce(r, n.kind);
		return !r || i === "audio" ? [] : [{
			asset_uris: Te(n.asset_uris),
			imageIndex: we(n.imageIndex, t),
			kind: i,
			name: String(n.name || `图片${t + 1}`),
			nodeId: String(n.nodeId || ""),
			url: r
		}];
	});
}
function ye(e, t) {
	let n = t.filter((e) => e.url && e.name).slice().sort((e, t) => t.name.length - e.name.length);
	if (!e || !n.length || !e.includes("@")) return "";
	let r = "", i = 0;
	for (; i < e.length;) {
		if (e[i] === "@") {
			let t = n.find((t) => e.slice(i + 1, i + 1 + t.name.length) === t.name);
			if (t) {
				r += Se(t), i += t.name.length + 1;
				continue;
			}
		}
		r += De(e[i]), i += 1;
	}
	return r;
}
function be(e, t, n, r) {
	let i = e.map(q);
	if (t < 0 || n < 0 || t >= i.length || n >= i.length || t === n) return i;
	let [a] = i.splice(t, 1), o = i.indexOf(q(e[n]));
	return o < 0 ? e.map(q) : (r === "after" && (o += 1), i.splice(o, 0, a), i);
}
function Y(e) {
	let t = [];
	return e.url && t.push({
		kind: e.mediaKind,
		name: e.name,
		url: e.url
	}), Array.isArray(e.images) && t.push(...e.images), Array.isArray(e.generatedOutputs) && t.push(...e.generatedOutputs), t.flatMap((t, n) => {
		let r = Te(t), i = typeof t == "string" ? t : String(r.url || r.path || r.src || ""), a = Ce(i, r.kind || r.type || e.mediaKind);
		return !i || a === "audio" ? [] : [{
			assetUris: Te(r.asset_uris),
			imageIndex: n,
			kind: a,
			name: String(r.name || e.name || `图片${n + 1}`),
			nodeId: e.id,
			url: i
		}];
	});
}
function xe(e) {
	let t = /* @__PURE__ */ new Set();
	return e.filter((e) => !!(e.url && !t.has(e.url) && t.add(e.url)));
}
function Se(e) {
	let t = e.kind === "video" ? `<video muted playsinline preload="metadata" src="${Ee(e.url)}"></video>` : `<img alt="" draggable="false" src="${Ee(e.url)}">`;
	return `<span class="mention-image-token" contenteditable="false" data-url="${Ee(e.url)}" data-kind="${e.kind}" data-name="${Ee(e.name)}" data-node-id="${Ee(e.nodeId)}" data-image-index="${e.imageIndex}" data-asset-uris="${Ee(JSON.stringify(e.asset_uris || {}))}">${t}<span>${De(e.name)}</span></span>`;
}
function Ce(e, t) {
	let n = String(t || "").toLowerCase();
	return n === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(e) ? "video" : n === "audio" || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(e) ? "audio" : "image";
}
function we(e, t) {
	let n = Number(e);
	return Number.isFinite(n) ? n : t;
}
function Te(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
function Ee(e) {
	return De(e).replace(/"/g, "&quot;");
}
function De(e) {
	return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}
//#endregion
//#region src/canvas/ui/smart-canvas-composer.tsx
var Oe = [
	["1k", "1K"],
	["2k", "2K"],
	["4k", "4K"],
	["custom", "自定义"]
], ke = [
	["square", "1:1"],
	["portrait", "2:3"],
	["landscape", "3:2"],
	["portrait43", "3:4"],
	["landscape43", "4:3"],
	["story", "9:16"],
	["wide", "16:9"],
	["ultrawide", "21:9"],
	["tall", "9:21"],
	["source", "自适应"],
	["custom", "自定义"]
];
function Ae({ canvasRuntime: e, document: t, generator: n, onOpenTemplate: r, onPatchGenerator: i, onPatchOutput: a, onRun: o, output: s, readOnly: c }) {
	let [l, u] = (0, p.useState)(() => Pe(n)), [d, f] = (0, p.useState)(() => n?.type === "video" ? "video" : "image"), [m, h] = (0, p.useState)(() => Le(s)), [g, _] = (0, p.useState)(() => Re(s)), [v, y] = (0, p.useState)([]), [b, x] = (0, p.useState)(-1), [S, C] = (0, p.useState)(null), T = (0, p.useRef)(null), E = n ?? Fe(l, d), D = (0, p.useMemo)(() => _e(t, s, n), [
		t,
		n,
		s
	]), O = (0, p.useMemo)(() => J(t, s, n), [
		t,
		n,
		s
	]), k = (0, p.useMemo)(() => new Set(Array.isArray(s?.blockedInputRefs) ? s.blockedInputRefs.map(String) : []), [s?.blockedInputRefs]), A = (0, p.useMemo)(() => Ve(t, n), [t, n]), j = !!(n && t?.connections.some((e) => e.to === n.id));
	(0, p.useEffect)(() => {
		u(Pe(n)), f(n?.type === "video" ? "video" : "image"), h(Le(s)), _(Re(s));
	}, [n?.id, s?.id]), (0, p.useLayoutEffect)(() => {
		let e = T.current;
		e && (e.innerHTML = He(s));
	}, [s?.id]), (0, p.useEffect)(() => {
		let t = !0, n = String(E.comfyWorkflow || "");
		if (l !== "comfy" || E.mode !== "custom" || !n) {
			y([]);
			return;
		}
		return e.getComfyFields(n).then((e) => {
			t && y(e);
		}), () => {
			t = !1;
		};
	}, [
		E.comfyWorkflow,
		E.mode,
		e,
		l
	]), (0, p.useEffect)(() => {
		window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		l,
		n,
		d,
		s,
		O.length,
		A
	]);
	let M = (e) => {
		u(e), e === "modelscope" ? i({
			count: Number(E.count || 1),
			msRatio: E.msRatio || "square",
			msResolution: E.msResolution || "1k",
			msgenModel: E.msgenModel || "zimage"
		}, "msgen") : e === "comfy" ? i({
			comfyParams: E.comfyParams || {},
			comfyRandomActive: E.comfyRandomActive || {},
			height: Number(E.height || 1024),
			mode: E.mode || "text",
			width: Number(E.width || 1024)
		}, "comfy") : d === "video" ? i({
			apiProvider: e === "volcengine" ? "volcengine" : E.apiProvider || "",
			aspectRatio: E.aspectRatio || "16:9",
			duration: Number(E.duration || 5),
			resolution: E.resolution || ""
		}, "video") : i({
			apiProvider: e === "volcengine" ? "volcengine" : E.apiProvider === "volcengine" ? "" : E.apiProvider || "",
			count: Number(E.count || 1),
			quality: E.quality || "auto",
			ratio: E.ratio || "square",
			resolution: E.resolution || "1k"
		}, "generator");
	}, N = (e) => {
		f(e), e === "video" ? i({
			apiProvider: l === "volcengine" ? "volcengine" : E.apiProvider || "",
			aspectRatio: E.aspectRatio || "16:9",
			duration: Number(E.duration || 5),
			resolution: E.resolution || ""
		}, "video") : i({
			apiProvider: l === "volcengine" ? "volcengine" : E.apiProvider === "volcengine" ? "" : E.apiProvider || "",
			count: Number(E.count || 1),
			quality: E.quality || "auto",
			ratio: E.ratio || "square",
			resolution: E.resolution || "1k"
		}, "generator");
	}, P = (e, t) => {
		h(e.text), a({
			promptDraftHtml: e.html,
			promptDraftText: e.text,
			promptDraftTouched: !0,
			runPromptRefs: e.refs
		}, t);
	}, F = (e = m) => {
		let t = T.current;
		t && (t.textContent = e, P(pe(t), !0));
	}, ee = (e) => {
		if (c || !s) return;
		let t = O[e];
		if (!t) return;
		let n = q(t), r = new Set(k);
		r.has(n) ? r.delete(n) : r.add(n), a({ blockedInputRefs: [...r] }, !0);
	}, te = (e, t) => {
		if (b < 0 || b === t || c) return;
		e.preventDefault(), e.stopPropagation();
		let n = e.currentTarget.getBoundingClientRect(), r = e.clientX < n.left + n.width / 2 ? "before" : "after";
		C({
			index: t,
			placement: r
		});
	}, I = (e, t) => {
		if (b < 0 || b === t || c) return;
		e.preventDefault(), e.stopPropagation();
		let n = e.currentTarget.getBoundingClientRect(), r = e.clientX < n.left + n.width / 2 ? "before" : "after";
		a({ inputRefOrder: be(O, b, t, r) }, !0), x(-1), C(null);
	}, ne = (e) => {
		e.preventDefault(), e.stopPropagation();
		let t = {
			height: g,
			y: e.clientY
		}, n = e.clientY, r = (e) => {
			n = e.clientY, _(Math.max(60, Math.min(380, t.height + e.clientY - t.y)));
		};
		window.addEventListener("pointermove", r), window.addEventListener("pointerup", () => {
			window.removeEventListener("pointermove", r);
			let e = Math.max(60, Math.min(380, t.height + n - t.y));
			_(e), a({ promptH: e }, !0);
		}, { once: !0 });
	}, L = s ? {
		left: Number(s.x || 0) + ze(s) / 2 - 270,
		top: Number(s.y || 0) + Be(s) + 14,
		width: 540,
		"--prompt-h": `${g}px`
	} : {
		width: 540,
		"--prompt-h": `${g}px`
	};
	return /* @__PURE__ */ (0, w.jsx)("div", {
		className: `composer ${s ? "open" : ""}`,
		id: "composer",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		style: L,
		children: /* @__PURE__ */ (0, w.jsxs)("div", {
			className: "composer-card",
			children: [
				/* @__PURE__ */ (0, w.jsx)("div", {
					className: "composer-head",
					children: /* @__PURE__ */ (0, w.jsxs)("div", {
						className: "composer-head-left",
						children: [/* @__PURE__ */ (0, w.jsxs)("select", {
							className: "engine-select",
							disabled: !s || c,
							id: "engineSelect",
							onChange: (e) => M(e.target.value),
							value: l,
							children: [
								/* @__PURE__ */ (0, w.jsx)("option", {
									value: "api",
									children: "API生成"
								}),
								/* @__PURE__ */ (0, w.jsx)("option", {
									value: "volcengine",
									children: "火山引擎"
								}),
								/* @__PURE__ */ (0, w.jsx)("option", {
									value: "modelscope",
									children: "Modelscope生成"
								}),
								/* @__PURE__ */ (0, w.jsx)("option", {
									value: "comfy",
									children: "ComfyUI生成"
								})
							]
						}), /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "kind-toggle",
							id: "apiKindToggle",
							style: { display: l === "api" || l === "volcengine" ? "inline-flex" : "none" },
							children: [/* @__PURE__ */ (0, w.jsxs)("button", {
								className: d === "image" ? "active" : "",
								"data-kind": "image",
								disabled: !s || c,
								onClick: () => N("image"),
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "image" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "图片" })]
							}), /* @__PURE__ */ (0, w.jsxs)("button", {
								className: d === "video" ? "active" : "",
								"data-kind": "video",
								disabled: !s || c,
								onClick: () => N("video"),
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "film" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "视频" })]
							})]
						})]
					})
				}),
				/* @__PURE__ */ (0, w.jsx)("div", {
					className: `input-thumbs-row ${O.length ? "has-items" : ""}`,
					id: "inputThumbsRow",
					children: O.length ? /* @__PURE__ */ (0, w.jsxs)("div", {
						className: "input-thumb-list",
						children: [O.map((e, t) => {
							let n = k.has(q(e)), r = S?.index === t ? S.placement === "before" ? "drop-before" : "drop-after" : "";
							return /* @__PURE__ */ (0, w.jsxs)("div", {
								className: `input-thumb ${n ? "input-blocked" : ""} ${b === t ? "dragging" : ""} ${r}`.trim(),
								"data-blocked-label": n ? "已阻止" : void 0,
								"data-node-id": e.nodeId,
								"data-url": e.url,
								draggable: !c && O.length > 1,
								onClick: (e) => {
									e.preventDefault(), e.stopPropagation(), ee(t);
								},
								onDragEnd: () => {
									x(-1), C(null);
								},
								onDragOver: (e) => te(e, t),
								onDragStart: (e) => {
									e.stopPropagation(), x(t), e.dataTransfer.effectAllowed = "move", e.dataTransfer.setData("application/x-smart-input-thumb", String(t));
								},
								onDrop: (e) => I(e, t),
								title: `${e.name} · ${n ? "点击恢复引用" : "点击阻止引用"}`,
								children: [e.kind === "video" ? /* @__PURE__ */ (0, w.jsx)("video", {
									muted: !0,
									preload: "metadata",
									src: e.url
								}) : /* @__PURE__ */ (0, w.jsx)("img", {
									alt: "",
									draggable: !1,
									src: e.url
								}), /* @__PURE__ */ (0, w.jsxs)("span", {
									className: "input-thumb-label",
									children: ["图", t + 1]
								})]
							}, `${e.url}-${t}`);
						}), O.length > 1 ? /* @__PURE__ */ (0, w.jsxs)("span", {
							className: "input-thumb-count",
							children: [
								"共 ",
								O.length,
								" 个输入"
							]
						}) : null]
					}) : null
				}),
				/* @__PURE__ */ (0, w.jsx)("div", {
					className: `input-prompt-preview ${A ? "has-text" : ""}`,
					id: "inputPromptPreview",
					children: A ? /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [/* @__PURE__ */ (0, w.jsx)("div", {
						className: "input-prompt-preview-label",
						children: "上游提示词"
					}), /* @__PURE__ */ (0, w.jsx)("div", {
						className: "input-prompt-preview-text",
						children: A
					})] }) : null
				}),
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: "prompt-row",
					children: [
						/* @__PURE__ */ (0, w.jsx)("div", {
							className: "prompt-input",
							contentEditable: !c,
							"data-placeholder": d === "video" ? "描述你想生成或编辑的视频..." : "描述你想生成或编辑的图片...",
							id: "promptInput",
							onBlur: (e) => P(pe(e.currentTarget), !0),
							onInput: (e) => P(pe(e.currentTarget), !1),
							ref: T,
							suppressContentEditableWarning: !0
						}),
						/* @__PURE__ */ (0, w.jsxs)("button", {
							"aria-label": "模板库",
							className: "composer-template-btn",
							disabled: !s || c,
							id: "composerTemplateBtn",
							onClick: () => r?.(m, F),
							title: "模板库",
							type: "button",
							children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "library" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "模板库" })]
						}),
						/* @__PURE__ */ (0, w.jsx)(fe, {
							inputItems: D,
							inputRef: T,
							onPromptChange: P,
							outputId: s?.id || "",
							readOnly: c
						}),
						/* @__PURE__ */ (0, w.jsx)("div", {
							className: "prompt-resize",
							id: "promptResize",
							onPointerDown: ne,
							title: "拖拽调整文本框高度"
						})
					]
				}),
				/* @__PURE__ */ (0, w.jsx)("div", {
					className: "param-row",
					children: /* @__PURE__ */ (0, w.jsx)("div", {
						className: "dynamic-params",
						id: "dynamicParams",
						children: /* @__PURE__ */ (0, w.jsx)(je, {
							canvasRuntime: e,
							comfyFields: v,
							engine: l,
							generator: E,
							kind: d,
							onPatch: i,
							readOnly: !s || c
						})
					})
				}),
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: "composer-actions",
					children: [/* @__PURE__ */ (0, w.jsxs)("button", {
						className: "run-btn cascade-run-btn",
						disabled: !s || c || !!E.running,
						id: "cascadeRunBtn",
						onClick: () => o("cascade"),
						style: { display: j ? "inline-flex" : "none" },
						type: "button",
						children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "workflow" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "一键运行" })]
					}), /* @__PURE__ */ (0, w.jsxs)("button", {
						className: "run-btn",
						disabled: !s || c || !!E.running,
						id: "runBtn",
						onClick: () => o("node"),
						type: "button",
						children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "sparkles" }), /* @__PURE__ */ (0, w.jsx)("span", { children: E.running ? "运行中…" : "运行" })]
					})]
				})
			]
		})
	});
}
function je({ canvasRuntime: e, comfyFields: t, engine: n, generator: r, kind: i, onPatch: a, readOnly: o }) {
	if (n === "modelscope") {
		let t = e.getNodeOptions("msgen", "model", r);
		return /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [
			/* @__PURE__ */ (0, w.jsx)(X, {
				icon: "sparkles",
				label: "功能",
				onChange: (e) => a({ msgenModel: e }, "msgen"),
				options: t,
				value: String(r.msgenModel || "zimage")
			}),
			/* @__PURE__ */ (0, w.jsx)(X, {
				label: "分辨率",
				onChange: (e) => a({ msResolution: e }, "msgen"),
				options: Oe.map(([e, t]) => ({
					value: e,
					label: t
				})),
				value: String(r.msResolution || "1k")
			}),
			/* @__PURE__ */ (0, w.jsx)(X, {
				label: "比例",
				onChange: (e) => a({ msRatio: e }, "msgen"),
				options: ke.filter(([e]) => e !== "source").map(([e, t]) => ({
					value: e,
					label: t
				})),
				value: String(r.msRatio || "square")
			}),
			/* @__PURE__ */ (0, w.jsx)(Me, {
				disabled: o,
				onChange: (e) => a({ count: e }, "msgen"),
				value: Number(r.count || 1)
			})
		] });
	}
	if (n === "comfy") {
		let n = [
			["text", "文生图"],
			["enhance", "图片增强"],
			["edit", "图片编辑"],
			["custom", "自定义"]
		], i = e.getNodeOptions("comfy", "workflow", r), o = r.comfyParams && typeof r.comfyParams == "object" ? r.comfyParams : {};
		return /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [
			/* @__PURE__ */ (0, w.jsx)(X, {
				icon: "workflow",
				label: "ComfyUI 模式",
				onChange: (e) => a({ mode: e }, "comfy"),
				options: n.map(([e, t]) => ({
					value: e,
					label: t
				})),
				value: String(r.mode || "text")
			}),
			r.mode === "custom" ? /* @__PURE__ */ (0, w.jsx)(X, {
				label: "工作流",
				onChange: (e) => a({
					comfyParams: {},
					comfyWorkflow: e
				}, "comfy"),
				options: i,
				value: String(r.comfyWorkflow || "")
			}) : null,
			r.mode === "text" ? /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [/* @__PURE__ */ (0, w.jsx)(Ne, {
				label: "宽",
				onChange: (e) => a({ width: e }, "comfy"),
				value: Number(r.width || 1024)
			}), /* @__PURE__ */ (0, w.jsx)(Ne, {
				label: "高",
				onChange: (e) => a({ height: e }, "comfy"),
				value: Number(r.height || 1024)
			})] }) : null,
			t.map((e) => {
				let t = String(e.id || ""), n = o[t] ?? e.default ?? "";
				return t ? e.type === "boolean" ? /* @__PURE__ */ (0, w.jsxs)("button", {
					className: `setting-check ${n ? "active" : ""}`,
					onClick: () => a({ comfyParams: {
						...o,
						[t]: !n
					} }, "comfy"),
					type: "button",
					children: [/* @__PURE__ */ (0, w.jsx)("span", { className: "check-box" }), /* @__PURE__ */ (0, w.jsx)("span", { children: e.name || t })]
				}, t) : e.type === "dropdown" ? /* @__PURE__ */ (0, w.jsx)(X, {
					label: e.name || t,
					onChange: (e) => a({ comfyParams: {
						...o,
						[t]: e
					} }, "comfy"),
					options: (e.options || []).map((e) => ({
						label: e,
						value: e
					})),
					value: String(n)
				}, t) : /* @__PURE__ */ (0, w.jsx)(Ne, {
					label: e.name || t,
					max: e.max,
					min: e.min,
					onChange: (e) => a({ comfyParams: {
						...o,
						[t]: e
					} }, "comfy"),
					step: e.step,
					value: Number(n || 0)
				}, t) : null;
			})
		] });
	}
	if (i === "video") {
		let t = Ie(e.getNodeOptions("video", "provider", r), n), i = String(r.apiProvider || t[0]?.value || (n === "volcengine" ? "volcengine" : "")), o = e.getNodeOptions("video", "model", {
			...r,
			apiProvider: i
		});
		return /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [
			/* @__PURE__ */ (0, w.jsx)(X, {
				icon: "server",
				label: "平台",
				onChange: (t) => a({
					apiProvider: t,
					model: e.getNodeOptions("video", "model", {
						...r,
						apiProvider: t
					})[0]?.value || ""
				}, "video"),
				options: t,
				value: i
			}),
			/* @__PURE__ */ (0, w.jsx)(X, {
				label: "模型",
				onChange: (e) => a({ model: e }, "video"),
				options: o,
				value: String(r.model || o[0]?.value || "")
			}),
			/* @__PURE__ */ (0, w.jsx)(X, {
				label: "分辨率",
				onChange: (e) => a({ resolution: e }, "video"),
				options: [
					"",
					"480p",
					"720p",
					"1080p"
				].map((e) => ({
					value: e,
					label: e || "Auto"
				})),
				value: String(r.resolution || "")
			}),
			/* @__PURE__ */ (0, w.jsx)(X, {
				label: "比例",
				onChange: (e) => a({ aspectRatio: e }, "video"),
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
				].map((e) => ({
					value: e,
					label: e
				})),
				value: String(r.aspectRatio || "16:9")
			}),
			/* @__PURE__ */ (0, w.jsx)(Ne, {
				label: "时长",
				max: 60,
				min: -1,
				onChange: (e) => a({ duration: e }, "video"),
				value: Number(r.duration || 5)
			}),
			[
				["enhancePrompt", "增强提示词"],
				["enableUpsample", "超分辨率"],
				["generateAudio", "生成音频"],
				["cameraFixed", "固定镜头"],
				["watermark", "水印"],
				["multimodal", "多模态"]
			].map(([e, t]) => /* @__PURE__ */ (0, w.jsxs)("button", {
				className: `setting-check ${r[e] ? "active" : ""}`,
				onClick: () => a({ [e]: !r[e] }, "video"),
				type: "button",
				children: [/* @__PURE__ */ (0, w.jsx)("span", { className: "check-box" }), /* @__PURE__ */ (0, w.jsx)("span", { children: t })]
			}, e))
		] });
	}
	let s = Ie(e.getNodeOptions("generator", "provider", r), n), c = String(r.apiProvider || s[0]?.value || (n === "volcengine" ? "volcengine" : "")), l = e.getNodeOptions("generator", "model", {
		...r,
		apiProvider: c
	});
	return /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [
		/* @__PURE__ */ (0, w.jsx)(X, {
			icon: "server",
			label: "平台",
			onChange: (t) => a({
				apiProvider: t,
				model: e.getNodeOptions("generator", "model", {
					...r,
					apiProvider: t
				})[0]?.value || ""
			}, "generator"),
			options: s,
			value: c
		}),
		/* @__PURE__ */ (0, w.jsx)(X, {
			label: "模型",
			onChange: (e) => a({ model: e }, "generator"),
			options: l,
			value: String(r.model || l[0]?.value || "")
		}),
		/* @__PURE__ */ (0, w.jsx)(X, {
			label: "分辨率",
			onChange: (e) => a({ resolution: e }, "generator"),
			options: Oe.map(([e, t]) => ({
				value: e,
				label: t
			})),
			value: String(r.resolution || "1k")
		}),
		/* @__PURE__ */ (0, w.jsx)(X, {
			label: "比例",
			onChange: (e) => a({ ratio: e }, "generator"),
			options: ke.map(([e, t]) => ({
				value: e,
				label: t
			})),
			value: String(r.ratio || "square")
		}),
		/* @__PURE__ */ (0, w.jsx)(X, {
			label: "质量",
			onChange: (e) => a({ quality: e }, "generator"),
			options: [
				"auto",
				"low",
				"medium",
				"high"
			].map((e) => ({
				value: e,
				label: `Q ${e}`
			})),
			value: String(r.quality || "auto")
		}),
		/* @__PURE__ */ (0, w.jsx)(Me, {
			disabled: o,
			onChange: (e) => a({ count: e }, "generator"),
			value: Number(r.count || 1)
		}),
		r.resolution === "custom" ? /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [/* @__PURE__ */ (0, w.jsx)(Ne, {
			label: "宽",
			min: 64,
			onChange: (e) => a({
				customWidth: e,
				customSize: `${e}x${String(r.customHeight || "")}`
			}, "generator"),
			step: 64,
			value: Number(r.customWidth || 1024)
		}), /* @__PURE__ */ (0, w.jsx)(Ne, {
			label: "高",
			min: 64,
			onChange: (e) => a({
				customHeight: e,
				customSize: `${String(r.customWidth || "")}x${e}`
			}, "generator"),
			step: 64,
			value: Number(r.customHeight || 1024)
		})] }) : null
	] });
}
function X({ icon: e, label: t, onChange: n, options: r, value: i }) {
	let [a, o] = (0, p.useState)(!1), s = r.find((e) => e.value === i);
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: `smart-control ${a ? "pinned" : ""}`,
		children: [/* @__PURE__ */ (0, w.jsxs)("button", {
			"aria-label": t,
			className: "smart-pill",
			onClick: () => o((e) => !e),
			type: "button",
			children: [
				e ? /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": e }) : null,
				/* @__PURE__ */ (0, w.jsx)("span", {
					className: "sub",
					children: s?.label || i || t
				}),
				/* @__PURE__ */ (0, w.jsx)("i", {
					className: "pill-caret",
					"data-lucide": "chevron-down"
				})
			]
		}), /* @__PURE__ */ (0, w.jsxs)("div", {
			className: "smart-popover compact-popover",
			children: [/* @__PURE__ */ (0, w.jsx)("div", {
				className: "smart-popover-title",
				children: t
			}), /* @__PURE__ */ (0, w.jsx)("div", {
				className: "model-list",
				children: r.map((e) => /* @__PURE__ */ (0, w.jsx)("button", {
					className: `direct-option ${e.value === i ? "active" : ""}`,
					"data-param": t,
					"data-value": e.value,
					onClick: () => {
						n(e.value), o(!1);
					},
					type: "button",
					children: /* @__PURE__ */ (0, w.jsx)("span", { children: e.label })
				}, e.value))
			})]
		})]
	});
}
function Me({ disabled: e, onChange: t, value: n }) {
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "num-compact",
		children: [/* @__PURE__ */ (0, w.jsx)("span", {
			className: "num-label",
			children: "数量"
		}), /* @__PURE__ */ (0, w.jsx)("input", {
			"aria-label": "生成数量",
			disabled: e,
			max: "8",
			min: "1",
			onChange: (e) => t(Math.max(1, Math.min(8, Number(e.target.value) || 1))),
			type: "number",
			value: Math.max(1, Math.min(8, n))
		})]
	});
}
function Ne({ label: e, max: t, min: n, onChange: r, step: i, value: a }) {
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "num-compact",
		children: [/* @__PURE__ */ (0, w.jsx)("span", {
			className: "num-label",
			children: e
		}), /* @__PURE__ */ (0, w.jsx)("input", {
			"aria-label": e,
			max: t,
			min: n,
			onChange: (e) => r(Number(e.target.value) || 0),
			step: i,
			type: "number",
			value: a
		})]
	});
}
function Pe(e) {
	return e?.type === "msgen" ? "modelscope" : e?.type === "comfy" ? "comfy" : e?.apiProvider === "volcengine" ? "volcengine" : "api";
}
function Fe(e, t) {
	return {
		id: "",
		type: e === "modelscope" ? "msgen" : e === "comfy" ? "comfy" : t === "video" ? "video" : "generator",
		apiProvider: e === "volcengine" ? "volcengine" : "",
		count: 1,
		quality: "auto",
		ratio: "square",
		resolution: "1k"
	};
}
function Ie(e, t) {
	return t === "volcengine" ? e.filter((e) => e.value === "volcengine") : e.filter((e) => e.value !== "volcengine");
}
function Le(e) {
	return String(e?.promptDraftText || e?.runPrompt || "");
}
function Re(e) {
	return Math.max(60, Math.min(380, Number(e?.promptH || 124)));
}
function ze(e) {
	return Number(e.w || 460);
}
function Be(e) {
	return Number(e.h || 320);
}
function Ve(e, t) {
	if (!e || !t) return "";
	let n = new Map(e.nodes.map((e) => [e.id, e]));
	return e.connections.filter((e) => e.to === t.id).map((e) => n.get(e.from)).flatMap((e) => e ? e.type === "prompt" ? [String(e.text || "")] : e.type === "loop" ? [String(e.fixedPrompt || e.variablePrompt || "")] : e.type === "llm" ? [String(e.outputText || e.userInput || "")] : e.type === "promptGroup" && Array.isArray(e.items) ? e.items.map((e) => String(n.get(String(e))?.text || "")) : [] : []).map((e) => e.trim()).filter(Boolean).join("\n");
}
function He(e) {
	let t = String(e?.promptDraftHtml || "");
	return t.includes("mention-image-token") ? t : ye(Le(e), ve(e)) || t || Ue(Le(e));
}
function Ue(e) {
	return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}
//#endregion
//#region src/canvas/ui/smart-canvas-connections.tsx
function We(e, t, n, r = !1) {
	let i = String(e.kind || "flow"), a = i === "history", o = a ? t.x + t.width / 2 : t.x + t.width, s = a ? t.y + t.height : t.y + t.height / 2, c = a ? n.x + n.width / 2 : n.x, l = a ? n.y : n.y + n.height / 2, u = Math.max(50, Math.abs(c - o) * .45), d = Math.max(36, Math.abs(l - s) * .45);
	return {
		color: r ? "#16a34a" : a ? "rgba(100,116,139,0.46)" : i === "input" ? "rgba(100,116,139,0.62)" : "rgba(148,163,184,0.62)",
		curve: a ? `M${o} ${s} C ${o} ${s + d}, ${c} ${l - d}, ${c} ${l}` : `M${o} ${s} C ${o + u} ${s}, ${c - u} ${l}, ${c} ${l}`,
		midpoint: {
			x: (o + c) / 2,
			y: (s + l) / 2
		},
		target: {
			x: c,
			y: l
		},
		width: i === "input" ? 1.9 : 1.6
	};
}
function Ge(e, t) {
	let n = e.fromPort === "out", r = n ? t.x + t.width : t.x, i = t.y + t.height / 2, a = e.currentWorld.x, o = e.currentWorld.y, s = Math.max(50, Math.abs(a - r) * .45), c = n ? 1 : -1;
	return `M${r} ${i} C ${r + s * c} ${i}, ${a - s * c} ${o}, ${a} ${o}`;
}
function Ke(e) {
	let t = /* @__PURE__ */ new Map();
	e.connections.forEach((e) => {
		if (String(e.kind || "flow") === "history") return;
		let n = t.get(e.from) || [];
		n.push(e), t.set(e.from, n);
	});
	let n = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Set(), i = (e) => {
		r.has(e) || (r.add(e), (t.get(e) || []).forEach((e) => {
			n.add(`${e.from}->${e.to}`), i(e.to);
		}));
	};
	return e.nodes.filter((e) => e.type === "loop").forEach((e) => i(e.id)), n;
}
function qe(e, t, n) {
	let r = String(e.cascadeState || e.runState || "");
	return r === "active" || r === "done" || r === "wait" ? r : t.running || n.running ? "active" : t.runStatus === "done" && n.runStatus === "done" ? "done" : "";
}
function Je({ document: e, drag: t, nodeRect: n, onCut: r, onSelect: i, selectedIndex: a = -1 }) {
	let o = new Map(e.nodes.map((e) => [e.id, e])), s = Ke(e), c = e.connections.map((e, t) => {
		let c = o.get(e.from), l = o.get(e.to);
		if (!c || !l) return null;
		let u = String(e.kind || "flow") === "history", d = qe(e, c, l), f = !u && (s.has(`${e.from}->${e.to}`) || !!d), p = !!l.pending && !f, m = We(e, n(c), n(l), f), h = [
			p ? "conn-pending" : "",
			f ? "conn-cascade" : "",
			f && d === "done" ? "conn-cascade-done" : "",
			f && d && d !== "done" ? "conn-cascade-wait" : "",
			f && d === "active" ? "conn-cascade-active" : "",
			u ? "conn-history" : ""
		].filter(Boolean).join(" ");
		return /* @__PURE__ */ (0, w.jsxs)("g", {
			"data-selected": a === t ? "true" : "false",
			children: [
				/* @__PURE__ */ (0, w.jsx)("path", {
					className: h,
					d: m.curve,
					fill: "none",
					opacity: p ? .82 : 1,
					stroke: m.color,
					strokeWidth: m.width
				}),
				/* @__PURE__ */ (0, w.jsx)("path", {
					className: "conn-hit",
					d: m.curve,
					"data-conn-index": t,
					fill: "none",
					onClick: (e) => {
						e.preventDefault(), e.stopPropagation(), i(t);
					},
					onDoubleClick: (e) => {
						e.preventDefault(), e.stopPropagation(), r(t);
					},
					onPointerDown: (e) => e.stopPropagation(),
					stroke: "transparent",
					strokeWidth: "14"
				}),
				/* @__PURE__ */ (0, w.jsx)("circle", {
					cx: m.target.x,
					cy: m.target.y,
					fill: m.color,
					opacity: ".66",
					r: "3.5"
				}),
				/* @__PURE__ */ (0, w.jsxs)("g", {
					className: "conn-cut",
					"data-conn-index": t,
					onClick: (e) => {
						e.preventDefault(), e.stopPropagation(), r(t);
					},
					onPointerDown: (e) => e.stopPropagation(),
					transform: `translate(${m.midpoint.x} ${m.midpoint.y})`,
					children: [/* @__PURE__ */ (0, w.jsx)("circle", {
						fill: "var(--card)",
						r: "8",
						stroke: m.color,
						strokeWidth: "1.4"
					}), /* @__PURE__ */ (0, w.jsx)("path", {
						d: "M-3 -3 L3 3 M3 -3 L-3 3",
						stroke: m.color,
						strokeLinecap: "round",
						strokeWidth: "1.5"
					})]
				})
			]
		}, `${e.from}-${e.to}-${t}`);
	}), l = t ? o.get(t.fromId) : null;
	return /* @__PURE__ */ (0, w.jsxs)("svg", {
		className: "connection-layer",
		height: "4000",
		viewBox: "0 0 6000 4000",
		width: "6000",
		xmlns: "http://www.w3.org/2000/svg",
		children: [c, t && l ? /* @__PURE__ */ (0, w.jsx)("path", {
			className: "port-drag-temp conn-pending",
			d: Ge(t, n(l)),
			fill: "none",
			stroke: "rgba(100,116,139,0.92)",
			strokeLinecap: "round",
			strokeWidth: "1.9"
		}) : null]
	});
}
//#endregion
//#region src/canvas/ui/smart-canvas-create-menu.tsx
var Ye = [
	{
		icon: "upload-cloud",
		subtitle: "支持图片/音频/视频/批量上传",
		title: "上传节点",
		type: "image"
	},
	{
		icon: "text-cursor-input",
		subtitle: "手写或用 LLM 生成文本",
		title: "提示词",
		type: "prompt"
	},
	{
		icon: "repeat-2",
		subtitle: "控制一键运行轮数和批次",
		title: "循环节点",
		type: "loop"
	}
];
function Xe({ left: e, onCreate: t, top: n }) {
	return /* @__PURE__ */ (0, w.jsx)("div", {
		className: "create-menu open",
		id: "createMenu",
		onPointerDown: (e) => e.stopPropagation(),
		style: {
			left: e,
			top: n
		},
		children: /* @__PURE__ */ (0, w.jsx)("div", {
			className: "create-menu-grid",
			children: Ye.map((e) => /* @__PURE__ */ (0, w.jsxs)("button", {
				className: "create-card",
				"data-create-type": e.type,
				onClick: (n) => {
					n.stopPropagation(), t(e.type);
				},
				type: "button",
				children: [/* @__PURE__ */ (0, w.jsx)("span", {
					className: "create-card-icon",
					children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": e.icon })
				}), /* @__PURE__ */ (0, w.jsxs)("span", { children: [/* @__PURE__ */ (0, w.jsx)("div", {
					className: "create-card-title",
					children: e.title
				}), /* @__PURE__ */ (0, w.jsx)("div", {
					className: "create-card-sub",
					children: e.subtitle
				})] })]
			}, e.type))
		})
	});
}
//#endregion
//#region src/canvas/ui/smart-image-node.tsx
var Ze = /* @__PURE__ */ new Map();
function Z(e) {
	let t = String(e.kind || "").toLowerCase(), n = String(e.url || "").toLowerCase();
	return t === "file" ? "file" : t === "text" || /\.(txt|json|csv|srt|vtt|md)(\?|$)/.test(n) ? "text" : t === "audio" || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(n) ? "audio" : t === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/.test(n) ? "video" : "image";
}
function Qe(e) {
	return {
		height: Number(e.natural_h || e.height || e.h || e.layout_h || e.preview_h || 0),
		width: Number(e.natural_w || e.width || e.w || e.layout_w || e.preview_w || 0)
	};
}
function $e(e) {
	let t = tt(e), n = t.length, r = Number(e.scale), i = Number.isFinite(r) && r > 0 ? n > 1 && r === 1.6 ? .8 : r : n > 1 ? .8 : 2, a = Number(e.w), o = Number(e.h);
	if (!n) {
		let t = Number(e.pending) > 0 || !!e.queued;
		return {
			cols: 1,
			rows: 1,
			thumb: Math.round(96 * i),
			width: Number.isFinite(a) && a > 24 ? a : Math.round(t ? 260 * i : 316),
			height: Number.isFinite(o) && o > 24 ? o : Math.round(t ? 180 * i : 194)
		};
	}
	if (n === 1) {
		if (Number.isFinite(a) && a > 24 && Number.isFinite(o) && o > 24) return {
			cols: 1,
			rows: 1,
			thumb: Math.round(96 * i),
			width: Math.round(a),
			height: Math.round(o)
		};
		let e = Qe(t[0]);
		if (e.width > 0 && e.height > 0) {
			let t = Math.min(260 * i / e.width, 220 * i / e.height);
			return {
				cols: 1,
				rows: 1,
				thumb: Math.round(96 * i),
				width: Math.max(72, Math.round(e.width * t)),
				height: Math.max(72, Math.round(e.height * t))
			};
		}
		return {
			cols: 1,
			rows: 1,
			thumb: Math.round(96 * i),
			width: Math.round(260 * i),
			height: Math.round(180 * i)
		};
	}
	let s = Math.round(224 * i), c = t.find((e) => e.grid?.type === "grid-split")?.grid, l = c ? Math.max(1, Number(c.cols || 1)) : Math.min(4, Math.max(2, Math.ceil(Math.sqrt(n)))), u = c ? Math.max(1, Number(c.rows || 1)) : Math.ceil(n / l), d = Math.min(3, u);
	if (Number.isFinite(a) && a > 40 && Number.isFinite(o) && o > 40) {
		let e = et(n, a, o, s, c ? l : void 0);
		return {
			cols: e.cols,
			rows: e.rows,
			visibleRows: e.visibleRows,
			thumb: e.thumb,
			width: Math.round(a),
			height: e.visibleRows * (e.thumb + 8) - 8 + 32
		};
	}
	return {
		cols: l,
		rows: u,
		visibleRows: d,
		thumb: s,
		width: Number.isFinite(a) && a > 40 ? a : Math.max(Math.round(226 * i), l * (s + 8) + 24),
		height: d * (s + 8) - 8 + 32
	};
}
function et(e, t, n, r, i) {
	let a = null, o = i || 1, s = i || e;
	for (let i = o; i <= s; i += 1) {
		let o = Math.ceil(e / i), s = Math.min(3, o), c = Math.floor(Math.min((t - 32 - (i - 1) * 8) / i, (n - 32 - (s - 1) * 8) / s)), l = Math.max(28, Math.min(r, c)), u = i * l + (i - 1) * 8 + 32, d = s * l + (s - 1) * 8 + 32, f = [
			+(c >= 28),
			l,
			l >= r ? i : 0,
			-(Math.max(0, t - u) + Math.max(0, n - d) * .35),
			-o
		];
		(!a || f.some((e, t) => e !== a.score[t] && e > a.score[t] && f.slice(0, t).every((e, t) => e === a.score[t]))) && (a = {
			cols: i,
			rows: o,
			score: f,
			thumb: l,
			visibleRows: s
		});
	}
	return a || {
		cols: Math.min(e, 2),
		rows: Math.ceil(e / Math.min(e, 2)),
		thumb: 28,
		visibleRows: Math.min(3, Math.ceil(e / Math.min(e, 2)))
	};
}
function tt(e) {
	return (Array.isArray(e.images) ? e.images : e.url ? [{
		url: e.url,
		name: e.name,
		kind: e.kind
	}] : []).flatMap((e) => {
		if (typeof e == "string") return [{
			url: e,
			name: "Image",
			kind: Z({ url: e })
		}];
		if (!e || typeof e != "object") return [];
		let t = e, n = String(t.originalLocalUrl || t.localUrl || t.sourceUrl || t.local_url || t.source_url || t.url || "");
		return n ? [{
			...t,
			url: n,
			kind: t.kind || Z({
				...t,
				url: n
			})
		}] : [];
	});
}
function nt(e) {
	return {
		asset_item_id: e.asset_item_id,
		asset_uris: e.asset_uris,
		kind: Z(e),
		name: String(e.name || "asset"),
		url: String(e.url || "")
	};
}
function rt(e, t) {
	e.stopPropagation(), e.dataTransfer.effectAllowed = "copy", e.dataTransfer.setData("application/x-smart-canvas-image", JSON.stringify(nt(t))), e.dataTransfer.setData("text/plain", String(t.url || ""));
}
function it(e) {
	return Array.isArray(e.pendingTasks) ? e.pendingTasks.filter((e) => !!(e && typeof e == "object" && String(e.taskId || ""))) : [];
}
function at(e, t, n) {
	let r = it(e), i = r.find((e) => e.taskId === t), a = r.filter((e) => e.taskId !== t), o = Array.isArray(n.images) ? n.images : Array.isArray(n.outputs) ? n.outputs : [], s = String(i?.kind || "image"), c = s === "video" ? "mp4" : s === "audio" ? "mp3" : s === "text" ? "txt" : "png", l = o.flatMap((e, t) => {
		let n = typeof e == "string" ? { url: e } : e && typeof e == "object" ? e : null;
		return n?.url ? [{
			...n,
			kind: n.kind || s,
			name: n.name || `output-${t + 1}.${c}`,
			generatedResult: !0
		}] : [];
	}), u = [...tt(e), ...l], d = Math.max(0, Number(e.pending || r.length) - 1);
	return {
		images: u,
		outputKind: l.length ? s : e.outputKind,
		pending: d,
		pendingTasks: a.length ? a : void 0,
		...d || a.length ? {} : {
			h: void 0,
			queued: !1,
			runElapsedMs: Math.max(0, Date.now() - Number(e.runStartedAt || Date.now())),
			runFinishedAt: Date.now(),
			runTimerHidden: !1,
			running: !1,
			title: u.length > 1 ? s === "video" ? "Videos" : s === "audio" ? "Audios" : "Group" : s === "video" ? "Video" : s === "audio" ? "Audio" : "Image",
			w: void 0
		}
	};
}
async function ot(e) {
	let t = Ze.get(e);
	if (t) return t;
	let n = (async () => {
		for (let t = 0; t < 900; t += 1) {
			let t = await fetch(`/api/canvas-image-tasks/${encodeURIComponent(e)}`), n = await t.json().catch(() => ({}));
			if (!t.ok) throw Error(String(n.detail || `任务查询失败 (${t.status})`));
			if (n.status === "succeeded") return n.result && typeof n.result == "object" ? n.result : {};
			if (n.status === "failed") throw Object.assign(Error(String(n.error || "任务失败")), { upstreamTaskId: String(n.upstream_task_id || "") });
			await new Promise((e) => setTimeout(e, 2e3));
		}
		throw Error("任务查询超时");
	})();
	Ze.set(e, n);
	try {
		return await n;
	} finally {
		Ze.delete(e);
	}
}
function st(e, t) {
	let n = String(e.url || "");
	return !n || n.startsWith("data:") || n.startsWith("blob:") || !n.startsWith("/output/") && !n.startsWith("/assets/") ? n : /\.(png|jpe?g|webp|gif|bmp|avif|tiff?|mp4|webm|mov|m4v)(\?|#|$)/i.test(n) ? `/api/media-preview?w=${t}&url=${encodeURIComponent(n)}` : n;
}
function ct(e) {
	let t = Qe(e);
	return t.width > 0 && t.height > 0 ? `${Math.round(t.width)} x ${Math.round(t.height)}` : "";
}
function lt({ active: e, group: t, item: n, onPlay: r }) {
	let i = Z(n), a = String(n.url || "");
	return i === "audio" ? t ? /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "media-thumb audio-thumb",
		"data-media-kind": "audio",
		"data-media-url": a,
		children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "file-audio" }), /* @__PURE__ */ (0, w.jsx)("span", { children: String(n.name || "Audio") })]
	}) : /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "node-img media-card media-audio-card",
		children: [
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "media-card-icon",
				children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "file-audio" })
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "media-card-title",
				children: String(n.name || "Audio")
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "media-card-sub",
				children: "AUDIO"
			}),
			/* @__PURE__ */ (0, w.jsx)("audio", {
				controls: !0,
				"data-url": a,
				preload: "metadata",
				src: a
			})
		]
	}) : i === "file" || i === "text" ? /* @__PURE__ */ (0, w.jsxs)("div", {
		className: `${t ? "media-thumb" : "node-img media-card"} file-thumb media-file-card`,
		"data-media-kind": i,
		"data-media-url": a,
		children: [
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "media-card-icon",
				children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": i === "text" ? "file-text" : "file" })
			}),
			/* @__PURE__ */ (0, w.jsx)("span", {
				className: "media-card-title",
				children: String(n.name || (i === "text" ? "Text" : "File"))
			}),
			t ? null : /* @__PURE__ */ (0, w.jsx)("div", {
				className: "media-card-sub",
				children: i.toUpperCase()
			})
		]
	}) : i === "video" ? /* @__PURE__ */ (0, w.jsx)("div", {
		className: `${t ? "media-thumb video-thumb" : "node-img media-card media-video-card"}`,
		children: e ? /* @__PURE__ */ (0, w.jsx)("video", {
			autoPlay: !0,
			controls: !0,
			"data-inline-video-active": "1",
			"data-url": a,
			playsInline: !0,
			preload: "metadata",
			src: a
		}) : /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [/* @__PURE__ */ (0, w.jsx)("img", {
			alt: "",
			"data-original-src": a,
			"data-preview-kind": "video",
			"data-preview-src": st(n, t ? 512 : 768),
			"data-url": a,
			loading: "lazy",
			src: st(n, t ? 512 : 768)
		}), /* @__PURE__ */ (0, w.jsx)("button", {
			className: `smart-video-play ${t ? "thumb-video-play" : ""}`,
			onClick: (e) => e.stopPropagation(),
			onPointerDown: (e) => {
				e.preventDefault(), e.stopPropagation(), r();
			},
			title: "播放",
			type: "button",
			children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "play" })
		})] })
	}) : /* @__PURE__ */ (0, w.jsx)("img", {
		alt: "",
		className: t ? void 0 : "node-img",
		"data-original-src": a,
		"data-preview-src": st(n, t ? 512 : 768),
		draggable: !1,
		loading: "lazy",
		src: st(n, t ? 512 : 768)
	});
}
function ut({ connecting: e, node: t, onAppendFiles: n, onConnectIn: r, onConnectOut: i, onDelete: a, onDeleteImage: o, onMoveStart: s, onPatch: c, onPreview: l, onSelect: u, readOnly: d, selected: f }) {
	let m = (0, p.useMemo)(() => tt(t), [t]), h = it(t), g = h.find((e) => e.failed && e.recoverTaskId), _ = $e(t), [v, y] = (0, p.useState)(0), [b, x] = (0, p.useState)([]), [S, C] = (0, p.useState)(0), T = m.length > 1, E = !!(t.queued && !m.length && !t.pending), D = !!((t.pending || E) && !m.length), O = !m.length && !t.pending && !E && !g, k = !!(t.isHistoryGroup || t.historyFor);
	(0, p.useEffect)(() => {
		if (!t.running && !t.pending) return;
		let e = () => C(Date.now());
		e();
		let n = setInterval(e, 1e3);
		return () => clearInterval(n);
	}, [t.pending, t.running]), (0, p.useEffect)(() => {
		h.filter((e) => !e.failed && !e.recoverTaskId).forEach((e) => {
			ot(e.taskId).then((t) => c((n) => at(n, e.taskId, t), !0)).catch((t) => {
				t.upstreamTaskId ? c((n) => {
					let r = it(n);
					return {
						pending: Math.max(1, r.length),
						running: !1,
						pendingTasks: r.map((n) => n.taskId === e.taskId ? {
							...n,
							error: t.message,
							failed: !0,
							querying: !1,
							recoverTaskId: t.upstreamTaskId
						} : n)
					};
				}, !0) : c((t) => {
					let n = it(t);
					return {
						pending: Math.max(0, Number(t.pending || n.length) - 1),
						pendingTasks: n.filter((t) => t.taskId !== e.taskId),
						running: !1
					};
				}, !0);
			});
		});
	}, [h.filter((e) => !e.failed).map((e) => e.taskId).join("|")]), (0, p.useEffect)(() => {
		requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		b,
		m.length,
		D,
		g?.querying
	]);
	let A = () => {
		if (d) return;
		let e = document.createElement("input");
		e.type = "file", e.accept = "image/*,video/*,audio/*", e.multiple = !0, e.onchange = () => {
			e.files?.length && n([...e.files]), e.remove();
		}, e.click();
	}, j = async () => {
		if (!(!g || g.querying)) {
			c({ pendingTasks: h.map((e) => e.taskId === g.taskId ? {
				...e,
				querying: !0
			} : e) });
			try {
				let e = await fetch("/api/image-task-query", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						provider_id: g.providerId || "",
						task_id: g.recoverTaskId
					})
				}), t = await e.json();
				if (!e.ok) throw Error(String(t.detail || "查询失败"));
				t.status === "succeeded" || Array.isArray(t.images) ? c((e) => at(e, g.taskId, t), !0) : c({ pendingTasks: h.map((e) => e.taskId === g.taskId ? {
					...e,
					querying: !1
				} : e) });
			} catch (e) {
				c({ pendingTasks: h.map((t) => t.taskId === g.taskId ? {
					...t,
					error: e instanceof Error ? e.message : String(e),
					querying: !1
				} : t) }, !0);
			}
		}
	}, M = T ? "Group" : m.length ? "Image" : "上传节点", N = D ? "生成中，请稍候" : T ? "点击缩略图选择，拖拽节点移动" : m.length ? "点击选择，拖拽节点移动" : "双击画布创建，或拖入素材", P = Number(t.runStartedAt || 0), F = t.running || t.pending ? S || Date.now() : Number(t.runFinishedAt || P), ee = Number(t.runElapsedMs || (P ? Math.max(0, F - P) : 0));
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		"aria-label": `smart-image ${t.id}`,
		className: `image-node ${O ? "empty-node" : ""} ${T ? "group-node" : ""} ${k ? "history-group-node" : ""} ${f ? "selected" : ""} ${t.running ? "node-running" : ""} ${D || g ? "node-pending" : ""}`.trim(),
		"data-id": t.id,
		"data-node-id": t.id,
		"data-node-type": "smart-image",
		onClick: (e) => {
			e.stopPropagation(), u(e);
		},
		onPointerDown: s,
		role: "button",
		style: {
			height: _.height,
			left: Number(t.x || 0),
			top: Number(t.y || 0),
			width: _.width
		},
		tabIndex: 0,
		children: [
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "node-head",
				children: [/* @__PURE__ */ (0, w.jsx)("div", {
					className: "node-title",
					children: M
				}), /* @__PURE__ */ (0, w.jsx)("div", {
					className: "node-actions",
					children: T ? null : /* @__PURE__ */ (0, w.jsx)("button", {
						className: "mini-x node-delete",
						disabled: d,
						onClick: (e) => {
							e.stopPropagation(), a();
						},
						title: "删除节点",
						type: "button",
						children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "trash-2" })
					})
				})]
			}),
			!O && !T ? /* @__PURE__ */ (0, w.jsx)("div", {
				className: "floating-node-actions",
				children: /* @__PURE__ */ (0, w.jsx)("button", {
					className: "mini-x node-delete",
					disabled: d,
					onClick: (e) => {
						e.stopPropagation(), a();
					},
					title: "删除节点",
					type: "button",
					children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "trash-2" })
				})
			}) : null,
			m.length ? /* @__PURE__ */ (0, w.jsxs)("div", {
				className: "smart-node-floating-menu",
				"data-smart-node-menu": "1",
				children: [/* @__PURE__ */ (0, w.jsxs)("button", {
					disabled: !["image", "video"].includes(Z(m[v] || m[0])),
					onClick: (e) => {
						e.stopPropagation(), l(String((m[v] || m[0]).url || ""));
					},
					title: "预览",
					type: "button",
					children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "eye" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "预览" })]
				}), /* @__PURE__ */ (0, w.jsxs)("button", {
					onClick: (e) => {
						e.stopPropagation();
						let t = document.createElement("a");
						t.href = String((m[v] || m[0]).url || ""), t.download = String((m[v] || m[0]).name || "media"), t.click();
					},
					title: "下载",
					type: "button",
					children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "download" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "下载" })]
				})]
			}) : null,
			P && !t.runTimerHidden ? /* @__PURE__ */ (0, w.jsx)("span", {
				className: `run-time-pill ${!t.pending && !t.running && t.runFinishedAt ? "done" : ""}`.trim(),
				"data-run-timer": t.id,
				children: `${Math.floor(ee / 6e4).toString().padStart(2, "0")}:${Math.floor(ee % 6e4 / 1e3).toString().padStart(2, "0")}`
			}) : null,
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "node-body",
				children: g && !m.length ? /* @__PURE__ */ (0, w.jsx)("div", {
					className: "image-task-pending-cell loading-cell single",
					style: {
						height: _.height,
						width: _.width
					},
					children: /* @__PURE__ */ (0, w.jsxs)("div", {
						className: "image-task-pending-overlay",
						children: [
							/* @__PURE__ */ (0, w.jsx)("div", {
								className: "image-task-pending-spinner",
								children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": g.querying ? "loader-2" : "refresh-cw" })
							}),
							/* @__PURE__ */ (0, w.jsx)("div", {
								className: "image-task-pending-text",
								children: g.querying ? "查询中" : "任务未丢失"
							}),
							/* @__PURE__ */ (0, w.jsx)("div", {
								className: "image-task-pending-sub",
								children: `任务 ID：${g.recoverTaskId || ""}`
							}),
							/* @__PURE__ */ (0, w.jsxs)("button", {
								className: "image-task-pending-query",
								disabled: !!g.querying,
								onClick: (e) => {
									e.stopPropagation(), j();
								},
								onPointerDown: (e) => e.stopPropagation(),
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": g.querying ? "loader-2" : "refresh-cw" }), /* @__PURE__ */ (0, w.jsx)("span", { children: g.querying ? "查询中…" : "查询结果" })]
							})
						]
					})
				}) : E ? /* @__PURE__ */ (0, w.jsx)("div", {
					className: "loading-cell single queued",
					style: {
						height: _.height,
						width: _.width
					}
				}) : t.pending && !m.length ? Number(t.pending) <= 1 ? /* @__PURE__ */ (0, w.jsx)("div", {
					className: "loading-cell single",
					style: {
						height: _.height,
						width: _.width
					}
				}) : /* @__PURE__ */ (0, w.jsx)("div", {
					className: "loading-skeleton",
					style: {
						boxSizing: "border-box",
						gridTemplateColumns: `repeat(${Math.min(4, Math.max(2, Math.ceil(Math.sqrt(Number(t.pending)))))}, 1fr)`,
						gridTemplateRows: `repeat(${Math.ceil(Number(t.pending) / Math.min(4, Math.max(2, Math.ceil(Math.sqrt(Number(t.pending))))))}, 1fr)`,
						height: _.height,
						padding: 8,
						width: _.width
					},
					children: Array.from({ length: Number(t.pending) }, (e, t) => /* @__PURE__ */ (0, w.jsx)("div", { className: "loading-cell" }, t))
				}) : T ? /* @__PURE__ */ (0, w.jsx)("div", {
					className: "thumb-grid",
					"data-thumb-scroll": "1",
					style: {
						"--thumb-cols": _.cols,
						"--thumb-max-height": `${(_.visibleRows || _.rows) * _.thumb + Math.max(0, (_.visibleRows || _.rows) - 1) * 8}px`,
						"--thumb-size": `${_.thumb}px`
					},
					children: m.map((e, t) => /* @__PURE__ */ (0, w.jsxs)("div", {
						className: `thumb-item ${v === t ? "image-selected" : ""}`,
						"data-image-index": t,
						"data-media-signature": `${Z(e)}:${e.url || ""}`,
						draggable: !0,
						onClick: (e) => {
							e.stopPropagation(), y(t);
						},
						onDragStart: (t) => rt(t, e),
						onPointerDown: (e) => e.stopPropagation(),
						children: [
							/* @__PURE__ */ (0, w.jsx)(lt, {
								active: b.includes(t),
								group: !0,
								item: e,
								onPlay: () => x((e) => e.includes(t) ? e : [...e, t])
							}),
							ct(e) ? /* @__PURE__ */ (0, w.jsx)("span", {
								className: "image-resolution-badge",
								children: ct(e)
							}) : null,
							/* @__PURE__ */ (0, w.jsx)("button", {
								className: "mini-x image-delete",
								disabled: d,
								onClick: (e) => {
									e.stopPropagation(), o(t);
								},
								title: "删除图片",
								type: "button",
								children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "trash-2" })
							})
						]
					}, `${e.url}-${t}`))
				}) : m[0] ? /* @__PURE__ */ (0, w.jsxs)("div", {
					className: `image-wrap ${v === 0 ? "image-selected" : ""}`,
					"data-image-index": "0",
					"data-media-signature": `${Z(m[0])}:${m[0].url || ""}`,
					draggable: !0,
					onClick: (e) => {
						e.stopPropagation(), y(0);
					},
					onDragStart: (e) => rt(e, m[0]),
					onPointerDown: (e) => e.stopPropagation(),
					style: {
						"--node-img-h": `${_.height}px`,
						"--node-img-w": `${_.width}px`
					},
					children: [
						/* @__PURE__ */ (0, w.jsx)(lt, {
							active: b.includes(0),
							group: !1,
							item: m[0],
							onPlay: () => x((e) => e.includes(0) ? e : [...e, 0])
						}),
						ct(m[0]) ? /* @__PURE__ */ (0, w.jsx)("span", {
							className: "image-resolution-badge",
							children: ct(m[0])
						}) : null,
						/* @__PURE__ */ (0, w.jsx)("button", {
							className: "mini-x image-delete",
							disabled: d,
							onClick: (e) => {
								e.stopPropagation(), o(0);
							},
							title: "删除图片",
							type: "button",
							children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "trash-2" })
						})
					]
				}) : /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "node-drop",
					"data-upload-action": "files",
					onClick: (e) => {
						e.stopPropagation(), A();
					},
					onDragOver: (e) => e.preventDefault(),
					onDrop: (e) => {
						e.preventDefault(), e.stopPropagation(), n([...e.dataTransfer.files]);
					},
					children: [
						/* @__PURE__ */ (0, w.jsx)("span", {
							className: "upload-node-main",
							children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "upload-cloud" })
						}),
						/* @__PURE__ */ (0, w.jsx)("span", {
							className: "upload-node-title",
							children: "上传节点"
						}),
						/* @__PURE__ */ (0, w.jsx)("span", {
							className: "upload-node-sub",
							children: "拖拽 / 粘贴 / 点击上传"
						})
					]
				})
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "node-hint",
				children: N
			}),
			m.length || t.pending || E ? /* @__PURE__ */ (0, w.jsx)("div", {
				className: "node-resize-handle",
				"data-resize": "1"
			}) : null,
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: `node-port port-in ${e ? "port-hover" : ""}`,
				"data-port": "in",
				onClick: (e) => {
					e.stopPropagation(), r();
				},
				title: "input"
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "node-port port-out",
				"data-port": "out",
				onPointerDown: (e) => {
					e.stopPropagation(), i();
				},
				title: "output"
			})
		]
	});
}
//#endregion
//#region src/canvas/ui/smart-canvas-image-editor.tsx
function dt({ imageIndex: e, initialMode: t, node: n, onApply: r, onClose: i, onCreateMask: a, onGridJoin: o, onGridSplit: s }) {
	let c = (0, p.useMemo)(() => tt(n), [n]), l = c[e] || c[0], u = c.map((e) => [
		e.url,
		e.name,
		e.natural_w || e.width,
		e.natural_h || e.height
	].join("|")).join("::"), d = (0, p.useMemo)(() => c.filter((e) => Z(e) === "image").map((e) => ({
		name: String(e.name || ""),
		natural_h: Number(e.natural_h || e.height || 0),
		natural_w: Number(e.natural_w || e.width || 0),
		url: pt(e)
	})), [u]);
	return !l?.url || Z(l) !== "image" ? null : /* @__PURE__ */ (0, w.jsx)(O, {
		initialMode: t,
		joinItems: d,
		name: String(l.name || mt(String(l.url)) || "image"),
		onApply: r,
		onClose: i,
		onCreateMask: a,
		onGridJoin: o,
		onGridSplit: s,
		url: pt(l)
	});
}
async function ft(e, t, n) {
	if (e.readyState < 2 && await ht(e, "loadeddata", 2200), !e.videoWidth || !e.videoHeight) throw Error("视频还没有加载完成");
	let r = Number(e.currentTime || 0), i = Number.isFinite(e.duration) && e.duration > 0 ? e.duration : 0, a = Number(t.fps || t.frameRate || t.frame_rate || t.framespersecond || t.frames_per_second || 0), o = 1 / Math.max(1, Math.min(120, Number.isFinite(a) && a > 0 ? a : 30)), s = n === "first" ? 0 : n === "last" ? Math.max(0, i - o / 2) : r;
	e.pause(), await gt(e, s);
	let c = document.createElement("canvas");
	c.width = e.videoWidth, c.height = e.videoHeight;
	let l = c.getContext("2d");
	if (!l) throw Error("导出帧失败");
	l.drawImage(e, 0, 0, c.width, c.height);
	let u = await new Promise((e, t) => c.toBlob((n) => n ? e(n) : t(/* @__PURE__ */ Error("导出帧失败")), "image/png")), d = n === "first" ? "first-frame" : n === "last" ? "last-frame" : "current-frame", f = String(t.name || mt(String(t.url || "")) || "video").replace(/\.[a-z0-9]{2,8}$/i, "") || "video";
	return n !== "current" && await gt(e, r), {
		blob: u,
		height: c.height,
		name: `${f}-${d}.png`.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_"),
		width: c.width
	};
}
function pt(e) {
	let t = String(e.url || "");
	return /^https?:\/\//i.test(t) ? `/api/download-output?inline=1&url=${encodeURIComponent(t)}&name=${encodeURIComponent(String(e.name || mt(t) || "image"))}` : t;
}
function mt(e) {
	try {
		return decodeURIComponent(e.split(/[?#]/, 1)[0].split("/").pop() || "").replace(/[\\/:*?"<>|]/g, "_");
	} catch {
		return "media";
	}
}
function ht(e, t, n) {
	return new Promise((r) => {
		let i = !1, a = () => {
			i || (i = !0, clearTimeout(o), e.removeEventListener(t, a), r());
		}, o = window.setTimeout(a, n);
		e.addEventListener(t, a, { once: !0 });
	});
}
async function gt(e, t) {
	Math.abs(Number(e.currentTime || 0) - t) <= .002 || (e.currentTime = t, await ht(e, "seeked", 2200));
}
//#endregion
//#region src/canvas/ui/smart-canvas-minimap.tsx
var _t = {
	height: 108,
	width: 170
};
function vt({ boardHeight: e, boardWidth: t, nodes: n, onLocate: r, viewport: i }) {
	let a = (0, p.useRef)(null), [o, s] = (0, p.useState)(_t);
	(0, p.useEffect)(() => {
		let e = a.current;
		if (!e) return;
		let t = () => s({
			height: e.clientHeight || _t.height,
			width: e.clientWidth || _t.width
		});
		t();
		let n = new ResizeObserver(t);
		return n.observe(e), () => n.disconnect();
	}, []);
	let c = yt(n, i, t, e, o.width, o.height), l = (e) => {
		let t = a.current;
		if (!t) return;
		let n = t.getBoundingClientRect();
		r(bt(e.clientX - n.left, e.clientY - n.top, c.state));
	};
	return /* @__PURE__ */ (0, w.jsx)("div", {
		"aria-hidden": "true",
		className: "smart-minimap",
		id: "minimap",
		onPointerDown: (e) => {
			if (e.button !== 0) return;
			e.preventDefault(), e.stopPropagation();
			let t = e.currentTarget;
			l(e.nativeEvent), t.setPointerCapture(e.pointerId);
			let n = (e) => l(e);
			t.addEventListener("pointermove", n), t.addEventListener("pointerup", () => t.removeEventListener("pointermove", n), { once: !0 });
		},
		children: /* @__PURE__ */ (0, w.jsxs)("div", {
			className: "smart-minimap-content",
			id: "minimapContent",
			ref: a,
			children: [c.nodes.map((e) => /* @__PURE__ */ (0, w.jsx)("div", {
				className: "minimap-node",
				"data-minimap-node-id": e.id,
				style: e.style
			}, e.id)), /* @__PURE__ */ (0, w.jsx)("div", {
				className: "smart-minimap-viewport",
				id: "minimapViewport",
				style: c.viewport
			})]
		})
	});
}
function yt(e, t, n, r, i, a) {
	let o = {
		height: r / t.zoom,
		width: n / t.zoom,
		x: -t.x / t.zoom,
		y: -t.y / t.zoom
	}, s = [...e, o], c = Math.min(...s.map((e) => e.x), -200), l = Math.min(...s.map((e) => e.y), -200), u = Math.max(...s.map((e) => e.x + e.width), o.x + o.width + 200), d = Math.max(...s.map((e) => e.y + e.height), o.y + o.height + 200), f = Math.min(i / Math.max(1, u - c), a / Math.max(1, d - l)), p = (i - (u - c) * f) / 2, m = (a - (d - l) * f) / 2, h = {
		height: a,
		minX: c,
		minY: l,
		offsetX: p,
		offsetY: m,
		scale: f,
		width: i
	}, g = (e) => ({
		height: Math.max(4, e.height * f),
		left: p + (e.x - c) * f,
		top: m + (e.y - l) * f,
		width: Math.max(4, e.width * f)
	});
	return {
		nodes: e.map((e) => ({
			id: e.id,
			style: g(e)
		})),
		state: h,
		viewport: g(o)
	};
}
function bt(e, t, n) {
	return {
		x: n.minX + (e - n.offsetX) / Math.max(1e-4, n.scale),
		y: n.minY + (t - n.offsetY) / Math.max(1e-4, n.scale)
	};
}
//#endregion
//#region src/canvas/ui/smart-canvas-prompt-preset.tsx
var xt = "smart_canvas_prompt_presets_v1";
function St(e = localStorage) {
	try {
		let t = JSON.parse(e.getItem("smart_canvas_prompt_presets_v1") || "[]");
		return Array.isArray(t) ? t.filter((e) => !!(e && typeof e == "object" && String(e.id || "") && typeof e.text == "string")).map((e) => ({
			createdAt: Number(e.createdAt || Date.now()),
			id: String(e.id),
			name: String(e.name || "提示词预设"),
			text: e.text,
			updatedAt: Number(e.updatedAt || e.createdAt || Date.now())
		})) : [];
	} catch {
		return [];
	}
}
function Ct(e) {
	return e.trim().split(/\r?\n/, 1)[0]?.trim().slice(0, 28) || "提示词预设";
}
function wt(e) {
	localStorage.setItem(xt, JSON.stringify(e));
}
function Tt() {
	return `preset_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}
function Et({ boardRef: e, node: t, onClearPreset: n, onClose: r, onPatchNode: i, readOnly: a = !1 }) {
	let o = (0, p.useRef)(null), s = (0, p.useRef)(null), [c, l] = (0, p.useState)(() => St()), [u, d] = (0, p.useState)(""), [f, m] = (0, p.useState)(""), [h, g] = (0, p.useState)(""), [_, v] = (0, p.useState)(""), [y, b] = (0, p.useState)(""), [x, S] = (0, p.useState)(!1), [C, T] = (0, p.useState)({
		left: 80,
		top: 80
	}), E = (e, t = c) => {
		let n = t.find((t) => t.id === e);
		d(n?.id || ""), m(n?.name || ""), g(n?.text || ""), S(!1), v(n ? "选择预设后可直接修改名称和内容。" : "暂无预设，可将当前提示词存为新预设。"), b("");
	};
	(0, p.useEffect)(() => {
		E(String(t.promptPresetId || c[0]?.id || ""), c);
	}, [t.id]), (0, p.useLayoutEffect)(() => {
		let n = e.current, r = n?.querySelector(`[data-node-id="${CSS.escape(t.id)}"]`);
		if (!n || !r) return;
		let i = n.getBoundingClientRect(), a = r.getBoundingClientRect();
		T({
			left: Math.max(18, Math.min(Math.max(18, i.width - 410), a.right - i.left + 12)),
			top: Math.max(18, Math.min(Math.max(18, i.height - 330), a.top - i.top))
		});
	}, [e, t.id]), (0, p.useEffect)(() => {
		let e = (e) => {
			let t = e.target;
			!o.current?.contains(t) && !t?.closest(".prompt-preset-save") && r();
		}, t = (e) => {
			e.key === "Escape" && r();
		};
		return document.addEventListener("pointerdown", e), window.addEventListener("keydown", t), () => {
			document.removeEventListener("pointerdown", e), window.removeEventListener("keydown", t);
		};
	}, [r]);
	let D = () => {
		S(!1), v("编辑完成后点击保存修改。"), b("");
	}, O = c.find((e) => e.id === u), k = String(t.text || "").trim();
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "prompt-preset-panel open",
		id: "promptPresetPanel",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		ref: o,
		style: C,
		children: [
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "prompt-preset-panel-head",
				children: [/* @__PURE__ */ (0, w.jsx)("span", { children: "提示词预设" }), /* @__PURE__ */ (0, w.jsx)("button", {
					"aria-label": "关闭",
					id: "promptPresetClose",
					onClick: r,
					title: "关闭",
					type: "button",
					children: "×"
				})]
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: `prompt-preset-status ${y}`,
				id: "promptPresetStatus",
				children: _
			}),
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "prompt-preset-fields",
				children: [
					/* @__PURE__ */ (0, w.jsxs)("select", {
						id: "promptPresetSelect",
						onChange: (e) => E(e.target.value),
						value: u,
						children: [c.length ? null : /* @__PURE__ */ (0, w.jsx)("option", {
							value: "",
							children: "暂无预设"
						}), c.map((e) => /* @__PURE__ */ (0, w.jsx)("option", {
							value: e.id,
							children: e.name
						}, e.id))]
					}),
					/* @__PURE__ */ (0, w.jsx)("input", {
						id: "promptPresetName",
						onChange: (e) => {
							m(e.target.value), D();
						},
						placeholder: "预设名称",
						ref: s,
						type: "text",
						value: f
					}),
					/* @__PURE__ */ (0, w.jsx)("textarea", {
						id: "promptPresetText",
						onChange: (e) => {
							g(e.target.value), D();
						},
						placeholder: "预设内容",
						value: h
					})
				]
			}),
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "prompt-preset-actions",
				children: [
					/* @__PURE__ */ (0, w.jsx)("button", {
						disabled: !O || a,
						id: "promptPresetApply",
						onClick: () => {
							!O || a || (i(t.id, {
								promptPresetId: O.id,
								text: O.text
							}), r());
						},
						type: "button",
						children: "应用"
					}),
					/* @__PURE__ */ (0, w.jsx)("button", {
						className: `danger ${x ? "confirm-danger" : ""}`.trim(),
						disabled: !O || a,
						id: "promptPresetDelete",
						onClick: () => {
							if (!O || a) return;
							if (!x) {
								S(!0), v(`将删除“${O.name}”，再次点击确认。`), b("warn");
								return;
							}
							let e = c.filter((e) => e.id !== O.id);
							wt(e), l(e), n(O.id), E(e[0]?.id || "", e), v("预设已删除。"), b("ok");
						},
						type: "button",
						children: x ? "再次点击删除" : "删除"
					}),
					/* @__PURE__ */ (0, w.jsx)("span", { style: { flex: 1 } }),
					/* @__PURE__ */ (0, w.jsx)("button", {
						disabled: !k || a,
						id: "promptPresetNew",
						onClick: () => {
							if (!k || a) return;
							let e = Date.now(), n = {
								createdAt: e,
								id: Tt(),
								name: Ct(k),
								text: String(t.text || ""),
								updatedAt: e
							}, r = [n, ...c];
							wt(r), l(r), i(t.id, { promptPresetId: n.id }), E(n.id, r), v("已存为新预设。"), b("ok"), requestAnimationFrame(() => {
								s.current?.focus(), s.current?.select();
							});
						},
						type: "button",
						children: "存为新预设"
					}),
					/* @__PURE__ */ (0, w.jsx)("button", {
						className: "primary",
						disabled: !O || a,
						id: "promptPresetSave",
						onClick: () => {
							if (!O || a) return;
							let e = f.trim(), n = h.trim();
							if (!e || !n) {
								v("预设名称和内容不能为空。"), b("warn");
								return;
							}
							let r = c.map((t) => t.id === O.id ? {
								...t,
								name: e,
								text: h,
								updatedAt: Date.now()
							} : t);
							wt(r), l(r), String(t.promptPresetId || "") === O.id && i(t.id, { text: h }), v("预设修改已保存。"), b("ok"), S(!1);
						},
						type: "button",
						children: "保存修改"
					})
				]
			})
		]
	});
}
//#endregion
//#region src/canvas/infrastructure/prompt-library-client.ts
var Dt = {
	list: () => Ot("/api/prompt-libraries"),
	createLibrary: (e) => Ot("/api/prompt-libraries", kt("POST", { name: e })),
	renameLibrary: (e, t) => Ot(`/api/prompt-libraries/${encodeURIComponent(e)}`, kt("PATCH", { name: t })),
	deleteLibrary: (e) => Ot(`/api/prompt-libraries/${encodeURIComponent(e)}`, kt("DELETE")),
	savePrompt: (e, t) => Ot(t.id ? `/api/prompt-libraries/items/${encodeURIComponent(t.id)}` : "/api/prompt-libraries/items", kt(t.id ? "PATCH" : "POST", {
		library_id: e,
		...t
	})),
	deletePrompts: (e) => Ot("/api/prompt-libraries/items/delete", kt("POST", { ids: e })),
	createCategory: (e, t) => Ot("/api/prompt-libraries/categories", kt("POST", {
		library_id: e,
		name: t
	})),
	renameCategory: (e, t, n) => Ot(`/api/prompt-libraries/categories/${encodeURIComponent(t)}`, kt("PATCH", {
		library_id: e,
		name: n
	})),
	deleteCategory: (e) => Ot(`/api/prompt-libraries/categories/${encodeURIComponent(e)}`, kt("DELETE"))
};
async function Ot(e, t) {
	let n = await fetch(e, t), r = await n.json().catch(() => ({}));
	if (!n.ok) throw Error(r.detail || `请求失败 (${n.status})`);
	return r;
}
function kt(e, t) {
	return {
		method: e,
		headers: t === void 0 ? void 0 : { "Content-Type": "application/json" },
		body: t === void 0 ? void 0 : JSON.stringify(t)
	};
}
//#endregion
//#region src/canvas/ui/smart-canvas-prompt-template.tsx
var At = [
	{
		id: "view",
		name: "视角"
	},
	{
		id: "storyboard",
		name: "分镜"
	},
	{
		id: "character",
		name: "角色"
	},
	{
		id: "product",
		name: "产品"
	},
	{
		id: "lighting",
		name: "光影"
	},
	{
		id: "mine",
		name: "我的"
	}
];
function jt(e, t) {
	let n = String(e.positive || "").trim();
	if (t === "positive" || !e.builtin) return n;
	let r = String(e.negative || "").trim(), i = Object.entries(e.params || {}).map(([e, t]) => `${e}: ${t}`).join("\n");
	return [
		n,
		r ? `Negative prompt:\n${r}` : "",
		i ? `Params:\n${i}` : ""
	].filter(Boolean).join("\n\n");
}
function Mt(e, t) {
	let n = t.trim().toLocaleLowerCase();
	return !n || [
		e.name,
		e.positive,
		e.negative,
		e.scene,
		e.name_en,
		e.scene_en
	].some((e) => String(e || "").toLocaleLowerCase().includes(n));
}
function Nt(e) {
	return e ? (e.items || []).filter((e) => e?.id && e?.positive).map((t) => ({
		...t,
		builtin: e.id === "system",
		libraryId: e.id,
		params: t.params || {}
	})) : [];
}
function Pt(e) {
	return {
		category: e?.category || "mine",
		name: e?.name || "",
		positive: e?.positive || ""
	};
}
function Ft({ initialText: e, onApply: t, onClose: n, readOnly: r = !1, target: i }) {
	let [a, o] = (0, p.useState)({
		active_library_id: "",
		libraries: []
	}), [s, c] = (0, p.useState)(""), [l, u] = (0, p.useState)("all"), [d, f] = (0, p.useState)(""), [m, h] = (0, p.useState)(""), [g, _] = (0, p.useState)(!1), [v, y] = (0, p.useState)(!1), [b, x] = (0, p.useState)(Pt(void 0)), [S, C] = (0, p.useState)("正在加载提示词库…"), T = a.libraries.find((e) => e.id === s) ?? a.libraries[0], E = T?.categories?.length ? T.categories : T?.id === "system" ? At : [], D = (0, p.useMemo)(() => Nt(T), [T]), O = (0, p.useMemo)(() => D.filter((e) => (l === "all" || e.category === l) && Mt(e, m)), [
		D,
		l,
		m
	]), k = O.find((e) => e.id === d) ?? O[0], A = !!(T && !T.readonly && !r), j = D.reduce((e, t) => ({
		...e,
		[t.category || "mine"]: (e[t.category || "mine"] || 0) + 1
	}), { all: D.length }), M = (e, t = s, n = d) => {
		o(e);
		let r = e.libraries.find((e) => e.id === t) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0];
		c(r?.id || "");
		let i = Nt(r), a = i.find((e) => e.id === n) ?? i[0];
		f(a?.id || ""), x(Pt(a));
	};
	(0, p.useEffect)(() => {
		let e = !0;
		Dt.list().then((t) => {
			e && (M(t.library, t.library.active_library_id, ""), C(""));
		}).catch(async (t) => {
			if (e) try {
				let e = {
					active_library_id: "system",
					libraries: [{
						categories: At,
						id: "system",
						items: (await (await fetch("/api/smart-canvas/prompt-templates")).json()).templates || [],
						name: "系统提示词库",
						readonly: !0
					}]
				};
				M(e, "system", ""), C("");
			} catch {
				C(t instanceof Error ? t.message : String(t));
			}
		});
		let t = (e) => {
			e.key === "Escape" && n();
		};
		return window.addEventListener("keydown", t), () => {
			e = !1, window.removeEventListener("keydown", t);
		};
	}, []), (0, p.useEffect)(() => {
		let e = O.find((e) => e.id === d) ?? O[0];
		e?.id !== d && f(e?.id || ""), g || x(Pt(e));
	}, [
		l,
		O,
		m,
		d,
		g
	]), (0, p.useEffect)(() => {
		requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		g,
		v,
		O,
		k
	]);
	let N = (e, t) => C(e instanceof Error ? e.message : t), P = (e) => {
		let t = Nt(a.libraries.find((t) => t.id === e))[0];
		c(e), u("all"), f(t?.id || ""), x(Pt(t)), _(!1), y(!1);
	}, F = async () => {
		if (!T || !A) return;
		let t = e.trim();
		if (!t) {
			C("当前提示词为空");
			return;
		}
		try {
			let e = await Dt.savePrompt(T.id, {
				category: l === "all" ? "custom" : l,
				name: t.split(/\r?\n/, 1)[0].slice(0, 28) || "提示词预设",
				negative: "",
				positive: t,
				scene: "我的提示词预设"
			});
			M(e.library, T.id, e.item?.id || ""), u(e.item?.category || "custom"), _(!0), C("当前提示词已保存");
		} catch (e) {
			N(e, "保存失败");
		}
	}, ee = async () => {
		if (!T || !A) return;
		let e = l === "all" ? "custom" : l;
		try {
			let t = await Dt.savePrompt(T.id, {
				category: e,
				name: "新模板",
				negative: "",
				positive: "新提示词",
				scene: "我的提示词预设"
			});
			M(t.library, T.id, t.item?.id || ""), u(e), _(!0), C("模板已创建");
		} catch (e) {
			N(e, "创建失败");
		}
	}, te = async () => {
		if (!T || !k || !A) return;
		let e = b.name.trim(), t = b.positive.trim();
		if (!e || !t) {
			C("名称和内容不能为空");
			return;
		}
		try {
			let n = await Dt.savePrompt(T.id, {
				id: k.id,
				category: b.category || "mine",
				name: e,
				negative: k.negative || "",
				positive: t,
				scene: k.scene || ""
			});
			M(n.library, T.id, n.item?.id || k.id), _(!1), C("模板已保存");
		} catch (e) {
			N(e, "保存失败");
		}
	}, I = async () => {
		if (!(!k || !A)) try {
			let e = await Dt.deletePrompts([k.id]);
			M(e.library, T?.id, ""), _(!1), C("模板已删除");
		} catch (e) {
			N(e, "删除失败");
		}
	}, ne = async () => {
		if (!T || !A) return;
		let e = window.prompt("新分组名称", "新分组")?.trim().slice(0, 24);
		if (e) try {
			let t = await Dt.createCategory(T.id, e);
			M(t.library, T.id, d), u(t.category?.id || l), C("分组已创建");
		} catch (e) {
			N(e, "新增分组失败");
		}
	}, L = async (e) => {
		if (!T || !A) return;
		let t = window.prompt("分组名称", e.name)?.trim().slice(0, 24);
		if (t) try {
			let n = await Dt.renameCategory(T.id, e.id, t);
			M(n.library, T.id, d), C("分组已重命名");
		} catch (e) {
			N(e, "重命名失败");
		}
	}, re = async (e) => {
		if (!(!T || !A || !window.confirm("删除该分组？分组内模板将移到其他分组。"))) try {
			let t = await Dt.deleteCategory(e.id);
			M(t.library, T.id, d), l === e.id && u("all"), C("分组已删除");
		} catch (e) {
			N(e, "删除失败");
		}
	}, R = (e) => {
		k && (t(jt(k, e), k.builtin ? "" : k.id), n());
	};
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "prompt-template-panel open",
		"data-status": S,
		"data-target": i,
		id: "promptTemplatePanel",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		onWheel: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "prompt-template-head",
				children: [/* @__PURE__ */ (0, w.jsxs)("div", { children: [/* @__PURE__ */ (0, w.jsx)("strong", { children: "提示词模板库" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "内置标准库 + 我的预设" })] }), /* @__PURE__ */ (0, w.jsx)("button", {
					"aria-label": "关闭",
					id: "promptTemplateClose",
					onClick: n,
					title: "关闭",
					type: "button",
					children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "x" })
				})]
			}),
			/* @__PURE__ */ (0, w.jsx)("select", {
				className: "prompt-template-library-select",
				id: "promptTemplateLibrarySelect",
				onChange: (e) => P(e.target.value),
				title: "选择提示词库",
				value: T?.id || "",
				children: a.libraries.map((e) => /* @__PURE__ */ (0, w.jsx)("option", {
					value: e.id,
					children: e.name
				}, e.id))
			}),
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "prompt-template-search",
				children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "search" }), /* @__PURE__ */ (0, w.jsx)("input", {
					autoFocus: !0,
					id: "promptTemplateSearch",
					onChange: (e) => h(e.target.value),
					placeholder: "搜索模板...",
					type: "search",
					value: m
				})]
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "prompt-template-cats",
				id: "promptTemplateCats",
				children: v ? /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "prompt-template-group-panel",
					children: [/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "prompt-template-group-title",
						children: [/* @__PURE__ */ (0, w.jsxs)("div", { children: [/* @__PURE__ */ (0, w.jsx)("strong", { children: "管理分组" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "新增、重命名或删除模板分组" })] }), /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "prompt-template-group-tools",
							children: [/* @__PURE__ */ (0, w.jsxs)("button", {
								onClick: () => void ne(),
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "plus" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "新增" })]
							}), /* @__PURE__ */ (0, w.jsxs)("button", {
								className: "primary",
								onClick: () => y(!1),
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "check" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "完成" })]
							})]
						})]
					}), /* @__PURE__ */ (0, w.jsx)("div", {
						className: "prompt-template-group-list",
						children: E.map((e) => /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "prompt-template-group-row has-delete",
							children: [
								/* @__PURE__ */ (0, w.jsxs)("button", {
									className: `group-name ${e.id === l ? "active" : ""}`,
									onClick: () => u(e.id),
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("span", { children: e.name }), /* @__PURE__ */ (0, w.jsx)("small", { children: j[e.id] || 0 })]
								}),
								/* @__PURE__ */ (0, w.jsx)("button", {
									"aria-label": `重命名 ${e.name}`,
									className: "group-tool",
									disabled: !A,
									onClick: () => void L(e),
									title: "重命名",
									type: "button",
									children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "pencil" })
								}),
								/* @__PURE__ */ (0, w.jsx)("button", {
									"aria-label": `删除 ${e.name}`,
									className: "group-tool danger",
									disabled: !A,
									onClick: () => void re(e),
									title: "删除",
									type: "button",
									children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "trash-2" })
								})
							]
						}, e.id))
					})]
				}) : /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "prompt-template-nav",
					children: [/* @__PURE__ */ (0, w.jsx)("div", {
						className: "prompt-template-tabs",
						children: [{
							id: "all",
							name: "全部"
						}, ...E].map((e) => /* @__PURE__ */ (0, w.jsxs)("button", {
							className: e.id === l ? "active" : "",
							onClick: () => {
								u(e.id), _(!1);
							},
							type: "button",
							children: [/* @__PURE__ */ (0, w.jsx)("span", { children: e.name }), /* @__PURE__ */ (0, w.jsx)("small", { children: j[e.id] || 0 })]
						}, e.id))
					}), /* @__PURE__ */ (0, w.jsxs)("button", {
						className: "prompt-template-manage-groups",
						onClick: () => y(!0),
						type: "button",
						children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "settings-2" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "管理分组" })]
					})]
				})
			}),
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "prompt-template-body",
				id: "promptTemplateBody",
				children: [/* @__PURE__ */ (0, w.jsxs)("div", {
					className: "prompt-template-list",
					children: [/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "prompt-template-list-tools",
						children: [/* @__PURE__ */ (0, w.jsxs)("button", {
							disabled: !A || !e.trim(),
							onClick: () => void F(),
							type: "button",
							children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "bookmark-plus" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "保存当前" })]
						}), /* @__PURE__ */ (0, w.jsxs)("button", {
							disabled: !A,
							onClick: () => void ee(),
							type: "button",
							children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "file-plus-2" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "新建模板" })]
						})]
					}), O.length ? O.map((e) => /* @__PURE__ */ (0, w.jsxs)("button", {
						className: `prompt-template-card ${e.id === k?.id ? "active" : ""}`,
						"data-template-id": e.id,
						onClick: () => {
							f(e.id), x(Pt(e)), _(!1);
						},
						type: "button",
						children: [
							/* @__PURE__ */ (0, w.jsxs)("span", {
								className: "prompt-template-card-top",
								children: [/* @__PURE__ */ (0, w.jsx)("span", {
									className: "prompt-template-name",
									children: e.name
								}), /* @__PURE__ */ (0, w.jsx)("span", {
									className: "prompt-template-source",
									children: e.builtin ? "内置" : "我的"
								})]
							}),
							/* @__PURE__ */ (0, w.jsx)("span", {
								className: "prompt-template-scene",
								children: e.scene || e.positive
							}),
							/* @__PURE__ */ (0, w.jsx)("span", {
								className: "prompt-template-tag",
								children: E.find((t) => t.id === e.category)?.name || e.category
							})
						]
					}, e.id)) : /* @__PURE__ */ (0, w.jsx)("div", {
						className: "prompt-template-list-empty",
						children: "没有匹配的模板"
					})]
				}), /* @__PURE__ */ (0, w.jsx)("div", {
					className: "prompt-template-detail",
					children: k ? /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [
						/* @__PURE__ */ (0, w.jsxs)("div", {
							className: "prompt-template-detail-head",
							children: [/* @__PURE__ */ (0, w.jsxs)("div", { children: [/* @__PURE__ */ (0, w.jsx)("strong", { children: k.name }), /* @__PURE__ */ (0, w.jsxs)("span", { children: [
								E.find((e) => e.id === k.category)?.name || k.category,
								" · ",
								k.builtin ? "内置模板" : "我的模板"
							] })] }), g ? null : /* @__PURE__ */ (0, w.jsxs)("div", {
								className: "prompt-template-icon-actions",
								children: [/* @__PURE__ */ (0, w.jsxs)("button", {
									disabled: !A,
									onClick: () => {
										x(Pt(k)), _(!0);
									},
									title: "编辑模板",
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "pencil" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "编辑" })]
								}), /* @__PURE__ */ (0, w.jsxs)("button", {
									className: "danger",
									disabled: !A,
									onClick: () => void I(),
									title: "删除模板",
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "trash-2" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "删除" })]
								})]
							})]
						}),
						g ? /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "prompt-template-edit-fields",
							children: [
								/* @__PURE__ */ (0, w.jsx)("label", { children: "名称" }),
								/* @__PURE__ */ (0, w.jsx)("input", {
									"data-template-edit-name": !0,
									onChange: (e) => x((t) => ({
										...t,
										name: e.target.value
									})),
									placeholder: "名称",
									value: b.name
								}),
								/* @__PURE__ */ (0, w.jsx)("label", { children: "分组" }),
								/* @__PURE__ */ (0, w.jsx)("select", {
									"data-template-edit-category": !0,
									onChange: (e) => x((t) => ({
										...t,
										category: e.target.value
									})),
									value: b.category,
									children: E.map((e) => /* @__PURE__ */ (0, w.jsx)("option", {
										value: e.id,
										children: e.name
									}, e.id))
								}),
								/* @__PURE__ */ (0, w.jsx)("label", { children: "内容" }),
								/* @__PURE__ */ (0, w.jsx)("textarea", {
									"data-template-edit-text": !0,
									onChange: (e) => x((t) => ({
										...t,
										positive: e.target.value
									})),
									placeholder: "内容",
									value: b.positive
								})
							]
						}) : /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "prompt-template-preview-content",
							children: [
								/* @__PURE__ */ (0, w.jsxs)("div", {
									className: "prompt-template-section",
									children: [/* @__PURE__ */ (0, w.jsx)("label", { children: "正向提示词" }), /* @__PURE__ */ (0, w.jsx)("p", { children: k.positive })]
								}),
								k.negative ? /* @__PURE__ */ (0, w.jsxs)("div", {
									className: "prompt-template-section",
									children: [/* @__PURE__ */ (0, w.jsx)("label", { children: "负向提示词" }), /* @__PURE__ */ (0, w.jsx)("p", { children: k.negative })]
								}) : null,
								Object.keys(k.params || {}).length ? /* @__PURE__ */ (0, w.jsxs)("div", {
									className: "prompt-template-section",
									children: [/* @__PURE__ */ (0, w.jsx)("label", { children: "参数建议" }), /* @__PURE__ */ (0, w.jsx)("p", { children: Object.entries(k.params || {}).map(([e, t]) => `${e}: ${t}`).join("\n") })]
								}) : null
							]
						}),
						/* @__PURE__ */ (0, w.jsx)("div", {
							className: "prompt-template-actions",
							children: g ? /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [
								/* @__PURE__ */ (0, w.jsxs)("button", {
									onClick: () => _(!1),
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "x" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "取消" })]
								}),
								/* @__PURE__ */ (0, w.jsxs)("button", {
									className: "danger",
									disabled: !A,
									onClick: () => void I(),
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "trash-2" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "删除" })]
								}),
								/* @__PURE__ */ (0, w.jsxs)("button", {
									className: "primary",
									disabled: !A,
									onClick: () => void te(),
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "save" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "保存" })]
								})
							] }) : /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [/* @__PURE__ */ (0, w.jsxs)("button", {
								onClick: () => R("positive"),
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "corner-down-left" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "正向" })]
							}), /* @__PURE__ */ (0, w.jsxs)("button", {
								className: "primary",
								onClick: () => R("full"),
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "wand-sparkles" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "完整应用" })]
							})] })
						})
					] }) : /* @__PURE__ */ (0, w.jsx)("div", {
						className: "prompt-template-empty",
						children: "选择或新建一个模板"
					})
				})]
			})
		]
	});
}
//#endregion
//#region src/canvas/ui/smart-canvas-preview.tsx
var It = {
	square: {
		w: 1,
		h: 1
	},
	portrait: {
		w: 2,
		h: 3
	},
	landscape: {
		w: 3,
		h: 2
	},
	portrait43: {
		w: 3,
		h: 4
	},
	landscape43: {
		w: 4,
		h: 3
	},
	story: {
		w: 9,
		h: 16
	},
	wide: {
		w: 16,
		h: 9
	},
	ultrawide: {
		w: 21,
		h: 9
	},
	ultratall: {
		w: 9,
		h: 21
	}
};
function Lt(e, t, n = "") {
	let r = t.imageComparisons?.[n], i = Array.isArray(t.runInputRefs) ? t.runInputRefs : [], a = new Map(e.nodes.map((e) => [e.id, e])), o = i.some((e) => e?.url) ? i : e.connections.filter((e) => e.to === t.id && String(e.kind || "flow") !== "history").flatMap((e) => tt(a.get(e.from) || {
		id: "",
		type: ""
	})), s = t.sourceNodeId ? tt(a.get(String(t.sourceNodeId)) || {
		id: "",
		type: ""
	}) : [], c = /* @__PURE__ */ new Set();
	return [
		r,
		...o,
		...s
	].flatMap((e) => !e?.url || Z(e) !== "image" || c.has(e.url) ? [] : (c.add(e.url), [e]));
}
function Rt(e) {
	let t = tt(e).map((e, t) => ({
		...e,
		__index: t
	})).sort((e, t) => {
		let n = e.grid || {}, r = t.grid || {};
		return Number(n.row ?? e.__index) - Number(r.row ?? t.__index) || Number(n.col ?? e.__index) - Number(r.col ?? t.__index) || e.__index - t.__index;
	}).map((e, t) => ({
		url: String(e.url || ""),
		name: Wt(e, `image-${String(t + 1).padStart(2, "0")}`)
	}));
	return {
		filename: qt(`${String(e.title || "image-group")}.zip`, "image-group.zip"),
		items: t,
		urls: t.map((e) => e.url)
	};
}
function zt({ document: e, node: t, onClose: n, onEdit: r, onExportVideoFrame: i, onNavigate: a, onRememberSize: o, url: s }) {
	let c = (0, p.useMemo)(() => tt(t), [t]), l = Math.max(0, c.findIndex((e) => e.url === s)), [u, d] = (0, p.useState)(l), f = c[u] || c[0], m = f ? Z(f) : "image", h = m === "video", g = (0, p.useMemo)(() => Lt(e, t, String(f?.url || "")), [
		e,
		f?.url,
		t
	]), [_, v] = (0, p.useState)(!1), [y, b] = (0, p.useState)(-1), [x, S] = (0, p.useState)(50), [C, T] = (0, p.useState)(1), [E, D] = (0, p.useState)({
		x: 0,
		y: 0
	}), [O, k] = (0, p.useState)(!1), [A, j] = (0, p.useState)(!1), [M, N] = (0, p.useState)(!1), [P, F] = (0, p.useState)("wide"), [ee, te] = (0, p.useState)({
		w: 16,
		h: 9
	}), [I, ne] = (0, p.useState)({
		fov: 75,
		pitch: 0,
		yaw: 0
	}), [L, re] = (0, p.useState)({
		height: Number(f?.natural_h || f?.height || 0),
		width: Number(f?.natural_w || f?.width || 0)
	}), [R, ie] = (0, p.useState)(!1), [z, B] = (0, p.useState)(""), V = (0, p.useRef)(null), ae = (0, p.useRef)(null), oe = (0, p.useRef)(null), se = (0, p.useRef)(null), ce = (0, p.useRef)({}), le = (0, p.useRef)(null);
	(0, p.useEffect)(() => {
		let e = Math.max(0, c.findIndex((e) => e.url === s));
		d(e);
	}, [c, s]), (0, p.useEffect)(() => {
		v(!1), b(-1), S(50), T(1), D({
			x: 0,
			y: 0
		}), j(!1), N(!1), ne({
			fov: 75,
			pitch: 0,
			yaw: 0
		}), re({
			height: Number(f?.natural_h || f?.height || 0),
			width: Number(f?.natural_w || f?.width || 0)
		});
	}, [f?.url]), (0, p.useEffect)(() => {
		let e = (e) => {
			if (e.key === "Escape") {
				e.preventDefault(), n();
				return;
			}
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
			e.preventDefault();
			let t = e.key === "ArrowLeft" ? -1 : 1;
			h && Yt(oe.current, t, f) || fe(t);
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}), (0, p.useEffect)(() => {
		requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		y,
		_,
		u,
		A,
		P
	]), (0, p.useEffect)(() => {
		if (!A || !f?.url) return;
		let e = !1;
		return N(!1), Qt(ce.current, se.current, Bt(f), () => {
			e || N(!0);
		}).catch(() => {
			e || N(!0);
		}), () => {
			e = !0, en(ce.current);
		};
	}, [f?.url, A]), (0, p.useEffect)(() => {
		A && $t(ce.current, se.current, I);
	}, [
		A,
		M,
		I
	]), (0, p.useEffect)(() => () => tn(ce.current), []);
	let H = P === "custom" ? ee : It[P], U = Xt(H.w, H.h), ue = c.length > 1, W = _ && y >= 0 && y < g.length, de = W ? g[y] : null, G = t.runPrompt ? `提示词：${String(t.runPrompt).slice(0, 60)}` : "", K = [`分辨率: ${Math.round(L.width)} x ${Math.round(L.height)}`.replace(/^分辨率: 0 x 0$/, ""), A ? "拖动查看全景，滚轮缩放视野" : _ && !W ? "请选择一张原图进行对比" : G].filter(Boolean).join(" · "), fe = (e) => {
		if (c.length <= 1) return;
		let t = (u + e + c.length) % c.length;
		d(t), a(String(c[t].url || ""));
	}, pe = () => {
		S(50), D({
			x: 0,
			y: 0
		}), T(1), ne({
			fov: 75,
			pitch: 0,
			yaw: 0
		});
	}, me = (e, t) => {
		e > 0 && t > 0 && (re({
			width: e,
			height: t
		}), (!f?.natural_w || !f?.natural_h) && o?.(u, e, t));
	}, he = (e) => {
		let t = V.current?.getBoundingClientRect();
		t && S(Math.max(0, Math.min(100, (e - t.left) / Math.max(1, t.width) * 100)));
	}, ge = (e, t) => {
		e.button === 0 && (e.preventDefault(), e.stopPropagation(), e.currentTarget.setPointerCapture(e.pointerId), le.current = {
			mode: t,
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			startPan: E,
			startPitch: I.pitch,
			startYaw: I.yaw
		}, k(!0), t === "compare" && he(e.clientX));
	}, q = (e) => {
		let t = le.current;
		!t || t.pointerId !== e.pointerId || (e.preventDefault(), e.stopPropagation(), t.mode === "compare" ? he(e.clientX) : t.mode === "panorama" ? ne((n) => ({
			...n,
			yaw: t.startYaw - (e.clientX - t.startClientX) * .18,
			pitch: Math.max(-85, Math.min(85, t.startPitch + (e.clientY - t.startClientY) * .18))
		})) : D({
			x: t.startPan.x + e.clientX - t.startClientX,
			y: t.startPan.y + e.clientY - t.startClientY
		}));
	}, _e = (e) => {
		le.current?.pointerId === e.pointerId && (le.current = null, k(!1), e.currentTarget.releasePointerCapture?.(e.pointerId));
	}, J = (e) => {
		if (e.preventDefault(), e.stopPropagation(), h && Yt(oe.current, e.deltaY > 0 ? 1 : -1, f)) return;
		if (A) {
			let t = e.deltaY < 0 ? .92 : 1 / .92;
			ne((e) => ({
				...e,
				fov: Math.max(35, Math.min(100, e.fov * t))
			}));
			return;
		}
		let t = C, n = Math.max(.05, C * (e.deltaY < 0 ? 1.12 : 1 / 1.12)), r = V.current?.getBoundingClientRect();
		if (T(n), r) {
			let i = e.clientX - r.left - r.width / 2, a = e.clientY - r.top - r.height / 2, o = n / t;
			D((e) => ({
				x: e.x - i * (o - 1),
				y: e.y - a * (o - 1)
			}));
		}
	}, ve = () => {
		g.length && (j(!1), v((e) => (!e && (y < 0 || y >= g.length) && b(0), e && b(-1), !e)));
	}, ye = () => {
		j((e) => (e || (v(!1), b(-1), D({
			x: 0,
			y: 0
		}), T(1)), !e));
	}, be = async (e) => {
		let t = oe.current;
		if (!(!t || !f || !i || R)) {
			ie(!0), B("正在导出视频帧…");
			try {
				await i(await ft(t, f, e)), B("已导出到画布");
			} catch (e) {
				B((e instanceof Error ? e.message : String(e)) || "导出帧失败");
			} finally {
				ie(!1);
			}
		}
	};
	if (!f?.url || !["image", "video"].includes(m)) return null;
	let Y = A ? {
		height: `${U.height}px`,
		transform: "",
		width: `${U.width}px`
	} : { transform: `translate(${E.x}px, ${E.y}px) scale(${C})` }, xe = { "--compare-pos": `${x}%` };
	return /* @__PURE__ */ (0, w.jsx)("div", {
		"aria-label": h ? "预览视频" : "预览图片",
		"aria-modal": "true",
		className: "image-edit-modal open smart-canvas-preview",
		"data-testid": "smart-canvas-preview",
		id: "imageEditModal",
		onClick: (e) => {
			e.target === e.currentTarget && n();
		},
		onPointerDown: (e) => e.stopPropagation(),
		role: "dialog",
		children: /* @__PURE__ */ (0, w.jsxs)("div", {
			className: `image-edit-panel ${h ? "video-preview-mode" : ""}`,
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: "image-edit-head",
					children: [
						/* @__PURE__ */ (0, w.jsxs)("div", { children: [/* @__PURE__ */ (0, w.jsx)("div", {
							className: "image-edit-title",
							id: "imageEditTitle",
							children: h ? "预览视频" : "预览图片"
						}), /* @__PURE__ */ (0, w.jsx)("div", {
							className: "image-edit-sub",
							id: "imageEditSub",
							children: h ? "" : "滚轮缩放 · 拖动平移 · 双击百分比复位"
						})] }),
						/* @__PURE__ */ (0, w.jsxs)("div", {
							className: "image-edit-mode",
							style: { display: h ? "none" : void 0 },
							children: [/* @__PURE__ */ (0, w.jsxs)("button", {
								className: "active",
								"data-image-edit-mode": "preview",
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "eye" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "预览" })]
							}), [
								[
									"crop",
									"crop",
									"裁剪"
								],
								[
									"outpaint",
									"expand",
									"扩图"
								],
								[
									"mask",
									"brush",
									"遮罩"
								],
								[
									"brush",
									"paintbrush",
									"画笔"
								],
								[
									"grid",
									"grid-3x3",
									"宫格切分"
								]
							].map(([e, t, n]) => /* @__PURE__ */ (0, w.jsxs)("button", {
								"data-image-edit-mode": e,
								onClick: () => r?.(u, e),
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": t }), /* @__PURE__ */ (0, w.jsx)("span", { children: n })]
							}, e))]
						}),
						/* @__PURE__ */ (0, w.jsx)("button", {
							"aria-label": "关闭预览",
							className: "preview-icon-btn",
							onClick: n,
							title: "关闭",
							type: "button",
							children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "x" })
						})
					]
				}),
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: `image-edit-tools active ${A ? "panorama-tools-on" : ""}`,
					id: "imagePreviewTools",
					children: [/* @__PURE__ */ (0, w.jsx)("span", {
						className: "image-edit-sub",
						id: "previewMetaHint",
						style: { marginLeft: "auto" },
						children: K
					}), /* @__PURE__ */ (0, w.jsx)("div", {
						className: "panorama-controls",
						id: "panoramaControls",
						style: { display: A ? "inline-flex" : "none" },
						children: /* @__PURE__ */ (0, w.jsx)("div", {
							className: "panorama-control-group",
							children: /* @__PURE__ */ (0, w.jsxs)("div", {
								className: "panorama-control-line",
								children: [
									/* @__PURE__ */ (0, w.jsx)("span", {
										className: "panorama-control-label",
										children: "视窗比例"
									}),
									Object.entries(It).map(([e, t]) => /* @__PURE__ */ (0, w.jsxs)("button", {
										className: P === e ? "active" : "",
										"data-panorama-ratio": e,
										onClick: () => F(e),
										type: "button",
										children: [
											t.w,
											":",
											t.h
										]
									}, e)),
									/* @__PURE__ */ (0, w.jsx)("button", {
										className: P === "custom" ? "active" : "",
										"data-panorama-ratio": "custom",
										onClick: () => F("custom"),
										type: "button",
										children: "自定义"
									}),
									/* @__PURE__ */ (0, w.jsxs)("label", {
										className: "panorama-custom-ratio",
										id: "panoramaCustomRatio",
										style: { display: P === "custom" ? "inline-flex" : "none" },
										children: [
											/* @__PURE__ */ (0, w.jsx)("input", {
												"aria-label": "ratio width",
												max: "999",
												min: "1",
												onChange: (e) => te((t) => ({
													...t,
													w: Jt(e.target.value)
												})),
												type: "number",
												value: ee.w
											}),
											/* @__PURE__ */ (0, w.jsx)("span", { children: ":" }),
											/* @__PURE__ */ (0, w.jsx)("input", {
												"aria-label": "ratio height",
												max: "999",
												min: "1",
												onChange: (e) => te((t) => ({
													...t,
													h: Jt(e.target.value)
												})),
												type: "number",
												value: ee.h
											})
										]
									})
								]
							})
						})
					})]
				}),
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: "image-edit-stage preview-mode",
					id: "imageEditStage",
					onWheel: J,
					children: [
						/* @__PURE__ */ (0, w.jsx)("button", {
							className: `preview-nav-btn prev ${ue ? "visible" : ""}`,
							id: "previewPrevBtn",
							onClick: () => fe(-1),
							title: "上一张",
							type: "button",
							children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "chevron-left" })
						}),
						/* @__PURE__ */ (0, w.jsx)("button", {
							className: `preview-nav-btn next ${ue ? "visible" : ""}`,
							id: "previewNextBtn",
							onClick: () => fe(1),
							title: "下一张",
							type: "button",
							children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "chevron-right" })
						}),
						/* @__PURE__ */ (0, w.jsx)("div", {
							className: "image-edit-stage-inner",
							children: /* @__PURE__ */ (0, w.jsx)("div", {
								className: `preview-stage ${W ? "compare-on" : ""} ${A ? "panorama-on" : ""} ${O ? "panning" : ""}`,
								id: "previewStage",
								onPointerCancel: _e,
								onPointerDown: (e) => {
									!h && (e.target === e.currentTarget || e.target.closest?.("#previewFrame")) && ge(e, A ? "panorama" : "pan");
								},
								onPointerMove: q,
								onPointerUp: _e,
								style: xe,
								children: /* @__PURE__ */ (0, w.jsxs)("div", {
									className: "preview-frame",
									id: "previewFrame",
									ref: V,
									style: Y,
									children: [
										h ? /* @__PURE__ */ (0, w.jsx)("video", {
											autoPlay: !0,
											controls: !0,
											controlsList: "nodownload noplaybackrate noremoteplayback",
											crossOrigin: "anonymous",
											disablePictureInPicture: !0,
											id: "previewCurrentVideo",
											onLoadedMetadata: (e) => me(e.currentTarget.videoWidth, e.currentTarget.videoHeight),
											playsInline: !0,
											preload: "metadata",
											ref: oe,
											src: Bt(f)
										}) : /* @__PURE__ */ (0, w.jsx)("img", {
											alt: "current",
											className: "preview-current",
											crossOrigin: "anonymous",
											id: "previewCurrentImage",
											onLoad: (e) => me(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight),
											ref: ae,
											src: Bt(f),
											style: { display: A ? "none" : "block" }
										}),
										h ? null : /* @__PURE__ */ (0, w.jsxs)("div", {
											className: `panorama-stage ${M ? "ready" : ""}`,
											id: "panoramaStage",
											style: {
												display: A ? "block" : "none",
												height: U.height,
												width: U.width
											},
											children: [/* @__PURE__ */ (0, w.jsx)("canvas", {
												height: Zt(H).height,
												id: "panoramaCanvas",
												ref: se,
												width: Zt(H).width
											}), /* @__PURE__ */ (0, w.jsx)("div", {
												className: "panorama-loading",
												id: "panoramaLoading",
												children: "加载中..."
											})]
										}),
										h ? null : /* @__PURE__ */ (0, w.jsx)("div", {
											className: "preview-compare-layer",
											id: "previewCompareLayer",
											style: { display: W && !A ? "" : "none" },
											children: de ? /* @__PURE__ */ (0, w.jsx)("img", {
												alt: "original",
												id: "previewCompareImage",
												src: Bt(de)
											}) : null
										}),
										h ? null : /* @__PURE__ */ (0, w.jsx)("div", {
											className: "preview-compare-handle",
											id: "previewCompareHandle",
											onPointerCancel: _e,
											onPointerDown: (e) => ge(e, "compare"),
											onPointerMove: q,
											onPointerUp: _e,
											style: { display: W && !A ? "" : "none" },
											title: "拖动对比"
										})
									]
								})
							})
						}),
						/* @__PURE__ */ (0, w.jsxs)("div", {
							className: "preview-download-overlay",
							children: [/* @__PURE__ */ (0, w.jsxs)("button", {
								className: "compare-toggle",
								id: "previewDownloadBtn",
								onClick: () => Ht(f),
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "download" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "下载" })]
							}), !h && c.length > 1 ? /* @__PURE__ */ (0, w.jsxs)("button", {
								className: "compare-toggle",
								id: "previewDownloadAllBtn",
								onClick: () => void Ut(t),
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "archive" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "下载全部" })]
							}) : null]
						}),
						h ? null : /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "preview-tools-overlay",
							children: [/* @__PURE__ */ (0, w.jsx)("div", {
								className: "compare-thumbs",
								id: "compareThumbs",
								style: { display: _ && !A ? "inline-flex" : "none" },
								children: g.map((e, t) => /* @__PURE__ */ (0, w.jsx)("button", {
									className: `compare-thumb ${t === y ? "active" : ""}`,
									"data-compare-idx": t,
									onClick: () => b((e) => e === t ? -1 : t),
									title: t === y ? "取消当前对比" : "使用此原图对比",
									type: "button",
									children: /* @__PURE__ */ (0, w.jsx)("img", {
										alt: "",
										src: Vt(e)
									})
								}, `${e.url}-${t}`))
							}), /* @__PURE__ */ (0, w.jsxs)("div", {
								className: "preview-action-row",
								children: [/* @__PURE__ */ (0, w.jsxs)("button", {
									className: `compare-toggle ${A ? "active" : ""}`,
									id: "panoramaToggleBtn",
									onClick: ye,
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "globe-2" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "360全景" })]
								}), /* @__PURE__ */ (0, w.jsxs)("button", {
									className: `compare-toggle ${_ ? "active" : ""}`,
									disabled: !g.length || A,
									id: "compareToggleBtn",
									onClick: ve,
									style: { opacity: g.length && !A ? 1 : .45 },
									title: g.length ? "对比原图" : "没有可用原图",
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "columns-2" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "对比原图" })]
								})]
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: "image-edit-actions",
					children: [
						/* @__PURE__ */ (0, w.jsxs)("span", {
							id: "imageEditZoomLabel",
							onDoubleClick: pe,
							style: {
								color: "#94a3b8",
								cursor: "pointer",
								display: h ? "none" : void 0,
								fontSize: 11,
								fontWeight: 800,
								marginRight: "auto",
								padding: "0 4px",
								userSelect: "none"
							},
							title: "双击重置缩放",
							children: [Math.round((A ? 75 / Math.max(1, I.fov) : C) * 100), "%"]
						}),
						h ? /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "video-frame-tools",
							id: "videoFrameTools",
							style: {
								display: "flex",
								marginRight: "auto"
							},
							children: [
								/* @__PURE__ */ (0, w.jsxs)("button", {
									className: "image-edit-btn secondary",
									disabled: R || !i,
									onClick: () => void be("first"),
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "skip-back" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "导出首帧" })]
								}),
								/* @__PURE__ */ (0, w.jsxs)("button", {
									className: "image-edit-btn primary",
									disabled: R || !i,
									onClick: () => void be("current"),
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "image-down" }), /* @__PURE__ */ (0, w.jsx)("span", { children: R ? "正在导出…" : "导出当前帧" })]
								}),
								/* @__PURE__ */ (0, w.jsxs)("button", {
									className: "image-edit-btn secondary",
									disabled: R || !i,
									onClick: () => void be("last"),
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "skip-forward" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "导出尾帧" })]
								})
							]
						}) : null,
						/* @__PURE__ */ (0, w.jsx)("button", {
							className: "image-edit-btn secondary",
							id: "imageEditCancelBtn",
							onClick: n,
							type: "button",
							children: "关闭"
						})
					]
				}),
				z ? /* @__PURE__ */ (0, w.jsx)("div", {
					className: "image-edit-sub",
					"data-testid": "video-frame-status",
					children: z
				}) : null
			]
		})
	});
}
function Bt(e) {
	let t = String(e.url || "");
	return /^https?:\/\//i.test(t) ? `/api/download-output?inline=1&url=${encodeURIComponent(t)}&name=${encodeURIComponent(String(e.name || Kt(t) || "preview"))}` : t;
}
function Vt(e) {
	let t = String(e.url || "");
	return t.startsWith("/assets/") || t.startsWith("/output/") ? `/api/media-preview?w=256&url=${encodeURIComponent(t)}` : Bt(e);
}
function Ht(e) {
	if (!e.url) return;
	let t = Wt(e, "image"), n = document.createElement("a");
	n.href = `/api/download-output?url=${encodeURIComponent(e.url)}&name=${encodeURIComponent(t)}`, n.download = t, document.body.append(n), n.click(), n.remove();
}
async function Ut(e) {
	let t = Rt(e), n = await fetch("/api/canvas-assets/download", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(t)
	});
	if (!n.ok) throw Error(await n.text() || "批量下载失败");
	let r = URL.createObjectURL(await n.blob()), i = document.createElement("a");
	i.href = r, i.download = t.filename, document.body.append(i), i.click(), i.remove(), setTimeout(() => URL.revokeObjectURL(r), 1200);
}
function Wt(e, t) {
	let n = Kt(String(e.url || "")) || String(e.name || ""), r = Gt(e), i = `${t}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}${r}`, a = qt(n || i, i);
	return /\.[a-z0-9]{2,8}$/i.test(a) || (a += r), a;
}
function Gt(e) {
	let t = [e.name, e.url].map((e) => String(e || "").split(/[?#]/, 1)[0]).find((e) => /\.[a-z0-9]{2,8}$/i.test(e));
	return t ? t.match(/(\.[a-z0-9]{2,8})$/i)?.[1] || ".png" : Z(e) === "video" ? ".mp4" : Z(e) === "audio" ? ".mp3" : Z(e) === "text" ? ".txt" : ".png";
}
function Kt(e) {
	return decodeURIComponent(e.split(/[?#]/, 1)[0].split("/").pop() || "").replace(/[\\/:*?"<>|]/g, "_");
}
function qt(e, t) {
	return String(e || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || t;
}
function Jt(e) {
	return Math.max(1, Math.min(999, Number(e) || 1));
}
function Yt(e, t, n) {
	if (!e || e.readyState < 1) return !1;
	e.pause();
	let r = Number(n.fps || n.frameRate || n.frame_rate || n.framespersecond || n.frames_per_second || 0), i = 1 / Math.max(1, Math.min(120, Number.isFinite(r) && r > 0 ? r : 30)), a = Number.isFinite(e.duration) && e.duration > 0 ? Math.max(0, e.duration - i / 2) : 2 ** 53 - 1;
	return e.currentTime = Math.max(0, Math.min(a, Number(e.currentTime || 0) + t * i)), !0;
}
function Xt(e, t) {
	let n = Math.max(.08, Math.min(12, e / Math.max(1, t))), r = Math.max(260, Math.min(1180, window.innerWidth - 116)), i = Math.max(220, Math.min(780, window.innerHeight - 220)), a = r, o = a / n;
	return o > i && (o = i, a = o * n), {
		width: Math.max(160, Math.round(a)),
		height: Math.max(160, Math.round(o))
	};
}
function Zt(e) {
	let t = e.w / Math.max(1, e.h);
	return t >= 1 ? {
		width: 1536,
		height: Math.max(1, Math.round(1536 / t))
	} : {
		width: Math.max(1, Math.round(1536 * t)),
		height: 1536
	};
}
async function Qt(e, t, n, r) {
	if (!t || !n) return;
	e.three ||= await import(
		/* @vite-ignore */
		"/static/vendor/js/three-0.160.0.module.js?v=2026.05.30"
);
	let i = e.three;
	if (e.renderer || (e.renderer = new i.WebGLRenderer({
		canvas: t,
		antialias: !0,
		alpha: !1,
		preserveDrawingBuffer: !0
	}), e.renderer.setPixelRatio(1), e.renderer.outputColorSpace = i.SRGBColorSpace), !e.scene) {
		e.scene = new i.Scene(), e.camera = new i.PerspectiveCamera(75, 16 / 9, 1, 1200);
		let t = new i.SphereGeometry(500, 96, 64);
		t.scale(-1, 1, 1), e.sphere = new i.Mesh(t, new i.MeshBasicMaterial({ color: 16777215 })), e.scene.add(e.sphere);
	}
	let a = new Image();
	a.crossOrigin = "anonymous", await new Promise((e, t) => {
		a.onload = () => e(), a.onerror = () => t(/* @__PURE__ */ Error("全景图片加载失败")), a.src = n;
	}), en(e), e.texture = new i.Texture(a), e.texture.colorSpace = i.SRGBColorSpace, e.texture.needsUpdate = !0, e.sphere.material.map = e.texture, e.sphere.material.needsUpdate = !0, r();
}
function $t(e, t, n) {
	let { renderer: r, scene: i, camera: a, sphere: o, three: s } = e;
	if (!t || !r || !i || !a || !o || !s || !e.texture) return;
	r.setSize(Math.max(1, t.width), Math.max(1, t.height), !1), a.fov = Math.max(35, Math.min(100, n.fov)), a.aspect = t.width / Math.max(1, t.height), a.updateProjectionMatrix();
	let c = s.MathUtils.degToRad(90 - Math.max(-85, Math.min(85, n.pitch))), l = s.MathUtils.degToRad(n.yaw);
	a.position.set(0, 0, 0), a.lookAt(new s.Vector3(500 * Math.sin(c) * Math.cos(l), 500 * Math.cos(c), 500 * Math.sin(c) * Math.sin(l))), r.render(i, a);
}
function en(e) {
	e.texture?.dispose?.(), e.texture = void 0, e.sphere?.material && (e.sphere.material.map = null, e.sphere.material.needsUpdate = !0);
}
function tn(e) {
	en(e), e.renderer?.dispose?.(), e.sphere?.geometry?.dispose?.(), e.sphere?.material?.dispose?.();
}
//#endregion
//#region src/canvas/ui/smart-canvas-shortcut-panel.tsx
var nn = [
	{
		keys: ["Ctrl"],
		text: "按住并拖拽框选节点"
	},
	{
		keys: ["Ctrl", "G"],
		text: "合并选中的图片为组"
	},
	{
		keys: [
			"Ctrl",
			"Shift",
			"G"
		],
		text: "释放选中的分组"
	},
	{
		keys: ["Ctrl", "Z"],
		text: "撤销上一步操作"
	},
	{
		keys: ["Ctrl", "C"],
		text: "复制选中的节点"
	},
	{
		keys: ["Ctrl", "V"],
		text: "粘贴节点或剪贴板图片"
	},
	{
		keys: ["A"],
		text: "打开/关闭资源库"
	},
	{
		keys: ["Z"],
		text: "缩小画布视图"
	},
	{
		keys: ["双击"],
		text: "打开快捷菜单"
	},
	{
		keys: ["空白处"],
		text: "拖动画布"
	},
	{
		keys: ["滚轮"],
		text: "缩放画布或预览图片"
	},
	{
		keys: ["Del"],
		text: "删除选中节点"
	}
];
function rn(e) {
	return !!(e instanceof Element ? e : document.activeElement)?.closest("input, textarea, select, option, [contenteditable=\"true\"], .prompt-node-control, .prompt-input");
}
function an(e) {
	let t = String(e.type || "").toLowerCase(), n = String(e.name || "").toLowerCase();
	return t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/") || /\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(n);
}
function on({ onClose: e, onToggleAssets: t, open: n }) {
	return (0, p.useEffect)(() => {
		let n = (n) => {
			n.key === "Escape" && e(), !(String(n.key || "").toLowerCase() !== "a" || n.ctrlKey || n.metaKey || n.altKey || n.repeat || rn(n.target)) && (n.preventDefault(), t());
		};
		return window.addEventListener("keydown", n), () => window.removeEventListener("keydown", n);
	}, [e, t]), /* @__PURE__ */ (0, w.jsx)("div", {
		className: `shortcut-modal ${n ? "open" : ""}`,
		id: "smartShortcutModal",
		onClick: e,
		children: /* @__PURE__ */ (0, w.jsxs)("div", {
			className: "shortcut-panel",
			onClick: (e) => e.stopPropagation(),
			children: [/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "shortcut-head",
				children: [/* @__PURE__ */ (0, w.jsxs)("div", {
					className: "shortcut-title",
					children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "keyboard" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "快捷键" })]
				}), /* @__PURE__ */ (0, w.jsx)("button", {
					className: "preview-icon-btn",
					onClick: e,
					title: "关闭",
					type: "button",
					children: /* @__PURE__ */ (0, w.jsx)("i", {
						className: "w-4 h-4",
						"data-lucide": "x"
					})
				})]
			}), /* @__PURE__ */ (0, w.jsx)("div", {
				className: "shortcut-list",
				children: nn.map((e) => /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "shortcut-item",
					children: [/* @__PURE__ */ (0, w.jsx)("span", {
						className: "shortcut-keys",
						children: e.keys.map((e) => /* @__PURE__ */ (0, w.jsx)("kbd", { children: e }, e))
					}), /* @__PURE__ */ (0, w.jsx)("span", { children: e.text })]
				}, e.text))
			})]
		})
	});
}
//#endregion
//#region src/canvas/ui/smart-loop-node.tsx
function sn(e) {
	if (Array.isArray(e.variablePrompts) && e.variablePrompts.length) return e.variablePrompts.map((e) => String(e || "").trim());
	let t = String(e.variablePrompt || "").trim();
	if (!t) return [];
	let n = t.split(/\r?\n+/).map((e) => e.trim()).filter(Boolean);
	return n.length >= 2 ? n : [t];
}
function cn(e, t, n) {
	if (!e.showPrompt) return "";
	let r = sn(e).filter(Boolean), i = Math.max(1, Number(e.loopStart || 1)), a = Math.max(1, Math.min(100, Number(e.count || 1))), o = Math.max(1, n || i);
	return [t.length ? t[(o - 1) % t.length] : "", r.length ? r[(o - 1) % r.length] : ""].map((e) => e.trim()).filter(Boolean).join("\n\n").replaceAll("《计数》", String(o)).replaceAll("[计数]", String(o)).replaceAll("《总数》", String(a)).replaceAll("[总数]", String(a)).replaceAll("《进度》", `${o}/${a}`).replaceAll("[进度]", `${o}/${a}`).trim();
}
function ln(e, t, n) {
	if (!e.imageInput) return [];
	let r = Math.max(1, n || Number(e.loopStart || 1)), i = Math.max(1, Math.min(100, Number(e.imageBatchSize || 1)));
	return t.slice(r - 1, r - 1 + i);
}
function un(e, t = 0, n = 0) {
	let r = sn(e), i = 168;
	if (e.imageInput && (i += 72), e.showPrompt && (i += 94 + Math.max(1, r.length) * 58 + (n ? 78 : 0)), e.imageInput && t) {
		let e = Math.ceil(Math.min(10, t) / 5);
		i += e * 44 + (e - 1) * 6 + 8;
	}
	return {
		width: 340,
		height: Math.max(i, Number(e.h || 0))
	};
}
function dn({ disabled: e, label: t, max: n, onChange: r, value: i }) {
	let a = [
		1,
		2,
		3,
		4,
		5,
		6,
		8,
		10
	], o = (e) => r(Math.max(1, Math.min(n, Number(e) || 1)));
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "loop-number-control",
		children: [/* @__PURE__ */ (0, w.jsxs)("button", {
			className: "loop-smart-control loop-number-trigger",
			disabled: e,
			type: "button",
			children: [/* @__PURE__ */ (0, w.jsx)("span", { children: t }), /* @__PURE__ */ (0, w.jsx)("strong", { children: i })]
		}), /* @__PURE__ */ (0, w.jsxs)("div", {
			className: "loop-number-popover",
			children: [/* @__PURE__ */ (0, w.jsx)("div", {
				className: "loop-number-grid",
				children: a.map((t) => /* @__PURE__ */ (0, w.jsx)("button", {
					className: `loop-smart-control loop-number-cell ${t === i ? "active" : ""}`,
					"data-loop-value": t,
					disabled: e,
					onClick: () => o(t),
					type: "button",
					children: t
				}, t))
			}), /* @__PURE__ */ (0, w.jsxs)("label", {
				className: "loop-number-custom",
				children: [/* @__PURE__ */ (0, w.jsx)("span", { children: "自定义" }), /* @__PURE__ */ (0, w.jsx)("input", {
					"aria-label": t,
					className: "loop-smart-control loop-number-input",
					disabled: e,
					max: n,
					min: "1",
					onChange: (e) => o(Number(e.target.value)),
					step: "1",
					type: "number",
					value: i
				})]
			})]
		})]
	});
}
function fn({ media: e }) {
	return e.length ? /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "smart-node-input-thumbs",
		children: [e.slice(0, 10).map((e, t) => {
			let n = Z(e), r = String(e.url || "");
			return /* @__PURE__ */ (0, w.jsxs)("div", {
				className: "smart-node-input-thumb",
				children: [n === "video" ? /* @__PURE__ */ (0, w.jsx)("video", {
					muted: !0,
					preload: "metadata",
					src: r
				}) : n === "audio" ? /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "audio-thumb",
					children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "file-audio" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "Audio" })]
				}) : /* @__PURE__ */ (0, w.jsx)("img", {
					alt: "",
					src: r
				}), /* @__PURE__ */ (0, w.jsx)("span", {
					className: "smart-node-input-badge",
					children: t + 1
				})]
			}, `${r}-${t}`);
		}), e.length > 10 ? /* @__PURE__ */ (0, w.jsxs)("div", {
			className: "smart-node-input-thumb smart-node-input-more",
			children: ["+", e.length - 10]
		}) : null]
	}) : null;
}
function pn({ text: e, onRemove: t }) {
	let n = e.split(/(《计数》|\[计数\])/g);
	return /* @__PURE__ */ (0, w.jsx)(w.Fragment, { children: n.map((e, n) => e === "《计数》" || e === "[计数]" ? /* @__PURE__ */ (0, w.jsxs)("span", {
		className: "loop-smart-token-chip",
		contentEditable: !1,
		"data-token": "《计数》",
		children: [/* @__PURE__ */ (0, w.jsx)("span", { children: "计数" }), /* @__PURE__ */ (0, w.jsx)("button", {
			"aria-label": "删除变量",
			onClick: (e) => {
				e.preventDefault(), e.stopPropagation(), t();
			},
			title: "删除",
			type: "button",
			children: "×"
		})]
	}, n) : e) });
}
function mn(e) {
	let t = (e) => {
		if (e.nodeType === Node.TEXT_NODE) return e.nodeValue || "";
		if (e.nodeType !== Node.ELEMENT_NODE) return "";
		let n = e;
		return n.classList.contains("loop-smart-token-chip") ? n.dataset.token || "" : n.tagName === "BR" ? "\n" : [...n.childNodes].map(t).join("");
	};
	return [...e.childNodes].map(t).join("").replace(/\u00a0/g, " ");
}
function hn({ connecting: e, media: t, node: n, onConnectIn: r, onConnectOut: i, onDelete: a, onMoveStart: o, onPatch: s, onRun: c, onSelect: l, readOnly: u, selected: d, upstreamPrompts: f }) {
	let m = sn(n), h = m.length ? m : [""], g = Math.max(1, Math.min(100, Number(n.count || 1))), _ = Math.max(1, Number(n.loopStart || 1)), v = Math.max(1, Math.min(100, Number(n.imageBatchSize || 1))), y = n.imageInput ? t : [], b = ln(n, t, _), x = un(n, y.length, f.length), S = f.length ? f[(_ - 1) % f.length] : "", [C, T] = (0, p.useState)(0);
	(0, p.useEffect)(() => {
		requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		n.imageInput,
		n.showPrompt,
		n.running,
		m.length,
		t.length
	]);
	let E = (e, t = !1) => s({
		variablePrompts: e.length ? e : [""],
		variablePrompt: e.filter(Boolean).join("\n"),
		h: un({
			...n,
			variablePrompts: e
		}, y.length, f.length).height,
		w: 340
	}, t), D = (e) => {
		let r = { [e]: !n[e] };
		e === "showPrompt" && !n.showPrompt && !m.length && Object.assign(r, {
			variablePrompts: ["现在生成第《计数》张卖点图片"],
			variablePrompt: "现在生成第《计数》张卖点图片"
		});
		let i = {
			...n,
			...r
		};
		s({
			...r,
			...un(i, e === "imageInput" && n.imageInput ? 0 : t.length, f.length)
		}, !0);
	}, O = (e, t, n = !1) => {
		let r = [...h];
		r[e] = t, E(r, n);
	};
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		"aria-label": `smart-loop ${n.id}`,
		className: `image-node loop-smart-node ${d ? "selected" : ""} ${n.running ? "node-running" : ""}`.trim(),
		"data-id": n.id,
		"data-node-id": n.id,
		"data-node-type": "smart-loop",
		onClick: (e) => {
			e.stopPropagation(), l(e);
		},
		onPointerDown: o,
		role: "button",
		style: {
			height: x.height,
			left: Number(n.x || 0),
			top: Number(n.y || 0),
			width: x.width
		},
		tabIndex: 0,
		children: [
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "node-head",
				children: [/* @__PURE__ */ (0, w.jsx)("div", {
					className: "node-title",
					children: "Loop"
				}), /* @__PURE__ */ (0, w.jsx)("div", { className: "node-actions" })]
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "floating-node-actions",
				children: /* @__PURE__ */ (0, w.jsx)("button", {
					className: "mini-x node-delete",
					disabled: u,
					onClick: (e) => {
						e.stopPropagation(), a();
					},
					title: "删除节点",
					type: "button",
					children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "trash-2" })
				})
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "node-body",
				children: /* @__PURE__ */ (0, w.jsxs)("div", {
					className: `loop-smart-card ${n.imageInput ? "has-image" : ""} ${n.showPrompt ? "has-prompt" : ""}`,
					onClick: (e) => e.stopPropagation(),
					onPointerDown: (e) => e.stopPropagation(),
					children: [
						/* @__PURE__ */ (0, w.jsx)("div", {
							className: "loop-smart-row loop-smart-top",
							children: /* @__PURE__ */ (0, w.jsxs)("div", {
								className: "loop-smart-seg",
								children: [/* @__PURE__ */ (0, w.jsx)("button", {
									className: `loop-smart-control ${n.mode === "parallel" ? "" : "active"}`,
									disabled: u || !!n.running,
									onClick: () => s({ mode: "serial" }, !0),
									type: "button",
									children: "串行"
								}), /* @__PURE__ */ (0, w.jsx)("button", {
									className: `loop-smart-control ${n.mode === "parallel" ? "active" : ""}`,
									disabled: u || !!n.running,
									onClick: () => s({ mode: "parallel" }, !0),
									title: "并行运行多个循环轮次",
									type: "button",
									children: "并行"
								})]
							})
						}),
						/* @__PURE__ */ (0, w.jsxs)("div", {
							className: "loop-smart-row",
							children: [/* @__PURE__ */ (0, w.jsxs)("button", {
								className: `loop-smart-control loop-smart-toggle ${n.imageInput ? "active" : ""}`,
								disabled: u || !!n.running,
								onClick: () => D("imageInput"),
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "image" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "图片输入" })]
							}), /* @__PURE__ */ (0, w.jsxs)("button", {
								className: `loop-smart-control loop-smart-toggle ${n.showPrompt ? "active" : ""}`,
								disabled: u || !!n.running,
								onClick: () => D("showPrompt"),
								type: "button",
								children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "text-cursor-input" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "提示词输入" })]
							})]
						}),
						n.imageInput ? /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "loop-smart-panel",
							children: [
								/* @__PURE__ */ (0, w.jsx)(fn, { media: y }),
								/* @__PURE__ */ (0, w.jsx)("div", {
									className: "loop-smart-mini",
									children: /* @__PURE__ */ (0, w.jsx)(dn, {
										disabled: u || !!n.running,
										label: "每轮图片",
										max: 100,
										onChange: (e) => s({ imageBatchSize: e }, !0),
										value: v
									})
								}),
								/* @__PURE__ */ (0, w.jsx)("div", {
									className: "loop-smart-note",
									children: b.length ? `本轮将输出 ${b.length} 张图片` : "请连接图片输入"
								})
							]
						}) : null,
						n.showPrompt ? /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "loop-smart-panel prompt-panel",
							children: [
								S ? /* @__PURE__ */ (0, w.jsxs)("div", {
									className: "loop-smart-upstream",
									children: [/* @__PURE__ */ (0, w.jsxs)("div", {
										className: "loop-smart-upstream-label",
										children: [
											"已找到 ",
											f.length,
											" 个上游提示词"
										]
									}), /* @__PURE__ */ (0, w.jsx)("div", {
										className: "loop-smart-upstream-text",
										children: S
									})]
								}) : null,
								/* @__PURE__ */ (0, w.jsx)("div", {
									className: "loop-smart-prompt-list",
									children: h.map((e, t) => /* @__PURE__ */ (0, w.jsxs)("div", {
										className: "loop-smart-prompt-item",
										children: [
											/* @__PURE__ */ (0, w.jsx)("div", {
												className: "loop-smart-prompt-index",
												children: t + 1
											}),
											/* @__PURE__ */ (0, w.jsx)("div", {
												className: "loop-smart-control loop-smart-text",
												contentEditable: !u && !n.running,
												"data-loop-prompt-index": t,
												"data-placeholder": "输入每轮变化的提示词",
												onBlur: (e) => O(t, mn(e.currentTarget), !0),
												onFocus: () => T(t),
												suppressContentEditableWarning: !0,
												children: /* @__PURE__ */ (0, w.jsx)(pn, {
													onRemove: () => O(t, e.replace(/《计数》|\[计数\]/, ""), !0),
													text: e || (t === 0 && !m.length ? "现在生成第《计数》张卖点图片" : "")
												})
											}),
											/* @__PURE__ */ (0, w.jsx)("button", {
												"aria-label": "删除提示词字段",
												className: "loop-smart-control loop-smart-icon-btn",
												disabled: u || !!n.running || h.length <= 1,
												onClick: () => E(h.filter((e, n) => n !== t), !0),
												title: "删除",
												type: "button",
												children: "×"
											})
										]
									}, t))
								}),
								/* @__PURE__ */ (0, w.jsxs)("div", {
									className: "loop-smart-row loop-smart-prompt-actions",
									children: [
										/* @__PURE__ */ (0, w.jsx)("button", {
											className: "loop-smart-control loop-smart-token loop-smart-counter-token",
											disabled: u || !!n.running,
											onClick: () => O(Math.min(C, h.length - 1), `${h[Math.min(C, h.length - 1)] || ""}《计数》`, !0),
											type: "button",
											children: "计数"
										}),
										/* @__PURE__ */ (0, w.jsx)("span", {
											className: "loop-smart-note",
											children: f.length ? `已找到 ${f.length} 个上游提示词` : "每轮使用对应的变量提示词"
										}),
										/* @__PURE__ */ (0, w.jsx)("button", {
											"aria-label": "新增",
											className: "loop-smart-control loop-smart-add-prompt",
											disabled: u || !!n.running,
											onClick: () => E([...h, ""], !0),
											title: "新增",
											type: "button",
											children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "plus" })
										})
									]
								})
							]
						}) : null,
						/* @__PURE__ */ (0, w.jsxs)("div", {
							className: "loop-smart-footer",
							children: [
								/* @__PURE__ */ (0, w.jsx)(dn, {
									disabled: u || !!n.running,
									label: "起始",
									max: 9999,
									onChange: (e) => s({ loopStart: e }, !0),
									value: _
								}),
								/* @__PURE__ */ (0, w.jsx)(dn, {
									disabled: u || !!n.running,
									label: "轮次",
									max: 100,
									onChange: (e) => s({ count: e }, !0),
									value: g
								}),
								/* @__PURE__ */ (0, w.jsxs)("button", {
									className: `loop-smart-control loop-smart-run ${n.running ? "is-stop" : ""}`,
									disabled: u,
									onClick: () => void c(),
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": n.running ? "square" : "workflow" }), /* @__PURE__ */ (0, w.jsx)("span", { children: n.running ? "停止运行" : "运行全部" })]
								})
							]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "node-hint",
				children: "拖拽节点移动"
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "node-resize-handle",
				"data-resize": "1"
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: `node-port port-in ${e ? "port-hover" : ""}`,
				"data-port": "in",
				onClick: (e) => {
					e.stopPropagation(), r();
				},
				title: "输入"
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "node-port port-out",
				"data-port": "out",
				onPointerDown: (e) => {
					e.stopPropagation(), i();
				},
				title: "输出"
			})
		]
	});
}
//#endregion
//#region src/canvas/ui/smart-prompt-node.tsx
var gn = 58, _n = 44, vn = 240;
function yn(e, t = 0) {
	let n = Number(e.llmInstructionHeight), r = Number.isFinite(n) ? Math.max(_n, Math.min(vn, Math.round(n))) : gn, i = Number(e.w), a = Number(e.h), o = !Number.isFinite(i) || i === 360 ? 316 : Math.max(316, Math.round(i)), s = t ? Math.ceil(Math.min(10, t) / 5) : 0, c = s ? s * 44 + (s - 1) * 6 + 8 : 0, l = e.llmEnabled ? (e.llmSystemEnabled ? 344 : 292) + c + Math.max(0, r - gn) : 194, u = e.llmSystemEnabled ? 344 : 292;
	return {
		height: !Number.isFinite(a) || [
			194,
			230,
			340,
			400,
			u
		].includes(a) ? l : Math.max(Math.round(a), l),
		instructionHeight: r,
		width: o
	};
}
function bn(e, t) {
	let n = String(e.llmProvider || "comfly"), r = String(e.llmModel || e.model || "gpt-4o-mini");
	return {
		message: String(e.llmInstruction || e.text || "").trim(),
		messages: [],
		images: t.filter((e) => Z(e) === "image").map((e) => String(e.url || "")).filter(Boolean),
		videos: t.filter((e) => Z(e) === "video").map((e) => String(e.url || "")).filter(Boolean),
		model: r,
		provider: n,
		ms_model: n === "modelscope" ? r : "",
		system_prompt: e.llmSystemEnabled ? String(e.llmSystemPrompt || "").trim() || "You are a helpful prompt assistant." : ""
	};
}
function xn(e) {
	let t = document.getElementById("toast");
	t && (t.textContent = e, t.classList.add("show"), window.setTimeout(() => t.classList.remove("show"), 1800));
}
function Sn({ media: e }) {
	return e.length ? /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "smart-node-input-thumbs",
		children: [e.slice(0, 10).map((e, t) => {
			let n = Z(e), r = String(e.url || "");
			return /* @__PURE__ */ (0, w.jsxs)("div", {
				className: "smart-node-input-thumb",
				"data-input-index": t,
				children: [n === "video" ? /* @__PURE__ */ (0, w.jsx)("video", {
					muted: !0,
					preload: "metadata",
					src: r
				}) : n === "audio" ? /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "audio-thumb",
					children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "file-audio" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "Audio" })]
				}) : /* @__PURE__ */ (0, w.jsx)("img", {
					alt: "",
					src: r
				}), /* @__PURE__ */ (0, w.jsx)("span", {
					className: "smart-node-input-badge",
					children: t + 1
				})]
			}, `${r}-${t}`);
		}), e.length > 10 ? /* @__PURE__ */ (0, w.jsxs)("div", {
			className: "smart-node-input-thumb smart-node-input-more",
			children: ["+", e.length - 10]
		}) : null]
	}) : null;
}
function Cn({ connecting: e, media: t, node: n, onConnectIn: r, onConnectOut: i, onDelete: a, onMoveStart: o, onOpenPreset: s, onOpenTemplate: c, onPatch: l, onRun: u, onSelect: d, providers: f, readOnly: m, selected: h }) {
	let [g, _] = (0, p.useState)(f), v = yn(n, n.llmEnabled ? t.length : 0), y = g.find((e) => e.value === n.llmProvider) || g[0], b = y?.models || [String(n.llmModel || n.model || "gpt-4o-mini")].filter(Boolean), x = b.includes(String(n.llmModel || "")) ? String(n.llmModel) : b[0] || String(n.llmModel || "gpt-4o-mini");
	(0, p.useEffect)(() => {
		requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		n.llmEnabled,
		n.llmSystemEnabled,
		n.running,
		t.length
	]), (0, p.useEffect)(() => {
		let e = !0;
		return fetch("/api/config").then((e) => e.json()).then((t) => {
			let n = (t.api_providers || []).filter((e) => e.enabled !== !1 && e.id && e.chat_models?.length).map((e) => ({
				label: String(e.name || e.id),
				models: [...new Set((e.chat_models || []).map(String).filter(Boolean))],
				value: String(e.id)
			}));
			e && n.length && _(n);
		}).catch(() => void 0), () => {
			e = !1;
		};
	}, []);
	let S = async () => {
		let e = bn({
			...n,
			llmProvider: y?.value || n.llmProvider,
			llmModel: x
		}, t);
		if (!e.message) {
			xn("请输入要处理的提示词或 LLM 指令");
			return;
		}
		l({
			llmEnabled: !0,
			llmProvider: e.provider,
			llmModel: e.model
		});
		try {
			await u();
		} catch (e) {
			xn((e instanceof Error ? e.message : String(e)).slice(0, 160));
		}
	}, C = () => {
		let e = !n.llmEnabled, r = yn({
			...n,
			llmEnabled: e
		}, e ? t.length : 0);
		l({
			llmEnabled: e,
			llmProvider: y?.value || n.llmProvider || "comfly",
			llmModel: x,
			h: r.height,
			w: r.width
		}, !0);
	};
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		"aria-label": `smart-prompt ${n.id}`,
		className: `image-node prompt-smart-node ${h ? "selected" : ""} ${n.running ? "node-running" : ""}`.trim(),
		"data-id": n.id,
		"data-node-id": n.id,
		"data-node-type": "smart-prompt",
		onClick: (e) => {
			e.stopPropagation(), d(e);
		},
		onPointerDown: o,
		role: "button",
		style: {
			height: v.height,
			left: Number(n.x || 0),
			top: Number(n.y || 0),
			width: v.width
		},
		tabIndex: 0,
		children: [
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "node-head",
				children: [/* @__PURE__ */ (0, w.jsx)("div", {
					className: "node-title",
					children: "Prompt"
				}), /* @__PURE__ */ (0, w.jsx)("div", { className: "node-actions" })]
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "floating-node-actions",
				children: /* @__PURE__ */ (0, w.jsx)("button", {
					className: "mini-x node-delete",
					disabled: m,
					onClick: (e) => {
						e.stopPropagation(), a();
					},
					title: "删除节点",
					type: "button",
					children: /* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "trash-2" })
				})
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "node-body",
				children: /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "prompt-node-card",
					onClick: (e) => e.stopPropagation(),
					onPointerDown: (e) => e.stopPropagation(),
					children: [
						/* @__PURE__ */ (0, w.jsx)("textarea", {
							className: "prompt-node-text prompt-node-control",
							onBlur: () => l({}, !0),
							onChange: (e) => l({ text: e.target.value }),
							onClick: (e) => e.stopPropagation(),
							onPointerDown: (e) => e.stopPropagation(),
							placeholder: "输入提示词",
							readOnly: m || !!n.llmEnabled,
							value: String(n.text || "")
						}),
						/* @__PURE__ */ (0, w.jsxs)("div", {
							className: "prompt-node-tools",
							children: [
								/* @__PURE__ */ (0, w.jsxs)("button", {
									className: `prompt-node-pill prompt-node-control prompt-preset-edit ${n.promptPresetId ? "active" : ""}`,
									disabled: m,
									onClick: (e) => {
										e.stopPropagation(), c();
									},
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "library" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "模板库" })]
								}),
								/* @__PURE__ */ (0, w.jsxs)("button", {
									className: "prompt-node-pill prompt-node-control prompt-preset-save",
									disabled: m,
									onClick: (e) => {
										e.stopPropagation(), s();
									},
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "bookmark-plus" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "预设" })]
								}),
								/* @__PURE__ */ (0, w.jsxs)("button", {
									className: `prompt-node-pill prompt-llm-toggle ${n.llmEnabled ? "active" : ""}`,
									disabled: m,
									onClick: (e) => {
										e.stopPropagation(), C();
									},
									type: "button",
									children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": "sparkles" }), /* @__PURE__ */ (0, w.jsx)("span", { children: "LLM" })]
								})
							]
						}),
						n.llmEnabled ? /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [/* @__PURE__ */ (0, w.jsx)(Sn, { media: t }), /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "prompt-node-llm",
							children: [
								/* @__PURE__ */ (0, w.jsx)("select", {
									"aria-label": "LLM 平台",
									className: "prompt-node-control prompt-llm-provider",
									disabled: m,
									onChange: (e) => {
										let t = g.find((t) => t.value === e.target.value);
										l({
											llmProvider: e.target.value,
											llmModel: t?.models[0] || ""
										}, !0);
									},
									value: y?.value || String(n.llmProvider || ""),
									children: g.map((e) => /* @__PURE__ */ (0, w.jsx)("option", {
										value: e.value,
										children: e.label
									}, e.value))
								}),
								/* @__PURE__ */ (0, w.jsx)("select", {
									"aria-label": "LLM 模型",
									className: "prompt-node-control prompt-llm-model",
									disabled: m,
									onChange: (e) => l({ llmModel: e.target.value }, !0),
									value: x,
									children: b.map((e) => /* @__PURE__ */ (0, w.jsx)("option", {
										value: e,
										children: e
									}, e))
								}),
								/* @__PURE__ */ (0, w.jsxs)("div", {
									className: "prompt-llm-instruction-wrap",
									children: [/* @__PURE__ */ (0, w.jsx)("textarea", {
										"aria-label": "LLM 指令",
										className: "prompt-node-control prompt-llm-instruction",
										disabled: m,
										onBlur: () => l({}, !0),
										onChange: (e) => l({ llmInstruction: e.target.value }),
										placeholder: "输入发送给 LLM 的指令",
										style: { height: v.instructionHeight },
										value: String(n.llmInstruction || "")
									}), /* @__PURE__ */ (0, w.jsx)("div", {
										className: "prompt-llm-instruction-resize prompt-node-control",
										"data-llm-instruction-resize": "1",
										onPointerDown: (e) => {
											if (m || e.button !== 0) return;
											e.preventDefault(), e.stopPropagation();
											let t = e.clientY, r = v.instructionHeight, i = v.height;
											document.body.classList.add("smart-node-resize", "smart-llm-instr-resize");
											let a = (e) => {
												let a = Math.max(_n, Math.min(vn, Math.round(r + e.clientY - t)));
												l({
													llmInstructionHeight: a,
													h: Math.max(n.llmSystemEnabled ? 344 : 292, i + a - r)
												});
											};
											window.addEventListener("pointermove", a), window.addEventListener("pointerup", () => {
												window.removeEventListener("pointermove", a), document.body.classList.remove("smart-node-resize", "smart-llm-instr-resize"), l({}, !0);
											}, { once: !0 });
										},
										title: "拖动调整高度",
										children: /* @__PURE__ */ (0, w.jsx)("span", {})
									})]
								}),
								/* @__PURE__ */ (0, w.jsxs)("div", {
									className: "prompt-node-llm-actions",
									children: [/* @__PURE__ */ (0, w.jsxs)("button", {
										className: "prompt-node-run prompt-node-control",
										disabled: m || !!n.running,
										onClick: (e) => {
											e.stopPropagation(), S();
										},
										type: "button",
										children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": n.running ? "loader-2" : "play" }), /* @__PURE__ */ (0, w.jsx)("span", { children: n.running ? "运行中" : "运行" })]
									}), /* @__PURE__ */ (0, w.jsxs)("button", {
										className: `prompt-node-pill prompt-node-control prompt-system-toggle ${n.llmSystemEnabled ? "active" : ""}`,
										disabled: m,
										onClick: (e) => {
											e.stopPropagation();
											let r = !n.llmSystemEnabled;
											l({
												llmSystemEnabled: r,
												h: yn({
													...n,
													llmSystemEnabled: r
												}, t.length).height
											}, !0);
										},
										type: "button",
										children: [/* @__PURE__ */ (0, w.jsx)("i", { "data-lucide": n.llmSystemEnabled ? "toggle-right" : "toggle-left" }), /* @__PURE__ */ (0, w.jsx)("span", { children: n.llmSystemEnabled ? "关闭 System" : "启用 System" })]
									})]
								}),
								n.llmSystemEnabled ? /* @__PURE__ */ (0, w.jsx)("textarea", {
									"aria-label": "System 提示词",
									className: "prompt-node-control prompt-llm-system",
									disabled: m,
									onBlur: () => l({}, !0),
									onChange: (e) => l({ llmSystemPrompt: e.target.value }),
									placeholder: "输入 System 提示词",
									value: String(n.llmSystemPrompt || "You are a helpful prompt assistant.")
								}) : null
							]
						})] }) : null
					]
				})
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "node-hint",
				children: "拖拽节点移动"
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "node-resize-handle",
				"data-resize": "1"
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: `node-port port-in ${e ? "port-hover" : ""}`,
				"data-port": "in",
				onClick: (e) => {
					e.stopPropagation(), r();
				},
				title: "输入"
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "node-port port-out",
				"data-port": "out",
				onPointerDown: (e) => {
					e.stopPropagation(), i();
				},
				title: "输出"
			})
		]
	});
}
//#endregion
//#region src/canvas/ui/canvas-board-v2.tsx
var wn = 6e3, Tn = 4e3, En = "canvas_session_viewports_v1", Dn = [
	[
		"image",
		"上传节点",
		"image-plus"
	],
	[
		"prompt",
		"提示词",
		"text-cursor-input"
	],
	[
		"loop",
		"循环节点",
		"repeat-2"
	],
	[
		"llm",
		"LLM 节点",
		"message-square-text"
	],
	[
		"generator",
		"API生成",
		"wand-sparkles"
	],
	[
		"msgen",
		"ModelScope生成",
		"cloud-lightning"
	],
	[
		"video",
		"视频生成",
		"clapperboard"
	],
	[
		"comfy",
		"ComfyUI 生成",
		"workflow"
	],
	[
		"ltxDirector",
		"LTX Director",
		"film"
	],
	[
		"output",
		"Output",
		"circle-dot"
	]
], On = {
	"smart-image": "Image",
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
function Q() {
	return window.CanvasModernCore?.canvasRuntime ?? null;
}
function kn(e) {
	return {
		x: Number(e.x || 0),
		y: Number(e.y || 0)
	};
}
function An(e) {
	try {
		let t = JSON.parse(sessionStorage.getItem(En) || "{}")[e];
		return t ? {
			x: Number.isFinite(Number(t.x)) ? Number(t.x) : 0,
			y: Number.isFinite(Number(t.y)) ? Number(t.y) : 0,
			zoom: Math.min(1.5, Math.max(.25, Number(t.zoom || 1)))
		} : {
			x: 0,
			y: 0,
			zoom: 1
		};
	} catch {
		return {
			x: 0,
			y: 0,
			zoom: 1
		};
	}
}
function jn(e, t) {
	if (e) try {
		let n = JSON.parse(sessionStorage.getItem(En) || "{}");
		n[e] = t, sessionStorage.setItem(En, JSON.stringify(n));
	} catch {}
}
function Mn(e, t) {
	return e.x <= t.x + t.width && e.x + e.width >= t.x && e.y <= t.y + t.height && e.y + e.height >= t.y;
}
function Nn(e) {
	if (e.type === "smart-image") {
		let t = $e(e);
		return {
			height: t.height,
			width: t.width
		};
	}
	if (e.type === "prompt") {
		let t = yn(e);
		return {
			height: t.height,
			width: t.width
		};
	}
	if (e.type === "loop") return un(e);
	let t = e.type === "image" ? {
		height: 336,
		width: 260
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
function Pn(e) {
	return [
		"generator",
		"comfy",
		"ltxDirector",
		"output",
		"llm",
		"msgen",
		"smart-image",
		"video"
	].includes(e.type) || e.type === "loop" && (!!e.imageInput || !!e.showPrompt);
}
function Fn(e) {
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
		"smart-image",
		"video",
		"output"
	].includes(e.type);
}
function In(e) {
	let t = typeof e == "string" ? { url: e } : e && typeof e == "object" ? structuredClone(e) : null;
	return t ? ([
		"runPrompt",
		"runModelPrompt",
		"runSettings",
		"sourceNodeId",
		"runAt",
		"promptDraftHtml",
		"promptDraftText"
	].forEach((e) => delete t[e]), t) : null;
}
function Ln(e, t) {
	let n = new Set(t), r = e.nodes.filter((e) => n.has(e.id) && Array.isArray(e.images) && e.images.length);
	if (r.length < 2) return null;
	let i = `smart_${crypto.randomUUID()}`, a = r.flatMap((e) => e.images.map(In).filter((e) => !!e)), o = {
		created_at: Date.now(),
		id: i,
		images: a,
		scale: .8,
		title: "Group",
		type: "smart-image",
		x: Math.min(...r.map((e) => Number(e.x || 0))),
		y: Math.min(...r.map((e) => Number(e.y || 0)))
	}, s = e.connections.map((e) => ({
		...e,
		from: n.has(e.from) ? i : e.from,
		to: n.has(e.to) ? i : e.to
	})), c = /* @__PURE__ */ new Set(), l = s.filter((e) => {
		let t = `${e.from}\u0000${e.to}\u0000${String(e.kind || "flow")}`;
		return e.from === e.to || c.has(t) ? !1 : (c.add(t), !0);
	});
	return {
		document: {
			...e,
			connections: l,
			nodes: [...e.nodes.filter((e) => !n.has(e.id)), o]
		},
		id: i
	};
}
function Rn(e, t) {
	let n = e.nodes.find((e) => e.id === t), r = Array.isArray(n?.images) ? n.images.map(In).filter((e) => !!e) : [];
	if (!n || r.length < 2) return null;
	let i = $e(n), a = Math.max(28, Math.round(i.thumb || 96)), o = r.map((e, t) => {
		let r = t % Math.max(1, i.cols || 1), o = Math.floor(t / Math.max(1, i.cols || 1)), s = Number(e.natural_w || e.width || e.w || 0), c = Number(e.natural_h || e.height || e.h || 0), l = s > 0 && c > 0 ? Math.min(a / s, a / c) : 1, u = s > 0 && c > 0 ? Math.max(28, Math.round(s * l)) : a, d = s > 0 && c > 0 ? Math.max(28, Math.round(c * l)) : a;
		return {
			created_at: Date.now(),
			h: d,
			id: `smart_${crypto.randomUUID()}`,
			images: [e],
			scale: 2,
			title: "Image",
			type: "smart-image",
			w: u,
			x: Math.round(Number(n.x || 0) + 16 + r * (a + 8) + Math.max(0, (a - u) / 2)),
			y: Math.round(Number(n.y || 0) + 16 + o * (a + 8) + Math.max(0, (a - d) / 2))
		};
	}), s = o.map((e) => e.id), c = e.nodes.filter((e) => e.id !== t).map((e) => Array.isArray(e.inputNodeIds) ? {
		...e,
		inputNodeIds: e.inputNodeIds.filter((e) => String(e) !== t)
	} : e);
	return {
		document: {
			...e,
			connections: e.connections.filter((e) => e.from !== t && e.to !== t),
			nodes: [...c, ...o]
		},
		ids: s
	};
}
function zn(e) {
	let t = e.runSettings && typeof e.runSettings == "object" ? e.runSettings : {}, n = String(t.engine || "api"), r = n === "modelscope" ? "msgen" : n === "comfy" ? "comfy" : String(t.apiKind || t.kind || "image") === "video" ? "video" : "generator";
	return {
		...t,
		id: e.id,
		type: r,
		apiProvider: t.apiProvider || t.provider_id || t.providerId || "",
		model: t.model || "",
		ratio: t.ratio || t.apiRatio || "square",
		resolution: t.resolution || t.apiResolution || "1k",
		running: e.running
	};
}
function Bn({ commit: e, node: t, onOpenPreset: n, onOpenTemplate: r, store: i }) {
	let a = String(t.text || "");
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "prompt-editor",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [/* @__PURE__ */ (0, w.jsxs)("div", {
			className: "prompt-toolbar",
			children: [
				/* @__PURE__ */ (0, w.jsx)("button", {
					className: "prompt-template-btn prompt-preset-edit",
					onClick: () => r ? r(t.id) : window.CanvasBoardV2?.openPromptTemplates(t.id),
					type: "button",
					children: "模板"
				}),
				n ? /* @__PURE__ */ (0, w.jsx)("button", {
					className: "prompt-template-btn prompt-preset-save",
					onClick: () => n(t.id),
					type: "button",
					children: "预设"
				}) : null,
				/* @__PURE__ */ (0, w.jsxs)("div", {
					className: `prompt-counter ${a.length > 2e4 ? "over" : ""}`,
					children: [/* @__PURE__ */ (0, w.jsx)("span", { children: a.length.toLocaleString() }), /* @__PURE__ */ (0, w.jsx)("span", { children: "/ 20,000" })]
				})
			]
		}), /* @__PURE__ */ (0, w.jsx)("textarea", {
			"data-field": "text",
			maxLength: 2e4,
			onBlur: e,
			onChange: (e) => i.getState().updateNode(t.id, { text: e.target.value }),
			placeholder: "输入提示词",
			value: a
		})]
	});
}
function Vn({ node: e, nodesById: t }) {
	let n = Array.isArray(e.items) ? e.items.map((e) => t.get(String(e))).filter((e) => e?.type === "prompt") : [];
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "text-[11px] text-gray-400",
		"data-prompt-count": n.length,
		children: [n.length, " 个提示词已分组"]
	});
}
function Hn({ commit: e, node: t, store: n }) {
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
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "loop-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "loop-count-row",
				children: [/* @__PURE__ */ (0, w.jsxs)("div", {
					className: "loop-run-row",
					children: [/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "loop-count-group",
						children: [/* @__PURE__ */ (0, w.jsx)("span", {
							className: "loop-count-label",
							children: "循环次数"
						}), /* @__PURE__ */ (0, w.jsx)("input", {
							"aria-label": "循环次数",
							className: "loop-count-input",
							max: "100",
							min: "1",
							onBlur: e,
							onChange: (e) => o({ count: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }),
							type: "number",
							value: r
						})]
					}), /* @__PURE__ */ (0, w.jsxs)("div", {
						className: "seg loop-mode",
						children: [/* @__PURE__ */ (0, w.jsx)("button", {
							className: t.mode === "parallel" ? "" : "active",
							onClick: () => o({ mode: "serial" }, !0),
							type: "button",
							children: "串行"
						}), /* @__PURE__ */ (0, w.jsx)("button", {
							className: t.mode === "parallel" ? "active" : "",
							onClick: () => o({ mode: "parallel" }, !0),
							type: "button",
							children: "并行"
						})]
					})]
				}), /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "loop-toggle-row",
					children: [/* @__PURE__ */ (0, w.jsx)("button", {
						className: `loop-toggle loop-image-toggle ${t.imageInput ? "active" : ""}`,
						onClick: () => s("imageInput"),
						type: "button",
						children: "图片输入"
					}), /* @__PURE__ */ (0, w.jsx)("button", {
						className: `loop-toggle loop-prompt-toggle ${t.showPrompt ? "active" : ""}`,
						onClick: () => s("showPrompt"),
						type: "button",
						children: "提示词输入"
					})]
				})]
			}),
			t.imageInput ? /* @__PURE__ */ (0, w.jsx)("div", {
				className: "loop-image-panel",
				children: /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "loop-image-row",
					children: [
						/* @__PURE__ */ (0, w.jsx)("span", {
							className: "loop-count-label",
							children: "起始"
						}),
						/* @__PURE__ */ (0, w.jsx)("input", {
							"aria-label": "图片起始序号",
							className: "loop-count-input",
							min: "1",
							onBlur: e,
							onChange: (e) => o({ loopStart: Math.max(1, Number(e.target.value) || 1) }),
							type: "number",
							value: i
						}),
						/* @__PURE__ */ (0, w.jsx)("span", {
							className: "loop-count-label",
							children: "批量"
						}),
						/* @__PURE__ */ (0, w.jsx)("input", {
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
			t.showPrompt ? /* @__PURE__ */ (0, w.jsxs)("div", {
				className: "loop-prompt-panel",
				children: [/* @__PURE__ */ (0, w.jsx)("div", {
					className: "loop-field",
					children: /* @__PURE__ */ (0, w.jsx)("textarea", {
						"aria-label": "循环变量提示词",
						onBlur: e,
						onChange: (e) => o({ variablePrompt: e.target.value }),
						placeholder: "每轮变化的提示词",
						value: String(t.variablePrompt || "")
					})
				}), /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "loop-start-row",
					children: [
						/* @__PURE__ */ (0, w.jsx)("button", {
							className: "loop-token-btn loop-counter-token-btn",
							onClick: () => o({ variablePrompt: `${String(t.variablePrompt || "")}《计数》` }, !0),
							type: "button",
							children: "计数"
						}),
						/* @__PURE__ */ (0, w.jsx)("span", {
							className: "loop-count-label",
							children: "起始"
						}),
						/* @__PURE__ */ (0, w.jsx)("input", {
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
var Un = [
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
], Wn = [
	["1k", "1K"],
	["2k", "2K"],
	["4k", "4K"],
	["custom", "自定义"]
];
function $({ ariaLabel: e, onChange: t, options: n, value: r }) {
	return /* @__PURE__ */ (0, w.jsxs)("select", {
		"aria-label": e,
		className: "select-lite",
		onChange: (e) => t(e.target.value),
		value: r,
		children: [!n.some(([e]) => e === r) && r ? /* @__PURE__ */ (0, w.jsx)("option", {
			value: r,
			children: r
		}) : null, n.map(([e, t]) => /* @__PURE__ */ (0, w.jsx)("option", {
			value: e,
			children: t
		}, e))]
	});
}
function Gn({ label: e = "运行", mode: t, node: n }) {
	let [r, i] = (0, p.useState)(!1);
	return /* @__PURE__ */ (0, w.jsx)("button", {
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
var Kn = /* @__PURE__ */ new Set([
	"generator",
	"msgen",
	"video",
	"comfy",
	"llm",
	"ltxDirector"
]);
function qn(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e])), r = /* @__PURE__ */ new Set(), i = e.connections.filter((e) => e.to === t).map((e) => e.from);
	for (; i.length;) {
		let t = i.pop();
		if (!r.has(t)) {
			if (r.add(t), Kn.has(n.get(t)?.type || "")) return !0;
			e.connections.filter((e) => e.to === t).forEach((e) => i.push(e.from));
		}
	}
	return !1;
}
function Jn({ document: e, node: t }) {
	let n = qn(e, t.id), r = t.runStatus === "failed" && !!t._cascadeFailed;
	return /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [/* @__PURE__ */ (0, w.jsxs)("div", {
		className: "gen-run-row",
		children: [
			/* @__PURE__ */ (0, w.jsx)(Gn, { node: t }),
			n ? /* @__PURE__ */ (0, w.jsx)(Gn, {
				label: "一键运行",
				mode: "cascade",
				node: t
			}) : null,
			t.running ? /* @__PURE__ */ (0, w.jsx)("button", {
				className: "node-stop-btn",
				onClick: () => void window.CanvasBoardV2?.controlExecution("stop-execution", t.id),
				type: "button",
				children: "停止"
			}) : null
		]
	}), r ? /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "node-retry-bar",
		children: [
			/* @__PURE__ */ (0, w.jsx)("span", {
				className: "node-retry-msg",
				title: String(t.runError || ""),
				children: String(t.runError || "生成失败").slice(0, 60)
			}),
			/* @__PURE__ */ (0, w.jsx)("button", {
				className: "node-retry-btn",
				onClick: () => void window.CanvasBoardV2?.controlExecution("retry-execution", t.id),
				type: "button",
				children: "重试"
			}),
			/* @__PURE__ */ (0, w.jsx)("button", {
				className: "node-stop-btn",
				onClick: () => void window.CanvasBoardV2?.controlExecution("stop-execution", t.id),
				type: "button",
				children: "停止"
			})
		]
	}) : null] });
}
function Yn(e, t) {
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
	}).filter((e) => e.url) : e.type === "smart-image" ? tt(e).map((e) => ({
		...e,
		kind: String(e.kind || "image"),
		name: String(e.name || ""),
		url: String(e.url || "")
	})) : e.type === "group" && Array.isArray(e.items) ? e.items.map((e) => n.get(String(e))).filter((e) => e?.type === "image" && e.url).map((e) => ({
		kind: String(e.mediaKind || "image"),
		name: String(e.name || ""),
		url: String(e.url)
	})) : []);
}
function Xn(e, t) {
	let n = new Map(e.nodes.map((e) => [e.id, e]));
	return e.connections.filter((e) => e.to === t.id).map((e) => n.get(e.from)).filter(Boolean).flatMap((e) => e?.type === "prompt" ? String(e.text || "").trim() ? [String(e.text).trim()] : [] : e?.type === "loop" && cn(e, [], Math.max(1, Number(e.loopStart || 1))) || []);
}
async function Zn(e) {
	return new Promise((t, n) => {
		let r = new Image();
		r.onload = () => t({
			height: r.naturalHeight,
			width: r.naturalWidth
		}), r.onerror = () => n(/* @__PURE__ */ Error("无法读取参考图尺寸")), r.src = e;
	});
}
function Qn({ document: e, node: t }) {
	let n = e.connections.filter((e) => e.to === t.id).map((t) => e.nodes.find((e) => e.id === t.from)).filter(Boolean).filter((e) => [
		"prompt",
		"promptGroup",
		"loop",
		"llm"
	].includes(e.type)).length, r = Yn(e, t);
	return /* @__PURE__ */ (0, w.jsxs)("div", { children: [/* @__PURE__ */ (0, w.jsxs)("div", {
		className: "text-[10px] text-gray-400",
		children: [
			"提示词 ",
			n,
			" · 图片/媒体 ",
			r.length
		]
	}), r.length ? /* @__PURE__ */ (0, w.jsx)("div", {
		className: "input-list mt-1",
		children: r.slice(0, 8).map((e, t) => /* @__PURE__ */ (0, w.jsxs)("div", {
			className: "input-item",
			children: [e.kind === "video" ? /* @__PURE__ */ (0, w.jsx)("video", {
				muted: !0,
				preload: "metadata",
				src: e.url
			}) : /* @__PURE__ */ (0, w.jsx)("img", {
				alt: e.name || `参考 ${t + 1}`,
				src: e.url
			}), /* @__PURE__ */ (0, w.jsx)("span", {
				className: "input-index",
				children: t + 1
			})]
		}, `${e.url}-${t}`))
	}) : null] });
}
function $n({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = (Q()?.getNodeOptions("generator", "provider", n) ?? []).map((e) => [e.value, e.label]), o = (Q()?.getNodeOptions("generator", "model", n) ?? []).map((e) => [e.value, e.label]), s = String(n.apiProvider || a[0]?.[0] || ""), c = async () => {
		let e = Yn(t, n).find((e) => e.kind !== "video" && e.kind !== "audio");
		if (!e) throw Error("请先连接一张参考图");
		let r = await Zn(e.url);
		i({
			fitImage: !0,
			resolution: "custom",
			customWidth: r.width,
			customHeight: r.height,
			customSize: `${r.width}x${r.height}`
		});
	};
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, w.jsx)(Qn, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, w.jsx)($, {
							ariaLabel: "图片平台",
							onChange: (e) => {
								let t = Q()?.getNodeOptions("generator", "model", {
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
						}), /* @__PURE__ */ (0, w.jsx)($, {
							ariaLabel: "图片模型",
							onChange: (e) => i({ model: e }),
							options: o,
							value: String(n.model || "")
						})]
					}),
					/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, w.jsx)($, {
								ariaLabel: "分辨率",
								onChange: (e) => i({
									resolution: e,
									...e === "custom" ? { ratio: "" } : {}
								}),
								options: Wn,
								value: String(n.resolution || "1k")
							}),
							/* @__PURE__ */ (0, w.jsx)($, {
								ariaLabel: "比例",
								onChange: (e) => i({ ratio: e }),
								options: Un,
								value: String(n.ratio || "square")
							}),
							/* @__PURE__ */ (0, w.jsx)($, {
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
							/* @__PURE__ */ (0, w.jsx)("input", {
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
					n.ratio === "custom" ? /* @__PURE__ */ (0, w.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, w.jsx)("input", {
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
						}), /* @__PURE__ */ (0, w.jsx)("input", {
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
					n.resolution === "custom" ? /* @__PURE__ */ (0, w.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, w.jsx)("input", {
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
							/* @__PURE__ */ (0, w.jsx)("input", {
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
							/* @__PURE__ */ (0, w.jsx)("button", {
								className: "secondary-btn",
								onClick: () => void c().catch((e) => window.alert(e.message)),
								type: "button",
								children: "适配参考图"
							})
						]
					}) : null
				]
			}),
			/* @__PURE__ */ (0, w.jsx)(Jn, {
				document: t,
				node: n
			})
		]
	});
}
function er({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = (Q()?.getNodeOptions("msgen", "model", n) ?? []).map((e) => [e.value, e.label]), o = (Q()?.getNodeOptions("msgen", "custom-model", n) ?? []).map((e) => [e.value, e.label]), s = Q()?.getNodeOptions("msgen", "lora", n) ?? [], c = s.find((e) => e.value === n.msLoraId) ?? s[0], l = async () => {
		let e = Yn(t, n).find((e) => e.kind !== "video" && e.kind !== "audio");
		if (!e) throw Error("请先连接一张参考图");
		let r = await Zn(e.url);
		i({
			fitImage: !0,
			msResolution: "custom",
			msCustomWidth: r.width,
			msCustomHeight: r.height,
			msCustomSize: `${r.width}x${r.height}`
		});
	};
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, w.jsx)(Qn, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "ms-model-tabs",
				children: a.map(([e, t]) => /* @__PURE__ */ (0, w.jsx)("button", {
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
			n.msgenModel === "custom" ? /* @__PURE__ */ (0, w.jsx)($, {
				ariaLabel: "ModelScope 模型",
				onChange: (e) => i({
					msCustomModel: e,
					msLoraEnabled: !1,
					msLoraId: ""
				}),
				options: o,
				value: String(n.msCustomModel || o[0]?.[0] || "")
			}) : null,
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, w.jsx)($, {
								ariaLabel: "ModelScope 分辨率",
								onChange: (e) => i({
									msResolution: e,
									...e === "custom" ? { msRatio: "" } : {}
								}),
								options: Wn,
								value: String(n.msResolution || "1k")
							}),
							/* @__PURE__ */ (0, w.jsx)($, {
								ariaLabel: "ModelScope 比例",
								onChange: (e) => i({ msRatio: e }),
								options: Un.filter(([e]) => e !== "source"),
								value: String(n.msRatio || "square")
							}),
							/* @__PURE__ */ (0, w.jsx)("input", {
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
					n.msRatio === "custom" ? /* @__PURE__ */ (0, w.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, w.jsx)("input", {
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
						}), /* @__PURE__ */ (0, w.jsx)("input", {
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
					n.msResolution === "custom" ? /* @__PURE__ */ (0, w.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, w.jsx)("input", {
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
							/* @__PURE__ */ (0, w.jsx)("input", {
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
							/* @__PURE__ */ (0, w.jsx)("button", {
								className: "secondary-btn",
								onClick: () => void l().catch((e) => window.alert(e.message)),
								type: "button",
								children: "适配参考图"
							})
						]
					}) : null,
					s.length ? /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [/* @__PURE__ */ (0, w.jsx)("button", {
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
					}), n.msLoraEnabled ? /* @__PURE__ */ (0, w.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, w.jsx)($, {
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
						}), /* @__PURE__ */ (0, w.jsxs)("label", {
							className: "field",
							children: [/* @__PURE__ */ (0, w.jsxs)("span", {
								className: "setting-title",
								children: ["LoRA 强度 ", Number(n.msLoraStrength ?? .8).toFixed(2)]
							}), /* @__PURE__ */ (0, w.jsx)("input", {
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
					}) : null] }) : /* @__PURE__ */ (0, w.jsx)("div", {
						className: "text-[11px] text-gray-400",
						children: "当前模型没有绑定 LoRA"
					})
				]
			}),
			/* @__PURE__ */ (0, w.jsx)(Jn, {
				document: t,
				node: n
			})
		]
	});
}
function tr({ commit: e, node: t, store: n }) {
	let r = Array.isArray(t.images) ? t.images : [], i = Array.isArray(t._pending) ? t._pending : [], a = (e) => typeof e == "string" ? e : String(e?.url || ""), o = (i) => {
		n.getState().updateNode(t.id, { images: r.filter((e) => a(e) !== i) }), e();
	}, s = (e) => window.CanvasBoardV2?.openOutputLightbox(t, e), c = (r) => {
		let a = String(r.run?.node?.id || r.nodeId || "");
		n.getState().updateNode(t.id, { _pending: i.filter((e) => e !== r) }), e(), a && window.CanvasBoardV2?.runNode(a);
	};
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "output-grid",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [r.map((e, t) => {
			let n = a(e), r = String(e?.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(n) ? "video" : /\.(mp3|wav|m4a)(\?|$)/i.test(n) ? "audio" : "image")), i = String(e.name || n.split(/[?#]/, 1)[0].split("/").pop() || `生成结果 ${t + 1}`);
			return /* @__PURE__ */ (0, w.jsxs)("div", {
				className: "output-img-wrap",
				"data-output-url": n,
				children: [
					r === "video" ? /* @__PURE__ */ (0, w.jsx)("video", {
						controls: !0,
						onDoubleClick: () => s(n),
						preload: "metadata",
						src: n
					}) : r === "audio" ? /* @__PURE__ */ (0, w.jsx)("audio", {
						controls: !0,
						preload: "metadata",
						src: n
					}) : /* @__PURE__ */ (0, w.jsx)("img", {
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
					/* @__PURE__ */ (0, w.jsx)("button", {
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
					/* @__PURE__ */ (0, w.jsx)("a", {
						className: "output-download",
						download: !0,
						href: n,
						onClick: (e) => e.stopPropagation(),
						children: "↓"
					}),
					/* @__PURE__ */ (0, w.jsx)("button", {
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
			return /* @__PURE__ */ (0, w.jsxs)("div", {
				className: `output-pending ${r ? "failed" : ""}`,
				"data-pending-id": String(e.id || ""),
				children: [
					/* @__PURE__ */ (0, w.jsx)("span", { className: "pending-spinner" }),
					/* @__PURE__ */ (0, w.jsx)("span", { children: i }),
					e.canvasTaskId ? /* @__PURE__ */ (0, w.jsx)("small", { children: String(e.canvasTaskId) }) : null,
					r ? /* @__PURE__ */ (0, w.jsx)("button", {
						onClick: () => c(e),
						type: "button",
						children: "重新生成"
					}) : null
				]
			}, String(e.id || t));
		})]
	});
}
function nr({ commit: e, document: t, node: n, store: r }) {
	let [i, a] = (0, p.useState)(String(n.manualVideoUrl || (Array.isArray(n.manualVideoUrls) ? n.manualVideoUrls[0] : "") || "")), [o, s] = (0, p.useState)(!1), c = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, l = (Q()?.getNodeOptions("video", "provider", n) ?? []).map((e) => [e.value, e.label]), u = (Q()?.getNodeOptions("video", "model", n) ?? []).map((e) => [e.value, e.label]);
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "generator-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, w.jsx)(Qn, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "video-input-actions",
				children: [
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": "视频手动 URL",
						className: "setting-input",
						onChange: (e) => a(e.target.value),
						placeholder: "https://… 或 asset://…",
						value: i
					}),
					/* @__PURE__ */ (0, w.jsx)("button", {
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
					/* @__PURE__ */ (0, w.jsx)("button", {
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
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "gen-settings",
				children: [
					/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "gen-settings-row",
						children: [/* @__PURE__ */ (0, w.jsx)($, {
							ariaLabel: "视频平台",
							onChange: (e) => {
								let t = Q()?.getNodeOptions("video", "model", {
									...n,
									apiProvider: e
								}) ?? [];
								c({
									apiProvider: e,
									model: t[0]?.value || ""
								});
							},
							options: l,
							value: String(n.apiProvider || l[0]?.[0] || "")
						}), /* @__PURE__ */ (0, w.jsx)($, {
							ariaLabel: "视频模型",
							onChange: (e) => c({ model: e }),
							options: u,
							value: String(n.model || "")
						})]
					}),
					/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "gen-settings-row",
						children: [
							/* @__PURE__ */ (0, w.jsx)("input", {
								"aria-label": "视频时长",
								className: "setting-input",
								max: "60",
								min: "-1",
								onBlur: e,
								onChange: (e) => r.getState().updateNode(n.id, { duration: Math.max(-1, Math.min(60, Number(e.target.value) || 5)) }),
								type: "number",
								value: Number(n.duration ?? 5)
							}),
							/* @__PURE__ */ (0, w.jsx)($, {
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
							/* @__PURE__ */ (0, w.jsx)($, {
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
							/* @__PURE__ */ (0, w.jsx)($, {
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
					/* @__PURE__ */ (0, w.jsx)("div", {
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
						].map(([e, t]) => /* @__PURE__ */ (0, w.jsxs)("button", {
							className: `setting-check ${n[e] ? "active" : ""}`,
							onClick: () => c({
								[e]: !n[e],
								...e === "multimodal" && !n[e] ? { useFrameRoles: !1 } : e === "useFrameRoles" && !n[e] ? { multimodal: !1 } : {}
							}),
							type: "button",
							children: [/* @__PURE__ */ (0, w.jsx)("span", { className: "check-dot" }), t]
						}, e))
					})
				]
			}),
			/* @__PURE__ */ (0, w.jsx)(Jn, {
				document: t,
				node: n
			})
		]
	});
}
function rr({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = (Q()?.getNodeOptions("llm", "provider", n) ?? []).map((e) => [e.value, e.label]), o = (Q()?.getNodeOptions("llm", "model", n) ?? []).map((e) => [e.value, e.label]), s = Array.isArray(n.messages) ? n.messages : [];
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "llm-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "llm-row",
				children: [
					/* @__PURE__ */ (0, w.jsx)($, {
						ariaLabel: "LLM 平台",
						onChange: (e) => {
							let t = Q()?.getNodeOptions("llm", "model", {
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
					/* @__PURE__ */ (0, w.jsx)($, {
						ariaLabel: "LLM 模型",
						onChange: (e) => i({
							model: e,
							...n.llmProvider === "modelscope" ? { llmMsModel: e } : {}
						}),
						options: o,
						value: String(n.model || "")
					}),
					/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "llm-mode",
						children: [/* @__PURE__ */ (0, w.jsx)("button", {
							className: n.mode === "chat" ? "" : "active",
							onClick: () => i({ mode: "node" }),
							type: "button",
							children: "节点"
						}), /* @__PURE__ */ (0, w.jsx)("button", {
							className: n.mode === "chat" ? "active" : "",
							onClick: () => i({ mode: "chat" }),
							type: "button",
							children: "聊天"
						})]
					}),
					/* @__PURE__ */ (0, w.jsx)("button", {
						className: `llm-sys-toggle ${n.showSystem ? "active" : ""}`,
						onClick: () => i({ showSystem: !n.showSystem }),
						type: "button",
						children: "System"
					})
				]
			}),
			/* @__PURE__ */ (0, w.jsx)(Qn, {
				document: t,
				node: n
			}),
			n.showSystem ? /* @__PURE__ */ (0, w.jsx)("textarea", {
				"aria-label": "系统提示词",
				className: "llm-system",
				onBlur: e,
				onChange: (e) => r.getState().updateNode(n.id, { systemPrompt: e.target.value }),
				value: String(n.systemPrompt || "")
			}) : null,
			n.mode === "chat" ? /* @__PURE__ */ (0, w.jsxs)("div", {
				className: "llm-chat-pane",
				children: [
					/* @__PURE__ */ (0, w.jsx)("div", {
						className: "llm-chat-log",
						children: s.map((e, t) => /* @__PURE__ */ (0, w.jsxs)("div", {
							className: `llm-bubble ${e.role === "user" ? "user" : "assistant"}`,
							children: [e.content, e.role === "assistant" ? /* @__PURE__ */ (0, w.jsx)("button", {
								"aria-label": `复制消息 ${t + 1}`,
								className: "llm-bubble-copy",
								onClick: () => void navigator.clipboard.writeText(String(e.content || "")),
								type: "button",
								children: "复制"
							}) : null]
						}, t))
					}),
					/* @__PURE__ */ (0, w.jsx)("textarea", {
						"aria-label": "聊天输入",
						className: "llm-chat-input",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { chatInput: e.target.value }),
						onKeyDown: (e) => {
							e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), window.CanvasBoardV2?.runNode(n.id, "chat"));
						},
						value: String(n.chatInput || "")
					}),
					/* @__PURE__ */ (0, w.jsx)(Gn, {
						label: "发送",
						mode: "chat",
						node: n
					})
				]
			}) : /* @__PURE__ */ (0, w.jsxs)("div", {
				className: "llm-node-pane",
				children: [
					/* @__PURE__ */ (0, w.jsx)("div", {
						className: "llm-pane-label",
						children: "Input"
					}),
					/* @__PURE__ */ (0, w.jsx)("textarea", {
						"aria-label": "LLM 输入",
						className: "llm-input-area llm-input-output",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { userInput: e.target.value }),
						value: String(n.userInput || "")
					}),
					/* @__PURE__ */ (0, w.jsx)("div", {
						className: "llm-pane-label",
						children: "Output"
					}),
					/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "llm-output-wrap",
						children: [/* @__PURE__ */ (0, w.jsx)("button", {
							"aria-label": "复制 LLM 输出",
							className: "llm-copy-btn",
							onClick: () => navigator.clipboard.writeText(String(n.outputText || "")),
							type: "button",
							children: "复制"
						}), /* @__PURE__ */ (0, w.jsx)("div", {
							className: "llm-output",
							children: String(n.outputText || "暂无输出")
						})]
					}),
					/* @__PURE__ */ (0, w.jsx)(Jn, {
						document: t,
						node: n
					})
				]
			})
		]
	});
}
function ir(e) {
	return e.type === "image" || e.type === "video" || e.type === "audio" ? e.type : e.type === "textarea" || /prompt|text|提示词|正向|负向/i.test(`${e.input || ""} ${e.name || ""}`) ? "prompt" : "setting";
}
function ar({ commit: e, document: t, node: n, store: r }) {
	let [i, a] = (0, p.useState)([]), o = String(n.comfyWorkflow || "");
	(0, p.useEffect)(() => {
		let e = !0;
		if (n.mode !== "custom" || !o) {
			a([]);
			return;
		}
		return (Q()?.getComfyFields(o) ?? Promise.resolve([])).then((t) => {
			e && a(t);
		}), () => {
			e = !1;
		};
	}, [n.mode, o]);
	let s = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, c = n.comfyParams && typeof n.comfyParams == "object" ? n.comfyParams : {}, l = n.comfyRandomActive && typeof n.comfyRandomActive == "object" ? n.comfyRandomActive : {}, u = i.filter((e) => ir(e) === "setting"), d = i.filter((e) => [
		"audio",
		"image",
		"video"
	].includes(ir(e))), f = (Q()?.getNodeOptions("comfy", "workflow", n) ?? []).map((e) => [e.value, e.label]), m = (t, i, a = !0) => {
		r.getState().updateNode(n.id, { comfyParams: {
			...c,
			[String(t.id)]: i
		} }), a && e();
	};
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "comfy-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "mode-tabs",
				children: [
					["text", "文生图"],
					["enhance", "增强"],
					["edit", "编辑"],
					["custom", "工作流"]
				].map(([e, t]) => /* @__PURE__ */ (0, w.jsx)("button", {
					className: n.mode === e ? "active" : "",
					onClick: () => s({ mode: e }),
					type: "button",
					children: t
				}, e))
			}),
			/* @__PURE__ */ (0, w.jsx)(Qn, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "gen-settings comfy-settings",
				children: n.mode === "text" ? /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "gen-settings-row",
					children: [/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": "Comfy 宽度",
						className: "setting-input",
						min: "64",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { width: Number(e.target.value) || 1024 }),
						step: "64",
						type: "number",
						value: Number(n.width || 1024)
					}), /* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": "Comfy 高度",
						className: "setting-input",
						min: "64",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { height: Number(e.target.value) || 1024 }),
						step: "64",
						type: "number",
						value: Number(n.height || 1024)
					})]
				}) : n.mode === "enhance" ? /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [/* @__PURE__ */ (0, w.jsx)("input", {
					"aria-label": "增强强度",
					className: "canvas-range",
					max: "1",
					min: "0.1",
					onChange: (e) => r.getState().updateNode(n.id, { enhanceStrength: Number(e.target.value) }),
					onPointerUp: e,
					step: "0.05",
					type: "range",
					value: Number(n.enhanceStrength ?? .5)
				}), /* @__PURE__ */ (0, w.jsx)("button", {
					className: `setting-check ${n.enhanceUpscale ? "active" : ""}`,
					onClick: () => s({ enhanceUpscale: !n.enhanceUpscale }),
					type: "button",
					children: "超分辨率"
				})] }) : n.mode === "edit" ? /* @__PURE__ */ (0, w.jsx)("button", {
					className: `setting-check ${n.editUpscale ? "active" : ""}`,
					onClick: () => s({ editUpscale: !n.editUpscale }),
					type: "button",
					children: "超分辨率"
				}) : /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [
					/* @__PURE__ */ (0, w.jsx)($, {
						ariaLabel: "Comfy 工作流",
						onChange: (e) => s({
							comfyWorkflow: e,
							comfyParams: {},
							comfyRandomActive: {}
						}),
						options: f,
						value: o
					}),
					/* @__PURE__ */ (0, w.jsxs)("div", {
						className: "text-[10px] text-gray-400",
						children: [
							"动态媒体字段 ",
							d.length,
							" · 参数字段 ",
							u.length
						]
					}),
					u.map((t) => {
						let n = String(t.id || ""), r = c[n] ?? t.default ?? "";
						if (t.type === "boolean") return /* @__PURE__ */ (0, w.jsx)("button", {
							className: `setting-check ${r ? "active" : ""}`,
							onClick: () => m(t, !r),
							type: "button",
							children: t.name || n
						}, n);
						if (t.type === "dropdown") return /* @__PURE__ */ (0, w.jsx)($, {
							ariaLabel: t.name || n,
							onChange: (e) => m(t, e),
							options: (t.options || []).map((e) => [e, e]),
							value: String(r)
						}, n);
						if (t.type === "textarea") return /* @__PURE__ */ (0, w.jsx)("textarea", {
							"aria-label": t.name || n,
							className: "setting-input",
							onBlur: e,
							onChange: (e) => m(t, e.target.value, !1),
							value: String(r)
						}, n);
						let i = /* @__PURE__ */ (0, w.jsx)("input", {
							"aria-label": t.name || n,
							className: "setting-input",
							max: t.max,
							min: t.min,
							onBlur: e,
							onChange: (e) => m(t, t.type === "number" || t.type === "slider" ? Number(e.target.value) : e.target.value, !1),
							step: t.step,
							type: t.type === "number" || t.type === "slider" ? "number" : "text",
							value: String(r)
						});
						return t.type === "number" && t.random_enabled ? /* @__PURE__ */ (0, w.jsxs)("div", {
							className: "comfy-random-field",
							children: [i, /* @__PURE__ */ (0, w.jsx)("button", {
								"aria-label": `${t.name || n} 随机`,
								className: `tool-btn comfy-random-btn ${l[n] === !1 ? "" : "active"}`,
								onClick: () => s({ comfyRandomActive: {
									...l,
									[n]: l[n] === !1
								} }),
								type: "button",
								children: "随机"
							})]
						}, n) : /* @__PURE__ */ (0, w.jsx)("div", { children: i }, n);
					})
				] })
			}),
			/* @__PURE__ */ (0, w.jsx)(Jn, {
				document: t,
				node: n
			})
		]
	});
}
function or({ canvasRuntime: e, commit: t, node: n, onEdit: r, store: i }) {
	let a = (0, p.useRef)(null);
	(0, p.useEffect)(() => () => {
		a.current?.pause(), a.current?.removeAttribute("src"), a.current?.load();
	}, []);
	let o = async (r) => {
		if (!r.length) return;
		let a = (await e.uploadMedia(r)).files ?? [];
		if (!a.length) return;
		i.getState().updateNode(n.id, {
			url: a[0].url || "",
			name: a[0].name || "media",
			mediaKind: a[0].kind || "image"
		});
		let o = [n.id];
		a.slice(1).forEach((e, t) => {
			let r = i.getState().addNode("image", {
				x: Number(n.x || 0) + (t + 1) * 36,
				y: Number(n.y || 0) + (t + 1) * 36
			});
			r && (i.getState().updateNode(r, {
				url: e.url || "",
				name: e.name || "media",
				mediaKind: e.kind || "image"
			}), o.push(r));
		}), o.length > 1 && i.getState().groupNodes(o), t();
	}, s = String(n.url || ""), c = Array.isArray(n.imageEditHistory) ? n.imageEditHistory : [], l = String(n.mediaKind || (/\.(mp4|webm|mov)(\?|$)/i.test(s) ? "video" : /\.(mp3|wav|m4a)(\?|$)/i.test(s) ? "audio" : "image"));
	return s ? /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "image-preview-wrap",
		onClick: (e) => e.stopPropagation(),
		onDoubleClick: () => window.open(s, "_blank", "noopener"),
		onDragOver: (e) => e.preventDefault(),
		onDrop: (e) => {
			e.preventDefault(), o([...e.dataTransfer.files]);
		},
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			l === "video" ? /* @__PURE__ */ (0, w.jsx)("video", {
				controls: !0,
				preload: "metadata",
				ref: (e) => {
					a.current = e;
				},
				src: s
			}) : l === "audio" ? /* @__PURE__ */ (0, w.jsx)("audio", {
				controls: !0,
				preload: "metadata",
				ref: (e) => {
					a.current = e;
				},
				src: s
			}) : /* @__PURE__ */ (0, w.jsx)("img", {
				alt: String(n.name || "image"),
				draggable: !0,
				src: s
			}),
			/* @__PURE__ */ (0, w.jsx)("div", {
				className: "image-caption text-[11px] text-gray-400 truncate",
				children: String(n.name || l)
			}),
			l === "image" ? /* @__PURE__ */ (0, w.jsxs)("div", {
				className: "image-edit-actions",
				children: [
					/* @__PURE__ */ (0, w.jsx)("button", {
						className: "tool-btn",
						onClick: r,
						type: "button",
						children: "编辑图片"
					}),
					c.length ? /* @__PURE__ */ (0, w.jsx)("button", {
						className: "tool-btn",
						onClick: () => {
							let e = c[c.length - 1];
							i.getState().updateNode(n.id, {
								imageEditHistory: c.slice(0, -1),
								mediaKind: e.kind || "image",
								name: e.name || "image",
								url: e.url || "",
								...e.outpaintSize ? { outpaintSize: e.outpaintSize } : { outpaintSize: void 0 }
							}), t();
						},
						type: "button",
						children: "恢复上版"
					}) : null,
					n.editOriginalUrl ? /* @__PURE__ */ (0, w.jsx)("a", {
						href: String(n.editOriginalUrl),
						rel: "noreferrer",
						target: "_blank",
						children: "查看原图"
					}) : null
				]
			}) : null,
			/* @__PURE__ */ (0, w.jsx)("button", {
				"aria-label": "清空媒体",
				className: "output-del",
				onClick: () => {
					i.getState().updateNode(n.id, {
						url: "",
						name: "空白图片",
						mediaKind: "image"
					}), t();
				},
				type: "button",
				children: "×"
			})
		]
	}) : /* @__PURE__ */ (0, w.jsxs)("label", {
		className: "blank-image",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: ["选择或拖入媒体", /* @__PURE__ */ (0, w.jsx)("input", {
			accept: "image/*,video/*,audio/*",
			hidden: !0,
			multiple: !0,
			onChange: (e) => void o([...e.target.files ?? []]),
			type: "file"
		})]
	});
}
function sr({ node: e, nodesById: t }) {
	let n = Array.isArray(e.items) ? e.items.map((e) => t.get(String(e))).filter(Boolean) : [], r = n.filter((e) => e.type === "image" && e.url);
	return /* @__PURE__ */ (0, w.jsxs)("div", { children: [/* @__PURE__ */ (0, w.jsxs)("div", {
		className: "text-[11px] text-gray-400",
		children: [
			r.length,
			" 个媒体 · ",
			n.filter((e) => e.type === "prompt").length,
			" 个提示词"
		]
	}), r.length ? /* @__PURE__ */ (0, w.jsx)("div", {
		className: "output-grid",
		children: r.slice(0, 6).map((e) => /* @__PURE__ */ (0, w.jsx)("img", {
			alt: String(e.name || "media"),
			onDoubleClick: () => window.open(String(e.url), "_blank", "noopener"),
			src: String(e.url)
		}, e.id))
	}) : null] });
}
function cr({ commit: e, document: t, node: n, store: r }) {
	let i = (t) => {
		r.getState().updateNode(n.id, t), e();
	}, a = Q()?.normalizeLtxNode(n) ?? n;
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "ltx-director-body",
		onClick: (e) => e.stopPropagation(),
		onPointerDown: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, w.jsx)(Qn, {
				document: t,
				node: n
			}),
			/* @__PURE__ */ (0, w.jsx)("textarea", {
				"aria-label": "LTX 全局提示词",
				className: "setting-input",
				onBlur: e,
				onChange: (e) => r.getState().updateNode(n.id, { globalPrompt: e.target.value }),
				placeholder: "全局提示词",
				value: String(n.globalPrompt || "")
			}),
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "ltx-params-row",
				children: [
					/* @__PURE__ */ (0, w.jsx)("input", {
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
					/* @__PURE__ */ (0, w.jsx)("input", {
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
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": "LTX FPS",
						className: "setting-input",
						min: "1",
						onChange: (e) => i({ frameRate: Math.max(1, Number(e.target.value) || 24) }),
						type: "number",
						value: Number(n.frameRate || 24)
					}),
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": "LTX 宽度",
						className: "setting-input",
						min: "0",
						onChange: (e) => i({ customWidth: Math.max(0, Number(e.target.value) || 0) }),
						step: "32",
						type: "number",
						value: Number(n.customWidth || 0)
					}),
					/* @__PURE__ */ (0, w.jsx)("input", {
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
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "ltx-params-row",
				children: [
					/* @__PURE__ */ (0, w.jsx)($, {
						ariaLabel: "LTX 时间显示",
						onChange: (e) => i({ displayMode: e }),
						options: [["seconds", "秒"], ["frames", "帧"]],
						value: String(n.displayMode || "seconds")
					}),
					/* @__PURE__ */ (0, w.jsx)("button", {
						className: `setting-check ${n.useCustomAudio ? "active" : ""}`,
						onClick: () => i({ useCustomAudio: !n.useCustomAudio }),
						type: "button",
						children: "自定义音频"
					}),
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": "LTX 图片压缩",
						className: "setting-input",
						max: "100",
						min: "0",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { imgCompression: Number(e.target.value) }),
						type: "number",
						value: Number(n.imgCompression ?? 18)
					}),
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": "LTX Epsilon",
						className: "setting-input",
						min: "0",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { epsilon: Number(e.target.value) }),
						step: "0.0001",
						type: "number",
						value: Number(n.epsilon ?? .001)
					}),
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": "LTX Divisible By",
						className: "setting-input",
						min: "1",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { divisibleBy: Math.max(1, Number(e.target.value) || 32) }),
						type: "number",
						value: Number(n.divisibleBy || 32)
					}),
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": "LTX Noise Seed",
						className: "setting-input",
						onBlur: e,
						onChange: (e) => r.getState().updateNode(n.id, { noiseSeed: Number(e.target.value) }),
						type: "number",
						value: Number(n.noiseSeed ?? 12)
					})
				]
			}),
			/* @__PURE__ */ (0, w.jsx)(lr, {
				commit: e,
				node: a,
				store: r
			}),
			/* @__PURE__ */ (0, w.jsx)(Jn, {
				document: t,
				node: n
			})
		]
	});
}
function lr({ commit: e, node: t, store: n }) {
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
		let n = (await Q()?.uploadMedia([e]))?.files?.[0];
		n?.url && t(n);
	};
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		className: "ltx-director-timeline-host canvas-modern-timeline",
		"data-testid": "ltx-timeline-editor",
		children: [
			/* @__PURE__ */ (0, w.jsxs)("header", { children: [/* @__PURE__ */ (0, w.jsx)("strong", { children: "时间线" }), /* @__PURE__ */ (0, w.jsx)("button", {
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
			r.segments.map((e, t) => /* @__PURE__ */ (0, w.jsxs)("div", {
				className: "canvas-modern-segment",
				children: [
					/* @__PURE__ */ (0, w.jsxs)("select", {
						"aria-label": `片段 ${t + 1} 类型`,
						onChange: (e) => a(t, { type: e.target.value }),
						value: e.type || "text",
						children: [/* @__PURE__ */ (0, w.jsx)("option", {
							value: "text",
							children: "文本"
						}), /* @__PURE__ */ (0, w.jsx)("option", {
							value: "image",
							children: "图片"
						})]
					}),
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": `片段 ${t + 1} 起始帧`,
						min: "0",
						onChange: (e) => a(t, { start: Math.max(0, Number(e.target.value) || 0) }),
						type: "number",
						value: Number(e.start || 0)
					}),
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": `片段 ${t + 1} 长度`,
						min: "1",
						onChange: (e) => a(t, { length: Math.max(1, Number(e.target.value) || 1) }),
						type: "number",
						value: Number(e.length || 1)
					}),
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": `片段 ${t + 1} 提示词`,
						onChange: (e) => a(t, { prompt: e.target.value }),
						placeholder: "片段提示词",
						value: e.prompt || ""
					}),
					e.type === "image" ? /* @__PURE__ */ (0, w.jsxs)(w.Fragment, { children: [
						/* @__PURE__ */ (0, w.jsx)("input", {
							"aria-label": `片段 ${t + 1} 图片`,
							onChange: (e) => a(t, {
								imageB64: e.target.value,
								imageFile: ""
							}),
							placeholder: "图片 URL",
							value: e.imageB64 || e.imageFile || ""
						}),
						/* @__PURE__ */ (0, w.jsxs)("label", {
							className: "tool-btn",
							children: ["上传", /* @__PURE__ */ (0, w.jsx)("input", {
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
						/* @__PURE__ */ (0, w.jsx)("input", {
							"aria-label": `片段 ${t + 1} 引导强度`,
							max: "2",
							min: "0",
							onChange: (e) => a(t, { guideStrength: Number(e.target.value) }),
							step: "0.05",
							type: "number",
							value: Number(e.guideStrength ?? 1)
						})
					] }) : null,
					/* @__PURE__ */ (0, w.jsx)("button", {
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
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: "canvas-modern-audio-row",
				children: [/* @__PURE__ */ (0, w.jsxs)("span", { children: ["音频片段 ", r.audioSegments.length] }), /* @__PURE__ */ (0, w.jsx)("button", {
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
			r.audioSegments.map((e, t) => /* @__PURE__ */ (0, w.jsxs)("div", {
				className: "canvas-modern-segment canvas-modern-audio-segment",
				children: [
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": `音频 ${t + 1} 起始帧`,
						min: "0",
						onChange: (e) => o(t, { start: Math.max(0, Number(e.target.value) || 0) }),
						type: "number",
						value: Number(e.start || 0)
					}),
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": `音频 ${t + 1} 长度`,
						min: "1",
						onChange: (e) => o(t, { length: Math.max(1, Number(e.target.value) || 1) }),
						type: "number",
						value: Number(e.length || 1)
					}),
					/* @__PURE__ */ (0, w.jsx)("input", {
						"aria-label": `音频 ${t + 1} URL`,
						onChange: (e) => o(t, { url: e.target.value }),
						placeholder: "音频 URL",
						value: e.url || ""
					}),
					/* @__PURE__ */ (0, w.jsxs)("label", {
						className: "tool-btn",
						children: ["上传", /* @__PURE__ */ (0, w.jsx)("input", {
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
					/* @__PURE__ */ (0, w.jsx)("button", {
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
function ur({ canvasRuntime: e, commit: n, initialReadOnly: r = !1, legacyUi: i = !1, onSelectionChange: a, smartUi: o = !1, store: s }) {
	let l = t(s, ({ document: e }) => e), u = String(l?.id || ""), d = (0, p.useRef)(null), f = (0, p.useRef)(null), m = (0, p.useRef)(0), h = (0, p.useRef)(null), g = (0, p.useRef)(0), _ = (0, p.useRef)(!1), v = (0, p.useRef)(/* @__PURE__ */ new Set()), [y, b] = (0, p.useState)(""), [x, S] = (0, p.useState)(null), [C, E] = (0, p.useState)(-1), [D, k] = (0, p.useState)(/* @__PURE__ */ new Set()), [A, j] = (0, p.useState)("ready"), [M, N] = (0, p.useState)(null), [P, F] = (0, p.useState)(null), [ee, te] = (0, p.useState)(""), [I, ne] = (0, p.useState)(r), [L, re] = (0, p.useState)(() => i ? An(u) : {
		x: 0,
		y: 0,
		zoom: 1
	}), [R, ie] = (0, p.useState)(null), [z, B] = (0, p.useState)({
		height: 0,
		width: 0
	}), [V, ae] = (0, p.useState)(null), [oe, se] = (0, p.useState)(null), [ce, le] = (0, p.useState)(!1), [H, ue] = (0, p.useState)(""), [W, de] = (0, p.useState)(null);
	v.current = D;
	let G = new Map((l?.nodes ?? []).map((e) => [e.id, e])), K = {
		connections: l?.connections ?? [],
		nodes: l?.nodes ?? []
	}, fe = l ? c(l) : null;
	(0, p.useEffect)(() => {
		b(""), S(null), E(-1), k(/* @__PURE__ */ new Set()), ae(null), ue(""), de(null), ie(null), re(i ? An(u) : {
			x: 0,
			y: 0,
			zoom: 1
		});
	}, [u, i]), (0, p.useEffect)(() => {
		let e = d.current;
		if (!e) return;
		let t = () => B({
			height: e.clientHeight,
			width: e.clientWidth
		});
		t();
		let n = new ResizeObserver(t);
		return n.observe(e), () => n.disconnect();
	}, []);
	let pe = (e, t) => {
		if (!R) return !1;
		let n = R.viewport, r = n;
		if (t) {
			let e = Nn(t), i = {
				x: Number(t.x || 0) + e.width / 2,
				y: Number(t.y || 0) + e.height / 2
			}, a = Math.min(1.15, (z.width - 160) / Math.max(1, e.width), (z.height - 160) / Math.max(1, e.height)), o = Math.max(n.zoom, Math.min(1.15, Math.max(.72, a)));
			r = {
				x: z.width / 2 - i.x * o,
				y: z.height / 2 - i.y * o,
				zoom: o
			};
		} else e && (r = {
			x: z.width / 2 - e.x * n.zoom,
			y: z.height / 2 - e.y * n.zoom,
			zoom: n.zoom
		});
		return ie(null), re(r), jn(u, r), !0;
	}, me = () => {
		if (!o) return;
		if (R) {
			pe();
			return;
		}
		let e = s.getState().document?.nodes ?? [];
		if (!e.length || !z.width || !z.height) return;
		let t = e.map((e) => ({
			...kn(e),
			...Nn(e)
		})), n = Math.min(...t.map((e) => e.x)), r = Math.min(...t.map((e) => e.y)), i = Math.max(...t.map((e) => e.x + e.width)), a = Math.max(...t.map((e) => e.y + e.height)), c = Math.max(1, i - n + 320), l = Math.max(1, a - r + 320), d = Math.max(.06, Math.min(.82, (z.width - 80) / c, (z.height - 80) / l)), f = {
			x: z.width / 2 - (n + i) / 2 * d,
			y: z.height / 2 - (r + a) / 2 * d,
			zoom: d
		};
		ae(null), ie({ viewport: L }), re(f), jn(u, f);
	};
	(0, p.useEffect)(() => {
		let e = d.current?.closest(".shell");
		return e?.classList.toggle("zoom-preview", !!R), () => e?.classList.remove("zoom-preview");
	}, [R]), (0, p.useEffect)(() => {
		let e = (e) => {
			e.key.toLowerCase() === "r" && !rn(e.target) && (_.current = !0);
		}, t = (e) => {
			e.key.toLowerCase() === "r" && (_.current = !1);
		}, n = () => {
			_.current = !1;
		};
		return window.addEventListener("keydown", e), window.addEventListener("keyup", t), window.addEventListener("blur", n), () => {
			window.removeEventListener("keydown", e), window.removeEventListener("keyup", t), window.removeEventListener("blur", n);
		};
	}, []), (0, p.useEffect)(() => {
		let e = (e) => ne(!!e.detail);
		return window.addEventListener("canvas-board-v2-readonly", e), () => window.removeEventListener("canvas-board-v2-readonly", e);
	}, []), (0, p.useEffect)(() => {
		I && te("");
	}, [I]), (0, p.useEffect)(() => {
		let e = (e) => {
			let t = rn(e.target), r = String(e.key || "").toLowerCase();
			if (e.key === "Escape") {
				b(""), S(null), E(-1), ae(null), se(null);
				return;
			}
			if (!t) {
				if (o && !e.ctrlKey && !e.metaKey && !e.altKey && r === "z") {
					if (e.repeat) return;
					e.preventDefault(), me();
					return;
				}
				if (!I) {
					if ((e.ctrlKey || e.metaKey) && r === "z") {
						e.preventDefault(), !o && e.shiftKey ? window.CanvasBoardV2?.redo() : window.CanvasBoardV2?.undo();
						return;
					}
					if (!o && (e.ctrlKey || e.metaKey) && r === "y") {
						e.preventDefault(), window.CanvasBoardV2?.redo();
						return;
					}
					if ((e.ctrlKey || e.metaKey) && r === "c") {
						if (window.getSelection?.()?.toString()) return;
						e.preventDefault();
						let t = s.getState().copyNodes([...v.current]);
						f.current = t, t.nodes.length && window.dispatchEvent(new CustomEvent("canvas-board-v2-shortcut-status", { detail: `已复制 ${t.nodes.length} 个节点` }));
						return;
					}
					if ((e.ctrlKey || e.metaKey) && r === "v" && f.current) {
						let e = Date.now();
						window.setTimeout(() => {
							if (m.current >= e || g.current >= e || !f.current) return;
							let t = s.getState().pasteNodes(f.current);
							t.length && (g.current = Date.now(), k(new Set(t)), n(), window.dispatchEvent(new CustomEvent("canvas-board-v2-shortcut-status", { detail: `已粘贴 ${t.length} 个节点` })));
						}, 90);
						return;
					}
					if ((e.ctrlKey || e.metaKey) && r === "g") {
						e.preventDefault();
						let t = s.getState().document;
						if (o && t) {
							if (e.shiftKey) {
								let e = t, r = [];
								[...v.current].forEach((t) => {
									let n = Rn(e, t);
									n && (e = n.document, r.push(...n.ids));
								}), r.length && (s.getState().projectDocument(e), k(new Set(r)), n());
							} else {
								let e = Ln(t, [...v.current]);
								e && (s.getState().projectDocument(e.document), k(/* @__PURE__ */ new Set([e.id])), n());
							}
						} else if (!e.shiftKey) {
							let e = (t?.nodes.filter((e) => v.current.has(e.id)) ?? []).some((e) => e.type === "image") ? s.getState().groupNodes([...v.current]) : s.getState().groupPromptNodes([...v.current]);
							e && (k(/* @__PURE__ */ new Set([e])), n());
						}
						return;
					}
					if (e.key === "Delete" || e.key === "Backspace") {
						if (v.current.size) v.current.forEach((e) => s.getState().deleteNode(e));
						else if (C >= 0) s.getState().deleteConnection(C);
						else return;
						e.preventDefault(), k(/* @__PURE__ */ new Set()), E(-1), n();
					}
				}
			}
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [
		z,
		n,
		I,
		C,
		D,
		o,
		s,
		L,
		R
	]), (0, p.useEffect)(() => {
		let e = () => {
			if (I) return;
			let e = s.getState().document;
			if (o && e) {
				let t = Ln(e, [...D]);
				t && (s.getState().projectDocument(t.document), k(/* @__PURE__ */ new Set([t.id])), n());
			} else {
				let t = (e?.nodes.filter((e) => D.has(e.id)) ?? []).some((e) => e.type === "image") ? s.getState().groupNodes([...D]) : s.getState().groupPromptNodes([...D]);
				t && (k(/* @__PURE__ */ new Set([t])), n());
			}
		};
		return window.addEventListener("canvas-board-v2-group-selected", e), () => window.removeEventListener("canvas-board-v2-group-selected", e);
	}, [
		n,
		I,
		D,
		o,
		s
	]), (0, p.useEffect)(() => {
		let e = (e) => j(String(e.detail || "ready"));
		return window.addEventListener("canvas-board-v2-save-state", e), () => window.removeEventListener("canvas-board-v2-save-state", e);
	}, []), (0, p.useEffect)(() => {
		let e = (e) => N(e.detail);
		return window.addEventListener("canvas-v2-open-lightbox", e), () => window.removeEventListener("canvas-v2-open-lightbox", e);
	}, []);
	let he = (e) => {
		let t = s.getState().document;
		y && x?.fromPort !== "in" && t && c(t).canConnect(y, e) && s.getState().connectNodes(y, e) && n(), b(""), S(null);
	}, ge = (e, t = "out") => {
		if (I) return;
		let n = s.getState().document?.nodes.find((t) => t.id === e);
		if (!n) return;
		let r = kn(n), i = Nn(n);
		b(e), S({
			currentWorld: {
				x: t === "out" ? r.x + i.width : r.x,
				y: r.y + i.height / 2
			},
			fromId: e,
			fromPort: t
		});
	};
	(0, p.useEffect)(() => {
		if (!y || I || !o) return;
		let e = d.current;
		if (!e) return;
		let t = e.closest(".shell");
		t?.classList.add("port-dragging");
		let r = !1, i = () => {
			e.querySelectorAll(".node-port.is-active").forEach((e) => e.classList.remove("is-active")), e.querySelectorAll(".image-node.port-hover").forEach((e) => e.classList.remove("port-hover"));
		}, a = (e, t) => {
			let n = window.document.elementFromPoint(e, t), r = n?.closest(".node-port, [data-port]") || null;
			r ||= [...window.document.querySelectorAll("#smartCanvasApp .node-port[data-port]")].map((n) => {
				let r = n.getBoundingClientRect();
				return {
					distance: Math.hypot(e - (r.left + r.width / 2), t - (r.top + r.height / 2)),
					element: n
				};
			}).filter((e) => e.distance <= 22).sort((e, t) => e.distance - t.distance)[0]?.element || null;
			let i = (r?.closest(".image-node, [data-node-id]") || n?.closest(".image-node, [data-node-id]")) ?? null, a = String(i?.dataset.id || i?.dataset.nodeId || ""), o = String(r?.dataset.port || "");
			if (!o && i) {
				let t = i.getBoundingClientRect();
				o = e - t.left < t.width / 2 ? "in" : "out";
			}
			if (!a || a === y || o !== "in" && o !== "out") return {
				hit: n,
				id: "",
				port: "",
				valid: !1
			};
			let l = x?.fromPort || "out", u = l === "out" && o === "in" || l === "in" && o === "out", d = l === "out" ? y : a, f = l === "out" ? a : y, p = s.getState().document;
			return {
				hit: n,
				id: a,
				port: o,
				valid: !!(u && p && c(p).canConnect(d, f))
			};
		}, l = (t) => {
			r = !0;
			let n = e.getBoundingClientRect(), o = {
				x: (t.clientX - n.left - L.x) / L.zoom,
				y: (t.clientY - n.top - L.y) / L.zoom
			}, s = a(t.clientX, t.clientY);
			if (i(), s.valid) {
				let t = e.querySelector(`.image-node[data-id="${CSS.escape(s.id)}"], [data-node-id="${CSS.escape(s.id)}"]`);
				t?.classList.add("port-hover"), t?.querySelector(`[data-port="${s.port}"]`)?.classList.add("is-active");
			}
			S((e) => e && {
				...e,
				currentWorld: o,
				hoverPort: s.valid ? s.port : "",
				hoverTargetId: s.valid ? s.id : ""
			});
		}, u = (t) => {
			let o = x, c = a(t.clientX, t.clientY);
			if (c.valid && o) {
				let e = o.fromPort === "out" ? o.fromId : c.id, t = o.fromPort === "out" ? c.id : o.fromId;
				s.getState().connectNodes(e, t) && n();
			} else if (r && o && !c.id && !c.hit?.closest(".composer,.smart-nav,.asset-panel,.create-menu,.smart-minimap,.log-modal,.shortcut-modal,.image-edit-modal")) {
				let r = e.getBoundingClientRect(), i = {
					x: (t.clientX - r.left - L.x) / L.zoom,
					y: (t.clientY - r.top - L.y) / L.zoom
				}, a = s.getState().addNode("smart-image", {
					x: i.x - 158,
					y: i.y - 97
				});
				if (a) {
					let e = o.fromPort === "out" ? o.fromId : a, t = o.fromPort === "out" ? a : o.fromId;
					s.getState().connectNodes(e, t) && n();
				}
			}
			b(""), S(null), i();
		};
		return window.addEventListener("pointermove", l), window.addEventListener("pointerup", u, { once: !0 }), () => {
			window.removeEventListener("pointermove", l), window.removeEventListener("pointerup", u), t?.classList.remove("port-dragging"), i();
		};
	}, [
		n,
		y,
		x?.fromPort,
		I,
		o,
		s,
		L
	]);
	let q = M ? G.get(M.nodeId) : null, _e = P ? G.get(P.nodeId) : null, J = ee ? G.get(ee) : null;
	(0, p.useEffect)(() => {
		a?.(D);
	}, [a, D]), (0, p.useEffect)(() => {
		!i && !o || !V || window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		V,
		i,
		o
	]);
	let ve = (e, t) => {
		let n = d.current?.querySelector(".minimap-content")?.getBoundingClientRect();
		if (!n || !z.width || !z.height) return;
		let r = {
			x: Math.min(wn, Math.max(0, (e - n.left) / n.width * wn)),
			y: Math.min(Tn, Math.max(0, (t - n.top) / n.height * Tn))
		};
		re((e) => {
			let t = {
				...e,
				x: z.width / 2 - r.x * e.zoom,
				y: z.height / 2 - r.y * e.zoom
			};
			return jn(u, t), t;
		});
	}, ye = (e) => {
		re((t) => {
			let n = {
				...t,
				x: z.width / 2 - e.x * t.zoom,
				y: z.height / 2 - e.y * t.zoom
			};
			return jn(u, n), n;
		});
	}, be = (e) => {
		if (!V || I) return;
		let t = "";
		if (e === "image") t = s.getState().addNode("smart-image", {
			x: V.point.x - 158,
			y: V.point.y - 97
		}) || "";
		else {
			let n = e === "prompt" ? {
				x: 158,
				y: 97
			} : {
				x: 135,
				y: 95
			};
			t = s.getState().addNode(e, {
				x: V.point.x - n.x,
				y: V.point.y - n.y
			}) || "";
		}
		t && (k(/* @__PURE__ */ new Set([t])), n()), ae(null);
	}, Y = o && D.size === 1 ? l?.nodes.find((e) => D.has(e.id) && ["output", "smart-image"].includes(e.type)) ?? null : null, xe = (e, t = s.getState().document) => {
		if (!e || !t) return null;
		let n = t.connections.filter((t) => t.to === e.id).map((e) => e.from);
		return t.nodes.find((e) => n.includes(e.id) && [
			"comfy",
			"generator",
			"msgen",
			"video"
		].includes(e.type)) ?? null;
	}, Se = Y?.type === "smart-image" ? zn(Y) : xe(Y, l), Ce = (e, t = "generator") => {
		if (!Y || I) return "";
		if (Y.type === "smart-image") {
			let r = Y.runSettings && typeof Y.runSettings == "object" ? Y.runSettings : {}, i = t === "msgen" ? "modelscope" : t === "comfy" ? "comfy" : "api";
			return s.getState().updateNode(Y.id, { runSettings: {
				...r,
				...e,
				engine: i,
				apiKind: t === "video" ? "video" : "image"
			} }), n(), Y.id;
		}
		let r = s.getState().document;
		if (!r) return "";
		let i = xe(Y, r);
		if (!i) {
			let e = s.getState().addNode(t, {
				x: Number(Y.x || 0) - 420,
				y: Number(Y.y || 0)
			});
			if (!e) return "";
			s.getState().connectNodes(e, Y.id), r = s.getState().document, i = r?.nodes.find((t) => t.id === e) ?? null;
		}
		return i ? (i.type !== t && r && s.getState().projectDocument({
			...r,
			nodes: r.nodes.map((e) => e.id === i.id ? {
				...e,
				type: t
			} : e)
		}), s.getState().updateNode(i.id, e), n(), i.id) : "";
	}, we = (e, t = !1) => {
		!Y || I || (s.getState().updateNode(Y.id, e), t && n());
	}, Te = (e) => {
		let t = Y?.type === "smart-image" ? Y.id : Se?.id || Ce({});
		t && window.CanvasBoardV2?.runNode(t, e);
	}, Ee = async (t, r) => {
		if (I || !r.length) return;
		let i = await e.uploadMedia(r), a = s.getState().document?.nodes.find((e) => e.id === t && e.type === "smart-image");
		if (!a) return;
		let o = (i.files ?? []).filter((e) => e.url).map((e) => ({
			...e,
			kind: e.kind || "image",
			name: e.name || "media",
			url: e.url || ""
		}));
		if (!o.length) return;
		let c = [...tt(a), ...o];
		s.getState().updateNode(t, {
			h: void 0,
			images: c,
			scale: c.length > 1 ? .8 : Number(a.scale || 2),
			title: c.length > 1 ? "Group" : o[0].kind === "video" ? "Video" : o[0].kind === "audio" ? "Audio" : "Image",
			w: void 0
		}), n();
	};
	(0, p.useEffect)(() => {
		if (!o) return;
		let e = (e) => {
			if (I) return;
			let t = [...e.clipboardData?.files || []].filter(an);
			if (t.length) {
				m.current = Date.now();
				let e = v.current.size === 1 ? [...v.current][0] : "", n = s.getState().document?.nodes.find((t) => t.id === e && t.type === "smart-image");
				if (n) {
					Ee(n.id, t);
					return;
				}
				let r = h.current || {
					x: (z.width / 2 - L.x) / L.zoom,
					y: (z.height / 2 - L.y) / L.zoom
				};
				window.CanvasBoardV2?.importFiles(t, r);
				return;
			}
			if (e.defaultPrevented || rn(e.target) || !f.current) return;
			e.preventDefault();
			let r = s.getState().pasteNodes(f.current);
			r.length && (g.current = Date.now(), k(new Set(r)), n(), window.dispatchEvent(new CustomEvent("canvas-board-v2-shortcut-status", { detail: `已粘贴 ${r.length} 个节点` })));
		}, t = () => {
			g.current = Date.now();
		};
		return window.addEventListener("paste", e), window.addEventListener("canvas-board-v2-asset-inbox-pasted", t), () => {
			window.removeEventListener("paste", e), window.removeEventListener("canvas-board-v2-asset-inbox-pasted", t);
		};
	}, [
		z.height,
		z.width,
		I,
		D,
		o,
		s,
		L
	]);
	let De = async (t, n) => {
		let r = (await e.uploadMedia([new File([t], n, { type: "image/png" })])).files?.[0];
		if (!r?.url) throw Error("图片上传失败");
		return {
			...r,
			kind: "image",
			name: r.name || n,
			url: r.url
		};
	}, Oe = (e, t, r, i = "centered") => {
		let a = $e(e), o = t.length > 1 ? .8 : 2, c = $e({
			id: "",
			images: t,
			scale: o,
			type: "smart-image"
		}), l = i === "split" ? {
			x: Number(e.x || 0) + a.width + 40,
			y: Number(e.y || 0)
		} : {
			x: Number(e.x || 0) + a.width + 240 - c.width / 2,
			y: Number(e.y || 0) + a.height / 2 - c.height / 2
		}, u = s.getState().addNode("smart-image", l);
		if (!u) throw Error("无法创建图片节点");
		return s.getState().updateNode(u, {
			h: void 0,
			images: t,
			scale: o,
			title: r,
			w: void 0
		}), k(/* @__PURE__ */ new Set([u])), n(), u;
	}, ke = async (e) => {
		if (I || !P) throw Error("只读模式不能编辑图片");
		let t = await De(e.blob, e.name), r = s.getState().document?.nodes.find((e) => e.id === P.nodeId && e.type === "smart-image");
		if (!r) throw Error("图片节点已经被移除");
		let i = tt(r), a = i[P.imageIndex];
		if (!a) throw Error("图片已经被移除");
		i[P.imageIndex] = {
			...a,
			...t,
			natural_h: e.height,
			natural_w: e.width
		};
		let o = {
			h: void 0,
			images: i,
			lastImageEdit: {
				height: e.height,
				mode: e.mode,
				width: e.width
			},
			w: void 0
		};
		e.mode === "outpaint" && (o.outpaintSize = {
			height: e.height,
			width: e.width
		}, o.runSettings = dr(r.runSettings, e.width, e.height), o.promptDraftHtml = "Remove white area and fill the scene", o.promptDraftText = "Remove white area and fill the scene", o.promptDraftTouched = !0), s.getState().updateNode(r.id, o), n();
	}, je = async (e) => {
		if (I || !P) throw Error("只读模式不能编辑图片");
		let t = await De(e.blob, e.name), r = s.getState().document?.nodes.find((e) => e.id === P.nodeId && e.type === "smart-image");
		if (!r) throw Error("图片节点已经被移除");
		let i = [...tt(r), {
			...t,
			natural_h: e.height,
			natural_w: e.width,
			role: "mask"
		}];
		s.getState().updateNode(r.id, {
			h: void 0,
			images: i,
			scale: i.length > 1 ? .8 : Number(r.scale || 2),
			title: i.length > 1 ? "Group" : r.title,
			w: void 0
		}), n();
	}, X = async (t) => {
		if (I || !P) throw Error("只读模式不能编辑图片");
		let n = await e.uploadMedia(t.items.map((e) => new File([e.blob], e.name, { type: "image/png" }))), r = s.getState().document?.nodes.find((e) => e.id === P.nodeId && e.type === "smart-image");
		if (!r) throw Error("图片节点已经被移除");
		let i = tt(r)[P.imageIndex], a = n.files.slice(0, t.items.length).map((e, n) => ({
			grid: {
				...t.layout,
				...t.items[n].rect
			},
			kind: e.kind || "image",
			name: e.name || t.items[n].name,
			run: {
				prompt: "宫格切分",
				refs: i ? [{
					name: i.name || "source image",
					url: i.url || ""
				}] : []
			},
			runMs: 0,
			url: String(e.url || ""),
			viewed: !1
		})).filter((e) => !!e.url);
		if (!a.length) throw Error("切分图片上传结果为空");
		Oe(r, a, "Grid", "split");
	}, Me = async (e) => {
		if (I || !P) throw Error("只读模式不能编辑图片");
		let t = await De(e.blob, e.name), n = s.getState().document?.nodes.find((e) => e.id === P.nodeId && e.type === "smart-image");
		if (!n) throw Error("图片节点已经被移除");
		Oe(n, [{
			...t,
			natural_h: e.height,
			natural_w: e.width
		}], "Grid Join");
	}, Ne = async (e, t) => {
		if (I) throw Error("只读模式不能导出视频帧");
		let n = await De(t.blob, t.name);
		Oe(e, [{
			...n,
			natural_h: t.height,
			natural_w: t.width
		}], "Image");
	}, Pe = async (e) => {
		if (e.running) {
			await window.CanvasBoardV2?.controlExecution("stop-execution", e.id);
			return;
		}
		try {
			await window.CanvasBoardV2?.runNode(e.id, "cascade");
		} catch (e) {
			let t = window.document.getElementById("toast");
			t && (t.textContent = e instanceof Error ? e.message : String(e), t.classList.add("show"), window.setTimeout(() => t.classList.remove("show"), 1800));
		}
	};
	return /* @__PURE__ */ (0, w.jsxs)("div", {
		"aria-label": "CanvasBoard V2",
		"aria-readonly": I,
		className: `${i ? "board" : ""} ${I ? "canvas-board-v2-readonly" : ""}`.trim() || void 0,
		"data-testid": "canvas-board-v2",
		"data-viewport": `${L.x},${L.y},${L.zoom.toFixed(2)}`,
		onClickCapture: (e) => {
			if (!R || e.button !== 0) return;
			let t = e.target;
			if (t.closest(".composer,.smart-nav,.asset-panel,.create-menu,.smart-minimap,.log-modal,.shortcut-modal,.image-edit-modal")) return;
			e.preventDefault(), e.stopPropagation();
			let n = String(t.closest(".image-node,[data-node-id]")?.dataset.id || t.closest("[data-node-id]")?.dataset.nodeId || ""), r = s.getState().document?.nodes.find((e) => e.id === n), i = e.currentTarget.getBoundingClientRect(), a = {
				x: (e.clientX - i.left - L.x) / L.zoom,
				y: (e.clientY - i.top - L.y) / L.zoom
			};
			pe(a, r);
		},
		onPointerDownCapture: (e) => {
			if (R && e.button === 0 && !e.target.closest(".composer,.asset-panel,.create-menu,.smart-minimap,.log-modal,.shortcut-modal,.image-edit-modal")) {
				e.preventDefault(), e.stopPropagation();
				return;
			}
			if (!o || I || e.button !== 0 || y) return;
			let t = e.target.closest(".node-port[data-port]"), n = t?.closest(".image-node, [data-node-id]"), r = String(n?.dataset.id || n?.dataset.nodeId || ""), i = t?.dataset.port;
			r && (i === "in" || i === "out") && ge(r, i);
		},
		onDoubleClick: (e) => {
			if (!o || I || e.target.closest(".node, .composer, .create-menu, .smart-minimap, input, textarea, select, button")) return;
			e.preventDefault();
			let t = e.currentTarget.getBoundingClientRect();
			ae({
				left: Math.max(14, Math.min(window.innerWidth - 420 - 14, e.clientX + 8)),
				point: {
					x: (e.clientX - t.left - L.x) / L.zoom,
					y: (e.clientY - t.top - L.y) / L.zoom
				},
				top: Math.max(14, Math.min(window.innerHeight - 286 - 14, e.clientY + 8))
			});
		},
		onContextMenu: (e) => {
			if (!i || e.target.closest(".node, .create-menu, .minimap, input, textarea, select, button") || (e.preventDefault(), I)) return;
			let t = e.currentTarget.getBoundingClientRect();
			ae({
				left: e.clientX - t.left,
				point: {
					x: (e.clientX - t.left - L.x) / L.zoom,
					y: (e.clientY - t.top - L.y) / L.zoom
				},
				top: e.clientY - t.top
			});
		},
		onDragLeave: (e) => {
			i && !e.currentTarget.contains(e.relatedTarget) && le(!1);
		},
		onDragOver: (e) => {
			e.preventDefault(), i && !I && le(!0);
		},
		onDrop: (e) => {
			if (e.preventDefault(), e.stopPropagation(), i && le(!1), I) return;
			let t = e.currentTarget.getBoundingClientRect(), r = {
				x: (e.clientX - t.left - L.x) / L.zoom,
				y: (e.clientY - t.top - L.y) / L.zoom
			}, a = e.dataTransfer.getData("application/x-smart-asset");
			if (a) try {
				let e = JSON.parse(a);
				if (e.url) {
					let t = s.getState().addNode(o ? "smart-image" : "image", r);
					t && (o ? s.getState().updateNode(t, {
						images: [{
							asset_item_id: e.asset_item_id,
							asset_uris: e.asset_uris,
							kind: e.kind || "image",
							name: e.name || "asset",
							url: e.url
						}],
						scale: 2,
						title: e.kind === "video" ? "Video" : e.kind === "audio" ? "Audio" : "Image"
					}) : s.getState().updateNode(t, {
						mediaKind: e.kind || "image",
						name: e.name || "asset",
						url: e.url
					}), n());
					return;
				}
			} catch (e) {
				console.warn("[canvas-modern-core] invalid smart asset drag payload", e);
			}
			let c = e.dataTransfer.getData("application/x-canvas-output-image");
			if (c) try {
				let e = JSON.parse(c);
				if (e.url) {
					let t = s.getState().addNode("image", r);
					t && (s.getState().updateNode(t, {
						mediaKind: e.kind || "image",
						name: e.name || "output",
						url: e.url
					}), n());
					return;
				}
			} catch (e) {
				console.warn("[canvas-modern-core] invalid output drag payload", e);
			}
			let l = [...e.dataTransfer.files].filter((e) => /^(image|video|audio)\//.test(e.type));
			l.length && window.CanvasBoardV2?.importFiles(l, r);
		},
		onPointerDown: (e) => {
			if (e.button !== 0 && e.button !== 1) return;
			e.preventDefault();
			let t = e.currentTarget;
			if (!i) {
				if (e.button !== 0) return;
				let n = {
					x: e.clientX,
					y: e.clientY,
					viewport: L
				};
				t.setPointerCapture(e.pointerId), k(/* @__PURE__ */ new Set()), E(-1);
				let r = (e) => re((t) => ({
					...t,
					x: n.viewport.x + e.clientX - n.x,
					y: n.viewport.y + e.clientY - n.y
				}));
				t.addEventListener("pointermove", r), t.addEventListener("pointerup", () => t.removeEventListener("pointermove", r), { once: !0 });
				return;
			}
			let n = t.getBoundingClientRect(), r = {
				localX: e.clientX - n.left,
				localY: e.clientY - n.top,
				x: e.clientX,
				y: e.clientY,
				viewport: L
			};
			t.setPointerCapture(e.pointerId), ae(null), E(-1);
			let a = e.button === 0 && (e.ctrlKey || e.metaKey || _.current), o = !1, c = r.viewport, l = {
				height: 0,
				left: r.localX,
				top: r.localY,
				width: 0
			}, d = (e) => {
				if (o ||= Math.hypot(e.clientX - r.x, e.clientY - r.y) > 4, a) {
					let t = e.clientX - n.left, i = e.clientY - n.top;
					l = {
						height: Math.abs(i - r.localY),
						left: Math.min(t, r.localX),
						top: Math.min(i, r.localY),
						width: Math.abs(t - r.localX)
					}, se(l);
					return;
				}
				c = {
					...r.viewport,
					x: r.viewport.x + e.clientX - r.x,
					y: r.viewport.y + e.clientY - r.y
				}, re(c);
			};
			t.addEventListener("pointermove", d), t.addEventListener("pointerup", () => {
				if (t.removeEventListener("pointermove", d), a) {
					let e = {
						height: l.height / r.viewport.zoom,
						width: l.width / r.viewport.zoom,
						x: (l.left - r.viewport.x) / r.viewport.zoom,
						y: (l.top - r.viewport.y) / r.viewport.zoom
					}, t = (s.getState().document?.nodes ?? []).filter((t) => {
						let n = kn(t), r = Nn(t);
						return Mn({
							...n,
							...r
						}, e);
					}).map((e) => e.id);
					k(new Set(t)), se(null);
				} else o ? jn(u, c) : e.button === 0 && k(/* @__PURE__ */ new Set());
			}, { once: !0 });
		},
		onPointerMove: (e) => {
			let t = e.currentTarget.getBoundingClientRect();
			h.current = {
				x: (e.clientX - t.left - L.x) / L.zoom,
				y: (e.clientY - t.top - L.y) / L.zoom
			};
		},
		onWheel: (e) => {
			if (e.preventDefault(), !i) {
				re((t) => ({
					...t,
					zoom: Math.min(1.5, Math.max(.25, t.zoom * (e.deltaY < 0 ? 1.1 : .9)))
				}));
				return;
			}
			ae(null);
			let t = e.currentTarget.getBoundingClientRect(), n = {
				x: e.clientX - t.left,
				y: e.clientY - t.top
			};
			re((t) => {
				let r = {
					x: (n.x - t.x) / t.zoom,
					y: (n.y - t.y) / t.zoom
				}, i = Math.min(1.5, Math.max(.25, t.zoom * (e.deltaY < 0 ? 1.08 : .92))), a = {
					x: n.x - r.x * i,
					y: n.y - r.y * i,
					zoom: i
				};
				return jn(u, a), a;
			});
		},
		ref: d,
		style: {
			backgroundColor: i ? void 0 : "var(--page)",
			backgroundImage: i ? void 0 : "radial-gradient(var(--grid) 1px, transparent 1px)",
			backgroundSize: i ? void 0 : "24px 24px",
			inset: 0,
			overflow: "hidden",
			position: "absolute",
			touchAction: "none"
		},
		children: [
			i ? /* @__PURE__ */ (0, w.jsx)("div", {
				className: `drop-overlay ${ce ? "active" : ""}`,
				children: "拖放素材到画布"
			}) : null,
			i && oe ? /* @__PURE__ */ (0, w.jsx)("div", {
				className: "selection-box",
				style: {
					...oe,
					display: "block"
				}
			}) : null,
			/* @__PURE__ */ (0, w.jsx)("div", {
				"aria-live": "polite",
				"data-testid": "canvas-board-v2-save-status",
				style: {
					position: "absolute",
					right: 18,
					top: 74,
					zIndex: 20
				},
				children: A === "saving" ? "正在保存" : A === "error" ? "保存失败，本地修改仍保留" : A === "saved" ? "已保存" : ""
			}),
			/* @__PURE__ */ (0, w.jsxs)("div", {
				className: i ? `world ${Math.abs(L.zoom - 1) > .001 ? "canvas-scaled" : ""}`.trim() : void 0,
				style: {
					height: i ? void 0 : Tn,
					position: "absolute",
					transform: `translate(${L.x}px, ${L.y}px) scale(${L.zoom})`,
					transformOrigin: i ? void 0 : "0 0",
					width: i ? void 0 : wn
				},
				children: [
					o ? /* @__PURE__ */ (0, w.jsx)(Je, {
						document: K,
						drag: x,
						nodeRect: (e) => ({
							...kn(e),
							...Nn(e)
						}),
						onCut: (e) => {
							I || (s.getState().deleteConnection(e), E(-1), n());
						},
						onSelect: (e) => {
							E(e), k(/* @__PURE__ */ new Set());
						},
						selectedIndex: C
					}) : /* @__PURE__ */ (0, w.jsx)("svg", {
						className: i ? "links" : void 0,
						height: Tn,
						style: i ? void 0 : {
							inset: 0,
							overflow: "visible",
							position: "absolute"
						},
						width: wn,
						children: (l?.connections ?? []).map((e, t) => {
							let n = G.get(e.from), r = G.get(e.to);
							if (!n || !r) return null;
							let i = kn(n), a = kn(r), o = Nn(n), s = Nn(r), c = {
								x1: i.x + o.width,
								x2: a.x,
								y1: i.y + o.height / 2,
								y2: a.y + s.height / 2
							};
							return /* @__PURE__ */ (0, w.jsxs)("g", { children: [/* @__PURE__ */ (0, w.jsx)("line", {
								...c,
								stroke: C === t ? "var(--strong)" : "var(--line-2)",
								strokeWidth: "2"
							}), /* @__PURE__ */ (0, w.jsx)("line", {
								...c,
								"data-edge-index": t,
								"data-selected": C === t ? "true" : "false",
								onClick: (e) => {
									e.stopPropagation(), E(t), k(/* @__PURE__ */ new Set());
								},
								onPointerDown: (e) => e.stopPropagation(),
								pointerEvents: "stroke",
								stroke: "rgba(0,0,0,.001)",
								strokeWidth: "16"
							})] }, `${e.from}-${e.to}-${t}`);
						})
					}),
					(l?.nodes ?? []).map((t) => {
						let r = kn(t), a = Nn(t);
						if (o && t.type === "smart-image") return /* @__PURE__ */ (0, w.jsx)(ut, {
							connecting: !!(y && x?.fromPort === "out" && fe?.canConnect(y, t.id)),
							node: t,
							onAppendFiles: (e) => void Ee(t.id, e),
							onConnectIn: () => he(t.id),
							onConnectOut: () => ge(t.id),
							onDelete: () => {
								s.getState().deleteNode(t.id), k(/* @__PURE__ */ new Set()), n();
							},
							onDeleteImage: (e) => {
								let r = s.getState().document?.nodes.find((e) => e.id === t.id);
								if (!r) return;
								let i = tt(r).filter((t, n) => n !== e);
								s.getState().updateNode(t.id, {
									h: void 0,
									images: i,
									scale: i.length > 1 ? .8 : 2,
									title: i.length > 1 ? "Group" : i.length ? "Image" : "上传节点",
									w: void 0
								}), n();
							},
							onMoveStart: (e) => {
								if (e.button !== 0 || I || e.target.closest("button, audio, video, .node-drop")) return;
								e.stopPropagation();
								let r = e.currentTarget, i = D.has(t.id) ? new Set(D) : /* @__PURE__ */ new Set([t.id]), a = new Map((s.getState().document?.nodes ?? []).filter((e) => i.has(e.id)).map((e) => [e.id, kn(e)])), o = {
									clientX: e.clientX,
									clientY: e.clientY
								}, c = !1;
								r.setPointerCapture(e.pointerId), !D.has(t.id) && !e.ctrlKey && !e.metaKey && k(i);
								let l = (e) => {
									c = !0;
									let t = {
										x: (e.clientX - o.clientX) / L.zoom,
										y: (e.clientY - o.clientY) / L.zoom
									};
									a.forEach((e, n) => s.getState().moveNode(n, e.x + t.x, e.y + t.y));
								};
								r.addEventListener("pointermove", l), r.addEventListener("pointerup", () => {
									r.removeEventListener("pointermove", l), c && n();
								}, { once: !0 });
							},
							onPatch: (e, r = !1) => {
								let i = s.getState().document?.nodes.find((e) => e.id === t.id);
								i && (s.getState().updateNode(t.id, typeof e == "function" ? e(i) : e), r && n());
							},
							onPreview: (e) => N({
								nodeId: t.id,
								url: e
							}),
							onSelect: (e) => {
								E(-1), k((n) => {
									if (!e.ctrlKey && !e.metaKey) return /* @__PURE__ */ new Set([t.id]);
									let r = new Set(n);
									return r.has(t.id) ? r.delete(t.id) : r.add(t.id), r;
								});
							},
							readOnly: I,
							selected: D.has(t.id)
						}, t.id);
						if (o && t.type === "prompt") {
							let e = Q()?.getNodeOptions("llm", "provider", t) ?? [], r = {
								label: String(t.llmProvider || "comfly"),
								models: [String(t.llmModel || "gpt-4o-mini")],
								value: String(t.llmProvider || "comfly")
							}, i = e.length ? e.map((e) => ({
								label: e.label,
								models: (Q()?.getNodeOptions("llm", "model", {
									...t,
									llmProvider: e.value
								}) ?? []).map((e) => e.value),
								value: e.value
							})) : [r];
							return /* @__PURE__ */ (0, w.jsx)(Cn, {
								connecting: !!(y && x?.fromPort === "out" && fe?.canConnect(y, t.id)),
								media: Yn(K, t),
								node: t,
								onConnectIn: () => he(t.id),
								onConnectOut: () => ge(t.id),
								onDelete: () => {
									s.getState().deleteNode(t.id), k(/* @__PURE__ */ new Set()), n();
								},
								onMoveStart: (e) => {
									if (e.button !== 0 || I || e.target.closest("button, textarea, select, .node-port, .prompt-llm-instruction-resize")) return;
									e.stopPropagation();
									let r = e.currentTarget, i = D.has(t.id) ? new Set(D) : /* @__PURE__ */ new Set([t.id]), a = new Map((s.getState().document?.nodes ?? []).filter((e) => i.has(e.id)).map((e) => [e.id, kn(e)])), o = {
										clientX: e.clientX,
										clientY: e.clientY
									}, c = !1;
									r.setPointerCapture(e.pointerId), !D.has(t.id) && !e.ctrlKey && !e.metaKey && k(i);
									let l = (e) => {
										c = !0;
										let t = {
											x: (e.clientX - o.clientX) / L.zoom,
											y: (e.clientY - o.clientY) / L.zoom
										};
										a.forEach((e, n) => s.getState().moveNode(n, e.x + t.x, e.y + t.y));
									};
									r.addEventListener("pointermove", l), r.addEventListener("pointerup", () => {
										r.removeEventListener("pointermove", l), c && n();
									}, { once: !0 });
								},
								onOpenTemplate: () => de({
									initialText: String(t.text || ""),
									nodeId: t.id,
									target: "node"
								}),
								onOpenPreset: () => ue(t.id),
								onPatch: (e, r = !1) => {
									s.getState().updateNode(t.id, e), r && n();
								},
								onRun: () => window.CanvasBoardV2?.runNode(t.id),
								onSelect: (e) => {
									E(-1), k((n) => {
										if (!e.ctrlKey && !e.metaKey) return /* @__PURE__ */ new Set([t.id]);
										let r = new Set(n);
										return r.has(t.id) ? r.delete(t.id) : r.add(t.id), r;
									});
								},
								providers: i,
								readOnly: I,
								selected: D.has(t.id)
							}, t.id);
						}
						return o && t.type === "loop" ? /* @__PURE__ */ (0, w.jsx)(hn, {
							connecting: !!(y && x?.fromPort === "out" && fe?.canConnect(y, t.id)),
							media: Yn(K, t),
							node: t,
							onConnectIn: () => he(t.id),
							onConnectOut: () => ge(t.id),
							onDelete: () => {
								s.getState().deleteNode(t.id), k(/* @__PURE__ */ new Set()), n();
							},
							onMoveStart: (e) => {
								if (e.button !== 0 || I || e.target.closest("button, input, [contenteditable=\"true\"], .node-port")) return;
								e.stopPropagation();
								let r = e.currentTarget, i = D.has(t.id) ? new Set(D) : /* @__PURE__ */ new Set([t.id]), a = new Map((s.getState().document?.nodes ?? []).filter((e) => i.has(e.id)).map((e) => [e.id, kn(e)])), o = {
									clientX: e.clientX,
									clientY: e.clientY
								}, c = !1;
								r.setPointerCapture(e.pointerId), !D.has(t.id) && !e.ctrlKey && !e.metaKey && k(i);
								let l = (e) => {
									c = !0;
									let t = {
										x: (e.clientX - o.clientX) / L.zoom,
										y: (e.clientY - o.clientY) / L.zoom
									};
									a.forEach((e, n) => s.getState().moveNode(n, e.x + t.x, e.y + t.y));
								};
								r.addEventListener("pointermove", l), r.addEventListener("pointerup", () => {
									r.removeEventListener("pointermove", l), c && n();
								}, { once: !0 });
							},
							onPatch: (e, r = !1) => {
								s.getState().updateNode(t.id, e), r && n();
							},
							onRun: () => Pe(t),
							onSelect: (e) => {
								E(-1), k((n) => {
									if (!e.ctrlKey && !e.metaKey) return /* @__PURE__ */ new Set([t.id]);
									let r = new Set(n);
									return r.has(t.id) ? r.delete(t.id) : r.add(t.id), r;
								});
							},
							readOnly: I,
							selected: D.has(t.id),
							upstreamPrompts: Xn(K, t)
						}, t.id) : /* @__PURE__ */ (0, w.jsxs)("article", {
							"aria-label": `${t.type} ${t.id}`,
							className: `node ${t.type}-node sized ${t.url ? "has-image" : ""} ${D.has(t.id) ? "selected" : ""}`,
							"data-node-id": t.id,
							"data-node-type": t.type,
							onClick: (e) => {
								e.stopPropagation(), E(-1), k((n) => {
									if (!e.ctrlKey && !e.metaKey) return /* @__PURE__ */ new Set([t.id]);
									let r = new Set(n);
									return r.has(t.id) ? r.delete(t.id) : r.add(t.id), r;
								});
							},
							onKeyDown: (e) => {
								(e.key === "Enter" || e.key === " ") && k(/* @__PURE__ */ new Set([t.id]));
							},
							onPointerDown: (e) => {
								if (e.button !== 0 || (e.stopPropagation(), e.ctrlKey || e.metaKey)) return;
								let r = e.currentTarget, a = i && D.has(t.id) ? new Set(D) : /* @__PURE__ */ new Set([t.id]), o = new Map((s.getState().document?.nodes ?? []).filter((e) => a.has(e.id)).map((e) => [e.id, kn(e)])), c = {
									clientX: e.clientX,
									clientY: e.clientY
								}, l = !1;
								r.setPointerCapture(e.pointerId), E(-1), !D.has(t.id) && !e.ctrlKey && !e.metaKey && k(a);
								let u = (e) => {
									l = !0;
									let t = {
										x: (e.clientX - c.clientX) / L.zoom,
										y: (e.clientY - c.clientY) / L.zoom
									};
									o.forEach((e, n) => s.getState().moveNode(n, e.x + t.x, e.y + t.y));
								};
								r.addEventListener("pointermove", u), r.addEventListener("pointerup", () => {
									r.removeEventListener("pointermove", u), l && n();
								}, { once: !0 });
							},
							role: "button",
							style: {
								height: a.height,
								left: r.x,
								minHeight: a.height,
								minWidth: a.width,
								top: r.y,
								width: a.width
							},
							tabIndex: 0,
							children: [
								Pn(t) ? /* @__PURE__ */ (0, w.jsx)("button", {
									"aria-label": `连接到 ${t.id}`,
									className: "port in node-port port-in",
									"data-port": "in",
									onClick: () => he(t.id),
									onPointerDown: (e) => e.stopPropagation(),
									type: "button"
								}) : null,
								Fn(t) ? /* @__PURE__ */ (0, w.jsx)("button", {
									"aria-label": `从 ${t.id} 连线`,
									className: "port out node-port port-out",
									"data-port": "out",
									onClick: () => ge(t.id),
									onPointerDown: (e) => {
										e.stopPropagation(), ge(t.id);
									},
									type: "button"
								}) : null,
								/* @__PURE__ */ (0, w.jsx)("header", {
									className: "node-head",
									children: /* @__PURE__ */ (0, w.jsx)("strong", {
										className: "node-title",
										children: On[t.type] ?? t.type
									})
								}),
								/* @__PURE__ */ (0, w.jsx)("div", {
									className: "node-body",
									children: t.type === "prompt" ? /* @__PURE__ */ (0, w.jsx)(Bn, {
										commit: n,
										node: t,
										onOpenPreset: o && !I ? ue : void 0,
										onOpenTemplate: o ? (e) => {
											let t = s.getState().document?.nodes.find((t) => t.id === e);
											t && de({
												initialText: String(t.text || ""),
												nodeId: e,
												target: "node"
											});
										} : void 0,
										store: s
									}) : t.type === "image" ? /* @__PURE__ */ (0, w.jsx)(or, {
										canvasRuntime: e,
										commit: n,
										node: t,
										onEdit: () => te(t.id),
										store: s
									}) : t.type === "group" ? /* @__PURE__ */ (0, w.jsx)(sr, {
										node: t,
										nodesById: G
									}) : t.type === "promptGroup" ? /* @__PURE__ */ (0, w.jsx)(Vn, {
										node: t,
										nodesById: G
									}) : t.type === "loop" ? /* @__PURE__ */ (0, w.jsx)(Hn, {
										commit: n,
										node: t,
										store: s
									}) : t.type === "generator" ? /* @__PURE__ */ (0, w.jsx)($n, {
										commit: n,
										document: K,
										node: t,
										store: s
									}) : t.type === "msgen" ? /* @__PURE__ */ (0, w.jsx)(er, {
										commit: n,
										document: K,
										node: t,
										store: s
									}) : t.type === "output" ? /* @__PURE__ */ (0, w.jsx)(tr, {
										commit: n,
										node: t,
										store: s
									}) : t.type === "video" ? /* @__PURE__ */ (0, w.jsx)(nr, {
										commit: n,
										document: K,
										node: t,
										store: s
									}) : t.type === "llm" ? /* @__PURE__ */ (0, w.jsx)(rr, {
										commit: n,
										document: K,
										node: t,
										store: s
									}) : t.type === "comfy" ? /* @__PURE__ */ (0, w.jsx)(ar, {
										commit: n,
										document: K,
										node: t,
										store: s
									}) : t.type === "ltxDirector" ? /* @__PURE__ */ (0, w.jsx)(cr, {
										commit: n,
										document: K,
										node: t,
										store: s
									}) : String(t.title || t.name || t.id)
								})
							]
						}, t.id);
					}),
					o ? /* @__PURE__ */ (0, w.jsx)(Ae, {
						canvasRuntime: e,
						document: l,
						generator: Se,
						onPatchGenerator: Ce,
						onPatchOutput: we,
						onOpenTemplate: (e, t) => de({
							initialText: e,
							onApply: t,
							target: "composer"
						}),
						onRun: Te,
						output: Y,
						readOnly: I
					}) : null
				]
			}),
			i && V ? /* @__PURE__ */ (0, w.jsx)("div", {
				className: "create-menu open",
				onPointerDown: (e) => e.stopPropagation(),
				style: {
					left: V.left,
					top: V.top
				},
				children: Dn.map(([e, t, r]) => /* @__PURE__ */ (0, w.jsxs)("button", {
					className: "menu-btn",
					onClick: () => {
						let t = s.getState().addNode(e, V.point);
						t && (k(/* @__PURE__ */ new Set([t])), n()), ae(null);
					},
					type: "button",
					children: [/* @__PURE__ */ (0, w.jsx)("i", {
						className: "w-4 h-4",
						"data-lucide": r
					}), /* @__PURE__ */ (0, w.jsx)("span", { children: t })]
				}, e))
			}) : null,
			o && V ? /* @__PURE__ */ (0, w.jsx)(Xe, {
				left: V.left,
				onCreate: be,
				top: V.top
			}) : null,
			o && H && G.get(H) ? /* @__PURE__ */ (0, w.jsx)(Et, {
				boardRef: d,
				node: G.get(H),
				onClearPreset: (e) => {
					let t = s.getState().document;
					t && (s.getState().projectDocument({
						...t,
						nodes: t.nodes.map((t) => String(t.promptPresetId || "") === e ? {
							...t,
							promptPresetId: void 0
						} : t)
					}), n());
				},
				onClose: () => ue(""),
				onPatchNode: (e, t) => {
					s.getState().updateNode(e, t), n();
				},
				readOnly: I
			}) : null,
			o && W ? /* @__PURE__ */ (0, w.jsx)(Ft, {
				initialText: W.initialText,
				onApply: (e, t) => {
					W.target === "composer" ? W.onApply?.(e) : W.nodeId && (s.getState().updateNode(W.nodeId, {
						promptPresetId: t,
						text: e
					}), n());
				},
				onClose: () => de(null),
				readOnly: I,
				target: W.target
			}) : null,
			o ? /* @__PURE__ */ (0, w.jsx)("input", {
				accept: "image/*,video/*,audio/*",
				hidden: !0,
				id: "fileInput",
				multiple: !0,
				type: "file"
			}) : null,
			i ? /* @__PURE__ */ (0, w.jsx)("div", {
				className: "minimap",
				onPointerDown: (e) => {
					e.preventDefault(), e.stopPropagation();
					let t = e.currentTarget;
					ve(e.clientX, e.clientY), t.setPointerCapture(e.pointerId);
					let n = (e) => ve(e.clientX, e.clientY);
					t.addEventListener("pointermove", n), t.addEventListener("pointerup", () => t.removeEventListener("pointermove", n), { once: !0 });
				},
				title: "导航地图",
				children: /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "minimap-content",
					children: [
						(l?.nodes ?? []).map((e) => {
							let t = kn(e), n = Nn(e);
							return /* @__PURE__ */ (0, w.jsx)("div", {
								className: `minimap-node ${D.has(e.id) ? "selected" : ""}`,
								"data-minimap-node-id": e.id,
								style: {
									height: `${Math.max(2, n.height / Tn * 110)}px`,
									left: `${t.x / wn * 100}%`,
									top: `${t.y / Tn * 100}%`,
									width: `${Math.max(2, n.width / wn * 172)}px`
								}
							}, e.id);
						}),
						(l?.nodes ?? []).length ? null : /* @__PURE__ */ (0, w.jsx)("div", {
							className: "minimap-empty",
							children: "暂无节点"
						}),
						/* @__PURE__ */ (0, w.jsx)("div", {
							className: "minimap-viewport",
							style: {
								height: `${Math.max(4, z.height / L.zoom / Tn * 100)}%`,
								left: `${-L.x / L.zoom / wn * 100}%`,
								top: `${-L.y / L.zoom / Tn * 100}%`,
								width: `${Math.max(4, z.width / L.zoom / wn * 100)}%`
							}
						})
					]
				})
			}) : null,
			o ? /* @__PURE__ */ (0, w.jsx)(vt, {
				boardHeight: z.height,
				boardWidth: z.width,
				nodes: (l?.nodes ?? []).map((e) => ({
					...kn(e),
					...Nn(e),
					id: e.id
				})),
				onLocate: ye,
				viewport: L
			}) : null,
			M && q ? o ? /* @__PURE__ */ (0, w.jsx)(zt, {
				document: l,
				node: q,
				onClose: () => N(null),
				onEdit: (e, t) => {
					F({
						imageIndex: e,
						mode: t,
						nodeId: q.id
					}), N(null);
				},
				onExportVideoFrame: (e) => Ne(q, e),
				onNavigate: (e) => N({
					nodeId: q.id,
					url: e
				}),
				onRememberSize: (e, t, r) => {
					let i = s.getState().document?.nodes.find((e) => e.id === q.id);
					if (!i || !Array.isArray(i.images)) return;
					let a = i.images.map((n, i) => i === e && n && typeof n == "object" && !Array.isArray(n) ? {
						...n,
						natural_h: r,
						natural_w: t
					} : n);
					s.getState().updateNode(i.id, { images: a }), n();
				},
				url: M.url
			}) : i ? /* @__PURE__ */ (0, w.jsx)(U, {
				node: q,
				onClose: () => N(null),
				onNavigate: (e) => N({
					nodeId: q.id,
					url: e
				}),
				onRerun: (e) => {
					window.CanvasBoardV2?.rerunFromOutputMeta(e), N(null);
				},
				onViewed: (e) => {
					let t = s.getState().document?.nodes.find((e) => e.id === q.id);
					if (!t || !Array.isArray(t.images)) return;
					let r = !1, i = t.images.map((t) => !t || typeof t != "object" || Array.isArray(t) || String(t.url || "") !== e || t.viewed ? t : (r = !0, {
						...t,
						viewed: !0
					}));
					r && (s.getState().updateNode(t.id, { images: i }), n());
				},
				url: M.url
			}) : /* @__PURE__ */ (0, w.jsx)(fr, {
				node: q,
				onClose: () => N(null),
				url: M.url
			}) : null,
			o && P && _e ? /* @__PURE__ */ (0, w.jsx)(dt, {
				imageIndex: P.imageIndex,
				initialMode: P.mode,
				node: _e,
				onApply: ke,
				onClose: () => F(null),
				onCreateMask: je,
				onGridJoin: Me,
				onGridSplit: X
			}) : null,
			J?.url ? i ? /* @__PURE__ */ (0, w.jsx)(O, {
				name: String(J.name || "image"),
				onApply: async (t) => {
					if (I) throw Error("只读模式不能编辑图片");
					let r = (await e.uploadMedia([new File([t.blob], t.name, { type: "image/png" })])).files?.[0];
					if (!r?.url) throw Error("图片上传失败");
					let i = s.getState().document?.nodes.find((e) => e.id === J.id);
					if (!i?.url) throw Error("图片节点已经被移除");
					let a = Array.isArray(i.imageEditHistory) ? i.imageEditHistory : [], o = {
						kind: i.mediaKind || "image",
						name: i.name || "image",
						outpaintSize: i.outpaintSize,
						url: i.url
					};
					s.getState().updateNode(i.id, {
						editOriginalUrl: i.editOriginalUrl || i.url,
						imageEditHistory: [...a, o].slice(-10),
						lastImageEdit: {
							height: t.height,
							mode: t.mode,
							width: t.width
						},
						mediaKind: r.kind || "image",
						name: r.name || t.name,
						natural_h: t.height,
						natural_w: t.width,
						outpaintSize: t.mode === "outpaint" ? {
							height: t.height,
							width: t.width
						} : void 0,
						url: r.url
					}), n();
				},
				onClose: () => te(""),
				onCreateMask: async (t) => {
					if (I) throw Error("只读模式不能编辑图片");
					let r = (await e.uploadMedia([new File([t.blob], t.name, { type: "image/png" })])).files?.[0];
					if (!r?.url) throw Error("遮罩上传失败");
					let i = s.getState().document?.nodes.find((e) => e.id === J.id);
					if (!i) throw Error("图片节点已经被移除");
					let a = s.getState().addNode("image", {
						x: Number(i.x || 0) + Number(i.w || 260) + 36,
						y: Number(i.y || 0) + 28
					});
					if (!a) throw Error("无法创建遮罩节点");
					s.getState().updateNode(a, {
						mediaKind: r.kind || "image",
						name: r.name || t.name,
						natural_h: t.height,
						natural_w: t.width,
						role: "mask",
						url: r.url
					}), n();
				},
				onGridSplit: async (t) => {
					if (I) throw Error("只读模式不能编辑图片");
					let r = t.items.map((e) => new File([e.blob], e.name, { type: "image/png" })), i = await e.uploadMedia(r);
					if (!i.files?.length) throw Error("切分图片上传失败");
					let a = s.getState().document, o = a?.nodes.find((e) => e.id === J.id);
					if (!a || !o) throw Error("图片节点已经被移除");
					let c = a.connections.filter((e) => e.from === o.id).map((e) => a.nodes.find((t) => t.id === e.to)).find((e) => e?.type === "output")?.id || s.getState().addNode("output", {
						x: Number(o.x || 0) + Number(o.w || 260) + 36,
						y: Number(o.y || 0)
					});
					if (!c) throw Error("无法创建 Output 节点");
					let l = {
						name: String(o.name || "source image"),
						url: String(o.url || "")
					}, u = i.files.slice(0, t.items.length).map((e, n) => ({
						grid: {
							...t.layout,
							...t.items[n].rect
						},
						kind: e.kind || "image",
						name: e.name || t.items[n].name,
						run: {
							prompt: "宫格切分",
							refs: [l]
						},
						runMs: 0,
						url: e.url || "",
						viewed: !1
					})).filter((e) => e.url);
					if (!u.length) throw Error("切分图片上传结果为空");
					s.getState().updateNode(c, {
						imageComparisons: Object.fromEntries(u.map((e) => [e.url, l])),
						images: u,
						outputLayout: t.layout
					}), n();
				},
				url: String(J.url)
			}) : /* @__PURE__ */ (0, w.jsx)(T, {
				name: String(J.name || "image"),
				onApply: async (t) => {
					if (I) throw Error("只读模式不能编辑图片");
					let r = (await e.uploadMedia([new File([t.blob], t.name, { type: "image/png" })])).files?.[0];
					if (!r?.url) throw Error("图片上传失败");
					let i = s.getState().document?.nodes.find((e) => e.id === J.id);
					if (!i?.url) throw Error("图片节点已经被移除");
					let a = Array.isArray(i.imageEditHistory) ? i.imageEditHistory : [], o = {
						kind: i.mediaKind || "image",
						name: i.name || "image",
						outpaintSize: i.outpaintSize,
						url: i.url
					};
					s.getState().updateNode(i.id, {
						editOriginalUrl: i.editOriginalUrl || i.url,
						imageEditHistory: [...a, o].slice(-10),
						lastImageEdit: {
							height: t.height,
							mode: t.mode,
							width: t.width
						},
						mediaKind: r.kind || "image",
						name: r.name || t.name,
						natural_h: t.height,
						natural_w: t.width,
						outpaintSize: t.mode === "outpaint" ? {
							height: t.height,
							width: t.width
						} : void 0,
						url: r.url
					}), n();
				},
				onClose: () => te(""),
				url: String(J.url)
			}) : null,
			I ? /* @__PURE__ */ (0, w.jsx)("div", {
				"aria-hidden": "true",
				className: "canvas-board-readonly-shield",
				"data-testid": "canvas-board-readonly-shield",
				style: { pointerEvents: "none" }
			}) : null
		]
	});
}
function dr(e, t, n) {
	let r = e && typeof e == "object" && !Array.isArray(e) ? { ...e } : {}, i = [
		"api",
		"volcengine",
		"modelscope",
		"comfy"
	].includes(String(r.engine || "")) ? String(r.engine) : "api", a = {
		...r,
		customHeight: n,
		customSize: `${t}x${n}`,
		customWidth: t,
		engine: i,
		outpaintResolutionLocked: !0,
		ratio: "",
		resolution: "custom"
	};
	return (i === "api" || i === "volcengine") && (a.apiKind = "image"), i === "modelscope" && Object.assign(a, {
		msCustomHeight: n,
		msCustomSize: `${t}x${n}`,
		msCustomWidth: t,
		msRatio: "",
		msResolution: "custom"
	}), i === "comfy" && Object.assign(a, {
		height: n,
		width: t
	}), a;
}
function fr({ node: e, onClose: t, url: n }) {
	let [r, i] = (0, p.useState)(50), a = e.imageComparisons?.[n]?.url || "", o = /\.(mp4|webm|mov)(\?|$)/i.test(n);
	return /* @__PURE__ */ (0, w.jsx)("div", {
		className: "output-lightbox open canvas-v2-lightbox",
		onClick: t,
		role: "dialog",
		children: /* @__PURE__ */ (0, w.jsxs)("div", {
			className: "output-lightbox-shell",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, w.jsx)("button", {
					"aria-label": "关闭预览",
					className: "output-lightbox-close",
					onClick: t,
					type: "button",
					children: "×"
				}),
				o ? /* @__PURE__ */ (0, w.jsx)("video", {
					autoPlay: !0,
					controls: !0,
					src: n
				}) : /* @__PURE__ */ (0, w.jsxs)("div", {
					className: "output-compare",
					children: [
						" ",
						/* @__PURE__ */ (0, w.jsx)("img", {
							alt: "生成结果",
							src: n
						}),
						a ? /* @__PURE__ */ (0, w.jsx)("div", {
							className: "output-compare-original-wrap",
							style: { width: `${r}%` },
							children: /* @__PURE__ */ (0, w.jsx)("img", {
								alt: "原始参考",
								src: a
							})
						}) : null
					]
				}),
				a && !o ? /* @__PURE__ */ (0, w.jsx)("input", {
					"aria-label": "对比滑块",
					max: "100",
					min: "0",
					onChange: (e) => i(Number(e.target.value)),
					type: "range",
					value: r
				}) : null,
				/* @__PURE__ */ (0, w.jsx)("a", {
					download: !0,
					href: n,
					children: "下载"
				})
			]
		})
	});
}
function pr(e, t, n = {}) {
	let r = window.CanvasLegacyBridge, a = n.repository ?? window.CanvasModernCore?.canvasRepository, o = n.runtime ?? Q(), c = n.initialDocument !== void 0, p = n.initialDocument ?? r?.getDocumentSnapshot();
	if (!a || !o || c && !p || !c && !r) throw Error("Canvas V2 dependencies are unavailable");
	let m = i(p), g = m.getState().document, _ = mr(m.getState().document), v = [], y = [], b = (e) => {
		let t = m.getState().document?.id;
		m.getState().adoptDocument(e.detail);
		let n = m.getState().document;
		n?.id !== t && (g = n);
	}, x = (e) => m.getState().projectExecutionDocument(e.detail);
	c || (window.addEventListener("canvas-legacy-document", b), window.addEventListener("canvas-legacy-execution-document", x));
	let S = (0, h.createRoot)(e), C = t?.hidden ?? !0, T = !1, E = !1, D = !1, O = null, k = (e) => ({
		...l(e),
		...n.clientId ? { client_id: n.clientId } : {}
	}), A = (t) => {
		e.dataset.saveState = t, window.dispatchEvent(new CustomEvent("canvas-board-v2-save-state", { detail: t }));
	}, j = (e = !0) => {
		let t = m.getState().document;
		if (t && (e && _ && hr(t) !== hr(_) && (v.push(structuredClone(_)), v.length > 60 && v.shift(), y.length = 0), _ = structuredClone(t), window.dispatchEvent(new CustomEvent("canvas-board-v2-history-state", { detail: {
			canRedo: y.length > 0,
			canUndo: v.length > 0
		} }))), E = !0, D) return;
		D = !0;
		let n = (async () => {
			for (; E && !T;) {
				E = !1;
				let e = m.getState().document;
				if (!(!e || typeof e.id != "string")) {
					A("saving");
					try {
						let t = await a.save(e.id, k(e));
						g = t, T || m.getState().acceptSavedDocument(t, e), window.dispatchEvent(new CustomEvent("canvas-board-v2-document-saved", { detail: structuredClone(t) })), A("saved"), window.CanvasModernCore?.recordRolloutEvent("save-succeeded", { dimensions: { reason: "none" } });
					} catch (t) {
						if (t instanceof d && window.CanvasModernCore?.recordRolloutEvent("save-conflict", { dimensions: { reason: "save-conflict" } }), t instanceof d && t.serverCanvas && g) {
							let n = m.getState().document;
							if (n?.id === e.id) {
								let r = u(g, n, t.serverCanvas);
								if (r.conflicts.length) console.warn("[canvas-modern-core] CanvasBoard V2 save conflict requires resolution", r.conflicts);
								else {
									A("merging"), m.setState({ document: r.document }), _ = structuredClone(r.document);
									try {
										let t = await a.save(e.id, k(r.document));
										g = t, T || m.getState().acceptSavedDocument(t, r.document), window.dispatchEvent(new CustomEvent("canvas-board-v2-document-saved", { detail: structuredClone(t) })), A("saved"), window.CanvasModernCore?.recordRolloutEvent("save-rebased", { dimensions: { reason: "none" } }), window.CanvasModernCore?.recordRolloutEvent("save-succeeded", { dimensions: { reason: "none" } });
										continue;
									} catch (e) {
										console.warn("[canvas-modern-core] CanvasBoard V2 rebased save failed", e);
									}
								}
							}
						}
						window.CanvasModernCore?.recordRolloutEvent("save-failed", { dimensions: { reason: "save-request-failed" } }), A("error"), console.warn("[canvas-modern-core] CanvasBoard V2 save failed", t);
						break;
					}
				}
			}
			D = !1;
		})();
		O = n, n.finally(() => {
			O === n && (O = null);
		});
	}, M = () => {
		let e = m.getState().document, t = v.pop();
		return !e || !t ? !1 : (y.push(structuredClone(e)), m.getState().projectDocument(t), _ = structuredClone(t), j(!1), !0);
	}, N = () => {
		let e = m.getState().document, t = y.pop();
		return !e || !t ? !1 : (v.push(structuredClone(e)), m.getState().projectDocument(t), _ = structuredClone(t), j(!1), !0);
	}, P = /* @__PURE__ */ new Set(), F = !!n.readOnly, ee = (e) => {
		let t = s(e), n = m.getState().document;
		if (!n || n.id !== t.id) return {
			conflicts: ["document.id"],
			merged: !1,
			updated: !1
		};
		if (D && !F) return {
			conflicts: ["save-in-progress"],
			merged: !1,
			updated: !1
		};
		let r = !!(g && hr(n) !== hr(g)), i = t, a = !1;
		if (!F && g && (r || f(n))) {
			let e = u(g, n, t);
			if (e.conflicts.length) return A("conflict"), {
				conflicts: e.conflicts,
				merged: !1,
				updated: !1
			};
			i = e.document, a = !0;
		}
		return g = t, m.getState().projectDocument(i), _ = structuredClone(i), v.length = 0, y.length = 0, window.dispatchEvent(new CustomEvent("canvas-board-v2-history-state", { detail: {
			canRedo: !1,
			canUndo: !1
		} })), A(a ? "merging" : "saved"), a && j(!1), {
			conflicts: [],
			merged: a,
			updated: !0
		};
	}, te = window.CanvasBoardV2;
	return window.CanvasBoardV2 = {
		addNode(e, t) {
			if (F) return null;
			let n = m.getState().addNode(e, t);
			return n && j(), n;
		},
		groupSelected() {
			F || window.dispatchEvent(new Event("canvas-board-v2-group-selected"));
		},
		exportSelection() {
			let e = m.getState().document;
			if (!e) return {
				connections: [],
				nodes: []
			};
			let t = P.size ? new Set(P) : new Set(e.nodes.map((e) => e.id)), n = !0;
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
			if (F) return [];
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
				"smart-image",
				"video"
			], i = /* @__PURE__ */ new Map();
			return t.forEach((e, t) => {
				if (!e || typeof e != "object") return;
				let n = e, a = String(n.type || "");
				if (!r.includes(a)) return;
				let o = m.getState().addNode(a, {
					x: Number(n.x || 0) + 48 + t % 3 * 12,
					y: Number(n.y || 0) + 48 + t % 3 * 12
				});
				if (!o) return;
				let s = String(n.id || "");
				s && i.set(s, o);
				let { id: c, type: l, x: u, y: d, ...f } = n;
				m.getState().updateNode(o, structuredClone(f));
			}), n.forEach((e) => {
				if (!e || typeof e != "object") return;
				let t = e, n = i.get(String(t.from || "")), r = i.get(String(t.to || ""));
				n && r && m.getState().connectNodes(n, r);
			}), i.size && j(), [...i.values()];
		},
		async controlExecution(e, t) {
			if (F) return;
			let n = m.getState().document;
			if (!n) return;
			let r = await o.runCommand(e, t, n, async (e) => {
				m.getState().projectExecutionDocument(e), j(!1);
			});
			m.getState().projectDocument(r), j(!1);
		},
		async importFiles(e, t) {
			if (F || !e.length) return;
			let r = await o.uploadMedia(e);
			if (n.smartUi) {
				let e = (r.files ?? []).filter((e) => e.url).map((e) => ({
					...e,
					kind: e.kind || "image",
					name: e.name || "media",
					url: e.url || ""
				}));
				if (!e.length) return;
				let n = t ?? {
					x: 500,
					y: 400
				}, i = m.getState().addNode("smart-image", {
					x: n.x - 158,
					y: n.y - 97
				});
				i && (m.getState().updateNode(i, {
					images: e,
					scale: e.length > 1 ? .8 : 2,
					title: e.length > 1 ? "Group" : e[0].kind === "video" ? "Video" : e[0].kind === "audio" ? "Audio" : "Image"
				}), j());
				return;
			}
			let i = (r.files ?? []).map((e, n) => {
				let r = m.getState().addNode("image", t ? {
					x: t.x + n * 36,
					y: t.y + n * 36
				} : void 0);
				return r && m.getState().updateNode(r, {
					url: e.url || "",
					name: e.name || "media",
					mediaKind: e.kind || "image"
				}), r;
			}).filter(Boolean);
			i.length > 1 && m.getState().groupNodes(i), i.length && j();
		},
		openPromptTemplates(e) {
			window.openPromptTemplateModal?.(e);
		},
		openOutputLightbox(e, t) {
			if (F) {
				n.initialDocument ? window.dispatchEvent(new CustomEvent("canvas-v2-open-lightbox", { detail: {
					nodeId: String(e.id || ""),
					url: t
				} })) : r && r.openOutputLightbox(e, t);
				return;
			}
			let i = Array.isArray(e.images) ? e.images.map((e) => typeof e == "string" ? e : String(e.url || "") === t ? {
				...e,
				viewed: !0
			} : e) : [];
			m.getState().updateNode(String(e.id || ""), { images: i }), j(!1), n.legacyUi || n.initialDocument ? window.dispatchEvent(new CustomEvent("canvas-v2-open-lightbox", { detail: {
				nodeId: String(e.id || ""),
				url: t
			} })) : r && r.openOutputLightbox(e, t);
		},
		async prepareVideoMedia(e, t, n) {
			if (F) return;
			let r = m.getState().document;
			if (!r) return;
			let i = await o.prepareVideoMedia(e, r, t, n);
			m.getState().projectDocument(i), j();
		},
		rerunFromOutputMeta(e) {
			if (F) return;
			let t = e.run && typeof e.run == "object" ? e.run : {}, n = t.node && typeof t.node == "object" ? structuredClone(t.node) : {}, r = String(n.type || t.nodeType || "");
			if (![
				"comfy",
				"generator",
				"llm",
				"ltxDirector",
				"msgen",
				"video"
			].includes(r)) return;
			let i = m.getState().addNode(r);
			if (!i) return;
			let { id: a, inputs: o, running: s, type: c, x: l, y: u, ...d } = n;
			m.getState().updateNode(i, {
				...d,
				runStatus: void 0,
				runError: ""
			});
			let f = m.getState().document?.nodes.find((e) => e.id === i), p = String(t.prompt || "");
			if (p) {
				let e = m.getState().addNode("prompt", {
					x: Number(f?.x || 0) - 340,
					y: Number(f?.y || 0)
				});
				e && (m.getState().updateNode(e, { text: p }), m.getState().connectNodes(e, i));
			}
			(Array.isArray(t.refs) ? t.refs : []).slice(0, 8).forEach((e, t) => {
				if (!e.url) return;
				let n = m.getState().addNode("image", {
					x: Number(f?.x || 0) - 340,
					y: Number(f?.y || 0) + 110 + t * 86
				});
				n && (m.getState().updateNode(n, {
					mediaKind: e.kind || "image",
					name: e.name || "image",
					url: e.url
				}), m.getState().connectNodes(n, i));
			}), j();
		},
		redo() {
			return !F && N();
		},
		async runNode(e, t) {
			if (F) return;
			let n = m.getState().document;
			if (!n) return;
			let r = await o.runNode(e, n, t, async (e) => {
				m.getState().projectExecutionDocument(e), j(!1);
			});
			m.getState().projectDocument(r), j(!1);
		},
		async flushSaves() {
			for (; D || E;) {
				E && !D && j(!1);
				let e = O;
				e ? await e : await new Promise((e) => window.setTimeout(e, 0));
			}
		},
		selectedNodeIds() {
			return [...P];
		},
		setReadOnly(e) {
			F = !!e, window.dispatchEvent(new CustomEvent("canvas-board-v2-readonly", { detail: F }));
		},
		syncRemote(e) {
			return ee(e);
		},
		undo() {
			return !F && M();
		},
		updateNode(e, t) {
			return F || !m.getState().document?.nodes.some((t) => t.id === e) ? !1 : (m.getState().updateNode(e, t), j(), !0);
		}
	}, S.render(/* @__PURE__ */ (0, w.jsx)(ur, {
		canvasRuntime: o,
		commit: j,
		initialReadOnly: F,
		legacyUi: !!n.legacyUi,
		onSelectionChange: (e) => {
			P = new Set(e), window.dispatchEvent(new Event("canvas-board-v2-selection"));
		},
		smartUi: !!n.smartUi,
		store: m
	})), t && (t.hidden = !0), e.hidden = !1, () => {
		T = !0, te ? window.CanvasBoardV2 = te : delete window.CanvasBoardV2, c || (window.removeEventListener("canvas-legacy-document", b), window.removeEventListener("canvas-legacy-execution-document", x)), S.unmount(), e.hidden = !0, t && (t.hidden = C);
	};
}
function mr(e) {
	return e ? structuredClone(e) : null;
}
function hr(e) {
	let t = structuredClone(e);
	return delete t.updated_at, JSON.stringify(t);
}
//#endregion
export { rn as a, de as c, on as i, pr as n, an as o, Rn as r, Dt as s, Ln as t };
