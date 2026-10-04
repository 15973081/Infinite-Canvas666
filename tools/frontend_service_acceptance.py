"""Isolated real HTTP/WebSocket acceptance; never uses legacy data or paid providers."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    from tools.cloud_test import test_database_url
    from app.storage.settings import load_storage_env
    from app.storage import database
    from psycopg import sql
    from cryptography.fernet import Fernet
    os.environ.setdefault('STORAGE_ENV_FILE', str(ROOT / '.local/cloud/storage.env'))
    load_storage_env()
    target = test_database_url(os.environ['DATABASE_URL'])
    schema = 'frontend_accept_' + uuid.uuid4().hex
    with tempfile.TemporaryDirectory(prefix='canvas-frontend-accept-') as directory:
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        origin = f'http://127.0.0.1:{port}'
        os.environ.update(DATABASE_URL=target, DATABASE_SCHEMA=schema, DATABASE_BACKEND='postgres', AUTH_MODE='members',
                          CLOUD_EMBEDDED_WORKER='false', PROVIDER_SECRET_KEY=Fernet.generate_key().decode(),
                          APP_RUNTIME_DIR=str(Path(directory) / 'runtime'), AUTH_DB_PATH=str(Path(directory) / 'auth.sqlite3'),
                          OBJECT_STORE_ROOT=str(Path(directory) / 'objects'), MEDIA_TEMP_DIR=str(Path(directory) / 'tmp'),
                          MEDIA_BACKEND='filesystem', MEDIA_SIGNING_KEY=secrets.token_urlsafe(48), PUBLIC_BASE_URL=origin)
        database.close()
        server = None
        try:
            database.migrate()
            from app.services import members
            password = secrets.token_urlsafe(24)
            admin = members.bootstrap('accept-admin-' + uuid.uuid4().hex, '验收管理员', password)
            token = members.login(admin['username'], password, audience='management', source='isolated-acceptance')['token']
            operator = members.resolve_session(token, 'management')
            space = members.create_workspace(operator, '一次性前端验收空间', operator.member_id)
            people = []
            for role in ['editor', 'viewer']:
                invited = members.create_member(operator, 'accept-' + role + '-' + uuid.uuid4().hex, role)
                person = members.activate(invited['activation_token'], password)
                members.assign_roles(operator, person['id'], [space['roles'][role]], space['id'])
                people.append(person['username'])
            flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
            code = "import sys;sys.path.insert(0,'.');import uvicorn;uvicorn.run('main:app',host='127.0.0.1',port=" + str(port) + ",log_level='warning')"
            with (ROOT / '.local/assessment-http-server.log').open('w', encoding='utf-8') as log:
                server = subprocess.Popen([sys.executable, '-c', code], cwd=ROOT, env=os.environ.copy(), stdout=log,
                                          stderr=subprocess.STDOUT, creationflags=flags)
                deadline = time.monotonic() + 20
                while time.monotonic() < deadline:
                    if server.poll() is not None:
                        raise RuntimeError('Isolated HTTP server failed; see private local log')
                    try:
                        with socket.create_connection(('127.0.0.1', port), timeout=.2):
                            break
                    except OSError:
                        time.sleep(.1)
                else:
                    raise RuntimeError('Isolated HTTP server startup timed out')
                result = subprocess.run(['node', str(ROOT / 'tools/frontend_service_acceptance.cjs')], cwd=ROOT,
                    env=os.environ.copy(), input=json.dumps({'origin': origin, 'editor': people[0], 'viewer': people[1],
                        'password': password, 'workspace': space['id']}), capture_output=True, text=True, encoding='utf-8',
                    timeout=120, creationflags=flags)
                if result.returncode:
                    raise RuntimeError(result.stderr)
                report = json.loads(result.stdout)
                report.update(database='disposable canvas_cloud_test schema', embedded_worker=False,
                              measured_at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
                (ROOT / 'docs/frontend-real-service-acceptance-2026-10-05.json').write_text(
                    json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
                print(json.dumps({'passed': report['passed'], 'scope': report['scope']}))
        finally:
            if server is not None and server.poll() is None:
                server.terminate()
                server.wait(timeout=15)
            try:
                if database.schema_name() != schema or os.environ['DATABASE_URL'] != target:
                    raise RuntimeError('Refusing cleanup outside this disposable schema')
                with database.connection() as conn:
                    conn.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(schema)))
            finally:
                database.close()


if __name__ == '__main__':
    main()
