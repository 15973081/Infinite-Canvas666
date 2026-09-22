"""Local recovery CLI against real PostgreSQL, without either web application."""
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from test_cloud_member_gateway import operator, PASSWORD
from test_cloud_maintenance_control import change, reset_maintenance

pytestmark=pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST')!='1',reason='Use tools/cloud_test.py')
ROOT=Path(__file__).resolve().parents[1]


@pytest.fixture
def recovery(operator,tmp_path):
    from app.services import members
    from app.storage.database import connection, schema_name
    space=members.create_workspace(operator,'本机恢复验收',operator.member_id)
    config=tmp_path/'storage.env';config.write_text('DATABASE_BACKEND=postgres\n',encoding='utf-8')
    with connection() as c:
        username=c.execute('SELECT username FROM members WHERE id=%s',(operator.member_id,)).fetchone()['username']
        database=c.execute('SELECT current_database() AS name').fetchone()['name']
    base=['--storage-env',str(config),'--database',database,'--schema',schema_name(),'--username',username,'--password-stdin']
    def call(command='status',*,workspace=space['id'],password=PASSWORD,extra=(),username=None,independent=False):
        args=base.copy()
        if username: args[args.index('--username')+1]=username
        args += ['--workspace',workspace] if workspace else ['--platform']
        args += [command,*extra]
        if independent:
            executable=['-c',"import sys;sys.path.insert(0,'.');from tools.maintenance_recovery import main;result=main(sys.argv[1:]);assert 'main' not in sys.modules;assert 'management_main' not in sys.modules;assert 'app.storage.worker' not in sys.modules;raise SystemExit(result)"]
        else:
            executable=['tools/maintenance_recovery.py']
        # Match the child process encoding to the pipe decoder on Windows too.
        child_env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
        result=subprocess.run([sys.executable,*executable,*args],cwd=ROOT,env=child_env,input=password+'\n',text=True,encoding='utf-8',capture_output=True,timeout=30)
        assert password not in result.stdout+result.stderr
        assert os.environ['DATABASE_URL'] not in result.stdout+result.stderr
        return result
    return {'call':call,'space':space['id'],'operator':operator,'base':base}


def data(result):
    assert result.returncode==0,result.stderr
    return json.loads(result.stdout)['result']


def test_local_status_is_independent_and_revokes_its_private_session(recovery):
    from app.storage.database import connection
    c=recovery['call']
    with connection() as conn:
        before={r['id'] for r in conn.execute('SELECT id FROM member_sessions')}
    result=c(independent=True)
    value=data(result)
    assert value['control']['mode']=='normal'
    assert value['activity']['release_checks']['database_stop_ready'] is False
    assert 'token' not in json.loads(result.stdout)
    with connection() as conn:
        created=[r for r in conn.execute('SELECT *,clock_timestamp() AS now FROM member_sessions') if r['id'] not in before]
        assert len(created)==1 and created[0]['audience']=='management'
        assert created[0]['revoked_at'] is not None
        assert (created[0]['expires_at']-created[0]['now']).total_seconds()<=300
        assert conn.execute("SELECT count(*) AS n FROM management_events WHERE action='maintenance.local.status' AND workspace_id=%s",(recovery['space'],)).fetchone()['n']==1


def test_two_step_recovery_preserves_notice_and_audits_each_committed_change(recovery):
    from app.storage.database import connection
    op,wid,c=recovery['operator'],recovery['space'],recovery['call']
    change(op,wid,'draining');state=change(op,wid,'offline')
    version=state['control']['version']
    recovered=data(c('recover',extra=['--expected-version',str(version),'--reason','完成维护，进入恢复检查'],independent=True))
    assert recovered['control']['mode']=='recovering'
    assert recovered['control']['message']==state['control']['message']
    denied=c('reopen',extra=['--expected-version',str(version+1),'--reason','遗漏确认'])
    assert denied.returncode==2 and 'invalid_cli_arguments' in denied.stderr
    stale=c('reopen',extra=['--expected-version',str(version),'--reason','旧版本','--confirm-recovery'])
    assert stale.returncode==4 and 'maintenance_version_conflict' in stale.stderr
    reopened=data(c('reopen',extra=['--expected-version',str(version+1),'--reason','完成运行与数据恢复检查','--confirm-recovery']))
    assert reopened['control']['mode']=='normal' and reopened['control']['version']==version+2
    with connection() as conn:
        events=conn.execute("SELECT action FROM management_events WHERE workspace_id=%s AND action IN ('maintenance.local.recover','maintenance.local.reopen') ORDER BY id",(wid,)).fetchall()
        assert events==[{'action':'maintenance.local.recover'},{'action':'maintenance.local.reopen'}]


def test_reopen_cannot_skip_recovering_and_status_never_clears_restriction(recovery):
    op,wid,c=recovery['operator'],recovery['space'],recovery['call']
    state=change(op,wid,'draining')
    version=state['control']['version']
    result=c('reopen',extra=['--expected-version',str(version),'--reason','不可跳过检查','--confirm-recovery'])
    assert result.returncode==4 and 'maintenance_transition_invalid' in result.stderr
    assert data(c())['control']['mode']=='draining'
    result=c('recover',extra=['--expected-version',str(version),'--reason','进入恢复'])
    assert data(result)['control']['mode']=='recovering'
    assert data(c())['control']['mode']=='recovering'


def test_space_delegate_cannot_recover_platform_or_other_space_and_revocation_is_immediate(recovery):
    from app.services import members
    op,wid,c=recovery['operator'],recovery['space'],recovery['call']
    invitation=members.create_member(op,'local-'+uuid.uuid4().hex,'维护人员')
    person=members.activate(invitation['activation_token'],PASSWORD)
    role=members.create_role(op,'空间维护', ['maintenance.space'],wid)
    members.assign_roles(op,person['id'],[role],wid)
    other=members.create_workspace(op,'其他空间',op.member_id)['id']
    assert data(c(username=person['username']))['control']['workspace_id']==wid
    for target in (None,other):
        denied=c(username=person['username'],workspace=target)
        assert denied.returncode==3
    members.remove_workspace_member(op,person['id'],wid)
    assert c(username=person['username']).returncode==3
    members.set_member_status(op,person['id'],'disabled')
    assert c(username=person['username']).returncode==3


def test_wrong_password_and_target_mismatch_never_change_maintenance(recovery):
    from app.storage.database import connection
    c=recovery['call'];wid=recovery['space']
    state=change(recovery['operator'],wid,'draining')
    assert c(password='incorrect-test-password').returncode==3
    for extra in (['--schema','wrong_schema'],['--database','wrong_database']):
        result=c('recover',extra=['--expected-version',str(state['control']['version']),'--reason','target guard',*extra])
        assert result.returncode==2 and 'database_target_mismatch' in result.stderr
    assert data(c())['control']['version']==state['control']['version']
    with connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM management_events WHERE workspace_id=%s AND action='maintenance.local.recover'",(wid,)).fetchone()['n']==0


def test_concurrent_local_recovery_has_one_winner_and_one_version_conflict(recovery):
    from app.storage.database import connection
    state=change(recovery['operator'],recovery['space'],'draining')
    args=['--expected-version',str(state['control']['version']),'--reason','并发恢复']
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:recovery['call']('recover',extra=args),range(2)))
    assert sorted(r.returncode for r in results)==[0,4]
    with connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM management_events WHERE workspace_id=%s AND action='maintenance.local.recover'",(recovery['space'],)).fetchone()['n']==1


def test_space_reopen_cannot_release_platform_restriction(recovery):
    op,wid,c=recovery['operator'],recovery['space'],recovery['call']
    change(op,None,'draining');state=change(op,wid,'draining')
    result=data(c('recover',extra=['--expected-version',str(state['control']['version']),'--reason','空间恢复检查']))
    result=data(c('reopen',extra=['--expected-version',str(result['control']['version']),'--reason','空间检查完成','--confirm-recovery']))
    assert result['control']['mode']=='normal'
    assert result['effective']['mode']=='draining'
