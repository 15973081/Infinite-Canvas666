const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('native reshoot crops a real segment, exports its head and tail frames, and reuses upload cache',async t=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pixmax-reshoot-'));
    t.after(()=>{assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(directory).startsWith('pixmax-reshoot-'));fs.rmSync(directory,{recursive:true,force:true});});
    const source=path.join(directory,'source.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc=size=160x90:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-y',source]);
    const {page,errors}=await fixture(t,'smart',false,{secureOrigin:true});
    await page.route('**/reshoot-source.mp4',route=>route.fulfill({path:source,contentType:'video/mp4'}));
    const result=await page.evaluate(async()=>{
        const api=(await import('/static/vendor/pixmax/editors.js')).canvasSegmentReshoot,source=await (await fetch('/reshoot-source.mp4')).blob(),uploads=[];let loads=0;
        const options={sourceUrl:'/reshoot-source.mp4',loadSource:async()=>{loads++;return source;},upload:async file=>{const index=uploads.length;uploads.push({name:file.name,type:file.type,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))});return {ok:true,assetUuid:'asset-'+index};}};
        const params=api.params({}, {sourceAssetUuid:'source-asset',startSec:2,endSec:6});
        const first=await api.prepare({...options,params});if(!first.ok)throw new Error(JSON.stringify(first));const second=await api.prepare({...options,params:first.params,cache:first.cache});
        return {first,second,uploads,loads,durationStatuses:[api.durationStatus(4),api.durationStatus(8)||null,api.durationStatus(601)],clamped:api.normalizeRange(0,50,90)};
    });
    assert.equal(result.uploads.length,3);assert.equal(result.loads,1);assert.equal(result.second.changed,false);assert.deepEqual(result.durationStatuses,['too-short',null,'too-long']);assert.equal(result.clamped.endSec-result.clamped.startSec,30);
    for(const file of result.uploads){const filename=path.join(directory,file.name);fs.writeFileSync(filename,Buffer.from(file.bytes));const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',filename],{encoding:'utf8'}));if(file.type.startsWith('video/')){assert.ok(Math.abs(Number(probe.format.duration)-4)<.15);assert.deepEqual(probe.streams.map(stream=>stream.codec_type),['video','audio']);}else assert.deepEqual([probe.streams[0].width,probe.streams[0].height],[160,90]);}
    assert.notDeepEqual(result.uploads[1].bytes,result.uploads[2].bytes);assert.deepEqual(errors,[]);
});
