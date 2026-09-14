from unittest.mock import patch

from app.providers.registry import httpx_provider_kwargs


def test_managed_transport_uses_only_configured_proxy():
    provider = {'id': 'team', 'protocol': 'openai', 'proxy_url': ''}
    with patch('app.providers.registry.managed_providers_enabled', return_value=True):
        assert httpx_provider_kwargs(provider) == {'trust_env': False}
        assert httpx_provider_kwargs({**provider, 'proxy_url': 'http://127.0.0.1:8123'}) == {
            'proxy': 'http://127.0.0.1:8123', 'trust_env': False}
    with patch('app.providers.registry.managed_providers_enabled', return_value=False):
        assert httpx_provider_kwargs(provider) == {}
