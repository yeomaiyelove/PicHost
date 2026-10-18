export function useTranscodeFailureLabel() {
  const { t } = useI18n()

  return (error?: string) => {
    const reason = error === 'ffmpeg-missing'
      ? t('library.video.transcodeErrorFfmpegMissing')
      : error === 'permission-denied'
        ? t('library.video.transcodeErrorPermissionDenied')
        : t('library.video.transcodeErrorUnknown')
    return `${t('library.transcodeFailed')} · ${reason}`
  }
}
