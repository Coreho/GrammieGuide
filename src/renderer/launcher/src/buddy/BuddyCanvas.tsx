import { Canvas } from '@react-three/fiber'
import { CatModel } from './CatModel'

/**
 * M3 scope: a static idle character you can tap to open chat. Roaming
 * across the Home floor (bounded away from tiles/Help) is M4 - this just
 * proves the render pipeline and the tap-to-greet interaction work.
 */
export function BuddyCanvas({ onTap }: { onTap: () => void }) {
  return (
    <div
      onClick={onTap}
      role="button"
      aria-label="Talk to your companion"
      style={{ width: '100%', height: '100%', cursor: 'pointer' }}
    >
      <Canvas
        camera={{ position: [0, 0.3, 3.2], fov: 32 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 4]} intensity={1.1} />
        <directionalLight position={[-2, 1, -2]} intensity={0.3} />
        <CatModel />
      </Canvas>
    </div>
  )
}
