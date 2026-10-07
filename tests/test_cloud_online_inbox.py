"""Real HTTP, PostgreSQL and object versions for the online works lifecycle."""
import io
import os
import time
import uuid
from unittest.mock import patch

import pytest
from PIL import Image
from psycopg.types.json import Jsonb
from test_cloud_member_gateway import operator, world, headers

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def generated(world, count=1, task=True, canvas=False):
    from app.storage import database,documents,tasks,media
    from app.storage.workspace import workspace_scope
    head=headers(world['a']);urls=[]
    for index in range(count):
        buf=io.BytesIO();Image.new('RGB',(96,64),(index*30,80,120)).save(buf,'PNG')
        uploaded=world['editor'].post('/api/ai/upload',headers=head,files={'files':('generated.png',buf.getvalue(),'image/png')})
        assert uploaded.status_code==200,uploaded.text
        urls.append(uploaded.json()['files'][0]['url'])
    task_id='canvas_img_'+uuid.uuid4().hex
    result={'type':'online','images':urls,'prompt':'海边散步 <安全名称>','model':'test-model','timestamp':time.time(),'params':{}}
    history_id='task:'+task_id if task else 'legacy-'+uuid.uuid4().hex
    with workspace_scope(world['a']['id']):
        if task:
            metadata={'id':task_id,'type':'online-image','status':'succeeded','result':result,'billing_price':{'unit_price':'0.05'}}
            if canvas: metadata['canvas_id']='orphan-old-canvas'
            tasks.save(metadata,{'prompt':result['prompt'],'model':'test-model'},historical=True)
            with database.connection() as conn:
                conn.execute('UPDATE tasks SET requested_by=%s WHERE id=%s',(world['people'][0]['id'],task_id))
        documents.put('history',history_id,result)
        assets=[media.get_asset(url) for url in urls]
    response=world['editor'].get('/api/online-works',headers=head)
    assert response.status_code==200,response.text
    rows=sorted([r for r in response.json()['items'] if r['history_id']==history_id],key=lambda r:r['image_index'])
    return rows,assets,task_id,result,history_id


def action(world, rows, name, **extra):
    return world['editor'].post('/api/online-works/actions',headers=headers(world['a']),json={
        'action':name,'items':[{'id':r['id'],'revision':r['revision']} for r in rows],**extra})


def listing(world,state='inbox'):
    return world['editor'].get('/api/online-works',headers=headers(world['a']),params={'state':state}).json()['items']


def test_inbox_individual_works_crud_search_ownership_workspace_pagination(world):
    rows,assets,task_id,result,key=generated(world,2)
    assert len(rows)==2 and all(r['owner_id']==world['people'][0]['id'] and r['can_manage'] for r in rows)
    payload={'action':'trash','items':[{'id':rows[0]['id'],'revision':1}]}
    assert world['viewer'].post('/api/online-works/actions',headers=headers(world['a']),json=payload).status_code==403
    assert world['outsider'].get('/api/online-works',headers=headers(world['a'])).status_code==403
    assert world['outsider'].post('/api/online-works/actions',headers=headers(world['b']),json=payload).status_code==404
    assert action(world,[rows[0]],'edit',metadata={'name':'保留版本','folder':'品牌项目','tags':['角色','角色']}).status_code==200
    assert action(world,[rows[0]],'trash').status_code==409
    filtered=world['editor'].get('/api/online-works',headers=headers(world['a']),params={'q':'保留','folder':'品牌项目','owner':'mine'}).json()['items']
    assert len(filtered)==1 and filtered[0]['tags']==['角色']
    assert action(world,filtered,'save').status_code==200
    saved=listing(world,'saved');assert len(saved)==1
    assert action(world,saved,'trash').status_code==200
    recycled=listing(world,'trash');assert recycled[0]['previous_state']=='saved'
    assert action(world,recycled,'restore').status_code==200
    assert len(listing(world,'saved'))==1
    # History compatibility means recycle, never immediate physical deletion.
    response=world['editor'].post('/api/history/delete',headers=headers(world['a']),json={'timestamp':result['timestamp']})
    assert response.status_code==200 and response.json()['recycled']
    assert len(listing(world,'trash'))==2
    for asset in assets:
        from app.storage import media
        assert media.store().path(asset['object_key'],asset['object_version_id']).exists()
    first=world['editor'].get('/api/online-works',headers=headers(world['a']),params={'state':'trash','limit':1}).json()
    second=world['editor'].get('/api/online-works',headers=headers(world['a']),params={'state':'trash','limit':1,'cursor':first['next_cursor']}).json()
    assert first['items'][0]['id']!=second['items'][0]['id']
    assert world['editor'].get('/api/online-works',headers=headers(world['a']),params={'state':'saved','cursor':first['next_cursor']}).status_code==400


def test_inbox_release_one_terminal_output_and_real_files_retry_keep_billing(world,tmp_path):
    from app.storage import media,database
    from app.storage.workspace import workspace_scope
    from app.services import online_inbox_purge
    rows,assets,task_id,result,key=generated(world,2)
    with workspace_scope(world['a']['id']):
        preview=tmp_path/'preview.png';preview.write_bytes(b'preview')
        child=media.publish(preview,parent_asset_id=assets[0]['id'],role='preview')
        with database.connection() as conn:
            # A retained audit/fee record may keep its historical URL: never rewrite charges.
            conn.execute('''INSERT INTO ledger_entries(id,workspace_id,canvas_id,created_at,log_json,cost_json,source,cost_status,amount_micros,currency,kind,status,updated_at)
                VALUES(%s,%s,'online',1,%s,'{}','task','priced',50000,'CNY','image','succeeded',1)''',
                ('ledger-'+task_id,world['a']['id'],Jsonb({'outputs':result['images'],'model':'test-model'})))
    assert action(world,[rows[0]],'trash').status_code==200
    target=listing(world,'trash')[0]
    assert action(world,[target],'purge').status_code==400
    with patch.object(online_inbox_purge,'delete_object',side_effect=RuntimeError('store unavailable')):
        response=action(world,[target],'purge',confirm_permanent=True)
    assert response.status_code==200,response.text
    assert response.json()['failures']
    pending=listing(world,'trash')[0];assert pending['state']=='purging'
    assert action(world,[pending],'restore').status_code==409
    with workspace_scope(world['a']['id']):
        from app.storage import documents
        with pytest.raises(Exception): documents.put('library','race',{'url':result['images'][0]})
    response=action(world,[pending],'purge',confirm_permanent=True)
    assert response.status_code==200 and response.json()['changed']==1,response.text
    with workspace_scope(world['a']['id']):
        for asset in [assets[0],child]: assert not media.store().path(asset['object_key'],asset['object_version_id']).exists()
        assert media.store().path(assets[1]['object_key'],assets[1]['object_version_id']).exists()
        with database.connection() as conn:
            task=conn.execute('SELECT * FROM tasks WHERE id=%s',(task_id,)).fetchone()
            ledger=conn.execute('SELECT amount_micros,log_json FROM ledger_entries WHERE id=%s',('ledger-'+task_id,)).fetchone()
        assert task['result']['images']==[result['images'][1]] and task['result']['media_expired']
        assert assets[0]['id'] not in task['output_asset_ids'] and assets[1]['id'] in task['output_asset_ids']
        assert task['legacy_metadata']['billing_price']=={'unit_price':'0.05'}
        assert ledger['amount_micros']==50000 and ledger['log_json']['outputs']==result['images']
    assert not listing(world,'trash')


@pytest.mark.parametrize('source',['canvas_backup','asset_library','task_input','active_task','canvas'])
def test_inbox_protected_references_rollback_and_no_file_deletion(world,source):
    from app.storage import media,database,documents
    from app.storage.workspace import workspace_scope
    rows,assets,task_id,result,key=generated(world)
    with workspace_scope(world['a']['id']):
        if source in {'canvas_backup','asset_library'}: documents.put(source,'protected',{'url':result['images'][0]})
        elif source=='canvas':
            with database.connection() as conn:
                conn.execute("INSERT INTO canvases(id,workspace_id,title,document) VALUES(%s,%s,'保护画布',%s)",
                    ('canvas-'+uuid.uuid4().hex,world['a']['id'],Jsonb({'nodes':[{'url':result['images'][0]}],'connections':[]})))
        else:
            with database.connection() as conn:
                if source=='active_task': conn.execute("UPDATE tasks SET status='needs_review' WHERE id=%s",(task_id,))
                else: conn.execute('UPDATE tasks SET input_asset_ids=%s,request=request || %s WHERE id=%s',
                    (Jsonb([assets[0]['id']]),Jsonb({'reference_images':[{'url':result['images'][0]}]}),task_id))
    rows=listing(world,'saved') or listing(world)
    state=rows[0]['state']
    client=world['editor'];head=headers(world['a'])
    assert client.get('/api/online-works',headers=head,params={'state':state,'references':'unreferenced'}).json()['items']==[]
    referenced=client.get('/api/online-works',headers=head,params={'state':state,'references':'referenced'}).json()['items']
    assert [r['id'] for r in referenced]==[rows[0]['id']]
    assert action(world,rows,'trash').status_code==200
    target=listing(world,'trash')[0]
    response=action(world,[target],'purge',confirm_permanent=True)
    assert response.status_code==409,response.text
    assert listing(world,'trash')[0]['state']=='trash'
    with workspace_scope(world['a']['id']):
        assert media.get_asset(assets[0]['id'])['status']=='ready'
        assert media.store().path(assets[0]['object_key'],assets[0]['object_version_id']).exists()
        with database.connection() as conn:
            assert conn.execute('SELECT result FROM tasks WHERE id=%s',(task_id,)).fetchone()['result']['images']==result['images']


def test_inbox_reference_filter_before_pagination_combined_filters_readonly(world):
    from app.storage import database,documents
    from app.storage.workspace import workspace_scope
    from app.services import online_inbox_references
    rows,assets,task_id,result,key=generated(world,3)
    client=world['editor'];head=headers(world['a'])
    assert action(world,rows,'edit',metadata={'folder':'项目A','tags':['筛选']}).status_code==200
    with workspace_scope(world['a']['id']):
        # A recycled canvas still protects this original.
        with database.connection() as conn:
            conn.execute("INSERT INTO canvases(id,workspace_id,title,document,deleted_at) VALUES(%s,%s,'回收的画布',%s,now())",
                ('filter-'+uuid.uuid4().hex,world['a']['id'],Jsonb({'nodes':[{'url':result['images'][1]}],'connections':[]})))
            task_before=conn.execute('SELECT * FROM tasks WHERE id=%s',(task_id,)).fetchone()
        documents.put('history','external-'+uuid.uuid4().hex,{'type':'online','images':['https://example.invalid/a.png'],'prompt':'外部图片'})
        history_before=documents.get('history',key)
    params={'references':'unreferenced','limit':1,'folder':'项目A','model':'test-model','owner':'mine','q':'筛选'}
    first=client.get('/api/online-works',headers=head,params=params).json()
    assert len(first['items'])==1 and first['next_cursor']
    second=client.get('/api/online-works',headers=head,params={**params,'cursor':first['next_cursor']}).json()
    assert len(second['items'])==1 and second['next_cursor'] is None
    assert {first['items'][0]['id'],second['items'][0]['id']}=={rows[0]['id'],rows[2]['id']}
    assert client.get('/api/online-works',headers=head,params={**params,'references':'all','cursor':first['next_cursor']}).status_code==400
    assert client.get('/api/online-works',headers=head,params={'references':'invalid'}).status_code==400
    assert client.get('/api/online-works',headers=head,params={'references':'unreferenced','q':'不存在'}).json()['items']==[]
    assert world['outsider'].get('/api/online-works',headers=headers(world['b']),params={'references':'unreferenced'}).json()['items']==[]
    viewer=world['viewer'].get('/api/online-works',headers=head,params={'references':'unreferenced'}).json()['items']
    assert {r['id'] for r in viewer}=={rows[0]['id'],rows[2]['id']} and not any(r['can_manage'] for r in viewer)
    with workspace_scope(world['a']['id']):
        assert documents.get('history',key)==history_before
        with database.connection() as conn:
            assert conn.execute('SELECT * FROM tasks WHERE id=%s',(task_id,)).fetchone()==task_before
            assert {r['status'] for r in conn.execute('SELECT status FROM assets WHERE id=ANY(%s)',([a['id'] for a in assets],))}=={'ready'}
    # Default browsing avoids the additional reference scan entirely.
    with patch.object(online_inbox_references,'matching_work_ids',side_effect=AssertionError('unneeded scan')):
        assert client.get('/api/online-works',headers=head).status_code==200


@pytest.mark.parametrize('source',['other_work','history_input','task_lease','preview_backup','legacy_canvas_task'])
def test_inbox_reference_filter_conservative_sources(world,source,tmp_path):
    from app.storage import database,documents,media
    from app.storage.workspace import workspace_scope
    rows,assets,task_id,result,key=generated(world)
    with workspace_scope(world['a']['id']):
        if source=='other_work':
            documents.put('history','other-origin',result)
        elif source=='history_input':
            documents.put('history',key,{**result,'params':{'reference_images':result['images']}})
        elif source=='preview_backup':
            preview=tmp_path/'preview.png';preview.write_bytes(b'preview')
            child=media.publish(preview,parent_asset_id=assets[0]['id'],role='preview')
            documents.put('canvas_backup','retained-preview',{'url':media.stable_url(child)})
        else:
            with database.connection() as conn:
                if source=='task_lease':
                    conn.execute("UPDATE tasks SET lease_owner='filter-test',lease_token=%s,lease_until=now()+interval '1 hour' WHERE id=%s",(uuid.uuid4(),task_id))
                else:
                    conn.execute('UPDATE tasks SET request=request || %s WHERE id=%s',(Jsonb({'canvas_id':'orphan-canvas'}),task_id))
    client=world['editor'];head=headers(world['a'])
    assert client.get('/api/online-works',headers=head,params={'references':'unreferenced'}).json()['items']==[]
    assert rows[0]['id'] in {r['id'] for r in client.get('/api/online-works',headers=head,params={'references':'referenced'}).json()['items']}
    if source=='preview_backup':
        with workspace_scope(world['a']['id']): documents.delete('canvas_backup','retained-preview')
        assert [r['id'] for r in client.get('/api/online-works',headers=head,params={'references':'unreferenced'}).json()['items']]==[rows[0]['id']]


def test_inbox_legacy_unknown_author_and_orphan_canvas_exclusion(world):
    rows,*_=generated(world,task=False)
    assert len(rows)==1 and rows[0]['owner_id'] is None and not rows[0]['can_manage']
    assert action(world,rows,'trash').status_code==403
    rows,*_=generated(world,canvas=True)
    assert not rows


def test_library_import_reuses_physical_file_and_protects_it(world):
    from app.storage import database
    from app.storage.workspace import workspace_scope
    rows,assets,task_id,result,key=generated(world)
    client=world['editor'];head=headers(world['a'])
    lib=client.get('/api/asset-library',headers=head).json()['library']['libraries'][0];category=lib['categories'][0]
    with workspace_scope(world['a']['id']):
        with database.connection() as conn: before=conn.execute('SELECT count(*) AS n FROM assets WHERE workspace_id=%s',(world['a']['id'],)).fetchone()['n']
    response=client.post('/api/asset-library/items/batch',headers=head,json={'library_id':lib['id'],'category_id':category['id'],'items':[{'url':result['images'][0],'name':'保留原件'}]})
    assert response.status_code==200,response.text
    assert response.json()['items'][0]['media_asset_id']==assets[0]['id']
    rows=listing(world,'saved');assert len(rows)==1
    with workspace_scope(world['a']['id']):
        with database.connection() as conn: assert conn.execute('SELECT count(*) AS n FROM assets WHERE workspace_id=%s',(world['a']['id'],)).fetchone()['n']==before
    assert action(world,rows,'trash').status_code==200
    assert action(world,listing(world,'trash'),'purge',confirm_permanent=True).status_code==409


def test_inbox_actual_browser(world,monkeypatch):
    import json,socket,subprocess,threading
    import uvicorn
    from main import app
    from pathlib import Path
    probe=subprocess.run(['node','-e',"require.resolve('playwright')"],capture_output=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if probe.returncode: pytest.skip('Set NODE_PATH to installed Playwright packages for browser acceptance')
    generated(world,2)
    listener=socket.socket();listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
    monkeypatch.setenv('PUBLIC_BASE_URL',f'http://127.0.0.1:{port}')
    server=uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=port,log_level='error',lifespan='off'))
    thread=threading.Thread(target=server.run,kwargs={'sockets':[listener]},daemon=True);thread.start()
    try:
        for _ in range(200):
            if server.started: break
            time.sleep(.02)
        assert server.started
        config={'base':f'http://127.0.0.1:{port}','workspace':world['a']['id'],'username':world['people'][0]['username'],'password':'test-only-password-12345'}
        result=subprocess.run(['node',str(Path(__file__).with_name('online-inbox.browser.cjs')),json.dumps(config)],
            capture_output=True,text=True,encoding='utf-8',timeout=100,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        assert result.returncode==0,result.stdout+result.stderr
    finally:
        server.should_exit=True;thread.join(timeout=10);listener.close()


def test_inbox_migration_recovers_deleted_history(world):
    from pathlib import Path
    from app.storage import database,documents
    from app.storage.workspace import workspace_scope
    rows,assets,task_id,result,key=generated(world,2)
    with workspace_scope(world['a']['id']):
        documents.delete('history',key)
        with database.connection() as conn:
            conn.execute('DELETE FROM online_works WHERE workspace_id=%s',(world['a']['id'],))
            source=Path('app/storage/migrations/027_online_inbox.sql').read_text(encoding='utf-8')
            conn.execute(source[source.index('INSERT INTO canvas_cloud.online_works'):].replace('canvas_cloud.',database.schema_name()+'.'),prepare=False)
            repair=Path('app/storage/migrations/028_online_inbox_cloud_refs.sql').read_text(encoding='utf-8')
            conn.execute(repair.replace('canvas_cloud.',database.schema_name()+'.'),prepare=False)
    rows=listing(world);assert len(rows)==2
    assert all(r['task_id']==task_id and r['owner_id']==world['people'][0]['id'] for r in rows)
    assert {r['asset_id'] for r in rows}=={a['id'] for a in assets}
    assert action(world,rows,'trash').status_code==200
    assert action(world,listing(world,'trash'),'purge',confirm_permanent=True).status_code==200
    from app.storage import media
    with workspace_scope(world['a']['id']):
        for asset in assets: assert not media.store().path(asset['object_key'],asset['object_version_id']).exists()


def test_inbox_last_output_cleans_private_checkpoints(world,tmp_path):
    from app.storage import database,media,finalization,image_receipts
    from app.storage.workspace import workspace_scope
    rows,assets,task_id,result,key=generated(world)
    path=tmp_path/'supplier-result.json';path.write_text('{"sources":["large-encoded-image"]}')
    with workspace_scope(world['a']['id']):
        source=media.publish(path,asset_id=finalization.source_id(task_id),role='task-result-source')
        receipt=media.publish(path,asset_id=image_receipts.asset_id(task_id,0,'result'),role='task-result-source')
        with database.connection() as conn:
            conn.execute('UPDATE tasks SET legacy_metadata=legacy_metadata || %s WHERE id=%s',(Jsonb({'result_source_asset_id':source['id']}),task_id))
    assert action(world,rows,'trash').status_code==200
    response=action(world,listing(world,'trash'),'purge',confirm_permanent=True)
    assert response.status_code==200,response.text
    assert response.json()['freed_bytes']==sum(a['size_bytes'] for a in [assets[0],source,receipt])
    with workspace_scope(world['a']['id']):
        for asset in [source,receipt]: assert not media.store().path(asset['object_key'],asset['object_version_id']).exists()
