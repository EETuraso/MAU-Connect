# MAU Connect

A Next.js App Router marketplace with a dedicated `/admin` dashboard, Supabase Auth, Postgres row-level security and Storage. GitHub stores the source and runs CI; Vercel hosts the application and its API. No service-role key is used by the app.

## Run locally

Use Node.js **24.x** and the exact **pnpm 11.25.0** version pinned in [package.json](./package.json). With Corepack available:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm run dev
```

Open [the marketplace](http://127.0.0.1:3000/) or [the admin dashboard](http://127.0.0.1:3000/admin). Leave the terminal running; Ctrl+C stops the server. Production mode uses `corepack pnpm run build` followed by `corepack pnpm run start`.

Create a local `.env.local` file and fill in both Supabase variables before using the application. Keep this file untracked; it contains environment secrets. Every account, listing and admin action uses the shared Supabase backend. Missing configuration returns HTTP 503 with a visible retry message; the app never substitutes sample records or simulated accounts. Saved listing IDs are kept in the visitor's browser.

For a slow connection, retry `corepack pnpm install --frozen-lockfile --network-concurrency=4 --fetch-timeout=120000` after stopping any previous installer. Existing cached downloads are reused. Keep [pnpm-lock.yaml](./pnpm-lock.yaml) and [pnpm-workspace.yaml](./pnpm-workspace.yaml) in Git: the pinned versions, seven-day release-age policy and explicit native-build allowlist must also apply on CI and Vercel.

## Verify changes

```powershell
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
```

[GitHub CI](./.github/workflows/ci.yml) runs these checks after a frozen dependency install on pushes, pull requests and manual runs. It uses Node 24 and reads the exact pnpm version from [package.json](./package.json). CI needs no Supabase credentials; it does not prove that a live backend is connected.

## Connect Supabase

1. Create a Supabase project. In its SQL editor, run [001_marketplace.sql](./supabase/001_marketplace.sql), [002_admin_dashboard.sql](./supabase/002_admin_dashboard.sql), [003_past_questions.sql](./supabase/003_past_questions.sql), [004_student_hub.sql](./supabase/004_student_hub.sql), [005_handout_storage.sql](./supabase/005_handout_storage.sql), [006_messaging_metrics_resources.sql](./supabase/006_messaging_metrics_resources.sql), and [007_private_student_resources.sql](./supabase/007_private_student_resources.sql) in order. For an existing installation, apply only migrations that have not already been run. Deploy and verify the version using authenticated download links before applying migration 007, which makes resource buckets private.
2. Get the project URL and **legacy anon JWT key** from Supabase Project Settings > API Keys. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` on the server. The current REST adapter uses the anon JWT as its unauthenticated bearer token. Do not use a service-role/secret key or rename these to `NEXT_PUBLIC_*`.
3. Configure Supabase Auth's Site URL to the deployed HTTPS origin and allow `/reset-password` on that origin, plus the exact local/staging redirect URLs you use. Enable email confirmation and configure production SMTP before opening public registration. Supabase's default email sender is restricted and is not a public registration service. The sign-in screens link to `/reset-password`, which sends a recovery email and exchanges its verified session for secure cookies before changing the password.
4. Register and confirm the account that will administer the marketplace. Find its UUID in Supabase Authentication > Users, and run the following in the SQL editor, substituting that exact UUID:

```sql
update public.profiles
set role = 'admin'
where id = 'YOUR_AUTH_USER_UUID';
```

5. Sign in at `/admin` with the email and password of the confirmed Supabase Auth account you registered. Admin access comes from the stored profile role and is checked on the server. There is no default admin password, no admin password is stored in the repository, and registration does not grant admin privileges.

Listing uploads accept JPEG, PNG and WebP images up to 4 MB each, leaving space for multipart overhead under the [Vercel Function body limit](https://vercel.com/docs/functions/limitations).

The dashboard manages listings, seller suspension, reports, homepage settings, categories and payment instructions. Listing removal is a soft delete and sellers cannot restore removed items. Support inspection opens an audited, read-only seller snapshot that expires after 15 minutes; it does not sign in as that seller. Payment instructions are informational; the application does not process payments.

## Prepare the GitHub repository

Create an empty GitHub repository under your account or organization. From this folder, initialize Git only if it is not already a repository:

```powershell
git init -b main
git add .
git status --short
git commit -m "Prepare MAU Connect admin dashboard and deployment"
git remote add origin https://github.com/YOUR_OWNER/YOUR_REPOSITORY.git
git push -u origin main
```

Replace the remote URL with your repository URL before running it. Review the staged files before committing. [.gitignore](./.gitignore) excludes local environment files, dependencies, builds, Vercel state, runtime caches and the old extracted source archive. Commit the source, migrations, configuration and pnpm lockfile. If a remote already exists, use that remote rather than adding another `origin`.

In repository settings, protect `main` and require the **Lint, types, tests and build** CI check before merging. Once Vercel is connected, its preview deployment check can also be required. The CI workflow validates changes; it does not create a GitHub repository or publish a deployment.

## Deploy to Vercel

1. In Vercel, choose **Add New > Project**, connect GitHub and import the repository. Select its root folder (`.`) and the **Next.js** framework preset. Set the production branch to `main`.
2. Keep Node.js at **24.x**. [package.json](./package.json) pins this supported major so the runtime does not advance to another major automatically.
3. Before the first deployment, add the following project environment variables. Scope live production values to **Production**, and use a separate Supabase staging project for **Preview** if preview deployments need live data.

| Variable | Value | Required for |
| --- | --- | --- |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | Every Vercel build, to use pinned pnpm |
| `SUPABASE_URL` | Your Supabase project HTTPS URL | Live marketplace and admin accounts |
| `SUPABASE_ANON_KEY` | That project's legacy anon JWT key | Live marketplace and admin accounts |

4. [vercel.json](./vercel.json) supplies `corepack pnpm install --frozen-lockfile` and `corepack pnpm run build`. Leave the output directory at the Next.js default. The optional Sites/Vinext scripts are not the Vercel build path, and this app cannot be hosted as a static GitHub Pages export because it uses server routes and cookies.
5. Deploy, then set Supabase Auth's Site URL to the resulting production domain. Environment changes apply to new deployments, so redeploy after adding or changing variables.
6. Open `/`, `/admin`, `/reset-password` and `/api/market` on the deployment. The API should return HTTP 200 with real listings (an empty array is valid for a new marketplace). Missing Supabase values return HTTP 503. Confirm that signed-out visitors cannot access admin controls and that an actual administrator can load the dashboard.

Vercel's GitHub integration creates previews for branches and production deployments from the production branch. Keep production credentials out of Git and configure them in Vercel's environment settings. See the official [Corepack/build settings](https://vercel.com/docs/builds/configure-a-build), [supported Node runtimes](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [environment variables](https://vercel.com/docs/environment-variables) and [GitHub integration](https://vercel.com/docs/git/vercel-for-github) documentation.

## Verify a live release

The admin activity panel counts distinct browser cookies per Lagos calendar day and records resource downloads started through the website. These totals begin when migration 006 and the corresponding app are deployed; they do not include historical visits or downloads. Test buyer–seller conversations using two separate accounts, including an unrelated account that must not see either participant's messages. Verify signed-out access to resources is denied, and that signed-in downloads work for existing and newly uploaded PDFs.

Use a staging Supabase project to verify signup/email confirmation, sign-in and logout, listing-image uploads, seller ownership isolation, admin-only access, suspension, report resolution, settings persistence and removed-listing restoration denial. Check that a seller and signed-out visitor cannot call admin actions. Repeat the important checks on the deployed preview because local unit tests do not exercise Supabase policies or Vercel infrastructure.

Verify password recovery with a real inbox after configuring SMTP. Listings refresh while the page is visible and when the visitor returns to it. The application connects buyers directly to sellers; payment instructions do not charge buyers or process payments.

## Optional Sites compatibility

The existing `dev:sites`, `build:sites` and `start:sites` scripts preserve the private Sites/Vinext workflow. The `install:ci` script is a Sites-specific Linux installer; GitHub and Vercel use the direct pinned pnpm install above. Conventional `dev:next`, `build:next` and `start:next` aliases are also retained. Do not re-extract the source archive over edited files.
