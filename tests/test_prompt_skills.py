import io
import zipfile
import pytest
from fastapi import HTTPException
from app.services.prompt_skills import parse_package, prompt_context

MD=b'---\nname: prompt-review\ndescription: Improve prompts\n---\nAsk for subject, framing and lighting.'

def bundle(files):
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w') as archive:
        for name,value in files.items():
            archive.writestr(name,value)
    return output.getvalue()

def test_md_and_rooted_zip_only_use_text_references():
    assert parse_package(MD,'SKILL.md')['name']=='prompt-review'
    data=parse_package(bundle({'prompt-review/SKILL.md':MD,'prompt-review/references/tips.md':b'Prefer specifics.',
                               'prompt-review/scripts/run.py':b'raise Exception("never execute")',
                               'prompt-review/assets/image.png':b'\x89PNG'}),'skill.zip')
    assert data['references']=={'references/tips.md':'Prefer specifics.'}
    assert len(data['warnings'])==2
    assert 'scripts/run.py' in [entry['path'] for entry in data['files']]
    assert 'run.py' not in data['instructions']

@pytest.mark.parametrize('files',[{'../SKILL.md':MD},{'/SKILL.md':MD},{'C:/SKILL.md':MD},
    {'a/SKILL.md':MD,'b/SKILL.md':MD},{'a\\SKILL.md':MD},{'readme.md':MD}], ids=['traversal','absolute','drive','multiple','backslash','missing'])
def test_unsafe_and_ambiguous_zip_rejected(files):
    with pytest.raises(HTTPException):
        data=bundle(files)
        # Windows ZipInfo normalizes separators when constructing an archive.
        if 'a\\SKILL.md' in files:
            data=data.replace(b'a/SKILL.md',b'a\\SKILL.md')
        parse_package(data,'bad.zip')

@pytest.mark.parametrize('data',[b'',b'no front matter',b'---\nname: Bad Name\ndescription: hi\n---\ntext',
                                 b'---\nname: ok\ndescription: []\n---\ntext',MD+b'a'*120000],ids=['empty','header','name','description','long'])
def test_invalid_manifest_rejected(data):
    with pytest.raises(HTTPException):
        parse_package(data,'SKILL.md')

def test_context_is_plain_user_reference_without_executable_fields():
    assert prompt_context([])==''
    assert '不要执行脚本' in prompt_context([{'name':'prompt-review','context':'Better framing'}])


@pytest.mark.parametrize('length', [999999, 1000000, 1000001])
def test_resolve_context_limit_preserves_all_text_or_rejects(monkeypatch, length):
    from contextlib import contextmanager
    from app.services import prompt_skills as skills
    from app.services.chat import upstream_message_from_record

    assert skills.MAX_CONTEXT == 1000000
    reference = '\n参考头\n' + '深度🙂\n' * 12500 + '\n参考尾\n'
    suffix = '\n\n参考文字：\nreferences/full.txt\n' + reference
    instructions = '正文头' + '全' * (length - len(suffix) - 6) + '正文尾'
    expected = instructions + suffix
    assert len(expected) == length
    row = {'id': 'skl_full', 'name': 'full', 'version_id': 'skv_fixed',
           'sha256': 'test', 'content': {'instructions': instructions,
                                      'references': {'references/full.txt': reference}}}

    class Database:
        def execute(self, query, args):
            assert args[1] == 'skl_full'
            return self

        def fetchone(self):
            return row

    @contextmanager
    def connection():
        yield Database()

    monkeypatch.setattr(skills, 'postgres_enabled', lambda: True)
    monkeypatch.setattr(skills, 'connection', connection)
    monkeypatch.setattr(skills, 'actor', lambda conn: ('member_sender', 'Sender', None))
    if length > skills.MAX_CONTEXT:
        with pytest.raises(HTTPException) as error:
            skills.resolve(['skl_full'])
        assert error.value.status_code == 400
        assert error.value.detail == ('所选技能正文及参考文件共 1,000,001 字符，'
                                      '超过本次引用上限 1,000,000 字符，请减少引用数量。')
        return
    records = skills.resolve(['skl_full'])
    assert records[0]['context'] == expected
    rendered = prompt_context(records)
    assert rendered.endswith('【full】\n' + expected)
    message = upstream_message_from_record({'role': 'user', 'content': '优化提示词', 'skill_refs': records})
    assert message == {'role': 'user', 'content': '优化提示词' + rendered}


def test_single_skill_import_limit_and_reference_whitespace_unchanged():
    from app.services import prompt_skills as skills

    assert skills.MAX_TEXT == 120000 and skills.MAX_PACKAGE == 2 * 1024 * 1024
    body = '正文'
    beginning, ending = '\n  开头🙂\n', '\n  结尾\n'
    reference = beginning + '全' * (skills.MAX_TEXT - len(body) - len(beginning) - len(ending)) + ending
    assert len(body) + len(reference) == skills.MAX_TEXT
    manifest = ('---\nname: full\ndescription: Full\n---\n' + body).encode('utf-8')
    files = {'SKILL.md': manifest, 'references/full.txt': reference.encode('utf-8')}
    content = skills.parse_package(bundle(files), 'full.zip')
    assert content['instructions'] == body
    assert content['references'] == {'references/full.txt': reference}
    files['references/full.txt'] += b'x'
    with pytest.raises(HTTPException) as error:
        skills.parse_package(bundle(files), 'full.zip')
    assert error.value.status_code == 400
    assert '120000' in error.value.detail
