"""Freeze the public stage library referenced by the supplied editor runtime."""
import concurrent.futures
import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'static/vendor/pixmax/previs'
BASE = 'https://pixmax-prod.oss-cn-beijing.aliyuncs.com/previs/'

def fetch(relative):
    destination = ROOT / relative
    if destination.is_file() and destination.stat().st_size:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(BASE + relative, timeout=30) as response:
                data = response.read()
            temporary = destination.with_suffix(destination.suffix + '.part')
            temporary.write_bytes(data)
            temporary.replace(destination)
            return
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)

if __name__ == '__main__':
    fetch('animations/catalog.runtime.v1.json')
    catalog = json.loads((ROOT / 'animations/catalog.runtime.v1.json').read_text())
    resources = ['characters/x-bot.fbx'] + ['animations/clips/' + entry['id'] + '.anim' for entry in catalog['entries']]
    failed = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        jobs = {executor.submit(fetch, resource):resource for resource in resources}
        for count, job in enumerate(concurrent.futures.as_completed(jobs), 1):
            try:
                job.result()
            except Exception as error:
                failed.append({'resource':jobs[job], 'error':str(error)})
            if count % 250 == 0:
                print(f'{count}/{len(resources)} resources checked', flush=True)
    print(json.dumps({'resources':len(resources), 'failed':failed}), flush=True)
    if failed:
        raise SystemExit(1)
