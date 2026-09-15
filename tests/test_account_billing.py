import os
import time
import uuid
from unittest.mock import patch
import pytest
from fastapi import HTTPException
from app.services.account_billing import report
from app.services import authorization as az
from app.services.member_context import access_scope
from app.storage.database import connection
from app.storage.workspace import workspace_scope
from app.storage import tasks,canvases
from app.services.canvas_tasks import save_canvas_task
from app.services.canvas_ledger import record_task,append_logs

pytestmark=pytest.mark.skipif(os.getenv('ACCOUNT_BILLING_INTEGRATION')!='1',reason='requires isolated local PostgreSQL')

@pytest.fixture
def world():
    class Rollback(Exception): pass
    try:
        with connection() as conn:
            assert conn.execute('SELECT current_database() AS name').fetchone()['name'].startswith('canvas_delivery_')
            prefix='bill_'+uuid.uuid4().hex
            spaces=[prefix+'a',prefix+'b']
            for wid in spaces: conn.execute('INSERT INTO workspaces(id,name) VALUES(%s,%s)',(wid,'Billing test'))
            actors=[]
            for i,audience in enumerate(('workbench','workbench','management','management')):
                mid=prefix+str(i);sid=mid+'s'
                conn.execute("INSERT INTO members(id,username,display_name,status,password_salt,password_digest) VALUES(%s,%s,%s,'active','salt','digest')",(mid,mid,'同名成员'))
                conn.execute("INSERT INTO member_sessions(id,token_hash,member_id,audience,expires_at) VALUES(%s,%s,%s,%s,now()+interval '1 hour')",(sid,uuid.uuid4().hex+uuid.uuid4().hex,mid,audience))
                actors.append(az.Principal(mid,sid,audience))
            for person in actors[:2]:
                conn.execute('INSERT INTO workspace_members(workspace_id,member_id) VALUES(%s,%s)',(spaces[0],person.member_id))
            role=prefix+'role'
            conn.execute("INSERT INTO roles(id,scope,name) VALUES(%s,'platform',%s)",(role,role))
            conn.execute("INSERT INTO role_permissions VALUES(%s,'billing.platform','platform')",(role,))
            conn.execute("INSERT INTO role_permissions VALUES(%s,'billing.assign.platform','platform')",(role,))
            conn.execute('INSERT INTO platform_member_roles(member_id,role_id) VALUES(%s,%s)',(actors[2].member_id,role))
            localrole=prefix+'localrole'
            conn.execute("INSERT INTO roles(id,scope,workspace_id,name) VALUES(%s,'workspace',%s,%s)",(localrole,spaces[0],localrole))
            conn.execute("INSERT INTO role_permissions VALUES(%s,'billing.read','workspace')",(localrole,))
            conn.execute('INSERT INTO workspace_members(workspace_id,member_id) VALUES(%s,%s)',(spaces[0],actors[3].member_id))
            conn.execute('INSERT INTO workspace_member_roles VALUES(%s,%s,%s)',(spaces[0],actors[3].member_id,localrole))
            yield conn,spaces,actors,prefix
            raise Rollback()
    except Rollback: pass


def complete(conn,workspace,actor,tid,canvas_id=None,currency='CNY',amount=1234567):
    with workspace_scope(workspace):
        task={'id':tid,'type':'video','status':'queued','canvas_id':canvas_id,'created_at':time.time(),'model':'test-model','requested_by':'forged-account'}
        with access_scope(actor,workspace,()),patch('app.services.canvas_leases.request_write',return_value=({'id':canvas_id,'revision':1},{'generation':1})):
            stored=tasks.save(task,{})
        assert stored['requested_by']==actor.member_id
        token=uuid.uuid4()
        conn.execute("UPDATE tasks SET lease_owner='billing-test',lease_token=%s,lease_until=now()+interval '1 hour' WHERE id=%s",(token,tid))
        lease=tasks.lease_context.set((tid,token))
        try:
            stored.update(status='succeeded',requested_by='forged-account',result={'cost':{'status':'priced','amount_micros':amount,'currency':currency,'kind':'video','source':'actual'}})
            result=save_canvas_task(stored)
        finally: tasks.lease_context.reset(lease)
        return result


def test_requester_retry_rename_and_deleted_canvas(world):
    conn,spaces,actors,prefix=world
    with workspace_scope(spaces[0]):
        canvas={'id':prefix+'canvas','title':'Original canvas','kind':'classic','nodes':[],'connections':[]}
        canvases.save(canvas)
        task=complete(conn,spaces[0],actors[0],prefix+'task',canvas['id'])
        with access_scope(actors[1],spaces[0],()),patch('app.services.canvas_leases.request_write',return_value=({'id':canvas['id'],'revision':1},{'generation':1})):
            assert tasks.save(task,{})['requested_by']==actors[0].member_id
        record_task(task);record_task(task)
        conn.execute("UPDATE members SET display_name='Renamed' WHERE id=%s",(actors[0].member_id,))
        canvas['deleted_at']=1000;canvases.save(canvas);canvases.purge(canvas['id'])
    mine=report(actors[0],personal=True,workspace=spaces[0],member_id=actors[1].member_id)
    assert mine['records']==1 and mine['totals'][0]['amount_micros']=='1234567'
    assert mine['entries'][0]['name_at_creation']=='同名成员'
    assert mine['entries'][0]['display_name']=='Renamed'
    assert mine['entries'][0]['task_id']==task['id']
    assert report(actors[1],personal=True,workspace=spaces[0])['records']==0
    assert report(actors[0],personal=True,workspace=spaces[1])['records']==0
    conn.execute("UPDATE members SET status='disabled' WHERE id=%s",(actors[0].member_id,))
    assert report(actors[2],workspace=spaces[0])['records']==1
    with pytest.raises(HTTPException): report(actors[0],personal=True)


def test_independent_tasks_currency_paging_and_permissions(world):
    conn,spaces,actors,prefix=world
    complete(conn,spaces[0],actors[0],prefix+'one')
    complete(conn,spaces[0],actors[0],prefix+'two',currency='USD',amount=9000001)
    complete(conn,spaces[1],actors[1],prefix+'three')
    mine=report(actors[0],personal=True,page_size=1)
    assert mine['pages']==2 and mine['records']==2
    assert {r['currency']:r['amount_micros'] for r in mine['totals']}=={'CNY':'1234567','USD':'9000001'}
    assert report(actors[3],workspace=spaces[0])['records']==2
    with pytest.raises(HTTPException): report(actors[3],workspace=spaces[1])
    with pytest.raises(HTTPException): report(actors[3])
    with pytest.raises(HTTPException): report(actors[0],workspace=spaces[0])
    with pytest.raises(HTTPException): report(actors[2],from_ms=100,to_ms=50)


def test_historical_unknown_and_forged_client_owner_stay_unassigned(world):
    conn,spaces,actors,prefix=world
    with workspace_scope(spaces[0]):
        historical={'id':prefix+'old','type':'video','status':'succeeded','created_at':time.time(), 'requested_by':actors[0].member_id,'result':{'cost':{'status':'priced','amount_micros':7,'currency':'CNY','kind':'video'}}}
        with access_scope(actors[1],spaces[0],()):
            stored=tasks.save(historical,{},historical=True)
        assert stored['requested_by'] is None
        record_task(stored)
        append_logs('unmatched',[{'id':prefix+'log','createdAt':int(time.time()*1000),'status':'success','requested_by':actors[0].member_id,'member_id':actors[0].member_id,'cost':{'status':'priced','amount_micros':11,'currency':'CNY','kind':'image'}}],providers=[])
    data=report(actors[2],workspace=spaces[0],member_id='unassigned')
    assert data['records']==2 and data['totals'][0]['amount_micros']=='18'
    assert report(actors[0],personal=True)['records']==0


def test_standalone_result_linked_to_canvas_is_not_charged_twice(world):
    conn,spaces,actors,prefix=world
    with workspace_scope(spaces[0]):
        task=complete(conn,spaces[0],actors[0],prefix+'task')
        log={'id':prefix+'client','canvas_task_id':task['id'],'createdAt':int(time.time()*1000),'status':'success',
             'cost':{'status':'priced','amount_micros':1234567,'currency':'CNY','kind':'video'}}
        append_logs(prefix+'canvas',[log],providers=[])
        record_task(task)
    data=report(actors[0],personal=True,workspace=spaces[0])
    assert data['records']==1 and data['totals'][0]['amount_micros']=='1234567'
    assert data['entries'][0]['canvas_id']==prefix+'canvas'


def test_manual_canvas_assignment_preview_audit_and_original_author(world):
    from app.services.billing_assignment import assign
    conn,spaces,actors,prefix=world
    cid=prefix+'canvas'
    with workspace_scope(spaces[0]):
        canvases.save({'id':cid,'title':'Invoice canvas','kind':'classic','nodes':[],'connections':[]})
        task=complete(conn,spaces[0],actors[0],prefix+'task',cid)
        append_logs(cid,[{'id':prefix+'unknown','createdAt':int(time.time()*1000),'status':'success',
                         'cost':{'status':'priced','amount_micros':17,'currency':'CNY','kind':'image'}}],providers=[])
    args=dict(canvas_id=cid,member_id=actors[1].member_id,reason='历史画布账单补录')
    preview=assign(actors[2],spaces[0],**args)
    assert preview['records']==1 and preview['skipped']==1
    with pytest.raises(HTTPException): assign(actors[3],spaces[0],**args)
    with pytest.raises(HTTPException): assign(actors[2],spaces[1],**args)
    result=assign(actors[2],spaces[0],**args,preview_token=preview['preview_token'])
    assert result['assigned']==1
    assert report(actors[1],personal=True)['totals'][0]['amount_micros']=='17'
    assert report(actors[0],personal=True)['records']==1
    with pytest.raises(HTTPException): assign(actors[2],spaces[0],**args,preview_token=preview['preview_token'])
    preview=assign(actors[2],spaces[0],**args,include_assigned=True)
    assert preview['records']==1
    # A changed financial snapshot invalidates a previously confirmed selection.
    conn.execute('UPDATE ledger_entries SET updated_at=updated_at+1 WHERE workspace_id=%s AND canvas_id=%s',(spaces[0],cid))
    with pytest.raises(HTTPException): assign(actors[2],spaces[0],**args,include_assigned=True,preview_token=preview['preview_token'])
    preview=assign(actors[2],spaces[0],**args,include_assigned=True)
    assign(actors[2],spaces[0],**args,include_assigned=True,preview_token=preview['preview_token'])
    data=report(actors[1],personal=True)
    assert data['records']==2 and data['totals'][0]['amount_micros']=='1234584'
    with workspace_scope(spaces[0]): assert tasks.get(task['id'])['requested_by']==actors[0].member_id
    authored=next(e for e in data['entries'] if e['task_id'])
    assert authored['original_member_id']==actors[0].member_id and authored['attribution']=='manual'
    assert conn.execute('SELECT count(*) AS n FROM ledger_assignment_events WHERE workspace_id=%s',(spaces[0],)).fetchone()['n']==2


def test_standalone_backfill_reuses_existing_canvas_log(world):
    conn,spaces,actors,prefix=world
    with workspace_scope(spaces[0]):
        append_logs(prefix+'canvas',[{'id':prefix+'existing','canvas_task_id':prefix+'task','createdAt':int(time.time()*1000),'status':'success','cost':{'status':'priced','amount_micros':1234567,'currency':'CNY','kind':'video'}}],providers=[])
        complete(conn,spaces[0],actors[0],prefix+'task')
    data=report(actors[0],personal=True)
    assert data['records']==1 and data['entries'][0]['canvas_id']==prefix+'canvas'
