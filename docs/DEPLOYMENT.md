# Deployment Guide — Amal Madrassa

**Last Updated:** February 24, 2026

This guide walks through deploying Amal Madrassa for production use by NGOs and educational partners. Follow each step carefully to ensure a secure, compliant deployment.

---

## Prerequisites

Before deploying, ensure you have:

- [ ] A Supabase project (free tier or Pro for production)
- [ ] An OpenAI API account with access to GPT-4 or GPT-5 models
- [ ] A hosting platform (Vercel recommended, or any Node.js host supporting Next.js 14+)
- [ ] Node.js 18+ and npm/yarn installed locally (for initial setup)
- [ ] Access to email service (optional but recommended for transactional emails)
- [ ] Domain name (optional, but recommended for production)

---

## Step 1: Supabase Project Setup

### 1.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **"New Project"**
3. **Project Settings:**
   - **Name:** `amal-madrassa-[environment]` (e.g., `amal-madrassa-prod`)
   - **Database Password:** Generate a strong password (save securely)
   - **Region:** Choose closest to your users (e.g., `eu-west-1` for Europe, `me-south-1` for Middle East if available)
4. Wait for project initialization (~2 minutes)

### 1.2 Run Database Migrations

**Option A: Via Supabase Dashboard (Recommended for first-time setup)**

1. In Supabase dashboard, go to **SQL Editor**
2. Run each migration file in order:
   - `supabase/migrations/20260216171100_diagnostic_assessments.sql`
   - `supabase/migrations/20260216191200_homework_system_complete.sql`
   - `supabase/migrations/2026021800000_parent_portal.sql`
3. Verify: Check **Table Editor** to confirm tables exist (`profiles`, `lessons`, `ai_conversations`, etc.)

**Option B: Via Supabase CLI (Recommended for teams)**

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_ID

# Push migrations
supabase db push
```

### 1.3 Configure Row-Level Security (RLS)

**Verify RLS is enabled** for all tables:

```sql
-- Run in SQL Editor
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

All tables should show `rowsecurity = true`. If not, enable manually:

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- Repeat for each table
```

### 1.4 Get Supabase API Keys

1. In Supabase dashboard, go to **Settings → API**
2. Copy the following:
   - **Project URL** (e.g., `https://xxx.supabase.co`)
   - **Anon/Public Key** (starts with `eyJ...`)
   - **Service Role Key** (starts with `eyJ...` — keep this secret!)

**Security Note:** The Service Role Key bypasses RLS — never expose it in client-side code or public repositories.

---

## Step 2: OpenAI API Setup

### 2.1 Create an OpenAI Account

1. Go to [platform.openai.com](https://platform.openai.com) and sign up
2. Add billing information (required for API access)
3. **Recommended Budget:** Set a monthly spending limit ($50-$200 depending on user count)

### 2.2 Generate API Key

1. Navigate to **API Keys**
2. Click **"Create new secret key"**
3. **Name:** `amal-madrassa-prod`
4. **Permissions:** Select "All" (or restrict to "Model capabilities" only for tighter security)
5. Copy the key (starts with `sk-...`) — **this is shown only once!**

### 2.3 Select Model

- **Default:** `gpt-4-turbo` (fast, cost-effective, high quality)
- **Alternative:** `gpt-5.2` (if you have access; higher cost, better reasoning)
- **Budget Option:** `gpt-4o-mini` (cheapest, suitable for simple tutoring)

**Cost Estimates (as of Feb 2026):**
- `gpt-4-turbo`: ~$0.01 per 1,000 tokens (~$5-$10 per 1,000 AI tutor conversations)
- `gpt-5.2`: ~$0.015 per 1,000 tokens

**Rate Limiting:** OpenAI enforces rate limits (e.g., 500 requests/min on paid tiers). For large deployments (>100 concurrent users), request a limit increase via OpenAI support.

---

## Step 3: Environment Variables Configuration

Create a `.env.local` file (or configure in your hosting platform) with the following variables:

```bash
# ============================================
# SUPABASE CONFIGURATION
# ============================================
# Public URL of your Supabase project
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co

# Anon/Public Key (safe to expose in client-side code)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_ANON_KEY

# Service Role Key (SERVER-SIDE ONLY — never expose in client code)
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

# Alternative name for service role key (some code uses this)
SUPABASE_SECRET_KEY=YOUR_SERVICE_ROLE_KEY

# ============================================
# OPENAI CONFIGURATION
# ============================================
# Your OpenAI API key
OPENAI_API_KEY=sk-...

# Model to use (gpt-4-turbo, gpt-5.2, gpt-4o-mini)
OPENAI_MODEL=gpt-4-turbo

# ============================================
# APPLICATION CONFIGURATION
# ============================================
# Public URL of your deployed app (e.g., https://app.amalmadrassa.org)
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# ============================================
# OPTIONAL: EMAIL CONFIGURATION
# ============================================
# If using Resend, SendGrid, or other email service
# EMAIL_FROM=noreply@amalmadrassa.org
# EMAIL_SERVICE_API_KEY=your_email_api_key

# ============================================
# OPTIONAL: ANALYTICS (if you add analytics)
# ============================================
# CONTEXT7_API_KEY=ctx7sk-... (context7 for embeddings)
# POSTHOG_KEY=phc_... (PostHog for product analytics)
```

### Security Checklist

- [ ] **Never commit `.env.local` to Git** — add to `.gitignore`
- [ ] Use separate keys for staging and production
- [ ] Rotate `OPENAI_API_KEY` every 90 days
- [ ] Restrict `SUPABASE_SERVICE_ROLE_KEY` to server-side code only
- [ ] Enable Supabase Auth rate limiting (Settings → Auth → Rate Limits)

---

## Step 4: Hosting Platform Deployment

### Recommended: Vercel (Easiest for Next.js)

#### 4.1 Install Vercel CLI

```bash
npm install -g vercel
```

#### 4.2 Deploy

```bash
# From project root
vercel

# Follow prompts:
# - Link to existing project or create new
# - Select Next.js framework preset
# - Set production branch to 'main'
```

#### 4.3 Set Environment Variables

**Option A: Via Vercel Dashboard**

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project → **Settings → Environment Variables**
3. Add each variable from `.env.local` above
4. **Important:** Mark `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` as **Production** only

**Option B: Via CLI**

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# Paste value, repeat for each variable
```

#### 4.4 Redeploy

```bash
vercel --prod
```

### Alternative: Self-Hosted (Docker, VPS, AWS)

If not using Vercel:

1. **Build the app:**
   ```bash
   npm run build
   npm run start
   ```

2. **Environment Variables:** Set via `.env.local` or system environment

3. **Reverse Proxy:** Use Nginx or Caddy to handle HTTPS:
   ```nginx
   server {
       listen 443 ssl;
       server_name app.amalmadrassa.org;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
       }
   }
   ```

4. **Process Manager:** Use PM2 or systemd to keep the app running:
   ```bash
   pm2 start npm --name amal-madrassa -- start
   pm2 save
   pm2 startup
   ```

---

## Step 5: Post-Deployment Verification

### 5.1 Health Checks

**Test the following features:**

- [ ] **Homepage loads:** Visit `https://your-domain.com`
- [ ] **Authentication works:**
  - Create a test student account
  - Verify email confirmation (if email service configured)
  - Log in and log out successfully
- [ ] **AI Tutor responds:**
  - Navigate to `/tutor`
  - Send a message: "Explain multiplication to me"
  - Verify response is in the correct language (check student profile language setting)
- [ ] **Database connectivity:**
  - Create a test homework assignment (as a teacher account)
  - Verify it appears in the student homework list
- [ ] **Role-Based Access:**
  - Verify students cannot access teacher features (e.g., `/teacher/grading`)
  - Verify guardians can only view linked students' data

### 5.2 Performance Verification

- [ ] **Load Time:** Homepage should load in <2 seconds
- [ ] **AI Response Time:** Tutor responses should stream in <5 seconds
- [ ] **Database Queries:** Check Supabase dashboard for slow queries (>500ms)

### 5.3 Security Verification

Run these checks:

- [ ] **RLS is active:** Attempt to access another user's data via API (should fail)
- [ ] **HTTPS enforced:** HTTP requests redirect to HTTPS
- [ ] **No exposed secrets:** Search deployed site source for `OPENAI_API_KEY` or `SERVICE_ROLE_KEY` (should not appear)
- [ ] **Rate limiting works:** Send 100 rapid AI tutor requests (should be throttled after 50/hour)

### 5.4 Compliance Verification

- [ ] **Privacy Policy accessible:** `/privacy` page loads
- [ ] **Terms of Service accessible:** `/terms` page loads
- [ ] **AI Safety Guide available:** Link to `/docs/AI-SAFETY.md` in help section
- [ ] **Guardian consent mechanism:** Test guardian invitation flow

---

## Step 6: User Onboarding

### 6.1 Create Initial Accounts

**Teacher Accounts:**
1. Manually create teacher accounts via Supabase dashboard:
   ```sql
   -- Run in SQL Editor
   INSERT INTO profiles (id, email, full_name, role, preferred_language)
   VALUES ('teacher-uuid', 'teacher@example.org', 'Ms. Fatima', 'teacher', 'ar');
   ```
2. Send teacher credentials via secure channel (e.g., Signal, encrypted email)

**Student Cohorts:**
1. Teachers log in and create cohorts via `/teacher/cohorts`
2. Add students to cohorts (students receive invitation emails)

### 6.2 Import Lesson Content

If you have existing lesson content:

```bash
# Run lesson ingestion script (if available)
npm run ingest:lessons
```

Or manually upload via Supabase dashboard → Table Editor → `lessons`.

### 6.3 Guardian Invitations

Teachers or students can invite guardians:
1. Student logs in → **Settings → Guardians**
2. Enter guardian email → Send invitation
3. Guardian receives email with signup link

---

## Step 7: Monitoring and Maintenance

### 7.1 Set Up Monitoring

**Recommended Tools:**
- **Uptime Monitoring:** [UptimeRobot](https://uptimerobot.com) (free, checks every 5 minutes)
- **Error Tracking:** Sentry (Next.js integration available)
- **Usage Analytics:** Supabase Dashboard → Analytics (built-in)

**Critical Alerts:**
- [ ] API downtime (>5 minutes)
- [ ] Database connection failures
- [ ] OpenAI API rate limit errors
- [ ] AI tutor flagged content (see AI-SAFETY.md)

### 7.2 Regular Maintenance

**Daily:**
- Check Supabase database storage usage (free tier: 500MB limit)
- Review AI tutor flagged conversations (see AI-SAFETY.md escalation procedures)

**Weekly:**
- Backup database (Supabase automatic backups enabled by default, but download manual backup)
- Review OpenAI API usage and costs

**Monthly:**
- Rotate API keys (optional but recommended)
- Update dependencies: `npm update`
- Review and update lesson content based on teacher feedback

**Quarterly:**
- Full security audit (see Security Checklist)
- Review and update Terms/Privacy Policy if features change
- Partner NGO compliance review

### 7.3 Scaling Considerations

**When to upgrade:**
- **>500 active students:** Upgrade Supabase to Pro ($25/month)
- **>1,000 AI conversations/day:** Request OpenAI rate limit increase
- **>10,000 database rows/table:** Add database indexes for performance

**Cost Estimates (per 1,000 students):**
- Supabase: $25-$100/month (depending on storage and usage)
- OpenAI: $100-$500/month (depending on conversation volume)
- Hosting (Vercel): $0-$20/month (free tier covers most use cases)

---

## Step 8: Troubleshooting

### Common Issues

**"Unauthorized" errors in AI tutor:**
- **Cause:** `SUPABASE_SERVICE_ROLE_KEY` not set or incorrect
- **Fix:** Verify environment variable in hosting platform settings

**AI tutor not responding:**
- **Cause:** `OPENAI_API_KEY` invalid or rate limit exceeded
- **Fix:** Check OpenAI dashboard for API key status and usage limits

**Students can't log in:**
- **Cause:** Email confirmation required but email service not configured
- **Fix:** Disable email confirmation in Supabase: Settings → Auth → Email Confirmations → OFF (for testing only)

**Database queries failing:**
- **Cause:** RLS policies blocking legitimate access
- **Fix:** Review policies in Supabase → Authentication → Policies

**Slow AI responses:**
- **Cause:** Network latency to OpenAI API or large conversation history
- **Fix:** Consider using a faster model (`gpt-4o-mini`) or truncate conversation history to last 10 messages

---

## Step 9: Rollback Plan

If deployment fails or critical issues arise:

1. **Vercel:** Rollback to previous deployment:
   ```bash
   vercel rollback
   ```

2. **Database:** Restore from backup (Supabase Dashboard → Database → Backups)

3. **Notify Users:** Post maintenance notice on homepage or via email

4. **Incident Report:** Document what went wrong and steps to prevent recurrence

---

## Security Checklist (Final Review)

Before going live, verify:

- [ ] All environment variables set correctly (no placeholder values)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` not exposed in client-side code
- [ ] HTTPS enforced (no plain HTTP access)
- [ ] Database RLS policies active and tested
- [ ] OpenAI API key restricted to server-side routes only
- [ ] Rate limiting enabled (Supabase Auth and AI tutor)
- [ ] Privacy Policy and Terms of Service accessible
- [ ] Guardian consent flow tested
- [ ] AI tutor content moderation active (see AI-SAFETY.md)
- [ ] Backup strategy in place (weekly database exports)
- [ ] Monitoring alerts configured (uptime, errors, flagged content)

---

## Support and Resources

**Technical Support:**
- Email: [devs@amalmadrassa.org] (replace with actual contact)
- GitHub Issues: (if using open-source model)

**Documentation:**
- [Next.js Deployment Docs](https://nextjs.org/docs/deployment)
- [Supabase Docs](https://supabase.com/docs)
- [OpenAI API Docs](https://platform.openai.com/docs)

**Partner Organizations:**
- Contact your partner NGO for deployment assistance and compliance reviews

---

**You're Ready to Deploy!** 🚀

Follow this checklist step-by-step, and you'll have a secure, scalable Amal Madrassa deployment. If you encounter issues not covered here, document them and update this guide for future deployments.

**Remember:** This platform serves displaced children — prioritize safety, privacy, and reliability above all else.
