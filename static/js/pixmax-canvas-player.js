// Reuse the supplied player's controls, seek controller and frame capture.
// Keep whole mounts across canvas redraws so playback does not restart.
const players=new Map();
const gestureTargets=new WeakSet();
const sourcePlayback=new Map(),sourceKeys=new WeakMap(),sourceRestorers=new WeakMap();
function sourceKey(target){
    if(!target.hasAttribute('data-reshoot-source-player'))return null;
    return JSON.stringify([window.CanvasSession?.context?.member?.id,window.CanvasSession?.context?.workspace?.id,canvas?.id,target.closest('.image-node')?.dataset.id,target.closest('.pixmax-reshoot-source')?.dataset.mediaSignature]);
}
let queued=false, runtime, runtimePromise, disposed=false;
function bindPlayerGestures(target){
    if(gestureTargets.has(target))return;
    gestureTargets.add(target);
    const controlEvent=event=>event.composedPath().some(e=>e instanceof Element&&e.matches('button,[role=slider]'));
    // Install before the import finishes: an empty mount is still a video card,
    // and its picture must not fall through to generic thumbnail preview logic.
    for(const type of ['mousedown','click'])target.addEventListener(type,event=>{
        if(controlEvent(event))return;
        event.stopPropagation();
        const owner=target.closest('.image-node');
        if(type==='mousedown')owner?.onmousedown?.(event);else owner?.onclick?.(event);
    },true);
    target.addEventListener('dblclick',event=>{
        if(controlEvent(event))return;
        event.preventDefault();event.stopPropagation();
        const item=target.closest('[data-image-index]'),owner=target.closest('.image-node');
        if(target.hasAttribute('data-reshoot-source-player')){void window.PixmaxSegmentReshoot?.preview(owner.dataset.id);return;}
        window.openSmartVideoLightbox(owner.dataset.id,Number(item?.dataset.imageIndex||0));
    },true);
    target.addEventListener('wheel',event=>event.stopPropagation());
}
async function reconcile(){
    queued=false;
    for(const [target,instance] of players){
        if(!target.isConnected){
            const key=sourceKeys.get(target),video=target.querySelector('video');
            if(key&&video)sourcePlayback.set(key,{currentTime:video.currentTime,muted:video.muted,volume:video.volume,playbackRate:video.playbackRate});
            sourceRestorers.get(target)?.();runtime.unmountCanvasPlayer(instance);players.delete(target);
        }else if(target.hasAttribute('data-reshoot-source-player'))runtime.setCanvasPlayerCaptureEnabled(instance,!window.isSmartCanvasLocked());
    }
    if(disposed || !document.querySelector('.pixmax-player-mount'))return;
    document.querySelectorAll('.pixmax-player-mount').forEach(bindPlayerGestures);
    try{
        runtime=await (runtimePromise ||= import('/static/vendor/pixmax/editors.js'));
    }catch(error){
        runtimePromise=null;
        window.toast?.('播放器加载失败，请检查连接后重试');
        return;
    }
    if(disposed)return;
    document.querySelectorAll('.pixmax-player-mount').forEach(target=>{
        if(players.has(target))return;
        const key=sourceKey(target);if(key)sourceKeys.set(target,key);
        const props={src:target.dataset.src,poster:target.dataset.poster||'',durationHint:Number(target.dataset.duration)||0,
            preload:'metadata',eagerMetadataProbe:true,fit:'fill',showCaptureButton:key?!window.isSmartCanvasLocked():true,
            captureText:{title:'截图菜单',current:'截取当前帧',firstAndLast:'截取首尾帧'},
            onCapture:frames=>target.hasAttribute('data-reshoot-source-player')?window.PixmaxSegmentReshoot?.captureSource(target.closest('.image-node')?.dataset.id,frames):window.captureSmartPixmaxFrames(target.closest('.image-node')?.dataset.id,frames),
            onCaptureError:error=>window.toast(error.message||'截图失败')};
        if(key)props.onControllerReady=controller=>{
            sourceRestorers.get(target)?.();if(!controller)return;
            const saved=sourcePlayback.get(key);if(!saved)return;
            let done=false,unsubscribe;
            unsubscribe=controller.subscribe(state=>{
                if(done||state.readyState<1)return;done=true;unsubscribe?.();
                const video=target.querySelector('video');if(!target.isConnected||sourceKey(target)!==key||!video)return;
                video.muted=saved.muted;video.volume=saved.volume;video.playbackRate=saved.playbackRate;controller.seek(Math.min(saved.currentTime,state.duration));
            });sourceRestorers.set(target,unsubscribe);
        };
        players.set(target,runtime.mountCanvasPlayer(target,props));
        // Native Svelte dispatch must run before stopping control events from
        // reaching the node. Register these after mount, not during lazy load.
        const controlEvent=event=>event.composedPath().some(e=>e instanceof Element&&e.matches('button,[role=slider]'));
        target.addEventListener('mousedown',event=>{if(controlEvent(event))event.stopPropagation();});
        target.addEventListener('click',event=>{if(controlEvent(event))event.stopPropagation();});
        const video=target.querySelector('video');
        if(video){video.dataset.url=target.dataset.url;video.classList.add('pixmax-inline-video');}
    });
    // A node may be selected while its native player is still loading. Media
    // initialization can replace that node's DOM; reconcile its selection too.
    window.syncSelectionUi?.();
}
function schedule(){if(!queued){queued=true;queueMicrotask(reconcile);}}
const observer=new MutationObserver(schedule);
observer.observe(document.getElementById('world'),{subtree:true,childList:true});
window.addEventListener('pixmax-reshoot-preview-changed',schedule);
schedule();
window.addEventListener('pagehide',event=>{if(!event.persisted){disposed=true;observer.disconnect();for(const [target,instance] of players){sourceRestorers.get(target)?.();runtime.unmountCanvasPlayer(instance);}players.clear();sourcePlayback.clear();}});
