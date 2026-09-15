import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import json
from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch
import pytest
from fastapi import HTTPException
from cryptography.fernet import Fernet
from app.services import database_control as d

CONFIG=dict(name='Test',host='db.example.test',hostaddr='',port=5432,database='canvans',username='test-user',schema_name='canvas_cloud',ca_pem='TEST CERT')
ACTOR=SimpleNamespace(audience='management',member_id='admin')

@pytest.mark.parametrize('host',['https://example.test','db.test user=x','db.test/service','db.test?password=x','db.test,evil.test','db.test'])
def test_rejects_invalid_host(host):
    with pytest.raises(HTTPException):
        d.normalize(dict(CONFIG,host=host))

def test_workbench_denied():
    with pytest.raises(HTTPException):
        d.require(Mock(),SimpleNamespace(audience='workbench'))

def test_platform_permission_required():
    with patch.object(d.az,'require') as require:
        d.require(Mock(),ACTOR)
        assert require.call_args.args[2]=='maintenance.platform'

def test_certificate_must_parse():
    with pytest.raises(HTTPException):
        d.normalize(CONFIG)

def test_public_hides_ciphertext():
    row=dict(id='one',config=CONFIG,secret_ciphertext='hidden',version=1,updated_at=datetime.now(timezone.utc))
    assert 'hidden' not in json.dumps(d.public(row))

def test_probe_uses_verified_tls_and_readonly_queries():
    with patch.object(d.psycopg,'connect') as connect:
        remote=connect.return_value.__enter__.return_value
        remote.execute.return_value.fetchone.side_effect=[(True,'TLSv1.3'),('canvans','test-user','16.8'),(43,)]
        result=d.test_connection(CONFIG,'sensitive')
        kwargs=connect.call_args.kwargs
        assert kwargs['sslmode']=='verify-full'
        assert 'default_transaction_read_only=on' in kwargs['options']
        assert kwargs['password']=='sensitive'
        assert result['tables']==43
        assert not Path(kwargs['sslrootcert']).exists()
        assert all(c.args[0].startswith('SELECT') for c in remote.execute.call_args_list)

def test_crud_version_checks_and_secret_preservation():
    conn=Mock()
    key=Fernet(Fernet.generate_key())
    @contextmanager
    def transaction():
        yield conn
    row=dict(id='one',config=CONFIG,secret_ciphertext=key.encrypt(b'original').decode(),version=1,updated_at=datetime.now(timezone.utc))
    with patch.object(d.az,'policy_transaction',transaction),patch.object(d,'require'),patch.object(d,'normalize',return_value=CONFIG),patch.object(d,'cipher',return_value=key),patch.object(d.az,'audit'):
        conn.execute.return_value.fetchone.side_effect=[row,dict(row,version=2)]
        d.save(ACTOR,dict(CONFIG,password='',expected_version=1),'one')
        assert conn.execute.call_args.args[1][1]==row['secret_ciphertext']
        conn.execute.return_value.fetchone.side_effect=[row]
        with pytest.raises(HTTPException) as exc:
            d.remove(ACTOR,'one',2)
        assert exc.value.status_code==409
        conn.execute.return_value.fetchone.side_effect=[row]
        assert d.remove(ACTOR,'one',1)=={'deleted':True}

def test_probe_failure_is_sanitized():
    conn=Mock()
    key=Fernet(Fernet.generate_key())
    @contextmanager
    def transaction():
        yield conn
    row=dict(config=CONFIG,version=1,secret_ciphertext=key.encrypt(b'secret-password').decode())
    conn.execute.return_value.fetchone.side_effect=[row,dict(version=1)]
    with patch.object(d.az,'policy_transaction',transaction),patch.object(d,'require'),patch.object(d,'normalize',return_value=CONFIG),patch.object(d,'cipher',return_value=key),patch.object(d.az,'audit'),patch.object(d,'test_connection',side_effect=RuntimeError('secret-password')):
        result=d.probe(ACTOR,'one',1)
        assert result['state']=='failed'
        assert 'secret-password' not in json.dumps(result)
