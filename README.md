# Converge

### One space. Every flow.

Converge is a private, multi-workspace collaboration platform that brings team updates, direct and group conversations, calls, meetings, files, calendars, profiles, notifications, and workspace-aware AI into one focused experience.

The product is designed around a strict rule: **data from one workspace must never appear in another workspace**—including messages, reply previews, identities, call signals, notification sounds, and realtime events.

## What you can do

- Publish updates, media, polls, and shared posts to a workspace feed.
- Comment, reply, react, save, share, edit, delete, and moderate content.
- Use private direct messages and permission-aware group conversations.
- Make voice/video calls, start group calls, and run workspace meetings.
- Browse shared files and maintain a workspace calendar.
- Search posts, people, conversations, and files.
- Ask Converge AI questions grounded in the current workspace.
- Switch themes while keeping the experience consistent inside chats.
- Use a dedicated responsive interface with mobile navigation and chat-specific chrome.
- Retain read-only chat history after leaving a group without leaving the workspace.

## Privacy model

Converge scopes identity and collaboration data by `workspace_id` at every layer:

1. Supabase Row Level Security controls database reads and mutations.
2. RPC functions validate the authenticated user and relevant workspace/group membership.
3. Realtime call and meeting channels are private and authorized through RLS.
4. Client state, notification audio, reply previews, and subscriptions are isolated per workspace.
5. Automated regression checks attempt cross-workspace access with multiple real user sessions.

Former group members retain historical access to that group until they remove it themselves, but the composer is disabled and new messages cannot be sent.

## Demo workspace

The sign-in screen includes a selector for **20 public demo personas** in the seeded `Converge Demo Studio` workspace. The workspace contains realistic posts, polls, comments, direct messages, group chats, files, events, calls, and meeting history.

Example demo account:

```text
Email:    converge.qa01.20260913@example.com
Password: CvQA!01_R7m#29LpX4s
```

These credentials are intentionally public and must never be reused for real accounts or production administration.

## Tech stack

- [Next.js 16](https://nextjs.org/) App Router
- [React 19](https://react.dev/) and TypeScript
- [Supabase](https://supabase.com/) Auth, Postgres, RLS, Realtime, and Storage
- WebRTC for voice, video, group calls, meetings, and screen sharing
- Gemini/OpenAI-compatible server route for workspace-aware AI
- GSAP, Framer Motion, React Three Fiber, and Three.js for the landing experience

## Local setup

Requirements:

- Node.js 22 or newer
- npm
- A Supabase project with the Converge schema and policies
- At least one configured AI provider key for Converge AI

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key

# Configure at least one provider for workspace AI
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=your_model_name
```

Never expose a Supabase `service_role` or secret key through a `NEXT_PUBLIC_` variable.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database setup

The repository includes the base schema plus focused SQL migrations for profiles, invitations, feeds, chat controls, replies, notifications, group permissions, AI conversations, events, privacy hardening, and realtime authorization.

Important release migrations include:

- `database-schema.sql`
- `workspace-profiles-migration.sql`
- `social-migration.sql` and `social-upgrade.sql`
- `chat-realtime-upgrade.sql`
- `group-permissions-migration.sql`
- `notifications-repair-migration.sql`
- `workspace-ai-conversations-migration.sql`
- `workspace-calendar-events-migration.sql`
- `workspace-privacy-rls-hardening.sql`
- `security-definer-privacy-hardening.sql`
- `workspace-security-performance-hardening.sql`
- `realtime-call-meeting-privacy.sql`

Review migrations before applying them to a different Supabase project. Some files are incremental upgrades and assume the base Converge tables already exist.

`demo-workspace-seed.sql` is demo data—not production data.

## Verification

Run the standard release checks:

```bash
npm run lint
npm run build
node scripts/check-demo-workspace.cjs
node scripts/check-call-meeting-realtime.cjs
```

Additional browser/WebRTC checks:

```bash
node scripts/check-personal-calls.cjs
node scripts/check-group-call-lifecycle.cjs
node scripts/check-meeting-e2e.cjs
```

The privacy suite verifies that all 20 demo accounts can use their assigned workspace while being unable to read messages, call signals, or chat identities from another workspace.

## Project structure

```text
src/app/                         App Router pages and product styles
src/app/components/              Chat, calls, meetings, feed, files, AI, and mobile UI
src/lib/supabase/                Browser Supabase client
scripts/                         Automated product and privacy verification
tests/                           Database privacy regression tests
*.sql                            Schema, migrations, grants, and RLS hardening
```

## Production checklist

- Keep email confirmation enabled for real sign-ups.
- Enable Supabase leaked-password protection.
- Use only publishable keys in the browser.
- Run Supabase security and performance advisors after schema changes.
- Test with at least two users across at least two workspaces.
- Configure camera, microphone, and notification permissions over HTTPS.
- Store AI provider keys only in server-side environment variables.

## Author

Built by **Harsh Shukla**.

---

Converge is built for teams that want the speed of social communication without sacrificing workspace boundaries.
