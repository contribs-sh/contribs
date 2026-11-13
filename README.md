# contribs.sh

**Every contribution, every forge, one heatmap.** Your GitHub graph only shows one account on one
platform. contribs.sh merges GitHub, GitLab, Bitbucket, Azure DevOps and Forgejo/Gitea accounts,
counts commits from repos still on your disk, and exports the result as a banner for X, LinkedIn
and more. No streaks: it's your history, not a productivity score.

![Example X banner rendered by contribs.sh](assets/hero-x.png)

**No code needed:** open the site, click **Add account**, pick GitHub, GitLab, Bitbucket or
Codeberg/Forgejo, paste a read-only token, and **Build my heatmap**. Everything runs in your browser
and is stored there; there's no contribs.sh server and tokens are only kept for the session unless you
tick "Remember on this device". Come back any time via **Sources and settings** to add accounts, mark
lost history, import files, or download your setup to self-host.

**Prefer the terminal:**

```bash
npx contribs.sh init      # sources.json for your gh login
npx contribs.sh banner    # → contribs-x.png
```

| GitHub shows | contribs.sh shows |
| --- | --- |
| ![One account only](assets/before.png) | ![Personal and work accounts merged](assets/after.png) |

Years that live on another platform can be recovered from local repos (`contribs.sh scan`) or marked
as lost history, and show up on the all-years poster:

<p align="center"><img src="assets/poster.png" width="420" alt="All-years poster with recovered and lost history"></p>

<sub>Images are generated from synthetic data by `npm run demo`.</sub>

## The dashboard

A browser dashboard for your contribution history, merged across **multiple sources** —
github.com accounts, GitHub Enterprise, and Forgejo/Gitea instances (e.g. Codeberg) — rendered
with [`@json-render/react`](https://json-render.dev). It distinguishes genuine zero-activity days
from days where no source has data (lost / pre-migration history), which render as a distinct
hatched "no data" cell, and lets you annotate periods your work lived on another platform.

## Make it your own

Everything personal (which accounts to fetch, your lost/incomplete periods, tokens, generated data)
is gitignored — the repo ships `.example` templates, so a fresh clone builds with neutral defaults.
To run your own version:

```bash
git clone <your-fork-url> && cd contribs.sh
npm install

cp sources.example.json sources.json        # edit: your accounts (see "Configuring sources")
cp lost-ranges.example.json lost-ranges.json # optional: periods on other platforms / lost history

npm run fetch                                # pulls your data → public/data/contributions.json
npm run dev                                  # open the printed localhost URL
```

**Prerequisites:** Node 18+ and either the [`gh` CLI](https://cli.github.com/) authenticated with your
github.com account(s), or Personal Access Tokens for any source not in `gh` (see Tokens below).

## Configuring sources

`sources.json` (gitignored) lists the accounts to merge. Built-in forges:

| `type`      | covers                                         | how it counts                                   | token (`tokenEnv`)                          |
| ----------- | ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| `github`    | github.com, GitHub Enterprise Cloud and Server | GitHub's own contribution calendar              | none via `gh`, else PAT `repo` + `read:org` |
| `gitlab`    | gitlab.com, self-managed GitLab                | your events (pushes count their commits)        | PAT `read_api`                              |
| `bitbucket` | Bitbucket Cloud                                | your commits in repos you're a member of        | API token / app password, `read:repository` |
| `azure`     | Azure DevOps (Azure Repos)                     | commits whose author email is in `emails`       | PAT, Code (Read)                            |
| `forgejo`, `gitea` | Codeberg, Forgejo, Gitea                | the instance's heatmap                          | access token `read:user`                    |
| `local`     | git repos on disk (`contribs.sh scan`)         | your commits by author email                    | none                                        |
| `json`      | anything else                                  | a URL or file returning `{ "YYYY-MM-DD": n }`   | optional, sent as `Bearer`                  |

Fields:

| field      | meaning                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `id`       | unique slug (used for the per-source file name)                         |
| `label`    | display name in the UI                                                  |
| `type`     | one of the types above                                                  |
| `host`     | defaults to `github.com`, `gitlab.com`, `bitbucket.org`, `codeberg.org`; Azure uses `dev.azure.com/<org>` |
| `username` | the account's login (Bitbucket: username or Atlassian email; not needed for Azure) |
| `emails`   | author emails that count as you (`azure`, `local`; extra matches for `bitbucket`) |
| `tokenEnv` | name of the env var holding the token; **omit** for a github.com account managed by the `gh` CLI |
| `from`, `to` | optional `YYYY-MM-DD` window. Use it when a repo was mirrored between forges so the same work isn't counted twice (e.g. count GitLab only up to the day you moved to GitHub). |
| `url`      | `json` only: `https://…` or a file path                                 |
| `enabled`  | set `false` to keep an entry without fetching it                        |

```json
{ "id": "gl", "label": "GitLab", "type": "gitlab", "username": "you", "tokenEnv": "GITLAB_TOKEN", "to": "2021-06-30" }
```

**Tokens** are read from env vars named by `tokenEnv`, loaded from a gitignored `.env` (see
`.env.example`). github.com accounts in your `gh` keyring need none. Sources whose token can't be
resolved are skipped with a warning, so the dashboard always builds with whatever is available.

**Another forge?** Use a `json` source today, or
[request it](https://github.com/contribs-sh/contribs/issues/new?template=forge-request.yml).

## How it works

- **`src/fetch/`** — `npm run fetch` reads `sources.json`, runs one adapter per source
  (`adapters/github.ts` = GraphQL `contributionsCollection`; `adapters/forgejo.ts` = the
  `/api/v1/users/{user}/heatmap` REST endpoint), then `merge.ts` sums per-day counts and unions
  coverage windows into `public/data/contributions.json` (per-source files land in
  `public/data/sources/`).
- **`src/`** — the React app loads that JSON, exposes it via `contributionsContext`, and renders a
  layout described by `dashboard.json` against the json-render catalog/registry in `catalog.tsx`.
  Components (`YearHeatmap`, `StatsPanel`, `YearSelector`, `SourceLegend`) read the data from context.

A day is **known** when at least one source's coverage window includes it; unknown days carry count 0
and are excluded from the average so lost history never distorts the numbers.
Coverage ends no later than the UTC fetch date. The full current-year grid remains visible:
dates after today use a subdued outline and a "Future date" tooltip, contribute to no stats,
and cannot receive lost-history annotations. Elapsed dates after the last fetch are "No data"
until a refresh covers them. Future-date styling advances with the UTC date while the app is open.

## Marking history lost to a migration

Some real history (e.g. a Bitbucket → GitHub migration) no longer exists on any source. You can mark
those days so they render in a distinct **gray "lost"** style with a hover note, instead of looking
like zero-activity days. Edit the committed **`lost-ranges.json`**:

```json
{
  "enabled": true,
  "label": "Contribs lost due to Bitbucket migration",
  "ranges": [
    {
      "id": "bitbucket-era",
      "from": "2016-01-01",
      "to": "2020-12-31",
      "days": "weekdays",
      "weekdays": [1, 2, 3, 4, 5],
      "note": "Contribs lost due to Bitbucket migration",
      "enabled": true
    }
  ]
}
```

- `from` / `to` — inclusive ISO date range to mark.
- `days` — `"weekdays"` (Mon–Fri), `"all"` (include weekends), or `"selective"` (use the `weekdays`
  list; `0`=Sun … `6`=Sat).
- `note` — optional hover text for this range; falls back to the top-level `label`.
- `label` — optional short name shown in the legend; falls back to `id`.
- `color` — optional cell color for this range's lost days (any CSS color); falls back to a neutral
  gray. Use distinct colors to tell ranges apart at a glance.
- Only **0-contribution** days in the range are colored — days that already have contributions stay
  green. Each active range gets its own swatch in the legend.

**Toggle:** the legend has a **"Lost / incomplete"** checkbox that shows/hides the overlay live (your
choice is remembered in the browser). While it's on, each lost day counts as **1** toward **Total
contributions**, **Active days**, and **Avg / active day**. Turning it off reverts both the heatmap
and the stats to fetched activity only.

contribs.sh deliberately shows no streaks: they reward never taking a day off.

**To remove a range entirely:** set its `"enabled": false` (or delete the entry), or flip the
top-level `"enabled": false`. Config changes apply on reload — no re-fetch.

`lost-ranges.example.json` ships a single **disabled** example range; copy it to `lost-ranges.json`,
set your real window(s), and `"enabled": true`. If `lost-ranges.json` is absent the app falls back to
the example, so the build never breaks.

## Display settings

`config.json` (committed — not personal) holds display preferences:

| field         | meaning                                                                      |
| ------------- | ---------------------------------------------------------------------------- |
| `title`       | Site name — shown as the page heading and the browser tab title.             |
| `recentYears` | In the "All years" view, how many recent years to show before the **"Show earlier years"** toggle (default `10`). Older years fade in when you expand them. |
| `startYear` | Earliest year to display (currently `2007`). Takes effect on the next fetch; years without source coverage show "No data" and do not change contribution totals. Earlier source history is still retained. |

The year filter at the top is a dropdown — jump straight to any year (including older, collapsed ones)
or back to the all-years overview.

The sticky legend's service buttons filter the heatmaps, tooltips, year totals, and stats.
GitHub controls fetched activity from every GitHub source plus any lost range labelled `GitHub`;
each other lost range (in `lost-ranges.json` order) gets its own button that toggles its
annotations. The gray Lost / Incomplete checkbox controls all annotations without hiding real
activity. Selections persist in the browser; No Data and Less–More are informational.

## Scripts

| script          | does                                            |
| --------------- | ----------------------------------------------- |
| `npm run fetch` | fetch + merge all sources → `public/data/`      |
| `npm run dev`   | Vite dev server                                 |
| `npm run build` | type-check (app + node) and production build    |
| `npm run preview` | preview the production build                   |
| `npm run banner -- ...` | render banner / card / Wrapped / poster images |
| `npm run cli -- ...` | the `contribs-sh` CLI (`init`, `fetch`, `banner`, `scan`) |

## Recovering history from local repos

Commits that never reached a hosted forge (an old employer's GitLab, an SVN repo you converted with
`git svn`, a Bitbucket repo you still have cloned) can be counted straight from disk:

```bash
npm run cli -- scan ~/code/old-work --email you@old-employer.example
```

`scan` lists commits per year and prints a `"type": "local"` source to paste into `sources.json`.
Commits are de-duplicated by hash across repos. Anything you also pushed to GitHub is already in your
GitHub graph, so set `from`/`to` to the period GitHub is missing. Recovered days are real data, so
they replace the hand-drawn `lost-ranges.json` annotation for that period.

## Exporting images

The dashboard has an **Export image** panel. It renders the same SVG the CLI uses and downloads it
as PNG or SVG:

| preset     | size         | layout                                         |
| ---------- | ------------ | ---------------------------------------------- |
| `x`        | 1500×500     | banner; content kept right of the profile photo |
| `linkedin` | 1584×396     | banner                                         |
| `og`       | 1200×630     | card                                           |
| `github`   | 1280×640     | card (repo social preview)                     |
| `wrapped`  | 1080×1350    | year-in-review story with stats                |
| `poster`   | 5400×7200    | every year, 18×24 in at 300 dpi                |

From the command line (renders with `resvg`, no browser):

```bash
npm run banner -- --preset x                         # contribs-x.png
npm run banner -- --preset wrapped --range 2026 --title "2026 in code"
npm run banner -- --preset poster --theme light --out poster.png
npm run banner -- --preset all --out banners/        # every preset, PNG + SVG
```

Options: `--range rolling|all|YEAR`, `--theme dark|light`, `--title`, `--scale`, `--no-stats`,
`--no-mark`, `--transparent`. Lost ranges from `lost-ranges.json` are drawn in their colors.

## CLI

Install with `npx contribs.sh <command>` (or `npm i -g contribs.sh`; the binary is `contribs.sh`, with `contribs-sh` as an alias). Inside a clone, `npm run cli --` runs the same thing:

```bash
contribs.sh init [--ci]      # sources.json for your gh login; --ci adds the Pages workflow
contribs.sh fetch            # same as npm run fetch
contribs.sh banner [...]     # see above
contribs.sh scan DIR...      # see "Recovering history from local repos"
contribs.sh public [DIR]     # make a built site safe to publish (anonymized labels)
contribs.sh feed [--out DIR] # your own data feed: index.json, index.md, per-year .md, graph.svg
contribs.sh review           # Markdown work summary for a review or brag doc
contribs.sh wrapped [YEAR]   # year-in-review card
```

## Review summaries

`contribs.sh review` prints a Markdown summary for a performance review or brag doc: totals, busiest
day and month-by-month activity for a window, plus the pull/merge requests you merged on GitHub and
GitLab, with blank Impact / Collaboration / Growth prompts to fill in.

```bash
contribs.sh review --from 2026-05-01 --to 2026-10-31 --out review.md
contribs.sh review --no-prs        # counts only
```

**Only public work is named.** A PR's repo, title and link appear only when the repo is public on
github.com or gitlab.com. PRs in private or internal repos, and anything on GitHub Enterprise or a
self-hosted forge, are reduced to a count per month, so employer repo names and PR titles never end
up in the output. Account labels are left out too, since they can name an employer. It runs entirely
on your machine and sends nothing anywhere.

## Wrapped

`contribs.sh wrapped 2026` renders a 1080×1350 year-in-review card (contributions, active days,
average per active day, busiest day, and the year's grid) across every source. The dashboard's
Export panel has the same preset.

## 3D view

The dashboard's **3D view** button renders the selected year as an interactive skyline: drag to
orbit, scroll to zoom. Columns rise week by week once when it opens; with reduced motion enabled
it appears finished and doesn't auto-rotate. three.js loads only when you open it.

## In-browser setup

When the site has no built `data/contributions.json` (the hosted contribs.sh, or any static deploy
without one), it opens a setup screen instead of the dashboard:

- **Accounts:** add GitHub (incl. Enterprise), GitLab, Bitbucket Cloud or Codeberg/Forgejo/Gitea.
  **Test connection** fetches once and shows the total before you save. The browser calls each
  forge's API directly (they allow cross-site requests); Azure DevOps doesn't, so it's CLI-only, as are
  self-hosted forges behind a VPN.
- **Import data file:** a `{ "YYYY-MM-DD": count }` file, or a per-source file from the CLI
  (`public/data/sources/*.json`), e.g. history recovered with `contribs.sh scan`.
- **History that isn't on any forge:** the same lost ranges as `lost-ranges.json`, as a form.
- **Your setup file:** download or load your sources and lost history (also accepts a CLI
  `sources.json` or `lost-ranges.json`). Tokens are never included.

Storage is `localStorage` in that browser only. Tokens default to session memory; ticking "Remember
on this device" keeps them in `localStorage`, readable by anything running on the page, so the site
loads no third-party scripts. A self-hosted build with a `data/contributions.json` skips setup
entirely and shows that data, as before.

## Using it with a work account

contribs.sh keeps **one number per day** for each account. Never your code, commit messages, repo
names or PR titles.

- **Tokens stay with you.** In the browser, the token goes straight to your forge and is forgotten
  when you close the tab (unless you tick "Remember on this device"). With the CLI, it stays on
  your machine. contribs.sh has no server.
- **Use a read-only token** with the smallest scope listed for your forge.
- **`review` keeps work private.** PRs in private, internal or self-hosted repos appear only as
  monthly counts, without names, titles or links.
- **Self-hosting publishes counts, not names.** The GitHub Pages workflow runs `contribs.sh public`,
  which renames accounts to "Source 1, 2, …" and drops per-account files before deploying. Lost-range
  ids never reach the page; their labels and notes do, so keep those generic.
- **Bitbucket** has no "my commits only" API, so contribs.sh reads all commits in your repos to find
  yours. Other people's commits are discarded immediately and never saved.
- **Check your employer's policy** before using a work token with any third-party tool. Some don't
  allow it, even read-only.

## Your own data feed

`contribs.sh feed` writes a small, agent-readable site about your history, in the spirit of public
data pages like opencode.ai/data, but for one developer:

| file | what |
| --- | --- |
| `index.json` | daily counts per year, active days, busiest day, monthly totals |
| `index.md` | summary table, sources, methodology, citation line |
| `YYYY.md` | one page per year |
| `graph.svg` | merged heatmap for a README or site |

Only counts are published: no repository names, titles, hosts or usernames, and account labels
become "Source 1, 2, …" unless you pass `--labels`.

To publish it automatically, create an empty repo, then:

```bash
npx contribs.sh init --feed     # writes sources.json and .github/workflows/contribs-feed.yml
```

Add `CONTRIBS_SOURCES` (your `sources.json`, every source with a `tokenEnv`) and one secret per token,
set Pages to "GitHub Actions", and it rebuilds daily at `https://<you>.github.io/<repo>/`.

## Self-hosting with GitHub Actions

`.github/workflows/contribs.yml` refreshes the data daily, builds the dashboard, renders every banner
preset, and publishes to GitHub Pages. It does nothing until configured, so forks are safe:

1. Repo → Settings → Secrets → Actions: add `CONTRIBS_SOURCES` (your `sources.json`, with a
   `tokenEnv` on every source), one secret per `tokenEnv` (e.g. `GH_MAIN_TOKEN`, a classic PAT with
   `read:user`, `repo`, `read:org`), and optionally `CONTRIBS_LOST_RANGES`.
2. Settings → Pages → Source: **GitHub Actions**.
3. Run the workflow once from the Actions tab.

Before deploying, the workflow runs `contribs.sh public dist`: account labels become "Source 1, 2, …"
and per-account data files are removed, so the public site shows merged daily counts only.

Your banners are then at `https://<you>.github.io/<repo>/banners/x.png` (and `.svg`), ready to embed in
a README or site. Add extra token secrets to the `env:` block of the "Fetch, build, render banners" step.

## Deploying

The app is a static site — the only runtime input is `public/data/contributions.json`, produced by
`npm run fetch`. To publish:

**The hosted contribs.sh** is the same app built without any data file, so every visitor gets the
in-browser setup: `npm run build:site` (removes `dist/data`), output `dist/`, with security headers
from `public/_headers`. Cloudflare Pages settings: build command `npm run build:site`, output `dist`.

```bash
npm run fetch     # refresh your data (needs gh/tokens; do this wherever you build)
npm run build     # outputs dist/
# deploy dist/ to GitHub Pages, Vercel, Netlify, Cloudflare Pages, etc.
```

Because `sources.json`, `lost-ranges.json`, and `public/data/` are gitignored, the simplest path is to
**fetch + build + deploy from your own machine**. To deploy from CI instead, provide those files to the
CI job (e.g. commit a token-free `lost-ranges.json`, recreate `sources.json` from a secret, and run
`gh auth login` / set token env vars) before `npm run fetch`. Re-run `fetch` on a schedule to keep the
graph current.
