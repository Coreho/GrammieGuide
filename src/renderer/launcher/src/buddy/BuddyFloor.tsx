import { Component, Suspense, useCallback, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { zLayers } from '@shared/zLayers'
import {
  isNight,
  type BuddyActivity,
  type ChatPhase,
  type Chattiness,
  type BuddyMotion
} from '@shared/buddy/buddyMachine'
import type { RemarkWeather } from '@shared/buddy/remarks'
import type { BuddyCommand, ClipName } from '@shared/buddy/commands'
import { CHIP_SHADOW, CLAY_UP } from '../clay'
import { BuddyCat } from './CatModel'
import { useBuddyBrain } from './useBuddyBrain'

/**
 * Buddy's floor spans the full bottom of Home. The footer still reserves
 * only 150px. He walks to the right of the chat panel when she talks to him.
 *
 * The canvas is taller than the footer so raised arms and his speech bubble
 * have room, and it never takes pointer events - taps on whatever is behind
 * it go through. His invisible tap button and the chat invitation in his
 * bubble follow him around, updated per frame without React re-renders.
 *
 * The Canvas measures its container in layout pixels (see the resize prop
 * below), so his zoom, walking range and on-screen projection are the same
 * whatever the window size is.
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
  chatInvitation: 'visible' | 'fading' | null
  onChat: () => void
  command: (BuddyCommand & { sequence: number }) | null
  chatOpen: boolean
  chatPhase: ChatPhase
  onTap: () => void
  motion: BuddyMotion
  chattiness: Chattiness
  hour: number
  weather: RemarkWeather | null
}

export function BuddyFloor(props: FloorProps) {
  const position = useRef<number | undefined>(undefined)
  const getPosition = useCallback(() => position.current, [])
  const brain = useBuddyBrain({ ...props, getPosition })
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
    else props.onTap()
  }

  const ctx = brain.context
  return (
    <div
      data-buddy-floor
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 32,
        height: FOOTER_H,
        pointerEvents: 'none'
      }}
    >
      <div
        ref={layerRef}
        data-buddy-activity={brain.activity}
        data-buddy-motion={ctx?.motion}
        data-buddy-clip={ctx?.forcedClip ?? undefined}
        data-buddy-target={ctx?.target}
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
              // Measure layout pixels, not the scaled box. Stage scales itself with a
              // CSS transform and R3F measures with getBoundingClientRect, which already
              // includes that scale - so the canvas would be sized in scaled pixels and
              // then scaled again, leaving him short of his floor's ends, floating, and
              // with his tap target outside the Stage. A transform change also never fires
              // ResizeObserver, so the wrong size would never correct itself on resize.
              resize={{ offsetSize: true }}
              camera={{ position: CAMERA_POS, zoom: 100, near: 0.1, far: 40 }}
              gl={{ alpha: true, antialias: true }}
              style={{ background: 'transparent', pointerEvents: 'none' }}
            >
              <hemisphereLight args={['#fffaf0', '#8a7a66', 1.6]} />
              <directionalLight position={[2, 4, 5]} intensity={1.3} />
              <directionalLight position={[-3, 2, -2]} intensity={0.35} />
              <Suspense fallback={null}>
                <FloorScene
                  motion={ctx.motion}
                  activity={brain.activity}
                  forcedClip={ctx.forcedClip}
                  commandSequence={ctx.commandSequence}
                  target={ctx.target}
                  start={ctx.position}
                  night={isNight(props.hour)}
                  chatOpen={props.chatOpen}
                  onClipDone={() => brain.send({ type: 'CLIP_DONE' })}
                  onArrived={(at) => brain.send({ type: 'ARRIVED', at })}
                  onPosition={(at) => {
                    position.current = at
                  }}
                  onScreen={onScreen}
                />
              </Suspense>
            </Canvas>
          </ModelErrorBoundary>
        )}

        {(ctx?.bubble || props.chatInvitation) && (
          <div
            ref={bubbleRef}
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
              overflowWrap: 'anywhere',
              transition: 'opacity .4s'
            }}
          >
            {ctx?.bubble && <div role="status">{ctx.bubble}</div>}
            {props.chatInvitation && (
              <button
                type="button"
                data-buddy-chat-invite
                onClick={props.onChat}
                disabled={props.chatInvitation === 'fading'}
                style={{
                  display: 'block',
                  width: '100%',
                  minHeight: 64,
                  marginTop: ctx?.bubble ? 14 : 0,
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: 40,
                  background: 'linear-gradient(180deg, var(--s1,#FBFAF7), var(--s2,#ECEAE5))',
                  boxShadow: CLAY_UP,
                  color: 'var(--ink,#2E2E2C)',
                  fontFamily: 'inherit',
                  fontSize: 'calc(28px * var(--font-scale, 1))',
                  fontWeight: 800,
                  cursor: 'pointer',
                  pointerEvents: props.chatInvitation === 'visible' ? 'auto' : 'none',
                  opacity: props.chatInvitation === 'visible' ? 1 : 0,
                  transition: 'opacity .4s'
                }}
              >
                💬 Let's chat
              </button>
            )}
          </div>
        )}

        <button
          ref={hitRef}
          data-buddy-tap
          aria-label="Say hello to Buddy"
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
  motion: BuddyMotion
  activity: BuddyActivity
  forcedClip: ClipName | null
  commandSequence: number
  target: number
  start: number
  night: boolean
  chatOpen: boolean
  onClipDone: () => void
  onArrived: (at: number) => void
  onPosition: (at: number) => void
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
      motion={props.motion}
      activity={props.activity}
      forcedClip={props.forcedClip}
      commandSequence={props.commandSequence}
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
        props.onPosition(toFraction(wx))
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
