# Practice alignment investigation, 23 September 2026

## Scope

Read-only production snapshot of curriculum records: 58 lessons, 42 Practice
assignments, 41 path steps, 44 recordings, 53 editable decks and 423 questions.
No student profiles, responses or grades were exported or changed.

All 41 published lessons have a published Practice. Every path-step Practice
points back to that step's lesson. No swapped lesson/Practice links were found.
Screened all 410 published English question stems against lesson topics and
inspected selected bilingual slide content and recording timelines. This is
not certification of every question, image, recording or spoken explanation.

## Confirmed source-selection defects

- The Practice generator used every slide in a recording's saved deck, not
  just slides actually visited in playback. Six published decks contain 18
  slides never entered by their recording timeline (before clip filtering).
- Teacher preparation notes were included as if they were taught content.
  Notes are not a transcript. Some contradict the edited visible slide text.
- The extractor fell back from an empty Arabic field to English even when
  the player uses Arabic only. Some alternate-language fields are stale.

Examples: the Arabic Adding 2-Digit Numbers deck teaches tens/ones and
13 + 24, while several English fields still describe equal groups or sums
within 20. Subtracting 2-Digit Numbers contains eight unused slides, including
addition, making 20 and doubles. Counting On & Back shows a sequence increasing
by three in Arabic while its English body still says add two.

These are real generation risks, not proof that the reported learner saw a
particular wrong question. The inspected Arabic two-digit lessons do teach
their respective operations; stale English fields alone do not establish that
their currently published Practices are off-topic.

## Local prevention changes

New Practice generation now selects slides with retained playback time using
the player's clip rules, respects fixed slide language, excludes preparation
notes and stops on source-query errors. Existing Practices are preserved.
The legacy standalone AI audit script still uses its older broad source and
must not be treated as proof of recording-level alignment.

No production content, assignments, recordings, grades or deployment changed.
The reported lesson/question is still needed to pinpoint and correct the
learner-facing mismatch. Image-only explanations and spoken teaching require
direct review; this text filter cannot establish everything a child heard.
