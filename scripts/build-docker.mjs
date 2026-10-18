import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const repository = process.env.PICHOST_IMAGE_REPOSITORY || 'yeomaiyelove/pichost'
const image = `${repository}:${pkg.version}`
const platform = process.env.DOCKER_PLATFORM || 'linux/amd64'
const outputDir = path.join(root, 'dist-docker')
const outputName = `${repository.replaceAll('/', '-')}-${pkg.version}-amd64.tar`
const outputFile = path.join(outputDir, outputName)

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

async function sha256(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

run('docker', ['build', '--platform', platform, '-t', image, '.'])
await mkdir(outputDir, { recursive: true })
run('docker', ['save', '-o', outputFile, image])

const digest = await sha256(outputFile)
await writeFile(`${outputFile}.sha256`, `${digest}  ${outputName}\n`)
console.log(`Docker 镜像包：${outputFile}`)
console.log(`SHA256：${digest}`)
