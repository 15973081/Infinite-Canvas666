"""Freeze the reference's standalone recorder, without Svelte or account code."""
import argparse
import hashlib
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--bundle', required=True)
args = parser.parse_args()
source = Path(args.bundle).read_text(encoding='utf-8')
start = source.index('var Tz=class extends Error{')
end = source.index(',GGe={};', start)
recorder = source[start:end] + ';'
assert 'var WGe=class' in recorder and 'requiredVoiceFrames' in recorder and 'dispose()' in recorder
target = Path(__file__).resolve().parents[1] / 'static/vendor/pixmax/voice-recorder.js'
target.write_text('// Native Pixmax WGe recorder; source segment SHA256: ' + hashlib.sha256(recorder.encode()).hexdigest()
                  + '\n(() => {\n' + recorder + '\nwindow.PixmaxVoiceRecorder=WGe;\n})();\n', encoding='utf-8')
print('Frozen standalone recorder:', target, target.stat().st_size, 'bytes')
