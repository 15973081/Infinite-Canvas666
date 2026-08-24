import { c as e, l as t, o as n, s as r, t as i } from "./jsx-runtime-BpAqVeUI.js";
import { n as a, t as o } from "./http-F-lX8WKW.js";
import { i as s } from "./document-merge-BpHwnITQ.js";
import { a as c, c as l, i as u, n as d, o as f, s as p } from "./canvas-board-v2-CMgzenhq.js";
//#region src/canvas/infrastructure/canvas-management.ts
var m = /* @__PURE__ */ t(e(), 1), h = n();
function g(e = fetch) {
	return {
		acquireLock: async (t, n, r = "") => {
			try {
				return await x(e, `/api/canvases/${encodeURIComponent(t)}/lock`, "POST", {
					client_id: n,
					username: r
				});
			} catch (e) {
				if (!(e instanceof o) || e.status !== 409) throw e;
				let t = b(e.details);
				return {
					ok: !1,
					holder: b(b(t.detail).holder || t.holder)
				};
			}
		},
		checkLock: async (t) => b(await a(e, `/api/canvases/${encodeURIComponent(t)}/lock`)),
		create: async (t = "", n = {}) => {
			let r = await x(e, "/api/canvases", "POST", {
				title: t.trim() || void 0,
				folder_id: n.folderId || void 0,
				icon: n.icon || void 0,
				kind: n.kind || void 0
			});
			return b(r).canvas ? b(b(r).canvas) : b(r);
		},
		createFolder: async (t, n = "") => b(await x(e, "/api/canvas-folders", "POST", {
			name: t,
			parent_id: n
		})),
		delete: (t) => S(e, `/api/canvases/${encodeURIComponent(t)}`, "DELETE"),
		deleteBackup: (t, n) => S(e, `/api/canvases/${encodeURIComponent(t)}/backups/${encodeURIComponent(n)}`, "DELETE"),
		deleteFolder: (t) => S(e, `/api/canvas-folders/${encodeURIComponent(t)}`, "DELETE"),
		getMeta: async (t) => b(await a(e, `/api/canvases/${encodeURIComponent(t)}/meta`)),
		list: async () => y(await a(e, "/api/canvases")),
		listFolders: async () => {
			let t = await a(e, "/api/canvas-folders"), n = b(t), r = Array.isArray(t) ? t : n.folders;
			return (Array.isArray(r) ? r : []).map(b).filter((e) => e.id).map((e) => e);
		},
		listTrash: async () => y(await a(e, "/api/canvases/trash")),
		moveToFolder: (t, n) => x(e, `/api/canvases/${encodeURIComponent(t)}/folder`, "PATCH", { folder_id: n }).then(() => void 0),
		patchMeta: async (t, n) => {
			let r = b(await x(e, `/api/canvases/${encodeURIComponent(t)}/meta`, "POST", n));
			return r.canvas ? b(r.canvas) : r;
		},
		purge: (t) => S(e, `/api/canvases/${encodeURIComponent(t)}/purge`, "DELETE"),
		releaseLock: async (t, n, r = !1) => {
			if (r) {
				await x(e, `/api/canvases/${encodeURIComponent(t)}/lock/release`, "POST", { client_id: n }, !0);
				return;
			}
			await S(e, `/api/canvases/${encodeURIComponent(t)}/lock?client_id=${encodeURIComponent(n)}`, "DELETE");
		},
		restore: (t) => S(e, `/api/canvases/${encodeURIComponent(t)}/restore`, "POST"),
		updateFolder: async (t, n) => b(await x(e, `/api/canvas-folders/${encodeURIComponent(t)}`, "PATCH", n))
	};
}
var _ = g();
function v() {
	return _;
}
function y(e) {
	let t = b(e), n = Array.isArray(e) ? e : t.canvases;
	return (Array.isArray(n) ? n : []).map(b).filter((e) => e.id).map((e) => e);
}
function b(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
function x(e, t, n, r, i = !1) {
	return a(e, t, {
		method: n,
		keepalive: i,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(r ?? {})
	});
}
async function S(e, t, n) {
	await a(e, t, { method: n });
}
//#endregion
//#region src/canvas/ui/canvas-app-domain.ts
function C(e) {
	return (Array.isArray(e.logs) ? e.logs : []).reduce((e, t) => {
		if (!t || typeof t != "object") return e;
		let n = t;
		if ([
			"cancelled",
			"error",
			"failed"
		].includes(String(n.status || "").toLowerCase())) return e;
		let r = n.cost;
		if (r && typeof r == "object") {
			let t = r;
			if (String(t.status || "priced") === "priced" && Number.isFinite(Number(t.amount_micros))) return e + Math.max(0, Number(t.amount_micros)) / 1e6;
		}
		let i = typeof r == "number" ? r : Number(n.cost_cny || 0);
		return e + (Number.isFinite(i) ? Math.max(0, i) : 0);
	}, 0);
}
function w(e, t = Date.now()) {
	if (!e) return [];
	try {
		let n = JSON.parse(localStorage.getItem(e) || "null"), r = Number(n?.created_at || n?.ts || 0);
		return r && t - r > 18e5 ? [] : (Array.isArray(n?.items) ? n.items : []).flatMap((e) => {
			if (!e || typeof e != "object") return [];
			let t = e, n = String(t.url || "").trim();
			return n ? [{
				kind: String(t.kind || t.type || "image"),
				name: String(t.name || t.title || "素材"),
				url: n
			}] : [];
		});
	} catch {
		return [];
	}
}
//#endregion
//#region src/canvas/ui/asset-library-dialog.tsx
var T = i(), E = {
	active_library_id: "",
	libraries: []
};
function D({ onClose: e, request: t }) {
	let [n, r] = (0, m.useState)(E), [i, a] = (0, m.useState)(""), [o, s] = (0, m.useState)(""), [c, u] = (0, m.useState)(""), [d, f] = (0, m.useState)(t.saveItem?.url || ""), [p, h] = (0, m.useState)(t.saveItem?.name || k(t.saveItem?.url || "")), [g, _] = (0, m.useState)("正在加载资产库…"), v = n.libraries.find((e) => e.id === i) ?? n.libraries[0], y = v?.categories || [], b = y.find((e) => e.id === o) ?? y[0], x = (0, m.useMemo)(() => (b?.items || []).filter((e) => {
		let t = c.trim().toLocaleLowerCase();
		return !t || e.name.toLocaleLowerCase().includes(t) || e.url.toLocaleLowerCase().includes(t);
	}), [b, c]), S = (e, n = i, c = o) => {
		r(e);
		let l = e.libraries.find((e) => e.id === n) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0], u = t.saveWorkflow ? "workflow" : "image", d = l?.categories.find((e) => e.id === c) ?? l?.categories.find((e) => e.type === u) ?? l?.categories[0];
		a(l?.id || ""), s(d?.id || "");
	};
	(0, m.useEffect)(() => {
		let e = !0;
		return l.list().then((t) => {
			e && (S(t.library, t.library.active_library_id, ""), _(""));
		}).catch((t) => e && _(A(t))), () => {
			e = !1;
		};
	}, []);
	let C = (e) => {
		let r = n.libraries.find((t) => t.id === e);
		a(e);
		let i = t.saveWorkflow ? "workflow" : "image";
		s(r?.categories.find((e) => e.type === i)?.id || r?.categories[0]?.id || "");
	}, w = async (e, t, n = b?.id || "") => {
		try {
			let r = await e();
			return S(r.library, v?.id, n), _(t), r;
		} catch (e) {
			return _(A(e)), null;
		}
	}, D = async () => {
		let e = window.prompt("新资产库名称")?.trim();
		if (!e) return;
		let t = await w(() => l.createLibrary(e), "资产库已创建", "");
		t && S(t.library, t.library.active_library_id, "");
	}, j = async () => {
		if (!v) return;
		let e = window.prompt("资产库名称", v.name)?.trim();
		e && await w(() => l.renameLibrary(v.id, e), "资产库已重命名");
	}, M = async () => {
		if (!v || !window.confirm(`删除资产库“${v.name}”？其中素材文件也会被删除。`)) return;
		let e = await w(() => l.deleteLibrary(v.id), "资产库已删除", "");
		e && S(e.library, e.library.active_library_id, "");
	}, N = async () => {
		if (!v) return;
		let e = window.prompt("新分组名称")?.trim();
		if (!e) return;
		let n = t.saveWorkflow || b?.type === "workflow" ? "workflow" : "image", r = await w(() => l.createCategory(v.id, e, n), "分组已创建");
		r?.category && S(r.library, v.id, r.category.id);
	}, P = async () => {
		if (!v || !b) return;
		let e = window.prompt("分组名称", b.name)?.trim();
		e && await w(() => l.renameCategory(v.id, b.id, e), "分组已重命名");
	}, F = async () => {
		!v || !b || !window.confirm(`删除分组“${b.name}”？其中素材文件也会被删除。`) || await w(() => l.deleteCategory(v.id, b.id), "分组已删除", "");
	}, I = async () => {
		if (!v || !b) {
			_("请先选择资产库与媒体分组");
			return;
		}
		if (b.type !== "image") {
			_("工作流分组不能保存媒体");
			return;
		}
		if (!d.trim()) {
			_("请输入本地 /assets 或 /output 媒体地址");
			return;
		}
		(await w(() => l.addUrl(v.id, b.id, d.trim(), p.trim() || k(d)), "素材已保存"))?.item && (f(""), h(""), t.saveItem && e());
	}, L = async (e) => {
		let t = window.prompt("素材名称", e.name)?.trim();
		t && await w(() => l.renameItem(e.id, t), "素材已重命名");
	}, R = async (e) => {
		!v || !window.confirm(`删除素材“${e.name}”？本地文件副本也会被删除。`) || await w(() => l.deleteItem(v.id, e.id), "素材已删除");
	}, ee = async () => {
		if (!(!v || !b || !t.saveWorkflow)) {
			if (b.type !== "workflow") {
				_("请选择工作流分组");
				return;
			}
			(await w(() => l.saveWorkflow(v.id, b.id, t.saveWorkflow), "工作流已保存到资产库"))?.item && e();
		}
	}, z = async (n) => {
		try {
			n.kind === "workflow" ? await t.onImportWorkflow?.(n) : t.onInsert?.(n), e();
		} catch (e) {
			_(A(e));
		}
	};
	return /* @__PURE__ */ (0, T.jsx)("div", {
		"aria-modal": "true",
		className: "modal open canvas-modern-backups canvas-asset-dialog",
		role: "dialog",
		children: /* @__PURE__ */ (0, T.jsxs)("section", {
			className: "modal-panel",
			children: [
				/* @__PURE__ */ (0, T.jsxs)("header", { children: [/* @__PURE__ */ (0, T.jsx)("strong", { children: t.saveWorkflow ? "保存工作流到资产库" : t.saveItem ? "保存到资产库" : "资产库" }), /* @__PURE__ */ (0, T.jsx)("button", {
					onClick: e,
					type: "button",
					children: "关闭"
				})] }),
				/* @__PURE__ */ (0, T.jsxs)("div", {
					className: "canvas-asset-toolbar",
					children: [
						/* @__PURE__ */ (0, T.jsx)("select", {
							"aria-label": "资产库",
							onChange: (e) => C(e.target.value),
							value: v?.id || "",
							children: n.libraries.map((e) => /* @__PURE__ */ (0, T.jsx)("option", {
								value: e.id,
								children: e.name
							}, e.id))
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							onClick: () => void D(),
							type: "button",
							children: "新建库"
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							disabled: !v,
							onClick: () => void j(),
							type: "button",
							children: "重命名库"
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							disabled: !v || n.libraries.length <= 1,
							onClick: () => void M(),
							type: "button",
							children: "删除库"
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							disabled: !v,
							onClick: () => void N(),
							type: "button",
							children: "新建分组"
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							disabled: !b,
							onClick: () => void P(),
							type: "button",
							children: "重命名分组"
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							disabled: !b,
							onClick: () => void F(),
							type: "button",
							children: "删除分组"
						}),
						/* @__PURE__ */ (0, T.jsx)("input", {
							"aria-label": "搜索资产",
							onChange: (e) => u(e.target.value),
							placeholder: "搜索名称或地址",
							value: c
						})
					]
				}),
				/* @__PURE__ */ (0, T.jsxs)("div", {
					className: "canvas-asset-body",
					children: [/* @__PURE__ */ (0, T.jsx)("aside", { children: y.map((e) => /* @__PURE__ */ (0, T.jsxs)("button", {
						className: e.id === b?.id ? "active" : "",
						onClick: () => s(e.id),
						type: "button",
						children: [/* @__PURE__ */ (0, T.jsx)("strong", { children: e.name }), /* @__PURE__ */ (0, T.jsx)("small", { children: e.type === "workflow" ? "工作流" : `${e.items.length} 项` })]
					}, e.id)) }), /* @__PURE__ */ (0, T.jsxs)("div", {
						className: "canvas-asset-content",
						children: [
							b?.type === "image" ? /* @__PURE__ */ (0, T.jsxs)("div", {
								className: "canvas-asset-add",
								children: [
									/* @__PURE__ */ (0, T.jsx)("input", {
										"aria-label": "素材地址",
										onChange: (e) => f(e.target.value),
										placeholder: "/output/result.png 或 /assets/…",
										value: d
									}),
									/* @__PURE__ */ (0, T.jsx)("input", {
										"aria-label": "素材名称",
										onChange: (e) => h(e.target.value),
										placeholder: "素材名称（可选）",
										value: p
									}),
									/* @__PURE__ */ (0, T.jsx)("button", {
										className: "primary-btn",
										onClick: () => void I(),
										type: "button",
										children: t.saveItem ? "保存输出" : "添加地址"
									})
								]
							}) : null,
							t.saveWorkflow ? /* @__PURE__ */ (0, T.jsxs)("div", {
								className: "canvas-asset-workflow-save",
								children: [/* @__PURE__ */ (0, T.jsxs)("span", { children: [
									"将“",
									t.saveWorkflow.name,
									"”及可找到的本地资源保存到当前工作流分组。"
								] }), /* @__PURE__ */ (0, T.jsx)("button", {
									className: "primary-btn",
									disabled: b?.type !== "workflow",
									onClick: () => void ee(),
									type: "button",
									children: "保存工作流"
								})]
							}) : null,
							/* @__PURE__ */ (0, T.jsx)("div", {
								className: "canvas-modern-asset-grid",
								children: x.map((e) => /* @__PURE__ */ (0, T.jsxs)("article", { children: [/* @__PURE__ */ (0, T.jsxs)("button", {
									className: "canvas-asset-preview",
									disabled: e.kind === "workflow" ? !t.onImportWorkflow : !t.onInsert,
									onClick: () => void z(e),
									type: "button",
									children: [O(e), /* @__PURE__ */ (0, T.jsx)("small", { children: e.name })]
								}), /* @__PURE__ */ (0, T.jsxs)("div", { children: [/* @__PURE__ */ (0, T.jsx)("button", {
									onClick: () => void L(e),
									type: "button",
									children: "重命名"
								}), /* @__PURE__ */ (0, T.jsx)("button", {
									onClick: () => void R(e),
									type: "button",
									children: "删除"
								})] })] }, e.id))
							}),
							x.length ? null : /* @__PURE__ */ (0, T.jsx)("p", { children: "当前分组暂无匹配内容" })
						]
					})]
				}),
				g ? /* @__PURE__ */ (0, T.jsx)("div", {
					className: "gate-status",
					role: "status",
					children: g
				}) : null
			]
		})
	});
}
function O(e) {
	return e.kind === "image" ? /* @__PURE__ */ (0, T.jsx)("img", {
		alt: e.name,
		src: e.url
	}) : /* @__PURE__ */ (0, T.jsx)("span", { children: e.kind === "video" ? "视频" : e.kind === "audio" ? "音频" : "工作流" });
}
function k(e) {
	let t = e.split(/[?#]/, 1)[0];
	return decodeURIComponent(t.split("/").pop() || "生成结果");
}
function A(e) {
	return e instanceof Error ? e.message : String(e);
}
//#endregion
//#region src/canvas/ui/smart-canvas-asset-panel.tsx
var j = {
	active_library_id: "",
	libraries: []
};
function M({ onClose: e, request: t }) {
	let [n, r] = (0, m.useState)(j), [i, a] = (0, m.useState)(""), [o, s] = (0, m.useState)({
		image: "",
		workflow: ""
	}), [c, u] = (0, m.useState)(t.saveWorkflow ? "workflow" : "image"), [d, f] = (0, m.useState)(""), [p, h] = (0, m.useState)("正在加载资产库…"), [g, _] = (0, m.useState)(!1), [v, y] = (0, m.useState)(""), [b, x] = (0, m.useState)(""), [S, C] = (0, m.useState)(null), [w, E] = (0, m.useState)(null), D = n.libraries.find((e) => e.id === i) ?? n.libraries[0], O = (0, m.useMemo)(() => (D?.categories || []).filter((e) => e.type === c), [D, c]), k = O.find((e) => e.id === o[c]) ?? O[0], A = (0, m.useMemo)(() => P(k, d), [k, d]), M = (e, t = D?.id || i, n = k?.id || "") => {
		r(e);
		let o = e.libraries.find((e) => e.id === t) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0];
		a(o?.id || ""), s((e) => ({
			image: o?.categories.find((t) => t.type === "image" && t.id === (c === "image" ? n : e.image))?.id || o?.categories.find((e) => e.type === "image")?.id || "",
			workflow: o?.categories.find((t) => t.type === "workflow" && t.id === (c === "workflow" ? n : e.workflow))?.id || o?.categories.find((e) => e.type === "workflow")?.id || ""
		}));
	};
	(0, m.useEffect)(() => {
		let e = !0;
		return l.list().then((t) => {
			e && (M(t.library, t.library.active_library_id, ""), h(""));
		}).catch((t) => e && h(V(t))), () => {
			e = !1;
		};
	}, []), (0, m.useEffect)(() => {
		window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		A.length,
		S,
		v,
		c
	]);
	let F = async (e, t, n = k?.id || "") => {
		try {
			let r = await e();
			return M(r.library, D?.id, n), h(t), r;
		} catch (e) {
			return h(V(e)), null;
		}
	}, I = (e) => {
		let t = n.libraries.find((t) => t.id === e);
		a(e), s({
			image: t?.categories.find((e) => e.type === "image")?.id || "",
			workflow: t?.categories.find((e) => e.type === "workflow")?.id || ""
		});
	}, te = async () => {
		if (!(!S || !D || !S.value.trim())) {
			if (S.kind === "category-new") {
				let e = await F(() => l.createCategory(D.id, S.value.trim(), c), "文件夹已创建", "");
				e?.category && M(e.library, D.id, e.category.id);
			} else S.category && await F(() => l.renameCategory(D.id, S.category.id, S.value.trim()), "文件夹已重命名");
			C(null);
		}
	}, H = async (e) => {
		let t = v, n = b.trim();
		y(""), x(""), !(!e || !t || !n) && await F(() => l.renameItem(t, n), "素材已重命名");
	}, U = async (e) => {
		if (!D || !k || k.type !== "image" || D.readonly || k.readonly) {
			h("请先选择可编辑的图片文件夹");
			return;
		}
		let t = e.filter((e) => e.url);
		t.length && await F(() => t.length === 1 ? l.addUrl(D.id, k.id, t[0].url, t[0].name) : l.addBatch(D.id, k.id, t), `已保存 ${t.length} 个素材`);
	}, W = async (e) => {
		if (e.preventDefault(), e.stopPropagation(), _(!1), c !== "image") return;
		let t = e.dataTransfer.getData("application/x-smart-canvas-image");
		if (t) {
			try {
				let e = JSON.parse(t);
				e.url && await U([{
					name: e.name || B(e.url),
					url: e.url
				}]);
			} catch {
				h("素材拖入失败");
			}
			return;
		}
		let n = [...e.dataTransfer.files].filter((e) => /^(image|video|audio)\//.test(e.type));
		if (n.length) {
			try {
				let e = await l.upload(n);
				await U((e.files || []).flatMap((e, t) => e.url ? [{
					name: e.name || n[t]?.name || "asset",
					url: e.url
				}] : []));
			} catch (e) {
				h(V(e));
			}
			return;
		}
		let r = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
		/^(?:https?:\/\/|\/)/i.test(r) && await U([{
			name: B(r),
			url: r
		}]);
	}, ne = async () => {
		if (t.saveWorkflow) {
			if (!D || !k || k.type !== "workflow") {
				h("请选择工作流文件夹");
				return;
			}
			(await F(() => l.saveWorkflow(D.id, k.id, t.saveWorkflow), "工作流已保存到资产库"))?.item && e();
			return;
		}
		t.saveItem?.url && (await U([{
			name: t.saveItem.name || B(t.saveItem.url),
			url: t.saveItem.url
		}]), e());
	};
	return /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [
		/* @__PURE__ */ (0, T.jsxs)("aside", {
			className: `asset-panel open ${g ? "drag-over" : ""}`,
			id: "assetPanel",
			onDragLeave: (e) => {
				e.currentTarget.contains(e.relatedTarget) || _(!1);
			},
			onDragOver: (e) => {
				c === "image" && (e.preventDefault(), e.stopPropagation(), e.dataTransfer.dropEffect = "copy", _(!0));
			},
			onDrop: (e) => void W(e),
			onPointerDown: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, T.jsxs)("div", {
					className: "asset-head",
					children: [/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "asset-title",
						children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "library" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "资产库" })]
					}), /* @__PURE__ */ (0, T.jsx)("button", {
						className: "asset-mini-btn",
						id: "assetCloseBtn",
						onClick: e,
						title: "关闭",
						type: "button",
						children: /* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "chevron-right" })
					})]
				}),
				/* @__PURE__ */ (0, T.jsx)("div", {
					className: "asset-tabs",
					children: ["image", "workflow"].map((e) => /* @__PURE__ */ (0, T.jsx)("button", {
						className: `asset-tab ${c === e ? "active" : ""}`,
						"data-asset-tab": e,
						onClick: () => {
							u(e), f("");
						},
						type: "button",
						children: e === "image" ? "图片资产" : "工作流"
					}, e))
				}),
				/* @__PURE__ */ (0, T.jsxs)("div", {
					id: "assetImageControls",
					children: [/* @__PURE__ */ (0, T.jsx)("select", {
						className: "asset-category-select asset-library-select",
						id: "assetLibrarySelect",
						onChange: (e) => I(e.target.value),
						title: "选择资产库",
						value: D?.id || "",
						children: n.libraries.map((e) => /* @__PURE__ */ (0, T.jsx)("option", {
							value: e.id,
							children: e.name
						}, e.id))
					}), /* @__PURE__ */ (0, T.jsxs)("div", {
						className: "asset-category-row",
						children: [
							/* @__PURE__ */ (0, T.jsx)("select", {
								className: "asset-category-select",
								id: "assetCategorySelect",
								onChange: (e) => s((t) => ({
									...t,
									[c]: e.target.value
								})),
								value: k?.id || "",
								children: O.map((e) => /* @__PURE__ */ (0, T.jsx)("option", {
									value: e.id,
									children: e.name
								}, e.id))
							}),
							/* @__PURE__ */ (0, T.jsx)("button", {
								className: "asset-mini-btn",
								disabled: !D || D.readonly,
								id: "assetAddCategoryBtn",
								onClick: () => C({
									kind: "category-new",
									value: c === "workflow" ? "工作流" : "素材"
								}),
								title: "新建文件夹",
								type: "button",
								children: /* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "folder-plus" })
							}),
							/* @__PURE__ */ (0, T.jsx)("button", {
								className: "asset-mini-btn",
								disabled: !k || D?.readonly || k?.readonly,
								id: "assetRenameCategoryBtn",
								onClick: () => k && C({
									category: k,
									kind: "category-rename",
									value: k.name
								}),
								title: "重命名文件夹",
								type: "button",
								children: /* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "pencil" })
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, T.jsxs)("label", {
					className: "asset-name-search",
					children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "search" }), /* @__PURE__ */ (0, T.jsx)("input", {
						autoComplete: "off",
						id: "assetNameSearch",
						onChange: (e) => f(e.target.value),
						placeholder: "搜索素材名称",
						type: "search",
						value: d
					})]
				}),
				/* @__PURE__ */ (0, T.jsx)("div", {
					className: `asset-drop-zone ${g ? "drag-over" : ""}`,
					id: "assetDropZone",
					onClick: () => {
						(t.saveItem || t.saveWorkflow) && ne();
					},
					children: t.saveWorkflow ? "保存当前工作流到当前文件夹" : t.saveItem ? "保存当前素材到当前文件夹" : "把画布图片拖到这里保存到当前文件夹"
				}),
				/* @__PURE__ */ (0, T.jsx)("div", {
					className: "asset-grid",
					id: "assetGrid",
					children: A.length ? A.map((e) => /* @__PURE__ */ (0, T.jsxs)("article", {
						className: `asset-item ${c === "workflow" ? "workflow-asset-item" : ""}`,
						"data-asset-id": e.id,
						"data-kind": e.kind,
						"data-name": e.name,
						"data-url": e.url,
						draggable: c === "image",
						onDoubleClick: () => {
							if (e.kind === "workflow") {
								let n = t.onImportWorkflow?.(e);
								n instanceof Promise && n.catch((e) => h(V(e)));
							} else t.onInsert?.(e);
						},
						onDragStart: (t) => {
							if (c !== "image") {
								t.preventDefault();
								return;
							}
							t.dataTransfer.effectAllowed = "copy", t.dataTransfer.setData("application/x-smart-asset", JSON.stringify({
								asset_item_id: e.id,
								asset_uris: e.asset_uris || L(e),
								kind: e.kind,
								name: e.name,
								url: e.url
							})), t.dataTransfer.setData("text/plain", e.url);
						},
						children: [/* @__PURE__ */ (0, T.jsxs)("div", {
							className: "asset-thumb-wrap",
							onMouseEnter: (t) => z(t, e, E),
							onMouseLeave: () => E(null),
							onMouseMove: (t) => z(t, e, E),
							children: [N(e), R(e)]
						}), /* @__PURE__ */ (0, T.jsxs)("div", {
							className: "asset-meta",
							children: [
								v === e.id ? /* @__PURE__ */ (0, T.jsx)("input", {
									"aria-label": "重命名素材",
									autoFocus: !0,
									className: "asset-rename-input",
									onBlur: () => void H(!0),
									onChange: (e) => x(e.target.value),
									onKeyDown: (e) => {
										e.key === "Enter" && H(!0), e.key === "Escape" && H(!1);
									},
									onPointerDown: (e) => e.stopPropagation(),
									value: b
								}) : /* @__PURE__ */ (0, T.jsx)("span", {
									className: "asset-name",
									title: e.name,
									children: e.name || "asset"
								}),
								ee(e),
								!D?.readonly && !k?.readonly ? /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [/* @__PURE__ */ (0, T.jsx)("button", {
									className: "asset-mini-btn",
									"data-rename-asset": e.id,
									onClick: (t) => {
										t.stopPropagation(), y(e.id), x(e.name || "asset");
									},
									title: "重命名",
									type: "button",
									children: /* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "pencil" })
								}), /* @__PURE__ */ (0, T.jsx)("button", {
									className: "asset-mini-btn",
									"data-delete-asset": e.id,
									onClick: (t) => {
										t.stopPropagation(), F(() => l.deleteItem(D.id, e.id), "素材已删除");
									},
									title: "删除",
									type: "button",
									children: /* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "trash-2" })
								})] }) : null
							]
						})]
					}, e.id)) : /* @__PURE__ */ (0, T.jsx)("div", {
						className: "asset-empty",
						children: d && k?.items.length ? "没有找到匹配名称的素材" : c === "workflow" ? "暂无工作流资产" : "当前文件夹暂无素材"
					})
				}),
				/* @__PURE__ */ (0, T.jsx)("div", {
					className: "workflow-empty",
					id: "workflowEmpty",
					style: { display: "none" },
					children: "工作流资产先预留在这里，后续接入。"
				}),
				p ? /* @__PURE__ */ (0, T.jsx)("div", {
					className: "asset-empty",
					role: "status",
					children: p
				}) : null
			]
		}),
		/* @__PURE__ */ (0, T.jsx)("div", {
			className: `asset-dialog-backdrop ${S ? "open" : ""}`,
			hidden: !S,
			id: "assetDialogBackdrop",
			onMouseDown: (e) => {
				e.target === e.currentTarget && C(null);
			},
			children: /* @__PURE__ */ (0, T.jsxs)("div", {
				className: "asset-dialog",
				children: [
					/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "asset-dialog-title",
						children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "folder-pen" }), /* @__PURE__ */ (0, T.jsx)("span", {
							id: "assetDialogTitle",
							children: S?.kind === "category-new" ? "新建文件夹" : "重命名文件夹"
						})]
					}),
					/* @__PURE__ */ (0, T.jsx)("textarea", {
						autoComplete: "off",
						className: "asset-dialog-input",
						id: "assetDialogInput",
						onChange: (e) => C((t) => t && {
							...t,
							value: e.target.value
						}),
						onKeyDown: (e) => {
							e.key === "Enter" && (e.preventDefault(), te()), e.key === "Escape" && C(null);
						},
						rows: 1,
						value: S?.value || ""
					}),
					/* @__PURE__ */ (0, T.jsx)("select", {
						className: "asset-dialog-input",
						hidden: !0,
						id: "assetDialogTarget"
					}),
					/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "asset-dialog-actions",
						children: [/* @__PURE__ */ (0, T.jsx)("button", {
							className: "asset-dialog-btn secondary",
							id: "assetDialogCancel",
							onClick: () => C(null),
							type: "button",
							children: "取消"
						}), /* @__PURE__ */ (0, T.jsx)("button", {
							className: "asset-dialog-btn primary",
							id: "assetDialogOk",
							onClick: () => void te(),
							type: "button",
							children: "确定"
						})]
					})
				]
			})
		}),
		w ? /* @__PURE__ */ (0, T.jsxs)("div", {
			className: "asset-hover-preview",
			id: "assetHoverPreview",
			style: {
				display: "block",
				left: w.left,
				top: w.top
			},
			children: [w.item.kind === "video" ? /* @__PURE__ */ (0, T.jsx)("video", {
				autoPlay: !0,
				loop: !0,
				muted: !0,
				playsInline: !0,
				src: w.item.url
			}) : /* @__PURE__ */ (0, T.jsx)("img", {
				alt: "asset preview",
				src: w.item.thumbnail || w.item.url
			}), /* @__PURE__ */ (0, T.jsx)("div", {
				className: "asset-hover-name",
				children: w.item.name
			})]
		}) : null
	] });
}
function N(e) {
	return e.kind === "video" ? /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [/* @__PURE__ */ (0, T.jsx)("video", {
		className: "asset-thumb",
		muted: !0,
		preload: "metadata",
		src: e.thumbnail || e.url
	}), /* @__PURE__ */ (0, T.jsxs)("span", {
		className: "asset-video-badge",
		children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "film" }), "VIDEO"]
	})] }) : e.kind === "audio" ? /* @__PURE__ */ (0, T.jsxs)("div", {
		className: "media-thumb audio-thumb asset-thumb",
		children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "file-audio" }), /* @__PURE__ */ (0, T.jsx)("span", { children: e.name || "Audio" })]
	}) : e.kind === "workflow" ? /* @__PURE__ */ (0, T.jsxs)("div", {
		className: "media-thumb workflow-thumb asset-thumb",
		children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "workflow" }), /* @__PURE__ */ (0, T.jsx)("span", { children: e.name || "Workflow" })]
	}) : /* @__PURE__ */ (0, T.jsx)("img", {
		alt: "",
		className: "asset-thumb",
		src: e.thumbnail || e.url
	});
}
function P(e, t) {
	let n = t.trim().toLocaleLowerCase();
	return (e?.items || []).filter((e) => !n || String(e.name || "").toLocaleLowerCase().includes(n));
}
function F(e) {
	return e.registrations?.volcengine;
}
function I(e) {
	return e.asset_uris?.volcengine || F(e)?.status === "Active" ? "active" : F(e)?.status === "Processing" ? "processing" : F(e)?.status === "Failed" ? "failed" : "none";
}
function L(e) {
	let t = F(e);
	return t?.status === "Active" && t.asset_uri ? { volcengine: t.asset_uri } : {};
}
function R(e) {
	return I(e) === "active" ? /* @__PURE__ */ (0, T.jsx)("span", {
		className: "smart-face-verified-badge",
		title: "头像认证已通过",
		children: /* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "badge-check" })
	}) : null;
}
function ee(e) {
	let t = I(e);
	return t === "processing" ? /* @__PURE__ */ (0, T.jsx)("span", {
		className: "asset-local-tag",
		title: "头像认证中",
		children: "认证中"
	}) : t === "failed" ? /* @__PURE__ */ (0, T.jsx)("span", {
		className: "asset-local-tag",
		title: F(e)?.detail || "头像认证失败",
		children: "认证失败"
	}) : null;
}
function z(e, t, n) {
	let r = e.clientX - 260 - 16;
	r < 14 && (r = e.clientX + 16), n({
		item: t,
		left: Math.max(14, Math.min(window.innerWidth - 260 - 14, r)),
		top: Math.max(14, Math.min(window.innerHeight - 300 - 14, e.clientY + 12))
	});
}
function B(e) {
	try {
		return decodeURIComponent(e.split(/[?#]/, 1)[0].split("/").pop() || "asset");
	} catch {
		return "asset";
	}
}
function V(e) {
	return e instanceof Error ? e.message : String(e);
}
//#endregion
//#region src/canvas/ui/smart-canvas-workflow-panel.tsx
function te({ onClose: e, onImport: t, onSaveToLibrary: n, onStatus: r, title: i }) {
	let [a, o] = (0, m.useState)(() => W()), [s, c] = (0, m.useState)(!1), [l, u] = (0, m.useState)(""), [d, f] = (0, m.useState)(""), p = (0, m.useRef)(null);
	(0, m.useEffect)(() => {
		let e = () => o(W());
		return window.addEventListener("canvas-board-v2-selection", e), window.requestAnimationFrame(() => window.lucide?.createIcons()), () => window.removeEventListener("canvas-board-v2-selection", e);
	}, []);
	let h = () => {
		let e = W();
		return o(e), e;
	}, g = () => {
		let e = h();
		if (!e.nodes.length) {
			u("未选择节点，请先选中要导出的组件"), r("未选择节点，请先选中要导出的组件");
			return;
		}
		let t = H(e);
		ie(new Blob([JSON.stringify(t, null, 2)], { type: "application/json" }), re(i, "json")), r("已导出智能画布工作流 JSON");
	}, _ = async () => {
		let e = h();
		if (!e.nodes.length) {
			u("未选择节点，请先选中要导出的组件"), r("未选择节点，请先选中要导出的组件");
			return;
		}
		let t = re(i, "zip");
		f("busy"), u("正在打包资源...");
		try {
			let n = await fetch("/api/canvas-workflows/export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...H(e),
					filename: t,
					include_resources: !0
				})
			});
			if (!n.ok) throw Error(await ae(n, "导出工作流失败"));
			ie(await n.blob(), t, n.headers.get("Content-Disposition")), f("success"), u(`已导出 ${e.nodes.length} 个节点，包含可找到的本地资源`), r("已导出包含资源的智能画布工作流包");
		} catch (e) {
			f(""), u(G(e)), r(G(e));
		}
	}, v = async (e) => {
		if (e) {
			f("busy"), u("正在导入工作流...");
			try {
				let n = await t(e);
				r(n ? `已导入 ${n} 个节点` : "文件中没有可导入节点");
			} catch (e) {
				f(""), u(G(e)), r(G(e));
			}
		}
	}, y = () => {
		let e = h();
		if (!e.nodes.length) {
			u("未选择节点，请先选中要导出的组件");
			return;
		}
		n(e);
	}, b = async () => {
		let e = U(h().nodes);
		if (!e.length) {
			u("选区中没有可批量导出的媒体或文本"), r("选区中没有可批量导出的媒体或文本");
			return;
		}
		let t = window.prompt("导出到服务器文件夹（留空使用默认导出目录）", "");
		if (t !== null) {
			f("busy"), u("正在批量导出选区结果...");
			try {
				let n = await fetch("/api/smart-canvas/group-export", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						folder: t.trim(),
						group_name: i || "canvas",
						items: e
					})
				}), a = await n.json().catch(() => ({}));
				if (!n.ok) throw Error(a.detail || "批量导出失败");
				let o = `已导出 ${Number(a.count || e.length)} 项到 ${String(a.folder || "默认导出目录")}`;
				f("success"), u(o), r(o);
			} catch (e) {
				f(""), u(G(e)), r(G(e));
			}
		}
	}, x = (e) => {
		e.preventDefault(), e.stopPropagation(), c(!1);
		let t = [...e.dataTransfer.files].find((e) => /\.(json|zip)$/i.test(e.name));
		t && v(t);
	}, S = a.nodes.length ? `已选择 ${a.nodes.length} 个节点，${a.connections.length} 条连线` : "未选择节点，请先选中要导出的组件", C = a.nodes.length ? "导出当前选中内容，或把工作流导入到当前画布" : "请先选中节点再导出；导入会追加到当前画布";
	return /* @__PURE__ */ (0, T.jsxs)("aside", {
		className: "workflow-transfer-panel open",
		id: "smartWorkflowTransferModal",
		onPointerDown: (e) => e.stopPropagation(),
		children: [/* @__PURE__ */ (0, T.jsxs)("div", {
			className: "workflow-transfer-head",
			children: [/* @__PURE__ */ (0, T.jsxs)("div", { children: [/* @__PURE__ */ (0, T.jsx)("div", {
				className: "workflow-transfer-title",
				children: "导入导出工作流"
			}), /* @__PURE__ */ (0, T.jsx)("div", {
				className: "workflow-transfer-sub",
				id: "smartWorkflowTransferSub",
				children: C
			})] }), /* @__PURE__ */ (0, T.jsx)("button", {
				className: "asset-mini-btn",
				onClick: e,
				title: "关闭",
				type: "button",
				children: /* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "x" })
			})]
		}), /* @__PURE__ */ (0, T.jsxs)("div", {
			className: "workflow-transfer-body",
			children: [/* @__PURE__ */ (0, T.jsxs)("section", {
				className: "workflow-transfer-card",
				children: [
					/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "workflow-transfer-card-head",
						children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "upload" }), /* @__PURE__ */ (0, T.jsx)("strong", { children: "导出工作流" })]
					}),
					/* @__PURE__ */ (0, T.jsx)("p", { children: "使用当前选中的节点和它们之间的连线生成工作流。" }),
					/* @__PURE__ */ (0, T.jsx)("div", {
						className: `workflow-transfer-meta ${d}`,
						id: "smartWorkflowExportMeta",
						children: l || S
					}),
					/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "workflow-transfer-actions workflow-export-actions",
						children: [
							/* @__PURE__ */ (0, T.jsxs)("button", {
								className: "workflow-transfer-btn secondary",
								onClick: g,
								type: "button",
								children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "file-json" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "导出 JSON" })]
							}),
							/* @__PURE__ */ (0, T.jsxs)("button", {
								className: "workflow-transfer-btn primary",
								onClick: () => void _(),
								type: "button",
								children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "package" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "导出并包含资源" })]
							}),
							/* @__PURE__ */ (0, T.jsxs)("button", {
								className: "workflow-transfer-btn secondary",
								onClick: y,
								type: "button",
								children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "library" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "保存到工作流库" })]
							}),
							/* @__PURE__ */ (0, T.jsxs)("button", {
								className: "workflow-transfer-btn secondary",
								onClick: () => void b(),
								type: "button",
								children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "folder-output" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "批量导出选区结果" })]
							})
						]
					})
				]
			}), /* @__PURE__ */ (0, T.jsxs)("section", {
				className: "workflow-transfer-card",
				children: [
					/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "workflow-transfer-card-head",
						children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "download" }), /* @__PURE__ */ (0, T.jsx)("strong", { children: "导入工作流" })]
					}),
					/* @__PURE__ */ (0, T.jsx)("p", { children: "支持工作流 JSON，也支持包含资源的 ZIP 包。导入内容会追加到当前画布。" }),
					/* @__PURE__ */ (0, T.jsxs)("div", {
						className: `workflow-import-drop ${s ? "drag-over" : ""}`,
						id: "smartWorkflowImportDropZone",
						onClick: () => p.current?.click(),
						onDragLeave: () => c(!1),
						onDragOver: (e) => {
							e.preventDefault(), e.stopPropagation(), e.dataTransfer.dropEffect = "copy", c(!0);
						},
						onDrop: x,
						children: [
							/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "file-up" }),
							/* @__PURE__ */ (0, T.jsx)("span", { children: "拖入 JSON / ZIP 工作流" }),
							/* @__PURE__ */ (0, T.jsx)("small", { children: "或点击选择文件" })
						]
					}),
					/* @__PURE__ */ (0, T.jsx)("input", {
						accept: ".json,.zip,application/json,application/zip",
						hidden: !0,
						id: "smartWorkflowImportInput",
						onChange: (e) => {
							let t = e.target.files?.[0];
							e.target.value = "", v(t);
						},
						ref: p,
						type: "file"
					})
				]
			})]
		})]
	});
}
function H(e, t = Date.now()) {
	return {
		format: "infinite-smart-canvas-workflow",
		version: 1,
		canvas_type: "smart",
		exported_at: t,
		nodes: e.nodes.map(ne),
		connections: structuredClone(e.connections)
	};
}
function U(e) {
	let t = [], n = /* @__PURE__ */ new Set(), r = (e, r) => {
		let i = e && typeof e == "object" ? e : {}, a = typeof e == "string" ? e : String(i.url || "");
		if (!a || n.has(a)) return;
		n.add(a);
		let o = String(i.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(a) ? "video" : /\.(mp3|wav|m4a)(\?|$)/i.test(a) ? "audio" : "image"));
		t.push({
			kind: o,
			name: String(i.name || r),
			url: a
		});
	};
	return e.forEach((e, n) => {
		if (!e || typeof e != "object") return;
		let i = e, a = String(i.title || i.name || `${String(i.type || "node")}-${n + 1}`);
		i.url && r(i, a), Array.isArray(i.images) && i.images.forEach((e, t) => r(e, `${a}-${t + 1}`));
		let o = String(i.outputText || i.type === "prompt" && i.text || "").trim();
		o && t.push({
			kind: "text",
			name: `${a}.txt`,
			text: o
		});
	}), t;
}
function W() {
	return window.CanvasBoardV2?.selectedNodeIds().length ? window.CanvasBoardV2.exportSelection() : {
		connections: [],
		nodes: []
	};
}
function ne(e) {
	let t = structuredClone(e && typeof e == "object" ? e : {});
	return t.running = !1, t.pending = 0, t.queued = !1, delete t.pendingTasks, delete t._dom, t;
}
function re(e, t) {
	return `${(e || "smart-canvas").trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "-").slice(0, 48) || "smart-canvas"}-workflow-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[-:T]/g, "")}.${t}`;
}
function ie(e, t, n) {
	let r = n?.match(/filename\*=UTF-8''([^;]+)/i)?.[1], i = n?.match(/filename="?([^";]+)"?/i)?.[1], a = URL.createObjectURL(e);
	Object.assign(document.createElement("a"), {
		download: r ? decodeURIComponent(r) : i || t,
		href: a
	}).click(), URL.revokeObjectURL(a);
}
async function ae(e, t) {
	return (await e.json().catch(() => ({}))).detail || t;
}
function G(e) {
	return e instanceof Error ? e.message : String(e);
}
//#endregion
//#region src/canvas/ui/smart-canvas-log-cost-panel.tsx
function oe({ document: e, mode: t, onClose: n }) {
	let r = Array.isArray(e.logs) ? e.logs.filter((e) => !!(e && typeof e == "object")) : [], i = ce(r), [a, o] = (0, m.useState)("");
	(0, m.useEffect)(() => {
		window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [r.length, t]);
	let s = (e, t) => {
		t && navigator.clipboard?.writeText(t).catch(() => void 0), o(e), window.setTimeout(() => o((t) => t === e ? "" : t), 900);
	};
	return /* @__PURE__ */ (0, T.jsx)("div", {
		className: "log-modal open",
		id: "smartLogModal",
		onClick: n,
		children: /* @__PURE__ */ (0, T.jsxs)("div", {
			className: `log-panel ${t === "cost" ? "cost-mode" : ""}`,
			id: "smartLogPanel",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, T.jsxs)("div", {
					className: "log-head",
					children: [/* @__PURE__ */ (0, T.jsxs)("div", { children: [/* @__PURE__ */ (0, T.jsx)("div", {
						className: "log-title",
						id: "smartLogTitle",
						children: t === "cost" ? "费用仪表盘" : "生成日志"
					}), /* @__PURE__ */ (0, T.jsx)("div", {
						className: "log-cost-summary",
						id: "smartCostSummary",
						children: `总计 ${le(i.total)} · 已计费 ${i.calls} 次${i.unknown ? ` · 待定价 ${i.unknown} 笔` : ""}`
					})] }), /* @__PURE__ */ (0, T.jsx)("button", {
						className: "preview-icon-btn",
						onClick: n,
						title: "关闭",
						type: "button",
						children: /* @__PURE__ */ (0, T.jsx)("i", {
							className: "w-4 h-4",
							"data-lucide": "x"
						})
					})]
				}),
				/* @__PURE__ */ (0, T.jsxs)("div", {
					className: "cost-dashboard",
					id: "smartCostDashboard",
					children: [
						/* @__PURE__ */ (0, T.jsxs)("div", {
							className: "cost-card cost-card-total",
							children: [
								/* @__PURE__ */ (0, T.jsx)("span", { children: "画布总费用" }),
								/* @__PURE__ */ (0, T.jsx)("strong", {
									id: "smartCostTotal",
									children: le(i.total)
								}),
								/* @__PURE__ */ (0, T.jsx)("small", {
									id: "smartCostMeta",
									children: i.estimated ? `含历史预估 ${le(i.estimated)}` : "按调用时价格快照"
								})
							]
						}),
						/* @__PURE__ */ (0, T.jsxs)("div", {
							className: "cost-card",
							children: [
								/* @__PURE__ */ (0, T.jsx)("span", { children: "图片费用" }),
								/* @__PURE__ */ (0, T.jsx)("strong", {
									id: "smartCostImage",
									children: le(i.image)
								}),
								/* @__PURE__ */ (0, T.jsx)("small", { children: "按张 / 次" })
							]
						}),
						/* @__PURE__ */ (0, T.jsxs)("div", {
							className: "cost-card",
							children: [
								/* @__PURE__ */ (0, T.jsx)("span", { children: "视频费用" }),
								/* @__PURE__ */ (0, T.jsx)("strong", {
									id: "smartCostVideo",
									children: le(i.video)
								}),
								/* @__PURE__ */ (0, T.jsx)("small", { children: "按秒 / 次" })
							]
						}),
						/* @__PURE__ */ (0, T.jsxs)("div", {
							className: "cost-card",
							children: [
								/* @__PURE__ */ (0, T.jsx)("span", { children: "已计费调用" }),
								/* @__PURE__ */ (0, T.jsx)("strong", {
									id: "smartCostCalls",
									children: i.calls
								}),
								/* @__PURE__ */ (0, T.jsxs)("small", {
									id: "smartCostUnknown",
									children: [
										"待定价 ",
										i.unknown,
										" 笔"
									]
								})
							]
						})
					]
				}),
				/* @__PURE__ */ (0, T.jsx)("div", {
					className: "log-list",
					id: "smartLogList",
					children: r.length ? r.map((t, n) => {
						let r = String(t.id || n), i = ["error", "failed"].includes(String(t.status || "").toLowerCase()), o = de(t.request), c = (Array.isArray(t.outputs) ? t.outputs : []).flatMap(K), l = se(t), u = String(o.task_id || o.taskId || o.prompt_id || o.promptId || ""), d = String(o.workflow_json || o.workflow || o.provider_id || o.providerId || o.backend || ""), f = [
							q(t.createdAt || t.created_at),
							`输出 ${c.length}`,
							u ? `ID ${u}` : "",
							d
						].filter(Boolean), p = String(t.prompt || "暂无提示词信息");
						return /* @__PURE__ */ (0, T.jsxs)("div", {
							className: `log-item ${i ? "failed" : ""}`,
							"data-log-id": r,
							children: [/* @__PURE__ */ (0, T.jsxs)("div", {
								className: "log-main",
								children: [
									/* @__PURE__ */ (0, T.jsxs)("div", {
										className: "log-meta",
										children: [
											/* @__PURE__ */ (0, T.jsx)("span", {
												className: `log-chip ${i ? "status-failed" : "status-ok"}`,
												children: i ? "失败" : "成功"
											}),
											/* @__PURE__ */ (0, T.jsx)("span", {
												className: "log-chip",
												children: String(t.platform || "-")
											}),
											t.model ? /* @__PURE__ */ (0, T.jsx)("span", {
												className: "log-chip",
												children: String(t.model)
											}) : null,
											l?.status === "priced" ? /* @__PURE__ */ (0, T.jsx)("span", {
												className: `log-chip ${l.source === "estimated" ? "cost-estimated" : ""}`,
												title: l.source === "estimated" ? "根据历史价格回算" : "调用时价格快照",
												children: `${le(l.amount_micros)}${l.source === "estimated" ? " 预估" : ""}`
											}) : l?.status === "unknown" ? /* @__PURE__ */ (0, T.jsx)("span", {
												className: "log-chip cost-unknown",
												children: "待定价"
											}) : null,
											/* @__PURE__ */ (0, T.jsx)("span", {
												className: "log-chip",
												children: J(Number(t.runMs || t.run_ms || 0))
											})
										]
									}),
									/* @__PURE__ */ (0, T.jsx)("div", {
										className: "log-subline",
										children: f.map((e, t) => /* @__PURE__ */ (0, T.jsx)("span", {
											title: e,
											children: e
										}, t))
									}),
									t.error ? /* @__PURE__ */ (0, T.jsx)("div", {
										className: "log-error",
										title: String(t.error),
										children: String(t.error)
									}) : null,
									/* @__PURE__ */ (0, T.jsx)("div", {
										className: `log-prompt ${a === r ? "copied" : ""}`,
										"data-prompt": String(t.prompt || ""),
										onClick: () => s(r, String(t.prompt || "")),
										title: p,
										children: a === r ? "已复制" : p
									})
								]
							}), /* @__PURE__ */ (0, T.jsx)("div", {
								className: "log-thumbs",
								children: c.slice(0, 8).map((n, r) => n.kind === "video" ? /* @__PURE__ */ (0, T.jsx)("video", {
									"data-kind": "video",
									"data-url": n.url,
									muted: !0,
									onClick: () => fe(e, t, n.url),
									preload: "metadata",
									src: n.url
								}, `${n.url}-${r}`) : /* @__PURE__ */ (0, T.jsx)("img", {
									alt: "output",
									"data-kind": "image",
									"data-url": n.url,
									loading: "lazy",
									onClick: () => fe(e, t, n.url),
									src: n.url
								}, `${n.url}-${r}`))
							})]
						}, r);
					}) : /* @__PURE__ */ (0, T.jsx)("div", {
						className: "log-empty",
						children: "暂无生成日志"
					})
				})
			]
		})
	});
}
function se(e) {
	if (["error", "failed"].includes(String(e.status || "").toLowerCase())) return null;
	let t = de(e.cost), n = String(t.kind || e.billingKind || e.kind || de(e.request).kind || ue(e)), r = String(t.source || "actual");
	if (String(t.status || "") === "priced" && Number.isFinite(Number(t.amount_micros))) return {
		amount_micros: Math.max(0, Number(t.amount_micros)),
		kind: n,
		source: r,
		status: "priced"
	};
	let i = typeof e.cost == "number" ? Number(e.cost) : Number(e.cost_cny || 0);
	return Number.isFinite(i) && i > 0 ? {
		amount_micros: Math.round(i * 1e6),
		kind: n,
		source: r,
		status: "priced"
	} : {
		kind: n,
		source: r || "estimated",
		status: "unknown"
	};
}
function ce(e) {
	return e.reduce((e, t) => {
		if (!t || typeof t != "object") return e;
		let n = se(t);
		return n?.status === "priced" ? (e.total += n.amount_micros, n.kind === "video" ? e.video += n.amount_micros : e.image += n.amount_micros, e.calls += 1, n.source === "estimated" && (e.estimated += n.amount_micros)) : n?.status === "unknown" && (e.unknown += 1), e;
	}, {
		calls: 0,
		estimated: 0,
		image: 0,
		total: 0,
		unknown: 0,
		video: 0
	});
}
function le(e) {
	return `¥${new Intl.NumberFormat("zh-CN", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 6
	}).format(Number(e || 0) / 1e6)}`;
}
function K(e) {
	let t = de(e), n = typeof e == "string" ? e : String(t.url || "");
	return n ? [{
		kind: String(t.kind || "").toLowerCase() === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(n) ? "video" : "image",
		url: n
	}] : [];
}
function ue(e) {
	return (Array.isArray(e.outputs) ? e.outputs : []).some((e) => K(e)[0]?.kind === "video") ? "video" : "image";
}
function q(e) {
	let t = Number(e || Date.now());
	return new Date(t < 1e10 ? t * 1e3 : t).toLocaleString("zh-CN");
}
function J(e) {
	return e ? e < 6e4 ? `${(e / 1e3).toFixed(1)}s` : `${Math.floor(e / 6e4)}m ${Math.floor(e % 6e4 / 1e3)}s` : "0.0s";
}
function de(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
function fe(e, t, n) {
	let r = (Array.isArray(e.nodes) ? e.nodes : []).find((e) => e && typeof e == "object" && String(e.id || "") === String(t.nodeId || ""));
	r && window.CanvasBoardV2?.openOutputLightbox(r, n);
}
//#endregion
//#region src/canvas/ui/smart-canvas-backup-and-lock.tsx
function pe({ backups: e, lockHolder: t, lockIssue: n, onAcquireLock: r, onCloseBackups: i, onCreateBackup: a, onDeleteBackup: o, onRestoreBackup: s, onStatus: c }) {
	let [l, u] = (0, m.useState)("");
	(0, m.useEffect)(() => {
		window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		e,
		l,
		t
	]);
	let d = async (e, t) => {
		if (!l) {
			u(e);
			try {
				await t();
			} catch (e) {
				c(e instanceof Error ? e.message : String(e));
			} finally {
				u("");
			}
		}
	}, f = (e) => {
		if (t) {
			c("画布正在被其他人编辑，无法恢复备份");
			return;
		}
		window.confirm("恢复此备份？当前画布将被覆盖。") && d(`restore:${e}`, () => s(e));
	};
	return /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [/* @__PURE__ */ (0, T.jsx)("div", {
		className: "smart-lock-overlay",
		hidden: !t,
		id: "smartLockOverlay",
		children: /* @__PURE__ */ (0, T.jsxs)("div", {
			className: "smart-lock-card",
			children: [
				/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "lock" }),
				/* @__PURE__ */ (0, T.jsx)("strong", { children: "画布编辑中" }),
				/* @__PURE__ */ (0, T.jsx)("span", {
					id: "smartLockMessage",
					children: t ? `${ge(t)} 正在编辑此画布` : ""
				}),
				/* @__PURE__ */ (0, T.jsx)("small", { children: "你只能查看、移动和缩放画布，等对方退出后会自动解锁。" }),
				n ? /* @__PURE__ */ (0, T.jsx)("small", {
					title: n,
					children: n
				}) : null,
				/* @__PURE__ */ (0, T.jsxs)("button", {
					disabled: l === "lock",
					id: "smartLockRetryBtn",
					onClick: () => void d("lock", async () => {
						await r();
					}),
					type: "button",
					children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "refresh-cw" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "刷新状态" })]
				})
			]
		})
	}), e ? /* @__PURE__ */ (0, T.jsx)("div", {
		className: "log-modal open",
		id: "smartBackupModal",
		onClick: (e) => {
			e.target === e.currentTarget && i();
		},
		children: /* @__PURE__ */ (0, T.jsxs)("div", {
			className: "log-panel backup-panel",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, T.jsxs)("div", {
					className: "log-head",
					children: [/* @__PURE__ */ (0, T.jsx)("div", {
						className: "log-title",
						children: "画布备份"
					}), /* @__PURE__ */ (0, T.jsx)("button", {
						className: "preview-icon-btn",
						onClick: i,
						title: "关闭",
						type: "button",
						children: /* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "x" })
					})]
				}),
				/* @__PURE__ */ (0, T.jsxs)("button", {
					className: "run-btn backup-create",
					disabled: !!l,
					onClick: () => void d("create", a),
					type: "button",
					children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "hard-drive" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "立即备份" })]
				}),
				/* @__PURE__ */ (0, T.jsx)("div", {
					className: "log-list",
					children: e.length ? e.map((e) => {
						let t = String(e.filename || "");
						return /* @__PURE__ */ (0, T.jsxs)("div", {
							className: "log-item",
							"data-backup-filename": t,
							children: [/* @__PURE__ */ (0, T.jsxs)("div", {
								className: "log-main",
								children: [/* @__PURE__ */ (0, T.jsx)("div", {
									className: "log-meta",
									children: /* @__PURE__ */ (0, T.jsx)("span", {
										className: "log-chip",
										children: String(e.title || "未命名画布")
									})
								}), /* @__PURE__ */ (0, T.jsxs)("div", {
									className: "log-subline",
									children: [
										/* @__PURE__ */ (0, T.jsx)("span", { children: he(e.timestamp) }),
										/* @__PURE__ */ (0, T.jsxs)("span", { children: [Number(e.node_count || 0), " 个节点"] }),
										/* @__PURE__ */ (0, T.jsx)("span", { children: me(e.size) })
									]
								})]
							}), /* @__PURE__ */ (0, T.jsxs)("div", {
								className: "backup-row-actions",
								children: [/* @__PURE__ */ (0, T.jsx)("button", {
									className: "preview-icon-btn",
									"data-backup-restore": t,
									disabled: l === `restore:${t}`,
									onClick: () => f(t),
									title: "恢复",
									type: "button",
									children: /* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "rotate-ccw" })
								}), /* @__PURE__ */ (0, T.jsx)("button", {
									className: "preview-icon-btn",
									"data-backup-delete": t,
									disabled: l === `delete:${t}`,
									onClick: () => void d(`delete:${t}`, () => o(t)),
									title: "删除",
									type: "button",
									children: /* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "trash-2" })
								})]
							})]
						}, t);
					}) : /* @__PURE__ */ (0, T.jsx)("div", {
						className: "log-empty",
						children: "暂无备份"
					})
				})
			]
		})
	}) : null] });
}
function me(e) {
	let t = Math.max(0, Number(e || 0));
	return t > 1024 ? `${(t / 1024).toFixed(1)} KB` : `${t} B`;
}
function he(e) {
	let t = Number(e || 0);
	return t ? new Date(t).toLocaleString() : "--";
}
function ge(e) {
	return String(e.username || e.ip || "其他用户");
}
//#endregion
//#region src/canvas/ui/prompt-library-dialog.tsx
function _e({ onClose: e, request: t }) {
	let [n, r] = (0, m.useState)({
		active_library_id: "",
		libraries: []
	}), [i, a] = (0, m.useState)(""), [o, s] = (0, m.useState)(""), [c, l] = (0, m.useState)(""), [u, d] = (0, m.useState)("正在加载提示词库…"), [f, h] = (0, m.useState)({
		category: "",
		name: "",
		negative: "",
		positive: t.initialText || "",
		scene: ""
	}), g = n.libraries.find((e) => e.id === i) ?? n.libraries[0], _ = (0, m.useMemo)(() => (g?.items || []).filter((e) => ve(e, c)), [g, c]), v = g?.items.find((e) => e.id === o), y = (e, t = i, n = o) => {
		r(e);
		let c = e.libraries.find((e) => e.id === t) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0];
		a(c?.id || "");
		let l = c?.items.find((e) => e.id === n) ?? c?.items[0];
		s(l?.id || ""), l && h(Y(l));
	};
	(0, m.useEffect)(() => {
		let e = !0;
		return p.list().then((t) => {
			e && (y(t.library, t.library.active_library_id, ""), d(""));
		}).catch((t) => e && d(t instanceof Error ? t.message : String(t))), () => {
			e = !1;
		};
	}, []);
	let b = (e) => {
		let r = n.libraries.find((t) => t.id === e);
		a(e), s(r?.items[0]?.id || ""), h(r?.items[0] ? Y(r.items[0]) : {
			category: r?.categories[0]?.id || "",
			name: "",
			negative: "",
			positive: t.initialText || "",
			scene: ""
		});
	}, x = (e) => {
		s(e.id), h(Y(e));
	}, S = () => {
		s(""), h({
			category: g?.categories[0]?.id || "",
			name: "",
			negative: "",
			positive: t.initialText || "",
			scene: ""
		}), d("正在新建提示词");
	}, C = async () => {
		if (!g) {
			d("请先创建提示词库");
			return;
		}
		if (!f.positive.trim()) {
			d("提示词内容不能为空");
			return;
		}
		try {
			let e = await p.savePrompt(g.id, {
				...v ? { id: v.id } : {},
				category: f.category,
				name: f.name.trim() || f.positive.trim().slice(0, 28),
				negative: f.negative,
				positive: f.positive,
				scene: f.scene
			}), t = String(e.item?.id || v?.id || "");
			y(e.library, g.id, t), d(v ? "提示词已更新" : "提示词已创建");
		} catch (e) {
			d(e instanceof Error ? e.message : String(e));
		}
	}, w = async () => {
		if (!(!v || !window.confirm(`删除提示词“${v.name}”？`))) try {
			let e = await p.deletePrompts([v.id]);
			y(e.library, g?.id, ""), d("提示词已删除");
		} catch (e) {
			d(e instanceof Error ? e.message : String(e));
		}
	}, E = async () => {
		let e = window.prompt("新提示词库名称")?.trim();
		if (e) try {
			let t = await p.createLibrary(e);
			y(t.library, t.library.active_library_id, ""), d("提示词库已创建");
		} catch (e) {
			d(e instanceof Error ? e.message : String(e));
		}
	}, D = async () => {
		if (!g || g.id === "system") return;
		let e = window.prompt("提示词库名称", g.name)?.trim();
		if (e) try {
			let t = await p.renameLibrary(g.id, e);
			y(t.library, g.id, o), d("提示词库已重命名");
		} catch (e) {
			d(e instanceof Error ? e.message : String(e));
		}
	}, O = async () => {
		if (!(!g || g.id === "system" || !window.confirm(`删除提示词库“${g.name}”？`))) try {
			let e = await p.deleteLibrary(g.id);
			y(e.library, e.library.active_library_id, ""), d("提示词库已删除");
		} catch (e) {
			d(e instanceof Error ? e.message : String(e));
		}
	}, k = async () => {
		if (!g) return;
		let e = window.prompt("新分组名称")?.trim();
		if (e) try {
			let t = await p.createCategory(g.id, e);
			y(t.library, g.id, o), d("分组已创建");
		} catch (e) {
			d(e instanceof Error ? e.message : String(e));
		}
	}, A = (n = !1) => {
		let r = f.positive.trim();
		if (!r) {
			d("提示词内容不能为空");
			return;
		}
		t.onApply(n && f.negative.trim() ? `${r}\n\nNegative prompt:\n${f.negative.trim()}` : r), e();
	};
	return /* @__PURE__ */ (0, T.jsx)("div", {
		"aria-modal": "true",
		className: "modal open canvas-modern-backups prompt-library-dialog",
		role: "dialog",
		children: /* @__PURE__ */ (0, T.jsxs)("section", {
			className: "modal-panel",
			children: [
				/* @__PURE__ */ (0, T.jsxs)("header", { children: [/* @__PURE__ */ (0, T.jsx)("strong", { children: "提示词库" }), /* @__PURE__ */ (0, T.jsx)("button", {
					onClick: e,
					type: "button",
					children: "关闭"
				})] }),
				/* @__PURE__ */ (0, T.jsxs)("div", {
					className: "prompt-library-toolbar",
					children: [
						/* @__PURE__ */ (0, T.jsx)("select", {
							"aria-label": "提示词库",
							onChange: (e) => b(e.target.value),
							value: g?.id || "",
							children: n.libraries.map((e) => /* @__PURE__ */ (0, T.jsx)("option", {
								value: e.id,
								children: e.name
							}, e.id))
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							onClick: () => void E(),
							type: "button",
							children: "新建库"
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							disabled: !g || g.id === "system",
							onClick: () => void D(),
							type: "button",
							children: "重命名库"
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							disabled: !g || g.id === "system",
							onClick: () => void O(),
							type: "button",
							children: "删除库"
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							disabled: !g,
							onClick: () => void k(),
							type: "button",
							children: "新建分组"
						}),
						/* @__PURE__ */ (0, T.jsx)("input", {
							"aria-label": "搜索提示词",
							onChange: (e) => l(e.target.value),
							placeholder: "搜索名称、场景或内容",
							value: c
						})
					]
				}),
				/* @__PURE__ */ (0, T.jsxs)("div", {
					className: "prompt-library-body",
					children: [/* @__PURE__ */ (0, T.jsxs)("aside", { children: [
						/* @__PURE__ */ (0, T.jsx)("button", {
							className: "primary-btn",
							onClick: S,
							type: "button",
							children: "新建提示词"
						}),
						_.map((e) => /* @__PURE__ */ (0, T.jsxs)("button", {
							className: e.id === o ? "active" : "",
							onClick: () => x(e),
							type: "button",
							children: [/* @__PURE__ */ (0, T.jsx)("strong", { children: e.name || "未命名" }), /* @__PURE__ */ (0, T.jsx)("small", { children: e.scene || e.positive.slice(0, 60) })]
						}, e.id)),
						_.length ? null : /* @__PURE__ */ (0, T.jsx)("p", { children: "当前库暂无匹配内容" })
					] }), /* @__PURE__ */ (0, T.jsxs)("div", {
						className: "prompt-library-editor",
						children: [
							/* @__PURE__ */ (0, T.jsxs)("label", { children: ["名称", /* @__PURE__ */ (0, T.jsx)("input", {
								"aria-label": "提示词名称",
								onChange: (e) => h((t) => ({
									...t,
									name: e.target.value
								})),
								value: f.name
							})] }),
							/* @__PURE__ */ (0, T.jsxs)("label", { children: ["分组", /* @__PURE__ */ (0, T.jsxs)("select", {
								"aria-label": "提示词分组",
								onChange: (e) => h((t) => ({
									...t,
									category: e.target.value
								})),
								value: f.category,
								children: [/* @__PURE__ */ (0, T.jsx)("option", {
									value: "",
									children: "未分组"
								}), (g?.categories || []).map((e) => /* @__PURE__ */ (0, T.jsx)("option", {
									value: e.id,
									children: e.name
								}, e.id))]
							})] }),
							/* @__PURE__ */ (0, T.jsxs)("label", { children: ["场景", /* @__PURE__ */ (0, T.jsx)("input", {
								"aria-label": "提示词场景",
								onChange: (e) => h((t) => ({
									...t,
									scene: e.target.value
								})),
								value: f.scene
							})] }),
							/* @__PURE__ */ (0, T.jsxs)("label", { children: ["正向提示词", /* @__PURE__ */ (0, T.jsx)("textarea", {
								"aria-label": "正向提示词",
								onChange: (e) => h((t) => ({
									...t,
									positive: e.target.value
								})),
								value: f.positive
							})] }),
							/* @__PURE__ */ (0, T.jsxs)("label", { children: ["负向提示词", /* @__PURE__ */ (0, T.jsx)("textarea", {
								"aria-label": "负向提示词",
								onChange: (e) => h((t) => ({
									...t,
									negative: e.target.value
								})),
								value: f.negative
							})] }),
							/* @__PURE__ */ (0, T.jsxs)("div", {
								className: "prompt-library-actions",
								children: [
									/* @__PURE__ */ (0, T.jsx)("button", {
										onClick: () => void C(),
										type: "button",
										children: v ? "保存修改" : "创建提示词"
									}),
									/* @__PURE__ */ (0, T.jsx)("button", {
										disabled: !v,
										onClick: () => void w(),
										type: "button",
										children: "删除提示词"
									}),
									/* @__PURE__ */ (0, T.jsx)("button", {
										onClick: () => A(!1),
										type: "button",
										children: "应用正向"
									}),
									/* @__PURE__ */ (0, T.jsx)("button", {
										className: "primary-btn",
										onClick: () => A(!0),
										type: "button",
										children: "应用完整提示词"
									})
								]
							})
						]
					})]
				}),
				u ? /* @__PURE__ */ (0, T.jsx)("div", {
					className: "gate-status",
					role: "status",
					children: u
				}) : null
			]
		})
	});
}
function Y(e) {
	return {
		category: e.category || "",
		name: e.name || "",
		negative: e.negative || "",
		positive: e.positive || "",
		scene: e.scene || ""
	};
}
function ve(e, t) {
	let n = t.trim().toLocaleLowerCase();
	return !n || [
		e.name,
		e.positive,
		e.negative,
		e.scene
	].some((e) => e?.toLocaleLowerCase().includes(n));
}
//#endregion
//#region src/canvas/ui/canvas-manager.tsx
var ye = r(), be = [
	"red",
	"orange",
	"amber",
	"green",
	"teal",
	"blue",
	"violet",
	"pink",
	"slate"
], xe = [
	"layers",
	"sparkles",
	"image",
	"palette",
	"wand-2",
	"star",
	"heart",
	"rocket",
	"flame",
	"moon",
	"cloud",
	"leaf",
	"gem",
	"compass",
	"pin",
	"flag",
	"bookmark",
	"crown"
];
function Se({ canvases: e, configuration: t, folders: n, management: r, onOpen: i, onRefresh: a, onStatus: o, status: s, trash: c }) {
	let [l, u] = (0, m.useState)("all"), [d, f] = (0, m.useState)(t.kind ?? "classic"), [p, h] = (0, m.useState)(""), [g, _] = (0, m.useState)(!1), [v, y] = (0, m.useState)(""), [b, x] = (0, m.useState)({
		left: 0,
		top: 0
	}), [S, C] = (0, m.useState)(""), [w, E] = (0, m.useState)(""), [D, O] = (0, m.useState)(""), [k, A] = (0, m.useState)(""), [j, M] = (0, m.useState)(!1), [N, P] = (0, m.useState)(() => localStorage.getItem("canvasSortMode") === "name" ? "name" : "recent"), F = (0, m.useRef)(null), I = (0, m.useMemo)(() => j ? [...c] : (l === "all" ? e : e.filter((e) => Fe(e.folder_id) === l)).sort((e, t) => je(e, t, N)), [
		l,
		e,
		j,
		N,
		c
	]);
	(0, m.useEffect)(() => {
		l !== "all" && l && !n.some((e) => e.id === l) && u("");
	}, [l, n]), (0, m.useEffect)(() => {
		g && (F.current?.focus(), F.current?.select());
	}, [g]), (0, m.useEffect)(() => {
		Le();
	}, [
		l,
		g,
		v,
		n,
		S,
		w,
		D,
		k,
		j,
		N,
		I
	]), (0, m.useEffect)(() => {
		let e = (e) => {
			let t = e.target;
			w && !t?.closest(".canvas-folder-menu,.canvas-folder-btn") && E(""), S && !t?.closest(".canvas-meta-pop,.canvas-preview-mark,.canvas-owner-chip") && C("");
		};
		return document.addEventListener("mousedown", e), () => document.removeEventListener("mousedown", e);
	}, [S, w]);
	let L = (e) => {
		f(e), _(!0), M(!1), h(""), o("请输入画布名称");
	}, R = () => {
		_(!1), h(""), o(e.length ? "请选择一个画布" : "还没有画布，新建一个开始创作。");
	}, ee = async () => {
		let e = t.kind ?? d, n = t.defaultTitle || (e === "smart" ? "新智能画布" : "新画布"), s = p.trim() || `${n} ${(/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", {
			hour: "2-digit",
			minute: "2-digit"
		})}`;
		o("正在创建…");
		try {
			let n = await r.create(s, {
				folderId: l === "all" ? "" : l,
				icon: e === "smart" ? "sparkles" : "🧩",
				kind: e
			});
			if (_(!1), h(""), await a(), e === "smart" && t.kind !== "smart") {
				window.location.href = `/static/smart-canvas.html?id=${encodeURIComponent(n.id)}&v=2026.07.23.3`;
				return;
			}
			await i(n);
		} catch (e) {
			o(Q(e, "新建画布失败"));
		}
	}, z = async (e) => {
		if (e.kind === "smart" && t.kind !== "smart") {
			window.location.href = `/static/smart-canvas.html?id=${encodeURIComponent(e.id)}&v=2026.07.23.3`;
			return;
		}
		await i(e);
	}, B = async (e = "") => {
		let t = window.prompt("文件夹名称")?.trim();
		if (t) try {
			let n = await r.createFolder(t, e);
			u(n.id), await a();
		} catch (e) {
			o(Q(e, "新建文件夹失败"));
		}
	}, V = async (e) => {
		let t = window.prompt("文件夹名称", String(e.name || ""))?.trim();
		if (!(!t || t === e.name)) try {
			await r.updateFolder(e.id, { name: t }), await a();
		} catch (e) {
			o(Q(e, "重命名文件夹失败"));
		}
	}, te = async (e) => {
		if (window.confirm("删除该文件夹？其中的画布和子文件夹会移动到上一级。")) try {
			await r.deleteFolder(e.id), l === e.id && u(Fe(e.parent_id)), await a();
		} catch (e) {
			o(Q(e, "删除文件夹失败"));
		}
	}, H = async (e, t) => {
		E("");
		try {
			await r.moveToFolder(e, t), await a();
		} catch (e) {
			o(Q(e, "移动画布失败"));
		}
	}, U = async (e, t, n) => {
		try {
			await r.patchMeta(e, t), await a();
		} catch (e) {
			o(Q(e, n));
		}
	}, W = async (e) => {
		o("正在移入回收站…");
		try {
			await r.delete(e), O(""), await a(), o("已移入回收站");
		} catch (e) {
			o(Q(e, "移入回收站失败"));
		}
	}, ne = async (e) => {
		o("正在恢复…");
		try {
			await r.restore(e), await a(), o("已恢复");
		} catch (e) {
			o(Q(e, "恢复失败"));
		}
	}, re = async (e) => {
		o("正在删除…");
		try {
			await r.purge(e), A(""), await a(), o("已彻底删除");
		} catch (e) {
			o(Q(e, "彻底删除失败"));
		}
	}, ie = (e, t) => {
		e.preventDefault();
		let n = e.dataTransfer.getData("text/canvas-id");
		n && H(n, t === "all" ? "" : t);
	}, ae = (e) => {
		P(e), localStorage.setItem("canvasSortMode", e);
	}, G = !t.kind;
	return /* @__PURE__ */ (0, T.jsx)("main", {
		className: "canvas-modern-manager",
		children: /* @__PURE__ */ (0, T.jsx)("div", {
			className: `canvas-gate${g ? " creating" : ""}${j ? " trash-mode" : ""}`,
			children: /* @__PURE__ */ (0, T.jsxs)("div", {
				className: "gate-panel",
				children: [
					/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "gate-head",
						children: [/* @__PURE__ */ (0, T.jsxs)("div", {
							className: "gate-head-text",
							children: [
								/* @__PURE__ */ (0, T.jsxs)("button", {
									className: "gate-back-link",
									onClick: () => M(!1),
									type: "button",
									children: [/* @__PURE__ */ (0, T.jsx)(X, {
										name: "arrow-left",
										size: 14
									}), /* @__PURE__ */ (0, T.jsx)("span", { children: "返回画布列表" })]
								}),
								/* @__PURE__ */ (0, T.jsxs)("div", {
									className: "gate-title-row",
									children: [/* @__PURE__ */ (0, T.jsx)("div", {
										className: "gate-title",
										children: j ? "回收站" : t.heading || "选择画布"
									}), /* @__PURE__ */ (0, T.jsx)("span", {
										className: "gate-count-pill",
										children: I.length
									})]
								}),
								/* @__PURE__ */ (0, T.jsx)("div", {
									className: "gate-subtitle",
									children: j ? "恢复误删的画布，或彻底删除不再需要的内容。" : t.subtitle || "打开已有画布，或新建一个开始创作。"
								})
							]
						}), /* @__PURE__ */ (0, T.jsxs)("div", {
							className: "gate-head-actions",
							children: [
								/* @__PURE__ */ (0, T.jsxs)("div", {
									className: `gate-sort${j ? " hidden" : ""}`,
									role: "group",
									"aria-label": "排序方式",
									children: [/* @__PURE__ */ (0, T.jsx)("button", {
										className: `gate-sort-btn${N === "recent" ? " active" : ""}`,
										"data-sort": "recent",
										onClick: () => ae("recent"),
										type: "button",
										children: "最近编辑"
									}), /* @__PURE__ */ (0, T.jsx)("button", {
										className: `gate-sort-btn${N === "name" ? " active" : ""}`,
										"data-sort": "name",
										onClick: () => ae("name"),
										type: "button",
										children: "名称"
									})]
								}),
								t.managerBackHref ? /* @__PURE__ */ (0, T.jsx)("a", {
									className: "gate-icon-btn",
									href: t.managerBackHref,
									title: "返回画布列表",
									"aria-label": "返回画布列表",
									children: /* @__PURE__ */ (0, T.jsx)(X, { name: "arrow-left" })
								}) : null,
								/* @__PURE__ */ (0, T.jsx)("button", {
									className: "gate-icon-btn",
									onClick: () => void a(),
									title: "刷新列表",
									"aria-label": "刷新列表",
									type: "button",
									children: /* @__PURE__ */ (0, T.jsx)(X, { name: "refresh-cw" })
								}),
								/* @__PURE__ */ (0, T.jsxs)("button", {
									className: "gate-icon-btn gate-trash-entry",
									onClick: () => {
										M(!0), _(!1);
									},
									title: "打开回收站",
									"aria-label": "打开回收站",
									type: "button",
									children: [/* @__PURE__ */ (0, T.jsx)(X, { name: "trash-2" }), /* @__PURE__ */ (0, T.jsx)("span", {
										className: `gate-trash-badge${c.length ? " visible" : ""}`,
										children: c.length
									})]
								}),
								/* @__PURE__ */ (0, T.jsxs)("button", {
									className: "gate-icon-btn gate-manager-btn",
									hidden: !0,
									title: "资产库管理",
									"aria-label": "资产库管理",
									type: "button",
									children: [/* @__PURE__ */ (0, T.jsx)(X, { name: "library" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "素材库管理" })]
								}),
								/* @__PURE__ */ (0, T.jsxs)("button", {
									className: "primary-btn",
									onClick: () => L(t.kind ?? "classic"),
									type: "button",
									children: [/* @__PURE__ */ (0, T.jsx)(X, { name: "plus" }), /* @__PURE__ */ (0, T.jsx)("span", { children: t.createLabel || "新建画布" })]
								}),
								G ? /* @__PURE__ */ (0, T.jsxs)("button", {
									className: "smart-create-btn",
									onClick: () => L("smart"),
									type: "button",
									children: [/* @__PURE__ */ (0, T.jsx)(X, { name: "sparkles" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "新建智能画布" })]
								}) : null
							]
						})]
					}),
					/* @__PURE__ */ (0, T.jsx)("div", {
						className: "gate-status",
						children: s
					}),
					/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "gate-create-row",
						children: [
							/* @__PURE__ */ (0, T.jsx)("input", {
								className: "gate-name-input",
								maxLength: 80,
								onChange: (e) => h(e.target.value),
								onKeyDown: (e) => {
									e.key === "Enter" && ee(), e.key === "Escape" && R();
								},
								placeholder: d === "smart" ? "新智能画布名称（可留空使用默认）" : "新画布名称（可留空使用默认）",
								ref: F,
								type: "text",
								value: p
							}),
							/* @__PURE__ */ (0, T.jsx)("button", {
								className: "create-confirm",
								onClick: () => void ee(),
								title: "确定",
								"aria-label": "确定",
								type: "button",
								children: /* @__PURE__ */ (0, T.jsx)(X, { name: "check" })
							}),
							/* @__PURE__ */ (0, T.jsx)("button", {
								className: "create-cancel",
								onClick: R,
								title: "取消",
								"aria-label": "取消",
								type: "button",
								children: /* @__PURE__ */ (0, T.jsx)(X, { name: "x" })
							})
						]
					}),
					/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "trash-note",
						children: [/* @__PURE__ */ (0, T.jsx)(X, {
							name: "info",
							size: 14
						}), /* @__PURE__ */ (0, T.jsx)("span", { children: "回收站中的画布会在 30 天后自动清理。" })]
					}),
					/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "gate-browser",
						children: [/* @__PURE__ */ (0, T.jsxs)("aside", {
							className: "gate-folder-pane",
							"aria-label": "画布文件夹",
							children: [/* @__PURE__ */ (0, T.jsxs)("div", {
								className: "gate-folder-head",
								children: [/* @__PURE__ */ (0, T.jsx)("span", { children: "文件夹" }), /* @__PURE__ */ (0, T.jsx)("button", {
									className: "gate-folder-add",
									onClick: () => void B(""),
									title: "新建文件夹",
									"aria-label": "新建文件夹",
									type: "button",
									children: /* @__PURE__ */ (0, T.jsx)(X, {
										name: "folder-plus",
										size: 14
									})
								})]
							}), /* @__PURE__ */ (0, T.jsxs)("div", {
								className: "gate-folder-tree",
								children: [
									/* @__PURE__ */ (0, T.jsx)(Oe, {
										active: l === "all",
										count: e.length,
										icon: "layout-grid",
										id: "all",
										name: "全部画布",
										onDrop: ie,
										onSelect: u
									}),
									/* @__PURE__ */ (0, T.jsx)(Oe, {
										active: l === "",
										count: Ne(e, ""),
										icon: "inbox",
										id: "",
										name: "未分类",
										onDrop: ie,
										onSelect: u
									}),
									/* @__PURE__ */ (0, T.jsx)("div", { className: "gate-folder-separator" }),
									Me(n, "").map((t) => /* @__PURE__ */ (0, T.jsx)(De, {
										activeFolder: l,
										canvases: e,
										folder: t,
										folders: n,
										onCreate: B,
										onDelete: te,
										onDrop: ie,
										onRename: V,
										onSelect: u
									}, t.id))
								]
							})]
						}), /* @__PURE__ */ (0, T.jsxs)("div", {
							className: "gate-canvas-pane",
							children: [/* @__PURE__ */ (0, T.jsxs)("div", {
								className: "gate-folder-bar",
								children: [/* @__PURE__ */ (0, T.jsxs)("div", {
									className: "gate-folder-current",
									children: [/* @__PURE__ */ (0, T.jsx)(X, {
										name: l === "all" ? "layout-grid" : l ? "folder" : "inbox",
										size: 14
									}), /* @__PURE__ */ (0, T.jsx)("span", { children: Pe(l, n) })]
								}), /* @__PURE__ */ (0, T.jsx)("span", {
									className: "gate-folder-current-count",
									children: I.length
								})]
							}), /* @__PURE__ */ (0, T.jsx)("div", {
								className: "gate-list",
								children: I.length ? I.map((e) => /* @__PURE__ */ (0, T.jsx)(we, {
									editing: v === e.id,
									folders: n,
									item: e,
									metaOpen: S === e.id,
									metaPosition: b,
									moving: w === e.id,
									onDelete: () => O(e.id),
									onConfirmDelete: () => void W(e.id),
									onConfirmPurge: () => void re(e.id),
									onCancelConfirm: () => {
										O(""), A("");
									},
									onEdit: () => y(e.id),
									onMeta: (t) => {
										let n = t.currentTarget.getBoundingClientRect();
										x({
											left: Math.min(Math.max(n.left, 12), window.innerWidth - 224),
											top: Math.min(n.bottom + 8, window.innerHeight - 280)
										}), C(S === e.id ? "" : e.id);
									},
									onMove: (t) => void H(e.id, t),
									onMoveMenu: () => E(w === e.id ? "" : e.id),
									onOpen: () => void z(e),
									onPatch: (t, n) => void U(e.id, t, n),
									onPurge: () => A(e.id),
									onRestore: () => void ne(e.id),
									onTitle: (t) => {
										y(""), t && t !== e.title && U(e.id, { title: t }, "重命名失败");
									},
									pendingDelete: D === e.id,
									pendingPurge: k === e.id,
									showTrash: j
								}, e.id)) : /* @__PURE__ */ (0, T.jsxs)("div", {
									className: "gate-list-empty",
									children: [/* @__PURE__ */ (0, T.jsx)("div", {
										className: "gate-list-empty-icon",
										children: /* @__PURE__ */ (0, T.jsx)(X, {
											name: j ? "trash-2" : "layout-grid",
											size: 24
										})
									}), j ? "回收站为空" : /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [
										"还没有画布",
										/* @__PURE__ */ (0, T.jsx)("br", {}),
										"新建一个开始创作"
									] })]
								})
							})]
						})]
					})
				]
			})
		})
	});
}
function Ce({ canvases: e, configuration: t, folders: n, management: r, onOpen: i, onRefresh: a, onStatus: o, status: s, trash: c }) {
	let [l, u] = (0, m.useState)("all"), [d, f] = (0, m.useState)(""), [p, h] = (0, m.useState)(!1), g = p ? c : l === "all" ? e : l === "root" ? e.filter((e) => !e.folder_id) : e.filter((e) => e.folder_id === l), _ = async () => {
		try {
			let e = await r.create(d || t.defaultTitle || "", {
				icon: t.kind === "smart" ? "sparkles" : void 0,
				kind: t.kind ?? "classic"
			});
			f(""), await a(), await i(e);
		} catch (e) {
			o(Q(e, "新建画布失败"));
		}
	};
	return /* @__PURE__ */ (0, T.jsx)("main", {
		className: "canvas-modern-manager",
		children: /* @__PURE__ */ (0, T.jsxs)("section", {
			className: "gate-panel canvas-modern-gate",
			children: [
				/* @__PURE__ */ (0, T.jsxs)("header", {
					className: "gate-head",
					children: [/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "gate-head-text",
						children: [/* @__PURE__ */ (0, T.jsx)("h1", {
							className: "gate-title",
							children: p ? "回收站" : t.heading || "经典画布 V2"
						}), /* @__PURE__ */ (0, T.jsx)("p", {
							className: "gate-subtitle",
							children: t.subtitle || "React + TypeScript 独立文档与执行路径"
						})]
					}), /* @__PURE__ */ (0, T.jsxs)("div", {
						className: "gate-head-actions",
						children: [
							t.managerBackHref ? /* @__PURE__ */ (0, T.jsx)("a", {
								className: "gate-icon-btn",
								href: t.managerBackHref,
								children: "返回首页"
							}) : null,
							p ? null : /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [
								/* @__PURE__ */ (0, T.jsxs)("select", {
									"aria-label": "画布文件夹",
									onChange: (e) => u(e.target.value),
									value: l,
									children: [
										/* @__PURE__ */ (0, T.jsx)("option", {
											value: "all",
											children: "全部画布"
										}),
										/* @__PURE__ */ (0, T.jsx)("option", {
											value: "root",
											children: "未分类"
										}),
										n.map((e) => /* @__PURE__ */ (0, T.jsx)("option", {
											value: e.id,
											children: String(e.name || "未命名文件夹")
										}, e.id))
									]
								}),
								/* @__PURE__ */ (0, T.jsx)("button", {
									className: "gate-icon-btn",
									onClick: async () => {
										let e = window.prompt("文件夹名称")?.trim();
										e && (await r.createFolder(e), await a());
									},
									type: "button",
									children: "新建文件夹"
								}),
								["all", "root"].includes(l) ? null : /* @__PURE__ */ (0, T.jsx)("button", {
									className: "gate-icon-btn",
									onClick: async () => {
										window.confirm("删除此文件夹？文件夹内画布不会被永久删除。") && (await r.deleteFolder(l), u("all"), await a());
									},
									type: "button",
									children: "删除文件夹"
								})
							] }),
							/* @__PURE__ */ (0, T.jsx)("button", {
								className: "gate-icon-btn",
								onClick: () => void a(),
								type: "button",
								children: "刷新"
							}),
							/* @__PURE__ */ (0, T.jsx)("button", {
								className: "gate-icon-btn",
								onClick: () => h((e) => !e),
								type: "button",
								children: p ? "返回画布" : `回收站 ${c.length}`
							})
						]
					})]
				}),
				p ? null : /* @__PURE__ */ (0, T.jsxs)("div", {
					className: "gate-create-row canvas-modern-create",
					children: [/* @__PURE__ */ (0, T.jsx)("input", {
						className: "gate-name-input",
						maxLength: 80,
						onChange: (e) => f(e.target.value),
						onKeyDown: (e) => {
							e.key === "Enter" && _();
						},
						placeholder: "新画布名称",
						value: d
					}), /* @__PURE__ */ (0, T.jsx)("button", {
						className: "primary-btn",
						onClick: () => void _(),
						type: "button",
						children: t.createLabel || "新建画布"
					})]
				}),
				s ? /* @__PURE__ */ (0, T.jsx)("div", {
					className: "gate-status",
					children: s
				}) : null,
				/* @__PURE__ */ (0, T.jsx)("div", {
					className: "gate-list canvas-modern-list",
					children: g.map((e) => /* @__PURE__ */ (0, T.jsxs)("article", {
						className: "gate-card",
						"data-canvas-id": e.id,
						children: [/* @__PURE__ */ (0, T.jsxs)("button", {
							className: "canvas-modern-card-main",
							disabled: p,
							onClick: () => void i(e),
							type: "button",
							children: [/* @__PURE__ */ (0, T.jsx)("strong", { children: String(e.title || "未命名画布") }), /* @__PURE__ */ (0, T.jsx)("small", { children: Ie(e.updated_at) })]
						}), p ? /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [/* @__PURE__ */ (0, T.jsx)("button", {
							onClick: async () => {
								await r.restore(e.id), await a();
							},
							type: "button",
							children: "恢复"
						}), /* @__PURE__ */ (0, T.jsx)("button", {
							onClick: async () => {
								window.confirm("永久删除后无法恢复，确定继续？") && (await r.purge(e.id), await a());
							},
							type: "button",
							children: "永久删除"
						})] }) : /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [/* @__PURE__ */ (0, T.jsxs)("select", {
							"aria-label": `移动 ${String(e.title || "画布")}`,
							onChange: async (t) => {
								await r.moveToFolder(e.id, t.target.value), await a();
							},
							value: String(e.folder_id || ""),
							children: [/* @__PURE__ */ (0, T.jsx)("option", {
								value: "",
								children: "未分类"
							}), n.map((e) => /* @__PURE__ */ (0, T.jsx)("option", {
								value: e.id,
								children: String(e.name || "未命名文件夹")
							}, e.id))]
						}), /* @__PURE__ */ (0, T.jsx)("button", {
							"aria-label": "移入回收站",
							onClick: async () => {
								window.confirm("将此画布移入回收站？") && (await r.delete(e.id), await a());
							},
							type: "button",
							children: "删除"
						})] })]
					}, e.id))
				})
			]
		})
	});
}
function we({ editing: e, folders: t, item: n, metaOpen: r, metaPosition: i, moving: a, onCancelConfirm: o, onConfirmDelete: s, onConfirmPurge: c, onDelete: l, onEdit: u, onMeta: d, onMove: f, onMoveMenu: p, onOpen: m, onPatch: h, onPurge: g, onRestore: _, onTitle: v, pendingDelete: y, pendingPurge: b, showTrash: x }) {
	let S = String(n.color || ""), C = String(n.owner || ""), w = n.kind === "smart", E = !!n.pinned && !x;
	return /* @__PURE__ */ (0, T.jsxs)("div", {
		className: `canvas-item${w ? " smart-canvas" : ""}${E ? " pinned" : ""}${S ? " has-color" : ""}`,
		"data-canvas-id": n.id,
		draggable: !x,
		onDragEnd: (e) => e.currentTarget.classList.remove("dragging"),
		onDragStart: (e) => {
			e.dataTransfer.setData("text/canvas-id", n.id), e.dataTransfer.setData("text/plain", n.id), e.dataTransfer.effectAllowed = "move", e.currentTarget.classList.add("dragging");
		},
		children: [
			/* @__PURE__ */ (0, T.jsxs)("div", {
				className: "canvas-open",
				onClick: x ? void 0 : m,
				onKeyDown: (e) => {
					!x && (e.key === "Enter" || e.key === " ") && m();
				},
				role: "button",
				tabIndex: x ? -1 : 0,
				children: [
					/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "canvas-card-icon-row",
						children: [/* @__PURE__ */ (0, T.jsx)("button", {
							className: `canvas-preview-mark${S ? ` icon-has-color cc-${S}` : ""}`,
							onClick: (e) => {
								e.stopPropagation(), x || d(e);
							},
							title: x ? "已删除画布" : "编辑图标 / 颜色 / 负责人",
							type: "button",
							children: /* @__PURE__ */ (0, T.jsx)(Ae, {
								icon: w && /[^\x00-\x7F]/.test(String(n.icon || "")) ? "sparkles" : String(n.icon || ""),
								size: 16
							})
						}), w ? /* @__PURE__ */ (0, T.jsx)("span", {
							className: "canvas-kind-chip",
							children: "智能"
						}) : null]
					}),
					/* @__PURE__ */ (0, T.jsx)("div", {
						className: "canvas-card-title",
						children: e ? /* @__PURE__ */ (0, T.jsx)(Ee, {
							title: String(n.title || ""),
							onFinish: v
						}) : String(n.title || "未命名画布")
					}),
					C ? /* @__PURE__ */ (0, T.jsxs)("button", {
						className: "canvas-owner-chip",
						onClick: (e) => {
							e.stopPropagation(), d(e);
						},
						title: C,
						type: "button",
						children: [/* @__PURE__ */ (0, T.jsx)(X, {
							name: "user-round",
							size: 12
						}), /* @__PURE__ */ (0, T.jsx)("span", {
							className: "canvas-owner-text",
							children: C
						})]
					}) : null,
					/* @__PURE__ */ (0, T.jsxs)("div", {
						className: "canvas-card-meta",
						children: [/* @__PURE__ */ (0, T.jsx)("span", { className: "canvas-card-meta-dot" }), /* @__PURE__ */ (0, T.jsx)("div", {
							className: "canvas-card-time",
							children: x ? `删除于 ${Ie(n.deleted_at)}` : Ie(n.updated_at || n.created_at)
						})]
					})
				]
			}),
			x ? b ? /* @__PURE__ */ (0, T.jsx)(ke, {
				text: "彻底删除后无法恢复，确定继续？",
				onCancel: o,
				onConfirm: c
			}) : /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [/* @__PURE__ */ (0, T.jsx)("button", {
				className: "canvas-delete canvas-restore",
				onClick: _,
				style: { right: 42 },
				title: "恢复画布",
				"aria-label": `恢复画布 ${String(n.title || "")}`,
				type: "button",
				children: /* @__PURE__ */ (0, T.jsx)(X, {
					name: "rotate-ccw",
					size: 14
				})
			}), /* @__PURE__ */ (0, T.jsx)("button", {
				className: "canvas-delete canvas-purge",
				onClick: g,
				title: "彻底删除",
				"aria-label": `彻底删除 ${String(n.title || "")}`,
				type: "button",
				children: /* @__PURE__ */ (0, T.jsx)(X, {
					name: "x",
					size: 14
				})
			})] }) : y ? /* @__PURE__ */ (0, T.jsx)(ke, {
				text: "将此画布移入回收站？",
				onCancel: o,
				onConfirm: s
			}) : /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [
				/* @__PURE__ */ (0, T.jsx)("button", {
					className: `canvas-pin-btn${E ? " active" : ""}`,
					onClick: () => h({ pinned: !E }, "置顶状态保存失败"),
					title: E ? "取消置顶" : "置顶",
					"aria-label": E ? "取消置顶" : "置顶",
					type: "button",
					children: /* @__PURE__ */ (0, T.jsx)(X, {
						name: "pin",
						size: 14
					})
				}),
				/* @__PURE__ */ (0, T.jsx)("button", {
					className: "canvas-card-edit",
					onClick: u,
					title: "重命名",
					"aria-label": `重命名 ${String(n.title || "")}`,
					type: "button",
					children: /* @__PURE__ */ (0, T.jsx)(X, {
						name: "pencil",
						size: 14
					})
				}),
				/* @__PURE__ */ (0, T.jsx)("button", {
					className: "canvas-folder-btn",
					onClick: p,
					title: "移动到文件夹",
					"aria-label": `移动到文件夹 ${String(n.title || "")}`,
					type: "button",
					children: /* @__PURE__ */ (0, T.jsx)(X, {
						name: "folder-input",
						size: 14
					})
				}),
				/* @__PURE__ */ (0, T.jsx)("button", {
					className: "canvas-delete",
					onClick: l,
					title: "移入回收站",
					"aria-label": `移入回收站 ${String(n.title || "")}`,
					type: "button",
					children: /* @__PURE__ */ (0, T.jsx)(X, {
						name: "trash-2",
						size: 14
					})
				}),
				a ? /* @__PURE__ */ (0, T.jsxs)("div", {
					className: "canvas-folder-menu",
					children: [/* @__PURE__ */ (0, T.jsxs)("button", {
						className: n.folder_id ? "" : "active",
						onClick: () => f(""),
						style: { "--depth": 0 },
						type: "button",
						children: [/* @__PURE__ */ (0, T.jsx)(X, {
							name: "inbox",
							size: 12
						}), /* @__PURE__ */ (0, T.jsx)("span", { children: "未分类" })]
					}), t.map((e) => /* @__PURE__ */ (0, T.jsxs)("button", {
						className: n.folder_id === e.id ? "active" : "",
						onClick: () => f(e.id),
						style: { "--depth": Z(e.id, t) },
						type: "button",
						children: [/* @__PURE__ */ (0, T.jsx)(X, {
							name: "folder",
							size: 12
						}), /* @__PURE__ */ (0, T.jsx)("span", { children: String(e.name || "未命名文件夹") })]
					}, e.id))]
				}) : null
			] }),
			r ? /* @__PURE__ */ (0, T.jsx)(Te, {
				item: n,
				onPatch: h,
				position: i
			}) : null
		]
	});
}
function Te({ item: e, onPatch: t, position: n }) {
	let [r, i] = (0, m.useState)(String(e.owner || "")), a = /* @__PURE__ */ (0, T.jsxs)("div", {
		className: "canvas-meta-pop",
		"data-canvas-meta-pop": e.id,
		onMouseDown: (e) => e.stopPropagation(),
		style: {
			...n,
			zIndex: 1120
		},
		children: [
			/* @__PURE__ */ (0, T.jsxs)("div", {
				className: "canvas-meta-section",
				children: [/* @__PURE__ */ (0, T.jsx)("div", {
					className: "canvas-meta-label",
					children: "负责人 / 项目"
				}), /* @__PURE__ */ (0, T.jsx)("input", {
					className: "canvas-owner-input",
					maxLength: 40,
					onBlur: () => {
						let n = r.trim();
						n !== String(e.owner || "") && t({ owner: n }, "负责人保存失败");
					},
					onChange: (e) => i(e.target.value),
					onKeyDown: (e) => {
						e.key === "Enter" && e.currentTarget.blur();
					},
					placeholder: "如：张三 / 双十一项目",
					type: "text",
					value: r
				})]
			}),
			/* @__PURE__ */ (0, T.jsxs)("div", {
				className: "canvas-meta-section",
				children: [/* @__PURE__ */ (0, T.jsx)("div", {
					className: "canvas-meta-label",
					children: "颜色标记"
				}), /* @__PURE__ */ (0, T.jsxs)("div", {
					className: "canvas-color-row",
					children: [/* @__PURE__ */ (0, T.jsx)("button", {
						className: `canvas-color-swatch cc-none${e.color ? "" : " active"}`,
						onClick: () => t({ color: "" }, "颜色保存失败"),
						title: "无",
						type: "button",
						children: /* @__PURE__ */ (0, T.jsx)(X, {
							name: "ban",
							size: 12
						})
					}), be.map((n) => /* @__PURE__ */ (0, T.jsx)("button", {
						"aria-label": n,
						className: `canvas-color-swatch cc-${n}${e.color === n ? " active" : ""}`,
						onClick: () => t({ color: n }, "颜色保存失败"),
						type: "button"
					}, n))]
				})]
			}),
			/* @__PURE__ */ (0, T.jsxs)("div", {
				className: "canvas-meta-section",
				children: [/* @__PURE__ */ (0, T.jsx)("div", {
					className: "canvas-meta-label",
					children: "更换图标"
				}), /* @__PURE__ */ (0, T.jsx)("div", {
					className: "emoji-picker-grid",
					children: xe.map((e) => /* @__PURE__ */ (0, T.jsx)("button", {
						className: "emoji-option",
						"data-icon": e,
						onClick: () => t({ icon: e }, "图标保存失败"),
						type: "button",
						children: /* @__PURE__ */ (0, T.jsx)(X, {
							name: e,
							size: 14
						})
					}, e))
				})]
			})
		]
	});
	return (0, ye.createPortal)(a, document.body);
}
function Ee({ onFinish: e, title: t }) {
	let [n, r] = (0, m.useState)(t), i = (0, m.useRef)(!1), a = (r) => {
		i.current || (i.current = !0, e(r ? n.trim() : t));
	};
	return /* @__PURE__ */ (0, T.jsx)("input", {
		autoFocus: !0,
		className: "canvas-card-title-input",
		maxLength: 80,
		onBlur: () => a(!0),
		onChange: (e) => r(e.target.value),
		onClick: (e) => e.stopPropagation(),
		onKeyDown: (e) => {
			e.stopPropagation(), e.key === "Enter" && a(!0), e.key === "Escape" && a(!1);
		},
		onMouseDown: (e) => e.stopPropagation(),
		type: "text",
		value: n
	});
}
function De({ activeFolder: e, canvases: t, folder: n, folders: r, onCreate: i, onDelete: a, onDrop: o, onRename: s, onSelect: c }) {
	let l = Z(n.id, r);
	return /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [/* @__PURE__ */ (0, T.jsxs)("div", {
		className: `gate-folder-node${e === n.id ? " active" : ""}`,
		"data-folder-id": n.id,
		onDragOver: (e) => e.preventDefault(),
		onDrop: (e) => o(e, n.id),
		style: { "--depth": l },
		children: [/* @__PURE__ */ (0, T.jsxs)("button", {
			className: "gate-folder-main",
			onClick: () => c(n.id),
			title: String(n.name || ""),
			type: "button",
			children: [
				/* @__PURE__ */ (0, T.jsx)(X, {
					name: "folder",
					size: 14
				}),
				/* @__PURE__ */ (0, T.jsx)("span", {
					className: "gate-folder-name",
					children: String(n.name || "未命名文件夹")
				}),
				/* @__PURE__ */ (0, T.jsx)("span", {
					className: "gate-folder-count",
					children: Ne(t, n.id)
				})
			]
		}), /* @__PURE__ */ (0, T.jsxs)("div", {
			className: "gate-folder-actions",
			children: [
				/* @__PURE__ */ (0, T.jsx)("button", {
					className: "gate-folder-action",
					onClick: () => void i(n.id),
					title: "新建子文件夹",
					type: "button",
					children: /* @__PURE__ */ (0, T.jsx)(X, {
						name: "folder-plus",
						size: 12
					})
				}),
				/* @__PURE__ */ (0, T.jsx)("button", {
					className: "gate-folder-action",
					onClick: () => void s(n),
					title: "重命名",
					type: "button",
					children: /* @__PURE__ */ (0, T.jsx)(X, {
						name: "pencil",
						size: 12
					})
				}),
				/* @__PURE__ */ (0, T.jsx)("button", {
					className: "gate-folder-action",
					onClick: () => void a(n),
					title: "删除文件夹",
					type: "button",
					children: /* @__PURE__ */ (0, T.jsx)(X, {
						name: "trash-2",
						size: 12
					})
				})
			]
		})]
	}), Me(r, n.id).map((n) => /* @__PURE__ */ (0, T.jsx)(De, {
		activeFolder: e,
		canvases: t,
		folder: n,
		folders: r,
		onCreate: i,
		onDelete: a,
		onDrop: o,
		onRename: s,
		onSelect: c
	}, n.id))] });
}
function Oe({ active: e, count: t, icon: n, id: r, name: i, onDrop: a, onSelect: o }) {
	return /* @__PURE__ */ (0, T.jsx)("div", {
		className: `gate-folder-node gate-folder-special${e ? " active" : ""}`,
		"data-folder-id": r,
		onDragOver: (e) => e.preventDefault(),
		onDrop: (e) => a(e, r),
		children: /* @__PURE__ */ (0, T.jsxs)("button", {
			className: "gate-folder-main",
			onClick: () => o(r),
			type: "button",
			children: [
				/* @__PURE__ */ (0, T.jsx)(X, {
					name: n,
					size: 14
				}),
				/* @__PURE__ */ (0, T.jsx)("span", {
					className: "gate-folder-name",
					children: i
				}),
				/* @__PURE__ */ (0, T.jsx)("span", {
					className: "gate-folder-count",
					children: t
				})
			]
		})
	});
}
function ke({ onCancel: e, onConfirm: t, text: n }) {
	return /* @__PURE__ */ (0, T.jsx)("div", {
		className: "canvas-delete-confirm",
		children: /* @__PURE__ */ (0, T.jsxs)("div", {
			className: "canvas-delete-box",
			children: [/* @__PURE__ */ (0, T.jsx)("div", {
				className: "canvas-delete-title",
				children: n
			}), /* @__PURE__ */ (0, T.jsxs)("div", {
				className: "canvas-delete-actions",
				children: [/* @__PURE__ */ (0, T.jsx)("button", {
					className: "canvas-confirm-btn",
					onClick: t,
					type: "button",
					children: "确定"
				}), /* @__PURE__ */ (0, T.jsx)("button", {
					className: "canvas-cancel-btn",
					onClick: e,
					type: "button",
					children: "取消"
				})]
			})]
		})
	});
}
function X({ name: e, size: t = 16 }) {
	return /* @__PURE__ */ (0, T.jsx)("i", {
		"aria-hidden": "true",
		"data-lucide": e,
		style: {
			height: t,
			width: t
		}
	});
}
function Ae({ icon: e, size: t }) {
	return e && /[^\x00-\x7F]/.test(e) && e !== "🧩" ? /* @__PURE__ */ (0, T.jsx)(T.Fragment, { children: e }) : /* @__PURE__ */ (0, T.jsx)(X, {
		name: !e || e === "🧩" ? "layers" : e,
		size: t
	});
}
function je(e, t, n) {
	let r = Number(!!t.pinned) - Number(!!e.pinned);
	if (r) return r;
	if (n === "name") {
		let n = String(e.title || "").localeCompare(String(t.title || ""), "zh-Hans-CN", {
			numeric: !0,
			sensitivity: "base"
		});
		if (n) return n;
	}
	return Number(t.updated_at || t.created_at || 0) - Number(e.updated_at || e.created_at || 0);
}
function Me(e, t) {
	return e.filter((e) => Fe(e.parent_id) === t).sort((e, t) => Number(e.order || 0) - Number(t.order || 0) || String(e.name || "").localeCompare(String(t.name || ""), "zh-Hans-CN", {
		numeric: !0,
		sensitivity: "base"
	}));
}
function Z(e, t) {
	let n = 0, r = t.find((t) => t.id === e), i = /* @__PURE__ */ new Set();
	for (; r?.parent_id && !i.has(r.id);) i.add(r.id), n += 1, r = t.find((e) => e.id === r?.parent_id);
	return n;
}
function Ne(e, t) {
	return e.filter((e) => Fe(e.folder_id) === t).length;
}
function Pe(e, t) {
	return e === "all" ? "全部画布" : e ? String(t.find((t) => t.id === e)?.name || "文件夹") : "未分类";
}
function Fe(e) {
	return String(e || "").replace(/[^a-zA-Z0-9_-]/g, "");
}
function Ie(e) {
	let t = Number(e || 0);
	return t ? new Date(t < 1e10 ? t * 1e3 : t).toLocaleString() : "--";
}
function Q(e, t) {
	return e instanceof Error && e.message || t;
}
function Le() {
	window.lucide?.createIcons();
}
//#endregion
//#region src/canvas/ui/canvas-app-v2.tsx
var Re = [
	[
		"image",
		"上传",
		"image-plus"
	],
	[
		"prompt",
		"提示词",
		"text-cursor-input"
	],
	[
		"loop",
		"循环",
		"repeat-2"
	],
	[
		"llm",
		"LLM",
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
		"ComfyUI",
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
];
function ze({ configuration: e = {}, management: t = v(), repository: n, runtime: r }) {
	let i = e.kind ?? "classic", [a, o] = (0, m.useState)([]), [l, p] = (0, m.useState)([]), [h, g] = (0, m.useState)([]), [_, y] = (0, m.useState)(null), [b, x] = (0, m.useState)("正在加载画布列表…"), [S, E] = (0, m.useState)(null), [O, k] = (0, m.useState)(null), [A, j] = (0, m.useState)(null), [N, P] = (0, m.useState)(!1), [F, I] = (0, m.useState)(null), [L, R] = (0, m.useState)(null), [ee, z] = (0, m.useState)(null), [B, V] = (0, m.useState)(""), [H, U] = (0, m.useState)(""), [W, ne] = (0, m.useState)(() => localStorage.getItem("canvasUserName") || ""), [re, ie] = (0, m.useState)(!1), [ae, G] = (0, m.useState)(() => localStorage.getItem("canvas_quick_toolbar_collapsed") === "1"), se = (0, m.useRef)(null), K = (0, m.useRef)(Ve()), ue = (0, m.useRef)(!1), q = (0, m.useRef)(0), J = (0, m.useRef)(!1), de = (0, m.useRef)(!1), fe = (0, m.useCallback)(async () => {
		x("正在加载画布列表…");
		try {
			let [n, r, a] = await Promise.all([
				t.list(),
				t.listTrash(),
				t.listFolders()
			]), s = (t) => !e.kind || String(t.kind || "classic") === i, c = n.filter(s), l = r.filter(s);
			o(c.sort((e, t) => Number(t.updated_at || 0) - Number(e.updated_at || 0))), p(l), g(a), x(c.length ? "" : "还没有画布，新建一个开始创作。");
		} catch (e) {
			x(e instanceof Error ? e.message : String(e));
		}
	}, [
		i,
		e.kind,
		t
	]);
	(0, m.useEffect)(() => {
		fe();
	}, [fe]), (0, m.useEffect)(() => {
		let t = se.current;
		if (!t || !_) return;
		let i = d(t, null, {
			clientId: K.current,
			initialDocument: _,
			legacyUi: !e.kind,
			readOnly: !!L,
			repository: n,
			runtime: r,
			smartUi: e.kind === "smart"
		});
		return window.CanvasBoardV2?.setReadOnly(!!L), i;
	}, [
		e.kind,
		_,
		n,
		r
	]), (0, m.useEffect)(() => {
		window.CanvasBoardV2?.setReadOnly(!!L);
	}, [L]), (0, m.useEffect)(() => {
		!_ || e.kind && e.kind !== "smart" || window.requestAnimationFrame(() => window.lucide?.createIcons());
	}, [
		F,
		S,
		e.kind,
		_,
		W,
		A,
		L,
		re,
		ae,
		N
	]), (0, m.useEffect)(() => {
		let e = (e) => {
			let t = e.detail;
			t?.id === _?.id && (q.current = Math.max(q.current, Number(t.updated_at || 0)), U(""));
		};
		return window.addEventListener("canvas-board-v2-document-saved", e), () => window.removeEventListener("canvas-board-v2-document-saved", e);
	}, [_?.id]), (0, m.useEffect)(() => {
		let e = (e) => x(String(e.detail || ""));
		return window.addEventListener("canvas-board-v2-shortcut-status", e), () => window.removeEventListener("canvas-board-v2-shortcut-status", e);
	}, []), (0, m.useEffect)(() => {
		let e = () => {
			_?.id && J.current && t.releaseLock(String(_.id), K.current, !0);
		};
		return window.addEventListener("pagehide", e, { once: !0 }), () => window.removeEventListener("pagehide", e);
	}, [_?.id, t]), (0, m.useEffect)(() => {
		let e = window.openPromptTemplateModal, t = window.openCanvasPromptLibrary, n = window.openCanvasAssetLibrary;
		return window.openPromptTemplateModal = (e) => {
			k({ onApply: (t) => {
				window.CanvasBoardV2?.updateNode(e, { text: t });
			} });
		}, window.openCanvasPromptLibrary = (e) => k(e), window.openCanvasAssetLibrary = (e) => I(e), () => {
			e ? window.openPromptTemplateModal = e : delete window.openPromptTemplateModal, t ? window.openCanvasPromptLibrary = t : delete window.openCanvasPromptLibrary, n ? window.openCanvasAssetLibrary = n : delete window.openCanvasAssetLibrary;
		};
	}, []);
	let me = async (e) => {
		x("正在打开画布…");
		try {
			let i = await t.acquireLock(e.id, K.current, localStorage.getItem("canvasUserName") || ""), a = await n.get(e.id);
			if (J.current = i.ok, R(i.ok ? null : i.holder || {}), z(i.ok ? i.holder || {} : null), V(""), U(""), q.current = Number(a.updated_at || 0), y(a), !i.ok) {
				x(`只读模式：画布正由 ${$(i.holder)} 编辑`);
				return;
			}
			x(""), r.recoverDocument(a).then(async (t) => {
				if (JSON.stringify(t) === JSON.stringify(a)) return;
				let r = await n.save(e.id, {
					...s(t),
					client_id: K.current
				});
				q.current = Number(r.updated_at || 0), y((e) => e?.id === r.id ? r : e);
			}).catch((e) => x(`任务恢复失败：${e instanceof Error ? e.message : String(e)}`));
		} catch (e) {
			x(e instanceof Error ? e.message : String(e));
		}
	}, he = (0, m.useCallback)(async () => {
		if (!_?.id) return !1;
		try {
			let e = J.current, r = await t.acquireLock(String(_.id), K.current, localStorage.getItem("canvasUserName") || "");
			if (!r.ok) return J.current = !1, R(r.holder || {}), z(null), V(""), x(`只读模式：画布正由 ${$(r.holder)} 编辑`), !1;
			if (J.current = !0, R(null), z(r.holder || {}), V(""), !e) {
				let e = await n.get(String(_.id));
				q.current = Number(e.updated_at || 0), y(e), x("已取得编辑锁，并同步到最新画布");
			}
			return !0;
		} catch (e) {
			J.current = !1, R({ username: "锁状态未知" }), z(null);
			let t = `编辑锁续期失败，已切换只读并将自动重试：${e instanceof Error ? e.message : String(e)}`;
			return V(t), x(t), !1;
		}
	}, [
		_?.id,
		t,
		n
	]), ge = (0, m.useCallback)(async () => {
		if (!_?.id || !t.checkLock) return he();
		try {
			let e = (await t.checkLock(String(_.id))).holder || null;
			return !e || String(e.client_id || "") === K.current ? he() : (J.current = !1, R(e), z(null), V(""), !1);
		} catch (e) {
			let t = `编辑锁检查失败，保持只读并将自动重试：${e instanceof Error ? e.message : String(e)}`;
			return J.current = !1, R({ username: "锁状态未知" }), z(null), V(t), x(t), !1;
		}
	}, [
		he,
		_?.id,
		t
	]), Y = (0, m.useCallback)(async (e = 0) => {
		if (!(!_?.id || de.current)) {
			de.current = !0;
			try {
				let r = e || Number((await t.getMeta(String(_.id))).updated_at || 0);
				if (!r || r <= q.current) return;
				let i = await n.get(String(_.id)), a = window.CanvasBoardV2?.syncRemote(i);
				if (!a?.updated) {
					a?.conflicts.includes("save-in-progress") ? U("检测到远端更新，等待当前保存完成后同步") : U(`远端更新与本地修改冲突：${a?.conflicts.join("、") || "无法自动合并"}`);
					return;
				}
				q.current = Math.max(r, Number(i.updated_at || 0)), U(a.merged ? "已合并远端更新，正在保存" : "");
			} catch (e) {
				console.warn("[canvas-modern] remote canvas synchronization failed", e);
			} finally {
				de.current = !1;
			}
		}
	}, [
		_?.id,
		t,
		n
	]);
	(0, m.useEffect)(() => {
		if (!_?.id) return;
		let e = window.setInterval(() => {
			Y();
		}, 5e3), t = (e) => {
			let t = e.data && typeof e.data == "object" ? e.data : {};
			t.type === "canvas_updated" && String(t.canvas_id || "") === String(_.id) && String(t.client_id || "") !== K.current && Y(Number(t.updated_at || 0));
		};
		return window.addEventListener("message", t), () => {
			window.clearInterval(e), window.removeEventListener("message", t);
		};
	}, [_?.id, Y]), (0, m.useEffect)(() => {
		if (!_?.id || e.kind !== "smart") return;
		let t = !1, n = 0, r = null, i = () => {
			if (!t) try {
				let e = window.location.protocol === "https:" ? "wss:" : "ws:";
				r = new WebSocket(`${e}//${window.location.host}/ws/stats?client_id=${encodeURIComponent(K.current)}`), r.onmessage = (e) => {
					try {
						let t = JSON.parse(String(e.data || "{}"));
						if (t.type !== "canvas_updated" || String(t.canvas_id || "") !== String(_.id) || String(t.client_id || "") === K.current) return;
						Y(Number(t.updated_at || 0));
					} catch {}
				}, r.onclose = () => {
					t || (n = window.setTimeout(i, 3e3));
				};
			} catch {
				n = window.setTimeout(i, 3e3);
			}
		};
		return i(), () => {
			t = !0, window.clearTimeout(n), r?.close();
		};
	}, [
		e.kind,
		_?.id,
		Y
	]), (0, m.useEffect)(() => {
		if (!_?.id) return;
		let e = window.setInterval(() => {
			ge();
		}, 5e3);
		return () => window.clearInterval(e);
	}, [ge, _?.id]), (0, m.useEffect)(() => {
		let t = String(e.initialCanvasId || "").trim();
		!t || _ || ue.current || (ue.current = !0, me(a.find((e) => e.id === t) ?? {
			id: t,
			kind: i
		}));
	}, [
		a,
		i,
		e.initialCanvasId,
		_
	]);
	let ve = async () => {
		_?.id && J.current && await t.releaseLock(String(_.id), K.current).catch(() => void 0), J.current = !1, R(null), z(null), V(""), U(""), q.current = 0, y(null), E(null), await fe();
	}, ye = async () => {
		let e = localStorage.getItem("canvasUserName") || "", t = window.prompt("编辑身份名称", e);
		t !== null && (localStorage.setItem("canvasUserName", t.trim()), ne(t.trim()), _?.id && await he());
	}, be = async () => {
		await ve(), window.location.href = e.managerBackHref || "/static/canvas.html";
	}, xe = async () => {
		_?.id && E(await n.listBackups(String(_.id)));
	}, we = async (e) => {
		_?.id && j({
			mode: e,
			document: await n.get(String(_.id))
		});
	}, Te = () => {
		let e = window.CanvasBoardV2?.exportSelection();
		if (!e?.nodes.length) {
			x("没有可导出的节点");
			return;
		}
		let t = new Blob([JSON.stringify({
			version: 2,
			...e
		}, null, 2)], { type: "application/json" }), n = URL.createObjectURL(t);
		Object.assign(document.createElement("a"), {
			download: `${String(_?.title || "canvas")}-workflow.json`,
			href: n
		}).click(), URL.revokeObjectURL(n), P(!1);
	}, Ee = async () => {
		let e = window.CanvasBoardV2?.exportSelection();
		if (!e?.nodes.length) {
			x("没有可导出的节点");
			return;
		}
		try {
			x("正在收集工作流资源…");
			let t = `${String(_?.title || "canvas")}-workflow.zip`, n = await fetch("/api/canvas-workflows/export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...e,
					filename: t,
					include_resources: !0
				})
			});
			if (!n.ok) {
				let e = await n.json().catch(() => ({}));
				throw Error(e.detail || "导出工作流失败");
			}
			qe(await n.blob(), n.headers.get("Content-Disposition"), t), x("已导出含本地资源的工作流 ZIP"), P(!1);
		} catch (e) {
			x(e instanceof Error ? e.message : String(e));
		}
	}, De = (e) => {
		let t = e || window.CanvasBoardV2?.exportSelection();
		if (!t?.nodes.length) {
			x("没有可保存的节点");
			return;
		}
		let n = String(_?.title || "canvas");
		P(!1), I({ saveWorkflow: {
			...t,
			filename: `${n}-workflow.zip`,
			name: n
		} });
	}, Oe = async () => {
		let e = window.CanvasBoardV2?.exportSelection(), t = Je(e?.nodes || []);
		if (!t.length) {
			x("选区中没有可批量导出的媒体或文本");
			return;
		}
		let n = window.prompt("导出到服务器文件夹（留空使用默认导出目录）", "");
		if (n !== null) try {
			let e = await fetch("/api/smart-canvas/group-export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					folder: n.trim(),
					group_name: String(_?.title || "canvas"),
					items: t
				})
			}), r = await e.json().catch(() => ({}));
			if (!e.ok) throw Error(r.detail || "批量导出失败");
			x(`已导出 ${Number(r.count || t.length)} 项到 ${String(r.folder || "默认导出目录")}`), P(!1);
		} catch (e) {
			x(e instanceof Error ? e.message : String(e));
		}
	}, ke = async (e) => {
		try {
			let t = new FormData();
			t.append("file", e);
			let n = await fetch("/api/canvas-workflows/import", {
				method: "POST",
				body: t
			});
			if (!n.ok) throw Error("导入工作流失败");
			let r = Ke(await n.json()), i = window.CanvasBoardV2?.importWorkflow(r) ?? [];
			return x(i.length ? `已导入 ${i.length} 个节点` : "文件中没有可导入节点"), P(!1), i.length;
		} catch (e) {
			throw x(e instanceof Error ? e.message : String(e)), e;
		}
	}, X = () => I({
		onInsert: (t) => {
			let n = e.kind === "smart", r = window.CanvasBoardV2?.addNode(n ? "smart-image" : "image", {
				x: 100,
				y: 100
			});
			r && window.CanvasBoardV2?.updateNode(r, n ? {
				images: [{
					asset_item_id: t.id,
					asset_uris: t.asset_uris,
					kind: t.kind,
					name: t.name,
					url: t.url
				}],
				scale: 2,
				title: t.kind === "video" ? "Video" : t.kind === "audio" ? "Audio" : "Image"
			} : {
				mediaKind: t.kind,
				name: t.name,
				url: t.url
			});
		},
		onImportWorkflow: async (e) => {
			let t = await fetch(e.url);
			if (!t.ok) throw Error("读取资产库工作流失败");
			let n = /\.json(?:[?#]|$)/i.test(e.url) ? ".json" : ".zip";
			await ke(new File([await t.blob()], `${e.name || "workflow"}${n}`));
		}
	}), Ae = () => F ? I(null) : X(), je = () => {
		let t = e.assetInboxKey || "", n = w(t);
		if (!n.length) return x("素材收件箱为空或已过期"), 0;
		let r = Math.max(1, Math.min(n.length, Math.ceil(Math.sqrt(n.length)))), i = n.map((t, n) => {
			let i = e.kind === "smart", a = window.CanvasBoardV2?.addNode(i ? "smart-image" : "image", {
				x: 100 + n % r * 280,
				y: 100 + Math.floor(n / r) * 220
			});
			return a && window.CanvasBoardV2?.updateNode(a, i ? {
				images: [{
					kind: t.kind,
					name: t.name,
					url: t.url
				}],
				scale: 2,
				title: t.kind === "video" ? "Video" : t.kind === "audio" ? "Audio" : "Image"
			} : {
				mediaKind: t.kind,
				name: t.name,
				url: t.url
			}), a;
		}).filter(Boolean);
		return localStorage.removeItem(t), x(`已从素材库导入 ${i.length} 个素材`), i.length;
	};
	if ((0, m.useEffect)(() => {
		if (!_ || !e.assetInboxKey) return;
		let t = (t) => {
			c(t.target) || [...t.clipboardData?.files || []].some(f) || w(e.assetInboxKey || "").length && (t.preventDefault(), je(), window.dispatchEvent(new Event("canvas-board-v2-asset-inbox-pasted")));
		};
		return window.addEventListener("paste", t, !0), () => window.removeEventListener("paste", t, !0);
	}, [e.assetInboxKey, _]), (0, m.useEffect)(() => {
		if (e.kind !== "smart" || !_) {
			document.body.classList.remove("smart-canvas-readonly");
			return;
		}
		return document.body.classList.toggle("smart-canvas-readonly", !!L), () => document.body.classList.remove("smart-canvas-readonly");
	}, [
		e.kind,
		_,
		L
	]), !_) {
		let n = e.kind === "classic" ? Ce : Se;
		return /* @__PURE__ */ (0, T.jsx)(n, {
			canvases: a,
			configuration: e,
			folders: h,
			management: t,
			onOpen: me,
			onRefresh: fe,
			onStatus: x,
			status: b,
			trash: l
		});
	}
	let Me = !e.kind, Z = e.kind === "smart", Ne = Z ? ce(Array.isArray(_.logs) ? _.logs : []) : null, Pe = () => {
		G((e) => {
			let t = !e;
			return localStorage.setItem("canvas_quick_toolbar_collapsed", t ? "1" : "0"), t;
		});
	}, Fe = async () => {
		if (!_?.id) return;
		let e = await n.createBackup(String(_.id)), t = Number(e.updated_at || 0);
		x(t ? `备份已保存 (${new Date(t).toLocaleTimeString()})` : "备份已保存"), await xe();
	}, Ie = async (e) => {
		if (!_?.id) return;
		if (L) {
			x("画布正在被其他人编辑，无法恢复备份");
			return;
		}
		await window.CanvasBoardV2?.flushSaves();
		let t = await n.restoreBackup(String(_.id), e);
		q.current = Number(t.updated_at || 0), y(t), E(null), x("备份已恢复");
	}, Q = async (e) => {
		_?.id && (await t.deleteBackup(String(_.id), e), await xe());
	};
	return /* @__PURE__ */ (0, T.jsxs)("main", {
		className: `canvas-modern-editor ${Me || Z ? "shell" : ""}`,
		id: Z ? "shell" : void 0,
		children: [
			Me ? /* @__PURE__ */ (0, T.jsxs)("header", {
				className: "topbar canvas-modern-topbar",
				children: [/* @__PURE__ */ (0, T.jsxs)("div", {
					className: "panel canvas-nav",
					children: [
						/* @__PURE__ */ (0, T.jsx)("button", {
							"aria-label": "返回画布管理",
							className: "tool-btn",
							onClick: () => void ve(),
							title: "返回画布管理",
							type: "button",
							children: /* @__PURE__ */ (0, T.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": "arrow-left"
							})
						}),
						/* @__PURE__ */ (0, T.jsxs)("div", {
							className: "canvas-nav-meta",
							children: [/* @__PURE__ */ (0, T.jsx)("div", {
								className: "current-canvas-title",
								children: String(_.title || "未命名画布")
							}), /* @__PURE__ */ (0, T.jsx)("div", {
								className: "current-canvas-time",
								children: L ? `只读 · ${$(L)} 编辑中` : H || He(_.updated_at)
							})]
						}),
						L ? /* @__PURE__ */ (0, T.jsxs)("div", {
							className: "canvas-lock-badge locked-by-other",
							title: `${$(L)} 正在编辑`,
							children: [/* @__PURE__ */ (0, T.jsx)("i", {
								className: "w-3.5 h-3.5",
								"data-lucide": "lock"
							}), /* @__PURE__ */ (0, T.jsx)("span", { children: $(L) })]
						}) : null,
						/* @__PURE__ */ (0, T.jsxs)("button", {
							"aria-label": "设置我的名称",
							className: "canvas-identity-btn",
							onClick: () => void ye(),
							title: "设置我的名称",
							type: "button",
							children: [/* @__PURE__ */ (0, T.jsx)("i", {
								className: "w-3.5 h-3.5",
								"data-lucide": "user-pen"
							}), /* @__PURE__ */ (0, T.jsx)("span", { children: "我的名称" })]
						})
					]
				}), /* @__PURE__ */ (0, T.jsxs)("div", {
					className: `panel toolbar editor-only canvas-modern-toolbar ${ae ? "collapsed" : ""}`,
					children: [
						/* @__PURE__ */ (0, T.jsx)("button", {
							"aria-label": ae ? "展开快捷菜单" : "折叠快捷菜单",
							className: "tool-btn toolbar-toggle",
							onClick: Pe,
							title: ae ? "展开快捷菜单" : "折叠快捷菜单",
							type: "button",
							children: /* @__PURE__ */ (0, T.jsx)("i", {
								className: "w-4 h-4",
								"data-lucide": "chevron-left"
							})
						}),
						/* @__PURE__ */ (0, T.jsxs)("div", {
							className: "toolbar-items",
							children: [Re.map(([e, t, n]) => /* @__PURE__ */ (0, T.jsxs)("button", {
								className: "tool-btn",
								disabled: !!L,
								onClick: () => window.CanvasBoardV2?.addNode(e),
								type: "button",
								children: [/* @__PURE__ */ (0, T.jsx)("i", {
									className: "w-4 h-4",
									"data-lucide": n
								}), /* @__PURE__ */ (0, T.jsx)("span", { children: t })]
							}, e)), /* @__PURE__ */ (0, T.jsxs)("button", {
								className: "tool-btn",
								disabled: !!L,
								onClick: () => window.CanvasBoardV2?.groupSelected(),
								type: "button",
								children: [/* @__PURE__ */ (0, T.jsx)("i", {
									className: "w-4 h-4",
									"data-lucide": "group"
								}), /* @__PURE__ */ (0, T.jsx)("span", { children: "分组" })]
							})]
						}),
						/* @__PURE__ */ (0, T.jsxs)("div", {
							className: "toolbar-fixed",
							children: [
								/* @__PURE__ */ (0, T.jsxs)("button", {
									"aria-label": "导入导出工作流",
									className: "tool-btn toolbar-workflow",
									onClick: () => P(!0),
									title: "导入导出工作流",
									type: "button",
									children: [/* @__PURE__ */ (0, T.jsx)("i", {
										className: "w-4 h-4",
										"data-lucide": "package-open"
									}), /* @__PURE__ */ (0, T.jsx)("span", { children: "工作流" })]
								}),
								/* @__PURE__ */ (0, T.jsxs)("button", {
									"aria-label": "资产库",
									className: "tool-btn toolbar-asset canvas-asset-toggle",
									onClick: X,
									title: "资产库",
									type: "button",
									children: [/* @__PURE__ */ (0, T.jsx)("i", {
										className: "w-4 h-4",
										"data-lucide": "library"
									}), /* @__PURE__ */ (0, T.jsx)("span", { children: "资产库" })]
								}),
								/* @__PURE__ */ (0, T.jsxs)("button", {
									"aria-label": "费用仪表盘",
									className: "tool-btn toolbar-cost",
									onClick: () => void we("cost"),
									title: "费用仪表盘",
									type: "button",
									children: [/* @__PURE__ */ (0, T.jsx)("i", {
										className: "w-4 h-4",
										"data-lucide": "circle-dollar-sign"
									}), /* @__PURE__ */ (0, T.jsxs)("span", { children: ["费用 ¥", C(_).toFixed(2)] })]
								}),
								/* @__PURE__ */ (0, T.jsxs)("button", {
									"aria-label": "日志",
									className: "tool-btn toolbar-log",
									onClick: () => void we("logs"),
									title: "日志",
									type: "button",
									children: [/* @__PURE__ */ (0, T.jsx)("i", {
										className: "w-4 h-4",
										"data-lucide": "list-todo"
									}), /* @__PURE__ */ (0, T.jsx)("span", { children: "日志" })]
								}),
								/* @__PURE__ */ (0, T.jsxs)("button", {
									"aria-label": "备份",
									className: "tool-btn toolbar-backup",
									disabled: !!L,
									onClick: () => void xe(),
									title: "备份",
									type: "button",
									children: [/* @__PURE__ */ (0, T.jsx)("i", {
										className: "w-4 h-4",
										"data-lucide": "hard-drive"
									}), /* @__PURE__ */ (0, T.jsx)("span", { children: "备份" })]
								})
							]
						})
					]
				})]
			}) : /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [
				/* @__PURE__ */ (0, T.jsxs)("div", {
					className: "smart-nav",
					children: [
						/* @__PURE__ */ (0, T.jsx)("button", {
							"aria-label": "返回画布管理",
							className: "smart-nav-back",
							onClick: () => void be(),
							title: "返回画布管理",
							type: "button",
							children: /* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "arrow-left" })
						}),
						/* @__PURE__ */ (0, T.jsxs)("div", {
							className: "smart-nav-meta",
							children: [/* @__PURE__ */ (0, T.jsx)("div", {
								className: "smart-title",
								id: "smartTitle",
								children: String(_.title || "智能画布")
							}), /* @__PURE__ */ (0, T.jsx)("div", {
								className: "smart-canvas-time",
								id: "smartCanvasTime",
								children: H || Ue(_.updated_at)
							})]
						}),
						/* @__PURE__ */ (0, T.jsxs)("div", {
							className: `smart-lock-badge ${L ? "other" : "mine"}`,
							id: "smartLockBadge",
							title: L ? `${$(L)} 正在编辑` : Ge(ee),
							children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "lock" }), /* @__PURE__ */ (0, T.jsx)("span", {
								id: "smartLockLabel",
								children: L ? `${$(L)} 编辑中` : We(ee)
							})]
						}),
						/* @__PURE__ */ (0, T.jsxs)("button", {
							className: "smart-identity-btn",
							id: "smartIdentityBtn",
							onClick: () => void ye(),
							title: "设置我的名称",
							type: "button",
							children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "user-pen" }), /* @__PURE__ */ (0, T.jsx)("span", {
								id: "smartIdentityLabel",
								children: W || "未命名用户"
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, T.jsxs)("button", {
					"aria-label": "导入导出工作流",
					className: `smart-workflow-toggle ${N ? "active" : ""}`,
					id: "smartWorkflowToggle",
					onClick: () => P(!0),
					title: "导入导出工作流",
					type: "button",
					children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "package-open" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "工作流" })]
				}),
				/* @__PURE__ */ (0, T.jsxs)("button", {
					"aria-label": "快捷键",
					className: `smart-shortcut-toggle ${re ? "active" : ""}`,
					id: "smartShortcutToggle",
					onClick: () => ie(!0),
					title: "快捷键",
					type: "button",
					children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "keyboard" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "快捷键" })]
				}),
				/* @__PURE__ */ (0, T.jsxs)("button", {
					"aria-label": "费用仪表盘",
					className: `smart-cost-toggle ${A?.mode === "cost" ? "active" : ""}`,
					id: "smartCostToggle",
					onClick: () => void we("cost"),
					title: Ne?.unknown ? `费用仪表盘 · ${Ne.unknown} 笔待定价` : "费用仪表盘",
					type: "button",
					children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "circle-dollar-sign" }), /* @__PURE__ */ (0, T.jsxs)("span", {
						id: "smartCostToggleLabel",
						children: ["费用 ", le(Ne?.total || 0)]
					})]
				}),
				/* @__PURE__ */ (0, T.jsxs)("button", {
					"aria-label": "日志",
					className: `smart-log-toggle ${A?.mode === "logs" ? "active" : ""}`,
					id: "smartLogToggle",
					onClick: () => void we("logs"),
					title: "日志",
					type: "button",
					children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "list-todo" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "日志" })]
				}),
				/* @__PURE__ */ (0, T.jsxs)("button", {
					"aria-label": "备份",
					className: `smart-backup-toggle ${S ? "active" : ""}`,
					id: "smartBackupToggle",
					onClick: () => void xe(),
					title: "备份",
					type: "button",
					children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "hard-drive" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "备份" })]
				}),
				/* @__PURE__ */ (0, T.jsxs)("button", {
					className: `asset-toggle ${F ? "active" : ""}`,
					id: "assetToggle",
					onClick: X,
					type: "button",
					children: [/* @__PURE__ */ (0, T.jsx)("i", { "data-lucide": "library" }), /* @__PURE__ */ (0, T.jsx)("span", { children: "资产库" })]
				}),
				/* @__PURE__ */ (0, T.jsx)(u, {
					onClose: () => ie(!1),
					onToggleAssets: Ae,
					open: re
				})
			] }),
			/* @__PURE__ */ (0, T.jsx)("div", {
				className: `canvas-modern-board ${Z ? "world" : ""}`,
				id: Z ? "world" : void 0,
				ref: se,
				style: Z ? {
					height: "100%",
					inset: 0,
					position: "absolute",
					transform: "none",
					width: "100%"
				} : Me ? { inset: 0 } : void 0
			}),
			Z ? /* @__PURE__ */ (0, T.jsx)("div", {
				className: "selection-box",
				id: "selectionBox"
			}) : null,
			Z ? /* @__PURE__ */ (0, T.jsx)("div", {
				"aria-live": "polite",
				className: `toast ${b ? "show" : ""}`,
				id: "toast",
				children: b
			}) : null,
			Z ? /* @__PURE__ */ (0, T.jsx)(pe, {
				backups: S,
				lockHolder: L,
				lockIssue: B,
				onAcquireLock: he,
				onCloseBackups: () => E(null),
				onCreateBackup: Fe,
				onDeleteBackup: Q,
				onRestoreBackup: Ie,
				onStatus: x
			}) : null,
			Me ? /* @__PURE__ */ (0, T.jsx)("div", {
				className: "hint editor-only",
				children: "拖拽画布移动，Ctrl 框选多选，拖动选中节点可一起移动。上传/提示词节点右下端口拖线到生成节点。"
			}) : null,
			e.editorAddon,
			L && !Z ? /* @__PURE__ */ (0, T.jsx)("div", {
				className: "canvas-modern-readonly-overlay",
				children: /* @__PURE__ */ (0, T.jsxs)("section", { children: [
					/* @__PURE__ */ (0, T.jsx)("strong", { children: "只读模式" }),
					/* @__PURE__ */ (0, T.jsxs)("span", { children: [$(L), " 正在编辑此画布"] }),
					B ? /* @__PURE__ */ (0, T.jsx)("small", { children: B }) : null,
					/* @__PURE__ */ (0, T.jsx)("button", {
						className: "primary-btn",
						onClick: () => void he(),
						type: "button",
						children: "尝试取得编辑锁"
					})
				] })
			}) : null,
			S && !Z ? /* @__PURE__ */ (0, T.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, T.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, T.jsxs)("header", { children: [/* @__PURE__ */ (0, T.jsx)("strong", { children: "画布备份" }), /* @__PURE__ */ (0, T.jsx)("button", {
							onClick: () => E(null),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, T.jsx)("button", {
							onClick: Fe,
							type: "button",
							children: "立即备份"
						}),
						S.map((e) => /* @__PURE__ */ (0, T.jsxs)("div", {
							className: "backup-item",
							children: [
								/* @__PURE__ */ (0, T.jsx)("span", { children: String(e.filename) }),
								/* @__PURE__ */ (0, T.jsx)("button", {
									onClick: () => void Ie(String(e.filename)),
									type: "button",
									children: "恢复"
								}),
								/* @__PURE__ */ (0, T.jsx)("button", {
									onClick: () => void Q(String(e.filename)),
									type: "button",
									children: "删除"
								})
							]
						}, String(e.filename)))
					]
				})
			}) : null,
			O ? /* @__PURE__ */ (0, T.jsx)(_e, {
				onClose: () => k(null),
				request: O
			}) : null,
			N ? Z ? /* @__PURE__ */ (0, T.jsx)(te, {
				onClose: () => P(!1),
				onImport: ke,
				onSaveToLibrary: De,
				onStatus: x,
				title: String(_.title || "canvas")
			}) : /* @__PURE__ */ (0, T.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, T.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, T.jsxs)("header", { children: [/* @__PURE__ */ (0, T.jsx)("strong", { children: "工作流导入 / 导出" }), /* @__PURE__ */ (0, T.jsx)("button", {
							onClick: () => P(!1),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, T.jsx)("p", { children: "有选中节点时仅导出选区；分组会自动包含其成员。ZIP 会携带节点引用的本地媒体，导入后自动恢复资源地址。" }),
						/* @__PURE__ */ (0, T.jsx)("button", {
							onClick: Te,
							type: "button",
							children: "导出 JSON"
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							className: "primary-btn",
							onClick: () => void Ee(),
							type: "button",
							children: "导出 ZIP（含资源）"
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							onClick: () => De(),
							type: "button",
							children: "保存到工作流库"
						}),
						/* @__PURE__ */ (0, T.jsx)("button", {
							onClick: () => void Oe(),
							type: "button",
							children: "批量导出选区结果"
						}),
						/* @__PURE__ */ (0, T.jsxs)("label", {
							className: "primary-btn",
							children: ["导入 JSON / ZIP", /* @__PURE__ */ (0, T.jsx)("input", {
								accept: ".json,.zip,application/json,application/zip",
								hidden: !0,
								onChange: (e) => {
									let t = e.target.files?.[0];
									t && ke(t);
								},
								type: "file"
							})]
						})
					]
				})
			}) : null,
			F ? Z ? /* @__PURE__ */ (0, T.jsx)(M, {
				onClose: () => I(null),
				request: F
			}) : /* @__PURE__ */ (0, T.jsx)(D, {
				onClose: () => I(null),
				request: F
			}) : null,
			A ? Z ? /* @__PURE__ */ (0, T.jsx)(oe, {
				document: A.document,
				mode: A.mode,
				onClose: () => j(null)
			}) : /* @__PURE__ */ (0, T.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, T.jsxs)("section", {
					className: "modal-panel",
					children: [/* @__PURE__ */ (0, T.jsxs)("header", { children: [/* @__PURE__ */ (0, T.jsx)("strong", { children: A.mode === "logs" ? "生成日志" : "费用汇总" }), /* @__PURE__ */ (0, T.jsx)("button", {
						onClick: () => j(null),
						type: "button",
						children: "关闭"
					})] }), A.mode === "logs" ? /* @__PURE__ */ (0, T.jsx)(T.Fragment, { children: (Array.isArray(A.document.logs) ? A.document.logs : []).slice().reverse().map((e, t) => /* @__PURE__ */ (0, T.jsx)("pre", { children: JSON.stringify(e, null, 2) }, String(e.id || t))) }) : /* @__PURE__ */ (0, T.jsxs)(T.Fragment, { children: [/* @__PURE__ */ (0, T.jsxs)("h2", { children: ["¥ ", C(A.document).toFixed(4)] }), /* @__PURE__ */ (0, T.jsx)("p", { children: "仅汇总任务记录中已返回的费用字段；供应商未返回价格时显示为 0。" })] })]
				})
			}) : null
		]
	});
}
function Be(e, t) {
	let n = (0, h.createRoot)(e);
	return n.render(/* @__PURE__ */ (0, T.jsx)(ze, { ...t })), () => n.unmount();
}
function Ve() {
	let e = sessionStorage.getItem("canvasClientId");
	if (e) return e;
	let t = `canvas_${crypto.randomUUID?.() || Date.now()}`;
	return sessionStorage.setItem("canvasClientId", t), t;
}
function He(e) {
	let t = Number(e || 0);
	return t ? new Date(t < 1e10 ? t * 1e3 : t).toLocaleString() : "--";
}
function Ue(e) {
	let t = Number(e || 0);
	if (!t) return "--";
	let n = new Date(t < 1e10 ? t * 1e3 : t);
	return Number.isNaN(n.getTime()) ? "--" : n.toLocaleString("zh-CN", {
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		month: "2-digit"
	});
}
function $(e) {
	return String(e?.username || e?.ip || "其他用户");
}
function We(e) {
	return `你正在编辑${e?.ip ? ` · ${String(e.ip)}` : ""}`;
}
function Ge(e) {
	return [`用户：${String(e?.username || "").trim() || "未命名用户"}`, e?.ip ? `IP：${String(e.ip)}` : ""].filter(Boolean).join("\n");
}
function Ke(e) {
	let t = e && typeof e == "object" ? e : {}, n = t.workflow && typeof t.workflow == "object" ? t.workflow : t;
	return {
		connections: Array.isArray(n.connections) ? n.connections : [],
		nodes: Array.isArray(n.nodes) ? n.nodes : []
	};
}
function qe(e, t, n) {
	let r = t?.match(/filename\*=UTF-8''([^;]+)/i)?.[1], i = t?.match(/filename="?([^";]+)"?/i)?.[1], a = r ? decodeURIComponent(r) : i || n, o = URL.createObjectURL(e);
	Object.assign(document.createElement("a"), {
		download: a,
		href: o
	}).click(), URL.revokeObjectURL(o);
}
function Je(e) {
	let t = [], n = /* @__PURE__ */ new Set(), r = (e, r) => {
		let i = e && typeof e == "object" ? e : {}, a = typeof e == "string" ? e : String(i.url || "");
		if (!a || n.has(a)) return;
		n.add(a);
		let o = String(i.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(a) ? "video" : /\.(mp3|wav|m4a)(\?|$)/i.test(a) ? "audio" : "image"));
		t.push({
			kind: o,
			name: String(i.name || r),
			url: a
		});
	};
	return e.forEach((e, n) => {
		if (!e || typeof e != "object") return;
		let i = e, a = String(i.title || i.name || `${String(i.type || "node")}-${n + 1}`);
		i.url && r(i, a), Array.isArray(i.images) && i.images.forEach((e, t) => r(e, `${a}-${t + 1}`));
		let o = String(i.outputText || i.type === "prompt" && i.text || "").trim();
		o && t.push({
			kind: "text",
			name: `${a}.txt`,
			text: o
		});
	}), t;
}
//#endregion
export { Be as mountCanvasAppV2 };
