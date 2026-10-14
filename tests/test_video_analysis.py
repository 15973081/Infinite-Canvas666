"""Real full-video sampling and fail-before-submission constraints."""
import base64,io,shutil,subprocess
from unittest.mock import patch
import pytest
from PIL import Image
from fastapi import HTTPException
from app.models import CanvasLLMRequest,CanvasLLMTaskRequest
from app.services.video_analysis import sample_file


@pytest.fixture
def two_scene_video(tmp_path):
    path=tmp_path/'two-scenes.mp4'
    subprocess.run([shutil.which('ffmpeg'),'-v','error','-f','lavfi','-i','color=c=red:s=64x48:r=6:d=6','-f','lavfi','-i','color=c=blue:s=64x48:r=6:d=2',
        '-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264','-pix_fmt','yuv420p','-threads','1','-y',str(path)],capture_output=True,timeout=20,check=True)
    return path


@pytest.mark.parametrize('count',[6,12,24])
def test_samples_include_the_scene_after_the_first_six_seconds(two_scene_video,count):
    result=sample_file(two_scene_video,count,128)
    assert result['duration']==8 and len(result['frames'])==min(count,8)
    times=[frame['time'] for frame in result['frames']]
    assert times==sorted(times) and times[-1]>7 and all(0<value<8 for value in times)
    colors=[]
    for frame in result['frames']:
        with Image.open(io.BytesIO(base64.b64decode(frame['url'].split(',')[1]))) as image:
            assert max(image.size)<=128
            colors.append(image.convert('RGB').getpixel((32,24)))
    assert colors[0][0]>200 and colors[0][2]<20
    assert colors[-1][2]>200 and colors[-1][0]<20
    assert result['audio_included'] is False


def test_invalid_media_and_unavailable_decoders_fail_without_submitting(tmp_path):
    file=tmp_path/'broken.mp4';file.write_bytes(b'not a video')
    with pytest.raises(HTTPException) as error:sample_file(file)
    assert error.value.status_code==400
    with patch('app.services.video_analysis.shutil.which',return_value=None):
        with pytest.raises(HTTPException) as error:sample_file(file)
    assert error.value.status_code==503


@pytest.mark.parametrize('count',[0,100,True,6.0,'6'])
def test_sampling_budget_is_validated_before_loading_media(count):
    with pytest.raises(HTTPException) as error:sample_file('not-a-file.mp4',count)
    assert error.value.status_code==422


def test_request_defaults_preserve_existing_sampling_and_uniform_requires_video():
    assert CanvasLLMRequest(message='describe').video_sampling=='head'
    body={'canvas_id':'c','client_task_id':'canvas_llm_12345678','canvas_target':{'source_node_id':'a','target_node_id':'a','base_revision':1},'provider_id':'p','model':'m','message':'describe'}
    assert CanvasLLMTaskRequest(**body).video_frames==6
    with pytest.raises(ValueError):CanvasLLMTaskRequest(**body,video_sampling='uniform')
    with pytest.raises(ValueError):CanvasLLMRequest(message='describe',video_sampling='uniform',videos=[' '])
    assert CanvasLLMTaskRequest(**body,video_sampling='uniform',videos=['/api/media/ast_a/content'],video_frames=24).video_frames==24
