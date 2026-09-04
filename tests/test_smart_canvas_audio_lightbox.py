from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]
MAIN_PY = ROOT / "main.py"
CANVAS_JS = ROOT / "static" / "js" / "canvas.js"
SMART_CANVAS_JS = ROOT / "static" / "js" / "smart-canvas.js"
SMART_CANVAS_HTML = ROOT / "static" / "smart-canvas.html"
SMART_CANVAS_CSS = ROOT / "static" / "css" / "smart-canvas.css"


def _source_between(source: str, start: str, end: str) -> str:
    start_index = source.index(start)
    return source[start_index : source.index(end, start_index)]


class SmartCanvasAudioLightboxTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SMART_CANVAS_JS.read_text(encoding="utf-8")
        cls.page = SMART_CANVAS_HTML.read_text(encoding="utf-8")
        cls.styles = SMART_CANVAS_CSS.read_text(encoding="utf-8")
        cls.main_source = MAIN_PY.read_text(encoding="utf-8")
        cls.canvas_source = CANVAS_JS.read_text(encoding="utf-8")

    def test_audio_nodes_render_lightweight_open_buttons(self):
        thumb_media = _source_between(
            self.source,
            "function thumbMediaHtml(",
            "function imageResolutionLabel(",
        )
        single_media = _source_between(
            self.source,
            "function singleMediaHtml(",
            "function smartNodeHasLiveMedia(",
        )

        self.assertIn("smart-audio-open", thumb_media)
        self.assertIn("smart-audio-open", single_media)
        self.assertIn("smartAudioWaveformSvg()", single_media)
        self.assertNotIn("<audio", thumb_media)
        self.assertNotIn("<audio", single_media)

    def test_audio_nodes_use_compact_audio_specific_layout(self):
        layout = _source_between(
            self.source,
            "function singleImageLayout(",
            "function groupImageGridLayout(",
        )

        self.assertIn("isAudioMediaItem(image)", layout)
        self.assertIn("width:300", layout)
        self.assertIn("height:180", layout)

    def test_audio_lightbox_owns_the_only_dynamic_player(self):
        lightbox = _source_between(
            self.source,
            "let smartAudioLightboxState",
            "function isSmartPreviewImage(",
        )

        self.assertIn("document.createElement('audio')", lightbox)
        self.assertIn("smartAudioLightboxHost.replaceChildren(audio)", lightbox)
        self.assertIn("smartAudioLightboxHost?.replaceChildren()", lightbox)
        self.assertIn("audio.removeAttribute('src')", lightbox)
        self.assertIn('id="smartAudioLightboxHost"', self.page)
        self.assertNotIn('<audio id="smartAudioLightbox', self.page)

    def test_audio_buttons_and_preview_route_open_the_audio_lightbox(self):
        node_events = _source_between(
            self.source,
            "function bindNodeEvents(",
            "function rectOverlapNode(",
        )
        preview = _source_between(
            self.source,
            "function openImagePreview(",
            "function openImageEditor(",
        )

        self.assertIn("querySelectorAll('.smart-audio-open')", node_events)
        self.assertIn("openSmartAudioLightbox(id, imageIndex)", node_events)
        self.assertIn("return openSmartAudioLightbox(nodeId, imageIndex)", preview)

    def test_escape_closes_the_audio_lightbox(self):
        keydown = _source_between(
            self.source,
            "window.addEventListener('keydown'",
            "window.addEventListener('keyup'",
        )

        self.assertIn("smartAudioLightbox.classList.contains('open')", keydown)
        self.assertIn("closeSmartAudioLightbox()", keydown)

    def test_page_references_the_audio_lightbox_bundle(self):
        self.assertIn("/static/js/smart-canvas.js", self.page)
        self.assertIn("/static/css/smart-canvas.css", self.page)
        self.assertIn(".smart-audio-lightbox { position:fixed", self.styles)

    def test_leaving_the_page_releases_the_lightbox_player(self):
        self.assertIn("window.addEventListener('pagehide'", self.source)
        self.assertIn("releaseSmartAudioLightboxPlayer()", self.source)

    def test_smart_canvas_shell_cannot_be_reused_from_stale_cache(self):
        self.assertIn('http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"', self.page)
        self.assertIn("VersionedStaticFiles", self.main_source)
        self.assertIn('app.mount("/static", VersionedStaticFiles(', self.main_source)
        self.assertIn("window.FrontendVersion?.versionedUrl(target)", self.canvas_source)


if __name__ == "__main__":
    unittest.main()
