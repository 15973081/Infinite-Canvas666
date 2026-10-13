import {mountEditor, unmountEditor,mountCanvasMediaPicker,unmountCanvasMediaPicker} from '/static/vendor/pixmax/editors.js';

// LAN development origins may expose getRandomValues without randomUUID.
if(!crypto.randomUUID)crypto.randomUUID=()=>{
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
};
const channel = new URLSearchParams(location.search).get('channel');
let instance, initialized = false, serial = 0;
let pickerSession;
async function closeMediaPicker(){if(!pickerSession)return;const picker=pickerSession;pickerSession=null;await unmountCanvasMediaPicker(picker.instance);picker.root.remove();}
const pending = new Map();
function send(type, payload={}) {
    parent.postMessage({pixmaxEditor:true, channel, type, ...payload}, location.origin);
}
function request(type, payload) {
    const requestId = ++serial;
    return new Promise((resolve, reject) => {
        pending.set(requestId, {resolve,reject});
        send(type, {...payload,requestId});
    });
}
window.addEventListener('message', async event => {
    const message = event.data;
    if(event.source !== parent || event.origin !== location.origin || !message?.pixmaxEditor || message.channel !== channel) return;
    if(message.type === 'reply') {
        const entry = pending.get(message.requestId);
        if(!entry) return;
        pending.delete(message.requestId);
        message.error ? entry.reject(new Error(message.error)) : entry.resolve(message.result);
        return;
    }
    if(message.type === 'close') {
        await closeMediaPicker();
        if(instance) await unmountEditor(instance);
        instance = null;
        send('closed');
        return;
    }
    if(message.type !== 'init' || initialized) return;
    initialized = true;
    try {
        const selectCanvasResources=async()=>{
            await closeMediaPicker();
            const current=await request('list-sources',{});
            message.allResources=current.allResources;message.resources=current.resources;
            const picker=document.createElement('div');picker.className='local-media-picker';
            picker.setAttribute('role','dialog');picker.setAttribute('aria-modal','true');picker.setAttribute('aria-label','选择素材');
            picker.innerHTML='<section><header><h2>选择素材</h2><button class="local-picker-close" aria-label="关闭素材选择">×</button></header><nav><span>当前画布</span></nav><div class="local-picker-content"></div></section>';
            const candidates=message.allResources.filter(resource=>['video','audio'].includes(resource.kind));
            document.body.appendChild(picker);
            picker.querySelector('.local-picker-close').onclick=closeMediaPicker;
            const pickerInstance=mountCanvasMediaPicker(picker.querySelector('.local-picker-content'),{
                open:true,nodes:candidates.map(resource=>({id:resource.id,type:resource.kind,data:{url:resource.url,label:resource.name,poster:resource.previewUrl}})),
                connectedNodeIds:message.resources.map(resource=>resource.id),materialTypeFilters:['video','audio'],onClose:closeMediaPicker,
                onConfirm:async ids=>{
                    try{
                        await request('sources',{resourceIds:[...ids]});
                        message.resources=[...message.resources,...candidates.filter(resource=>ids.includes(resource.id)&&!message.resources.some(existing=>existing.id===resource.id))];
                        instance?.setResources(message.resources);
                    }catch(error){send('toast',{text:error.message});throw error;}
                }
            },instance);
            pickerSession={root:picker,instance:pickerInstance};
        };
        const props = {
            importResources:message.resources,
            onCanvasSelect:selectCanvasResources,
            onDocumentSave:document => send('document', {document}),
            onExit:() => send('exit'),
            onCapture:file => request('export', {files:[file]}),
            onVideoExport:file => request('export', {files:[file]}),
            onExport:file => request('export', {files:[file]}),
            onLocalUpload:async files => {
                const resources=await request('upload',{files});message.resources.push(...resources);message.allResources.push(...resources);return resources;
            }
        };
        props.onRemoveResource=async resource=>{
            await request('remove-source',{resourceId:resource.id});
            message.resources=message.resources.filter(item=>item.id!==resource.id);instance?.setResources(message.resources);
        };
        if(message.kind === 'director') props.stageDocument = message.document;
        else props.videoDocument = message.document;
        instance = await mountEditor(document.getElementById('app'), message.kind, props, text => send('toast',{text:String(text)}));
        send('mounted');
    } catch(error) {
        console.error(error);
        document.getElementById('app').textContent = '工作台加载失败：'+error.message;
        send('error', {text:error.message});
    }
});
send('ready');
document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&pickerSession){event.preventDefault();event.stopImmediatePropagation();closeMediaPicker();}
},true);
