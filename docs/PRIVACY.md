# Privacy Policy — Amal Madrassa

**Last Updated:** February 24, 2026

## Introduction

Amal Madrassa ("we," "our," "us") operates an educational platform designed to support displaced Sudanese children through AI-powered tutoring, diagnostic assessments, and teacher-facilitated homework systems. We are committed to protecting the privacy and safety of all users, especially children.

This Privacy Policy explains what data we collect, why we collect it, how we use it, and your rights regarding your personal information.

## Legal Basis and Compliance

We process personal data in compliance with:
- **General Data Protection Regulation (GDPR)** for users in the European Union
- **United Nations Convention on the Rights of the Child (UNCRC)** principles
- **Children's Online Privacy Protection Act (COPPA)** best practices for child safety

Our legal basis for processing includes:
- **Consent:** When parents/guardians provide consent for children to use the platform
- **Contract Performance:** To deliver educational services
- **Legitimate Interest:** To improve educational outcomes and platform safety

## Who We Serve

Our platform serves:
- **Students** (children ages 6-18)
- **Teachers** (educators and facilitators)
- **Partner Organizations** (NGOs and educational institutions)

## Data We Collect

### 1. Student Information

**Account Data:**
- Full name
- Email address (for students 13+, or parent/guardian email)
- Grade level
- Preferred language (Arabic or English)
- Date of birth (to verify age)

**Educational Data:**
- Diagnostic assessment results and placement recommendations
- Lesson progress and completion status
- Homework assignments, submissions, and grades
- Quiz results and performance metrics
- Learning strengths and areas needing improvement

**AI Tutor Interactions:**
- Conversation transcripts with the AI tutor ("معلم البومة" / Owl Teacher)
- Questions asked and topics discussed
- Session timestamps and duration
- Tool usage logs (e.g., when students request practice problems)

**Technical Data:**
- IP address (for security and rate limiting)
- Browser type and version
- Device information (for responsive design)
- Session logs (login times, feature usage)

### 2. Teacher Information

- Full name, email address
- Assigned cohorts and classes
- Homework assignments created
- Grading activity and feedback provided
- Lesson planning and curriculum access

## How We Use Your Data

### Educational Purposes

1. **Personalized Learning:** We use student data to:
   - Determine appropriate grade-level placement via diagnostic assessments
   - Adapt AI tutor responses to the student's grade level and language preference
   - Identify learning gaps and recommend lessons
   - Create personalized practice assignments

2. **Academic Progress Tracking:**
   - Monitor lesson completion and homework submission rates
   - Track quiz scores and assignment grades
   - Generate progress reports for students and teachers
   - Identify patterns in mistakes to improve instruction

3. **Teacher Support:**
   - Enable teachers to create, assign, and grade homework
   - Provide student performance dashboards
   - Facilitate cohort-based class management

### Platform Operations

1. **Authentication and Access Control:**
   - Verify user identity and role (student or teacher)
   - Enforce role-based permissions
   - Detect and prevent unauthorized access

2. **Safety and Abuse Prevention:**
   - Monitor AI tutor conversations for concerning content (e.g., expressions of harm)
   - Flag inappropriate behavior for human review
   - Rate-limit requests to prevent system abuse
   - Log interactions for safety audits

3. **Service Improvement:**
   - Analyze aggregate usage patterns to improve features
   - Identify technical issues and bugs
   - Optimize lesson content based on student engagement

## Data Sharing and Third-Party Processors

We **DO NOT sell** student data to advertisers or third parties.

We share data only with trusted service providers necessary for platform operation:

### Supabase (Database and Authentication)
- **Purpose:** Stores all user data, authentication, and application data
- **Data Shared:** All account, educational, and conversation data
- **Location:** Cloud-hosted (exact region depends on deployment configuration)
- **Protection:** Encrypted in transit (TLS) and at rest; access restricted via Row-Level Security (RLS) policies
- **Contract:** Data Processing Agreement (DPA) in place

### OpenAI (AI Tutor Processing)
- **Purpose:** Powers the AI tutor conversation engine
- **Data Shared:** Student messages, grade level, language preference, and conversation context
- **Retention:** OpenAI retains data per their [API Data Usage Policy](https://openai.com/policies/api-data-usage-policies) (30 days for abuse monitoring)
- **Protection:** We use OpenAI's API with enterprise-grade security; conversations are logged in our database for educational continuity
- **No Training:** Student data is **NOT** used to train OpenAI models (per API terms)

### Email Service Provider (Transactional Emails)
- **Purpose:** Send account verification, password resets, and operational emails
- **Data Shared:** Email addresses, names, and message content (no academic data)
- **Retention:** Typically 30-90 days per provider policy

### Partner NGOs (With Consent)
- **Purpose:** Partner organizations (e.g., refugee support NGOs) may access aggregate progress reports
- **Data Shared:** Only anonymized cohort-level statistics (e.g., "80% of students improved in Math")
- **Explicit Consent Required:** Individual student data is shared only with signed parent/guardian consent forms

## Data Retention

We retain data as follows:

| Data Type | Retention Period | Rationale |
|-----------|------------------|-----------|
| **Student Accounts** | Until account deletion or graduation + 1 year | Academic continuity |
| **Lesson Progress & Grades** | 5 years from last activity | Educational records; required by some partner agreements |
| **AI Tutor Conversations** | 2 years from conversation date | Safety audits; allows review of flagged content |
| **Diagnostic Assessments** | Permanent (for academic record) | Placement decisions; longitudinal progress tracking |
| **Homework Submissions** | 3 years from submission | Grading appeals; teacher reference |
| **Teacher Accounts** | Until account deletion + 90 days | Operational continuity |
| **Technical Logs (IP, session)** | 90 days | Security incident investigation |

**Deletion:** When data retention periods expire, records are permanently deleted from production databases and backups.

## Children's Privacy Protections

We take special care with children's data:

### Age Verification
- Students under 13 require parent/guardian email for account creation
- Guardian consent is logged and verifiable

### Restricted Data Collection
- No location tracking beyond country/region for content localization
- No behavioral advertising or profiling for commercial purposes
- No public profiles or social networking features

### Parental Rights (see "Your Rights" section)
- Parents/caregivers can request deletion of student accounts at any time

### Secure AI Interactions
- AI tutor conversations are monitored for safety (see AI-SAFETY.md)
- No student names or identifiable information sent to OpenAI beyond session context
- Human oversight for flagged content

## International Data Transfers

Amal Madrassa is designed for deployment in regions serving Sudanese displaced children (e.g., Sudan, Egypt, Chad, refugee camps). Data may be transferred internationally depending on:

- **Supabase hosting region** (typically EU or US regions)
- **OpenAI API processing** (globally distributed, subject to OpenAI's data localization policies)

When data is transferred outside the student's country of residence, we ensure:
- **Standard Contractual Clauses (SCCs)** with all processors
- **Encryption in transit** (TLS 1.2+)
- **Access controls** restricting data access to authorized personnel only

## Data Security Measures

We implement technical and organizational safeguards:

### Technical Controls
- **Encryption:** All data encrypted in transit (HTTPS/TLS) and at rest (AES-256)
- **Authentication:** Multi-factor authentication (MFA) available for teachers and administrators
- **Access Control:** Role-based permissions enforced via Supabase Row-Level Security (RLS)
- **Rate Limiting:** Prevents brute-force attacks and API abuse
- **Session Management:** Automatic session expiration after inactivity

### Organizational Controls
- **Staff Training:** Limited personnel with data access; trained on child safety and data protection
- **Audit Logs:** All data access and changes logged for security reviews
- **Incident Response Plan:** Procedures for data breach notification and remediation
- **Regular Reviews:** Quarterly security audits and vulnerability assessments

### Limitations
No system is 100% secure. In the event of a data breach, we will:
1. Notify affected users within 72 hours
2. Report to supervisory authorities as required by law
3. Provide remediation steps and support

## Your Rights

Depending on your location, you may have the following rights:

### Access and Portability
- **View Your Data:** Students and teachers can view their data via account dashboards
- **Export Data:** Download AI tutor conversations, lesson progress, and homework submissions in Markdown format

### Correction and Deletion
- **Update Information:** Correct profile information (name, grade level, language preference) via account settings
- **Delete Account:** Request full account deletion by contacting [support@amalmadrassa.org] — data will be removed within 30 days
- **Delete Conversations:** Students can delete AI tutor conversations from their history (subject to 30-day safety retention)

### Restriction and Objection
- **Limit Processing:** Request we stop using data for specific purposes (e.g., AI tutor feature)
- **Withdraw Consent:** Parents/caregivers can withdraw consent for children's accounts at any time

### Automated Decision-Making
- **Diagnostic Placement:** Automated assessments determine grade-level placement, but teachers can override recommendations
- **Right to Human Review:** Any automated decision (e.g., content flagging) can be appealed for human review

## How to Exercise Your Rights

To exercise any of these rights, contact us:

**Email:** [privacy@amalmadrassa.org] (replace with actual contact)  
**Data Protection Officer (if applicable):** [dpo@amalmadrassa.org]

We will respond to requests within 30 days. For deletion requests, we may retain certain data if required by law or legitimate educational purposes (e.g., final grade transcripts).

## Cookies and Tracking

We use minimal tracking technologies:

- **Essential Cookies:** Session management and authentication (required for platform function)
- **Analytics (Optional):** Aggregate usage statistics (e.g., most-used features) — no personally identifiable information
- **No Advertising Trackers:** We do **not** use third-party advertising cookies or behavioral tracking

You can disable non-essential cookies via browser settings, but this may limit platform functionality.

## Changes to This Policy

We may update this Privacy Policy to reflect:
- New features or services
- Changes in data protection laws
- Feedback from users and partner organizations

**Notification:** We will notify users of material changes via:
- Email to registered addresses (for teachers and administrators)
- In-app banner notification (for students)
- Updated "Last Modified" date at the top of this document

Continued use of the platform after notification constitutes acceptance of changes.

## Contact Us

For privacy questions, concerns, or complaints:

**Amal Madrassa Privacy Team**  
Email: [privacy@amalmadrassa.org]  
Website: [https://amalmadrassa.org]

**For GDPR/EU Users:**  
You have the right to lodge a complaint with your local data protection authority.

**For Child Safety Concerns:**  
Report concerning AI tutor interactions or platform misuse to: [safety@amalmadrassa.org]

---

**Commitment to Transparency:** We are committed to protecting the privacy and safety of all learners. If you have questions or concerns, please reach out — we're here to help.
