from pathlib import Path
import unittest


CANVAS_JS = Path(__file__).parents[1] / "static" / "js" / "canvas.js"


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


class CanvasRunEntryTest(unittest.TestCase):
    def test_regular_run_does_not_trigger_connected_workflow(self):
        source = CANVAS_JS.read_text(encoding="utf-8")
        regular_run = _function_source(source, "runCanvasGenerate")
        cascade_run = _function_source(source, "runNodeCascade")

        self.assertNotIn("runOneCascadePass", regular_run)
        self.assertIn("runCascadeNodeByType(node, {cascade:false})", regular_run)
        self.assertIn("computeCascadeOrder(nodeId)", cascade_run)


if __name__ == "__main__":
    unittest.main()
