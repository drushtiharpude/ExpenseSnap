import { useState } from 'react'
import {
  addSavingsGoalEntry,
  createSavingsGoal,
  deleteSavingsGoal,
  goalSavedBalancePaise,
  updateSavingsGoal,
} from '../data/savingsGoal.js'
import { readSavingsGoals, saveSavingsGoals } from '../data/savingsGoalStore.js'
import { formatInrFromPaise, paiseToRupeeInput, rupeesInputToPaise } from '../transactions/money.js'
import PageHeader from '../ui/PageHeader.jsx'
import { PAGE_TAGLINES } from '../ui/pageHeaderCopy.js'
import { SavingsGoalIcon } from '../ui/shellIcons.jsx'
import {
  goalIsComplete,
  goalProgressBarWidth,
  goalProgressPercent,
  goalRemainingPaise,
  sortedSavingsEntries,
  summarizeSavingsGoals,
} from './savingsGoalProgress.js'
import './finance.css'

function storageErrorMessage(result, label) {
  if (result.error === 'unavailable') {
    return `Browser storage is unavailable. Saved ${label} were left unchanged.`
  }
  if (result.error === 'malformed') {
    const detail = Array.isArray(result.errors) ? ` ${result.errors.join(' ')}` : ''
    return `Saved ${label} could not be read. They were left unchanged.${detail}`
  }
  if (result.error === 'invalid') {
    const detail = Array.isArray(result.errors) ? ` ${result.errors.join(' ')}` : ''
    return `${label} could not be saved.${detail}`
  }
  if (result.error === 'quota') {
    return 'Browser storage is full. Changes were not saved.'
  }
  return `Saved ${label} could not be read. They were left unchanged.`
}

function readStorageState() {
  const result = readSavingsGoals()
  if (result.ok) return { goals: result.goals, loadError: null }
  return { goals: null, loadError: result }
}

function emptyGoalDraft() {
  return {
    name: '',
    targetRupees: '',
    targetDate: '',
    notes: '',
  }
}

function emptyEntryDraft() {
  return {
    type: 'deposit',
    amountRupees: '',
    date: '',
    note: '',
  }
}

function SavingsGoalsSection() {
  const [storageState, setStorageState] = useState(readStorageState)
  const [goalDraft, setGoalDraft] = useState(emptyGoalDraft)
  const [goalFormErrors, setGoalFormErrors] = useState([])
  const [actionError, setActionError] = useState(null)
  const [editGoalId, setEditGoalId] = useState(null)
  const [addFormOpen, setAddFormOpen] = useState(false)
  const [expandedGoalId, setExpandedGoalId] = useState(null)
  const showGoalForm = addFormOpen || editGoalId !== null
  const [entryDraft, setEntryDraft] = useState(emptyEntryDraft)
  const [entryErrors, setEntryErrors] = useState([])
  const [pendingHistoryDeleteId, setPendingHistoryDeleteId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const goals = storageState.goals
  const summary = goals ? summarizeSavingsGoals(goals) : null

  function finish() {
    setSubmitting(false)
  }

  function persist(nextGoals) {
    const saved = saveSavingsGoals(nextGoals)
    if (!saved.ok) {
      setActionError(storageErrorMessage(saved, 'savings goals'))
      finish()
      return false
    }
    setStorageState({ goals: saved.goals, loadError: null })
    setActionError(null)
    finish()
    return true
  }

  function handleGoalSubmit(event) {
    event.preventDefault()
    if (submitting || goals === null) return
    setSubmitting(true)
    setGoalFormErrors([])
    setActionError(null)

    const targetPaise = rupeesInputToPaise(goalDraft.targetRupees)
    if (targetPaise === null) {
      setGoalFormErrors(['Target amount must be a valid rupee amount.'])
      finish()
      return
    }

    const input = {
      name: goalDraft.name,
      targetPaise,
      targetDate: goalDraft.targetDate || null,
      notes: goalDraft.notes,
    }

    if (editGoalId) {
      const existing = goals.find((goal) => goal.id === editGoalId)
      if (!existing) {
        setGoalFormErrors(['This goal could not be found.'])
        finish()
        return
      }
      const updated = updateSavingsGoal(existing, input)
      if (!updated.ok) {
        setGoalFormErrors(updated.errors)
        finish()
        return
      }
      if (persist(goals.map((goal) => (goal.id === editGoalId ? updated.goal : goal)))) {
        setEditGoalId(null)
        setGoalDraft(emptyGoalDraft())
        setAddFormOpen(false)
      }
      return
    }

    const created = createSavingsGoal(input)
    if (!created.ok) {
      setGoalFormErrors(created.errors)
      finish()
      return
    }
    if (persist([...goals, created.goal])) {
      setGoalDraft(emptyGoalDraft())
      setAddFormOpen(false)
    }
  }

  function openAddGoalForm() {
    setEditGoalId(null)
    setGoalDraft(emptyGoalDraft())
    setGoalFormErrors([])
    setAddFormOpen(true)
  }

  function closeGoalForm() {
    setEditGoalId(null)
    setGoalDraft(emptyGoalDraft())
    setGoalFormErrors([])
    setAddFormOpen(false)
  }

  function startEditGoal(goal) {
    setAddFormOpen(false)
    setEditGoalId(goal.id)
    setGoalDraft({
      name: goal.name,
      targetRupees: paiseToRupeeInput(goal.targetPaise),
      targetDate: goal.targetDate ?? '',
      notes: goal.notes,
    })
    setGoalFormErrors([])
  }

  function requestDeleteGoal(goal) {
    if (goal.entries.length === 0) {
      if (!window.confirm(`Delete savings goal "${goal.name}"?`)) return
      setSubmitting(true)
      const removed = deleteSavingsGoal(goals, goal.id)
      if (!removed.ok) {
        setActionError(removed.errors.join(' '))
        finish()
        return
      }
      persist(removed.goals)
      if (expandedGoalId === goal.id) setExpandedGoalId(null)
      return
    }
    setPendingHistoryDeleteId(goal.id)
    setActionError(null)
  }

  function confirmDeleteWithHistory(goal) {
    setSubmitting(true)
    const removed = deleteSavingsGoal(goals, goal.id, { includeHistory: true })
    if (!removed.ok) {
      setActionError(removed.errors.join(' '))
      finish()
      return
    }
    if (persist(removed.goals)) {
      setPendingHistoryDeleteId(null)
      if (expandedGoalId === goal.id) setExpandedGoalId(null)
    }
  }

  function handleEntrySubmit(event, goal) {
    event.preventDefault()
    if (submitting || goals === null) return
    setSubmitting(true)
    setEntryErrors([])
    setActionError(null)

    const amountPaise = rupeesInputToPaise(entryDraft.amountRupees)
    if (amountPaise === null) {
      setEntryErrors(['Amount must be a valid rupee amount.'])
      finish()
      return
    }

    const updated = addSavingsGoalEntry(goal, {
      type: entryDraft.type,
      amountPaise,
      date: entryDraft.date,
      note: entryDraft.note,
    })
    if (!updated.ok) {
      setEntryErrors(updated.errors)
      finish()
      return
    }
    if (persist(goals.map((item) => (item.id === goal.id ? updated.goal : item)))) {
      setEntryDraft(emptyEntryDraft())
    }
  }

  if (storageState.loadError) {
    return (
      <div className="finance-page savings-goals">
        <PageHeader
          icon="savings"
          variant="standard"
          title="Savings Goals"
          tagline={PAGE_TAGLINES.savings}
          description="Track progress toward named targets with deposits and withdrawals."
        />
        <div className="alert alert--error" role="alert">
          <p>{storageErrorMessage(storageState.loadError, 'savings goals')}</p>
          <button type="button" className="btn" onClick={() => setStorageState(readStorageState())}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="finance-page savings-goals">
      <PageHeader
        icon="savings"
        variant="standard"
        title="Savings Goals"
        tagline={PAGE_TAGLINES.savings}
        description="Track progress toward named targets with deposits and withdrawals. Balances stay separate from everyday transactions."
      >
        <button
          type="button"
          className="btn btn--primary savings-goals-add-toggle"
          disabled={submitting}
          onClick={openAddGoalForm}
        >
          + Add Saving Goal
        </button>
      </PageHeader>

      {summary?.ok && summary.goalCount > 0 && (
        <section className="finance-panel savings-goals-summary" aria-labelledby="savings-summary-title">
          <header className="finance-panel-head">
            <h2 id="savings-summary-title" className="finance-panel-title">
              Progress overview
            </h2>
            <p className="finance-panel-sub">
              {summary.completedGoals} of {summary.goalCount} goal
              {summary.goalCount === 1 ? '' : 's'} reached ·{' '}
              {formatInrFromPaise(summary.totalSavedPaise)} saved toward{' '}
              {formatInrFromPaise(summary.totalTargetPaise)} in targets
            </p>
          </header>
        </section>
      )}

      {showGoalForm ? (
        <section className="finance-panel" aria-labelledby="savings-goal-form">
          <header className="finance-panel-head">
            <h2 id="savings-goal-form" className="finance-panel-title">
              {editGoalId ? 'Edit goal' : 'New savings goal'}
            </h2>
          </header>
          <form className="finance-form" onSubmit={handleGoalSubmit}>
            {goalFormErrors.length > 0 && (
              <ul className="form-errors" role="alert">
                {goalFormErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
            <label>
              Goal name
              <input
                value={goalDraft.name}
                maxLength={128}
                required
                onChange={(event) => setGoalDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              Target amount (₹)
              <input
                inputMode="decimal"
                value={goalDraft.targetRupees}
                required
                onChange={(event) =>
                  setGoalDraft((current) => ({ ...current, targetRupees: event.target.value }))
                }
              />
            </label>
            <label>
              Target date <span className="field-optional">(optional)</span>
              <input
                type="date"
                value={goalDraft.targetDate}
                onChange={(event) =>
                  setGoalDraft((current) => ({ ...current, targetDate: event.target.value }))
                }
              />
            </label>
            <label>
              Notes <span className="field-optional">(optional)</span>
              <textarea
                value={goalDraft.notes}
                maxLength={500}
                rows={2}
                onChange={(event) => setGoalDraft((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
            <div className="finance-form-actions">
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {editGoalId ? 'Save goal' : 'Add goal'}
              </button>
              <button type="button" className="btn" disabled={submitting} onClick={closeGoalForm}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {actionError ? (
        <div className="alert alert--error" role="alert">
          <p>{actionError}</p>
        </div>
      ) : null}

      <div className="savings-goals-list-wrap">
      {goals.length === 0 ? (
        <p className="finance-empty">
          No savings goals yet. Use <strong>+ Add Saving Goal</strong> to set a target and track progress.
        </p>
      ) : (
        <ul className="budget-list savings-goals-list">
          {goals.map((goal) => {
            const saved = goalSavedBalancePaise(goal.entries)
            const percent = goalProgressPercent(saved, goal.targetPaise)
            const barWidth = goalProgressBarWidth(saved, goal.targetPaise)
            const remaining = goalRemainingPaise(saved, goal.targetPaise)
            const expanded = expandedGoalId === goal.id
            const history = sortedSavingsEntries(goal.entries)
            const complete = goalIsComplete(saved, goal.targetPaise)

            return (
              <li
                key={goal.id}
                className={`finance-panel savings-goal-card${complete ? ' savings-goal-card--complete' : ''}`}
              >
                <div className="budget-row-main">
                  <span className="budget-row-icon" aria-hidden>
                    <SavingsGoalIcon />
                  </span>
                  <div className="budget-row-copy">
                    <p className="budget-row-title">{goal.name}</p>
                    <p className="budget-row-meta savings-goal-amounts">
                      <span className="savings-goal-saved">{formatInrFromPaise(saved)}</span>
                      <span className="savings-goal-target-of">
                        {' '}
                        of {formatInrFromPaise(goal.targetPaise)}
                      </span>
                      <span className="savings-goal-percent"> ({percent}%)</span>
                      {goal.targetDate ? (
                        <span className="savings-goal-meta-extra"> · Target {goal.targetDate}</span>
                      ) : null}
                      {complete ? <span className="savings-goal-status-complete"> · Complete</span> : null}
                    </p>
                    {goal.notes ? <p className="savings-goal-notes">{goal.notes}</p> : null}
                  </div>
                </div>
                <div
                  className="dashboard-sts-progress savings-goal-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={barWidth}
                  aria-label={`${percent}% of ${goal.name} target saved`}
                >
                  <div className="dashboard-sts-progress-fill" style={{ width: `${barWidth}%` }} />
                </div>
                {!complete && remaining !== null ? (
                  <p className="savings-goal-remaining">{formatInrFromPaise(remaining)} left to reach target</p>
                ) : null}
                <div className="budget-row-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={submitting}
                    onClick={() => {
                      setExpandedGoalId(expanded ? null : goal.id)
                      setEntryDraft(emptyEntryDraft())
                      setEntryErrors([])
                    }}
                  >
                    {expanded ? 'Hide activity' : 'Add deposit / withdrawal'}
                  </button>
                  <button type="button" className="btn" disabled={submitting} onClick={() => startEditGoal(goal)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn--danger" disabled={submitting} onClick={() => requestDeleteGoal(goal)}>
                    Delete
                  </button>
                </div>

                {pendingHistoryDeleteId === goal.id && (
                  <div className="alert alert--warning" role="alert">
                    <p>
                      This goal has {goal.entries.length} saved{' '}
                      {goal.entries.length === 1 ? 'entry' : 'entries'}. Deleting will remove the goal
                      and all its history permanently.
                    </p>
                    <div className="finance-form-actions">
                      <button
                        type="button"
                        className="btn btn--danger"
                        disabled={submitting}
                        onClick={() => confirmDeleteWithHistory(goal)}
                      >
                        Delete goal and history
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={submitting}
                        onClick={() => setPendingHistoryDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {expanded && (
                  <div className="savings-goal-detail">
                    <form className="finance-form" onSubmit={(event) => handleEntrySubmit(event, goal)}>
                      {entryErrors.length > 0 && (
                        <ul className="form-errors" role="alert">
                          {entryErrors.map((error) => (
                            <li key={error}>{error}</li>
                          ))}
                        </ul>
                      )}
                      <label>
                        Type
                        <select
                          value={entryDraft.type}
                          onChange={(event) =>
                            setEntryDraft((current) => ({ ...current, type: event.target.value }))
                          }
                        >
                          <option value="deposit">Deposit</option>
                          <option value="withdrawal">Withdrawal</option>
                        </select>
                      </label>
                      <label>
                        Amount (₹)
                        <input
                          inputMode="decimal"
                          value={entryDraft.amountRupees}
                          required
                          onChange={(event) =>
                            setEntryDraft((current) => ({ ...current, amountRupees: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Date
                        <input
                          type="date"
                          value={entryDraft.date}
                          required
                          onChange={(event) =>
                            setEntryDraft((current) => ({ ...current, date: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Note <span className="field-optional">(optional)</span>
                        <input
                          value={entryDraft.note}
                          maxLength={500}
                          onChange={(event) =>
                            setEntryDraft((current) => ({ ...current, note: event.target.value }))
                          }
                        />
                      </label>
                      <button type="submit" className="btn btn--primary" disabled={submitting}>
                        Record entry
                      </button>
                    </form>

                    <section aria-labelledby={`history-${goal.id}`}>
                      <h3 id={`history-${goal.id}`} className="finance-panel-title">
                        History
                      </h3>
                      {history.length === 0 ? (
                        <p className="finance-empty">No deposits or withdrawals yet.</p>
                      ) : (
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th scope="col">Date</th>
                              <th scope="col">Type</th>
                              <th scope="col">Amount</th>
                              <th scope="col">Note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.map((entry) => (
                              <tr key={entry.id}>
                                <td>{entry.date}</td>
                                <td>{entry.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</td>
                                <td className={entry.type === 'deposit' ? 'amount--income' : 'amount--expense'}>
                                  {entry.type === 'withdrawal' ? '−' : '+'}
                                  {formatInrFromPaise(entry.amountPaise)}
                                </td>
                                <td>{entry.note || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </section>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      </div>
    </div>
  )
}

export default SavingsGoalsSection
