import { c as e, o as t, s as n, t as r } from "./jsx-runtime-DnrZ1XIK.js";
import { n as i } from "./http-F-lX8WKW.js";
import { r as a } from "./document-merge-DziDwlrU.js";
import { t as o } from "./canvas-board-v2-qbmgViHf.js";
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
//#region src/canvas/infrastructure/asset-library-client.ts
var g = {
	list: () => _("/api/asset-library"),
	createLibrary: (e) => _("/api/asset-library/libraries", v("POST", { name: e })),
	renameLibrary: (e, t) => _(`/api/asset-library/libraries/${encodeURIComponent(e)}`, v("PATCH", { name: t })),
	deleteLibrary: (e) => _(`/api/asset-library/libraries/${encodeURIComponent(e)}`, v("DELETE")),
	createCategory: (e, t, n = "image") => _("/api/asset-library/categories", v("POST", {
		library_id: e,
		name: t,
		type: n
	})),
	renameCategory: (e, t, n) => _(`/api/asset-library/categories/${encodeURIComponent(t)}`, v("PATCH", {
		library_id: e,
		name: n
	})),
	deleteCategory: (e, t) => _(`/api/asset-library/categories/${encodeURIComponent(t)}?library_id=${encodeURIComponent(e)}`, v("DELETE")),
	addUrl: (e, t, n, r) => _("/api/asset-library/items", v("POST", {
		category_id: t,
		library_id: e,
		name: r,
		url: n
	})),
	renameItem: (e, t) => _(`/api/asset-library/items/${encodeURIComponent(e)}`, v("PATCH", { name: t })),
	deleteItem: (e, t) => _("/api/asset-library/items/delete", v("POST", {
		ids: [t],
		library_id: e
	}))
};
async function _(e, t) {
	let n = await fetch(e, t), r = await n.json().catch(() => ({}));
	if (!n.ok) {
		let e = r.detail;
		throw Error(typeof e == "string" ? e : e?.message || `请求失败 (${n.status})`);
	}
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
//#region src/canvas/ui/asset-library-dialog.tsx
var y = r(), b = {
	active_library_id: "",
	libraries: []
};
function x({ onClose: e, request: t }) {
	let [n, r] = (0, s.useState)(b), [i, a] = (0, s.useState)(""), [o, c] = (0, s.useState)(""), [l, u] = (0, s.useState)(""), [d, f] = (0, s.useState)(t.saveItem?.url || ""), [p, m] = (0, s.useState)(t.saveItem?.name || C(t.saveItem?.url || "")), [h, _] = (0, s.useState)("正在加载资产库…"), v = n.libraries.find((e) => e.id === i) ?? n.libraries[0], x = v?.categories || [], T = x.find((e) => e.id === o) ?? x[0], E = (0, s.useMemo)(() => (T?.items || []).filter((e) => {
		let t = l.trim().toLocaleLowerCase();
		return !t || e.name.toLocaleLowerCase().includes(t) || e.url.toLocaleLowerCase().includes(t);
	}), [T, l]), D = (e, t = i, n = o) => {
		r(e);
		let s = e.libraries.find((e) => e.id === t) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0], l = s?.categories.find((e) => e.id === n) ?? s?.categories.find((e) => e.type === "image") ?? s?.categories[0];
		a(s?.id || ""), c(l?.id || "");
	};
	(0, s.useEffect)(() => {
		let e = !0;
		return g.list().then((t) => {
			e && (D(t.library, t.library.active_library_id, ""), _(""));
		}).catch((t) => e && _(w(t))), () => {
			e = !1;
		};
	}, []);
	let O = (e) => {
		let t = n.libraries.find((t) => t.id === e);
		a(e), c(t?.categories.find((e) => e.type === "image")?.id || t?.categories[0]?.id || "");
	}, k = async (e, t, n = T?.id || "") => {
		try {
			let r = await e();
			return D(r.library, v?.id, n), _(t), r;
		} catch (e) {
			return _(w(e)), null;
		}
	}, A = async () => {
		let e = window.prompt("新资产库名称")?.trim();
		if (!e) return;
		let t = await k(() => g.createLibrary(e), "资产库已创建", "");
		t && D(t.library, t.library.active_library_id, "");
	}, j = async () => {
		if (!v) return;
		let e = window.prompt("资产库名称", v.name)?.trim();
		e && await k(() => g.renameLibrary(v.id, e), "资产库已重命名");
	}, M = async () => {
		if (!v || !window.confirm(`删除资产库“${v.name}”？其中素材文件也会被删除。`)) return;
		let e = await k(() => g.deleteLibrary(v.id), "资产库已删除", "");
		e && D(e.library, e.library.active_library_id, "");
	}, N = async () => {
		if (!v) return;
		let e = window.prompt("新分组名称")?.trim();
		if (!e) return;
		let t = await k(() => g.createCategory(v.id, e), "分组已创建");
		t?.category && D(t.library, v.id, t.category.id);
	}, P = async () => {
		if (!v || !T) return;
		let e = window.prompt("分组名称", T.name)?.trim();
		e && await k(() => g.renameCategory(v.id, T.id, e), "分组已重命名");
	}, F = async () => {
		!v || !T || !window.confirm(`删除分组“${T.name}”？其中素材文件也会被删除。`) || await k(() => g.deleteCategory(v.id, T.id), "分组已删除", "");
	}, I = async () => {
		if (!v || !T) {
			_("请先选择资产库与媒体分组");
			return;
		}
		if (T.type !== "image") {
			_("工作流分组不能保存媒体");
			return;
		}
		if (!d.trim()) {
			_("请输入本地 /assets 或 /output 媒体地址");
			return;
		}
		(await k(() => g.addUrl(v.id, T.id, d.trim(), p.trim() || C(d)), "素材已保存"))?.item && (f(""), m(""), t.saveItem && e());
	}, L = async (e) => {
		let t = window.prompt("素材名称", e.name)?.trim();
		t && await k(() => g.renameItem(e.id, t), "素材已重命名");
	}, R = async (e) => {
		!v || !window.confirm(`删除素材“${e.name}”？本地文件副本也会被删除。`) || await k(() => g.deleteItem(v.id, e.id), "素材已删除");
	};
	return /* @__PURE__ */ (0, y.jsx)("div", {
		"aria-modal": "true",
		className: "modal open canvas-modern-backups canvas-asset-dialog",
		role: "dialog",
		children: /* @__PURE__ */ (0, y.jsxs)("section", {
			className: "modal-panel",
			children: [
				/* @__PURE__ */ (0, y.jsxs)("header", { children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: t.saveItem ? "保存到资产库" : "资产库" }), /* @__PURE__ */ (0, y.jsx)("button", {
					onClick: e,
					type: "button",
					children: "关闭"
				})] }),
				/* @__PURE__ */ (0, y.jsxs)("div", {
					className: "canvas-asset-toolbar",
					children: [
						/* @__PURE__ */ (0, y.jsx)("select", {
							"aria-label": "资产库",
							onChange: (e) => O(e.target.value),
							value: v?.id || "",
							children: n.libraries.map((e) => /* @__PURE__ */ (0, y.jsx)("option", {
								value: e.id,
								children: e.name
							}, e.id))
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							onClick: () => void A(),
							type: "button",
							children: "新建库"
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							disabled: !v,
							onClick: () => void j(),
							type: "button",
							children: "重命名库"
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							disabled: !v || n.libraries.length <= 1,
							onClick: () => void M(),
							type: "button",
							children: "删除库"
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							disabled: !v,
							onClick: () => void N(),
							type: "button",
							children: "新建分组"
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							disabled: !T,
							onClick: () => void P(),
							type: "button",
							children: "重命名分组"
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							disabled: !T,
							onClick: () => void F(),
							type: "button",
							children: "删除分组"
						}),
						/* @__PURE__ */ (0, y.jsx)("input", {
							"aria-label": "搜索资产",
							onChange: (e) => u(e.target.value),
							placeholder: "搜索名称或地址",
							value: l
						})
					]
				}),
				/* @__PURE__ */ (0, y.jsxs)("div", {
					className: "canvas-asset-body",
					children: [/* @__PURE__ */ (0, y.jsx)("aside", { children: x.map((e) => /* @__PURE__ */ (0, y.jsxs)("button", {
						className: e.id === T?.id ? "active" : "",
						onClick: () => c(e.id),
						type: "button",
						children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: e.name }), /* @__PURE__ */ (0, y.jsx)("small", { children: e.type === "workflow" ? "工作流" : `${e.items.length} 项` })]
					}, e.id)) }), /* @__PURE__ */ (0, y.jsxs)("div", {
						className: "canvas-asset-content",
						children: [
							T?.type === "image" ? /* @__PURE__ */ (0, y.jsxs)("div", {
								className: "canvas-asset-add",
								children: [
									/* @__PURE__ */ (0, y.jsx)("input", {
										"aria-label": "素材地址",
										onChange: (e) => f(e.target.value),
										placeholder: "/output/result.png 或 /assets/…",
										value: d
									}),
									/* @__PURE__ */ (0, y.jsx)("input", {
										"aria-label": "素材名称",
										onChange: (e) => m(e.target.value),
										placeholder: "素材名称（可选）",
										value: p
									}),
									/* @__PURE__ */ (0, y.jsx)("button", {
										className: "primary-btn",
										onClick: () => void I(),
										type: "button",
										children: t.saveItem ? "保存输出" : "添加地址"
									})
								]
							}) : null,
							/* @__PURE__ */ (0, y.jsx)("div", {
								className: "canvas-modern-asset-grid",
								children: E.map((n) => /* @__PURE__ */ (0, y.jsxs)("article", { children: [/* @__PURE__ */ (0, y.jsxs)("button", {
									className: "canvas-asset-preview",
									disabled: !t.onInsert || n.kind === "workflow",
									onClick: () => {
										t.onInsert?.(n), e();
									},
									type: "button",
									children: [S(n), /* @__PURE__ */ (0, y.jsx)("small", { children: n.name })]
								}), /* @__PURE__ */ (0, y.jsxs)("div", { children: [/* @__PURE__ */ (0, y.jsx)("button", {
									onClick: () => void L(n),
									type: "button",
									children: "重命名"
								}), /* @__PURE__ */ (0, y.jsx)("button", {
									onClick: () => void R(n),
									type: "button",
									children: "删除"
								})] })] }, n.id))
							}),
							E.length ? null : /* @__PURE__ */ (0, y.jsx)("p", { children: "当前分组暂无匹配内容" })
						]
					})]
				}),
				h ? /* @__PURE__ */ (0, y.jsx)("div", {
					className: "gate-status",
					role: "status",
					children: h
				}) : null
			]
		})
	});
}
function S(e) {
	return e.kind === "image" ? /* @__PURE__ */ (0, y.jsx)("img", {
		alt: e.name,
		src: e.url
	}) : /* @__PURE__ */ (0, y.jsx)("span", { children: e.kind === "video" ? "视频" : e.kind === "audio" ? "音频" : "工作流" });
}
function C(e) {
	let t = e.split(/[?#]/, 1)[0];
	return decodeURIComponent(t.split("/").pop() || "生成结果");
}
function w(e) {
	return e instanceof Error ? e.message : String(e);
}
//#endregion
//#region src/canvas/infrastructure/prompt-library-client.ts
var T = {
	list: () => E("/api/prompt-libraries"),
	createLibrary: (e) => E("/api/prompt-libraries", D("POST", { name: e })),
	renameLibrary: (e, t) => E(`/api/prompt-libraries/${encodeURIComponent(e)}`, D("PATCH", { name: t })),
	deleteLibrary: (e) => E(`/api/prompt-libraries/${encodeURIComponent(e)}`, D("DELETE")),
	savePrompt: (e, t) => E(t.id ? `/api/prompt-libraries/items/${encodeURIComponent(t.id)}` : "/api/prompt-libraries/items", D(t.id ? "PATCH" : "POST", {
		library_id: e,
		...t
	})),
	deletePrompts: (e) => E("/api/prompt-libraries/items/delete", D("POST", { ids: e })),
	createCategory: (e, t) => E("/api/prompt-libraries/categories", D("POST", {
		library_id: e,
		name: t
	}))
};
async function E(e, t) {
	let n = await fetch(e, t), r = await n.json().catch(() => ({}));
	if (!n.ok) throw Error(r.detail || `请求失败 (${n.status})`);
	return r;
}
function D(e, t) {
	return {
		method: e,
		headers: t === void 0 ? void 0 : { "Content-Type": "application/json" },
		body: t === void 0 ? void 0 : JSON.stringify(t)
	};
}
//#endregion
//#region src/canvas/ui/prompt-library-dialog.tsx
function O({ onClose: e, request: t }) {
	let [n, r] = (0, s.useState)({
		active_library_id: "",
		libraries: []
	}), [i, a] = (0, s.useState)(""), [o, c] = (0, s.useState)(""), [l, u] = (0, s.useState)(""), [d, f] = (0, s.useState)("正在加载提示词库…"), [p, m] = (0, s.useState)({
		category: "",
		name: "",
		negative: "",
		positive: t.initialText || "",
		scene: ""
	}), h = n.libraries.find((e) => e.id === i) ?? n.libraries[0], g = (0, s.useMemo)(() => (h?.items || []).filter((e) => A(e, l)), [h, l]), _ = h?.items.find((e) => e.id === o), v = (e, t = i, n = o) => {
		r(e);
		let s = e.libraries.find((e) => e.id === t) ?? e.libraries.find((t) => t.id === e.active_library_id) ?? e.libraries[0];
		a(s?.id || "");
		let l = s?.items.find((e) => e.id === n) ?? s?.items[0];
		c(l?.id || ""), l && m(k(l));
	};
	(0, s.useEffect)(() => {
		let e = !0;
		return T.list().then((t) => {
			e && (v(t.library, t.library.active_library_id, ""), f(""));
		}).catch((t) => e && f(t instanceof Error ? t.message : String(t))), () => {
			e = !1;
		};
	}, []);
	let b = (e) => {
		let r = n.libraries.find((t) => t.id === e);
		a(e), c(r?.items[0]?.id || ""), m(r?.items[0] ? k(r.items[0]) : {
			category: r?.categories[0]?.id || "",
			name: "",
			negative: "",
			positive: t.initialText || "",
			scene: ""
		});
	}, x = (e) => {
		c(e.id), m(k(e));
	}, S = () => {
		c(""), m({
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
			let e = await T.savePrompt(h.id, {
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
			let e = await T.deletePrompts([_.id]);
			v(e.library, h?.id, ""), f("提示词已删除");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, E = async () => {
		let e = window.prompt("新提示词库名称")?.trim();
		if (e) try {
			let t = await T.createLibrary(e);
			v(t.library, t.library.active_library_id, ""), f("提示词库已创建");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, D = async () => {
		if (!h || h.id === "system") return;
		let e = window.prompt("提示词库名称", h.name)?.trim();
		if (e) try {
			let t = await T.renameLibrary(h.id, e);
			v(t.library, h.id, o), f("提示词库已重命名");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, O = async () => {
		if (!(!h || h.id === "system" || !window.confirm(`删除提示词库“${h.name}”？`))) try {
			let e = await T.deleteLibrary(h.id);
			v(e.library, e.library.active_library_id, ""), f("提示词库已删除");
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		}
	}, j = async () => {
		if (!h) return;
		let e = window.prompt("新分组名称")?.trim();
		if (e) try {
			let t = await T.createCategory(h.id, e);
			v(t.library, h.id, o), f("分组已创建");
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
							onChange: (e) => b(e.target.value),
							value: h?.id || "",
							children: n.libraries.map((e) => /* @__PURE__ */ (0, y.jsx)("option", {
								value: e.id,
								children: e.name
							}, e.id))
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							onClick: () => void E(),
							type: "button",
							children: "新建库"
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							disabled: !h || h.id === "system",
							onClick: () => void D(),
							type: "button",
							children: "重命名库"
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							disabled: !h || h.id === "system",
							onClick: () => void O(),
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
							onClick: S,
							type: "button",
							children: "新建提示词"
						}),
						g.map((e) => /* @__PURE__ */ (0, y.jsxs)("button", {
							className: e.id === o ? "active" : "",
							onClick: () => x(e),
							type: "button",
							children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: e.name || "未命名" }), /* @__PURE__ */ (0, y.jsx)("small", { children: e.scene || e.positive.slice(0, 60) })]
						}, e.id)),
						g.length ? null : /* @__PURE__ */ (0, y.jsx)("p", { children: "当前库暂无匹配内容" })
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
										onClick: () => void C(),
										type: "button",
										children: _ ? "保存修改" : "创建提示词"
									}),
									/* @__PURE__ */ (0, y.jsx)("button", {
										disabled: !_,
										onClick: () => void w(),
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
function k(e) {
	return {
		category: e.category || "",
		name: e.name || "",
		negative: e.negative || "",
		positive: e.positive || "",
		scene: e.scene || ""
	};
}
function A(e, t) {
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
var j = [
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
function M({ configuration: e = {}, management: t = l(), repository: n, runtime: r }) {
	let i = e.kind ?? "classic", [c, u] = (0, s.useState)([]), [d, f] = (0, s.useState)([]), [p, g] = (0, s.useState)([]), [_, v] = (0, s.useState)("all"), [b, S] = (0, s.useState)(!1), [C, w] = (0, s.useState)(null), [T, E] = (0, s.useState)(""), [D, k] = (0, s.useState)("正在加载画布列表…"), [A, M] = (0, s.useState)(null), [N, R] = (0, s.useState)(null), [z, B] = (0, s.useState)(null), [V, H] = (0, s.useState)(!1), [U, W] = (0, s.useState)(null), G = (0, s.useRef)(null), K = (0, s.useRef)(P()), q = (0, s.useRef)(!1), J = (0, s.useCallback)(async () => {
		k("正在加载画布列表…");
		try {
			let [e, n, r] = await Promise.all([
				t.list(),
				t.listTrash(),
				t.listFolders()
			]), a = (e) => String(e.kind || "classic") === i, o = e.filter(a), s = n.filter(a);
			u(o.sort((e, t) => Number(t.updated_at || 0) - Number(e.updated_at || 0))), f(s), g(r), k(o.length ? "" : "还没有画布，新建一个开始创作。");
		} catch (e) {
			k(e instanceof Error ? e.message : String(e));
		}
	}, [i, t]);
	(0, s.useEffect)(() => {
		J();
	}, [J]), (0, s.useEffect)(() => {
		let e = G.current;
		if (!(!e || !C)) return o(e, null, {
			initialDocument: C,
			repository: n,
			runtime: r
		});
	}, [
		C,
		n,
		r
	]), (0, s.useEffect)(() => {
		let e = () => {
			C?.id && t.releaseLock(String(C.id), K.current, !0);
		};
		return window.addEventListener("pagehide", e, { once: !0 }), () => window.removeEventListener("pagehide", e);
	}, [C?.id, t]), (0, s.useEffect)(() => {
		let e = window.openPromptTemplateModal, t = window.openCanvasPromptLibrary, n = window.openCanvasAssetLibrary;
		return window.openPromptTemplateModal = (e) => {
			R({ onApply: (t) => {
				window.CanvasBoardV2?.updateNode(e, { text: t });
			} });
		}, window.openCanvasPromptLibrary = (e) => R(e), window.openCanvasAssetLibrary = (e) => W(e), () => {
			e ? window.openPromptTemplateModal = e : delete window.openPromptTemplateModal, t ? window.openCanvasPromptLibrary = t : delete window.openCanvasPromptLibrary, n ? window.openCanvasAssetLibrary = n : delete window.openCanvasAssetLibrary;
		};
	}, []);
	let Y = async (e) => {
		k("正在打开画布…");
		try {
			let i = await t.acquireLock(e.id, K.current, localStorage.getItem("canvasUserName") || "");
			if (!i.ok) throw Error(`画布正由 ${String(i.holder?.username || "其他用户")} 编辑`);
			let o = await n.get(e.id);
			w(o), k(""), r.recoverDocument(o).then(async (t) => {
				if (JSON.stringify(t) === JSON.stringify(o)) return;
				let r = await n.save(e.id, a(t));
				w((e) => e?.id === r.id ? r : e);
			}).catch((e) => k(`任务恢复失败：${e instanceof Error ? e.message : String(e)}`));
		} catch (e) {
			k(e instanceof Error ? e.message : String(e));
		}
	};
	(0, s.useEffect)(() => {
		let t = String(e.initialCanvasId || "").trim();
		!t || C || q.current || (q.current = !0, Y(c.find((e) => e.id === t) ?? {
			id: t,
			kind: i
		}));
	}, [
		c,
		i,
		e.initialCanvasId,
		C
	]);
	let ee = async () => {
		C?.id && await t.releaseLock(String(C.id), K.current).catch(() => void 0), w(null), M(null), await J();
	}, X = async () => {
		try {
			let n = await t.create(T || e.defaultTitle || "", {
				icon: i === "smart" ? "sparkles" : void 0,
				kind: i
			});
			E(""), await J(), await Y(n);
		} catch (e) {
			k(e instanceof Error ? e.message : String(e));
		}
	}, te = async (e) => {
		window.confirm("将此画布移入回收站？") && (await t.delete(e), await J());
	}, Z = async () => {
		C?.id && M(await n.listBackups(String(C.id)));
	}, Q = async (e) => {
		C?.id && B({
			mode: e,
			document: await n.get(String(C.id))
		});
	}, ne = () => {
		let e = window.CanvasBoardV2?.exportSelection();
		if (!e?.nodes.length) {
			k("没有可导出的节点");
			return;
		}
		let t = new Blob([JSON.stringify({
			version: 2,
			...e
		}, null, 2)], { type: "application/json" }), n = URL.createObjectURL(t);
		Object.assign(document.createElement("a"), {
			download: `${String(C?.title || "canvas")}-workflow.json`,
			href: n
		}).click(), URL.revokeObjectURL(n), H(!1);
	}, re = async () => {
		let e = window.CanvasBoardV2?.exportSelection();
		if (!e?.nodes.length) {
			k("没有可导出的节点");
			return;
		}
		try {
			k("正在收集工作流资源…");
			let t = `${String(C?.title || "canvas")}-workflow.zip`, n = await fetch("/api/canvas-workflows/export", {
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
			L(await n.blob(), n.headers.get("Content-Disposition"), t), k("已导出含本地资源的工作流 ZIP"), H(!1);
		} catch (e) {
			k(e instanceof Error ? e.message : String(e));
		}
	}, ie = async (e) => {
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
			let n = I(t), r = window.CanvasBoardV2?.importWorkflow(n) ?? [];
			k(r.length ? `已导入 ${r.length} 个节点` : "文件中没有可导入节点"), H(!1);
		} catch (e) {
			k(e instanceof Error ? e.message : String(e));
		}
	}, ae = () => W({ onInsert: (e) => {
		let t = window.CanvasBoardV2?.addNode("image", {
			x: 100,
			y: 100
		});
		t && window.CanvasBoardV2?.updateNode(t, {
			mediaKind: e.kind,
			name: e.name,
			url: e.url
		});
	} }), $ = () => {
		let t = e.assetInboxKey || "", n = h(t);
		if (!n.length) return k("素材收件箱为空或已过期"), 0;
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
		return localStorage.removeItem(t), k(`已从素材库导入 ${i.length} 个素材`), i.length;
	};
	if ((0, s.useEffect)(() => {
		if (!C || !e.assetInboxKey) return;
		let t = (t) => {
			if (!(t.ctrlKey || t.metaKey) || t.key.toLowerCase() !== "v") return;
			let n = t.target;
			n?.isContentEditable || ["INPUT", "TEXTAREA"].includes(n?.tagName || "") || h(e.assetInboxKey || "").length && (t.preventDefault(), $());
		};
		return window.addEventListener("keydown", t, !0), () => window.removeEventListener("keydown", t, !0);
	}, [e.assetInboxKey, C]), !C) {
		let n = b ? d : _ === "all" ? c : _ === "root" ? c.filter((e) => !e.folder_id) : c.filter((e) => e.folder_id === _);
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
								children: b ? "回收站" : e.heading || "经典画布 V2"
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
								b ? null : /* @__PURE__ */ (0, y.jsxs)(y.Fragment, { children: [
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
											e && (await t.createFolder(e), await J());
										},
										type: "button",
										children: "新建文件夹"
									}),
									["all", "root"].includes(_) ? null : /* @__PURE__ */ (0, y.jsx)("button", {
										className: "gate-icon-btn",
										onClick: async () => {
											window.confirm("删除此文件夹？文件夹内画布不会被永久删除。") && (await t.deleteFolder(_), v("all"), await J());
										},
										type: "button",
										children: "删除文件夹"
									})
								] }),
								/* @__PURE__ */ (0, y.jsx)("button", {
									className: "gate-icon-btn",
									onClick: () => void J(),
									type: "button",
									children: "刷新"
								}),
								/* @__PURE__ */ (0, y.jsx)("button", {
									className: "gate-icon-btn",
									onClick: () => S((e) => !e),
									type: "button",
									children: b ? "返回画布" : `回收站 ${d.length}`
								})
							]
						})]
					}),
					b ? null : /* @__PURE__ */ (0, y.jsxs)("div", {
						className: "gate-create-row canvas-modern-create",
						children: [/* @__PURE__ */ (0, y.jsx)("input", {
							className: "gate-name-input",
							maxLength: 80,
							onChange: (e) => E(e.target.value),
							onKeyDown: (e) => {
								e.key === "Enter" && X();
							},
							placeholder: "新画布名称",
							value: T
						}), /* @__PURE__ */ (0, y.jsx)("button", {
							className: "primary-btn",
							onClick: () => void X(),
							type: "button",
							children: e.createLabel || "新建画布"
						})]
					}),
					D ? /* @__PURE__ */ (0, y.jsx)("div", {
						className: "gate-status",
						children: D
					}) : null,
					/* @__PURE__ */ (0, y.jsx)("div", {
						className: "gate-list canvas-modern-list",
						children: n.map((e) => /* @__PURE__ */ (0, y.jsxs)("article", {
							className: "gate-card",
							"data-canvas-id": e.id,
							children: [/* @__PURE__ */ (0, y.jsxs)("button", {
								className: "canvas-modern-card-main",
								disabled: b,
								onClick: () => void Y(e),
								type: "button",
								children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: String(e.title || "未命名画布") }), /* @__PURE__ */ (0, y.jsx)("small", { children: F(e.updated_at) })]
							}), b ? /* @__PURE__ */ (0, y.jsxs)(y.Fragment, { children: [/* @__PURE__ */ (0, y.jsx)("button", {
								onClick: async () => {
									await t.restore(e.id), await J();
								},
								type: "button",
								children: "恢复"
							}), /* @__PURE__ */ (0, y.jsx)("button", {
								onClick: async () => {
									window.confirm("永久删除后无法恢复，确定继续？") && (await t.purge(e.id), await J());
								},
								type: "button",
								children: "永久删除"
							})] }) : /* @__PURE__ */ (0, y.jsxs)(y.Fragment, { children: [/* @__PURE__ */ (0, y.jsxs)("select", {
								"aria-label": `移动 ${String(e.title || "画布")}`,
								onChange: async (n) => {
									await t.moveToFolder(e.id, n.target.value), await J();
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
								onClick: () => void te(e.id),
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
						onClick: () => void ee(),
						type: "button",
						children: "← 返回"
					}), /* @__PURE__ */ (0, y.jsxs)("div", {
						className: "canvas-nav-meta",
						children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: String(C.title || "未命名画布") }), /* @__PURE__ */ (0, y.jsx)("small", { children: F(C.updated_at) })]
					})]
				}), /* @__PURE__ */ (0, y.jsxs)("div", {
					className: "panel toolbar canvas-modern-toolbar",
					children: [/* @__PURE__ */ (0, y.jsx)("div", {
						className: "toolbar-items",
						children: j.map(([e, t]) => /* @__PURE__ */ (0, y.jsx)("button", {
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
								onClick: () => H(!0),
								type: "button",
								children: "工作流"
							}),
							/* @__PURE__ */ (0, y.jsx)("button", {
								className: "tool-btn",
								onClick: ae,
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
				ref: G
			}),
			e.editorAddon,
			A ? /* @__PURE__ */ (0, y.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, y.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, y.jsxs)("header", { children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: "画布备份" }), /* @__PURE__ */ (0, y.jsx)("button", {
							onClick: () => M(null),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, y.jsx)("button", {
							onClick: async () => {
								await n.createBackup(String(C.id)), await Z();
							},
							type: "button",
							children: "立即备份"
						}),
						A.map((e) => /* @__PURE__ */ (0, y.jsxs)("div", {
							className: "backup-item",
							children: [
								/* @__PURE__ */ (0, y.jsx)("span", { children: String(e.filename) }),
								/* @__PURE__ */ (0, y.jsx)("button", {
									onClick: async () => {
										let t = await n.restoreBackup(String(C.id), String(e.filename));
										w(t), M(null);
									},
									type: "button",
									children: "恢复"
								}),
								/* @__PURE__ */ (0, y.jsx)("button", {
									onClick: async () => {
										await t.deleteBackup(String(C.id), String(e.filename)), await Z();
									},
									type: "button",
									children: "删除"
								})
							]
						}, String(e.filename)))
					]
				})
			}) : null,
			N ? /* @__PURE__ */ (0, y.jsx)(O, {
				onClose: () => R(null),
				request: N
			}) : null,
			V ? /* @__PURE__ */ (0, y.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, y.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, y.jsxs)("header", { children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: "工作流导入 / 导出" }), /* @__PURE__ */ (0, y.jsx)("button", {
							onClick: () => H(!1),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, y.jsx)("p", { children: "有选中节点时仅导出选区；未选中时导出整张画布。ZIP 会携带节点引用的本地媒体，导入后自动恢复资源地址。" }),
						/* @__PURE__ */ (0, y.jsx)("button", {
							onClick: ne,
							type: "button",
							children: "导出 JSON"
						}),
						/* @__PURE__ */ (0, y.jsx)("button", {
							className: "primary-btn",
							onClick: () => void re(),
							type: "button",
							children: "导出 ZIP（含资源）"
						}),
						/* @__PURE__ */ (0, y.jsxs)("label", {
							className: "primary-btn",
							children: ["导入 JSON / ZIP", /* @__PURE__ */ (0, y.jsx)("input", {
								accept: ".json,.zip,application/json,application/zip",
								hidden: !0,
								onChange: (e) => {
									let t = e.target.files?.[0];
									t && ie(t);
								},
								type: "file"
							})]
						})
					]
				})
			}) : null,
			U ? /* @__PURE__ */ (0, y.jsx)(x, {
				onClose: () => W(null),
				request: U
			}) : null,
			z ? /* @__PURE__ */ (0, y.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, y.jsxs)("section", {
					className: "modal-panel",
					children: [/* @__PURE__ */ (0, y.jsxs)("header", { children: [/* @__PURE__ */ (0, y.jsx)("strong", { children: z.mode === "logs" ? "生成日志" : "费用汇总" }), /* @__PURE__ */ (0, y.jsx)("button", {
						onClick: () => B(null),
						type: "button",
						children: "关闭"
					})] }), z.mode === "logs" ? /* @__PURE__ */ (0, y.jsx)(y.Fragment, { children: (Array.isArray(z.document.logs) ? z.document.logs : []).slice().reverse().map((e, t) => /* @__PURE__ */ (0, y.jsx)("pre", { children: JSON.stringify(e, null, 2) }, String(e.id || t))) }) : /* @__PURE__ */ (0, y.jsxs)(y.Fragment, { children: [/* @__PURE__ */ (0, y.jsxs)("h2", { children: ["¥ ", m(z.document).toFixed(4)] }), /* @__PURE__ */ (0, y.jsx)("p", { children: "仅汇总任务记录中已返回的费用字段；供应商未返回价格时显示为 0。" })] })]
				})
			}) : null
		]
	});
}
function N(e, t) {
	let n = (0, c.createRoot)(e);
	return n.render(/* @__PURE__ */ (0, y.jsx)(M, { ...t })), () => n.unmount();
}
function P() {
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
	let t = e && typeof e == "object" ? e : {}, n = t.workflow && typeof t.workflow == "object" ? t.workflow : t;
	return {
		connections: Array.isArray(n.connections) ? n.connections : [],
		nodes: Array.isArray(n.nodes) ? n.nodes : []
	};
}
function L(e, t, n) {
	let r = t?.match(/filename\*=UTF-8''([^;]+)/i)?.[1], i = t?.match(/filename="?([^";]+)"?/i)?.[1], a = r ? decodeURIComponent(r) : i || n, o = URL.createObjectURL(e);
	Object.assign(document.createElement("a"), {
		download: a,
		href: o
	}).click(), URL.revokeObjectURL(o);
}
//#endregion
export { N as mountCanvasAppV2 };
