#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const https = require('node:https')
const { randomBytes } = require('node:crypto')
const { execSync } = require('node:child_process')

// ── Constants ────────────────────────────────────────────────────────────────

const GITHUB_CLIENT_ID = 'Ov23liut9QOJ2pJFF0KR'
const DEFAULT_REPO = 'noteflow-notes'

// ── Paths (must match electron/main.ts) ──────────────────────────────────────

const NOTES_DIR = process.platform === 'linux'
  ? path.join(os.homedir(), '.local', 'share', 'noteflow-notes')
  : path.join(os.homedir(), 'noteflow-notes')

function getSettingsDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'noteflow')
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'noteflow')
}

const SETTINGS_PATH = path.join(getSettingsDir(), 'settings.json')

// ── Utilities ────────────────────────────────────────────────────────────────

function nanoid(n) {
  return randomBytes(n).toString('base64url').slice(0, n)
}

/** Double-quote a string for YAML output */
function q(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

function getTodayTitle() {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

function noteFilename(id, title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40)
  return `${slug ? slug + '-' : ''}${id}.md`
}

// ── Settings ─────────────────────────────────────────────────────────────────

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) }
  catch { return {} }
}

function writeSettings(data) {
  const dir = path.dirname(SETTINGS_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

function getSyncSettings() {
  return readSettings().githubSync || { enabled: false }
}

function getToken() {
  const sync = getSyncSettings()
  if (!sync.encryptedToken) return null
  // CLI cannot decrypt Electron safeStorage tokens
  if (sync.encryptedToken.startsWith('safe:')) return null
  const decoded = Buffer.from(sync.encryptedToken, 'base64').toString('utf-8')
  // Reject if decoded value contains non-printable chars (safeStorage ciphertext without prefix)
  if (!/^[\x20-\x7e]+$/.test(decoded)) return null
  return decoded
}

// ── Note YAML — Parser (NoteFlow format only) ───────────────────────────────

function splitFrontmatter(raw) {
  const s = raw.replace(/\r\n/g, '\n')
  if (!s.startsWith('---\n')) return { frontmatter: '', body: s }
  const end = s.indexOf('\n---\n', 4)
  if (end === -1) return { frontmatter: '', body: s }
  return { frontmatter: s.slice(4, end), body: s.slice(end + 5) }
}

function unquote(s) {
  s = s.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1)
  return s
}

function parseNoteYaml(yamlStr) {
  const note = { tags: [], sections: [] }
  const lines = yamlStr.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    const m = line.match(/^(\w+):\s*(.*)$/)
    if (!m) { i++; continue }

    const key = m[1], val = m[2].trim()

    // Skip encryption block (nested object)
    if (key === 'encryption') {
      note.encryption = true
      i++
      while (i < lines.length && (lines[i].startsWith('  ') || !lines[i].trim())) i++
      continue
    }

    // Sections array
    if (key === 'sections') {
      i++
      let sec = null

      while (i < lines.length) {
        const sl = lines[i]
        if (!sl.startsWith('  ') && sl.trim()) break

        // New array item: "  - key: value"
        const itemMatch = sl.match(/^\s+- (\w+):\s*(.*)$/)
        if (itemMatch) {
          if (sec) note.sections.push(sec)
          sec = {}
          if (itemMatch[1] === 'isRawMode') sec.isRawMode = itemMatch[2].trim() === 'true'
          else sec[itemMatch[1]] = unquote(itemMatch[2])
          i++
          continue
        }

        // Property inside section: "    key: value"
        const propMatch = sl.match(/^\s{4}(\w+):\s*(.*)$/)
        if (propMatch && sec) {
          const pval = propMatch[2].trim()

          // Block scalar (|, |-, |+)
          const blockMatch = pval.match(/^\|([+-]?)$/)
          if (blockMatch) {
            const chomp = blockMatch[1]
            let content = ''
            i++
            while (i < lines.length) {
              const cl = lines[i]
              if (cl.trim() === '') { content += '\n'; i++; continue }
              if (cl.match(/^ {6}/)) { content += cl.slice(6) + '\n'; i++; continue }
              break
            }
            // Apply YAML chomping rules
            if (chomp === '-') content = content.replace(/\n+$/, '')
            else if (chomp === '+') { /* keep all */ }
            else content = content.replace(/\n+$/, '\n') // clip: one trailing newline

            sec[propMatch[1]] = content
            continue
          }

          if (propMatch[1] === 'isRawMode') sec.isRawMode = pval === 'true'
          else sec[propMatch[1]] = unquote(pval)
          i++
          continue
        }

        i++
      }
      if (sec) note.sections.push(sec)
      continue
    }

    // Inline array: [a, b, c]
    if (val.startsWith('[')) {
      note[key] = val === '[]' ? [] : val.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(Boolean)
    } else if (val === 'true' || val === 'false') {
      note[key] = val === 'true'
    } else {
      note[key] = unquote(val)
    }
    i++
  }

  return note
}

// ── Note YAML — Serializer ──────────────────────────────────────────────────

function serializeNote(note) {
  let y = ''
  y += `id: ${q(note.id)}\n`
  y += `title: ${q(note.title)}\n`
  y += `tags: [${note.tags.map(q).join(', ')}]\n`
  y += `created: ${q(note.created)}\n`
  y += `updated: ${q(note.updated)}\n`
  y += 'sections:\n'

  for (const s of note.sections) {
    y += `  - id: ${q(s.id)}\n`
    y += `    name: ${q(s.name)}\n`
    const c = s.content || ''
    if (c === '') {
      y += '    content: ""\n'
    } else if (c.includes('\n')) {
      const hasTrailing = c.endsWith('\n')
      const contentLines = hasTrailing ? c.slice(0, -1).split('\n') : c.split('\n')
      y += `    content: ${hasTrailing ? '|' : '|-'}\n`
      for (const line of contentLines) y += '      ' + line + '\n'
    } else {
      y += `    content: ${q(c)}\n`
    }
    if (s.isRawMode) y += '    isRawMode: true\n'
  }

  if (note.archived) y += 'archived: true\n'
  if (note.pinned) y += 'pinned: true\n'
  if (note.group) y += `group: ${q(note.group)}\n`

  const body = note.sections[0]?.content || ''
  return `---\n${y}---\n${body}`
}

// ── Note file operations ─────────────────────────────────────────────────────

function findTodayNote() {
  if (!fs.existsSync(NOTES_DIR)) return null
  const today = getTodayTitle()
  const files = fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.md'))

  let bestFile = null, bestUpdated = ''
  for (const file of files) {
    const raw = fs.readFileSync(path.join(NOTES_DIR, file), 'utf-8')
    if (raw.includes('encryption:')) continue
    const titleMatch = raw.match(/^title:\s*["']?(.+?)["']?\s*$/m)
    if (titleMatch && titleMatch[1].trim() === today) {
      const updatedMatch = raw.match(/^updated:\s*["']?(.+?)["']?\s*$/m)
      const updated = updatedMatch ? updatedMatch[1].trim() : ''
      if (!bestFile || updated > bestUpdated) {
        bestFile = file
        bestUpdated = updated
      }
    }
  }

  return bestFile ? path.join(NOTES_DIR, bestFile) : null
}

// ── GitHub API ───────────────────────────────────────────────────────────────

function githubRequest(token, method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined
    const req = https.request({
      hostname: 'api.github.com', path: endpoint, method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'NoteFlow-CLI',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        if (res.statusCode === 204) return resolve(null)
        try {
          const json = JSON.parse(raw)
          if (res.statusCode >= 400) reject(new Error(json.message || `HTTP ${res.statusCode}`))
          else resolve(json)
        } catch { reject(new Error(`HTTP ${res.statusCode}: unparseable response`)) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')) })
    if (payload) req.write(payload)
    req.end()
  })
}

function githubAuthPost(authPath, params) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(params).toString()
    const req = https.request({
      hostname: 'github.com', path: authPath, method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'NoteFlow-CLI',
      },
    }, (res) => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) }
        catch { reject(new Error(`Auth request failed: ${raw}`)) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Auth request timed out')) })
    req.write(payload)
    req.end()
  })
}

async function ensureRepo(token, owner, repo) {
  try {
    await githubRequest(token, 'GET', `/repos/${owner}/${repo}`)
  } catch {
    console.log(`  Creating private repo ${owner}/${repo}...`)
    await githubRequest(token, 'POST', '/user/repos', {
      name: repo, private: true, description: 'NoteFlow notes — auto-synced', auto_init: true,
    })
    await new Promise(r => setTimeout(r, 1500))
  }
}

async function upsertRemoteFile(token, owner, repo, filename, content, retrying = false) {
  let sha
  try {
    const existing = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`)
    sha = existing.sha
  } catch { /* new file */ }

  const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m)
  const label = titleMatch ? titleMatch[1].trim() : filename.replace(/\.md$/, '')

  try {
    await githubRequest(token, 'PUT', `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`, {
      message: sha ? `update: ${label}` : `add: ${label}`,
      content: Buffer.from(content).toString('base64'),
      ...(sha ? { sha } : {}),
    })
  } catch (err) {
    if (!retrying && (err.message.includes('409') || err.message.includes('conflict') || err.message.includes('is at') || err.message.includes('422'))) {
      return upsertRemoteFile(token, owner, repo, filename, content, true)
    }
    throw err
  }
}

function extractUpdatedTimestamp(content) {
  const match = content.match(/^updated:\s*['"]?([^'">\n]+)['"]?\s*$/m)
  return match ? match[1].trim() : null
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdAdd(text, tag) {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })

  const notePath = findTodayNote()
  if (notePath) {
    const raw = fs.readFileSync(notePath, 'utf-8')
    const { frontmatter } = splitFrontmatter(raw)
    const note = parseNoteYaml(frontmatter)

    if (note.sections.length === 0) {
      note.sections = [{ id: nanoid(6), name: 'Note', content: '', isRawMode: true }]
    }

    // Append text to first section
    const existing = note.sections[0].content || ''
    // Strip trailing newline from existing content before appending
    const base = existing.endsWith('\n') ? existing.slice(0, -1) : existing
    note.sections[0].content = base ? base + '\n' + text : text

    note.updated = new Date().toISOString()
    if (tag && !note.tags.includes(tag)) note.tags.push(tag)

    fs.writeFileSync(notePath, serializeNote(note), 'utf-8')
    console.log(`  Added to ${path.basename(notePath)}`)
    await syncPushFile(notePath)
  } else {
    const id = nanoid(8)
    const now = new Date().toISOString()
    const note = {
      id, title: getTodayTitle(), tags: tag ? [tag] : [],
      created: now, updated: now,
      sections: [{ id: nanoid(6), name: 'Note', content: text, isRawMode: true }],
    }
    const filename = noteFilename(id, note.title)
    const filePath = path.join(NOTES_DIR, filename)
    fs.writeFileSync(filePath, serializeNote(note), 'utf-8')
    console.log(`  Created ${filename}`)
    await syncPushFile(filePath)
  }
}

async function syncPushFile(filePath) {
  const sync = getSyncSettings()
  if (!sync.enabled || !sync.owner || !sync.repo) return
  const token = getToken()
  if (!token) return
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    await upsertRemoteFile(token, sync.owner, sync.repo, path.basename(filePath), content)
    console.log('  Synced to GitHub')
  } catch (err) {
    console.error(`  Sync failed: ${err.message}`)
  }
}

async function cmdLogin(repoName) {
  const repo = repoName || DEFAULT_REPO
  console.log('\n  Authenticating with GitHub...')

  const data = await githubAuthPost('/login/device/code', {
    client_id: GITHUB_CLIENT_ID, scope: 'repo',
  })
  if (data.error) {
    console.error(`  Error: ${data.error_description || data.error}`)
    process.exit(1)
  }

  console.log(`\n  Go to:  ${data.verification_uri}`)
  console.log(`  Enter:  ${data.user_code}\n`)

  // Try to open browser (best-effort, silently fails on headless)
  try {
    if (process.platform === 'linux') execSync(`xdg-open "${data.verification_uri}" 2>/dev/null`, { stdio: 'ignore' })
    else if (process.platform === 'win32') execSync(`start "" "${data.verification_uri}"`, { stdio: 'ignore', shell: true })
    else if (process.platform === 'darwin') execSync(`open "${data.verification_uri}"`, { stdio: 'ignore' })
  } catch { /* headless — user copies URL manually */ }

  let interval = (parseInt(data.interval) || 5) * 1000
  const expiresAt = Date.now() + parseInt(data.expires_in) * 1000

  process.stdout.write('  Waiting for authorization')
  while (Date.now() < expiresAt) {
    await new Promise(r => setTimeout(r, interval))
    process.stdout.write('.')

    const result = await githubAuthPost('/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID,
      device_code: data.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })

    if (result.access_token) {
      process.stdout.write('\n')
      const token = result.access_token

      const user = await githubRequest(token, 'GET', '/user')
      console.log(`  Logged in as ${user.login}`)

      await ensureRepo(token, user.login, repo)

      const settings = readSettings()
      settings.githubSync = {
        enabled: true,
        encryptedToken: Buffer.from(token).toString('base64'),
        owner: user.login,
        repo,
        lastSync: new Date().toISOString(),
      }
      writeSettings(settings)

      console.log(`  Connected to ${user.login}/${repo}`)
      console.log("  Run 'noteflow push' to upload existing notes\n")
      return
    }

    if (result.error === 'slow_down') {
      interval += 5000
    } else if (result.error !== 'authorization_pending') {
      process.stdout.write('\n')
      console.error(`  Error: ${result.error_description || result.error}`)
      process.exit(1)
    }
  }

  process.stdout.write('\n')
  console.error('  Authorization expired. Try again.')
  process.exit(1)
}

function cmdLogout() {
  const settings = readSettings()
  delete settings.githubSync
  writeSettings(settings)
  console.log('  Disconnected from GitHub')
}

async function cmdPush() {
  const sync = getSyncSettings()
  if (!sync.enabled || !sync.owner || !sync.repo) {
    console.error('  Not connected. Run: noteflow login')
    process.exit(1)
  }
  const token = getToken()
  if (!token) {
    console.error('  Token unavailable (encrypted by desktop app). Run: noteflow login')
    process.exit(1)
  }

  if (!fs.existsSync(NOTES_DIR)) { console.log('  No notes to push'); return }

  const files = fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.md'))
  console.log(`  Pushing ${files.length} notes to ${sync.owner}/${sync.repo}...`)

  let pushed = 0, errors = 0
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(NOTES_DIR, file), 'utf-8')
      await upsertRemoteFile(token, sync.owner, sync.repo, file, content)
      pushed++
      process.stdout.write(`\r  ${pushed}/${files.length}`)
    } catch (err) {
      errors++
      console.error(`\n  Failed: ${file} — ${err.message}`)
    }
  }

  // Also push groups.json if it exists
  const groupsPath = path.join(NOTES_DIR, 'groups.json')
  if (fs.existsSync(groupsPath)) {
    try {
      const content = fs.readFileSync(groupsPath, 'utf-8')
      await upsertRemoteFile(token, sync.owner, sync.repo, 'groups.json', content)
    } catch { /* ignore */ }
  }

  const settings = readSettings()
  settings.githubSync = { ...sync, lastSync: new Date().toISOString() }
  writeSettings(settings)

  console.log(`\n  Done: ${pushed} pushed, ${errors} errors`)
}

async function cmdPull() {
  const sync = getSyncSettings()
  if (!sync.enabled || !sync.owner || !sync.repo) {
    console.error('  Not connected. Run: noteflow login')
    process.exit(1)
  }
  const token = getToken()
  if (!token) {
    console.error('  Token unavailable (encrypted by desktop app). Run: noteflow login')
    process.exit(1)
  }

  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })
  console.log(`  Pulling from ${sync.owner}/${sync.repo}...`)

  let remoteFiles
  try {
    const files = await githubRequest(token, 'GET', `/repos/${sync.owner}/${sync.repo}/contents/`)
    remoteFiles = Array.isArray(files) ? files.filter(f => f.type === 'file' && f.name.endsWith('.md')) : []
  } catch { remoteFiles = [] }

  let pulled = 0
  for (const file of remoteFiles) {
    try {
      const remote = await githubRequest(token, 'GET',
        `/repos/${sync.owner}/${sync.repo}/contents/${encodeURIComponent(file.name)}`)
      const remoteContent = Buffer.from(remote.content.replace(/\n/g, ''), 'base64').toString('utf-8')
      const localPath = path.join(NOTES_DIR, file.name)

      if (fs.existsSync(localPath)) {
        const localContent = fs.readFileSync(localPath, 'utf-8')
        const localUpdated = extractUpdatedTimestamp(localContent)
        const remoteUpdated = extractUpdatedTimestamp(remoteContent)
        if (localUpdated && remoteUpdated && remoteUpdated <= localUpdated) continue
      }

      fs.writeFileSync(localPath, remoteContent, 'utf-8')
      pulled++
      console.log(`  ${file.name}`)
    } catch (err) {
      console.error(`  Failed: ${file.name} — ${err.message}`)
    }
  }

  // Pull groups.json if present
  try {
    const remote = await githubRequest(token, 'GET', `/repos/${sync.owner}/${sync.repo}/contents/groups.json`)
    const content = Buffer.from(remote.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    fs.writeFileSync(path.join(NOTES_DIR, 'groups.json'), content, 'utf-8')
  } catch { /* not present or error — ignore */ }

  const settings = readSettings()
  settings.githubSync = { ...sync, lastSync: new Date().toISOString() }
  writeSettings(settings)

  console.log(`  Done: ${pulled} notes pulled`)
}

function cmdStatus() {
  const sync = getSyncSettings()
  const noteCount = fs.existsSync(NOTES_DIR)
    ? fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.md')).length
    : 0

  console.log('\n  NoteFlow CLI')
  console.log(`  Notes:     ${noteCount} in ${NOTES_DIR}`)

  if (sync.enabled && sync.owner && sync.repo) {
    const tokenOk = !!getToken()
    console.log(`  GitHub:    ${sync.owner}/${sync.repo} ${tokenOk ? '(connected)' : '(token inaccessible — run: noteflow login)'}`)
    if (sync.lastSync) console.log(`  Last sync: ${sync.lastSync}`)
  } else {
    console.log('  GitHub:    not connected')
  }
  console.log()
}

function cmdHelp() {
  console.log(`
  NoteFlow CLI — quick notes from your terminal

  Usage:
    noteflow add <text> [--tag <name>]   Add text to today's daily note
    noteflow login [repo]                Connect to GitHub (default repo: noteflow-notes)
    noteflow logout                      Disconnect from GitHub
    noteflow push                        Push all notes to GitHub
    noteflow pull                        Pull notes from GitHub
    noteflow status                      Show notes and sync status
    noteflow help                        Show this help

  Examples:
    noteflow add "Fix: CORS issue in API"
    noteflow add "Deploy failed" --tag urgent
    noteflow login my-notes
    noteflow push
`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { cmdHelp(); return }

  switch (cmd) {
    case 'add': {
      const texts = []; let tag = null
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--tag' && args[i + 1]) tag = args[++i]
        else texts.push(args[i])
      }
      const text = texts.join(' ')
      if (!text) { console.error('  Usage: noteflow add <text> [--tag <name>]'); process.exit(1) }
      await cmdAdd(text, tag)
      break
    }
    case 'login':  await cmdLogin(args[1]); break
    case 'logout': cmdLogout(); break
    case 'push':   await cmdPush(); break
    case 'pull':   await cmdPull(); break
    case 'status': cmdStatus(); break
    default:
      console.error(`  Unknown command: ${cmd}`)
      cmdHelp()
      process.exit(1)
  }
}

main().catch(err => { console.error(`  Error: ${err.message}`); process.exit(1) })
