"""Standalone canvas pages; member gateway establishes the workspace scope."""
from fastapi import APIRouter, HTTPException
from app.services.canvas import load_canvas
from app.services.canvas_pages import page_address, page_error
from app.services.static_pages import static_html_response

router = APIRouter()


@router.get('/workspaces/{workspace_id}')
def workspace_home(workspace_id: str):
    if not page_address('/workspaces/' + workspace_id):
        raise HTTPException(404)
    return static_html_response('index.html')


@router.get('/workspaces/{workspace_id}/canvases/{canvas_id}')
def canvas_page(workspace_id: str, canvas_id: str):
    if not page_address(f'/workspaces/{workspace_id}/canvases/{canvas_id}'):
        raise HTTPException(404)
    try:
        canvas = load_canvas(canvas_id)
        return static_html_response('smart-canvas.html' if canvas.get('kind') == 'smart' else 'canvas.html')
    except HTTPException as error:
        return page_error(error.status_code, workspace_id)
