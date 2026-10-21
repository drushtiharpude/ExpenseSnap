import { useMemo, useState } from 'react'
import { readBudgets } from '../data/budgetStore.js'
import { readCategories } from '../data/categoryStore.js'
import { readTransactions } from '../data/transactionStore.js'
import { formatInrFromPaise } from '../transactions/money.js'
import PageHeader from '../ui/PageHeader.jsx'
import { PAGE_TAGLINES } from '../ui/pageHeaderCopy.js'
import { MoneyCoachBriefIcon } from '../ui/shellIcons.jsx'
import {
  buildMoneyCoachBrief,
  budgetProgressPercent,
  budgetUsagePercent,
} from './moneyCoachBrief.js'
import { buildMoneyCoachSummary } from './moneyCoachSummary.js'
import './finance.css'
import './moneyCoach.css'

function storageErrorMessage(result) {
  if (result.error === 'unavailable') {
    return 'Browser storage is unavailable. Existing data was left unchanged.'
  }
  if (result.error === 'malformed') {
    const detail = Array.isArray(result.errors) ? ` ${result.errors.join(' ')}` : ''
    return `Saved data could not be read.${detail}`
  }
  return 'Saved data could not be read.'
}

function readStorageState() {
  const tx = readTransactions()
  if (!tx.ok) return { records: null, loadError: tx, budgets: null, budgetsAvailable: false }
  const cat = readCategories()
  const categories = cat.ok ? cat.categories : []
  const categoryError = cat.ok ? null : cat
  const budgetRead = readBudgets(undefined, { customCategories: categories })
  return {
    records: tx.transactions,
    categories,
    budgets: budgetRead.ok ? budgetRead.budgets : null,
    budgetsAvailable: budgetRead.ok,
    loadError: null,
    categoryError,
    budgetError: budgetRead.ok ? null : budgetRead,
  }
}

function monthLabelPlain(monthKey) {
  const [year, monthNumber] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  )
}

function budgetFillClass(status) {
  if (status === 'exceeded') return 'analytics-budget-fill analytics-budget-fill--exceeded'
  if (status === 'approaching') return 'analytics-budget-fill analytics-budget-fill--approaching'
  return 'analytics-budget-fill'
}

function budgetRowClass(status) {
  if (status === 'exceeded') return 'analytics-budget-row analytics-budget-row--exceeded'
  if (status === 'approaching') return 'analytics-budget-row analytics-budget-row--approaching'
  return 'analytics-budget-row'
}

function HighlightBudgetBar({ row }) {
  const usagePercent = budgetUsagePercent(row.spentPaise, row.limitPaise)
  const progressPercent = budgetProgressPercent(row.spentPaise, row.limitPaise)
  return (
    <div className={`${budgetRowClass(row.status)} money-coach-highlight-budget`}>
      <div className="analytics-budget-row-header">
        <p className="analytics-budget-row-title">{row.label}</p>
        <span className="category-bar-share">{usagePercent}% of budget used</span>
      </div>
      <p className="analytics-budget-meta">
        Spent <strong>{formatInrFromPaise(row.spentPaise)}</strong> of{' '}
        <strong>{formatInrFromPaise(row.limitPaise)}</strong>
        {row.status === 'exceeded' ? (
          <>
            {' '}
            · over by <strong>{formatInrFromPaise(row.spentPaise - row.limitPaise)}</strong>
          </>
        ) : (
          <>
            {' '}
            · <strong>{formatInrFromPaise(row.remainingPaise)}</strong> left
          </>
        )}
      </p>
      <div
        className="analytics-budget-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        aria-valuetext={`${usagePercent}% of budget used`}
        aria-label={`${row.label} budget used`}
      >
        <div
          className={budgetFillClass(row.status)}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  )
}

function BriefStep({ label, children, variant = 'default', urgent = false, iconName }) {
  return (
    <article
      className={`dashboard-block money-coach-brief-card money-coach-brief-step money-coach-brief-step--${variant}${urgent ? ' money-coach-brief-step--urgent' : ''}`.trim()}
      aria-labelledby={`money-coach-${variant}-title`}
    >
      <header className="money-coach-brief-card__head">
        <span className="money-coach-brief-card__icon" aria-hidden="true">
          <MoneyCoachBriefIcon name={iconName} />
        </span>
        <h2 id={`money-coach-${variant}-title`} className="money-coach-brief-step__label">
          {label}
        </h2>
      </header>
      <div className="money-coach-brief-step__body">{children}</div>
    </article>
  )
}

function MoneyCoachSection() {
  const [storageState] = useState(readStorageState)
  const [coachNow] = useState(() => new Date())

  const { records, categories, budgets, budgetsAvailable, loadError, categoryError, budgetError } =
    storageState

  const summaryResult = useMemo(() => {
    if (!Array.isArray(records)) return null
    return buildMoneyCoachSummary({
      transactions: records,
      budgets: budgetsAvailable && Array.isArray(budgets) ? budgets : [],
      customCategories: categories,
      now: coachNow,
      budgetDataStatus: budgetsAvailable ? 'ok' : 'unavailable',
    })
  }, [records, budgets, categories, coachNow, budgetsAvailable])

  const brief = useMemo(() => {
    if (!summaryResult?.ok || !Array.isArray(records)) return null
    return buildMoneyCoachBrief({
      summary: summaryResult.summary,
      monthKey: summaryResult.month,
      customCategories: categories,
      records,
      budgets,
      budgetsAvailable,
      now: coachNow,
    })
  }, [summaryResult, records, budgets, categories, budgetsAvailable, coachNow])

  const netTone =
    summaryResult?.ok && summaryResult.summary.totals.netPaise < 0
      ? 'money-coach-metric--warn'
      : summaryResult?.ok && summaryResult.summary.totals.netPaise > 0
        ? 'money-coach-metric--ok'
        : ''

  return (
    <section className="finance money-coach" aria-labelledby="section-title">
      <PageHeader
        icon="coach"
        variant="hero"
        title="Money Coach"
        tagline={PAGE_TAGLINES.coach}
        description="This month’s priority and next steps. For charts and category breakdowns, use Analytics."
      />

      <p className="money-coach-local-note" role="status">
        Calculated locally from your saved data — not sent online and not generated by AI.
      </p>

      {loadError ? (
        <div className="form-alert" role="alert">
          {storageErrorMessage(loadError)}
        </div>
      ) : null}
      {categoryError ? (
        <div className="form-alert" role="alert">
          Categories could not be loaded; names in the brief may look incomplete.
        </div>
      ) : null}
      {budgetError ? (
        <div className="form-alert" role="alert">
          Saved budgets could not be read. Totals below are still correct, but budget guidance is
          limited until budgets load successfully.
        </div>
      ) : null}

      {!summaryResult?.ok && records !== null ? (
        <div className="form-alert" role="alert">
          We could not read your saved data for this month. Fix storage errors and refresh the page.
        </div>
      ) : null}

      {summaryResult?.ok && brief?.ok ? (
        <>
          <div className="dashboard-block money-coach-panel money-coach-panel--compact">
            <p className="money-coach-month-label">
              This month ({monthLabelPlain(summaryResult.month)})
            </p>
            <div className="money-coach-metrics">
              <dl className="money-coach-metric">
                <dt>Income</dt>
                <dd>{formatInrFromPaise(summaryResult.summary.totals.incomePaise)}</dd>
              </dl>
              <dl className="money-coach-metric">
                <dt>Expenses</dt>
                <dd>{formatInrFromPaise(summaryResult.summary.totals.expensePaise)}</dd>
              </dl>
              <dl className={`money-coach-metric money-coach-metric--balance ${netTone}`}>
                <dt>Remaining balance</dt>
                <dd>{formatInrFromPaise(summaryResult.summary.totals.netPaise)}</dd>
              </dl>
            </div>
          </div>

          <div className="money-coach-brief-grid">
            <BriefStep
              label="What needs attention?"
              variant="attention"
              iconName="attention"
              urgent={brief.priority === 'high'}
            >
              <p className="money-coach-brief-lead">{brief.attention}</p>
              {brief.highlightBudget ? (
                <HighlightBudgetBar row={brief.highlightBudget} />
              ) : null}
            </BriefStep>

            <BriefStep label="Why does it matter?" variant="why" iconName="why">
              <p className="money-coach-brief-text">{brief.why}</p>
            </BriefStep>

            <BriefStep label="What should I do next?" variant="next" iconName="next">
              {brief.nextSteps.length > 0 ? (
                <ul className="money-coach-brief-actions">
                  {brief.nextSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              ) : (
                <p className="money-coach-brief-text">
                  No specific steps right now — check back after more activity.
                </p>
              )}
            </BriefStep>
          </div>
        </>
      ) : null}
    </section>
  )
}

export default MoneyCoachSection
