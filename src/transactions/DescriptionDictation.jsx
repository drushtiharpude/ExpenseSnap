import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import {
  appendDictationText,
  combineDictationSegments,
  dictationAppliedTranscript,
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
  recognition.onstart = null
  recognition.onaudiostart = null
  recognition.onsoundstart = null
  recognition.onspeechstart = null
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

const NO_SPEECH_MESSAGE = 'No speech was detected. Try again or type the description.'

const DescriptionDictation = forwardRef(function DescriptionDictation(
  { value, onChange, disabled = false, maxLength = 500 },
  ref,
) {
  const supported = isSpeechRecognitionSupported()
  const noteId = useId()
  const statusId = useId()
  const recognitionRef = useRef(null)
  const mountedRef = useRef(true)
  const onChangeRef = useRef(onChange)
  const baseDescriptionRef = useRef('')
  const finalsRef = useRef({})
  const interimRef = useRef('')
  const userEditedDuringSessionRef = useRef(false)
  const sessionActiveRef = useRef(false)
  const [listening, setListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [status, setStatus] = useState({ kind: 'idle', message: '' })

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  function updateDescriptionFromRecognition() {
    if (userEditedDuringSessionRef.current) return false
    const combined = combineDictationSegments(finalsRef.current, interimRef.current)
    if (combined === '') return false
    const next = appendDictationText(baseDescriptionRef.current, combined)
    const applied = dictationAppliedTranscript(baseDescriptionRef.current, next)
    onChangeRef.current(next.slice(0, maxLength))
    return applied
  }

  function finishDictationSession({
    message = '',
    messageKind = 'error',
    flushRecognition = false,
    appliedTranscript = false,
  } = {}) {
    let hadText = appliedTranscript
    if (flushRecognition) {
      hadText = updateDescriptionFromRecognition()
    }
    abortRecognition(recognitionRef)
    if (!mountedRef.current) return
    const hadSession = sessionActiveRef.current
    sessionActiveRef.current = false
    setListening(false)
    setInterimText('')
    interimRef.current = ''
    finalsRef.current = {}
    userEditedDuringSessionRef.current = false

    if (message) {
      setStatus({ kind: messageKind, message })
    } else if (hadText) {
      setStatus({
        kind: 'success',
        message: 'Dictation added. Review the description before saving.',
      })
    } else if (hadSession) {
      setStatus({ kind: 'idle', message: NO_SPEECH_MESSAGE })
    } else {
      setStatus({ kind: 'idle', message: '' })
    }
  }

  useImperativeHandle(ref, () => ({
    stopDictation: () => finishDictationSession({ flushRecognition: true }),
  }))

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

    baseDescriptionRef.current = typeof value === 'string' ? value : ''
    finalsRef.current = {}
    interimRef.current = ''
    userEditedDuringSessionRef.current = false
    sessionActiveRef.current = true
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

    recognition.onstart = () => {
      if (!mountedRef.current || recognitionRef.current !== recognition) return
      setListening(true)
    }

    recognition.onresult = (event) => {
      if (!mountedRef.current || userEditedDuringSessionRef.current) return
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) {
          const trimmed = transcript.trim()
          if (trimmed !== '') finalsRef.current[index] = trimmed
          else delete finalsRef.current[index]
        } else {
          interim += transcript
        }
      }
      const trimmedInterim = interim.trim()
      interimRef.current = trimmedInterim
      setInterimText(trimmedInterim)
      updateDescriptionFromRecognition()
    }

    recognition.onerror = (event) => {
      const errorCode = event?.error ?? 'unknown'
      if (!mountedRef.current) return
      if (recognitionRef.current !== recognition) return
      const hadText = updateDescriptionFromRecognition()
      const isAborted = errorCode === 'aborted'
      const message = isAborted ? '' : speechRecognitionErrorMessage(event)
      finishDictationSession({
        message,
        messageKind: message ? 'error' : 'idle',
        flushRecognition: false,
        appliedTranscript: isAborted ? false : hadText,
      })
    }

    recognition.onend = () => {
      if (!mountedRef.current) return
      if (recognitionRef.current !== recognition) return
      const hadText = updateDescriptionFromRecognition()
      finishDictationSession({ flushRecognition: false, appliedTranscript: hadText })
    }

    try {
      recognition.start()
    } catch (error) {
      sessionActiveRef.current = false
      finishDictationSession({
        message: 'Speech recognition could not start. You can still type the description.',
        messageKind: 'error',
        flushRecognition: false,
      })
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      sessionActiveRef.current = false
      abortRecognition(recognitionRef)
    }
  }, [])

  function handleDescriptionChange(event) {
    if (listening) {
      userEditedDuringSessionRef.current = true
      finishDictationSession({
        message: 'Dictation stopped so your typed changes are kept.',
        messageKind: 'idle',
        flushRecognition: false,
      })
    }
    onChange(event.target.value)
  }

  const statusMessage =
    status.kind === 'listening' && interimText !== ''
      ? `${status.message} Heard: “${interimText}”`
      : status.message

  const secureContext =
    typeof globalThis.window !== 'undefined' && globalThis.window.isSecureContext

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
              onClick={() =>
                listening
                  ? finishDictationSession({ flushRecognition: true })
                  : startDictation()
              }
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
            {!secureContext
              ? 'Voice dictation requires a secure connection (HTTPS or localhost). Type your description instead.'
              : 'Voice dictation is not available in this browser. Type your description instead. Speech features depend on browser support and may send audio to an external speech service.'}
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
