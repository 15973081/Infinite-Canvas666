"""Old workbench management routes cannot mutate shared or member deployments."""
import os
import uuid
from pathlib import Path
from unittest.mock import Mock

import pytest
from test_cloud_member_gateway import operator, world
from test_cloud_management import platform
pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')

OLD_OPERATIONS=[
    ('PUT','/api/providers',[]),
    ('POST','/api/providers/test-connection',{}),
    ('POST','/api/providers/probe-async',{}),
    ('POST','/api/providers/fetch-models',{}),
    ('GET','/api/providers/comfly/fetch-models',None),
    ('POST','/api/maintenance/start',{'message':'legacy request','planned_at':0}),
    ('POST','/api/maintenance/cancel',{}),
]


def test_shared_login_and_loopback_cannot_use_retired_management_routes(monkeypatch):
    from fastapi.testclient import TestClient
    from main import app
    from app.storage import database
    from app.routers import providers
    monkeypatch.setenv('AUTH_MODE','shared')
    write=Mock(side_effect=AssertionError('old settings must never be written'))
    monkeypatch.setattr(providers,'update_env_values',write)
    monkeypatch.setattr(providers,'save_api_providers',write)
    auth=(os.environ['CLOUD_ACCESS_USER'],os.environ['CLOUD_ACCESS_PASSWORD'])
    with TestClient(app,base_url='http://localhost',client=('127.0.0.1',50000)) as client:
        with database.connection() as c:
            before=c.execute("SELECT kind,id,value FROM workspace_documents WHERE kind IN ('api_providers','maintenance') ORDER BY workspace_id,kind,id").fetchall()
        for method,path,payload in OLD_OPERATIONS:
            response=client.request(method,path,json=payload,auth=auth)
            assert response.status_code==410,(path,response.text)
            assert response.json()['detail']['code']=='management_entry_required'
        assert client.get('/api/maintenance/status',auth=auth).json()['admin_allowed'] is False
        for path in ('/static/api-settings.html','/static/js/api-settings.js','/static/css/api-settings.css'):
            assert client.get(path,auth=auth).status_code==404
    write.assert_not_called()
    with database.connection() as c:
        assert c.execute("SELECT kind,id,value FROM workspace_documents WHERE kind IN ('api_providers','maintenance') ORDER BY workspace_id,kind,id").fetchall()==before


def test_member_workbench_keeps_read_summaries_but_has_no_management_mutation(world,platform):
    c=world['editor'];headers={'X-Workspace-ID':world['a']['id']}
    for method,path,payload in OLD_OPERATIONS:
        response=c.request(method,path,json=payload,headers=headers)
        assert response.status_code==403,(path,response.text)
    response=c.get('/api/providers',headers=headers)
    assert response.status_code==200 and response.json()['providers']
    assert 'secret_ciphertext' not in response.text and 'base_url' not in response.text
    page=c.get('/').text
    assert 'frame-api-settings' not in page and 'maintenance-modal' not in page
    assert '/api/maintenance/start' not in page and '仅限服务器本机' not in page
    assert 'management-entry' in page and 'noopener noreferrer' in page
    assert c.get('/api/management-entry').json()=={'url':'http://localhost:8766/'}
    # Independent app remains functional and has its own price editor artifact.
    admin=platform['client']
    assert admin.get('/api/providers').status_code==200
    assert admin.get('/static/provider-prices.js').status_code==200
    assert 'update' in admin.get('/static/provider-prices.js').text
    assert admin.get('/api/maintenance').status_code==200


def test_obsolete_static_copies_are_rejected_even_when_files_exist(tmp_path):
    from starlette.applications import Starlette
    from starlette.routing import Mount
    from fastapi.testclient import TestClient
    from app.services.static_pages import VersionedStaticFiles
    for name in ('api-settings.html','api-settings.js','api-settings.css','API-SETTINGS.HTML'):
        (tmp_path/name).write_text('obsolete administration')
    app=Starlette(routes=[Mount('/static',app=VersionedStaticFiles(directory=tmp_path))])
    with TestClient(app) as c:
        for name in ('api-settings.html','api-settings.js','api-settings.css','API-SETTINGS.HTML'):
            assert c.get('/static/'+name).status_code==404


@pytest.mark.parametrize('url',[
    'javascript:alert(1)','http://management.example','https://user:password@admin.example',
    'https://admin.example/?token=secret','https://admin.example/#token','https://admin.example/path',
    'https://admin.example:bad','https://admin.example\n.evil',
])
def test_management_entry_never_returns_invalid_or_credential_bearing_urls(world,monkeypatch,url):
    monkeypatch.setenv('MANAGEMENT_BASE_URL',url)
    assert world['editor'].get('/api/management-entry').json()=={'url':None}


def test_management_price_save_preserves_historical_intervals_and_credentials(platform):
    from app.services import provider_control
    from app.storage.database import connection
    pid='volc-migrate-'+uuid.uuid4().hex[:8]
    old={'kind':'video','model':'seedance-test','billing_type':'per_million_tokens','resolution':'720p',
         'has_video_input':False,'service_tier':'default','unit_price':'46','currency':'CNY','effective_from':1,'effective_to':2}
    current={**old,'unit_price':'50','effective_from':2,'effective_to':0}
    row=provider_control.save(platform['operator'],pid,{'name':'价格迁出','protocol':'volcengine','video_models':['seedance-test'],
        'model_prices':[old,current]},0,secrets={'api_key':'synthetic-price-key'},reason='迁出验收',preserve_price_history=True)
    new={**current,'unit_price':'0','effective_from':0}
    config={k:v for k,v in row['config'].items() if k!='id'};config['model_prices']=[old,new]
    response=platform['client'].put('/api/providers/'+pid,json={'expected_version':1,'config':config,'reason':'调整当前规格'})
    assert response.status_code==200,response.text
    prices=response.json()['config']['model_prices']
    assert any(p['unit_price']=='46' and p['effective_to']==2 for p in prices)
    assert any(p['unit_price']=='50' and p['effective_to']>2 for p in prices)
    assert any(p['unit_price']=='0' and p['effective_to']==0 for p in prices)
    assert response.json()['configured_secrets']==['api_key']
    assert 'synthetic-price-key' not in response.text
    assert platform['client'].put('/api/providers/'+pid,json={'expected_version':1,'config':config,'reason':'旧页面'}).status_code==409
    # Clearing an override closes its interval without deleting history or credentials.
    config={k:v for k,v in response.json()['config'].items() if k!='id'}
    config['model_prices']=[p for p in prices if p['effective_to']]
    cleared=platform['client'].put('/api/providers/'+pid,json={'expected_version':2,'config':config,'reason':'清除当前规格'})
    assert cleared.status_code==200,cleared.text
    closed=cleared.json()['config']['model_prices']
    assert len(closed)==3 and all(p['effective_to'] for p in closed)
    assert any(p['unit_price']=='0' and p['effective_to']>=p['effective_from'] for p in closed)
    assert cleared.json()['configured_secrets']==['api_key']
    # Omitting the price field in a later edit keeps the complete history.
    config.pop('model_prices')
    kept=platform['client'].put('/api/providers/'+pid,json={'expected_version':3,'config':config,'reason':'仅修改其他配置'})
    assert kept.status_code==200 and kept.json()['config']['model_prices']==closed
