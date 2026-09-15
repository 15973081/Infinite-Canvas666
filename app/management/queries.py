"""Management read models. Every query checks grants in the same transaction."""
from app.services import authorization as az, members

SPACE_MANAGEMENT = {'billing.assign', 'billing.read', 'space.members.manage', 'space.roles.manage', 'maintenance.space',
                    'audit.read', 'backup.read', 'backup.request', 'task.review', 'canvas.lock.takeover'}


def snapshot(actor):
    with az.policy_transaction() as conn:
        member = az.active_member(conn, actor)
        platform = az.effective_permissions(conn, actor.member_id)
        is_super = az.superadmin(conn, actor.member_id)
        rows = conn.execute('''SELECT w.id,w.name,w.description,w.status FROM workspaces w
            WHERE %s OR EXISTS (SELECT 1 FROM workspace_members m
                WHERE m.workspace_id=w.id AND m.member_id=%s) ORDER BY w.name,w.id''',
            (bool(platform & {'space.assign', 'space.archive', 'billing.platform', 'billing.assign.platform'}) or is_super, actor.member_id)).fetchall()
        spaces = []
        for row in rows:
            permissions = az.effective_permissions(conn, actor.member_id, row['id'])
            if 'billing.platform' in platform:
                permissions.add('billing.read')
            if 'billing.assign.platform' in platform:
                permissions.add('billing.assign')
            if is_super:
                permissions |= SPACE_MANAGEMENT - {'task.review', 'canvas.lock.takeover'}
            if permissions & SPACE_MANAGEMENT or platform & {'space.assign', 'space.archive'}:
                spaces.append({**row, 'permissions': sorted(permissions)})
        if not platform and not spaces:
            az.fail('management_permission_required')
        return {'member': members.profile(member), 'permissions': sorted(platform), 'workspaces': spaces}


def require_assignment(conn, actor, workspace):
    if workspace and 'space.assign' in az.effective_permissions(conn, actor.member_id):
        az.require(conn, actor, 'space.assign')
        if not conn.execute("SELECT 1 FROM workspaces WHERE id=%s AND status='active'", (workspace,)).fetchone():
            az.fail('workspace_unavailable')
    else:
        az.require(conn, actor, 'space.members.manage' if workspace else 'role.manage', workspace)


def directory(actor, *, workspace=None, search='', after='', limit=50):
    with az.policy_transaction() as conn:
        if workspace:
            require_assignment(conn, actor, workspace)
            rows = conn.execute('''SELECT m.id,m.username,m.display_name,m.avatar,m.status,m.auth_version
                FROM members m JOIN workspace_members w ON w.member_id=m.id
                WHERE w.workspace_id=%s AND m.id>%s
                AND (m.username ILIKE %s OR m.display_name ILIKE %s) ORDER BY m.id LIMIT %s''',
                (workspace, after, '%' + search + '%', '%' + search + '%', limit + 1)).fetchall()
        else:
            az.require(conn, actor, 'member.manage')
            rows = conn.execute('''SELECT id,username,display_name,avatar,status,auth_version FROM members
                WHERE id>%s AND (username ILIKE %s OR display_name ILIKE %s) ORDER BY id LIMIT %s''',
                (after, '%' + search + '%', '%' + search + '%', limit + 1)).fetchall()
        result = []
        for row in rows[:limit]:
            if workspace:
                grants = conn.execute('SELECT role_id FROM workspace_member_roles WHERE workspace_id=%s AND member_id=%s',
                                      (workspace, row['id']))
            else:
                grants = conn.execute('SELECT role_id FROM platform_member_roles WHERE member_id=%s', (row['id'],))
            result.append({**row, 'role_ids': sorted(r['role_id'] for r in grants)})
        return {'members': result, 'next': rows[limit - 1]['id'] if len(rows) > limit else None}


def lookup(actor, username, workspace=None):
    """Space delegates can resolve one known account, not browse global members."""
    with az.policy_transaction() as conn:
        require_assignment(conn, actor, workspace)
        row = conn.execute('''SELECT id,username,display_name,avatar,status,auth_version
            FROM members WHERE lower(username)=lower(%s) AND status<>'disabled' ''', (username,)).fetchone()
        if not row:
            az.fail('member_not_found', 404)
        if workspace:
            roles = conn.execute('SELECT role_id FROM workspace_member_roles WHERE member_id=%s AND workspace_id=%s', (row['id'], workspace))
        else:
            roles = conn.execute('SELECT role_id FROM platform_member_roles WHERE member_id=%s', (row['id'],))
        az.audit(conn, actor, 'member.lookup', row['id'], workspace)
        return {**row, 'role_ids': sorted(r['role_id'] for r in roles)}


def roles(actor, workspace=None):
    with az.policy_transaction() as conn:
        # Member delegates also need the catalog to choose grants. Their list
        # exposes descriptions, never conveys permission to edit a role.
        action = 'space.roles.manage' if workspace else 'role.manage'
        if workspace and action not in az.effective_permissions(conn, actor.member_id, workspace) and not az.superadmin(conn, actor.member_id):
            require_assignment(conn, actor, workspace)
        else:
            az.require(conn, actor, action, workspace)
        permitted = set(az.WORKSPACE_PERMISSIONS if workspace else az.PLATFORM_PERMISSIONS)
        if not az.superadmin(conn, actor.member_id):
            permitted &= az.effective_permissions(conn, actor.member_id, workspace)
        rows = conn.execute('SELECT id,name,builtin_key,active,version FROM roles WHERE workspace_id IS NOT DISTINCT FROM %s ORDER BY name,id', (workspace,)).fetchall()
        result = []
        for row in rows:
            permissions = sorted(r['permission_id'] for r in conn.execute('SELECT permission_id FROM role_permissions WHERE role_id=%s', (row['id'],)))
            result.append({**row, 'permissions': permissions, 'delegatable': set(permissions) <= permitted})
        catalog = az.WORKSPACE_PERMISSIONS if workspace else az.PLATFORM_PERMISSIONS
        return {'roles': result, 'catalog': [{'id': key, 'name': value, 'delegatable': key in permitted} for key, value in catalog.items()]}


def events(actor, workspace=None, before=None, limit=50):
    with az.policy_transaction() as conn:
        az.require(conn, actor, 'audit.read' if workspace else 'audit.platform', workspace)
        # Platform audit covers all management actions. A space auditor cannot
        # use a guessed event ID to obtain platform or other-space event details.
        rows = conn.execute('''SELECT e.id,e.actor_id,m.display_name AS actor_name,e.action,
            e.workspace_id,e.target_id,e.details,e.created_at FROM management_events e
            LEFT JOIN members m ON m.id=e.actor_id
            WHERE (%s::text IS NULL OR e.workspace_id=%s) AND (%s::bigint IS NULL OR e.id<%s)
            ORDER BY e.id DESC LIMIT %s''', (workspace, workspace, before, before, limit + 1)).fetchall()
        return {'events': rows[:limit], 'next': rows[limit - 1]['id'] if len(rows) > limit else None}


def revoke_sessions(actor, member_id):
    with az.policy_transaction(change=True) as conn:
        az.require(conn, actor, 'member.manage')
        members._protect_superadmin(conn, actor, member_id)
        if not conn.execute('SELECT 1 FROM members WHERE id=%s', (member_id,)).fetchone():
            az.fail('member_not_found', 404)
        conn.execute('UPDATE member_sessions SET revoked_at=now() WHERE member_id=%s AND revoked_at IS NULL', (member_id,))
        conn.execute('UPDATE members SET auth_version=auth_version+1 WHERE id=%s', (member_id,))
        az.audit(conn, actor, 'member.sessions.revoke', member_id)


def role_impact(actor, role_id, workspace=None):
    with az.policy_transaction() as conn:
        result = members.role_impact(actor, role_id, workspace)
        rows = conn.execute('SELECT id,username,display_name FROM members WHERE id=ANY(%s) ORDER BY display_name,id', (result['member_ids'],)).fetchall()
        return {**result, 'members': rows}


def create_workspace(actor, name, administrator_id, administrator_username, description):
    with az.policy_transaction(change=True) as conn:
        az.require(conn, actor, 'space.create')
        az.require(conn, actor, 'space.assign')
        if bool(administrator_id) == bool(administrator_username):
            az.fail('choose_one_administrator', 400)
        if administrator_username:
            row = conn.execute("SELECT id FROM members WHERE lower(username)=lower(%s) AND status='active'", (administrator_username,)).fetchone()
            if not row:
                az.fail('active_administrator_required', 400)
            administrator_id = row['id']
        return members.create_workspace(actor, name, administrator_id, description)


def assign(actor, member_id, role_ids, workspace, expected_version):
    with az.policy_transaction(change=True) as conn:
        require_assignment(conn, actor, workspace)
        row = conn.execute('SELECT auth_version FROM members WHERE id=%s', (member_id,)).fetchone()
        if not row:
            az.fail('member_not_found', 404)
        if row['auth_version'] != expected_version:
            az.fail('member_version_conflict', 409)
        members.assign_roles(actor, member_id, role_ids, workspace)


def remove(actor, member_id, workspace, expected_version):
    with az.policy_transaction(change=True) as conn:
        az.require(conn, actor, 'space.members.manage', workspace)
        row = conn.execute('SELECT auth_version FROM members WHERE id=%s', (member_id,)).fetchone()
        if not row:
            az.fail('member_not_found', 404)
        if row['auth_version'] != expected_version:
            az.fail('member_version_conflict', 409)
        members.remove_workspace_member(actor, member_id, workspace)
