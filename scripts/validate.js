#!/usr/bin/env node
// scripts/validate.js
//
// Checks every file in /data against a minimal required-fields shape before
// build.js runs. The point: a single typo (missing comma, unescaped quote,
// a dropped field) should fail here with a specific, readable message —
// "writing.json: entry 'feral-inquiries' is missing required field 'date'"
// — instead of crashing deep inside the build or, worse, silently shipping
// a broken page. Run this in CI before every build (see .github/workflows/build.yml)
// and locally before every commit (`npm run validate`).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Section files: top-level array of entries, each needing these fields.
const LIST_SCHEMAS = {
  'writing.json': ['slug', 'title', 'date', 'tags', 'excerpt', 'body', 'published'],
  'programs.json': ['slug', 'title', 'dates', 'status', 'description', 'published'],
  'strategy.json': ['slug', 'title', 'client', 'dates', 'description', 'published'],
  'cultural-production.json': ['slug', 'title', 'dates', 'venue', 'type', 'description', 'published'],
};

// Global files: a single top-level object needing these keys.
const OBJECT_SCHEMAS = {
  'site.json': ['nav', 'social', 'home'],
  'cv.json': ['bio', 'education', 'roles', 'experience', 'residencies', 'recognition', 'speaking', 'publications'],
};

let errors = 0;

function fail(file, message) {
  console.error(`✗ ${file}: ${message}`);
  errors++;
}

function loadJSON(file) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    fail(file, 'file not found');
    return null;
  }
  const raw = fs.readFileSync(full, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    // This is the failure mode this script exists to catch: a malformed
    // JSON file. Without validate.js, this same error surfaces deep inside
    // build.js with a much less useful stack trace.
    fail(file, `invalid JSON — ${e.message}`);
    return null;
  }
}

for (const [file, fields] of Object.entries(LIST_SCHEMAS)) {
  const data = loadJSON(file);
  if (data === null) continue;
  if (!Array.isArray(data)) {
    fail(file, 'expected a top-level array of entries');
    continue;
  }
  const seenSlugs = new Set();
  data.forEach((entry, i) => {
    const label = entry && entry.slug ? entry.slug : `entry #${i}`;
    fields.forEach((f) => {
      if (!entry || !(f in entry)) fail(file, `"${label}" is missing required field "${f}"`);
    });
    if (entry && entry.slug) {
      if (seenSlugs.has(entry.slug)) fail(file, `duplicate slug "${entry.slug}"`);
      seenSlugs.add(entry.slug);
    }
    if (entry && 'published' in entry && typeof entry.published !== 'boolean') {
      fail(file, `"${label}": "published" must be true or false, not ${JSON.stringify(entry.published)}`);
    }
  });
}

for (const [file, keys] of Object.entries(OBJECT_SCHEMAS)) {
  const data = loadJSON(file);
  if (data === null) continue;
  if (Array.isArray(data) || typeof data !== 'object') {
    fail(file, 'expected a top-level object, not an array or primitive');
    continue;
  }
  keys.forEach((k) => {
    if (!(k in data)) fail(file, `missing top-level key "${k}"`);
  });
}

if (errors > 0) {
  console.error(`\n${errors} problem(s) found — fix these before building.`);
  process.exit(1);
} else {
  console.log('✓ all data files valid');
}
