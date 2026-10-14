/* Native voice-library interactions; directory queries never generate speech. */
(() => {
    'use strict';
    let active=null;
    const languages={'Chinese':'中文','Chinese,Yue':'粤语','English':'英语','Japanese':'日语','Korean':'韩语','Spanish':'西班牙语','French':'法语','German':'德语'};
    function close(){if(!active)return;const state=active;active=null;state.abort.abort();stop(state);state.observer.disconnect();state.root.remove();document.removeEventListener('keydown',state.escape,true);window.removeEventListener('pagehide',close);window.PixmaxVoiceDesign?.close();}
    function stop(state){if(state.audio){state.audio.pause();state.audio.removeAttribute('src');state.audio.load();state.audio.remove();state.audio=null;}state.playing='';}
    function open({parent,node,provider,model,value,valid,onSelect}){
        close();const root=document.createElement('div');root.className='pixmax-voice-modal';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','音色选择');
        root.innerHTML=`<section><header><strong>音色选择</strong><button type="button" data-voice-close aria-label="关闭音色选择">×</button></header><nav role="tablist" aria-label="音色分类">${[['system','音色库'],['clone','我的音色'],['favorite','收藏音色']].map(([id,label])=>`<button type="button" role="tab" data-voice-tab="${id}" aria-selected="${id==='system'}">${label}</button>`).join('')}</nav><div class="pixmax-voice-controls"><input type="search" aria-label="搜索音色" placeholder="搜索音色名称或描述"><select aria-label="音色语言"></select><select aria-label="音色性别"></select><button type="button" data-voice-refresh>刷新</button></div><p role="status"></p><div data-voice-list></div><footer><button type="button" data-voice-more hidden>加载更多</button></footer></section>`;
        document.body.appendChild(root);
        const extra=document.createElement('details');extra.className='pixmax-voice-filters';extra.innerHTML='<summary>更多筛选</summary><label>口音<select aria-label="音色口音"></select></label><fieldset><legend>年龄</legend><div data-voice-ages></div></fieldset>';
        root.querySelector('[role=status]').before(extra);
        const state={root,parent,provider,model,value,valid,onSelect,abort:new AbortController(),voices:[],category:'system',limit:50,request:0,audio:null,playing:'',escape:event=>{if(event.key==='Escape'&&!window.PixmaxVoiceDesign?.opened){event.preventDefault();event.stopImmediatePropagation();close();}},observer:null};active=state;
        const status=root.querySelector('[role=status]'),list=root.querySelector('[data-voice-list]'),search=root.querySelector('input'),language=root.querySelector('[aria-label="音色语言"]'),gender=root.querySelector('[aria-label="音色性别"]'),accent=root.querySelector('[aria-label="音色口音"]'),ages=root.querySelector('[data-voice-ages]'),more=root.querySelector('[data-voice-more]');
        const usable=()=>active===state&&root.isConnected&&parent.isConnected&&valid();
        const design=document.createElement('button');design.type='button';design.dataset.voiceDesign='';design.disabled=true;design.textContent='文本生成音色';design.title='请为当前供应商配置 voice-design 音色设计模型';root.querySelector('.pixmax-voice-controls').appendChild(design);
        const create=voice=>{stop(state);window.PixmaxVoiceDesign.open({parent:root,node,provider,model,catalog:state.catalog,voice,canGenerate:state.canDesign,valid:usable,onRegistered:async()=>{state.category='clone';search.value='';for(const tab of tabs)tab.setAttribute('aria-selected',tab.dataset.voiceTab==='clone');await load();}});};design.onclick=()=>create();
        state.observer=new MutationObserver(()=>{if(!parent.isConnected||!valid())close();});state.observer.observe(document.body,{childList:true,subtree:true,attributes:true});
        document.addEventListener('keydown',state.escape,true);window.addEventListener('pagehide',close);root.querySelector('[data-voice-close]').onclick=close;
        root.addEventListener('mousedown',event=>event.stopPropagation());root.addEventListener('keydown',event=>event.stopPropagation());
        function filters(){
            for(const [select,key,label] of [[language,'language','全部语言'],[gender,'gender','全部性别'],[accent,'accent','全部口音']]){
                const chosen=select.value;select.replaceChildren(new Option(label,''));
                const labels=key==='language'?languages:key==='gender'?{MALE:'男声',FEMALE:'女声'}:{CHINESE_SOUTHERN:'中文南方口音',CHINESE_NORTHERN:'中文北方口音',ENGLISH_US:'美式英语',ENGLISH_UK:'英式英语',ENGLISH_AUSTRALIAN:'澳大利亚英语',ENGLISH_INDIAN:'印度英语'};
                for(const item of [...new Set(state.voices.map(voice=>voice[key]).filter(Boolean))].sort())select.add(new Option(labels[item]||item,item));
                if([...select.options].some(option=>option.value===chosen))select.value=chosen;
            }
            ages.innerHTML=[...new Set(state.voices.map(voice=>voice.age).filter(Boolean))].sort().map(age=>`<label><input type="checkbox" value="${escapeAttr(age)}">${escapeHtml({CHILD:'儿童',YOUTH:'青年',ADULT:'成年',ELDER:'老年'}[age.toUpperCase()]||age)}</label>`).join('')||'<small>目录暂无年龄信息</small>';
        }
        function render(){
            const query=search.value.trim().toLocaleLowerCase(),selectedAges=[...ages.querySelectorAll('input:checked')].map(input=>input.value),voices=state.voices.filter(voice=>(state.category==='favorite'?voice.favorite:voice.category===state.category)&&(!language.value||voice.language===language.value)&&(!gender.value||voice.gender===gender.value)&&(!accent.value||voice.accent===accent.value)&&(!selectedAges.length||selectedAges.includes(voice.age))&&(!query||[voice.name,voice.id,voice.description].join(' ').toLocaleLowerCase().includes(query)));
            list.innerHTML=voices.slice(0,state.limit).map(voice=>`<article data-voice-id="${escapeAttr(voice.id)}"><div><strong>${escapeHtml(voice.name)}</strong><small>${escapeHtml(languages[voice.language]||voice.language||'')}</small><p>${escapeHtml(voice.description)}</p></div><div class="pixmax-voice-actions">${voice.task_id?'<button type="button" data-voice-edit aria-label="编辑音色">编辑</button>':''}<button type="button" data-voice-preview ${voice.preview_url?'':'disabled'} aria-label="${escapeAttr((state.playing===voice.id?'停止试听 ':'试听音色 ')+voice.name)}" title="${voice.preview_url?'上次生成样例':'暂无试听样例'}">${state.playing===voice.id?'■':'▷'}</button><button type="button" data-voice-favorite aria-pressed="${voice.favorite}" aria-label="${escapeAttr((voice.favorite?'取消收藏 ':'收藏音色 ')+voice.name)}">${voice.favorite?'★':'☆'}</button><button type="button" data-voice-select ${voice.id===state.value?'aria-current="true"':''}>${voice.id===state.value?'已选中':'选择'}</button></div></article>`).join('');
            more.hidden=voices.length<=state.limit;if(!voices.length)list.innerHTML='<p class="pixmax-voice-empty">暂无音色</p>';
        }
        for(const input of [search,language,gender,accent,ages])input.addEventListener(input===search?'input':'change',()=>{state.limit=50;render();});
        more.onclick=()=>{state.limit+=50;render();};
        const tabs=[...root.querySelectorAll('[data-voice-tab]')];
        for(const tab of tabs){
            tab.onclick=()=>{stop(state);state.category=tab.dataset.voiceTab;state.limit=50;search.value='';for(const button of tabs)button.setAttribute('aria-selected',button===tab);render();};
            tab.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(tabs.indexOf(tab)+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[index].click();tabs[index].focus();};
        }
        list.onclick=async event=>{
            const button=event.target.closest('button'),card=button?.closest('[data-voice-id]'),voice=state.voices.find(voice=>voice.id===card?.dataset.voiceId);if(!voice)return;
            if(!usable()){close();return;}
            if(button.hasAttribute('data-voice-edit')){create(voice);return;}
            if(button.hasAttribute('data-voice-select')){onSelect(voice);close();return;}
            if(button.hasAttribute('data-voice-preview')){
                if(state.playing===voice.id){stop(state);render();return;}
                stop(state);const audio=document.createElement('audio');audio.preload='none';audio.src=displayMediaUrl(voice.preview_url);root.appendChild(audio);state.audio=audio;state.playing=voice.id;
                const finished=()=>{if(state.audio!==audio)return;stop(state);render();};audio.onended=finished;audio.onerror=()=>{if(state.audio!==audio)return;status.textContent='试听样例暂不可播放';finished();};render();
                try{await audio.play();if(!usable()){close();return;}}catch{if(state.audio===audio){status.textContent='试听样例暂不可播放';finished();}}return;
            }
            if(button.hasAttribute('data-voice-favorite')){
                button.disabled=true;const selected=!voice.favorite,serial=state.request;
                try{
                    const response=await window.CanvasApi.setCanvasAudioVoiceFavorite({provider_id:provider,model,catalog_id:state.catalog,voice_id:voice.id,favorite:selected},{signal:state.abort.signal});
                    if(!usable()||serial!==state.request)return;if(!response.ok)throw new Error(await responseErrorMessage(response,'收藏未保存，请刷新音色目录后重试'));
                    voice.favorite=selected;status.textContent='收藏已保存';render();
                }catch(error){if(usable()){status.textContent=error.message||'收藏未保存，请重试';button.disabled=false;}}
            }
        };
        async function load(){
            const serial=++state.request;stop(state);design.disabled=true;status.textContent='正在加载音色…';state.voices=[];render();
            try{
                const response=await window.CanvasApi.getCanvasAudioVoices(provider,model,{signal:state.abort.signal});
                if(!usable()||serial!==state.request)return;if(!response.ok)throw new Error(await responseErrorMessage(response,'音色加载失败，请重试'));
                const result=await response.json();if(!usable()||serial!==state.request)return;
                if(result.provider_id!==provider||!/^[a-f0-9]{64}$/.test(result.catalog_id)||!Array.isArray(result.voices))throw new Error('音色目录格式无效');
                state.catalog=result.catalog_id;state.voices=result.voices;state.canDesign=Boolean(result.can_design);design.disabled=(!result.can_design&&!result.has_design_tasks)||!node;design.title=result.can_design?'使用文字描述设计音色，生成试听后登记':result.has_design_tasks?'查询原音色设计任务':'请为当前供应商配置 voice-design 音色设计模型';filters();render();status.textContent='';
            }catch(error){if(usable()&&serial===state.request)status.textContent=error.message||'音色加载失败，请重试';}
        }
        root.querySelector('[data-voice-refresh]').onclick=load;load();search.focus();return {close};
    }
    window.PixmaxAudioVoices=Object.freeze({open,close});
})();
