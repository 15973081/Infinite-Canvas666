"""Canonical workbench page addresses shared by routing and admission."""
import re
from html import escape

from fastapi.responses import HTMLResponse

PAGE_PATH = re.compile(r'/workspaces/([A-Za-z0-9_-]{1,80})(?:/canvases/([A-Za-z0-9_-]{1,160}))?')


def page_address(path):
    return PAGE_PATH.fullmatch(path)


def page_error(status, workspace):
    message = '画布不存在或已移入回收站。' if status == 404 else '当前无法访问此画布，请确认空间权限或稍后重试。'
    return HTMLResponse(f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>无法打开画布</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#101310;color:#e8eadf;font:16px/1.7 system-ui}}main{{max-width:420px;padding:32px}}a{{color:#d1f54a}}</style>
<main><h1>无法打开画布</h1><p>{message}</p><a href="/workspaces/{escape(workspace, quote=True)}">返回画布首页</a> · <a href="/">选择其他空间</a></main></html>''',
                        status_code=status, headers={'Cache-Control': 'no-store'})
