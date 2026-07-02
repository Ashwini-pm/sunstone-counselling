"""
Generate TTS audio files for all assessment questions.
These audio files are fed into SadTalker to produce talking-head videos.

Install: pip install edge-tts asyncio
Run:     python scripts/generate-tts.py

Output:  scripts/audio/<role>-<station>.mp3  (24 files total)
"""

import asyncio
import os
import re
import edge_tts

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "audio")
VOICE = "en-US-JennyNeural"  # warm, natural female voice

DILEMMA = (
    "A student says: I'm thinking of dropping out. "
    "My family wants me to start earning, and I feel guilty "
    "continuing my studies while they are struggling financially."
)

REFLECT = (
    "In 30 seconds: first, how do you think you performed today, "
    "and second, one thing you would do differently in a real classroom."
)

INTRO = (
    "In about 90 seconds, tell us: "
    "number one, who you are. "
    "Number two, what you teach. "
    "Number three, one belief that shapes how you teach. "
    "Then, why would you be a good fit for students who may be "
    "first-generation graduates, come from Tier 2 or 3 backgrounds, "
    "and use English as a second language?"
)

QUESTIONS = {
    "java": {
        "intro":      INTRO,
        "teach":      "Teach the for loop to first-year students who have recently learned variables.",
        "twoway":     "Explain the difference between a Class and an Object. "
                      "Part one: to a student seeing programming for the first time. "
                      "Part two: to a student preparing for a technical interview.",
        "doubt":      "A student says: Sir, Java and JavaScript are basically the same thing, right?",
        "wrong":      "You ask: What makes a program correct? "
                      "A student answers: If the code runs once without errors, it means the program is correct.",
        "difficult":  "A student interrupts repeatedly and says: Sir, everything you're teaching is already available on YouTube.",
        "dilemma":    DILEMMA,
        "relevance":  "A student says: AI can already write code. Why do I need to learn Java?",
        "silent":     "You ask the class: When would you use an ArrayList instead of an Array? Nobody responds. What do you do next?",
        "plan":       "Topic: Arrays versus ArrayList. Students struggle with programming basics. "
                      "Cover: how you would start, what examples you would use, "
                      "what goes on the board, and how you would check understanding.",
        "integrity":  "A student asks you to share the coding test questions before the assessment. What do you do?",
        "reflect":    REFLECT,
    },
    "marketing": {
        "intro":      INTRO,
        "teach":      "Teach Price Elasticity of Demand using a real Indian example.",
        "twoway":     "Explain Market Segmentation. "
                      "Part one: to a student who is completely lost. "
                      "Part two: to a student preparing for a marketing internship interview.",
        "doubt":      "A student says: Sir, marketing is basically selling, right?",
        "wrong":      "You ask: What is branding? "
                      "A student answers: Branding is just the logo and tagline.",
        "difficult":  "A student interrupts repeatedly and says: Sir, all this sounds good in theory. "
                      "How much of it have you actually done in industry?",
        "dilemma":    DILEMMA,
        "relevance":  "A student says: I don't want a marketing job. Why do I need to learn this?",
        "silent":     "You ask the class: Can anyone give an example of good brand positioning? "
                      "Nobody responds. What do you do next?",
        "plan":       "Topic: The Marketing Funnel. Students have never heard the concept before. "
                      "Cover: how you would start, what examples you would use, "
                      "what goes on the board, and how you would check understanding.",
        "integrity":  "A student asks you to increase his internal marks because his family has strong industry connections. What do you do?",
        "reflect":    REFLECT,
    },
}


async def generate(role: str, station: str, text: str):
    out_path = os.path.join(OUTPUT_DIR, f"{role}-{station}.mp3")
    if os.path.exists(out_path):
        print(f"  skip  {role}-{station}.mp3 (already exists)")
        return
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(out_path)
    print(f"  done  {role}-{station}.mp3")


async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Generating audio → {OUTPUT_DIR}\n")
    tasks = [
        generate(role, station, text)
        for role, stations in QUESTIONS.items()
        for station, text in stations.items()
    ]
    await asyncio.gather(*tasks)
    print(f"\nDone. {len(tasks)} files in {OUTPUT_DIR}")
    print("\nNext step:")
    print("  Feed each .mp3 + priya-avatar.jpeg into SadTalker on HuggingFace Spaces.")
    print("  Upload the output .mp4 files to S3 as:")
    print("  avatars/<role>-<station>.mp4  (e.g. avatars/java-intro.mp4)")


asyncio.run(main())
