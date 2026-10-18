import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SITE_KEY = 'site_base_url'
const IMAGE_KEY = 'image_base_url'
const VIDEO_KEY = 'video_base_url'
const FILE_KEY = 'file_base_url'
const DOMAIN_SEPARATION_KEY = 'domain_separation_enabled'

const args = process.argv.slice(2)
const siteOnly = args.includes('--site')
const imageOnly = args.includes('--image')
const videoOnly = args.includes('--video')
const fileOnly = args.includes('--file')
const selectiveFlags = [siteOnly, imageOnly, videoOnly, fileOnly].filter(Boolean).length

if (args.some(arg => !['--site', '--image', '--video', '--file'].includes(arg))) {
  console.error('Usage: clear-domains [--site] [--image] [--video] [--file]')
  console.error('  (no flags)  Clear all domain URLs from settings')
  console.error('  --site      Clear site URL only')
  console.error('  --image     Clear image URL only')
  console.error('  --video     Clear video URL only')
  console.error('  --file      Clear file URL only')
  process.exit(1)
}

if (selectiveFlags > 1) {
  console.error('Usage: specify at most one selective domain flag')
  process.exit(1)
}

const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })
const db = new DatabaseSync(join(dataDir, 'pichost.db'))

function readSetting(key) {
  const row = db.prepare(`
    SELECT value
    FROM settings
    WHERE key = ?
  `).get(key)
  return row?.value ?? null
}

const beforeSite = readSetting(SITE_KEY)
const beforeImage = readSetting(IMAGE_KEY)
const beforeVideo = readSetting(VIDEO_KEY)
const beforeFile = readSetting(FILE_KEY)

const keysToClear = siteOnly
  ? [SITE_KEY]
  : imageOnly
    ? [IMAGE_KEY]
    : videoOnly
      ? [VIDEO_KEY]
      : fileOnly
        ? [FILE_KEY]
        : [SITE_KEY, IMAGE_KEY, VIDEO_KEY, FILE_KEY, DOMAIN_SEPARATION_KEY]

for (const key of keysToClear) {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

db.close()

console.log('[PicHost] Domain settings cleared from database.')
if (keysToClear.includes(SITE_KEY)) {
  console.log(`  site_base_url: ${beforeSite ?? '(unset)'} → (removed)`)
}
if (keysToClear.includes(IMAGE_KEY)) {
  console.log(`  image_base_url: ${beforeImage ?? '(unset)'} → (removed)`)
}
if (keysToClear.includes(VIDEO_KEY)) {
  console.log(`  video_base_url: ${beforeVideo ?? '(unset)'} → (removed)`)
}
if (keysToClear.includes(FILE_KEY)) {
  console.log(`  file_base_url: ${beforeFile ?? '(unset)'} → (removed)`)
}
console.log('[PicHost] Restart is not required. Refresh the admin page or use your previous access URL.')
