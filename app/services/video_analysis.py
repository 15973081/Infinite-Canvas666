"""Timestamped samples covering a managed video, without an extra upstream call."""
import asyncio,base64,json,math,shutil,subprocess
from fastapi import HTTPException


class VideoAnalysisError(HTTPException):
    """Video preparation failed before the model POST could be dispatched."""


def sample_file(path,frame_count=12,max_size=768):
    if type(frame_count) is not int or frame_count not in {6,12,24} or type(max_size) is not int or not 16<=max_size<=1536:
        raise VideoAnalysisError(422,'视频取帧参数无效')
    ffmpeg,ffprobe=shutil.which('ffmpeg'),shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:raise VideoAnalysisError(503,'视频解析需要 FFmpeg 和 FFprobe')
    try:
        probe=subprocess.run([ffprobe,'-v','error','-select_streams','v:0','-show_entries','format=duration:stream=codec_type,width,height,duration','-of','json',str(path)],capture_output=True,timeout=20,check=True)
        info=json.loads(probe.stdout);streams=info.get('streams') or []
        if not streams or streams[0].get('codec_type')!='video':raise ValueError('No video stream')
        duration=0
        for value in [streams[0].get('duration'),(info.get('format') or {}).get('duration')]:
            try:duration=float(value)
            except (TypeError,ValueError):continue
            if math.isfinite(duration) and duration>0:break
        if not math.isfinite(duration) or duration<=0:raise ValueError('Invalid duration')
        count=min(frame_count,max(2,math.ceil(duration)));frames=[]
        for index in range(count):
            timestamp=duration*(index+.5)/count
            process=subprocess.run([ffmpeg,'-v','error','-ss',f'{timestamp:.6f}','-i',str(path),'-map','0:v:0','-frames:v','1',
                '-vf',f'scale=w=min({max_size}\\,iw):h=min({max_size}\\,ih):force_original_aspect_ratio=decrease',
                '-threads','1','-f','image2pipe','-vcodec','mjpeg','pipe:1'],capture_output=True,timeout=30,check=True)
            if not process.stdout or not process.stdout.startswith(b'\xff\xd8'):raise ValueError('Empty video frame')
            frames.append({'time':round(timestamp,3),'url':'data:image/jpeg;base64,'+base64.b64encode(process.stdout).decode('ascii')})
        return {'duration':round(duration,3),'frames':frames,'sampling':'uniform','audio_included':False}
    except (OSError,ValueError,subprocess.SubprocessError) as exc:
        raise VideoAnalysisError(400,'视频无法完整取帧，请核对素材或重新上传') from exc


async def sample_managed_video(url,frame_count=12):
    from app.services.media import output_file_from_url
    from app.storage.media import operation_scope
    with operation_scope():
        path=await asyncio.to_thread(output_file_from_url,url)
        if not path:raise VideoAnalysisError(400,'请先将解析视频保存到当前工作空间的素材库')
        return await asyncio.to_thread(sample_file,path,frame_count)
