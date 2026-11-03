"""Member config retains video adapter identity without publishing endpoints."""
import pytest
from app.services.member_gateway import public_provider_config


@pytest.mark.parametrize('protocol,base,expected', [
    ('apimart', 'https://private-proxy.invalid/v1', 'apimart'),
    ('openai', 'https://api.apimart.ai', 'apimart'),
    ('openai', 'https://api.minimax.io', ''),
    ('openai', 'https://other.invalid/apimart.ai', ''),
])
def test_member_config_publishes_safe_video_adapter(monkeypatch, protocol, base, expected):
    monkeypatch.setattr('app.providers.registry.load_api_providers', lambda: [{
        'id': 'custom-platform', 'name': 'Platform', 'protocol': protocol,
        'base_url': base, 'api_key': 'must-not-leak', 'proxy_url': 'must-not-leak',
        'has_key': True, 'video_models': ['MiniMax-H3', 'MiniMax-H3-Max'],
        'model_policies': {'video:MiniMax-H3-Max': {'resolutions': ['480p', '768p', '1080p']}},
    }])
    data = public_provider_config()
    provider = data['api_providers'][0]
    assert provider['video_adapter'] == expected
    assert data['providers'][0] == provider
    assert provider['model_policies']['video:MiniMax-H3-Max']['resolutions'] == ['480p', '768p', '1080p']
    assert not {'protocol', 'base_url', 'api_key', 'proxy_url'} & provider.keys()
    assert 'must-not-leak' not in str(data)
