/* Real browser drag/drop, authenticated ASGI and isolated database transport. */
const assert=require('node:assert/strict'),readline=require('node:readline');
const {fixture}=require('./canvas-browser.cjs');
const lines=readline.createInterface({input:process.stdin}),requests=new Map();let sequence=0,resolveInitial;
const initial=new Promise(resolve=>resolveInitial=resolve);
lines.on('line',line=>{const message=JSON.parse(line);if(message.initial)return resolveInitial(message.initial);const resolve=requests.get(message.id);requests.delete(message.id);resolve(message);});
const watchdog=setTimeout(()=>{console.error('Directory placement bridge timed out');process.exit(2);},45000);watchdog.unref();
async function transport(request){const url=new URL(request.url());if(!url.pathname.startsWith('/api/canvas-folders')&&!url.pathname.startsWith('/api/canvases'))return;const id=++sequence,answer=new Promise(resolve=>requests.set(id,resolve));process.stdout.write(JSON.stringify({id,path:url.pathname+url.search,method:request.method(),headers:request.headers(),body:request.postData()})+'\n');return answer;}
async function drag(page,kind,id,targetKind,target,position=.5){const source=page.locator(`[data-directory-kind="${kind}"][data-directory-id="${id}"]`),destination=page.locator(`[data-directory-kind="${targetKind}"][data-directory-id="${target}"]`),box=await destination.boundingBox();await source.dragTo(destination,{targetPosition:{x:box.width/2,y:box.height*position}});}
(async()=>{
    const config=await initial,cleanup=[];
    try{
        const {page,errors}=await fixture({after:fn=>cleanup.push(fn)},'smart',true,{secureOrigin:true,navigatorOpen:true,origin:'http://testserver',record:config.canvas,permissions:['canvas.read','canvas.edit','canvas.create'],apiHandler:transport});
        const bind=config=>{CanvasSession.context.member.id=config.member;CanvasSession.context.workspace.id=config.workspace;CanvasSession.storageKey=key=>config.member+':'+config.workspace+':'+key;};await page.evaluate(config=>window.__placementOptions=MemberCanvasEdit.options);await page.evaluate(bind,config);await page.addInitScript(bind,config);await page.addScriptTag({url:'/static/js/member-canvas-edit.js'});
        await page.evaluate(async()=>{await MemberCanvasEdit.mount(__placementOptions);await MemberCanvasEdit.active.lease.start(MemberCanvasEdit.active.options.reload);await PixmaxNavigator.refresh();});
        await drag(page,'folder',config.child,'folder',config.outside);await page.waitForFunction(config=>Boolean(document.querySelector(`[data-folder-drop="${config.outside}"] [data-folder-drop="${config.child}"]`)),config);
        await page.evaluate(()=>{nodes[0].text='真实拖放最终保存';smartCanvasDirty=true;});await drag(page,'canvas',config.canvas.id,'folder',config.child,.9);await page.waitForFunction(config=>canvas.folder_id===config.outside&&Boolean(document.querySelector(`[data-folder-drop="${config.outside}"] > [data-canvas-row="${config.canvas.id}"]`)),config);
        await drag(page,'folder',config.root,'canvas',config.canvas.id,.1);await page.waitForFunction(config=>Boolean(document.querySelector(`[data-folder-drop="${config.outside}"] [data-folder-drop="${config.root}"]`)),config);
        await page.reload();await page.waitForFunction(config=>Boolean(document.querySelector(`[data-folder-drop="${config.outside}"] > [data-canvas-row="${config.canvas.id}"]`)),config);assert.deepEqual(errors,[]);process.stdout.write(JSON.stringify({done:true})+'\n');
    }finally{for(const close of cleanup.reverse())await close();clearTimeout(watchdog);lines.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error.stack);process.exit(1);});
