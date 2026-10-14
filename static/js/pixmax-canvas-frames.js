/* Visual groups preserve absolute member positions and never become task inputs. */
(() => {
    'use strict';
    const isFrame=node=>node?.type==='smart-frame';
    function index(){
        const build=()=>{const byId=new Map(nodes.map(node=>[node.id,node])),children=new Map();for(const node of nodes){if(!node.frameId||!isFrame(byId.get(node.frameId)))continue;if(!children.has(node.frameId))children.set(node.frameId,[]);children.get(node.frameId).push(node);}return {byId,children};};
        if(typeof smartComputationContext!=='undefined'&&smartComputationContext)return smartComputationContext.frameIndex||=build();
        return build();
    }
    function expand(ids){const result=new Set(),graph=index(),visit=id=>{if(result.has(id)||!graph.byId.has(id))return;result.add(id);if(isFrame(graph.byId.get(id)))for(const node of graph.children.get(id)||[])visit(node.id);};ids.forEach(visit);return [...result];}
    function rect(node,seen=new Set(),graph=index()){
        if(seen.has(node.id))return {x:Number(node.x)||0,y:Number(node.y)||0,width:Number(node.w)||240,height:Number(node.h)||160};
        const children=graph.children.get(node.id)||[];if(!children.length)return {x:Number(node.x)||0,y:Number(node.y)||0,width:Number(node.w)||240,height:Number(node.h)||160};
        // Native outer sizes include titles; our card titles sit 24px above the body.
        seen.add(node.id);const boxes=children.map(child=>{if(isFrame(child))return rect(child,seen,graph);const box=nodeRect(child);return {...box,y:box.y-24,height:box.height+24};});seen.delete(node.id);
        const x=Math.min(...boxes.map(box=>box.x))-20,y=Math.min(...boxes.map(box=>box.y))-44;
        return {x,y,width:Math.max(...boxes.map(box=>box.x+box.width))+20-x,height:Math.max(...boxes.map(box=>box.y+box.height))+20-y};
    }
    function create(ids,{label='分组',skipUndo=false,select=true,deferRender=false}={}){
        if(isSmartCanvasLocked())return null;
        const expanded=expand(ids),members=expanded.map(id=>nodes.find(node=>node.id===id)).filter(node=>node&&!isFrame(node));if(members.length<2)return null;
        if(!canvasTaskWriteGuard(...members).valid())return null;
        if(!skipUndo)pushUndo();
        const oldFrames=new Set(expanded.filter(id=>isFrame(nodes.find(node=>node.id===id)))),memberIds=new Set(members.map(node=>node.id)),frame={id:uid('frame'),type:'smart-frame',label:String(label||'分组'),x:0,y:0,w:240,h:160,images:[],created_at:Date.now()};
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
        title.onmousedown=event=>{
            if(event.button!==0||event.detail>=2||event.target.closest('input')||isSmartCanvasLocked()||shell.dataset.tool==='pan'||pixmaxSpacePanning)return;
            event.preventDefault();event.stopPropagation();document.activeElement?.blur?.();let frame=node;if(event.altKey)frame=duplicateForAltDrag(node);
            const ids=expand(isNodeSelected(frame.id)?selectedNodeIds():[frame.id]);capturePendingUndo();
            for(const id of ids){const item=nodes.find(node=>node.id===id);if(isFrame(item)){const box=rect(item);item.x=box.x;item.y=box.y;item.w=box.width;item.h=box.height;}}
            dragState={id:frame.id,startX:event.clientX,startY:event.clientY,ox:frame.x,oy:frame.y,originCanvas:canvas,frameGuard:canvasTaskWriteGuard(...ids.map(id=>nodes.find(node=>node.id===id))),group:ids.map(id=>{const item=nodes.find(node=>node.id===id);return {id,node:item,ox:item.x||0,oy:item.y||0};}),groupIds:ids,ctrlGroup:false};document.body.classList.add('smart-node-drag');
        };
    }
    function ancestors(ids){const graph=index(),result=new Set();for(const id of ids){let node=graph.byId.get(id);const seen=new Set();while(node?.frameId&&!seen.has(node.frameId)){seen.add(node.frameId);const parent=graph.byId.get(node.frameId);if(!isFrame(parent))break;result.add(parent.id);node=parent;}}return [...result];}
    function updateElements(ids){for(const id of new Set([...ids.filter(id=>isFrame(nodes.find(node=>node.id===id))),...ancestors(ids)])){const node=nodes.find(node=>node.id===id),element=world.querySelector(`.pixmax-frame-node[data-id="${CSS.escape(id)}"]`);if(!node||!element)continue;const box=rect(node);Object.assign(element.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px'});}}
    function layoutAndGroup(ids,{label,anchor,columns=Math.ceil(Math.sqrt(ids.length)),colGap=80,rowGap=80,side,owner}={}){
        const members=ids.map(id=>nodes.find(node=>node.id===id)).filter(Boolean);if(!members.length)return null;
        if(isSmartCanvasLocked()||!canvasTaskWriteGuard(...members).valid())return null;
        const layouts=members.map(node=>({id:node.id,width:nodeRect(node).width,height:nodeRect(node).height+24})),positions=window.PixmaxCanvasLayout.grid(layouts,{columns,colGap,rowGap,anchor:anchor||{x:0,y:0}});
        let dx=0,dy=0;if(side==='left'&&owner){const boxes=layouts.map(item=>({...positions.get(item.id),width:item.width,height:item.height})),right=Math.max(...boxes.map(box=>box.x+box.width)),minY=Math.min(...boxes.map(box=>box.y)),maxY=Math.max(...boxes.map(box=>box.y+box.height)),target=nodeRect(owner);dx=target.x-80-right;dy=target.y+target.height/2-(minY+maxY)/2;}
        members.forEach(node=>{const point=positions.get(node.id);node.x=point.x+dx;node.y=point.y+dy+24;});return members.length>1?create(ids,{label,skipUndo:true,select:false,deferRender:true}):null;
    }
    function cancelFrameGesture(force=false){
        if(typeof dragState==='undefined'||!dragState?.frameGuard||!force&&dragState.frameGuard.valid())return;
        const previous=dragState;dragState=null;
        if(canvas===previous.originCanvas)for(const item of previous.group||[]){if(nodes.includes(item.node)){item.node.x=item.ox;item.node.y=item.oy;}}
        discardPendingUndo();clearDropHighlight();document.body.classList.remove('smart-node-drag');if(canvas===previous.originCanvas)render();
    }
    window.addEventListener('mousemove',()=>cancelFrameGesture(),true);window.addEventListener('mouseup',()=>cancelFrameGesture(),true);window.addEventListener('pagehide',()=>cancelFrameGesture(true));
    window.PixmaxCanvasFrames=Object.freeze({isFrame,rect,expand,create,ungroup,deletionIds,remapReferences,render:renderFrame,bind,ancestors,updateElements,layoutAndGroup});
})();
