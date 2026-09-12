(() => {
    'use strict';
    const form = document.getElementById('login-form');
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    const confirm = document.getElementById('confirm-password');
    const submit = document.getElementById('submit-button');
    const label = document.getElementById('submit-label');
    const message = document.getElementById('form-message');
    const retry = document.getElementById('retry-button');
    let setup = false;
    let ready = false;
    let busy = false;
    function destination() {
        const value = new URLSearchParams(location.search).get('next') || '/';
        try {
            const target = new URL(value, location.origin);
            if (target.origin === location.origin && target.pathname !== '/login' && !target.pathname.startsWith('/api/') && target.pathname !== '/static/login.html') {
                return target.pathname + target.search + target.hash;
            }
        } catch (_) {}
        return '/';
    }
    function showError(text) {
        message.textContent = text;
        message.hidden = !text;
    }
    async function request(url, options = {}) {
        const response = await fetch(url, {credentials: 'same-origin', cache: 'no-store', ...options, signal: AbortSignal.timeout(15000)});
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '请求未完成，请稍后重试。');
        return data;
    }
    async function initialize() {
        ready = false;
        submit.disabled = true;
        retry.hidden = true;
        showError('');
        label.textContent = '正在连接工作区…';
        try {
            const status = await request('/api/auth/status');
            if (status.authenticated) {
                location.replace(destination());
                return;
            }
            setup = status.setup_required;
            document.getElementById('form-title').textContent = setup ? '开启你的创作空间' : '欢迎回来';
            document.getElementById('form-subtitle').textContent = setup ? '首次使用，先为工作区设置访问账号与密码。' : '登录工作区，继续未完成的灵感。';
            document.getElementById('confirm-wrap').hidden = !setup;
            document.getElementById('help-button').hidden = setup;
            confirm.required = setup;
            password.minLength = setup ? 12 : 1;
            password.autocomplete = setup ? 'new-password' : 'current-password';
            password.placeholder = setup ? '设置至少 12 位密码' : '输入密码';
            ready = !setup || status.can_setup;
            username.disabled = password.disabled = !ready;
            submit.disabled = !ready;
            label.textContent = setup ? '创建账号，进入画布' : '登录，进入画布';
            if (!ready) showError('工作区尚未初始化。请管理员在服务器本机打开 localhost 创建账号，或配置工作区访问凭证。');
        } catch (_) {
            showError('暂时无法连接工作区，请检查服务是否启动后重试。');
            label.textContent = '连接失败';
            retry.hidden = false;
        }
    }
    document.getElementById('toggle-password').addEventListener('click', event => {
        const visible = password.type === 'password';
        password.type = visible ? 'text' : 'password';
        event.currentTarget.textContent = visible ? '隐藏' : '显示';
        event.currentTarget.setAttribute('aria-label', visible ? '隐藏密码' : '显示密码');
        event.currentTarget.setAttribute('aria-pressed', String(visible));
    });
    document.getElementById('help-button').addEventListener('click', () => {
        const help = document.getElementById('help-message');
        help.hidden = !help.hidden;
    });
    retry.addEventListener('click', initialize);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!ready || busy) return;
        showError('');
        if (!username.value.trim()) return showError('请输入访问账号。');
        if (setup && password.value !== confirm.value) {
            showError('两次输入的密码不一致。');
            confirm.focus();
            return;
        }
        busy = true;
        submit.disabled = true;
        form.setAttribute('aria-busy', 'true');
        label.textContent = setup ? '正在创建账号…' : '正在登录…';
        try {
            await request(setup ? '/api/auth/setup' : '/api/auth/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username: username.value.trim(), password: password.value, remember: document.getElementById('remember').checked})
            });
            label.textContent = '准备就绪，正在进入…';
            location.replace(destination());
        } catch (error) {
            showError(error.name === 'TimeoutError' || error instanceof TypeError ? '连接中断，请检查网络后重试。' : error.message);
            busy = false;
            submit.disabled = false;
            form.removeAttribute('aria-busy');
            label.textContent = setup ? '创建账号，进入画布' : '登录，进入画布';
        }
    });
    initialize();
})();
