import { NOTHING_TODAY, NOTHING_TOMORROW, type TodayCardLines } from '@shared/today/today'
import { CHIP_SHADOW } from '../clay'
import { useLabelFit } from './useLabelFit'

/**
 * TASK-79: today's saved plans, under Home's date row. Its height is fixed
 * whenever it is switched on, so a plan being saved, a plan passing or
 * midnight never moves the tiles. Long or many plans shrink a little, then
 * clip; Buddy reads the whole card on request.
 */

const ROW_HEIGHT = 64

function PlanLine({
  label,
  items,
  none,
  testId,
  emphasis
}: {
  label: string
  items: string[]
  none: string
  testId: string
  emphasis: boolean
}) {
  const text = items.length ? items.join('  ·  ') : none
  const ref = useLabelFit<HTMLSpanElement>(text, `today-${testId}`)
  return (
    <div
      data-today-line={testId}
      data-today-empty={items.length ? undefined : ''}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 14,
        minWidth: 0,
        flex: emphasis ? '2 1 0' : '1 1 0',
        overflow: 'hidden',
        whiteSpace: 'nowrap'
      }}
    >
      <span
        style={{
          flex: 'none',
          fontWeight: 800,
          color: 'var(--ink,#2E2E2C)'
        }}
      >
        {label}
      </span>
      <span
        ref={ref}
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: 'calc(1em * var(--label-fit, 1))',
          fontWeight: items.length ? 700 : 500,
          color: items.length ? 'var(--ink,#2E2E2C)' : 'var(--ink2,#5E5D59)'
        }}
      >
        {text}
      </span>
    </div>
  )
}

export function TodayCard({ lines }: { lines: TodayCardLines }) {
  return (
    <section
      data-today-card
      aria-label="Today"
      style={{
        height: ROW_HEIGHT,
        flex: 'none',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 40,
        padding: '0 28px',
        borderRadius: 24,
        background: 'linear-gradient(180deg, var(--s1,#FBFAF7), var(--s2,#ECEAE5))',
        boxShadow: CHIP_SHADOW,
        fontSize: 'calc(30px * var(--font-scale, 1))',
        lineHeight: 1.2,
        overflow: 'hidden'
      }}
    >
      <PlanLine label="Today:" items={lines.today} none={NOTHING_TODAY} testId="today" emphasis />
      {lines.tomorrow && (
        <PlanLine
          label="Tomorrow:"
          items={lines.tomorrow}
          none={NOTHING_TOMORROW}
          testId="tomorrow"
          emphasis={false}
        />
      )}
    </section>
  )
}
