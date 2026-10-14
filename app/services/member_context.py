"""Verified request identity, propagated through async and thread-pool calls."""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(frozen=True)
class Access:
    principal: object
    workspace: str
    actions: tuple
    operation: str = 'read'
    resource_id: str | None = None
    edit_proof: object = None


current_access = ContextVar('member_request_access', default=None)


@contextmanager
def access_scope(principal, workspace, actions, operation='read', resource_id=None, edit_proof=None):
    token = current_access.set(Access(principal, workspace, tuple(actions), operation, resource_id, edit_proof))
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
    from app.services.maintenance_control import ensure
    ensure(conn, access.workspace, access.operation, access.resource_id)
    if access.operation in {'canvas.write','canvas.finish'} or 'canvas.create' in access.actions or (
            access.operation=='write' and access.actions==('canvas.edit',)):
        from app.storage.canvas_directory import lock
        lock(conn)
    if access.resource_id and access.operation in {'canvas.write', 'canvas.finish'}:
        from app.services.canvas_leases import request_write
        request_write(conn, access.resource_id)
