import {mountCanvasPlayer,unmountCanvasPlayer} from '/static/vendor/pixmax/editors.js';

// Reuse the supplied player's controls, seek controller and frame capture.
// Keep whole mounts across canvas redraws so playback does not restart.
const players=new Map();
let queued=false;
function reconcile(){
    queued=false;
    for(const [target,instance] of players){
        if(!target.isConnected){unmountCanvasPlayer(instance);players.delete(target);}
    }
    document.querySelectorAll('.pixmax-player-mount').forEach(target=>{
        if(players.has(target))return;
        const props={src:target.dataset.src,poster:target.dataset.poster||'',durationHint:Number(target.dataset.duration)||0,
            preload:'metadata',eagerMetadataProbe:true,fit:'fill',showCaptureButton:true,
            captureText:{title:'截图菜单',current:'截取当前帧',firstAndLast:'截取首尾帧'},
            onCapture:frames=>window.captureSmartPixmaxFrames(target.closest('.image-node')?.dataset.id,frames),
            onCaptureError:error=>window.toast(error.message||'截图失败')};
        players.set(target,mountCanvasPlayer(target,props));
        const video=target.querySelector('video');
        if(video){video.dataset.url=target.dataset.url;video.classList.add('pixmax-inline-video');}
        const controlEvent=event=>event.composedPath().some(e=>e instanceof Element && e.matches('button,[role=slider]'));
        target.addEventListener('mousedown',event=>{if(controlEvent(event))event.stopPropagation();});
        target.addEventListener('click',event=>{if(controlEvent(event))event.stopPropagation();});
        target.addEventListener('wheel',event=>event.stopPropagation());
    });
}
function schedule(){if(!queued){queued=true;queueMicrotask(reconcile);}}
const observer=new MutationObserver(schedule);
observer.observe(document.getElementById('world'),{subtree:true,childList:true});
schedule();
window.addEventListener('pagehide',event=>{if(!event.persisted){observer.disconnect();for(const instance of players.values())unmountCanvasPlayer(instance);players.clear();}});
