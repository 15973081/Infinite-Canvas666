/* HTTP catalog substitute for browser interactions; PG contracts have their own suite. */
module.exports=async function subjects(page,{manage=true}={}){
    const now=Date.now(),id='sub_'+'1'.repeat(32),clone=value=>JSON.parse(JSON.stringify(value));
    const group={id,name:'摄影师主体',description:'黄昏的摄影师',created_at:now,updated_at:now,cover_url:'/test-image.svg',items:[
        {id:'sbi_'+'1'.repeat(32),kind:'text',name:'主体设定',text:'年轻摄影师，穿着蓝色外套',created_at:now,available:true},
        {id:'sbi_'+'2'.repeat(32),kind:'image',name:'主体照片',url:'/test-image.svg',created_at:now,available:true},
        {id:'sbi_'+'3'.repeat(32),kind:'audio',name:'主体声音',url:'/assets/subject-audio.mp3',created_at:now,available:true},
        {id:'sbi_'+'4'.repeat(32),kind:'video',name:'主体视频',url:'/assets/reshoot-source.mp4',created_at:now,available:true}
    ],resource_counts:{text:1,image:1,audio:1,video:1}};
    // The public fixture deliberately never serves paths outside static.
    const fs=require('node:fs'),path=require('node:path');
    await page.route('**/assets/subject-audio.mp3',route=>route.fulfill({contentType:'audio/mpeg',body:fs.readFileSync(path.join(__dirname,'../fixtures/pixmax-generated-audio.mp3'))}));
    const catalogs={PERSONAL:{owner_type:'PERSONAL',workspace_id:'workspace-1',revision:1,can_manage:manage,groups:[group]},TEAM:{owner_type:'TEAM',workspace_id:'workspace-1',revision:0,can_manage:manage,groups:[]}},calls=[];
    let sequence=5,fail=false,hold,requested;const waiting=new Set();
    const pending=new Promise(resolve=>requested=resolve);
    await page.route('**/api/subject-library**',async route=>{
        const request=route.request(),url=new URL(request.url()),method=request.method(),parts=url.pathname.split('/').slice(3),payload=request.postDataJSON()||{};
        calls.push({method,path:url.pathname,headers:request.headers(),payload});
        if(hold&&method==='GET'){requested();await new Promise(resolve=>waiting.add(resolve));}
        if(fail)return route.fulfill({status:503,json:{detail:'主体读取暂时失败'}});
        if(parts.length===0)return route.fulfill({json:{catalogs:clone(catalogs)}});
        const [owner,,groupId,,itemId]=parts,catalog=catalogs[owner],existing=catalog?.groups.find(value=>value.id===groupId);
        if(method==='GET')return route.fulfill(existing?{json:{owner_type:owner,workspace_id:catalog.workspace_id,revision:catalog.revision,can_manage:catalog.can_manage,group:clone(existing)}}:{status:404,json:{detail:'主体不存在'}});
        if(!manage)return route.fulfill({status:403,json:{detail:'没有主体管理权限'}});
        const revision=method==='DELETE'?Number(url.searchParams.get('expected_revision')):payload.expected_revision;
        if(revision!==catalog.revision)return route.fulfill({status:409,json:{detail:{code:'subject_library_changed',revision:catalog.revision}}});
        let target;
        if(parts.length===2){target={id:'sub_'+String(sequence++).padStart(32,'0'),name:payload.name,description:payload.description||'',items:[],created_at:now,updated_at:now,cover_url:''};catalog.groups.push(target);}
        else if(parts.length===3){target=existing;if(method==='DELETE')catalog.groups=catalog.groups.filter(value=>value!==target);else for(const key of ['name','description','cover_item_id'])if(key in payload)target[key]=payload[key];}
        else if(parts.length===4){target={...payload,id:'sbi_'+String(sequence++).padStart(32,'0'),created_at:now,available:true};delete target.expected_revision;existing.items.push(target);}
        else{target=existing.items.find(value=>value.id===itemId);if(method==='DELETE')existing.items=existing.items.filter(value=>value!==target);else for(const key of ['name','text'])if(key in payload)target[key]=payload[key];}
        catalog.revision++;for(const value of catalog.groups){value.resource_counts={text:0,image:0,audio:0,video:0};for(const item of value.items)value.resource_counts[item.kind]++;value.cover_url=value.items.find(item=>item.id===value.cover_item_id)?.url||value.items.find(item=>item.kind==='image')?.url||'';}
        return route.fulfill({json:{catalog:clone(catalog),target_id:target.id}});
    });
    return {id,catalogs,calls,fail(value){fail=value;},hold(){hold=true;return pending;},release(){hold=false;for(const resolve of waiting)resolve();waiting.clear();},change(update){update(group);catalogs.PERSONAL.revision++;},remove(){catalogs.PERSONAL.groups=[];catalogs.PERSONAL.revision++;}};
};
