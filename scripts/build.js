#!/usr/bin/env node
// scripts/build.js
//
// Reads /data/*.json + /templates/*.html and writes a static site into
// /dist — one real HTML file per published entry, plus a card-index page
// per section, the homepage, and the CV page. Entries marked
// `"published": false` are skipped entirely, so a draft can sit in the
// repo without going live.
//
// Run `npm run validate` first — this script assumes the data already
// passed that check and does not re-validate shapes itself.

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const TEMPLATES = path.join(ROOT, 'templates');
const OUT = path.join(ROOT, 'dist');

function readJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATES, name), 'utf8');
}

// Minimal {{TOKEN}} substitution — intentionally not a templating engine.
function fill(template, values) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => (key in values && values[key] != null ? values[key] : ''));
}

function writeFile(relPath, content) {
  const full = path.join(OUT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  console.log('  wrote', relPath);
}

function copyStatic() {
  // Wipe dist/ first so a build never leaves behind a stale page from an
  // entry that's since been unpublished or renamed. Some restricted
  // environments (e.g. a sandboxed file bridge) refuse to delete files
  // that already exist there even with `force: true` — rather than crash
  // the whole build over that, warn and fall back to overwriting in place.
  // Every real target (CI, a normal terminal) has full permission here and
  // gets the clean wipe as before.
  try {
    fs.rmSync(OUT, { recursive: true, force: true });
  } catch (err) {
    console.warn(
      `  ! couldn't fully clear ${path.relative(ROOT, OUT)} (${err.code || err.message}) — ` +
        `continuing without wiping it first. A stale page from a since-unpublished entry ` +
        `may linger; safe to ignore unless that matters right now.`
    );
  }
  fs.mkdirSync(OUT, { recursive: true });
  ['css', 'assets'].forEach((dir) => {
    const src = path.join(ROOT, dir);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(OUT, dir), { recursive: true, force: true });
  });
  ['.nojekyll', 'CNAME'].forEach((file) => {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, file));
  });
}

const site = readJSON('site.json');
const cv = readJSON('cv.json');

const SECTIONS = [
  { file: 'writing.json', dir: 'writing', label: 'Writing' },
  { file: 'programs.json', dir: 'programs', label: 'Programs' },
  { file: 'strategy.json', dir: 'strategy', label: 'Strategy' },
  { file: 'cultural-production.json', dir: 'cultural-production', label: 'Cultural Production' },
];

const shell = readTemplate('page.html');
const entryTemplate = readTemplate('entry.html');
const indexTemplate = readTemplate('index.html');

function renderShell(title, description, bodyHtml) {
  return fill(shell, {
    TITLE: title,
    DESCRIPTION: description || '',
    NAV: site.nav.map((n) => `<a href="${n.href}">${n.label}</a>`).join('\n      '),
    FOOTER_SOCIAL: site.social.map((s) => `<a href="${s.href}">${s.label}</a>`).join(' · '),
    CONTACT_EMAIL: site.contactEmail || '',
    BODY: bodyHtml,
  });
}

// --- Pass 1: load every section and figure out which entries will actually
// get a page, before writing anything. This lets entry pages link to each
// other by slug (see `relatedSlugs`) instead of just printing a bare slug.
const sectionData = SECTIONS.map(({ file, dir, label }) => {
  const all = readJSON(file);
  const entries = all.filter((e) => e.published);
  return { file, dir, label, all, entries };
});

const slugIndex = new Map(); // slug -> { title, url } — published entries only, safe to link to.
sectionData.forEach(({ dir, entries }) => {
  entries.forEach((e) => {
    slugIndex.set(e.slug, { title: e.title, url: `/${dir}/${e.slug}.html` });
  });
});

// Every entry regardless of published state, so the CV's Projects/Residencies
// lists (and relatedSlugs) can still show a real title + role for a draft
// entry — just without a working link until it's published.
const allIndex = new Map(); // slug -> { title, role, url, published, dir, label }
sectionData.forEach(({ dir, label, all }) => {
  all.forEach((e) => {
    allIndex.set(e.slug, {
      title: e.title,
      role: Array.isArray(e.role) ? e.role.join(', ') : e.role,
      url: `/${dir}/${e.slug}.html`,
      published: !!e.published,
      dir,
      label,
    });
  });
});

// Looks up a slug against every entry (draft or live). Returns undefined if
// the slug doesn't match anything — callers fall back to printing the raw
// slug in that case, which is a visible signal that a reference is stale.
function resolveSlug(slug) {
  return allIndex.get(slug);
}

// Renders every optional structured field an entry might carry
// (role, status, venue, type, collaborators, credits, editions,
// upcomingEvents, links, images, relatedSlugs) beyond the free-text
// body/description — so content that's populated in data/*.json actually
// shows up on the page instead of only being used in the card excerpt.
function extraMeta(entry) {
  const parts = [];

  // subtitle/DATE already shows entry.subtitle || entry.client || entry.venue —
  // don't repeat whichever of those got used there.
  const subtitleField = entry.subtitle ? 'subtitle' : entry.client ? 'client' : entry.venue ? 'venue' : null;

  const role = Array.isArray(entry.role) ? entry.role.join(', ') : entry.role;
  if (role) parts.push(`<p class="meta"><strong>Role:</strong> ${role}</p>`);

  if (entry.status) parts.push(`<p class="meta"><strong>Status:</strong> ${entry.status}</p>`);
  if (entry.client && subtitleField !== 'client') parts.push(`<p class="meta"><strong>Client:</strong> ${entry.client}</p>`);
  if (entry.venue && subtitleField !== 'venue') parts.push(`<p class="meta"><strong>Venue:</strong> ${entry.venue}</p>`);
  if (entry.type) parts.push(`<p class="meta"><strong>Type:</strong> ${entry.type}</p>`);

  if (entry.collaborators && entry.collaborators.length) {
    parts.push(`<p class="meta"><strong>Collaborators:</strong> ${entry.collaborators.join(', ')}</p>`);
  }
  if (entry.credits) parts.push(`<p class="meta"><strong>Credits:</strong> ${entry.credits}</p>`);

  if (entry.editions && entry.editions.length) {
    parts.push(
      `<div class="editions"><strong>Editions</strong><ul>${entry.editions
        .map((e) => `<li>${e}</li>`)
        .join('')}</ul></div>`
    );
  }

  if (entry.upcomingEvents && entry.upcomingEvents.length) {
    parts.push(
      `<div class="upcoming"><strong>Upcoming</strong><ul>${entry.upcomingEvents
        .map((ev) => {
          const label = ev.href ? `<a href="${ev.href}">${ev.label}</a>` : ev.label;
          return `<li>${ev.date ? `${ev.date} — ` : ''}${label}</li>`;
        })
        .join('')}</ul></div>`
    );
  }

  if (entry.links && entry.links.length) {
    parts.push(
      `<div class="links"><strong>Links</strong><ul>${entry.links
        .map((l) => `<li><a href="${l.href}">${l.label}</a></li>`)
        .join('')}</ul></div>`
    );
  }

  // `embed` (e.g. Cultural Technologies Lab's LUMA snippet) is `null` in every
  // entry today — Luisa hasn't supplied markup yet — so this is currently a
  // no-op, but wiring it in now means a future embed code just works without
  // another build.js change.
  if (entry.embed) parts.push(`<div class="embed">${entry.embed}</div>`);

  if (entry.relatedSlugs && entry.relatedSlugs.length) {
    parts.push(
      `<p class="meta"><strong>Related:</strong> ${entry.relatedSlugs
        .map((slug) => {
          const found = resolveSlug(slug);
          if (!found) return slug;
          return found.published ? `<a href="${found.url}">${found.title}</a>` : found.title;
        })
        .join(', ')}</p>`
    );
  }

  if (entry.images && entry.images.length) {
    parts.push(`<div class="images">${entry.images.map((src) => `<img src="${src}" alt="">`).join('')}</div>`);
  }

  return parts.join('\n');
}

console.log('Building luisaji.com →', OUT);
copyStatic();

sectionData.forEach(({ file, dir, label, all, entries }) => {
  const skipped = all.length - entries.length;
  if (skipped > 0) console.log(`  (${file}: skipping ${skipped} unpublished entr${skipped === 1 ? 'y' : 'ies'})`);

  entries.forEach((entry) => {
    const bodyMd = entry.body || entry.description || '';
    const bodyHtml = marked.parse(bodyMd);
    const entryHtml = fill(entryTemplate, {
      TITLE: entry.title,
      SUBTITLE: entry.subtitle || entry.client || entry.venue || '',
      DATE: entry.date || entry.dates || '',
      TAGS: (entry.tags || []).join(', '),
      BODY: bodyHtml,
      META_EXTRA: extraMeta(entry),
    });
    const page = renderShell(entry.title, entry.excerpt || entry.description, entryHtml);
    writeFile(`${dir}/${entry.slug}.html`, page);
  });

  const cards = entries
    .map(
      (e) => `      <article class="card">
        <h3><a href="/${dir}/${e.slug}.html">${e.title}</a></h3>
        <p class="meta">${e.date || e.dates || ''}</p>
        <p>${e.excerpt || e.description || ''}</p>
      </article>`
    )
    .join('\n');
  const indexHtml = fill(indexTemplate, { LABEL: label, CARDS: cards || '<p>Nothing published yet.</p>' });
  const page = renderShell(label, `${label} — Luisa Ji`, indexHtml);
  writeFile(`${dir}/index.html`, page);
});

// CV page
const list = (items) => `<ul>${(items || []).map((i) => `<li>${i}</li>`).join('')}</ul>`;

// `speaking` entries may be plain strings or {venue, title, detail, href} objects —
// support both so older/simpler data still renders.
const speakingList = () =>
  `<ul>${(cv.speaking || [])
    .map((s) => {
      if (typeof s === 'string') return `<li>${s}</li>`;
      const parts = [`<strong>${s.venue}</strong>`];
      if (s.title) parts.push(`— “${s.title}”`);
      if (s.detail) parts.push(`(${s.detail})`);
      let line = parts.join(' ');
      if (s.href) line += ` — <a href="${s.href}">link</a>`;
      return `<li>${line}</li>`;
    })
    .join('')}</ul>`;

// `projects` is a chronological index of slug references into
// Programs/Strategy/Cultural Production (by year of initiation, newest
// first) — not duplicated text, so the title/role/link always match
// whatever's actually in that section's own data file. An entry still in
// draft (`published: false`) shows as plain text since there's no live page
// to link to yet.
const projectsList = () =>
  `<ul>${(cv.projects || [])
    .map((p) => {
      const found = resolveSlug(p.slug);
      if (!found) return `<li>${p.year} | ${p.slug} (unresolved slug)</li>`;
      const label = found.role ? `${found.title} — ${found.role}` : found.title;
      const text = found.published ? `<a href="${found.url}">${label}</a>` : label;
      return `<li>${p.year} | ${text}</li>`;
    })
    .join('')}</ul>`;

// `residencies` entries may be plain strings (legacy) or
// {date, entry, location, slug?} objects — the optional `slug` cross-links
// to the Programs/Strategy/Cultural Production entry the residency belongs
// to (e.g. When Spiders Spin Dusk), same draft/live rule as projectsList.
const residenciesList = () =>
  `<ul>${(cv.residencies || [])
    .map((r) => {
      if (typeof r === 'string') return `<li>${r}</li>`;
      const found = r.slug ? resolveSlug(r.slug) : null;
      const entryText = found
        ? found.published
          ? `<a href="${found.url}">${r.entry}</a>`
          : r.entry
        : r.entry;
      return `<li>${r.date} | ${entryText}, ${r.location}</li>`;
    })
    .join('')}</ul>`;

const cvHtml = `
  <h1>CV</h1>
  <section>${marked.parse(cv.bio || '')}</section>
  <h2>Education</h2>${list(cv.education)}
  <h2>Roles</h2>${list(cv.roles)}
  <h2>Projects</h2>${projectsList()}
  <h2>Residencies</h2>${residenciesList()}
  <h2>Recognition</h2>${list(cv.recognition)}
  <h2>Speaking</h2>${speakingList()}
  <h2>Publications</h2>${list(cv.publications)}
  <h2>Experience</h2>${list(cv.experience)}
`;
writeFile('cv.html', renderShell('CV', 'Luisa Ji — CV', cvHtml));

// Homepage
const homeHtml = `
  <h1>${site.home.headline}</h1>
  <div>${marked.parse(site.home.intro || '')}</div>
`;
writeFile('index.html', renderShell('Luisa Ji', site.home.intro, homeHtml));

console.log('\nBuild complete →', OUT);
