"""Local maintenance recovery using existing PostgreSQL identities and permissions.

No HTTP service, bootstrap, migration, worker, or unauthenticated recovery mode.
Passwords come from a non-echoing terminal (or explicit --password-stdin).
"""
import argparse
import getpass
import json
import logging
import os
from pathlib import Path
import sys
import warnings

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class RecoveryError(Exception):
    def __init__(self, code, exit_code=2):
        self.code, self.exit_code = code, exit_code


class Parser(argparse.ArgumentParser):
    def error(self, message):
        # Never echo unexpected arguments, which might contain a password.
        raise RecoveryError('invalid_cli_arguments')


def arguments(argv=None):
    parser = Parser(description=__doc__)
    parser.add_argument('command', choices=['status', 'recover', 'reopen'])
    parser.add_argument('--storage-env', required=True, help='Explicit storage configuration file; exported variables take precedence')
    parser.add_argument('--database', required=True, help='Expected PostgreSQL database name')
    parser.add_argument('--schema', required=True, help='Expected configured schema')
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument('--platform', action='store_true')
    target.add_argument('--workspace', help='Explicit workspace ID')
    parser.add_argument('--username', required=True)
    parser.add_argument('--password-stdin', action='store_true', help='Read one password line from stdin instead of the terminal')
    parser.add_argument('--expected-version', type=int)
    parser.add_argument('--reason')
    parser.add_argument('--confirm-recovery', action='store_true', help='Confirm completed operational/data/recovery checks before reopening')
    args = parser.parse_args(argv)
    if (not args.database.strip() or not args.schema.strip() or not args.username.strip()
            or len(args.username)>64 or (args.workspace is not None and not args.workspace.strip())):
        parser.error('Invalid target')
    if args.command == 'status':
        if args.expected_version is not None or args.reason is not None or args.confirm_recovery:
            parser.error('Status cannot change state')
    else:
        if args.expected_version is None or args.expected_version<0 or not args.reason or not args.reason.strip() or len(args.reason)>1000:
            parser.error('Version and reason required')
        if args.confirm_recovery != (args.command == 'reopen'):
            parser.error('Explicit recovery confirmation required only for reopen')
    return args


def configure(args):
    from app.storage import database
    from app.storage.settings import load_storage_env, postgres_enabled
    if not Path(args.storage_env).is_file():
        raise RecoveryError('storage_configuration_unavailable', 5)
    os.environ['STORAGE_ENV_FILE'] = str(Path(args.storage_env).resolve())
    load_storage_env()
    if not postgres_enabled() or not os.getenv('DATABASE_URL'):
        raise RecoveryError('postgres_configuration_required', 5)
    if database.schema_name() != args.schema:
        raise RecoveryError('database_target_mismatch')
    with database.connection() as conn:
        target = conn.execute('SELECT current_database() AS database,current_schema() AS schema').fetchone()
        if target != {'database': args.database, 'schema': args.schema}:
            raise RecoveryError('database_target_mismatch')
    database.check()  # Validate only; never create or migrate a schema.


def password_input(args):
    if args.password_stdin:
        value = sys.stdin.readline(258)
        password = value.rstrip('\r\n')
    else:
        # getpass normally falls back to echoed stdin. Recovery must not do so.
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            try:
                password = getpass.getpass('Administrator password: ')
            except (getpass.GetPassWarning, EOFError):
                raise RecoveryError('secure_password_input_unavailable')
    if not 12 <= len(password) <= 256:
        raise RecoveryError('invalid_credentials', 3)
    return password


def perform(args, password):
    from app.services import authorization as az, members, maintenance_control as control
    from app.storage import database
    principal = None
    try:
        login = members.login(args.username, password, audience='management', source='local-maintenance-cli')
        principal = members.resolve_session(login['token'], 'management')
        if principal is None:
            raise RecoveryError('authentication_required', 3)
        # The CLI never exports the token. Bound the private session lifetime
        # even if the local process is killed before its finally block runs.
        with az.policy_transaction() as conn:
            az.active_member(conn, principal)
            conn.execute("UPDATE member_sessions SET expires_at=LEAST(expires_at,clock_timestamp()+interval '5 minutes') WHERE id=%s", (principal.session_id,))
        with az.policy_transaction(change=args.command != 'status') as conn:
            az.require(conn, principal, 'maintenance.space' if args.workspace else 'maintenance.platform', args.workspace)
            if args.command == 'status':
                result = control.snapshot(principal, args.workspace)
            else:
                current = control.current(conn, args.workspace)
                if current['version'] != args.expected_version:
                    az.fail('maintenance_version_conflict', 409)
                if args.command == 'reopen' and current['mode'] != 'recovering':
                    az.fail('maintenance_transition_invalid', 409)
                result = control.change(principal, args.workspace, 'recovering' if args.command == 'recover' else 'normal',
                    args.expected_version, reason=args.reason, message=current['message'],
                    grace_seconds=current['grace_seconds'], confirm_recovery=args.confirm_recovery)
            az.audit(conn, principal, 'maintenance.local.'+args.command, control.key(args.workspace), args.workspace,
                     {'version': result['control']['version'], 'reason': args.reason or ''})
        return {'ok': True, 'command': args.command, 'database': args.database, 'schema': args.schema,
                'workspace_id': args.workspace, 'result': result}
    finally:
        if principal:
            try:
                with database.connection() as conn:
                    # Revoke only the private CLI session, even if that member
                    # was disabled or lost permissions during the operation.
                    row = conn.execute("""UPDATE member_sessions SET revoked_at=clock_timestamp()
                        WHERE id=%s AND member_id=%s AND audience='management' AND revoked_at IS NULL RETURNING id""",
                        (principal.session_id, principal.member_id)).fetchone()
                    if row:
                        az.audit(conn, principal, 'maintenance.local.session_closed', principal.session_id)
            except Exception:
                # A committed state change must not be misreported as failed
                # merely because session cleanup lost its database connection.
                print(json.dumps({'warning':'local_session_cleanup_unconfirmed'}), file=sys.stderr)


def main(argv=None):
    from fastapi import HTTPException
    from app.storage import database
    old_logging = logging.root.manager.disable
    logging.disable(logging.CRITICAL)  # Driver errors can include connection data.
    try:
        args = arguments(argv)
        configure(args)
        result = perform(args, password_input(args))
        print(json.dumps(result, ensure_ascii=False, default=lambda value: value.isoformat()))
        return 0
    except RecoveryError as exc:
        print(json.dumps({'ok':False,'code':exc.code}), file=sys.stderr)
        return exc.exit_code
    except HTTPException as exc:
        code = exc.detail.get('code') if isinstance(exc.detail, dict) else None
        # Only stable application codes are emitted, never exception text.
        if not isinstance(code, str) or not code.replace('_','').isalnum():
            code = 'maintenance_operation_rejected'
        print(json.dumps({'ok':False,'code':code}), file=sys.stderr)
        return 4 if exc.status_code == 409 else 3
    except KeyboardInterrupt:
        print(json.dumps({'ok':False,'code':'operation_interrupted_check_status'}), file=sys.stderr)
        return 130
    except Exception:
        print(json.dumps({'ok':False,'code':'maintenance_dependency_unavailable_check_status'}), file=sys.stderr)
        return 5
    finally:
        database.close()
        logging.disable(old_logging)


if __name__ == '__main__':
    raise SystemExit(main())
