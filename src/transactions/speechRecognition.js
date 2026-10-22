export function getSpeechRecognitionConstructor() {
  if (typeof globalThis.window === 'undefined') return null
  const windowRef = globalThis.window
  return windowRef.SpeechRecognition || windowRef.webkitSpeechRecognition || null
}

export function isSpeechRecognitionSupported() {
  if (typeof globalThis.window === 'undefined') return false
  if (!globalThis.window.isSecureContext) return false
  return getSpeechRecognitionConstructor() !== null
}

export function appendDictationText(existing, recognized) {
  const addition = typeof recognized === 'string' ? recognized.trim() : ''
  if (addition === '') return existing
  const base = typeof existing === 'string' ? existing.replace(/\s+$/, '') : ''
  if (base === '') return addition
  return `${base} ${addition}`
}

/** Merge final segments (keyed by result index) plus optional interim text. */
export function combineDictationSegments(finalSegments, interim) {
  const segments =
    finalSegments && typeof finalSegments === 'object' ? finalSegments : {}
  const finals = Object.keys(segments)
    .map(Number)
    .filter((index) => Number.isFinite(index))
    .sort((a, b) => a - b)
    .map((index) => segments[index])
    .filter((part) => typeof part === 'string' && part.trim() !== '')
  let combined = finals.join(' ').trim()
  const interimTrim = typeof interim === 'string' ? interim.trim() : ''
  if (interimTrim) {
    combined = combined ? `${combined} ${interimTrim}` : interimTrim
  }
  return combined
}

/** True when transcript text was merged into the description field. */
export function dictationAppliedTranscript(existingDescription, nextDescription) {
  const before = typeof existingDescription === 'string' ? existingDescription : ''
  const after = typeof nextDescription === 'string' ? nextDescription : ''
  return after.trim() !== '' && after !== before
}

export function speechRecognitionErrorMessage(error) {
  const code = typeof error === 'string' ? error : error?.error
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Microphone access was denied. You can still type the description.'
  }
  if (code === 'audio-capture') {
    return 'No microphone was found or it is unavailable. You can still type the description.'
  }
  if (code === 'no-speech') {
    return 'No speech was detected. Try again or type the description.'
  }
  if (code === 'network') {
    return 'Speech recognition needs a network connection in this browser. You can still type the description.'
  }
  if (code === 'aborted') return ''
  if (code) {
    return `Speech recognition stopped (${code}). You can edit the description or try again.`
  }
  return 'Speech recognition stopped. You can edit the description or try again.'
}
