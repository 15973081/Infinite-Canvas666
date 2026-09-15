"""Encrypted staged TOS settings. Never switches live storage."""
import json
import os
import re
from psycopg.types.json import Jsonb
from app.services import authorization as az
from app.services.provider_control import cipher
FIELDS = ('bucket', 'region', 'internal_endpoint', 'public_endpoint')
SECRETS = ('access_key', 'secret_key', 'security_token')

def require(conn, actor):
    if actor.audience != 'management':
        az.fail('management_session_required')
    az.require(conn, actor, 'maintenance.platform')

def normalize(data):
    config = {key: data[key].strip() for key in FIELDS}
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]', config['bucket']):
        az.fail('invalid_tos_config', 400)
    region = config['region']
    if not re.fullmatch(r'[a-z]{2}-[a-z]+(?:-[a-z]+)?', region):
        az.fail('invalid_tos_config', 400)
    for key in ('internal_endpoint', 'public_endpoint'):
        host = config[key].removeprefix('https://').rstrip('/')
        allowed = {f'tos-{region}.volces.com'}
        if key == 'internal_endpoint':
            allowed.add(f'tos-{region}.ivolces.com')
        if host not in allowed:
            az.fail('invalid_tos_endpoint', 400)
        config[key] = 'https://' + host
    return config

def public(row):
    return {'config': row['config'] if row else {},
            'version': row['version'] if row else 0,
            'credentials_configured': bool(row and row['secret_ciphertext']),
            'active_backend': os.getenv('MEDIA_BACKEND', 'local'),
            'state': 'staged' if row else 'unconfigured'}

def read(actor):
    with az.policy_transaction() as conn:
        require(conn, actor)
        return public(conn.execute('SELECT * FROM managed_storage WHERE id=1').fetchone())

def save(actor, data):
    config = normalize(data)
    with az.policy_transaction() as conn:
        require(conn, actor)
        conn.execute('SELECT pg_advisory_xact_lock(642193017)')
        row = conn.execute('SELECT * FROM managed_storage WHERE id=1 FOR UPDATE').fetchone()
        if data['expected_version'] != (row['version'] if row else 0):
            az.fail('tos_config_changed', 409)
        secrets = {k: data.get(k, '').strip() for k in SECRETS}
        if bool(secrets['access_key']) != bool(secrets['secret_key']):
            az.fail('tos_credentials_required', 400)
        if secrets['access_key']:
            encrypted = cipher().encrypt(json.dumps(secrets).encode()).decode('ascii')
        elif row:
            if secrets['security_token']:
                az.fail('tos_credentials_required', 400)
            encrypted = row['secret_ciphertext']
        else:
            az.fail('tos_credentials_required', 400)
        result = conn.execute('''INSERT INTO managed_storage(id,config,secret_ciphertext,updated_by)
            VALUES(1,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET config=EXCLUDED.config,
            secret_ciphertext=EXCLUDED.secret_ciphertext,version=managed_storage.version+1,
            updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp() RETURNING *''',
            (Jsonb(config), encrypted, actor.member_id)).fetchone()
        az.audit(conn, actor, 'storage.config.staged', details={'version': result['version'], 'bucket': config['bucket']})
        return public(result)

def probe_config(config, secrets):
    import tos
    client = tos.TosClientV2(secrets['access_key'], secrets['secret_key'],
        config['internal_endpoint'], config['region'], security_token=secrets.get('security_token') or None,
        connection_time=3, socket_timeout=5, request_timeout=5, max_retry_count=0, follow_redirect_times=0)
    checks = []
    def check(name, operation):
        try:
            state, message = operation()
        except Exception:
            state, message = 'unknown', '无法检查，请核对网络、凭证和该项读取权限。'
        checks.append({'name': name, 'state': state, 'message': message})
    bucket = config['bucket']
    def connection():
        client.head_bucket(bucket)
        return 'pass', '已连接到桶'
    def version():
        value = client.get_bucket_version(bucket).status
        enabled = getattr(value, 'value', value) == 'Enabled'
        return ('pass', '版本控制已开启') if enabled else ('fail', '请在火山控制台开启版本控制，否则素材不能可靠上传。')
    def acl():
        grants = client.get_bucket_acl(bucket).grants
        groups = [g for g in grants if getattr(g.grantee.canned, 'value', g.grantee.canned)]
        return ('fail', '发现群组授权，请在火山控制台核对并保持桶私有。') if groups else ('pass', '桶 ACL 未发现公共群组授权；对象 ACL 需另外核对。')
    def policy():
        try:
            client.get_bucket_policy(bucket)
        except tos.exceptions.TosServerError as exc:
            if exc.code == 'NoSuchBucketPolicy':
                return 'pass', '未设置额外桶策略。'
            raise
        return 'unknown', '已设置自定义桶策略，请在火山控制台核对授权对象与显式拒绝规则。'
    try:
        check('连接桶', connection)
        check('版本控制', version)
        check('桶 ACL', acl)
        check('桶策略', policy)
    finally:
        client.close()
    return checks

def probe(actor, expected_version):
    with az.policy_transaction() as conn:
        require(conn, actor)
        row = conn.execute('SELECT * FROM managed_storage WHERE id=1').fetchone()
        if not row or row['version'] != expected_version:
            az.fail('tos_config_changed', 409)
        try:
            secrets = json.loads(cipher().decrypt(row['secret_ciphertext'].encode('ascii')))
        except Exception:
            az.fail('provider_secret_unavailable', 503)
        config = normalize(row['config'])
    checks = probe_config(config, secrets)
    with az.policy_transaction() as conn:
        require(conn, actor)
        current = conn.execute('SELECT version FROM managed_storage WHERE id=1').fetchone()
        if not current or current['version'] != expected_version:
            az.fail('tos_config_changed', 409)
        az.audit(conn, actor, 'storage.config.probed', details={'version': expected_version, 'checks': checks})
    return {'version': expected_version, 'checks': checks,
            'note': '只读检查不会验证实际上传、指定版本下载或模型读取，也不会改变桶权限。'}
