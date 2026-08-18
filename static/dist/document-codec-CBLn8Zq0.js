//#region src/canvas/domain/document-codec.ts
function e(e, t) {
	if (!e || typeof e != "object" || Array.isArray(e)) throw TypeError(`${t} must be an object`);
	return e;
}
function t(t, n) {
	let r = e(t, `nodes[${n}]`);
	if (typeof r.id != "string" || !r.id) throw TypeError(`nodes[${n}].id must be a non-empty string`);
	if (typeof r.type != "string" || !r.type) throw TypeError(`nodes[${n}].type must be a non-empty string`);
	return r;
}
function n(t, n) {
	let r = e(t, `connections[${n}]`);
	if (typeof r.from != "string" || !r.from) throw TypeError(`connections[${n}].from must be a non-empty string`);
	if (typeof r.to != "string" || !r.to) throw TypeError(`connections[${n}].to must be a non-empty string`);
	return r;
}
function r(e) {
	return JSON.parse(JSON.stringify(e));
}
function i(i) {
	let a = r(e(i, "document")), o = a.nodes ?? [], s = a.connections ?? [];
	if (!Array.isArray(o)) throw TypeError("document.nodes must be an array");
	if (!Array.isArray(s)) throw TypeError("document.connections must be an array");
	let c = Number(a.schemaVersion ?? 1);
	if (!Number.isInteger(c) || c < 1) throw TypeError("document.schemaVersion must be a positive integer");
	return {
		...a,
		schemaVersion: c,
		nodes: o.map(t),
		connections: s.map(n)
	};
}
//#endregion
export { i as t };
