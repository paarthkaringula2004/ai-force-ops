import { createHash } from 'node:crypto';
import { array, object, type Json } from '@/lib/eassist/types';

export type Reading = { recordType: 'metric'|'health'|'inventory'|'lifecycle'|'forecast'|'availability'; recordKey: string; payload: Json; observedAt: string };
export type Source = { id: string; user_id: string; name: string; kind: string; base_url?: string };
export type SourceRecord = { kind: string; external_id: string; data: Json };

// Only measured operational values are projected. No inferred savings, CSAT, geography or incident resolution.
export function projectReadings(source: Source, records: SourceRecord[], at: string): Reading[] {
 const readings: Reading[] = [];
 const add = (recordType: Reading['recordType'], key: string, payload: Json, observedAt=at) => readings.push({recordType,recordKey:`${source.id}:${key}`,payload,observedAt});
 const metric = (key: string, label: string, value: number, scope: string) => add('metric',key,{label,value,unit:'',scope});
 if (source.kind === 'prometheus') {
  const monitoring=records.find(r=>r.kind==='monitoring')?.data;
  if (!monitoring) throw new Error('No monitoring snapshot has been collected.');
  const targets=array(monitoring.targets), metrics=object(monitoring.metrics);
  if(targets.length>5000)throw new Error('More than 5,000 targets. Split the source into smaller monitoring scopes.');
  metric('targets','Monitored targets',targets.length,'Current Prometheus scrape targets');
  metric('healthyTargets','Healthy targets',targets.filter(t=>t.health==='up').length,'Current Prometheus scrape targets');
  metric('unavailableTargets','Unavailable targets',targets.filter(t=>t.health==='down').length,'Current Prometheus scrape targets');
  for (const target of targets) {
   const labels=object(target.labels), instance=String(labels.instance||target.scrapeUrl||'Unnamed target');
   const identity=createHash('sha256').update(JSON.stringify(Object.entries(labels).sort(([a],[b])=>a.localeCompare(b)))).digest('hex').slice(0,32);
   const timestamp=Date.parse(String(target.lastScrape));
   add('health',`target:${identity}`,{device:instance,endpoint:String(target.scrapeUrl||instance),ipAddress:String(labels.ipAddress||labels.ip||''),vendor:String(labels.vendor||''),status:target.health==='up'?'Healthy':target.health==='down'?'Down':'Unknown',category:String(labels.job||'Monitoring target'),country:String(labels.country||''),site:String(labels.site||labels.region||''),description:String(target.lastError||''),job:String(labels.job||''),lastScrape:target.lastScrape||null}, Number.isFinite(timestamp)&&timestamp>0?new Date(timestamp).toISOString():at);
  }
  for(const sample of array(metrics.availability24h)) {
   const value=Number(Array.isArray(sample.value)?sample.value[1]:NaN), labels=object(sample.metric);
   if(!Number.isFinite(value)||value<0||value>1)continue;
   const count=array(metrics.samples24h).find(s=>JSON.stringify(Object.entries(object(s.metric)).sort())===JSON.stringify(Object.entries(labels).sort()));
   const samples=Number(count&&Array.isArray(count.value)?count.value[1]:0);
   const id=createHash('sha256').update(JSON.stringify(Object.entries(labels).sort())).digest('hex').slice(0,32);
   add('availability',`availability:${id}`,{service:`${labels.job||'Target'} · ${labels.instance||''}`,availability:Math.round(value*10000)/100,period:'24h',method:'Fraction of recorded up samples; gaps are not counted',samples});
  }
 } else if(source.kind==='alertmanager') {
  const alerts=records.filter(r=>r.kind==='alerts'),active=alerts.filter(r=>['active','suppressed','unprocessed'].includes(String(r.data.state)) && (!r.data.endsAt||Date.parse(String(r.data.endsAt))>Date.parse(at)));
  metric('activeAlerts','Current alerts',active.length,'Alertmanager active, suppressed and unprocessed alerts');
  metric('criticalAlerts','Critical alerts',active.filter(r=>String(object(r.data.labels).severity).toLowerCase()==='critical').length,'Current alerts explicitly labelled critical');
  metric('suppressedAlerts','Suppressed alerts',active.filter(r=>r.data.state==='suppressed').length,'Current Alertmanager suppressed alerts');
  metric('activeSilences','Active silences',records.filter(r=>r.kind==='silences'&&object(r.data.status).state==='active').length,'Current Alertmanager silence status');
 } else if(source.kind==='semaphore') {
  const tasks=records.filter(r=>r.kind==='tasks').sort((a,b)=>Number(b.data.id)-Number(a.data.id)).slice(0,200);
  const completed=tasks.filter(r=>['success','error','failed'].includes(String(r.data.status))), successes=completed.filter(r=>r.data.status==='success');
  metric('taskCount','Recent automation tasks',tasks.length,'Latest 200 tasks collected for this project; not all-time totals');
  metric('successfulTasks','Successful tasks',successes.length,'Latest 200 collected tasks');
  metric('failedTasks','Failed tasks',completed.length-successes.length,'Latest 200 collected tasks');
  metric('runningTasks','Running tasks',tasks.filter(r=>['running','starting','waiting','stopping'].includes(String(r.data.status))).length,'Latest 200 collected tasks');
  metric('pendingTasks','Awaiting approval',tasks.filter(r=>r.data.status==='waiting_confirmation').length,'Latest 200 collected tasks');
  if(completed.length)add('metric','automationSuccess',{label:'Automation success rate',value:Math.round(successes.length/completed.length*1000)/10,unit:'%',completed:completed.length,successful:successes.length,scope:'Successful / success, error and failed tasks in the latest 200 collected tasks'});
  metric('templateCount','Task templates',records.filter(r=>r.kind==='templates').length,'Current Semaphore project');
 } else if(source.kind==='servicenow') {
  const scope=records.find(r=>r.kind==='incident_scope')?.data.ids;
  const incidentIds=Array.isArray(scope)?new Set(scope.map(String)):null;
  const incidents=records.filter(r=>r.kind==='incidents'&&(!incidentIds||incidentIds.has(r.external_id))),open=incidents.filter(r=>!['6','7','8'].includes(String(r.data.state)));
  metric('openIncidents','Open incidents',open.length,'Synced ServiceNow incidents excluding resolved, closed and cancelled');
  metric('criticalIncidents','Priority 1 incidents',open.filter(r=>String(r.data.priority)==='1').length,'Open ServiceNow incidents explicitly assigned priority 1');
 }
 return readings;
}
