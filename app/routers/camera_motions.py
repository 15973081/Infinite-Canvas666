"""Camera motion CRUD with member-derived ownership and private responses."""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.services import camera_motions as motions


def private(response: Response):
    response.headers['Cache-Control'] = 'private, no-store'


router = APIRouter(prefix='/api/camera-motions', dependencies=[Depends(private)])


class Revision(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_revision: int = Field(ge=0, strict=True)


class Motion(Revision):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    description: str = Field(default='', max_length=1000)
    prompt: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)]
    url: str = Field(min_length=1, max_length=4096)


class Favorite(Revision):
    favorite: bool = Field(strict=True)


@router.get('')
def listing(tab: Literal['plaza', 'mine', 'favorite'] = 'plaza', page: int = Query(1, ge=1, le=10000),
            page_size: int = Query(50, ge=1, le=100), keyword: str = Query('', max_length=160)):
    return motions.listing(tab, page, page_size, keyword)


@router.post('')
def create(payload: Motion):
    return motions.create(payload)


@router.get('/{motion_id}')
def detail(motion_id: str):
    return motions.detail(motion_id)


@router.put('/{motion_id}')
def update(motion_id: str, payload: Motion):
    return motions.update(motion_id, payload)


@router.delete('/{motion_id}')
def delete(motion_id: str, expected_revision: int = Query(ge=1)):
    return motions.delete(motion_id, expected_revision)


@router.put('/{motion_id}/favorite')
def favorite(motion_id: str, payload: Favorite):
    return motions.favorite(motion_id, payload)
