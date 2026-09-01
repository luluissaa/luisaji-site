# luisaji.com — starter scaffold

A working starting point for the migration, matching `migration-requirements.md` §6/§10. It builds, but every piece of real copy is still marked `REPLACE ME` — this is a skeleton to fill in and refine, not a finished site.

## Quickstart

```
npm install
npm run validate   # checks data/*.json against the expected shape
npm run build      # generates the site into dist/
npm run preview     # validate + build + serve dist/ locally at a printed URL
```

Open the printed `localhost` URL (or open `dist/index.html` directly) to see the current state of the site.

## How it fits together

- `data/*.json` — all page content. This is what changes on a routine content update; nothing else usually needs to change alongside it.
- `templates/*.html` — three shared templates (page shell, one entry, one section index). `scripts/build.js` fills `{{TOKEN}}` placeholders in these with values from `data/`.
- `scripts/validate.js` — checks every `data/*.json` file has the fields it needs before building. Run automatically in CI; run it yourself before committing.
- `scripts/build.js` — turns `data/` + `templates/` into static HTML in `dist/`. `dist/` is git-ignored — it's a build output, not something to hand-edit or commit.
- `css/style.css` — one shared stylesheet.
- `.github/workflows/build.yml` — runs `validate` then `build` on every push to `main` and on every pull request; deploys `dist/` to GitHub Pages on pushes to `main` only.

## Adding or editing content

1. Edit the relevant file in `data/` (e.g., add an object to `writing.json` for a new essay).
2. Leave `"published": false` until it's ready to go live.
3. Run `npm run validate` — fix anything it flags.
4. Run `npm run preview` and check it in the browser.
5. Flip `"published"` to `true` when it's ready.
6. Commit and push (or open a pull request first — the workflow runs validate + build on PRs too, so a broken edit gets caught before it merges).

## Known gaps in this starter (intentional — next steps, not bugs)

- Every `description`, `body`, and bio field is placeholder text marked `REPLACE ME`. See `migration-workplan.md` Track 1 for what needs drafting where.
- No image optimization step yet (`migration-requirements.md` §8) — add a one-time `sharp`-based script once real images arrive from Luisa.
- No per-page canonical URL / Open Graph URL yet — `templates/page.html` has the title/description tags but not a `url`; worth adding once the domain is live.
- No lazy-loaded LUMA embed yet on the Cultural Technologies Lab entry — its `embed` field in `programs.json` is `null` until Luisa supplies the snippet.
- Redirect stubs for old Squarespace URLs (`migration-requirements.md` §9) aren't in this scaffold yet — add them once the URL-mapping is final.
- Styling is intentionally minimal — `css/style.css` is a starting point, not a design pass.

## Deploying

1. Push this repo to GitHub.
2. In the repo's **Settings → Pages**, set Source to **GitHub Actions**.
3. Push to `main` — the workflow in `.github/workflows/build.yml` builds and deploys automatically. Check the **Actions** tab for the run.
4. The site is live at `https://<username>.github.io/<repo>/` until the custom domain (`CNAME`, already in this repo) is verified in DNS — see `migration-checklist.md` Phase 7 for the domain cutover steps.
