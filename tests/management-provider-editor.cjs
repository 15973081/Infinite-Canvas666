const test=require('node:test');
const assert=require('node:assert/strict');
const editor=require('../management/frontend/provider-editor.js');
const presets=require('../config/provider-presets.json');
function form(changes={}){const value={name:'火山引擎',base_url:'https://ark.cn-beijing.volces.com/api/v3',protocol:'volcengine',enabled:'on',image_request_mode:'openai',video_models:'old\nnew\nold',advanced:'{"model_protocols":{"custom":"gemini"},"model_prices":[{"model":"old","unit_price":3}]}',reason:'配置验收',...changes};return {get:key=>value[key],has:key=>Object.hasOwn(value,key)};}
test('builtin providers are always visible without creating saved or assigned configurations',()=>{
 const rows=editor.rows([],presets);assert.equal(rows.length,1);assert.equal(rows[0].id,'volcengine');assert.equal(rows[0].version,0);
 assert.equal(rows[0].config.base_url,'https://ark.cn-beijing.volces.com/api/v3');assert.ok(rows[0].config.video_models.length>0);
 assert.deepEqual(rows[0].configured_secrets,[]);
});
test('saved configuration and disabled state win over presets without duplicating an ID',()=>{
 const saved={id:'volcengine',version:5,config:{name:'自己的方舟',enabled:false,video_models:['ep-private']},configured_secrets:['api_key']};
 const rows=editor.rows([saved,{id:'custom',version:1,config:{}}],presets);
 assert.equal(rows.length,2);assert.equal(rows[0].config,saved.config);assert.equal(rows[0].version,5);assert.equal(rows[0].builtin,true);
});
test('editor keeps hidden provider-specific values, prices and model protocols while writing only supplied secrets',()=>{
 const row={id:'custom',version:8,config:{volcengine_project_name:'saved-project',volcengine_region:'saved-region'}};
 const result=editor.payload(row,form({api_key:'  key  '}));
 assert.equal(result.id,'custom');assert.equal(result.body.expected_version,8);assert.deepEqual(result.body.secrets,{api_key:'key'});
 assert.deepEqual(result.body.config.video_models,['old','new']);assert.deepEqual(result.body.config.model_protocols,{custom:'gemini'});
 assert.equal(result.body.config.model_prices[0].unit_price,3);assert.equal(result.body.config.volcengine_project_name,'saved-project');
});
test('clear and replace conflict is rejected, explicit clearing is preserved and reserved JSON fields cannot override the form',()=>{
 assert.throws(()=>editor.payload({id:'x'},form({api_key:'key',clear_api_key:'on'})),/同时/);
 assert.deepEqual(editor.payload({id:'x'},form({clear_api_key:'on'})).body.clear_secrets,['api_key']);
 assert.throws(()=>editor.payload({id:'x'},form({advanced:'{"base_url":"https://wrong.test"}'})),/基础字段/);
 assert.throws(()=>editor.payload({},form({id:'Bad ID'})),/平台 ID/);
});

test('media transport defaults to URL and saves independent selections',()=>{
  const editor=require('../management/frontend/provider-editor.js');
  const values=new Map([['id','unit'],['name','Unit'],['advanced','{}'],['media_mode_image','base64'],['media_mode_video','url'],['media_mode_audio','base64']]);
  const result=editor.payload({id:'unit',config:{}},values);
  assert.deepEqual(result.body.config.media_input_modes,{image:'base64',video:'url',audio:'base64'});
  for(const kind of ['image','video','audio'])values.delete('media_mode_'+kind);
  assert.deepEqual(editor.payload({id:'unit',config:{}},values).body.config.media_input_modes,{image:'url',video:'url',audio:'url'});
});

test('Hunyuan 3D has independent write-only credentials, model versions and region',()=>{
 const row={id:'hunyuan',version:2,config:{}};
 const result=editor.payload(row,form({protocol:'hunyuan3d',base_url:'https://ai3d.tencentcloudapi.com',model_models:'3.0\n3.1\n3.0',hunyuan_region:'ap-guangzhou',hunyuan_secret_id:'test-id',hunyuan_secret_key:'test-key'}));
 assert.deepEqual(result.body.config.model_models,['3.0','3.1']);assert.equal(result.body.config.hunyuan_region,'ap-guangzhou');
 assert.deepEqual(result.body.secrets,{hunyuan_secret_id:'test-id',hunyuan_secret_key:'test-key'});
 assert.equal(result.body.config.hunyuan_secret_key,undefined);
 const clear=editor.payload(row,form({protocol:'hunyuan3d',clear_hunyuan_secret_key:'on'}));assert.deepEqual(clear.body.clear_secrets,['hunyuan_secret_key']);
});
