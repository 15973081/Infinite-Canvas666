"""Scoped subject catalog APIs; ownership is always derived from the member session."""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.services import subject_library as subjects

def private_catalog(response: Response):
    response.headers['Cache-Control'] = 'private, no-store'


router = APIRouter(prefix='/api/subject-library', dependencies=[Depends(private_catalog)])
OwnerType = Literal['PERSONAL', 'TEAM']
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Text = Annotated[str, StringConstraints(min_length=1, max_length=10000)]


class Revision(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_revision: int = Field(ge=0, strict=True)


class GroupCreate(Revision):
    name: Name
    description: str = Field(default='', max_length=1000)


class GroupUpdate(Revision):
    name: Name | None = None
    description: str | None = Field(default=None, max_length=1000)
    cover_item_id: str | None = Field(default=None, max_length=80)

    @model_validator(mode='after')
    def supplied_fields(self):
        fields = self.model_fields_set - {'expected_revision'}
        if not fields or any(getattr(self, field) is None for field in fields):
            raise ValueError('请提供需要修改的主体字段，字段不能为 null。')
        return self


class ItemCreate(Revision):
    kind: Literal['text', 'image', 'audio', 'video']
    name: Name
    text: Text | None = None
    url: str | None = Field(default=None, min_length=1, max_length=4096)
    asset_item_id: str = Field(default='', max_length=80)
    library_id: str = Field(default='', max_length=80)

    @model_validator(mode='after')
    def typed_content(self):
        if self.kind == 'text':
            if self.text is None or not self.text.strip() or self.url is not None or self.asset_item_id or self.library_id:
                raise ValueError('文字素材需要正文，不能携带媒体地址或认证来源。')
        elif self.url is None or self.text is not None or bool(self.asset_item_id) != bool(self.library_id):
            raise ValueError('媒体素材需要地址，素材库来源必须完整。')
        return self


class ItemUpdate(Revision):
    name: Name | None = None
    text: Text | None = None

    @model_validator(mode='after')
    def supplied_fields(self):
        fields = self.model_fields_set - {'expected_revision'}
        if not fields or any(getattr(self, field) is None for field in fields):
            raise ValueError('请提供需要修改的素材字段，字段不能为 null。')
        if 'text' in fields and not self.text.strip():
            raise ValueError('文字素材正文不能为空。')
        return self


@router.get('')
def catalogs():
    return subjects.catalogs()


@router.post('/{owner_type}/groups')
def create_group(owner_type: OwnerType, payload: GroupCreate):
    return subjects.create_group(owner_type, payload)


@router.patch('/{owner_type}/groups/{group_id}')
def update_group(owner_type: OwnerType, group_id: str, payload: GroupUpdate):
    return subjects.update_group(owner_type, group_id, payload)


@router.get('/{owner_type}/groups/{group_id}')
def group_details(owner_type: OwnerType, group_id: str):
    return subjects.group_details(owner_type, group_id)


@router.delete('/{owner_type}/groups/{group_id}')
def delete_group(owner_type: OwnerType, group_id: str, expected_revision: int = Query(ge=0)):
    return subjects.delete_group(owner_type, group_id, expected_revision)


@router.post('/{owner_type}/groups/{group_id}/items')
def add_item(owner_type: OwnerType, group_id: str, payload: ItemCreate):
    return subjects.add_item(owner_type, group_id, payload)


@router.patch('/{owner_type}/groups/{group_id}/items/{item_id}')
def update_item(owner_type: OwnerType, group_id: str, item_id: str, payload: ItemUpdate):
    return subjects.update_item(owner_type, group_id, item_id, payload)


@router.delete('/{owner_type}/groups/{group_id}/items/{item_id}')
def delete_item(owner_type: OwnerType, group_id: str, item_id: str, expected_revision: int = Query(ge=0)):
    return subjects.delete_item(owner_type, group_id, item_id, expected_revision)
