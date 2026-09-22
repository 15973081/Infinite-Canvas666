"""Load the production eight-script canvas group for source regression tests."""
from pathlib import Path
import re


def read_canvas_source(filename):
    path = Path(filename)
    root = Path(__file__).resolve().parents[1]
    entries = {
        (root / "static/js/canvas.js").resolve(): "canvas.html",
        (root / "static/js/smart-canvas.js").resolve(): "smart-canvas.html",
    }
    page_name = entries.get(path.resolve())
    if not page_name:
        return path.read_text(encoding="utf-8")
    page = (root / "static" / page_name).read_text(encoding="utf-8")
    scripts = re.findall(r'<script\b[^>]*data-canvas-module="[^"]+"[^>]*src="([^"?]+)[^"]*"[^>]*>', page)
    if len(scripts) != 8:
        raise AssertionError("Expected eight canvas task modules in the production page")
    return "\n".join((root / url.lstrip("/")).read_text(encoding="utf-8") for url in scripts)


def canvas_function_source(source, name):
    """Read one top-level function without assuming its next file neighbour."""
    match = re.search(r"^(?:async )?function " + re.escape(name) + r"\(", source, re.M)
    if not match:
        raise AssertionError(f"Missing canvas function: {name}")
    start = match.start()
    first_line = source[start:source.index("\n", start)]
    if first_line.rstrip().endswith("}"):
        return first_line
    return source[start:source.index("\n}", start) + 2]
