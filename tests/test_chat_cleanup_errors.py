"""Deletion failures remain useful without leaking provider diagnostics."""
import pytest
from fastapi import HTTPException
from app.services.chat_attachment_cleanup import failure_reason


@pytest.mark.parametrize('exception,stage,expected', [
    (PermissionError('secret object key'), 'objects', '存储删除权限不足'),
    (HTTPException(403, 'secret bucket'), 'objects', '存储删除权限不足'),
    (HTTPException(409, 'secret version'), 'objects', '对象版本或存储位置校验不通过'),
    (OSError('secret endpoint'), 'objects', '存储暂不可用'),
    (ValueError('secret ledger path'), 'ledger', '删除记录写入失败'),
    (RuntimeError('secret upstream response'), 'objects', '请管理员检查存储服务'),
])
def test_failure_reason_is_categorized_and_redacted(exception, stage, expected):
    result = failure_reason(exception, stage)
    assert expected in result
    assert 'secret' not in result
    assert '后台会自动重试' in result
