import asyncio
from contextlib import ExitStack
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import HTTPException
from app.models import CanvasVideoRequest
from app.routers import canvas


class CapturedRequest(Exception):
    pass


class SeedanceReferencePayloadTests(unittest.TestCase):
    def capture(self, **kwargs):
        captured = {}
        async def post(url, **options):
            captured.update(options['json'])
            raise CapturedRequest()
        async def resolve(value, *args, **kwargs):
            return value
        client = AsyncMock()
        client.__aenter__.return_value = client
        client.post.side_effect = post
        provider = {'id':'unit', 'name':'Unit', 'volcengine_project_name':'default'}
        patches = {
            'get_api_provider':lambda _:provider,
            'video_api_root':lambda _:'https://example.invalid',
            'provider_env_key_value':lambda _:'not-a-real-key',
            'is_apimart_provider':lambda _:False,
            'is_volcengine_provider':lambda _:True,
            'is_yuli_provider':lambda _:False,
            'is_agnes_provider':lambda *args:False,
            'video_submit_url_candidates':lambda *args:['https://example.invalid/generate'],
            'httpx_provider_kwargs':lambda _: {},
            'api_headers':lambda **kwargs: {},
            'volcengine_video_media_reference_url':resolve,
        }
        payload = CanvasVideoRequest(**{'prompt':'生成镜头', 'provider_id':'unit', 'model':'doubao-seedance-2-0-260128', **kwargs})
        with ExitStack() as stack:
            stack.enter_context(patch.object(canvas.httpx, 'AsyncClient', return_value=client))
            for name, value in patches.items():
                stack.enter_context(patch.object(canvas, name, value))
            try:
                asyncio.run(canvas.canvas_video_impl(payload))
            except CapturedRequest:
                pass
        return captured

    def test_seedance20_http_and_asset_videos_remain_videos(self):
        body = self.capture(images=[{'url':'asset://image'}], videos=['https://example.invalid/a.mp4','asset://video'], audios=['asset://audio'])
        self.assertEqual([item['type'] for item in body['content']], ['text','image_url','video_url','video_url','audio_url'])
        self.assertEqual(body['content'][2]['video_url']['url'], 'https://example.invalid/a.mp4')

    def test_trusted_indices_count_actual_items_not_unique_urls(self):
        body = self.capture(images=[{'url':'asset://same'},{'url':'asset://same'}], videos=['asset://video'], audios=['asset://audio'], trusted_asset=True)
        self.assertIn('图片1、图片2', body['content'][0]['text'])
        self.assertIn('视频1', body['content'][0]['text'])
        self.assertIn('音频1', body['content'][0]['text'])

    def test_seedance25_keeps_direct_video_support(self):
        body = self.capture(model='doubao-seedance-2-5-260628', videos=['https://example.invalid/a.mp4'])
        self.assertIs(body['generate_audio'], False)
        self.assertEqual(body['content'][1]['type'], 'video_url')

    def test_seedance25_forwards_sound_and_output_format(self):
        for sound in (True, False):
            with self.subTest(sound=sound):
                body=self.capture(model='doubao-seedance-2-5-260628', generate_audio=sound, output_format='mov')
                self.assertIs(body['generate_audio'], sound)
                self.assertEqual(body['output_format'], 'mov')

    def test_output_format_does_not_change_legacy_request_fingerprints(self):
        payload=CanvasVideoRequest(prompt='保留旧请求')
        self.assertNotIn('output_format', canvas._canvas_video_payload_dict(payload))
        self.assertEqual(canvas._canvas_video_payload_dict(CanvasVideoRequest(prompt='MOV', output_format='mov'))['output_format'],'mov')

    def test_non_seedance25_cannot_silently_ignore_output_format(self):
        with self.assertRaises(HTTPException) as error:
            self.capture(output_format='mov')
        self.assertEqual(error.exception.status_code,400)

    def test_local_video_is_not_silently_replaced_by_frames(self):
        with self.assertRaises(HTTPException) as error:
            self.capture(videos=['/output/local.mp4'])
        self.assertEqual(error.exception.status_code, 400)
        self.assertIn('上传云端', error.exception.detail)

    def test_wrong_media_type_and_overflow_fail_before_submission(self):
        for kwargs in ({'videos':['https://example.invalid/a.png']}, {'audios':['asset://audio']*4}):
            with self.subTest(kwargs=kwargs), self.assertRaises(HTTPException) as error:
                self.capture(**kwargs)
            self.assertEqual(error.exception.status_code, 400)

    def test_frame_roles_reach_supplier_without_becoming_reference_images(self):
        for model,ratio in [('doubao-seedance-2-0-260128','16:9'),('doubao-seedance-2-5-260628','adaptive')]:
            with self.subTest(model=model):
                body=self.capture(model=model,aspect_ratio=ratio,images=[{'url':'asset://head','role':'first_frame'},{'url':'asset://tail','role':'last_frame'}])
                self.assertEqual([item['role'] for item in body['content'][1:]],['first_frame','last_frame'])
                self.assertEqual([item['image_url']['url'] for item in body['content'][1:]],['asset://head','asset://tail'])
                self.assertEqual(body['ratio'],ratio)

    def test_identical_first_and_last_images_keep_both_roles(self):
        body=self.capture(images=[{'url':'asset://same','role':'first_frame'},{'url':'asset://same','role':'last_frame'}])
        self.assertEqual([item['role'] for item in body['content'][1:]],['first_frame','last_frame'])

    def test_edit_and_extension_modes_compile_intent_and_effective_video_settings(self):
        for mode,prefix,duration in [('edit','编辑视频@video1：',-1),('extend_backward','向后延长@video1：',5),('extend_forward','向前延长@video1：',5)]:
            with self.subTest(mode=mode):
                body=self.capture(model='doubao-seedance-2-5-260628',task_mode=mode,videos=['asset://video'],duration=5,aspect_ratio='adaptive')
                self.assertTrue(body['content'][0]['text'].startswith(prefix))
                self.assertEqual((body['duration'],body['ratio']),(duration,'adaptive'))

    def test_proxy_frame_roles_fail_before_they_can_be_silently_ignored(self):
        payload=CanvasVideoRequest(prompt='首帧',images=[{'url':'asset://image','role':'first_frame'}])
        with patch.object(canvas,'is_volcengine_provider',return_value=True),patch.object(canvas,'video_api_root',return_value='https://example.invalid/proxy/generate'):
            with self.assertRaises(HTTPException) as error:canvas._validate_video_input_roles(payload,{})
        self.assertEqual(error.exception.status_code,400)

    def test_invalid_frame_combinations_fail_before_supplier_submission(self):
        for kwargs in (
            {'images':[{'url':'asset://tail','role':'last_frame'}]},
            {'images':[{'url':'asset://a','role':'first_frame'},{'url':'asset://b','role':'first_frame'}]},
            {'images':[{'url':'asset://a','role':'first_frame'},{'url':'asset://b','role':'reference_image'}]},
            {'images':[{'url':'asset://a','role':'first_frame'}],'videos':['asset://video']},
            {'images':[{'url':'asset://a','role':'first_frame'}],'audios':['asset://audio']},
            {'model':'doubao-seedance-2-5-260628','images':[{'url':'asset://a','role':'first_frame'}],'aspect_ratio':'16:9'},
            {'images':[{'url':'asset://a','role':'unknown'}]},
        ):
            with self.subTest(kwargs=kwargs),self.assertRaises(HTTPException) as error:
                self.capture(**kwargs)
            self.assertEqual(error.exception.status_code,400)


if __name__ == '__main__':
    unittest.main()
