"""Task-local storage scope. Binding selects data; it does not grant access.

HTTP callers must first authorize membership; workers bind the workspace from
their persisted task. Never bind a browser's unverified workspace header here.
Legacy shared mode retains default until the member entry is integrated.
"""
from contextlib import contextmanager
from contextvars import ContextVar
import os
import re

_workspace = ContextVar('storage_workspace', default=None)


def current_workspace():
    value = _workspace.get()
    if value is None:
        if os.getenv('AUTH_MODE', 'shared') == 'members':
            raise RuntimeError('Member-mode storage requires an explicit authorized workspace')
        return 'default'
    return value


@contextmanager
def workspace_scope(workspace):
    if not isinstance(workspace, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', workspace):
        raise ValueError('Invalid workspace identifier')
    token = _workspace.set(workspace)
    try:
        yield workspace
    finally:
        _workspace.reset(token)
