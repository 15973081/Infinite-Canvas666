/* Browser-local depth video: lazy model, bounded memory, explicit result upload. */
(() => {
    const MAX_BYTES = 256 * 1024 * 1024, MAX_SECONDS = 120;
    let current;
    const abortError = () => new DOMException('已取消', 'AbortError');
    function waitEvent(target, event, signal, action) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => finish(new Error('视频读取超时，请检查素材是否可访问')), 30000);
            const cleanup = () => {clearTimeout(timer); target.removeEventListener(event, done); target.removeEventListener('error', failed); signal.removeEventListener('abort', aborted);};
            const finish = error => {cleanup(); error ? reject(error) : resolve();};
            const done = () => finish(), failed = () => finish(new Error('浏览器无法解码此视频')), aborted = () => finish(abortError());
            target.addEventListener(event, done, {once:true}); target.addEventListener('error', failed, {once:true}); signal.addEventListener('abort', aborted, {once:true});
            if(signal.aborted) aborted(); else try {action();} catch(error) {finish(error);}
        });
    }
    function dimensions(width, height, limit) {
        const ratio = Math.min(1, limit / Math.max(width, height));
        return [Math.max(2, Math.round(width * ratio / 2) * 2), Math.max(2, Math.round(height * ratio / 2) * 2)];
    }
    function open(options) {
        if(current?.close() === false) return current;
        const previousFocus = document.activeElement;
        const root = document.createElement('div'); root.className = 'local-depth-backdrop';
        root.innerHTML = `<section class="local-depth-dialog" role="dialog" aria-modal="true" aria-labelledby="localDepthTitle">
            <header class="local-depth-header"><h2 id="localDepthTitle">深度视频</h2><button class="local-depth-close" aria-label="关闭">×</button></header>
            <div class="local-depth-grid"><div><video class="local-depth-preview" controls playsinline preload="none"></video><div class="local-depth-meta">灰度深度 · 无音轨 · 保持原片时长</div></div>
            <div><dl><dt>模型</dt><dd>V2 Small · ONNX · fp16</dd><dt>下载源</dt><dd><select data-source aria-label="模型下载源"><option value="auto">自动（优先 ModelScope）</option><option value="modelscope">ModelScope</option><option value="huggingface">Hugging Face</option></select></dd><dt>分辨率</dt><dd><select data-resolution aria-label="分辨率"><option value="960">960px</option><option value="640">640px</option></select></dd><dt>帧率</dt><dd><select data-fps aria-label="帧率"><option value="30">30 fps</option><option value="15">15 fps</option></select></dd><dt>深度样式</dt><dd>灰度</dd></dl>
            <p class="local-depth-note">在浏览器本地逐帧提取，原视频与视频帧不上传。首次使用下载约 49.6 MB 模型，后续复用浏览器缓存。需要支持 WebGPU 的浏览器与显卡。</p>
            <p class="local-depth-note">最长 2 分钟，源文件不超过 256 MB。输出最长边不超过所选分辨率。逐帧推理可能耗时较长。</p>
            <button class="local-depth-start">开始提取</button><progress class="local-depth-progress" max="100" value="0"></progress><p class="local-depth-status" role="status" aria-live="polite">模型将在开始提取时加载。</p></div></div>
            <footer class="local-depth-actions"><button data-download disabled>下载 MP4</button><button data-save disabled>保存到画布（上传结果）</button><button data-local>选择本地模型目录</button><button data-cache>清除模型缓存</button><input data-model-files type="file" webkitdirectory multiple hidden></footer>
            <p class="local-depth-note" data-model-note>自动模式优先 ModelScope，失败后切换 Hugging Face，两者复用同一缓存。也可选择本地模型目录。运行库仍需 CDN 连接。</p><p class="local-depth-note"><a href="https://modelscope.cn/models/onnx-community/depth-anything-v2-small/files" target="_blank" rel="noopener noreferrer" style="color:inherit">ModelScope 模型文件</a> · <a href="https://huggingface.co/onnx-community/depth-anything-v2-small/tree/c70d1ddbcd93c9bda8098268cc3554adf5e8dd4f" target="_blank" rel="noopener noreferrer" style="color:inherit">Hugging Face 固定版本</a> · 单帧相对深度，非测量距离；视频可能出现帧间闪烁。</p></section>`;
        document.body.append(root);
        const q = selector => root.querySelector(selector), preview = q('video'), start = q('.local-depth-start'), status = q('.local-depth-status'), progress = q('progress');
        preview.src = options.url;
        let controller, worker, pending = new Map(), serial = 0, result, resultUrl, inputUrl, output, busy = false, saving = false, closed = false, decoder, modelFiles;
        function message(text, error=false) {if(closed) return; status.textContent = text; status.classList.toggle('local-depth-error', error);}
        function stop() {
            controller?.abort(); worker?.terminate(); worker = null;
            for(const task of pending.values()) task.reject(abortError()); pending.clear();
            decoder?.pause(); if(decoder) {decoder.removeAttribute('src'); decoder.load(); decoder = null;}
            if(inputUrl) URL.revokeObjectURL(inputUrl); inputUrl = null;
        }
        function close() {
            if(saving) return false;
            if(closed) return true;
            closed = true; stop(); if(resultUrl) URL.revokeObjectURL(resultUrl);
            preview.pause(); preview.removeAttribute('src'); preview.load(); root.remove(); document.removeEventListener('keydown', keyboard, true);
            if(previousFocus?.isConnected) previousFocus.focus(); if(current?.close === close) current = null;
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
        async function run() {
            if(busy) {stop(); return;}
            busy = true; start.textContent = '取消提取'; q('[data-cache]').disabled = q('[data-local]').disabled = true; q('[data-download]').disabled = true; q('[data-save]').disabled = true;
            q('[data-resolution]').disabled = q('[data-fps]').disabled = q('[data-source]').disabled = true;
            controller = new AbortController(); const signal = controller.signal;
            const check = () => {if(signal.aborted || closed) throw abortError();};
            try {
                if(!isSecureContext || !navigator.gpu || !window.VideoEncoder) throw new Error('需要 HTTPS、本机 WebGPU 与 WebCodecs 支持，请使用新版 Chrome / Edge。');
                const adapter = await navigator.gpu.requestAdapter(); check();
                if(!adapter?.features.has('shader-f16')) throw new Error('当前显卡不支持 WebGPU fp16，无法运行此模型。');
                message('正在读取视频…'); progress.removeAttribute('value');
                const response = await fetch(options.url, {signal}); check();
                if(!response.ok) throw new Error('视频读取失败，请重新打开素材或检查访问权限。');
                if(Number(response.headers.get('content-length')) > MAX_BYTES) {await response.body?.cancel(); throw new Error('视频超过 256 MB，请先裁剪。');}
                // Read incrementally so missing Content-Length cannot bypass the memory bound.
                const reader = response.body.getReader(), chunks = []; let bytes = 0;
                for(;;) {const {done,value} = await reader.read(); check(); if(done) break; bytes += value.byteLength; if(bytes > MAX_BYTES) {await reader.cancel(); throw new Error('视频超过 256 MB，请先裁剪。');} chunks.push(value);}
                inputUrl = URL.createObjectURL(new Blob(chunks, {type:response.headers.get('content-type') || 'video/mp4'})); chunks.length = 0;
                decoder = document.createElement('video'); decoder.muted = true; decoder.playsInline = true; decoder.preload = 'auto';
                await waitEvent(decoder,'loadeddata',signal,() => {decoder.src = inputUrl; decoder.load();}); check();
                const duration = decoder.duration, fps = Number(q('[data-fps]').value);
                if(!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS) throw new Error('支持时长不超过 2 分钟的视频，请先裁剪。');
                const [width,height] = dimensions(decoder.videoWidth,decoder.videoHeight,Number(q('[data-resolution]').value));
                const support = await VideoEncoder.isConfigSupported({codec:'avc1.42001f',width,height,framerate:fps,bitrate:2000000}); check();
                if(!support.supported) throw new Error('当前浏览器不支持此尺寸的 H.264 导出。');
                const media = await import('https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/dist/bundles/mediabunny.mjs'); check();
                worker = new Worker('/static/js/local-depth-video-worker.js', {type:'module'});
                worker.onmessage = ({data}) => {
                    if(data.type === 'progress') {
                        const p = data.progress;
                        const label = {modelscope:'ModelScope',huggingface:'Hugging Face',local:'本地目录'}[p.source] || '';
                        if(p.status === 'progress') {progress.value = Number(p.progress) || 0; message(`${label} 加载模型 ${p.file || ''} · ${Math.round(Number(p.progress) || 0)}%`);}
                        else if(p.status === 'source') {progress.value = 0; message(`从 ${label} 加载 ${p.file}`);}
                        else if(p.status === 'fallback') message(`当前下载源失败，正在切换 ${label} · ${p.file}`);
                        else if(p.status === 'cache') message(`复用已校验的浏览器缓存 · ${p.file}`);
                        else if(p.status === 'cache-warning') message('模型已加载，但浏览器缓存写入失败，下次可能需要重新下载。');
                        else message(p.status === 'ready' ? '模型已就绪' : `读取模型与浏览器缓存… ${p.file || ''}`);
                        return;
                    }
                    const task = pending.get(data.id); if(!task) return; pending.delete(data.id);
                    data.type === 'error' ? task.reject(new Error(data.message)) : task.resolve(data);
                };
                worker.onerror = event => {for(const task of pending.values()) task.reject(new Error(event.message || '模型加载失败')); pending.clear();};
                message('加载模型与推理运行库…'); await request('load',{files:modelFiles,source:q('[data-source]').value}); check();
                const capture = document.createElement('canvas'), render = document.createElement('canvas'), gray = document.createElement('canvas');
                [capture.width,capture.height] = dimensions(decoder.videoWidth,decoder.videoHeight,518);
                render.width = width; render.height = height;
                const ctx = capture.getContext('2d',{willReadFrequently:true}), renderCtx = render.getContext('2d');
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
                    gray.width = frame.width; gray.height = frame.height;
                    const pixels = new Uint8Array(frame.pixels), image = new ImageData(frame.width,frame.height);
                    for(let n=0;n<frame.width*frame.height;n++) {const v = pixels[n*frame.channels], offset = n*4; image.data[offset] = image.data[offset+1] = image.data[offset+2] = v; image.data[offset+3] = 255;}
                    gray.getContext('2d').putImageData(image,0,0); renderCtx.drawImage(gray,0,0,width,height);
                    await source.add(time,Math.min(1/fps,duration-time)); check();
                    progress.value = (i+1)/frames*100; message(`提取 ${i+1} / ${frames} 帧 · ${Math.round(progress.value)}%`);
                }
                await output.finalize(); check();
                result = new Blob([output.target.buffer],{type:'video/mp4'}); output = null;
                if(resultUrl) URL.revokeObjectURL(resultUrl); resultUrl = URL.createObjectURL(result); preview.src = resultUrl;
                q('[data-download]').disabled = false; q('[data-save]').disabled = !options.save;
                message(`完成 · ${width} × ${height} · ${duration.toFixed(1)} 秒 · ${(result.size/1048576).toFixed(1)} MB。结果仅保存在当前浏览器页面。`);
            } catch(error) {
                message(error.name === 'AbortError' ? '已取消，可重新开始。' : `提取失败：${error.message}。可重试、更换模型下载源或选择本地目录；运行库仍需 CDN 连接。`,error.name !== 'AbortError');
            } finally {
                if(output) {try {await output.cancel();} catch(_) {} output = null;}
                stop(); busy = false;
                if(!closed) {start.textContent = '重新提取'; q('[data-cache]').disabled = q('[data-local]').disabled = false; q('[data-resolution]').disabled = q('[data-fps]').disabled = false; q('[data-source]').disabled = Boolean(modelFiles);}
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
        q('[data-download]').onclick = () => {if(!resultUrl) return; const a = document.createElement('a'); a.href = resultUrl; a.download = 'depth-video.mp4'; a.click();};
        q('[data-save]').onclick = async () => {
            if(!result || saving || busy) return; saving = true; q('[data-save]').disabled = true; start.disabled = true;
            message('正在上传生成结果并保存到画布…');
            try {await options.save(new File([result],'depth-video.mp4',{type:'video/mp4'})); message('已保存到画布。');}
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
        document.addEventListener('keydown',keyboard,true); q('.local-depth-close').focus();
        current = {close}; return current;
    }
    window.LocalDepthVideo = {open};
})();
