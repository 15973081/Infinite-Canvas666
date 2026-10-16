/* Independent crop / annotation tools. Export creates a new node; source is immutable. */
(() => {
    'use strict';
    let current;
    const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const button=(text,fn)=>{const n=el('button',text);n.type='button';n.onclick=fn;return n;};
    function open(node,index,mode){
        if(!['crop','brush'].includes(mode)||isSmartCanvasLocked())return;
        if(current&&!current.close())return;
        const source=node.images?.[index],url=source?.url;if(!url)return;
        const guard=canvasTaskWriteGuard(node),origin=canvas,resource=CanvasEditableImage.create(window),previous=document.activeElement;
        const root=el('dialog',undefined,'pixmax-image-tool');root.setAttribute('aria-label',mode==='crop'?'裁剪图片':'图片标记');
        const head=el('header'),title=el('strong',mode==='crop'?'裁剪图片':'图片标记'),toolbar=el('div',undefined,'pixmax-image-tool-controls'),stage=el('div',undefined,'pixmax-image-tool-stage'),frame=el('div',undefined,'pixmax-image-tool-frame'),surface=el('canvas'),box=el('div',undefined,'pixmax-crop-selection'),status=el('p','','pixmax-image-tool-status');status.setAttribute('role','status');
        let image=null,stopped=false,busy=false,dirty=false,commands=[],redo=[],draft=null,drag=null,ratio=NaN,crop={x:0,y:0,w:1,h:1};
        const valid=()=>!stopped&&root.isConnected&&canvas===origin&&guard.valid()&&nodes.includes(node)&&node.images?.[index]===source&&source.url===url;
        function close(force=false){if(stopped)return true;if(!force&&(busy||dirty)&&!window.confirm(busy?'图片正在保存，关闭后不会自动插入结果。确定关闭？':'标记或裁剪尚未保存，确定关闭？'))return false;stopped=true;resource.clear();observer.disconnect();resize.disconnect();window.removeEventListener('member-session:paused',pause);surface.width=surface.height=0;root.close();root.remove();if(current?.element===root)current=null;if(previous?.isConnected)previous.focus();return true;}
        const pause=()=>close(true),observer=new MutationObserver(()=>{if(!valid())close(true);});
        function fit(){if(!image)return;const style=getComputedStyle(stage),w=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),h=stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom),scale=Math.min(w/image.naturalWidth,h/image.naturalHeight);frame.style.width=Math.max(1,image.naturalWidth*scale)+'px';frame.style.height=Math.max(1,image.naturalHeight*scale)+'px';}
        const resize=new ResizeObserver(fit);
        const cancel=button('取消',()=>close()),save=button('保存为新节点',()=>void submit());save.disabled=true;save.className='primary';head.append(title,toolbar,save,cancel);
        const tool=el('select'),color=el('input'),size=el('input');tool.setAttribute('aria-label','标记工具');color.type='color';color.value='#ea4335';color.setAttribute('aria-label','标记颜色');size.type='range';size.min=1;size.max=40;size.value=4;size.setAttribute('aria-label','笔刷大小');
        const undo=button('撤销',()=>{if(busy||!commands.length)return;redo.push(commands.pop());dirty=true;draw();}),repeat=button('重做',()=>{if(busy||!redo.length)return;commands.push(redo.pop());dirty=true;draw();});
        if(mode==='crop'){
            const select=el('select');select.setAttribute('aria-label','裁剪比例');for(const [text,value]of [['自由','free'],['原始比例','original'],['4 : 3','1.3333333333333333'],['3 : 4','.75'],['16 : 9','1.7777777777777777'],['9 : 16','.5625'],['21 : 9','2.3333333333333335']])select.append(new Option(text,value));
            select.onchange=()=>{if(!image||busy)return;ratio=select.value==='free'?NaN:select.value==='original'?image.naturalWidth/image.naturalHeight:Number(select.value);resetCrop();dirty=true;};toolbar.append(select,button('重置',()=>{if(!busy){resetCrop();dirty=false;}}));
            for(const edge of ['n','ne','e','se','s','sw','w','nw']){const handle=el('span',undefined,'pixmax-crop-handle '+edge);handle.dataset.edge=edge;box.append(handle);}frame.append(box);
        }else{
            for(const [name,value]of [['画笔','pen'],['直线','line'],['箭头','arrow'],['矩形','rect'],['椭圆','ellipse'],['文字','text']])tool.append(new Option(name,value));
            toolbar.append(tool,color,size,undo,repeat,button('清空',()=>{if(!busy&&commands.length){commands=[];redo=[];dirty=true;draw();}}));
        }
        const text=el('input');text.placeholder='输入标记文字';text.maxLength=200;text.setAttribute('aria-label','标记文字');text.hidden=true;tool.onchange=()=>{text.hidden=tool.value!=='text';};if(mode==='brush')toolbar.append(text);
        frame.prepend(surface);stage.append(frame);root.append(head,stage,status);document.body.append(root);root.showModal();current={element:root,close};
        function resetCrop(){if(!image)return;let w=image.naturalWidth,h=image.naturalHeight;if(Number.isFinite(ratio)){w=Math.min(w,h*ratio);h=w/ratio;}crop={x:(image.naturalWidth-w)/2,y:(image.naturalHeight-h)/2,w,h};paintCrop();}
        function paintCrop(){if(!image)return;Object.assign(box.style,{left:crop.x/image.naturalWidth*100+'%',top:crop.y/image.naturalHeight*100+'%',width:crop.w/image.naturalWidth*100+'%',height:crop.h/image.naturalHeight*100+'%'});box.setAttribute('aria-label',`裁剪区域 ${Math.round(crop.w)} × ${Math.round(crop.h)}`);}
        function point(e){const r=surface.getBoundingClientRect();return {x:Math.max(0,Math.min(surface.width,(e.clientX-r.left)*surface.width/r.width)),y:Math.max(0,Math.min(surface.height,(e.clientY-r.top)*surface.height/r.height))};}
        function paintCommand(ctx,c){const a=c.points[0],b=c.points.at(-1);ctx.strokeStyle=ctx.fillStyle=c.color;ctx.lineWidth=c.size;ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();
            if(c.tool==='text'){ctx.font=`${Math.max(18,c.size*5)}px sans-serif`;ctx.fillText(c.text,a.x,a.y);return;}
            if(c.tool==='rect')ctx.rect(a.x,a.y,b.x-a.x,b.y-a.y);else if(c.tool==='ellipse')ctx.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.abs(b.x-a.x)/2,Math.abs(b.y-a.y)/2,0,0,Math.PI*2);
            else{ctx.moveTo(a.x,a.y);if(c.tool==='pen'){for(const p of c.points)ctx.lineTo(p.x,p.y);if(c.points.length===1)ctx.lineTo(a.x+.1,a.y+.1);}else ctx.lineTo(b.x,b.y);if(c.tool==='arrow'){const angle=Math.atan2(b.y-a.y,b.x-a.x),len=Math.max(12,c.size*4);ctx.moveTo(b.x-Math.cos(angle-.5)*len,b.y-Math.sin(angle-.5)*len);ctx.lineTo(b.x,b.y);ctx.lineTo(b.x-Math.cos(angle+.5)*len,b.y-Math.sin(angle+.5)*len);}}ctx.stroke();}
        function draw(){if(!image)return;const ctx=surface.getContext('2d');ctx.clearRect(0,0,surface.width,surface.height);ctx.drawImage(image,0,0);for(const c of commands)paintCommand(ctx,c);if(draft)paintCommand(ctx,draft);undo.disabled=busy||!commands.length;repeat.disabled=busy||!redo.length;}
        frame.onpointerdown=e=>{if(e.button!==0||!image||busy||!valid())return;e.preventDefault();frame.setPointerCapture(e.pointerId);const p=point(e);if(mode==='crop'){if(!box.contains(e.target))return;drag={point:p,crop:{...crop},edge:e.target.dataset.edge||'move'};return;}
            if(tool.value==='text'&&!text.value.trim()){status.textContent='请先填写标记文字，再点击图片放置。';return;}draft={tool:tool.value,color:color.value,size:Number(size.value),text:text.value,points:[p]};draw();};
        frame.onpointermove=e=>{if(!image||busy||!valid())return;const p=point(e);if(draft){if(draft.tool==='pen')draft.points.push(p);else draft.points=[draft.points[0],p];draw();}
            if(!drag)return;const c=drag.crop,edge=drag.edge,dx=p.x-drag.point.x,dy=p.y-drag.point.y,W=image.naturalWidth,H=image.naturalHeight;
            if(edge==='move')crop={...c,x:Math.max(0,Math.min(W-c.w,c.x+dx)),y:Math.max(0,Math.min(H-c.h,c.y+dy))};
            else{let left=c.x,top=c.y,right=c.x+c.w,bottom=c.y+c.h;if(edge.includes('w'))left=Math.max(0,Math.min(right-1,left+dx));if(edge.includes('e'))right=Math.min(W,Math.max(left+1,right+dx));if(edge.includes('n'))top=Math.max(0,Math.min(bottom-1,top+dy));if(edge.includes('s'))bottom=Math.min(H,Math.max(top+1,bottom+dy));
                let w=right-left,h=bottom-top;if(Number.isFinite(ratio)){if(edge==='n'||edge==='s')w=h*ratio;else h=w/ratio;const anchorX=edge.includes('w')?c.x+c.w:c.x,anchorY=edge.includes('n')?c.y+c.h:c.y,maxW=edge.includes('w')?anchorX:W-anchorX,maxH=edge.includes('n')?anchorY:H-anchorY;w=Math.min(w,maxW,maxH*ratio);h=w/ratio;left=edge.includes('w')?anchorX-w:anchorX;top=edge.includes('n')?anchorY-h:anchorY;}crop={x:left,y:top,w,h};}dirty=true;paintCrop();};
        function end(){if(draft){commands.push(draft);draft=null;redo=[];dirty=true;draw();}drag=null;}
        frame.onpointerup=end;frame.onpointercancel=()=>{draft=null;drag=null;draw();};frame.onlostpointercapture=()=>{if(draft)end();drag=null;};
        async function load(retry=false){status.textContent='正在加载原图…';save.disabled=true;try{const result=await resource.load(displayMediaUrl(source),{retry});if(!valid())return;image=result.image;surface.width=image.naturalWidth;surface.height=image.naturalHeight;fit();draw();resetCrop();status.textContent='';save.disabled=false;}catch(error){if(valid())status.replaceChildren(el('span',error.message),button('重试原图',()=>load(true)));}}
        async function submit(){if(busy||!image||!valid())return;if(mode==='brush'&&!commands.length){status.textContent='请先添加标记。';return;}busy=true;root.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);status.textContent='正在保存…';
            try{const output=document.createElement('canvas');if(mode==='crop'){const sx=Math.round(crop.x),sy=Math.round(crop.y);output.width=Math.max(1,Math.min(image.naturalWidth-sx,Math.round(crop.w)));output.height=Math.max(1,Math.min(image.naturalHeight-sy,Math.round(crop.h)));output.getContext('2d').drawImage(image,sx,sy,output.width,output.height,0,0,output.width,output.height);}else{output.width=surface.width;output.height=surface.height;output.getContext('2d').drawImage(surface,0,0);}
                const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw Error('图片导出失败。');if(!valid())return;const base=(source.name||'image').replace(/\.[^.]+$/,''),form=new FormData();form.append('files',blob,base+(mode==='crop'?'-裁剪':'-标记')+'.png');const data=await CanvasApi.uploadAi(form);if(!valid())return;const file=data.files?.[0];if(!file?.url)throw Error('图片保存失败，未收到结果文件。');const rect=nodeRect(node);pushUndo();const result=createNode(rect.x+rect.width+50,rect.y,[{...file,kind:'image',natural_w:output.width,natural_h:output.height}],{skipUndo:true,deferRender:true});delete result.generationKind;delete result.runSettings;result.pixmaxSourceType='BASE_IMAGE';render();scheduleSave();dirty=false;close(true);
            }catch(error){if(valid())status.textContent=error.message||'保存失败，请重试。';}finally{busy=false;if(valid()){root.querySelectorAll('button,input,select').forEach(n=>n.disabled=false);draw();}}}
        root.addEventListener('cancel',e=>{e.preventDefault();close();});for(const type of ['keydown','mousedown','pointerdown','wheel','dblclick','paste'])root.addEventListener(type,e=>e.stopPropagation());
        observer.observe(document.body,{childList:true,subtree:true});resize.observe(stage);window.addEventListener('member-session:paused',pause);void load();return current;
    }
    window.PixmaxImageTools=Object.freeze({open,close:()=>current?.close(),get opened(){return Boolean(current);}});
})();
