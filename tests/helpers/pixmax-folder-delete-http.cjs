/* Actual browser controls use authenticated ASGI/PG through this JSON bridge. */
const assert=require('node:assert/strict'),readline=require('node:readline');
const {fixture}=require('./canvas-browser.cjs');
const lines=readline.createInterface({input:process.stdin}),requests=new Map();let sequence=0,resolveInitial;
const initial=new Promise(resolve=>resolveInitial=resolve);
lines.on('line',line=>{const message=JSON.parse(line);if(message.initial)return resolveInitial(message.initial);const resolve=requests.get(message.id);requests.delete(message.id);resolve(message);});
const watchdog=setTimeout(()=>{console.error('Folder/browser bridge timed out');process.exit(2);},45000);watchdog.unref();
async function transport(request){
    const url=new URL(request.url());if(!url.pathname.startsWith('/api/canvas-folders')&&!url.pathname.startsWith('/api/canvases'))return;
    const id=++sequence,answer=new Promise(resolve=>requests.set(id,resolve));process.stdout.write(JSON.stringify({id,path:url.pathname+url.search,method:request.method(),headers:request.headers(),body:request.postData()})+'\n');return answer;
}
(async()=>{
    const config=await initial,cleanup=[];
    try{
        const {page,errors}=await fixture({after:fn=>cleanup.push(fn)},'smart',true,{secureOrigin:true,navigatorOpen:true,origin:'http://testserver',record:config.canvas,permissions:['canvas.read','canvas.edit','canvas.create','canvas.delete','canvas.restore'],apiHandler:transport});
        await page.evaluate(config=>{window.__folderOptions=MemberCanvasEdit.options;CanvasSession.context.member.id=config.member;CanvasSession.context.workspace.id=config.workspace;CanvasSession.storageKey=key=>config.member+':'+config.workspace+':'+key;},config);
        await page.addScriptTag({url:'/static/js/member-canvas-edit.js'});
        await page.evaluate(async()=>{await MemberCanvasEdit.mount(__folderOptions);await MemberCanvasEdit.active.lease.start(MemberCanvasEdit.active.options.reload);await PixmaxNavigator.refresh();nodes[0].text='真实浏览器最终保存';smartCanvasDirty=true;});
        await page.locator('[data-folder-menu="'+config.folder+'"]').click();await page.getByRole('menuitem',{name:'永久删除文件夹',exact:true}).click();await page.locator('#canvasNameField').fill(config.name);await page.getByRole('button',{name:'永久删除',exact:true}).click();await page.waitForURL('**/workspaces/'+config.workspace);
        assert.deepEqual(errors,[]);process.stdout.write(JSON.stringify({done:true})+'\n');
    }finally{for(const close of cleanup.reverse())await close();clearTimeout(watchdog);lines.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error.stack);process.exit(1);});
