# Workbench responsiveness and large-canvas saves

Changing a cover was the first visible symptom. Several other workbench routes
also performed synchronous PostgreSQL, object-store or archive work on the ASGI
event loop, so one slow operation could stall unrelated requests and lease
heartbeats. Large historical canvases also repeated the same asset queries and
JSON decompression hundreds of times.

## Changes

- Run synchronous canvas, asset-library, prompt, conversation and history routes
  in FastAPI's worker pool. Keep WebSocket broadcasts and task scheduling on the
  event loop; offload their database preparation and saves as a complete unit.
- Resolve unique media references with scoped batch queries and insert canvas
  asset membership in one statement. Preserve readiness checks, workspace
  isolation, internal-result restrictions, row locks and revision checks.
- Expand directory JSON once per canvas instead of repeatedly decompressing it
  for every label. Return the same directory metadata without nodes or logs.
- Query backup metadata without transferring full backup documents. Filter
  unsupported filenames before inspecting their contents.
- Keep edit-lease status, renewal and subscription checks small. Operations that
  need a release snapshot or task-result merge still request the full document.
- Bound preview generation to four concurrent operations per application event
  loop, with one generation per workspace/asset/width. Apply the bound to both
  preview entry points, and keep original-object reads and signing off the loop.
- Close local SQLite task connections deterministically, including failures.
- Render structured asset errors as readable messages, including export errors.

No schema migration, generation-provider call, ownership change or public-object
access is required. Media remains in private TOS and metadata in PostgreSQL.

## Production-data benchmark

Read-only measurements against the same 554-node, 2.29 MB historical canvas and
311-entry active directory. Median of three runs per case; these are storage
operation timings, not end-to-end browser rendering times.

| Operation | Before | After | Verification |
| --- | ---: | ---: | --- |
| Normalize media references | 5,376 ms / 1,991 queries | 45 ms / 2 queries | Identical response SHA-256 |
| List backups for this canvas | 1,137 ms | 7 ms | Identical response SHA-256 |
| List active canvases | 2,722 ms | 218 ms | Identical response SHA-256 |

The backup fixture has no user-facing numeric-timestamp backup filenames; the
previous implementation still loaded and decoded retained historical backups
before filtering them out. Nonempty backup lists are covered by integration
tests. Directory query count remains five; the improvement comes from avoiding
repeated decompression, not caching permissions or data.

## Regression coverage

`tests/test_workbench_responsiveness.py` injects slow storage and verifies that
unrelated ASGI requests still respond. It also exercises concurrent preview
requests through the content endpoint and checks the shared bound and duplicate
suppression. Batch-lookup tests cover readiness, missing/deleted assets, internal
results, workspace scoping, literal prompts and historical billing preservation.

`tools/cloud_test.py` runs the real PostgreSQL integration suite in a disposable
schema on an explicit loopback test database, using a private local object-store
fixture. The large-canvas scenario saves 900 nodes referring to 300 unique assets,
checks bounded query count and retained membership, creates and lists a backup,
verifies the release snapshot, and rejects a stale editing lease.

These changes address measured server bottlenecks and concurrency regressions;
they do not establish a maximum supported concurrent-user count or guarantee
that all browser-side rendering and network bottlenecks have been eliminated.

## Release verification

The workbench, management, task worker and backup worker were gracefully
restarted with the same candidate source after confirming there were no active
generation or backup jobs. All four services were active after the restart.
Authenticated HTTPS probes measured directory reads at 444 ms (previously
2,959 ms), backup listing at 60 ms (previously 1,153 ms), and a same-style cover
save at 297 ms. The cover check compared the entire document excluding revision:
content and timestamps were unchanged, revision advanced once, stale writes
returned 409, and the probe's edit lease and login were released. Unauthenticated
reads returned 401, foreign-workspace canvas reads 404, and original media used
a private HTTPS redirect. Four concurrent directory reads after warming took
746–812 ms; the first concurrent batch took 3.2–4.2 seconds, so these measurements
are not a cold-start latency guarantee.

Validation on Windows/Python 3.14:

- 54 focused Python checks and 63 frontend checks passed.
- The final isolated PostgreSQL run passed 354 tests and failed 26. Every failed
  test also failed on the pre-change `c365908` baseline; the final run introduced
  no additional failing test cases. This is **not an all-green full suite**.
- Remaining failures concern simulated models missing from allowed catalogs,
  recovery fixtures expecting historical mock billing amounts, and an old TOS
  assertion that omits the existing private response-cache-control parameter.
  Production model permissions and billing checks were not relaxed to make
  these fixtures pass.
- The run used `PYTHONIOENCODING=utf-8` for Windows CLI child processes; without
  it, decoding failures caused misleading maintenance-recovery test failures.
- Full regression caught a task-binding call that requires complete canvas
  contents. It now explicitly requests them; all 17 binding-related checks in
  the targeted rerun passed. The new large-canvas save/snapshot test also passed.

The response hashes in the benchmark matched before and after. No test submitted
a real generation request; provider execution was simulated in the disposable
database. Existing migration-only working-tree changes were kept separate from
this performance release.
