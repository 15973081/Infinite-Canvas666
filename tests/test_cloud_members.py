"""Real PostgreSQL identity/authorization tests; isolated by cloud_test.py."""
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
PASSWORD = 'test-only-password-12345'


@pytest.fixture(scope='module')
def admin():
    from app.services import members
    member = members.bootstrap('root-' + uuid.uuid4().hex, '管理员', PASSWORD)
    result = members.login(member['username'], PASSWORD, audience='management')
    return members.resolve_session(result['token'], 'management')


def new_member(admin):
    from app.services import members
    created = members.create_member(admin, 'user-' + uuid.uuid4().hex, '同名成员')
    member = members.activate(created['activation_token'], PASSWORD)
    login = members.login(member['username'], PASSWORD, source=member['id'])
    return member, members.resolve_session(login['token']), login['token']


def denied(call, code, status=403):
    with pytest.raises(HTTPException) as error:
        call()
    assert error.value.status_code == status
    assert error.value.detail['code'] == code


def test_bootstrap_once_and_no_plaintext_secrets(admin):
    from app.services import members
    from app.storage.database import connection
    denied(lambda: members.bootstrap('another', 'another', PASSWORD), 'already_initialized', 409)
    with connection() as conn:
        row = conn.execute('SELECT * FROM members WHERE id=%s', (admin.member_id,)).fetchone()
        assert row['password_digest'] != PASSWORD and row['password_salt']
        assert conn.execute('SELECT count(*) n FROM permissions').fetchone()['n'] > 20
        assert PASSWORD not in str(conn.execute('SELECT * FROM management_events').fetchall())


def test_activation_one_use_expiry_and_username_casefold(admin):
    from app.services import members
    from app.storage.database import connection
    created = members.create_member(admin, 'USER-' + uuid.uuid4().hex, '同名成员')
    denied(lambda: members.create_member(admin, created['member']['username'].lower(), 'other'), 'username_exists', 409)
    token = created['activation_token']
    with connection() as conn:
        row = conn.execute('SELECT * FROM member_activations WHERE member_id=%s', (created['member']['id'],)).fetchone()
        assert row['token_hash'] != token
        conn.execute("UPDATE member_activations SET expires_at=now()-interval '1 second' WHERE token_hash=%s", (row['token_hash'],))
    denied(lambda: members.activate(token, PASSWORD), 'invalid_activation', 400)
    replacement = members.reset_member(admin, created['member']['id'])['activation_token']
    members.activate(replacement, PASSWORD)
    denied(lambda: members.activate(replacement, PASSWORD), 'invalid_activation', 400)
    assert members.login(created['member']['username'].lower(), PASSWORD)['member']['id'] == created['member']['id']


def test_sessions_audience_logout_password_reset_and_disable(admin):
    from app.services import members, authorization as az
    member, actor, token = new_member(admin)
    assert members.resolve_session(token, 'management') is None
    members.logout(actor)
    assert members.resolve_session(token) is None
    denied(lambda: members.list_workspaces(actor), 'authentication_required', 401)
    token = members.login(member['username'], PASSWORD)['token']
    reset = members.reset_member(admin, member['id'])
    assert members.resolve_session(token) is None
    denied(lambda: members.login(member['username'], PASSWORD), 'invalid_credentials', 401)
    members.activate(reset['activation_token'], PASSWORD)
    token = members.login(member['username'], PASSWORD)['token']
    actor = members.resolve_session(token)
    members.set_member_status(admin, member['id'], 'disabled')
    assert members.resolve_session(token) is None
    denied(lambda: members.list_workspaces(actor), 'authentication_required', 401)
    members.set_member_status(admin, member['id'], 'active')
    assert members.resolve_session(token) is None  # Re-enabling cannot revive sessions.
    assert isinstance(members.resolve_session(members.login(member['username'], PASSWORD)['token']), az.Principal)


def test_spaces_have_distinct_roles_no_automatic_default_and_no_platform_read_bypass(admin):
    from app.services import members, authorization as az
    member, actor, _ = new_member(admin)
    assert members.list_workspaces(actor) == []
    a = members.create_workspace(admin, '空间A', admin.member_id)
    b = members.create_workspace(admin, '空间B', member['id'])
    members.assign_roles(admin, member['id'], [a['roles']['viewer']], a['id'])
    with az.authorized(actor, 'canvas.read', a['id']):
        pass
    denied(lambda: _check(actor, 'canvas.edit', a['id']), 'permission_denied')
    with az.authorized(actor, 'canvas.edit', b['id']):
        pass
    denied(lambda: _check(admin, 'canvas.read', b['id']), 'workspace_forbidden')
    # Platform admins can explicitly manage this workspace without reading it.
    with az.authorized(admin, 'space.roles.manage', b['id']):
        pass
    denied(lambda: members.assign_roles(admin, member['id'], [b['roles']['editor']], a['id']), 'role_not_found', 404)
    assert {r['id'] for r in members.list_workspaces(actor)} == {a['id'], b['id']}
    members.remove_workspace_member(admin, member['id'], a['id'])
    denied(lambda: _check(actor, 'canvas.read', a['id']), 'workspace_forbidden')
    assert [r['id'] for r in members.list_workspaces(actor)] == [b['id']]


def _check(actor, permission, workspace=None):
    from app.services import authorization as az
    with az.authorized(actor, permission, workspace):
        pass


def test_custom_role_union_update_versions_and_no_self_elevation(admin):
    from app.services import members, authorization as az
    member, actor, _ = new_member(admin)
    space = members.create_workspace(admin, '角色测试', admin.member_id)['id']
    reader = members.create_role(admin, 'reader', ['canvas.read'], space)
    editor = members.create_role(admin, 'artist', ['canvas.edit', 'space.roles.manage'], space)
    members.assign_roles(admin, member['id'], [reader, editor], space)
    _check(actor, 'canvas.read', space)
    _check(actor, 'canvas.edit', space)
    denied(lambda: members.create_role(actor, 'escalate', ['space.members.manage'], space), 'cannot_delegate_permission')
    denied(lambda: members.create_role(actor, 'platform', ['member.manage']), 'permission_denied')
    denied(lambda: members.create_role(admin, 'unknown', ['imaginary.execute'], space), 'invalid_role_permissions', 400)
    assert members.update_role(admin, editor, 'changed', ['space.roles.manage'], 1, space) == 2
    denied(lambda: _check(actor, 'canvas.edit', space), 'permission_denied')
    denied(lambda: members.update_role(admin, editor, 'stale', ['canvas.edit'], 1, space), 'role_version_conflict', 409)
    assert members.update_profile(actor, '改名', 'purple')['id'] == member['id']
    _check(actor, 'canvas.read', space)


def test_admin_survival_and_archive(admin):
    from app.services import members
    member, actor, _ = new_member(admin)
    space = members.create_workspace(admin, '保护管理员', member['id'])
    denied(lambda: members.set_member_status(admin, admin.member_id, 'disabled'), 'last_platform_administrator', 409)
    denied(lambda: members.reset_member(admin, member['id']), 'last_workspace_administrator', 409)
    denied(lambda: members.assign_roles(admin, member['id'], [space['roles']['viewer']], space['id']), 'last_workspace_administrator', 409)
    denied(lambda: members.remove_workspace_member(admin, member['id'], space['id']), 'last_workspace_administrator', 409)
    denied(lambda: members.update_role(admin, space['roles']['admin'], 'changed', [], 1, space['id']), 'builtin_role_protected')
    _check(actor, 'canvas.edit', space['id'])
    members.archive_workspace(admin, space['id'])
    denied(lambda: _check(actor, 'canvas.read', space['id']), 'workspace_unavailable')
    members.set_member_status(admin, member['id'], 'disabled')
    denied(lambda: members.archive_workspace(admin, space['id'], archived=False), 'last_workspace_administrator', 409)


def test_member_manager_cannot_reset_more_privileged_account(admin):
    from app.services import members
    weak, actor, _ = new_member(admin)
    target, target_actor, _ = new_member(admin)
    manager = members.create_role(admin, 'member-manager-' + uuid.uuid4().hex, ['member.manage'])
    members.assign_roles(admin, weak['id'], [manager])
    members.create_workspace(admin, '受保护空间', target['id'])
    denied(lambda: members.reset_member(actor, admin.member_id), 'protected_administrator')
    denied(lambda: members.reset_member(actor, target['id']), 'cannot_delegate_permission')
    assert members.list_workspaces(target_actor)


def test_database_foreign_keys_reject_cross_space_grants(admin):
    from app.services import members
    from app.storage.database import connection
    from psycopg.errors import ForeignKeyViolation
    member, _, _ = new_member(admin)
    a = members.create_workspace(admin, 'FK A', admin.member_id)
    b = members.create_workspace(admin, 'FK B', admin.member_id)
    members.assign_roles(admin, member['id'], [a['roles']['viewer']], a['id'])
    with pytest.raises(ForeignKeyViolation):
        with connection() as conn:
            conn.execute('INSERT INTO workspace_member_roles VALUES(%s,%s,%s)', (a['id'], member['id'], b['roles']['admin']))
    with pytest.raises(ForeignKeyViolation):
        with connection() as conn:
            conn.execute("INSERT INTO role_permissions VALUES(%s,'member.manage','workspace')", (a['roles']['viewer'],))


def test_revocation_waits_for_protected_transaction_then_old_principal_is_denied(admin):
    from app.services import members, authorization as az
    member, actor, _ = new_member(admin)
    space = members.create_workspace(admin, '撤权竞争', admin.member_id)
    members.assign_roles(admin, member['id'], [space['roles']['editor']], space['id'])
    entered, release, attempted = threading.Event(), threading.Event(), threading.Event()

    def writing():
        with az.authorized(actor, 'canvas.edit', space['id']) as conn:
            entered.set()
            assert release.wait(10)
            conn.execute("INSERT INTO workspace_documents(workspace_id,kind,id,value) VALUES(%s,'iam-test','write','{}')", (space['id'],))

    def revoke():
        assert entered.wait(10)
        attempted.set()
        members.remove_workspace_member(admin, member['id'], space['id'])

    with ThreadPoolExecutor(2) as pool:
        write_future = pool.submit(writing)
        revoke_future = pool.submit(revoke)
        try:
            assert attempted.wait(10)
            # Completion of revoke is impossible while the write transaction
            # retains the shared policy lock, regardless of thread scheduling.
            assert not revoke_future.done()
        finally:
            release.set()
        write_future.result(timeout=10)
        revoke_future.result(timeout=10)
    denied(lambda: _check(actor, 'canvas.edit', space['id']), 'workspace_forbidden')


def test_failed_login_counter_is_persistent(admin):
    from app.services import members
    username = 'missing-' + uuid.uuid4().hex
    for _ in range(10):
        denied(lambda: members.login(username, PASSWORD, source=username), 'invalid_credentials', 401)
    denied(lambda: members.login(username, PASSWORD, source=username), 'login_rate_limited', 429)


def test_role_retirement_requires_current_impact_and_explicit_resolution(admin):
    from app.services import members
    member, actor, _ = new_member(admin)
    space = members.create_workspace(admin, '停用角色', admin.member_id)['id']
    role = members.create_role(admin, 'artist', ['canvas.read', 'canvas.edit'], space)
    replacement = members.create_role(admin, 'reader', ['canvas.read'], space)
    before = members.role_impact(admin, role, space)
    members.assign_roles(admin, member['id'], [role], space)
    denied(lambda: members.retire_role(admin, role, before['confirmation'], workspace=space, revoke=True), 'role_impact_changed', 409)
    impact = members.role_impact(admin, role, space)
    assert impact['member_ids'] == [member['id']]
    denied(lambda: members.retire_role(admin, role, impact['confirmation'], workspace=space), 'choose_replacement_or_revoke', 400)
    members.retire_role(admin, role, impact['confirmation'], workspace=space, replacement=replacement)
    _check(actor, 'canvas.read', space)
    denied(lambda: _check(actor, 'canvas.edit', space), 'permission_denied')
    denied(lambda: members.assign_roles(admin, member['id'], [role], space), 'role_inactive', 409)


def test_concurrent_admin_disable_preserves_one_active_holder(admin):
    from app.services import members
    from app.storage.database import connection
    left, _, _ = new_member(admin)
    right, _, _ = new_member(admin)
    space = members.create_workspace(admin, '并发管理员保护', left['id'])
    members.assign_roles(admin, right['id'], [space['roles']['admin']], space['id'])
    barrier = threading.Barrier(2)

    def disable(mid):
        barrier.wait(timeout=10)
        try:
            members.set_member_status(admin, mid, 'disabled')
            return 'disabled'
        except HTTPException as error:
            return error.detail['code']

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(disable, [left['id'], right['id']]))
    assert sorted(results) == ['disabled', 'last_workspace_administrator']
    with connection() as conn:
        assert conn.execute("SELECT count(*) n FROM members WHERE id=ANY(%s) AND status='active'", ([left['id'], right['id']],)).fetchone()['n'] == 1


def test_concurrent_activation_consumes_token_once_and_expired_session_is_rejected(admin):
    from app.services import members
    from app.storage.database import connection
    created = members.create_member(admin, 'activation-' + uuid.uuid4().hex, '激活竞争')

    def activate(_):
        try:
            return members.activate(created['activation_token'], PASSWORD)['id']
        except HTTPException as error:
            return error.detail['code']

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(activate, range(2)))
    assert sorted(results) == sorted([created['member']['id'], 'invalid_activation'])
    token = members.login(created['member']['username'], PASSWORD)['token']
    actor = members.resolve_session(token)
    with connection() as conn:
        conn.execute("UPDATE member_sessions SET expires_at=now()-interval '1 second' WHERE id=%s", (actor.session_id,))
    assert members.resolve_session(token) is None
    denied(lambda: members.list_workspaces(actor), 'authentication_required', 401)
