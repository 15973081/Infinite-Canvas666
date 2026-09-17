"""Implementation of uploads.cleanup: only DB-owned, expired staging objects.

No bucket/prefix sweep and no media/ or backup deletion. Object APIs are shared
by dry-run and apply; only apply claims records and changes persisted state.
"""
from datetime import datetime, timezone, timedelta
import logging
import uuid

from psycopg.types.json import Jsonb
from app.storage import media
from app.storage.database import connection
from app.storage.workspace import current_workspace, workspace_scope

log = logging.getLogger(__name__)
MIN_GRACE = 3600
ROW_SQL = '''SELECT u.*, a.workspace_id AS asset_workspace, a.bucket,
 a.staging_key, a.staging_version_id, a.upload_expires_at, a.status AS asset_status
 FROM media_uploads u JOIN assets a ON a.id=u.asset_id AND a.workspace_id=u.workspace_id'''


class CleanupError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def diagnostic(exc):
    status = getattr(exc, 'status_code', None)
    return {'code': getattr(exc, 'code', None) or ('permission_denied' if status == 403 else type(exc).__name__),
            'status': status, 'request_id': getattr(exc, 'request_id', None),
            # Avoid persisting signed URLs/credentials from SDK exception strings.
            'message': str(exc)[:400] if isinstance(exc, CleanupError) else type(exc).__name__}


def missing(exc, multipart=False):
    codes = {'NoSuchUpload'} if multipart else {'NoSuchKey', 'NoSuchVersion', 'NotFound'}
    return getattr(exc, 'status_code', None) == 404 and getattr(exc, 'code', None) in codes


def validate_row(row, store):
    workspace = current_workspace()
    if row['workspace_id'] != workspace or row['asset_workspace'] != workspace:
        raise CleanupError('workspace_mismatch', 'Upload and asset workspace do not match')
    if not media.ASSET_ID.fullmatch(row['asset_id']):
        raise CleanupError('invalid_asset_id', 'Invalid upload asset id')
    if row['staging_key'] != f"staging/{workspace}/{row['asset_id']}":
        raise CleanupError('staging_key_mismatch', 'Staging key is not the exact DB-owned upload key')
    if row['backend'] != media.media_backend():
        raise CleanupError('backend_mismatch', 'Upload backend differs from current configuration')
    bucket = store.bucket if row['backend'] == 'tos' else 'local-simulation'
    if row['bucket'] != bucket:
        raise CleanupError('bucket_mismatch', 'Upload bucket differs from current configuration')


def safe_after(row, grace):
    # asset/upload expiration was created together; never shorten signed lifetime.
    return max(row['expires_at'], row.get('upload_expires_at') or row['expires_at']) + timedelta(seconds=max(MIN_GRACE, grace))


def waiting_reason(row, grace):
    now = datetime.now(timezone.utc)
    if safe_after(row, grace) >= now: return 'credential_lifetime_and_grace'
    if row.get('lease_until') and row['lease_until'] >= now: return 'active_upload_lease'
    if row.get('cleanup_lease_until') and row['cleanup_lease_until'] >= now: return 'cleanup_in_progress'
    return ''


def exact_versions(store, key, heartbeat=lambda: None):
    """Enumerate all pages but retain only the complete, exact staging key."""
    versions = {}; marker = (None, None); seen = set()
    for _ in range(10000):
        heartbeat()
        page = store.client.list_object_versions(store.bucket, prefix=key, max_keys=1000,
                    key_marker=marker[0], version_id_marker=marker[1])
        for marker_type, entries in ((False, page.versions), (True, page.delete_markers)):
            for entry in entries:
                if entry.key != key: continue
                version = entry.version_id
                if not version or version == 'null':
                    raise CleanupError('missing_version', 'Staging entry has no immutable version id')
                versions[version] = {'key': key, 'version': version, 'delete_marker': marker_type,
                                     'bytes': 0 if marker_type else int(entry.size)}
        if not page.is_truncated: return list(versions.values())
        marker = (page.next_key_marker, page.next_version_id_marker)
        if not marker[0] or marker in seen:
            raise CleanupError('invalid_pagination', 'Version listing did not advance')
        seen.add(marker)
    raise CleanupError('listing_limit', 'Version listing exceeded safety limit')


def version_absent(exc, store, key, version, heartbeat=lambda: None):
    if missing(exc):
        return True
    # HEAD responses have no body; TOS can return 404 with an empty error code.
    # Never infer absence from that alone: a successful, complete version list
    # must independently confirm this exact version is absent. Bucket, access,
    # network and pagination failures propagate instead of becoming success.
    if getattr(exc, 'status_code', None) == 404 and not getattr(exc, 'code', None):
        return not any(item['version'] == version for item in exact_versions(store, key, heartbeat))
    return False


def inventory(row, store, heartbeat=lambda: None):
    validate_row(row, store)
    key = row['staging_key']
    if row['backend'] == 'tos':
        values = exact_versions(store, key, heartbeat)
        recorded = row['staging_version_id']
        if recorded and recorded != 'null' and not any(v['version'] == recorded for v in values):
            heartbeat()
            try:
                head = store.client.head_object(store.bucket, key, version_id=recorded)
            except Exception as exc:
                if not version_absent(exc, store, key, recorded, heartbeat): raise
            else:
                values.append({'key': key, 'version': recorded, 'delete_marker': False, 'bytes': head.content_length})
        if recorded == 'null':
            raise CleanupError('missing_version', 'Recorded staging version is null')
        # Recorded version is attempted first; markers are removed after data.
        return sorted(values, key=lambda v: (v['delete_marker'], v['version'] != recorded, v['version']))
    # Local simulator uses private per-version files, including abandoned parts.
    root = store.path(key + '/source', '0' * 32).parent.parent
    values = []
    if root.exists():
        for path in root.rglob('*'):
            if path.is_symlink(): raise CleanupError('unsafe_path', 'Symlink in upload staging')
            if not path.is_file(): continue
            relative = path.relative_to(store.root)
            object_key = relative.parent.as_posix()
            if store.path(object_key, path.name) != path.resolve():
                raise CleanupError('unsafe_path', 'Staging file escaped private root')
            values.append({'key': object_key, 'version': path.name, 'delete_marker': False, 'bytes': path.stat().st_size})
    return values


def clean_objects(row, store, report, heartbeat=lambda: None):
    validate_row(row, store)
    values = inventory(row, store, heartbeat)
    report['objects'] = values
    # Multipart completion and in-flight PUT credentials are fenced by expiry,
    # grace and the claimed/aborted DB status before this point.
    if row['backend'] == 'tos' and row['upload_id']:
        heartbeat()
        try:
            store.client.abort_multipart_upload(store.bucket, row['staging_key'], row['upload_id'])
        except Exception as exc:
            if not missing(exc, multipart=True): raise
        report['multipart_aborted_or_absent'] = True
    for value in values:
        heartbeat()
        if row['backend'] == 'tos':
            try:
                store.client.delete_object(store.bucket, value['key'], version_id=value['version'])
            except Exception as exc:
                if not missing(exc): raise
            if not value['delete_marker']:
                try:
                    store.client.head_object(store.bucket, value['key'], version_id=value['version'])
                except Exception as exc:
                    if not version_absent(exc, store, value['key'], value['version'], heartbeat): raise
                else:
                    raise CleanupError('version_still_present', 'Deleted data version is still readable')
        else:
            store.path(value['key'], value['version']).unlink(missing_ok=True)
        report['deleted'].append(value)
        report['bytes'] += value['bytes']
    if inventory(row, store, heartbeat):
        raise CleanupError('versions_remaining', 'Exact staging key still has versions or delete markers')
    if row['backend'] == 'filesystem':
        root = store.path(row['staging_key'] + '/source', '0' * 32).parent.parent
        if root.exists():
            for directory in sorted((p for p in root.rglob('*') if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
                directory.rmdir()
            root.rmdir()


def process(asset_id, grace, apply):
    token = uuid.uuid4()
    report = {'asset_id': asset_id, 'workspace': current_workspace(), 'deleted': [], 'bytes': 0}
    claimed = False
    try:
        store = media.store()
        with connection() as conn:
            suffix = ' FOR UPDATE OF u' if apply else ''
            row = conn.execute(ROW_SQL + ' WHERE u.workspace_id=%s AND u.asset_id=%s' + suffix,
                               (current_workspace(), asset_id)).fetchone()
            if not row: raise CleanupError('upload_missing', 'No upload in selected workspace')
            report.update(bucket=row['bucket'], key=row['staging_key'], recorded_version=row['staging_version_id'],
                          asset_status=row['asset_status'], safe_after=safe_after(row, grace).isoformat())
            if row['cleaned_at']: return {**report, 'state': 'complete', 'reason': 'already_cleaned'}
            validate_row(row, store)
            reason = waiting_reason(row, grace)
            if reason: return {**report, 'state': 'pending', 'reason': reason}
            if apply:
                conn.execute("UPDATE media_uploads SET cleanup_state='running',cleanup_token=%s,cleanup_lease_until=now()+interval '10 minutes',"
                             "cleanup_attempted_at=now(),cleanup_attempts=cleanup_attempts+1,cleanup_error=NULL,"
                             "status=CASE WHEN status='ready' THEN status ELSE 'aborted' END "
                             "WHERE workspace_id=%s AND asset_id=%s", (token, current_workspace(), asset_id))
                # Freeze expired verifiers without changing historical deleted assets.
                conn.execute("UPDATE assets SET status='failed',updated_at=now() WHERE workspace_id=%s AND id=%s AND status IN ('uploading','verifying')",
                             (current_workspace(), asset_id))
                claimed = True
        if not apply:
            report['objects'] = inventory(row, store)
            report['candidate_bytes'] = sum(v['bytes'] for v in report['objects'])
            return {**report, 'state': 'candidate', 'reason': 'expired_credentials_no_active_lease', 'multipart_upload_id': row['upload_id']}

        def heartbeat():
            with connection() as conn:
                if not conn.execute("UPDATE media_uploads SET cleanup_lease_until=now()+interval '10 minutes' "
                                    "WHERE workspace_id=%s AND asset_id=%s AND cleanup_token=%s AND cleanup_lease_until>now() RETURNING asset_id",
                                    (current_workspace(), asset_id, token)).fetchone():
                    raise CleanupError('cleanup_lease_lost', 'Cleanup lease expired or was replaced')

        clean_objects(row, store, report, heartbeat)
        state = 'complete'
    except Exception as exc:
        state = 'failed'; report['error'] = diagnostic(exc)
        log.warning('Upload staging cleanup failed workspace=%s asset=%s error=%s', current_workspace(), asset_id, report['error'])
        if apply and not claimed:
            # Configuration/ownership failures must also remain diagnosable,
            # without aborting a live upload or stealing another cleaner's lease.
            try:
                with connection() as conn:
                    conn.execute("UPDATE media_uploads SET cleanup_state='failed',cleanup_error=%s,cleanup_report=%s,"
                        "cleanup_attempted_at=now(),cleanup_attempts=cleanup_attempts+1 WHERE workspace_id=%s AND asset_id=%s "
                        "AND cleaned_at IS NULL AND expires_at<now()-make_interval(secs=>%s) "
                        "AND (lease_until IS NULL OR lease_until<now()) AND (cleanup_lease_until IS NULL OR cleanup_lease_until<now())",
                        (Jsonb(report['error']), Jsonb(report), current_workspace(), asset_id, grace))
            except Exception:
                log.exception('Could not persist staging cleanup failure asset=%s', asset_id)
    if claimed:
        try:
            with connection() as conn:
                updated = conn.execute("UPDATE media_uploads SET cleanup_state=%s,cleanup_error=%s,cleanup_report=%s,"
                    "cleanup_bytes=cleanup_bytes+%s,cleaned_at=CASE WHEN %s='complete' THEN now() ELSE NULL END,"
                    "cleanup_token=NULL,cleanup_lease_until=NULL WHERE workspace_id=%s AND asset_id=%s AND cleanup_token=%s RETURNING asset_id",
                    (state, Jsonb(report.get('error')), Jsonb(report), report['bytes'], state, current_workspace(), asset_id, token)).fetchone()
                if not updated: raise CleanupError('cleanup_lease_lost', 'Cleanup result no longer owns record')
        except Exception as exc:
            state = 'failed'; report['error'] = diagnostic(exc)
    return {**report, 'state': state}


def cleanup(grace_seconds=3600, *, all_workspaces=False, apply=False, asset_ids=None, limit=200):
    if grace_seconds < MIN_GRACE: raise ValueError('Cleanup grace must be at least 3600 seconds')
    if not 1 <= limit <= 1000: raise ValueError('Cleanup batch limit must be 1..1000')
    if asset_ids and any(not media.ASSET_ID.fullmatch(a) for a in asset_ids): raise ValueError('Invalid asset ID')
    if asset_ids is not None and not asset_ids: raise ValueError('Explicit asset selection must not be empty')
    # HTTP retains its space; all_workspaces is only reachable from maintenance CLI.
    with connection() as conn:
        query = 'SELECT workspace_id,asset_id FROM media_uploads WHERE cleaned_at IS NULL'
        args = []
        if not all_workspaces: query += ' AND workspace_id=%s'; args.append(current_workspace())
        if asset_ids: query += ' AND asset_id=ANY(%s)'; args.append(list(asset_ids))
        else:
            query += " AND expires_at<now()-make_interval(secs=>%s) AND (lease_until IS NULL OR lease_until<now()) AND (cleanup_lease_until IS NULL OR cleanup_lease_until<now())"
            args.append(grace_seconds)
            query += " AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.id=media_uploads.asset_id AND a.upload_expires_at>=now()-make_interval(secs=>%s))"
            args.append(grace_seconds)
        query += ' ORDER BY cleanup_attempted_at NULLS FIRST,expires_at,asset_id LIMIT %s'; args.append(limit)
        rows = conn.execute(query, tuple(args)).fetchall()
        count_query = 'SELECT count(*) AS pending,count(*) FILTER (WHERE cleanup_state=\'failed\') AS failed FROM media_uploads WHERE cleaned_at IS NULL'
        count_args = []
        if not all_workspaces: count_query += ' AND workspace_id=%s'; count_args.append(current_workspace())
        if asset_ids: count_query += ' AND asset_id=ANY(%s)'; count_args.append(list(asset_ids))
        counts = conn.execute(count_query, tuple(count_args)).fetchone()
    results = []
    for row in rows:
        with workspace_scope(row['workspace_id']):
            results.append(process(row['asset_id'], grace_seconds, apply))
    with connection() as conn:
        remaining = conn.execute(count_query, tuple(count_args)).fetchone()
    return {'apply': apply, 'pending_before': counts['pending'], 'failed_before': counts['failed'],
            'remaining': remaining['pending'], 'failed_total': remaining['failed'],
            'examined': len(results), 'completed': sum(r['state']=='complete' for r in results),
            'pending': sum(r['state']=='pending' for r in results), 'failed': sum(r['state']=='failed' for r in results),
            'candidate_bytes': sum(r.get('candidate_bytes', 0) for r in results),
            'cleaned_bytes': sum(r['bytes'] for r in results), 'items': results}
