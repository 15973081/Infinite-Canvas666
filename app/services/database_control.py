"""Management-owned connection profiles. No live backend switching or remote writes."""
import ipaddress
import json
import re
import ssl
import tempfile
from pathlib import Path
from uuid import uuid4
import psycopg
from psycopg.types.json import Jsonb
from app.services import authorization as az
from app.services.provider_control import cipher

def require(conn, actor):
    if actor.audience != 'management':
        az.fail('management_session_required')
    az.require(conn, actor, 'maintenance.platform')

def normalize(data):
    result = {k: data[k].strip() for k in ('name','host','database','username','schema_name','ca_pem','hostaddr')}
    result['port'] = data['port']
    if not all(result[k] for k in ('name','host','database','username','schema_name')) or not 1 <= result['port'] <= 65535:
        az.fail('invalid_database_config', 400)
    for key in ('host','database','username','schema_name','hostaddr'):
        if any(ord(ch)<32 for ch in result[key]):
            az.fail('invalid_database_config', 400)
    host = result['host']
    try:
        ipaddress.ip_address(host)
    except ValueError:
        if len(host)>253 or not all(re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?', label) for label in host.split('.')):
            az.fail('invalid_database_config', 400)
    if result['hostaddr']:
        try:
            ipaddress.ip_address(result['hostaddr'])
        except ValueError:
            az.fail('invalid_database_config', 400)
    try:
        if 'PRIVATE KEY' in result['ca_pem']:
            raise ValueError()
        ssl.create_default_context(cadata=result['ca_pem'])
    except (ValueError, ssl.SSLError):
        az.fail('invalid_database_certificate', 400)
    return result

def public(row):
    return {'id':row['id'],'config':row['config'],'version':row['version'],'password_configured':True,'updated_at':row['updated_at'].isoformat()}

def catalog(actor):
    with az.policy_transaction() as conn:
        require(conn, actor)
        return {'items':[public(r) for r in conn.execute('SELECT * FROM database_connections ORDER BY updated_at DESC')]}

def save(actor, data, profile_id=None):
    config = normalize(data)
    with az.policy_transaction() as conn:
        require(conn, actor)
        row = None
        if profile_id:
            row = conn.execute('SELECT * FROM database_connections WHERE id=%s FOR UPDATE',(profile_id,)).fetchone()
            if not row:
                az.fail('database_connection_not_found',404)
        if data['expected_version'] != (row['version'] if row else 0):
            az.fail('database_connection_changed',409)
        password = data.get('password','')
        if password:
            secret = cipher().encrypt(password.encode('utf-8')).decode('ascii')
        elif row:
            secret = row['secret_ciphertext']
        else:
            az.fail('database_password_required',400)
        if row:
            saved = conn.execute('UPDATE database_connections SET config=%s,secret_ciphertext=%s,version=version+1,updated_by=%s,updated_at=clock_timestamp() WHERE id=%s RETURNING *',(Jsonb(config),secret,actor.member_id,profile_id)).fetchone()
        else:
            profile_id = str(uuid4())
            saved = conn.execute('INSERT INTO database_connections(id,config,secret_ciphertext,updated_by) VALUES(%s,%s,%s,%s) RETURNING *',(profile_id,Jsonb(config),secret,actor.member_id)).fetchone()
        az.audit(conn, actor, 'database.connection.saved', profile_id, details={'version':saved['version']})
        return public(saved)

def remove(actor, profile_id, expected_version):
    with az.policy_transaction() as conn:
        require(conn, actor)
        row = conn.execute('SELECT * FROM database_connections WHERE id=%s FOR UPDATE',(profile_id,)).fetchone()
        if not row:
            az.fail('database_connection_not_found',404)
        if row['version'] != expected_version:
            az.fail('database_connection_changed',409)
        conn.execute('DELETE FROM database_connections WHERE id=%s',(profile_id,))
        az.audit(conn, actor, 'database.connection.deleted', profile_id)
        return {'deleted':True}

def test_connection(config, password):
    # libpq accepts separate keyword parameters; profile fields never become SQL.
    with tempfile.TemporaryDirectory(prefix="canvas-db-ca-") as folder:
        certificate = Path(folder)/'ca.pem'
        certificate.write_text(config['ca_pem'],encoding='ascii')
        kwargs = dict(host=config['host'],port=config['port'],dbname=config['database'],user=config['username'],password=password,sslmode='verify-full',sslrootcert=str(certificate),connect_timeout=5,options='-c statement_timeout=3000 -c default_transaction_read_only=on',application_name='canvas-management-probe')
        if config['hostaddr']:
            kwargs['hostaddr'] = config['hostaddr']
        with psycopg.connect(**kwargs) as remote:
            ssl_row = remote.execute('SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()').fetchone()
            if not ssl_row or not ssl_row[0]:
                raise RuntimeError('TLS required')
            row = remote.execute('SELECT current_database(),current_user,current_setting(%s)',('server_version',)).fetchone()
            count = remote.execute('SELECT count(*) FROM information_schema.tables WHERE table_schema=%s AND table_type=%s',(config['schema_name'],'BASE TABLE')).fetchone()[0]
            return {'state':'connected','database':row[0],'username':row[1],'server_version':row[2],'tls':ssl_row[1],'tables':count}

def probe(actor, profile_id, expected_version):
    with az.policy_transaction() as conn:
        require(conn, actor)
        row = conn.execute('SELECT * FROM database_connections WHERE id=%s',(profile_id,)).fetchone()
        if not row:
            az.fail('database_connection_not_found',404)
        if row['version'] != expected_version:
            az.fail('database_connection_changed',409)
        try:
            password = cipher().decrypt(row['secret_ciphertext'].encode('ascii')).decode('utf-8')
        except Exception:
            az.fail('provider_secret_unavailable',503)
        config = normalize(row['config'])
    try:
        result = test_connection(config, password)
    except Exception:
        # Do not return raw driver errors, DSNs or credentials to the browser/audit.
        result = {'state':'failed','message':'连接失败，请核对网络、白名单、账号密码、数据库名和 CA 证书。'}
    with az.policy_transaction() as conn:
        require(conn, actor)
        current = conn.execute('SELECT version FROM database_connections WHERE id=%s',(profile_id,)).fetchone()
        if not current or current['version'] != expected_version:
            az.fail('database_connection_changed',409)
        az.audit(conn, actor, 'database.connection.probed',profile_id, details={'version':expected_version,'state':result['state']})
    return result
