import json
from pathlib import Path
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app.models import CanvasModelTaskRequest
from app.services.hunyuan3d import authorization, validate_glb


def test_tc3_signature_matches_tencent_published_test_vector():
    # https://cloud.tencent.com/document/product/865/35466
    content=json.dumps({'Limit':1,'Filters':[{'Values':['未命名'],'Name':'instance-name'}]}).encode()
    value=authorization('cvm.tencentcloudapi.com','DescribeInstances',content,'AKID'+'*'*32,'*'*32,1551113065,'cvm')
    assert value.endswith('Signature=10b1a37a7301a02ca19a647ad722d5e43b4b3cff309d421d85b46093f6ab6c4f')


def test_generated_glb_has_a_real_mesh_and_truncated_or_external_resources_are_rejected(tmp_path):
    import struct
    sample=Path('tests/fixtures/pixmax-generated-model.glb').read_bytes()
    path=tmp_path/'model.glb';path.write_bytes(sample)
    assert validate_glb(path)['meshes'][0]['primitives'][0]['attributes']['POSITION']==0
    path.write_bytes(sample[:-1])
    with pytest.raises(HTTPException):validate_glb(path)
    length=struct.unpack('<I',sample[12:16])[0];value=json.loads(sample[20:20+length]);value['buffers'][0]['uri']='https://internal/secret'
    encoded=json.dumps(value,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);tail=sample[20+length:]
    path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(tail))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+tail)
    with pytest.raises(HTTPException):validate_glb(path)


@pytest.mark.parametrize('changes',[{'model':'3.1','generate_type':'LowPoly'}, {'images':['image']}, {'mode':'image','images':[]},
    {'mode':'multi','images':['front','back'],'view_types':['front','front'],'prompt':''},
    {'mode':'multi','images':['front','top'],'view_types':['front','top'],'prompt':''}, {'face_count':0}, {'face_count':False,'generate_type':'LowPoly'}, {'enable_pbr':'true'}, {'api_key':'client-key'}])
def test_hunyuan_model_input_rejects_conflicting_native_parameters(changes):
    payload={'canvas_id':'canvas','client_task_id':'canvas_model_abcdefgh','provider_id':'model','canvas_target':{'source_node_id':'source','target_node_id':'source','base_revision':1},'prompt':'陶瓷小猫',**changes}
    with pytest.raises(ValidationError):CanvasModelTaskRequest(**payload)
