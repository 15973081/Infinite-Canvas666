"""Real local preview decoding and immutable filesystem object paths."""
import os
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image
from app.services import assets
from app.storage.media import FilesystemStore


@pytest.mark.parametrize('duration', ['0.1', '0.5', '1'])
@pytest.mark.parametrize('size', ['480x270', '270x480'])
def test_video_preview_decodes_short_and_regular_limited_range_clips(tmp_path, duration, size):
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        pytest.skip('Real video preview test requires ffmpeg')
    source = tmp_path / 'limited.mp4'
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
                    'color=c=blue:s=' + size + ':d=' + duration, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(source)],
                   check=True, capture_output=True, timeout=20)
    before = source.read_bytes()
    with assets.generate_video_preview_image(str(source), 160) as image:
        assert image.mode == 'RGB'
        assert image.size == ((160, 90) if size == '480x270' else (90, 160))
        red, green, blue = image.getpixel((40, 40))
        assert blue > 220 and red < 30 and green < 30
    assert source.read_bytes() == before
    assert list(tmp_path.iterdir()) == [source]


def test_decode_failure_is_reported_once_with_bounded_diagnostic(monkeypatch):
    calls = []
    monkeypatch.setattr(assets.shutil, 'which', lambda _: 'ffmpeg')
    def fail(*args, **kwargs):
        calls.append(args)
        return SimpleNamespace(returncode=1, stdout=b'', stderr=b'decode failed' + b'x' * 400)
    monkeypatch.setattr(assets.subprocess, 'run', fail)
    with pytest.raises(RuntimeError, match='decode failed') as error:
        assets.generate_video_preview_image('broken.mp4', 160)
    assert len(calls) == 1
    assert len(str(error.value)) == 300


def test_no_video_frame_tries_start_then_returns_clear_error(monkeypatch):
    calls = []
    monkeypatch.setattr(assets.shutil, 'which', lambda _: 'ffmpeg')
    def empty(command, **kwargs):
        calls.append(command[command.index('-ss') + 1])
        return SimpleNamespace(returncode=0, stdout=b'', stderr=b'')
    monkeypatch.setattr(assets.subprocess, 'run', empty)
    with pytest.raises(RuntimeError, match='没有可供预览'):
        assets.generate_video_preview_image('audio-only.mp4', 160)
    assert calls == ['0.5', '0']


def test_missing_video_decoder_is_explicit(monkeypatch):
    monkeypatch.setattr(assets.shutil, 'which', lambda _: None)
    with pytest.raises(RuntimeError, match='未找到 ffmpeg'):
        assets.generate_video_preview_image('clip.mp4', 160)


def test_long_object_paths_roundtrip_concurrent_fixed_versions(tmp_path, monkeypatch):
    # The old code fails at target.open('xb') on Windows although mkdir succeeds.
    root = tmp_path / ('object-root-' + 'a' * 80)
    monkeypatch.setenv('OBJECT_STORE_ROOT', str(root))
    store = FilesystemStore()
    key = 'media/space_' + 'a' * 32 + '/ast_' + 'b' * 32 + '/' + 'c' * 32 + '.webp'
    original = tmp_path / 'original.bin'
    original.write_bytes(b'original preview bytes')
    assert len(str(root / key / ('0' * 32))) > 260
    with ThreadPoolExecutor(4) as pool:
        versions = list(pool.map(lambda _: store.put(key, original, 'image/webp'), range(8)))
    assert len(set(versions)) == 8
    reopened = FilesystemStore(str(root))
    for version in versions:
        target = reopened.path(key, version)
        assert target.read_bytes() == original.read_bytes()
        with pytest.raises(FileExistsError):
            target.open('xb')
        output = tmp_path / (version + '.bin')
        reopened.download({'object_key': key, 'object_version_id': version, 'size_bytes': original.stat().st_size}, output)
        assert output.read_bytes() == original.read_bytes()
    if os.name == 'nt':
        # Extended roots supplied by backup restore must not be prefixed twice.
        assert FilesystemStore(store.root).path(key, versions[0]) == store.path(key, versions[0])


def test_object_path_validation_remains_confined_with_extended_roots(tmp_path):
    store = FilesystemStore(tmp_path / 'objects')
    for key in ['../escape', 'folder/../../escape', '/absolute', 'C:/escape', 'key?query']:
        with pytest.raises(ValueError):
            store.path(key, 'a' * 32)
    for version in ['../escape', 'a' * 31, 'A' * 32]:
        with pytest.raises(ValueError):
            store.path('valid/key', version)


def test_long_object_versions_restore_from_verified_offline_bundle(tmp_path):
    import json
    from app.storage import backup
    source = tmp_path / 'snapshot.dump'
    source.write_bytes(b'opaque database dump')
    objects = source.with_suffix('.objects')
    objects.mkdir()
    blob = objects / '00000000.blob'
    blob.write_bytes(b'immutable source object')
    size, checksum = backup.digest(blob)
    dump_size, dump_hash = backup.digest(source)
    key = 'media/space_' + 'a' * 32 + '/ast_' + 'b' * 32 + '/' + 'c' * 32 + '.webp'
    manifest = {'format_version': 2, 'database_dump': source.name, 'objects_directory': objects.name,
                'database_size_bytes': dump_size, 'database_sha256': dump_hash, 'media_backend': 'filesystem',
                'objects': [{'id': 'ast_' + 'b' * 32, 'bucket': 'local-simulation', 'object_key': key,
                             'object_version_id': 'd' * 32, 'size_bytes': size, 'sha256': checksum,
                             'status': 'ready', 'backup_file': blob.name}]}
    source.with_suffix('.objects.json').write_text(json.dumps(manifest), encoding='utf-8')
    parent = tmp_path / ('restore-parent-' + 'r' * 60)
    target = parent / 'objects'
    receipt = backup.restore_objects(source, target)
    assert receipt['objects'] == 1 and receipt['object_bytes'] == size
    assert FilesystemStore(target).path(key, 'd' * 32).read_bytes() == blob.read_bytes()
    assert not list(parent.glob('.restore-*'))
    with pytest.raises(ValueError, match='must not exist'):
        backup.restore_objects(source, target)
