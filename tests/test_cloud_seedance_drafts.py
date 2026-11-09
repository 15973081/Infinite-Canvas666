"""Draft identity survives durable result delivery and remains workspace scoped."""
import os
import time

import pytest
from psycopg.types.json import Jsonb
from test_cloud_member_gateway import operator, world, headers
from test_cloud_canvas_leases import setup_canvas, acquire, proof
from test_cloud_maintenance_control import reset_maintenance
from test_cloud_canvas_task_results import result_task

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1', reason='Use tools/cloud_test.py')


@pytest.mark.parametrize('stage', ['draft', 'final'])
def test_seedance_durable_video_identity_survives_join_and_reload(world, tmp_path, stage):
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    path, canvas=setup_canvas(world, 'smart')
    task_id, asset=result_task(world, canvas, tmp_path, 'video')
    metadata={'seedance_draft':{'source_task_id':task_id,'task_id':'upstream-sample','provider_id':'ark',
                              'model':'doubao-seedance-2-5-260628','expires_at':time.time()+86400}} if stage=='draft' else {'draft_source_task_id':'canvas_vid_original'}
    with workspace_scope(world['a']['id']), connection() as conn:
        conn.execute('UPDATE tasks SET result=result || %s WHERE id=%s',(Jsonb(metadata),task_id))
    lease=acquire(world,path)
    response=world['editor'].post(path+'/task-results/'+task_id+'/join',headers=proof(world,lease,canvas['revision']))
    assert response.status_code==200,response.text
    joined=response.json()['canvas']
    media=next(node['images'][0] for node in joined['nodes'] if node.get('result_task_id')==task_id)
    for key,value in metadata.items():
        assert media[key]==value
    loaded=world['editor'].get(path,headers=headers(world['a']))
    assert loaded.status_code==200
    restored=next(node['images'][0] for node in loaded.json()['canvas']['nodes'] if node.get('result_task_id')==task_id)
    for key,value in metadata.items():
        assert restored[key]==value
    assert world['outsider'].get(path+'/task-results',headers=headers(world['b'])).status_code==404
