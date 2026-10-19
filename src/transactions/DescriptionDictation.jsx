import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import {
  appendDictationText,
  getSpeechRecognitionConstructor,
  isSpeechRecognitionSupported,
  speechRecognitionErrorMessage,
} from './speechRecognition.js'

function abortRecognition(recognitionRef) {
  const recognition = recognitionRef.current
  recognitionRef.current = null
  if (!recognition) return
  recognition.onresult = null
  recognition.onerror = null
  recognition.onend = null
  try {
    recognition.abort()
  } catch {
    try {
      recognition.stop()
    } catch {
      // Ignore stop errors after abort.
    }
  }
}

const DescriptionDictation = forwardRef(function DescriptionDictation(
  { value, onChange, disabled = false, maxLength = 500 },
  ref,
) {
  const supported = isSpeechRecognitionSupported()
  const noteId = useId()
  const statusId = useId()
  const recognitionRef = useRef(null)
  const mountedRef = useRef(true)
  const baseDescriptionRef = useRef('')
  const finalsRef = useRef([])
  const userEditedDuringSessionRef = useRef(false)
  const [listening, setListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [status, setStatus] = useState({ kind: 'idle', message: '' })

  function stopDictation({ reason = 'idle', message = '' } = {}) {
    abortRecognition(recognitionRef)
    if (!mountedRef.current) return
    setListening(false)
    setInterimText('')
    finalsRef.current = []
    userEditedDuringSessionRef.current = false
    if (message) setStatus({ kind: reason, message })
    else if (reason === 'success') {
      setStatus({
        kind: 'success',
        message: 'Dictation added. Review the description before saving.',
      })
    } else setStatus({ kind: 'idle', message: '' })
  }

  useImperativeHandle(ref, () => ({
    stopDictation: () => stopDictation({ reason: 'idle' }),
  }))

  function applyRecognizedText() {
    if (userEditedDuringSessionRef.current) return
    const combined = finalsRef.current.join(' ').trim()
    if (combined === '') return
    const next = appendDictationText(baseDescriptionRef.current, combined)
    onChange(next.slice(0, maxLength))
  }

  function startDictation() {
    if (disabled || listening || !supported) return
    const Recognition = getSpeechRecognitionConstructor()
    if (!Recognition) {
      setStatus({
        kind: 'unsupported',
        message: 'Voice dictation is not available in this browser. Type your description instead.',
      })
      return
    }

    baseDescriptionRef.current = value
    finalsRef.current = []
    userEditedDuringSessionRef.current = false
    setInterimText('')
    setStatus({
      kind: 'listening',
      message:
        'Listening… Speak clearly, then stop dictation when finished. Your browser may process audio using its speech service.',
    })

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-IN'
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      if (!mountedRef.current || userEditedDuringSessionRef.current) return
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) {
          if (transcript.trim() !== '') finalsRef.current.push(transcript.trim())
        } else {
          interim += transcript
        }
      }
      setInterimText(interim.trim())
      applyRecognizedText()
    }

    recognition.onerror = (event) => {
      if (!mountedRef.current) return
      const message = speechRecognitionErrorMessage(event)
      stopDictation(message ? { reason: 'error', message } : { reason: 'idle' })
    }

    recognition.onend = () => {
      if (!mountedRef.current) return
      if (recognitionRef.current !== recognition) return
      applyRecognizedText()
      stopDictation({ reason: 'success' })
    }

    try {
      recognition.start()
      setListening(true)
    } catch {
      stopDictation({
        reason: 'error',
        message: 'Speech recognition could not start. You can still type the description.',
      })
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRecognition(recognitionRef)
    }
  }, [])

  function handleDescriptionChange(event) {
    if (listening) {
      userEditedDuringSessionRef.current = true
      stopDictation({
        reason: 'idle',
        message: 'Dictation stopped so your typed changes are kept.',
      })
    }
    onChange(event.target.value)
  }

  const statusMessage =
    status.kind === 'listening' && interimText !== ''
      ? `${status.message} Heard: “${interimText}”`
      : status.message

  return (
    <div className="description-field">
      <label htmlFor={`${noteId}-description`}>Description</label>
      <textarea
        id={`${noteId}-description`}
        name="description"
        maxLength={maxLength}
        rows={3}
        value={value}
        disabled={disabled}
        aria-describedby={`${noteId}-dictation-note ${statusMessage ? statusId : ''}`.trim()}
        onChange={handleDescriptionChange}
      />

      <div className="dictation-controls">
        {supported ? (
          <>
            <button
              type="button"
              className="btn dictation-button"
              disabled={disabled}
              aria-pressed={listening}
              aria-describedby={`${noteId}-dictation-note`}
              onClick={() => (listening ? stopDictation({ reason: 'idle' }) : startDictation())}
            >
              {listening ? 'Stop dictation' : 'Dictate description'}
            </button>
            <p id={`${noteId}-dictation-note`} className="dictation-note">
              Optional. Microphone access is requested only when you start dictation. Audio may be
              processed by your browser&apos;s speech service, not only on this device. Review the text
              before saving.
            </p>
          </>
        ) : (
          <p id={`${noteId}-dictation-note`} className="dictation-note">
            Voice dictation is not available in this browser. Type your description instead. Speech
            features depend on browser support and may send audio to an external speech service.
          </p>
        )}

        {statusMessage && (
          <p
            id={statusId}
            className={`dictation-status dictation-status-${status.kind}`}
            role="status"
            aria-live="polite"
          >
            {statusMessage}
          </p>
        )}
      </div>
    </div>
  )
})

export default DescriptionDictation
