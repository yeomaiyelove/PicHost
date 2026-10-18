import { createHash } from 'node:crypto'
import {
  access,
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const outputRoot = path.join(root, 'dist-fpk')
const stage = path.join(outputRoot, 'staging')
const source = path.join(root, 'packaging', 'fnos')
const cache = path.join(outputRoot, 'cache')
const image = process.env.PICHOST_IMAGE
  || `yeomaiyelove/pichost:${pkg.version}`
const platform = process.env.FPK_PLATFORM || 'x86'
const fnpackVersion = '1.2.3'

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    windowsHide: true
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

async function getFnpack() {
  const systems = {
    win32: 'windows',
    linux: 'linux',
    darwin: 'darwin'
  }
  const architectures = {
    x64: 'amd64',
    arm64: 'arm64'
  }
  const system = systems[process.platform]
  const architecture = architectures[process.arch]
  if (!system || !architecture) {
    throw new Error(`不支持自动下载 fnpack：${process.platform}/${process.arch}`)
  }

  const executable = path.join(
    cache,
    `fnpack-${fnpackVersion}-${system}-${architecture}${process.platform === 'win32' ? '.exe' : ''}`
  )
  if (!await exists(executable)) {
    await mkdir(cache, { recursive: true })
    const url = `https://static2.fnnas.com/fnpack/fnpack-${fnpackVersion}-${system}-${architecture}`
    console.log(`下载 fnpack：${url}`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`fnpack 下载失败：${response.status}`)
    await writeFile(executable, Buffer.from(await response.arrayBuffer()))
    if (process.platform !== 'win32') await chmod(executable, 0o755)
  }
  return executable
}

async function replace(file, replacer) {
  const original = await readFile(file, 'utf8')
  await writeFile(file, replacer(original))
}

await rm(stage, { recursive: true, force: true })
await cp(source, stage, { recursive: true })

const cmdDir = path.join(stage, 'cmd')
for (const file of await readdir(cmdDir)) {
  await chmod(path.join(cmdDir, file), 0o755)
}
await chmod(path.join(stage, 'app', 'docker', 'start.sh'), 0o755)

await replace(path.join(stage, 'manifest'), text => text
  .replace(/^version\s*=.*$/m, `version               = ${pkg.version}`)
  .replace(/^platform\s*=.*$/m, `platform              = ${platform}`))
await replace(path.join(stage, 'app', 'docker', 'docker-compose.yaml'), text => text
  .replace(/image:\s*\S+/, `image: ${image}`))
await replace(path.join(stage, 'wizard', 'install'), text => text
  .replaceAll(/yeomaiyelove\/pichost:[0-9]+\.[0-9]+\.[0-9]+/g, image))

const logo = path.join(root, 'app', 'assets', 'image', 'logo-light.png')
const resize = size => sharp(logo)
  .resize(size, size, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .png()

await mkdir(path.join(stage, 'app', 'ui', 'images'), { recursive: true })
await resize(64).toFile(path.join(stage, 'ICON.PNG'))
await resize(256).toFile(path.join(stage, 'ICON_256.PNG'))
await resize(64).toFile(path.join(stage, 'app', 'ui', 'images', 'icon_64.png'))
await resize(256).toFile(path.join(stage, 'app', 'ui', 'images', 'icon_256.png'))

const fnpack = await getFnpack()
run(fnpack, ['build', '--directory', stage], outputRoot)

const output = path.join(outputRoot, `pichost-${pkg.version}.fpk`)
await rm(output, { force: true })
await rename(path.join(outputRoot, 'pichost.fpk'), output)

const hash = createHash('sha256')
hash.update(await readFile(output))
const digest = hash.digest('hex')
await writeFile(`${output}.sha256`, `${digest}  ${path.basename(output)}\n`)
console.log(`FPK：${output}`)
console.log(`SHA256：${digest}`)
