"""Restore a trusted local backup to a separately provisioned empty PostgreSQL DB."""
import argparse
import json
import logging
import os
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',required=True,help='Verified local .dump bundle')
    parser.add_argument('--database',required=True,help='Expected name of an existing empty target database')
    parser.add_argument('--destination',required=True,help='New private output directory')
    parser.add_argument('--reason',required=True)
    parser.add_argument('--deletion-ledger',help='Current independent deletion ledger directory, if relocated')
    args=parser.parse_args(argv)
    # The target DSN is never put in argv, output or exception messages.
    url=os.getenv('RESTORE_DATABASE_URL')
    if not url:
        print(json.dumps({'ok':False,'code':'restore_database_url_required'}),file=sys.stderr)
        return 2
    logging.disable(logging.CRITICAL)
    try:
        from app.storage.restore import restore
        print(json.dumps({'ok':True,**restore(args.source,url,args.database,args.destination,reason=args.reason,
                                           deletion_ledger_directory=args.deletion_ledger)},ensure_ascii=False))
        return 0
    except (Exception,KeyboardInterrupt):
        print(json.dumps({'ok':False,'code':'restore_incomplete_keep_target_isolated'}),file=sys.stderr)
        return 1


if __name__=='__main__':
    raise SystemExit(main())
