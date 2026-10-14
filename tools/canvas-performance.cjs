// Local, repeatable synchronous geometry benchmark. This is not an FPS or
// Pixmax-server benchmark; HTTP and membership are isolated by the fixture.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture}=require('../tests/helpers/canvas-browser.cjs');

async function main(){
    const output=process.argv[2]||'.local/canvas-performance.json',results=[];
    for(const count of [181,1000,3000]){
        const cleanup=[],record={nodes:Array.from({length:count},(_,index)=>({id:'n'+index,type:'smart-prompt',x:index%25*320,y:Math.floor(index/25)*320,text:'测试节点 '+index,images:[]})),
            connections:Array.from({length:count-1},(_,index)=>({from:'n'+index,to:'n'+(index+1),kind:'input'}))};
        try{
            const {page,errors}=await fixture({after:fn=>cleanup.push(fn)},'smart',false,{record});
            const result=await page.evaluate(async()=>{
                await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                const target=nodes[Math.floor(nodes.length/2)],samples=[];
                for(let index=0;index<110;index++){
                    target.x+=index%2?1:-1;
                    const start=performance.now();refreshConnectionLayer([target.id]);
                    if(index>=10)samples.push(performance.now()-start);
                }
                samples.sort((a,b)=>a-b);
                return {nodes:nodes.length,edges:canvas.connections.length,samples:samples.length,
                    medianMs:samples[Math.floor(samples.length/2)],p95Ms:samples[Math.floor(samples.length*.95)],
                    connectionGroups:document.querySelectorAll('.smart-connection').length,userAgent:navigator.userAgent};
            });
            assert.deepEqual(errors,[]);assert.equal(result.connectionGroups,count-1);results.push(result);
        }finally{for(const close of cleanup.reverse())await close();}
    }
    const report={date:new Date().toISOString(),metric:'Synchronous scoped connection refresh; 10 warmups and 100 samples; synthetic text nodes, chain edges; excludes frame paint and remote generation',results};
    fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
