/* HTTP stand-in for native UI tests; PostgreSQL ownership has separate coverage. */
module.exports=async function catalog(page){
    const motion=(uuid,name,prompt)=>({uuid,name,promptFragment:prompt,description:'镜头说明',revision:1,fileType:'IMG',assetsUuid:'ast_'+'0'.repeat(32),url:'/test-image.svg',webUrl:'/test-image.svg',previewWebUrl:'/test-image.svg',thumbnailWebUrl:'/test-image.svg',available:true,created_at:1,updated_at:1});
    const state={revision:1,mine:[motion('motion_'+'1'.repeat(32),'我的推镜','镜头平稳向人物推进')],plaza:[motion('motion_'+'2'.repeat(32),'环绕运镜','镜头缓慢绕人物环绕一周')],favorites:[],calls:[]};let sequence=3;
    await page.route('**/api/ai/upload**',route=>route.fulfill({json:{files:[{url:'/test-image.svg',kind:'image',media_asset_id:'ast_'+'0'.repeat(32)}]}}));
    await page.route('**/api/camera-motions**',async route=>{
        const request=route.request(),url=new URL(request.url()),method=request.method(),body=request.postDataJSON(),parts=url.pathname.split('/').slice(3),all=[...state.mine,...state.plaza];state.calls.push({method,path:url.pathname,body,search:url.search});
        const data=item=>({...item,favorited:state.favorites.includes(item.uuid)}),reply=extra=>route.fulfill({json:{success:true,catalog_revision:state.revision,...extra}}),conflict=()=>route.fulfill({status:409,json:{detail:{code:'camera_motion_changed'}}});
        if(method==='GET'&&!parts.length){const tab=url.searchParams.get('tab'),q=url.searchParams.get('keyword')||'',page=Number(url.searchParams.get('page')),size=Number(url.searchParams.get('page_size')),items=(tab==='mine'?state.mine:tab==='favorite'?all.filter(item=>state.favorites.includes(item.uuid)):state.plaza).filter(item=>item.name.includes(q));return reply({data:items.slice((page-1)*size,page*size).map(data),totalCount:items.length,can_manage:true});}
        const item=all.find(item=>item.uuid===parts[0]);
        if(method==='POST'){if(body.expected_revision!==state.revision)return conflict();const item=motion('motion_'+String(sequence++).padStart(32,'0'),body.name,body.prompt);state.mine.push(item);state.revision++;return reply({data:data(item)});}
        if(!item)return route.fulfill({status:404,json:{detail:'运镜不存在'}});
        if(method==='GET')return reply({data:data(item)});
        if(parts[1]==='favorite'){if(body.expected_revision!==state.revision)return conflict();state.favorites=state.favorites.filter(id=>id!==item.uuid);if(body.favorite)state.favorites.push(item.uuid);state.revision++;return reply({data:data(item)});}
        if(method==='PUT'){if(body.expected_revision!==item.revision)return conflict();Object.assign(item,{name:body.name,promptFragment:body.prompt,description:body.description,revision:item.revision+1});state.revision++;return reply({data:data(item)});}
        if(method==='DELETE'){if(Number(url.searchParams.get('expected_revision'))!==item.revision)return conflict();state.mine=state.mine.filter(value=>value!==item);state.revision++;return reply({data:null});}
        throw Error('Unexpected motion request');
    });return state;
};
