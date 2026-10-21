import { useState } from 'react'
import { formatInrFromPaise, rupeesInputToPaise } from '../transactions/money.js'
import PageHeader from '../ui/PageHeader.jsx'
import { PAGE_TAGLINES } from '../ui/pageHeaderCopy.js'
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

  const primaryShare =
    result?.shares.reduce(
      (best, share) => (share.count >= best.count ? share : best),
      result.shares[0],
    ) ?? null

  const showResults = Boolean(result && primaryShare)
  const hasValidationErrors = errors.length > 0

  return (
    <section className="finance bill-splitter" aria-labelledby="section-title">
      <PageHeader
        icon="splitter"
        title="Bill Splitter"
        tagline={PAGE_TAGLINES.splitter}
        description="Divide a bill equally by head count. Results stay on this page—they are not saved as transactions."
      />

      <div
        className={`bill-splitter-layout${
          showResults ? ' bill-splitter-layout--with-results' : ''
        }`}
      >
        <form
          className="finance-form finance-panel bill-splitter-form"
          onSubmit={handleSubmit}
          aria-labelledby="split-form-title"
        >
          <header className="section-head section-head--in-panel">
            <h2 id="split-form-title" className="section-head__title">
              Bill details
            </h2>
            <p className="section-head__sub">
              Enter the total in rupees and how many people share the bill (1–100).
            </p>
          </header>

          <p className="bill-splitter-form-hint">
            We split the total evenly. If paise do not divide cleanly, some people pay one paisa
            more—shown in the breakdown after you calculate.
          </p>

          <div className="bill-splitter-fields-wrap">
            <div className="form-grid form-grid--2 bill-splitter-fields">
              <label className="bill-splitter-field">
                Bill amount (₹)
                <input
                  name="bill-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  value={amount}
                  aria-invalid={hasValidationErrors ? true : undefined}
                  aria-describedby={hasValidationErrors ? 'split-form-errors' : undefined}
                  onChange={(event) => updateAmount(event.target.value)}
                />
              </label>
              <label className="bill-splitter-field">
                Participants
                <input
                  name="participants"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  value={participants}
                  aria-invalid={hasValidationErrors ? true : undefined}
                  aria-describedby={hasValidationErrors ? 'split-form-errors' : undefined}
                  onChange={(event) => updateParticipants(event.target.value)}
                />
              </label>
            </div>
          </div>

          {hasValidationErrors && (
            <div className="form-alert" role="alert" id="split-form-errors">
              {errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn--primary">
              Calculate split
            </button>
          </div>
        </form>

        {showResults && (
          <div
            className="finance-panel bill-splitter-output bill-splitter-result"
            aria-live="polite"
            aria-labelledby="split-results-title"
          >
            <header className="section-head section-head--in-panel">
              <h2 id="split-results-title" className="section-head__title">
                Your split
              </h2>
              <p className="section-head__sub">
                {result.shares.length === 1
                  ? 'The bill divides evenly with no extra paisa.'
                  : 'The total is shared fairly; a few people pay one paisa more to match the bill.'}
              </p>
            </header>

            <div className="split-result-context">
              <div className="split-result-context-item">
                <span className="split-result-context-label">Total bill</span>
                <span className="split-result-context-value amount--balance">
                  {formatInrFromPaise(result.amountPaise)}
                </span>
              </div>
              <div className="split-result-context-item">
                <span className="split-result-context-label">Split between</span>
                <span className="split-result-context-value">
                  {result.participants}{' '}
                  {result.participants === 1 ? 'person' : 'people'}
                </span>
              </div>
            </div>

            <div className="split-result-per-person">
              <p className="split-result-per-person-label">
                {result.shares.length === 1
                  ? 'Each person pays'
                  : `Typical share (${primaryShare.count} ${
                      primaryShare.count === 1 ? 'person' : 'people'
                    })`}
              </p>
              <p className="split-result-per-person-amount">
                {formatInrFromPaise(primaryShare.amountPaise)}
              </p>
              {result.shares.length > 1 && (
                <p className="split-result-per-person-note">
                  {result.shares
                    .map(
                      (share) =>
                        `${share.count} ${share.count === 1 ? 'person' : 'people'} at ${formatInrFromPaise(share.amountPaise)}`,
                    )
                    .join(' · ')}
                </p>
              )}
            </div>

            {result.shares.length > 1 && (
              <section className="split-breakdown" aria-labelledby="split-breakdown-title">
                <h3 id="split-breakdown-title" className="split-breakdown-title">
                  Share breakdown
                </h3>
                <ul className="split-breakdown-list">
                  {result.shares.map((share) => (
                    <li
                      key={`${share.amountPaise}-${share.count}`}
                      className="split-breakdown-row"
                    >
                      <span className="split-breakdown-count">
                        {share.count} {share.count === 1 ? 'participant' : 'participants'}
                      </span>
                      <span className="split-breakdown-amount">
                        {formatInrFromPaise(share.amountPaise)} each
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="split-result-check">
              All shares add up to{' '}
              <strong>{formatInrFromPaise(result.assignedPaise)}</strong>
              {result.assignedPaise === result.amountPaise
                ? ' — matches the bill total.'
                : '.'}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

export default BillSplitter
