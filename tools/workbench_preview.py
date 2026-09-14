"""Disposable local member workbench acceptance server. Never uses the development schema.

Run with the bundled Python, then create the printed stop_file to shut down and
drop only this run's test schema. Credentials are synthetic and local-only.
"""
import json
import os
from pathlib import Path
import sys
import threading
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
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
        for space in spaces:
            members.assign_roles(actor, invited['member']['id'], [space['roles']['editor']], space['id'])
            with workspace_scope(space['id']):
                canvases.save({'id': 'canvas_' + space['id'], 'title': space['name'] + '的画布', 'kind': 'classic', 'nodes': [], 'connections': []})
                canvases.save({'id': 'smart_' + space['id'], 'title': space['name'] + '的智能画布', 'kind': 'smart', 'nodes': [], 'connections': []})
        members.logout(actor)
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
        print(json.dumps({'url': os.environ['PUBLIC_BASE_URL'], 'stop_file': str(stop), 'schema': schema, 'activation_token': invited['activation_token'], 'spaces': [s['id'] for s in spaces]}, ensure_ascii=False), flush=True)
        try:
            server.run()
        finally:
            finished.set()
            thread.join(2)
    finally:
        if database.schema_name() != schema or os.environ['DATABASE_URL'] != target:
            raise RuntimeError('Refusing cleanup outside the isolated management acceptance schema')
        with database.connection() as conn:
            conn.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(schema)))
        database.close()


if __name__ == '__main__':
    main()
