// Retain styles for existing service dialogs and parameter controls, excluding
// the retired canvas surface. The new canvas does not load smart-canvas.css.
const fs=require('node:fs'),path=require('node:path'),postcss=require('postcss');
const root=path.resolve(__dirname,'..');
const css=postcss.parse(fs.readFileSync(path.join(root,'static/css/smart-canvas.css'),'utf8'));
const retired=/(?:^|[\s.#:,>(])(?:shell|world|image-node|node-(?:body|head|hint|port|img|resize-handle|drop|title)|generation-node[^\s.:>]*|image-wrap|thumb-(?:grid|item)|prompt-smart-node|prompt-node[^\s.:>]*|smart-nav[^\s.:>]*|smart-(?:minimap[^\s.:>]*|top-tools)|minimap[^\s.:>]*|create-(?:menu[^\s.:>]*|card[^\s.:>]*)|connection-layer|composer(?:-card|-head|-head-left|-heading|-head-hint)?)(?=[\s.#:,>[+~]|$)/;
css.walkRules(rule=>{
    if(rule.selector.includes(':root')||rule.selector==='.theme-dark'||/^(?:\*|body|button,input,select,textarea)$/.test(rule.selector)){rule.remove();return;}
    const selectors=rule.selectors.filter(selector=>!retired.test(selector));
    if(!selectors.length)rule.remove();else rule.selectors=selectors;
});
css.walkAtRules(rule=>{if(rule.name==='import'&&rule.params.includes('fonts.css'))rule.remove();if(rule.nodes&&!rule.nodes.length)rule.remove();});
css.walkComments(comment=>comment.remove());
fs.writeFileSync(path.join(root,'static/css/smart-canvas-services.css'),'/* Service dialogs and business controls. Canvas surface lives in pixmax-canvas.css. */\n'+css.toString());
