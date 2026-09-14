"""Resuming a user preview must never bootstrap, migrate, or delete its data."""
import os
import sys
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from tools import workbench_preview


@pytest.mark.parametrize('failure', [None, 'missing', 'version', 'server'])
def test_resume_preserves_existing_schema(tmp_path, monkeypatch, failure):
    from app.storage import database
    from app.services import members
    from app.storage import canvases
    schema = 'workbench_ui_' + 'a' * 32
    directory = tmp_path / '.local/cloud/acceptance' / schema
    directory.mkdir(parents=True)
    env = tmp_path / '.local/cloud/storage.env'
    env.write_text('DATABASE_URL=postgresql://tester@127.0.0.1/dev\n', encoding='utf-8')
    monkeypatch.setenv('STORAGE_ENV_FILE', str(env))
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setattr(workbench_preview, 'ROOT', tmp_path)
    monkeypatch.setattr(workbench_preview, 'prepare_provider_key', Mock())
    monkeypatch.setattr(sys, 'argv', ['preview', '--resume-schema', schema, '--port', '8772'])
    conn = Mock()
    conn.execute.return_value.fetchone.return_value = None if failure == 'missing' else {'exists': 1}
    conn.execute.return_value.fetchall.return_value = [{'id': 'original-space'}]
    @contextmanager
    def connection():
        yield conn
    monkeypatch.setattr(database, 'connection', connection)
    check = Mock(side_effect=RuntimeError('version') if failure == 'version' else None)
    monkeypatch.setattr(database, 'check', check)
    monkeypatch.setattr(database, 'close', Mock())
    for module, name in [(database, 'migrate'), (members, 'bootstrap'), (canvases, 'save')]:
        monkeypatch.setattr(module, name, Mock(side_effect=AssertionError('must not mutate')))
    server = Mock()
    if failure == 'server':
        server.run.side_effect = RuntimeError('server')
    monkeypatch.setitem(sys.modules, 'uvicorn', SimpleNamespace(Server=Mock(return_value=server), Config=Mock()))
    monkeypatch.setitem(sys.modules, 'main', SimpleNamespace(app=object()))
    if failure:
        with pytest.raises(RuntimeError):
            workbench_preview.main()
    else:
        workbench_preview.main()
        server.run.assert_called_once()
    statements = [str(call.args[0]).upper() for call in conn.execute.call_args_list]
    assert statements and all(s.startswith(('SELECT ', 'SET TRANSACTION READ ONLY')) for s in statements)
    assert os.environ['DATABASE_SCHEMA'] == schema
    assert os.environ['OBJECT_STORE_ROOT'] == str(directory / 'objects')
    assert directory.exists()


@pytest.mark.parametrize('schema', ['canvas_cloud', '../workbench_ui_' + 'a' * 32, 'workbench_ui_bad'])
def test_resume_rejects_unrelated_schema(monkeypatch, schema):
    monkeypatch.setattr(sys, 'argv', ['preview', '--resume-schema', schema])
    with pytest.raises(SystemExit) as error:
        workbench_preview.main()
    assert error.value.code == 2


def test_preview_provider_key_persists_and_missing_key_never_reencrypts_existing_credentials(tmp_path, monkeypatch):
    from app.storage import database
    from cryptography.fernet import Fernet
    conn=Mock()
    conn.execute.return_value.fetchone.return_value=None
    @contextmanager
    def connection():yield conn
    monkeypatch.setattr(database,'connection',connection)
    monkeypatch.delenv('PROVIDER_SECRET_KEY',raising=False)
    workbench_preview.prepare_provider_key(tmp_path)
    original=os.environ['PROVIDER_SECRET_KEY']
    ciphertext=Fernet(original.encode()).encrypt(b'preview-secret')
    monkeypatch.delenv('PROVIDER_SECRET_KEY')
    workbench_preview.prepare_provider_key(tmp_path)
    assert Fernet(os.environ['PROVIDER_SECRET_KEY'].encode()).decrypt(ciphertext)==b'preview-secret'
    (tmp_path/'provider-secret.key').unlink()
    monkeypatch.delenv('PROVIDER_SECRET_KEY')
    conn.execute.return_value.fetchone.return_value={'exists':1}
    with pytest.raises(RuntimeError,match='original PROVIDER_SECRET_KEY'):
        workbench_preview.prepare_provider_key(tmp_path)
    assert not (tmp_path/'provider-secret.key').exists()


def test_explicit_preview_provider_key_is_not_replaced_or_written(tmp_path,monkeypatch):
    from cryptography.fernet import Fernet
    key=Fernet.generate_key().decode()
    monkeypatch.setenv('PROVIDER_SECRET_KEY',key)
    workbench_preview.prepare_provider_key(tmp_path)
    assert os.environ['PROVIDER_SECRET_KEY']==key
    assert not (tmp_path/'provider-secret.key').exists()
