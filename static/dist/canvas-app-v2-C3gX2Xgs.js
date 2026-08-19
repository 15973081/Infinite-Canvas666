import { c as e, l as t, o as n, t as r } from "./jsx-runtime-B18keJCK.js";
import { n as i, t as a } from "./http-F-lX8WKW.js";
import { r as o } from "./document-merge-DziDwlrU.js";
import { t as s } from "./canvas-board-v2-DddvPiak.js";
//#region src/canvas/infrastructure/canvas-management.ts
var c = /* @__PURE__ */ t(e(), 1), l = n();
function u(e = fetch) {
	return {
		acquireLock: async (t, n, r = "") => {
			try {
				return await h(e, `/api/canvases/${encodeURIComponent(t)}/lock`, "POST", {
					client_id: n,
					username: r
				});
			} catch (e) {
				if (!(e instanceof a) || e.status !== 409) throw e;
				let t = m(e.details);
				return {
					ok: !1,
					holder: m(m(t.detail).holder || t.holder)
				};
			}
		},
		create: async (t = "", n = {}) => {
			let r = await h(e, "/api/canvases", "POST", {
				title: t.trim() || void 0,
				folder_id: n.folderId || void 0,
				icon: n.icon || void 0,
				kind: n.kind || void 0
			});
			return m(r).canvas ? m(m(r).canvas) : m(r);
		},
		createFolder: async (t, n = "") => m(await h(e, "/api/canvas-folders", "POST", {
			name: t,
			parent_id: n
		})),
		delete: (t) => g(e, `/api/canvases/${encodeURIComponent(t)}`, "DELETE"),
		deleteBackup: (t, n) => g(e, `/api/canvases/${encodeURIComponent(t)}/backups/${encodeURIComponent(n)}`, "DELETE"),
		deleteFolder: (t) => g(e, `/api/canvas-folders/${encodeURIComponent(t)}`, "DELETE"),
		getMeta: async (t) => m(await i(e, `/api/canvases/${encodeURIComponent(t)}/meta`)),
		list: async () => p(await i(e, "/api/canvases")),
		listFolders: async () => {
			let t = await i(e, "/api/canvas-folders"), n = m(t), r = Array.isArray(t) ? t : n.folders;
			return (Array.isArray(r) ? r : []).map(m).filter((e) => e.id).map((e) => e);
		},
		listTrash: async () => p(await i(e, "/api/canvases/trash")),
		moveToFolder: (t, n) => h(e, `/api/canvases/${encodeURIComponent(t)}/folder`, "PATCH", { folder_id: n }).then(() => void 0),
		purge: (t) => g(e, `/api/canvases/${encodeURIComponent(t)}/purge`, "DELETE"),
		releaseLock: async (t, n, r = !1) => {
			if (r) {
				await h(e, `/api/canvases/${encodeURIComponent(t)}/lock/release`, "POST", { client_id: n }, !0);
				return;
			}
			await g(e, `/api/canvases/${encodeURIComponent(t)}/lock?client_id=${encodeURIComponent(n)}`, "DELETE");
		},
		restore: (t) => g(e, `/api/canvases/${encodeURIComponent(t)}/restore`, "POST"),
		updateFolder: async (t, n) => m(await h(e, `/api/canvas-folders/${encodeURIComponent(t)}`, "PATCH", n))
	};
}
var d = u();
function f() {
	return d;
}
function p(e) {
	let t = m(e), n = Array.isArray(e) ? e : t.canvases;
	return (Array.isArray(n) ? n : []).map(m).filter((e) => e.id).map((e) => e);
}
function m(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
function h(e, t, n, r, a = !1) {
	return i(e, t, {
		method: n,
		keepalive: a,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(r ?? {})
	});
}
async function g(e, t, n) {
	await i(e, t, { method: n });
}
//#endregion
//#region src/canvas/ui/canvas-app-domain.ts
function _(e) {
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
function v(e, t = Date.now()) {
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
//#region src/canvas/infrastructure/asset-library-client.ts
var y = {
	list: () => b("/api/asset-library"),
	createLibrary: (e) => b("/api/asset-library/libraries", x("POST", { name: e })),
	renameLibrary: (e, t) => b(`/api/asset-library/libraries/${encodeURIComponent(e)}`, x("PATCH", { name: t })),
	deleteLibrary: (e) => b(`/api/asset-library/libraries/${encodeURIComponent(e)}`, x("DELETE")),
	createCategory: (e, t, n = "image") => b("/api/asset-library/categories", x("POST", {
		library_id: e,
		name: t,
		type: n
	})),
	renameCategory: (e, t, n) => b(`/api/asset-library/categories/${encodeURIComponent(t)}`, x("PATCH", {
		library_id: e,
		name: n
	})),
	deleteCategory: (e, t) => b(`/api/asset-library/categories/${encodeURIComponent(t)}?library_id=${encodeURIComponent(e)}`, x("DELETE")),
	addUrl: (e, t, n, r) => b("/api/asset-library/items", x("POST", {
		category_id: t,
		library_id: e,
		name: r,
		url: n
	})),
	renameItem: (e, t) => b(`/api/asset-library/items/${encodeURIComponent(e)}`, x("PATCH", { name: t })),
	deleteItem: (e, t) => b("/api/asset-library/items/delete", x("POST", {
		ids: [t],
		library_id: e
	})),
	saveWorkflow: (e, t, n) => b("/api/canvas-workflows/export-to-library", x("POST", {
		...n,
		category_id: t,
		include_resources: !0,
		library_id: e
	}))
};
async function b(e, t) {
	let n = await fetch(e, t), r = await n.json().catch(() => ({}));
	if (!n.ok) {
		let e = r.detail;
		throw Error(typeof e == "string" ? e : e?.message || `请求失败 (${n.status})`);
	}
	return r;
}
function x(e, t) {
	return {
		method: e,
		headers: t === void 0 ? void 0 : { "Content-Type": "application/json" },
		body: t === void 0 ? void 0 : JSON.stringify(t)
	};
}
//#endregion
//#region src/canvas/ui/asset-library-dialog.tsx
var S = r(), C = {
	active_library_id: "",
	libraries: []
};
function w({ onClose: e, request: t }) {
	let [n, r] = (0, c.useState)(C), [i, a] = (0, c.useState)(""), [o, s] = (0, c.useState)(""), [l, u] = (0, c.useState)(""), [d, f] = (0, c.useState)(t.saveItem?.url || ""), [p, m] = (0, c.useState)(t.saveItem?.name || E(t.saveItem?.url || "")), [h, g] = (0, c.useState)("正在加载资产库…"), _ = n.libraries.find((e) => e.id === i) ?? n.libraries[0], v = _?.categories || [], b = v.find((e) => e.id === o) ?? v[0], x = (0, c.useMemo)(() => (b?.items || []).filter((e) => {
		let t = l.trim().toLocaleLowerCase();
		return !t || e.name.toLocaleLowerCase().includes(t) || e.url.toLocaleLowerCase().includes(t);
	}), [b, l]), w = (e, n = i, c = o) => {
		r(e);
		let l = e.libraries.find((e) => e.id === n) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0], u = t.saveWorkflow ? "workflow" : "image", d = l?.categories.find((e) => e.id === c) ?? l?.categories.find((e) => e.type === u) ?? l?.categories[0];
		a(l?.id || ""), s(d?.id || "");
	};
	(0, c.useEffect)(() => {
		let e = !0;
		return y.list().then((t) => {
			e && (w(t.library, t.library.active_library_id, ""), g(""));
		}).catch((t) => e && g(D(t))), () => {
			e = !1;
		};
	}, []);
	let O = (e) => {
		let r = n.libraries.find((t) => t.id === e);
		a(e);
		let i = t.saveWorkflow ? "workflow" : "image";
		s(r?.categories.find((e) => e.type === i)?.id || r?.categories[0]?.id || "");
	}, k = async (e, t, n = b?.id || "") => {
		try {
			let r = await e();
			return w(r.library, _?.id, n), g(t), r;
		} catch (e) {
			return g(D(e)), null;
		}
	}, A = async () => {
		let e = window.prompt("新资产库名称")?.trim();
		if (!e) return;
		let t = await k(() => y.createLibrary(e), "资产库已创建", "");
		t && w(t.library, t.library.active_library_id, "");
	}, ee = async () => {
		if (!_) return;
		let e = window.prompt("资产库名称", _.name)?.trim();
		e && await k(() => y.renameLibrary(_.id, e), "资产库已重命名");
	}, j = async () => {
		if (!_ || !window.confirm(`删除资产库“${_.name}”？其中素材文件也会被删除。`)) return;
		let e = await k(() => y.deleteLibrary(_.id), "资产库已删除", "");
		e && w(e.library, e.library.active_library_id, "");
	}, M = async () => {
		if (!_) return;
		let e = window.prompt("新分组名称")?.trim();
		if (!e) return;
		let n = t.saveWorkflow || b?.type === "workflow" ? "workflow" : "image", r = await k(() => y.createCategory(_.id, e, n), "分组已创建");
		r?.category && w(r.library, _.id, r.category.id);
	}, te = async () => {
		if (!_ || !b) return;
		let e = window.prompt("分组名称", b.name)?.trim();
		e && await k(() => y.renameCategory(_.id, b.id, e), "分组已重命名");
	}, N = async () => {
		!_ || !b || !window.confirm(`删除分组“${b.name}”？其中素材文件也会被删除。`) || await k(() => y.deleteCategory(_.id, b.id), "分组已删除", "");
	}, P = async () => {
		if (!_ || !b) {
			g("请先选择资产库与媒体分组");
			return;
		}
		if (b.type !== "image") {
			g("工作流分组不能保存媒体");
			return;
		}
		if (!d.trim()) {
			g("请输入本地 /assets 或 /output 媒体地址");
			return;
		}
		(await k(() => y.addUrl(_.id, b.id, d.trim(), p.trim() || E(d)), "素材已保存"))?.item && (f(""), m(""), t.saveItem && e());
	}, ne = async (e) => {
		let t = window.prompt("素材名称", e.name)?.trim();
		t && await k(() => y.renameItem(e.id, t), "素材已重命名");
	}, F = async (e) => {
		!_ || !window.confirm(`删除素材“${e.name}”？本地文件副本也会被删除。`) || await k(() => y.deleteItem(_.id, e.id), "素材已删除");
	}, I = async () => {
		if (!(!_ || !b || !t.saveWorkflow)) {
			if (b.type !== "workflow") {
				g("请选择工作流分组");
				return;
			}
			(await k(() => y.saveWorkflow(_.id, b.id, t.saveWorkflow), "工作流已保存到资产库"))?.item && e();
		}
	}, L = async (n) => {
		try {
			n.kind === "workflow" ? await t.onImportWorkflow?.(n) : t.onInsert?.(n), e();
		} catch (e) {
			g(D(e));
		}
	};
	return /* @__PURE__ */ (0, S.jsx)("div", {
		"aria-modal": "true",
		className: "modal open canvas-modern-backups canvas-asset-dialog",
		role: "dialog",
		children: /* @__PURE__ */ (0, S.jsxs)("section", {
			className: "modal-panel",
			children: [
				/* @__PURE__ */ (0, S.jsxs)("header", { children: [/* @__PURE__ */ (0, S.jsx)("strong", { children: t.saveWorkflow ? "保存工作流到资产库" : t.saveItem ? "保存到资产库" : "资产库" }), /* @__PURE__ */ (0, S.jsx)("button", {
					onClick: e,
					type: "button",
					children: "关闭"
				})] }),
				/* @__PURE__ */ (0, S.jsxs)("div", {
					className: "canvas-asset-toolbar",
					children: [
						/* @__PURE__ */ (0, S.jsx)("select", {
							"aria-label": "资产库",
							onChange: (e) => O(e.target.value),
							value: _?.id || "",
							children: n.libraries.map((e) => /* @__PURE__ */ (0, S.jsx)("option", {
								value: e.id,
								children: e.name
							}, e.id))
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							onClick: () => void A(),
							type: "button",
							children: "新建库"
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							disabled: !_,
							onClick: () => void ee(),
							type: "button",
							children: "重命名库"
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							disabled: !_ || n.libraries.length <= 1,
							onClick: () => void j(),
							type: "button",
							children: "删除库"
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							disabled: !_,
							onClick: () => void M(),
							type: "button",
							children: "新建分组"
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							disabled: !b,
							onClick: () => void te(),
							type: "button",
							children: "重命名分组"
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							disabled: !b,
							onClick: () => void N(),
							type: "button",
							children: "删除分组"
						}),
						/* @__PURE__ */ (0, S.jsx)("input", {
							"aria-label": "搜索资产",
							onChange: (e) => u(e.target.value),
							placeholder: "搜索名称或地址",
							value: l
						})
					]
				}),
				/* @__PURE__ */ (0, S.jsxs)("div", {
					className: "canvas-asset-body",
					children: [/* @__PURE__ */ (0, S.jsx)("aside", { children: v.map((e) => /* @__PURE__ */ (0, S.jsxs)("button", {
						className: e.id === b?.id ? "active" : "",
						onClick: () => s(e.id),
						type: "button",
						children: [/* @__PURE__ */ (0, S.jsx)("strong", { children: e.name }), /* @__PURE__ */ (0, S.jsx)("small", { children: e.type === "workflow" ? "工作流" : `${e.items.length} 项` })]
					}, e.id)) }), /* @__PURE__ */ (0, S.jsxs)("div", {
						className: "canvas-asset-content",
						children: [
							b?.type === "image" ? /* @__PURE__ */ (0, S.jsxs)("div", {
								className: "canvas-asset-add",
								children: [
									/* @__PURE__ */ (0, S.jsx)("input", {
										"aria-label": "素材地址",
										onChange: (e) => f(e.target.value),
										placeholder: "/output/result.png 或 /assets/…",
										value: d
									}),
									/* @__PURE__ */ (0, S.jsx)("input", {
										"aria-label": "素材名称",
										onChange: (e) => m(e.target.value),
										placeholder: "素材名称（可选）",
										value: p
									}),
									/* @__PURE__ */ (0, S.jsx)("button", {
										className: "primary-btn",
										onClick: () => void P(),
										type: "button",
										children: t.saveItem ? "保存输出" : "添加地址"
									})
								]
							}) : null,
							t.saveWorkflow ? /* @__PURE__ */ (0, S.jsxs)("div", {
								className: "canvas-asset-workflow-save",
								children: [/* @__PURE__ */ (0, S.jsxs)("span", { children: [
									"将“",
									t.saveWorkflow.name,
									"”及可找到的本地资源保存到当前工作流分组。"
								] }), /* @__PURE__ */ (0, S.jsx)("button", {
									className: "primary-btn",
									disabled: b?.type !== "workflow",
									onClick: () => void I(),
									type: "button",
									children: "保存工作流"
								})]
							}) : null,
							/* @__PURE__ */ (0, S.jsx)("div", {
								className: "canvas-modern-asset-grid",
								children: x.map((e) => /* @__PURE__ */ (0, S.jsxs)("article", { children: [/* @__PURE__ */ (0, S.jsxs)("button", {
									className: "canvas-asset-preview",
									disabled: e.kind === "workflow" ? !t.onImportWorkflow : !t.onInsert,
									onClick: () => void L(e),
									type: "button",
									children: [T(e), /* @__PURE__ */ (0, S.jsx)("small", { children: e.name })]
								}), /* @__PURE__ */ (0, S.jsxs)("div", { children: [/* @__PURE__ */ (0, S.jsx)("button", {
									onClick: () => void ne(e),
									type: "button",
									children: "重命名"
								}), /* @__PURE__ */ (0, S.jsx)("button", {
									onClick: () => void F(e),
									type: "button",
									children: "删除"
								})] })] }, e.id))
							}),
							x.length ? null : /* @__PURE__ */ (0, S.jsx)("p", { children: "当前分组暂无匹配内容" })
						]
					})]
				}),
				h ? /* @__PURE__ */ (0, S.jsx)("div", {
					className: "gate-status",
					role: "status",
					children: h
				}) : null
			]
		})
	});
}
function T(e) {
	return e.kind === "image" ? /* @__PURE__ */ (0, S.jsx)("img", {
		alt: e.name,
		src: e.url
	}) : /* @__PURE__ */ (0, S.jsx)("span", { children: e.kind === "video" ? "视频" : e.kind === "audio" ? "音频" : "工作流" });
}
function E(e) {
	let t = e.split(/[?#]/, 1)[0];
	return decodeURIComponent(t.split("/").pop() || "生成结果");
}
function D(e) {
	return e instanceof Error ? e.message : String(e);
}
//#endregion
//#region src/canvas/infrastructure/prompt-library-client.ts
var O = {
	list: () => k("/api/prompt-libraries"),
	createLibrary: (e) => k("/api/prompt-libraries", A("POST", { name: e })),
	renameLibrary: (e, t) => k(`/api/prompt-libraries/${encodeURIComponent(e)}`, A("PATCH", { name: t })),
	deleteLibrary: (e) => k(`/api/prompt-libraries/${encodeURIComponent(e)}`, A("DELETE")),
	savePrompt: (e, t) => k(t.id ? `/api/prompt-libraries/items/${encodeURIComponent(t.id)}` : "/api/prompt-libraries/items", A(t.id ? "PATCH" : "POST", {
		library_id: e,
		...t
	})),
	deletePrompts: (e) => k("/api/prompt-libraries/items/delete", A("POST", { ids: e })),
	createCategory: (e, t) => k("/api/prompt-libraries/categories", A("POST", {
		library_id: e,
		name: t
	}))
};
async function k(e, t) {
	let n = await fetch(e, t), r = await n.json().catch(() => ({}));
	if (!n.ok) throw Error(r.detail || `请求失败 (${n.status})`);
	return r;
}
function A(e, t) {
	return {
		method: e,
		headers: t === void 0 ? void 0 : { "Content-Type": "application/json" },
		body: t === void 0 ? void 0 : JSON.stringify(t)
	};
}
//#endregion
//#region src/canvas/ui/prompt-library-dialog.tsx
function ee({ onClose: e, request: t }) {
	let [n, r] = (0, c.useState)({
		active_library_id: "",
		libraries: []
	}), [i, a] = (0, c.useState)(""), [o, s] = (0, c.useState)(""), [l, u] = (0, c.useState)(""), [d, f] = (0, c.useState)("正在加载提示词库…"), [p, m] = (0, c.useState)({
		category: "",
		name: "",
		negative: "",
		positive: t.initialText || "",
		scene: ""
	}), h = n.libraries.find((e) => e.id === i) ?? n.libraries[0], g = (0, c.useMemo)(() => (h?.items || []).filter((e) => M(e, l)), [h, l]), _ = h?.items.find((e) => e.id === o), v = (e, t = i, n = o) => {
		r(e);
		let c = e.libraries.find((e) => e.id === t) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0];
		a(c?.id || "");
		let l = c?.items.find((e) => e.id === n) ?? c?.items[0];
		s(l?.id || ""), l && m(j(l));
	};
	(0, c.useEffect)(() => {
		let e = !0;
		return O.list().then((t) => {
			e && (v(t.library, t.library.active_library_id, ""), f(""));
		}).catch((t) => e && f(t instanceof Error ? t.message : String(t))), () => {
			e = !1;
		};
	}, []);
	let y = (e) => {
		let r = n.libraries.find((t) => t.id === e);
		a(e), s(r?.items[0]?.id || ""), m(r?.items[0] ? j(r.items[0]) : {
			category: r?.categories[0]?.id || "",
			name: "",
			negative: "",
			positive: t.initialText || "",
			scene: ""
		});
	}, b = (e) => {
		s(e.id), m(j(e));
	}, x = () => {
		s(""), m({
			category: h?.categories[0]?.id || "",
			name: "",
			negative: "",
			positive: t.initialText || "",
			scene: ""
		}), f("正在新建提示词");
	}, C = async () => {
		if (!h) {
			f("请先创建提示词库");
			return;
		}
		if (!p.positive.trim()) {
			f("提示词内容不能为空");
			return;
		}
		try {
			let e = await O.savePrompt(h.id, {
				..._ ? { id: _.id } : {},
				category: p.category,
				name: p.name.trim() || p.positive.trim().slice(0, 28),
				negative: p.negative,
				positive: p.positive,
				scene: p.scene
			}), t = String(e.item?.id || _?.id || "");
			v(e.library, h.id, t), f(_ ? "提示词已更新" : "提示词已创建");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, w = async () => {
		if (!(!_ || !window.confirm(`删除提示词“${_.name}”？`))) try {
			let e = await O.deletePrompts([_.id]);
			v(e.library, h?.id, ""), f("提示词已删除");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, T = async () => {
		let e = window.prompt("新提示词库名称")?.trim();
		if (e) try {
			let t = await O.createLibrary(e);
			v(t.library, t.library.active_library_id, ""), f("提示词库已创建");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, E = async () => {
		if (!h || h.id === "system") return;
		let e = window.prompt("提示词库名称", h.name)?.trim();
		if (e) try {
			let t = await O.renameLibrary(h.id, e);
			v(t.library, h.id, o), f("提示词库已重命名");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, D = async () => {
		if (!(!h || h.id === "system" || !window.confirm(`删除提示词库“${h.name}”？`))) try {
			let e = await O.deleteLibrary(h.id);
			v(e.library, e.library.active_library_id, ""), f("提示词库已删除");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, k = async () => {
		if (!h) return;
		let e = window.prompt("新分组名称")?.trim();
		if (e) try {
			let t = await O.createCategory(h.id, e);
			v(t.library, h.id, o), f("分组已创建");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, A = (n = !1) => {
		let r = p.positive.trim();
		if (!r) {
			f("提示词内容不能为空");
			return;
		}
		t.onApply(n && p.negative.trim() ? `${r}\n\nNegative prompt:\n${p.negative.trim()}` : r), e();
	};
	return /* @__PURE__ */ (0, S.jsx)("div", {
		"aria-modal": "true",
		className: "modal open canvas-modern-backups prompt-library-dialog",
		role: "dialog",
		children: /* @__PURE__ */ (0, S.jsxs)("section", {
			className: "modal-panel",
			children: [
				/* @__PURE__ */ (0, S.jsxs)("header", { children: [/* @__PURE__ */ (0, S.jsx)("strong", { children: "提示词库" }), /* @__PURE__ */ (0, S.jsx)("button", {
					onClick: e,
					type: "button",
					children: "关闭"
				})] }),
				/* @__PURE__ */ (0, S.jsxs)("div", {
					className: "prompt-library-toolbar",
					children: [
						/* @__PURE__ */ (0, S.jsx)("select", {
							"aria-label": "提示词库",
							onChange: (e) => y(e.target.value),
							value: h?.id || "",
							children: n.libraries.map((e) => /* @__PURE__ */ (0, S.jsx)("option", {
								value: e.id,
								children: e.name
							}, e.id))
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							onClick: () => void T(),
							type: "button",
							children: "新建库"
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							disabled: !h || h.id === "system",
							onClick: () => void E(),
							type: "button",
							children: "重命名库"
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							disabled: !h || h.id === "system",
							onClick: () => void D(),
							type: "button",
							children: "删除库"
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							disabled: !h,
							onClick: () => void k(),
							type: "button",
							children: "新建分组"
						}),
						/* @__PURE__ */ (0, S.jsx)("input", {
							"aria-label": "搜索提示词",
							onChange: (e) => u(e.target.value),
							placeholder: "搜索名称、场景或内容",
							value: l
						})
					]
				}),
				/* @__PURE__ */ (0, S.jsxs)("div", {
					className: "prompt-library-body",
					children: [/* @__PURE__ */ (0, S.jsxs)("aside", { children: [
						/* @__PURE__ */ (0, S.jsx)("button", {
							className: "primary-btn",
							onClick: x,
							type: "button",
							children: "新建提示词"
						}),
						g.map((e) => /* @__PURE__ */ (0, S.jsxs)("button", {
							className: e.id === o ? "active" : "",
							onClick: () => b(e),
							type: "button",
							children: [/* @__PURE__ */ (0, S.jsx)("strong", { children: e.name || "未命名" }), /* @__PURE__ */ (0, S.jsx)("small", { children: e.scene || e.positive.slice(0, 60) })]
						}, e.id)),
						g.length ? null : /* @__PURE__ */ (0, S.jsx)("p", { children: "当前库暂无匹配内容" })
					] }), /* @__PURE__ */ (0, S.jsxs)("div", {
						className: "prompt-library-editor",
						children: [
							/* @__PURE__ */ (0, S.jsxs)("label", { children: ["名称", /* @__PURE__ */ (0, S.jsx)("input", {
								"aria-label": "提示词名称",
								onChange: (e) => m((t) => ({
									...t,
									name: e.target.value
								})),
								value: p.name
							})] }),
							/* @__PURE__ */ (0, S.jsxs)("label", { children: ["分组", /* @__PURE__ */ (0, S.jsxs)("select", {
								"aria-label": "提示词分组",
								onChange: (e) => m((t) => ({
									...t,
									category: e.target.value
								})),
								value: p.category,
								children: [/* @__PURE__ */ (0, S.jsx)("option", {
									value: "",
									children: "未分组"
								}), (h?.categories || []).map((e) => /* @__PURE__ */ (0, S.jsx)("option", {
									value: e.id,
									children: e.name
								}, e.id))]
							})] }),
							/* @__PURE__ */ (0, S.jsxs)("label", { children: ["场景", /* @__PURE__ */ (0, S.jsx)("input", {
								"aria-label": "提示词场景",
								onChange: (e) => m((t) => ({
									...t,
									scene: e.target.value
								})),
								value: p.scene
							})] }),
							/* @__PURE__ */ (0, S.jsxs)("label", { children: ["正向提示词", /* @__PURE__ */ (0, S.jsx)("textarea", {
								"aria-label": "正向提示词",
								onChange: (e) => m((t) => ({
									...t,
									positive: e.target.value
								})),
								value: p.positive
							})] }),
							/* @__PURE__ */ (0, S.jsxs)("label", { children: ["负向提示词", /* @__PURE__ */ (0, S.jsx)("textarea", {
								"aria-label": "负向提示词",
								onChange: (e) => m((t) => ({
									...t,
									negative: e.target.value
								})),
								value: p.negative
							})] }),
							/* @__PURE__ */ (0, S.jsxs)("div", {
								className: "prompt-library-actions",
								children: [
									/* @__PURE__ */ (0, S.jsx)("button", {
										onClick: () => void C(),
										type: "button",
										children: _ ? "保存修改" : "创建提示词"
									}),
									/* @__PURE__ */ (0, S.jsx)("button", {
										disabled: !_,
										onClick: () => void w(),
										type: "button",
										children: "删除提示词"
									}),
									/* @__PURE__ */ (0, S.jsx)("button", {
										onClick: () => A(!1),
										type: "button",
										children: "应用正向"
									}),
									/* @__PURE__ */ (0, S.jsx)("button", {
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
				d ? /* @__PURE__ */ (0, S.jsx)("div", {
					className: "gate-status",
					role: "status",
					children: d
				}) : null
			]
		})
	});
}
function j(e) {
	return {
		category: e.category || "",
		name: e.name || "",
		negative: e.negative || "",
		positive: e.positive || "",
		scene: e.scene || ""
	};
}
function M(e, t) {
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
var te = [
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
function N({ configuration: e = {}, management: t = f(), repository: n, runtime: r }) {
	let i = e.kind ?? "classic", [a, l] = (0, c.useState)([]), [u, d] = (0, c.useState)([]), [p, m] = (0, c.useState)([]), [h, g] = (0, c.useState)("all"), [y, b] = (0, c.useState)(!1), [x, C] = (0, c.useState)(null), [T, E] = (0, c.useState)(""), [D, O] = (0, c.useState)("正在加载画布列表…"), [k, A] = (0, c.useState)(null), [j, M] = (0, c.useState)(null), [N, P] = (0, c.useState)(null), [ae, R] = (0, c.useState)(!1), [oe, z] = (0, c.useState)(null), [B, V] = (0, c.useState)(null), [se, H] = (0, c.useState)(""), [ce, U] = (0, c.useState)(""), W = (0, c.useRef)(null), G = (0, c.useRef)(ne()), le = (0, c.useRef)(!1), K = (0, c.useRef)(0), q = (0, c.useRef)(!1), J = (0, c.useRef)(!1), Y = (0, c.useCallback)(async () => {
		O("正在加载画布列表…");
		try {
			let [e, n, r] = await Promise.all([
				t.list(),
				t.listTrash(),
				t.listFolders()
			]), a = (e) => String(e.kind || "classic") === i, o = e.filter(a), s = n.filter(a);
			l(o.sort((e, t) => Number(t.updated_at || 0) - Number(e.updated_at || 0))), d(s), m(r), O(o.length ? "" : "还没有画布，新建一个开始创作。");
		} catch (e) {
			O(e instanceof Error ? e.message : String(e));
		}
	}, [i, t]);
	(0, c.useEffect)(() => {
		Y();
	}, [Y]), (0, c.useEffect)(() => {
		let e = W.current;
		if (!e || !x) return;
		let t = s(e, null, {
			clientId: G.current,
			initialDocument: x,
			readOnly: !!B,
			repository: n,
			runtime: r
		});
		return window.CanvasBoardV2?.setReadOnly(!!B), t;
	}, [
		x,
		n,
		r
	]), (0, c.useEffect)(() => {
		window.CanvasBoardV2?.setReadOnly(!!B);
	}, [B]), (0, c.useEffect)(() => {
		let e = (e) => {
			let t = e.detail;
			t?.id === x?.id && (K.current = Math.max(K.current, Number(t.updated_at || 0)), U(""));
		};
		return window.addEventListener("canvas-board-v2-document-saved", e), () => window.removeEventListener("canvas-board-v2-document-saved", e);
	}, [x?.id]), (0, c.useEffect)(() => {
		let e = () => {
			x?.id && q.current && t.releaseLock(String(x.id), G.current, !0);
		};
		return window.addEventListener("pagehide", e, { once: !0 }), () => window.removeEventListener("pagehide", e);
	}, [x?.id, t]), (0, c.useEffect)(() => {
		let e = window.openPromptTemplateModal, t = window.openCanvasPromptLibrary, n = window.openCanvasAssetLibrary;
		return window.openPromptTemplateModal = (e) => {
			M({ onApply: (t) => {
				window.CanvasBoardV2?.updateNode(e, { text: t });
			} });
		}, window.openCanvasPromptLibrary = (e) => M(e), window.openCanvasAssetLibrary = (e) => z(e), () => {
			e ? window.openPromptTemplateModal = e : delete window.openPromptTemplateModal, t ? window.openCanvasPromptLibrary = t : delete window.openCanvasPromptLibrary, n ? window.openCanvasAssetLibrary = n : delete window.openCanvasAssetLibrary;
		};
	}, []);
	let X = async (e) => {
		O("正在打开画布…");
		try {
			let i = await t.acquireLock(e.id, G.current, localStorage.getItem("canvasUserName") || ""), a = await n.get(e.id);
			if (q.current = i.ok, V(i.ok ? null : i.holder || {}), H(""), U(""), K.current = Number(a.updated_at || 0), C(a), !i.ok) {
				O(`只读模式：画布正由 ${I(i.holder)} 编辑`);
				return;
			}
			O(""), r.recoverDocument(a).then(async (t) => {
				if (JSON.stringify(t) === JSON.stringify(a)) return;
				let r = await n.save(e.id, {
					...o(t),
					client_id: G.current
				});
				K.current = Number(r.updated_at || 0), C((e) => e?.id === r.id ? r : e);
			}).catch((e) => O(`任务恢复失败：${e instanceof Error ? e.message : String(e)}`));
		} catch (e) {
			O(e instanceof Error ? e.message : String(e));
		}
	}, Z = (0, c.useCallback)(async () => {
		if (!x?.id) return !1;
		try {
			let e = q.current, r = await t.acquireLock(String(x.id), G.current, localStorage.getItem("canvasUserName") || "");
			if (!r.ok) return q.current = !1, V(r.holder || {}), H(""), O(`只读模式：画布正由 ${I(r.holder)} 编辑`), !1;
			if (q.current = !0, V(null), H(""), !e) {
				let e = await n.get(String(x.id));
				K.current = Number(e.updated_at || 0), C(e), O("已取得编辑锁，并同步到最新画布");
			}
			return !0;
		} catch (e) {
			q.current = !1, V({ username: "锁状态未知" });
			let t = `编辑锁续期失败，已切换只读并将自动重试：${e instanceof Error ? e.message : String(e)}`;
			return H(t), O(t), !1;
		}
	}, [
		x?.id,
		t,
		n
	]), Q = (0, c.useCallback)(async (e = 0) => {
		if (!(!x?.id || J.current)) {
			J.current = !0;
			try {
				let r = e || Number((await t.getMeta(String(x.id))).updated_at || 0);
				if (!r || r <= K.current) return;
				let i = await n.get(String(x.id)), a = window.CanvasBoardV2?.syncRemote(i);
				if (!a?.updated) {
					a?.conflicts.includes("save-in-progress") ? U("检测到远端更新，等待当前保存完成后同步") : U(`远端更新与本地修改冲突：${a?.conflicts.join("、") || "无法自动合并"}`);
					return;
				}
				K.current = Math.max(r, Number(i.updated_at || 0)), U(a.merged ? "已合并远端更新，正在保存" : "");
			} catch (e) {
				console.warn("[canvas-modern] remote canvas synchronization failed", e);
			} finally {
				J.current = !1;
			}
		}
	}, [
		x?.id,
		t,
		n
	]);
	(0, c.useEffect)(() => {
		if (!x?.id) return;
		let e = window.setInterval(() => {
			Q();
		}, 5e3), t = (e) => {
			let t = e.data && typeof e.data == "object" ? e.data : {};
			t.type === "canvas_updated" && String(t.canvas_id || "") === String(x.id) && String(t.client_id || "") !== G.current && Q(Number(t.updated_at || 0));
		};
		return window.addEventListener("message", t), () => {
			window.clearInterval(e), window.removeEventListener("message", t);
		};
	}, [x?.id, Q]), (0, c.useEffect)(() => {
		if (!x?.id) return;
		let e = window.setInterval(() => {
			Z();
		}, 25e3);
		return () => window.clearInterval(e);
	}, [Z, x?.id]), (0, c.useEffect)(() => {
		let t = String(e.initialCanvasId || "").trim();
		!t || x || le.current || (le.current = !0, X(a.find((e) => e.id === t) ?? {
			id: t,
			kind: i
		}));
	}, [
		a,
		i,
		e.initialCanvasId,
		x
	]);
	let ue = async () => {
		x?.id && q.current && await t.releaseLock(String(x.id), G.current).catch(() => void 0), q.current = !1, V(null), H(""), U(""), K.current = 0, C(null), A(null), await Y();
	}, de = async () => {
		try {
			let n = await t.create(T || e.defaultTitle || "", {
				icon: i === "smart" ? "sparkles" : void 0,
				kind: i
			});
			E(""), await Y(), await X(n);
		} catch (e) {
			O(e instanceof Error ? e.message : String(e));
		}
	}, fe = async () => {
		let e = localStorage.getItem("canvasUserName") || "", t = window.prompt("编辑身份名称", e);
		t !== null && (localStorage.setItem("canvasUserName", t.trim()), x?.id && await Z());
	}, pe = async (e) => {
		window.confirm("将此画布移入回收站？") && (await t.delete(e), await Y());
	}, $ = async () => {
		x?.id && A(await n.listBackups(String(x.id)));
	}, me = async (e) => {
		x?.id && P({
			mode: e,
			document: await n.get(String(x.id))
		});
	}, he = () => {
		let e = window.CanvasBoardV2?.exportSelection();
		if (!e?.nodes.length) {
			O("没有可导出的节点");
			return;
		}
		let t = new Blob([JSON.stringify({
			version: 2,
			...e
		}, null, 2)], { type: "application/json" }), n = URL.createObjectURL(t);
		Object.assign(document.createElement("a"), {
			download: `${String(x?.title || "canvas")}-workflow.json`,
			href: n
		}).click(), URL.revokeObjectURL(n), R(!1);
	}, ge = async () => {
		let e = window.CanvasBoardV2?.exportSelection();
		if (!e?.nodes.length) {
			O("没有可导出的节点");
			return;
		}
		try {
			O("正在收集工作流资源…");
			let t = `${String(x?.title || "canvas")}-workflow.zip`, n = await fetch("/api/canvas-workflows/export", {
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
			re(await n.blob(), n.headers.get("Content-Disposition"), t), O("已导出含本地资源的工作流 ZIP"), R(!1);
		} catch (e) {
			O(e instanceof Error ? e.message : String(e));
		}
	}, _e = () => {
		let e = window.CanvasBoardV2?.exportSelection();
		if (!e?.nodes.length) {
			O("没有可保存的节点");
			return;
		}
		let t = String(x?.title || "canvas");
		R(!1), z({ saveWorkflow: {
			...e,
			filename: `${t}-workflow.zip`,
			name: t
		} });
	}, ve = async () => {
		let e = window.CanvasBoardV2?.exportSelection(), t = ie(e?.nodes || []);
		if (!t.length) {
			O("选区中没有可批量导出的媒体或文本");
			return;
		}
		let n = window.prompt("导出到服务器文件夹（留空使用默认导出目录）", "");
		if (n !== null) try {
			let e = await fetch("/api/smart-canvas/group-export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					folder: n.trim(),
					group_name: String(x?.title || "canvas"),
					items: t
				})
			}), r = await e.json().catch(() => ({}));
			if (!e.ok) throw Error(r.detail || "批量导出失败");
			O(`已导出 ${Number(r.count || t.length)} 项到 ${String(r.folder || "默认导出目录")}`), R(!1);
		} catch (e) {
			O(e instanceof Error ? e.message : String(e));
		}
	}, ye = async (e) => {
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
			let n = L(t), r = window.CanvasBoardV2?.importWorkflow(n) ?? [];
			O(r.length ? `已导入 ${r.length} 个节点` : "文件中没有可导入节点"), R(!1);
		} catch (e) {
			O(e instanceof Error ? e.message : String(e));
		}
	}, be = () => z({
		onInsert: (e) => {
			let t = window.CanvasBoardV2?.addNode("image", {
				x: 100,
				y: 100
			});
			t && window.CanvasBoardV2?.updateNode(t, {
				mediaKind: e.kind,
				name: e.name,
				url: e.url
			});
		},
		onImportWorkflow: async (e) => {
			let t = await fetch(e.url);
			if (!t.ok) throw Error("读取资产库工作流失败");
			let n = /\.json(?:[?#]|$)/i.test(e.url) ? ".json" : ".zip";
			await ye(new File([await t.blob()], `${e.name || "workflow"}${n}`));
		}
	}), xe = () => {
		let t = e.assetInboxKey || "", n = v(t);
		if (!n.length) return O("素材收件箱为空或已过期"), 0;
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
		return localStorage.removeItem(t), O(`已从素材库导入 ${i.length} 个素材`), i.length;
	};
	if ((0, c.useEffect)(() => {
		if (!x || !e.assetInboxKey) return;
		let t = (t) => {
			if (!(t.ctrlKey || t.metaKey) || t.key.toLowerCase() !== "v") return;
			let n = t.target;
			n?.isContentEditable || ["INPUT", "TEXTAREA"].includes(n?.tagName || "") || v(e.assetInboxKey || "").length && (t.preventDefault(), xe());
		};
		return window.addEventListener("keydown", t, !0), () => window.removeEventListener("keydown", t, !0);
	}, [e.assetInboxKey, x]), !x) {
		let n = y ? u : h === "all" ? a : h === "root" ? a.filter((e) => !e.folder_id) : a.filter((e) => e.folder_id === h);
		return /* @__PURE__ */ (0, S.jsx)("main", {
			className: "canvas-modern-manager",
			children: /* @__PURE__ */ (0, S.jsxs)("section", {
				className: "gate-panel canvas-modern-gate",
				children: [
					/* @__PURE__ */ (0, S.jsxs)("header", {
						className: "gate-head",
						children: [/* @__PURE__ */ (0, S.jsxs)("div", {
							className: "gate-head-text",
							children: [/* @__PURE__ */ (0, S.jsx)("h1", {
								className: "gate-title",
								children: y ? "回收站" : e.heading || "经典画布 V2"
							}), /* @__PURE__ */ (0, S.jsx)("p", {
								className: "gate-subtitle",
								children: e.subtitle || "React + TypeScript 独立文档与执行路径"
							})]
						}), /* @__PURE__ */ (0, S.jsxs)("div", {
							className: "gate-head-actions",
							children: [
								e.managerBackHref ? /* @__PURE__ */ (0, S.jsx)("a", {
									className: "gate-icon-btn",
									href: e.managerBackHref,
									children: "返回首页"
								}) : null,
								y ? null : /* @__PURE__ */ (0, S.jsxs)(S.Fragment, { children: [
									/* @__PURE__ */ (0, S.jsxs)("select", {
										"aria-label": "画布文件夹",
										onChange: (e) => g(e.target.value),
										value: h,
										children: [
											/* @__PURE__ */ (0, S.jsx)("option", {
												value: "all",
												children: "全部画布"
											}),
											/* @__PURE__ */ (0, S.jsx)("option", {
												value: "root",
												children: "未分类"
											}),
											p.map((e) => /* @__PURE__ */ (0, S.jsx)("option", {
												value: e.id,
												children: String(e.name || "未命名文件夹")
											}, e.id))
										]
									}),
									/* @__PURE__ */ (0, S.jsx)("button", {
										className: "gate-icon-btn",
										onClick: async () => {
											let e = window.prompt("文件夹名称")?.trim();
											e && (await t.createFolder(e), await Y());
										},
										type: "button",
										children: "新建文件夹"
									}),
									["all", "root"].includes(h) ? null : /* @__PURE__ */ (0, S.jsx)("button", {
										className: "gate-icon-btn",
										onClick: async () => {
											window.confirm("删除此文件夹？文件夹内画布不会被永久删除。") && (await t.deleteFolder(h), g("all"), await Y());
										},
										type: "button",
										children: "删除文件夹"
									})
								] }),
								/* @__PURE__ */ (0, S.jsx)("button", {
									className: "gate-icon-btn",
									onClick: () => void Y(),
									type: "button",
									children: "刷新"
								}),
								/* @__PURE__ */ (0, S.jsx)("button", {
									className: "gate-icon-btn",
									onClick: () => b((e) => !e),
									type: "button",
									children: y ? "返回画布" : `回收站 ${u.length}`
								})
							]
						})]
					}),
					y ? null : /* @__PURE__ */ (0, S.jsxs)("div", {
						className: "gate-create-row canvas-modern-create",
						children: [/* @__PURE__ */ (0, S.jsx)("input", {
							className: "gate-name-input",
							maxLength: 80,
							onChange: (e) => E(e.target.value),
							onKeyDown: (e) => {
								e.key === "Enter" && de();
							},
							placeholder: "新画布名称",
							value: T
						}), /* @__PURE__ */ (0, S.jsx)("button", {
							className: "primary-btn",
							onClick: () => void de(),
							type: "button",
							children: e.createLabel || "新建画布"
						})]
					}),
					D ? /* @__PURE__ */ (0, S.jsx)("div", {
						className: "gate-status",
						children: D
					}) : null,
					/* @__PURE__ */ (0, S.jsx)("div", {
						className: "gate-list canvas-modern-list",
						children: n.map((e) => /* @__PURE__ */ (0, S.jsxs)("article", {
							className: "gate-card",
							"data-canvas-id": e.id,
							children: [/* @__PURE__ */ (0, S.jsxs)("button", {
								className: "canvas-modern-card-main",
								disabled: y,
								onClick: () => void X(e),
								type: "button",
								children: [/* @__PURE__ */ (0, S.jsx)("strong", { children: String(e.title || "未命名画布") }), /* @__PURE__ */ (0, S.jsx)("small", { children: F(e.updated_at) })]
							}), y ? /* @__PURE__ */ (0, S.jsxs)(S.Fragment, { children: [/* @__PURE__ */ (0, S.jsx)("button", {
								onClick: async () => {
									await t.restore(e.id), await Y();
								},
								type: "button",
								children: "恢复"
							}), /* @__PURE__ */ (0, S.jsx)("button", {
								onClick: async () => {
									window.confirm("永久删除后无法恢复，确定继续？") && (await t.purge(e.id), await Y());
								},
								type: "button",
								children: "永久删除"
							})] }) : /* @__PURE__ */ (0, S.jsxs)(S.Fragment, { children: [/* @__PURE__ */ (0, S.jsxs)("select", {
								"aria-label": `移动 ${String(e.title || "画布")}`,
								onChange: async (n) => {
									await t.moveToFolder(e.id, n.target.value), await Y();
								},
								value: String(e.folder_id || ""),
								children: [/* @__PURE__ */ (0, S.jsx)("option", {
									value: "",
									children: "未分类"
								}), p.map((e) => /* @__PURE__ */ (0, S.jsx)("option", {
									value: e.id,
									children: String(e.name || "未命名文件夹")
								}, e.id))]
							}), /* @__PURE__ */ (0, S.jsx)("button", {
								"aria-label": "移入回收站",
								onClick: () => void pe(e.id),
								type: "button",
								children: "删除"
							})] })]
						}, e.id))
					})
				]
			})
		});
	}
	return /* @__PURE__ */ (0, S.jsxs)("main", {
		className: "canvas-modern-editor",
		children: [
			/* @__PURE__ */ (0, S.jsxs)("header", {
				className: "topbar canvas-modern-topbar",
				children: [/* @__PURE__ */ (0, S.jsxs)("div", {
					className: "panel canvas-nav",
					children: [
						/* @__PURE__ */ (0, S.jsx)("button", {
							className: "tool-btn",
							onClick: () => void ue(),
							type: "button",
							children: "← 返回"
						}),
						/* @__PURE__ */ (0, S.jsxs)("div", {
							className: "canvas-nav-meta",
							children: [/* @__PURE__ */ (0, S.jsx)("strong", { children: String(x.title || "未命名画布") }), /* @__PURE__ */ (0, S.jsx)("small", { children: B ? `只读 · ${I(B)} 编辑中` : ce || F(x.updated_at) })]
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							className: "tool-btn",
							onClick: () => void fe(),
							type: "button",
							children: "编辑身份"
						})
					]
				}), /* @__PURE__ */ (0, S.jsxs)("div", {
					className: "panel toolbar canvas-modern-toolbar",
					children: [/* @__PURE__ */ (0, S.jsx)("div", {
						className: "toolbar-items",
						children: te.map(([e, t]) => /* @__PURE__ */ (0, S.jsx)("button", {
							className: "tool-btn",
							disabled: !!B,
							onClick: () => window.CanvasBoardV2?.addNode(e),
							type: "button",
							children: t
						}, e))
					}), /* @__PURE__ */ (0, S.jsxs)("div", {
						className: "toolbar-fixed",
						children: [
							/* @__PURE__ */ (0, S.jsx)("button", {
								className: "tool-btn",
								disabled: !!B,
								onClick: () => window.CanvasBoardV2?.undo(),
								title: "Ctrl/⌘ + Z",
								type: "button",
								children: "撤销"
							}),
							/* @__PURE__ */ (0, S.jsx)("button", {
								className: "tool-btn",
								disabled: !!B,
								onClick: () => window.CanvasBoardV2?.redo(),
								title: "Ctrl/⌘ + Shift + Z",
								type: "button",
								children: "重做"
							}),
							/* @__PURE__ */ (0, S.jsx)("button", {
								className: "tool-btn",
								disabled: !!B,
								onClick: () => window.CanvasBoardV2?.groupSelected(),
								type: "button",
								children: "分组"
							}),
							/* @__PURE__ */ (0, S.jsx)("button", {
								className: "tool-btn",
								onClick: () => R(!0),
								type: "button",
								children: "工作流"
							}),
							/* @__PURE__ */ (0, S.jsx)("button", {
								className: "tool-btn",
								onClick: be,
								type: "button",
								children: "资产库"
							}),
							e.assetInboxKey ? /* @__PURE__ */ (0, S.jsx)("button", {
								className: "tool-btn",
								disabled: !!B,
								onClick: xe,
								type: "button",
								children: "导入素材"
							}) : null,
							/* @__PURE__ */ (0, S.jsx)("button", {
								className: "tool-btn",
								onClick: () => void me("cost"),
								type: "button",
								children: "费用"
							}),
							/* @__PURE__ */ (0, S.jsx)("button", {
								className: "tool-btn",
								onClick: () => void me("logs"),
								type: "button",
								children: "日志"
							}),
							/* @__PURE__ */ (0, S.jsx)("button", {
								className: "tool-btn",
								disabled: !!B,
								onClick: () => void $(),
								type: "button",
								children: "备份"
							})
						]
					})]
				})]
			}),
			/* @__PURE__ */ (0, S.jsx)("div", {
				className: "canvas-modern-board",
				ref: W
			}),
			e.editorAddon,
			B ? /* @__PURE__ */ (0, S.jsx)("div", {
				className: "canvas-modern-readonly-overlay",
				children: /* @__PURE__ */ (0, S.jsxs)("section", { children: [
					/* @__PURE__ */ (0, S.jsx)("strong", { children: "只读模式" }),
					/* @__PURE__ */ (0, S.jsxs)("span", { children: [I(B), " 正在编辑此画布"] }),
					se ? /* @__PURE__ */ (0, S.jsx)("small", { children: se }) : null,
					/* @__PURE__ */ (0, S.jsx)("button", {
						className: "primary-btn",
						onClick: () => void Z(),
						type: "button",
						children: "尝试取得编辑锁"
					})
				] })
			}) : null,
			k ? /* @__PURE__ */ (0, S.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, S.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, S.jsxs)("header", { children: [/* @__PURE__ */ (0, S.jsx)("strong", { children: "画布备份" }), /* @__PURE__ */ (0, S.jsx)("button", {
							onClick: () => A(null),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, S.jsx)("button", {
							onClick: async () => {
								await n.createBackup(String(x.id)), await $();
							},
							type: "button",
							children: "立即备份"
						}),
						k.map((e) => /* @__PURE__ */ (0, S.jsxs)("div", {
							className: "backup-item",
							children: [
								/* @__PURE__ */ (0, S.jsx)("span", { children: String(e.filename) }),
								/* @__PURE__ */ (0, S.jsx)("button", {
									onClick: async () => {
										let t = await n.restoreBackup(String(x.id), String(e.filename));
										C(t), A(null);
									},
									type: "button",
									children: "恢复"
								}),
								/* @__PURE__ */ (0, S.jsx)("button", {
									onClick: async () => {
										await t.deleteBackup(String(x.id), String(e.filename)), await $();
									},
									type: "button",
									children: "删除"
								})
							]
						}, String(e.filename)))
					]
				})
			}) : null,
			j ? /* @__PURE__ */ (0, S.jsx)(ee, {
				onClose: () => M(null),
				request: j
			}) : null,
			ae ? /* @__PURE__ */ (0, S.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, S.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, S.jsxs)("header", { children: [/* @__PURE__ */ (0, S.jsx)("strong", { children: "工作流导入 / 导出" }), /* @__PURE__ */ (0, S.jsx)("button", {
							onClick: () => R(!1),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, S.jsx)("p", { children: "有选中节点时仅导出选区；分组会自动包含其成员。ZIP 会携带节点引用的本地媒体，导入后自动恢复资源地址。" }),
						/* @__PURE__ */ (0, S.jsx)("button", {
							onClick: he,
							type: "button",
							children: "导出 JSON"
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							className: "primary-btn",
							onClick: () => void ge(),
							type: "button",
							children: "导出 ZIP（含资源）"
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							onClick: _e,
							type: "button",
							children: "保存到工作流库"
						}),
						/* @__PURE__ */ (0, S.jsx)("button", {
							onClick: () => void ve(),
							type: "button",
							children: "批量导出选区结果"
						}),
						/* @__PURE__ */ (0, S.jsxs)("label", {
							className: "primary-btn",
							children: ["导入 JSON / ZIP", /* @__PURE__ */ (0, S.jsx)("input", {
								accept: ".json,.zip,application/json,application/zip",
								hidden: !0,
								onChange: (e) => {
									let t = e.target.files?.[0];
									t && ye(t);
								},
								type: "file"
							})]
						})
					]
				})
			}) : null,
			oe ? /* @__PURE__ */ (0, S.jsx)(w, {
				onClose: () => z(null),
				request: oe
			}) : null,
			N ? /* @__PURE__ */ (0, S.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, S.jsxs)("section", {
					className: "modal-panel",
					children: [/* @__PURE__ */ (0, S.jsxs)("header", { children: [/* @__PURE__ */ (0, S.jsx)("strong", { children: N.mode === "logs" ? "生成日志" : "费用汇总" }), /* @__PURE__ */ (0, S.jsx)("button", {
						onClick: () => P(null),
						type: "button",
						children: "关闭"
					})] }), N.mode === "logs" ? /* @__PURE__ */ (0, S.jsx)(S.Fragment, { children: (Array.isArray(N.document.logs) ? N.document.logs : []).slice().reverse().map((e, t) => /* @__PURE__ */ (0, S.jsx)("pre", { children: JSON.stringify(e, null, 2) }, String(e.id || t))) }) : /* @__PURE__ */ (0, S.jsxs)(S.Fragment, { children: [/* @__PURE__ */ (0, S.jsxs)("h2", { children: ["¥ ", _(N.document).toFixed(4)] }), /* @__PURE__ */ (0, S.jsx)("p", { children: "仅汇总任务记录中已返回的费用字段；供应商未返回价格时显示为 0。" })] })]
				})
			}) : null
		]
	});
}
function P(e, t) {
	let n = (0, l.createRoot)(e);
	return n.render(/* @__PURE__ */ (0, S.jsx)(N, { ...t })), () => n.unmount();
}
function ne() {
	let e = sessionStorage.getItem("canvasClientId");
	if (e) return e;
	let t = `canvas_${crypto.randomUUID?.() || Date.now()}`;
	return sessionStorage.setItem("canvasClientId", t), t;
}
function F(e) {
	let t = Number(e || 0);
	return t ? new Date(t < 1e10 ? t * 1e3 : t).toLocaleString() : "--";
}
function I(e) {
	return String(e?.username || e?.ip || "其他用户");
}
function L(e) {
	let t = e && typeof e == "object" ? e : {}, n = t.workflow && typeof t.workflow == "object" ? t.workflow : t;
	return {
		connections: Array.isArray(n.connections) ? n.connections : [],
		nodes: Array.isArray(n.nodes) ? n.nodes : []
	};
}
function re(e, t, n) {
	let r = t?.match(/filename\*=UTF-8''([^;]+)/i)?.[1], i = t?.match(/filename="?([^";]+)"?/i)?.[1], a = r ? decodeURIComponent(r) : i || n, o = URL.createObjectURL(e);
	Object.assign(document.createElement("a"), {
		download: a,
		href: o
	}).click(), URL.revokeObjectURL(o);
}
function ie(e) {
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
export { P as mountCanvasAppV2 };
