import pytest
from fastapi import HTTPException
from app.services.chat_context_budget import measure,enforce,normalize_limits


def test_context_budget_counts_utf8_history_framing_and_images(monkeypatch):
    monkeypatch.setenv('CHAT_OUTPUT_RESERVE_TOKENS','100')
    budget=measure({'chat_context_limits':{'test':2048}},'test',[
        {'role':'system','content':'hello'},
        {'role':'user','content':[{'type':'text','text':'中文'},{'type':'image_url','image_url':{'url':'data:image/png;base64,'+'x'*100000}}]}])
    assert budget['estimated_input_tokens']==5+6+128+256+16384
    assert budget['over_limit'] and budget['source']=='model_config' and budget['reserved_output_tokens']==100


def test_context_budget_exact_boundary_and_fallback(monkeypatch):
    monkeypatch.setenv('CHAT_DEFAULT_CONTEXT_TOKENS','1024')
    monkeypatch.setenv('CHAT_OUTPUT_RESERVE_TOKENS','0')
    assert not enforce({},'unknown',[{'content':'x'*(1024-320)}])['over_limit']
    with pytest.raises(HTTPException) as error:
        enforce({},'unknown',[{'content':'x'*(1024-319)}])
    assert error.value.status_code==413 and error.value.detail['code']=='chat_context_over_limit'


@pytest.mark.parametrize('value',[{'m':True},{'m':0},{'m':'1024'},{'m':50000001},[],{'':1024}])
def test_context_budget_config_rejects_invalid_limits(value):
    with pytest.raises(ValueError): normalize_limits(value)
