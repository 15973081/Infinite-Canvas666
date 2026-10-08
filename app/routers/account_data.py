from fastapi import APIRouter,Request,HTTPException,Form
from fastapi.responses import JSONResponse,FileResponse
from app.services import account_data
from pydantic import BaseModel,Field

router=APIRouter()


def actor(request):
    value=request.scope.get('member_principal')
    if value is None: raise HTTPException(401,'请使用成员账号登录。')
    return value


@router.get('/api/account/data')
def personal_data(request:Request):
    return JSONResponse(account_data.summary(actor(request)),headers={'Cache-Control':'private, no-store'})


@router.post('/api/account/data/export')
def personal_export(request:Request,member_id:str=Form('',max_length=80)):
    principal=actor(request)
    if member_id and member_id!=principal.member_id: raise HTTPException(409,'登录账号已变化，请重新打开个人数据。')
    path=account_data.export(principal)
    return FileResponse(path,media_type='application/zip',filename='我的对话与附件.zip',headers={'Cache-Control':'private, no-store'})


class ClosureRequest(BaseModel):
    model_config={'extra':'forbid'}
    password:str=Field(min_length=12,max_length=256)
    confirmation:str=Field(max_length=40)


@router.post('/api/account/data/close')
def personal_close(request:Request,payload:ClosureRequest):
    from app.services.account_closure import close
    response=JSONResponse(close(actor(request),payload.password,payload.confirmation),headers={'Cache-Control':'private, no-store'})
    from app.services.member_gateway import COOKIE
    response.delete_cookie(COOKIE,path='/')
    return response
