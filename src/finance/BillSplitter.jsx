import { useState } from 'react'
import { formatInrFromPaise, rupeesInputToPaise } from '../transactions/money.js'
import { splitBillPaise } from './splitBill.js'
import './finance.css'

const PARTICIPANT_INPUT = /^(?:[1-9]|[1-9]\d|100)$/

function BillSplitter() {
  const [amount, setAmount] = useState('')
  const [participants, setParticipants] = useState('')
  const [errors, setErrors] = useState([])
  const [result, setResult] = useState(null)

  function updateAmount(value) {
    setAmount(value)
    setResult(null)
  }

  function updateParticipants(value) {
    setParticipants(value)
    setResult(null)
  }

  function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = []
    const amountPaise = rupeesInputToPaise(amount)
    if (amountPaise === null) {
      nextErrors.push('Enter a bill amount in rupees greater than zero, with up to 2 decimal places.')
    }
    if (!PARTICIPANT_INPUT.test(participants.trim())) {
      nextErrors.push('Enter a whole number of participants from 1 to 100.')
    }
    if (nextErrors.length > 0) {
      setErrors(nextErrors)
      setResult(null)
      return
    }

    const split = splitBillPaise(amountPaise, Number(participants.trim()))
    if (!split.ok) {
      setErrors(split.errors)
      setResult(null)
      return
    }
    setErrors([])
    setResult(split)
  }

  return (
    <section className="finance bill-splitter" aria-labelledby="section-title">
      <header className="finance-header">
        <h1 id="section-title">Bill Splitter</h1>
        <p className="finance-lead">This is a calculation. It is not saved as an expense.</p>
      </header>

      <form className="finance-form finance-panel" onSubmit={handleSubmit}>
        <div className="form-grid form-grid--2">
          <label>
            Bill amount (₹)
            <input
              name="bill-amount"
              inputMode="decimal"
              autoComplete="off"
              required
              value={amount}
              onChange={(event) => updateAmount(event.target.value)}
            />
          </label>
          <label>
            Participants
            <input
              name="participants"
              inputMode="numeric"
              autoComplete="off"
              required
              value={participants}
              onChange={(event) => updateParticipants(event.target.value)}
            />
          </label>
        </div>
        {errors.length > 0 && (
          <div className="form-alert" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}
        <button type="submit" className="btn btn--primary">
          Calculate split
        </button>
      </form>

      {result && (
        <div className="split-result finance-panel split-result-panel" aria-live="polite">
          <h2>Equal split</h2>
          {(() => {
            const primaryShare = result.shares.reduce(
              (best, share) => (share.count >= best.count ? share : best),
              result.shares[0],
            )
            return (
              <div className="split-result-hero">
                <p className="split-result-hero-label">
                  {result.shares.length === 1
                    ? 'Each person pays'
                    : `${primaryShare.count} ${primaryShare.count === 1 ? 'person pays' : 'people pay'}`}
                </p>
                <p className="split-result-hero-amount">{formatInrFromPaise(primaryShare.amountPaise)}</p>
              </div>
            )
          })()}
          <p className="split-result-lead">
            Calculated share for a{' '}
            <strong>{formatInrFromPaise(result.amountPaise)}</strong> bill among{' '}
            {result.participants} {result.participants === 1 ? 'participant' : 'participants'}.
          </p>
          <ul className="split-shares">
            {result.shares.map((share) => (
              <li key={share.amountPaise} className="split-share-item">
                <span>
                  {share.count} {share.count === 1 ? 'participant pays' : 'participants pay'}
                </span>
                <span className="split-share-amount">{formatInrFromPaise(share.amountPaise)}</span>
              </li>
            ))}
          </ul>
          <p className="split-result-total">
            All shares total <strong>{formatInrFromPaise(result.assignedPaise)}</strong>
          </p>
        </div>
      )}
    </section>
  )
}

export default BillSplitter
