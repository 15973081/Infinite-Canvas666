"""Selection is applied to actual source bytes, never supplied extracted text."""
import json
import zipfile

import pytest
from fastapi import HTTPException
from app.services import attachment_preview as preview
from app.services import media
from test_document_attachments import docx,xlsx


@pytest.fixture
def chapters_docx(docx):
    with zipfile.ZipFile(docx) as archive:
        entries={info.filename:archive.read(info.filename) for info in archive.infolist()}
    entries['word/styles.xml']=b'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>'
    text='<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一章</w:t></w:r></w:p><w:p><w:r><w:t>只选雨夜</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第二章</w:t></w:r></w:p><w:p><w:r><w:t>未选雪山</w:t></w:r></w:p>'
    entries['word/document.xml']=('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+text+'</w:body></w:document>').encode()
    with zipfile.ZipFile(docx,'w') as archive:
        for name,value in entries.items(): archive.writestr(name,value)
    return docx


def test_docx_sections_are_authoritative_and_selected_in_source_order(chapters_docx):
    data=preview.extract(str(chapters_docx))
    assert [s['title'] for s in data['sections']]==['第一章','第二章']
    selection={'kind':'docx','sha256':data['sha256'],'sections':[data['sections'][0]['id']]}
    text=preview.selected_text(str(chapters_docx),selection,100000)
    assert '只选雨夜' in text and '未选雪山' not in text and '第二章' not in text
    selection['sections']=['missing-section']
    with pytest.raises(HTTPException,match='有效且不重复'): preview.selected_text(str(chapters_docx),selection,100000)


def test_xlsx_selection_keeps_only_requested_sheet_and_cell_region(xlsx):
    data=preview.extract(str(xlsx))
    assert [s['name'] for s in data['sheets']]==['分镜','人物']
    selection={'kind':'xlsx','sha256':data['sha256'],'sheets':[{'name':'分镜','region':'A2:B3'}]}
    text=preview.selected_text(str(xlsx),selection,100000)
    assert '雨夜巷口' in text and '002' in text
    assert '别回头' not in text and '人物' not in text and '合计' not in text
    for region in ['B3:A2','A1:Z200']:
        selection['sheets'][0]['region']=region
        with pytest.raises(HTTPException,match='选择区域'): preview.selected_text(str(xlsx),selection,100000)
    selection['sheets']=[{'name':'missing','region':''}]
    with pytest.raises(HTTPException,match='有效且不重复'): preview.selected_text(str(xlsx),selection,100000)


def test_selection_rejects_stale_fingerprint_or_wrong_format(xlsx):
    data=preview.extract(str(xlsx))
    for kind,sha in [('docx',data['sha256']),('xlsx','0'*64)]:
        with pytest.raises(HTTPException) as exc:
            preview.extract(str(xlsx),{'kind':kind,'sha256':sha,'sheets':[{'name':'人物','region':''}]})
        assert exc.value.status_code==409


def test_docx_parser_content_change_cannot_silently_reuse_old_segment_id(chapters_docx,monkeypatch):
    data=preview.extract(str(chapters_docx))
    selection={'kind':'docx','sha256':data['sha256'],'sections':[data['sections'][0]['id']]}
    monkeypatch.setattr(preview,'office_attachment_text',lambda *args:'# 第一章\n不同的解析内容\n# 第二章\n雪山')
    with pytest.raises(HTTPException,match='有效且不重复'):
        preview.selected_text(str(chapters_docx),selection,100000)


def test_selection_reaches_upstream_and_cannot_be_bypassed_by_kind_hint(xlsx,monkeypatch):
    from app.services.chat import upstream_message_from_record
    monkeypatch.setattr(media,'output_file_from_url',lambda _:str(xlsx))
    selection={'kind':'xlsx','sha256':preview.digest(str(xlsx)),'sheets':[{'name':'人物','region':''}]}
    record={'role':'user','content':'分析','attachments':[{'url':'/assets/input/file.xlsx','kind':'image','selection':selection}]}
    message=upstream_message_from_record(record)
    assert len(message['content'])==1
    assert '沉锋' in message['content'][0]['text'] and '雨夜巷口' not in message['content'][0]['text']
