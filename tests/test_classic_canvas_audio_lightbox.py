from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]
CANVAS_JS = ROOT / "static" / "js" / "canvas.js"
CANVAS_HTML = ROOT / "static" / "canvas.html"


def _source_between(source: str, start: str, end: str) -> str:
    start_index = source.index(start)
    return source[start_index : source.index(end, start_index)]


def _function_source(source: str, name: str) -> str:
    start = source.index(f"function {name}(")
    brace = source.index("{", start)
    depth = 0
    for index in range(brace, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start : index + 1]
    raise AssertionError(f"Unclosed function: {name}")


class ClassicCanvasAudioLightboxTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CANVAS_JS.read_text(encoding="utf-8")
        cls.page = CANVAS_HTML.read_text(encoding="utf-8")

    def test_audio_nodes_render_lightweight_cards_without_players(self):
        render_node = _function_source(self.source, "renderNode")
        live_media = _source_between(
            self.source,
            "function nodeHasLiveMedia(",
            "function captureMediaPlaybackState(",
        )

        self.assertIn('class="audio-card-open"', render_node)
        self.assertNotIn("<audio", render_node)
        self.assertIn("mediaKindForNode(node) === 'video'", live_media)

    def test_output_audio_cards_do_not_mount_players(self):
        output_media = _source_between(
            self.source,
            "function renderOutputMedia(",
            "function outputGridLayout(",
        )
        output_binding = _function_source(self.source, "bindOutputWrap")

        self.assertIn('class="output-audio-card"', output_media)
        self.assertNotIn("<audio", output_media)
        self.assertIn("openOutputLightbox(url, node)", output_binding)

    def test_lightbox_creates_one_audio_player_and_destroys_it_on_close(self):
        lightbox = _source_between(
            self.source,
            "function releaseOutputLightboxAudio(",
            "function closeOutputLightbox(",
        )
        close_lightbox = _source_between(
            self.source,
            "function closeOutputLightbox(",
            "function groupSelectedImages(",
        )

        self.assertIn("document.createElement('audio')", lightbox)
        self.assertIn("outputLightboxAudioHost.replaceChildren(audio)", lightbox)
        self.assertIn("outputLightboxAudioHost?.replaceChildren()", lightbox)
        self.assertIn("releaseOutputLightboxAudio()", close_lightbox)
        self.assertIn('id="outputLightboxAudioHost"', self.page)
        self.assertNotIn('<audio id="outputLightboxAudio', self.page)

    def test_audio_nodes_are_allowed_to_open_the_shared_lightbox(self):
        preview = _source_between(
            self.source,
            "function openImageNodePreview(",
            "function openOutputNodeMenu(",
        )

        self.assertIn("['image','video','audio']", preview)
        self.assertIn("openOutputLightbox(node.url, node)", preview)

    def test_leaving_the_page_releases_the_lightbox_player(self):
        self.assertIn("window.addEventListener('pagehide'", self.source)
        self.assertIn("releaseOutputLightboxAudio()", self.source)


if __name__ == "__main__":
    unittest.main()
