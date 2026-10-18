const { app, BrowserWindow, dialog, Menu, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')

let serverProcess = null
let mainWindow = null
let serverUrl = ''

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.setAppUserModelId('com.yeomai.pichost')
app.setName('PicHost')

function runtimeRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'runtime')
    : path.join(__dirname, '..', 'dist-windows', 'staging', 'runtime')
}

function dataDirectory() {
  return app.isPackaged
    ? path.join(path.dirname(process.execPath), 'data')
    : path.join(__dirname, '..', 'data')
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

function waitForHealth(url, process) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const timer = setInterval(async () => {
      if (process.exitCode !== null) {
        clearInterval(timer)
        reject(new Error(`PicHost 服务已退出，代码 ${process.exitCode}`))
        return
      }

      try {
        const response = await fetch(`${url}/api/health`, {
          signal: AbortSignal.timeout(1000)
        })
        if (response.ok) {
          clearInterval(timer)
          resolve()
          return
        }
      } catch {
        // 忽略轮询中的瞬时错误，继续等待
      }

      if (Date.now() - startedAt > 30000) {
        clearInterval(timer)
        reject(new Error('PicHost 服务启动超时'))
      }
    }, 500)
  })
}

function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return

  spawn('taskkill', ['/pid', String(serverProcess.pid), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore'
  })
  serverProcess = null
}

async function startServer() {
  const root = runtimeRoot()
  const appRoot = path.join(root, 'app')
  const nodeExe = path.join(root, 'node', 'node.exe')
  const ffmpegDir = path.join(root, 'ffmpeg')
  const dataDir = dataDirectory()
  const port = await findFreePort()

  fs.mkdirSync(dataDir, { recursive: true })
  const log = fs.createWriteStream(path.join(dataDir, 'desktop-server.log'), {
    flags: 'a'
  })

  serverUrl = `http://127.0.0.1:${port}`
  serverProcess = spawn(nodeExe, [path.join(appRoot, '.output', 'server', 'index.mjs')], {
    cwd: appRoot,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      NODE_ENV: 'production',
      NITRO_PORT: String(port),
      PORT: String(port),
      NITRO_HOST: '127.0.0.1',
      HOST: '127.0.0.1',
      PATH: `${ffmpegDir};${process.env.PATH || ''}`,
      PIC_HOST_DESKTOP: '1'
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  serverProcess.stdout.pipe(log, { end: false })
  serverProcess.stderr.pipe(log, { end: false })
  serverProcess.once('close', () => log.end())

  await waitForHealth(serverUrl, serverProcess)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    app.quit()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(serverUrl)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(serverUrl)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.loadURL(serverUrl)
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('before-quit', stopServer)
app.on('window-all-closed', () => app.quit())

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  try {
    await startServer()
    createWindow()
  } catch (error) {
    dialog.showErrorBox('PicHost 启动失败', String(error?.message || error))
    stopServer()
    app.quit()
  }
})
