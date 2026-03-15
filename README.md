# Amal Madrassa 🦉

**AI-Powered Education Platform for Displaced Sudanese Children**

Amal Madrassa is a free, open educational platform designed to support displaced Sudanese children through AI-powered tutoring, diagnostic assessments, teacher-facilitated homework, and parent/guardian progress tracking. Built with Next.js, Supabase, and OpenAI.

---

## Mission

Millions of Sudanese children have been displaced by conflict, losing access to consistent education. Amal Madrassa provides:

- **Personalized AI tutoring** in Arabic and English, adapting to each student's grade level
- **Diagnostic assessments** to identify learning gaps and place students appropriately
- **Teacher-created homework** with structured grading and feedback
- **Guardian portal** for parents and caregivers to monitor progress
- **Offline-first design** (planned) for areas with limited internet connectivity

**Our Goal:** Ensure every displaced child can continue learning, no matter where they are.

---

## Key Features

### For Students

- 🧠 **AI Tutor ("معلم البومة" / Owl Teacher):** Interactive learning assistant that explains concepts, guides problem-solving, and adapts to your grade level
- 📚 **Lessons:** Math, Science, English, and Arabic curriculum aligned with Sudanese standards
- 📝 **Homework:** Complete assignments, get instant feedback on objective questions, and receive teacher feedback on subjective work
- 📊 **Progress Dashboard:** Track lesson completion, quiz scores, and areas needing improvement
- 🌐 **Bilingual Support:** Full interface in Arabic and English

### For Teachers

- 👥 **Cohort Management:** Organize students into classes and track group progress
- ✏️ **Homework Creation:** Build assignments with multiple question types (multiple choice, short answer, essay, file upload, true/false)
- ✅ **Grading Interface:** Efficient grading with keyboard shortcuts, rubrics, and bulk feedback
- 📈 **Analytics:** View student performance, identify struggling learners, and adjust instruction

### For Guardians (Parents/Family Members)

- 👀 **Progress Monitoring:** View linked students' lesson progress, grades, and AI tutor conversations
- 📧 **Guardian Invitations:** Teachers or students can invite guardians to join and track progress
- 🔒 **Privacy-Respecting:** Guardians can only access students they are explicitly linked to

---

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Supabase (PostgreSQL + Auth + Real-time)
- **AI:** OpenAI GPT-4/GPT-5 via Responses API
- **Database:** PostgreSQL with Row-Level Security (RLS) via Supabase
- **Hosting:** Vercel (recommended) or any Node.js hosting platform
- **Email:** Transactional email service (optional: Resend, SendGrid)

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier works for development)
- OpenAI API key with access to GPT-4 or GPT-5

### Local Development Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-org/amal-madrassa.git
   cd amal-madrassa
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**

   Create a `.env.local` file in the project root:

   ```bash
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

   # OpenAI
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4-turbo

   # Bunny Stream (ad-free lesson video hosting)
   BUNNY_STREAM_LIBRARY_ID=YOUR_LIBRARY_ID
   BUNNY_STREAM_API_KEY=YOUR_STREAM_API_KEY
   BUNNY_STREAM_CDN_HOSTNAME=vz-xxxxxxxx-xxx.b-cdn.net
   NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-xxxxxxxx-xxx.b-cdn.net

   # App
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

4. **Set up Supabase:**

   - Create a Supabase project at [supabase.com](https://supabase.com)
   - Run migrations in order:
     - `supabase/migrations/20260216171100_diagnostic_assessments.sql`
     - `supabase/migrations/20260216191200_homework_system_complete.sql`
     - `supabase/migrations/2026021800000_parent_portal.sql`
   - Verify tables are created in Supabase Table Editor

5. **Run the development server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

6. **Create test accounts:**

   - **Student:** Sign up at `/register` with role "Student"
   - **Teacher:** Manually set `role = 'teacher'` in Supabase `profiles` table
   - **Guardian:** Invite via student settings or teacher dashboard

---

## Documentation

| Document | Description |
|----------|-------------|
| **[Privacy Policy](./docs/PRIVACY.md)** | Data collection, usage, retention, and user rights (GDPR-compliant) |
| **[Terms of Service](./docs/TERMS.md)** | Platform rules, acceptable use, and legal agreements |
| **[AI Safety & Moderation Guide](./docs/AI-SAFETY.md)** | How the AI tutor works, content moderation, and safety procedures |
| **[Deployment Guide](./docs/DEPLOYMENT.md)** | Step-by-step production deployment checklist |

**📖 Read these documents before deploying to production, especially if serving children.**

---

## Project Structure

```
amal-madrassa/
├── src/
│   ├── app/                  # Next.js app router pages
│   │   ├── api/              # API routes (tutor, homework, auth)
│   │   ├── dashboard/        # Student dashboard
│   │   ├── teacher/          # Teacher-only pages
│   │   ├── guardian/         # Guardian portal
│   │   └── tutor/            # AI tutor interface
│   ├── components/           # React components
│   ├── lib/                  # Utilities, types, and helpers
│   │   ├── ai/               # AI tutor tools and prompts
│   │   ├── supabase/         # Supabase client setup
│   │   └── database.types.ts # Generated TypeScript types
│   └── styles/               # Global CSS and Tailwind config
├── supabase/
│   └── migrations/           # Database schema migrations
├── docs/                     # Documentation (Privacy, Terms, etc.)
├── public/                   # Static assets
└── package.json
```

---

## Key Features Explained

### AI Tutor ("معلم البومة")

The AI tutor uses OpenAI's GPT models with a custom system prompt designed for:

- **Trauma-Informed Responses:** Avoids triggering language (war, violence) unless educationally necessary
- **Socratic Method:** Guides students to discover answers instead of providing them directly
- **Cultural Sensitivity:** Uses examples relevant to Sudanese daily life (markets, geography)
- **Bilingual Support:** Responds exclusively in student's preferred language (Arabic or English)
- **Safety Monitoring:** Logs all conversations and flags concerning content (self-harm, abuse) for human review

**How it works:** Students chat with the AI via `/tutor`. Conversations are saved to the database and accessible to teachers and guardians for review.

### Diagnostic Assessments

When students first join, they take a placement test covering Math, Science, English, and Arabic. The system:

1. Starts with questions for the student's reported grade level
2. **Adapts:** If the student answers correctly, difficulty increases; if incorrect, difficulty decreases
3. **Recommends Placement:** After 10-15 questions per subject, the system suggests a grade level
4. **Teacher Override:** Teachers can manually adjust placement if needed

### Homework System

Teachers create assignments with 5 question types:

- **Multiple Choice:** Auto-graded
- **Short Answer:** Auto-graded (exact match) or teacher-graded
- **Essay:** Always teacher-graded
- **File Upload:** Students submit documents/images for teacher review
- **True/False:** Auto-graded

**Grading Interface:**
- Keyboard shortcuts (0-9 for scoring, N/P for navigation)
- Rubric-based grading with criterion-level feedback
- Bulk feedback templates ("Great work!", "Needs more detail", etc.)

---

## Contributing

We welcome contributions from developers, educators, and humanitarian organizations!

### How to Contribute

1. **Report Issues:** Use GitHub Issues to report bugs or request features
2. **Submit Pull Requests:** Fork the repo, make changes, and submit a PR
3. **Translate Content:** Help translate lessons and UI into additional languages (French, Swahili, etc.)
4. **Educational Content:** Contribute lesson plans, quizzes, or homework templates aligned with Sudanese curriculum

### Contribution Guidelines

- **Code Quality:** TypeScript strict mode, ESLint checks must pass
- **Testing:** Include tests for new features (when testing framework is set up)
- **Documentation:** Update relevant docs (especially `docs/AI-SAFETY.md` if changing AI behavior)
- **Child Safety:** Prioritize safety in all features (see [AI-SAFETY.md](./docs/AI-SAFETY.md))

---

## Deployment

For production deployment, follow the **[Deployment Guide](./docs/DEPLOYMENT.md)** step-by-step.

**Quick Deploy to Vercel:**

1. Push code to GitHub
2. Import project in [Vercel Dashboard](https://vercel.com/new)
3. Set environment variables (Supabase + OpenAI keys)
4. Deploy

**Important:** Review [Privacy Policy](./docs/PRIVACY.md) and [Terms of Service](./docs/TERMS.md) with legal counsel before serving real users, especially children.

---

## Roadmap

### ✅ Completed (MVP)

- [x] AI tutor with bilingual support (Arabic/English)
- [x] Diagnostic assessments for grade placement
- [x] Teacher homework creation and grading system
- [x] Guardian/parent progress tracking portal
- [x] Student dashboard with lesson progress
- [x] Content moderation and safety logging

### 🚧 In Progress

- [ ] Offline-first mode (PWA with local caching)
- [ ] Mobile app (React Native or Flutter)
- [ ] SMS-based homework submission (for areas with limited internet)
- [ ] Voice-to-text input for low-literacy students

### 🔮 Future Features

- [ ] Peer tutoring (student-to-student messaging)
- [ ] Live teacher sessions (video/audio classrooms)
- [ ] Gamification (badges, leaderboards, streaks)
- [ ] Expanded curriculum (History, Geography, Islamic Studies)
- [ ] Multi-tenancy (support multiple NGO partners with separate data)

---

## License

**[MIT License](./LICENSE)** (or specify your chosen license)

This project is open-source to maximize impact. NGOs and educators are free to deploy, modify, and distribute this platform.

**If you use this platform, we'd love to hear about it!** Contact us at [hello@amalmadrassa.org].

---

## Partners and Supporters

Amal Madrassa is made possible by:

- **[Partner NGO 1]** — Providing teacher training and student recruitment
- **[Partner NGO 2]** — Field deployment and offline infrastructure
- **[OpenAI]** — AI technology and discounted API credits (if applicable)
- **Individual Contributors** — Developers, educators, and volunteers worldwide

**Want to partner?** Contact [partnerships@amalmadrassa.org].

---

## Contact

- **Website:** [https://amalmadrassa.org](https://amalmadrassa.org)
- **Email:** [hello@amalmadrassa.org]
- **Privacy/Safety Concerns:** [safety@amalmadrassa.org]
- **GitHub:** [https://github.com/your-org/amal-madrassa](https://github.com/your-org/amal-madrassa)

---

## Acknowledgments

Built with ❤️ by a global community of developers, educators, and humanitarians dedicated to ensuring every child has access to quality education, no matter where they are.

**"Education is the most powerful weapon which you can use to change the world."** — Nelson Mandela

---

**الحمد لله** — May this platform serve every child in need.
