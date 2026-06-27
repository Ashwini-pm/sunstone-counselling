# Scenario image prompts — Faculty Assessment Center (V2)

Images are auto-generated free via `../gen-all.py` (Pollinations/FLUX, no key). To regenerate or swap in a better model, use the filenames + prompts below. Until a file exists the app shows a dashed "drop image here" placeholder.

11 images. Steps 6, 7, 9 are **shared** across both roles. Stations 1, 2, 3, 10 have **no image**.

## Global style (prepended to every prompt)
> Realistic candid documentary photograph, modern Indian university classroom or computer lab, natural daylight, soft shallow depth of field, authentic Tier-2/3 Indian campus, students aged 18–22 in simple smart-casual Indian attire, not glossy stock, no text, no words, no logos. 4:3.

| File | Station | Scene |
|------|---------|-------|
| `step4-marketing.png` | Doubt resolution | Curious first-year raising a hand, mildly puzzled but friendly, classroom desk |
| `step4-java.png` | Doubt resolution | Student in a computer lab asking a question, slightly confused, hand half-raised |
| `step5-marketing.png` | Confident wrong answer | Confident student standing & answering in a lecture room, classmates listening |
| `step5-java.png` | Confident wrong answer | Confident student in a lab pointing at their monitor, self-assured |
| `step6.png` *(shared)* | Difficult student | Student leaning back, arms crossed, skeptical/challenging, mild classroom tension (respectful, not aggressive) |
| `step7.png` *(shared)* | Student dilemma | Pensive worried student alone, head on one hand, looking down, dignified, soft light |
| `step8-marketing.png` | Why study this | Bored, disengaged student slouching, unconvinced, half-listening |
| `step8-java.png` | Why study this | Disengaged student in a lab, arms folded, skeptical, idle screen |
| `step9.png` *(shared)* | Silent classroom | Wide view of students sitting quietly, looking down, avoiding eye contact, awkward silence |
| `step11-marketing.png` | Integrity | Student leaning in to quietly ask a faculty member something across a staff-room desk; faculty seen from behind |
| `step11-java.png` | Integrity | Student quietly asking a faculty member something beside lab computers; faculty from behind |

**Tip:** keep one consistent model/style across all 11 so the set feels cohesive; favour natural expressions over exaggerated drama (especially steps 7 & 11).
