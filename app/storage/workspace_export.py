"""Snapshot-consistent shared workspace export, separate from a database backup.

Includes retained/deleted shared data and fixed object versions. Deliberately
excludes private conversations, identities/sessions, supplier configuration,
internal task checkpoints and live execution state. It cannot restore a DB.
"""
import json
import os
from pathlib import Path
import shutil
import time

from psycopg import sql
from app.storage import backup, database, media
from app.storage.settings import media_backend

TABLES = ('canvases','assets','asset_aliases','canvas_assets','workspace_documents',
          'ledger_entries','ledger_aliases','ledger_conflicts','ledger_imports','ledger_versions')
DOCUMENT_KINDS = ('canvas_folders','asset_library','prompt_libraries','shared_folders','canvas_backup','skill_library')
ASSET_FILTER = "role<>'task-result-source'"


def export(directory, workspace):
    directory = Path(directory)
    directory.mkdir(parents=True,exist_ok=False)
    counts, files = {}, {}
    with database.connection() as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
        conn.execute("SET LOCAL idle_in_transaction_session_timeout='10min'")
        if not conn.execute('SELECT 1 FROM workspaces WHERE id=%s',(workspace,)).fetchone():
            raise ValueError('Workspace not found')
        for table in TABLES:
            conditions, args = 'workspace_id=%s', [workspace]
            if table == 'assets':
                conditions += ' AND ' + ASSET_FILTER
            elif table in ('asset_aliases','canvas_assets'):
                conditions += ' AND asset_id IN (SELECT id FROM assets WHERE workspace_id=%s AND '+ASSET_FILTER+')'
                args.append(workspace)
            elif table == 'workspace_documents':
                conditions += ' AND kind=ANY(%s)'
                args.append(list(DOCUMENT_KINDS))
            elif table == 'ledger_entries':
                # Personal chat billing includes private conversation titles.
                conditions += " AND source<>'chat'"
            count = 0
            with conn.cursor(name='export_'+table) as cursor, (directory/(table+'.jsonl')).open('x',encoding='utf-8',newline='\n') as target:
                cursor.execute(sql.SQL('SELECT * FROM {} WHERE '+conditions).format(sql.Identifier(table)),args)
                for row in cursor:
                    target.write(json.dumps(row,ensure_ascii=False,default=str,separators=(',',':'))+'\n')
                    count += 1
            counts[table] = count
    # Immutable versions allow object copying after releasing the DB snapshot.
    store = media.store()
    objects = directory/'objects'
    objects.mkdir()
    object_count, object_bytes, unfinished = 0, 0, 0
    with (directory/'assets.jsonl').open(encoding='utf-8') as source, (directory/'objects.jsonl').open('x',encoding='utf-8',newline='\n') as index:
        for position,line in enumerate(source):
            asset = json.loads(line)
            if asset['status'] != 'ready':
                unfinished += 1
                continue
            if not asset['object_version_id'] or not asset['sha256']:
                raise ValueError('Ready object lacks fixed version')
            if shutil.disk_usage(directory).free < asset['size_bytes']+128*1024**2:
                raise OSError('Insufficient disk space')
            name = f'{position:08d}.blob'
            target = objects/name
            store.download(asset,target)
            if backup.digest(target) != (asset['size_bytes'],asset['sha256']):
                raise ValueError('Object checksum mismatch')
            index.write(json.dumps({'asset_id':asset['id'],'file':name,'size':asset['size_bytes'],'sha256':asset['sha256']})+'\n')
            object_count += 1
            object_bytes += asset['size_bytes']
    for name in [*(table+'.jsonl' for table in TABLES),'objects.jsonl']:
        size, sha = backup.digest(directory/name)
        files[name] = {'size':size,'sha256':sha}
    manifest = {'format':'workspace-shared-export-v1','workspace_id':workspace,'created_at':time.time(),
                'media_backend':media_backend(),'counts':counts,'files':files,
                'object_count':object_count,'object_bytes':object_bytes,'unfinished_assets':unfinished,
                'document_kinds':list(DOCUMENT_KINDS),
                'excluded':['private_conversations','private_chat_billing','identity_and_sessions','provider_configuration',
                            'task_execution_and_checkpoints','unfinished_upload_bytes'],
                'restore':'Shared-data export only; database disaster recovery requires a platform backup.'}
    pending = directory/'manifest.pending'
    pending.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    # Publish a completion marker only after every checksum has passed.
    os.link(pending,directory/'manifest.json')
    return manifest


def verify(directory):
    directory = Path(directory).resolve()
    def local(name):
        path = directory/name
        if path.is_symlink() or not path.resolve().is_relative_to(directory):
            raise ValueError('Export path escaped bundle')
        return path
    manifest = json.loads(local('manifest.json').read_text(encoding='utf-8'))
    expected = {table+'.jsonl' for table in TABLES}|{'objects.jsonl'}
    if manifest.get('format') != 'workspace-shared-export-v1' or set(manifest['files']) != expected:
        raise ValueError('Invalid workspace export manifest')
    for name,info in manifest['files'].items():
        if backup.digest(local(name)) != (info['size'],info['sha256']):
            raise ValueError('Export checksum mismatch')
    for table in TABLES:
        count = 0
        with local(table+'.jsonl').open(encoding='utf-8') as source:
            for line in source:
                row = json.loads(line)
                if row['workspace_id'] != manifest['workspace_id']:
                    raise ValueError('Cross-workspace export row')
                count += 1
        if count != manifest['counts'][table]:
            raise ValueError('Export row count mismatch')
    count, size, seen = 0, 0, set()
    import re
    with local('objects.jsonl').open(encoding='utf-8') as index:
        for line in index:
            item=json.loads(line)
            if not re.fullmatch(r'[0-9]{8,}\.blob',item['file']) or item['file'] in seen:
                raise ValueError('Invalid export object name')
            seen.add(item['file'])
            if backup.digest(local('objects/'+item['file'])) != (item['size'],item['sha256']):
                raise ValueError('Export object checksum mismatch')
            count += 1
            size += item['size']
    if count != manifest['object_count'] or size != manifest['object_bytes']:
        raise ValueError('Export object count mismatch')
    return manifest
