# Tutor Guide: Creating and Managing Lessons

## Table of Contents
1. [Creating a New Lesson](#1-creating-a-new-lesson)
2. [Editing Lesson Details](#2-editing-lesson-details)
3. [Working with Slides](#3-working-with-slides)
4. [Adding Questions](#4-adding-questions)
5. [Adding Activities](#5-adding-activities-via-slides)
6. [Publishing and Assigning to Classes](#6-publishing-and-assigning-to-classes)

---

## 1. Creating a New Lesson

1. Go to **Teacher > Lessons** from the navigation menu.
2. Click the green **"New Lesson"** button in the top-right corner.
3. A modal titled **"Generate Presentation Slides"** will open. Fill in the following:

| Field | Description |
|---|---|
| **Subject** | Select the subject (e.g., Math, Arabic, English, Science) |
| **Grade** | Select Grade 1 or Grade 2 |
| **Curriculum Topic** | If available for the selected subject, pick the curriculum strand and sub-strand. This auto-fills the title, learning objective, and key ideas. |
| **Lesson Title** | If no curriculum topic is available, type a title manually (e.g., "Fractions and Equal Parts") |
| **Learning Objective** | What should students understand by the end of the lesson? (Required) |
| **Key Ideas to Cover** | One idea per line or separated by commas (up to 8 ideas) |
| **Lesson Length** | **Short** (15 min, 9 slides), **Medium** (20 min, 10 slides), or **Long** (25 min, 10 slides) |
| **Slide Language** | Arabic or English |
| **Slide Mix** | Choose the emphasis: Balanced, Explain Concepts, Worked Examples, Activity Focus, or Quiz Review |
| **Source Notes** (optional) | Paste textbook notes, outlines, or any must-cover content |

4. Click **"Create Draft and Generate Slides"**.
5. The system creates a draft lesson and automatically generates AI-powered slides. This takes about 15-30 seconds.

---

## 2. Editing Lesson Details

After creating a lesson, click on it from the Lessons list to open the editor. You will see a tabbed interface:

**Details | Slides | Questions & Tasks | Content | Results**

### Details Tab

In the Details tab you can edit:

- **Title** (Arabic and English)
- **Subject** and **Grade Level**
- **Curriculum Topic** — link the lesson to a specific curriculum strand
- **Description** (Arabic and English)
- **Class Access** — assign the lesson to specific classes, or leave unassigned so all students can see it when published

Always click **"Save"** in the top-right corner after making changes.

---

## 3. Working with Slides

### The Slides Tab

Switch to the **Slides** tab to view and edit your presentation slides. The slide editor shows:
- A **slide filmstrip** (thumbnail strip) for quick navigation
- A **live preview** of the selected slide
- An **edit panel** on the right side for modifying content

### Slide Types

Each slide has a type that determines its layout and purpose:

| Type | Purpose |
|---|---|
| **Title** | Opening slide with the lesson title |
| **Content** | Main teaching content with text |
| **Key Points** | Bullet-point lists of important ideas |
| **Diagram/Description** | Visual explanation with image placeholder |
| **Activity** | Interactive activity slide (hands-on) |
| **Quiz Preview** | Introduces a quiz or check-for-understanding |
| **Question & Answer** | Reveal-style Q&A with hidden answers |
| **Summary** | Recap/closing slide |

### Editing a Slide

Click any slide thumbnail to select it. In the edit panel on the right, you can modify:

- **Title** (Arabic and English)
- **Body text** (Arabic and English) — the main content shown on the slide
- **Speaker Notes** (Arabic and English) — what the teacher should say (not shown to students on the slide itself)
- **Bullets** — for key points and summary slides, add/remove bullet items
- **Visual Hint** — a text description of what image should be on this slide (shown as a placeholder)
- **Layout** — choose from: Default, Image Left, Image Right, Image Top, or Full Image
- **Image** — upload an image to replace the placeholder/owl mascot
- **Text Size** — adjust title and body text size (Small, Medium, Large, Extra Large)

### Adding and Removing Slides

- Use the **"+ Add Slide"** button at the end of the filmstrip to add a new slide
- Each new slide lets you choose its type
- To remove a slide, select it and use the delete option in the edit panel

### Regenerating Slides

If you want to regenerate all slides with AI:
1. Adjust the **Lesson Length** preset if needed
2. Click the **"Generate"** button
3. If slides already exist, you will be warned that regenerating will replace them

### Saving Slides

Click **"Save Slides"** or the main **"Save"** button to persist your changes.

---

## 4. Adding Questions

Switch to the **Questions & Tasks** tab.

### Creating a Question

1. Click **"+ Add Question"**
2. Fill in the fields:

| Field | Description |
|---|---|
| **Arabic Text** | The question text in Arabic |
| **English Text** | The question text in English |
| **Type** | Multiple Choice, True/False, or Fill in the Blank |
| **Correct Answer** | The correct answer text (for Multiple Choice, enter the option text exactly) |
| **Points** | Point value (default: 10) |
| **Timestamp (sec)** | When during the video this question appears (0 = start) |
| **Options** | For Multiple Choice — fill in 4 answer options |

### Question Settings

Each question also has two toggles:
- **Required** — students must answer this question
- **Allow retry** — students can try again if they get it wrong

### Tips
- Questions appear as overlays during the lesson when the video reaches their timestamp
- Use the AI generator in the **Content** tab to auto-generate questions
- You can reorder questions by changing their timestamps

---

## 5. Adding Activities (via Slides)

Activities are interactive tasks tied to specific slides. They are created in the **Slides** tab and configured in the **Questions & Tasks** tab.

### How Activities Work

1. In the **Slides** tab, add a slide of type **"Activity"**
2. The AI slide generator also creates activity slides automatically based on the slide mix setting
3. Each activity slide can have an **interaction type** — a mini-game or interactive element

### Interaction Types

| Type | Description |
|---|---|
| **Choose Correct** | Pick the right answer from multiple options |
| **True/False** | Answer true or false |
| **Fill Missing Word** | Select the missing word in a sentence |
| **Tap to Count** | Tap/count objects (uses emoji visuals) |
| **Match Pairs** | Match items on the left with items on the right |
| **Sequence Order** | Put items in the correct order |
| **Sort Groups** | Sort items into categories |

### Configuring an Activity Slide

When editing an activity slide in the edit panel:

1. **Choose the interaction type** from the dropdown
2. Fill in the interaction-specific fields:
   - For **Choose Correct / Fill Missing Word**: Add prompt text and options (Arabic + English), mark the correct option index
   - For **True/False**: Add the statement and set whether true or false is correct
   - For **Tap to Count**: Set the count target number and optional emoji visual
   - For **Match Pairs**: Add pairs of items to match (left ↔ right)
   - For **Sequence Order**: Add items and set their correct positions
   - For **Sort Groups**: Add items and their target groups

### Activity Timing

In the **Questions & Tasks** tab, under the **Activities** section:
- Activities are listed with their linked slide
- You can set a **timestamp** for when the activity triggers during the video
- Leave timestamp blank to auto-place based on slide order
- Use the video preview to stamp the exact time: play the video to the right moment, then click the stamp button

### Activity Rules

For each activity, you can configure:
- **Timeout** — how many seconds students have to complete it
- **Skippable** — whether students can skip the activity
- **Required** — whether completion is mandatory
- **Points** — point value for correct completion

---

## 6. Publishing and Assigning to Classes

### Draft vs Published

- New lessons start as **Draft** (amber badge)
- Draft lessons are only visible to teachers
- To make a lesson visible to students, an **admin** must publish it
- Click the Draft/Published badge next to the lesson title to toggle (admin only)

### Assigning to Classes

In the **Details** tab, scroll to **Class Access**:
- If **no classes are selected**, the lesson is available to **all students** when published
- To restrict the lesson to specific classes, **check the class checkboxes**
- Each class shows its name and grade level

### Saving and Verifying

1. After making all your changes, click **"Save"** in the top-right corner
2. The system saves everything at once: details, slides, questions, activities, and content
3. A green "Saved" message confirms success
4. Check the **Results** tab later to see how students performed on questions and activities

---

## Quick Workflow Summary

```
1. Lessons page → "New Lesson"
2. Fill in subject, grade, objective, key ideas
3. Click "Create Draft and Generate Slides"
4. Review and edit generated slides in the Slides tab
5. Add images to slides where needed
6. Check Questions & Tasks tab — edit or add questions
7. Configure activity timing and rules
8. Assign to classes in the Details tab
9. Save → Ask admin to publish
```

---

## Tips for Great Lessons

- **Use the curriculum selector** when available — it pre-fills learning objectives and key ideas aligned to the Sudan curriculum
- **Keep slides visual** — upload images to replace the owl placeholders, especially for diagram slides
- **Mix interaction types** — use different activity types to keep students engaged
- **Set reasonable timeouts** — give young learners enough time (30-60 seconds for simple tasks)
- **Enable retries on questions** — let students learn from mistakes rather than failing immediately
- **Review the Results tab** — check how students performed to identify topics that need more attention
