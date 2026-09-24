import type { WeatherCategory } from '@shared/ipcContract'

/**
 * The header weather chip's layered glassy icon, ported from the Clay
 * Launcher design (sun disc + cloud pill, each with their own inset
 * highlight + drop shadow). The design only showed "partly sunny" - this
 * extends the same visual language to the other WMO categories so the
 * glance icon actually reflects real conditions instead of always
 * showing sun+cloud.
 */
const SUN = (
  <div
    style={{
      position: 'absolute',
      left: 6,
      top: 0,
      width: 58,
      height: 58,
      borderRadius: '50%',
      background: 'linear-gradient(180deg,#F6E39A,#EDD376)',
      boxShadow: 'inset 0 2px 1px rgba(255,255,255,.7), 0 6px 12px rgba(170,140,40,.25)'
    }}
  />
)

function Cloud({ left = 26, top = 34 }: { left?: number; top?: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: 68,
        height: 38,
        borderRadius: 20,
        background: 'linear-gradient(180deg, var(--c1,#FFFFFF), var(--c2,#E3E1DC))',
        boxShadow: 'inset 0 2px 1px var(--hl,#fff), 0 8px 14px rgba(var(--sh,60,55,45),.18)'
      }}
    />
  )
}

function Drops() {
  return (
    <>
      {[18, 40, 62].map((left, i) => (
        <div
          key={left}
          style={{
            position: 'absolute',
            left,
            top: 70 + (i % 2) * 6,
            width: 6,
            height: 10,
            borderRadius: '0 50% 50% 50%',
            background: 'var(--dot,#2F7F62)',
            transform: 'rotate(45deg)'
          }}
        />
      ))}
    </>
  )
}

function Snow() {
  return (
    <>
      {[18, 40, 62].map((left, i) => (
        <div
          key={left}
          style={{
            position: 'absolute',
            left,
            top: 70 + (i % 2) * 6,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--c1,#FFFFFF)',
            boxShadow: '0 0 0 1px rgba(0,0,0,.08)'
          }}
        />
      ))}
    </>
  )
}

function Bolt() {
  return (
    <svg
      width={22}
      height={30}
      viewBox="0 0 22 30"
      style={{ position: 'absolute', left: 38, top: 62 }}
      fill="#EAD08C"
      stroke="rgba(0,0,0,.15)"
      strokeWidth={1}
    >
      <path d="M13 0 L2 18 H10 L7 30 L20 10 H12 Z" />
    </svg>
  )
}

function FogLines() {
  return (
    <>
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: 20 + i * 6,
            top: 60 + i * 12,
            width: 50 - i * 10,
            height: 6,
            borderRadius: 6,
            background: 'var(--c2,#E3E1DC)'
          }}
        />
      ))}
    </>
  )
}

export function WeatherGlyph({ category }: { category: WeatherCategory }) {
  return (
    <div style={{ position: 'relative', width: 96, height: 80, flex: 'none' }}>
      {category === 'clear' && SUN}
      {category === 'cloudy' && (
        <>
          {SUN}
          <Cloud />
        </>
      )}
      {category === 'fog' && (
        <>
          <Cloud top={30} />
          <FogLines />
        </>
      )}
      {category === 'rain' && (
        <>
          <Cloud top={30} />
          <Drops />
        </>
      )}
      {category === 'snow' && (
        <>
          <Cloud top={30} />
          <Snow />
        </>
      )}
      {category === 'storm' && (
        <>
          <Cloud top={30} />
          <Bolt />
        </>
      )}
    </div>
  )
}
