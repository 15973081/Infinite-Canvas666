import json
import os
import pytest
from test_cloud_member_gateway import operator, world, headers
from test_cloud_chat import chat_world
from test_prompt_skills import MD, bundle

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')

def upload(client,space,visibility='workspace',data=MD):
    response=client.post('/api/skills/import',headers=headers(space),files={'file':('SKILL.md',data,'text/markdown')},data={'visibility':visibility})
    assert response.status_code==200,response.text
    return response.json()['id']

def test_sharing_explicit_upload_identity_and_workspace_installs(world):
    w=world; sid=upload(w['editor'],w['a'])
    assert w['outsider'].get('/api/skills/'+sid,headers=headers(w['b'])).status_code==404
    assert w['outsider'].post('/api/skills/'+sid+'/install',headers=headers(w['b'])).status_code==404
    row=next(s for s in w['editor'].get('/api/skills',headers=headers(w['a'])).json()['skills'] if s['id']==sid)
    assert row['uploader_id']==w['people'][0]['id'] and row['origin_workspace_id']==w['a']['id']
    assert row['enabled'] and row['can_edit'] and row['installed_version_id']
    assert w['viewer'].post('/api/skills/'+sid+'/install',headers=headers(w['a'])).status_code==403
    assert w['editor'].patch('/api/skills/'+sid,headers=headers(w['a']),json={'visibility':'shared'}).status_code==200
    assert w['outsider'].post('/api/skills/'+sid+'/install',headers=headers(w['b'])).status_code==200
    assert w['outsider'].patch('/api/skills/'+sid,headers=headers(w['b']),json={'visibility':'workspace'}).status_code==403
    assert w['outsider'].delete('/api/skills/'+sid,headers=headers(w['b'])).status_code==403
    assert w['outsider'].get('/api/skills/'+sid,headers=headers(w['a'])).status_code==403
    assert w['viewer'].get('/api/skills?scope=enabled',headers=headers(w['a'])).json()['skills']==[]
    assert w['viewer'].patch('/api/skills/'+sid+'/preference',headers=headers(w['a']),json={'enabled':True}).status_code==200
    assert w['editor'].patch('/api/skills/'+sid+'/preference',headers=headers(w['a']),json={'enabled':False}).status_code==200
    assert sid not in [s['id'] for s in w['editor'].get('/api/skills?scope=enabled',headers=headers(w['a'])).json()['skills']]
    assert sid in [s['id'] for s in w['viewer'].get('/api/skills?scope=enabled',headers=headers(w['a'])).json()['skills']]
    # Withdrawing publication cannot mutate an already-installed pinned copy.
    assert w['editor'].delete('/api/skills/'+sid,headers=headers(w['a'])).status_code==200
    assert w['outsider'].get('/api/skills/'+sid,headers=headers(w['b'])).status_code==200
    assert w['outsider'].delete('/api/skills/'+sid+'/install',headers=headers(w['b'])).status_code==200
    assert w['outsider'].get('/api/skills/'+sid,headers=headers(w['b'])).status_code==404

@pytest.mark.parametrize('path',['/api/chat','/api/chat/stream'])
def test_skill_chat_is_prompt_only_and_history_survives_uninstall(chat_world,path):
    w=chat_world; sid=upload(w['editor'],w['a'],data=MD+b'\nNever execute platform actions.')
    response=w['editor'].post(path,headers=headers(w['a']),json={**w['payload'],'skill_ids':[sid]})
    assert response.status_code==200,response.text
    result=([json.loads(line[5:]) for line in response.text.splitlines() if line.startswith('data:')][-1]
            if path.endswith('/stream') else response.json())
    body=json.loads(w['calls'][-1].content)
    assert 'tools' not in body and 'functions' not in body
    assert body['messages'][1]['role']=='user'
    assert 'Ask for subject' in body['messages'][1]['content'] and '不要执行脚本' in body['messages'][1]['content']
    cid=result['conversation']['id']
    refs=result['conversation']['messages'][0]['skill_refs']
    assert refs[0]['id']==sid and refs[0]['version_id'] and refs[0]['context']
    assert w['editor'].delete('/api/skills/'+sid+'/install',headers=headers(w['a'])).status_code==200
    history=w['editor'].get('/api/conversations/'+cid,headers=headers(w['a'])).json()
    assert 'Ask for subject' in json.dumps(history)
    before=len(w['calls'])
    invalid=w['editor'].post(path,headers=headers(w['a']),json={**w['payload'],'skill_ids':[sid]})
    assert invalid.status_code==409 and len(w['calls'])==before

def test_uninstalled_foreign_and_disabled_skills_rejected_before_history(chat_world):
    w=chat_world; sid=upload(w['outsider'],w['b'],'shared')
    before=w['editor'].get('/api/conversations',headers=headers(w['a'])).json()
    for value in [sid,'skl_missing']:
        r=w['editor'].post('/api/chat',headers=headers(w['a']),json={**w['payload'],'skill_ids':[value]})
        assert r.status_code==409,r.text
    assert not w['calls']
    assert w['editor'].get('/api/conversations',headers=headers(w['a'])).json()==before
    assert w['editor'].post('/api/skills/'+sid+'/install',headers=headers(w['a'])).status_code==200
    assert w['editor'].patch('/api/skills/'+sid+'/preference',headers=headers(w['a']),json={'enabled':False}).status_code==200
    assert w['editor'].post('/api/chat',headers=headers(w['a']),json={**w['payload'],'skill_ids':[sid]}).status_code==409

def test_package_preview_and_import_rejections(world):
    w=world
    response=w['editor'].post('/api/skills/preview',headers=headers(w['a']),files={'file':('skill.zip',bundle({'skill/SKILL.md':MD,'skill/scripts/x.py':b'print(1)'}))})
    assert response.status_code==200 and response.json()['warnings']
    assert w['viewer'].post('/api/skills/import',headers=headers(w['a']),files={'file':('SKILL.md',MD)}).status_code==403
    assert w['editor'].post('/api/skills/import',headers=headers(w['a']),files={'file':('bad.zip',bundle({'../SKILL.md':MD}))}).status_code==400
    assert w['editor'].post('/api/skills/import',headers=headers(w['a']),files={'file':('SKILL.md',MD)},data={'visibility':'public'}).status_code==422
