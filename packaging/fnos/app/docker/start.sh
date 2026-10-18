#!/bin/sh
# 飞牛 compose 入口：安装向导写入配置后，启动官方镜像前执行初始化或备份恢复。
if [ -f /data/.fnos-restore.pending ]; then
  ARCHIVE="$(tr -d '\r\n' < /data/.fnos-restore.pending)"
  if [ -n "${ARCHIVE}" ] && [ -f "${ARCHIVE}" ]; then
    if node /app/server/cli/backup-restore.mjs "${ARCHIVE}" --overwrite; then
      rm -f /data/.fnos-restore.pending /data/.fnos-restore.failed
    else
      printf 'restore failed: %s\n' "${ARCHIVE}" > /data/.fnos-restore.failed
      rm -f /data/.fnos-restore.pending
    fi
  fi
elif [ -f /data/fnos-bootstrap.mjs ]; then
  node /data/fnos-bootstrap.mjs || true
fi
exec /docker-entrypoint.sh
