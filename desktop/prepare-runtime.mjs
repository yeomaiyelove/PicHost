import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = path.join(root, 'dist-windows')
const stageRoot = path.join(outputRoot, 'staging')
const runtimeRoot = path.join(stageRoot, 'runtime')
const appRoot = path.join(runtimeRoot, 'app')
const nodeDir = path.join(runtimeRoot, 'node')
const ffmpegDir = path.join(runtimeRoot, 'ffmpeg')
const buildDir = path.join(stageRoot, 'build')
const cacheDir = path.join(outputRoot, 'cache')
const nodeVersion = '22.23.3'

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command)
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 失败，退出代码 ${result.status}`)
  }
}

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function download(file, url) {
  if (await exists(file)) return
  await mkdir(path.dirname(file), { recursive: true })
  console.log(`下载 ${url}`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载失败：${response.status} ${url}`)
  await writeFile(file, Buffer.from(await response.arrayBuffer()))
}

async function prepareNode() {
  const cacheFile = path.join(cacheDir, `node-v${nodeVersion}-win-x64.exe`)
  const nodeExe = path.join(nodeDir, 'node.exe')
  await download(
    cacheFile,
    `https://nodejs.org/dist/v${nodeVersion}/win-x64/node.exe`
  )

  const sums = await (await fetch(
    `https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`
  )).text()
  const expected = sums
    .split(/\r?\n/)
    .map(line => line.trim().split(/\s+/))
    .find(parts => parts[1] === 'win-x64/node.exe')?.[0]
  const actual = createHash('sha256')
    .update(await readFile(cacheFile))
    .digest('hex')
  if (!expected || actual !== expected) {
    throw new Error('内置 Node.js 校验失败')
  }

  await mkdir(nodeDir, { recursive: true })
  await copyFile(cacheFile, nodeExe)
  run(nodeExe, ['--version'])
}

async function findFfmpegDir() {
  const candidates = [
    process.env.FFMPEG_DIR,
    'C:\\ffmpeg-8.0.1-essentials_build\\bin'
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (
      await exists(path.join(candidate, 'ffmpeg.exe'))
      && await exists(path.join(candidate, 'ffprobe.exe'))
    ) {
      return candidate
    }
  }

  const located = spawnSync('where.exe', ['ffmpeg.exe'], { encoding: 'utf8' })
  const first = located.stdout?.trim().split(/\r?\n/)[0]
  if (first && await exists(path.join(path.dirname(first), 'ffprobe.exe'))) {
    return path.dirname(first)
  }

  throw new Error('未找到 ffmpeg.exe 和 ffprobe.exe，请设置 FFMPEG_DIR')
}

async function main() {
  run('npm.cmd', ['run', 'build'])
  await rm(stageRoot, { recursive: true, force: true })
  await Promise.all([
    mkdir(appRoot, { recursive: true }),
    mkdir(buildDir, { recursive: true })
  ])

  await cp(path.join(root, '.output'), path.join(appRoot, '.output'), {
    recursive: true,
    dereference: true
  })
  await copyFile(path.join(root, 'package.json'), path.join(appRoot, 'package.json'))
  await copyFile(
    path.join(root, 'package-lock.json'),
    path.join(appRoot, 'package-lock.json')
  )
  await cp(path.join(root, 'server', 'cli'), path.join(appRoot, 'server', 'cli'), {
    recursive: true
  })

  console.log('安装 Windows 运行时生产依赖')
  run(
    'npm.cmd',
    ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    appRoot
  )

  await prepareNode()

  const sourceFfmpeg = await findFfmpegDir()
  await mkdir(ffmpegDir, { recursive: true })
  await copyFile(
    path.join(sourceFfmpeg, 'ffmpeg.exe'),
    path.join(ffmpegDir, 'ffmpeg.exe')
  )
  await copyFile(
    path.join(sourceFfmpeg, 'ffprobe.exe'),
    path.join(ffmpegDir, 'ffprobe.exe')
  )
  run(path.join(ffmpegDir, 'ffmpeg.exe'), ['-version'])

  await sharp(path.join(root, 'app', 'assets', 'image', 'logo-light.png'))
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(path.join(buildDir, 'icon.png'))

  console.log(`Windows 运行时已准备到 ${runtimeRoot}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
