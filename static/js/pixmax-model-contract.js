/* Public reference contracts. Provider identities and transport stay host-owned. */
(() => {
    'use strict';
    const normalize=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    const nodeType=kind=>'GENERATE_'+String(kind).toUpperCase();
    function resolve(definitions,kind,model){
        const available=definitions.filter(item=>item.nodeType===nodeType(kind)),name=normalize(model);
        const exact=available.find(item=>normalize(item.modelCode)===name||normalize(item.modelName)===name);
        if(exact)return exact;
        // Only explicit family spellings and dated API identifiers. A partial
        // match must never turn Draft/Fast/Mini into the full model contract.
        const value=String(model||'').toLowerCase().replace(/[_.]/g,'-');
        let code;
        const seedance=value.match(/^(?:doubao-)?seedance-(2-5|2-0|1-5)(?:-(pro|draft|fast|mini))?(?:-(\d{6,8}))?$/);
        if(seedance){
            const version=seedance[1],variant=seedance[2];
            if(version==='2-5'&&(!variant||variant==='pro'||variant==='draft'))code='PIXDANCE_2_5'+(variant==='draft'?'_DRAFT':'');
            if(version==='2-0'&&(!variant||['pro','fast','mini'].includes(variant)))code='PIXDANCE_2'+(['fast','mini'].includes(variant)?'_'+variant.toUpperCase():'');
            if(version==='1-5'&&(!variant||variant==='pro'))code='SEEDANCE_1_5';
        }
        const seedream=value.match(/^(?:doubao-)?seedream-(4-5|5-0|5)(?:-(pro|lite))?(?:-\d{6,8})?$/);
        if(seedream){
            if(seedream[1]==='4-5'&&seedream[2]!=='lite')code='DOUBAO_SEEDREAM_4_5';
            if(seedream[1]!=='4-5')code=seedream[2]==='lite'?'JIMENG_5_LITE':'DOUBAO_SEEDREAM_5_PRO';
        }
        return available.find(item=>item.modelCode===code);
    }
    function bounds(length){
        const match=String(length||'').match(/^\[\s*(\d+)\s*,\s*(\d+)\s*\]$/);
        if(!match)return null;
        const min=Number(match[1]),max=Number(match[2]);return min<=max?{min,max}:null;
    }
    function connections(model){
        return (model?.inputConstraints||[]).flatMap(rule=>{const range=bounds(rule.length);return range?[{source:rule.codes,...range}]:[];});
    }
    const type=entry=>entry.sourceType||({image:'BASE_IMAGE',video:'BASE_VIDEO',audio:'BASE_AUDIO',text:'BASE_TEXT'})[entry.kind];
    const labels={image:'图片',video:'视频',audio:'音频',text:'文本'};
    function inputIssues(model,resources){
        const issues=[];
        for(const rule of connections(model)){
            const matching=resources.filter(entry=>rule.source.includes(type(entry))),actual=matching.length;
            if(actual>=rule.min&&actual<=rule.max)continue;
            const kinds=[...new Set(rule.source.map(code=>code==='GENERATE_STORYBOARD'?'image':code.replace(/^(BASE|GENERATE)_/,'').toLowerCase()))];
            const label=kinds.map(kind=>labels[kind]||kind).join('、');
            const support=rule.max===0?'请移除这些参考素材':rule.min===rule.max?'需要 '+rule.min+' 份参考素材':'允许 '+rule.min+'–'+rule.max+' 份参考素材';
            issues.push({errMsg:model.modelName+' 的'+label+'参考数量为 '+actual+'，不符合模型要求',support,sourceIds:matching.map(entry=>entry.id),expected:{min:rule.min,max:rule.max},actual});
        }
        return issues;
    }
    window.PixmaxModelContract=Object.freeze({resolve,bounds,connections,inputIssues});
})();
