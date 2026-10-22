import {
  PROFILE_PHOTO_MAX_INPUT_BYTES,
  validateProfilePhotoPayload,
} from './profileMediaStore.js'

const ALLOWED_INPUT_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const OUTPUT_MAX_EDGE = 256
const OUTPUT_MIME = 'image/jpeg'
const OUTPUT_QUALITY = 0.86

/**
 * Resize and compress a profile photo for local storage (browser only).
 * @param {File} file
 * @returns {Promise<{ ok: true, mime: string, dataBase64: string } | { ok: false, message: string }>}
 */
export async function prepareProfilePhotoFromFile(file) {
  if (!(file instanceof File)) {
    return { ok: false, message: 'Choose an image file to upload.' }
  }
  if (!ALLOWED_INPUT_MIMES.has(file.type)) {
    return { ok: false, message: 'Use a JPEG, PNG, or WebP image.' }
  }
  if (file.size > PROFILE_PHOTO_MAX_INPUT_BYTES) {
    return { ok: false, message: 'Image must be 512 KB or smaller before upload.' }
  }

  let objectUrl = ''
  try {
    objectUrl = URL.createObjectURL(file)
    const image = await loadImage(objectUrl)
    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, OUTPUT_MAX_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      return { ok: false, message: 'Photo could not be processed on this device.' }
    }
    context.drawImage(image, 0, 0, width, height)
    const dataUrl = canvas.toDataURL(OUTPUT_MIME, OUTPUT_QUALITY)
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl)
    if (!match) {
      return { ok: false, message: 'Photo could not be processed. Try another image.' }
    }
    const payload = { mime: match[1], dataBase64: match[2] }
    const validated = validateProfilePhotoPayload(payload)
    if (!validated.ok) {
      return { ok: false, message: validated.message ?? 'Photo is too large after processing.' }
    }
    return { ok: true, mime: validated.mime, dataBase64: validated.dataBase64 }
  } catch {
    return { ok: false, message: 'Photo could not be read. Try another image.' }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('decode'))
    image.src = src
  })
}

function fitWithin(naturalWidth, naturalHeight, maxEdge) {
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth < 1 || naturalHeight < 1) {
    return { width: 1, height: 1 }
  }
  const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight))
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  }
}
