"""Offline inventory of a stopped, consistent legacy backup. Never fetch URLs."""
import hashlib
import json
from urllib.parse import urlsplit, urlunsplit

from app.storage import media


DOCUMENTS = (
    ("canvas_folders.json", "canvas_folders"), ("asset_library.json", "asset_library"),
    ("prompt_libraries.json", "prompt_libraries"), ("api_providers.json", "api_providers"),
    ("shared_folders.json", "shared_folders"), ("maintenance_state.json", "maintenance"),
)
MEDIA_FIELDS = {"url", "src", "path", "image", "images", "video", "videos", "audio", "audios",
                "image_url", "video_url", "audio_url", "thumbnail", "thumbnail_url", "preview_url",
                "reference_images", "references", "frames", "outputs", "media_asset_id"}
OPAQUE = {"prompt", "text", "name", "description", "cost", "billing_price", "registrations",
          "asset_uri", "asset_uris", "api_key", "authorization"}


def checked_path(root, path):
    if not path.resolve().is_relative_to(root):
        raise ValueError("Source path escapes backup root: " + path.relative_to(root).as_posix())
    return path


def read_json(root, path):
    return json.loads(checked_path(root, path).read_text(encoding="utf-8-sig"))


class Audit:
    def __init__(self, root, report):
        self.root, self.report = root, report
        self.known = set()
        self.seen = set()
        self.category_files = set()
        self.report.update(inventory={}, reference_issues=[], external_refs=[], unknown_json=[],
                           browser_local_storage={"status": "not_provided", "imported": False,
                           "note": "Browser storage is not in server backups; export and review required keys separately."})

    def record(self, category, path, records=1):
        item = self.report["inventory"].setdefault(category, {"files": 0, "records": 0, "bytes": 0})
        if path is not None:
            checked_path(self.root, path)
            relative = path.relative_to(self.root).as_posix()
            if (category, relative) not in self.category_files:
                item["files"] += 1
                item["bytes"] += path.stat().st_size
                self.seen.add(relative)
                self.category_files.add((category, relative))
        item["records"] += records

    def references(self, value, source, pointer="", in_media=False):
        if isinstance(value, dict):
            for key, child in value.items():
                if key.lower() not in OPAQUE:
                    escaped = key.replace("~", "~0").replace("/", "~1")
                    self.references(child, source, pointer + "/" + escaped, key.lower() in MEDIA_FIELDS)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                self.references(child, source, pointer + "/" + str(index), in_media)
        elif isinstance(value, str):
            issue = {"source": source, "pointer": pointer}
            if value.startswith(("/assets/", "/output/")) and not media.id_from_ref(value):
                try:
                    ref = media.canonical_legacy(value)
                except Exception:
                    ref = None
                if ref in self.known:
                    return
                issue.update(kind="missing_local" if ref else "invalid_local", ref=ref or value)
                if (ref or value) not in self.report["missing_refs"]:
                    self.report["missing_refs"].append(ref or value)
            elif in_media and value.startswith(("http://", "https://")):
                # Report location without passwords/signatures, retaining an identity hash.
                try:
                    parsed = urlsplit(value)
                    host = parsed.hostname or ""
                    issue.update(kind="external_unverified", ref=urlunsplit((parsed.scheme, host, parsed.path, "", "")))
                except ValueError:
                    issue.update(kind="invalid_external", ref="[invalid URL]")
                issue["sha256"] = hashlib.sha256(value.encode()).hexdigest()
                self.report["external_refs"].append(issue)
            elif in_media and (media.id_from_ref(value) or value.startswith("data:")):
                issue.update(kind="unmapped_media_id" if not value.startswith("data:") else "embedded_media",
                             ref=value if not value.startswith("data:") else "[embedded media]")
            else:
                return
            self.report["reference_issues"].append(issue)

    def scan(self, snapshot_sqlite, ledger_columns):
        for category in ("assets", "output", "canvas", "canvas_backup", "conversation", "history",
                         "tasks", "browser_local_storage", *(kind for _, kind in DOCUMENTS), *ledger_columns):
            self.record(category, None, 0)
        for folder in ("assets", "output"):
            for path in sorted((self.root / folder).rglob("*")):
                if path.is_file():
                    checked_path(self.root, path)
                    self.known.add("/" + path.relative_to(self.root).as_posix())
                    self.record(folder, path)
        patterns = [("canvas", "data/canvases/*.json"), ("canvas_backup", "data/canvases/backups/*/*.json"),
                    ("conversation", "conversations/*/*.json"), ("conversation", "data/conversations/*/*.json"),
                    ("history", "history.json"), ("browser_local_storage", "localStorage.json")]
        patterns.extend((kind, "data/" + name) for name, kind in DOCUMENTS)
        identities = {}
        for category, pattern in patterns:
            for path in sorted(self.root.glob(pattern)):
                value = read_json(self.root, path)
                relative = path.relative_to(self.root).as_posix()
                if category in {"canvas", "conversation"}:
                    identity = (category, value["id"] if category == "canvas" else path.parent.name + "/" + path.stem)
                    fingerprint = hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
                    if identity in identities and identities[identity] != fingerprint:
                        raise ValueError("Conflicting source document identity: " + category + " " + relative)
                    identities[identity] = fingerprint
                self.record(category, path, len(value) if category == "history" else 1)
                self.references(value, relative)
                if category == "browser_local_storage":
                    self.report["browser_local_storage"].update(status="requires_manual_review", source=relative)
        for filename, category in (("canvas_tasks.sqlite3", "tasks"), ("canvas_ledger.sqlite3", "ledger")):
            path = self.root / "data" / filename
            if not path.exists():
                continue
            snapshot = snapshot_sqlite(checked_path(self.root, path))
            try:
                for table in (ledger_columns if category == "ledger" else ("canvas_tasks",)):
                    count = 0
                    for row in snapshot.execute("SELECT * FROM " + table):
                        for key in row.keys():
                            if key.endswith("_json") and row[key]:
                                self.references(json.loads(row[key]), "data/" + filename,
                                                "/" + table + "/" + str(count) + "/" + key)
                        count += 1
                    self.record(table if category == "ledger" else category, path, count)
            finally:
                snapshot.close()
        # Limit discovery to legacy data locations, not dependencies or source code.
        for base in (self.root / "data", self.root / "conversations"):
            for path in sorted(base.rglob("*.json")):
                checked_path(self.root, path)
                relative = path.relative_to(self.root).as_posix()
                if relative not in self.seen:
                    self.report["unknown_json"].append(relative)

    def needs_review(self):
        return bool(self.report["reference_issues"] or self.report["unknown_json"] or
                    self.report["browser_local_storage"]["status"] == "requires_manual_review")
