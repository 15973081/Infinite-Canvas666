"""Run one persistent delivery service from explicit configuration. Never bootstrap or delete data."""
import argparse
import asyncio
import os
from pathlib import Path
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('service', choices=['workbench', 'management', 'worker'])
    parser.add_argument('--env', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--schema', required=True)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int)
    parser.add_argument('--stop-file', required=True)
    args = parser.parse_args()
    stop = Path(args.stop_file).resolve()
    if stop.exists():
        parser.error('Stop file exists; remove it after confirming the previous service has exited')
    if args.service != 'worker' and (args.port is None or not 1024 <= args.port <= 65535):
        parser.error('HTTP service requires --port between 1024 and 65535')
    os.environ['STORAGE_ENV_FILE'] = str(Path(args.env).resolve())
    from app.storage.settings import load_storage_env, validate
    load_storage_env()
    validate()
    if os.getenv('DATABASE_BACKEND') != 'postgres' or os.getenv('AUTH_MODE') != 'members':
        parser.error('Delivery requires PostgreSQL member mode')
    os.environ['CLOUD_EMBEDDED_WORKER'] = 'false'
    if not os.getenv('PROVIDER_SECRET_KEY'):
        key_file = os.getenv('PROVIDER_SECRET_KEY_FILE')
        if not key_file:
            parser.error('Configure PROVIDER_SECRET_KEY_FILE or PROVIDER_SECRET_KEY')
        os.environ['PROVIDER_SECRET_KEY'] = Path(key_file).read_text(encoding='ascii').strip()
    from cryptography.fernet import Fernet
    Fernet(os.environ['PROVIDER_SECRET_KEY'].encode('ascii'))
    from app.storage import database
    try:
        with database.connection() as conn:
            target = conn.execute('SELECT current_database() AS database,current_schema() AS schema').fetchone()
            if target != {'database': args.database, 'schema': args.schema}:
                parser.error('Database or schema does not match the explicit delivery target')
        database.check()
        stop.parent.mkdir(parents=True, exist_ok=True)
        if args.service == 'worker':
            from app.storage import worker

            async def work():
                handle = worker.start()
                try:
                    while not stop.exists():
                        await asyncio.sleep(.25)
                finally:
                    await worker.shutdown(handle)
            asyncio.run(work())
        else:
            if args.service == 'management':
                from tools.build_management import build
                destination = os.getenv('MANAGEMENT_STATIC_DIR')
                if not destination:
                    parser.error('Configure MANAGEMENT_STATIC_DIR for the delivery artifact')
                build(destination)
            import uvicorn
            server = uvicorn.Server(uvicorn.Config(
                'management_main:app' if args.service == 'management' else 'main:app',
                host=args.host, port=args.port, log_level='warning'))
            finished = threading.Event()

            def watch():
                while not finished.wait(.25):
                    if stop.exists():
                        server.should_exit = True
                        return
            watcher = threading.Thread(target=watch, daemon=True)
            watcher.start()
            try:
                server.run()
            finally:
                finished.set()
                watcher.join(2)
    finally:
        database.close()


if __name__ == '__main__':
    main()
