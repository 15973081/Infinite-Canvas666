from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from app.services.credit_wallet import report

router = APIRouter()


@router.get('/api/account/credits')
def my_credits(request: Request, category: str = Query('', max_length=20),
               page: int = Query(1, ge=1, le=2147483647), page_size: int = Query(25, ge=1, le=100)):
    data = report(request.scope.get('member_principal'), category=category, page=page, page_size=page_size)
    return JSONResponse(data, headers={'Cache-Control': 'private, no-store'})
