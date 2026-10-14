import pytest
from fastapi import HTTPException
from app.services.canvas_audio_voices import normalize


@pytest.mark.parametrize('value', [None, [], {}, {'base_resp': 'bad'}, {'base_resp': {'status_code': 1}}, {'base_resp': {'status_code': 0}, 'system_voice': 'invalid'}])
def test_audio_voice_catalog_rejects_malformed_envelopes(value):
    with pytest.raises(HTTPException) as error:
        normalize(value)
    assert error.value.status_code == 502


def test_audio_voice_catalog_only_uses_explicit_metadata_and_never_accepts_upstream_preview_urls():
    result = normalize({'base_resp': {'status_code': 0}, 'system_voice': [
        {'voice_id': 'Chinese (Mandarin)_Test', 'voice_name': 'Steady executive', 'description': ['Female middle-aged voice'], 'preview_url': 'http://internal/private'},
        {'voice_id': 'English_CalmWoman', 'gender': 'FEMALE', 'age_group': 'ADULT', 'accent': 'ENGLISH_US'},
        {'voice_id': 'English_CalmWoman', 'voice_name': 'duplicate'}, {'voice_id': 'x' * 181}]})
    assert len(result) == 2 and result[0]['language'] == 'Chinese'
    assert result[0]['gender'] == '' and result[0]['age'] == '' and 'preview_url' not in result[0]
    assert result[1]['gender'] == 'FEMALE' and result[1]['age'] == 'ADULT' and result[1]['accent'] == 'ENGLISH_US'
