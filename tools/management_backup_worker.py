"""Execute management backup jobs separately from web and generation workers."""
import argparse
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--watch',action='store_true',help='Continue polling every five seconds')
    parser.add_argument('--verify-workspace',type=Path,help='Verify a completed workspace export offline')
    parser.add_argument('--stop-file',type=Path,help='Stop polling when this local file exists; finish current work first')
    args=parser.parse_args()
    if args.verify_workspace:
        from app.storage.workspace_export import verify
        result=verify(args.verify_workspace)
        print(json.dumps({'valid':True,'workspace_id':result['workspace_id'],'objects':result['object_count']}))
        return
    from app.storage.settings import load_storage_env
    from app.storage import database
    from app.services.backup_control import backup_root,run_one
    load_storage_env()
    database.check()
    backup_root()
    try:
        while not (args.stop_file and args.stop_file.exists()):
            print(json.dumps(run_one(),ensure_ascii=False,default=str),flush=True)
            if not args.watch:
                break
            time.sleep(5)
    finally:
        database.close()


if __name__=='__main__':
    main()
