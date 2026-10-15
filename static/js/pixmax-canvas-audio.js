/* One captured waveform player for uploaded and generated canvas audio. */
const players=new Map();
let runtime,pending,queued=false,disposed=false;
const scope=()=>JSON.stringify([window.CanvasSession?.context?.member?.id,window.CanvasSession?.context?.workspace?.id,canvas?.id]);
function remove(target,entry){entry.unsubscribe?.();for(const type of ['mousedown','click','dblclick','wheel'])if(entry.stop)target.removeEventListener(type,entry.stop);entry.player?.controller.pause();entry.player?.destroy();if(players.get(target)===entry)players.delete(target);}
async function reconcile(){
    queued=false;if(disposed)return;const origin=scope();
    for(const [target,entry] of players)if(!target.isConnected||entry.scope!==origin)remove(target,entry);
    if(!document.querySelector('.pixmax-audio-mount'))return;
    try{runtime=await (pending||=import('/static/vendor/pixmax/editors.js'));}catch(error){pending=null;for(const target of document.querySelectorAll('.pixmax-audio-mount')){
        if(target.childElementCount)continue;const button=document.createElement('button');button.dataset.audioError='';button.textContent='音频播放器加载失败，点击重试';button.onclick=event=>{event.stopPropagation();button.remove();schedule();};target.append(button);
    }return;}
    if(disposed||scope()!==origin)return;
    for(const target of document.querySelectorAll('.pixmax-audio-mount')){
        if(players.has(target)||!target.isConnected)continue;
        const entry={scope:origin,player:null};players.set(target,entry);
        target.querySelector('[data-audio-error]')?.remove();
        try{
            const player=await runtime.mountCanvasAudio(target,{src:target.dataset.src,assetId:origin+':'+target.dataset.src});entry.player=player;
            if(disposed||!target.isConnected||scope()!==origin){remove(target,entry);continue;}
            // Captured Svelte handlers delegate to the mount. Register after
            // its listeners so controls run before the canvas gesture barrier.
            entry.stop=event=>event.stopPropagation();
            for(const type of ['mousedown','click','dblclick','wheel'])target.addEventListener(type,entry.stop);
            entry.unsubscribe=player.controller.subscribe(state=>{target.dataset.playing=String(!state.paused);target.dataset.currentTime=String(state.currentTime);target.dataset.duration=String(state.duration);});
            target.dataset.audioReady='true';target.setAttribute('role','group');target.setAttribute('aria-label',target.dataset.audioName);
        }catch(error){players.delete(target);target.dataset.audioReady='false';}
    }
}
function schedule(){if(!queued&&!disposed){queued=true;queueMicrotask(()=>void reconcile());}}
const observer=new MutationObserver(schedule);observer.observe(document.getElementById('world'),{subtree:true,childList:true});schedule();
window.addEventListener('pagehide',event=>{if(event.persisted){for(const entry of players.values())entry.player?.controller.pause();return;}disposed=true;observer.disconnect();for(const [target,entry] of players)if(entry.player)remove(target,entry);});
