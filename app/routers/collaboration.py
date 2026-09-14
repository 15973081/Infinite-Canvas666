from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class Acquisition(BaseModel):
    takeover: str = ''
    expected_generation: int | None = None
    confirm: bool = False
    reason: str = ''


class TransferDecision(BaseModel):
    approve: bool
    confirm: bool = False


def identity(request):
    # This protocol is available only through the member gateway.
    from app.storage.settings import member_auth_enabled
    actor = request.scope.get('member_principal')
    if not member_auth_enabled() or actor is None:
        raise HTTPException(403, {'code': 'member_protocol_required'})
    return actor


@router.get('/api/canvases/{canvas_id}/edit-lease')
def state(canvas_id: str, request: Request):
    from app.services.canvas_leases import status
    return status(identity(request), canvas_id)


@router.post('/api/canvases/{canvas_id}/edit-lease/acquire')
def acquire(canvas_id: str, payload: Acquisition, request: Request):
    from app.services.canvas_leases import acquire as claim
    return claim(identity(request), canvas_id, **payload.model_dump())


@router.post('/api/canvases/{canvas_id}/edit-lease/renew')
def renew(canvas_id: str, request: Request):
    from app.services.canvas_leases import renew as heartbeat, proof_from_headers
    return heartbeat(identity(request), canvas_id, proof_from_headers(dict(request.scope['headers'])))


@router.post('/api/canvases/{canvas_id}/edit-lease/release')
def release(canvas_id: str, request: Request):
    from app.services.canvas_leases import release as finish, proof_from_headers
    return finish(identity(request), canvas_id, proof_from_headers(dict(request.scope['headers'])))


@router.get('/api/canvases/{canvas_id}/edit-lease/transfers')
def transfers(canvas_id: str, request: Request):
    from app.services.canvas_leases import transfers as pending
    return pending(identity(request), canvas_id)


@router.post('/api/canvases/{canvas_id}/edit-lease/transfers')
def request_transfer(canvas_id: str, request: Request):
    from app.services.canvas_leases import request_transfer as ask
    return ask(identity(request), canvas_id)


@router.post('/api/canvases/{canvas_id}/edit-lease/transfers/{request_id}')
def resolve_transfer(canvas_id: str, request_id: str, payload: TransferDecision, request: Request):
    from app.services.canvas_leases import resolve_transfer as resolve, proof_from_headers
    return resolve(identity(request), canvas_id, request_id, proof_from_headers(dict(request.scope['headers'])), **payload.model_dump())
