import json
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import httpx
import pytest
from fastapi import HTTPException
from fastapi.responses import Response
from app.services import chat_billing, chat_credits, credit_wallet
from app.storage import database
from test_cloud_chat_billing import chat_world, operator, world, headers, configure, mock_upstream, TOKEN, USAGE, result

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


@pytest.fixture
def funded(chat_world, monkeypatch):
    w = chat_world
    monkeypatch.setattr(chat_credits, 'bindings', lambda: {'providers': {
        w['payload']['provider']: {'deepseek-test': 'GEMINI_31_PRO'}}, 'models': {}})
    configure(w, TOKEN)
    with database.connection() as conn:
        credit_wallet.record_grant(conn, w['people'][0]['id'], source='PLATFORM_GIFT', amount=100,
                                   reference=uuid.uuid4().hex)
    return w


def records(w):
    with database.connection() as conn:
        return conn.execute('''SELECT c.*,h.id AS hold_id,h.status AS credit_status,h.frozen_credits,
            h.settled_credits,h.released_credits FROM ai_chat_calls c JOIN credit_holds h
            ON h.source_type='chat_call' AND h.source_id=c.id WHERE c.member_id=%s ORDER BY c.started_at''',
            (w['people'][0]['id'],)).fetchall()


@pytest.mark.parametrize('path', ['/api/chat', '/api/chat/stream'])
def test_chat_delivered_message_and_spend_commit_together(funded, monkeypatch, path):
    w = funded
    calls = mock_upstream(monkeypatch)
    real = credit_wallet.settle_credits
    def settle(conn, hold_id, amount, **kw):
        row = conn.execute("SELECT source_id FROM credit_holds WHERE id=%s", (hold_id,)).fetchone()
        assert conn.execute('''SELECT 1 FROM workspace_documents d, jsonb_array_elements(d.value->'messages') m
            WHERE d.kind='conversation' AND m->>'chat_call_id'=%s AND m->>'role'='assistant'
            AND length(trim(m->>'content'))>0''', (row['source_id'],)).fetchone()
        return real(conn, hold_id, amount, **kw)
    with patch.object(credit_wallet, 'settle_credits', side_effect=settle):
        response = w['editor'].post(path, headers={**headers(w['a']), 'X-User-ID': w['people'][1]['id']}, json=w['payload'])
    data = result(response, path)
    call = records(w)[0]
    assert (call['status'], call['credit_status'], call['settled_credits']) == ('succeeded', 'SETTLED', 4)
    assert call['member_id'] == w['people'][0]['id'] and len(calls) == 1
    assert data['message']['cost']['amount_micros'] == 5700
    assert chat_billing.finish({'workspace': call['workspace_id'], 'id': call['id']}, USAGE, 'succeeded', delivered=True)
    with database.connection() as conn:
        assert conn.execute('SELECT count(*) n FROM credit_transactions WHERE hold_id=%s', (call['hold_id'],)).fetchone()['n'] == 1
    assert w['editor'].get('/api/account/tasks').json()['entries'][0]['credit_settled'] == '4'
    assert w['editor'].get('/api/account/billing').json()['entries'][0]['credit_status'] == 'SETTLED'
    assert w['viewer'].get('/api/account/tasks').json()['records'] == 0


@pytest.mark.parametrize('path', ['/api/chat', '/api/chat/stream'])
def test_insufficient_chat_credit_leaves_no_call_history_or_upstream(funded, monkeypatch, path):
    w = funded
    with database.connection() as conn:
        conn.execute('UPDATE credit_wallets SET gift_balance=1 WHERE member_id=%s', (w['people'][0]['id'],))
        conn.execute('UPDATE credit_grants SET remaining_amount=1 WHERE member_id=%s', (w['people'][0]['id'],))
    calls = mock_upstream(monkeypatch)
    response = w['editor'].post(path, headers=headers(w['a']), json=w['payload'])
    assert response.status_code == 402 and response.json()['detail'] == {
        'code': 'insufficient_credits', 'available_balance': 1, 'required_credits': 4}
    assert not calls and not records(w)
    with database.connection() as conn:
        assert not conn.execute('SELECT 1 FROM ai_chat_calls WHERE member_id=%s', (w['people'][0]['id'],)).fetchone()
        assert not conn.execute("SELECT 1 FROM workspace_documents WHERE kind='conversation' AND workspace_id=%s", (w['a']['id'],)).fetchone()


@pytest.mark.parametrize('path', ['/api/chat', '/api/chat/stream'])
@pytest.mark.parametrize('failure', ['save', 'settle'])
@pytest.mark.parametrize('price,expected', [(TOKEN, '5700'),
    ({'kind': 'chat', 'model': 'deepseek-test', 'billing_type': 'per_call', 'unit_price': '0.2'}, '200000')])
def test_delivery_failure_rolls_back_assistant_and_releases_credit(funded, monkeypatch, path, failure, price, expected):
    from app.routers import chat
    w = funded
    configure(w, price)
    mock_upstream(monkeypatch)
    save = chat.save_conversation
    def failed_save(user_id, conversation):
        save(user_id, conversation)
        if conversation['messages'][-1]['role'] == 'assistant':
            raise HTTPException(503, '保存失败')
    if failure == 'save':
        monkeypatch.setattr(chat, 'save_conversation', failed_save)
    else:
        real_settle = credit_wallet.settle_credits
        def failed_spend(conn, hold_id=None, actual_credits=None, **kw):
            if actual_credits:
                raise HTTPException(503, '结算失败')
            return real_settle(conn, hold_id, actual_credits, **kw)
        monkeypatch.setattr(credit_wallet, 'settle_credits', failed_spend)
    response = w['editor'].post(path, headers=headers(w['a']), json=w['payload'])
    assert response.status_code == (200 if path.endswith('stream') else 503)
    call = records(w)[0]
    assert (call['status'], call['credit_status'], call['released_credits']) == ('uncertain', 'RELEASED', 4)
    with database.connection() as conn:
        doc = conn.execute("SELECT value FROM workspace_documents WHERE kind='conversation' AND workspace_id=%s", (w['a']['id'],)).fetchone()['value']
        assert [m['role'] for m in doc['messages']] == ['user']
        assert not conn.execute('SELECT 1 FROM credit_transactions WHERE hold_id=%s', (call['hold_id'],)).fetchone()
    assert w['editor'].get('/api/account/billing').json()['entries'][0]['amount_micros'] == expected


@pytest.mark.parametrize('scenario', ['truncated', 'timeout', 'rejected'])
def test_stream_failure_releases_even_with_token_cost(funded, monkeypatch, scenario):
    w = funded
    calls = mock_upstream(monkeypatch, complete=scenario != 'truncated', timeout=scenario == 'timeout', status=429 if scenario == 'rejected' else 200)
    response = w['editor'].post('/api/chat/stream', headers=headers(w['a']), json=w['payload'])
    assert '"type": "done"' not in response.text
    call = records(w)[0]
    assert call['credit_status'] == 'RELEASED' and call['released_credits'] == 4 and len(calls) == 1
    if scenario == 'truncated':
        assert w['editor'].get('/api/account/billing').json()['entries'][0]['amount_micros'] == '5700'


@pytest.mark.parametrize('path', ['/api/chat', '/api/chat/stream'])
def test_empty_reply_releases_without_assistant_history(funded, monkeypatch, path):
    from app.routers import chat
    w = funded
    monkeypatch.setattr(chat, 'text_from_chat_response', lambda raw: '')
    monkeypatch.setattr(chat, 'text_delta_from_chat_chunk', lambda raw: '')
    response = w['editor'].post(path, headers=headers(w['a']), json=w['payload'])
    assert response.status_code == (200 if path.endswith('stream') else 502)
    assert records(w)[0]['credit_status'] == 'RELEASED'


def test_unstarted_generator_pending_recovery_is_bounded_and_idempotent(funded, monkeypatch):
    from app.routers import chat
    from app.config import AI_REQUEST_TIMEOUT
    w = funded
    generators = []
    def unstarted(generator, **kw):
        generators.append(generator)
        return Response(status_code=204)
    monkeypatch.setattr(chat, 'StreamingResponse', unstarted)
    assert w['editor'].post('/api/chat/stream', headers=headers(w['a']), json=w['payload']).status_code == 204
    call = records(w)[0]
    assert call['status'] == 'pending' and call['credit_status'] == 'FROZEN' and not w['calls']
    assert w['editor'].get('/api/account/tasks', params={'status': 'pending'}).json()['entries'][0]['credit_frozen'] == '4'
    assert chat_billing.recover_pending(now=call['started_at'] + 1000) == 0
    expired = call['started_at'] + int((AI_REQUEST_TIMEOUT + 121) * 1000)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: chat_billing.recover_pending(now=expired), range(2)))
    call = records(w)[0]
    assert call['status'] == 'uncertain' and call['credit_status'] == 'RELEASED'
    assert chat_billing.recover_pending(now=expired) == 0
    assert w['editor'].get('/api/account/tasks').json()['entries'][0]['credit_released'] == '4'


@pytest.mark.parametrize('path', ['/api/chat', '/api/chat/stream'])
def test_total_request_deadline_releases_chat_hold(funded, monkeypatch, path):
    import asyncio
    from app.routers import chat
    w = funded
    from test_cloud_chat_billing import CLIENT
    async def slow(request):
        await asyncio.sleep(.1)
        return httpx.Response(200, json={'choices': [{'message': {'content': 'late'}}]})
    monkeypatch.setattr(chat, 'AI_REQUEST_TIMEOUT', .01)
    monkeypatch.setattr(chat.httpx, 'AsyncClient', lambda **kw: CLIENT(**kw, transport=httpx.MockTransport(slow)))
    response = w['editor'].post(path, headers=headers(w['a']), json=w['payload'])
    assert response.status_code == (200 if path.endswith('stream') else 504)
    assert records(w)[0]['credit_status'] == 'RELEASED'
