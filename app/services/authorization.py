"""Shared PostgreSQL authorization for management, workbench and workers.

Use authorized() around the protected database mutation, not as a preflight
followed by an unprotected write. Grant changes take the exclusive advisory
lock; protected operations take its shared counterpart through commit.
"""
from contextlib import contextmanager
from dataclasses import dataclass

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from app.storage.database import connection

AUTH_LOCK = 642193004
PLATFORM_PERMISSIONS = {
    'credits.gift.platform': '赠送并查看平台赠送积分',
    'billing.platform': '查看平台账号费用',
    'billing.assign.platform': '调整平台费用归属',
    'member.manage': '管理平台成员',
    'role.manage': '管理平台角色',
    'space.create': '创建空间',
    'space.assign': '分配空间成员',
    'space.archive': '归档空间',
    'provider.configure': '配置供应商',
    'maintenance.platform': '平台维护',
    'audit.platform': '平台审计',
    'backup.platform': '全库备份',
}
WORKSPACE_PERMISSIONS = {
    'billing.read': '查看本空间账号费用',
    'billing.assign': '调整本空间费用归属',
    'space.members.manage': '管理本空间成员',
    'space.roles.manage': '管理本空间角色',
    'canvas.read': '查看画布', 'canvas.create': '新建画布',
    'canvas.edit': '编辑画布', 'canvas.delete': '删除画布',
    'canvas.restore': '恢复画布', 'canvas.export': '导出画布',
    'canvas.lock.takeover': '强制接管画布',
    'asset.read': '查看素材', 'asset.upload': '上传素材',
    'asset.manage': '管理素材目录', 'prompt.manage': '管理提示词',
    'generation.submit': '提交生成', 'task.read': '查看任务',
    'task.review': '核对异常任务', 'provider.use': '使用已分配供应商',
    'maintenance.space': '维护本空间', 'audit.read': '本空间审计',
    'backup.read': '本空间备份记录', 'backup.request': '请求本空间备份',
}
VIEWER = {'canvas.read', 'canvas.export', 'asset.read', 'task.read'}
EDITOR = VIEWER | {
    'canvas.create', 'canvas.edit', 'canvas.delete', 'canvas.restore',
    'asset.upload', 'asset.manage', 'prompt.manage', 'generation.submit', 'provider.use',
}


@dataclass(frozen=True)
class Principal:
    member_id: str
    session_id: str
    audience: str


def fail(code, status=403):
    raise HTTPException(status, {'code': code})


@contextmanager
def policy_transaction(*, change=False):
    with connection() as conn:
        function = 'pg_advisory_xact_lock' if change else 'pg_advisory_xact_lock_shared'
        conn.execute('SELECT ' + function + '(%s)', (AUTH_LOCK,))
        yield conn


def audit(conn, actor, action, target=None, workspace=None, details=None):
    conn.execute('''INSERT INTO management_events(actor_id,action,target_id,workspace_id,details)
                    VALUES(%s,%s,%s,%s,%s)''',
                 (actor.member_id if actor else None, action, target, workspace, Jsonb(details or {})))


def active_member(conn, principal):
    if not isinstance(principal, Principal):
        fail('authentication_required', 401)
    from app.storage.deletion_ledger import member_blocked
    if member_blocked(principal.member_id): fail('authentication_required',401)
    row = conn.execute('''SELECT m.id,m.username,m.display_name,m.avatar,m.auth_version
        FROM members m JOIN member_sessions s ON s.member_id=m.id
        WHERE m.id=%s AND s.id=%s AND s.audience=%s AND m.status='active'
          AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()''',
        (principal.member_id, principal.session_id, principal.audience)).fetchone()
    if not row:
        fail('authentication_required', 401)
    return row


def superadmin(conn, member_id):
    return bool(conn.execute('''SELECT 1 FROM platform_member_roles g JOIN roles r ON r.id=g.role_id
        WHERE g.member_id=%s AND r.builtin_key='superadmin' AND r.active''', (member_id,)).fetchone())


def effective_permissions(conn, member_id, workspace=None):
    if workspace is None:
        rows = conn.execute('''SELECT DISTINCT p.permission_id FROM platform_member_roles g
            JOIN roles r ON r.id=g.role_id AND r.active JOIN role_permissions p ON p.role_id=r.id
            WHERE g.member_id=%s''', (member_id,))
    else:
        rows = conn.execute('''SELECT DISTINCT p.permission_id FROM workspace_member_roles g
            JOIN roles r ON r.id=g.role_id AND r.active JOIN role_permissions p ON p.role_id=r.id
            WHERE g.member_id=%s AND g.workspace_id=%s''', (member_id, workspace))
    return {r['permission_id'] for r in rows}


def require(conn, principal, action, workspace=None):
    member = active_member(conn, principal)
    catalog = PLATFORM_PERMISSIONS if workspace is None else WORKSPACE_PERMISSIONS
    if action not in catalog:
        fail('unknown_permission', 400)
    if workspace is not None:
        row = conn.execute('SELECT status FROM workspaces WHERE id=%s', (workspace,)).fetchone()
        if not row or row['status'] != 'active':
            fail('workspace_unavailable')
        # Cross-space management is explicit; superadmin is not blanket access
        # to every member's canvas, private conversation, or media contents.
        management = action in {'space.members.manage', 'space.roles.manage', 'maintenance.space', 'audit.read', 'backup.read', 'backup.request', 'billing.read', 'billing.assign'}
        if management and superadmin(conn, principal.member_id):
            return member
        if not conn.execute('SELECT 1 FROM workspace_members WHERE workspace_id=%s AND member_id=%s',
                            (workspace, principal.member_id)).fetchone():
            fail('workspace_forbidden')
    if action not in effective_permissions(conn, principal.member_id, workspace):
        fail('permission_denied')
    return member


@contextmanager
def authorized(principal, action, workspace=None):
    with policy_transaction() as conn:
        require(conn, principal, action, workspace)
        yield conn


def assert_administrators(conn):
    """Called before grant/member changes commit, under exclusive policy lock."""
    from app.storage.deletion_ledger import member_blocked
    eligible = {}
    def usable(member_id):
        if member_id not in eligible:
            eligible[member_id] = not member_blocked(member_id)
        return eligible[member_id]
    holders=conn.execute('''SELECT g.member_id FROM platform_member_roles g
        JOIN roles r ON r.id=g.role_id AND r.active AND r.builtin_key='superadmin'
        JOIN members m ON m.id=g.member_id AND m.status='active' ''').fetchall()
    if not any(usable(row['member_id']) for row in holders):
        fail('last_platform_administrator', 409)
    # Existing default may predate identity provisioning. Once a workspace has
    # an admin template, it must retain an active holder while enabled.
    orphan = conn.execute('''SELECT w.id FROM workspaces w WHERE w.status='active'
        AND EXISTS (SELECT 1 FROM roles r WHERE r.workspace_id=w.id AND r.builtin_key='admin')
        AND NOT EXISTS (SELECT 1 FROM workspace_member_roles g
            JOIN roles r ON r.id=g.role_id AND r.active AND r.builtin_key='admin'
            JOIN members m ON m.id=g.member_id AND m.status='active'
            WHERE g.workspace_id=w.id) LIMIT 1''').fetchone()
    if orphan:
        fail('last_workspace_administrator', 409)
    candidates=conn.execute('''SELECT g.workspace_id,g.member_id FROM workspace_member_roles g
        JOIN workspaces w ON w.id=g.workspace_id AND w.status='active'
        JOIN roles r ON r.id=g.role_id AND r.active AND r.builtin_key='admin'
        JOIN members m ON m.id=g.member_id AND m.status='active' ''').fetchall()
    spaces={row['workspace_id'] for row in candidates}
    protected={row['workspace_id'] for row in candidates if usable(row['member_id'])}
    if spaces-protected: fail('last_workspace_administrator',409)


def validate_permissions(conn, principal, permission_ids, workspace=None):
    values = set(permission_ids)
    catalog = PLATFORM_PERMISSIONS if workspace is None else WORKSPACE_PERMISSIONS
    if not values <= catalog.keys():
        fail('invalid_role_permissions', 400)
    if not superadmin(conn, principal.member_id) and not values <= effective_permissions(conn, principal.member_id, workspace):
        fail('cannot_delegate_permission')
    return values
