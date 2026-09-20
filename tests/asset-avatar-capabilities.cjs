const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('static/js/asset-manager.js','utf8').replace(/\r\n/g,'\n');
function fn(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);return (source.slice(start-6,start)==='async '?'async ':'')+source.slice(start,source.indexOf('\n}',start)+2);}
function fixture(provider){
 const c={apiProviders:[provider],avatarRegisterProvider:'',avatarBusyId:'',avatarSubmittingItems:new Map(),managerDataLoaded:{providers:true},
  AVATAR_SUPPORTED_PLATFORMS:['volcengine'],AVATAR_PLATFORM_LABELS:{apimart:'APIMart',volcengine:'火山引擎'},
  selectedAssetIds:new Set(['image']),findAssetItem:()=>({id:'image'}),assetKind:()=> 'image',ensureProvidersLoaded:async()=>{},
  setStatus:m=>{c.message=m;},apiJson:()=>{throw new Error('must not call upstream');}};
 vm.createContext(c);
 for(const name of ['escapeHtml','escapeAttr','providerAvatarPlatform','providerAvatarSupported','providerAvatarCredentialMessage','avatarPlatformLabel','avatarCandidateProviders','activeAvatarProvider','avatarProviderOptionLabel','renderAvatarSection','registerAssetAvatar','registerSelectedAssetAvatars'])vm.runInContext(fn(name),c);
 return c;
}
function provider(platform='volcengine',ready=true){return {id:'custom-id',name:'火山引擎',enabled:true,has_key:false,avatar_registration:{platform,supported:!!platform,credentials_configured:ready}};}
test('member response without protocol or URL renders the supported registration button',()=>{
 const p=provider(),c=fixture(p),html=c.renderAvatarSection({id:'image'});
 assert.equal(c.providerAvatarPlatform(p),'volcengine');
 assert.match(html,/注册并等待审核/);assert.doesNotMatch(html,/尚未接入|尚未配置 API Key|data-avatar-register="image"[^>]*disabled/);
});
test('missing AK/SK is explained and blocked in both single and batch submission',async()=>{
 const p=provider('volcengine',false);p.has_key=true;
 const c=fixture(p),html=c.renderAvatarSection({id:'image'});
 assert.match(html,/AK\/SK/);assert.match(html,/data-avatar-register="image"[^>]*disabled/);assert.doesNotMatch(html,/尚未接入/);
 await c.registerAssetAvatar('image');assert.match(c.message,/AK\/SK/);
 c.message='';await c.registerSelectedAssetAvatars();assert.match(c.message,/AK\/SK/);
 assert.equal(c.avatarSubmittingItems.size,0);
});
test('only assigned enabled Volcengine accounts can appear or be selected for certification',()=>{
 const p=provider('apimart',false),c=fixture(p);
 assert.equal(c.activeAvatarProvider(),null);assert.match(c.renderAvatarSection({id:'image'}),/火山引擎/);
 assert.doesNotMatch(c.renderAvatarSection({id:'image'}),/APIMart/);
 const v=provider();v.id='volc';c.apiProviders.push(v, {...v,id:'disabled',enabled:false}, {id:'grasi',enabled:true});
 c.avatarRegisterProvider=p.id;
 assert.deepEqual(Array.from(c.avatarCandidateProviders(),p=>p.id),['volc']);
 assert.equal(c.activeAvatarProvider().id,'volc');
});
test('legacy local configuration keeps protocol/host detection and uses the right credential type',()=>{
 const c=fixture({});
 assert.equal(c.providerAvatarPlatform({protocol:'volcengine'}),'volcengine');
 assert.equal(c.providerAvatarPlatform({base_url:'https://api.apimart.ai'}),'apimart');
 assert.equal(c.providerAvatarCredentialMessage({protocol:'volcengine',has_key:false,has_volcengine_access_key:true,has_volcengine_secret_key:true}),'');
 assert.match(c.providerAvatarCredentialMessage({protocol:'volcengine',has_key:true,has_volcengine_secret_key:false}),/AK\/SK/);
});
