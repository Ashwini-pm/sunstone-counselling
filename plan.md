# Faculty Assessment Center — Plan

## Stack
- **Next.js + Vercel** — hosting
- **Supabase** — auth + Postgres (admins + candidates)
- **Cloudflare R2** — video storage + streaming

---

## URL Structure
```
/test/{testLinkId}/{candidateId}/{attemptCount}
```

---

## User Journey
1. Admin creates a test link (picks role, enters candidate email)
2. Candidate receives link via email
3. Candidate opens link → login/signup
4. Candidate attempts assessment → videos upload to R2 in real-time (chunked)
5. Candidate submits → admin reviews recordings + scores in evaluator view

---

## Video Strategy
- `MediaRecorder` with `timeslice` — chunks uploaded to R2 as candidate records
- R2 serves video via signed URL directly to `<video>` tag (range requests supported)
- No transcoding for now (webm limitation on Safari accepted)

---

## Schema

### profiles
| column | type |
|---|---|
| id | uuid → ref auth.users |
| role | enum (admin, candidate) |
| name | text |
| email | text |

### tests
| column | type |
|---|---|
| id | uuid |
| role | enum (marketing, java) |
| created_by | uuid → ref profiles |
| created_at | timestamp |
| expires_at | timestamp |

### attempts
| column | type |
|---|---|
| id | uuid |
| test_id | uuid → ref tests |
| candidate_id | uuid → ref profiles |
| attempt_number | int |
| status | enum (in_progress, submitted) |
| started_at | timestamp |
| submitted_at | timestamp |

### questions
| column | type |
|---|---|
| id | uuid |
| station_id | text (e.g. "doubt", "difficult") |
| type | enum (constant, situational) |
| role | enum (marketing, java, both) |
| content | text |
| image_url | text |

### attempt_questions
| column | type |
|---|---|
| id | uuid |
| attempt_id | uuid → ref attempts |
| station_id | text |
| question_id | uuid → ref questions |

### recordings
| column | type |
|---|---|
| id | uuid |
| attempt_id | uuid → ref attempts |
| station_id | text |
| r2_url | text |
| duration_sec | int |
| plan_notes | text |
| uploaded_at | timestamp |

### scores
| column | type |
|---|---|
| id | uuid |
| attempt_id | uuid → ref attempts |
| station_id | text |
| rubric_key | text |
| human_score | int (1-10) |
| ai_score | int (1-10) |
| evaluator_notes | text |
| scored_by | uuid → ref profiles |
| updated_at | timestamp |

---

## Question Logic
- **Constant questions** — same question, same position every attempt
- **Situational questions** — picked randomly from question bank, excluding questions seen in previous attempts
- No RAG for now — simple exclusion query from `attempt_questions`

---

## Folders
```
faculty-assessment-center/
├── candidate/          → existing HTML prototype
│   ├── index.html
│   ├── images/
│   └── media/
├── admin/              → to be built
└── plan.md             → this file
```

---

## To Build (Next)
- [ ] Admin journey + screens ideation
- [ ] Next.js project setup
- [ ] Supabase project + schema migration
- [ ] Cloudflare R2 bucket setup
- [ ] Candidate flow (link → login → attempt → upload → submit)
- [ ] Evaluator flow (recordings review + scoring)
