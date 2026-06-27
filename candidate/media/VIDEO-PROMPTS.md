# Video prompts — Faculty Assessment Center

Two kinds of clips. Generate in any video model (Veo 3, Runway Gen-3, Kling, Pika, Sora). Save the files into this `media/` folder with the **exact filenames** below — I'll wire the app to play them (autoplay, muted, looping, `playsinline`) in place of the static images, with the image as a fallback.

## Global look (prepend to every prompt)
> Realistic, candid documentary-style footage. Modern Indian university classroom or computer lab, natural daylight, soft shallow depth of field, authentic Tier-2/3 Indian campus feel — not glossy stock. Students aged 18–22 in simple smart-casual Indian attire. Handheld-subtle, gentle natural motion. No text, no captions, no logos, no on-screen graphics.

---

## A) TEACHING BACKDROP — looping classroom (for the Micro-teaching station)
**Purpose:** plays on a loop while the candidate teaches, so it feels like a real room of students is in front of them. **Teacher's point of view, students facing the camera.**

- **Length:** 12–20 s, **seamless loop** (first and last frame near-identical, no hard cut).
- **Aspect:** 16:9 · **Audio:** none needed (plays muted) — or faint classroom ambience.
- **Motion:** subtle and continuous — students shifting slightly, a few taking notes, occasional glances at the teacher/camera, one or two whispering, nobody leaving frame. No dramatic action, no zoom, locked-off or very slow push-in.

**File:** `teach-loop.mp4` (shared) — *optional CS variant* `teach-loop-lab.mp4` (same but a computer lab with monitors on desks).

> Prompt: "[global look] Teacher's POV across a classroom of about 25 attentive Indian college students seated at rows of desks, facing the viewer, listening to a lecture. Some take notes, a few glance up, one whispers to a neighbour, gentle natural movement throughout. Warm daylight from side windows. Calm, engaged, everyday classroom atmosphere. Slow, almost-still camera. Seamless loop."

---

## B) STUDENT CLIPS — short, one per scenario (student faces the camera / the candidate)
**Purpose:** replaces the still in each scenario station. The student looks toward the candidate and delivers their line (or just reacts).

- **Length:** 5–8 s · **Aspect:** 4:3 (fits the panel) · **Loop:** gentle (can hold on the student's expression).
- **Two options per clip:** *(a)* **silent** — the student's expression + body language only (simplest, most reliable); *(b)* **spoken** — lip-synced to the line in quotes (use if your tool does dialogue). Keep voices Indian-accented, natural.

| File | Scenario | Visual + line to (optionally) speak |
|------|----------|--------------------------------------|
| `step4-marketing.mp4` | Doubt | A curious student leans forward, mild confusion: *"Sir, marketing is basically selling, right?"* |
| `step4-java.mp4` | Doubt | A student at a lab monitor turns to ask: *"Sir, Java and JavaScript are basically the same thing, right?"* |
| `step5-marketing.mp4` | Wrong answer | A confident student, half-smiling, sure of themselves: *"Branding is just the logo and tagline."* |
| `step5-java.mp4` | Wrong answer | A confident student pointing at their screen: *"If the code runs once without errors, the program is correct."* |
| `step6.mp4` *(shared)* | Difficult student | A student leans back, arms crossed, mildly challenging, skeptical glance toward the teacher. (Silent works best; optional line for marketing: *"How much of this have you actually done in industry?"*) |
| `step7.mp4` *(shared)* | Dilemma | A worried student, looking down then up, conflicted and emotional but composed — quiet, vulnerable. (Silent recommended.) |
| `step8-marketing.mp4` | Why study this | A disengaged, slouched student, half-listening, unimpressed: *"I don't want a marketing job. Why do I need this?"* |
| `step8-java.mp4` | Why study this | A skeptical student leaning back from the keyboard: *"AI can already write code. Why do I need Java?"* |
| `step9.mp4` *(shared)* | Silent classroom | Wide shot: a room of students looking down at desks, avoiding eye contact, awkward silence — a couple shift uncomfortably. (Silent, no dialogue.) |
| `step11-marketing.mp4` | Integrity | A student leans in close, lowers their voice, slightly conspiratorial across a desk. (Silent recommended; the request is read in the prompt text.) |
| `step11-java.mp4` | Integrity | A student quietly, a little furtively, asks the teacher something near the lab computers. (Silent recommended.) |

**Tips:** keep the same model/seed/style across all clips so the "class" feels consistent; favour natural micro-expressions over acting; 24–30 fps; if a clip must loop, end on a neutral held expression close to the opening frame.

---
### Filename summary (drop into `media/`)
`teach-loop.mp4` · `teach-loop-lab.mp4` (optional) · `step4-marketing.mp4` · `step4-java.mp4` · `step5-marketing.mp4` · `step5-java.mp4` · `step6.mp4` · `step7.mp4` · `step8-marketing.mp4` · `step8-java.mp4` · `step9.mp4` · `step11-marketing.mp4` · `step11-java.mp4`
