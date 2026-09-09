// Content corrections only: do not alter slide IDs, media, recording timing,
// strokes, task IDs, or learner responses. Recorded speech is not rewritten.
const replacements = [
  ['الربع يعني أربعة أجزاء متساوية','الربع هو جزء واحد من أربعة أجزاء متساوية'],
  ['الربع أربعة أجزاء متساوية','الربع جزء واحد من أربعة أجزاء متساوية'],
  ['النصف على أنه جزآن متساويان','النصف على أنه جزء واحد من جزأين متساويين'],
  ['النصف هو جزآن متساويان','النصف هو جزء واحد من جزأين متساويين'],
  ['النصف جزآن متساويان','النصف جزء واحد من جزأين متساويين'],
  ['a quarter is four equal parts','a quarter is one of four equal parts'],
  ['A quarter means four equal parts','A quarter means one of four equal parts'],
  ['a quarter means four equal parts','a quarter means one of four equal parts'],
  ['A half is two equal parts','A half is one of two equal parts'],
  ['a half is two equal parts','a half is one of two equal parts'],
  ['a half means two equal parts','a half means one of two equal parts'],
  ['a half as two equal parts','a half as one of two equal parts'],
];
const updates = {};
function set(id, fields) { updates[id] = {...updates[id],...fields}; }
function explain(id, ar, en, titleAr, titleEn) {
  set(id,{body_ar:ar,body_en:en,speaker_notes_ar:ar,speaker_notes_en:en,
    ...(titleAr?{title_ar:titleAr,title_en:titleEn}: {})});
}
explain('fc07ad31-2862-47b4-813d-4f83f558e7a6',
  'لنفس الكل، النصف أكبر من الربع. النصف جزء واحد من جزأين متساويين، والربع جزء واحد من أربعة أجزاء متساوية.',
  'For the same whole, a half is bigger than a quarter. A half is one of two equal parts; a quarter is one of four equal parts.');
set('111884f9-f120-42cb-9416-64a76825e2e9',{title_ar:'النصف جزء واحد من جزأين متساويين',title_en:'A half is one of two equal parts'});
set('4941593b-b182-4a82-a016-efb5b2607e7b',{bullets_ar:['جزء واحد من جزأين متساويين','الكل والجزء','النصف في الأشكال والمجموعات','نصف العدد'],bullets_en:['One of two equal parts','Whole and part','Halves in shapes and sets','Half of a number']});
explain('72b45869-6ed2-44c8-9e94-4b49c415bb50','ابحث عن نقطة البداية في نموذج الحرف، ثم اتبع الأسهم وترتيب الخطوط. تختلف خطوات الكتابة باختلاف الحرف.','Find the starting point in the letter model, then follow its arrows and stroke order. Different letters have different strokes.','اتبع نموذج الحرف','Follow the letter model');
explain('c8dffca2-5dc6-4d21-ad0d-7a0ca2cc7945','للحروف الصغيرة أشكال وارتفاعات مختلفة: a حرف قصير، وb يمتد إلى الأعلى، وg يمتد أسفل السطر. اتبع نموذج كل حرف.','Lowercase letters have different shapes and heights: a is short, b reaches up, and g extends below the baseline. Follow each letter’s model.');
explain('8326511a-40fd-4d3e-8237-16a48887b6ba','اتبع نقطة البداية والأسهم وترتيب الخطوط في نموذج الحرف. ارفع القلم عندما يطلب النموذج ذلك.','Follow the starting point, arrows and stroke order in the letter model. Lift your pencil when the model requires it.');
explain('9012e710-8f75-4aa5-9cb3-9a0277a287b0','هذه حروف كبيرة: A B C. اتبع نقطة البداية والأسهم في نموذج كل حرف واكتب بوضوح.','These are capital letters: A B C. Follow the starting point and arrows for each model and write clearly.');
explain('ca3d9272-e91d-4d24-b227-1ae62710da5c','تحتوي هذه الحروف على منحنيات: a c d e g o q. اتبع نموذج كل حرف.','These letters include curves: a c d e g o q. Follow each letter’s model.');
explain('95bd6505-d201-420b-b623-e597fd0a790d','تعلمنا تكوين الحروف الكبيرة والصغيرة. نستخدم نقطة البداية والأسهم في نموذج كل حرف ونترك الحروف واضحة.','We practised forming capital and lowercase letters. We follow each model’s starting point and arrows and write clearly.');
set('95bd6505-d201-420b-b623-e597fd0a790d',{bullets_ar:['اتبع نقطة البداية','اكتب الحروف الكبيرة','اكتب الحروف الصغيرة','اتبع الأسهم'],bullets_en:['Follow the starting point','Write capital letters','Write lowercase letters','Follow the arrows']});
// Distinguish names from sounds in words; avoid adding a vowel to consonants.
const phonics = [
  ['8e93f39e-de93-4834-9c1d-30a1332b0a54','O','o','orange','برتقال','اسم O ليس صوته القصير في orange.','The letter name O is different from its short sound in orange.'],
  ['96a09baf-a683-4a21-84c5-dec3e2f049c5','P','p','pen','قلم','صوت /p/ يختلف عن /b/: أغلق الشفتين ثم أطلق الهواء دون اهتزاز الصوت.','For /p/, close your lips and release a puff of air without voice. It differs from /b/.'],
  ['222efb02-af9b-4300-b787-76c2b1c50802','Q','q','queen','ملكة','نرى q غالبًا مع u. في queen يصنع الحرفان qu الصوتين /k/ ثم /w/، وليس اسم الحرف «كيو».','Q often comes with u. In queen, qu represents /k/ followed by /w/, not the letter name cue.'],
  ['adb29d28-030e-4c3d-9e45-831a9191e588','S','s','sun','شمس','صوت /s/ قريب من س وليس ص. لا تضف حركة بعده.','Use the /s/ sound in sun without adding an extra vowel.'],
  ['2a45015c-e7ac-4ba6-b8c4-63d9c24a66c6','U','u','umbrella','مظلة','اسم U «يو» يختلف عن صوته القصير في umbrella.','The name U, pronounced you, differs from its short sound in umbrella.'],
  ['6b523ced-3635-4e69-baee-803eb8cda3b2','V','v','van','شاحنة صغيرة','صوت /v/ يختلف عن /f/: المس الشفة السفلى بالأسنان العليا وأخرج الصوت مع اهتزاز.','For /v/, touch the lower lip with the upper teeth and use your voice. /f/ has no voice.'],
  ['4c819def-cfc5-4550-9e8a-62deb304509c','X','x','box','صندوق','اسم الحرف «إكس»، لكنه يمثل في نهاية box الصوتين /k/ ثم /s/.','The letter name is ex, but at the end of box it represents /k/ followed by /s/.'],
  ['239cfdc0-6a1d-4d72-9820-42ffb45a72cf','Y','y','yellow','أصفر','اسم الحرف «واي» يختلف عن صوته في بداية yellow.','The letter name why differs from its sound at the start of yellow.'],
  ['e3b7436c-d411-468c-95a6-a41f8122f674','Z','z','zebra','حمار وحشي','اسم الحرف «زِد» يختلف عن صوت /z/ في zebra.','The letter name zed differs from the /z/ sound in zebra.'],
];
for(const [id,upper,lower,word,meaning,ar,en] of phonics) explain(id,
  `${upper} كبير / ${lower} صغير. الكلمة ${word} تعني «${meaning}». ${ar}`,
  `${upper} uppercase / ${lower} lowercase. Example: ${word}. ${en}`);
explain('a1f6346c-e207-4142-99f4-5123a7da0776','هذا هرم قاعدته مربعة. له 5 أوجه و8 حواف و5 أركان. يمكنه الانزلاق.','This is a square-based pyramid. It has 5 faces, 8 edges and 5 vertices. It can slide.','هرم قاعدته مربعة','Square-based pyramid');
set('b99efdcf-bf0d-40ea-8164-9fcd76803268',{interaction_targets_ar:['0 أضلاع مستقيمة','3 أضلاع مستقيمة','4 أضلاع مستقيمة'],interaction_targets_en:['0 straight sides','3 straight sides','4 straight sides'],interaction_solution_map:[0,2,1,2]});
set('9c1dbc0f-d427-465c-a0ef-6f9f5298a789',{body_ar:'أي شكل له أربعة أضلاع متساوية وأربع زوايا قائمة؟',body_en:'Which shape has four equal sides and four right angles?'});
set('39b4ee98-0ac5-42b6-9e88-095de233c8a8',{body_ar:'ما العدد التالي؟ 11، 12، 13، 14، __',body_en:'What number comes next? 11, 12, 13, 14, __',interaction_options_ar:['13','15','16'],interaction_options_en:['13','15','16'],interaction_correct_index:1,interaction_prompt_ar:'أكمل بالعدد الناقص.',interaction_prompt_en:'Choose the missing number.',speaker_notes_ar:'العدد التالي هو 15. نضيف واحدًا كل مرة.',speaker_notes_en:'The next number is 15. We add one each time.'});
set('e0e361ee-f7d0-4425-a35e-9282e57ea476',{body_en:'Match each phrase to when we use it.',interaction_prompt_en:'Match each phrase to when we use it.',interaction_targets_en:['When we meet someone','When we leave','When we ask politely','When we thank someone']});
set('03ecca8f-7fb9-4430-87cb-a5143732252b',{body_en:'You meet your friends at school. What do you say?',interaction_prompt_en:'You meet your friends at school. What do you say?',interaction_correct_index:0,speaker_notes_ar:'عندما نقابل أصحابنا نقول Hello للتحية.',speaker_notes_en:'When we meet our friends, we say Hello to greet them.',idea_focus:'Hello'});
set('4d337ae2-a683-496e-b4e4-8d905066299f',{body_en:'Your teacher gives you a book. What do you say?',interaction_prompt_en:'Your teacher gives you a book. What do you say?'});
explain('c8d41e4e-c3d4-4ac7-ba34-4c56c2df39ae','في هذا المخطط، كل مربع يمثل إجابة واحدة. نعد المربعات في كل عمود لنعرف عدد الإجابات.','In this block graph, each square represents one response. Count the squares in each bar to find the number of responses.');
explain('d65adbde-9c98-4b6a-8f92-fdec76ca012d','نقرأ مفتاح مخطط الصور أولًا. في مثالنا كل صورة تمثل شيئًا واحدًا، لذلك نعد الصور ثم نقارن المجموعات. قد تختلف قيمة الصورة في مخطط آخر.','Read the pictogram key first. In our example, each picture represents one thing, so count the pictures and compare groups. A different chart may use a different key.');
set('1097008d-b1c7-4706-bff8-10f69a1a584d',{bullets_ar:['جدول العد يساعدنا على جمع البيانات','مخطط الأعمدة يبين العدد','نقرأ مفتاح مخطط الصور قبل العد','نقارن لنجد الأكثر والأقل'],bullets_en:['A tally chart records data','A block graph shows numbers','Read the pictogram key before counting','Compare to find most and least']});
function replace(value) {
  if(Array.isArray(value)) return value.map(replace);
  if(typeof value !== 'string') return value;
  return replacements.reduce((s,[from,to])=>s.replaceAll(from,to),value);
}
export function correctDeck(deck) {
  return deck.map(s=>({...Object.fromEntries(Object.entries(s).map(([k,v])=>[k,replace(v)])),...updates[s.id]}));
}
