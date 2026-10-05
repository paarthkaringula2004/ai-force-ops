import { db } from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 let database=0;
 try{await db.query('SELECT 1');database=1;}catch{}
 const metrics=[
 '# HELP eassist_app_up Whether the eAssist HTTP application is responding.',
 '# TYPE eassist_app_up gauge','eassist_app_up 1',
 '# HELP eassist_database_up Whether the application can reach PostgreSQL.',
 '# TYPE eassist_database_up gauge',`eassist_database_up ${database}`,
 '# HELP eassist_process_uptime_seconds Uptime of the application process.',
 '# TYPE eassist_process_uptime_seconds gauge',`eassist_process_uptime_seconds ${process.uptime()}`,
 ];
 return new Response(metrics.join('\n')+'\n',{headers:{'Content-Type':'text/plain; version=0.0.4; charset=utf-8','Cache-Control':'no-store'}});
}
