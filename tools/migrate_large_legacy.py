"""Resumable parallel media publication followed by the standard legacy importer.

No credentials in arguments. Set STORAGE_ENV_FILE (or exported storage variables).
The caller must supply a stable backup and an existing isolated workspace.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import sqlite3
import sys
import time
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--reports', type=Path, required=True)
    parser.add_argument('--workers', type=int, default=8, choices=range(1, 17))
    parser.add_argument('--phase', choices=['media', 'metadata', 'all'], default='all')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--media-inventory', type=Path, help='Full source dry-run report when metadata is imported from an archive without media')
    args = parser.parse_args()
    from app.storage.settings import load_storage_env, validate
    load_storage_env()
    validate()
    from app.storage import database, media, migration
    from app.storage.workspace import workspace_scope
    source = args.source.resolve()
    reports = args.reports.resolve()
    if not source.is_dir() or reports.is_relative_to(source):
        parser.error('Source must exist and reports must be outside it')
    reports.mkdir(parents=True, exist_ok=True)
    if not args.apply:
        with workspace_scope(args.workspace):
            print(migration.migrate_legacy(source, report_path=reports/'dry-run.json'))
        return
    database.check()
    with database.connection() as conn:
        target = conn.execute("SELECT w.status,m.mode FROM workspaces w JOIN maintenance_controls m ON m.workspace_id=w.id WHERE w.id=%s", (args.workspace,)).fetchone()
        if not target or target['status'] != 'active' or target['mode'] != 'recovering':
            raise RuntimeError('An active, isolated workspace in recovering mode is required')
        source_canvases = [json.loads(p.read_text(encoding='utf-8-sig'))['id'] for p in (source/'data/canvases').glob('*.json')]
        conflicts = conn.execute('SELECT id FROM canvases WHERE workspace_id<>%s AND id=ANY(%s)', (args.workspace,source_canvases)).fetchall()
        if conflicts:
            raise RuntimeError('Canvas ID conflicts require an explicit mapping before import')
    manifest = sqlite3.connect(reports/'transfers.sqlite3')
    manifest.execute('CREATE TABLE IF NOT EXISTS files(ref TEXT PRIMARY KEY,id TEXT,object_key TEXT,version TEXT,size INTEGER,sha256 TEXT,mime TEXT)')
    manifest.execute('CREATE TABLE IF NOT EXISTS failures(ref TEXT PRIMARY KEY,error_type TEXT)')
    if args.phase in {'media','all'}:
        if os.getenv('MIGRATION_REMOTE_SHA256_MANIFEST'):
            # Pure-Python CRC64 on Windows serializes large uploads. These
            # isolated imports instead require a complete server-side SHA-256
            # readback before metadata can be imported or the space opened.
            media.store().client.enable_crc = False
        files = sorted(p for folder in ['assets','output'] for p in (source/folder).rglob('*') if p.is_file())
        total = sum(p.stat().st_size for p in files)
        started = time.monotonic()
        finished = uploaded = 0

        def publish(path):
            if not path.resolve().is_relative_to(source):
                raise ValueError('Media path escapes source')
            ref = '/' + path.relative_to(source).as_posix()
            identity = {'namespace': os.getenv('ASSET_SOURCE_NAMESPACE','local'), 'ref':ref}
            if args.workspace != 'default':
                identity['workspace'] = args.workspace
            aid = 'ast_' + migration.digest(identity)[:32]
            for attempt in range(3):
                try:
                    with workspace_scope(args.workspace):
                        asset = media.publish(path,path.name,legacy_ref=ref,asset_id=aid)
                    return (ref,asset['id'],asset['object_key'],asset['object_version_id'],asset['size_bytes'],asset['sha256'],asset['content_type'])
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(2 ** attempt)

        last = started
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            pending = {pool.submit(publish,p):p for p in files}
            for future in as_completed(pending):
                path = pending[future]
                ref = '/' + path.relative_to(source).as_posix()
                try:
                    row = future.result()
                    manifest.execute('INSERT OR REPLACE INTO files VALUES(?,?,?,?,?,?,?)',row)
                    manifest.execute('DELETE FROM failures WHERE ref=?',(ref,))
                    uploaded += row[4]
                except Exception as exc:
                    manifest.execute('INSERT OR REPLACE INTO failures VALUES(?,?)',(ref,type(exc).__name__))
                finished += 1
                if finished % 20 == 0:
                    manifest.commit()
                if time.monotonic()-last >= 15:
                    state = {'phase':'media','finished':finished,'total':len(files),'ready_bytes':uploaded,'total_bytes':total,'seconds':round(time.monotonic()-started),'failures':manifest.execute('SELECT count(*) FROM failures').fetchone()[0]}
                    (reports/'progress.json').write_text(json.dumps(state),encoding='utf8')
                    print(json.dumps(state),flush=True)
                    last=time.monotonic()
        manifest.commit()
        if manifest.execute('SELECT count(*) FROM failures').fetchone()[0]:
            raise RuntimeError('Media failures recorded; rerun to retry without duplicating ready assets')
    if args.phase in {'metadata','all'}:
        # A private process-local read cache is safe only while this isolated
        # workspace is recovering. Database deletion locks remain authoritative.
        with database.connection() as conn:
            assets={r['id']:r for r in conn.execute('SELECT * FROM assets WHERE workspace_id=%s',(args.workspace,))}
            aliases={r['legacy_ref']:r['asset_id'] for r in conn.execute('SELECT legacy_ref,asset_id FROM asset_aliases WHERE workspace_id=%s AND source_namespace=%s',(args.workspace,os.getenv('ASSET_SOURCE_NAMESPACE','local')))}
        verification = os.getenv('MIGRATION_REMOTE_SHA256_MANIFEST')
        if verification:
            verified = {r['id']:r for line in Path(verification).read_text(encoding='utf8').splitlines() if (r:=json.loads(line))}
            for asset in assets.values():
                v=verified.get(asset['id'])
                if not v or (v['version'],v['size'],v['sha256']) != (asset['object_version_id'],asset['size_bytes'],asset['sha256']):
                    raise RuntimeError('Server-side SHA-256 verification is missing or does not match')
        for folder in ['assets','output']:
            for path in (source/folder).rglob('*'):
                if path.is_file():
                    asset=assets.get(aliases.get('/'+path.relative_to(source).as_posix()))
                    if not asset or asset['status']!='ready' or asset['deleted_at']:
                        raise RuntimeError('Finish media publication before metadata import')

        original_get = media.get_asset
        def cached_get(ref, ready=True):
            direct=media.id_from_ref(ref)
            aid=direct or aliases.get(media.canonical_legacy(ref))
            if not aid:
                return None
            asset=assets.get(aid)
            if asset and (not ready or (asset['status']=='ready' and not asset['deleted_at'])):
                return asset
            return original_get(ref,ready=ready)

        with workspace_scope(args.workspace), patch.object(media,'get_asset',cached_get):
            published = None
            if args.media_inventory:
                published=[]
                for entry in json.loads(args.media_inventory.read_text(encoding='utf8'))['files']:
                    asset=assets.get(aliases.get(entry['legacy_ref']))
                    if not asset or (entry['size'],entry['sha256'])!=(asset['size_bytes'],asset['sha256']):
                        raise RuntimeError('Source media inventory does not match published objects')
                    published.append({**entry,'status':'ready','media_asset_id':asset['id'],'object_key':asset['object_key'],'version':asset['object_version_id']})
            print(migration.migrate_legacy(source,apply=True,report_path=reports/'applied.json',published_files=published),flush=True)
    manifest.close()
    database.close()


if __name__ == '__main__':
    main()
