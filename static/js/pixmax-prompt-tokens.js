/* Native hash chips persist their payload, but suppliers receive plain prompt text. */
(() => {
    'use strict';
    const pattern=/%%#\[([a-zA-Z0-9_-]+)\]\[([A-Za-z0-9+/=]*)\]\(([A-Za-z0-9+/=]*)\)%%/g;
    const subjects=/%%subject-ref\(([^)]*)\)%%/g;
    const subjectName=body=>{const [id,second,third]=body.split('|');return (second==='PERSONAL'||second==='TEAM'?third:second)||id||'主体';};
    function decode(value){return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value),character=>character.charCodeAt(0)));}
    function read(match){
        try{
            const type=match[1],payload=JSON.parse(decode(match[2])),body=decode(match[3]);
            if(!payload||Array.isArray(payload)||typeof payload!=='object'||!body.trim())throw new Error();
            if(type==='camera'){
                const keys={c:'camera',l:'lens',f:'focalLength',a:'aperture'};
                if(!payload.indices||Object.entries(keys).some(([key,name])=>!Number.isInteger(payload.indices[key])||payload.indices[key]<0||payload.indices[key]>=PixmaxPromptCatalog[name].length))throw new Error();
                if(payload.chipIndex!==undefined&&(!Number.isSafeInteger(payload.chipIndex)||payload.chipIndex<0))throw new Error();
                return {type,payload,body,label:'镜头参数'+(payload.chipIndex||'')};
            }
            if(type==='camerawork'&&payload.v===1&&typeof payload.u==='string'&&payload.u.trim()&&typeof payload.n==='string'&&payload.n.trim())return {type,payload,body,label:payload.n};
            throw new Error();
        }catch{throw new Error('提示词镜头标记无效或暂不支持，请重新选择或移除标记');}
    }
    function compile(value){
        const result=String(value||'').replace(pattern,(...parts)=>read(parts).body);
        if(/%%#\[/.test(result))throw new Error('提示词镜头标记不完整，请重新选择或移除标记');
        if(/%%subject-ref\(/.test(result))throw new Error('主体引用尚未解析，请重新选择主体素材');
        return result;
    }
    function html(value){
        let output='',position=0;
        for(const match of [...String(value).matchAll(pattern),...String(value).matchAll(subjects)].sort((a,b)=>a.index-b.index)){
            output+=escapeHtml(value.slice(position,match.index)).replaceAll('\n','<br>');position=match.index+match[0].length;
            let label;try{label=match[0].startsWith('%%subject-ref(')?subjectName(match[1]):read(match).label;}catch{label='失效镜头标记';}
            output+=`<span class="pixmax-prompt-hash-token" contenteditable="false" data-pixmax-prompt-token="${escapeAttr(match[0])}">${escapeHtml(label)}</span>`;
        }
        return output+escapeHtml(value.slice(position)).replaceAll('\n','<br>');
    }
    function text(value){return value.replace(pattern,(...parts)=>{try{return read(parts).label;}catch{return '失效镜头标记';}}).replace(subjects,(_raw,body)=>subjectName(body));}
    window.PixmaxPromptTokens=Object.freeze({compile,html,text,read});
})();
