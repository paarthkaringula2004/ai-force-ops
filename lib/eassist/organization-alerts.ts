import {db} from '@/lib/db';
import {workspaceAccess} from '@/lib/workspace-access';
import {permitted} from '@/lib/workspace-permissions';
import {InputError} from './transport';
export async function organizationAlertRevision(){
 return (await db.query("SELECT COALESCE(sum(revision),0)::text AS revision FROM eassist_revisions")).rows[0].revision as string;
}
export async function organizationAlertData(viewer:string){
 if(!permitted(await workspaceAccess(viewer),'admin'))throw new InputError('Admin access required.',403);
 const [alerts,external,accounts]=await Promise.all([
 db.query(`SELECT a.*,h.note AS resolution_note,h.actor_name AS status_actor,h.created_at AS status_recorded_at,u.name AS account_name,u.email AS account_email,m.role AS account_role,
 CASE WHEN m.role='admin' THEN m.admin_id WHEN m.role IN ('employee','manager') THEN NULLIF(m.employee_id,'') ELSE u.id END AS account_id,
 CASE WHEN a.source='organization' THEN a.affected_user_id ELSE COALESCE(a.affected_user_id,a.user_id) END AS account_user_id
 FROM platform_alerts a LEFT JOIN "user" u ON u.id=CASE WHEN a.source='organization' THEN a.affected_user_id ELSE COALESCE(a.affected_user_id,a.user_id) END
 LEFT JOIN workspace_members m ON m.user_id=u.id LEFT JOIN LATERAL (SELECT x.note,x.created_at,actor.name AS actor_name FROM platform_alert_status_history x LEFT JOIN "user" actor ON actor.id=x.actor_id WHERE x.alert_id=a.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) h ON true ORDER BY a.updated_at DESC,a.id`),
 db.query(`SELECT r.*,u.name AS account_name,u.email AS account_email,m.role AS account_role,
 CASE WHEN m.role='admin' THEN m.admin_id WHEN m.role IN ('employee','manager') THEN NULLIF(m.employee_id,'') ELSE u.id END AS account_id,r.user_id AS account_user_id
 FROM eassist_records r JOIN "user" u ON u.id=r.user_id JOIN workspace_members m ON m.user_id=u.id WHERE r.kind='alerts' ORDER BY r.updated_at DESC,r.id`),
 db.query(`SELECT m.user_id,u.name,u.email,m.role,m.active,
 CASE WHEN m.role='admin' THEN m.admin_id WHEN m.role IN ('employee','manager') THEN NULLIF(m.employee_id,'') ELSE u.id END AS account_id
 FROM workspace_members m JOIN "user" u ON u.id=m.user_id ORDER BY m.role,u.name,m.user_id`)
 ]);
 return {alerts:alerts.rows,external:external.rows,accounts:accounts.rows};
}
export async function changeOrganizationAlert(actor:string,id:string,state:'acknowledged'|'resolved',note=''){
 const client=await db.connect();
 try{
 await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(8470220029)');
 const member=(await client.query('SELECT * FROM workspace_members WHERE user_id=$1 FOR UPDATE',[actor])).rows[0];
 if(!permitted(member,'admin'))throw new InputError('Admin access required.',403);
 const alert=(await client.query('SELECT * FROM platform_alerts WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!alert)throw new InputError('Alert not found.',404);
 if(state==='resolved'&&(/^(vulnerability:|security)/.test(alert.event_key)))throw new InputError('Resolve security findings through their scanner or source verification workflow.',409);
 if(state==='resolved'&&(note.trim().length<10||note.length>2000))throw new InputError('Record resolution evidence (10–2,000 characters).');
 if(alert.state==='resolved'||(state==='acknowledged'&&alert.state!=='active'))throw new InputError('This alert status has already changed. Refresh the alert list.',409);
 await client.query('UPDATE platform_alerts SET state=$2,updated_at=now() WHERE id=$1',[id,state]);
 await client.query('INSERT INTO platform_alert_status_history(alert_id,actor_id,previous_state,new_state,note) VALUES($1,$2,$3,$4,$5)',[id,actor,alert.state,state,note.trim()]);
 await client.query("INSERT INTO platform_events(user_id,source,action,resource_id,summary,href) VALUES($1,'eassist',$2,$3,$4,'/service-review-center/eassist?view=alerts')",[actor,state==='resolved'?'Alert resolved':'Alert acknowledged',id,state==='resolved'?'Admin recorded resolution evidence.':'Acknowledgement does not mean the cause is fixed.']);
 await client.query('COMMIT');return {acknowledged:state==='acknowledged',resolved:state==='resolved'};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

