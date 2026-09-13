"""Verified request identity, propagated through async and thread-pool calls."""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(frozen=True)
class Access:
    principal: object
    workspace: str
    actions: tuple


current_access = ContextVar('member_request_access', default=None)


@contextmanager
def access_scope(principal, workspace, actions):
    token = current_access.set(Access(principal, workspace, tuple(actions)))
    try:
        yield
    finally:
        current_access.reset(token)


def check_storage_access(conn):
    access = current_access.get()
    if access is None:
        return
    from app.services import authorization as az
    from app.storage.workspace import current_workspace
    if current_workspace() != access.workspace:
        az.fail('workspace_context_changed')
    conn.execute('SELECT pg_advisory_xact_lock_shared(%s)', (az.AUTH_LOCK,))
    for action in access.actions:
        az.require(conn, access.principal, action, access.workspace)
