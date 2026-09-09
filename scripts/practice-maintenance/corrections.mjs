// Human-authored, targeted repairs from docs/practice-bank-review-2026-09-09.md.
// Prefixes identify the audited assignments, not titles or newly generated sets.
export function correctQuestions(original) {
  const questions = structuredClone(original);
  function get(prefix, order) {
    const found = questions.filter(q => q.assignment_id.startsWith(prefix) && q.display_order === order);
    if (found.length !== 1) throw new Error(`Expected exactly one audited question: ${prefix}/${order}`);
    return found[0];
  }
  function p(prefix, n, ar, en, arOptions, enOptions, index) {
    const q = get(prefix, n);
    if (ar) q.question_text_ar = ar;
    if (en) q.question_text_en = en;
    if (arOptions) {
      q.options = q.options_ar = arOptions;
      q.options_en = enOptions ?? arOptions;
      q.correct_option_index = index ?? q.correct_option_index;
      q.correct_answer = q.question_type === 'true_false'
        ? (q.correct_option_index === 0 ? 'true' : 'false') : arOptions[q.correct_option_index];
    }
    return q;
  }
  function target(prefix, ns) {
    for (const n of ns) {
      const q = get(prefix, n);
      p(prefix,n,null,null,q.options_en,q.options_en);
    }
  }
  function meaning(prefix, n, cue) {
    p(prefix,n,`اختر الكلمة أو العبارة الإنجليزية التي تعني «${cue}».`,`Choose the English word or phrase meaning «${cue}».`);
    target(prefix,[n]);
  }
  function write(prefix,n,ar,en,answer) {
    Object.assign(p(prefix,n,ar,en), {question_type:'short_answer',options:null,options_ar:null,options_en:null,correct_option_index:null,correct_answer:answer});
  }
  p('b6a0',4,'عدّ التفاحات. أي عدد يطابقها؟ 🍎 🍎 🍎 🍎','Count the apples. Which number matches? 🍎 🍎 🍎 🍎');
  p('0794',5,'عدّ النقاط. كم نقطة؟\n● ● ● ● ● ●\n● ● ● ● ● ●\n● ● ● ● ● ●','Count the dots. How many are there?\n● ● ● ● ● ●\n● ● ● ● ● ●\n● ● ● ● ● ●');
  p('590c',6,'أي عدد يطابق هذه التفاحات؟ 🍎 🍎 🍎 🍎 🍎','Which number matches these apples? 🍎 🍎 🍎 🍎 🍎');
  write('590c',10,'اكتب بالأرقام العدد «ستة عشر».','Write the number sixteen using digits.','16');
  p('a090',7,'عند العدّ للأمام بالاثنين، نزيد 2 كل مرة.','When counting forward in twos, we add 2 each time.');
  p('2983',2,'باستخدام طريقة العدّ من العدد الأكبر، من أين نبدأ لحساب 5 + 2؟','Using the bigger-number-first count-on strategy, where do we start for 5 + 2?');
  p('2983',8,'يمكننا الجمع بالبدء من العدد الأكبر ثم العدّ للأمام.','We can add by starting at the bigger number and counting on.');
  p('5a92',1,'أي شكل له أربعة أضلاع متساوية وأربع زوايا قائمة؟','Which shape has four equal sides and four right angles?');
  p('5a92',5,'أي وصف صحيح لكل مستطيل؟','Which description is true of every rectangle?',
    ['كل ضلعين متقابلين متساويان وله أربع زوايا قائمة','له ثلاثة أضلاع','ليس له زوايا','كل أضلاعه منحنية'],
    ['Opposite sides are equal and it has four right angles','It has three sides','It has no corners','All its sides are curved'],0);
  p('5a92',10,'أي جزء من هذه الأشياء مسطح وشكله مستطيل؟','Which part of these objects is flat and rectangular?',
    ['غلاف كتاب مستطيل','سطح كرة','طبق دائري','وجه ساعة دائري'],['A rectangular book cover','The surface of a ball','A round plate','A round clock face'],0);
  p('1d68',6,null,null,['كرة','أسطوانة','هرم قاعدته مربعة','مكعب'],['Sphere','Cylinder','Square-based pyramid','Cube'],2);
  p('1d68',9,'ما اسم النقطة التي تلتقي عندها حواف المكعب؟','What is the point where edges of a cube meet called?');
  p('0dc2',3,'زرافة ارتفاعها 5 أمتار وفيل ارتفاعه 3 أمتار. الزرافة أطول.','A giraffe is 5 metres tall and an elephant is 3 metres tall. The giraffe is taller.');
  p('0dc2',7,'كوب شفاف مستقيم الجوانب يصل الماء إلى نصف ارتفاعه. كيف نصفه؟','A clear, straight-sided cup has water halfway up it. How do we describe it?');
  p('0dc2',9,'كوبان متماثلان: الأول ممتلئ والثاني نصف ممتلئ. في الأول ماء أكثر.','Two identical cups: the first is full and the second half full. The first has more water.',['صحيح','خطأ'],['True','False'],0);
  p('0dc2',10,'كوبان متماثلان. الأول ممتلئ والثاني فارغ. أيهما يحتوي على ماء أكثر؟','Two identical cups: the first is full and the second empty. Which contains more water?',
    ['الأول','الثاني','الكميتان متساويتان','لا يمكن تحديد ذلك'],['The first','The second','The amounts are equal','We cannot tell'],0);
  p('19d6',7,'نبدأ من 24 ونقفز عشرة واحدة للأمام على خط الأعداد. أين نصل؟','Start at 24 and jump one ten forward on a number line. Where do we land?', ['34','25','14','44'],null,0);
  p('8683',2,null,null,['3 عشرات و4 آحاد','4 عشرات و3 آحاد','3 عشرات و0 آحاد','0 عشرات و4 آحاد'],['3 tens and 4 ones','4 tens and 3 ones','3 tens and 0 ones','0 tens and 4 ones'],0);
  p('8683',10,null,null,['5 عشرات و2 آحاد','2 عشرات و5 آحاد','5 عشرات و0 آحاد','0 عشرات و2 آحاد'],['5 tens and 2 ones','2 tens and 5 ones','5 tens and 0 ones','0 tens and 2 ones'],0);
  p('57c4',3,'وضعنا 4 أقلام في كل واحد من 3 أكواب. أي وصف يطابق ترتيبنا؟','We put 4 pencils in each of 3 cups. Which description matches our arrangement?');
  p('57c4',4,'كم صفًا أفقيًا من النقاط ترى؟\n● ● ● ●\n● ● ● ●\n● ● ● ●','How many horizontal rows of dots can you see?\n● ● ● ●\n● ● ● ●\n● ● ● ●');
  p('57c4',7,'لدينا مجموعتان، في كل منهما 5 أشياء. أي جمع يطابق عدد الأشياء في كل مجموعة؟','We have two groups with 5 objects in each. Which addition shows the number in each group?');
  p('57c4',9,'في مصفوفة مستطيلة، عدّ كل الأشياء صفًا صفًا أو عمودًا عمودًا يعطي المجموع نفسه.','In a rectangular array, counting all the objects row by row or column by column gives the same total.');
  p('3ced',1,'أي موقف نستخدم فيه القسمة للمشاركة بالتساوي؟','In which situation do we use division to share equally?',
    ['نوزع 8 أقلام بالتساوي على طفلين','نضم 3 أقلام إلى قلمين','نرتب الأقلام حسب اللون','نقيس طول قلم'],['Share 8 pencils equally between two children','Add 3 pencils to 2 pencils','Sort pencils by colour','Measure a pencil'],0);
  p('3ced',2,'عند استخدام القسمة للمشاركة بالتساوي، يأخذ كل شخص العدد نفسه.','When using division to share equally, each person gets the same number.');
  p('3ced',10,'عندنا 10 قطع. وضعنا قطعتين في كل مجموعة، فكوّنا 5 مجموعات متساوية.','We have 10 counters. We put 2 in each group, making 5 equal groups.');
  p('2c88',1,'الربع جزء واحد من أربعة أجزاء ____ من الكل.','A quarter is one of four ____ parts of a whole.');
  p('2c88',6,'لنفس الكل، النصف أكبر من الربع.','For the same whole, a half is bigger than a quarter.');
  p('2c88',8,'قسمنا فطيرة إلى أربعة أجزاء غير متساوية. كل جزء ربع الفطيرة.','We cut a pie into four unequal parts. Each part is a quarter of the pie.');
  p('ab30',1,'ما معنى النصف؟','What is a half?',
    ['جزء واحد من جزأين متساويين','جزء واحد من ثلاثة أجزاء متساوية','جزء واحد من أربعة أجزاء متساوية','الكل'],
    ['One of two equal parts','One of three equal parts','One of four equal parts','The whole'],0);
  p('cf3c',3,'في مخطط أعمدة مقسّم إلى مربعات، كل مربع يمثل طفلًا واحدًا. كيف نعرف عدد الأطفال في عمود؟','In a block graph, each square represents one child. How do we find the number of children in a bar?');
  p('cf3c',4,'في مخطط صور مفتاحه «كل صورة تمثل طفلًا واحدًا»، تمثل ثلاث صور ثلاثة أطفال.','In a pictogram with the key “one picture represents one child”, three pictures represent three children.');
  p('cf3c',6,'مفتاح المخطط: كل نجمة تمثل طفلًا واحدًا. التفاح: ★ ★ ★ ★ ★. كم طفلًا اختار التفاح؟','Key: each star represents one child. Apples: ★ ★ ★ ★ ★. How many children chose apples?');
  p('cf3c',9,'ما العدد الذي تمثله علامات العدّ هذه؟ | | |','What number do these tally marks show? | | |');
  p('eff2',6,'أي عدد من الخيارات التالية زوجي؟','Which of these options is an even number?');

  p('4c1f',2,'انتهت الزيارة وأنت تغادر بيت صديقك. ماذا تقول؟','The visit is over and you are leaving your friend’s home. What do you say?');
  p('4c1f',5,'نقول Hello لتحية شخص عند مقابلته.','We say Hello to greet someone when we meet.');
  p('4c1f',7,'يمكنك قول Goodbye لصديقك وأنت تغادر.','You can say Goodbye to your friend as you leave.');
  p('4c1f',8,'أكمل الطلب المهذب: May I have some water, ___?','Complete the polite request: May I have some water, ___?');
  p('4c1f',9,'أعاد لك صديقك كتابًا أضعته. ماذا تقول له؟','Your friend returns a book you lost. What do you say?');
  p('4c1f',10,'انتهى اليوم الدراسي وأنت تغادر الفصل. ماذا تقول لأصحابك؟','The school day is over and you are leaving the classroom. What do you say to your friends?');
  for (const [n,cue] of [[1,'كيف حالك؟'],[2,'أنا بخير، شكرًا'],[3,'أنا سعيد'],[8,'آسف'],[9,'لا أعرف']]) meaning('2cd0',n,cue);
  p('2cd0',4,'أكمل الجملة لتعني «أنا سعيد»: I am ___.','Complete the sentence to mean «أنا سعيد»: I am ___.',['sorry','yes','happy','no'],null,2);
  for (const [n,cue] of [[1,'اجلس'],[2,'قف'],[3,'ارفع يديك'],[4,'صفق بيديك'],[5,'انظر'],[6,'اسمع']]) meaning('4ffc',n,cue);
  target('4ffc',[9,10]);
  p('4ffc',7,'طلب منك المعلم الجلوس على الكرسي فقال: Sit down.','The teacher wants you to take a seat, so says: Sit down.');
  p('4ffc',9,'تريد من زميلك أن يصفق بيديه. أي أمر تقوله؟','You want your classmate to clap. Which instruction do you give?');
  p('4ffc',10,'أي أمر يعني «انظر»؟','Which instruction means «انظر»?');
  target('e5fb',[1]);
  p('e5fb',1,'سارة تجيب عن السؤال What is your name? أي جواب يناسبها؟','Sara is answering What is your name? Which reply fits?');
  write('e5fb',9,'اسم الطفلة Mona. اكتب الاسم الناقص فقط: My name is ___.','The child’s name is Mona. Type only the missing name: My name is ___.','Mona');
  p('6a2c',1,'أي حرف صغير يطابق A؟','Which lowercase letter matches A?',['a','b','c','d'],null,0);
  p('6a2c',2,'أي حرف صغير يطابق B؟','Which lowercase letter matches B?');
  p('6a2c',8,'أي حرف كبير يطابق m؟','Which uppercase letter matches m?');
  p('5827',4,'الحرفان D وd شكلان للحرف نفسه.','D and d are two forms of the same letter.');
  p('5827',8,'الحرفان F وf شكلان للحرف نفسه.','F and f are two forms of the same letter.');
  p('24d1',1,'أي حرف صغير يطابق N؟','Which lowercase letter matches N?',['n','o','m','p'],null,0);
  p('24d1',2,'أي حرف صغير يطابق O؟','Which lowercase letter matches O?',['n','o','t','z'],null,1);
  p('24d1',6,'أي حرف صغير يطابق S؟','Which lowercase letter matches S?',['q','s','b','o'],null,1);
  p('24d1',10,'الحرفان V وF لهما الصوت نفسه في van وfan.','V and F make the same sound in van and fan.',['صحيح','خطأ'],['True','False'],1);
  p('bae0',1,'أكمل الكلمة الإنجليزية التي تعني «أنف»: _ose','Complete the English word for «أنف»: _ose',['n','m','p','t'],null,0);
  p('bae0',2,'أي حرف يبدأ كلمة pen؟','Which letter begins the word pen?');
  p('bae0',4,'رتّب الحروف أبجديًا: V, T, U','Put these letters in alphabetical order: V, T, U');
  p('bae0',7,'أكمل الكلمة الإنجليزية التي تعني «صندوق»: bo_','Complete the English word for «صندوق»: bo_',['x','y','z','q'],null,0);
  p('6e98',10,'أكمل الكلمة الإنجليزية التي تعني «قطة»: c_t','Complete the English word for «قطة»: c_t');
  write('abdd',5,'رتّب الحروف p ثم e ثم n لتكتب كلمة واحدة.','Put the letters p, then e, then n together. Type the word.','pen');
  write('abdd',8,'رتّب الحروف r ثم e ثم d لتكتب كلمة واحدة.','Put the letters r, then e, then d together. Type the word.','red');
  p('abdd',10,'أي ترتيب من اليسار إلى اليمين يجزّئ كلمة man إلى حروفها؟','Which left-to-right sequence splits man into its letters?',['m - n - a','n - a - m','a - m - n','m - a - n'],null,3);
  p('ba29',4,'أي كلمة تحتوي على الحرفين th معًا؟','Which word contains the letter pair th?');
  p('ba29',8,'أكمل الكلمة الإنجليزية التي تعني «شاحنة صغيرة»: _an','Complete the English word for «شاحنة صغيرة»: _an');
  p('ba29',9,'أكمل الكلمة الإنجليزية التي تعني «قلم»: _en','Complete the English word for «قلم»: _en');
  p('ba29',10,'أكمل الكلمة الإنجليزية التي تعني «يذهب»: _o','Complete the English word for «يذهب»: _o');

  for (const [n,cue] of [[1,'أحمر'],[2,'أصفر'],[5,'برتقالي'],[6,'وردي'],[7,'إنه أبيض'],[10,'شجرة خضراء']]) meaning('a080',n,cue);
  p('a080',3,'أكمل الجملة لتعني «إنه أخضر»: It is ___.','Complete the sentence to mean «إنه أخضر»: It is ___.');
  p('a080',4,'الكلمة Blue تعني «أزرق».','The word Blue means «أزرق».');
  for (const [n,cue] of [[1,'الأم'],[2,'الأب'],[3,'الأخ'],[4,'الأخت'],[5,'الجدة'],[6,'الجد'],[7,'الأسرة']]) meaning('2e3c',n,cue);
  p('2e3c',8,'يمكننا استخدام Mum بدلًا من Mother عند الحديث عن أمنا.','We can use Mum instead of Mother when talking about our mum.');
  p('2e3c',9,'كلمة Brother تعني «الأب».','Brother means «الأب».');
  p('2e3c',10,'تريد تقديم «أمك». أكمل: Hello, this is my ___.','You want to introduce «أمك». Complete: Hello, this is my ___.');
  for (const [n,cue] of [[1,'كبير'],[2,'صغير'],[5,'أنا سعيد'],[8,'حزين']]) meaning('7518',n,cue);
  meaning('7518',9,'الطفل صغير');
  for (const [n,cue] of [[1,'أنا أستطيع الركض'],[2,'أنا أستطيع القفز'],[4,'هل تستطيع أن تركض؟'],[6,'أنا لا أستطيع الطيران']]) meaning('af38',n,cue);
  p('af38',3,'سُئلت Can you fly? وأنت لا تستطيع الطيران. ما جوابك؟','You are asked Can you fly? You cannot fly. How do you reply?');
  target('af38',[10]);
  for (const [n,cue] of [[1,'يجري'],[2,'يمشي'],[3,'يقفز'],[4,'يأكل'],[7,'أنا أمشي'],[8,'هي تنام']]) meaning('c5c4',n,cue);
  // Assess -ing words, not a change from -ing to third-person singular.
  for (const n of [1,2,3,4]) {
    const verbs = {runs:'running',walks:'walking',eats:'eating',sleeps:'sleeping',jumps:'jumping',drinks:'drinking'};
    p('c5c4',n,null,null,get('c5c4',n).options_en.map(v=>verbs[v]));
  }
  p('1c3c',1,'قبل تتبّع حرف في نموذج الكتابة، ماذا نبحث عنه؟','Before tracing a letter in a handwriting model, what do we look for?',
    ['لون الصفحة','نقطة البداية والأسهم','اسم اليوم','آخر كلمة'],['The page colour','The starting point and arrows','The day’s name','The last word'],1);
  write('1c3c',3,'اكتب الحرف B مرة واحدة في مربع الإجابة. هذا تدريب على إدخال الحرف، وليس اختبارًا للخط.','Type B once in the answer box. This checks letter entry, not handwriting.','B');
  write('1c3c',4,'اكتب الحرف c مرة واحدة في مربع الإجابة.','Type c once in the answer box.','c');
  p('1c3c',9,'الحرفان B وb شكلان للحرف نفسه.','B and b are two forms of the same letter.');
  p('1c3c',10,'كل الحروف الإنجليزية تُكتب بالخطوات نفسها تمامًا.','Every English letter is formed with exactly the same strokes.');
  meaning('4d32',1,'قطة'); meaning('4d32',2,'كلب'); meaning('4d32',3,'أم وأب');
  p('4d32',6,'أكمل الكلمة الإنجليزية التي تعني «كلب»: d_g','Complete the English word for «كلب»: d_g');
  write('4d32',8,'اكتب الكلمة التي تتكون من الحروف m ثم u ثم m.','Type the word made from m, then u, then m.','mum');
  write('4d32',9,'اكتب الكلمة التي تتكون من الحروف d ثم a ثم d.','Type the word made from d, then a, then d.','dad');
  p('4d32',10,'في العبارة «mum dad» توجد مسافة بين الكلمتين.','In “mum dad”, there is a space between the two words.');
  target('7652',[1,3,4,7,8]);
  write('7652',2,'اسم الطفل Omar. اكتب الاسم الناقص فقط: My name is ___.','The child is called Omar. Type only the missing name: My name is ___.','Omar');
  write('7652',4,'أكمل بكلمة إنجليزية واحدة: I am 8 ___ old.','Complete with one English word: I am 8 ___ old.','years');
  write('7652',8,'أكمل بكلمة تعني «أحب»: I ___ cats.','Complete with the word meaning «أحب»: I ___ cats.','like');
  p('7652',9,'تنتهي جملة التعريف «My name is Lina.» بنقطة.','The statement “My name is Lina.” ends with a full stop.');
  target('c755',[1,2,3,4,5,6,9]);
  p('c755',7,'الكرة داخل الصندوق. الجملة The ball is on the box تصف مكانها بشكل صحيح.','The ball is inside the box. “The ball is on the box” correctly describes its position.',['صحيح','خطأ'],['True','False'],1);
  p('c755',8,'القطة أسفل الكرسي. الجملة The cat is under the chair تصف مكانها بشكل صحيح.','The cat is below the chair. “The cat is under the chair” correctly describes its position.');
  p('c755',10,'القلم داخل الحقيبة. أكمل: The pen is ___ the bag.','The pen is inside the bag. Complete: The pen is ___ the bag.',['on','in','under','next to'],null,1);
  for (const [n,cue] of [[1,'أحب التفاح'],[2,'اسمي علي'],[4,'عمري سبع سنوات'],[6,'هذا قلم'],[8,'أنا سعيد'],[10,'تفاحة وموزة']]) meaning('f25e',n,cue);
  return questions;
}
