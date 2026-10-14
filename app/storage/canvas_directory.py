"""Serialize tree membership changes without serializing ordinary canvas writes."""
from app.storage.workspace import current_workspace


def lock(conn, exclusive=False):
    function = 'pg_advisory_xact_lock' if exclusive else 'pg_advisory_xact_lock_shared'
    conn.execute(f'SELECT {function}(hashtextextended(%s,0))', ('canvas-directory:' + current_workspace(),))


def validate_folder(conn, folder_id):
    if not folder_id:return
    row=conn.execute("SELECT value FROM workspace_documents WHERE workspace_id=%s AND kind='canvas_folders' AND id='default'",(current_workspace(),)).fetchone()
    if not row or not any(item.get('id')==folder_id for item in row['value'].get('folders',[])):
        from fastapi import HTTPException
        raise HTTPException(409,{'code':'canvas_folder_not_found','message':'目标文件夹已变化，请刷新目录'})
