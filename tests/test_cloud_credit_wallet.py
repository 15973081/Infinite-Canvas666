import os
import pytest
from test_cloud_member_gateway import operator, world
from app.storage.database import connection
from app.services.credit_wallet import record_grant

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')


def test_credit_wallet_http_identity_filter_and_no_public_writes(world):
    from fastapi.testclient import TestClient
    from main import app
    owner=world['people'][0]['id'];other=world['people'][1]['id']
    with connection() as conn:
        record_grant(conn,owner,source='RECHARGE',amount=100,reference='verified:1',validity='PERMANENT')
        record_grant(conn,owner,source='RECHARGE_GIFT',amount=15,reference='verified:1:gift',validity='PERMANENT')
    client=world['editor'];path='/api/account/credits'
    response=client.get(path,headers={'X-Member-ID':owner})
    assert response.status_code==200,response.text
    assert response.headers['cache-control']=='private, no-store'
    assert response.json()['wallet']['total_balance']=='115'
    assert client.get(path+'?member_id='+other).json()['wallet']['total_balance']=='115'
    assert world['viewer'].get(path+'?member_id='+owner).json()['records']==0
    assert client.get(path,headers={'X-Member-ID':other}).status_code==409
    assert client.get(path+'?category=gift&page_size=1').json()['entries'][0]['amount']=='15'
    assert client.get(path+'?category=subscription').status_code==400
    for query in ['page=0','page_size=101','page=999999999999999999999']:
        assert client.get(path+'?'+query).status_code==422
    assert client.post(path,json={'amount':99999}).status_code==405
    with TestClient(app) as anon:
        assert anon.get(path).status_code==401
    with connection() as conn:
        conn.execute("UPDATE members SET status='disabled' WHERE id=%s",(owner,))
    assert client.get(path).status_code==401
