# Live Practice content review — 9 September 2026

This is the detailed sample review. The subsequent [whole-bank review](practice-bank-review-2026-09-09.md) covers all 410 published-practice questions, their canonical answers and the 41 corresponding source decks after authenticated access became available. Access limitations below describe the initial sample-only phase.

## Coverage and limits

Reviewed all **10 final Practice questions** and the **10 saved lesson slides** for the public Grade 1 English sample, “Week 1 ESL: Hello, Please, Thank you & Goodbye”.

- Lesson ID: `40cd0100-abf4-4e6a-a2bf-9a1a3b49d010`.
- Live question source: https://amalschool.org/sample-lesson?practice=1 (public server-rendered question payload).
- Live lesson source: https://amalschool.org/api/sample-lesson (recorded deck snapshot).
- This is **one Practice**, not an audit of the whole school question bank. The total bank size is unknown pending authenticated access.
- Checked wording, answer keys, bilingual meaning, self-contained context, suitability for beginning learners, repetition and alignment with the saved lesson.
- Audio files and the teacher recording have **not** been listened to. Saved speaker notes do not establish what was actually recorded.
- No production content has been changed. Corrections below are proposed replacements.

## Finding

All ten stored answer keys agree with the intended four phrases. The Practice covers all four phrases, but is heavily weighted toward recognising their definitions and repeats greeting/leaving/asking/thanking questions. It is usable as basic recall practice, but needs revision before being described as a strong assessment.

The English version needs particular attention: it sometimes supplies the answer in the question, and it requires beginning English learners to understand unnecessary words such as “farewell”. Arabic support remains appropriate; retaining the four English target phrases in both sets of answer choices is intentional, not a translation defect.

## Question-by-question decisions

| Q | Question ID | Decision and evidence |
| --- | --- | --- |
| 1 | `22ee928a-fdcd-413a-accc-93b4c606de86` | Keep. Meeting friends/family clearly calls for **Hello**, index 0. Both languages provide the situation. |
| 2 | `f90f77dc-3ea5-489f-a901-39835a63569b` | Revise English. “When we say goodbye to someone, we say:” explicitly includes **Goodbye**, the correct answer at index 2. Arabic does not have the same English-word clue. |
| 3 | `6fe81146-85ed-47ce-b807-44f305f863f5` | Keep. Asking a classmate for a pencil clearly calls for **Please**, index 1, and closely matches the taught example. |
| 4 | `ff4234b1-ca58-4436-9509-3c4569a68425` | Keep. Receiving help/something clearly calls for **Thank you**, index 3. |
| 5 | `5fd3171e-26f0-400c-9282-7f62b9597df1` | Revise. “Hello means hi or welcome” broadens the gloss unnecessarily; “welcome” is not always interchangeable with “hello”. Use a concrete greeting situation with the existing **true**, index 0 key. |
| 6 | `525d96d7-315f-4df8-9a33-557f023f9332` | Keep, with optional future improvement. “Please” for parting is correctly **false**, index 1. It checks a real distinction among the four phrases, although binary questions allow guessing. |
| 7 | `5a6c6f5b-6a3e-4ccc-bf39-f945993e524f` | Revise for beginner accessibility. “Goodbye means farewell” is factually correct (**true**, index 0), but introduces a harder, untaught English synonym. Test leaving in a short situation instead. |
| 8 | `9a87a7b3-ff3e-4879-bc34-53b2028473b1` | Optional revision. The **Please**, index 0 key is correct; “Which word ... when asking politely?” largely repeats Q3. A fresh request context improves transfer slightly, though it remains the same skill. |
| 9 | `e7cdc5d0-3043-4573-bd62-14bc25cbd6ba` | Revise for quality. “Which word ... to thank someone?” largely repeats Q4 and gives an English lexical clue to **Thank you**, index 2. Use a specific act of help. |
| 10 | `6aae8246-4a8a-4bb1-8dd0-7745c63df7ea` | Revise. The English prompt again includes “say goodbye” while **Goodbye**, index 3 is the answer. Test the leaving context without naming the phrase. |

## Ready-to-apply wording

These revisions retain existing question IDs, types, option order, correct answers and indices. They require corresponding question audio to be regenerated or invalidated when applied; old audio must not continue reading the previous wording.

| Q | Arabic prompt | English prompt | Answer |
| --- | --- | --- | --- |
| 2 | انتهت زيارتك لجدتك، وأنت تغادر الآن. ماذا تقول؟ | Your visit to Grandma is over. You are leaving. What do you say? | Goodbye |
| 5 | قابلت صديقك، فقلت له «Hello» لتحيّيه. هل استخدمت الكلمة بشكل صحيح؟ | You meet a friend. You say “Hello” to greet them. Is that correct? | true |
| 7 | أنت تغادر المدرسة، فتقول لأصدقائك «Goodbye». هل استخدمت الكلمة بشكل صحيح؟ | You are leaving school. You say “Goodbye” to your friends. Is that correct? | true |
| 8 | تريد أن تطلب من صديقك كتابًا. أي كلمة تجعل طلبك مهذبًا؟ | You want to ask your friend for a book. Which word makes your request polite? | Please |
| 9 | وقع قلمك على الأرض، فرفعه صديقك وأعطاك إياه. ماذا تقول له؟ | You drop your pencil. Your friend picks it up for you. What do you say? | Thank you |
| 10 | انتهى اللعب، وأصدقاؤك ذاهبون إلى بيوتهم. ماذا تقول لهم قبل أن يذهبوا؟ | Playtime is over. Your friends are going home. What do you say before they leave? | Goodbye |

These are incremental repairs within the existing question formats. They do not turn the Practice into a listening assessment. To assess the lesson's listening objective, a later exercise should play one of the taught phrases and ask the child to select its meaning, with the recording actually available. Reading the full question aloud is accessibility support, not evidence of listening recognition by itself.

## Related defects in the saved lesson source

These are separate from the final Practice questions, but matter when the lesson is used as the source for generation or review.

1. **Slide 8, Training 1** (`03ecca8f-7fb9-4430-87cb-a5143732252b`): Arabic asks what to say when meeting friends at school, and `interaction_correct_index: 0` selects **Hello**. Both saved speaker-note tracks instead tell the teacher to confirm **Please**; the idea-focus fields also describe a polite request. Align the notes and idea focus with greeting/Hello. The English prompt is merely “Choose the correct word”; it omits the situation. Suggested English: “You meet your friends at school. What do you say?” Suggested Arabic confirmation: “الإجابة Hello، لأننا نقولها عندما نقابل أصحابنا.” Check the actual recording before deciding whether it also needs correction.
2. **Slide 9, Training 2** (`4d337ae2-a683-496e-b4e4-8d905066299f`): Arabic provides the teacher-giving-a-book situation; English only says “Choose the correct answer.” Add the missing English situation: “Your teacher gives you a book. What do you say?” The stored **Thank you** answer at index 1 is appropriate. Remove the duplicated initial alif in Arabic “ااختار”.
3. **Slide 7 matching activity** (`e0e361ee-f7d0-4425-a35e-9282e57ea476`): Arabic matches phrases to their uses, whereas English describes gestures. Both can be taught, but the two versions ask different tasks. Align English with the Arabic uses: “meeting someone”, “leaving”, “asking politely”, “thanking someone”, with the prompt “Match each phrase to when we use it.”

## Next review gate

Authenticated teacher/admin access is required to enumerate and inspect the remaining live Practices and their source lessons. Do not infer that unreviewed Practices passed from this sample or from automated checks of field completeness. Track every Practice and every question explicitly, and record any missing source or inaccessible audio as an unresolved check.
