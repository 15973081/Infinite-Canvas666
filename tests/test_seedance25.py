import asyncio

from fastapi import HTTPException

from app.services.media import (
    is_volcengine_seedance25_model,
    volcengine_seedance25_options,
    volcengine_seedance25_task_type,
    volcengine_video_reference_content_items,
)


def test_seedance25_rules():
    assert is_volcengine_seedance25_model("doubao-seedance-2-5-260628")
    assert volcengine_seedance25_task_type("替换@video1中的人物", 1) == "edit"
    assert volcengine_seedance25_options("替换@video1中的人物", 10, "16:9", "720p", 1) == (
        "edit", -1, "adaptive", "720p"
    )
    assert volcengine_seedance25_options("向后延长@video1", 30, "16:9", "480p", 1) == (
        "extend", 30, "adaptive", "480p"
    )
    assert volcengine_seedance25_options("继续镜头", 10, "16:9", "720p", 1, "extend") == (
        "extend", 10, "adaptive", "720p"
    )
    assert volcengine_seedance25_options("生成新镜头", -1, "21:9", "", 0) == (
        "reference", -1, "21:9", ""
    )
    try:
        volcengine_seedance25_options("生成新镜头", 31, "16:9", "720p", 0)
    except HTTPException as exc:
        assert exc.status_code == 400
    else:
        raise AssertionError("31 秒应被拒绝")
    try:
        volcengine_seedance25_options("生成新镜头", 10, "16:9", "4k", 0)
    except HTTPException as exc:
        assert exc.status_code == 400
    else:
        raise AssertionError("4k 应被拒绝")
    assert asyncio.run(volcengine_video_reference_content_items(
        "https://example.com/reference.mp4", direct_video=True
    )) == [{
        "type": "video_url",
        "video_url": {"url": "https://example.com/reference.mp4"},
        "role": "reference_video",
    }]


if __name__ == "__main__":
    test_seedance25_rules()
