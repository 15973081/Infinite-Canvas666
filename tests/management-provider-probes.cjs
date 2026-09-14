const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('management/frontend/management.js', 'utf8');
const body = source.slice(source.indexOf('  const probeMessages ='), source.indexOf('  async function providerView('));
function fixture() {
  const calls = [], pending = [], selections = [], buttons = [], dialogs = [];
  class Element {
    constructor(tag, text) {this.tag = tag; this.textContent = text; this.children = []; this.isConnected = false; this.hidden = false;}
    append(...children) {this.children.push(...children); for(const c of children) if(typeof c === 'object') c.isConnected = this.isConnected;}
    replaceChildren(...children) {for(const c of this.children) if(typeof c === 'object') c.isConnected = false; this.children = []; this.append(...children);}
    querySelector() {return this.input;}
  }
  const modal = {open: true}, confirm = {hidden: false};
  const context = vm.createContext({serial: 1, me: {member: {id: 'admin'}},
    $: selector => selector === '#dialog' ? modal : confirm,
    el: (tag, text) => new Element(tag, text),
    table: () => new Element('table'),
    field: () => {const element = new Element('label'); element.input = {value: '模型检测与选择', reportValidity: () => true}; return element;},
    button: (name, run) => {const button = new Element('button', name); button.run = run; buttons.push(button); return button;},
    choices: (name, models) => {selections.push({name, models}); return new Element('choices');},
    dialog: (name, elements, submit) => {for(const prior of dialogs) for(const element of prior.elements) element.isConnected = false; elements.forEach(element => {element.isConnected = true;}); dialogs.push({name, elements, submit});},
    call: (path, method, payload) => {calls.push({path, method, payload}); return method === 'POST' ? new Promise((resolve, reject) => pending.push({resolve, reject})) : Promise.resolve({});}
  });
  vm.runInContext(body, context);
  const row = {id: 'test-provider', version: 7, config: {id: 'test-provider', name: '服务', base_url: 'https://example.test/v1', protocol: 'openai',
    image_models: ['existing'], chat_models: [], video_models: [], model_prices: [{price: 'historical'}]}};
  context.probeProvider(row);
  return {context, row, modal, confirm, pending, calls, selections, buttons, dialogs};
}
const success = {ok: true, code: 'models_available', status: 200, elapsed_ms: 8, version: 7, model_count: 2,
  image_models: ['existing', 'new-image'], chat_models: [], video_models: []};
const form = picked => ({getAll: name => picked[name] || [], get: () => '明确追加选择'});

test('discovery never saves until the administrator selects and confirms models', async () => {
  const f = fixture();
  assert.equal(f.confirm.hidden, true);
  const check = f.buttons[0].run(); f.pending[0].resolve(success); await check;
  assert.equal(f.confirm.hidden, false); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].payload.expected_version, 7);
  assert.throws(() => f.dialogs[0].submit(form({})), /勾选/);
  await f.dialogs[0].submit(form({image_models: ['new-image', 'existing']}));
  const saved = f.calls[1];
  assert.equal(saved.method, 'PUT'); assert.equal(saved.payload.expected_version, 7);
  assert.deepEqual(Array.from(saved.payload.config.image_models), ['existing', 'new-image']);
  assert.equal(saved.payload.config.base_url, f.row.config.base_url);
  assert.equal(saved.payload.config.id, undefined); assert.equal(saved.payload.config.model_prices, undefined);
  assert.equal(saved.payload.secrets, undefined);
});

test('closing, logging out, changing account or navigating discards late probe results', async () => {
  for(const change of [f => {f.modal.open = false;}, f => {f.context.me = null;},
    f => {f.context.me.member.id = 'other';}, f => {f.context.serial++;},
    f => {f.context.probeProvider(f.row);}]) {
    const f = fixture(); const check = f.buttons[0].run(); change(f);
    f.pending[0].resolve(success); await check;
    assert.equal(f.confirm.hidden, true); assert.equal(f.selections.length, 0);
    assert.equal(f.calls.length, 1);
  }
});

test('a failed retry clears previous models and cannot submit stale discovery', async () => {
  const f = fixture();
  let check = f.buttons[0].run(); f.pending[0].resolve(success); await check;
  check = f.buttons[0].run(); f.pending[1].resolve({ok: false, code: 'upstream_auth_rejected', status: 401, elapsed_ms: 1}); await check;
  assert.equal(f.confirm.hidden, true);
  assert.throws(() => f.dialogs[0].submit(form({image_models: ['new-image']})), /重新检测/);
  assert.equal(f.calls.length, 2);
});

test('model import preserves the configured per-category limit', async () => {
  const f = fixture(); f.row.config.image_models = Array.from({length: 500}, (_, i) => 'existing-' + i);
  const check = f.buttons[0].run(); f.pending[0].resolve(success); await check;
  assert.throws(() => f.dialogs[0].submit(form({image_models: ['new-image']})), /500/);
  assert.equal(f.calls.length, 1);
});

const diagnosis = {ok: true, code: 'protocol_candidates', version: 7, checks: [], suggestions: [
  {protocol: 'openai', base_url: 'https://example.test/v1'},
  {protocol: 'apimart', base_url: 'https://example.test/v1'}]};
const diagnosticForm = value => ({get: name => name === 'suggestion' ? value : '确认采用诊断建议'});

test('diagnostic suggestions require an explicit choice and preserve other provider settings', async () => {
  const f = fixture(); f.context.diagnoseProvider(f.row);
  const request = f.buttons.at(-1).run(); f.pending[0].resolve(diagnosis); await request;
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].payload.mode, 'protocols');
  assert.throws(() => f.dialogs.at(-1).submit(diagnosticForm('')), /请选择/);
  await f.dialogs.at(-1).submit(diagnosticForm('1'));
  const saved = f.calls[1].payload;
  assert.equal(saved.expected_version, 7); assert.equal(saved.config.protocol, 'apimart');
  assert.equal(saved.config.base_url, 'https://example.test/v1');
  assert.deepEqual(Array.from(saved.config.image_models), ['existing']);
  assert.equal(saved.config.model_prices, undefined); assert.equal(saved.secrets, undefined);
});

test('late diagnostics cannot reopen or change a closed or replaced dialog', async () => {
  for(const change of [f => {f.modal.open = false;}, f => {f.context.me = null;},
    f => {f.context.serial++;}, f => {f.context.diagnoseProvider(f.row);}]) {
    const f = fixture(); f.context.diagnoseProvider(f.row);
    const request = f.buttons.at(-1).run(); change(f);
    f.pending[0].resolve(diagnosis); await request;
    assert.equal(f.confirm.hidden, true); assert.equal(f.calls.length, 1);
  }
});

test('an inconclusive retry removes previous protocol suggestions', async () => {
  const f = fixture(); f.context.diagnoseProvider(f.row); const start = f.buttons.at(-1);
  let request = start.run(); f.pending[0].resolve(diagnosis); await request;
  request = start.run(); f.pending[1].resolve({ok: false, checks: [], suggestions: [], code: 'protocol_inconclusive'}); await request;
  assert.equal(f.confirm.hidden, true);
  assert.throws(() => f.dialogs.at(-1).submit(diagnosticForm('0')), /重新诊断/);
  assert.equal(f.calls.length, 2);
});
