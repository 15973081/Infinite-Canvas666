from pathlib import Path
import unittest


SMART_CANVAS_JS = Path(__file__).parents[1] / "static" / "js" / "smart-canvas.js"


def _source_between(source: str, start: str, end: str) -> str:
    start_index = source.index(start)
    return source[start_index : source.index(end, start_index)]


class SmartCanvasVideoResumeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SMART_CANVAS_JS.read_text(encoding="utf-8")

    def test_video_submission_returns_a_background_task_id(self):
        video_submit = _source_between(
            self.source,
            "async function runApiVideoGeneration(",
            "async function runModelscopeGeneration(",
        )

        self.assertIn("fetch('/api/canvas-video-tasks'", video_submit)
        self.assertNotIn("fetch('/api/canvas-video'", video_submit)
        self.assertIn("const taskId = uid('canvas_vid')", video_submit)
        self.assertIn("client_task_id:taskId", video_submit)
        self.assertIn("taskIds:[taskId]", video_submit)
        self.assertIn("submission", video_submit)

    def test_pending_task_is_saved_before_polling(self):
        queue_task = _source_between(
            self.source,
            "async function queueAndResumeSmartApiTasks(",
            "function smartPendingTaskRun(",
        )

        self.assertIn("node.pendingTasks = taskIds.map", queue_task)
        self.assertIn("kind,", queue_task)
        self.assertLess(queue_task.index("await saveCanvas()"), queue_task.index("await resumeSmartPendingNode(node)"))
        self.assertLess(queue_task.index("await saveCanvas()"), queue_task.index("await taskResult.submission"))

    def test_resume_routes_video_tasks_to_the_video_endpoint(self):
        poll_task = _source_between(
            self.source,
            "async function pollSmartCanvasTask(",
            "function finalizeSmartPendingTask(",
        )
        resume_node = _source_between(
            self.source,
            "async function resumeSmartPendingNode(",
            "function resumeSmartPendingTasks(",
        )

        self.assertIn("const taskKind = kind === 'video' ? 'video' : 'image'", poll_task)
        self.assertIn("`/api/canvas-${taskKind}-tasks/", poll_task)
        self.assertIn("pollSmartCanvasTask(task.taskId, kind)", resume_node)
        self.assertIn("kind === 'video' ? resultMediaUrls(result)", resume_node)

    def test_regular_and_cascade_video_runs_persist_pending_tasks(self):
        regular_run = _source_between(
            self.source,
            "async function runGeneration(",
            "async function runPromptLLMNode(",
        )
        cascade_step = _source_between(
            self.source,
            "async function runCascadeStepIntoNode(",
            "async function runLoopRoundIntoSlot(",
        )
        loop_round = _source_between(
            self.source,
            "async function runLoopRoundIntoSlot(",
            "function appendCascadeRefsToReceiver(",
        )

        self.assertIn("queueAndResumeSmartApiTasks(pendingNode", regular_run)
        self.assertIn("queueAndResumeSmartApiTasks(outputNode", cascade_step)
        self.assertIn("queueAndResumeSmartApiTasks(outputSlot", loop_round)

    def test_pending_task_metadata_keeps_the_generating_card_visible(self):
        render_node = _source_between(
            self.source,
            "function renderSmartNodeHtml(",
            "function bindSmartNodeEvents(",
        )
        node_body = _source_between(
            self.source,
            "function nodeBodyHtml(",
            "function smartRecoverableImageTask(",
        )

        self.assertIn("const pendingCount = smartNodePendingCount(node)", render_node)
        self.assertIn("tr('canvas.generating')", render_node)
        self.assertIn("if(pendingCount && imgs.length === 0)", node_body)


if __name__ == "__main__":
    unittest.main()
