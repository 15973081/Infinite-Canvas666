import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import json
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import Mock, patch
import pytest
from fastapi import HTTPException
from cryptography.fernet import Fernet
from app.services import storage_control as s

CONFIG = dict(bucket='canvas-media', region='cn-beijing', internal_endpoint='https://tos-cn-beijing.volces.com', public_endpoint='https://tos-cn-beijing.volces.com')
ACTOR = SimpleNamespace(audience='management', member_id='admin')

@pytest.mark.parametrize('host', ['http://tos-cn-beijing.volces.com', 'https://evil.test', 'https://tos-cn-beijing.volces.com@evil.test', 'https://127.0.0.1', 'https://tos-cn-beijing.volces.com/?key=x', 'https://tos-cn-shanghai.volces.com'])
def test_endpoint_rejects_credential_exfiltration(host):
    with pytest.raises(HTTPException):
        s.normalize(dict(CONFIG, internal_endpoint=host))

def test_public_endpoint_cannot_be_internal():
    with pytest.raises(HTTPException):
        s.normalize(dict(CONFIG, public_endpoint='https://tos-cn-beijing.ivolces.com'))

def test_private_endpoint_supported():
    assert s.normalize(dict(CONFIG, internal_endpoint='tos-cn-beijing.ivolces.com'))['internal_endpoint'].startswith('https://')

def test_public_view_never_contains_credentials():
    result = s.public(dict(config=CONFIG, version=1, secret_ciphertext='secret'))
    assert 'secret' not in json.dumps(result)

def test_workbench_cannot_configure_storage():
    with pytest.raises(HTTPException):
        s.require(Mock(), SimpleNamespace(audience='workbench'))

def test_platform_permission_required():
    with patch.object(s.az, 'require') as require:
        s.require(Mock(), ACTOR)
        assert require.call_args.args[2] == 'maintenance.platform'

def test_probe_unknown_does_not_leak_sdk_exception():
    with patch('tos.TosClientV2') as constructor:
        client = constructor.return_value
        client.head_bucket.side_effect = RuntimeError('AK=secret URL=signed')
        client.get_bucket_version.return_value.status = 'Suspended'
        client.get_bucket_acl.return_value.grants = []
        result = s.probe_config(CONFIG, dict(access_key="ak", secret_key="sk"))
        assert result[0]['state'] == 'unknown'
        assert result[1]['state'] == 'fail'
        assert result[2]['state'] == 'pass'
        assert result[3]['state'] == 'unknown'
        assert 'secret' not in json.dumps(result)
        client.close.assert_called_once()

def test_save_encrypted_and_conflicts():
    conn = Mock()
    key = Fernet(Fernet.generate_key())
    @contextmanager
    def transaction():
        yield conn
    payload = dict(CONFIG, access_key='ak-test', secret_key='sk-test', expected_version=0)
    row = dict(config=CONFIG, version=1, secret_ciphertext='encrypted')
    conn.execute.return_value.fetchone.side_effect = [None, row]
    with patch.object(s.az, 'policy_transaction', transaction), patch.object(s, 'require'), patch.object(s, 'cipher', return_value=key), patch.object(s.az, 'audit'):
        result = s.save(ACTOR, payload)
        encrypted = conn.execute.call_args.args[1][1]
        assert json.loads(key.decrypt(encrypted.encode()))['secret_key'] == 'sk-test'
        assert 'sk-test' not in json.dumps(result)
        conn.execute.return_value.fetchone.side_effect = [row]
        with pytest.raises(HTTPException) as exc:
            s.save(ACTOR, payload)
        assert exc.value.status_code == 409
