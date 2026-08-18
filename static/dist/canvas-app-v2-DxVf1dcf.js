import { c as e, o as t, s as n, t as r } from "./jsx-runtime-DnrZ1XIK.js";
import { n as i } from "./http-F-lX8WKW.js";
import { r as a } from "./document-merge-DziDwlrU.js";
import { t as o } from "./canvas-board-v2-BFnnf-mm.js";
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
//#region src/canvas/ui/canvas-app-v2.tsx
var g = r(), _ = [
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
function v({ configuration: e = {}, management: t = l(), repository: n, runtime: r }) {
	let i = e.kind ?? "classic", [c, u] = (0, s.useState)([]), [d, f] = (0, s.useState)([]), [p, v] = (0, s.useState)([]), [y, w] = (0, s.useState)("all"), [T, te] = (0, s.useState)(!1), [E, D] = (0, s.useState)(null), [O, k] = (0, s.useState)(""), [A, j] = (0, s.useState)("正在加载画布列表…"), [M, N] = (0, s.useState)(null), [P, F] = (0, s.useState)(""), [I, L] = (0, s.useState)([]), [R, z] = (0, s.useState)(null), [ne, B] = (0, s.useState)(!1), [V, H] = (0, s.useState)(null), U = (0, s.useRef)(null), W = (0, s.useRef)(ee()), G = (0, s.useRef)(!1), K = (0, s.useCallback)(async () => {
		j("正在加载画布列表…");
		try {
			let [e, n, r] = await Promise.all([
				t.list(),
				t.listTrash(),
				t.listFolders()
			]), a = (e) => String(e.kind || "classic") === i, o = e.filter(a), s = n.filter(a);
			u(o.sort((e, t) => Number(t.updated_at || 0) - Number(e.updated_at || 0))), f(s), v(r), j(o.length ? "" : "还没有画布，新建一个开始创作。");
		} catch (e) {
			j(e instanceof Error ? e.message : String(e));
		}
	}, [i, t]);
	(0, s.useEffect)(() => {
		K();
	}, [K]), (0, s.useEffect)(() => {
		let e = U.current;
		if (!(!e || !E)) return o(e, null, {
			initialDocument: E,
			repository: n,
			runtime: r
		});
	}, [
		E,
		n,
		r
	]), (0, s.useEffect)(() => {
		let e = () => {
			E?.id && t.releaseLock(String(E.id), W.current, !0);
		};
		return window.addEventListener("pagehide", e, { once: !0 }), () => window.removeEventListener("pagehide", e);
	}, [E?.id, t]), (0, s.useEffect)(() => {
		let e = window.openPromptTemplateModal;
		return window.openPromptTemplateModal = (e) => {
			F(e), fetch("/api/prompt-libraries").then((e) => e.json()).then((e) => L(x(e))).catch(() => L([]));
		}, () => {
			e ? window.openPromptTemplateModal = e : delete window.openPromptTemplateModal;
		};
	}, []);
	let q = async (e) => {
		j("正在打开画布…");
		try {
			let i = await t.acquireLock(e.id, W.current, localStorage.getItem("canvasUserName") || "");
			if (!i.ok) throw Error(`画布正由 ${String(i.holder?.username || "其他用户")} 编辑`);
			let o = await n.get(e.id);
			D(o), j(""), r.recoverDocument(o).then(async (t) => {
				if (JSON.stringify(t) === JSON.stringify(o)) return;
				let r = await n.save(e.id, a(t));
				D((e) => e?.id === r.id ? r : e);
			}).catch((e) => j(`任务恢复失败：${e instanceof Error ? e.message : String(e)}`));
		} catch (e) {
			j(e instanceof Error ? e.message : String(e));
		}
	};
	(0, s.useEffect)(() => {
		let t = String(e.initialCanvasId || "").trim();
		!t || E || G.current || (G.current = !0, q(c.find((e) => e.id === t) ?? {
			id: t,
			kind: i
		}));
	}, [
		c,
		i,
		e.initialCanvasId,
		E
	]);
	let J = async () => {
		E?.id && await t.releaseLock(String(E.id), W.current).catch(() => void 0), D(null), N(null), await K();
	}, Y = async () => {
		try {
			let n = await t.create(O || e.defaultTitle || "", {
				icon: i === "smart" ? "sparkles" : void 0,
				kind: i
			});
			k(""), await K(), await q(n);
		} catch (e) {
			j(e instanceof Error ? e.message : String(e));
		}
	}, X = async (e) => {
		window.confirm("将此画布移入回收站？") && (await t.delete(e), await K());
	}, Z = async () => {
		E?.id && N(await n.listBackups(String(E.id)));
	}, Q = async (e) => {
		E?.id && z({
			mode: e,
			document: await n.get(String(E.id))
		});
	}, re = () => {
		let e = window.CanvasBoardV2?.exportSelection();
		if (!e?.nodes.length) {
			j("没有可导出的节点");
			return;
		}
		let t = new Blob([JSON.stringify({
			version: 2,
			...e
		}, null, 2)], { type: "application/json" }), n = URL.createObjectURL(t);
		Object.assign(document.createElement("a"), {
			download: `${String(E?.title || "canvas")}-workflow.json`,
			href: n
		}).click(), URL.revokeObjectURL(n), B(!1);
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
			let n = S(t), r = window.CanvasBoardV2?.importWorkflow(n) ?? [];
			j(r.length ? `已导入 ${r.length} 个节点` : "文件中没有可导入节点"), B(!1);
		} catch (e) {
			j(e instanceof Error ? e.message : String(e));
		}
	}, ae = async () => {
		try {
			let e = await fetch("/api/asset-library");
			if (!e.ok) throw Error("加载资产库失败");
			H(C(await e.json()));
		} catch (e) {
			j(e instanceof Error ? e.message : String(e));
		}
	}, $ = () => {
		let t = e.assetInboxKey || "", n = h(t);
		if (!n.length) return j("素材收件箱为空或已过期"), 0;
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
		return localStorage.removeItem(t), j(`已从素材库导入 ${i.length} 个素材`), i.length;
	};
	if ((0, s.useEffect)(() => {
		if (!E || !e.assetInboxKey) return;
		let t = (t) => {
			if (!(t.ctrlKey || t.metaKey) || t.key.toLowerCase() !== "v") return;
			let n = t.target;
			n?.isContentEditable || ["INPUT", "TEXTAREA"].includes(n?.tagName || "") || h(e.assetInboxKey || "").length && (t.preventDefault(), $());
		};
		return window.addEventListener("keydown", t, !0), () => window.removeEventListener("keydown", t, !0);
	}, [e.assetInboxKey, E]), !E) {
		let n = T ? d : y === "all" ? c : y === "root" ? c.filter((e) => !e.folder_id) : c.filter((e) => e.folder_id === y);
		return /* @__PURE__ */ (0, g.jsx)("main", {
			className: "canvas-modern-manager",
			children: /* @__PURE__ */ (0, g.jsxs)("section", {
				className: "gate-panel canvas-modern-gate",
				children: [
					/* @__PURE__ */ (0, g.jsxs)("header", {
						className: "gate-head",
						children: [/* @__PURE__ */ (0, g.jsxs)("div", {
							className: "gate-head-text",
							children: [/* @__PURE__ */ (0, g.jsx)("h1", {
								className: "gate-title",
								children: T ? "回收站" : e.heading || "经典画布 V2"
							}), /* @__PURE__ */ (0, g.jsx)("p", {
								className: "gate-subtitle",
								children: e.subtitle || "React + TypeScript 独立文档与执行路径"
							})]
						}), /* @__PURE__ */ (0, g.jsxs)("div", {
							className: "gate-head-actions",
							children: [
								e.managerBackHref ? /* @__PURE__ */ (0, g.jsx)("a", {
									className: "gate-icon-btn",
									href: e.managerBackHref,
									children: "返回首页"
								}) : null,
								T ? null : /* @__PURE__ */ (0, g.jsxs)(g.Fragment, { children: [
									/* @__PURE__ */ (0, g.jsxs)("select", {
										"aria-label": "画布文件夹",
										onChange: (e) => w(e.target.value),
										value: y,
										children: [
											/* @__PURE__ */ (0, g.jsx)("option", {
												value: "all",
												children: "全部画布"
											}),
											/* @__PURE__ */ (0, g.jsx)("option", {
												value: "root",
												children: "未分类"
											}),
											p.map((e) => /* @__PURE__ */ (0, g.jsx)("option", {
												value: e.id,
												children: String(e.name || "未命名文件夹")
											}, e.id))
										]
									}),
									/* @__PURE__ */ (0, g.jsx)("button", {
										className: "gate-icon-btn",
										onClick: async () => {
											let e = window.prompt("文件夹名称")?.trim();
											e && (await t.createFolder(e), await K());
										},
										type: "button",
										children: "新建文件夹"
									}),
									["all", "root"].includes(y) ? null : /* @__PURE__ */ (0, g.jsx)("button", {
										className: "gate-icon-btn",
										onClick: async () => {
											window.confirm("删除此文件夹？文件夹内画布不会被永久删除。") && (await t.deleteFolder(y), w("all"), await K());
										},
										type: "button",
										children: "删除文件夹"
									})
								] }),
								/* @__PURE__ */ (0, g.jsx)("button", {
									className: "gate-icon-btn",
									onClick: () => void K(),
									type: "button",
									children: "刷新"
								}),
								/* @__PURE__ */ (0, g.jsx)("button", {
									className: "gate-icon-btn",
									onClick: () => te((e) => !e),
									type: "button",
									children: T ? "返回画布" : `回收站 ${d.length}`
								})
							]
						})]
					}),
					T ? null : /* @__PURE__ */ (0, g.jsxs)("div", {
						className: "gate-create-row canvas-modern-create",
						children: [/* @__PURE__ */ (0, g.jsx)("input", {
							className: "gate-name-input",
							maxLength: 80,
							onChange: (e) => k(e.target.value),
							onKeyDown: (e) => {
								e.key === "Enter" && Y();
							},
							placeholder: "新画布名称",
							value: O
						}), /* @__PURE__ */ (0, g.jsx)("button", {
							className: "primary-btn",
							onClick: () => void Y(),
							type: "button",
							children: e.createLabel || "新建画布"
						})]
					}),
					A ? /* @__PURE__ */ (0, g.jsx)("div", {
						className: "gate-status",
						children: A
					}) : null,
					/* @__PURE__ */ (0, g.jsx)("div", {
						className: "gate-list canvas-modern-list",
						children: n.map((e) => /* @__PURE__ */ (0, g.jsxs)("article", {
							className: "gate-card",
							"data-canvas-id": e.id,
							children: [/* @__PURE__ */ (0, g.jsxs)("button", {
								className: "canvas-modern-card-main",
								disabled: T,
								onClick: () => void q(e),
								type: "button",
								children: [/* @__PURE__ */ (0, g.jsx)("strong", { children: String(e.title || "未命名画布") }), /* @__PURE__ */ (0, g.jsx)("small", { children: b(e.updated_at) })]
							}), T ? /* @__PURE__ */ (0, g.jsxs)(g.Fragment, { children: [/* @__PURE__ */ (0, g.jsx)("button", {
								onClick: async () => {
									await t.restore(e.id), await K();
								},
								type: "button",
								children: "恢复"
							}), /* @__PURE__ */ (0, g.jsx)("button", {
								onClick: async () => {
									window.confirm("永久删除后无法恢复，确定继续？") && (await t.purge(e.id), await K());
								},
								type: "button",
								children: "永久删除"
							})] }) : /* @__PURE__ */ (0, g.jsxs)(g.Fragment, { children: [/* @__PURE__ */ (0, g.jsxs)("select", {
								"aria-label": `移动 ${String(e.title || "画布")}`,
								onChange: async (n) => {
									await t.moveToFolder(e.id, n.target.value), await K();
								},
								value: String(e.folder_id || ""),
								children: [/* @__PURE__ */ (0, g.jsx)("option", {
									value: "",
									children: "未分类"
								}), p.map((e) => /* @__PURE__ */ (0, g.jsx)("option", {
									value: e.id,
									children: String(e.name || "未命名文件夹")
								}, e.id))]
							}), /* @__PURE__ */ (0, g.jsx)("button", {
								"aria-label": "移入回收站",
								onClick: () => void X(e.id),
								type: "button",
								children: "删除"
							})] })]
						}, e.id))
					})
				]
			})
		});
	}
	return /* @__PURE__ */ (0, g.jsxs)("main", {
		className: "canvas-modern-editor",
		children: [
			/* @__PURE__ */ (0, g.jsxs)("header", {
				className: "topbar canvas-modern-topbar",
				children: [/* @__PURE__ */ (0, g.jsxs)("div", {
					className: "panel canvas-nav",
					children: [/* @__PURE__ */ (0, g.jsx)("button", {
						className: "tool-btn",
						onClick: () => void J(),
						type: "button",
						children: "← 返回"
					}), /* @__PURE__ */ (0, g.jsxs)("div", {
						className: "canvas-nav-meta",
						children: [/* @__PURE__ */ (0, g.jsx)("strong", { children: String(E.title || "未命名画布") }), /* @__PURE__ */ (0, g.jsx)("small", { children: b(E.updated_at) })]
					})]
				}), /* @__PURE__ */ (0, g.jsxs)("div", {
					className: "panel toolbar canvas-modern-toolbar",
					children: [/* @__PURE__ */ (0, g.jsx)("div", {
						className: "toolbar-items",
						children: _.map(([e, t]) => /* @__PURE__ */ (0, g.jsx)("button", {
							className: "tool-btn",
							onClick: () => window.CanvasBoardV2?.addNode(e),
							type: "button",
							children: t
						}, e))
					}), /* @__PURE__ */ (0, g.jsxs)("div", {
						className: "toolbar-fixed",
						children: [
							/* @__PURE__ */ (0, g.jsx)("button", {
								className: "tool-btn",
								onClick: () => window.CanvasBoardV2?.groupSelected(),
								type: "button",
								children: "分组"
							}),
							/* @__PURE__ */ (0, g.jsx)("button", {
								className: "tool-btn",
								onClick: () => B(!0),
								type: "button",
								children: "工作流"
							}),
							/* @__PURE__ */ (0, g.jsx)("button", {
								className: "tool-btn",
								onClick: () => void ae(),
								type: "button",
								children: "资产库"
							}),
							e.assetInboxKey ? /* @__PURE__ */ (0, g.jsx)("button", {
								className: "tool-btn",
								onClick: $,
								type: "button",
								children: "导入素材"
							}) : null,
							/* @__PURE__ */ (0, g.jsx)("button", {
								className: "tool-btn",
								onClick: () => void Q("cost"),
								type: "button",
								children: "费用"
							}),
							/* @__PURE__ */ (0, g.jsx)("button", {
								className: "tool-btn",
								onClick: () => void Q("logs"),
								type: "button",
								children: "日志"
							}),
							/* @__PURE__ */ (0, g.jsx)("button", {
								className: "tool-btn",
								onClick: () => void Z(),
								type: "button",
								children: "备份"
							})
						]
					})]
				})]
			}),
			/* @__PURE__ */ (0, g.jsx)("div", {
				className: "canvas-modern-board",
				ref: U
			}),
			M ? /* @__PURE__ */ (0, g.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, g.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, g.jsxs)("header", { children: [/* @__PURE__ */ (0, g.jsx)("strong", { children: "画布备份" }), /* @__PURE__ */ (0, g.jsx)("button", {
							onClick: () => N(null),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, g.jsx)("button", {
							onClick: async () => {
								await n.createBackup(String(E.id)), await Z();
							},
							type: "button",
							children: "立即备份"
						}),
						M.map((e) => /* @__PURE__ */ (0, g.jsxs)("div", {
							className: "backup-item",
							children: [
								/* @__PURE__ */ (0, g.jsx)("span", { children: String(e.filename) }),
								/* @__PURE__ */ (0, g.jsx)("button", {
									onClick: async () => {
										let t = await n.restoreBackup(String(E.id), String(e.filename));
										D(t), N(null);
									},
									type: "button",
									children: "恢复"
								}),
								/* @__PURE__ */ (0, g.jsx)("button", {
									onClick: async () => {
										await t.deleteBackup(String(E.id), String(e.filename)), await Z();
									},
									type: "button",
									children: "删除"
								})
							]
						}, String(e.filename)))
					]
				})
			}) : null,
			P ? /* @__PURE__ */ (0, g.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, g.jsxs)("section", {
					className: "modal-panel",
					children: [/* @__PURE__ */ (0, g.jsxs)("header", { children: [/* @__PURE__ */ (0, g.jsx)("strong", { children: "提示词模板" }), /* @__PURE__ */ (0, g.jsx)("button", {
						onClick: () => F(""),
						type: "button",
						children: "关闭"
					})] }), I.length ? I.map((e) => /* @__PURE__ */ (0, g.jsxs)("button", {
						onClick: () => {
							window.CanvasBoardV2?.updateNode(P, { text: e.text }), F("");
						},
						type: "button",
						children: [/* @__PURE__ */ (0, g.jsx)("strong", { children: e.name }), /* @__PURE__ */ (0, g.jsx)("small", { children: e.text.slice(0, 100) })]
					}, e.id)) : /* @__PURE__ */ (0, g.jsx)("p", { children: "暂无模板" })]
				})
			}) : null,
			ne ? /* @__PURE__ */ (0, g.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, g.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, g.jsxs)("header", { children: [/* @__PURE__ */ (0, g.jsx)("strong", { children: "工作流导入 / 导出" }), /* @__PURE__ */ (0, g.jsx)("button", {
							onClick: () => B(!1),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, g.jsx)("p", { children: "有选中节点时仅导出选区；未选中时导出整张画布。" }),
						/* @__PURE__ */ (0, g.jsx)("button", {
							onClick: re,
							type: "button",
							children: "导出 JSON"
						}),
						/* @__PURE__ */ (0, g.jsxs)("label", {
							className: "primary-btn",
							children: ["导入 JSON / ZIP", /* @__PURE__ */ (0, g.jsx)("input", {
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
			V ? /* @__PURE__ */ (0, g.jsx)("div", {
				className: "modal open canvas-modern-backups canvas-modern-assets",
				children: /* @__PURE__ */ (0, g.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, g.jsxs)("header", { children: [/* @__PURE__ */ (0, g.jsx)("strong", { children: "资产库" }), /* @__PURE__ */ (0, g.jsx)("button", {
							onClick: () => H(null),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, g.jsx)("div", {
							className: "canvas-modern-asset-grid",
							children: V.map((e) => /* @__PURE__ */ (0, g.jsxs)("button", {
								onClick: () => {
									let t = window.CanvasBoardV2?.addNode("image");
									t && window.CanvasBoardV2?.updateNode(t, {
										mediaKind: e.kind,
										name: e.name,
										url: e.url
									}), H(null);
								},
								type: "button",
								children: [e.kind === "image" ? /* @__PURE__ */ (0, g.jsx)("img", {
									alt: e.name,
									src: e.url
								}) : /* @__PURE__ */ (0, g.jsx)("span", { children: e.kind === "video" ? "视频" : e.kind === "audio" ? "音频" : "文件" }), /* @__PURE__ */ (0, g.jsx)("small", { children: e.name })]
							}, e.id))
						}),
						V.length ? null : /* @__PURE__ */ (0, g.jsx)("p", { children: "资产库暂无可用媒体。" })
					]
				})
			}) : null,
			R ? /* @__PURE__ */ (0, g.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, g.jsxs)("section", {
					className: "modal-panel",
					children: [/* @__PURE__ */ (0, g.jsxs)("header", { children: [/* @__PURE__ */ (0, g.jsx)("strong", { children: R.mode === "logs" ? "生成日志" : "费用汇总" }), /* @__PURE__ */ (0, g.jsx)("button", {
						onClick: () => z(null),
						type: "button",
						children: "关闭"
					})] }), R.mode === "logs" ? /* @__PURE__ */ (0, g.jsx)(g.Fragment, { children: (Array.isArray(R.document.logs) ? R.document.logs : []).slice().reverse().map((e, t) => /* @__PURE__ */ (0, g.jsx)("pre", { children: JSON.stringify(e, null, 2) }, String(e.id || t))) }) : /* @__PURE__ */ (0, g.jsxs)(g.Fragment, { children: [/* @__PURE__ */ (0, g.jsxs)("h2", { children: ["¥ ", m(R.document).toFixed(4)] }), /* @__PURE__ */ (0, g.jsx)("p", { children: "仅汇总任务记录中已返回的费用字段；供应商未返回价格时显示为 0。" })] })]
				})
			}) : null
		]
	});
}
function y(e, t) {
	let n = (0, c.createRoot)(e);
	return n.render(/* @__PURE__ */ (0, g.jsx)(v, { ...t })), () => n.unmount();
}
function ee() {
	let e = sessionStorage.getItem("canvasClientId");
	if (e) return e;
	let t = `canvas_${crypto.randomUUID?.() || Date.now()}`;
	return sessionStorage.setItem("canvasClientId", t), t;
}
function b(e) {
	let t = Number(e || 0);
	return t ? new Date(t < 1e10 ? t * 1e3 : t).toLocaleString() : "--";
}
function x(e) {
	let t = [], n = (e) => {
		if (Array.isArray(e)) {
			e.forEach(n);
			return;
		}
		if (!e || typeof e != "object") return;
		let r = e, i = String(r.text || r.prompt || r.content || "");
		i && t.push({
			id: String(r.id || `${t.length}`),
			name: String(r.name || r.title || "模板"),
			text: i
		}), Object.values(r).forEach((e) => {
			e !== r.text && e !== r.prompt && e !== r.content && n(e);
		});
	};
	return n(e), t;
}
function S(e) {
	let t = e && typeof e == "object" ? e : {}, n = t.workflow && typeof t.workflow == "object" ? t.workflow : t;
	return {
		connections: Array.isArray(n.connections) ? n.connections : [],
		nodes: Array.isArray(n.nodes) ? n.nodes : []
	};
}
function C(e) {
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
export { y as mountCanvasAppV2 };
