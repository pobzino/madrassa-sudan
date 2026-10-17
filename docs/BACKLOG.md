# Amal School — product backlog

Open work, roughly in the order it should happen. Items move to the git log
when they ship; this file only holds what is still ahead. Keep entries short:
what, why, rough size, what it needs.

## Now

### Regenerate every boss under the new rules (owner, ~10 minutes)
Teacher → Learning Path → **Regenerate all**, English first, then Mathematics.
The pools published before 17 Oct 2026 were written by the fast model under the
old rules and contain self-matching pairs (`cat → cat`), "match to its Arabic
name" items with English partners, and counting-letters items. Regenerate all
unpublishes, rewrites each boss with the background writer (gpt-6.1-sol, medium
reasoning, `pointless` verifier flag) and leaves drafts to review and publish.

### Offline Practice (~2 days)
A downloaded lesson cannot be *completed* offline: finishing a practice-gated
lesson means passing its Practice, and the Practice is fetched live, so an
offline child stops at the first gate. Bundle the Practice questions into the
lesson download, grade locally with the shared interaction code, queue the
attempt, and add a sync endpoint that accepts the whole attempt, grades it
server-side and creates the submission (which then completes the lesson).
First because it unblocks offline lesson completion for camp classrooms.

### Offline boss battles ("battle packs", ~3–4 days)
When a boss becomes available and the phone is online, download a pack: the 12
drawn questions with keys, narration clips, pre-computed Owl Hints (boss art and
voice lines are static files the service worker already caches). A local battle
engine mirrors the server rules (hearts, HP, combo, three phases, Big Move
clock). On reconnect the child's raw answers replay through
`start_milestone_battle` / `record_milestone_answer`, so grading, stars,
certificate, family email and measurement are the server's, not the phone's.
Conflict (child already played online meanwhile): keep whichever finished first.
Clamp `started_at` on sync like lesson activity. The starting boss uses the same
path. Accepted exposure: keys sit in IndexedDB while a pack is downloaded.

## Next

### Class / group mode
Marfa Saeed (approved teacher, camp classroom, 17 Oct 2026) ran Numbo as a
whole-class challenge from her own account on one phone — in preview, so no
certificate, nothing saved, nothing measured. Ask her how many children and
phones. Likely shape: bigger text, a "who answers?" turn-taker, a class
certificate, and a way to attribute a class session to her students without
individual logins. Sits naturally on top of offline battle packs.

### Starting-boss ceiling
Three real starting bosses in a row at 12/12 (محاسن, Mohamed, آنيا, 17 Oct).
If it keeps happening the measurement baseline has a ceiling: check whether the
easy band is too easy, whether an adult answers, and whether the placement
should draw more from later weeks.

### Retention email
Only 90 of 388 new parents (9–16 Oct) signed in a second time. The weekly email
only reaches families with activity or opt-in; a "come back" email after three
quiet days is the same template plumbing. Separate decision: a one-off email to
the ~250 confirmed-but-silent sign-ups.

### Staff preview certificate
Staff battles are previews: no certificate is created, the win screen says so.
Show an unsaved on-screen "preview" certificate so staff can see the artefact
without a student account.

## Later / open questions

- **Amowl in Arabic**: the owner has no spelling yet; Arabic copy keeps
  "بومة آمال". Candidates: أمول (transliteration) or آمول (ties to آمال).
- **ElevenLabs**: the plan ends this month; `scripts/voice-boss-lines.ts` re-records
  only changed lines, so finish any boss-line edits before the key is rotated.
  Amowl's own voice (Teddy) is added to the account but not used yet.
- **Impact page**: show "starting boss → Grand Challenge" as its own growth row
  (today the Grand Challenge counts as the latest Big Challenge).
- **Arabic copy review** by a native speaker across the battle, placement and
  certificate strings.
- **Teacher hint**: a Grand Challenge drafted before the path grew shows a
  warning; consider auto-regenerating when weeks are added.
