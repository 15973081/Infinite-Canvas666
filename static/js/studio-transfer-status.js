/* Ephemeral UI only: upload/loading state never enters canvas documents. */
(() => {
    'use strict';
    const tasks=new Set();let shelf=null;
    const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
    function begin({kind='upload',nodeId='',name=''}={}){
        if(!shelf?.isConnected){shelf=make('section',undefined,'studio-transfer-shelf');shelf.setAttribute('aria-label','素材传输与画布加载');document.body.append(shelf);}
        const card=make('div',undefined,'studio-transfer-card'),label=make('span',kind==='upload'?'当前素材上传中':'画布节点加载中','studio-transfer-label');
        const detail=make('small',name),meter=make('progress');card.setAttribute('role','status');card.setAttribute('aria-busy','true');
        meter.max=100;card.append(label,detail,meter);shelf.append(card);
        const overlays=new Set();let ended=false;
        const task={attach(){
            if(ended||!nodeId)return;
            for(const node of document.querySelectorAll('.node[data-id],.image-node[data-id]')){
                if(node.dataset.id!==nodeId||node.querySelector('[data-transfer-owner="'+task.id+'"]'))continue;
                const state=make('div','当前素材上传中','studio-node-transfer');state.dataset.transferOwner=task.id;state.setAttribute('role','status');node.append(state);overlays.add(state);
            }
        },id:Math.random().toString(36).slice(2)};
        tasks.add(task);task.attach();
        function finish(error){
            if(ended)return;ended=true;tasks.delete(task);for(const overlay of overlays)overlay.remove();
            card.setAttribute('aria-busy','false');meter.remove();
            if(error){card.classList.add('failed');label.textContent=kind==='upload'?'素材上传失败':'画布加载失败';detail.textContent=error.message||String(error);const close=make('button','关闭');close.type='button';close.onclick=()=>card.remove();card.append(close);}
            else card.remove();
        }
        return {progress({loaded,total}={}){if(ended)return;if(total>0){meter.value=Math.min(99,Math.round(100*loaded/total));detail.textContent=loaded>=total?'传输完成，正在等待服务器确认…':meter.value+'% · '+name;}},phase(text){if(!ended)detail.textContent=text;},finish:()=>finish(),fail:error=>finish(error)};
    }
    new MutationObserver(()=>{for(const task of tasks)task.attach();}).observe(document.documentElement,{childList:true,subtree:true});
    window.StudioTransferStatus={begin};
})();
