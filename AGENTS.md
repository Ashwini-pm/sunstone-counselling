<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deployment rules — HARD RULES, never break

- NEVER run `npx vercel`, `vercel --prod`, or any Vercel CLI command. It creates a separate project and breaks the GitHub-connected deploy.
- Deploy ONLY by: `git add` → `git commit` → `git push`. Vercel auto-deploys from GitHub.
- NEVER push without explicit per-push permission from the user.
- All env vars live in `.env.local` (local) and Vercel project settings (production). Never hardcode them. Never print them in chat.
