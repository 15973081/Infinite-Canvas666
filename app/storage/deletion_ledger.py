"""Durable deletion records outside the database snapshot being restored.

Use a separate persistent volume shared by every instance. No raw document text,
original filenames or model input is written here.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import uuid

from fastapi import HTTPException
from app.storage.workspace import current_workspace


def directory():
    configured=os.getenv('DELETION_LEDGER_ROOT')
    if configured: return Path(configured).resolve()
    if os.getenv('MEDIA_BACKEND','filesystem')=='tos':
        raise HTTPException(503,'请配置独立持久化 DELETION_LEDGER_ROOT 后再管理私有附件。')
    objects=Path(os.environ['OBJECT_STORE_ROOT']).resolve()
    suffix=hashlib.sha256(str(objects).encode()).hexdigest()[:16]
    return objects.parent/('chat-deletion-ledger-'+suffix)


def _atomic(path,data):
    temp=path.parent/('.pending-'+uuid.uuid4().hex)
    try:
        with os.fdopen(os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as stream:
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        try: os.link(temp,path)
        except FileExistsError: pass
        if os.name!='nt':
            fd=os.open(path.parent,os.O_RDONLY)
            try: os.fsync(fd)
            finally: os.close(fd)
    finally: temp.unlink(missing_ok=True)


def identity(root=None,create=False):
    root=Path(root or directory()).resolve()
    if create:
        root.mkdir(parents=True,exist_ok=True)
        if not (root/'.ledger-id').exists() and (any(root.glob('*.json')) or any(root.glob('*.deny'))):
            raise ValueError('Deletion ledger identity lost; refusing to replace existing ledger')
        _atomic(root/'.ledger-id',str(uuid.uuid4()).encode())
    path=root/'.ledger-id'
    if path.is_symlink() or not path.is_file(): raise ValueError('Deletion ledger identity is missing')
    value=path.read_text().strip()
    if str(uuid.UUID(value))!=value: raise ValueError('Invalid deletion ledger identity')
    return {'version':1,'identity':value,'directory':str(root)}


def key(workspace,asset_id):
    return hashlib.sha256((workspace+'/'+asset_id).encode()).hexdigest()


def validate(record):
    if isinstance(record,dict) and record.get('kind') in {'conversation','skill','account'}:
        kind=record['kind']
        allowed={'version','kind','owner_id','objects'}|({'attachments'} if kind=='account' else {'workspace_id','document_id'} if kind=='conversation' else {'workspace_id','skill_id'})
        if set(record)-allowed: raise ValueError('Unexpected deletion ledger fields')
        if record.get('version')!=1 or not isinstance(record.get('owner_id'),str) or record.get('objects')!=[]:
            raise ValueError('Invalid deletion ledger record')
        if kind=='account':
            if not re.fullmatch(r'member_[a-f0-9]{32}',record['owner_id']) or not isinstance(record.get('attachments'),list):
                raise ValueError('Invalid account deletion record')
            for attachment in record['attachments']:
                validate(attachment)
                if attachment['kind']!='attachment' or attachment['owner_id']!=record['owner_id']:
                    raise ValueError('Invalid account attachment owner')
        else:
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',record.get('workspace_id','')):
                raise ValueError('Invalid deletion workspace')
            if kind=='conversation' and (not re.fullmatch(r'member_[a-f0-9]{32}',record['owner_id'])
                or not record.get('document_id','').startswith(record['owner_id']+'/') or record['document_id'].count('/')!=1
                or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',record['document_id'].split('/')[-1])):
                raise ValueError('Invalid conversation deletion record')
            if kind=='skill' and not re.fullmatch(r'skl_[a-f0-9]{32}',record.get('skill_id','')):
                raise ValueError('Invalid skill deletion record')
        return record
    if (not isinstance(record,dict) or record.get('version')!=1 or record.get('kind')!='attachment'
        or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',record.get('workspace_id',''))
        or not re.fullmatch(r'ast_[a-f0-9]{32}',record.get('asset_id',''))
        or not isinstance(record.get('owner_id'),str) or not record['owner_id']
        or not isinstance(record.get('objects'),list) or not record['objects']):
        raise ValueError('Invalid deletion ledger record')
    if set(record)-{'version','kind','workspace_id','asset_id','owner_id','objects'}:
        raise ValueError('Unexpected deletion ledger fields')
    ids=set()
    for asset in record['objects']:
        if not isinstance(asset,dict): raise ValueError('Invalid deletion ledger object')
        if set(asset)-{'id','workspace_id','bucket','object_key','object_version_id','unpublished'}:
            raise ValueError('Unexpected deletion object fields')
        asset_id=asset.get('id','')
        if (not re.fullmatch(r'ast_[a-f0-9]{32}',asset_id) or asset_id in ids
            or asset.get('workspace_id')!=record['workspace_id']
            or not isinstance(asset.get('object_key'),str)
            or not asset['object_key'].startswith('media/'+record['workspace_id']+'/'+asset_id+'/')
            or not isinstance(asset.get('bucket'),str)
            or (not asset.get('object_version_id') and not asset.get('unpublished'))):
            raise ValueError('Invalid deletion ledger object')
        ids.add(asset_id)
    if record['asset_id'] not in ids: raise ValueError('Deletion root missing from record')
    return record


def record_key(record):
    if record['kind']=='attachment': return key(record['workspace_id'],record['asset_id'])
    value=record['owner_id'] if record['kind']=='account' else record.get('document_id') or record['skill_id']
    return record['kind']+'-'+key(record.get('workspace_id',''),value)


def write_record(record):
    root=directory(); identity(root,create=True)
    validate(record)
    data=json.dumps(record,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
    if len(data)>8*1024**2: raise HTTPException(413,'删除记录过大，请联系管理员完成数据清理。')
    path=root/(record_key(record)+'.json')
    _atomic(path,data)
    if path.is_symlink() or path.read_bytes()!=data: raise ValueError('Deletion ledger record conflict')
    for asset in record['objects']:
        _atomic(root/(key(record['workspace_id'],asset['id'])+'.deny'),path.name.encode())


def write(job):
    write_record({'version':1,'kind':'attachment','workspace_id':job['workspace_id'],
                  'asset_id':job['asset_id'],'owner_id':job['owner_id'],'objects':job['objects']})


def member_blocked(owner):
    return (directory()/('account-'+key('',owner)+'.json')).exists()


def document_blocked(workspace,document_id):
    owner=document_id.split('/')[0]
    return member_blocked(owner) or (directory()/('conversation-'+key(workspace,document_id)+'.json')).exists()


def skill_blocked(workspace,skill_id):
    return (directory()/('skill-'+key(workspace,skill_id)+'.json')).exists()


def blocked(asset):
    root=directory()
    workspace=asset.get('workspace_id') or current_workspace()
    marker=root/(key(workspace,asset['id'])+'.deny')
    owner=(asset.get('metadata') or {}).get('chat_owner')
    return marker.exists() or (root/(key(workspace,asset['id'])+'.json')).exists() or bool(owner and member_blocked(owner))


def load(descriptor,override=None):
    if not isinstance(descriptor,dict) or descriptor.get('version')!=1:
        raise ValueError('Backup has no supported deletion ledger descriptor')
    root=Path(override or descriptor['directory']).resolve()
    actual=identity(root)
    if actual['identity']!=descriptor.get('identity'): raise ValueError('Deletion ledger identity mismatch')
    records=[]
    for path in sorted(root.glob('*.json')):
        if path.is_symlink() or path.stat().st_size>8*1024**2:
            raise ValueError('Unsafe deletion ledger record')
        record=validate(json.loads(path.read_text(encoding='utf-8')))
        if path.stem!=record_key(record): raise ValueError('Deletion record identity mismatch')
        records.append(record)
        if record['kind']=='account': records.extend(record['attachments'])
    unique={}
    for record in records:
        name=record_key(record)
        if name in unique and unique[name]!=record: raise ValueError('Conflicting deletion ledger snapshots')
        unique[name]=record
    return actual,list(unique.values())


def prune_restored_objects(root,manifest,records):
    from app.storage.media import FilesystemStore
    storage=FilesystemStore(root)
    assets={asset['id']:asset for asset in manifest['objects']}
    removed=0
    for record in records:
        for snapshot in record['objects']:
            asset=assets.get(snapshot['id'])
            if not asset or asset['status']!='ready': continue
            if (asset['object_key']!=snapshot['object_key'] or asset['bucket']!=snapshot['bucket']
                or (snapshot.get('object_version_id') and asset['object_version_id']!=snapshot['object_version_id'])):
                raise ValueError('Restored deletion object identity mismatch')
            path=storage.path(asset['object_key'],asset['object_version_id'])
            if path.exists(): path.unlink(); removed+=1
    return removed
