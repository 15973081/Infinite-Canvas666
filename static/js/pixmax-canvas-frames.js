/* Visual groups preserve absolute member positions and never become task inputs. */
(() => {
    'use strict';
    const isFrame=node=>node?.type==='smart-frame';
    function index(){
        const build=()=>{const byId=new Map(nodes.map(node=>[node.id,node])),children=new Map();for(const node of nodes){if(!node.frameId||!isFrame(byId.get(node.frameId)))continue;if(!children.has(node.frameId))children.set(node.frameId,[]);children.get(node.frameId).push(node);}return {byId,children};};
        return smartWorkspaceView.frameIndex(build);
    }
    function expand(ids){const result=new Set(),graph=index(),visit=id=>{if(result.has(id)||!graph.byId.has(id))return;result.add(id);if(isFrame(graph.byId.get(id)))for(const node of graph.children.get(id)||[])visit(node.id);};ids.forEach(visit);return [...result];}
    function rect(node,seen=new Set(),graph=null,unfrozen=false){
        const saved=!unfrozen&&typeof dragState!=='undefined'&&dragState?.frameRects?.get(node.id);
        if(saved){const moved=dragState.group?.find(item=>item.id===node.id);return moved?{...saved,x:saved.x+(node.x||0)-moved.ox,y:saved.y+(node.y||0)-moved.oy}:{...saved};}
        if(seen.has(node.id))return {x:Number(node.x)||0,y:Number(node.y)||0,width:Number(node.w)||240,height:Number(node.h)||160};
        graph||=index();const children=graph.children.get(node.id)||[];if(!children.length)return {x:Number(node.x)||0,y:Number(node.y)||0,width:Number(node.w)||240,height:Number(node.h)||160};
        seen.add(node.id);const boxes=children.map(child=>isFrame(child)?rect(child,seen,graph,unfrozen):nodeRect(child));seen.delete(node.id);
        const x=Math.min(...boxes.map(box=>box.x))-20,y=Math.min(...boxes.map(box=>box.y))-(Number(node.framePaddingTop)||20);
        return {x,y,width:Math.max(...boxes.map(box=>box.x+box.width))+20-x,height:Math.max(...boxes.map(box=>box.y+box.height))+20-y};
    }
    function create(ids,{label='分组',skipUndo=false,select=true,deferRender=false,paddingTop=20,allowGrouped=false}={}){
        if(isSmartCanvasLocked())return null;
        const selectedFrames=new Set(ids.filter(id=>isFrame(nodes.find(node=>node.id===id)))),expanded=expand(ids),members=expanded.map(id=>nodes.find(node=>node.id===id)).filter(node=>node&&!isFrame(node)&&(allowGrouped||!node.frameId||selectedFrames.has(node.frameId)));if(members.length<2)return null;
        if(!canvasTaskWriteGuard(...members).valid())return null;
        if(!skipUndo)pushUndo();
        const oldFrames=new Set(expanded.filter(id=>isFrame(nodes.find(node=>node.id===id)))),memberIds=new Set(members.map(node=>node.id)),frame={id:uid('frame'),type:'smart-frame',label:String(label||'分组'),x:0,y:0,w:240,h:160,framePaddingTop:paddingTop,images:[],created_at:Date.now()};
        for(const parentId of new Set(members.map(node=>node.frameId).filter(Boolean)))if(nodes.filter(node=>node.frameId===parentId).every(node=>memberIds.has(node.id)))oldFrames.add(parentId);
        nodes=nodes.filter(node=>!oldFrames.has(node.id));nodes.forEach(node=>{if(oldFrames.has(node.frameId))delete node.frameId;});
        nodes.push(frame);members.forEach(node=>node.frameId=frame.id);Object.assign(frame,(()=>{const box=rect(frame);return {x:box.x,y:box.y,w:box.width,h:box.height};})());
        if(select)smartSelection.insertedNodes([frame.id]);if(!deferRender){render();scheduleSave();}return frame;
    }
    function ungroup(ids){
        if(isSmartCanvasLocked())return false;
        const frames=new Set(ids.map(id=>{const node=nodes.find(node=>node.id===id);return isFrame(node)?node.id:node?.frameId;}).filter(id=>isFrame(nodes.find(node=>node.id===id))));if(!frames.size)return false;
        if(!canvasTaskWriteGuard(...[...frames].map(id=>nodes.find(node=>node.id===id))).valid())return false;
        pushUndo();const members=nodes.filter(node=>frames.has(node.frameId));members.forEach(node=>delete node.frameId);nodes=nodes.filter(node=>!frames.has(node.id));smartSelection.insertedNodes(members.map(node=>node.id));render();scheduleSave();return true;
    }
    function deletionIds(ids){
        const result=new Set(expand(ids));let changed=true;
        while(changed){changed=false;for(const frame of nodes.filter(isFrame)){const children=nodes.filter(node=>node.frameId===frame.id);if(!result.has(frame.id)&&children.length&&children.every(node=>result.has(node.id))){result.add(frame.id);changed=true;}}}
        return [...result];
    }
    function remapReferences(node,map){if(node.frameId){const id=map.get(node.frameId);if(id)node.frameId=id;else delete node.frameId;}}
    function renderFrame(node){const box=rect(node);return `<div class="image-node pixmax-frame-node ${isNodeSelected(node.id)?'selected':''}" data-id="${escapeAttr(node.id)}" style="left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px"><header class="pixmax-frame-header"><span data-frame-title role="button" tabindex="0" aria-label="分组 ${escapeAttr(node.label||'分组')}">${escapeHtml(node.label||'分组')}</span></header></div>`;}
    function bind(element,node){
        const title=element.querySelector('[data-frame-title]');
        element.onclick=event=>{event.stopPropagation();if(Date.now()>=suppressNodeClickUntil)smartSelection.clickNode(node.id,element);};
        element.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();openSmartCanvasContext(event,node);};
        title.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();smartSelection.clickNode(node.id,element);}if(event.key==='F2'){event.preventDefault();event.stopPropagation();rename();}};
        function rename(){
            if(isSmartCanvasLocked()||title.querySelector('input'))return;
            const guard=canvasTaskWriteGuard(node),original=node.label||'分组',input=document.createElement('input');input.value=original;input.maxLength=180;input.setAttribute('aria-label','分组名称');title.replaceChildren(input);input.focus();input.select();let cancel=false;
            input.onmousedown=event=>event.stopPropagation();input.onclick=event=>event.stopPropagation();input.onkeydown=event=>{event.stopPropagation();if(event.key==='Escape'){cancel=true;input.blur();}else if(event.key==='Enter')input.blur();};
            input.onblur=()=>{const value=input.value.trim();if(!cancel&&value&&value!==original&&guard.valid()&&!isSmartCanvasLocked()){pushUndo();node.label=value;scheduleSave();}if(nodes.includes(node))render();};
        }
        title.ondblclick=event=>{event.preventDefault();event.stopPropagation();rename();};
        const beginDrag=event=>{
            if(event.button!==0||event.detail>=2||event.target.closest('input')||isSmartCanvasLocked()||shell.dataset.tool==='pan'||pixmaxSpacePanning)return;
            event.preventDefault();event.stopPropagation();document.activeElement?.blur?.();let frame=node;if(event.altKey)frame=duplicateForAltDrag(node);
            const ids=expand(isNodeSelected(frame.id)?selectedNodeIds():[frame.id]);capturePendingUndo();
            for(const id of ids){const item=nodes.find(node=>node.id===id);if(isFrame(item)){const box=rect(item);item.x=box.x;item.y=box.y;item.w=box.width;item.h=box.height;}}
            dragState={id:frame.id,startX:event.clientX,startY:event.clientY,ox:frame.x,oy:frame.y,originCanvas:canvas,frameGuard:canvasTaskWriteGuard(...ids.map(id=>nodes.find(node=>node.id===id))),group:ids.map(id=>{const item=nodes.find(node=>node.id===id);return {id,node:item,ox:item.x||0,oy:item.y||0};}),groupIds:ids,ctrlGroup:false};document.body.classList.add('smart-node-drag');
            prepareDrag(dragState);
        };
        title.onmousedown=beginDrag;element.onmousedown=beginDrag;element.ondblclick=event=>event.stopPropagation();
    }
    function ancestors(ids){const graph=index(),result=new Set();for(const id of ids){let node=graph.byId.get(id);const seen=new Set();while(node?.frameId&&!seen.has(node.frameId)){seen.add(node.frameId);const parent=graph.byId.get(node.frameId);if(!isFrame(parent))break;result.add(parent.id);node=parent;}}return [...result];}
    function updateElements(ids){for(const id of new Set([...ids.filter(id=>isFrame(nodes.find(node=>node.id===id))),...ancestors(ids)])){const node=nodes.find(node=>node.id===id),element=world.querySelector(`.pixmax-frame-node[data-id="${CSS.escape(id)}"]`);if(!node||!element)continue;const box=rect(node);Object.assign(element.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px'});}}
    function layoutAndGroup(ids,{label,anchor,columns=Math.ceil(Math.sqrt(ids.length)),colGap=80,rowGap=80,side,owner}={}){
        const members=ids.map(id=>nodes.find(node=>node.id===id)).filter(Boolean);if(!members.length)return null;
        if(isSmartCanvasLocked()||!canvasTaskWriteGuard(...members).valid())return null;
        const layouts=members.map(node=>({id:node.id,width:nodeRect(node).width,height:nodeRect(node).height})),positions=window.PixmaxCanvasLayout.grid(layouts,{columns,colGap,rowGap,anchor:anchor||{x:0,y:0}});
        let dx=0,dy=0;if(side==='left'&&owner){const boxes=layouts.map(item=>({...positions.get(item.id),width:item.width,height:item.height})),right=Math.max(...boxes.map(box=>box.x+box.width)),minY=Math.min(...boxes.map(box=>box.y)),maxY=Math.max(...boxes.map(box=>box.y+box.height)),target=nodeRect(owner);dx=target.x-80-right;dy=target.y+target.height/2-(minY+maxY)/2;}
        members.forEach(node=>{const point=positions.get(node.id);node.x=point.x+dx;node.y=point.y+dy;});return members.length>1?create(ids,{label,skipUndo:true,select:false,deferRender:true,paddingTop:44,allowGrouped:true}):null;
    }
    const intersects=(frame,node)=>!(frame.x+frame.width<node.x||node.x+node.width<frame.x||frame.y+frame.height<node.y||node.y+node.height<frame.y);
    const contains=(frame,node)=>node.x>=frame.x&&node.y>=frame.y&&node.x+node.width<=frame.x+frame.width&&node.y+node.height<=frame.y+frame.height;
    function prepareDrag(state){
        const frames=nodes.filter(isFrame);if(!frames.length)return;
        state.frameRects=withSmartComputation(()=>new Map(frames.map(frame=>[frame.id,rect(frame)])));state.originCanvas=canvas;
        for(const item of state.group||[])item.node||=nodes.find(node=>node.id===item.id);
        state.frameGuard=canvasTaskWriteGuard(...(state.group||[]).map(item=>item.node));
    }
    function candidate(node,state){
        const box=nodeRect(node),moved=new Set(state.groupIds||[]);
        // Native newly-created groups precede older groups in the node array.
        return [...nodes].reverse().find(frame=>isFrame(frame)&&frame.id!==node.id&&!moved.has(frame.id)&&contains(rect(frame),box));
    }
    function previewDrag(state){
        if(!state?.frameRects)return;const targets=new Set();
        for(const item of state.group||[]){const node=nodes.find(node=>node.id===item.id);if(!node||isFrame(node)||state.groupIds?.includes(node.frameId))continue;const target=candidate(node,state);if(target&&target.id!==node.frameId)targets.add(target.id);}
        world.querySelectorAll('.pixmax-frame-node').forEach(element=>element.classList.toggle('frame-drop-target',targets.has(element.dataset.id)));
    }
    function reconcileDrag(state){
        if(!state?.frameRects||!state.frameGuard?.valid()||canvas!==state.originCanvas)return;
        const moved=new Set(state.groupIds||[]),touched=new Set();
        for(const item of state.group||[]){const node=nodes.find(node=>node.id===item.id);if(!node||isFrame(node)||!node.frameId||moved.has(node.frameId))continue;const parent=nodes.find(frame=>frame.id===node.frameId&&isFrame(frame)),target=candidate(node,state);if(!parent||!intersects(rect(parent),nodeRect(node))||target&&target.id!==parent.id){touched.add(node.frameId);delete node.frameId;}}
        for(const item of state.group||[]){const node=nodes.find(node=>node.id===item.id);if(!node||isFrame(node)||moved.has(node.frameId))continue;if(!node.frameId){const target=candidate(node,state);if(target){node.frameId=target.id;touched.add(target.id);}}if(node.frameId)touched.add(node.frameId);}
        for(const id of touched){const frame=nodes.find(node=>node.id===id&&isFrame(node));if(!frame)continue;frame.framePaddingTop=20;const box=nodes.some(node=>node.frameId===id)?rect(frame,new Set(),index(),true):state.frameRects.get(id)||rect(frame);Object.assign(frame,{x:box.x,y:box.y,w:box.width,h:box.height});}
        world.querySelectorAll('.frame-drop-target').forEach(element=>element.classList.remove('frame-drop-target'));
    }
    function cancelFrameGesture(force=false){
        if(typeof dragState==='undefined'||!dragState?.frameGuard||!force&&dragState.frameGuard.valid())return;
        const previous=dragState;dragState=null;
        if(canvas===previous.originCanvas)for(const item of previous.group||[]){if(nodes.includes(item.node)){item.node.x=item.ox;item.node.y=item.oy;}}
        discardPendingUndo();clearDropHighlight();document.body.classList.remove('smart-node-drag');if(canvas===previous.originCanvas)render();
    }
    window.addEventListener('mousemove',()=>cancelFrameGesture(),true);window.addEventListener('mouseup',()=>cancelFrameGesture(),true);window.addEventListener('pagehide',()=>cancelFrameGesture(true));
    window.PixmaxCanvasFrames=Object.freeze({isFrame,rect,expand,create,ungroup,deletionIds,remapReferences,render:renderFrame,bind,ancestors,updateElements,layoutAndGroup,prepareDrag,previewDrag,reconcileDrag});
})();
