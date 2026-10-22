import { categoryLabel } from '../transactions/categories.js'
import { formatInrFromPaise } from '../transactions/money.js'
import { goalRingMetrics } from './savingsGoalProgress.js'

const SAVINGS_RING_RADIUS = 34
const SAVINGS_RING_STROKE = 5
const SAVINGS_RING_SIZE = 80
const SAVINGS_RING_CX = 40
const SAVINGS_RING_CY = 40
const SAVINGS_RING_C = 2 * Math.PI * SAVINGS_RING_RADIUS

const DONUT_RADIUS = 52
const DONUT_STROKE = 14
const DONUT_CX = 80
const DONUT_CY = 80
const DONUT_C = 2 * Math.PI * DONUT_RADIUS

export function CategoryDonutChart({ segments, totalExpensePaise, customCategories, emptyMessage }) {
  if (!Number.isSafeInteger(totalExpensePaise) || totalExpensePaise < 1 || segments.length === 0) {
    return (
      <div className="dashboard-donut dashboard-donut--empty">
        <div className="dashboard-donut-visual">
          <svg viewBox="0 0 160 160" className="dashboard-donut-svg" aria-hidden="true">
            <circle
              cx={DONUT_CX}
              cy={DONUT_CY}
              r={DONUT_RADIUS}
              fill="none"
              stroke="var(--border)"
              strokeWidth={DONUT_STROKE}
            />
          </svg>
          <div className="dashboard-donut-center">
            <span className="dashboard-donut-center-label">Expenses</span>
            <span className="dashboard-donut-center-value">{formatInrFromPaise(0)}</span>
          </div>
        </div>
        <p className="dashboard-chart-empty">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="dashboard-donut">
      <div className="dashboard-donut-visual">
      <svg viewBox="0 0 160 160" className="dashboard-donut-svg" role="img" aria-label="Spending by category">
        <circle
          cx={DONUT_CX}
          cy={DONUT_CY}
          r={DONUT_RADIUS}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={DONUT_STROKE}
        />
        {segments.map((segment) => {
          const length = segment.fraction * DONUT_C
          const gap = DONUT_C - length
          const rotation = segment.startFraction * 360 - 90
          return (
            <circle
              key={segment.categoryId}
              cx={DONUT_CX}
              cy={DONUT_CY}
              r={DONUT_RADIUS}
              fill="none"
              stroke={segment.color}
              strokeWidth={DONUT_STROKE}
              strokeDasharray={`${length} ${gap}`}
              strokeLinecap="round"
              transform={`rotate(${rotation} ${DONUT_CX} ${DONUT_CY})`}
            />
          )
        })}
      </svg>
      <div className="dashboard-donut-center">
        <span className="dashboard-donut-center-label">Total</span>
        <span className="dashboard-donut-center-value amount--expense">
          {formatInrFromPaise(totalExpensePaise)}
        </span>
      </div>
      </div>
      <ul className="dashboard-donut-legend">
        {segments.map((segment) => (
          <li key={segment.categoryId} className="dashboard-donut-legend-item">
            <span className="dashboard-donut-swatch" style={{ background: segment.color }} aria-hidden="true" />
            <span className="dashboard-donut-legend-name">
              {categoryLabel(segment.categoryId, customCategories)}
            </span>
            <span className="dashboard-donut-legend-amount">{formatInrFromPaise(segment.amountPaise)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SavingsGoalProgressRing({ savedPaise, targetPaise, goalName }) {
  const metrics = goalRingMetrics(savedPaise, targetPaise)
  const arcLength = metrics.valid ? metrics.strokeFraction * SAVINGS_RING_C : 0
  const arcGap = SAVINGS_RING_C - arcLength
  const centerLabel = metrics.valid ? `${metrics.displayPercent}%` : '—'
  const ariaNow = metrics.valid ? Math.min(100, metrics.displayPercent) : 0
  const complete = metrics.valid && metrics.complete

  return (
    <div
      className={`dashboard-savings-ring${complete ? ' dashboard-savings-ring--complete' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={ariaNow}
      aria-valuetext={
        metrics.valid
          ? `${metrics.displayPercent}% of ${goalName} target saved`
          : `${goalName}: progress unavailable`
      }
    >
      <svg
        viewBox={`0 0 ${SAVINGS_RING_SIZE} ${SAVINGS_RING_SIZE}`}
        className="dashboard-savings-ring-svg"
        aria-hidden="true"
      >
        <circle
          cx={SAVINGS_RING_CX}
          cy={SAVINGS_RING_CY}
          r={SAVINGS_RING_RADIUS}
          fill="none"
          className="dashboard-savings-ring-track"
          stroke="var(--border-subtle)"
          strokeWidth={SAVINGS_RING_STROKE}
        />
        {metrics.valid && arcLength > 0 ? (
          <circle
            cx={SAVINGS_RING_CX}
            cy={SAVINGS_RING_CY}
            r={SAVINGS_RING_RADIUS}
            fill="none"
            className="dashboard-savings-ring-progress"
            strokeWidth={SAVINGS_RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${arcGap}`}
            transform={`rotate(-90 ${SAVINGS_RING_CX} ${SAVINGS_RING_CY})`}
          />
        ) : null}
      </svg>
      <span className="dashboard-savings-ring-label">{centerLabel}</span>
    </div>
  )
}

export function CashFlowBarChart({ rows, maxPaise }) {
  const chartHeight = 140
  const barGroupWidth = 56
  const barWidth = 18
  const gap = 6
  const width = rows.length * barGroupWidth + 24

  function barHeight(paise) {
    if (!Number.isSafeInteger(paise) || paise <= 0) return 0
    return Math.max(2, Math.round((paise / maxPaise) * chartHeight))
  }

  return (
    <div className="dashboard-cashflow">
      <div className="dashboard-cashflow-chart-scroll">
      <svg
        viewBox={`0 0 ${width} ${chartHeight + 36}`}
        className="dashboard-cashflow-svg"
        role="img"
        aria-label="Monthly income and expenses"
        preserveAspectRatio="xMidYMid meet"
      >
        {rows.map((row, index) => {
          const xBase = 12 + index * barGroupWidth
          const incomeH = barHeight(row.incomePaise)
          const expenseH = barHeight(row.expensePaise)
          const incomeY = chartHeight - incomeH
          const expenseY = chartHeight - expenseH
          return (
            <g key={row.monthKey}>
              <rect
                x={xBase}
                y={incomeY}
                width={barWidth}
                height={incomeH}
                rx={4}
                fill="var(--money-income)"
                aria-label={`${row.label} income`}
              />
              <rect
                x={xBase + barWidth + gap}
                y={expenseY}
                width={barWidth}
                height={expenseH}
                rx={4}
                fill="var(--money-expense)"
                aria-label={`${row.label} expenses`}
              />
              <text
                x={xBase + barWidth + gap / 2}
                y={chartHeight + 22}
                textAnchor="middle"
                className="dashboard-cashflow-month-label"
              >
                {row.label}
              </text>
            </g>
          )
        })}
      </svg>
      </div>
      <ul className="dashboard-cashflow-legend">
        <li>
          <span className="dashboard-cashflow-swatch dashboard-cashflow-swatch--income" aria-hidden="true" />
          Income
        </li>
        <li>
          <span className="dashboard-cashflow-swatch dashboard-cashflow-swatch--expense" aria-hidden="true" />
          Expenses
        </li>
      </ul>
    </div>
  )
}
