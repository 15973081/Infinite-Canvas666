"""Tenant isolation and verified-email integration, in the disposable cloud test schema."""
import os
import re
import uuid
import pytest
from fastapi import HTTPException
pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')
PASSWORD='tenant-test-password-12345'

@pytest.fixture(scope='module')
def enterprise_admin():
    from app.services import members
    from app.storage.database import connection
    with connection() as conn:
        exists=conn.execute('SELECT 1 FROM members LIMIT 1').fetchone()
    if exists:
        pytest.skip('Run tenant acceptance in its own selected test set')
    member=members.bootstrap('tenant-root','租户验收管理员',PASSWORD)
    result=members.login(member['username'],PASSWORD,audience='management')
    return members.resolve_session(result['token'],'management')

def user(admin):
    from app.services import members
    c=members.create_member(admin,'test-'+uuid.uuid4().hex,'测试成员')
    m=members.activate(c['activation_token'],PASSWORD)
    login=members.login(m['username'],PASSWORD,audience='management')
    return m,members.resolve_session(login['token'],'management')

def denied(fn,code):
    with pytest.raises(HTTPException) as exc:fn()
    assert exc.value.detail['code']==code

def test_tenant_spaces_isolate_members_and_suspend_access(enterprise_admin):
    from app.services import tenants,authorization as az
    from app.management import queries
    a,actor=user(enterprise_admin);b,other=user(enterprise_admin)
    tenant=tenants.create(enterprise_admin,'甲企业',a['username'])
    foreign=tenants.create(enterprise_admin,'乙企业',b['username'])
    space=tenants.create_space(actor,tenant['id'],'甲空间',a['id'])
    tenants.create_space(other,foreign['id'],'乙空间',b['id'])
    assert tenant['id'] in [t['id'] for t in tenants.listing(actor)['tenants']]
    assert foreign['id'] not in [t['id'] for t in tenants.listing(actor)['tenants']]
    denied(lambda:tenants.detail(actor,foreign['id']),'tenant_forbidden')
    denied(lambda:tenants.assign_space(actor,tenant['id'],space['id'],b['id'],'viewer'),'tenant_member_required')
    denied(lambda:tenants.change_member(actor,tenant['id'],a['id'],'member'),'last_tenant_administrator')
    assert queries.snapshot(actor)['workspaces'][0]['id']==space['id']
    with az.policy_transaction() as conn:
        az.require(conn,actor,'canvas.read',space['id'])
        denied(lambda:az.require(conn,other,'canvas.read',space['id']),'tenant_forbidden')
    tenants.update(enterprise_admin,tenant['id'],'甲企业','disabled',1)
    with az.policy_transaction() as conn:
        denied(lambda:az.require(conn,actor,'canvas.read',space['id']),'workspace_unavailable')
    tenants.update(enterprise_admin,tenant['id'],'甲企业','active',2)

def test_tenant_email_verification_retry_limit_login_and_reset(enterprise_admin,monkeypatch):
    from app.services import account_email, email_delivery, members
    from app.storage.database import connection
    monkeypatch.setenv('SMTP_HOST','smtp.example.test');monkeypatch.setenv('SMTP_FROM','sender@example.test');monkeypatch.setenv('EMAIL_TOKEN_SECRET','x'*40)
    sent=[];monkeypatch.setattr(email_delivery,'send',lambda *args:sent.append(args))
    m,actor=user(enterprise_admin);email=uuid.uuid4().hex+'@example.test'
    result=account_email.start('bind',email,actor=actor,password=PASSWORD)
    assert 'code' not in result
    denied(lambda:members.login(email,PASSWORD,source='unverified'),'invalid_credentials')
    code=re.search(r'验证码：(\d{6})',sent[-1][2])[1]
    denied(lambda:account_email.confirm('bind',result['challenge_id'],'999999' if code!='999999' else '888888',actor=actor),'invalid_email_code')
    with connection() as conn:assert conn.execute('SELECT attempts FROM email_challenges WHERE id=%s',(result['challenge_id'],)).fetchone()['attempts']==1
    account_email.confirm('bind',result['challenge_id'],code,actor=actor)
    assert members.login(email.upper(),PASSWORD,source='verified')['member']['id']==m['id']
    denied(lambda:account_email.confirm('bind',result['challenge_id'],code,actor=actor),'invalid_email_code')
    reset=account_email.start('reset',email,source='reset-test')
    code=re.search(r'验证码：(\d{6})',sent[-1][2])[1]
    account_email.confirm('reset',reset['challenge_id'],code,password=PASSWORD+'new')
    denied(lambda:account_email.status(actor),'authentication_required')
    assert members.login(email,PASSWORD+'new',source='new-password')['member']['id']==m['id']

def test_tenant_invitation_binds_mailbox_and_preserves_role(enterprise_admin,monkeypatch):
    from app.services import tenants,email_delivery,members
    monkeypatch.setenv('SMTP_HOST','smtp.example.test');monkeypatch.setenv('SMTP_FROM','sender@example.test');monkeypatch.setenv('EMAIL_TOKEN_SECRET','x'*40)
    sent=[];monkeypatch.setattr(email_delivery,'send',lambda *args:sent.append(args))
    owner,actor=user(enterprise_admin);tenant=tenants.create(enterprise_admin,'邀请企业',owner['username'])
    tenants.invite(actor,tenant['id'],'invite-'+uuid.uuid4().hex+'@example.test','member')
    token=re.search(r'邀请凭证：(\S+)',sent[-1][2])[1]
    denied(lambda:tenants.accept(token,actor=actor),'invitation_email_mismatch')
    username='new-'+uuid.uuid4().hex
    tenants.accept(token,username=username,display_name='新成员',password=PASSWORD)
    login=members.login(username,PASSWORD,audience='management');new_actor=members.resolve_session(login['token'],'management')
    assert tenants.listing(new_actor)['tenants'][0]['id']==tenant['id']
    denied(lambda:tenants.accept(token,actor=new_actor),'invalid_invitation')
    denied(lambda:tenants.create_space(new_actor,tenant['id'],'不能创建',new_actor.member_id),'tenant_forbidden')

def test_tenant_model_grants_enforce_subset_and_cascade(enterprise_admin):
    from app.services import tenants,provider_control
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    owner,actor=user(enterprise_admin)
    tenant=tenants.create(enterprise_admin,'模型企业',owner['username'])
    space=tenants.create_space(actor,tenant['id'],'设计空间',owner['id'])
    pid='tenant-provider-'+uuid.uuid4().hex[:12]
    provider_control.save(enterprise_admin,pid,{'name':'测试供应商','base_url':'https://supplier.test/v1','protocol':'openai','enabled':True,'image_models':['allowed','excluded']},0,reason='租户隔离验收')
    allowed={'provider_id':pid,'kind':'image','model':'allowed'}
    excluded={**allowed,'model':'excluded'}
    tenants.set_models(enterprise_admin,tenant['id'],[allowed])
    denied(lambda:tenants.set_models(actor,tenant['id'],[excluded],space['id']),'model_not_available')
    tenants.set_models(actor,tenant['id'],[allowed],space['id'])
    with workspace_scope(space['id']):
        assert provider_control.workspace_providers()[0]['image_models']==['allowed']
        with connection() as conn:
            assert provider_control.configured(conn,pid)['config']['image_models']==['allowed']
        tenants.set_models(enterprise_admin,tenant['id'],[])
        assert provider_control.workspace_providers()[0]['image_models']==[]
    with connection() as conn:
        assert not conn.execute('SELECT 1 FROM tenant_space_models WHERE workspace_id=%s',(space['id'],)).fetchone()


def test_tenant_email_code_locks_after_five_attempts(enterprise_admin,monkeypatch):
    from app.services import account_email,email_delivery
    monkeypatch.setenv('SMTP_HOST','smtp.example.test');monkeypatch.setenv('SMTP_FROM','sender@example.test');monkeypatch.setenv('EMAIL_TOKEN_SECRET','x'*40)
    sent=[];monkeypatch.setattr(email_delivery,'send',lambda *args:sent.append(args))
    _,actor=user(enterprise_admin)
    result=account_email.start('bind',uuid.uuid4().hex+'@example.test',actor=actor,password=PASSWORD)
    code=re.search(r'验证码：(\d{6})',sent[-1][2])[1]
    wrong='999999' if code!='999999' else '888888'
    for _ in range(5):
        denied(lambda:account_email.confirm('bind',result['challenge_id'],wrong,actor=actor),'invalid_email_code')
    denied(lambda:account_email.confirm('bind',result['challenge_id'],code,actor=actor),'invalid_email_code')

def test_tenant_billing_excludes_other_enterprises(enterprise_admin):
    from app.services import tenants,account_billing
    from app.storage.database import connection
    owners=[user(enterprise_admin) for _ in range(2)]
    companies=[tenants.create(enterprise_admin,'账单企业',m['username']) for m,a in owners]
    spaces=[tenants.create_space(a,t['id'],'账单空间',m['id']) for (m,a),t in zip(owners,companies)]
    with connection() as conn:
        for space,amount in zip(spaces,[1000000,9000000]):
            conn.execute("INSERT INTO ledger_entries(id,workspace_id,canvas_id,created_at,log_json,cost_json,source,cost_status,amount_micros,currency,kind,status,updated_at) VALUES(%s,%s,'billing-test',1,'{}','{}','test','priced',%s,'CNY','image','succeeded',1)",(uuid.uuid4().hex,space['id'],amount))
    result=account_billing.report(owners[0][1],tenant=companies[0]['id'])
    assert result['totals'][0]['amount_micros']=='1000000'
    denied(lambda:account_billing.report(owners[0][1],tenant=companies[1]['id']),'tenant_forbidden')

def test_tenant_console_admission_and_platform_boundaries(enterprise_admin,monkeypatch,tmp_path):
    from app.services import tenants
    from app.management.application import create_app
    from fastapi.testclient import TestClient
    from tools.build_management import build
    owner,actor=user(enterprise_admin);other,other_actor=user(enterprise_admin)
    own=tenants.create(enterprise_admin,'控制台企业',owner['username'])
    second=tenants.create(enterprise_admin,'第二企业',owner['username'])
    foreign=tenants.create(enterprise_admin,'其他企业',other['username'])
    monkeypatch.setenv('MANAGEMENT_BASE_URL','http://localhost:8766')
    with TestClient(create_app(build(tmp_path/'console')),base_url='http://localhost:8766',headers={'Origin':'http://localhost:8766'}) as client:
        result=client.post('/api/auth/login',json={'username':owner['username'],'password':PASSWORD})
        assert result.status_code==200,result.text
        assert result.json()['console_mode']=='enterprise'
        for tid in (own['id'],second['id']):
            assert client.get('/api/tenants/'+tid).status_code==200
            assert client.get('/api/tenants/'+tid+'/billing').status_code==200
        assert client.get('/api/tenants/'+foreign['id']).status_code==403
        for path in ('/api/providers','/api/members','/api/maintenance','/api/backups','/api/billing','/api/overview'):
            assert client.get(path).status_code==403,path
        assert client.post('/api/tenants',json={'name':'非法企业','administrator':owner['username']}).status_code==403
        assert client.put('/api/tenants/'+own['id']+'/models',json={'models':[]}).status_code==403
        assert client.get('/api/account/email').status_code==200
        assert client.post('/api/auth/logout').status_code==200

def test_tenant_member_candidates_never_search_other_enterprises(enterprise_admin):
    from app.services import tenants
    from app.management import queries
    a,actor=user(enterprise_admin);b,other=user(enterprise_admin)
    tenant=tenants.create(enterprise_admin,'候选成员企业',a['username'])
    tenants.create(enterprise_admin,'其他企业',b['username'])
    space=tenants.create_space(actor,tenant['id'],'候选成员空间',a['id'])
    assert [m['id'] for m in queries.member_candidates(actor,workspace=space['id'])['members']]==[a['id']]
    assert queries.member_candidates(actor,b['username'],space['id'])['members']==[]
    denied(lambda:queries.member_candidates(other,workspace=space['id']),'tenant_forbidden')
