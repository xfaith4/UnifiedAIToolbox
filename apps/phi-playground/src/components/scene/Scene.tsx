import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Stars } from '@react-three/drei'
import { GoldenRectangleExhibit } from './GoldenRectangleExhibit'
import { FibonacciExhibit } from './FibonacciExhibit'
import { SpiralExhibit } from './SpiralExhibit'
import { FormulaExhibit } from './FormulaExhibit'
import { usePhiStore } from '../../state/store'

export function Scene() {
  const quality = usePhiStore((s) => s.quality)

  return (
    <Canvas
      camera={{ position: [0, 2, 12], fov: 55, near: 0.1, far: 300 }}
      gl={{ antialias: quality === 'high', alpha: false }}
      shadows={quality === 'high'}
      dpr={quality === 'high' ? [1, 2] : 1}
      style={{ background: 'linear-gradient(180deg, #0b1121 0%, #0f1d35 100%)' }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[8, 12, 8]}
        intensity={1.2}
        castShadow={quality === 'high'}
        shadow-mapSize={[2048, 2048]}
      />
      <pointLight position={[-6, 4, -4]} intensity={0.5} color="#6ad4b0" />

      {/* Background stars */}
      <Stars radius={80} depth={50} count={2000} factor={3} fade speed={0.4} />

      {/* Optional HDR environment for reflections */}
      {quality === 'high' && <Environment preset="city" />}

      {/* The four exhibits laid out in a loose arc */}
      {/* A — Golden Rectangle: left */}
      <GoldenRectangleExhibit position={[-5.5, 0, 0]} />

      {/* B — Fibonacci / Ratio: left-center */}
      <FibonacciExhibit position={[-1.5, 0, -1]} />

      {/* C — Spiral: right-center */}
      <SpiralExhibit position={[2.5, 0, -1]} />

      {/* D — Formula Tablet: right */}
      <FormulaExhibit position={[6, 0.5, 0]} />

      {/* Camera controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={30}
        maxPolarAngle={Math.PI * 0.85}
        makeDefault
      />
    </Canvas>
  )
}
