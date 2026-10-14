"""Batch preview uses the same server price scopes/discounts, never a client bill."""
from app.services.canvas_batch import estimate


def provider(prices,discounts=()):
    return {'id':'p','model_prices':prices,'model_discounts':list(discounts)}


def test_image_estimate_counts_each_requested_image_and_discount():
    price={'kind':'image','model':'m','billing_type':'per_image','unit_price':'.05','currency':'CNY','resolution':'1k'}
    p=provider([price],[{'kind':'image','model':'m','rate':'.8','effective_from':0,'effective_to':0}])
    assert estimate('image',{'model':'m','size':'1024x1024','n':3},p)=={'status':'estimated','currency':'CNY','amount_micros':120000,'base_amount_micros':150000}
    assert estimate('image',{'model':'m','size':'4096x4096','n':3},p)=={'status':'unknown'}


def test_video_estimate_uses_duration_and_input_scope():
    p=provider([{'kind':'video','model':'m','billing_type':'per_second','unit_price':'.3','currency':'CNY','has_video_input':True}])
    assert estimate('video',{'model':'m','duration':5,'videos':['owned-video']},p)['amount_micros']==1500000
    assert estimate('video',{'model':'m','duration':5,'videos':[]},p)=={'status':'unknown'}


def test_audio_characters_are_an_estimate_and_music_model_uses_per_call():
    p=provider([{'kind':'audio','model':'speech','billing_type':'per_10k_characters','unit_price':'1','currency':'CNY'},
                {'kind':'audio','model':'music','billing_type':'per_call','unit_price':'.7','currency':'CNY'}])
    assert estimate('audio',{'model':'speech','prompt':'配音内容'},p)=={'status':'estimated','currency':'CNY','amount_micros':400,'base_amount_micros':400}
    assert estimate('audio',{'model':'music','prompt':'音乐'},p)['amount_micros']==700000


def test_chat_token_usage_remains_unknown_and_disabled_is_explicitly_zero():
    p=provider([{'kind':'chat','model':'tokens','billing_type':'per_million_tokens','input_price':'1','output_price':'2'},
                {'kind':'chat','model':'off','billing_type':'disabled'},
                {'kind':'model','model':'3d','billing_type':'per_call','unit_price':'12','currency':'CNY'}])
    assert estimate('llm',{'model':'tokens','message':'hello'},p)=={'status':'unknown'}
    assert estimate('llm',{'model':'off','message':'hello'},p)['amount_micros']==0
    assert estimate('model',{'model':'3d'},p)['amount_micros']==12000000
