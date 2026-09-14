"""Password/error boundaries of the operator CLI; no production dependencies."""
import io
import json
from types import SimpleNamespace
import warnings

import pytest
from tools import maintenance_recovery as cli

BASE=['status','--storage-env','unused.env','--database','test','--schema','canvas_cloud','--platform','--username','operator']


def test_rejected_command_arguments_never_echo_accidental_password(capsys):
    assert cli.main([*BASE,'--password','do-not-echo-this-secret'])==2
    output=capsys.readouterr()
    assert 'do-not-echo' not in output.out+output.err
    assert json.loads(output.err)['code']=='invalid_cli_arguments'


def test_reopen_requires_explicit_confirmation_and_status_disallows_change_options():
    with pytest.raises(cli.RecoveryError):
        cli.arguments(['reopen',*BASE[1:],'--expected-version','1','--reason','checked'])
    with pytest.raises(cli.RecoveryError):
        cli.arguments([*BASE,'--confirm-recovery'])
    args=cli.arguments(['reopen',*BASE[1:],'--expected-version','1','--reason','checked','--confirm-recovery'])
    assert args.confirm_recovery and args.expected_version==1


def test_password_stdin_preserves_spaces_and_rejects_oversized_input(monkeypatch):
    monkeypatch.setattr(cli.sys,'stdin',io.StringIO(' password with spaces \n'))
    assert cli.password_input(SimpleNamespace(password_stdin=True))==' password with spaces '
    monkeypatch.setattr(cli.sys,'stdin',io.StringIO('x'*257+'\n'))
    with pytest.raises(cli.RecoveryError) as denied:
        cli.password_input(SimpleNamespace(password_stdin=True))
    assert denied.value.code=='invalid_credentials'


def test_password_prompt_never_falls_back_to_echoed_stdin(monkeypatch):
    def no_terminal(*args):
        warnings.warn('terminal unavailable',cli.getpass.GetPassWarning)
        raise AssertionError('echo fallback must not run')
    monkeypatch.setattr(cli.getpass,'getpass',no_terminal)
    with pytest.raises(cli.RecoveryError) as denied:
        cli.password_input(SimpleNamespace(password_stdin=False))
    assert denied.value.code=='secure_password_input_unavailable'


def test_dependency_failure_has_no_traceback_connection_string_or_password(monkeypatch,capsys):
    def fail(args):
        raise RuntimeError('postgresql://operator:private-password@database/internal')
    monkeypatch.setattr(cli,'configure',fail)
    assert cli.main(BASE)==5
    output=capsys.readouterr()
    assert output.out==''
    assert json.loads(output.err)=={'ok':False,'code':'maintenance_dependency_unavailable_check_status'}
