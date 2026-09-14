/* Scoped state hints. Private editing credentials remain in CanvasEditLease. */
(() => {
    'use strict';
    class CanvasSubscription {
        constructor({id,workspace,url,onChange,onDisconnect=()=>{},valid=()=>true,
            socketFactory=url=>new WebSocket(url),delay=(...args)=>setTimeout(...args),cancel=id=>clearTimeout(id)}) {
            Object.assign(this,{id,workspace,url,onChange,onDisconnect,valid,socketFactory,delay,cancel});
            this.stopped=true;this.socket=null;this.retry=null;this.watchdog=null;
            this.revision=0;this.generation=0;this.attempt=0;
        }
        start() {if(!this.stopped)return;this.stopped=false;this.connect();}
        stop() {
            this.stopped=true;this.cancel(this.retry);this.cancel(this.watchdog);
            const socket=this.socket;this.socket=null;try{socket?.close();}catch(_){}
        }
        reconnect() {
            if(this.stopped || !this.valid())return;
            this.cancel(this.retry);
            this.retry=this.delay(()=>this.connect(),Math.min(10000,1000*2**Math.min(this.attempt++,4)));
        }
        connect() {
            if(this.stopped || !this.valid())return;
            let socket;
            try {socket=this.socketFactory(this.url);} catch(_) {
                this.onDisconnect('实时连接未建立，正在重试；查看状态由轮询补充。');this.reconnect();return;
            }
            this.socket=socket;let sequence=0,marker=null;
            const current=()=>!this.stopped && this.socket===socket && this.valid();
            const watch=()=>{this.cancel(this.watchdog);this.watchdog=this.delay(()=>{if(current())socket.close();},25000);};
            watch();
            socket.onmessage=event=>{
                if(!current())return;
                let value;try{value=JSON.parse(event.data);}catch(_){return;}
                if(value.type!=='canvas_state' || value.canvas_id!==this.id || value.workspace_id!==this.workspace ||
                    !Number.isSafeInteger(value.sequence) || value.sequence<=sequence ||
                    !Number.isSafeInteger(value.revision) || value.revision<0 || !Number.isSafeInteger(value.generation) || value.generation<0 ||
                    typeof value.stamp!=='string' || !value.maintenance || typeof value.maintenance.mode!=='string')return;
                sequence=value.sequence;
                if(value.revision<this.revision || value.generation<this.generation) {
                    this.stop();this.onDisconnect('服务器版本发生回退，已暂停编辑，请保留草稿并重新打开画布。');return;
                }
                this.revision=value.revision;this.generation=value.generation;this.attempt=0;watch();
                const next=[value.revision,value.generation,value.stamp].join(':');
                if(next===marker)return;marker=next;
                Promise.resolve().then(()=>{if(current())return this.onChange(value);}).catch(()=>{
                    if(current())this.onDisconnect('画布状态更新失败，请保留草稿；查看状态由轮询补充。');
                });
            };
            socket.onerror=()=>{if(current())socket.close();};
            socket.onclose=event=>{
                if(!current())return;
                this.socket=null;this.cancel(this.watchdog);
                if(event.code===1008) {
                    this.stop();this.onDisconnect('画布订阅权限已失效，请检查账号与空间；当前草稿保留。');return;
                }
                this.onDisconnect('实时连接中断，已暂停编辑；连接恢复后请重新确认编辑资格。');this.reconnect();
            };
        }
    }
    if(typeof module==='object' && module.exports)module.exports=CanvasSubscription;
    else window.CanvasSubscription=CanvasSubscription;
})();
