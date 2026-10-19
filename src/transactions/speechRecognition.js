export function getSpeechRecognitionConstructor() {
  if (typeof globalThis.window === 'undefined') return null
  const windowRef = globalThis.window
  return windowRef.SpeechRecognition || windowRef.webkitSpeechRecognition || null
}

export function isSpeechRecognitionSupported() {
  return getSpeechRecognitionConstructor() !== null
}

export function appendDictationText(existing, recognized) {
  const addition = typeof recognized === 'string' ? recognized.trim() : ''
  if (addition === '') return existing
  const base = typeof existing === 'string' ? existing.replace(/\s+$/, '') : ''
  if (base === '') return addition
  return `${base} ${addition}`
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
  return 'Speech recognition stopped. You can edit the description or try again.'
}
