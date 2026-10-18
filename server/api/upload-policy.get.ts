import {
  getAllowedMimeTypesList,
  getAllowedVideoExtensions,
  getEffectiveUploadMaxFileSizeMb,
  getForbiddenFileExtensions
} from '../utils/upload-policy'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return {
    allowedMimeTypes: getAllowedMimeTypesList(),
    allowedVideoExtensions: getAllowedVideoExtensions(),
    forbiddenFileExtensions: getForbiddenFileExtensions(),
    imageMaxFileSizeMb: getEffectiveUploadMaxFileSizeMb('image'),
    videoMaxFileSizeMb: getEffectiveUploadMaxFileSizeMb('video'),
    fileMaxFileSizeMb: getEffectiveUploadMaxFileSizeMb('file')
  }
})
