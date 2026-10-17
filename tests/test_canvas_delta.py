import copy
import pytest
from fastapi import HTTPException
from app.models import CanvasSaveRequest
from app.services.canvas_delta import expand_canvas_delta


def document():
    return dict(id='test', revision=3, updated_at=100, title='Keep title', icon='layers',
                kind='smart', nodes=[{'id':'a', 'x':0}, {'id':'b', 'x':1}],
                connections=[{'from':'a','to':'b'}], settings={'model':'keep'}, logs=[{'id':'keep'}])


def request(**delta):
    return CanvasSaveRequest(graph_delta={'base_revision':3,'base_updated_at':100,**delta})


def test_delta_expands_without_changing_the_loaded_snapshot():
    doc=document();original=copy.deepcopy(doc)
    result=expand_canvas_delta(doc,request(create=[{'id':'c'}],update=[{'id':'a','x':9}],delete=['b'],
        connections_remove=[{'from':'a','to':'b'}],connections_add=[{'from':'c','to':'a'}],node_order=['c','a']))
    assert result.nodes==[{'id':'c'},{'id':'a','x':9}]
    assert result.connections==[{'from':'c','to':'a'}]
    assert result.title==doc['title'] and result.settings==doc['settings'] and result.logs==doc['logs']
    assert doc==original


@pytest.mark.parametrize('delta',[
    {'create':[{'id':'a'}]}, {'create':[{'id':''}]}, {'create':[{'id':'c'},{'id':'c'}]},
    {'update':[{'id':'missing'}]}, {'delete':['missing']}, {'delete':['b']},
    {'delete':['a','a']}, {'update':[{'id':'a'}],'delete':['a']},
    {'node_order':['a','a']}, {'connections_add':[{'from':'a','to':'missing'}]},
    {'connections_add':[{'from':[],'to':'a'}]}, {'connections_add':[{'from':'a','to':'b'}]},
    {'connections_remove':[{'from':'b','to':'a'}]}, {'connections_order':[]},
])
def test_malformed_delta_is_rejected_atomically(delta):
    doc=document();before=copy.deepcopy(doc)
    with pytest.raises(HTTPException) as error:expand_canvas_delta(doc,request(**delta))
    assert error.value.status_code==400 and doc==before


@pytest.mark.parametrize('changed', [{'base_revision':2},{'base_updated_at':99}])
def test_delta_has_its_own_baseline_even_if_outer_revision_is_current(changed):
    payload=request(**changed);payload.base_revision=3
    with pytest.raises(HTTPException) as error:expand_canvas_delta(document(),payload)
    assert error.value.status_code==409


def test_full_and_delta_must_not_be_mixed():
    payload=request();payload.nodes=[]
    with pytest.raises(HTTPException) as error:expand_canvas_delta(document(),payload)
    assert error.value.status_code==400


def test_connection_numbers_survive_javascript_json_roundtrip():
    doc=document();doc['connections'][0]['weight']=1.0
    result=expand_canvas_delta(doc,request(connections_remove=[{'from':'a','to':'b','weight':1}]))
    assert result.connections==[]


def test_background_results_have_an_independent_delta_baseline():
    doc=document();doc['task_result_version']=1
    original=copy.deepcopy(doc)
    with pytest.raises(HTTPException) as error:
        expand_canvas_delta(doc,request(update=[{'id':'a','x':9}]))
    assert error.value.status_code==409
    assert error.value.detail['code']=='canvas_delta_delivery_changed'
    assert doc==original
    assert expand_canvas_delta(doc,request(base_task_result_version=1,update=[{'id':'a','x':9}])).nodes[0]['x']==9
