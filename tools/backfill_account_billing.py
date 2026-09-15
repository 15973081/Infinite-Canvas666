"""Reconcile stored task expenses without contacting providers or changing task ownership."""
import argparse
import json
import os
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


def reconcile():
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    from app.storage.tasks import decode
    from app.services.canvas_ledger import record_task
    count, after = 0, ''
    while True:
        with connection() as conn:
            rows=conn.execute("SELECT * FROM tasks WHERE id>%s AND (status IN ('succeeded','failed') OR legacy_metadata->>'upstream_status'='succeeded') ORDER BY id LIMIT 100",(after,)).fetchall()
        if not rows: break
        for row in rows:
            with workspace_scope(row['workspace_id']):
                record_task(decode(row))
            count+=1
        after=rows[-1]['id']
    return count


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--env',required=True);p.add_argument('--database',required=True);p.add_argument('--schema',required=True)
    p.add_argument('--apply',action='store_true')
    args=p.parse_args()
    os.environ['STORAGE_ENV_FILE']=str(Path(args.env).resolve())
    from app.storage.settings import load_storage_env
    load_storage_env()
    from app.storage import database
    database.check()
    with database.connection() as conn:
        target=conn.execute('SELECT current_database() AS database,current_schema() AS schema').fetchone()
        if target!={'database':args.database,'schema':args.schema}: raise RuntimeError('Database target mismatch')
        count=conn.execute("SELECT count(*) AS count FROM tasks WHERE status IN ('succeeded','failed') OR legacy_metadata->>'upstream_status'='succeeded'").fetchone()['count']
    print(json.dumps({'eligible_tasks':count,'reconciled':reconcile() if args.apply else 0,'applied':args.apply}))
    database.close()


if __name__=='__main__': main()
