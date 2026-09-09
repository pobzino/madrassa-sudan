import { writeFile } from 'node:fs/promises';
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Missing database configuration');
async function rows(table, select, filters = {}) {
  const result = [];
  for (let offset = 0; ; offset += 500) {
    const url = new URL(`/rest/v1/${table}`, base);
    url.search = new URLSearchParams({select, ...filters, order: 'id', offset: String(offset), limit: '500'});
    const response = await fetch(url, {headers: {apikey: key, Authorization: `Bearer ${key}`}});
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    const page = await response.json();
    result.push(...page);
    if (page.length < 500) return result;
  }
}
const lessons = await rows('lessons', 'id,title_ar,title_en,grade_level', {is_published:'eq.true'});
const lessonIds = new Set(lessons.map(x => x.id));
const assignments = (await rows('homework_assignments', 'id,lesson_id,title_ar,title_en', {is_published:'eq.true',is_practice:'eq.true'})).filter(x => lessonIds.has(x.lesson_id));
const questionFields = 'id,assignment_id,display_order,question_type,question_text_ar,question_text_en,options,options_ar,options_en,correct_option_index,correct_answer,points';
const questions = [];
for (const assignment of assignments) questions.push(...await rows('homework_questions', questionFields, {assignment_id:`eq.${assignment.id}`}));
const textFields = /^(id|type|title_ar|title_en|body_ar|body_en|bullets_ar|bullets_en|speaker_notes_ar|speaker_notes_en|interaction_.*|idea_focus)$/;
function textDeck(deck) {
  return Array.isArray(deck) ? deck.map(slide => Object.fromEntries(Object.entries(slide).filter(([key]) => textFields.test(key)))) : [];
}
const decks = (await rows('lesson_slides', 'id,lesson_id,slides')).filter(x => lessonIds.has(x.lesson_id)).map(x => ({...x,slides:textDeck(x.slides)}));
const sims = (await rows('lesson_sims', 'id,lesson_id,deck_snapshot,recorded_at,published', {published:'eq.true'})).filter(x => lessonIds.has(x.lesson_id)).map(x => ({...x,deck_snapshot:textDeck(x.deck_snapshot)}));
await writeFile('curriculum.json', JSON.stringify({lessons,assignments,questions,decks,sims},null,2));
console.log(`Exported published curriculum: ${assignments.length} Practices, ${questions.length} questions. No student tables accessed.`);
