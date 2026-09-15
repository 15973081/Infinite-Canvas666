"""Build the independent, dependency-free management frontend artifact."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ('index.html', 'management.css', 'management.js', 'provider-prices.js', 'provider-editor.js', 'model-billing.js', 'billing-view.js', 'billing-view.css')


def build(destination=None):
    destination = Path(destination or ROOT / '.local/management-dist')
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name in FILES:
        source = ROOT / ('static/js' if name == 'billing-view.js' else 'static/css' if name == 'billing-view.css' else 'management/frontend') / name
        data = source.read_bytes()
        (destination / name).write_bytes(data)
        manifest[name] = hashlib.sha256(data).hexdigest()
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return destination


if __name__ == '__main__':
    print(build())
