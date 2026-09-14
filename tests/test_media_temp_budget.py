"""Media reads must tolerate request-scoped temp cleanup during budget scans."""
import os
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from app.storage import media


def test_completed_directory_disappears_during_scan_without_skipping_siblings(tmp_path, monkeypatch):
    monkeypatch.setenv('MEDIA_TEMP_DIR', str(tmp_path))
    monkeypatch.setenv('MEDIA_TEMP_MAX_BYTES', '12')
    monkeypatch.setattr(media.shutil, 'disk_usage', lambda _: SimpleNamespace(free=1024**3))
    stale = tmp_path / 'op-finished'
    stale.mkdir()
    retained = tmp_path / 'op-active'
    retained.mkdir()
    (retained / 'image.png').write_bytes(b'1234567890')
    original = os.scandir

    def concurrent_cleanup(path):
        if Path(path) == stale and stale.exists():
            stale.rmdir()
        return original(path)

    monkeypatch.setattr(os, 'scandir', concurrent_cleanup)
    media.check_budget(2)
    assert not stale.exists()
    with pytest.raises(HTTPException) as error:
        media.check_budget(3)
    assert error.value.status_code == 507


def test_file_removed_between_scan_and_stat_does_not_break_media_read(tmp_path, monkeypatch):
    monkeypatch.setenv('MEDIA_TEMP_DIR', str(tmp_path))
    monkeypatch.setenv('MEDIA_TEMP_MAX_BYTES', '100')
    source = tmp_path / 'finished.png'
    source.write_bytes(b'123')
    original = Path.stat

    removed = False
    def stat(path, *args, **kwargs):
        nonlocal removed
        if path == source and not removed:
            removed = True
            source.unlink()
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, 'stat', stat)
    media.check_budget(1)
    assert removed


def test_scan_permission_failure_is_not_treated_as_free_space(tmp_path, monkeypatch):
    monkeypatch.setenv('MEDIA_TEMP_DIR', str(tmp_path))
    original = os.scandir

    def denied(path):
        if Path(path) == tmp_path:
            raise PermissionError('unreadable temporary storage')
        return original(path)

    monkeypatch.setattr(os, 'scandir', denied)
    with pytest.raises(PermissionError, match='unreadable'):
        media.check_budget(1)


def test_disk_reserve_still_blocks_materialization(tmp_path, monkeypatch):
    monkeypatch.setenv('MEDIA_TEMP_DIR', str(tmp_path))
    monkeypatch.setenv('MEDIA_TEMP_MAX_BYTES', str(1024**3))
    monkeypatch.setattr(media.shutil, 'disk_usage', lambda _: SimpleNamespace(free=128*1024**2))
    with pytest.raises(HTTPException) as error:
        media.check_budget(1)
    assert error.value.status_code == 507
