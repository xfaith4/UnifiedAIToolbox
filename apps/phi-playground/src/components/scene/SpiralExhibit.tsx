import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { usePhiStore } from '../../state/store'
import { goldenSpiralPoint, PHI } from '../../math/phi'

interface Props {
  position: [number, number, number]
}

/** Build a TubeGeometry path for the Fibonacci-square spiral approximation. */
function makeFibSpiralCurve(scale: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = []
  // Fibonacci numbers up to 8 terms
  const fibs = [1, 1, 2, 3, 5, 8, 13, 21]
  // Each arc is a quarter circle with radius = fib[i]
  // Centers accumulate as we tile the squares
  let cx = 0, cy = 0
  const dirs = [
    { a0: Math.PI, a1: 1.5 * Math.PI, ncx: 1, ncy: 0 },
    { a0: 1.5 * Math.PI, a1: 2 * Math.PI, ncx: 0, ncy: 1 },
    { a0: 0, a1: 0.5 * Math.PI, ncx: -1, ncy: 0 },
    { a0: 0.5 * Math.PI, a1: Math.PI, ncx: 0, ncy: -1 },
  ]
  for (let i = 0; i < fibs.length; i++) {
    const r = fibs[i] * scale
    const dir = dirs[i % 4]
    const segments = 20
    for (let s = 0; s <= segments; s++) {
      const a = dir.a0 + ((dir.a1 - dir.a0) * s) / segments
      pts.push(new THREE.Vector3(cx + r * Math.cos(a), cy + r * Math.sin(a), 0))
    }
    cx += dirs[i % 4].ncx * fibs[i] * scale
    cy += dirs[i % 4].ncy * fibs[i] * scale
  }
  return new THREE.CatmullRomCurve3(pts)
}

/** Build a TubeGeometry path for the true logarithmic golden spiral. */
function makeLogSpiralCurve(scale: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = []
  const turns = 3
  const steps = 300
  const thetaMax = turns * 2 * Math.PI
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * thetaMax - thetaMax * 0.5
    const r = scale * Math.pow(PHI, theta / (Math.PI / 2))
    pts.push(new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), 0))
  }
  void goldenSpiralPoint // used for tests
  return new THREE.CatmullRomCurve3(pts)
}

export function SpiralExhibit({ position }: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const tubeRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const [pulse, setPulse] = useState(0)

  const { selectedExhibit, setSelectedExhibit, spiralMode, toggleSpiralMode } = usePhiStore()
  const isSelected = selectedExhibit === 'spiral'

  const scale = 0.09
  const { curve, tubeRadius } = useMemo(() => {
    const c =
      spiralMode === 'fibonacci'
        ? makeFibSpiralCurve(scale)
        : makeLogSpiralCurve(1)
    return { curve: c, tubeRadius: spiralMode === 'fibonacci' ? 0.025 : 0.018 }
  }, [spiralMode])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    groupRef.current.position.y = Math.sin(Date.now() * 0.0009 + 2.5) * 0.1
    groupRef.current.rotation.z += 0.001
    if (pulse > 0) setPulse((p) => Math.max(0, p - delta * 4))
  })

  function handleClick() {
    setSelectedExhibit('spiral')
    toggleSpiralMode()
    setPulse(1)
  }

  const color = spiralMode === 'fibonacci' ? '#3dd68c' : '#60a5fa'
  const label = spiralMode === 'fibonacci'
    ? 'Fibonacci-Square Spiral (approx)'
    : 'Logarithmic Golden Spiral (idealized)'

  return (
    <group ref={groupRef} position={position} scale={1 + pulse * 0.06}>
      {/* Clickable invisible bounding sphere */}
      <mesh onClick={handleClick} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <sphereGeometry args={[1.8, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* The spiral tube */}
      <mesh ref={tubeRef}>
        <tubeGeometry args={[curve, 200, tubeRadius, 8, false]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered || isSelected ? 0.5 : 0.2}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Mode badge */}
      {isSelected && (
        <Html center position={[0, 0, 0.1]}>
          <div
            className={`text-xs px-2 py-0.5 rounded pointer-events-none font-mono ${
              spiralMode === 'fibonacci'
                ? 'bg-phi-900/80 text-phi-500 border border-phi-700'
                : 'bg-blue-950/80 text-blue-400 border border-blue-800'
            }`}
          >
            {spiralMode === 'fibonacci' ? '≈ approx' : 'idealized'}
          </div>
        </Html>
      )}

      {/* Hover hint */}
      {hovered && !isSelected && (
        <Html center position={[0, -2, 0]}>
          <div className="text-xs text-blue-400 bg-slate-900/80 px-2 py-0.5 rounded pointer-events-none whitespace-nowrap">
            Click to toggle spiral type
          </div>
        </Html>
      )}

      {/* Label */}
      <Html center position={[0, 2.3, 0]}>
        <div className="text-center pointer-events-none">
          <div className="text-white font-semibold text-sm">Spiral Exhibit</div>
          <div className="text-slate-400 text-xs">{label}</div>
        </div>
      </Html>
    </group>
  )
}
