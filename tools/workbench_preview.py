"""Disposable local member workbench acceptance server. Never uses the development schema.

Run with the bundled Python, then create the printed stop_file to shut down and
drop only this run's test schema. Credentials are synthetic and local-only.
"""
import json
import argparse
import os
from pathlib import Path
import sys
import threading
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--two-members', action='store_true', help='Use separate localhost/127.0.0.1 cookies for two synthetic browser members')
    args = parser.parse_args()
    from app.storage import database
    from app.storage.settings import load_storage_env
    from tools.cloud_test import test_database_url
    from app.storage.workspace import workspace_scope
    from app.storage import canvases
    from app.services import members
    from psycopg import sql
    import uvicorn
    os.environ.setdefault('STORAGE_ENV_FILE', str(ROOT / '.local/cloud/storage.env'))
    load_storage_env()
    target = test_database_url(os.environ['DATABASE_URL'])
    schema = 'workbench_ui_' + uuid.uuid4().hex
    acceptance = ROOT / '.local/cloud/acceptance' / schema
    acceptance.mkdir(parents=True)
    stop = acceptance / 'stop'
    second = None
    second_log = None
    os.environ.update(DATABASE_URL=target, DATABASE_SCHEMA=schema, DATABASE_BACKEND='postgres',
                      PUBLIC_BASE_URL='http://127.0.0.1:8768', AUTH_MODE='members', CLOUD_EMBEDDED_WORKER='false',
                      MEDIA_BACKEND='filesystem', OBJECT_STORE_ROOT=str(acceptance / 'objects'),
                      MEDIA_TEMP_DIR=str(acceptance / 'tmp'), APP_RUNTIME_DIR=str(acceptance / 'runtime'))
    database.close()
    try:
        database.migrate()
        member = members.bootstrap('preview-admin', '验收管理员', 'preview-only-password-12345')
        login = members.login(member['username'], 'preview-only-password-12345', audience='management')
        actor = members.resolve_session(login['token'], 'management')
        spaces = [members.create_workspace(actor, name, member['id'], '隔离成员工作台验收') for name in ('设计空间', '制作空间')]
        invited = members.create_member(actor, 'preview-artist', '验收创作者')
        if args.two_members:
            members.activate(invited['activation_token'], 'preview-artist-password-12345')
        for space in spaces:
            members.assign_roles(actor, invited['member']['id'], [space['roles']['editor']], space['id'])
            with workspace_scope(space['id']):
                canvases.save({'id': 'canvas_' + space['id'], 'title': space['name'] + '的画布', 'kind': 'classic', 'nodes': [], 'connections': []})
                canvases.save({'id': 'smart_' + space['id'], 'title': space['name'] + '的智能画布', 'kind': 'smart', 'nodes': [], 'connections': []})
        members.logout(actor)
        if args.two_members:
            # Separate host cookies and processes, sharing only this disposable
            # schema. Each process retains its own strict public-origin check.
            second_log = (acceptance / 'second-server.log').open('w', encoding='utf-8')
            second = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8769', '--log-level', 'warning'],
                cwd=ROOT, env={**os.environ, 'PUBLIC_BASE_URL': 'http://localhost:8769'},
                stdout=second_log, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        from main import app
        server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=8768, log_level='warning'))
        finished = threading.Event()

        def stop_watch():
            while not finished.wait(.25):
                if stop.exists():
                    server.should_exit = True
                    return

        thread = threading.Thread(target=stop_watch, daemon=True)
        thread.start()
        print(json.dumps({'url': 'http://127.0.0.1:8768', 'second_url': 'http://localhost:8769' if args.two_members else None,
                          'stop_file': str(stop), 'schema': schema, 'activation_token': None if args.two_members else invited['activation_token'],
                          'spaces': [s['id'] for s in spaces]}, ensure_ascii=False), flush=True)
        try:
            server.run()
        finally:
            finished.set()
            thread.join(2)
    finally:
        if second is not None:
            if second.poll() is None:
                second.terminate()
            second.wait(timeout=10)
        if second_log is not None:
            second_log.close()
        if database.schema_name() != schema or os.environ['DATABASE_URL'] != target:
            raise RuntimeError('Refusing cleanup outside the isolated management acceptance schema')
        with database.connection() as conn:
            conn.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(schema)))
        database.close()


if __name__ == '__main__':
    main()
