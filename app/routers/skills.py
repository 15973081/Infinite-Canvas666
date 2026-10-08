"""Prompt skill catalog. Cross-space visibility is explicit, never inferred."""
from typing import Literal
from fastapi import APIRouter, File, Form, UploadFile, Query, HTTPException, Depends
from pydantic import BaseModel, ConfigDict
from app.services import prompt_skills as service

def storage_required():
    if not service.postgres_enabled():
        raise HTTPException(503,'Skill 库需要 PostgreSQL 存储。')

router=APIRouter(dependencies=[Depends(storage_required)])

class Preference(BaseModel):
    model_config=ConfigDict(extra='forbid')
    enabled:bool

class Visibility(BaseModel):
    model_config=ConfigDict(extra='forbid')
    visibility:Literal['workspace','shared']

class Purge(BaseModel):
    model_config=ConfigDict(extra='forbid')
    confirm_permanent:bool=False

@router.post('/api/skills/{skill_id}/purge')
def purge(skill_id:str,payload:Purge):
    return service.purge(skill_id,payload.confirm_permanent)

async def package(file):
    data=await file.read(service.MAX_PACKAGE+1)
    if len(data)>service.MAX_PACKAGE:
        raise HTTPException(413,'技能包不能超过 2 MB。')
    return data

@router.get('/api/skills')
def catalog(q:str=Query('',max_length=160),scope:Literal['all','workspace','shared','installed','enabled']='all',offset:int=Query(0,ge=0),limit:int=Query(60,ge=1,le=100)):
    return service.catalog(q,scope,offset,limit)

@router.post('/api/skills/preview')
async def preview(file:UploadFile=File(...)):
    return service.parse_package(await package(file),file.filename or 'SKILL.md')

@router.post('/api/skills/import')
async def import_skill(file:UploadFile=File(...),visibility:Literal['workspace','shared']=Form('workspace')):
    return service.publish(await package(file),file.filename or 'SKILL.md',visibility)

@router.get('/api/skills/{skill_id}')
def detail(skill_id:str):
    return service.detail(skill_id)

@router.post('/api/skills/{skill_id}/install')
def install(skill_id:str):
    return service.install(skill_id)

@router.delete('/api/skills/{skill_id}/install')
def uninstall(skill_id:str):
    return service.uninstall(skill_id)

@router.patch('/api/skills/{skill_id}/preference')
def preference(skill_id:str,payload:Preference):
    return service.preference(skill_id,payload.enabled)

@router.patch('/api/skills/{skill_id}')
def visibility(skill_id:str,payload:Visibility):
    return service.change(skill_id,payload.visibility)

@router.delete('/api/skills/{skill_id}')
def withdraw(skill_id:str):
    return service.change(skill_id,remove=True)
