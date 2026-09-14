import os
import pytest
from test_cloud_member_gateway import operator
from test_cloud_management import platform

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def test_catalog_presets_match_legacy_without_seeding_credentials_or_overwriting_saved_rows(platform):
 from app.storage.database import connection
 from app.providers.registry import default_api_providers
 from app.services import provider_control
 with connection() as conn:
  before=conn.execute('SELECT * FROM managed_providers ORDER BY id').fetchall()
 result=platform['client'].get('/api/providers')
 assert result.status_code==200,result.text
 presets=result.json()['presets'];volc=presets['builtin'][0]
 legacy=default_api_providers()[0]
 for key in ('base_url','protocol','video_models','volcengine_project_name','volcengine_region'):
  assert volc['config'][key]==legacy[key]
 assert [row['id'] for row in presets['quickstart']]==['apimart','yuli','agnes','fhl']
 with connection() as conn:assert conn.execute('SELECT * FROM managed_providers ORDER BY id').fetchall()==before
 assert all('api_key' not in row['config'] for group in presets.values() for row in group)
 assert all(row['id'] not in {'comfy','comfyui','modelscope','runninghub'} for group in presets.values() for row in group)
 old=next((row for row in result.json()['providers'] if row['id']=='volcengine'),None)
 version=old['version'] if old else 0
 saved=provider_control.save(platform['operator'],'volcengine',{**{k:v for k,v in volc['config'].items() if k!='id'},'name':'自己的方舟','enabled':False,'video_models':['ep-preserved']},version,reason='预设保留验收')
 current=platform['client'].get('/api/providers').json()
 row=next(p for p in current['providers'] if p['id']=='volcengine')
 assert row['config']==saved['config'] and row['version']==saved['version']
 assert current['presets']['builtin'][0]['config']['name']=='火山引擎'
