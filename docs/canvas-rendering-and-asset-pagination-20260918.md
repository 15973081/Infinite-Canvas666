# Canvas rendering and asset pagination — 2026-09-18

Changing a node's settings now preserves unrelated canvas DOM. Smart-canvas full
render calls reconcile nodes by ID, rendered markup and node-object identity;
prompt/loop controls use the existing affected-node update path directly. Classic
canvas loop, LLM, video and workflow controls also update their own nodes. Geometry
correction receives the affected IDs, while connection topology and cascade-state
changes still invalidate the relevant edges. Media, input focus and unchanged
event bindings survive unrelated edits.

Canvas assets now load 60 items per page. PostgreSQL performs search, source-state,
canvas/category filtering and sorting before returning a page. The UI replaces
the previous page instead of accumulating it, cancels superseded requests and
rejects stale responses. Selection is explicitly limited to the current page.
Errors and timeouts leave a retry action; clearing search fetches fresh results.

Migration 024 adds a rebuildable asset-list projection. Canvas saves maintain it
in the same transaction as durable membership; legacy groups are backfilled once.
A trigger invalidates the projection when an older writer changes membership.
Catalog metadata, live aliases, retained snapshots, trash and pending deletion
states are joined at query time. Existing unpaged API consumers remain compatible.
Formal media storage remains private TOS; records and this index are PostgreSQL.

## Observed results

| Check | Before | After |
|---|---:|---:|
| First asset-list HTTP response | 11,925,382 bytes | 147,008 bytes |
| First response item count | 17,757 | 60 |
| First response elapsed time | 2,008 ms | 723 ms |
| 2,000-node browser fixture, 7 single-node edits: nodes constructed/bound | 14,000 | 7 |

Response size decreased 98.8%. Three subsequent page requests took 737, 619 and
606 ms. These are observations from the deployed environment, not a controlled
whole-application speedup claim. The browser fixture uses synthetic node bodies;
it verifies real DOM identity, input focus/selection, video-element retention and
event bindings, not production-frame-rate improvement. Smart full renders still
inspect node markup; this change avoids rebuilding unchanged DOM.

The production acceptance compared all 17,777 assets from 322 active/deleted
canvas groups against the previous catalog implementation. Item content and all
canvas/category counts matched. The active-canvas HTTP baseline above excludes
deleted groups. Index backfill took 1,518 ms and left zero unindexed groups.

## Validation and deployment

- 110 frontend checks passed, covering node/edge reuse, geometry, selection,
  deletion, media visibility, stale page replies and timeout handling.
- Real-browser asset-manager fixture passed first-page, next-page, empty-search,
  clear-search, per-canvas filtering, bounded DOM and interactivity checks.
- Focused Python checks: 11 passed, 1 skipped. Full isolated PostgreSQL regression:
  356 passed, 26 failed. All 26 failures also occur in the previous release; they
  concern existing model/billing/cache fixtures. No new failing cases were found.
- Deployed HTTP checks: anonymous access 401, invalid page size 422, a legacy
  canvas queried in another workspace returns zero items, page IDs do not overlap,
  and search/trash requests succeed. Probe sessions were logged out.
- All four production services are active on the verified release. Deployed
  canvas, smart-canvas and asset-manager scripts match local SHA-256 hashes.

Apply schema updates with the project's `tools/cloud_storage.py init-db` workflow
before starting this version. A rollback must retain migration 024 in its schema
manifest; an unchanged older manifest rejects the newer database version. The
production rollout prepared a compatible rollback release. Do not drop business
data or object prefixes to roll back this additive change.

No verification called a paid generation provider. Unrelated migration changes,
local source files, clones and backups were excluded from this commit.
