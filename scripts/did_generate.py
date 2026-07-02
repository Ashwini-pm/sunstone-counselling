"""
End-to-end: D-ID talking head videos → S3
Generates 12 videos (Java role) using the Priya avatar photo + D-ID TTS.
Videos land in S3 as avatars/java-{station}.mp4 with public-read access.

Run: python3 scripts/did_generate.py
"""

import os, time, requests, boto3, pathlib, re

# ── Config ────────────────────────────────────────────────────────────────────

def load_env():
    env = {}
    p = pathlib.Path(__file__).parent.parent / '.env.local'
    for line in p.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
    return env

ENV             = load_env()
DID_KEY         = ENV['DID_API_KEY']
AWS_KEY         = ENV['AWS_ACCESS_KEY_ID']
AWS_SECRET      = ENV['AWS_SECRET_ACCESS_KEY']
AWS_REGION      = ENV['AWS_REGION']
S3_BUCKET       = ENV['S3_BUCKET_NAME']
AVATAR_IMAGE    = str(pathlib.Path(__file__).parent.parent / 'public' / 'priya-avatar.jpeg')
SOURCE_FALLBACK = str(pathlib.Path.home() / 'Downloads' / 'random-person.jpeg')

DID_BASE     = 'https://api.d-id.com'
DID_HEADERS  = {'Authorization': f'Basic {DID_KEY}', 'Content-Type': 'application/json'}
AMBER_URL    = 'https://expressive-avatars.d-id.com/PUBLIC_D-ID/amber_sport_elegant/avt_s8NZJC/avatar_assets/image.png'
VOICE        = {'type': 'elevenlabs', 'voice_id': 'rdZFk36Jlpt1r4DItath'}

# ── Questions ─────────────────────────────────────────────────────────────────

DILEMMA = (
    "A student says: I'm thinking of dropping out. "
    "My family wants me to start earning, and I feel guilty "
    "continuing my studies while they are struggling financially. "
    "How do you respond?"
)
REFLECT = (
    "In 30 seconds: first, how do you think you performed today? "
    "And second, one thing you would do differently in a real classroom."
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

JAVA_QUESTIONS = {
    'intro':      INTRO,
    'teach':      "Teach the for loop to first-year students who have recently learned variables.",
    'twoway':     ("Explain the difference between a Class and an Object. "
                   "Part one: to a student seeing programming for the first time. "
                   "Part two: to a student preparing for a technical interview."),
    'doubt':      "A student says: Sir, Java and JavaScript are basically the same thing, right? How do you respond?",
    'wrong':      ("You asked: What makes a program correct? "
                   "A student answered: If the code runs once without errors, it means the program is correct. "
                   "How do you respond?"),
    'difficult':  "A student interrupts repeatedly and says: Sir, everything you're teaching is already available on YouTube. How do you handle this?",
    'dilemma':    DILEMMA,
    'relevance':  "A student says: AI can already write code. Why do I need to learn Java? How do you respond?",
    'silent':     "You asked the class: When would you use an ArrayList instead of an Array? Nobody responded. What do you do next?",
    'plan':       ("Topic: Arrays versus ArrayList. Students struggle with programming basics. "
                   "Please cover: how you would start, what examples you would use, "
                   "what goes on the board, and how you would check understanding."),
    'integrity':  "A student asks you to share the coding test questions before the assessment. What do you do?",
    'reflect':    REFLECT,
}

# ── D-ID helpers ──────────────────────────────────────────────────────────────

def create_talk(source_url: str, text: str) -> str:
    """Create a D-ID talk and return its ID."""
    payload = {
        'source_url': source_url,
        'script': {
            'type': 'text',
            'input': text,
            'provider': VOICE,
            'ssml': False,
        },
        'config': {'stitch': True},
    }
    r = requests.post(f'{DID_BASE}/talks', headers=DID_HEADERS, json=payload)
    r.raise_for_status()
    return r.json()['id']


def poll_talk(talk_id: str, timeout=360) -> str:
    """Poll until video is ready; return the result URL."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = requests.get(f'{DID_BASE}/talks/{talk_id}', headers=DID_HEADERS)
        r.raise_for_status()
        data = r.json()
        status = data.get('status')
        if status == 'done':
            return data['result_url']
        if status == 'error':
            raise RuntimeError(f"D-ID error: {data.get('error')}")
        time.sleep(4)
    raise TimeoutError(f"Talk {talk_id} timed out after {timeout}s")


def download_video(url: str, dest: str):
    r = requests.get(url, stream=True)
    r.raise_for_status()
    with open(dest, 'wb') as f:
        for chunk in r.iter_content(chunk_size=65536):
            f.write(chunk)

# ── S3 helpers ────────────────────────────────────────────────────────────────

def upload_to_s3(local_path: str, s3_key: str) -> str:
    s3 = boto3.client(
        's3',
        region_name=AWS_REGION,
        aws_access_key_id=AWS_KEY,
        aws_secret_access_key=AWS_SECRET,
    )
    try:
        s3.upload_file(
            local_path, S3_BUCKET, s3_key,
            ExtraArgs={'ContentType': 'video/mp4', 'ACL': 'public-read'},
        )
    except Exception:
        # fallback: upload without public-read if bucket blocks it
        s3.upload_file(local_path, S3_BUCKET, s3_key,
                       ExtraArgs={'ContentType': 'video/mp4'})
    return f'https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{s3_key}'

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    tmp_dir = pathlib.Path(__file__).parent / 'tmp_videos'
    tmp_dir.mkdir(exist_ok=True)

    source_url = AMBER_URL
    print(f"Using Amber presenter: {source_url[:60]}...")

    results = {}
    total = len(JAVA_QUESTIONS)

    for i, (station, text) in enumerate(JAVA_QUESTIONS.items(), 1):
        s3_key  = f'avatars/java-{station}.mp4'
        tmp_mp4 = tmp_dir / f'java-{station}.mp4'

        print(f'\n[{i}/{total}] {station}')

        # skip if already on S3
        try:
            boto3.client('s3', region_name=AWS_REGION,
                aws_access_key_id=AWS_KEY,
                aws_secret_access_key=AWS_SECRET).head_object(Bucket=S3_BUCKET, Key=s3_key)
            print(f'  skip (already on S3)')
            results[station] = f'https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{s3_key}'
            continue
        except Exception:
            pass

        # create talk
        talk_id = create_talk(source_url, text)
        print(f'  talk_id: {talk_id}  — waiting...')

        # poll
        result_url = poll_talk(talk_id)
        print(f'  ready: {result_url[:60]}...')

        # download
        download_video(result_url, str(tmp_mp4))
        print(f'  downloaded ({tmp_mp4.stat().st_size // 1024} KB)')

        # upload to S3
        public_url = upload_to_s3(str(tmp_mp4), s3_key)
        print(f'  S3: {public_url}')
        results[station] = public_url

    print('\n\n✓ All done. S3 URLs:\n')
    for station, url in results.items():
        print(f'  java-{station}: {url}')

    # write a JSON map for wiring into the app
    out = pathlib.Path(__file__).parent / 'avatar_urls.json'
    import json
    out.write_text(json.dumps({'java': results}, indent=2))
    print(f'\nSaved to {out}')


if __name__ == '__main__':
    main()
