import pytest

from app.services.credit_wallet import CreditWalletError, _credits, _settlement_parts


@pytest.mark.parametrize('value', [True, False, -1, 1.5, '10', None, 9223372036854775808])
def test_credit_consumption_rejects_non_integer_or_out_of_range_amounts(value):
    with pytest.raises(CreditWalletError, match='invalid_credit_amount'):
        _credits(value, allow_zero=True)


def test_credit_consumption_zero_is_only_a_settlement_amount():
    with pytest.raises(CreditWalletError):
        _credits(0)
    _credits(0, allow_zero=True)


@pytest.mark.parametrize('actual,spent,released', [
    (0, [0, 0, 0, 0], [20, 30, 25, 25]),
    (10, [10, 0, 0, 0], [10, 30, 25, 25]),
    (50, [20, 30, 0, 0], [0, 0, 25, 25]),
    (60, [20, 30, 10, 0], [0, 0, 15, 25]),
    (100, [20, 30, 25, 25], [0, 0, 0, 0]),
])
def test_credit_consumption_fifo_prefix_and_reverse_release(actual, spent, released):
    allocations = [{'frozen_amount': n} for n in [20, 30, 25, 25]]
    parts = _settlement_parts(allocations, actual)
    assert [s for _, s, _ in parts] == spent
    assert [r for _, _, r in parts] == released
    assert sum(spent) == actual and sum(released) == 100 - actual


def test_credit_consumption_incomplete_allocations_are_not_silently_settled():
    with pytest.raises(CreditWalletError, match='credit_allocation_mismatch'):
        _settlement_parts([{'frozen_amount': 5}], 6)
