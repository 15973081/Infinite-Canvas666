from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.services.credit_gifts import _expiry, _input
from app.services.credit_wallet import record_grant


NOW = datetime(2026, 10, 16, 10, tzinfo=timezone.utc)


def gift_input(category='gift', expires_at=None, valid_days=None):
    return _input('recipient', '125', 'approved', 'approval-1', category, expires_at, valid_days)


def test_credit_gift_normalizes_equivalent_time_zones_for_preview_confirmation():
    utc = gift_input('recharge', '2026-10-17T10:00:00Z')
    offset = gift_input('recharge', '2026-10-17T18:00:00+08:00')
    assert utc == offset
    assert _expiry(utc, NOW) == NOW + timedelta(days=1)


def test_credit_gift_relative_expiry_starts_at_issuance():
    data = gift_input(valid_days=7)
    assert _expiry(data, NOW + timedelta(hours=1)) == NOW + timedelta(days=7, hours=1)
    assert _expiry(gift_input(), NOW) is None


@pytest.mark.parametrize('data', [
    {'expires_at': NOW.isoformat()},
    {'expires_at': (NOW - timedelta(days=1)).isoformat()},
    {'valid_days': 10**10},
])
def test_credit_gift_rejects_invalid_expiry(data):
    with pytest.raises(HTTPException) as error:
        _expiry(gift_input(**data), NOW)
    assert error.value.status_code == 400


@pytest.mark.parametrize('value', [NOW.replace(tzinfo=None), '2026-10-17T10:00:00Z'])
def test_record_grant_requires_an_aware_datetime(value):
    with pytest.raises(ValueError, match='invalid_credit_expiry'):
        record_grant(None, 'recipient', source='PLATFORM_GIFT', amount=125, reference='approval-1', expires_at=value)
