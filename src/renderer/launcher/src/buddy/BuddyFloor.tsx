import { Component, Suspense, useCallback, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { zLayers } from '@shared/zLayers'
import { isNight, type BuddyActivity, type ChatPhase, type Chattiness } from '@shared/buddy/buddyMachine'
import type { RemarkWeather } from '@shared/buddy/remarks'
import { CHIP_SHADOW } from '../clay'
import { BuddyCat } from './CatModel'
import { useBuddyBrain } from './useBuddyBrain'

/**
 * Buddy's strip of floor along the bottom of Home, right of the text-size
 * control. Replaces M3's fixed 150x150 corner canvas: he now strolls the
 * whole strip, never over the tiles (the strip is the footer row itself),
 * and walks over beside the chat panel when she talks to him.
 *
 * The canvas is taller than the footer so raised arms and his speech bubble
 * have room, and it never takes pointer events - taps on whatever is behind
 * it go through. The only tappable thing is an invisible button that
 * follows him around, updated per frame without React re-renders.
 */

/** Canvas height; the footer row itself stays 150px so the tile grid keeps its space. */
const FLOOR_H = 250
const FOOTER_H = 150
/** World units visible top to bottom (he's 1.42 tall). */
const VIEW_H = 1.95
/** Keep this much world space between him and either end of the strip. */
const EDGE = 0.55
const CAMERA_POS: [number, number, number] = [0, 3, 10]
const LOOK_Y = 0.88
const HIT_W = 150
const HIT_H = 200
const BUBBLE_MAX_W = 380
/** Head height used to place the bubble; a bit above his ears. */
const HEAD_Y = 1.55

type FloorProps = {
  chatOpen: boolean
  chatPhase: ChatPhase
  onOpenChat: () => void
  roaming: boolean
  chattiness: Chattiness
  hour: number
  weather: RemarkWeather | null
}

export function BuddyFloor(props: FloorProps) {
  const brain = useBuddyBrain(props)
  const hitRef = useRef<HTMLButtonElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)

  const onScreen = useCallback((px: { x: number; headBottom: number }) => {
    const hit = hitRef.current
    if (hit) hit.style.transform = `translateX(${Math.round(px.x - HIT_W / 2)}px)`
    const bubble = bubbleRef.current
    const width = layerRef.current?.clientWidth ?? 0
    if (bubble && width) {
      // Centered over him, but kept inside the strip at either end.
      const half = Math.min(bubble.offsetWidth, BUBBLE_MAX_W) / 2
      const x = Math.max(half + 8, Math.min(width - half - 8, px.x))
      bubble.style.left = `${Math.round(x - half)}px`
      bubble.style.bottom = `${Math.round(px.headBottom + 14)}px`
      bubble.style.opacity = '1'
    }
  }, [])

  const handleTap = (): void => {
    if (props.chatOpen) brain.send({ type: 'PET' })
    else props.onOpenChat()
  }

  const ctx = brain.context
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, height: FOOTER_H }}>
      <div
        ref={layerRef}
        data-buddy-activity={brain.activity}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: FLOOR_H,
          zIndex: props.chatOpen ? zLayers.buddyInChat : zLayers.buddyCanvas,
          pointerEvents: 'none'
        }}
      >
        {ctx && (
          <ModelErrorBoundary>
            <Canvas
              orthographic
              flat
              dpr={[1, 1.5]}
              camera={{ position: CAMERA_POS, zoom: 100, near: 0.1, far: 40 }}
              gl={{ alpha: true, antialias: true }}
              style={{ background: 'transparent', pointerEvents: 'none' }}
            >
              <hemisphereLight args={['#fffaf0', '#8a7a66', 1.6]} />
              <directionalLight position={[2, 4, 5]} intensity={1.3} />
              <directionalLight position={[-3, 2, -2]} intensity={0.35} />
              <Suspense fallback={null}>
                <FloorScene
                  activity={brain.activity}
                  target={ctx.target}
                  start={ctx.position}
                  night={isNight(props.hour)}
                  chatOpen={props.chatOpen}
                  onClipDone={() => brain.send({ type: 'CLIP_DONE' })}
                  onArrived={(at) => brain.send({ type: 'ARRIVED', at })}
                  onScreen={onScreen}
                />
              </Suspense>
            </Canvas>
          </ModelErrorBoundary>
        )}

        {ctx?.bubble && (
          <div
            ref={bubbleRef}
            role="status"
            style={{
              position: 'absolute',
              left: 0,
              bottom: FLOOR_H,
              opacity: 0,
              maxWidth: BUBBLE_MAX_W,
              padding: '14px 22px',
              borderRadius: 26,
              background: 'linear-gradient(180deg, var(--s1,#FBFAF7), var(--s2,#ECEAE5))',
              boxShadow: CHIP_SHADOW,
              color: 'var(--ink,#2E2E2C)',
              fontSize: 'calc(24px * var(--font-scale, 1))',
              fontWeight: 700,
              lineHeight: 1.25,
              textAlign: 'center',
              transition: 'opacity .4s'
            }}
          >
            {ctx.bubble}
          </div>
        )}

        <button
          ref={hitRef}
          aria-label="Talk to your companion"
          onClick={handleTap}
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: HIT_W,
            height: HIT_H,
            padding: 0,
            border: 'none',
            borderRadius: 60,
            background: 'transparent',
            cursor: 'pointer',
            pointerEvents: 'auto'
          }}
        />
      </div>
    </div>
  )
}

function FloorScene(props: {
  activity: BuddyActivity
  target: number
  start: number
  night: boolean
  chatOpen: boolean
  onClipDone: () => void
  onArrived: (at: number) => void
  onScreen: (px: { x: number; headBottom: number }) => void
}) {
  const { size, camera } = useThree()
  const zoom = size.height / VIEW_H
  const usable = Math.max(0, size.width / zoom / 2 - EDGE)
  const toWorld = (f: number): number => -usable + f * 2 * usable
  const toFraction = (x: number): number => (usable > 0 ? (x + usable) / (2 * usable) : 0.5)

  useLayoutEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.zoom = zoom
    cam.position.set(...CAMERA_POS)
    cam.lookAt(0, LOOK_Y, 0)
    cam.updateProjectionMatrix()
  }, [camera, zoom])

  const x = useRef(toWorld(props.start))
  const feet = useRef(new THREE.Vector3())
  const head = useRef(new THREE.Vector3())
  useFrame(() => {
    feet.current.set(x.current, 0, 0).project(camera)
    head.current.set(x.current, HEAD_Y, 0).project(camera)
    props.onScreen({
      x: ((feet.current.x + 1) / 2) * size.width,
      headBottom: ((head.current.y + 1) / 2) * size.height
    })
  })

  return (
    <BuddyCat
      activity={props.activity}
      targetX={toWorld(props.target)}
      startX={toWorld(props.start)}
      // In chat he half-turns toward the panel on his left.
      restYaw={props.chatOpen ? -0.35 : 0}
      night={props.night}
      hurry={props.chatOpen}
      onClipDone={props.onClipDone}
      onArrived={(wx) => props.onArrived(toFraction(wx))}
      onPosition={(wx) => {
        x.current = wx
      }}
    />
  )
}

/**
 * If the model ever fails to load, Buddy is simply absent - never an error
 * on her screen. Home works the same without him.
 */
class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(error: unknown): void {
    console.error('[buddy] model failed to load', error)
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
