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
            'provider_key_env':lambda _:'UNIT_TEST_ARK_KEY',
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
            stack.enter_context(patch.dict('os.environ', {'UNIT_TEST_ARK_KEY':'not-a-real-key'}))
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
        self.assertEqual(body['content'][1]['type'], 'video_url')

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


if __name__ == '__main__':
    unittest.main()
