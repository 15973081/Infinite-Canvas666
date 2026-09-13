"""Member lifecycle and scoped role administration; no browser identity input.

This service is shared by the upcoming independent management entry and CLI.
All permission changes serialize with protected operations through authorization.
"""
import hashlib
import hmac
import json
import secrets
import uuid

from psycopg.errors import UniqueViolation

from app.services import authorization as az


def identifier(prefix):
    return prefix + '_' + uuid.uuid4().hex


def text(value, limit, field):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        az.fail('invalid_' + field, 400)
    return value.strip()


def password_hash(password, salt=None):
    if not isinstance(password, str) or not 12 <= len(password) <= 256:
        az.fail('password_length', 400)
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return salt, digest


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def profile(row):
    return {key: row[key] for key in ('id', 'username', 'display_name', 'avatar', 'status', 'auth_version') if key in row}


def _role(conn, name, permissions, workspace=None, builtin=None):
    rid = identifier('role')
    conn.execute('''INSERT INTO roles(id,scope,workspace_id,name,builtin_key)
        VALUES(%s,%s,%s,%s,%s)''', (rid, 'workspace' if workspace else 'platform', workspace, name, builtin))
    for permission in sorted(permissions):
        conn.execute('INSERT INTO role_permissions VALUES(%s,%s,%s)', (rid, permission, 'workspace' if workspace else 'platform'))
    return rid


def _space_templates(conn, workspace):
    return {key: _role(conn, name, permissions, workspace, key) for key, name, permissions in (
        ('admin', '空间管理员', az.WORKSPACE_PERMISSIONS), ('editor', '编辑者', az.EDITOR), ('viewer', '查看者', az.VIEWER))}


def bootstrap(username, display_name, password):
    """Trusted local CLI only. Not exposed as an HTTP self-registration route."""
    username, display_name = text(username, 64, 'username'), text(display_name, 80, 'display_name')
    salt, digest = password_hash(password)
    with az.policy_transaction(change=True) as conn:
        if conn.execute('SELECT 1 FROM members LIMIT 1').fetchone():
            az.fail('already_initialized', 409)
        for scope, catalog in [('platform', az.PLATFORM_PERMISSIONS), ('workspace', az.WORKSPACE_PERMISSIONS)]:
            for key, description in catalog.items():
                conn.execute('INSERT INTO permissions(id,scope,description) VALUES(%s,%s,%s)', (key, scope, description))
        mid = identifier('member')
        conn.execute('''INSERT INTO members(id,username,display_name,status,password_salt,password_digest)
            VALUES(%s,%s,%s,'active',%s,%s)''', (mid, username, display_name, salt, digest))
        admin = _role(conn, '平台超级管理员', az.PLATFORM_PERMISSIONS, builtin='superadmin')
        _role(conn, '运维管理员', {'maintenance.platform', 'backup.platform', 'audit.platform'}, builtin='operator')
        _role(conn, '审计员', {'audit.platform'}, builtin='auditor')
        conn.execute('INSERT INTO platform_member_roles(member_id,role_id) VALUES(%s,%s)', (mid, admin))
        templates = _space_templates(conn, 'default')
        conn.execute("INSERT INTO workspace_members VALUES('default',%s,now())", (mid,))
        conn.execute("INSERT INTO workspace_member_roles VALUES('default',%s,%s)", (mid, templates['admin']))
        az.audit(conn, None, 'identity.bootstrap', mid)
        return profile(conn.execute('SELECT * FROM members WHERE id=%s', (mid,)).fetchone())


def _activation(conn, member_id):
    token = secrets.token_urlsafe(32)
    conn.execute('UPDATE member_activations SET consumed_at=now() WHERE member_id=%s AND consumed_at IS NULL', (member_id,))
    conn.execute("INSERT INTO member_activations(token_hash,member_id,expires_at) VALUES(%s,%s,now()+interval '24 hours')",
                 (token_hash(token), member_id))
    return token


def create_member(actor, username, display_name):
    username, display_name = text(username, 64, 'username'), text(display_name, 80, 'display_name')
    try:
        with az.policy_transaction(change=True) as conn:
            az.require(conn, actor, 'member.manage')
            mid = identifier('member')
            conn.execute("INSERT INTO members(id,username,display_name,status) VALUES(%s,%s,%s,'invited')", (mid, username, display_name))
            token = _activation(conn, mid)
            az.audit(conn, actor, 'member.create', mid)
            return {'member': profile(conn.execute('SELECT * FROM members WHERE id=%s', (mid,)).fetchone()), 'activation_token': token}
    except UniqueViolation:
        az.fail('username_exists', 409)


def activate(token, password):
    if not isinstance(token, str) or not 20 <= len(token) <= 128:
        az.fail('invalid_activation', 400)
    salt, digest = password_hash(password)
    with az.policy_transaction(change=True) as conn:
        row = conn.execute('''SELECT a.member_id FROM member_activations a JOIN members m ON m.id=a.member_id
            WHERE a.token_hash=%s AND a.consumed_at IS NULL AND a.expires_at>clock_timestamp()
              AND m.status='invited' FOR UPDATE OF a,m''', (token_hash(token),)).fetchone()
        if not row:
            az.fail('invalid_activation', 400)
        conn.execute("UPDATE members SET password_salt=%s,password_digest=%s,status='active',auth_version=auth_version+1 WHERE id=%s",
                     (salt, digest, row['member_id']))
        conn.execute('UPDATE member_activations SET consumed_at=now() WHERE token_hash=%s', (token_hash(token),))
        az.audit(conn, None, 'member.activate', row['member_id'])
        return profile(conn.execute('SELECT * FROM members WHERE id=%s', (row['member_id'],)).fetchone())


def login(username, password, *, audience='workbench', source='unknown', remember=False):
    if audience not in {'workbench', 'management'}:
        az.fail('invalid_audience', 400)
    username = text(username, 64, 'username')
    # Commit attempt counters even if credentials fail. Keys are hashes, never
    # passwords or raw network addresses. DB time and counters span processes.
    keys = ['account:' + token_hash(username.lower()), 'source:' + token_hash(str(source))]
    with az.policy_transaction(change=True) as conn:
        limited = False
        for key in sorted(keys):
            row = conn.execute('''INSERT INTO member_login_attempts VALUES(%s,1,now()+interval '5 minutes')
                ON CONFLICT(key) DO UPDATE SET
                  count=CASE WHEN member_login_attempts.expires_at<=now() THEN 1 ELSE member_login_attempts.count+1 END,
                  expires_at=CASE WHEN member_login_attempts.expires_at<=now() THEN now()+interval '5 minutes' ELSE member_login_attempts.expires_at END
                RETURNING count''', (key,)).fetchone()
            limited = limited or row['count'] > (10 if key.startswith('account:') else 100)
    if limited:
        az.fail('login_rate_limited', 429)
    if not isinstance(password, str) or not 12 <= len(password) <= 256:
        az.fail('invalid_credentials', 401)
    with az.policy_transaction() as conn:
        row = conn.execute('SELECT * FROM members WHERE lower(username)=lower(%s)', (username,)).fetchone()
        salt = row['password_salt'] if row and row['password_salt'] else '00' * 16
        candidate = password_hash(password, salt)[1]
        if not row or row['status'] != 'active' or not hmac.compare_digest(candidate, row['password_digest'] or ''):
            az.fail('invalid_credentials', 401)
        token, sid = secrets.token_urlsafe(32), identifier('session')
        ttl = 30 * 86400 if remember else 12 * 3600
        conn.execute('''INSERT INTO member_sessions(id,token_hash,member_id,audience,expires_at)
            VALUES(%s,%s,%s,%s,now()+%s*interval '1 second')''', (sid, token_hash(token), row['id'], audience, ttl))
        conn.execute('DELETE FROM member_login_attempts WHERE key=%s', (keys[0],))
        return {'token': token, 'member': profile(row), 'ttl': ttl}


def resolve_session(token, audience='workbench'):
    if not isinstance(token, str) or not 20 <= len(token) <= 128:
        return None
    with az.policy_transaction() as conn:
        row = conn.execute('''SELECT s.id,s.member_id,s.audience FROM member_sessions s
            JOIN members m ON m.id=s.member_id WHERE s.token_hash=%s AND s.audience=%s
            AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND m.status='active' ''',
            (token_hash(token), audience)).fetchone()
        return az.Principal(row['member_id'], row['id'], row['audience']) if row else None


def logout(actor):
    with az.policy_transaction(change=True) as conn:
        az.active_member(conn, actor)
        conn.execute('UPDATE member_sessions SET revoked_at=now() WHERE id=%s', (actor.session_id,))
        az.audit(conn, actor, 'session.logout', actor.session_id)


def reset_member(actor, member_id):
    with az.policy_transaction(change=True) as conn:
        az.require(conn, actor, 'member.manage')
        _protect_superadmin(conn, actor, member_id)
        row = conn.execute("UPDATE members SET status='invited',password_salt=NULL,password_digest=NULL,auth_version=auth_version+1 WHERE id=%s RETURNING id", (member_id,)).fetchone()
        if not row:
            az.fail('member_not_found', 404)
        az.assert_administrators(conn)
        conn.execute('UPDATE member_sessions SET revoked_at=now() WHERE member_id=%s', (member_id,))
        token = _activation(conn, member_id)
        az.audit(conn, actor, 'member.reset', member_id)
        return {'activation_token': token}


def _protect_superadmin(conn, actor, member_id):
    if az.superadmin(conn, member_id) and not az.superadmin(conn, actor.member_id):
        az.fail('protected_administrator')
    if az.superadmin(conn, actor.member_id):
        return
    # Resetting a stronger member's credentials is also privilege delegation.
    # Prevent a member manager from taking over an otherwise forbidden account.
    az.validate_permissions(conn, actor, az.effective_permissions(conn, member_id))
    for row in conn.execute('SELECT workspace_id FROM workspace_members WHERE member_id=%s', (member_id,)):
        wid = row['workspace_id']
        az.validate_permissions(conn, actor, az.effective_permissions(conn, member_id, wid), wid)


def set_member_status(actor, member_id, status):
    if status not in {'active', 'disabled'}:
        az.fail('invalid_member_status', 400)
    with az.policy_transaction(change=True) as conn:
        az.require(conn, actor, 'member.manage')
        _protect_superadmin(conn, actor, member_id)
        row = conn.execute('SELECT * FROM members WHERE id=%s', (member_id,)).fetchone()
        if not row:
            az.fail('member_not_found', 404)
        if status == 'active' and not row['password_digest']:
            az.fail('activation_required', 409)
        conn.execute('UPDATE members SET status=%s,auth_version=auth_version+1 WHERE id=%s', (status, member_id))
        az.assert_administrators(conn)
        conn.execute('UPDATE member_sessions SET revoked_at=now() WHERE member_id=%s', (member_id,))
        conn.execute('UPDATE member_activations SET consumed_at=now() WHERE member_id=%s', (member_id,))
        az.audit(conn, actor, 'member.status', member_id, details={'status': status})


def update_profile(actor, display_name, avatar=''):
    display_name = text(display_name, 80, 'display_name')
    # Initially initials/colour avatars; never render arbitrary external URLs or HTML.
    if avatar not in {'', 'blue', 'green', 'purple', 'orange', 'pink'}:
        az.fail('invalid_avatar', 400)
    with az.policy_transaction(change=True) as conn:
        az.active_member(conn, actor)
        conn.execute('UPDATE members SET display_name=%s,avatar=%s WHERE id=%s', (display_name, avatar, actor.member_id))
        az.audit(conn, actor, 'member.profile', actor.member_id)
        return profile(conn.execute('SELECT * FROM members WHERE id=%s', (actor.member_id,)).fetchone())


def create_workspace(actor, name, administrator_id, description=''):
    name = text(name, 80, 'workspace_name')
    if not isinstance(description, str) or len(description) > 1000:
        az.fail('invalid_description', 400)
    with az.policy_transaction(change=True) as conn:
        az.require(conn, actor, 'space.create')
        az.require(conn, actor, 'space.assign')
        if not conn.execute("SELECT 1 FROM members WHERE id=%s AND status='active'", (administrator_id,)).fetchone():
            az.fail('active_administrator_required', 400)
        wid = identifier('space')
        conn.execute('INSERT INTO workspaces(id,name,description) VALUES(%s,%s,%s)', (wid, name, description))
        templates = _space_templates(conn, wid)
        conn.execute('INSERT INTO workspace_members(workspace_id,member_id) VALUES(%s,%s)', (wid, administrator_id))
        conn.execute('INSERT INTO workspace_member_roles VALUES(%s,%s,%s)', (wid, administrator_id, templates['admin']))
        az.audit(conn, actor, 'space.create', wid, wid, {'administrator_id': administrator_id})
        return {'id': wid, 'name': name, 'roles': templates}


def list_workspaces(actor):
    with az.policy_transaction() as conn:
        az.active_member(conn, actor)
        rows = conn.execute('''SELECT w.id,w.name,w.description FROM workspaces w
            JOIN workspace_members m ON m.workspace_id=w.id
            WHERE m.member_id=%s AND w.status='active' ORDER BY w.name,w.id''', (actor.member_id,)).fetchall()
        return [{**row, 'permissions': sorted(az.effective_permissions(conn, actor.member_id, row['id']))} for row in rows]


def create_role(actor, name, permission_ids, workspace=None):
    name = text(name, 80, 'role_name')
    try:
        with az.policy_transaction(change=True) as conn:
            az.require(conn, actor, 'space.roles.manage' if workspace else 'role.manage', workspace)
            permissions = az.validate_permissions(conn, actor, permission_ids, workspace)
            rid = _role(conn, name, permissions, workspace)
            az.audit(conn, actor, 'role.create', rid, workspace, {'permissions': sorted(permissions)})
            return rid
    except UniqueViolation:
        az.fail('role_name_exists', 409)


def _role_for_actor(conn, actor, role_id, workspace):
    row = conn.execute('SELECT * FROM roles WHERE id=%s AND workspace_id IS NOT DISTINCT FROM %s', (role_id, workspace)).fetchone()
    if not row:
        az.fail('role_not_found', 404)
    permissions = {r['permission_id'] for r in conn.execute('SELECT permission_id FROM role_permissions WHERE role_id=%s', (role_id,))}
    az.validate_permissions(conn, actor, permissions, workspace)
    if row['builtin_key'] == 'superadmin' and not az.superadmin(conn, actor.member_id):
        az.fail('protected_administrator')
    return row


def assign_roles(actor, member_id, role_ids, workspace=None):
    role_ids = sorted(set(role_ids))
    with az.policy_transaction(change=True) as conn:
        # Platform space assignment may only grant permissions the actor can
        # delegate in that space (superadmin has explicit delegation authority).
        if workspace and 'space.assign' in az.effective_permissions(conn, actor.member_id):
            az.require(conn, actor, 'space.assign')
            if not conn.execute("SELECT 1 FROM workspaces WHERE id=%s AND status='active'", (workspace,)).fetchone():
                az.fail('workspace_unavailable')
        else:
            az.require(conn, actor, 'space.members.manage' if workspace else 'role.manage', workspace)
        if not conn.execute("SELECT 1 FROM members WHERE id=%s AND status<>'disabled'", (member_id,)).fetchone():
            az.fail('member_unavailable', 404)
        if workspace is None:
            _protect_superadmin(conn, actor, member_id)
            old = conn.execute('SELECT role_id FROM platform_member_roles WHERE member_id=%s', (member_id,)).fetchall()
        else:
            old = conn.execute('SELECT role_id FROM workspace_member_roles WHERE member_id=%s AND workspace_id=%s', (member_id, workspace)).fetchall()
        for rid in set(role_ids) | {r['role_id'] for r in old}:
            row = _role_for_actor(conn, actor, rid, workspace)
            if rid in role_ids and not row['active']:
                az.fail('role_inactive', 409)
        if workspace is None:
            conn.execute('DELETE FROM platform_member_roles WHERE member_id=%s', (member_id,))
            for rid in role_ids:
                conn.execute('INSERT INTO platform_member_roles(member_id,role_id) VALUES(%s,%s)', (member_id, rid))
        else:
            conn.execute('INSERT INTO workspace_members(workspace_id,member_id) VALUES(%s,%s) ON CONFLICT DO NOTHING', (workspace, member_id))
            conn.execute('DELETE FROM workspace_member_roles WHERE member_id=%s AND workspace_id=%s', (member_id, workspace))
            for rid in role_ids:
                conn.execute('INSERT INTO workspace_member_roles VALUES(%s,%s,%s)', (workspace, member_id, rid))
        conn.execute('UPDATE members SET auth_version=auth_version+1 WHERE id=%s', (member_id,))
        az.assert_administrators(conn)
        az.audit(conn, actor, 'role.assign', member_id, workspace, {'roles': role_ids})


def remove_workspace_member(actor, member_id, workspace):
    with az.policy_transaction(change=True) as conn:
        az.require(conn, actor, 'space.members.manage', workspace)
        for row in conn.execute('SELECT role_id FROM workspace_member_roles WHERE workspace_id=%s AND member_id=%s', (workspace, member_id)):
            _role_for_actor(conn, actor, row['role_id'], workspace)
        conn.execute('DELETE FROM workspace_member_roles WHERE workspace_id=%s AND member_id=%s', (workspace, member_id))
        conn.execute('DELETE FROM workspace_members WHERE workspace_id=%s AND member_id=%s', (workspace, member_id))
        conn.execute('UPDATE members SET auth_version=auth_version+1 WHERE id=%s', (member_id,))
        az.assert_administrators(conn)
        az.audit(conn, actor, 'space.member.remove', member_id, workspace)


def update_role(actor, role_id, name, permission_ids, expected_version, workspace=None):
    name = text(name, 80, 'role_name')
    try:
        with az.policy_transaction(change=True) as conn:
            az.require(conn, actor, 'space.roles.manage' if workspace else 'role.manage', workspace)
            row = _role_for_actor(conn, actor, role_id, workspace)
            if row['builtin_key']:
                az.fail('builtin_role_protected')
            if row['version'] != expected_version:
                az.fail('role_version_conflict', 409)
            permissions = az.validate_permissions(conn, actor, permission_ids, workspace)
            conn.execute('UPDATE roles SET name=%s,version=version+1 WHERE id=%s', (name, role_id))
            conn.execute('DELETE FROM role_permissions WHERE role_id=%s', (role_id,))
            for permission in sorted(permissions):
                conn.execute('INSERT INTO role_permissions VALUES(%s,%s,%s)', (role_id, permission, 'workspace' if workspace else 'platform'))
            conn.execute('''UPDATE members SET auth_version=auth_version+1 WHERE id IN (
                SELECT member_id FROM platform_member_roles WHERE role_id=%s UNION
                SELECT member_id FROM workspace_member_roles WHERE role_id=%s)''', (role_id, role_id))
            az.audit(conn, actor, 'role.update', role_id, workspace, {'permissions': sorted(permissions), 'version': expected_version + 1})
            return expected_version + 1
    except UniqueViolation:
        az.fail('role_name_exists', 409)


def archive_workspace(actor, workspace, *, archived=True):
    with az.policy_transaction(change=True) as conn:
        az.require(conn, actor, 'space.archive')
        row = conn.execute('UPDATE workspaces SET status=%s WHERE id=%s RETURNING id', ('archived' if archived else 'active', workspace)).fetchone()
        if not row:
            az.fail('workspace_not_found', 404)
        az.assert_administrators(conn)
        conn.execute('UPDATE members SET auth_version=auth_version+1 WHERE id IN (SELECT member_id FROM workspace_members WHERE workspace_id=%s)', (workspace,))
        az.audit(conn, actor, 'space.archive' if archived else 'space.enable', workspace, workspace)


def _role_impact(conn, role_id):
    row = conn.execute('SELECT version FROM roles WHERE id=%s', (role_id,)).fetchone()
    members = sorted(r['member_id'] for r in conn.execute('''SELECT member_id FROM platform_member_roles
        WHERE role_id=%s UNION SELECT member_id FROM workspace_member_roles WHERE role_id=%s''', (role_id, role_id)))
    snapshot = json.dumps([role_id, row['version'], members], separators=(',', ':'))
    return {'version': row['version'], 'member_ids': members, 'confirmation': token_hash(snapshot)}


def role_impact(actor, role_id, workspace=None):
    with az.policy_transaction() as conn:
        az.require(conn, actor, 'space.roles.manage' if workspace else 'role.manage', workspace)
        row = _role_for_actor(conn, actor, role_id, workspace)
        if row['builtin_key']:
            az.fail('builtin_role_protected')
        return _role_impact(conn, role_id)


def retire_role(actor, role_id, confirmation, *, workspace=None, replacement=None, revoke=False):
    """Disable a custom role after explicit preview; retain it for audit history."""
    if (replacement is None) == (not revoke) or replacement == role_id:
        az.fail('choose_replacement_or_revoke', 400)
    with az.policy_transaction(change=True) as conn:
        az.require(conn, actor, 'space.roles.manage' if workspace else 'role.manage', workspace)
        row = _role_for_actor(conn, actor, role_id, workspace)
        if row['builtin_key']:
            az.fail('builtin_role_protected')
        if not row['active']:
            az.fail('role_inactive', 409)
        impact = _role_impact(conn, role_id)
        if confirmation != impact['confirmation']:
            az.fail('role_impact_changed', 409)
        if replacement:
            target = _role_for_actor(conn, actor, replacement, workspace)
            # Role retirement cannot become an alternate assignment endpoint
            # for the protected superadmin role.
            if not target['active'] or target['builtin_key'] == 'superadmin':
                az.fail('invalid_replacement', 400)
        for member_id in impact['member_ids']:
            if workspace is None:
                conn.execute('DELETE FROM platform_member_roles WHERE member_id=%s AND role_id=%s', (member_id, role_id))
                if replacement:
                    conn.execute('INSERT INTO platform_member_roles(member_id,role_id) VALUES(%s,%s) ON CONFLICT DO NOTHING', (member_id, replacement))
            else:
                conn.execute('DELETE FROM workspace_member_roles WHERE workspace_id=%s AND member_id=%s AND role_id=%s', (workspace, member_id, role_id))
                if replacement:
                    conn.execute('INSERT INTO workspace_member_roles VALUES(%s,%s,%s) ON CONFLICT DO NOTHING', (workspace, member_id, replacement))
            conn.execute('UPDATE members SET auth_version=auth_version+1 WHERE id=%s', (member_id,))
        conn.execute('UPDATE roles SET active=false,version=version+1 WHERE id=%s', (role_id,))
        az.assert_administrators(conn)
        az.audit(conn, actor, 'role.retire', role_id, workspace, {'replacement': replacement, 'member_ids': impact['member_ids']})
