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
