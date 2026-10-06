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
