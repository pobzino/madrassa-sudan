import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const plan=JSON.parse(await readFile(new URL('./plan.json',import.meta.url),'utf8'));
test('all 41 Practices retain ten questions and all 410 stable IDs',()=>{
  assert.equal(plan.assignments.length,41);assert.equal(plan.questions.length,410);
  assert.equal(new Set(plan.questions.map(q=>q.id)).size,410);
  for(const a of plan.assignments){
    const qs=plan.questions.filter(q=>q.assignment_id===a.id);
    assert.equal(qs.length,10,a.id);
    assert.deepEqual(qs.map(q=>q.display_order).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8,9,10]);
  }
});
test('every bilingual choice has a valid, consistent canonical answer and index',()=>{
  for(const q of plan.questions){
    assert.ok(q.question_text_ar.trim()&&q.question_text_en.trim(),q.id);
    assert.ok(q.correct_answer?.trim(),q.id);
    if(q.question_type==='short_answer'){
      assert.equal(q.correct_option_index,null);continue;
    }
    assert.equal(q.options_ar.length,q.options_en.length,q.id);
    for(const options of [q.options_ar,q.options_en]){
      assert.ok(options.every(x=>typeof x==='string'&&x.trim()),q.id);
      assert.equal(new Set(options.map(x=>x.trim())).size,options.length,q.id);
    }
    assert.ok(Number.isInteger(q.correct_option_index)&&q.correct_option_index>=0&&q.correct_option_index<q.options_ar.length,q.id);
    assert.equal(q.correct_answer,q.question_type==='true_false'?(q.correct_option_index===0?'true':'false'):q.options_ar[q.correct_option_index],q.id);
  }
});
test('repairs preserve ownership, question identity, order, and points',()=>{
  for(const e of plan.entries.filter(e=>e.table==='homework_questions')){
    for(const k of ['id','assignment_id','display_order','points']) assert.equal(e.after[k],e.before[k],`${e.id}/${k}`);
  }
});
test('English spelling gaps and prepositions have Latin target choices in both modes',()=>{
  for(const q of plan.questions.filter(q=>(q.assignment_id.startsWith('c755')&&[1,2,3,4,5,6,9,10].includes(q.display_order))||(q.assignment_id.startsWith('bae0')&&[1,7].includes(q.display_order)))){
    assert.deepEqual(q.options_ar,q.options_en,q.id);
    assert.ok(q.options_ar.every(o=>!/[\u0600-\u06ff]/.test(o)),q.id);
  }
});
test('correction archive contains no external URLs or credentials',()=>{
  assert.doesNotMatch(JSON.stringify(plan),/https?:\/\/|service_role|audio_path|student_id/);
});
