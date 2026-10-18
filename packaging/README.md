# PicHost 打包

版本号统一从根目录 `package.json` 的 `version` 读取。

## 环境要求

- Node.js 22 或更高版本
- npm 11
- Docker（构建 Docker 镜像和飞牛运行镜像）
- Windows 构建需要 `ffmpeg.exe` 与 `ffprobe.exe`，可通过 `FFMPEG_DIR` 指定目录

## 构建命令

```bash
npm ci
npm run pack:docker
npm run pack:fpk
npm run pack:windows
```

在 Windows 上可以一次构建全部三类产物：

```bash
npm run pack:all
```

输出位置：

- Docker 镜像：`dist-docker/*.tar`
- 飞牛应用：`dist-fpk/*.fpk`
- Windows 安装程序：`dist-windows/*.exe`

`dist-docker`、`dist-fpk` 和 `dist-windows` 是生成目录，不提交到 Git。可复用的源文件位于 `packaging/fnos`、`desktop` 和 `scripts`。

## 飞牛安装顺序

1. 在飞牛 Docker 中手动导入 `dist-docker/*.tar`。
2. 确认镜像列表中出现 `yeomaiyelove/pichost:<version>`。
3. 安装 `dist-fpk/*.fpk`。

FPK 使用 `pull_policy: never`，不会联网拉取 PicHost 镜像。

## 可覆盖参数

- `PICHOST_IMAGE_REPOSITORY`：Docker 镜像仓库名，默认 `yeomaiyelove/pichost`
- `DOCKER_PLATFORM`：Docker 构建平台，默认 `linux/amd64`
- `PICHOST_IMAGE`：FPK 使用的完整镜像标签
- `FPK_PLATFORM`：FPK 平台标识，默认 `x86`
- `FFMPEG_DIR`：Windows 构建使用的 ffmpeg 目录
