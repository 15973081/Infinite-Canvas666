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


def _source_between(source: str, start: str, end: str) -> str:
    start_index = source.index(start)
    return source[start_index : source.index(end, start_index)]


class CanvasRunEntryTest(unittest.TestCase):
    def test_regular_run_does_not_trigger_connected_workflow(self):
        source = CANVAS_JS.read_text(encoding="utf-8")
        regular_run = _function_source(source, "runCanvasGenerate")
        cascade_run = _function_source(source, "runNodeCascade")

        self.assertNotIn("runOneCascadePass", regular_run)
        self.assertIn("runCascadeNodeByType(node, {cascade:false})", regular_run)
        self.assertIn("computeCascadeOrder(nodeId)", cascade_run)

    def test_stopped_cascade_keeps_pending_tasks_tracked(self):
        source = CANVAS_JS.read_text(encoding="utf-8")
        image_run = _source_between(source, "async function runGenerator(", "async function runGeneratorLegacy(")
        video_run = _source_between(source, "async function runVideoNode(", "async function uploadCanvasUrlToComfy(")
        resume_pending = _function_source(source, "resumePendingAfterCascadeStop")

        image_abort = image_run.index("if(isCascadeAbortError(err))")
        image_remove = image_run.index("const removableIds", image_abort)
        self.assertLess(image_abort, image_remove)
        self.assertIn("remainingPending.forEach(resumePendingAfterCascadeStop)", image_run)

        video_abort = video_run.index("if(isCascadeAbortError(err))")
        video_remove = video_run.index("currentOut._pending", video_abort)
        self.assertLess(video_abort, video_remove)
        self.assertIn("find(p => p.id === pendingId)", video_run)
        self.assertIn("resumePendingAfterCascadeStop(pendingForRun)", video_run)

        self.assertIn("pending.cascadeTargetId = ''", resume_pending)
        self.assertIn("pollCanvasImageTask(pending.canvasTaskId)", resume_pending)
        self.assertIn("pollCanvasVideoTask(pending.canvasTaskId)", resume_pending)

    def test_recoverable_failure_stops_cascade_before_downstream(self):
        source = CANVAS_JS.read_text(encoding="utf-8")
        image_run = _source_between(source, "async function runGenerator(", "async function runGeneratorLegacy(")

        cascade_throw = image_run.index("if(opts.cascade) throw err", image_run.index("const removableIds"))
        recoverable_return = image_run.index("recoverTaskId) && !removableIds.length) return")
        self.assertLess(cascade_throw, recoverable_return)

    def test_parallel_cascade_stops_scheduling_after_first_failure(self):
        source = CANVAS_JS.read_text(encoding="utf-8")
        scheduler = _function_source(source, "runLimitedCascadeRounds")

        self.assertIn("let failed = false", scheduler)
        self.assertIn("while(!failed && next < rounds.length)", scheduler)
        self.assertLess(scheduler.index("failed = true"), scheduler.index("throw err"))

    def test_output_connections_cannot_bypass_cycle_detection(self):
        source = CANVAS_JS.read_text(encoding="utf-8")
        can_connect = _function_source(source, "canConnect")

        self.assertIn("if(to.type === 'output') return !wouldCreateGeneratorCycle(fromId, toId)", can_connect)
        self.assertIn("from.type !== 'output' || !wouldCreateGeneratorCycle(fromId, toId)", can_connect)

    def test_cascade_reserves_every_node_in_workflow(self):
        source = CANVAS_JS.read_text(encoding="utf-8")
        reset = _function_source(source, "resetCascadeRuntimeState")
        begin = _source_between(source, "function beginCascade(", "function queueCascadeCleanup(")
        finalize = _source_between(source, "function finalizeCascade(", "function cascadeTargetIdFromOptions(")
        regular_run = _function_source(source, "runCanvasGenerate")
        busy_node = _function_source(source, "cascadeBusyNodeId")
        cascade_run = _source_between(source, "async function runNodeCascade(", "async function runOneCascadePass(")
        retry_run = _source_between(source, "async function retryNodeAndDownstream(", "function cancelCascade(")

        self.assertIn("cascadeRunningNodeIds.clear()", reset)
        self.assertIn("ctx.order.forEach(id => cascadeRunningNodeIds.add(id))", begin)
        self.assertIn("cascadeRunningNodeIds.delete(id)", finalize)
        self.assertIn("cascadeRunningNodeIds.has(nodeId)", regular_run)
        self.assertIn("?.running", busy_node)
        self.assertIn("cascadeBusyNodeId(order)", cascade_run)
        self.assertIn("cascadeBusyNodeId(remain)", retry_run)

    def test_retry_runs_failed_node_and_reachable_downstream_in_order(self):
        source = CANVAS_JS.read_text(encoding="utf-8")
        retry_order = _function_source(source, "computeRetryCascadeOrder")
        retry_run = _source_between(source, "async function retryNodeAndDownstream(", "function cancelCascade(")

        self.assertIn("connections.filter(c => c.from === id)", retry_order)
        self.assertIn("next.type === 'output'", retry_order)
        self.assertIn("computeCascadeOrder(id)", retry_order)
        self.assertIn("downstream.has(candidate)", retry_order)
        self.assertIn("const remain = computeRetryCascadeOrder(nodeId)", retry_run)
        self.assertNotIn("computeCascadeOrder(nodeId)", retry_run)

    def test_parallel_loop_context_is_passed_per_run(self):
        source = CANVAS_JS.read_text(encoding="utf-8")
        generator_sources = _function_source(source, "generatorSources")
        loop_prompt_items = _function_source(source, "loopInputPromptItems")
        context_run = _source_between(source, "function runCascadeNodeWithLoopContext(", "function cascadeParallelLimit(")
        cascade_run = _source_between(source, "async function runNodeCascade(", "async function runOneCascadePass(")

        self.assertNotIn("let loopContext =", source)
        self.assertNotIn("_activeLoopCtx", source)
        self.assertIn("function generatorSources(gen, loopCtx=null, graph=null)", generator_sources)
        self.assertIn("const ctx = loopCtx", generator_sources)
        self.assertIn("renderLoopPrompt(n, ctx, graph)", loop_prompt_items)
        self.assertIn("renderLoopPrompt(n, ctx, graph)", generator_sources)
        self.assertIn("{...opts, loopContext:ctx || null}", context_run)
        self.assertIn("generatorSources(node, opts.loopContext)", source)
        self.assertIn("generatorSources(gen, opts.loopContext)", source)
        self.assertIn("llmInputText(node, opts.loopContext)", source)
        self.assertIn("const loopCtx = loop ?", cascade_run)
        self.assertEqual(2, cascade_run.count("runCascadeNodeWithLoopContext(node, loopCtx"))


if __name__ == "__main__":
    unittest.main()
