"""Run with tools/cloud_test.py tests/test_cloud_asset_purge.py -k asset_purge."""
import os,uuid
from unittest.mock import patch
import pytest
from fastapi import HTTPException
pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Requires disposable local PostgreSQL schema')


def test_asset_purge_real_storage_retry_and_reference_fencing(tmp_path):
    from app.storage import media,database,documents
    from app.services import canvas_asset_catalog as catalog,canvas_asset_purge as purge
    from psycopg.types.json import Jsonb
    path=tmp_path/'image.png';path.write_bytes(b'original')
    asset=media.publish(path)
    child=media.publish(path,parent_asset_id=asset['id'],role='preview')
    key=asset['id']
    with database.connection() as conn:
        conn.execute("INSERT INTO canvas_asset_catalog(workspace_id,asset_key,snapshot,trashed_at) VALUES('default',%s,%s,now())",(key,Jsonb({'id':key,'canvas_id':'c','url':media.stable_url(asset),'canvas_kind':'classic'})))
    payload={'action':'purge','confirm_permanent':True,'items':[{'key':key,'version':1}]}
    documents.put('canvas_backup','purge-test',{'url':media.stable_url(child)})
    with pytest.raises(HTTPException): catalog.mutate(payload)
    documents.delete('canvas_backup','purge-test')
    with patch.object(purge,'delete_object',side_effect=RuntimeError('unavailable')):
        result=catalog.mutate(payload)
    assert result['changed']==0 and result['failures']
    with pytest.raises(HTTPException): documents.put('library','purge-test',{'url':media.stable_url(asset)})
    with pytest.raises(HTTPException): media.publish(path,parent_asset_id=key)
    result=catalog.mutate(payload)
    assert result=={'changed':1,'failures':[]}
    for item in [asset,child]:
        assert not media.store().path(item['object_key'],item['object_version_id']).exists()
        with pytest.raises(HTTPException): media.get_asset(item['id'])
    data=catalog.decorate({'items':[],'canvases':[{'id':'c'}],'categories':[]},trash=True)
    assert not any(i['asset_key']==key for i in data['items'])
    with pytest.raises(HTTPException): catalog.mutate({'action':'restore','items':payload['items']})
