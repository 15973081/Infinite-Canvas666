"""Execute the actual page's HTTP/SSE error handling without a browser or network."""
from pathlib import Path
import subprocess


def test_chat_errors_are_readable_for_http_and_sse():
    page = (Path(__file__).resolve().parents[1] / 'static/gpt-chat.html').read_text(encoding='utf-8')
    code = page[page.index('        function chatErrorMessage('):page.index('        function scrollBottom(')]
    checks = r'''
const assert = require('node:assert/strict');
const tr = () => '请求失败，请重试';
const provider = 'test', activeChatModel = 'test', config = {}, currentConversation = {id: ''};
const headers = () => ({});
(async () => {
    assert.equal(chatErrorMessage({message:'模型已停用'}), '模型已停用');
    assert.match(chatErrorMessage({code:'route_not_migrated'}), /聊天接口/);
    assert.match(chatErrorMessage({code:'permission_denied'}), /权限/);
    assert.equal(chatErrorMessage('上游繁忙'), '上游繁忙');
    for(const detail of [null, {}, [], [{msg:'invalid'}], {message: {}}, {code:'unknown'}, {code:'constructor'}]) {
        assert.equal(chatErrorMessage(detail), '请求失败，请重试');
    }
    global.fetch = async () => ({ok:false, status:403, json:async () => ({detail:{code:'permission_denied'}})});
    await assert.rejects(streamChatMessage('test', [], {}), /权限/);
    global.fetch = async () => ({ok:false, status:502, json:async () => {throw new SyntaxError('HTML gateway response');}});
    await assert.rejects(streamChatMessage('test', [], {}), /请求失败/);
    global.fetch = async () => ({ok:true, body:{getReader: () => ({read: async () => ({value:Buffer.from('data: {"type":"error","detail":{"message":"上游暂不可用"}}\n\n'),done:false})})}});
    await assert.rejects(streamChatMessage('test', [], {}), /上游暂不可用/);
})().catch(e => {console.error(e); process.exitCode=1;});
'''
    result = subprocess.run(['node', '-e', code + checks], capture_output=True, text=True, encoding='utf-8')
    assert result.returncode == 0, result.stdout + result.stderr
