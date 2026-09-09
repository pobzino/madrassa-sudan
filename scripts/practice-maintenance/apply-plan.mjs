import {readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual as equal} from 'node:util';
const plan=JSON.parse(await readFile(new URL('./plan.json',import.meta.url),'utf8'));
const apply=process.argv.includes('--apply');
const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!key)throw new Error('Missing database configuration');
const allowed=new Set(['homework_questions','lesson_slides','lesson_sims','lesson_tasks']);
async function request(table,filters,method='GET',body) {
  if(!allowed.has(table))throw new Error('Table outside curriculum scope');
  const url=new URL(`/rest/v1/${table}`,base);
  url.search=new URLSearchParams(filters);
  const response=await fetch(url,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});
  if(!response.ok)throw new Error(`${table}: HTTP ${response.status}`);
  return response.json();
}
const matches=(row,expected)=>Object.entries(expected).every(([k,v])=>equal(row[k]??null,v));
const pending=[];
// Preflight every row before the first write. Abort if a teacher changed any
// reviewed content. Reruns accept already-applied rows and are idempotent.
for(const entry of plan.entries){
  const rows=await request(entry.table,{id:`eq.${entry.id}`,select:'*'});
  if(rows.length!==1)throw new Error(`Missing curriculum row ${entry.id}`);
  const row=rows[0];
  if(entry.slides){
    const deck=structuredClone(row[entry.field]);
    let changed=false;
    for(const edit of entry.slides){
      const slide=deck.find(s=>s.id===edit.id);
      if(!slide)throw new Error(`Missing slide ${edit.id}`);
      if(matches(slide,edit.after))continue;
      if(!matches(slide,edit.before))throw new Error(`Source changed since review: ${edit.id}`);
      Object.assign(slide,edit.after);changed=true;
    }
    if(changed){
      if(!row.updated_at)throw new Error('Source has no concurrency timestamp');
      pending.push({entry,filters:{id:`eq.${entry.id}`,updated_at:`eq.${row.updated_at}`},patch:{[entry.field]:deck}});
    }
  }else{
    if(matches(row,entry.after))continue;
    if(!matches(row,entry.before))throw new Error(`Content changed since review: ${entry.id}`);
    const filters={id:`eq.${entry.id}`};
    const patch={...entry.after};delete patch.id;
    if(entry.table==='homework_questions'){
      // Compare every audited question field atomically with the PATCH.
      for(const [k,v]of Object.entries(entry.before))if(k!=='id')filters[k]=v===null?'is.null':`eq.${typeof v==='object'?JSON.stringify(v):v}`;
      Object.assign(patch,{audio_url_ar:null,audio_url_en:null,audio_text_hash_ar:null,audio_text_hash_en:null});
    }else{
      if(!row.updated_at)throw new Error('Task has no concurrency timestamp');
      filters.updated_at=`eq.${row.updated_at}`;
    }
    pending.push({entry,filters,patch});
  }
}
// The checked-in plan is also the reversible content backup. No student
// tables, grades, credentials, media URLs, or complete recordings are exported.
await writeFile('practice-maintenance-backup.json',JSON.stringify({version:1,entries:pending.map(x=>x.entry)},null,2));
console.log(`Preflight passed: ${pending.length} rows need correction; apply=${apply}`);
if(apply){
  let completed=0;
  for(const item of pending){
    const updated=await request(item.entry.table,item.filters,'PATCH',item.patch);
    if(updated.length!==1)throw new Error(`Concurrent edit prevented write: ${item.entry.id}`);
    completed++;
    if(completed%25===0)console.log(`Corrected ${completed}/${pending.length} curriculum rows`);
  }
  // Read back every edited field, not merely the HTTP result.
  for(const entry of plan.entries){
    const [row]=await request(entry.table,{id:`eq.${entry.id}`,select:'*'});
    if(entry.slides){
      for(const edit of entry.slides)if(!matches(row[entry.field].find(s=>s.id===edit.id)??{},edit.after))throw new Error(`Readback failed ${edit.id}`);
    }else if(!matches(row,entry.after))throw new Error(`Readback failed ${entry.id}`);
  }
  console.log(`Verified all ${plan.entries.length} planned curriculum row corrections. Question IDs and student work retained.`);
  // Also verify untouched questions: the final bank must match the reviewed bank.
  for(let offset=0;offset<plan.questions.length;offset+=60){
    const expected=plan.questions.slice(offset,offset+60);
    const rows=await request('homework_questions',{
      id:`in.(${expected.map(q=>q.id).join(',')})`,
      select:Object.keys(expected[0]).join(','),
    });
    for(const q of expected)if(!matches(rows.find(row=>row.id===q.id)??{},q))throw new Error(`Final bank verification failed: ${q.id}`);
  }
  console.log(`Verified all ${plan.questions.length} questions across ${plan.assignments.length} Practices against the reviewed final bank.`);
}
