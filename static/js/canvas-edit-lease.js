/* One page owns one private lease. Public presence never grants edit rights. */
(() => {
    'use strict';
    class CanvasEditLease {
        constructor({id, fetch:transport=window.fetch.bind(window), now=() => performance.now(), changed=() => {}}) {
            this.id = id; this.transport = transport; this.now = now; this.changed = changed;
            this.state = 'view'; this.status = null; this.token = null; this.generation = null;
            this.revision = null; this.deadline = 0; this.epoch = 0; this.tail = Promise.resolve();
            this.message = ''; this.maintenance = 'normal'; this.finishing = false;
        }
        emit() { this.changed(this); }
        pause(message='连接已中断，请保留草稿并重新开始编辑。') {
            this.epoch++; this.token = null; this.deadline = 0; this.state = 'paused'; this.message = message; this.emit();
        }
        get canSave() {
            if (this.token && ['read_only','offline','recovering'].includes(this.maintenance)) this.pause('维护已开始，请保留草稿。');
            if (this.token && this.now() >= this.deadline) this.pause('编辑资格已过期，请先保留草稿。');
            return this.state === 'editing' && Boolean(this.token);
        }
        get canEdit() { return this.canSave && !this.finishing && ['normal','scheduled'].includes(this.maintenance); }
        setMaintenance(mode) {
            this.maintenance = mode;
            if (['read_only','offline','recovering'].includes(mode) && this.token) this.pause('维护已开始，当前内容保留在本页，请导出草稿。');
            else this.emit();
        }
        enqueue(operation) {
            const result = this.tail.then(operation);
            this.tail = result.catch(() => {});
            return result;
        }
        headers() {
            if (!this.canSave) throw new Error('请先开始编辑；当前内容尚未保存。');
            return {'X-Canvas-Edit-Token':this.token, 'X-Canvas-Generation':String(this.generation), 'X-Canvas-Revision':String(this.revision)};
        }
        async request(suffix, init={}) {
            const response = await this.transport(`/api/canvases/${encodeURIComponent(this.id)}/edit-lease${suffix}`, {
                cache:'no-store', ...init, signal:AbortSignal.timeout(15000)
            });
            const data = await response.json();
            if (!response.ok) {
                const error = new Error({canvas_locked:'已有成员正在编辑。',canvas_lease_lost:'编辑资格已失效，请保留草稿。',
                    canvas_revision_conflict:'服务器版本已改变，请保留草稿后重新载入。',permission_denied:'当前角色没有操作权限。'}[data.detail?.code] || '编辑请求未完成，请刷新状态后重试。');
                error.data = data.detail; error.status = response.status; throw error;
            }
            return data;
        }
        accept(data, sentAt) {
            const remaining = Date.parse(data.expires_at) - Date.parse(data.server_time);
            if (!Number.isFinite(remaining) || remaining <= 0 || !data.holder?.is_self || data.generation !== this.generation) throw new Error('编辑资格已变化，请保留草稿。');
            // Use request start time: network latency must never extend the server lease.
            this.deadline = sentAt + remaining;
            if (this.now() >= this.deadline) throw new Error('编辑响应已过期，请重新检查状态。');
            this.status = data;
        }
        async refresh() {
            const epoch = this.epoch;
            const data = await this.request('');
            if (epoch !== this.epoch) return;
            this.status = data;
            if (this.token && (!data.holder?.is_self || data.generation !== this.generation || !data.expires_at)) this.pause('编辑资格已被收回或接管，请保留草稿。');
            else this.emit();
            return data;
        }
        start(reload, options={}) {
            return this.enqueue(async () => {
                if (this.canSave) return;
                if (!['normal','scheduled'].includes(this.maintenance)) throw new Error('维护期间不能开始新的编辑。');
                const epoch = ++this.epoch, sentAt = this.now();
                this.state = 'starting'; this.message = ''; this.emit();
                try {
                    const data = await this.request('/acquire', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(options)});
                    if (epoch !== this.epoch) return;
                    this.token = data.edit_token; this.generation = data.generation; this.revision = data.revision;
                    if (!this.token || !Number.isSafeInteger(this.revision)) throw new Error('服务器未返回有效编辑凭据。');
                    this.accept(data, sentAt);
                    const document = await reload();
                    if (epoch !== this.epoch) return;
                    if (document?.revision !== this.revision) throw new Error('画布版本已变化，请重新开始编辑。');
                    this.state = 'editing';
                    if (!this.canSave) return;
                    this.emit();
                } catch (error) {
                    if (epoch === this.epoch) {
                        if (error.data?.canvas_id === this.id) this.status = error.data;
                        this.pause(error.message);
                    }
                    throw error;
                }
            });
        }
        renew() {
            return this.enqueue(async () => {
                if (!this.canSave) return;
                const epoch = this.epoch, sentAt = this.now();
                try {
                    const data = await this.request('/renew', {method:'POST', headers:this.headers()});
                    if (epoch !== this.epoch) return;
                    this.accept(data, sentAt);
                    // A heartbeat acknowledges ownership, never a document revision.
                    this.emit();
                } catch (error) { if (epoch === this.epoch) this.pause(error.message); throw error; }
            });
        }
        write(path, init, transport=this.transport) {
            return this.enqueue(async () => {
                const epoch = this.epoch;
                const headers = new Headers(init.headers);
                Object.entries(this.headers()).forEach(([key,value]) => headers.set(key,value));
                const request = {...init, headers, signal:init.signal || AbortSignal.timeout(30000)};
                const wholeCanvas = new URL(path, 'http://canvas.local').pathname === `/api/canvases/${encodeURIComponent(this.id)}` && init.method?.toUpperCase() === 'PUT';
                if (!this.canEdit && !wholeCanvas) throw new Error('维护准备期间只能保存当前画布或结束编辑。');
                if (wholeCanvas) request.body = JSON.stringify({...JSON.parse(init.body), base_revision:this.revision});
                try {
                    const response = await transport(path, request);
                    const data = await response.clone().json().catch(() => ({}));
                    if (epoch !== this.epoch) throw new Error('页面编辑资格已改变，请保留当前草稿。');
                    if (!response.ok) {
                        if ([401,403,409,423,428,503].includes(response.status) || response.status >= 500) this.pause('写入未完成，已停止自动重试，请保留草稿。');
                        return response;
                    }
                    const revision = data.canvas?.revision;
                    if (Number.isSafeInteger(revision)) {
                        if (revision < this.revision) throw new Error('服务器返回了过期版本。');
                        this.revision = revision;
                    } else if (wholeCanvas) throw new Error('保存响应缺少版本，无法确认保存结果。');
                    this.emit();
                    return response;
                } catch (error) { if (epoch === this.epoch) this.pause('保存结果尚未确认，请保留草稿。'); throw error; }
            });
        }
        async finish(flush) {
            if (!this.canSave || this.finishing) return false;
            this.finishing = true; this.emit();
            try {
            // Flush uses write(), so must happen outside the serialized request queue.
            if (!await flush()) return false;
            return await this.enqueue(async () => {
                const epoch = this.epoch;
                try {
                    const data = await this.request('/release', {method:'POST', headers:this.headers()});
                    if (epoch !== this.epoch) return false;
                    if (!data.released || data.revision !== this.revision) throw new Error('结束编辑尚未确认。');
                    this.epoch++; this.token = null; this.deadline = 0; this.status = null; this.state = 'view'; this.message = '已保存并结束编辑'; this.emit();
                    return true;
                } catch (error) { if (epoch === this.epoch) this.pause(error.message); throw error; }
            });
            } finally { this.finishing = false; this.emit(); }
        }
        dispose() { this.epoch++; this.token = null; this.deadline = 0; this.state = 'closed'; }
    }
    if (typeof module === 'object' && module.exports) module.exports = CanvasEditLease;
    else window.CanvasEditLease = CanvasEditLease;
})();
