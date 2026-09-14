const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('history pager fetches only requested pages and retries the same cursor', async () => {
    const calls = [];
    let fail = true;
    const context = {window: {}, URLSearchParams, fetch: async url => {
        calls.push(url);
        const cursor = new URL(url, 'http://localhost').searchParams.get('cursor');
        if (cursor && fail) { fail = false; return {ok: false}; }
        return {ok: true, json: async () => ({items: [cursor ? 'second' : 'first'], next_cursor: cursor ? null : 'next+/='})};
    }};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/js/history-pager.js'), 'utf8'), context);
    const pager = new context.window.HistoryPager('online', 2);
    assert.equal(calls.length, 0);
    assert.equal((await pager.next())[0], 'first');
    assert.equal(calls.length, 1);
    await assert.rejects(() => pager.next());
    assert.equal(pager.cursor, 'next+/=');
    assert.equal((await pager.next())[0], 'second');
    assert.equal(pager.hasMore, false);
    assert.equal((await pager.next()).length, 0);
    assert.equal(calls.length, 3);
    assert.equal(calls[1], calls[2]);
    pager.reset();
    assert.equal((await pager.next())[0], 'first');
});

test('all history pages load shared pager and inline scripts remain parseable', () => {
    for (const name of ['online', 'gpt-chat']) {
        const html = fs.readFileSync(path.join(__dirname, '../static/' + name + '.html'), 'utf8');
        if (name !== 'gpt-chat') assert.ok(html.includes('/static/js/history-pager.js'));
        for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
            if (!/\bsrc=|type=["'](?:module|importmap|application\/)/.test(match[1])) new vm.Script(match[2], {filename: name});
        }
    }
});
