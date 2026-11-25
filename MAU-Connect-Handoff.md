# MAU Connect Project Handoff

Prepared 25 November 2026 for the project owner and incoming developer. MAU Connect is a marketplace and student community application. This handoff identifies the services, release process and outstanding checks.

# Current status

Vercel reported production commit `184b29b` (add-view-once-photos) as Ready during the latest diagnostics. The main branch was synchronized with origin and the working tree was clean. All 43 automated tests passed, and the editor reported no errors. The latest lint and typecheck runs did not complete during diagnostics; a previous TypeScript check passed. A local production build was not confirmed.

Supabase migrations 010 and 011 were run successfully in the SQL editor. Confirm the full migration history before applying migrations elsewhere.

# Project access

- [Live site](https://mau-connect-coral.vercel.app/)

- [GitHub repository](https://github.com/EETuraso/MAU-Connect)

- [Vercel deployments](https://vercel.com/eet-uraso/mau-connect/deployments)

- [Supabase project](https://supabase.com/dashboard/project/enqewenykdqziktzjsqi)

Transfer access through the respective services. Credentials and environment values are not included here.

# Application and architecture

The marketplace supports listings, seller accounts, buyer and seller conversations, saved listings, reports and an administrator dashboard. Student Block includes group chat, voice notes, photos, profiles, past questions and handouts. Payment instructions are informational; the app does not process payments.

The application uses Next.js 16.3.4 App Router, React 19.2.6, Node 24.x and pnpm 11.25.0. Supabase provides authentication, Postgres row-level security and storage. GitHub holds the source and runs CI; Vercel hosts the app. The server uses `SUPABASE_URL` and `SUPABASE_ANON_KEY`; the app does not use a service-role key.

The repository README covers setup and deployment. `app/students` contains the chat UI, `app/api/students` contains its endpoints, and `supabase` contains numbered SQL migrations.

# Recent changes

Profile portraits and member avatars have fixed display sizes and crop uploaded images to fit. Student group photos can be sent with View once enabled. The implementation records opening separately for each recipient in the database; the sender cannot reopen that photo through the chat interface. View-once behavior does not prevent screenshots or external recording. A live multi-account test is still required.

# Local setup and release

1. Install Node 24.x and enable Corepack. From the repository root, run `corepack pnpm install --frozen-lockfile`, then `corepack pnpm run dev`.

2. Create an untracked `.env.local` with the intended Supabase project's `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Open http://127.0.0.1:3000/. Use a separate staging backend where possible and never commit credentials.

3. Before release, run `corepack pnpm run lint`, `corepack pnpm run typecheck`, `corepack pnpm run test` and `corepack pnpm run build`.

4. Review the diff, push approved changes to main, and check the corresponding Vercel deployment and build logs. Verify the homepage, admin access, sign-in and student chat after deployment. CI alone does not prove live Supabase policies or email delivery.

# Database and configuration

The repository contains migrations 001 through 011. The README setup instructions currently list migrations only through 007. Migration 008 adds the student room; 009 configures voice storage; 010 adds message deletion, group membership and chat image storage; 011 adds view-once photos. Inspect the existing database and apply only missing migrations in order. Do not blindly rerun scripts against production.

Supabase Auth needs the production site URL, allowed password-reset redirects, email confirmation and working SMTP for public registration and recovery. Verify the live settings and delivery to a real inbox. The repository README describes initial administrator provisioning.

# Priority follow up

- Complete lint, typecheck and a production build; investigate any failures.

- Test view-once with a sender and at least two recipient accounts. Confirm each recipient can open once independently, cannot reopen after closing, refreshing or changing device, and does not consume another recipient's view. Check network interruption behavior.

- Verify regular photo and voice upload and playback, message deletion, group membership, profile portrait sizing on desktop and mobile, and resource access for signed-in and signed-out users.

- Confirm migration history, production environment configuration, SMTP delivery, backups and service ownership with the project administrator. Update the README after verifying production history.

- Check CI and Vercel logs for the deployed commit. Test buyer–seller isolation and administrator permissions with separate accounts.

# Operational notes

For an incident, inspect Vercel deployment and function logs, then Supabase Auth, database and storage health. Rolling back application code does not automatically reverse database changes; assess compatibility before promoting an older deployment. Maintain an independent record of migrations and backups.

Before changing Next.js code, follow the repository's AGENTS.md and read the relevant installed guide under `node_modules/next/dist/docs`; the project warns that its Next.js version may differ from familiar conventions.
