"""Measured whole-second durations for immutable video assets and task results."""
import math
from pathlib import Path

from fastapi import HTTPException
from psycopg.types.json import Jsonb


def seconds(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        value = float(value)
    except ValueError:
        return None
    return max(1, math.ceil(value)) if math.isfinite(value) and value > 0 else None


def probe(path):
    from app.services.media import probe_video_duration
    return seconds(probe_video_duration(str(path)))


def asset_seconds(conn, ref, *, required=True):
    from app.storage import media
    asset = media.get_asset(ref)
    duration = None
    if asset and asset['kind'] == 'video':
        duration = seconds((asset.get('metadata') or {}).get('duration_seconds'))
        if duration is None:
            storage = media.store()
            path = storage.path(asset['object_key'], asset['object_version_id']) if isinstance(storage, media.FilesystemStore) else None
            if path and Path(path).is_file():
                duration = probe(path)
                if duration is not None:
                    conn.execute('UPDATE assets SET metadata=metadata || %s WHERE id=%s AND workspace_id=%s',
                                 (Jsonb({'duration_seconds': duration}), asset['id'], asset['workspace_id']))
    if duration is None and required:
        raise HTTPException(400, {'code': 'credit_input_video_duration_required',
            'message': '无法确定输入视频时长，请将可读取的视频重新上传至当前空间后提交。'})
    return duration


def output_seconds(result):
    return (seconds((result.get('video_info') or {}).get('duration'))
            or seconds(result.get('mediakit_duration')) or seconds(result.get('duration_seconds')))


def complete_result(result):
    from app.storage import database, media
    if output_seconds(result) is not None:
        return result
    with database.connection() as conn:
        durations = []
        for url in result.get('videos', []):
            duration = asset_seconds(conn, url, required=False)
            if duration is None:
                path = media.materialize(url)
                duration = probe(path) if path else None
                if duration is not None:
                    asset = media.get_asset(url)
                    conn.execute('UPDATE assets SET metadata=metadata || %s WHERE id=%s AND workspace_id=%s',
                                 (Jsonb({'duration_seconds':duration}), asset['id'], asset['workspace_id']))
            durations.append(duration)
    if durations and all(n is not None for n in durations):
        result['duration_seconds'] = max(durations)
        result['video_info'] = {**(result.get('video_info') or {}), 'duration': max(durations), 'duration_source': 'file_probe'}
    return result
