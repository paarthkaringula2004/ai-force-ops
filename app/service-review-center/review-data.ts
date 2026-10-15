export type ReviewSource={id:string;name:string;kind:string;enabled:boolean;state:string;sourceError:string;importError:string|null;importedAt:string|null;checkedAt:string|null;readingCount:number;stale:boolean};
export type ReviewReading={id:string;recordType:'metric'|'health'|'inventory'|'lifecycle'|'forecast'|'availability';recordKey:string;payload:Record<string,unknown>;observedAt:string;sourceId?:string|null;sourceKind?:string;sourceName?:string;isCurrent?:boolean};
export type ReviewWorker={active:boolean;checkedAt:string|null;configured:boolean};

// Snapshots and overlapping sources must not become duplicate devices in the live list.
export function latestHealthReadings(records:ReviewReading[]):ReviewReading[] {
 const groups=new Map<string,ReviewReading>();
 for(const record of [...records].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))) {
  if(record.recordType!=='health'||record.isCurrent===false)continue;
  const raw=String(record.payload.endpoint||record.payload.device||record.recordKey);
  let identity=raw.toLowerCase();
  try{const url=new URL(raw.includes('://')?raw:`https://${raw}`);identity=url.host.toLowerCase();}catch{/* Non-URL device names retain their supplied identity. */}
  const existing=groups.get(identity);
  // Scrape health measures the actual monitored endpoint; a successful API login cannot replace it.
  const measured=record.recordKey.includes(':target:'),priorMeasured=existing?.recordKey.includes(':target:');
  if(!existing||measured&&!priorMeasured)groups.set(identity,record);
 }
 return [...groups.values()].sort((a,b)=>String(a.payload.device||a.recordKey).localeCompare(String(b.payload.device||b.recordKey)));
}
