"""Deletion intent must survive snapshot rollback and identity loss."""
import json
import uuid

import pytest
from app.storage import deletion_ledger as ledger


def record():
    aid='ast_'+uuid.uuid4().hex
    return {'workspace_id':'ws_test','asset_id':aid,'owner_id':'member_test','objects':[
        {'id':aid,'workspace_id':'ws_test','bucket':'local-simulation',
         'object_key':'media/ws_test/'+aid+'/original.bin','object_version_id':uuid.uuid4().hex}]}


def test_ledger_preserves_identity_and_rejects_identity_loss(tmp_path,monkeypatch):
    monkeypatch.setenv('DELETION_LEDGER_ROOT',str(tmp_path))
    job=record(); ledger.write(job)
    original=ledger.identity(); ledger.write(job)
    assert ledger.identity()==original
    assert ledger.blocked({'id':job['asset_id'],'workspace_id':job['workspace_id']})
    actual,records=ledger.load(original)
    assert actual==original and records[0]['objects']==job['objects']
    (tmp_path/'.ledger-id').unlink()
    with pytest.raises(ValueError,match='identity lost'): ledger.write(job)
    assert not (tmp_path/'.ledger-id').exists()


def test_ledger_rejects_conflicting_or_corrupt_intent(tmp_path,monkeypatch):
    monkeypatch.setenv('DELETION_LEDGER_ROOT',str(tmp_path))
    job=record(); ledger.write(job); descriptor=ledger.identity()
    job['owner_id']='different-owner'
    with pytest.raises(ValueError,match='conflict'): ledger.write(job)
    path=next(tmp_path.glob('*.json')); value=json.loads(path.read_text())
    value['objects']=[42]; path.write_text(json.dumps(value))
    with pytest.raises(ValueError,match='Invalid deletion ledger object'): ledger.load(descriptor)


def test_ledger_refuses_wrong_object_path(tmp_path,monkeypatch):
    monkeypatch.setenv('DELETION_LEDGER_ROOT',str(tmp_path))
    job=record(); job['objects'][0]['object_key']='media/other-workspace/private/file'
    with pytest.raises(ValueError,match='Invalid deletion ledger object'): ledger.write(job)
    assert list(tmp_path.glob('*.json'))==[]


def test_account_intent_denies_owner_and_deduplicates_its_attachment_journal(tmp_path,monkeypatch):
    monkeypatch.setenv('DELETION_LEDGER_ROOT',str(tmp_path))
    job=record();job['owner_id']='member_'+uuid.uuid4().hex
    attachment={'version':1,'kind':'attachment',**job}
    account={'version':1,'kind':'account','owner_id':job['owner_id'],'objects':[],'attachments':[attachment]}
    ledger.write_record(account);ledger.write(job)
    assert ledger.member_blocked(job['owner_id'])
    _,records=ledger.load(ledger.identity())
    assert len(records)==2 and {r['kind'] for r in records}=={'account','attachment'}
    assert ledger.blocked({'id':'ast_'+uuid.uuid4().hex,'workspace_id':'ws_test','metadata':{'chat_owner':job['owner_id']}})
