/* One page owns one private lease. Public presence never grants edit rights. */
(() => {
    'use strict';
    class CanvasEditLease {
        constructor({id, fetch:transport=window.fetch.bind(window), now=() => performance.now(), changed=() => {}}) {
            this.id = id; this.transport = transport; this.now = now; this.changed = changed;
            this.state = 'view'; this.status = null; this.token = null; this.generation = null;
            this.revision = null; this.deadline = 0; this.epoch = 0; this.tail = Promise.resolve();
            this.message = ''; this.maintenance = 'normal'; this.finishing = false;
            this.pending = null; this.requests = [];
        }
        emit() { this.changed(this); }
        pause(message='连接已中断，请保留草稿并重新开始编辑。') {
            this.epoch++; this.token = null; this.pending = null; this.deadline = 0; this.state = 'paused'; this.message = message; this.emit();
        }
        get canSave() {
            if (this.token && ['read_only','offline','recovering'].includes(this.maintenance)) this.pause('维护已开始，请保留草稿。');
            if (this.token && this.now() >= this.deadline) this.pause('编辑资格已过期，请先保留草稿。');
            return this.state === 'editing' && Boolean(this.token);
        }
        get canEdit() { return this.canSave && !this.finishing && ['normal','scheduled'].includes(this.maintenance); }
        setMaintenance(mode) {
            this.maintenance = mode;
            if (['read_only','offline','recovering'].includes(mode) && (this.token || this.pending || this.state === 'requesting')) this.pause('维护已开始，当前内容保留在本页，请导出草稿。');
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
                    canvas_revision_conflict:'服务器版本已改变，请保留草稿后重新载入。',permission_denied:'当前角色没有操作权限。',
                    canvas_transfer_expired:'接手申请已过期或已处理。',canvas_transfer_recipient_changed:'申请人的权限已改变，不能交接。',
                    canvas_transfer_no_holder:'画布目前无人编辑，可以直接开始编辑。',canvas_takeover_confirmation_required:'编辑状态已改变，请重新确认接管。'}[data.detail?.code] || '编辑请求未完成，请刷新状态后重试。');
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
                if (this.state === 'closed') throw new Error('画布页面已关闭，请重新打开。');
                if (this.canSave) return;
                if (!['normal','scheduled'].includes(this.maintenance)) throw new Error('维护期间不能开始新的编辑。');
                const epoch = ++this.epoch, sentAt = this.now();
                this.pending = null; this.state = 'starting'; this.message = ''; this.emit();
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
        async restoreDraft(baseRevision, apply) {
            if (!this.canEdit) throw new Error('请先开始编辑，再恢复草稿。');
            this.finishing = true; this.emit();
            try {
                return await this.enqueue(async () => {
                    if (!this.canSave || !['normal','scheduled'].includes(this.maintenance)) throw new Error('编辑资格已变化，请保留草稿。');
                    if (!Number.isSafeInteger(baseRevision) || baseRevision !== this.revision) throw new Error('草稿与服务器版本不一致，请导出保留，不能覆盖原画布。');
                    const epoch = this.epoch, sentAt = this.now();
                    try {
                        const data = await this.request('/renew', {method:'POST', headers:this.headers()});
                        if (epoch !== this.epoch || !this.canSave || !['normal','scheduled'].includes(this.maintenance)) throw new Error('恢复期间编辑资格已变化，请保留草稿。');
                        this.accept(data, sentAt);
                        if (data.revision !== baseRevision) throw new Error('服务器版本已改变，请保留草稿后重新载入。');
                        // Apply synchronously inside the write queue. No saved credentials or
                        // public presence can authorize a restore, and no PUT is sent here.
                        apply();
                        return true;
                    } catch (error) { if (epoch === this.epoch) this.pause(error.message); throw error; }
                });
            } finally { this.finishing = false; this.emit(); }
        }
        requestTransfer() {
            return this.enqueue(async () => {
                if (this.state === 'closed') throw new Error('画布页面已关闭，请重新打开。');
                if (this.canSave) throw new Error('本页已经在编辑，无需申请接手。');
                if (this.pending) return;
                if (!['normal','scheduled'].includes(this.maintenance)) throw new Error('维护期间不能申请接手。');
                const epoch = ++this.epoch;
                this.state = 'requesting'; this.message = ''; this.emit();
                try {
                    const data = await this.request('/transfers', {method:'POST'});
                    if (epoch !== this.epoch) return;
                    if (!data.id || !data.edit_token || !Number.isSafeInteger(data.generation)) throw new Error('接手申请响应不完整，请重新检查状态。');
                    this.pending = {id:data.id, token:data.edit_token, generation:data.generation};
                    this.state = 'waiting'; this.message = '已申请接手，等待当前编辑者保存并交接。'; this.emit();
                } catch (error) { if (epoch === this.epoch) this.pause(error.message); throw error; }
            });
        }
        refreshTransfers(reload) {
            return this.enqueue(async () => {
                const epoch = this.epoch;
                const data = await this.request('/transfers');
                if (epoch !== this.epoch) return;
                if (data.lease?.canvas_id !== this.id || !Array.isArray(data.requests)) throw new Error('交接状态响应不完整。');
                this.requests = data.requests; this.status = data.lease;
                if (this.token && (!data.lease.holder?.is_self || data.lease.generation !== this.generation || !data.lease.expires_at)) {
                    this.pause('编辑资格已被收回或接管，请保留草稿。'); return;
                }
                if (!this.pending) { this.emit(); return; }
                const pending = this.pending, record = data.requests.find(row => row.id === pending.id);
                if (!record || ['expired','rejected'].includes(record.status)) {
                    this.pending = null; this.state = 'view';
                    this.message = record?.status === 'rejected' ? '编辑者拒绝了接手申请。' : '接手申请已过期，请重新申请。'; this.emit(); return;
                }
                if (record.status !== 'approved') { this.emit(); return; }
                // Only this requesting page knows the private target token. Even an
                // approved public record for this account does not grant another page rights.
                if (data.lease.generation !== pending.generation + 1 || !data.lease.holder?.is_self) {
                    this.pause('交接后编辑资格又发生了变化，请重新检查。'); return;
                }
                this.state = 'starting'; this.emit();
                const sentAt = this.now();
                try {
                    const accepted = await this.request('/renew', {method:'POST', headers:{'X-Canvas-Edit-Token':pending.token,
                        'X-Canvas-Generation':String(pending.generation + 1)}});
                    if (epoch !== this.epoch) return;
                    if (accepted.generation !== pending.generation + 1 || !Number.isSafeInteger(accepted.revision)) throw new Error('交接凭据与当前版本不一致，请重新检查。');
                    this.token = pending.token; this.generation = accepted.generation; this.revision = accepted.revision;
                    this.accept(accepted, sentAt);
                    const document = await reload();
                    if (epoch !== this.epoch) return;
                    if (document?.revision !== this.revision) throw new Error('交接画布版本已变化，请保留草稿后重新载入。');
                    this.pending = null; this.state = 'editing'; this.message = '已接手编辑';
                    if (this.canSave) this.emit();
                } catch (error) { if (epoch === this.epoch) this.pause(error.message); throw error; }
            });
        }
        async resolveTransfer(id, {approve, confirm=false}, flush) {
            if (!this.canSave || this.finishing) return false;
            if (approve && !confirm) throw new Error('请确认保存并交接。');
            if (approve && !this.canEdit) throw new Error('维护期间不能交接，请保存并结束编辑。');
            this.finishing = true; this.emit();
            try {
                if (approve && !await flush()) return false;
                return await this.enqueue(async () => {
                    const epoch = this.epoch;
                    try {
                        const data = await this.request('/transfers/' + encodeURIComponent(id), {method:'POST',
                            headers:{...this.headers(), 'Content-Type':'application/json'}, body:JSON.stringify({approve,confirm})});
                        if (epoch !== this.epoch) return false;
                        if (data.status !== (approve ? 'approved' : 'rejected')) throw new Error('交接结果尚未确认，请检查状态。');
                        if (approve && (data.lease?.generation !== this.generation + 1 || data.lease?.revision !== this.revision || !data.lease?.holder)) throw new Error('交接版本尚未确认，请检查状态。');
                        this.requests = this.requests.filter(row => row.id !== id);
                        if (approve) {
                            this.epoch++; this.token = null; this.pending = null; this.deadline = 0;
                            this.status = data.lease; this.state = 'view'; this.message = '已保存并交接给 ' + (data.lease?.holder?.display_name || '申请人');
                        } else this.message = '已拒绝接手申请';
                        this.emit(); return true;
                    } catch (error) {
                        if (epoch === this.epoch) {
                            if (['canvas_transfer_expired','canvas_transfer_recipient_changed','canvas_transfer_not_found'].includes(error.data?.code)) {
                                this.message = error.message; this.emit();
                            } else this.pause(error.message);
                        }
                        throw error;
                    }
                });
            } finally { this.finishing = false; this.emit(); }
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
                        const taskSubmission = /^\/api\/canvas-(image|video|llm)-tasks$/.test(new URL(path, 'http://canvas.local').pathname);
                        const rejectedModel = taskSubmission && response.status === 403 && ['model_not_available','model_resolution_not_allowed'].includes(data.detail?.code);
                        if (!rejectedModel && ([401,403,409,423,428,503].includes(response.status) || response.status >= 500)) {
                            const reason = typeof data.detail === 'string' ? data.detail : data.detail?.message;
                            this.pause((reason ? reason + ' ' : '') + '写入未完成，已停止自动重试，请保留草稿。');
                        }
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
        async joinResult(taskId, flush, reload, valid=() => true) {
            if(!this.canEdit || this.finishing) throw new Error('请先开始编辑，再加入结果。');
            const epoch=this.epoch;
            this.finishing=true;this.emit();
            try {
                if(!await flush()) throw new Error('当前更改尚未保存，请保留草稿后重试。');
                if(!valid() || epoch!==this.epoch || !this.canSave) throw new Error('编辑状态已改变，请重新打开结果列表。');
                const data=await this.enqueue(async () => {
                    if(!valid() || epoch!==this.epoch || !this.canSave || !['normal','scheduled'].includes(this.maintenance)) throw new Error('编辑状态已改变，请重新打开结果列表。');
                    const response=await this.transport('/api/canvases/'+encodeURIComponent(this.id)+'/task-results/'+encodeURIComponent(taskId)+'/join',
                        {method:'POST',headers:this.headers(),signal:AbortSignal.timeout(30000)});
                    const data=await response.json();
                    if(!response.ok) {const error=new Error({task_result_assets_unavailable:'结果素材当前不可用，请保留任务并检查素材。',
                        task_result_not_ready:'任务尚未完成，请刷新结果列表。',task_result_node_conflict:'结果节点已被修改，请先核对已有节点。'}[data.detail?.code] || '结果尚未确认加入，请刷新画布后核对。');throw error;}
                    if(epoch!==this.epoch || !valid() || !this.canSave || !Number.isSafeInteger(data.canvas?.revision) || data.canvas.revision<this.revision || data.canvas.id!==this.id) throw new Error('结果加入状态尚未确认，请重新载入画布核对。');
                    this.revision=data.canvas.revision;this.emit();return data;
                });
                if(!valid() || epoch!==this.epoch || !this.canSave) throw new Error('编辑状态已改变，结果已保存在服务器，请重新载入核对。');
                const document=await reload();
                if(!valid() || epoch!==this.epoch || !this.canSave || document?.revision!==data.canvas?.revision) throw new Error('结果已保存在服务器，请重新载入画布核对。');
                return data;
            } catch(error) {
                if(epoch===this.epoch) this.pause(error.message);
                throw error;
            } finally {this.finishing=false;this.emit();}
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
        dispose() { this.epoch++; this.token = null; this.pending = null; this.deadline = 0; this.state = 'closed'; }
    }
    if (typeof module === 'object' && module.exports) module.exports = CanvasEditLease;
    else window.CanvasEditLease = CanvasEditLease;
})();
