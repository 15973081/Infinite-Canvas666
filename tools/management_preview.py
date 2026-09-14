"""Disposable local management UI acceptance server. Never uses the development schema.

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
    from tools.build_management import build
    from app.services import members
    from psycopg import sql
    import uvicorn
    os.environ.setdefault('STORAGE_ENV_FILE', str(ROOT / '.local/cloud/storage.env'))
    load_storage_env()
    target = test_database_url(os.environ['DATABASE_URL'])
    schema = 'management_ui_' + uuid.uuid4().hex
    acceptance = ROOT / '.local/cloud/acceptance' / schema
    acceptance.mkdir(parents=True)
    stop = acceptance / 'stop'
    os.environ.update(DATABASE_URL=target, DATABASE_SCHEMA=schema, DATABASE_BACKEND='postgres',
                      MANAGEMENT_BASE_URL='http://127.0.0.1:8767', CLOUD_EMBEDDED_WORKER='false')
    database.close()
    try:
        database.migrate()
        member = members.bootstrap('preview-admin', '验收管理员', 'preview-only-password-12345')
        login = members.login(member['username'], 'preview-only-password-12345', audience='management')
        actor = members.resolve_session(login['token'], 'management')
        members.create_workspace(actor, '设计空间', member['id'], '独立管理平台浏览器验收')
        members.logout(actor)
        from app.management.application import create_app
        app = create_app(build(acceptance / 'dist'))
        server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=8767, log_level='warning'))
        finished = threading.Event()

        def stop_watch():
            while not finished.wait(.25):
                if stop.exists():
                    server.should_exit = True
                    return

        thread = threading.Thread(target=stop_watch, daemon=True)
        thread.start()
        print(json.dumps({'url': os.environ['MANAGEMENT_BASE_URL'], 'stop_file': str(stop), 'schema': schema}, ensure_ascii=False), flush=True)
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
