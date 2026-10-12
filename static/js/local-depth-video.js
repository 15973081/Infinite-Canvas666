/* Browser-local image/video depth: shared model/cache, explicit result upload. */
(() => {
    const MAX_BYTES = 256 * 1024 * 1024, MAX_SECONDS = 120;
    let current;
    const pageJobs=new Set();
    let pageExitAllowed=false;
    const hasUnfinishedWork=()=>[...pageJobs].some(job=>job.pending());
    window.addEventListener('beforeunload',event=>{
        if(!pageExitAllowed && hasUnfinishedWork()){event.preventDefault();event.returnValue='';}
        pageExitAllowed=false;
    });
    window.addEventListener('frontend:will-reload',()=>{pageExitAllowed=true;});
    window.addEventListener('pagehide',()=>{for(const job of [...pageJobs])job.dispose();});
    window.addEventListener('pageshow',()=>{pageExitAllowed=false;});
    let localModelFiles;
    const settingsKey = () => {
        const context=window.CanvasSession?.context;
        return 'local-depth-settings:'+JSON.stringify([context?.member?.id || 'local',context?.workspace?.id || 'local']);
    };
    function settings(value) {
        const clean={source:['auto','modelscope','huggingface'].includes(value?.source)?value.source:'auto',
            resolution:[640,960].includes(Number(value?.resolution))?Number(value.resolution):960,
            fps:[15,30].includes(Number(value?.fps))?Number(value.fps):30};
        return clean;
    }
    function getSettings(){try{return settings(JSON.parse(localStorage.getItem(settingsKey())));}catch(_){return settings();}}
    function openSettings(){
        document.querySelector('.local-depth-settings-backdrop')?.remove();
        const previous=document.activeElement,root=document.createElement('div'),config=getSettings();
        root.className='local-depth-backdrop local-depth-settings-backdrop';
        root.innerHTML=`<section class="local-depth-dialog local-depth-settings" role="dialog" aria-modal="true" aria-label="控制中心">
            <header class="local-depth-header"><div><h2>控制中心</h2><p class="local-depth-note">本地深度视频 · 默认生成配置</p></div><button data-close aria-label="关闭">×</button></header>
            <dl><dt>分辨率</dt><dd><select data-resolution aria-label="输出分辨率"><option value="960">960px</option><option value="640">640px · 更快</option></select></dd><dt>帧率</dt><dd><select data-fps aria-label="输出帧率"><option value="30">30 fps</option><option value="15">15 fps · 更快</option></select></dd></dl>
            <p class="local-depth-note">点击视频上的“生成深度视频”，进度与结果直接显示在新节点中。原视频在浏览器处理，仅生成结果保存到画布。</p>
            <details><summary>模型与缓存</summary><dl><dt>模型</dt><dd>Depth Anything V2 Small · fp16</dd><dt>下载源</dt><dd><select data-source aria-label="模型下载源"><option value="auto">自动（优先 ModelScope）</option><option value="modelscope">ModelScope</option><option value="huggingface">Hugging Face</option></select></dd></dl>
            <p class="local-depth-note">首次下载约 49.6 MB，图片与视频共用缓存。需要 WebGPU；运行库需网络连接。视频最长 2 分钟、最大 256 MB；输出为无音轨灰度相对深度。</p>
            <div class="local-depth-actions"><button data-local>选择本地模型目录</button><button data-cache>清除模型缓存</button><input data-files type="file" webkitdirectory multiple hidden></div><p data-model-state class="local-depth-note"></p></details>
            <footer class="local-depth-actions"><span data-status role="status" class="local-depth-note"></span><button data-save>保存配置</button></footer></section>`;
        document.body.append(root);const q=selector=>root.querySelector(selector);
        q('[data-resolution]').value=config.resolution;q('[data-fps]').value=config.fps;q('[data-source]').value=config.source;
        const modelState=()=>{q('[data-model-state]').textContent=localModelFiles?'已选择本地模型，仅本次页面有效。':'使用在线下载源，自动复用缓存。';q('[data-source]').disabled=Boolean(localModelFiles);q('[data-local]').textContent=localModelFiles?'改用在线模型':'选择本地模型目录';};modelState();
        const close=()=>{root.remove();document.removeEventListener('keydown',keyboard,true);previous?.isConnected && previous.focus();};
        function keyboard(event){
            event.stopPropagation();
            if(event.key==='Escape'){event.preventDefault();close();}
            if(event.key==='Tab'){
                const controls=[...root.querySelectorAll('button:not(:disabled),select:not(:disabled),summary')].filter(el=>el.getClientRects().length);
                const first=controls[0],last=controls.at(-1);
                if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
                else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
            }
        }
        q('[data-close]').onclick=close;
        q('[data-save]').onclick=()=>{try{localStorage.setItem(settingsKey(),JSON.stringify(settings({resolution:q('[data-resolution]').value,fps:q('[data-fps]').value,source:q('[data-source]').value})));close();}catch(_){q('[data-status]').textContent='配置保存失败，请检查浏览器存储权限。';}};
        q('[data-local]').onclick=()=>{if(localModelFiles){localModelFiles=undefined;modelState();}else q('[data-files]').click();};
        q('[data-files]').onchange=event=>{
            const entries=[...event.target.files].map(file=>({file,path:file.webkitRelativePath.split('/').slice(1).join('/')}));
            const files=['config.json','preprocessor_config.json','onnx/model_fp16.onnx'].map(path=>entries.find(entry=>entry.path===path));
            if(files.some(entry=>!entry) || files[2].file.size>60*1048576 || files.slice(0,2).some(entry=>entry.file.size>1048576)){q('[data-model-state]').textContent='目录不完整或模型过大，请选择 V2 Small fp16 模型目录。';return;}
            localModelFiles=files;modelState();
        };
        q('[data-cache]').onclick=async()=>{
            const button=q('[data-cache]');button.disabled=true;
            try{for(const name of await caches.keys()){const cache=await caches.open(name);for(const req of await cache.keys()){const url=new URL(req.url);if(url.hostname==='huggingface.co' && url.pathname.startsWith('/onnx-community/depth-anything-v2-small/'))await cache.delete(req);}}q('[data-model-state]').textContent='模型缓存已清除，下次使用将重新加载。';}
            catch(_){q('[data-model-state]').textContent='缓存清理失败，请重试。';}finally{button.disabled=false;}
        };
        document.addEventListener('keydown',keyboard,true);q('[data-close]').focus();
    }
    const abortError = () => new DOMException('已取消', 'AbortError');
    function waitEvent(target, event, signal, action) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => finish(new Error('素材读取超时，请检查是否可访问')), 30000);
            const cleanup = () => {clearTimeout(timer); target.removeEventListener(event, done); target.removeEventListener('error', failed); signal.removeEventListener('abort', aborted);};
            const finish = error => {cleanup(); error ? reject(error) : resolve();};
            const done = () => finish(), failed = () => finish(new Error('浏览器无法解码此素材')), aborted = () => finish(abortError());
            target.addEventListener(event, done, {once:true}); target.addEventListener('error', failed, {once:true}); signal.addEventListener('abort', aborted, {once:true});
            if(signal.aborted) aborted(); else try {action();} catch(error) {finish(error);}
        });
    }
    function dimensions(width, height, limit) {
        const ratio = Math.min(1, limit / Math.max(width, height));
        return [Math.max(2, Math.round(width * ratio / 2) * 2), Math.max(2, Math.round(height * ratio / 2) * 2)];
    }
    function open(options) {
        if(!options.background && current?.close() === false) return current;
        const isImage = options.kind === 'image', title = isImage ? '本地深度图' : '深度视频';
        const fileName = isImage ? 'depth-image.png' : 'depth-video.mp4', mime = isImage ? 'image/png' : 'video/mp4';
        const byteLimit = isImage ? 32 * 1048576 : MAX_BYTES;
        const previousFocus = document.activeElement;
        const root = document.createElement('div'); root.className = 'local-depth-backdrop';
        root.innerHTML = `<section class="local-depth-dialog" role="dialog" aria-modal="true" aria-labelledby="localDepthTitle">
            <header class="local-depth-header"><h2 id="localDepthTitle">${title}</h2><button class="local-depth-close" aria-label="关闭">×</button></header>
            <div class="local-depth-grid"><div>${isImage ? '<img class="local-depth-preview" alt="深度图预览">' : '<video class="local-depth-preview" controls playsinline preload="none"></video>'}<div class="local-depth-meta">${isImage ? '灰度相对深度 · PNG 导出 · 图片与视频共用模型缓存' : '灰度深度 · 无音轨 · 保持原片时长'}</div></div>
            <div><dl><dt>模型</dt><dd>V2 Small · ONNX · fp16</dd><dt>下载源</dt><dd><select data-source aria-label="模型下载源"><option value="auto">自动（优先 ModelScope）</option><option value="modelscope">ModelScope</option><option value="huggingface">Hugging Face</option></select></dd><dt>分辨率</dt><dd><select data-resolution aria-label="分辨率">${isImage ? '<option value="1024">1024px</option><option value="2048">2048px</option>' : '<option value="960">960px</option><option value="640">640px</option>'}</select></dd>${isImage ? '' : '<dt>帧率</dt><dd><select data-fps aria-label="帧率"><option value="30">30 fps</option><option value="15">15 fps</option></select></dd>'}<dt>深度样式</dt><dd>灰度</dd></dl>
            <p class="local-depth-note">${isImage ? '在浏览器本地生成深度图，原图与像素不上传。' : '在浏览器本地逐帧提取，原视频与视频帧不上传。'}首次使用下载约 49.6 MB 模型，后续复用浏览器缓存。需要支持 WebGPU 的浏览器与显卡。</p>
            <p class="local-depth-note">${isImage ? '源文件不超过 32 MB、图片不超过 4000 万像素；推理输入最长边不超过 518px，输出保持比例且不放大原图。' : '最长 2 分钟，源文件不超过 256 MB。输出最长边不超过所选分辨率。逐帧推理可能耗时较长。'}</p>
            <button class="local-depth-start">开始提取</button><progress class="local-depth-progress" max="100" value="0"></progress><p class="local-depth-status" role="status" aria-live="polite">模型将在开始提取时加载。</p></div></div>
            <footer class="local-depth-actions"><button data-download disabled>下载 ${isImage ? 'PNG' : 'MP4'}</button><button data-save disabled>保存到画布（上传结果）</button><button data-local>选择本地模型目录</button><button data-cache>清除模型缓存</button><input data-model-files type="file" webkitdirectory multiple hidden></footer>
            <p class="local-depth-note" data-model-note>自动模式优先 ModelScope，失败后切换 Hugging Face，两者复用同一缓存。也可选择本地模型目录。运行库仍需 CDN 连接。</p><p class="local-depth-note"><a href="https://modelscope.cn/models/onnx-community/depth-anything-v2-small/files" target="_blank" rel="noopener noreferrer" style="color:inherit">ModelScope 模型文件</a> · <a href="https://huggingface.co/onnx-community/depth-anything-v2-small/tree/c70d1ddbcd93c9bda8098268cc3554adf5e8dd4f" target="_blank" rel="noopener noreferrer" style="color:inherit">Hugging Face 固定版本</a> · ${isImage ? '相对深度，不能作为测量距离。' : '单帧相对深度，非测量距离；视频可能出现帧间闪烁。'}</p></section>`;
        if(!options.background)document.body.append(root);
        const q = selector => root.querySelector(selector), preview = q('.local-depth-preview'), start = q('.local-depth-start'), status = q('.local-depth-status'), progress = q('progress');
        if(!options.background)preview.src = options.url;
        let controller, worker, pending = new Map(), serial = 0, result, resultUrl, inputUrl, output, busy = false, saving = false, closed = false, decoder, modelFiles, depthCanvas;
        let retained=false;
        const pageJob={pending:()=>!closed && (busy || saving || Boolean(result && !retained)),dispose:()=>{stop();saving=false;close();}};
        pageJobs.add(pageJob);
        const config=options.background?settings(options.config):getSettings();
        q('[data-source]').value=config.source;modelFiles=localModelFiles;
        if(options.background){q('[data-resolution]').value=config.resolution;if(!isImage)q('[data-fps]').value=config.fps;}
        if(modelFiles){
            q('[data-source]').disabled=true;q('[data-local]').textContent='改用在线模型';
            q('[data-model-note]').textContent='沿用控制中心选择的本地模型，仅在当前浏览器读取。';
        }
        function message(text, error=false) {if(closed) return; status.textContent = text; status.classList.toggle('local-depth-error', error);options.onProgress?.({text,progress:progress.hasAttribute('value')?Number(progress.value):null,error});}
        function stop() {
            controller?.abort(); worker?.terminate(); worker = null;
            for(const task of pending.values()) task.reject(abortError()); pending.clear();
            decoder?.pause?.(); if(decoder) {decoder.removeAttribute('src'); decoder.load?.(); decoder = null;}
            if(inputUrl) URL.revokeObjectURL(inputUrl); inputUrl = null;
        }
        function close() {
            if(saving) return false;
            if(closed) return true;
            closed = true; stop(); if(resultUrl) URL.revokeObjectURL(resultUrl);
            pageJobs.delete(pageJob);
            preview.pause?.(); preview.removeAttribute('src'); preview.load?.(); root.remove(); document.removeEventListener('keydown', keyboard, true);
            if(!options.background && previousFocus?.isConnected) previousFocus.focus(); if(current?.close === close) current = null;
            return true;
        }
        function keyboard(event) {
            event.stopPropagation();
            if(event.key === 'Escape') {event.preventDefault(); close();}
            if(event.key === 'Tab') {
                const elements = [...root.querySelectorAll('button:not(:disabled),select:not(:disabled),video,a')];
                const first = elements[0], last = elements.at(-1);
                if(event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
                else if(!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
            }
        }
        function request(type, data={}, transfer=[]) {
            const id = ++serial;
            return new Promise((resolve,reject) => {pending.set(id,{resolve,reject}); worker.postMessage({type,id,...data},transfer);});
        }
        async function loadModel(check) {
          for(let runtimeIndex=0;;runtimeIndex++){
            check();
            worker = new Worker('/static/js/local-depth-video-worker.js', {type:'module'});
            worker.onmessage = ({data}) => {
                if(data.type === 'progress') {
                    const p = data.progress;
                    const label = {modelscope:'ModelScope',huggingface:'Hugging Face',local:'本地目录'}[p.source] || '';
                    if(p.status === 'runtime') {progress.removeAttribute('value');message(`正在加载推理运行库 · ${p.source}`);}
                    else if(p.status === 'progress') {progress.value = Number(p.progress) || 0; message(`${label} 加载模型 ${p.file || ''} · ${Math.round(Number(p.progress) || 0)}%`);}
                    else if(p.status === 'source') {progress.value = 0; message(`从 ${label} 加载 ${p.file}`);}
                    else if(p.status === 'fallback') message(`当前下载源失败，正在切换 ${label} · ${p.file}`);
                    else if(p.status === 'cache') message(`复用已校验的浏览器缓存 · ${p.file}`);
                    else if(p.status === 'cache-warning') message('模型已加载，但浏览器缓存写入失败，下次可能需要重新下载。');
                    else message(p.status === 'ready' ? '模型已就绪' : `读取模型与浏览器缓存… ${p.file || ''}`);
                    return;
                }
                const task = pending.get(data.id); if(!task) return; pending.delete(data.id);
                data.type === 'error' ? task.reject(Object.assign(new Error(data.message),{stage:data.stage,retryRuntime:data.retryRuntime})) : task.resolve(data);
            };
            worker.onerror = event => {for(const task of pending.values()) task.reject(Object.assign(new Error(event.message || '无法启动本地推理线程'),{stage:'worker'})); pending.clear();};
            message(runtimeIndex?'正在切换备用推理运行库…':'加载模型与推理运行库…');
            try {await request('load',{files:modelFiles,source:q('[data-source]').value,runtimeIndex});check();return;}
            catch(error){
                worker?.terminate();worker=null;check();
                if(!error.retryRuntime || runtimeIndex>=2)throw error;
            }
          }
        }
        function drawDepth(frame,render) {
            const gray = depthCanvas ||= document.createElement('canvas'); gray.width = frame.width; gray.height = frame.height;
            const pixels = new Uint8Array(frame.pixels), image = new ImageData(frame.width,frame.height);
            for(let n=0;n<frame.width*frame.height;n++) {const v = pixels[n*frame.channels], offset = n*4; image.data[offset] = image.data[offset+1] = image.data[offset+2] = v; image.data[offset+3] = 255;}
            gray.getContext('2d').putImageData(image,0,0); render.getContext('2d').drawImage(gray,0,0,render.width,render.height);
        }
        async function complete(blob,width,height,duration) {
            result = blob;
            if(resultUrl) URL.revokeObjectURL(resultUrl); resultUrl = URL.createObjectURL(result); if(!options.background)preview.src = resultUrl;
            q('[data-download]').disabled = false; q('[data-save]').disabled = !options.save;
            progress.value = 100;
            message(`完成 · ${width} × ${height}${isImage ? '' : ` · ${duration.toFixed(1)} 秒`} · ${(result.size/1048576).toFixed(1)} MB。结果仅保存在当前浏览器页面。`);
            await options.onResult?.(new File([blob],fileName,{type:mime}),{width,height,duration});
            if(options.onResult)retained=true;
        }
        async function processImage(signal,check) {
            decoder = new Image();
            await waitEvent(decoder,'load',signal,()=>{decoder.src = inputUrl;}); check();
            const width = decoder.naturalWidth, height = decoder.naturalHeight;
            if(!width || !height || width * height > 40000000) throw new Error('图片超过 4000 万像素或无法读取，请先缩小图片');
            const capture = document.createElement('canvas'), render = document.createElement('canvas');
            const resize = limit => {const ratio = Math.min(1,limit/Math.max(width,height));return [Math.max(1,Math.round(width*ratio)),Math.max(1,Math.round(height*ratio))];};
            [capture.width,capture.height] = resize(518); [render.width,render.height] = resize(Number(q('[data-resolution]').value));
            const ctx = capture.getContext('2d',{willReadFrequently:true});ctx.fillStyle = '#808080';ctx.fillRect(0,0,capture.width,capture.height);ctx.drawImage(decoder,0,0,capture.width,capture.height);
            const rgba = ctx.getImageData(0,0,capture.width,capture.height);
            await loadModel(check);message('正在生成深度图…');progress.removeAttribute('value');
            const frame = await request('frame',{pixels:rgba.data.buffer,width:capture.width,height:capture.height},[rgba.data.buffer]);check();
            drawDepth(frame,render);
            const blob = await new Promise((resolve,reject)=>render.toBlob(blob=>blob ? resolve(blob) : reject(new Error('PNG 导出失败')),'image/png'));check();
            await complete(blob,render.width,render.height);
        }
        async function run() {
            if(busy) {stop(); return;}
            pageExitAllowed=false;retained=false;
            busy = true; start.textContent = '取消提取'; q('[data-cache]').disabled = q('[data-local]').disabled = true; q('[data-download]').disabled = true; q('[data-save]').disabled = true;
            q('[data-resolution]').disabled = q('[data-source]').disabled = true; if(!isImage) q('[data-fps]').disabled = true;
            controller = new AbortController(); const signal = controller.signal;
            const check = () => {if(signal.aborted || closed) throw abortError();options.check?.();};
            let stage='capability';
            try {
                if(!isSecureContext || !navigator.gpu || (!isImage && !window.VideoEncoder)) throw new Error(isImage ? '需要 HTTPS 与本机 WebGPU 支持，请使用新版 Chrome / Edge。' : '需要 HTTPS、本机 WebGPU 与 WebCodecs 支持，请使用新版 Chrome / Edge。');
                const adapter = await navigator.gpu.requestAdapter(); check();
                if(!adapter?.features.has('shader-f16')) throw new Error('当前显卡不支持 WebGPU fp16，无法运行此模型。');
                message(`正在读取${isImage ? '图片' : '视频'}…`); progress.removeAttribute('value');
                stage='media';
                const response = await fetch(options.url, {signal}); check();
                if(!response.ok) throw new Error('素材读取失败，请重新打开或检查访问权限。');
                const sizeError = () => new Error(isImage ? '图片超过 32 MB，请先压缩。' : '视频超过 256 MB，请先裁剪。');
                if(Number(response.headers.get('content-length')) > byteLimit) {await response.body?.cancel(); throw sizeError();}
                // Read incrementally so missing Content-Length cannot bypass the memory bound.
                const reader = response.body.getReader(), chunks = []; let bytes = 0;
                for(;;) {const {done,value} = await reader.read(); check(); if(done) break; bytes += value.byteLength; if(bytes > byteLimit) {await reader.cancel(); throw sizeError();} chunks.push(value);}
                inputUrl = URL.createObjectURL(new Blob(chunks, {type:response.headers.get('content-type') || (isImage ? 'image/png' : 'video/mp4')})); chunks.length = 0;
                if(isImage) {stage='image';await processImage(signal,check);return;}
                decoder = document.createElement('video'); decoder.muted = true; decoder.playsInline = true; decoder.preload = 'auto';
                await waitEvent(decoder,'loadeddata',signal,() => {decoder.src = inputUrl; decoder.load();}); check();
                const duration = decoder.duration, fps = Number(q('[data-fps]').value);
                if(!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS) throw new Error('支持时长不超过 2 分钟的视频，请先裁剪。');
                const [width,height] = dimensions(decoder.videoWidth,decoder.videoHeight,Number(q('[data-resolution]').value));
                const support = await VideoEncoder.isConfigSupported({codec:'avc1.42001f',width,height,framerate:fps,bitrate:2000000}); check();
                if(!support.supported) throw new Error('当前浏览器不支持此尺寸的 H.264 导出。');
                stage='encoder';
                const media = await import('https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/dist/bundles/mediabunny.mjs'); check();
                stage='initialization';
                await loadModel(check);
                stage='inference';
                const capture = document.createElement('canvas'), render = document.createElement('canvas');
                [capture.width,capture.height] = dimensions(decoder.videoWidth,decoder.videoHeight,518);
                render.width = width; render.height = height;
                const ctx = capture.getContext('2d',{willReadFrequently:true});
                output = new media.Output({format:new media.Mp4OutputFormat(),target:new media.BufferTarget()});
                let encodedBytes = 0;
                const source = new media.CanvasSource(render,{codec:'avc',bitrate:2000000,onEncodedPacket:packet => {
                    encodedBytes += packet.data.byteLength;
                    if(encodedBytes > 64 * 1048576) throw new Error('输出超过 64 MB，请缩短视频或降低帧率');
                }});
                output.addVideoTrack(source,{frameRate:fps}); await output.start(); check();
                const frames = Math.ceil(duration * fps);
                for(let i=0;i<frames;i++) {
                    check(); const time = i/fps;
                    if(Math.abs(decoder.currentTime - time) > .00001) await waitEvent(decoder,'seeked',signal,() => {decoder.currentTime = time;});
                    check(); ctx.drawImage(decoder,0,0,capture.width,capture.height);
                    const rgba = ctx.getImageData(0,0,capture.width,capture.height);
                    const frame = await request('frame',{pixels:rgba.data.buffer,width:capture.width,height:capture.height},[rgba.data.buffer]); check();
                    drawDepth(frame,render);
                    await source.add(time,Math.min(1/fps,duration-time)); check();
                    progress.value = (i+1)/frames*100; message(`提取 ${i+1} / ${frames} 帧 · ${Math.round(progress.value)}%`);
                }
                await output.finalize(); check();
                await complete(new Blob([output.target.buffer],{type:'video/mp4'}),width,height,duration); output = null;
            } catch(error) {
                progress.value=0;
                const failedStage=error.stage||stage;
                const label={media:'源素材读取失败',runtime:'推理运行库加载失败',model:'模型文件加载失败',initialization:'模型初始化失败',worker:'推理线程启动失败',encoder:'视频导出库加载失败',image:'图片处理失败',inference:'深度推理失败'}[failedStage]||'提取失败';
                const hint={media:'请检查原素材是否可访问及网络连接。',runtime:'已尝试备用 CDN，请检查网络后重试；切换模型源不会改变运行库连接。',model:'可更换模型下载源或选择本地模型目录。',worker:'请刷新页面后重试。',initialization:'请检查 WebGPU 状态后重试。'}[failedStage]||'请重试；问题持续时请保留此错误信息。';
                message(error.name === 'AbortError' ? '已取消，可重新开始。' : `${label}：${error.message}。${hint}`,error.name !== 'AbortError');
                options.onError?.(error);
            } finally {
                if(output) {try {await output.cancel();} catch(_) {} output = null;}
                stop(); busy = false;
                if(!closed) {start.textContent = '重新提取'; q('[data-cache]').disabled = q('[data-local]').disabled = false; q('[data-resolution]').disabled = false; if(!isImage) q('[data-fps]').disabled = false; q('[data-source]').disabled = Boolean(modelFiles);}
                options.onFinally?.();
            }
        }
        start.onclick = run; q('.local-depth-close').onclick = close;
        q('[data-local]').onclick = () => {
            if(modelFiles) {
                modelFiles = undefined; q('[data-model-files]').value = ''; q('[data-source]').disabled = false;
                q('[data-local]').textContent = '选择本地模型目录';
                q('[data-model-note]').textContent = '自动模式优先 ModelScope，失败后切换 Hugging Face，两者复用同一缓存。运行库仍需 CDN 连接。';
                message('已切换到在线模型加载。');
            } else q('[data-model-files]').click();
        };
        q('[data-model-files]').onchange = event => {
            const required = ['config.json','preprocessor_config.json','onnx/model_fp16.onnx'];
            const entries = [...event.target.files].map(file => ({file,path:file.webkitRelativePath.split('/').slice(1).join('/')}));
            const files = required.map(path => entries.find(entry => entry.path === path));
            if(files.some(entry => !entry) || files[2]?.file.size > 60 * 1048576 || files.slice(0,2).some(entry => entry.file.size > 1048576)) {message('目录不完整或模型过大，请选择指定 V2 Small fp16 模型目录。',true); return;}
            modelFiles = files;
            q('[data-source]').disabled = true;
            q('[data-local]').textContent = '改用在线模型';
            q('[data-model-note]').textContent = '已选择本地模型。只在浏览器读取，加载时校验模型 SHA-256，不上传、不写入服务器。关闭面板后重新选择。运行库仍需 CDN 连接。';
            message('本地模型已选择，点击开始提取。');
        };
        q('[data-download]').onclick = () => {if(!resultUrl) return; const a = document.createElement('a'); a.href = resultUrl; a.download = fileName; a.click();};
        q('[data-save]').onclick = async () => {
            if(!result || saving || busy) return; saving = true; q('[data-save]').disabled = true; start.disabled = true;
            message('正在上传生成结果并保存到画布…');
            try {await options.save(new File([result],fileName,{type:mime})); retained=true;message('已保存到画布。');}
            catch(error) {message(`保存失败：${error.message}。结果仍可本地下载。`,true); q('[data-save]').disabled = false;}
            finally {saving = false; start.disabled = false;}
        };
        q('[data-cache]').onclick = async () => {
            const button = q('[data-cache]'); button.disabled = true;
            try {
                let count = 0;
                for(const name of await caches.keys()) {
                    const cache = await caches.open(name);
                    for(const req of await cache.keys()) {const url = new URL(req.url); if(url.hostname === 'huggingface.co' && url.pathname.startsWith('/onnx-community/depth-anything-v2-small/')) {await cache.delete(req); count++;}}
                }
                message(count ? '已清除本模型缓存，下次使用将重新下载。' : '没有找到本模型缓存。');
            } catch(error) {message(`无法清除缓存：${error.message}`,true);} finally {if(!closed) button.disabled = false;}
        };
        if(options.background)return {run,close,cancel:stop,download:()=>q('[data-download]').onclick(),get result(){return result;}};
        document.addEventListener('keydown',keyboard,true); q('.local-depth-close').focus();
        current = {close}; return current;
    }
    window.LocalDepthVideo = {open,openSettings,getSettings,hasUnfinishedWork,allowPageExit:()=>{pageExitAllowed=true;},generate:options=>{const job=open({...options,background:true});queueMicrotask(()=>job.run());return job;}};
    window.LocalDepthImage = {open:options=>open({...options,kind:'image'})};
})();
