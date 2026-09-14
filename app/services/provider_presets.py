"""Public onboarding presets, separate from saved credentials and space grants."""
import json
from pathlib import Path

PRESETS_FILE = Path(__file__).resolve().parents[2] / 'config' / 'provider-presets.json'


def catalog():
    from app.services.provider_control import normalized
    data = json.loads(PRESETS_FILE.read_text(encoding='utf-8'))
    result = {}
    for group in ('builtin', 'quickstart'):
        result[group] = [{'id': row['id'], 'description': row['description'],
                          'config': normalized(row['id'], row['config'])} for row in data[group]]
    return result
