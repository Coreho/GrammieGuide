import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { BuddyActivity } from '@shared/buddy/buddyMachine'
import { WALK_SPEED, loopsFor, pickClip, restingLoop, type ClipName } from './clips'
import buddyUrl from './assets/buddy.glb?url'

/**
 * Buddy himself: the rigged cat from assets/buddy.glb, replacing M3's
 * procedural stand-in built from spheres and cones. This component only
 * knows how to *show* an activity - which clip, where to stand, which way to
 * face. Deciding the activity is the behavior machine's job
 * (shared/buddy/buddyMachine.ts, run by useBuddyBrain).
 *
 * Movement is here rather than in the clips: every clip is baked in place,
 * and he's slid across the floor at the walk clip's own stride speed so his
 * feet don't skate. A one-shot that's requested while he's still walking
 * waits until he arrives.
 */

const FADE_S = 0.35
const ARRIVE_EPS = 0.01
/** Walking yaw: a three-quarter turn, so she still sees his face on the way. */
const WALK_YAW = 1.05
const TURN_RATE = 6

// No Draco or Meshopt: the file uses neither, and drei would otherwise wire
// up decoders - Draco's fetches from a CDN (this is an offline kiosk) and
// Meshopt's compiles WebAssembly, which the launcher's CSP rightly forbids.
useGLTF.preload(buddyUrl, false, false)

export type BuddyCatProps = {
  activity: BuddyActivity
  /** World x he should be at; he walks there if he isn't. */
  targetX: number
  /** World x on first mount. */
  startX: number
  /** Which way to face when standing still (0 = straight at her). */
  restYaw: number
  night: boolean
  /** Brisk walk instead of a stroll (heading over to chat). */
  hurry: boolean
  onClipDone: () => void
  onArrived: (x: number) => void
  /** Every frame, where he is now - for the DOM tap target and speech bubble. */
  onPosition: (x: number) => void
}

export function BuddyCat(props: BuddyCatProps) {
  const root = useRef<THREE.Group>(null)
  const turn = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF(buddyUrl, false, false)
  const { actions, mixer } = useAnimations(animations, root)

  const current = useRef<{ name: ClipName; action: THREE.AnimationAction } | null>(null)
  const lastPicked = useRef<ClipName | null>(null)
  const moving = useRef(false)
  const yaw = useRef(props.restYaw)
  // Latest props for the frame loop and mixer callbacks, without re-subscribing.
  const live = useRef(props)
  live.current = props

  useMemo(() => {
    // Skinned meshes are culled by their bind-pose bounds, which a raised arm
    // or a bow can leave; he's the only thing in the scene, so never cull.
    scene.traverse((obj) => {
      obj.frustumCulled = false
    })
  }, [scene])

  useLayoutEffect(() => {
    if (root.current) root.current.position.x = live.current.startX
  }, [])

  const play = useCallback(
    (name: ClipName, loop: boolean) => {
      const next = actions[name]
      if (!next) return
      const prev = current.current
      const once = !loop
      if (prev?.name === name && !once) return
      next.reset()
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
      next.clampWhenFinished = once
      // Drowsier idles at night.
      next.setEffectiveTimeScale(live.current.night && (name === 'idle_calm' || name === 'idle_soft') ? 0.8 : 1)
      next.setEffectiveWeight(1)
      next.fadeIn(FADE_S).play()
      if (prev && prev.action !== next) prev.action.fadeOut(FADE_S)
      current.current = { name, action: next }
    },
    [actions]
  )

  const playForActivity = useCallback(() => {
    const activity = live.current.activity
    const name = pickClip(activity, { random: Math.random, night: live.current.night, last: lastPicked.current })
    lastPicked.current = name
    play(name, loopsFor(activity))
  }, [play])

  // A new activity starts its clip now - unless he's mid-walk, in which case
  // arriving starts it.
  useEffect(() => {
    if (!moving.current) playForActivity()
  }, [props.activity, playForActivity])

  useEffect(() => {
    const onFinished = (e: { action: THREE.AnimationAction }): void => {
      if (e.action !== current.current?.action) return
      const activity = live.current.activity
      // He keeps gesturing for as long as he's speaking; the panel says when that stops.
      if (activity === 'chat.talking') {
        playForActivity()
        return
      }
      // Settle into the resting loop first, so if the machine has nothing new
      // for him he isn't left frozen on a one-shot's last frame.
      play(restingLoop(activity), true)
      live.current.onClipDone()
    }
    mixer.addEventListener('finished', onFinished)
    return () => mixer.removeEventListener('finished', onFinished)
  }, [mixer, play, playForActivity])

  useFrame((_, delta) => {
    const g = root.current
    if (!g) return
    const dt = Math.min(delta, 0.1)
    const p = live.current
    const dx = p.targetX - g.position.x
    let wantYaw = p.restYaw

    if (Math.abs(dx) > ARRIVE_EPS) {
      const walkClip: ClipName = p.hurry ? 'walk' : 'walk_casual'
      if (!moving.current || current.current?.name !== walkClip) play(walkClip, true)
      moving.current = true
      const dir = Math.sign(dx)
      g.position.x += dir * Math.min(Math.abs(dx), (WALK_SPEED[walkClip] ?? 0.3) * dt)
      wantYaw = dir * WALK_YAW
    } else if (moving.current) {
      moving.current = false
      g.position.x = p.targetX
      p.onArrived(g.position.x)
      if (p.activity === 'strolling') play(restingLoop(p.activity), true)
      else playForActivity()
    }

    yaw.current += (wantYaw - yaw.current) * (1 - Math.exp(-TURN_RATE * dt))
    if (turn.current) turn.current.rotation.y = yaw.current
    p.onPosition(g.position.x)
  })

  return (
    <group ref={root}>
      <group ref={turn}>
        <primitive object={scene} />
      </group>
      {/* soft contact shadow, so he stands on the floor rather than floating over it */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.004} scale={[1, 0.5, 1]}>
        <circleGeometry args={[0.42, 40]} />
        <meshBasicMaterial color="#3c372d" transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </group>
  )
}
