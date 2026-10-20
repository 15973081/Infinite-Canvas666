"""Routes mounted only on the independent management origin."""
from typing import Literal
from fastapi import APIRouter, Request, Query
from pydantic import BaseModel, ConfigDict, Field
from app.services import tenants, account_email
from app.management.application import actor, session

router=APIRouter()
class Input(BaseModel):
    model_config=ConfigDict(extra='forbid')
class TenantCreate(Input):
    name:str=Field(min_length=1,max_length=80)
    administrator:str=Field(min_length=1,max_length=64)
class TenantUpdate(Input):
    name:str=Field(min_length=1,max_length=80)
    status:Literal['active','disabled']
    version:int=Field(ge=1)
class SpaceCreate(Input):
    name:str=Field(min_length=1,max_length=80)
    administrator:str=Field(min_length=1,max_length=80)
class SpaceAssignment(Input):
    member_id:str=Field(min_length=1,max_length=80)
    role:Literal['admin','editor','viewer','remove']
class MemberRole(Input):
    role:Literal['admin','member','remove']
class Invitation(Input):
    email:str=Field(max_length=254)
    role:Literal['admin','member']='member'
class Accept(Input):
    token:str=Field(min_length=20,max_length=128)
    username:str=Field(default='',max_length=64)
    display_name:str=Field(default='',max_length=80)
    password:str=Field(default='',max_length=256)
class EmailStart(Input):
    email:str=Field(max_length=254)
    password:str=Field(default='',max_length=256)
class EmailConfirm(Input):
    challenge_id:str=Field(max_length=80)
    code:str=Field(pattern=r'^\d{6}$')
    password:str=Field(default='',max_length=256)

@router.get('/api/tenants')
def listing(request:Request): return tenants.listing(actor(request))
@router.post('/api/tenants')
def create(request:Request,data:TenantCreate): return tenants.create(actor(request),data.name,data.administrator)
@router.get('/api/tenants/{tid}')
def detail(request:Request,tid:str): return tenants.detail(actor(request),tid)
@router.put('/api/tenants/{tid}')
def update(request:Request,tid:str,data:TenantUpdate): return tenants.update(actor(request),tid,data.name,data.status,data.version)
@router.post('/api/tenants/{tid}/spaces')
def space(request:Request,tid:str,data:SpaceCreate): return tenants.create_space(actor(request),tid,data.name,data.administrator)
@router.put('/api/tenants/{tid}/spaces/{wid}/members')
def assign(request:Request,tid:str,wid:str,data:SpaceAssignment): return tenants.assign_space(actor(request),tid,wid,data.member_id,data.role)
@router.put('/api/tenants/{tid}/members/{mid}')
def member(request:Request,tid:str,mid:str,data:MemberRole): return tenants.change_member(actor(request),tid,mid,data.role)
@router.post('/api/tenants/{tid}/invitations')
def invite(request:Request,tid:str,data:Invitation): return tenants.invite(actor(request),tid,data.email,data.role)
@router.post('/api/auth/invitations/accept')
def accept(request:Request,data:Accept):
    account_email.throttle('accept:'+data.token,request.client.host if request.client else 'unknown')
    return tenants.accept(data.token,actor=session(request.scope),username=data.username,display_name=data.display_name,password=data.password)
@router.get('/api/account/email')
def email_status(request:Request): return account_email.status(actor(request))
@router.post('/api/account/email/start')
def email_start(request:Request,data:EmailStart): return account_email.start('bind',data.email,actor=actor(request),password=data.password)
@router.post('/api/account/email/confirm')
def email_confirm(request:Request,data:EmailConfirm): return account_email.confirm('bind',data.challenge_id,data.code,actor=actor(request))
@router.post('/api/auth/password/start')
def reset_start(request:Request,data:EmailStart): return account_email.start('reset',data.email,source=request.client.host if request.client else 'unknown')
@router.post('/api/auth/password/confirm')
def reset_confirm(request:Request,data:EmailConfirm): return account_email.confirm('reset',data.challenge_id,data.code,password=data.password)
@router.get('/api/tenants/{tid}/billing')
def billing(request:Request,tid:str,page:int=Query(1,ge=1),member_id:str=Query('',max_length=80),from_ms:int=Query(0,ge=0),to_ms:int=Query(0,ge=0),canvas_query:str=Query('',max_length=200),account_query:str=Query('',max_length=100)):
    from app.services.account_billing import report
    return report(actor(request),tenant=tid,page=page,member_id=member_id,from_ms=from_ms,to_ms=to_ms,canvas_query=canvas_query,account_query=account_query)
class ModelGrant(Input):
    provider_id:str=Field(max_length=80)
    kind:Literal['image','video','chat','audio','model']
    model:str=Field(min_length=1,max_length=180)
class ModelAssignments(Input):
    models:list[ModelGrant]=Field(max_length=1000)
    workspace:str|None=Field(default=None,max_length=80)
@router.get('/api/tenants/{tid}/models')
def models(request:Request,tid:str): return tenants.models(actor(request),tid)
@router.put('/api/tenants/{tid}/models')
def set_models(request:Request,tid:str,data:ModelAssignments): return tenants.set_models(actor(request),tid,[row.model_dump() for row in data.models],data.workspace)
