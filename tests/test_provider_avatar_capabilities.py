"""Exercise the member projection without decrypting or exposing provider credentials."""
from contextlib import contextmanager

import pytest

from app.providers import registry
from app.services import member_gateway, provider_control
from app.storage.workspace import workspace_scope, current_workspace


@pytest.fixture
def catalog(monkeypatch):
    rows = []

    class Connection:
        def execute(self, query, params):
            assert 'g.workspace_id=%s' in query
            assert params == (current_workspace(),)
            return rows if current_workspace() == 'assigned' else []

    @contextmanager
    def transaction():
        yield Connection()

    monkeypatch.setattr(provider_control.az, 'policy_transaction', transaction)
    monkeypatch.setattr(provider_control, 'recovery_provider', lambda conn: None)
    monkeypatch.setattr(registry, 'managed_providers_enabled', lambda: True)

    def no_decrypt(*args):
        raise AssertionError('The public projection must not decrypt credentials')

    monkeypatch.setattr(provider_control, 'decrypt', no_decrypt)
    return rows


@pytest.mark.parametrize('pid,protocol,base,fields,platform,ready', [
    ('volcengine', 'volcengine', 'https://ark.cn-beijing.volces.com', ['api_key','volcengine_access_key_id','volcengine_secret_access_key'], 'volcengine', True),
    ('volcengine', 'volcengine', '', ['api_key'], 'volcengine', False),
    ('custom-ark', 'volcengine', '', ['volcengine_access_key_id','volcengine_secret_access_key'], 'volcengine', True),
    ('custom-ark', 'volcengine', '', ['volcengine_access_key_id'], 'volcengine', False),
    ('custom-apimart', 'apimart', '', ['api_key'], 'apimart', True),
    ('by-host', 'openai', 'https://api.apimart.ai', [], 'apimart', False),
    ('unsupported', 'openai', 'https://other.invalid', ['api_key'], '', False),
])
def test_member_response_has_explicit_safe_capability(catalog, pid, protocol, base, fields, platform, ready):
    config = dict(id=pid, name='Provider', protocol=protocol, base_url=base, enabled=True,
                  image_models=['image-model'], video_models=['video-model'], proxy_url='https://private.invalid',
                  key_preview='must-not-leak', secret_ciphertext='must-not-leak')
    catalog.append(dict(config=config, secret_fields=fields, primary=True))
    with workspace_scope('assigned'):
        data = member_gateway.public_provider_config()
    provider = data['providers'][0]
    assert provider['avatar_registration'] == dict(platform=platform, supported=bool(platform), credentials_configured=ready)
    assert provider['has_key'] == ('api_key' in fields)
    assert not {'protocol','base_url','proxy_url','key_preview','secret_ciphertext','secret_fields'} & provider.keys()
    assert 'must-not-leak' not in str(data)
    assert data['image_models'] == ['image-model']
    with workspace_scope('unassigned'):
        assert member_gateway.public_provider_config()['providers'] == []


def test_revoked_credentials_are_reflected_on_next_read(catalog):
    catalog.append(dict(config={'id':'volcengine','protocol':'volcengine','enabled':True}, primary=False,
                        secret_fields=['volcengine_access_key_id','volcengine_secret_access_key']))
    with workspace_scope('assigned'):
        assert member_gateway.public_provider_config()['providers'][0]['avatar_registration']['credentials_configured']
        catalog[0]['secret_fields'].remove('volcengine_secret_access_key')
        capability = member_gateway.public_provider_config()['providers'][0]['avatar_registration']
        assert capability['supported'] and not capability['credentials_configured']


@pytest.mark.parametrize('project', ['seedance-companyA', 'default', ''])
def test_member_response_preserves_registration_project_without_credentials(catalog, project):
    catalog.append(dict(config={
        'id': 'volcengine', 'protocol': 'volcengine', 'enabled': True,
        'volcengine_project_name': project,
        'volcengine_access_key_id': 'must-not-leak',
        'volcengine_secret_access_key': 'must-not-leak',
    }, primary=True, secret_fields=['volcengine_access_key_id', 'volcengine_secret_access_key']))
    with workspace_scope('assigned'):
        data = member_gateway.public_provider_config()
    assert data['providers'][0]['volcengine_project_name'] == project
    assert data['api_providers'][0]['volcengine_project_name'] == project
    assert 'must-not-leak' not in str(data)
    with workspace_scope('unassigned'):
        assert member_gateway.public_provider_config()['providers'] == []
