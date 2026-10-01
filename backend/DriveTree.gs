// DriveTree.gs — find-or-create folders and spreadsheets by exact name, safely.
//
// Lookups are cached in CacheService and validated on use. When a name is missing on a
// write path, creation happens under the script lock with a second lookup first, so two
// concurrent requests cannot both create it. Read paths never create.

const LOCK_STATE = { depth: 0 }; // per-execution; lets locked code call locked code

/** Run fn under the script lock, waiting up to waitMs (default 30 s). Re-entrant within one execution. */
function withScriptLock(fn, waitMs) {
  if (LOCK_STATE.depth > 0) return fn();
  const lock = LockService.getScriptLock();
  lock.waitLock(waitMs || 30000);
  LOCK_STATE.depth += 1;
  try {
    return fn();
  } finally {
    LOCK_STATE.depth -= 1;
    lock.releaseLock();
  }
}

/**
 * Resolve an id: cache (validated) → lookup → create under the lock after a second lookup.
 * opts: { cacheKey, ttlSec?, validate(id) → bool, lookup() → id|null, create?() → id }
 * Returns the id, or null when nothing exists and no `create` was given.
 */
function cachedResolve(opts) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(opts.cacheKey);
  if (cached) {
    let ok = false;
    try { ok = opts.validate(cached); } catch (e) { ok = false; }
    if (ok) return cached;
    cache.remove(opts.cacheKey);
  }
  let id = opts.lookup();
  if (!id && opts.create) {
    id = withScriptLock(() => opts.lookup() || opts.create());
  }
  if (id) cache.put(opts.cacheKey, id, opts.ttlSec || 21600);
  return id || null;
}

/** First live item in a Drive iterator with exactly this name (and passing `keep`); the oldest wins if several. */
function firstNamed(iterator, name, keep) {
  const matches = [];
  while (iterator.hasNext()) {
    const item = iterator.next();
    if (item.getName() === name && !item.isTrashed() && (!keep || keep(item))) matches.push(item);
  }
  if (matches.length > 1) {
    matches.sort((a, b) => a.getDateCreated() - b.getDateCreated());
    Logger.log(`[DriveTree] DUPLICATE: ${matches.length} items named "${name}"; using the oldest (${matches[0].getId()})`);
  }
  return matches[0] || null;
}

function childFolderId(parent, name, create) {
  return cachedResolve({
    cacheKey: 'folder:' + parent.getId() + ':' + name,
    validate: id => {
      const f = DriveApp.getFolderById(id);
      return !f.isTrashed() && f.getName() === name;
    },
    lookup: () => {
      const f = firstNamed(parent.getFoldersByName(name), name);
      return f ? f.getId() : null;
    },
    create: create ? () => {
      const f = parent.createFolder(name);
      Logger.log(`[DriveTree] Created folder "${name}" in ${parent.getId()}`);
      return f.getId();
    } : null
  });
}

/** The child folder named `name` under `parent`, or null. Never creates. */
function findChildFolder(parent, name) {
  const id = childFolderId(parent, name, false);
  return id ? DriveApp.getFolderById(id) : null;
}

/** The child folder named `name` under `parent`, created under the lock if missing. */
function resolveChildFolder(parent, name) {
  return DriveApp.getFolderById(childFolderId(parent, name, true));
}

function childSpreadsheetId(parent, name, initFn, create) {
  const isSheet = f => f.getMimeType() === MimeType.GOOGLE_SHEETS;
  return cachedResolve({
    cacheKey: 'sheet:' + parent.getId() + ':' + name,
    validate: id => {
      const f = DriveApp.getFileById(id);
      return !f.isTrashed() && f.getName() === name && isSheet(f);
    },
    lookup: () => {
      const f = firstNamed(parent.getFilesByName(name), name, isSheet);
      return f ? f.getId() : null;
    },
    create: create ? () => {
      const ss = SpreadsheetApp.create(name);
      const file = DriveApp.getFileById(ss.getId());
      try {
        file.moveTo(parent);
        if (initFn) initFn(ss);
      } catch (e) {
        file.setTrashed(true);
        throw e;
      }
      Logger.log(`[DriveTree] Created spreadsheet "${name}" in ${parent.getId()}`);
      return ss.getId();
    } : null
  });
}

/** Id of the spreadsheet named `name` in `parent`, or null. Never creates. */
function findChildSpreadsheet(parent, name) {
  return childSpreadsheetId(parent, name, null, false);
}

/** Id of the spreadsheet named `name` in `parent`; created (and passed to initFn) under the lock if missing. */
function resolveChildSpreadsheet(parent, name, initFn) {
  return childSpreadsheetId(parent, name, initFn, true);
}
