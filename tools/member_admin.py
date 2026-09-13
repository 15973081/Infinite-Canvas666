"""Trusted local bootstrap; passwords are read from the terminal, never argv."""
import argparse
import getpass
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main(argv=None):
    parser = argparse.ArgumentParser(description='Initialize the first platform administrator once')
    parser.add_argument('command', choices=['bootstrap'])
    parser.add_argument('--username', required=True)
    parser.add_argument('--name', required=True)
    args = parser.parse_args(argv)
    from app.storage.settings import load_storage_env, postgres_enabled
    from app.storage import database
    from app.services import members
    load_storage_env()
    if not postgres_enabled():
        parser.error('Member identities require DATABASE_BACKEND=postgres and an explicitly configured database')
    database.check()
    password = getpass.getpass('New administrator password (12+ characters): ')
    if password != getpass.getpass('Confirm password: '):
        parser.error('Passwords do not match')
    try:
        result = members.bootstrap(args.username, args.name, password)
        print(json.dumps(result, ensure_ascii=False))
    finally:
        database.close()


if __name__ == '__main__':
    main()
