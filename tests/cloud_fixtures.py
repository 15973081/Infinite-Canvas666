"""Explicit supplier catalogs for tests that replace paid calls with fakes."""
import pytest


@pytest.fixture
def fake_supplier_catalog(monkeypatch):
    from app.providers import registry

    assert not registry.managed_providers_enabled()
    # Keep production model enforcement active, but do not depend on the
    # developer's provider configuration for these simulated worker tasks.
    monkeypatch.setattr(registry, 'load_api_providers', lambda: [{
        'id': 'comfly', 'name': 'test supplier', 'enabled': True, 'primary': True,
        'base_url': 'https://supplier.test/v1', 'protocol': 'openai',
        'image_models': ['test', 'mock-image'], 'video_models': ['mock-video'],
        'chat_models': [], 'model_prices': [],
    }])
