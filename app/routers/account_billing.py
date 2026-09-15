from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from app.services.account_billing import report

router = APIRouter()

@router.get('/api/account/billing')
def my_billing(request: Request, workspace: str | None = Query(None, max_length=80),
               from_ms: int = Query(0, ge=0, le=8640000000000000), to_ms: int = Query(0, ge=0, le=8640000000000000),
               canvas_query: str = Query('', max_length=100), page: int = Query(1, ge=1),
               page_size: int = Query(50, ge=1, le=100)):
    actor=request.scope.get('member_principal')
    if actor is None:
        from app.services.authorization import fail
        fail('authentication_required',401)
    data=report(actor, personal=True, workspace=workspace, from_ms=from_ms,to_ms=to_ms,
                canvas_query=canvas_query,page=page,page_size=page_size)
    return JSONResponse(data,headers={'Cache-Control':'private, no-store'})
