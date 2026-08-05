"""
Generate one Hinglish avatar video per question and attach it to that question.

Reads every active question with no avatar_url, asks HeyGen to render the
avatar speaking it, uploads the result to S3, and writes the URL back.

Idempotent: questions that already have a video are skipped, so adding a new
question later regenerates only that one.

Run:  python3 scripts/heygen_generate.py
Dry:  python3 scripts/heygen_generate.py --dry-run

Requires in .env.local:
  HEYGEN_API_KEY, HEYGEN_AVATAR_ID, HEYGEN_VOICE_ID
  AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME
  DATABASE_URL  (the Neon connection string)

NOTE: the HeyGen request/response shapes below follow their documented v2 API.
Verify against your account (or the HeyGen MCP server) before the first real
run — vendors move these around, and a wrong field name here just 400s.
"""

import argparse
import pathlib
import sys
import tempfile
import time

import boto3
import psycopg
import requests

# ── Config ────────────────────────────────────────────────────────────────────

ENV_PATH = pathlib.Path(__file__).parent.parent / ".env.local"


def load_env() -> dict:
    if not ENV_PATH.exists():
        sys.exit(f"Missing {ENV_PATH}. Copy .env.local.example and fill it in.")
    env = {}
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


ENV = load_env()


def need(key: str) -> str:
    val = ENV.get(key)
    if not val or val.startswith("YOUR_"):
        sys.exit(f"{key} is not set in .env.local")
    return val


HEYGEN_KEY = need("HEYGEN_API_KEY")
AVATAR_ID = need("HEYGEN_AVATAR_ID")
VOICE_ID = need("HEYGEN_VOICE_ID")

AWS_REGION = need("AWS_REGION")
AWS_KEY = need("AWS_ACCESS_KEY_ID")
AWS_SECRET = need("AWS_SECRET_ACCESS_KEY")
S3_BUCKET = need("S3_BUCKET_NAME")

DATABASE_URL = need("DATABASE_URL")

HEYGEN_BASE = "https://api.heygen.com"
HEYGEN_HEADERS = {"X-Api-Key": HEYGEN_KEY, "Content-Type": "application/json"}

POLL_TIMEOUT_SEC = 900
POLL_INTERVAL_SEC = 10


# ── Database (Neon) ──────────────────────────────────────────────────────────

def fetch_pending_questions() -> list[dict]:
    """Active questions that have no avatar video yet."""
    with psycopg.connect(DATABASE_URL) as conn:
        rows = conn.execute(
            """
            select id::text, content, position_group, sort_order
            from questions
            where avatar_url is null and active
            order by sort_order asc
            """
        ).fetchall()
    return [
        {"id": r[0], "content": r[1], "position_group": r[2], "sort_order": r[3]}
        for r in rows
    ]


def set_avatar_url(question_id: str, url: str) -> None:
    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute(
            "update questions set avatar_url = %s where id = %s",
            (url, question_id),
        )
        conn.commit()


# ── HeyGen ────────────────────────────────────────────────────────────────────

def create_video(text: str) -> str:
    """Kick off a render. Returns the HeyGen video id."""
    payload = {
        "video_inputs": [
            {
                "character": {
                    "type": "avatar",
                    "avatar_id": AVATAR_ID,
                    "avatar_style": "normal",
                },
                "voice": {
                    "type": "text",
                    "input_text": text,
                    "voice_id": VOICE_ID,
                },
            }
        ],
        "dimension": {"width": 1280, "height": 720},
    }
    r = requests.post(
        f"{HEYGEN_BASE}/v2/video/generate",
        headers=HEYGEN_HEADERS,
        json=payload,
        timeout=60,
    )
    if r.status_code >= 400:
        sys.exit(f"HeyGen generate failed ({r.status_code}): {r.text}")
    return r.json()["data"]["video_id"]


def wait_for_video(video_id: str) -> str:
    """Poll until the render completes. Returns the downloadable URL."""
    deadline = time.time() + POLL_TIMEOUT_SEC
    while time.time() < deadline:
        r = requests.get(
            f"{HEYGEN_BASE}/v1/video_status.get",
            headers=HEYGEN_HEADERS,
            params={"video_id": video_id},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()["data"]
        status = data.get("status")

        if status == "completed":
            return data["video_url"]
        if status == "failed":
            raise RuntimeError(f"HeyGen render failed: {data.get('error')}")

        time.sleep(POLL_INTERVAL_SEC)

    raise TimeoutError(f"HeyGen render timed out after {POLL_TIMEOUT_SEC}s")


# ── S3 ────────────────────────────────────────────────────────────────────────

s3 = boto3.client(
    "s3",
    region_name=AWS_REGION,
    aws_access_key_id=AWS_KEY,
    aws_secret_access_key=AWS_SECRET,
)


def upload(local_path: pathlib.Path, key: str) -> str:
    """Upload privately. Playback goes through presigned URLs, not public ACLs."""
    s3.upload_file(
        str(local_path),
        S3_BUCKET,
        key,
        ExtraArgs={"ContentType": "video/mp4"},
    )
    return f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="List what would be generated, then stop.")
    parser.add_argument("--limit", type=int, default=0,
                        help="Only process the first N questions.")
    args = parser.parse_args()

    questions = fetch_pending_questions()
    if args.limit:
        questions = questions[: args.limit]

    if not questions:
        print("Nothing to do — every active question already has a video.")
        return

    print(f"{len(questions)} question(s) need an avatar video:\n")
    for q in questions:
        preview = q["content"][:70].replace("\n", " ")
        print(f"  [{q['position_group']}] {preview}…")

    if args.dry_run:
        print("\nDry run — nothing generated.")
        return

    print()
    failures = 0

    for i, q in enumerate(questions, 1):
        qid = q["id"]
        print(f"[{i}/{len(questions)}] {qid}")

        try:
            video_id = create_video(q["content"])
            print(f"    rendering ({video_id})…")
            download_url = wait_for_video(video_id)

            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                resp = requests.get(download_url, stream=True, timeout=300)
                resp.raise_for_status()
                for chunk in resp.iter_content(1 << 20):
                    tmp.write(chunk)
                tmp_path = pathlib.Path(tmp.name)

            s3_url = upload(tmp_path, f"avatars/{qid}.mp4")
            tmp_path.unlink(missing_ok=True)

            set_avatar_url(qid, s3_url)
            print(f"    done → {s3_url}")

        except Exception as exc:  # keep going; one bad question shouldn't stop the batch
            failures += 1
            print(f"    FAILED: {exc}")

    done = len(questions) - failures
    print(f"\n{done} generated, {failures} failed.")
    if failures:
        print("Re-run to retry the failures — successful ones are skipped.")


if __name__ == "__main__":
    main()
