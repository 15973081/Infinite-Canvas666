/* Native referModel choices compile to actual image roles and existing video tasks. */
(() => {
    'use strict';
    const labels={auto:'自动判断',textToVideo:'文生视频',referToVideo:'参考生视频',imageToVideo:'图生视频',firstAndLastFrame:'首尾帧',videoEdit:'视频编辑',extend_backward:'向后延长',extend_forward:'向前延长'};
    function modelCode(config){
        const value=String(config.videoModel||'').toLowerCase().replace(/[_.]/g,'-');
        const native={'pixdance-2-5':'PIXDANCE_2_5','pixdance-2-5-draft':'PIXDANCE_2_5_DRAFT','pixdance-2':'PIXDANCE_2','pixdance-2-fast':'PIXDANCE_2_FAST','pixdance-2-mini':'PIXDANCE_2_MINI'}[value];
        if(native)return native;
        const match=value.match(/^(?:doubao-)?seedance-(2-5|2-0)(?:-(pro|draft|fast|mini))?(?:-\d{6,8})?$/);
        if(!match)return '';
        const [,version,variant]=match;
        if(version==='2-5')return !variant||variant==='pro'?'PIXDANCE_2_5':variant==='draft'?'PIXDANCE_2_5_DRAFT':'';
        return variant==='draft'?'':'PIXDANCE_2'+(['fast','mini'].includes(variant)?'_'+variant.toUpperCase():'');
    }
    const family=config=>modelCode(config).startsWith('PIXDANCE_2_5')?'2.5':modelCode(config)?'2.0':'';
    const canEdit=config=>modelCode(config)==='PIXDANCE_2_5';
    function supported(config){
        const provider=(apiProviders||[]).find(provider=>provider.id===config.videoProvider);
        if(config.apiKind!=='video'||!family(config))return false;
        if(typeof provider?.video_capabilities?.native_roles==='boolean')return provider.video_capabilities.native_roles;
        if(!(provider?.protocol==='volcengine'||config.videoProvider==='volcengine'))return false;
        if(!provider?.base_url)return true;
        try{return !new URL(provider.base_url.replace(/\/+$/,'').replace(/\/api\/v3$/,'')).pathname.replace(/\/+$/,'');}catch{return false;}
    }
    const selected=config=>config.videoReferenceMode&&config.videoReferenceMode!=='auto'?config.videoReferenceMode:config.videoTaskMode==='edit'?'videoEdit':['extend_backward','extend_forward'].includes(config.videoTaskMode)?config.videoTaskMode:'auto';
    const counts=refs=>({image:refs.filter(ref=>mediaKindForItem(ref)==='image').length,audio:refs.filter(ref=>mediaKindForItem(ref)==='audio').length,video:refs.filter(ref=>mediaKindForItem(ref)==='video').length});
    function reason(config,refs,mode=selected(config)){
        if(mode==='auto')return '';
        if(!supported(config))return '当前模型不支持已保存的视频模式，请重新选择';
        const n=counts(refs),limit=family(config)==='2.5'?{image:30,video:10,audio:10}:{image:9,video:3,audio:3};
        if(n.image>limit.image||n.video>limit.video||n.audio>limit.audio)return '参考素材数量超出当前视频模型限制';
        if(mode==='textToVideo')return n.image+n.audio+n.video?'文生视频不能包含图像、音频或视频参考':'';
        if(mode==='imageToVideo')return n.image!==1||n.audio||n.video?'图生视频需要恰好一张图片，不能混用音频或视频参考':'';
        if(mode==='firstAndLastFrame')return n.image!==2||n.audio||n.video?'首尾帧需要恰好两张图片，不能混用音频或视频参考':'';
        if(mode==='referToVideo')return !n.image&&!n.video&&!n.audio?'多模态参考至少需要一份媒体素材':family(config)==='2.0'&&!n.image&&!n.video?'Seedance 2.0 不能只使用音频参考':'';
        if(mode==='videoEdit')return !canEdit(config)?'当前模型不支持视频编辑':n.video!==1||n.audio?'视频编辑需要一个视频，不能混用音频参考':'';
        if(['extend_backward','extend_forward'].includes(mode))return !canEdit(config)?'当前模型不支持视频延长':!n.video?'视频延长至少需要一个视频':'';
        return '视频生成模式无效，请重新选择';
    }
    const lockedAspect=config=>supported(config)&&family(config)==='2.5'&&['imageToVideo','firstAndLastFrame','videoEdit','extend_backward','extend_forward'].includes(selected(config));
    function validate(config,refs){
        const error=reason(config,refs);if(error)throw Error(error);
        if(config.videoReferenceMode&&config.videoReferenceMode!=='auto'){
            const expected=config.videoReferenceMode==='videoEdit'?'edit':['extend_backward','extend_forward'].includes(config.videoReferenceMode)?config.videoReferenceMode:'auto';
            if(config.videoTaskMode&&config.videoTaskMode!==expected)throw Error('视频生成模式与任务类型冲突，请重新选择视频模式');
        }
        if(config.videoReferenceMode&&config.videoReferenceMode!=='auto'&&lockedAspect(config)&&config.videoAspect!=='adaptive')throw Error('当前视频模式要求自适应比例，请重新选择模式');return config;
    }
    const references=(node,config)=>PixmaxReshootReferences.plan(node,{configuration:config}).entries.filter(entry=>entry.media).map(entry=>entry.media);
    function options(node,config,definitions){
        const native=definitions?.find(model=>model.modelCode===modelCode(config)),values=native?.fields.find(field=>field.name==='referModel')?.options.map(option=>option.value)||['textToVideo','referToVideo','imageToVideo','firstAndLastFrame',...(canEdit(config)?['videoEdit']:[])];
        // All explicit modes use upstream inputs; only first/last keeps duplicate image slots.
        // Scope this reuse to one menu calculation so changed edges cannot leave stale inputs.
        let normalRefs,frameRefs;
        return ['auto',...values,...(canEdit(config)?['extend_backward','extend_forward']:[])].map(value=>{
            const next={...config,videoReferenceMode:value,videoTaskMode:'auto'},refs=value==='auto'?[]:value==='firstAndLastFrame'?(frameRefs??=references(node,next)):(normalRefs??=references(node,next)),tooltip=reason(next,refs,value);
            return {value,label:labels[value]||value,disabled:!!tooltip,tooltip};
        });
    }
    function choose(node,config,mode){
        const next={...config,videoReferenceMode:mode,videoTaskMode:mode==='videoEdit'?'edit':['extend_backward','extend_forward'].includes(mode)?mode:'auto',videoUseFrameRoles:false};
        if(lockedAspect(next))next.videoAspect='adaptive';
        if(mode==='videoEdit')next.videoDuration=-1;
        validate(next,references(node,next));return next;
    }
    function roles(config,refs){
        validate(config,refs);const mode=selected(config);return refs.filter(ref=>mediaKindForItem(ref)==='image').map((ref,index)=>mode==='imageToVideo'||mode==='firstAndLastFrame'?index===0?'first_frame':'last_frame':'reference_image');
    }
    window.PixmaxVideoModes=Object.freeze({supported,selected,references,options,choose,validate,roles,lockedAspect});
})();
