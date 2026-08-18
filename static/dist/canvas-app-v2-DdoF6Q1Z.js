import { c as e, o as t, s as n, t as r } from "./jsx-runtime-DnrZ1XIK.js";
import { n as i } from "./http-F-lX8WKW.js";
import { r as a } from "./document-merge-DziDwlrU.js";
import { t as o } from "./canvas-board-v2-BzomSQX-.js";
//#region src/canvas/infrastructure/canvas-management.ts
var s = /* @__PURE__ */ e(n(), 1), c = t();
function l(e = fetch) {
	return {
		acquireLock: (t, n, r = "") => f(e, `/api/canvases/${encodeURIComponent(t)}/lock`, "POST", {
			client_id: n,
			username: r
		}),
		create: async (t = "", n = {}) => {
			let r = await f(e, "/api/canvases", "POST", {
				title: t.trim() || void 0,
				folder_id: n.folderId || void 0,
				icon: n.icon || void 0,
				kind: n.kind || void 0
			});
			return d(r).canvas ? d(d(r).canvas) : d(r);
		},
		createFolder: async (t, n = "") => d(await f(e, "/api/canvas-folders", "POST", {
			name: t,
			parent_id: n
		})),
		delete: (t) => p(e, `/api/canvases/${encodeURIComponent(t)}`, "DELETE"),
		deleteBackup: (t, n) => p(e, `/api/canvases/${encodeURIComponent(t)}/backups/${encodeURIComponent(n)}`, "DELETE"),
		deleteFolder: (t) => p(e, `/api/canvas-folders/${encodeURIComponent(t)}`, "DELETE"),
		list: async () => u(await i(e, "/api/canvases")),
		listFolders: async () => {
			let t = await i(e, "/api/canvas-folders"), n = d(t), r = Array.isArray(t) ? t : n.folders;
			return (Array.isArray(r) ? r : []).map(d).filter((e) => e.id).map((e) => e);
		},
		listTrash: async () => u(await i(e, "/api/canvases/trash")),
		moveToFolder: (t, n) => f(e, `/api/canvases/${encodeURIComponent(t)}/folder`, "PATCH", { folder_id: n }).then(() => void 0),
		purge: (t) => p(e, `/api/canvases/${encodeURIComponent(t)}/purge`, "DELETE"),
		releaseLock: async (t, n, r = !1) => {
			if (r) {
				await f(e, `/api/canvases/${encodeURIComponent(t)}/lock/release`, "POST", { client_id: n }, !0);
				return;
			}
			await p(e, `/api/canvases/${encodeURIComponent(t)}/lock?client_id=${encodeURIComponent(n)}`, "DELETE");
		},
		restore: (t) => p(e, `/api/canvases/${encodeURIComponent(t)}/restore`, "POST"),
		updateFolder: async (t, n) => d(await f(e, `/api/canvas-folders/${encodeURIComponent(t)}`, "PATCH", n))
	};
}
function u(e) {
	let t = d(e), n = Array.isArray(e) ? e : t.canvases;
	return (Array.isArray(n) ? n : []).map(d).filter((e) => e.id).map((e) => e);
}
function d(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
function f(e, t, n, r, a = !1) {
	return i(e, t, {
		method: n,
		keepalive: a,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(r ?? {})
	});
}
async function p(e, t, n) {
	await i(e, t, { method: n });
}
//#endregion
//#region src/canvas/ui/canvas-app-domain.ts
function m(e) {
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
function h(e, t = Date.now()) {
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
//#region src/canvas/infrastructure/prompt-library-client.ts
var g = {
	list: () => _("/api/prompt-libraries"),
	createLibrary: (e) => _("/api/prompt-libraries", v("POST", { name: e })),
	renameLibrary: (e, t) => _(`/api/prompt-libraries/${encodeURIComponent(e)}`, v("PATCH", { name: t })),
	deleteLibrary: (e) => _(`/api/prompt-libraries/${encodeURIComponent(e)}`, v("DELETE")),
	savePrompt: (e, t) => _(t.id ? `/api/prompt-libraries/items/${encodeURIComponent(t.id)}` : "/api/prompt-libraries/items", v(t.id ? "PATCH" : "POST", {
		library_id: e,
		...t
	})),
	deletePrompts: (e) => _("/api/prompt-libraries/items/delete", v("POST", { ids: e })),
	createCategory: (e, t) => _("/api/prompt-libraries/categories", v("POST", {
		library_id: e,
		name: t
	}))
};
async function _(e, t) {
	let n = await fetch(e, t), r = await n.json().catch(() => ({}));
	if (!n.ok) throw Error(r.detail || `请求失败 (${n.status})`);
	return r;
}
function v(e, t) {
	return {
		method: e,
		headers: t === void 0 ? void 0 : { "Content-Type": "application/json" },
		body: t === void 0 ? void 0 : JSON.stringify(t)
	};
}
//#endregion
//#region src/canvas/ui/prompt-library-dialog.tsx
var y = r();
function b({ onClose: e, request: t }) {
	let [n, r] = (0, s.useState)({
		active_library_id: "",
		libraries: []
	}), [i, a] = (0, s.useState)(""), [o, c] = (0, s.useState)(""), [l, u] = (0, s.useState)(""), [d, f] = (0, s.useState)("正在加载提示词库…"), [p, m] = (0, s.useState)({
		category: "",
		name: "",
		negative: "",
		positive: t.initialText || "",
		scene: ""
	}), h = n.libraries.find((e) => e.id === i) ?? n.libraries[0], _ = (0, s.useMemo)(() => (h?.items || []).filter((e) => S(e, l)), [h, l]), v = h?.items.find((e) => e.id === o), b = (e, t = i, n = o) => {
		r(e);
		let s = e.libraries.find((e) => e.id === t) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0];
		a(s?.id || "");
		let l = s?.items.find((e) => e.id === n) ?? s?.items[0];
		c(l?.id || ""), l && m(x(l));
	};
	(0, s.useEffect)(() => {
		let e = !0;
		return g.list().then((t) => {
			e && (b(t.library, t.library.active_library_id, ""), f(""));
		}).catch((t) => e && f(t instanceof Error ? t.message : String(t))), () => {
			e = !1;
		};
	}, []);
	let C = (e) => {
		let r = n.libraries.find((t) => t.id === e);
		a(e), c(r?.items[0]?.id || ""), m(r?.items[0] ? x(r.items[0]) : {
			category: r?.categories[0]?.id || "",
			name: "",
			negative: "",
			positive: t.initialText || "",
			scene: ""
		});
	}, w = (e) => {
		c(e.id), m(x(e));
	}, T = () => {
		c(""), m({
			category: h?.categories[0]?.id || "",
			name: "",
			negative: "",
			positive: t.initialText || "",
			scene: ""
		}), f("正在新建提示词");
	}, E = async () => {
		if (!h) {
			f("请先创建提示词库");
			return;
		}
		if (!p.positive.trim()) {
			f("提示词内容不能为空");
			return;
		}
		try {
			let e = await g.savePrompt(h.id, {
				...v ? { id: v.id } : {},
				category: p.category,
				name: p.name.trim() || p.positive.trim().slice(0, 28),
				negative: p.negative,
				positive: p.positive,
				scene: p.scene
			}), t = String(e.item?.id || v?.id || "");
			b(e.library, h.id, t), f(v ? "提示词已更新" : "提示词已创建");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, D = async () => {
		if (!(!v || !window.confirm(`删除提示词“${v.name}”？`))) try {
			let e = await g.deletePrompts([v.id]);
			b(e.library, h?.id, ""), f("提示词已删除");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, O = async () => {
		let e = window.prompt("新提示词库名称")?.trim();
		if (e) try {
			let t = await g.createLibrary(e);
			b(t.library, t.library.active_library_id, ""), f("提示词库已创建");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, k = async () => {
		if (!h || h.id === "system") return;
		let e = window.prompt("提示词库名称", h.name)?.trim();
		if (e) try {
			let t = await g.renameLibrary(h.id, e);
			b(t.library, h.id, o), f("提示词库已重命名");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, A = async () => {
		if (!(!h || h.id === "system" || !window.confirm(`删除提示词库“${h.name}”？`))) try {
			let e = await g.deleteLibrary(h.id);
			b(e.library, e.library.active_library_id, ""), f("提示词库已删除");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, j = async () => {
		if (!h) return;
		let e = window.prompt("新分组名称")?.trim();
		if (e) try {
			let t = await g.createCategory(h.id, e);
			b(t.library, h.id, o), f("分组已创建");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, M = (n = !1) => {
		let r = p.positive.trim();
		if (!r) {
			f("提示词内容不能为空");
			return;
		}
		t.onApply(n && p.negative.trim() ? `${r}\n\nNegative prompt:\n${p.negative.trim()}` : r), e();
	};
	return /* @__PURE__ */ (0, y.jsx)("div", {
		"aria-modal": "true",
		className: "modal open canvas-modern-backups prompt-library-dialog",
		role: "dialog",
		children: /* @__PURE__ */ (0, y.jsxs)("section", {
			className: "modal-panel",
			children: [
				/* @__PURE__ */ (0, y.jsxs)("header", { children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: "提示词库" }), /* @__PURE__ */ (0, y.jsx)("button", {
					onClick: e,
					type: "button",
					children: "关闭"
				})] }),
				/* @__PURE__ */ (0, y.jsxs)("div", {
					className: "prompt-library-toolbar",
					children: [
						/* @__PURE__ */ (0, y.jsx)("select", {
							"aria-label": "提示词库",
							onChange: (e) => C(e.target.value),
							value: h?.id || "",
							children: n.libraries.map((e) => /* @__PURE__ */ (0, y.jsx)("option", {
								value: e.id,
								children: e.name
							}, e.id))
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							onClick: () => void O(),
							type: "button",
							children: "新建库"
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							disabled: !h || h.id === "system",
							onClick: () => void k(),
							type: "button",
							children: "重命名库"
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							disabled: !h || h.id === "system",
							onClick: () => void A(),
							type: "button",
							children: "删除库"
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							disabled: !h,
							onClick: () => void j(),
							type: "button",
							children: "新建分组"
						}),
						/* @__PURE__ */ (0, y.jsx)("input", {
							"aria-label": "搜索提示词",
							onChange: (e) => u(e.target.value),
							placeholder: "搜索名称、场景或内容",
							value: l
						})
					]
				}),
				/* @__PURE__ */ (0, y.jsxs)("div", {
					className: "prompt-library-body",
					children: [/* @__PURE__ */ (0, y.jsxs)("aside", { children: [
						/* @__PURE__ */ (0, y.jsx)("button", {
							className: "primary-btn",
							onClick: T,
							type: "button",
							children: "新建提示词"
						}),
						_.map((e) => /* @__PURE__ */ (0, y.jsxs)("button", {
							className: e.id === o ? "active" : "",
							onClick: () => w(e),
							type: "button",
							children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: e.name || "未命名" }), /* @__PURE__ */ (0, y.jsx)("small", { children: e.scene || e.positive.slice(0, 60) })]
						}, e.id)),
						_.length ? null : /* @__PURE__ */ (0, y.jsx)("p", { children: "当前库暂无匹配内容" })
					] }), /* @__PURE__ */ (0, y.jsxs)("div", {
						className: "prompt-library-editor",
						children: [
							/* @__PURE__ */ (0, y.jsxs)("label", { children: ["名称", /* @__PURE__ */ (0, y.jsx)("input", {
								"aria-label": "提示词名称",
								onChange: (e) => m((t) => ({
									...t,
									name: e.target.value
								})),
								value: p.name
							})] }),
							/* @__PURE__ */ (0, y.jsxs)("label", { children: ["分组", /* @__PURE__ */ (0, y.jsxs)("select", {
								"aria-label": "提示词分组",
								onChange: (e) => m((t) => ({
									...t,
									category: e.target.value
								})),
								value: p.category,
								children: [/* @__PURE__ */ (0, y.jsx)("option", {
									value: "",
									children: "未分组"
								}), (h?.categories || []).map((e) => /* @__PURE__ */ (0, y.jsx)("option", {
									value: e.id,
									children: e.name
								}, e.id))]
							})] }),
							/* @__PURE__ */ (0, y.jsxs)("label", { children: ["场景", /* @__PURE__ */ (0, y.jsx)("input", {
								"aria-label": "提示词场景",
								onChange: (e) => m((t) => ({
									...t,
									scene: e.target.value
								})),
								value: p.scene
							})] }),
							/* @__PURE__ */ (0, y.jsxs)("label", { children: ["正向提示词", /* @__PURE__ */ (0, y.jsx)("textarea", {
								"aria-label": "正向提示词",
								onChange: (e) => m((t) => ({
									...t,
									positive: e.target.value
								})),
								value: p.positive
							})] }),
							/* @__PURE__ */ (0, y.jsxs)("label", { children: ["负向提示词", /* @__PURE__ */ (0, y.jsx)("textarea", {
								"aria-label": "负向提示词",
								onChange: (e) => m((t) => ({
									...t,
									negative: e.target.value
								})),
								value: p.negative
							})] }),
							/* @__PURE__ */ (0, y.jsxs)("div", {
								className: "prompt-library-actions",
								children: [
									/* @__PURE__ */ (0, y.jsx)("button", {
										onClick: () => void E(),
										type: "button",
										children: v ? "保存修改" : "创建提示词"
									}),
									/* @__PURE__ */ (0, y.jsx)("button", {
										disabled: !v,
										onClick: () => void D(),
										type: "button",
										children: "删除提示词"
									}),
									/* @__PURE__ */ (0, y.jsx)("button", {
										onClick: () => M(!1),
										type: "button",
										children: "应用正向"
									}),
									/* @__PURE__ */ (0, y.jsx)("button", {
										className: "primary-btn",
										onClick: () => M(!0),
										type: "button",
										children: "应用完整提示词"
									})
								]
							})
						]
					})]
				}),
				d ? /* @__PURE__ */ (0, y.jsx)("div", {
					className: "gate-status",
					role: "status",
					children: d
				}) : null
			]
		})
	});
}
function x(e) {
	return {
		category: e.category || "",
		name: e.name || "",
		negative: e.negative || "",
		positive: e.positive || "",
		scene: e.scene || ""
	};
}
function S(e, t) {
	let n = t.trim().toLocaleLowerCase();
	return !n || [
		e.name,
		e.positive,
		e.negative,
		e.scene
	].some((e) => e?.toLocaleLowerCase().includes(n));
}
//#endregion
//#region src/canvas/ui/canvas-app-v2.tsx
var C = [
	["image", "上传"],
	["prompt", "提示词"],
	["loop", "循环"],
	["llm", "LLM"],
	["generator", "API生成"],
	["msgen", "ModelScope"],
	["video", "视频"],
	["comfy", "ComfyUI"],
	["ltxDirector", "LTX Director"],
	["output", "Output"]
];
function w({ configuration: e = {}, management: t = l(), repository: n, runtime: r }) {
	let i = e.kind ?? "classic", [c, u] = (0, s.useState)([]), [d, f] = (0, s.useState)([]), [p, g] = (0, s.useState)([]), [_, v] = (0, s.useState)("all"), [x, S] = (0, s.useState)(!1), [w, T] = (0, s.useState)(null), [A, j] = (0, s.useState)(""), [M, N] = (0, s.useState)("正在加载画布列表…"), [P, F] = (0, s.useState)(null), [I, L] = (0, s.useState)(null), [R, z] = (0, s.useState)(null), [B, V] = (0, s.useState)(!1), [H, U] = (0, s.useState)(null), W = (0, s.useRef)(null), G = (0, s.useRef)(E()), K = (0, s.useRef)(!1), q = (0, s.useCallback)(async () => {
		N("正在加载画布列表…");
		try {
			let [e, n, r] = await Promise.all([
				t.list(),
				t.listTrash(),
				t.listFolders()
			]), a = (e) => String(e.kind || "classic") === i, o = e.filter(a), s = n.filter(a);
			u(o.sort((e, t) => Number(t.updated_at || 0) - Number(e.updated_at || 0))), f(s), g(r), N(o.length ? "" : "还没有画布，新建一个开始创作。");
		} catch (e) {
			N(e instanceof Error ? e.message : String(e));
		}
	}, [i, t]);
	(0, s.useEffect)(() => {
		q();
	}, [q]), (0, s.useEffect)(() => {
		let e = W.current;
		if (!(!e || !w)) return o(e, null, {
			initialDocument: w,
			repository: n,
			runtime: r
		});
	}, [
		w,
		n,
		r
	]), (0, s.useEffect)(() => {
		let e = () => {
			w?.id && t.releaseLock(String(w.id), G.current, !0);
		};
		return window.addEventListener("pagehide", e, { once: !0 }), () => window.removeEventListener("pagehide", e);
	}, [w?.id, t]), (0, s.useEffect)(() => {
		let e = window.openPromptTemplateModal, t = window.openCanvasPromptLibrary;
		return window.openPromptTemplateModal = (e) => {
			L({ onApply: (t) => {
				window.CanvasBoardV2?.updateNode(e, { text: t });
			} });
		}, window.openCanvasPromptLibrary = (e) => L(e), () => {
			e ? window.openPromptTemplateModal = e : delete window.openPromptTemplateModal, t ? window.openCanvasPromptLibrary = t : delete window.openCanvasPromptLibrary;
		};
	}, []);
	let J = async (e) => {
		N("正在打开画布…");
		try {
			let i = await t.acquireLock(e.id, G.current, localStorage.getItem("canvasUserName") || "");
			if (!i.ok) throw Error(`画布正由 ${String(i.holder?.username || "其他用户")} 编辑`);
			let o = await n.get(e.id);
			T(o), N(""), r.recoverDocument(o).then(async (t) => {
				if (JSON.stringify(t) === JSON.stringify(o)) return;
				let r = await n.save(e.id, a(t));
				T((e) => e?.id === r.id ? r : e);
			}).catch((e) => N(`任务恢复失败：${e instanceof Error ? e.message : String(e)}`));
		} catch (e) {
			N(e instanceof Error ? e.message : String(e));
		}
	};
	(0, s.useEffect)(() => {
		let t = String(e.initialCanvasId || "").trim();
		!t || w || K.current || (K.current = !0, J(c.find((e) => e.id === t) ?? {
			id: t,
			kind: i
		}));
	}, [
		c,
		i,
		e.initialCanvasId,
		w
	]);
	let Y = async () => {
		w?.id && await t.releaseLock(String(w.id), G.current).catch(() => void 0), T(null), F(null), await q();
	}, X = async () => {
		try {
			let n = await t.create(A || e.defaultTitle || "", {
				icon: i === "smart" ? "sparkles" : void 0,
				kind: i
			});
			j(""), await q(), await J(n);
		} catch (e) {
			N(e instanceof Error ? e.message : String(e));
		}
	}, ee = async (e) => {
		window.confirm("将此画布移入回收站？") && (await t.delete(e), await q());
	}, Z = async () => {
		w?.id && F(await n.listBackups(String(w.id)));
	}, Q = async (e) => {
		w?.id && z({
			mode: e,
			document: await n.get(String(w.id))
		});
	}, te = () => {
		let e = window.CanvasBoardV2?.exportSelection();
		if (!e?.nodes.length) {
			N("没有可导出的节点");
			return;
		}
		let t = new Blob([JSON.stringify({
			version: 2,
			...e
		}, null, 2)], { type: "application/json" }), n = URL.createObjectURL(t);
		Object.assign(document.createElement("a"), {
			download: `${String(w?.title || "canvas")}-workflow.json`,
			href: n
		}).click(), URL.revokeObjectURL(n), V(!1);
	}, ne = async (e) => {
		try {
			let t;
			if (/\.json$/i.test(e.name)) t = JSON.parse(await e.text());
			else {
				let n = new FormData();
				n.append("file", e);
				let r = await fetch("/api/canvas-workflows/import", {
					method: "POST",
					body: n
				});
				if (!r.ok) throw Error("导入工作流失败");
				t = await r.json();
			}
			let n = O(t), r = window.CanvasBoardV2?.importWorkflow(n) ?? [];
			N(r.length ? `已导入 ${r.length} 个节点` : "文件中没有可导入节点"), V(!1);
		} catch (e) {
			N(e instanceof Error ? e.message : String(e));
		}
	}, re = async () => {
		try {
			let e = await fetch("/api/asset-library");
			if (!e.ok) throw Error("加载资产库失败");
			U(k(await e.json()));
		} catch (e) {
			N(e instanceof Error ? e.message : String(e));
		}
	}, $ = () => {
		let t = e.assetInboxKey || "", n = h(t);
		if (!n.length) return N("素材收件箱为空或已过期"), 0;
		let r = Math.max(1, Math.min(n.length, Math.ceil(Math.sqrt(n.length)))), i = n.map((e, t) => {
			let n = window.CanvasBoardV2?.addNode("image", {
				x: 100 + t % r * 280,
				y: 100 + Math.floor(t / r) * 220
			});
			return n && window.CanvasBoardV2?.updateNode(n, {
				mediaKind: e.kind,
				name: e.name,
				url: e.url
			}), n;
		}).filter(Boolean);
		return localStorage.removeItem(t), N(`已从素材库导入 ${i.length} 个素材`), i.length;
	};
	if ((0, s.useEffect)(() => {
		if (!w || !e.assetInboxKey) return;
		let t = (t) => {
			if (!(t.ctrlKey || t.metaKey) || t.key.toLowerCase() !== "v") return;
			let n = t.target;
			n?.isContentEditable || ["INPUT", "TEXTAREA"].includes(n?.tagName || "") || h(e.assetInboxKey || "").length && (t.preventDefault(), $());
		};
		return window.addEventListener("keydown", t, !0), () => window.removeEventListener("keydown", t, !0);
	}, [e.assetInboxKey, w]), !w) {
		let n = x ? d : _ === "all" ? c : _ === "root" ? c.filter((e) => !e.folder_id) : c.filter((e) => e.folder_id === _);
		return /* @__PURE__ */ (0, y.jsx)("main", {
			className: "canvas-modern-manager",
			children: /* @__PURE__ */ (0, y.jsxs)("section", {
				className: "gate-panel canvas-modern-gate",
				children: [
					/* @__PURE__ */ (0, y.jsxs)("header", {
						className: "gate-head",
						children: [/* @__PURE__ */ (0, y.jsxs)("div", {
							className: "gate-head-text",
							children: [/* @__PURE__ */ (0, y.jsx)("h1", {
								className: "gate-title",
								children: x ? "回收站" : e.heading || "经典画布 V2"
							}), /* @__PURE__ */ (0, y.jsx)("p", {
								className: "gate-subtitle",
								children: e.subtitle || "React + TypeScript 独立文档与执行路径"
							})]
						}), /* @__PURE__ */ (0, y.jsxs)("div", {
							className: "gate-head-actions",
							children: [
								e.managerBackHref ? /* @__PURE__ */ (0, y.jsx)("a", {
									className: "gate-icon-btn",
									href: e.managerBackHref,
									children: "返回首页"
								}) : null,
								x ? null : /* @__PURE__ */ (0, y.jsxs)(y.Fragment, { children: [
									/* @__PURE__ */ (0, y.jsxs)("select", {
										"aria-label": "画布文件夹",
										onChange: (e) => v(e.target.value),
										value: _,
										children: [
											/* @__PURE__ */ (0, y.jsx)("option", {
												value: "all",
												children: "全部画布"
											}),
											/* @__PURE__ */ (0, y.jsx)("option", {
												value: "root",
												children: "未分类"
											}),
											p.map((e) => /* @__PURE__ */ (0, y.jsx)("option", {
												value: e.id,
												children: String(e.name || "未命名文件夹")
											}, e.id))
										]
									}),
									/* @__PURE__ */ (0, y.jsx)("button", {
										className: "gate-icon-btn",
										onClick: async () => {
											let e = window.prompt("文件夹名称")?.trim();
											e && (await t.createFolder(e), await q());
										},
										type: "button",
										children: "新建文件夹"
									}),
									["all", "root"].includes(_) ? null : /* @__PURE__ */ (0, y.jsx)("button", {
										className: "gate-icon-btn",
										onClick: async () => {
											window.confirm("删除此文件夹？文件夹内画布不会被永久删除。") && (await t.deleteFolder(_), v("all"), await q());
										},
										type: "button",
										children: "删除文件夹"
									})
								] }),
								/* @__PURE__ */ (0, y.jsx)("button", {
									className: "gate-icon-btn",
									onClick: () => void q(),
									type: "button",
									children: "刷新"
								}),
								/* @__PURE__ */ (0, y.jsx)("button", {
									className: "gate-icon-btn",
									onClick: () => S((e) => !e),
									type: "button",
									children: x ? "返回画布" : `回收站 ${d.length}`
								})
							]
						})]
					}),
					x ? null : /* @__PURE__ */ (0, y.jsxs)("div", {
						className: "gate-create-row canvas-modern-create",
						children: [/* @__PURE__ */ (0, y.jsx)("input", {
							className: "gate-name-input",
							maxLength: 80,
							onChange: (e) => j(e.target.value),
							onKeyDown: (e) => {
								e.key === "Enter" && X();
							},
							placeholder: "新画布名称",
							value: A
						}), /* @__PURE__ */ (0, y.jsx)("button", {
							className: "primary-btn",
							onClick: () => void X(),
							type: "button",
							children: e.createLabel || "新建画布"
						})]
					}),
					M ? /* @__PURE__ */ (0, y.jsx)("div", {
						className: "gate-status",
						children: M
					}) : null,
					/* @__PURE__ */ (0, y.jsx)("div", {
						className: "gate-list canvas-modern-list",
						children: n.map((e) => /* @__PURE__ */ (0, y.jsxs)("article", {
							className: "gate-card",
							"data-canvas-id": e.id,
							children: [/* @__PURE__ */ (0, y.jsxs)("button", {
								className: "canvas-modern-card-main",
								disabled: x,
								onClick: () => void J(e),
								type: "button",
								children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: String(e.title || "未命名画布") }), /* @__PURE__ */ (0, y.jsx)("small", { children: D(e.updated_at) })]
							}), x ? /* @__PURE__ */ (0, y.jsxs)(y.Fragment, { children: [/* @__PURE__ */ (0, y.jsx)("button", {
								onClick: async () => {
									await t.restore(e.id), await q();
								},
								type: "button",
								children: "恢复"
							}), /* @__PURE__ */ (0, y.jsx)("button", {
								onClick: async () => {
									window.confirm("永久删除后无法恢复，确定继续？") && (await t.purge(e.id), await q());
								},
								type: "button",
								children: "永久删除"
							})] }) : /* @__PURE__ */ (0, y.jsxs)(y.Fragment, { children: [/* @__PURE__ */ (0, y.jsxs)("select", {
								"aria-label": `移动 ${String(e.title || "画布")}`,
								onChange: async (n) => {
									await t.moveToFolder(e.id, n.target.value), await q();
								},
								value: String(e.folder_id || ""),
								children: [/* @__PURE__ */ (0, y.jsx)("option", {
									value: "",
									children: "未分类"
								}), p.map((e) => /* @__PURE__ */ (0, y.jsx)("option", {
									value: e.id,
									children: String(e.name || "未命名文件夹")
								}, e.id))]
							}), /* @__PURE__ */ (0, y.jsx)("button", {
								"aria-label": "移入回收站",
								onClick: () => void ee(e.id),
								type: "button",
								children: "删除"
							})] })]
						}, e.id))
					})
				]
			})
		});
	}
	return /* @__PURE__ */ (0, y.jsxs)("main", {
		className: "canvas-modern-editor",
		children: [
			/* @__PURE__ */ (0, y.jsxs)("header", {
				className: "topbar canvas-modern-topbar",
				children: [/* @__PURE__ */ (0, y.jsxs)("div", {
					className: "panel canvas-nav",
					children: [/* @__PURE__ */ (0, y.jsx)("button", {
						className: "tool-btn",
						onClick: () => void Y(),
						type: "button",
						children: "← 返回"
					}), /* @__PURE__ */ (0, y.jsxs)("div", {
						className: "canvas-nav-meta",
						children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: String(w.title || "未命名画布") }), /* @__PURE__ */ (0, y.jsx)("small", { children: D(w.updated_at) })]
					})]
				}), /* @__PURE__ */ (0, y.jsxs)("div", {
					className: "panel toolbar canvas-modern-toolbar",
					children: [/* @__PURE__ */ (0, y.jsx)("div", {
						className: "toolbar-items",
						children: C.map(([e, t]) => /* @__PURE__ */ (0, y.jsx)("button", {
							className: "tool-btn",
							onClick: () => window.CanvasBoardV2?.addNode(e),
							type: "button",
							children: t
						}, e))
					}), /* @__PURE__ */ (0, y.jsxs)("div", {
						className: "toolbar-fixed",
						children: [
							/* @__PURE__ */ (0, y.jsx)("button", {
								className: "tool-btn",
								onClick: () => window.CanvasBoardV2?.undo(),
								title: "Ctrl/⌘ + Z",
								type: "button",
								children: "撤销"
							}),
							/* @__PURE__ */ (0, y.jsx)("button", {
								className: "tool-btn",
								onClick: () => window.CanvasBoardV2?.redo(),
								title: "Ctrl/⌘ + Shift + Z",
								type: "button",
								children: "重做"
							}),
							/* @__PURE__ */ (0, y.jsx)("button", {
								className: "tool-btn",
								onClick: () => window.CanvasBoardV2?.groupSelected(),
								type: "button",
								children: "分组"
							}),
							/* @__PURE__ */ (0, y.jsx)("button", {
								className: "tool-btn",
								onClick: () => V(!0),
								type: "button",
								children: "工作流"
							}),
							/* @__PURE__ */ (0, y.jsx)("button", {
								className: "tool-btn",
								onClick: () => void re(),
								type: "button",
								children: "资产库"
							}),
							e.assetInboxKey ? /* @__PURE__ */ (0, y.jsx)("button", {
								className: "tool-btn",
								onClick: $,
								type: "button",
								children: "导入素材"
							}) : null,
							/* @__PURE__ */ (0, y.jsx)("button", {
								className: "tool-btn",
								onClick: () => void Q("cost"),
								type: "button",
								children: "费用"
							}),
							/* @__PURE__ */ (0, y.jsx)("button", {
								className: "tool-btn",
								onClick: () => void Q("logs"),
								type: "button",
								children: "日志"
							}),
							/* @__PURE__ */ (0, y.jsx)("button", {
								className: "tool-btn",
								onClick: () => void Z(),
								type: "button",
								children: "备份"
							})
						]
					})]
				})]
			}),
			/* @__PURE__ */ (0, y.jsx)("div", {
				className: "canvas-modern-board",
				ref: W
			}),
			e.editorAddon,
			P ? /* @__PURE__ */ (0, y.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, y.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, y.jsxs)("header", { children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: "画布备份" }), /* @__PURE__ */ (0, y.jsx)("button", {
							onClick: () => F(null),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, y.jsx)("button", {
							onClick: async () => {
								await n.createBackup(String(w.id)), await Z();
							},
							type: "button",
							children: "立即备份"
						}),
						P.map((e) => /* @__PURE__ */ (0, y.jsxs)("div", {
							className: "backup-item",
							children: [
								/* @__PURE__ */ (0, y.jsx)("span", { children: String(e.filename) }),
								/* @__PURE__ */ (0, y.jsx)("button", {
									onClick: async () => {
										let t = await n.restoreBackup(String(w.id), String(e.filename));
										T(t), F(null);
									},
									type: "button",
									children: "恢复"
								}),
								/* @__PURE__ */ (0, y.jsx)("button", {
									onClick: async () => {
										await t.deleteBackup(String(w.id), String(e.filename)), await Z();
									},
									type: "button",
									children: "删除"
								})
							]
						}, String(e.filename)))
					]
				})
			}) : null,
			I ? /* @__PURE__ */ (0, y.jsx)(b, {
				onClose: () => L(null),
				request: I
			}) : null,
			B ? /* @__PURE__ */ (0, y.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, y.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, y.jsxs)("header", { children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: "工作流导入 / 导出" }), /* @__PURE__ */ (0, y.jsx)("button", {
							onClick: () => V(!1),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, y.jsx)("p", { children: "有选中节点时仅导出选区；未选中时导出整张画布。" }),
						/* @__PURE__ */ (0, y.jsx)("button", {
							onClick: te,
							type: "button",
							children: "导出 JSON"
						}),
						/* @__PURE__ */ (0, y.jsxs)("label", {
							className: "primary-btn",
							children: ["导入 JSON / ZIP", /* @__PURE__ */ (0, y.jsx)("input", {
								accept: ".json,.zip,application/json,application/zip",
								hidden: !0,
								onChange: (e) => {
									let t = e.target.files?.[0];
									t && ne(t);
								},
								type: "file"
							})]
						})
					]
				})
			}) : null,
			H ? /* @__PURE__ */ (0, y.jsx)("div", {
				className: "modal open canvas-modern-backups canvas-modern-assets",
				children: /* @__PURE__ */ (0, y.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, y.jsxs)("header", { children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: "资产库" }), /* @__PURE__ */ (0, y.jsx)("button", {
							onClick: () => U(null),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, y.jsx)("div", {
							className: "canvas-modern-asset-grid",
							children: H.map((e) => /* @__PURE__ */ (0, y.jsxs)("button", {
								onClick: () => {
									let t = window.CanvasBoardV2?.addNode("image");
									t && window.CanvasBoardV2?.updateNode(t, {
										mediaKind: e.kind,
										name: e.name,
										url: e.url
									}), U(null);
								},
								type: "button",
								children: [e.kind === "image" ? /* @__PURE__ */ (0, y.jsx)("img", {
									alt: e.name,
									src: e.url
								}) : /* @__PURE__ */ (0, y.jsx)("span", { children: e.kind === "video" ? "视频" : e.kind === "audio" ? "音频" : "文件" }), /* @__PURE__ */ (0, y.jsx)("small", { children: e.name })]
							}, e.id))
						}),
						H.length ? null : /* @__PURE__ */ (0, y.jsx)("p", { children: "资产库暂无可用媒体。" })
					]
				})
			}) : null,
			R ? /* @__PURE__ */ (0, y.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, y.jsxs)("section", {
					className: "modal-panel",
					children: [/* @__PURE__ */ (0, y.jsxs)("header", { children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: R.mode === "logs" ? "生成日志" : "费用汇总" }), /* @__PURE__ */ (0, y.jsx)("button", {
						onClick: () => z(null),
						type: "button",
						children: "关闭"
					})] }), R.mode === "logs" ? /* @__PURE__ */ (0, y.jsx)(y.Fragment, { children: (Array.isArray(R.document.logs) ? R.document.logs : []).slice().reverse().map((e, t) => /* @__PURE__ */ (0, y.jsx)("pre", { children: JSON.stringify(e, null, 2) }, String(e.id || t))) }) : /* @__PURE__ */ (0, y.jsxs)(y.Fragment, { children: [/* @__PURE__ */ (0, y.jsxs)("h2", { children: ["¥ ", m(R.document).toFixed(4)] }), /* @__PURE__ */ (0, y.jsx)("p", { children: "仅汇总任务记录中已返回的费用字段；供应商未返回价格时显示为 0。" })] })]
				})
			}) : null
		]
	});
}
function T(e, t) {
	let n = (0, c.createRoot)(e);
	return n.render(/* @__PURE__ */ (0, y.jsx)(w, { ...t })), () => n.unmount();
}
function E() {
	let e = sessionStorage.getItem("canvasClientId");
	if (e) return e;
	let t = `canvas_${crypto.randomUUID?.() || Date.now()}`;
	return sessionStorage.setItem("canvasClientId", t), t;
}
function D(e) {
	let t = Number(e || 0);
	return t ? new Date(t < 1e10 ? t * 1e3 : t).toLocaleString() : "--";
}
function O(e) {
	let t = e && typeof e == "object" ? e : {}, n = t.workflow && typeof t.workflow == "object" ? t.workflow : t;
	return {
		connections: Array.isArray(n.connections) ? n.connections : [],
		nodes: Array.isArray(n.nodes) ? n.nodes : []
	};
}
function k(e) {
	let t = [], n = (e, r = "") => {
		if (Array.isArray(e)) {
			e.forEach((e) => n(e, r));
			return;
		}
		if (!e || typeof e != "object") return;
		let i = e, a = String(i.kind || i.type || r || "image").toLowerCase(), o = String(i.url || i.uri || i.asset_url || "");
		o && a !== "workflow" && t.push({
			id: String(i.id || o),
			kind: /video/.test(a) ? "video" : /audio/.test(a) ? "audio" : "image",
			name: String(i.name || i.title || "素材"),
			url: o
		}), Object.entries(i).forEach(([e, t]) => {
			[
				"url",
				"uri",
				"asset_url"
			].includes(e) || n(t, e === "items" ? a : r);
		});
	};
	return n(e), [...new Map(t.map((e) => [e.id, e])).values()];
}
//#endregion
export { T as mountCanvasAppV2 };
