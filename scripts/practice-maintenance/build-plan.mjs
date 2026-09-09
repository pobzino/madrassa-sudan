import {readFile,writeFile} from 'node:fs/promises';
import {correctQuestions} from './corrections.mjs';
import {correctDeck} from './source-corrections.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
const snapshot = JSON.parse(await readFile(process.argv[2],'utf8'));
const output = process.argv[3];
if(!output || snapshot.assignments.length !== 41 || snapshot.questions.length !== 410) throw new Error('Expected the full audited bank and an output path');
const questions = correctQuestions(snapshot.questions);
const entries = [];
function entry(table,id,before,after) {
  if(!equal(before,after)) entries.push({table,id,before,after});
}
questions.forEach((q,i)=>entry('homework_questions',q.id,snapshot.questions[i],q));
const changedSlides = new Map();
for(const [table,list,field] of [['lesson_slides',snapshot.decks,'slides'],['lesson_sims',snapshot.sims,'deck_snapshot']]) {
  for(const row of list) {
    const after = correctDeck(row[field]);
    const edits=[];
    for(const [i,slide] of row[field].entries()) {
      const fields=Object.keys(after[i]).filter(k=>!equal(after[i][k],slide[k]));
      if(!fields.length) continue;
      const beforeFields=Object.fromEntries(fields.map(k=>[k,slide[k]??null]));
      const afterFields=Object.fromEntries(fields.map(k=>[k,after[i][k]]));
      edits.push({id:slide.id,before:beforeFields,after:afterFields});
      if(table==='lesson_slides') changedSlides.set(slide.id,{before:slide,after:after[i]});
    }
    if(edits.length) entries.push({table,id:row.id,field,slides:edits});
  }
}
// Keep canonical tasks aligned with their edited slide, retaining all IDs.
for(const task of snapshot.tasks) {
  const change=changedSlides.get(task.linked_slide_id);
  if(!change)continue;
  const {before,after}=change;
  const next=structuredClone(task);
  for(const [field,slideField] of [['title_ar','title_ar'],['title_en','title_en'],['instruction_ar','body_ar'],['instruction_en','body_en']]) {
    if(!equal(before[slideField],after[slideField]))next[field]=after[slideField]??'';
  }
  for(const [field,slideField]of Object.entries({prompt_ar:'interaction_prompt_ar',prompt_en:'interaction_prompt_en',options_ar:'interaction_options_ar',options_en:'interaction_options_en',correct_index:'interaction_correct_index',expected_answer_ar:'interaction_expected_answer_ar',expected_answer_en:'interaction_expected_answer_en'})) {
    if(!equal(before[slideField],after[slideField]))next.task_data[field]=after[slideField];
  }
  if(task.task_type==='sort_groups'){
    next.task_data.groups_ar=after.interaction_targets_ar;
    next.task_data.groups_en=after.interaction_targets_en;
    next.task_data.items=next.task_data.items.map((item,i)=>({...item,group_index:after.interaction_solution_map[i]}));
  }
  if(task.task_type==='match_pairs') next.task_data.pairs=next.task_data.pairs.map((pair,i)=>({...pair,right_ar:after.interaction_targets_ar[i],right_en:after.interaction_targets_en[i]}));
  entry('lesson_tasks',task.id,task,next);
}
await writeFile(output,JSON.stringify({version:1,reviewDate:'2026-09-09',assignments:snapshot.assignments,questions,entries},null,2)+'\n');
console.log(JSON.stringify({questions:entries.filter(e=>e.table==='homework_questions').length,sourceRows:entries.filter(e=>e.slides).length,tasks:entries.filter(e=>e.table==='lesson_tasks').length}));
