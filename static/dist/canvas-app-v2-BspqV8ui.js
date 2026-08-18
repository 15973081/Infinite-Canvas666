import { c as e, o as t, s as n, t as r } from "./jsx-runtime-D6NhhM0V.js";
import { n as i } from "./http-F-lX8WKW.js";
import { r as a } from "./document-merge-cCXbjNpR.js";
import { t as o } from "./canvas-board-v2-RdQx7OrS.js";
//#region src/canvas/infrastructure/canvas-management.ts
var s = /* @__PURE__ */ e(n(), 1), c = t();
function l(e = fetch) {
	return {
		acquireLock: (t, n, r = "") => f(e, `/api/canvases/${encodeURIComponent(t)}/lock`, "POST", {
			client_id: n,
			username: r
		}),
		create: async (t = "") => {
			let n = await f(e, "/api/canvases", "POST", { title: t.trim() || void 0 });
			return d(n).canvas ? d(d(n).canvas) : d(n);
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
//#region src/canvas/ui/canvas-app-v2.tsx
var m = r(), h = [
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
function g({ management: e = l(), repository: t, runtime: n }) {
	let [r, i] = (0, s.useState)([]), [c, u] = (0, s.useState)([]), [d, f] = (0, s.useState)([]), [p, g] = (0, s.useState)("all"), [_, w] = (0, s.useState)(!1), [T, E] = (0, s.useState)(null), [D, O] = (0, s.useState)(""), [k, A] = (0, s.useState)("正在加载画布列表…"), [j, M] = (0, s.useState)(null), [N, P] = (0, s.useState)(""), [F, I] = (0, s.useState)([]), [L, R] = (0, s.useState)(null), [z, B] = (0, s.useState)(!1), [V, H] = (0, s.useState)(null), U = (0, s.useRef)(null), W = (0, s.useRef)(v()), G = (0, s.useCallback)(async () => {
		A("正在加载画布列表…");
		try {
			let [t, n, r] = await Promise.all([
				e.list(),
				e.listTrash(),
				e.listFolders()
			]);
			i(t.sort((e, t) => Number(t.updated_at || 0) - Number(e.updated_at || 0))), u(n), f(r), A(t.length ? "" : "还没有画布，新建一个开始创作。");
		} catch (e) {
			A(e instanceof Error ? e.message : String(e));
		}
	}, [e]);
	(0, s.useEffect)(() => {
		G();
	}, [G]), (0, s.useEffect)(() => {
		let e = U.current;
		if (!(!e || !T)) return o(e, null, {
			initialDocument: T,
			repository: t,
			runtime: n
		});
	}, [
		T,
		t,
		n
	]), (0, s.useEffect)(() => {
		let t = () => {
			T?.id && e.releaseLock(String(T.id), W.current, !0);
		};
		return window.addEventListener("pagehide", t, { once: !0 }), () => window.removeEventListener("pagehide", t);
	}, [T?.id, e]), (0, s.useEffect)(() => {
		let e = window.openPromptTemplateModal;
		return window.openPromptTemplateModal = (e) => {
			P(e), fetch("/api/prompt-libraries").then((e) => e.json()).then((e) => I(b(e))).catch(() => I([]));
		}, () => {
			e ? window.openPromptTemplateModal = e : delete window.openPromptTemplateModal;
		};
	}, []);
	let K = async (r) => {
		A("正在打开画布…");
		try {
			let i = await e.acquireLock(r.id, W.current, localStorage.getItem("canvasUserName") || "");
			if (!i.ok) throw Error(`画布正由 ${String(i.holder?.username || "其他用户")} 编辑`);
			let o = await t.get(r.id);
			E(o), A(""), n.recoverDocument(o).then(async (e) => {
				if (JSON.stringify(e) === JSON.stringify(o)) return;
				let n = await t.save(r.id, a(e));
				E((e) => e?.id === n.id ? n : e);
			}).catch((e) => A(`任务恢复失败：${e instanceof Error ? e.message : String(e)}`));
		} catch (e) {
			A(e instanceof Error ? e.message : String(e));
		}
	}, q = async () => {
		T?.id && await e.releaseLock(String(T.id), W.current).catch(() => void 0), E(null), M(null), await G();
	}, J = async () => {
		try {
			let t = await e.create(D);
			O(""), await G(), await K(t);
		} catch (e) {
			A(e instanceof Error ? e.message : String(e));
		}
	}, Y = async (t) => {
		window.confirm("将此画布移入回收站？") && (await e.delete(t), await G());
	}, X = async () => {
		T?.id && M(await t.listBackups(String(T.id)));
	}, Z = async (e) => {
		T?.id && R({
			mode: e,
			document: await t.get(String(T.id))
		});
	}, Q = () => {
		let e = window.CanvasBoardV2?.exportSelection();
		if (!e?.nodes.length) {
			A("没有可导出的节点");
			return;
		}
		let t = new Blob([JSON.stringify({
			version: 2,
			...e
		}, null, 2)], { type: "application/json" }), n = URL.createObjectURL(t);
		Object.assign(document.createElement("a"), {
			download: `${String(T?.title || "canvas")}-workflow.json`,
			href: n
		}).click(), URL.revokeObjectURL(n), B(!1);
	}, $ = async (e) => {
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
			A(r.length ? `已导入 ${r.length} 个节点` : "文件中没有可导入节点"), B(!1);
		} catch (e) {
			A(e instanceof Error ? e.message : String(e));
		}
	}, ee = async () => {
		try {
			let e = await fetch("/api/asset-library");
			if (!e.ok) throw Error("加载资产库失败");
			H(C(await e.json()));
		} catch (e) {
			A(e instanceof Error ? e.message : String(e));
		}
	};
	if (!T) {
		let t = _ ? c : p === "all" ? r : p === "root" ? r.filter((e) => !e.folder_id) : r.filter((e) => e.folder_id === p);
		return /* @__PURE__ */ (0, m.jsx)("main", {
			className: "canvas-modern-manager",
			children: /* @__PURE__ */ (0, m.jsxs)("section", {
				className: "gate-panel canvas-modern-gate",
				children: [
					/* @__PURE__ */ (0, m.jsxs)("header", {
						className: "gate-head",
						children: [/* @__PURE__ */ (0, m.jsxs)("div", {
							className: "gate-head-text",
							children: [/* @__PURE__ */ (0, m.jsx)("h1", {
								className: "gate-title",
								children: _ ? "回收站" : "经典画布 V2"
							}), /* @__PURE__ */ (0, m.jsx)("p", {
								className: "gate-subtitle",
								children: "React + TypeScript 独立文档与执行路径"
							})]
						}), /* @__PURE__ */ (0, m.jsxs)("div", {
							className: "gate-head-actions",
							children: [
								_ ? null : /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [
									/* @__PURE__ */ (0, m.jsxs)("select", {
										"aria-label": "画布文件夹",
										onChange: (e) => g(e.target.value),
										value: p,
										children: [
											/* @__PURE__ */ (0, m.jsx)("option", {
												value: "all",
												children: "全部画布"
											}),
											/* @__PURE__ */ (0, m.jsx)("option", {
												value: "root",
												children: "未分类"
											}),
											d.map((e) => /* @__PURE__ */ (0, m.jsx)("option", {
												value: e.id,
												children: String(e.name || "未命名文件夹")
											}, e.id))
										]
									}),
									/* @__PURE__ */ (0, m.jsx)("button", {
										className: "gate-icon-btn",
										onClick: async () => {
											let t = window.prompt("文件夹名称")?.trim();
											t && (await e.createFolder(t), await G());
										},
										type: "button",
										children: "新建文件夹"
									}),
									["all", "root"].includes(p) ? null : /* @__PURE__ */ (0, m.jsx)("button", {
										className: "gate-icon-btn",
										onClick: async () => {
											window.confirm("删除此文件夹？文件夹内画布不会被永久删除。") && (await e.deleteFolder(p), g("all"), await G());
										},
										type: "button",
										children: "删除文件夹"
									})
								] }),
								/* @__PURE__ */ (0, m.jsx)("button", {
									className: "gate-icon-btn",
									onClick: () => void G(),
									type: "button",
									children: "刷新"
								}),
								/* @__PURE__ */ (0, m.jsx)("button", {
									className: "gate-icon-btn",
									onClick: () => w((e) => !e),
									type: "button",
									children: _ ? "返回画布" : `回收站 ${c.length}`
								})
							]
						})]
					}),
					_ ? null : /* @__PURE__ */ (0, m.jsxs)("div", {
						className: "gate-create-row canvas-modern-create",
						children: [/* @__PURE__ */ (0, m.jsx)("input", {
							className: "gate-name-input",
							maxLength: 80,
							onChange: (e) => O(e.target.value),
							onKeyDown: (e) => {
								e.key === "Enter" && J();
							},
							placeholder: "新画布名称",
							value: D
						}), /* @__PURE__ */ (0, m.jsx)("button", {
							className: "primary-btn",
							onClick: () => void J(),
							type: "button",
							children: "新建画布"
						})]
					}),
					k ? /* @__PURE__ */ (0, m.jsx)("div", {
						className: "gate-status",
						children: k
					}) : null,
					/* @__PURE__ */ (0, m.jsx)("div", {
						className: "gate-list canvas-modern-list",
						children: t.map((t) => /* @__PURE__ */ (0, m.jsxs)("article", {
							className: "gate-card",
							"data-canvas-id": t.id,
							children: [/* @__PURE__ */ (0, m.jsxs)("button", {
								className: "canvas-modern-card-main",
								disabled: _,
								onClick: () => void K(t),
								type: "button",
								children: [/* @__PURE__ */ (0, m.jsx)("strong", { children: String(t.title || "未命名画布") }), /* @__PURE__ */ (0, m.jsx)("small", { children: y(t.updated_at) })]
							}), _ ? /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [/* @__PURE__ */ (0, m.jsx)("button", {
								onClick: async () => {
									await e.restore(t.id), await G();
								},
								type: "button",
								children: "恢复"
							}), /* @__PURE__ */ (0, m.jsx)("button", {
								onClick: async () => {
									window.confirm("永久删除后无法恢复，确定继续？") && (await e.purge(t.id), await G());
								},
								type: "button",
								children: "永久删除"
							})] }) : /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [/* @__PURE__ */ (0, m.jsxs)("select", {
								"aria-label": `移动 ${String(t.title || "画布")}`,
								onChange: async (n) => {
									await e.moveToFolder(t.id, n.target.value), await G();
								},
								value: String(t.folder_id || ""),
								children: [/* @__PURE__ */ (0, m.jsx)("option", {
									value: "",
									children: "未分类"
								}), d.map((e) => /* @__PURE__ */ (0, m.jsx)("option", {
									value: e.id,
									children: String(e.name || "未命名文件夹")
								}, e.id))]
							}), /* @__PURE__ */ (0, m.jsx)("button", {
								"aria-label": "移入回收站",
								onClick: () => void Y(t.id),
								type: "button",
								children: "删除"
							})] })]
						}, t.id))
					})
				]
			})
		});
	}
	return /* @__PURE__ */ (0, m.jsxs)("main", {
		className: "canvas-modern-editor",
		children: [
			/* @__PURE__ */ (0, m.jsxs)("header", {
				className: "topbar canvas-modern-topbar",
				children: [/* @__PURE__ */ (0, m.jsxs)("div", {
					className: "panel canvas-nav",
					children: [/* @__PURE__ */ (0, m.jsx)("button", {
						className: "tool-btn",
						onClick: () => void q(),
						type: "button",
						children: "← 返回"
					}), /* @__PURE__ */ (0, m.jsxs)("div", {
						className: "canvas-nav-meta",
						children: [/* @__PURE__ */ (0, m.jsx)("strong", { children: String(T.title || "未命名画布") }), /* @__PURE__ */ (0, m.jsx)("small", { children: y(T.updated_at) })]
					})]
				}), /* @__PURE__ */ (0, m.jsxs)("div", {
					className: "panel toolbar canvas-modern-toolbar",
					children: [/* @__PURE__ */ (0, m.jsx)("div", {
						className: "toolbar-items",
						children: h.map(([e, t]) => /* @__PURE__ */ (0, m.jsx)("button", {
							className: "tool-btn",
							onClick: () => window.CanvasBoardV2?.addNode(e),
							type: "button",
							children: t
						}, e))
					}), /* @__PURE__ */ (0, m.jsxs)("div", {
						className: "toolbar-fixed",
						children: [
							/* @__PURE__ */ (0, m.jsx)("button", {
								className: "tool-btn",
								onClick: () => window.CanvasBoardV2?.groupSelected(),
								type: "button",
								children: "分组"
							}),
							/* @__PURE__ */ (0, m.jsx)("button", {
								className: "tool-btn",
								onClick: () => B(!0),
								type: "button",
								children: "工作流"
							}),
							/* @__PURE__ */ (0, m.jsx)("button", {
								className: "tool-btn",
								onClick: () => void ee(),
								type: "button",
								children: "资产库"
							}),
							/* @__PURE__ */ (0, m.jsx)("button", {
								className: "tool-btn",
								onClick: () => void Z("cost"),
								type: "button",
								children: "费用"
							}),
							/* @__PURE__ */ (0, m.jsx)("button", {
								className: "tool-btn",
								onClick: () => void Z("logs"),
								type: "button",
								children: "日志"
							}),
							/* @__PURE__ */ (0, m.jsx)("button", {
								className: "tool-btn",
								onClick: () => void X(),
								type: "button",
								children: "备份"
							})
						]
					})]
				})]
			}),
			/* @__PURE__ */ (0, m.jsx)("div", {
				className: "canvas-modern-board",
				ref: U
			}),
			j ? /* @__PURE__ */ (0, m.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, m.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, m.jsxs)("header", { children: [/* @__PURE__ */ (0, m.jsx)("strong", { children: "画布备份" }), /* @__PURE__ */ (0, m.jsx)("button", {
							onClick: () => M(null),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, m.jsx)("button", {
							onClick: async () => {
								await t.createBackup(String(T.id)), await X();
							},
							type: "button",
							children: "立即备份"
						}),
						j.map((n) => /* @__PURE__ */ (0, m.jsxs)("div", {
							className: "backup-item",
							children: [
								/* @__PURE__ */ (0, m.jsx)("span", { children: String(n.filename) }),
								/* @__PURE__ */ (0, m.jsx)("button", {
									onClick: async () => {
										let e = await t.restoreBackup(String(T.id), String(n.filename));
										E(e), M(null);
									},
									type: "button",
									children: "恢复"
								}),
								/* @__PURE__ */ (0, m.jsx)("button", {
									onClick: async () => {
										await e.deleteBackup(String(T.id), String(n.filename)), await X();
									},
									type: "button",
									children: "删除"
								})
							]
						}, String(n.filename)))
					]
				})
			}) : null,
			N ? /* @__PURE__ */ (0, m.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, m.jsxs)("section", {
					className: "modal-panel",
					children: [/* @__PURE__ */ (0, m.jsxs)("header", { children: [/* @__PURE__ */ (0, m.jsx)("strong", { children: "提示词模板" }), /* @__PURE__ */ (0, m.jsx)("button", {
						onClick: () => P(""),
						type: "button",
						children: "关闭"
					})] }), F.length ? F.map((e) => /* @__PURE__ */ (0, m.jsxs)("button", {
						onClick: () => {
							window.CanvasBoardV2?.updateNode(N, { text: e.text }), P("");
						},
						type: "button",
						children: [/* @__PURE__ */ (0, m.jsx)("strong", { children: e.name }), /* @__PURE__ */ (0, m.jsx)("small", { children: e.text.slice(0, 100) })]
					}, e.id)) : /* @__PURE__ */ (0, m.jsx)("p", { children: "暂无模板" })]
				})
			}) : null,
			z ? /* @__PURE__ */ (0, m.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, m.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, m.jsxs)("header", { children: [/* @__PURE__ */ (0, m.jsx)("strong", { children: "工作流导入 / 导出" }), /* @__PURE__ */ (0, m.jsx)("button", {
							onClick: () => B(!1),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, m.jsx)("p", { children: "有选中节点时仅导出选区；未选中时导出整张画布。" }),
						/* @__PURE__ */ (0, m.jsx)("button", {
							onClick: Q,
							type: "button",
							children: "导出 JSON"
						}),
						/* @__PURE__ */ (0, m.jsxs)("label", {
							className: "primary-btn",
							children: ["导入 JSON / ZIP", /* @__PURE__ */ (0, m.jsx)("input", {
								accept: ".json,.zip,application/json,application/zip",
								hidden: !0,
								onChange: (e) => {
									let t = e.target.files?.[0];
									t && $(t);
								},
								type: "file"
							})]
						})
					]
				})
			}) : null,
			V ? /* @__PURE__ */ (0, m.jsx)("div", {
				className: "modal open canvas-modern-backups canvas-modern-assets",
				children: /* @__PURE__ */ (0, m.jsxs)("section", {
					className: "modal-panel",
					children: [
						/* @__PURE__ */ (0, m.jsxs)("header", { children: [/* @__PURE__ */ (0, m.jsx)("strong", { children: "资产库" }), /* @__PURE__ */ (0, m.jsx)("button", {
							onClick: () => H(null),
							type: "button",
							children: "关闭"
						})] }),
						/* @__PURE__ */ (0, m.jsx)("div", {
							className: "canvas-modern-asset-grid",
							children: V.map((e) => /* @__PURE__ */ (0, m.jsxs)("button", {
								onClick: () => {
									let t = window.CanvasBoardV2?.addNode("image");
									t && window.CanvasBoardV2?.updateNode(t, {
										mediaKind: e.kind,
										name: e.name,
										url: e.url
									}), H(null);
								},
								type: "button",
								children: [e.kind === "image" ? /* @__PURE__ */ (0, m.jsx)("img", {
									alt: e.name,
									src: e.url
								}) : /* @__PURE__ */ (0, m.jsx)("span", { children: e.kind === "video" ? "视频" : e.kind === "audio" ? "音频" : "文件" }), /* @__PURE__ */ (0, m.jsx)("small", { children: e.name })]
							}, e.id))
						}),
						V.length ? null : /* @__PURE__ */ (0, m.jsx)("p", { children: "资产库暂无可用媒体。" })
					]
				})
			}) : null,
			L ? /* @__PURE__ */ (0, m.jsx)("div", {
				className: "modal open canvas-modern-backups",
				children: /* @__PURE__ */ (0, m.jsxs)("section", {
					className: "modal-panel",
					children: [/* @__PURE__ */ (0, m.jsxs)("header", { children: [/* @__PURE__ */ (0, m.jsx)("strong", { children: L.mode === "logs" ? "生成日志" : "费用汇总" }), /* @__PURE__ */ (0, m.jsx)("button", {
						onClick: () => R(null),
						type: "button",
						children: "关闭"
					})] }), L.mode === "logs" ? /* @__PURE__ */ (0, m.jsx)(m.Fragment, { children: (Array.isArray(L.document.logs) ? L.document.logs : []).slice().reverse().map((e, t) => /* @__PURE__ */ (0, m.jsx)("pre", { children: JSON.stringify(e, null, 2) }, String(e.id || t))) }) : /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [/* @__PURE__ */ (0, m.jsxs)("h2", { children: ["¥ ", x(L.document).toFixed(4)] }), /* @__PURE__ */ (0, m.jsx)("p", { children: "仅汇总任务记录中已返回的费用字段；供应商未返回价格时显示为 0。" })] })]
				})
			}) : null
		]
	});
}
function _(e, t) {
	let n = (0, c.createRoot)(e);
	return n.render(/* @__PURE__ */ (0, m.jsx)(g, { ...t })), () => n.unmount();
}
function v() {
	let e = sessionStorage.getItem("canvasClientId");
	if (e) return e;
	let t = `canvas_${crypto.randomUUID?.() || Date.now()}`;
	return sessionStorage.setItem("canvasClientId", t), t;
}
function y(e) {
	let t = Number(e || 0);
	return t ? new Date(t < 1e10 ? t * 1e3 : t).toLocaleString() : "--";
}
function b(e) {
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
function x(e) {
	return (Array.isArray(e.logs) ? e.logs : []).reduce((e, t) => {
		let n = t && typeof t == "object" ? t : {};
		return e + Math.max(0, Number(n.cost || n.cost_cny || 0));
	}, 0);
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
export { _ as mountCanvasAppV2 };
