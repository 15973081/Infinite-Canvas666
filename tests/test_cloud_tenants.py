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
    denied(lambda:tenants.change_member(actor,tenant['id'],a['id'],'member'),'tenant_permission_denied')
    denied(lambda:tenants.change_member(enterprise_admin,tenant['id'],a['id'],'member'),'last_tenant_administrator')
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

def test_tenant_space_defaults_validate_grants_and_versions(enterprise_admin):
    from app.services import tenants,provider_control
    from app.storage.workspace import workspace_scope
    owner,actor=user(enterprise_admin);tenant=tenants.create(enterprise_admin,'默认模型企业',owner['username'])
    space=tenants.create_space(actor,tenant['id'],'默认模型空间',owner['id'])
    pid='defaults-'+uuid.uuid4().hex[:12]
    provider_control.save(enterprise_admin,pid,{'name':'默认模型供应商','base_url':'https://supplier.test/v1','protocol':'openai','enabled':True,'image_models':['allowed','other']},0,reason='默认模型验收')
    item={'provider_id':pid,'kind':'image','model':'allowed'}
    tenants.set_models(enterprise_admin,tenant['id'],[item]);tenants.set_models(actor,tenant['id'],[item],space['id'])
    denied(lambda:tenants.set_defaults(actor,tenant['id'],space['id'],[{**item,'model':'other'}],0),'model_not_available')
    tenants.set_defaults(actor,tenant['id'],space['id'],[item],0)
    denied(lambda:tenants.set_defaults(actor,tenant['id'],space['id'],[],0),'tenant_changed')
    with workspace_scope(space['id']):
        assert provider_control.workspace_providers()[0]['workspace_defaults']=={'image':'allowed'}
        tenants.set_models(enterprise_admin,tenant['id'],[])
        assert provider_control.workspace_providers()[0]['workspace_defaults']=={}
    assert tenants.models(actor,tenant['id'])['default_versions'][0]['version']==1

def test_tenant_governance_ceiling_enforcement_and_audit(enterprise_admin):
    from app.services import tenants,authorization as az
    owner,actor=user(enterprise_admin);other,foreign_actor=user(enterprise_admin)
    tenant=tenants.create(enterprise_admin,'治理企业',owner['username'])
    foreign=tenants.create(enterprise_admin,'另一企业',other['username'])
    space=tenants.create_space(actor,tenant['id'],'已有空间',owner['id'])
    values={k:True for k in tenants.RULES}
    tenants.update_rules(enterprise_admin,tenant['id'],{**values,'create_spaces':False,'manage_members':False,'assign_spaces':False,'manage_roles':False},0,True)
    denied(lambda:tenants.update_rules(actor,tenant['id'],values,1,True),'permission_denied')
    denied(lambda:tenants.update_rules(actor,tenant['id'],values,1),'tenant_rule_denied')
    denied(lambda:tenants.create_space(actor,tenant['id'],'禁止创建',owner['id']),'tenant_rule_denied')
    with az.policy_transaction() as conn:
        denied(lambda:az.require(conn,actor,'space.members.manage',space['id']),'tenant_rule_denied')
        assert 'space.members.manage' not in az.effective_permissions(conn,actor.member_id,space['id'])
    tightened={**values,'create_spaces':False,'manage_members':False,'assign_spaces':False,'manage_roles':False,'assign_models':False}
    tenants.update_rules(actor,tenant['id'],tightened,1)
    denied(lambda:tenants.set_defaults(actor,tenant['id'],space['id'],[],0),'tenant_rule_denied')
    denied(lambda:tenants.update_rules(actor,tenant['id'],tightened,1),'tenant_changed')
    records=tenants.events(actor,tenant['id'])['events']
    assert any(e['action']=='tenant.rules.update' for e in records)
    assert all(e['target_id']!=foreign['id'] for e in records)
    denied(lambda:tenants.events(foreign_actor,tenant['id']),'tenant_forbidden')
    assert tenants.rules(actor,tenant['id'])['effective']['assign_models'] is False
    tenants.create_space(enterprise_admin,tenant['id'],'平台仍可维护',owner['id'])

def test_tenant_disabling_invitations_blocks_pending_acceptance(enterprise_admin,monkeypatch):
    from app.services import tenants,email_delivery
    monkeypatch.setenv('SMTP_HOST','smtp.example.test');monkeypatch.setenv('SMTP_FROM','sender@example.test')
    monkeypatch.setenv('EMAIL_TOKEN_SECRET','x'*40)
    sent=[];monkeypatch.setattr(email_delivery,'send',lambda *args:sent.append(args))
    owner,actor=user(enterprise_admin)
    tenant=tenants.create(enterprise_admin,'关闭邀请企业',owner['username'])
    email='pending-'+uuid.uuid4().hex+'@example.test'
    tenants.invite(actor,tenant['id'],email,'member')
    token=re.search(r'邀请凭证：(\S+)',sent[-1][2])[1]
    tenants.update_rules(enterprise_admin,tenant['id'],{k:k!='invite_members' for k in tenants.RULES},0,True)
    denied(lambda:tenants.invite(actor,tenant['id'],email,'member'),'tenant_rule_denied')
    denied(lambda:tenants.accept(token,username='blocked-'+uuid.uuid4().hex,display_name='待加入成员',password=PASSWORD),'invalid_invitation')
    assert len(sent)==1

def test_tenant_admin_individual_grants_and_workspace_billing(enterprise_admin):
    from app.services import tenants,authorization as az,account_billing
    from app.management import queries
    owner,actor=user(enterprise_admin)
    tenant=tenants.create(enterprise_admin,'独立授权企业',owner['username'])
    space=tenants.create_space(actor,tenant['id'],'费用空间',owner['id'])
    grants=['invite_members','manage_members','assign_spaces']
    tenants.change_member(enterprise_admin,tenant['id'],owner['id'],'admin',grants,1)
    detail=tenants.detail(actor,tenant['id'])
    assert set(detail['permissions'])==set(grants)
    assert queries.snapshot(actor)['tenants'][0]['permissions']==sorted(grants)
    denied(lambda:account_billing.report(actor,tenant=tenant['id']),'tenant_permission_denied')
    denied(lambda:tenants.events(actor,tenant['id']),'tenant_permission_denied')
    denied(lambda:tenants.create_space(actor,tenant['id'],'不能创建',owner['id']),'tenant_permission_denied')
    denied(lambda:tenants.update_rules(actor,tenant['id'],{k:True for k in tenants.RULES},0),'tenant_permission_denied')
    with az.policy_transaction() as conn:
        denied(lambda:az.require(conn,actor,'billing.read',space['id']),'tenant_permission_denied')
        denied(lambda:az.require(conn,actor,'audit.read',space['id']),'tenant_permission_denied')
        assert 'billing.read' not in az.effective_permissions(conn,actor.member_id,space['id'])
        az.require(conn,actor,'canvas.read',space['id'])
        az.require(conn,actor,'space.members.manage',space['id'])
    denied(lambda:tenants.change_member(enterprise_admin,tenant['id'],owner['id'],'admin',[],1),'tenant_member_changed')
    denied(lambda:tenants.change_member(enterprise_admin,tenant['id'],owner['id'],'admin',['provider.configure'],2),'invalid_admin_permissions')
    tenants.change_member(enterprise_admin,tenant['id'],owner['id'],'admin',['billing_read'],2)
    assert account_billing.report(actor,tenant=tenant['id'])['records']==0
    values={k:True for k in tenants.RULES};values['billing_read']=False
    tenants.update_rules(enterprise_admin,tenant['id'],values,0,True)
    denied(lambda:account_billing.report(actor,tenant=tenant['id']),'tenant_rule_denied')


def test_tenant_admin_delegation_respects_scope_and_self(enterprise_admin):
    from app.services import tenants,authorization as az
    from app.storage.database import connection
    owner,actor=user(enterprise_admin);other,delegate=user(enterprise_admin)
    tenant=tenants.create(enterprise_admin,'管理员委派',owner['username'])
    with connection() as conn:
        conn.execute('INSERT INTO tenant_members(tenant_id,member_id) VALUES(%s,%s)',(tenant['id'],other['id']))
    grants=['manage_admins','invite_members','billing_read']
    tenants.change_member(enterprise_admin,tenant['id'],owner['id'],'admin',grants,1)
    denied(lambda:tenants.change_member(actor,tenant['id'],owner['id'],'admin',grants,2),'cannot_manage_administrator')
    denied(lambda:tenants.change_member(actor,tenant['id'],other['id'],'admin',['create_spaces'],1),'cannot_delegate_permission')
    tenants.change_member(actor,tenant['id'],other['id'],'admin',['billing_read'],1)
    denied(lambda:tenants.change_member(delegate,tenant['id'],owner['id'],'member',[],2),'tenant_permission_denied')
    tenants.change_member(enterprise_admin,tenant['id'],other['id'],'admin',list(az.TENANT_PERMISSIONS),2)
    denied(lambda:tenants.change_member(actor,tenant['id'],other['id'],'member',[],3),'cannot_manage_administrator')
    foreign=tenants.create(enterprise_admin,'其他授权企业',other['username'])
    denied(lambda:tenants.change_member(actor,foreign['id'],other['id'],'admin',[],1),'tenant_forbidden')


def test_tenant_invite_admin_requires_delegation_and_acceptance_rechecks(enterprise_admin,monkeypatch):
    from app.services import tenants,email_delivery
    monkeypatch.setenv('SMTP_HOST','smtp.example.test');monkeypatch.setenv('SMTP_FROM','sender@example.test');monkeypatch.setenv('EMAIL_TOKEN_SECRET','x'*40)
    sent=[];monkeypatch.setattr(email_delivery,'send',lambda *args:sent.append(args))
    owner,actor=user(enterprise_admin);tenant=tenants.create(enterprise_admin,'邀请授权',owner['username'])
    email='admin-'+uuid.uuid4().hex+'@example.test'
    denied(lambda:tenants.invite(actor,tenant['id'],email,'admin'),'tenant_permission_denied')
    tenants.change_member(enterprise_admin,tenant['id'],owner['id'],'admin',['invite_members','manage_admins','billing_read'],1)
    denied(lambda:tenants.invite(actor,tenant['id'],'denied-'+email,'admin',['create_spaces']),'cannot_delegate_permission')
    tenants.invite(actor,tenant['id'],email,'admin',['billing_read'])
    token=re.search(r'邀请凭证：(\S+)',sent[-1][2])[1]
    tenants.change_member(enterprise_admin,tenant['id'],owner['id'],'admin',['invite_members'],2)
    denied(lambda:tenants.accept(token,username='pending-'+uuid.uuid4().hex,display_name='待加入',password=PASSWORD),'invalid_invitation')
    assert len(sent)==1


def test_tenant_custom_space_roles_and_invitation_assignment(enterprise_admin,monkeypatch):
    from app.services import tenants,email_delivery,members,authorization as az
    from app.storage.database import connection
    monkeypatch.setenv('SMTP_HOST','smtp.example.test');monkeypatch.setenv('SMTP_FROM','sender@example.test');monkeypatch.setenv('EMAIL_TOKEN_SECRET','x'*40)
    sent=[];monkeypatch.setattr(email_delivery,'send',lambda *args:sent.append(args))
    owner,actor=user(enterprise_admin);tenant=tenants.create(enterprise_admin,'空间分配',owner['username'])
    space=tenants.create_space(actor,tenant['id'],'协作空间',owner['id'])
    rid=tenants.save_space_role(actor,tenant['id'],space['id'],'素材查看',['asset.read'])['id']
    assert rid in [r['id'] for r in tenants.space_roles(actor,tenant['id'],space['id'])['roles']]
    assignments=[{'workspace_id':space['id'],'role_ids':[rid]}]
    tenants.invite(actor,tenant['id'],'space-'+uuid.uuid4().hex+'@example.test','member',spaces=assignments)
    token=re.search(r'邀请凭证：(\S+)',sent[-1][2])[1];username='space-'+uuid.uuid4().hex
    tenants.accept(token,username=username,display_name='空间成员',password=PASSWORD)
    login=members.login(username,PASSWORD,audience='management');joined=members.resolve_session(login['token'],'management')
    with az.policy_transaction() as conn:
        assert az.effective_permissions(conn,joined.member_id,space['id'])=={'asset.read'}
    catalog=tenants.space_members(actor,tenant['id'],space['id'])
    assert next(m['role_ids'] for m in catalog['members'] if m['member_id']==joined.member_id)==[rid]
    tenants.assign_space(actor,tenant['id'],space['id'],joined.member_id,role_ids=[rid])
    tenants.archive_space(actor,tenant['id'],space['id'],True)
    with az.policy_transaction() as conn:
        denied(lambda:az.require(conn,joined,'asset.read',space['id']),'workspace_unavailable')
    tenants.archive_space(actor,tenant['id'],space['id'],False)
    other,other_actor=user(enterprise_admin);foreign=tenants.create(enterprise_admin,'外部企业',other['username'])
    foreign_space=tenants.create_space(other_actor,foreign['id'],'外部空间',other['id'])
    denied(lambda:tenants.invite(actor,tenant['id'],'foreign@example.test','member',spaces=[{'workspace_id':foreign_space['id'],'role_ids':[rid]}]),'workspace_forbidden')
    assert len(sent)==1

def test_tenant_permission_routes_recheck_after_revocation(enterprise_admin,monkeypatch,tmp_path):
    from app.services import tenants
    from app.management.application import create_app
    from fastapi.testclient import TestClient
    from tools.build_management import build
    owner,actor=user(enterprise_admin);tenant=tenants.create(enterprise_admin,'接口授权',owner['username'])
    space=tenants.create_space(actor,tenant['id'],'接口空间',owner['id'])
    monkeypatch.setenv('MANAGEMENT_BASE_URL','http://localhost:8766')
    with TestClient(create_app(build(tmp_path/'console')),base_url='http://localhost:8766',headers={'Origin':'http://localhost:8766'}) as client:
        assert client.post('/api/auth/login',json={'username':owner['username'],'password':PASSWORD}).status_code==200
        base='/api/tenants/'+tenant['id'];space_base=base+'/spaces/'+space['id']
        created=client.post(space_base+'/roles',json={'name':'只读素材','permissions':['asset.read']})
        assert created.status_code==200,created.text
        rid=created.json()['id']
        assert client.put(space_base+'/roles/'+rid,json={'name':'画布素材查看','permissions':['asset.read','canvas.read'],'version':1}).status_code==200
        assert client.put(space_base+'/roles/'+rid,json={'name':'平台管理员','permissions':['tenant.manage'],'version':2}).status_code==400
        assert client.put(base+'/members/'+owner['id'],json={'role':'admin','permissions':['manage_admins'],'version':1}).status_code==403
        tenants.change_member(enterprise_admin,tenant['id'],owner['id'],'admin',['invite_members'],1)
        assert client.get(base+'/billing').status_code==403
        assert client.get(base+'/events').status_code==403
        assert client.get(space_base+'/members').status_code==403
        assert client.get(space_base+'/roles').status_code==403
        assert client.put(space_base+'/status',json={'archived':True}).status_code==403
        assert client.get(base).json()['permissions']==['invite_members']
        assert client.get('/api/me').json()['tenants'][0]['permissions']==['invite_members']
