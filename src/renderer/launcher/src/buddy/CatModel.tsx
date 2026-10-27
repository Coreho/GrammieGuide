import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { BuddyActivity, BuddyMotion } from '@shared/buddy/buddyMachine'
import { lookWeight, lookYaw } from '@shared/buddy/headLook'
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
/**
 * Clips that start or end in another pose blend slowly, so he sits down and
 * gets up rather than dropping into the pose: doze is seated throughout.
 */
const SLOW_FADE_S: Partial<Record<ClipName, number>> = { doze: 1.2 }
const ARRIVE_EPS = 0.01
/** Walking yaw: a three-quarter turn, so she still sees his face on the way. */
const WALK_YAW = 1.05
const TURN_RATE = 6
const UP = new THREE.Vector3(0, 1, 0)

// No Draco or Meshopt: the file uses neither, and drei would otherwise wire
// up decoders - Draco's fetches from a CDN (this is an offline kiosk) and
// Meshopt's compiles WebAssembly, which the launcher's CSP rightly forbids.
useGLTF.preload(buddyUrl, false, false)

export type BuddyCatProps = {
  motion: BuddyMotion
  activity: BuddyActivity
  forcedClip: ClipName | null
  /** The gesture a spoken chat line opens with, before the usual talking gestures. */
  openingClip: ClipName | null
  commandSequence: number
  /** Bumped by each gesture she asks for, so the same gesture twice plays twice. */
  gestureSequence: number
  /** World x he should be at; he walks there if he isn't. */
  targetX: number
  /** World x on first mount. */
  startX: number
  /** Which way to face when standing still (0 = straight at her). */
  restYaw: number
  night: boolean
  /** Her music is playing: his fidgets sway and dance along. */
  music: boolean
  /** Brisk walk instead of a stroll (heading over to chat). */
  hurry: boolean
  /** Where she last tapped on Home (world x) and when (performance.now()). */
  lookAt: { worldX: number; at: number } | null
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

  // His glance toward her taps is added to the Head bone after the mixer has
  // posed him, so it rides on top of whatever clip is playing.
  const head = useMemo(() => scene.getObjectByName('Head') ?? null, [scene])
  const glance = useRef({
    parent: new THREE.Quaternion(),
    inverse: new THREE.Quaternion(),
    turn: new THREE.Quaternion(),
    // What the clip left and what we wrote, so a frame where the mixer didn't
    // touch the bone can't stack another turn on top of the last one.
    base: new THREE.Quaternion(),
    written: new THREE.Quaternion(),
    applied: false
  })

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
      next.setEffectiveTimeScale(
        live.current.night && (name === 'idle_calm' || name === 'idle_soft') ? 0.8 : 1
      )
      next.setEffectiveWeight(1)
      const fade = Math.max(SLOW_FADE_S[name] ?? FADE_S, (prev && SLOW_FADE_S[prev.name]) ?? FADE_S)
      next.fadeIn(fade).play()
      if (prev && prev.action !== next) prev.action.fadeOut(fade)
      current.current = { name, action: next }
    },
    [actions]
  )

  const playForActivity = useCallback(() => {
    const activity = live.current.activity
    const name =
      live.current.forcedClip ??
      live.current.openingClip ??
      pickClip(activity, {
        random: Math.random,
        night: live.current.night,
        motion: live.current.motion,
        music: live.current.music,
        last: lastPicked.current
      })
    lastPicked.current = name
    play(name, loopsFor(activity))
  }, [play])

  // A new activity starts its clip now - unless he's mid-walk, in which case
  // arriving starts it.
  useEffect(() => {
    if (!moving.current) playForActivity()
  }, [
    props.activity,
    props.forcedClip,
    props.openingClip,
    props.commandSequence,
    props.gestureSequence,
    props.motion,
    playForActivity
  ])

  useEffect(() => {
    const onFinished = (e: { action: THREE.AnimationAction }): void => {
      if (e.action !== current.current?.action) return
      const activity = live.current.activity
      // He keeps gesturing for as long as he's speaking; the panel says when that stops.
      if (activity === 'chat.talking' && live.current.motion !== 'reduced') {
        // A line's opening gesture plays once; the machine clears it and the
        // change starts the usual talking gestures.
        if (live.current.openingClip) live.current.onClipDone()
        else playForActivity()
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

    if (p.activity === 'commanded') {
      // A deliberate gesture stops him where he is, even halfway through a stroll.
      if (moving.current) {
        moving.current = false
        p.onArrived(g.position.x)
        playForActivity()
      }
    } else if (Math.abs(dx) > ARRIVE_EPS) {
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

    if (head?.parent) {
      const q = glance.current
      if (q.applied && head.quaternion.equals(q.written)) head.quaternion.copy(q.base)
      q.applied = false
      const weight = p.lookAt ? lookWeight(performance.now() - p.lookAt.at, p.motion) : 0
      if (p.lookAt && weight > 0) {
        const angle = lookYaw(p.lookAt.worldX - g.position.x, yaw.current, p.motion) * weight
        q.base.copy(head.quaternion)
        // A turn about world up, expressed in the head's parent space.
        head.parent.getWorldQuaternion(q.parent)
        q.turn.setFromAxisAngle(UP, angle)
        q.inverse.copy(q.parent).invert()
        q.turn.premultiply(q.inverse).multiply(q.parent)
        head.quaternion.premultiply(q.turn)
        q.written.copy(head.quaternion)
        q.applied = true
      }
    }
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
