"""Large imports must not scan every alias for each publication."""
from unittest.mock import Mock, patch

from fastapi import HTTPException
import pytest

from app.storage.media import lock_retained_references
from app.storage.workspace import workspace_scope


def test_audio_and_preview_references_migrate_without_changing_prompt():
    from app.storage.media import normalize_document
    source={'audio_url':'/assets/input/voice.mp3','preview_url':'/assets/input/preview.png','reference_images':['/assets/input/ref.png'],'prompt':'/assets/input/voice.mp3'}
    with patch('app.storage.media.get_assets',side_effect=lambda values: {v: {'id':'ast_'+'a'*32,'name':v} for v in values}), patch('app.storage.media.stable_url',side_effect=lambda asset: '/stable'+asset['name']):
        value=normalize_document(source)
    assert value['audio_url']=='/stable/assets/input/voice.mp3'
    assert value['preview_url']=='/stable/assets/input/preview.png'
    assert value['reference_images']==['/stable/assets/input/ref.png']
    assert value['prompt']==source['prompt']


def test_scoped_alias_lookup_and_deletion_lock():
    direct = 'ast_' + 'a' * 32
    alias = 'ast_' + 'b' * 32
    conn = Mock()
    conn.execute.side_effect = [[{'asset_id': alias}], Mock(fetchall=lambda: [{'id': alias, 'status': 'deleted'}])]
    with workspace_scope('migration'):
        with pytest.raises(HTTPException) as exc:
            lock_retained_references(conn, {'refs': [direct, '/assets/input/one%20two.png?old=1']})
    assert exc.value.status_code == 409
    assert conn.execute.call_args_list[0].args[1] == ('migration', ['/assets/input/one two.png'])
    assert conn.execute.call_args_list[1].args[1] == ('migration', sorted([direct, alias]))
    assert 'FOR SHARE' in conn.execute.call_args_list[1].args[0]
    conn = Mock()
    conn.execute.return_value.fetchall.return_value = []
    with workspace_scope('migration'):
        lock_retained_references(conn, [direct, None])
    assert conn.execute.call_count == 1
    assert 'asset_aliases' not in conn.execute.call_args.args[0]
