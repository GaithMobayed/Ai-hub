# AUTH-6 · Protect private routes: implementation plan

> **Story:** [stories/AUTH-6-route-guards.md](../../stories/AUTH-6-route-guards.md) · **Spec:** [SPEC.md](./SPEC.md) · **Conventions:** [CONVENTIONS.md](../CONVENTIONS.md) · **Product spec:** [SPEC.md §5.4](../../SPEC.md)
> **Estimate:** 2 pts · **Labels:** auth, routing · **Depends on:** AUTH-2 (merged in `ceaa5ec`, see §2)

This plan expands the implementation spec against the code as it is **today**. It records the decisions, the gaps found in the merged sign-in flow, and the order of work, so the PR stays small and easy to review.

---

## 1. Acceptance criteria

| # | Criterion | How we prove it |
|---|---|---|
| AC1 | Signed-out users who visit a private route go to `/login?redirect=<path>`, and signing in returns them there. | Signed out, open `/compare?x=1` → URL is `/login?redirect=%2Fcompare%3Fx%3D1`. Back does **not** return to `/compare`. Sign in → lands on `/compare?x=1`. |
| AC2 | Signed-in users who visit `/login` or `/register` go to `/`. | Signed in, open `/login` and `/register` → both land on `/` with no flash of the auth card. |
| AC3 | The 404 page needs no session. | Signed out **and** signed in, open `/nope` → `NotFoundPage` renders and the URL stays the same. |

The second half of AC1 comes from [SPEC.md](./SPEC.md) ("signing in returns to `/compare`"). AUTH-2 shipped without it, so this story closes it (decision D1).

---

## 2. Current state

| Area | File | What it does today |
|---|---|---|
| Router | [router.tsx](../../client/src/app/router.tsx) | `RootLayout` → `authRoutes` + `AppShell` (all private features) + `*` → `NotFoundPage`. **Nothing is guarded.** |
| Session store | [auth.store.ts](../../client/src/shared/stores/auth.store.ts) | zustand + `persist` (key `ai-hub-auth`, localStorage). Hydration is **synchronous**, so `token` is correct on the first render. No "hydrating" state is needed. |
| 401 handling | [client.ts](../../client/src/shared/api/client.ts) | Clears the session and shows a snackbar. Carries `TODO(AUTH-4): redirect to /login (RequireAuth handles it once AUTH-6 lands)`. |
| Sign in | [login-form/index.tsx](../../client/src/features/auth/components/login-form/index.tsx), [useLogin.ts](../../client/src/features/auth/hooks/useLogin.ts) | **Merged.** `useLogin` calls `setSession`, then the form calls `navigate(paths.dashboard)`. It ignores `?redirect=`, and `safeRedirect` does not exist. |
| Sign up | [register-form/index.tsx](../../client/src/features/auth/components/register-form/index.tsx), [useRegister.ts](../../client/src/features/auth/hooks/useRegister.ts) | Same pattern: `setSession` in the hook, `navigate(paths.dashboard)` in the form. |
| Sign out | [UserMenu.tsx](../../client/src/features/auth/components/UserMenu.tsx) | Only calls `navigate(paths.login)`. It does not clear the session (AUTH-5). |
| Guards | `RequireAuth.tsx`, `PublicOnly.tsx` | **Staged as empty files.** Not exported, not used. |
| Tests | — | No test runner yet (QA-2). Verification is manual plus `lint` and `build`. |

---

## 3. Design decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Who owns the post-auth redirect | **`PublicOnly`**, through `safeRedirect(searchParams.get('redirect'))`. Remove the `navigate` calls from `LoginForm` and `RegisterForm`. | One owner, no race (see R1). As soon as `setSession` runs, `PublicOnly` re-renders and redirects. It also covers a user who opens `/login?redirect=…` while already signed in. |
| D2 | Guard mechanism | **Layout routes** (`element: <Guard />` that renders `<Outlet />`) | One guard covers a whole group. New feature routes added to the group are protected automatically. It fits `createBrowserRouter`. |
| D3 | Components vs. route `loader`s | Components, **not** loaders | Loaders run once per navigation and don't react to the store. A component that subscribes to `token` redirects **immediately** when the session is cleared (401 interceptor, sign-out). AUTH-4 and AUTH-5 rely on this. |
| D4 | Source of truth | `useAuthStore((s) => s.token)` | A narrow selector re-renders only when the token changes, not when `setUser` runs (AUTH-3, SET-1). |
| D5 | Redirect value | `pathname + search` (no hash), `encodeURIComponent`, `replace` | Keeps filters and query params. `replace` keeps the guarded URL out of history, so Back doesn't loop. |
| D6 | `safeRedirect` location | `src/features/auth/lib/safeRedirect.ts` | The path AUTH-2's spec already reserved. It's internal to the feature, so it is **not** exported from `index.ts`. |
| D7 | Where guards live | `src/features/auth/components/`, exported from `features/auth/index.ts` | Matches the CONVENTIONS.md mapping table. `app/router.tsx` only composes them. |
| D8 | 404 placement | `*` stays a **sibling** of both guards, directly under `RootLayout` | Satisfies AC3 by construction: no guard is an ancestor of `NotFoundPage`. |
| D9 | Loading UI | None in the guards | The store hydrates synchronously. The `/auth/me` loader belongs to `SessionGate` (AUTH-3), which will sit **inside** `RequireAuth`. |

---

## 4. Target route tree

```
RootLayout (Suspense)                      errorElement: RouteError
├─ PublicOnly                              ← token ? <Navigate safeRedirect(?redirect)> : <Outlet>
│  ├─ /login        LoginPage
│  └─ /register     RegisterPage
├─ RequireAuth                             ← token ? <Outlet> : <Navigate "/login?redirect=…">
│  └─ AppShell                             errorElement: RouteError
│     ├─ /                 DashboardPage
│     ├─ /chat             ChatPage
│     ├─ /chat/:id         ChatPage
│     ├─ /compare          ComparePage
│     ├─ /providers        ProvidersPage
│     └─ /settings         SettingsPage
└─ *                NotFoundPage           ← no guard (AC3)
```

---

## 5. Files

| Action | Path | What |
|---|---|---|
| create | `client/src/features/auth/lib/safeRedirect.ts` | `safeRedirect(value: string \| null): string` |
| fill | `client/src/features/auth/components/RequireAuth.tsx` | `<Outlet />`, or `<Navigate to="/login?redirect=…" replace />` |
| fill | `client/src/features/auth/components/PublicOnly.tsx` | `<Outlet />`, or `<Navigate to={safeRedirect(…)} replace />` |
| modify | `client/src/features/auth/index.ts` | export `RequireAuth` and `PublicOnly` |
| modify | `client/src/app/router.tsx` | wrap the two route groups |
| modify | `client/src/features/auth/components/login-form/index.tsx` | drop `useNavigate` and the `onSuccess` navigate (D1) |
| modify | `client/src/features/auth/components/register-form/index.tsx` | same |
| modify | `client/src/shared/api/client.ts` | update the `TODO(AUTH-4)` comment: the redirect now happens through `RequireAuth`. The snackbar polish stays in AUTH-4. |

No new dependencies.

---

## 6. Implementation steps

Do them in this order. Each step builds on its own, so the PR can be reviewed commit by commit.

### Step 1: `safeRedirect`
```ts
import { paths } from '@/shared/config/paths';

const authPaths: string[] = [paths.login, paths.register];

/** Only same-origin, non-auth paths are allowed as a post-sign-in target. Anything else goes to the dashboard. */
export function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return paths.dashboard;
  }
  const pathname = value.split(/[?#]/)[0];
  return authPaths.includes(pathname) ? paths.dashboard : value;
}
```
- `//evil.com` and `/\evil.com` are rejected because browsers treat both as protocol-relative URLs.
- `/login` and `/register` are rejected so a crafted link can't bounce between `PublicOnly` and the auth pages.
- `searchParams.get` already decodes the value, so don't call `decodeURIComponent` again.

### Step 2: `RequireAuth`
```tsx
import { Navigate, Outlet, useLocation } from 'react-router';
import { paths } from '@/shared/config/paths';
import { useAuthStore } from '@/shared/stores/auth.store';

/** Layout route: renders private routes only when there is a session. */
export function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();

  if (!token) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${paths.login}?redirect=${redirect}`} replace />;
  }
  return <Outlet />;
}
```

### Step 3: `PublicOnly`
```tsx
import { Navigate, Outlet, useSearchParams } from 'react-router';
import { useAuthStore } from '@/shared/stores/auth.store';
import { safeRedirect } from '../lib/safeRedirect';

/** Layout route: sign-in pages are skipped when there is a session. Owns the post-sign-in redirect. */
export function PublicOnly() {
  const token = useAuthStore((s) => s.token);
  const [searchParams] = useSearchParams();

  return token ? <Navigate to={safeRedirect(searchParams.get('redirect'))} replace /> : <Outlet />;
}
```

### Step 4: Remove the competing navigations
In `LoginForm` and `RegisterForm`, delete `useNavigate`, the `paths` import (if unused), and the `onSuccess: () => navigate(...)` option. Keep `onError`. The hooks still call `setSession`, and `PublicOnly` does the rest.

### Step 5: Export from the feature's public API
```ts
export { RequireAuth } from './components/RequireAuth';
export { PublicOnly } from './components/PublicOnly';
```

### Step 6: Router
```tsx
children: [
  { element: <PublicOnly />, children: [...authRoutes] },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell navItems={navItems} content={<RecentChats />} footer={<UserMenu />} />,
        errorElement: <RouteError />,
        children: [...homeRoutes, ...chatRoutes, ...compareRoutes, ...providersRoutes, ...settingsRoutes],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
],
```
`RequireAuth` must wrap `AppShell`, not the other way round. Otherwise the shell (sidebar, `RecentChats` queries) mounts and fires API calls before the guard redirects.

### Step 7: Update the TODO in `client.ts`, then run `npm run lint && npm run build`

---

## 7. Risks and edge cases

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Two owners of the post-sign-in redirect.** Today the form calls `navigate('/')` in the same tick as `setSession`. The form's navigation wins, so `?redirect=` is lost. | AC1 fails: the user lands on `/` instead of `/compare`. | D1: `PublicOnly` is the only owner. Step 4 removes the form navigations. |
| R2 | Open redirect through `?redirect=` | Phishing | `RequireAuth` only **writes** the param. `safeRedirect` is the only reader and rejects anything that isn't a same-origin path. |
| R3 | Redirect loop | Infinite redirects if `/login` ever ends up under `RequireAuth`, or if `?redirect=/login` is followed. | The route tree keeps auth pages only under `PublicOnly`, and `safeRedirect` rejects auth paths. Reviewers should check both. |
| R4 | "Sign out" in `UserMenu` only navigates to `/login` and keeps the token. | `PublicOnly` bounces the user back to `/`, so Sign out looks broken. | Expected until **AUTH-5** clears the session. Don't fix it here (one story per PR). Call it out in the PR. |
| R5 | Another tab signs out or clears localStorage. | A stale session in this tab. | Out of scope. The next API 401 clears the session (FND-4) and `RequireAuth` reacts. A `storage` listener is a possible later improvement. |
| R6 | Empty staged guard files | `tsc -b` passes (`moduleDetection: "force"`), but the files do nothing. | Steps 2–3 fill them. Don't commit them empty. |

### Gaps in the merged sign-in flow (AUTH-2), not fixed here
Found while reviewing the code this story touches. Log them as an AUTH-2 follow-up so this PR stays focused:
- `LoginPage` title says "Create your account". It should be "Sign in".
- `LoginForm` maps a 409 to "An account with this email already exists". Login never returns 409, so remove that branch.
- The login `PasswordField` uses `autoComplete="new-password"`. It should be `current-password`, otherwise password managers won't autofill.
- The "register now" link drops `?redirect=`. AUTH-2 step 6 asks to keep it.

---

## 8. Verification (manual test matrix)

Run the server (`npm run seed` for the demo user), then `cd client && npm run dev`. Sign in as `demo@aihub.dev` / `password123`.

| # | Session | Action | Expected |
|---|---|---|---|
| 1 | out | open `/compare` | `/login?redirect=%2Fcompare`. Back does not return to `/compare`. |
| 2 | out | open `/chat/abc?x=1` | `/login?redirect=%2Fchat%2Fabc%3Fx%3D1` |
| 3 | out | from row 1, sign in | lands on `/compare` (AC1) |
| 4 | out | open `/login` directly and sign in | lands on `/` |
| 5 | out | register a new account from `/register` | lands on `/` |
| 6 | out | open `/login?redirect=https://evil.com`, `//evil.com`, `/\evil.com`, `/login`, then sign in | lands on `/` every time |
| 7 | out | open `/nope` | 404 page, URL unchanged (AC3) |
| 8 | in | open `/login`, `/register` | `/`, with no flash of the auth card (AC2) |
| 9 | in | open `/nope` | 404 page, no shell (AC3) |
| 10 | in | open a private page, delete `ai-hub-auth` in DevTools, reload | `/login?redirect=…` |
| 11 | in | in the console, run `useAuthStore.getState().clearSession()` (or trigger a 401) | goes to `/login?redirect=…` **without a reload**. This proves the guard subscribes to the store (AUTH-4 needs it). |
| 12 | out | Network tab on `/compare` | **no** API requests fire before the redirect (the shell never mounts) |

Then `npm run lint && npm run build` with zero errors and zero warnings.

---

## 9. Definition of done

- [ ] AC1, AC2 and AC3 pass (matrix rows 1–9).
- [ ] Rows 10–12 pass (store reactivity, no early API calls).
- [ ] `LoginForm` and `RegisterForm` no longer navigate after success. `PublicOnly` is the only redirect owner.
- [ ] Guards are exported only through `@/features/auth`. No deep imports. `safeRedirect` stays internal.
- [ ] No hard-coded paths. Everything comes from `@/shared/config/paths`.
- [ ] The `TODO(AUTH-4)` comment in `client.ts` is updated.
- [ ] `lint` and `build` are clean.
- [ ] The PR description lists R4 and the AUTH-2 gaps so reviewers don't report them as regressions.
- [ ] Commit: `feat(auth): AUTH-6 route guards`. Move the card to **Done**.

---

## 10. Out of scope (owned by other stories)

- The `GET /auth/me` bootstrap and full-screen loader: **AUTH-3** (`SessionGate` goes inside `RequireAuth`).
- The "Session expired" snackbar polish: **AUTH-4**.
- Clearing the session and query cache on sign-out: **AUTH-5**.
- The AUTH-2 copy and autofill gaps listed in §7.
- Automated route-guard tests: **QA-2** (rows 1–12 above are the test cases to port).
