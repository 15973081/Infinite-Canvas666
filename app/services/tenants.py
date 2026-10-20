"""Minimal enterprise directory. No implicit cross-enterprise resource access."""
import secrets
from app.services import authorization as az, members, account_email, email_delivery


def platform(conn, actor):
    return 'tenant.manage' in az.effective_permissions(conn,actor.member_id)


def require(conn, actor, tenant_id, admin=True):
    az.active_member(conn,actor)
    row=conn.execute('SELECT * FROM tenants WHERE id=%s',(tenant_id,)).fetchone()
    if not row:
        az.fail('tenant_unavailable',404)
    if platform(conn,actor):
        return row
    membership=conn.execute('SELECT role FROM tenant_members WHERE tenant_id=%s AND member_id=%s',(tenant_id,actor.member_id)).fetchone()
    if row['status']!='active' or not membership or (admin and membership['role']!='admin'):
        az.fail('tenant_forbidden')
    return row


def listing(actor):
    with az.policy_transaction() as conn:
        az.active_member(conn,actor)
        manager=platform(conn,actor)
        rows=conn.execute('''SELECT t.*,tm.role,
            (SELECT count(*) FROM workspaces w WHERE w.tenant_id=t.id) spaces,
            (SELECT count(*) FROM tenant_members m WHERE m.tenant_id=t.id) members
            FROM tenants t LEFT JOIN tenant_members tm ON tm.tenant_id=t.id AND tm.member_id=%s
            WHERE %s OR tm.member_id IS NOT NULL ORDER BY t.created_at,t.id''',(actor.member_id,manager)).fetchall()
        return {'tenants':rows,'can_create':manager,'delivery_configured':email_delivery.configured()}


def create(actor, name, administrator):
    name=members.text(name,80,'tenant_name')
    with az.policy_transaction(change=True) as conn:
        az.require(conn,actor,'tenant.manage')
        owner=conn.execute("SELECT id FROM members WHERE lower(username)=lower(%s) AND status='active'",(administrator,)).fetchone()
        if not owner:
            az.fail('active_administrator_required',400)
        tid=members.identifier('tenant')
        conn.execute('INSERT INTO tenants(id,name) VALUES(%s,%s)',(tid,name))
        conn.execute("INSERT INTO tenant_members(tenant_id,member_id,role) VALUES(%s,%s,'admin')",(tid,owner['id']))
        az.audit(conn,actor,'tenant.create',tid,details={'administrator_id':owner['id']})
        return {'id':tid,'name':name}


def update(actor, tid, name, status, version):
    name=members.text(name,80,'tenant_name')
    if status not in {'active','disabled'}:
        az.fail('invalid_request',400)
    with az.policy_transaction(change=True) as conn:
        old=require(conn,actor,tid)
        if old['version']!=version:
            az.fail('tenant_changed',409)
        if old['status']!=status:
            az.require(conn,actor,'tenant.manage')
        conn.execute('UPDATE tenants SET name=%s,status=%s,version=version+1 WHERE id=%s',(name,status,tid))
        az.assert_administrators(conn)
        az.audit(conn,actor,'tenant.update',tid,details={'status':status})
    return {'ok':True}


def detail(actor, tid):
    with az.policy_transaction() as conn:
        tenant=require(conn,actor,tid)
        people=conn.execute('''SELECT m.id,m.username,m.display_name,m.email,m.status,tm.role FROM tenant_members tm
            JOIN members m ON m.id=tm.member_id WHERE tm.tenant_id=%s ORDER BY m.created_at''',(tid,)).fetchall()
        spaces=conn.execute('SELECT id,name,status FROM workspaces WHERE tenant_id=%s ORDER BY created_at,id',(tid,)).fetchall()
        invites=conn.execute('SELECT id,email,role,expires_at,consumed_at FROM tenant_invitations WHERE tenant_id=%s ORDER BY created_at DESC LIMIT 50',(tid,)).fetchall()
        return {'tenant':tenant,'members':people,'spaces':spaces,'invitations':invites,'can_suspend':platform(conn,actor),'rules':effective_rules(tenant)}


def create_space(actor,tid,name,administrator):
    name=members.text(name,80,'workspace_name')
    with az.policy_transaction(change=True) as conn:
        tenant=require(conn,actor,tid)
        require_rule(conn,actor,tenant,'create_spaces')
        if tenant['status']!='active':
            az.fail('tenant_unavailable',409)
        if not conn.execute("SELECT 1 FROM tenant_members tm JOIN members m ON m.id=tm.member_id WHERE tm.tenant_id=%s AND tm.member_id=%s AND m.status='active'",(tid,administrator)).fetchone():
            az.fail('tenant_member_required',400)
        wid=members.identifier('space')
        conn.execute('INSERT INTO workspaces(id,name,tenant_id) VALUES(%s,%s,%s)',(wid,name,tid))
        roles=members._space_templates(conn,wid)
        conn.execute('INSERT INTO workspace_members(workspace_id,member_id) VALUES(%s,%s)',(wid,administrator))
        conn.execute('INSERT INTO workspace_member_roles VALUES(%s,%s,%s)',(wid,administrator,roles['admin']))
        az.audit(conn,actor,'tenant.space.create',wid,wid,{'tenant_id':tid})
        return {'id':wid,'name':name}


def assign_space(actor,tid,wid,member_id,role):
    if role not in {'admin','editor','viewer','remove'}:
        az.fail('invalid_request',400)
    with az.policy_transaction(change=True) as conn:
        tenant=require(conn,actor,tid)
        require_rule(conn,actor,tenant,'manage_members')
        if not conn.execute('SELECT 1 FROM workspaces WHERE id=%s AND tenant_id=%s',(wid,tid)).fetchone():
            az.fail('workspace_forbidden')
        if not conn.execute("SELECT 1 FROM tenant_members tm JOIN members m ON m.id=tm.member_id WHERE tm.tenant_id=%s AND tm.member_id=%s AND m.status='active'",(tid,member_id)).fetchone():
            az.fail('tenant_member_required',400)
        conn.execute('DELETE FROM workspace_member_roles WHERE workspace_id=%s AND member_id=%s',(wid,member_id))
        if role=='remove':
            conn.execute('DELETE FROM workspace_members WHERE workspace_id=%s AND member_id=%s',(wid,member_id))
        else:
            rid=conn.execute('SELECT id FROM roles WHERE workspace_id=%s AND builtin_key=%s AND active',(wid,role)).fetchone()
            if not rid:
                az.fail('role_not_found',404)
            conn.execute('INSERT INTO workspace_members(workspace_id,member_id) VALUES(%s,%s) ON CONFLICT DO NOTHING',(wid,member_id))
            conn.execute('INSERT INTO workspace_member_roles VALUES(%s,%s,%s)',(wid,member_id,rid['id']))
        az.assert_administrators(conn)
        conn.execute('UPDATE members SET auth_version=auth_version+1 WHERE id=%s',(member_id,))
        az.audit(conn,actor,'tenant.space.assign',member_id,wid,{'tenant_id':tid,'role':role})
    return {'ok':True}


def change_member(actor,tid,mid,role):
    if role not in {'admin','member','remove'}:
        az.fail('invalid_request',400)
    with az.policy_transaction(change=True) as conn:
        tenant=require(conn,actor,tid)
        require_rule(conn,actor,tenant,'manage_members')
        if not conn.execute('SELECT 1 FROM tenant_members WHERE tenant_id=%s AND member_id=%s',(tid,mid)).fetchone():
            az.fail('tenant_member_required',404)
        if role=='remove':
            conn.execute('DELETE FROM workspace_member_roles WHERE member_id=%s AND workspace_id IN (SELECT id FROM workspaces WHERE tenant_id=%s)',(mid,tid))
            conn.execute('DELETE FROM workspace_members WHERE member_id=%s AND workspace_id IN (SELECT id FROM workspaces WHERE tenant_id=%s)',(mid,tid))
            conn.execute('DELETE FROM tenant_members WHERE tenant_id=%s AND member_id=%s',(tid,mid))
        else:
            conn.execute('UPDATE tenant_members SET role=%s WHERE tenant_id=%s AND member_id=%s',(role,tid,mid))
        if not conn.execute("SELECT 1 FROM tenant_members tm JOIN members m ON m.id=tm.member_id WHERE tenant_id=%s AND role='admin' AND m.status='active'",(tid,)).fetchone():
            az.fail('last_tenant_administrator',409)
        az.assert_administrators(conn)
        conn.execute('UPDATE members SET auth_version=auth_version+1 WHERE id=%s',(mid,))
        az.audit(conn,actor,'tenant.member.update',mid,details={'tenant_id':tid,'role':role})
    return {'ok':True}


def invite(actor,tid,email,role):
    email=account_email.normalize(email)
    if role not in {'admin','member'}:
        az.fail('invalid_request',400)
    if not email_delivery.configured():
        az.fail('email_not_configured',503)
    with az.policy_transaction() as conn:
        tenant=require(conn,actor,tid)
        require_rule(conn,actor,tenant,'invite_members')
    account_email.throttle('invite:'+actor.member_id+':'+email)
    token=secrets.token_urlsafe(32)
    with az.policy_transaction(change=True) as conn:
        tenant=require(conn,actor,tid)
        require_rule(conn,actor,tenant,'invite_members')
        conn.execute('UPDATE tenant_invitations SET consumed_at=now() WHERE tenant_id=%s AND email=%s AND consumed_at IS NULL',(tid,email))
        iid=members.identifier('invite')
        conn.execute("INSERT INTO tenant_invitations(id,tenant_id,email,role,token_hash,actor_id,expires_at) VALUES(%s,%s,%s,%s,%s,%s,now()+interval '48 hours')",(iid,tid,email,role,members.token_hash(token),actor.member_id))
        email_delivery.send(email,'Shadox 企业邀请',f'你被邀请加入企业「{tenant["name"]}」。\n邀请凭证：{token}\n有效期 48 小时。请在管理平台的“接受企业邀请”中输入此凭证。已有账号请先登录并验证此邮箱。')
        az.audit(conn,actor,'tenant.invite',iid,details={'tenant_id':tid,'role':role})
    return {'ok':True}


def accept(token, *, actor=None, username='', display_name='', password=''):
    if not isinstance(token,str) or not 20<=len(token)<=128:
        az.fail('invalid_invitation',400)
    with az.policy_transaction(change=True) as conn:
        invitation=conn.execute('''SELECT i.* FROM tenant_invitations i JOIN tenants t ON t.id=i.tenant_id
            WHERE i.token_hash=%s AND i.consumed_at IS NULL AND i.expires_at>clock_timestamp() AND t.status='active' FOR UPDATE OF i''',(members.token_hash(token),)).fetchone()
        if not invitation:
            az.fail('invalid_invitation',400)
        inviter=conn.execute("SELECT 1 FROM members WHERE id=%s AND status='active'",(invitation['actor_id'],)).fetchone()
        authorized=conn.execute("SELECT 1 FROM tenant_members WHERE tenant_id=%s AND member_id=%s AND role='admin'",(invitation['tenant_id'],invitation['actor_id'])).fetchone()
        from app.storage.deletion_ledger import member_blocked
        if not inviter or member_blocked(invitation['actor_id']) or (not authorized and 'tenant.manage' not in az.effective_permissions(conn,invitation['actor_id'])):
            az.fail('invalid_invitation',400)
        tenant=conn.execute('SELECT * FROM tenants WHERE id=%s',(invitation['tenant_id'],)).fetchone()
        if not effective_rules(tenant)['invite_members'] and 'tenant.manage' not in az.effective_permissions(conn,invitation['actor_id']):
            az.fail('invalid_invitation',400)
        if actor:
            az.active_member(conn,actor)
            member=conn.execute('SELECT id,email FROM members WHERE id=%s',(actor.member_id,)).fetchone()
            if member['email']!=invitation['email']:
                az.fail('invitation_email_mismatch',409)
            mid=member['id']
        else:
            username=members.text(username,64,'username');display_name=members.text(display_name,80,'display_name')
            if '@' in username or conn.execute('SELECT 1 FROM members WHERE lower(username)=lower(%s) OR lower(email)=%s',(username,invitation['email'])).fetchone():
                az.fail('invitation_login_required',409)
            salt,digest=members.password_hash(password);mid=members.identifier('member')
            conn.execute("INSERT INTO members(id,username,display_name,status,password_salt,password_digest,email,email_verified_at) VALUES(%s,%s,%s,'active',%s,%s,%s,now())",(mid,username,display_name,salt,digest,invitation['email']))
        # Replaying a lower-role invite never demotes an existing administrator.
        conn.execute('INSERT INTO tenant_members(tenant_id,member_id,role) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',(invitation['tenant_id'],mid,invitation['role']))
        conn.execute('UPDATE tenant_invitations SET consumed_at=now() WHERE id=%s',(invitation['id'],))
        az.audit(conn,actor,'tenant.invite.accept',mid,details={'tenant_id':invitation['tenant_id']})
        return {'ok':True,'tenant_id':invitation['tenant_id']}


def models(actor,tid):
    with az.policy_transaction() as conn:
        require(conn,actor,tid)
        can_grant=platform(conn,actor) and 'provider.configure' in az.effective_permissions(conn,actor.member_id)
        grants=conn.execute('SELECT provider_id,kind,model FROM tenant_models WHERE tenant_id=%s ORDER BY provider_id,kind,model',(tid,)).fetchall()
        catalog=[]
        for provider in conn.execute("SELECT id,config FROM managed_providers WHERE config->>'enabled'='true'"):
            for kind in ('image','video','chat','audio','model'):
                for model in provider['config'].get(kind+'_models',[]):
                    item={'provider_id':provider['id'],'kind':kind,'model':model}
                    if can_grant or item in grants:
                        catalog.append({**item,'provider_name':provider['config'].get('name',provider['id'])})
        space_grants=conn.execute('SELECT workspace_id,provider_id,kind,model FROM tenant_space_models WHERE tenant_id=%s',(tid,)).fetchall()
        defaults=conn.execute('SELECT d.* FROM workspace_model_defaults d JOIN workspaces w ON w.id=d.workspace_id WHERE w.tenant_id=%s',(tid,)).fetchall()
        versions=conn.execute('SELECT d.* FROM workspace_model_default_versions d JOIN workspaces w ON w.id=d.workspace_id WHERE w.tenant_id=%s',(tid,)).fetchall()
        default_choices=[]
        for row in conn.execute("SELECT w.id,p.id provider_id,p.config FROM workspaces w JOIN workspace_provider_grants g ON g.workspace_id=w.id JOIN managed_providers p ON p.id=g.provider_id WHERE w.tenant_id=%s AND w.status='active' AND EXISTS(SELECT 1 FROM tenants t WHERE t.id=w.tenant_id AND t.status='active') AND p.config->>'enabled'='true'",(tid,)).fetchall():
            config=filter_models(conn,row['config'],row['provider_id'],row['id'])
            for kind in ('image','video','chat','audio','model'):
                for model in config.get(kind+'_models',[]):
                    rule=config.get('model_policies',{}).get(kind+':'+model,{})
                    if rule.get('enabled') is not False and rule.get('visible') is not False:
                        default_choices.append({'workspace_id':row['id'],'provider_id':row['provider_id'],'provider_name':config.get('name',row['provider_id']),'kind':kind,'model':model})
        return {'default_choices':default_choices,'defaults':defaults,'default_versions':versions,'catalog':catalog,'grants':grants,'space_grants':space_grants,'can_grant':can_grant,'legacy':tid=='default'}


def set_models(actor,tid,items,workspace=None):
    if tid=='default':
        az.fail('legacy_tenant_models',409)
    keys=set()
    for item in items:
        if set(item)!={'provider_id','kind','model'} or item['kind'] not in {'image','video','chat','audio','model'}:
            az.fail('invalid_request',400)
        keys.add((item['provider_id'],item['kind'],item['model']))
    if len(keys)>1000:
        az.fail('invalid_request',400)
    with az.policy_transaction(change=True) as conn:
        require(conn,actor,tid)
        if workspace:
            require_rule(conn,actor,require(conn,actor,tid),'assign_models')
            if not conn.execute("SELECT 1 FROM workspaces WHERE id=%s AND tenant_id=%s AND status='active'",(workspace,tid)).fetchone():
                az.fail('workspace_forbidden')
            allowed={(r['provider_id'],r['kind'],r['model']) for r in conn.execute('SELECT * FROM tenant_models WHERE tenant_id=%s',(tid,))}
        else:
            az.require(conn,actor,'tenant.manage');az.require(conn,actor,'provider.configure')
            allowed=set()
            for row in conn.execute("SELECT id,config FROM managed_providers WHERE config->>'enabled'='true'"):
                for kind in ('image','video','chat','audio','model'):
                    allowed.update((row['id'],kind,m) for m in row['config'].get(kind+'_models',[]))
        if not keys<=allowed:
            az.fail('model_not_available')
        if workspace:
            conn.execute('DELETE FROM tenant_space_models WHERE workspace_id=%s',(workspace,))
            for pid,kind,model in keys:
                conn.execute('INSERT INTO tenant_space_models VALUES(%s,%s,%s,%s,%s)',(workspace,tid,pid,kind,model))
            provider_ids=sorted({key[0] for key in keys})
            old=conn.execute('SELECT primary_provider_id FROM workspace_provider_sets WHERE workspace_id=%s',(workspace,)).fetchone()
            primary=old['primary_provider_id'] if old and old['primary_provider_id'] in provider_ids else (provider_ids[0] if provider_ids else None)
            conn.execute('INSERT INTO workspace_provider_sets(workspace_id,version,primary_provider_id) VALUES(%s,1,%s) ON CONFLICT(workspace_id) DO UPDATE SET version=workspace_provider_sets.version+1,primary_provider_id=EXCLUDED.primary_provider_id',(workspace,primary))
            conn.execute('DELETE FROM workspace_provider_grants WHERE workspace_id=%s',(workspace,))
            for pid in provider_ids:
                conn.execute('INSERT INTO workspace_provider_grants(workspace_id,provider_id) VALUES(%s,%s)',(workspace,pid))
        else:
            old={(r['provider_id'],r['kind'],r['model']) for r in conn.execute('SELECT * FROM tenant_models WHERE tenant_id=%s',(tid,))}
            for pid,kind,model in old-keys:
                conn.execute('DELETE FROM tenant_models WHERE tenant_id=%s AND provider_id=%s AND kind=%s AND model=%s',(tid,pid,kind,model))
            for pid,kind,model in keys-old:
                conn.execute('INSERT INTO tenant_models VALUES(%s,%s,%s,%s)',(tid,pid,kind,model))
        az.audit(conn,actor,'tenant.models.assign',workspace or tid,workspace,{'tenant_id':tid,'count':len(keys)})
    return {'ok':True}


def filter_models(conn,config,provider_id,workspace):
    from copy import deepcopy
    row=conn.execute('SELECT w.tenant_id,t.status FROM workspaces w JOIN tenants t ON t.id=w.tenant_id WHERE w.id=%s',(workspace,)).fetchone()
    if not row or row['status']!='active':
        az.fail('tenant_unavailable')
    if row['tenant_id']=='default':
        return config
    allowed={(r['kind'],r['model']) for r in conn.execute('SELECT kind,model FROM tenant_space_models WHERE workspace_id=%s AND tenant_id=%s AND provider_id=%s',(workspace,row['tenant_id'],provider_id))}
    result=deepcopy(config)
    for kind in ('image','video','chat','audio','model'):
        result[kind+'_models']=[m for m in result.get(kind+'_models',[]) if (kind,m) in allowed]
    return result

def set_defaults(actor,tid,workspace,items,version):
    with az.policy_transaction(change=True) as conn:
        tenant=require(conn,actor,tid)
        require_rule(conn,actor,tenant,'assign_models')
        if not conn.execute("SELECT 1 FROM workspaces WHERE id=%s AND tenant_id=%s AND status='active'",(workspace,tid)).fetchone():
            az.fail('workspace_forbidden')
        existing=conn.execute('SELECT version FROM workspace_model_default_versions WHERE workspace_id=%s',(workspace,)).fetchone()
        if (existing['version'] if existing else 0)!=version:az.fail('tenant_changed',409)
        if len({i['kind'] for i in items})!=len(items):az.fail('invalid_request',400)
        for item in items:
            row=conn.execute("SELECT p.config FROM managed_providers p JOIN workspace_provider_grants g ON g.provider_id=p.id WHERE g.workspace_id=%s AND p.id=%s AND p.config->>'enabled'='true'",(workspace,item['provider_id'])).fetchone()
            config=filter_models(conn,row['config'],item['provider_id'],workspace) if row else {}
            rule=config.get('model_policies',{}).get(item['kind']+':'+item['model'],{})
            if item['model'] not in config.get(item['kind']+'_models',[]) or rule.get('enabled') is False or rule.get('visible') is False:
                az.fail('model_not_available')
        conn.execute('DELETE FROM workspace_model_defaults WHERE workspace_id=%s',(workspace,))
        for item in items:
            conn.execute('INSERT INTO workspace_model_defaults VALUES(%s,%s,%s,%s)',(workspace,item['kind'],item['provider_id'],item['model']))
        conn.execute('INSERT INTO workspace_model_default_versions VALUES(%s,1) ON CONFLICT(workspace_id) DO UPDATE SET version=workspace_model_default_versions.version+1',(workspace,))
        az.audit(conn,actor,'space.model_defaults',workspace,workspace,{'count':len(items)})
    return {'ok':True}

RULES={'invite_members':'邀请企业成员','create_spaces':'创建协作空间','manage_members':'调整成员与空间权限','assign_models':'分配空间模型与默认模型'}


def effective_rules(tenant):
    return {key:tenant['platform_rules'].get(key,True) and tenant['enterprise_rules'].get(key,True) for key in RULES}


def require_rule(conn,actor,tenant,key):
    if not platform(conn,actor) and not effective_rules(tenant)[key]:
        az.fail('tenant_rule_denied')


def rules(actor,tid):
    with az.policy_transaction() as conn:
        tenant=require(conn,actor,tid)
        return {'platform_rules':{k:tenant['platform_rules'].get(k,True) for k in RULES},
                'enterprise_rules':{k:tenant['enterprise_rules'].get(k,True) for k in RULES},
                'effective':effective_rules(tenant),'version':tenant['rules_version'],'can_set_limits':platform(conn,actor)}


def update_rules(actor,tid,values,version,platform_limits=False):
    from psycopg.types.json import Jsonb
    if set(values)!=set(RULES) or any(type(v) is not bool for v in values.values()):az.fail('invalid_request',400)
    with az.policy_transaction(change=True) as conn:
        tenant=require(conn,actor,tid)
        if tenant['rules_version']!=version:az.fail('tenant_changed',409)
        if platform_limits:
            az.require(conn,actor,'tenant.manage')
            conn.execute('UPDATE tenants SET platform_rules=%s,rules_version=rules_version+1 WHERE id=%s',(Jsonb(values),tid))
        else:
            if any(v and not tenant['platform_rules'].get(k,True) for k,v in values.items()):az.fail('tenant_rule_denied')
            conn.execute('UPDATE tenants SET enterprise_rules=%s,rules_version=rules_version+1 WHERE id=%s',(Jsonb(values),tid))
        az.audit(conn,actor,'tenant.rules.update',tid,details={'tenant_id':tid,'scope':'platform' if platform_limits else 'enterprise','rules':values})
    return {'ok':True}


def events(actor,tid,before=None,limit=30):
    with az.policy_transaction() as conn:
        require(conn,actor,tid)
        rows=conn.execute('''SELECT e.id,e.action,e.created_at,e.target_id,e.workspace_id,m.display_name actor_name
            FROM management_events e LEFT JOIN members m ON m.id=e.actor_id
            WHERE (e.action LIKE 'tenant.%%' OR e.action='space.model_defaults')
            AND (e.details->>'tenant_id'=%s OR e.target_id=%s OR EXISTS(SELECT 1 FROM workspaces w WHERE w.id=e.workspace_id AND w.tenant_id=%s))
            AND (%s::bigint IS NULL OR e.id<%s) ORDER BY e.id DESC LIMIT %s''',(tid,tid,tid,before,before,limit+1)).fetchall()
        return {'events':rows[:limit],'next':rows[limit-1]['id'] if len(rows)>limit else None}
