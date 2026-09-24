import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * A simple procedural low-poly cat, built entirely from primitives rather
 * than an imported asset - no external glTF, no network dependency, no
 * licensing question. Styled to match the approved reference character
 * (CatPic.jpeg): ginger tabby with a cream muzzle/belly, sunglasses, and a
 * bow tie. This can be swapped for a proper modeled/rigged asset later
 * without touching anything else (BuddyCanvas only needs a component to
 * mount).
 *
 * Calm by design: idle breathing bob + occasional blink + slow tail sway.
 * No unsolicited animation beyond that - matches the plan's requirement
 * that Buddy default to calm, not the old app's constant fidgeting.
 */

const FUR_COLOR = '#E8963D'
const FUR_DARK = '#C06A1E'
const CREAM = '#FBEFDD'
const EYE_COLOR = '#3A2E22'
const LENS_COLOR = '#26262B'
const BOWTIE_COLOR = '#8A5A34'

const HEAD_RADIUS = 0.42
const EAR_RADIUS = 0.13
const EAR_HEIGHT = 0.3

/**
 * A cone's default pivot is its own center, with its wide base trailing
 * behind that pivot along -Y. Placing an ear by eyeballing a position
 * left most of the base still submerged inside the head sphere, so only
 * the narrow tip poked out (looked like a sliver, not an ear, no matter
 * how big the cone was). This instead places the cone's BASE at the head
 * surface and orients it to point straight out along the surface normal,
 * so the full cone is visible outside the head regardless of ear size.
 */
function earTransform(dir: [number, number, number]): {
  position: [number, number, number]
  quaternion: [number, number, number, number]
} {
  const direction = new THREE.Vector3(...dir).normalize()
  const basePoint = direction.clone().multiplyScalar(HEAD_RADIUS - 0.03)
  const center = basePoint.clone().addScaledVector(direction, EAR_HEIGHT / 2)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  return { position: [center.x, center.y, center.z], quaternion: [q.x, q.y, q.z, q.w] }
}

const LEFT_EAR = earTransform([-0.55, 0.8, 0.2])
const RIGHT_EAR = earTransform([0.55, 0.8, 0.2])

export function CatModel() {
  const group = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const leftEye = useRef<THREE.Mesh>(null)
  const rightEye = useRef<THREE.Mesh>(null)
  const nextBlinkAt = useRef(2 + Math.random() * 3)
  const blinkPhase = useRef(0)

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime

    if (group.current) {
      const breathe = Math.sin(t * 1.4) * 0.04
      // Shifted down from center so the ears (the tallest point) have
      // headroom inside the camera frustum instead of grazing its edge.
      group.current.position.y = breathe - 0.22
      group.current.scale.y = 1 + breathe * 0.15
    }

    if (tail.current) {
      tail.current.rotation.z = Math.sin(t * 0.9) * 0.25 - 0.2
    }

    if (blinkPhase.current > 0) {
      blinkPhase.current = Math.max(0, blinkPhase.current - delta * 6)
      const s = Math.abs(Math.sin(blinkPhase.current * Math.PI))
      if (leftEye.current) leftEye.current.scale.y = Math.max(0.08, s)
      if (rightEye.current) rightEye.current.scale.y = Math.max(0.08, s)
    } else {
      nextBlinkAt.current -= delta
      if (nextBlinkAt.current <= 0) {
        blinkPhase.current = 1
        nextBlinkAt.current = 2.5 + Math.random() * 4
      }
    }
  })

  return (
    <group ref={group}>
      {/* body */}
      <mesh position={[0, -0.1, 0]} castShadow>
        <sphereGeometry args={[0.62, 24, 18]} />
        <meshStandardMaterial color={FUR_COLOR} roughness={0.85} />
      </mesh>
      {/* cream belly patch */}
      <mesh position={[0, -0.22, 0.42]} scale={[0.8, 0.9, 0.5]}>
        <sphereGeometry args={[0.4, 20, 16]} />
        <meshStandardMaterial color={CREAM} roughness={0.85} />
      </mesh>

      {/* head */}
      <group position={[0, 0.55, 0.18]}>
        <mesh castShadow>
          <sphereGeometry args={[0.42, 24, 18]} />
          <meshStandardMaterial color={FUR_COLOR} roughness={0.85} />
        </mesh>

        {/* cream muzzle */}
        <mesh position={[0, -0.14, 0.3]} scale={[0.9, 0.75, 0.6]}>
          <sphereGeometry args={[0.28, 18, 14]} />
          <meshStandardMaterial color={CREAM} roughness={0.85} />
        </mesh>

        {/* ears */}
        <mesh position={LEFT_EAR.position} quaternion={LEFT_EAR.quaternion}>
          <coneGeometry args={[EAR_RADIUS, EAR_HEIGHT, 12]} />
          <meshStandardMaterial color={FUR_DARK} roughness={0.85} />
        </mesh>
        <mesh position={RIGHT_EAR.position} quaternion={RIGHT_EAR.quaternion}>
          <coneGeometry args={[EAR_RADIUS, EAR_HEIGHT, 12]} />
          <meshStandardMaterial color={FUR_DARK} roughness={0.85} />
        </mesh>

        {/* eyes (mostly hidden behind sunglasses, kept for the blink logic) */}
        <mesh ref={leftEye} position={[-0.15, 0.02, 0.37]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial color={EYE_COLOR} roughness={0.4} />
        </mesh>
        <mesh ref={rightEye} position={[0.15, 0.02, 0.37]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial color={EYE_COLOR} roughness={0.4} />
        </mesh>

        {/* sunglasses - the character's signature accessory */}
        <group position={[0, 0.03, 0.4]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[-0.16, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.035, 16]} />
            <meshStandardMaterial color={LENS_COLOR} roughness={0.25} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0.16, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.035, 16]} />
            <meshStandardMaterial color={LENS_COLOR} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.12, 0.025, 0.025]} />
            <meshStandardMaterial color={LENS_COLOR} roughness={0.25} />
          </mesh>
        </group>

        {/* nose */}
        <mesh position={[0, -0.1, 0.44]}>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshStandardMaterial color="#D98E86" roughness={0.5} />
        </mesh>
      </group>

      {/* bow tie, at the neck/chest junction */}
      <group position={[0, 0.18, 0.56]}>
        <mesh position={[-0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.4]}>
          <coneGeometry args={[0.12, 0.18, 10]} />
          <meshStandardMaterial color={BOWTIE_COLOR} roughness={0.7} />
        </mesh>
        <mesh position={[0.1, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[1, 1, 0.4]}>
          <coneGeometry args={[0.12, 0.18, 10]} />
          <meshStandardMaterial color={BOWTIE_COLOR} roughness={0.7} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshStandardMaterial color={BOWTIE_COLOR} roughness={0.7} />
        </mesh>
      </group>

      {/* tail, pivoted at the base so it sways naturally */}
      <group ref={tail} position={[0, -0.05, -0.55]}>
        <mesh position={[0, 0.25, -0.1]} rotation={[0.9, 0, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.5, 6, 12]} />
          <meshStandardMaterial color={FUR_COLOR} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.52, -0.14]} rotation={[0.9, 0, 0]}>
          <capsuleGeometry args={[0.1, 0.06, 6, 12]} />
          <meshStandardMaterial color={FUR_DARK} roughness={0.85} />
        </mesh>
      </group>

      {/* front feet, small and simple - this is a sitting pose, not a rig */}
      <mesh position={[-0.28, -0.62, 0.32]}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color={CREAM} roughness={0.85} />
      </mesh>
      <mesh position={[0.28, -0.62, 0.32]}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color={CREAM} roughness={0.85} />
      </mesh>
    </group>
  )
}
