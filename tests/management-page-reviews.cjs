const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('management/frontend/management.js', 'utf8');
const body = source.slice(source.indexOf('  async function showPageReports('), source.indexOf('  async function maintenanceView('));
function fixture() {
    const pending = [], dialogs = [];
    const context = vm.createContext({URLSearchParams, serial: 1, reportRequest: 0, workspace: 'space-a',
        me: {member: {id: 'admin-a'}}, view: 'maintenance',
        api: path => new Promise(resolve => pending.push({path, resolve})),
        el: () => ({append() {}}), button: () => ({}), dialog: title => dialogs.push(title)});
    vm.runInContext(body, context);
    return {context, pending, dialogs};
}
test('late report lists cannot reopen after logout, account, scope or navigation changes', async () => {
    for (const mutate of [c => {c.me = null; c.serial++;}, c => {c.me.member.id = 'admin-b';},
        c => {c.workspace = 'space-b';}, c => {c.view = 'members';}, c => {c.serial++;}]) {
        const f = fixture();
        const opening = f.context.showPageReports();
        assert.match(f.pending[0].path, /workspace=space-a/);
        mutate(f.context);
        f.pending[0].resolve({reports: [], next: null});
        await opening;
        assert.deepEqual(f.dialogs, []);
    }
});
test('the latest report-list choice wins when requests finish out of order', async () => {
    const f = fixture();
    const old = f.context.showPageReports(false);
    const latest = f.context.showPageReports(true);
    f.pending[1].resolve({reports: [], next: null}); await latest;
    assert.deepEqual(f.dialogs, ['已核对的页面报告']);
    f.pending[0].resolve({reports: [], next: null}); await old;
    assert.deepEqual(f.dialogs, ['已核对的页面报告']);
});
