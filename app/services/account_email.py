"""Verified email binding and password recovery, with durable attempt limits."""
import hashlib
import hmac
import os
import re
import secrets
from psycopg.errors import UniqueViolation
from app.services import authorization as az, members, email_delivery


def normalize(value):
    if not isinstance(value, str):
        az.fail('invalid_email', 400)
    value = value.strip().lower()
    if len(value) > 254 or not re.fullmatch(r'[a-z0-9.!#$%&\'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}', value):
        az.fail('invalid_email', 400)
    return value


def throttle(key, source=''):
    keys = [(key+':minute', 60, 1), (key+':hour', 3600, 5)]
    if source:
        keys.append(('mail-source:'+source, 3600, 30))
    limited = False
    with az.policy_transaction(change=True) as conn:
        for value, seconds, maximum in keys:
            row = conn.execute('''INSERT INTO member_login_attempts(key,count,expires_at)
                VALUES(%s,1,clock_timestamp()+%s*interval '1 second') ON CONFLICT(key) DO UPDATE SET
                count=CASE WHEN member_login_attempts.expires_at<=clock_timestamp() THEN 1 ELSE member_login_attempts.count+1 END,
                expires_at=CASE WHEN member_login_attempts.expires_at<=clock_timestamp() THEN EXCLUDED.expires_at ELSE member_login_attempts.expires_at END RETURNING count''',
                ('mail:'+members.token_hash(value),seconds)).fetchone()
            limited |= row['count'] > maximum
    if limited:
        az.fail('email_rate_limited', 429)


def digest(challenge, code):
    if not email_delivery.configured():
        az.fail('email_not_configured', 503)
    return hmac.new(os.environ['EMAIL_TOKEN_SECRET'].encode(), (challenge+':'+code).encode(), hashlib.sha256).hexdigest()


def password_matches(row, password):
    return isinstance(password,str) and 12 <= len(password) <= 256 and bool(row['password_salt']) and hmac.compare_digest(members.password_hash(password,row['password_salt'])[1],row['password_digest'] or '')


def status(actor):
    with az.policy_transaction() as conn:
        az.active_member(conn,actor)
        row=conn.execute('SELECT email,email_verified_at FROM members WHERE id=%s',(actor.member_id,)).fetchone()
        return {**row,'delivery_configured':email_delivery.configured()}


def start(purpose, email, *, actor=None, password='', source=''):
    email=normalize(email)
    if not email_delivery.configured():
        az.fail('email_not_configured',503)
    throttle(('bind:'+actor.member_id) if purpose=='bind' and actor else 'reset:'+email,source)
    challenge=members.identifier('email')
    code=str(secrets.randbelow(1000000)).zfill(6)
    with az.policy_transaction(change=True) as conn:
        if purpose=='bind':
            az.active_member(conn,actor)
            row=conn.execute('SELECT * FROM members WHERE id=%s',(actor.member_id,)).fetchone()
            if not password_matches(row,password):
                az.fail('invalid_credentials',400)
            if conn.execute('SELECT 1 FROM members WHERE id<>%s AND (lower(email)=%s OR lower(username)=%s)',(actor.member_id,email,email)).fetchone():
                az.fail('email_unavailable',409)
        elif purpose=='reset':
            row=conn.execute("SELECT * FROM members WHERE lower(email)=%s AND status='active'",(email,)).fetchone()
            if not row:
                return {'challenge_id':challenge,'expires_in':600}
        else:
            az.fail('invalid_request',400)
        conn.execute('UPDATE email_challenges SET consumed_at=now() WHERE member_id=%s AND purpose=%s AND consumed_at IS NULL',(row['id'],purpose))
        conn.execute("INSERT INTO email_challenges(id,member_id,email,purpose,code_hash,auth_version,expires_at) VALUES(%s,%s,%s,%s,%s,%s,clock_timestamp()+interval '10 minutes')",(challenge,row['id'],email,purpose,digest(challenge,code),row['auth_version']))
        email_delivery.send(email,'Shadox 邮箱验证' if purpose=='bind' else 'Shadox 重置密码',f'验证码：{code}\n有效期 10 分钟。请勿将验证码告知他人。如非本人操作，请忽略此邮件。')
    return {'challenge_id':challenge,'expires_in':600}


def confirm(purpose, challenge_id, code, *, actor=None, password=''):
    if not isinstance(code,str) or not re.fullmatch(r'\d{6}',code):
        az.fail('invalid_email_code',400)
    if purpose=='reset':
        salt,password_digest=members.password_hash(password)
    invalid=False
    try:
        with az.policy_transaction(change=True) as conn:
            if purpose=='bind':
                az.active_member(conn,actor)
            row=conn.execute('''SELECT c.*,m.status,m.email current_email,m.auth_version current_version FROM email_challenges c JOIN members m ON m.id=c.member_id
                WHERE c.id=%s AND c.purpose=%s AND c.consumed_at IS NULL AND c.expires_at>clock_timestamp() AND c.attempts<5 FOR UPDATE OF c,m''',(challenge_id,purpose)).fetchone()
            from app.storage.deletion_ledger import member_blocked
            if not row or row['status']!='active' or member_blocked(row['member_id']) or row['current_version']!=row['auth_version'] or (purpose=='bind' and row['member_id']!=actor.member_id) or (purpose=='reset' and row['email']!=row['current_email']):
                invalid=True
            elif not hmac.compare_digest(row['code_hash'],digest(challenge_id,code)):
                conn.execute('UPDATE email_challenges SET attempts=attempts+1 WHERE id=%s',(challenge_id,))
                invalid=True
            else:
                if purpose=='bind':
                    if conn.execute('SELECT 1 FROM members WHERE id<>%s AND (lower(email)=%s OR lower(username)=%s)',(row['member_id'],row['email'],row['email'])).fetchone():
                        az.fail('email_unavailable',409)
                    conn.execute('UPDATE members SET email=%s,email_verified_at=clock_timestamp() WHERE id=%s',(row['email'],row['member_id']))
                else:
                    conn.execute('UPDATE members SET password_salt=%s,password_digest=%s,auth_version=auth_version+1 WHERE id=%s',(salt,password_digest,row['member_id']))
                    conn.execute('UPDATE member_sessions SET revoked_at=now() WHERE member_id=%s',(row['member_id'],))
                conn.execute('UPDATE email_challenges SET consumed_at=now() WHERE id=%s',(challenge_id,))
                az.audit(conn,actor,'email.'+purpose,row['member_id'])
    except UniqueViolation:
        az.fail('email_unavailable',409)
    if invalid:
        az.fail('invalid_email_code',400)
    return {'ok':True}
