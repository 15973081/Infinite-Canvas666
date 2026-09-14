"""Read-only release observations; never authorize stopping a process or database."""


def report(state, activity, workspace=None):
    checks = []

    def check(code, count, *, status=None):
        checks.append({'code': code, 'status': status or ('blocked' if count else 'passed'), 'count': count})

    check('new_business_admission', int(state['mode'] in {'normal', 'scheduled'}))
    check('active_tasks', activity['active_tasks'])
    check('task_execution_leases', activity['task_leases']['active'])
    check('expired_task_leases', activity['task_leases']['expired'])
    check('unfinished_submissions', activity['unfinished_submissions'])
    check('tasks_needing_review', activity['needs_review'])
    check('pending_uploads', activity['uploads']['pending'])
    check('upload_processing', activity['uploads']['processing'])
    check('expired_unfinished_uploads', activity['uploads']['expired_unfinished'])
    check('canvas_edit_leases', activity['canvas_locks'])
    check('unsaved_reported_pages', activity['unsaved_pages'])
    check('unreviewed_pages', activity['page_reports']['pending_review_pages'])
    check('pending_backups', activity['backup_jobs']['queued'] + activity['backup_jobs']['running'])

    # A persisted queue may be paused safely, but a release still needs an
    # explicit compatibility/recovery check. Counting it is not that evidence.
    if activity['queued_tasks']:
        check('queued_task_recovery', activity['queued_tasks'], status='review_required')
    observations_passed = all(item['status'] == 'passed' for item in checks)
    operator_checks = ['unreported_pages', 'backup_integrity_and_restore', 'release_compatibility']
    if workspace:
        database = {'status': 'not_applicable', 'reason': 'workspace_cannot_authorize_database_stop'}
    else:
        online = sum(s['online'] for s in activity['services'])
        unknown = sum(s['unknown'] for s in activity['services'])
        operator_checks += ['stop_all_database_clients', 'verify_no_inflight_transactions']
        # A stale heartbeat is an unknown process, never proof of termination.
        database = {'status': 'blocked' if not observations_passed or online or unknown else 'review_required',
                    'online_business_services': online, 'unknown_business_services': unknown}
    return {'observed_at': state['server_time'], 'maintenance_versions': state['versions'],
            'scope': 'workspace' if workspace else 'platform', 'workspace_id': workspace,
            'checks': checks, 'observed_checks_passed': observations_passed,
            'operator_checks': operator_checks, 'database_stop': database,
            'database_stop_ready': False, 'validity': 'observation_only_not_stop_authorization'}
