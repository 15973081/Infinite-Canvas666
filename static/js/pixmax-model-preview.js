/* Read-only 3D inspection using the reference's frozen graphics runtime. */
(() => {
    'use strict';
    let active=null;
    const identity=url=>String(url).match(/(?:assets\/cloud|api\/media)\/(ast_[a-f0-9]{32})(?:\/|$)/)?.[1]||url;
    const scope=()=>window.CanvasSession?.enabled?JSON.stringify([window.CanvasSession.context?.member?.id,window.CanvasSession.context?.workspace?.id]):'';
    function disposeModel(model){
        const geometries=new Set(),materials=new Set(),textures=new Set();
        model?.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of [].concat(object.material||[])){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
        for(const texture of textures){texture.dispose();texture.image?.close?.();}for(const material of materials)material.dispose();for(const geometry of geometries)geometry.dispose();
    }
    function close(){
        const current=active;if(!current)return;active=null;current.closed=true;current.abort.abort();cancelAnimationFrame(current.frame);current.observer?.disconnect();current.resize?.disconnect();current.controls?.dispose();disposeModel(current.model);current.renderer?.dispose();current.renderer?.forceContextLoss();current.root.remove();
        document.removeEventListener('keydown',current.escape,true);document.removeEventListener('visibilitychange',current.visibility);window.removeEventListener('pagehide',close);
    }
    function documentChanged(){if(active&&!active.valid())close();}
    async function open(node,index=(node.images?.length||1)-1,historyValid=null){
        const item=node.images?.[index];if(!item?.url||!historyValid&&!nodes.includes(node))return;
        close();const origin=canvas,originalScope=scope(),source=identity(item.url);
        const root=document.createElement('div');root.className='pixmax-model-preview';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','3D 模型预览');
        root.innerHTML=`<section><header><strong>${escapeHtml(item.name||'3D 模型')}</strong><button type="button" aria-label="关闭 3D 模型预览">×</button></header><div data-model-stage><canvas aria-label="3D 模型视图"></canvas><p role="status">正在加载模型…</p></div><footer><span>拖动旋转 · 滚轮缩放 · 右键平移</span><button type="button" data-model-reset>复位</button><button type="button" data-model-download>下载模型</button></footer></section>`;
        document.body.appendChild(root);
        const current={root,node,closed:false,abort:new AbortController(),frame:0,valid:()=>!current.closed&&canvas===origin&&scope()===originalScope&&!window.CanvasSession?.paused&&(historyValid?historyValid():nodes.includes(node)&&node.images?.some(value=>identity(value.url)===source)),escape:event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}},visibility:null};active=current;
        current.observer=new MutationObserver(()=>{if(active===current&&(!root.isConnected||!current.valid()))close();});current.observer.observe(document.body,{childList:true,subtree:true});
        root.querySelector('header button').onclick=close;root.addEventListener('mousedown',event=>event.stopPropagation());root.addEventListener('contextmenu',event=>event.preventDefault());document.addEventListener('keydown',current.escape,true);window.addEventListener('pagehide',close);
        root.querySelector('[data-model-download]').onclick=()=>{if(current.valid())downloadPreviewFile(item);};
        const status=root.querySelector('[role=status]');
        try{
            const [{canvasModelGraphics:g},response]=await Promise.all([import('/static/vendor/pixmax/editors.js'),fetch(displayMediaUrl(item),{signal:current.abort.signal})]);
            if(!current.valid()){if(active===current)close();return;}if(!response.ok)throw new Error('模型文件暂不可读取');
            const content=await response.arrayBuffer();if(!current.valid()){if(active===current)close();return;}
            const loader=new g.GLTFLoader(),gltf=await new Promise((resolve,reject)=>loader.parse(content,new URL('.',new URL(displayMediaUrl(item),location.href)).href,resolve,reject));
            if(!current.valid()){disposeModel(gltf.scene);if(active===current)close();return;}current.model=gltf.scene;
            const bounds=new g.Box3().setFromObject(gltf.scene);if(bounds.isEmpty())throw new Error('模型没有可预览的几何内容');
            const center=bounds.getCenter(new g.Vector3()),size=bounds.getSize(new g.Vector3()),length=Math.max(size.x,size.y,size.z,.01),distance=length/(2*Math.tan(Math.PI/8))*1.6;
            const renderer=new g.WebGLRenderer({canvas:root.querySelector('canvas'),antialias:true,preserveDrawingBuffer:true});current.renderer=renderer;renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0x17191d,1);
            const scene=new g.Scene(),camera=new g.PerspectiveCamera(45,1,Math.max(.001,distance/1000),Math.max(100,distance*100));current.camera=camera;
            camera.position.copy(center).add(new g.Vector3(distance,.65*distance,distance));scene.add(gltf.scene,new g.AmbientLight(0xffffff,2));const light=new g.DirectionalLight(0xffffff,4);light.position.copy(center).add(new g.Vector3(length*3,length*5,length*4));light.target.position.copy(center);scene.add(light,light.target);
            const controls=new g.OrbitControls(camera,renderer.domElement);current.controls=controls;controls.target.copy(center);controls.enableDamping=true;controls.update();controls.saveState();root.querySelector('[data-model-reset]').onclick=()=>{if(current.valid()){controls.enableDamping=false;controls.update();controls.reset();controls.enableDamping=true;}};
            const stage=root.querySelector('[data-model-stage]');
            function schedule(){if(!current.frame&&!document.hidden&&current.valid())current.frame=requestAnimationFrame(frame);}
            function resize(){if(!current.valid())return;const width=stage.clientWidth,height=stage.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();schedule();}
            current.resize=new ResizeObserver(resize);current.resize.observe(stage);resize();
            function frame(){current.frame=0;if(!current.valid()){if(active===current)close();return;}if(document.hidden)return;controls.update();renderer.render(scene,camera);root.dataset.renderedTriangles=String(renderer.info.render.triangles);}
            controls.addEventListener('change',schedule);
            current.visibility=()=>{if(document.hidden){cancelAnimationFrame(current.frame);current.frame=0;}else schedule();};document.addEventListener('visibilitychange',current.visibility);schedule();status.textContent='模型已载入';
        }catch(error){if(current.valid()&&root.isConnected)status.textContent=error.message||'模型预览失败，请下载后核对';}
    }
    window.PixmaxModelPreview=Object.freeze({open,openAsset:(item,valid)=>open({images:[item]},0,valid),close,documentChanged,get state(){return active?{opened:true,triangles:Number(active.root.dataset.renderedTriangles||0),camera:active.camera?.position.toArray(),frame:active.frame}: {opened:false};}});
})();
