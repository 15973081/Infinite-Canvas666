"""Disposable local management UI acceptance server. Never uses the development schema.

Run with the bundled Python, then create the printed stop_file to shut down and
drop only this run's test schema. Credentials are synthetic and local-only.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import threading
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def provider_stub():
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    requests = []
    key = 'synthetic-probe-preview-never-use-outside-tests'
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            authorized = self.headers.get('Authorization') == 'Bearer ' + key
            if self.path == '/v1/models' and authorized:
                status, payload = 200, {'data': [{'id': 'gpt-preview'}, {'id': 'flux-preview'}, {'id': 'veo-preview'}]}
            elif self.path.startswith('/v1/tasks/healthcheck_probe_do_not_submit_') and authorized:
                status, payload = 400, {'error': {'code': 400, 'type': 'invalid_request_error', 'message': 'Invalid task ID'}}
            elif self.path.startswith('/denied/') or not authorized:
                status, payload = 401, {'error': 'synthetic secret reflection: ' + key}
            else:
                status, payload = 404, {'error': {'code': 'not_found', 'message': 'generic route'}}
            requests.append({'method': 'GET', 'path': self.path, 'status': status})
            body = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def log_message(self, *args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread, requests, key


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider-probe', action='store_true', help='Seed a local-only mock supplier for connection/model UI acceptance')
    parser.add_argument('--task-review', action='store_true', help='Seed isolated pending tasks for management review acceptance')
    parser.add_argument('--backup', action='store_true', help='Seed isolated shared data and run a separate backup executor')
    args = parser.parse_args()
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
                      # Use a distinct host from the user-facing 127.0.0.1 management preview.
                      MANAGEMENT_BASE_URL=('http://localhost:8767' if (args.provider_probe or args.task_review or args.backup) else 'http://127.0.0.1:8767'),
                      CLOUD_EMBEDDED_WORKER='false')
    database.close()
    executor = executor_log = None
    mock = None
    probe_base_url = None
    try:
        database.migrate()
        member = members.bootstrap('preview-admin', '验收管理员', 'preview-only-password-12345')
        login = members.login(member['username'], 'preview-only-password-12345', audience='management')
        actor = members.resolve_session(login['token'], 'management')
        space = members.create_workspace(actor, '设计空间', member['id'], '独立管理平台浏览器验收')
        if args.provider_probe or args.task_review:
            from cryptography.fernet import Fernet
            from app.services import provider_control
            os.environ['PROVIDER_SECRET_KEY'] = Fernet.generate_key().decode('ascii')
            mock = provider_stub()
            probe_base_url = 'http://127.0.0.1:' + str(mock[0].server_port)
            provider_control.save(actor, 'probe-preview', {'name': '本地模拟供应商', 'base_url': probe_base_url,
                'protocol': 'openai', 'enabled': True, 'image_models': ['existing-image']}, 0,
                secrets={'api_key': mock[3]}, reason='本地模型检测浏览器验收')
        if args.task_review:
            from app.storage import tasks
            from app.storage.workspace import workspace_scope
            os.environ['AUTH_MODE'] = 'members'
            provider_control.assign(actor, space['id'], ['probe-preview'], 'probe-preview', 0, reason='任务处置隔离夹具')
            with workspace_scope(space['id']):
                for task_id, status, upstream, paid in (
                    ('review-unsubmitted', 'queued', None, False),
                    ('review-known-upstream', 'needs_review', 'synthetic-upstream-id', True),
                    ('review-uncertain', 'needs_review', None, True)):
                    tasks.save({'id': task_id, 'type': 'video', 'status': status, 'upstream_task_id': upstream,
                                'provider_id': 'probe-preview'}, {'provider_id': 'probe-preview', 'model': 'test-video', 'prompt': 'synthetic task review only'})
                    with database.connection() as conn:
                        conn.execute('UPDATE tasks SET requested_by=%s WHERE id=%s', (member['id'],task_id))
                        if paid:
                            conn.execute("INSERT INTO task_submissions(id,task_id,workspace_id,outcome) VALUES(%s,%s,%s,'uncertain')", (uuid.uuid4(),task_id,space['id']))
        if args.backup:
            from app.storage import media, canvases, documents
            from app.storage.workspace import workspace_scope
            # Keep Windows immutable-object paths below legacy MAX_PATH.
            backup_data=ROOT/'.local/cloud/backup-preview'/schema[-8:]
            os.environ.update(MANAGEMENT_BACKUP_ROOT=str(backup_data/'backups'),
                              OBJECT_STORE_ROOT=str(backup_data/'objects'), MEDIA_BACKEND='filesystem')
            source=acceptance/'synthetic.txt'
            source.write_text('isolated backup acceptance object',encoding='utf-8')
            with workspace_scope(space['id']):
                asset=media.publish(source)
                canvases.save({'id':'backup-preview-canvas','title':'备份验收画布',
                               'nodes':[{'id':'file','url':media.stable_url(asset)}],'connections':[]})
                documents.put('canvas_folders','default',{'folders':[]})
            import subprocess
            executor_log=(acceptance/'backup-worker.log').open('w',encoding='utf-8')
            executor=subprocess.Popen([sys.executable,str(ROOT/'tools/management_backup_worker.py'),
                                       '--watch','--stop-file',str(stop)],env=os.environ.copy(),
                                      stdout=executor_log,stderr=subprocess.STDOUT,
                                      creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
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
        print(json.dumps({'url': os.environ['MANAGEMENT_BASE_URL'], 'stop_file': str(stop), 'schema': schema, 'probe_base_url': probe_base_url}, ensure_ascii=False), flush=True)
        try:
            server.run()
        finally:
            finished.set()
            thread.join(2)
    finally:
        if executor:
            stop.touch(exist_ok=True)
            executor.wait(timeout=30)
            executor_log.close()
        if mock:
            mock[0].shutdown()
            mock[0].server_close()
            mock[1].join(2)
            (acceptance / 'probe-requests.json').write_text(json.dumps(mock[2], indent=2), encoding='utf-8')
        if database.schema_name() != schema or os.environ['DATABASE_URL'] != target:
            raise RuntimeError('Refusing cleanup outside the isolated management acceptance schema')
        with database.connection() as conn:
            conn.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(schema)))
        database.close()


if __name__ == '__main__':
    main()
