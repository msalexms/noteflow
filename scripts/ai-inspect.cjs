// Inspect an existing index DB (read-only). Run: npx electron scripts/ai-inspect.cjs [dbPath]
// Default path is the dev userData index.
const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')
const sqliteVec = require('sqlite-vec')

const DB = process.argv[2] || path.join(__dirname, '..', '.electron-dev', 'ai-index', 'index.db')

app.whenReady().then(() => {
  if (!fs.existsSync(DB)) { console.log('NO DB at', DB); return app.exit(1) }
  console.log('DB:', DB, '(' + (fs.statSync(DB).size / 1024).toFixed(1) + ' KB)')
  const db = new Database(DB, { readonly: true })
  sqliteVec.load(db)
  console.log('meta:', db.prepare('SELECT key, value FROM meta').all())
  console.log('chunks:', db.prepare('SELECT COUNT(*) n FROM chunks').get().n,
    '| vectors:', db.prepare('SELECT COUNT(*) n FROM vec_chunks').get().n,
    '| fts:', db.prepare('SELECT COUNT(*) n FROM fts_chunks').get().n,
    '| notes:', db.prepare('SELECT COUNT(*) n FROM notes').get().n)
  console.log('\nindexed notes:')
  for (const r of db.prepare('SELECT n.title, COUNT(c.chunk_id) chunks FROM notes n LEFT JOIN chunks c ON c.note_id = n.note_id GROUP BY n.note_id ORDER BY n.title').all()) {
    console.log(`  · ${(r.title || '(untitled)').slice(0, 50).padEnd(50)} ${r.chunks} chunk(s)`)
  }
  app.exit(0)
})
