import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { usePhiStore } from '../../state/store'
import { fibonacci, fibonacciRatio, PHI } from '../../math/phi'

interface Props {
  position: [number, number, number]
}

const FIB_COLORS = [
  '#1e5038', '#10a660', '#3dd68c', '#6feab4',
  '#a5f3d0', '#d1fae8', '#f0fff8',
]

export function FibonacciExhibit({ position }: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const [pulse, setPulse] = useState(0)

  const { selectedExhibit, setSelectedExhibit, fibN, incrementFibN } = usePhiStore()
  const isSelected = selectedExhibit === 'fibonacci'

  useFrame((_, delta) => {
    if (!groupRef.current) return
    groupRef.current.position.y = Math.sin(Date.now() * 0.0007 + 1.2) * 0.12
    if (pulse > 0) setPulse((p) => Math.max(0, p - delta * 4))
  })

  function handleClick() {
    setSelectedExhibit('fibonacci')
    incrementFibN()
    setPulse(1)
  }

  // Show the last 7 Fibonacci numbers up to fibN
  const displayCount = Math.min(fibN, 7)
  const fibNums = Array.from({ length: displayCount }, (_, i) => {
    const n = Math.max(1, fibN - displayCount + 1 + i)
    return { n, val: fibonacci(n) }
  })

  const ratio = fibonacciRatio(fibN)
  const error = Math.abs(ratio - PHI)

  return (
    <group ref={groupRef} position={position} scale={1 + pulse * 0.06}>
      {/* Stacked blocks */}
      {fibNums.map(({ n, val }, i) => {
        const blockW = 0.7
        const blockH = 0.28
        const blockD = 0.18
        const yPos = (i - displayCount / 2) * (blockH + 0.04)
        const col = FIB_COLORS[i % FIB_COLORS.length]
        return (
          <group key={n} position={[0, yPos, 0]}>
            <RoundedBox
              args={[blockW, blockH, blockD]}
              radius={0.03}
              smoothness={3}
              onClick={handleClick}
              onPointerOver={() => setHovered(true)}
              onPointerOut={() => setHovered(false)}
            >
              <meshStandardMaterial
                color={isSelected || hovered ? col : '#1a2535'}
                emissive={col}
                emissiveIntensity={isSelected || hovered ? 0.25 : 0.05}
              />
            </RoundedBox>
            <Html center position={[0, 0, blockD / 2 + 0.01]}>
              <div
                className="text-xs font-mono font-bold pointer-events-none whitespace-nowrap"
                style={{ color: col, textShadow: '0 0 6px rgba(0,0,0,0.9)' }}
              >
                F({n}) = {val.toLocaleString()}
              </div>
            </Html>
          </group>
        )
      })}

      {/* Ratio display */}
      <Html center position={[0, -displayCount * 0.18 - 0.5, 0]}>
        <div className="text-center pointer-events-none">
          <div className="text-phi-500 font-mono text-sm">
            F({fibN + 1}) / F({fibN}) = {ratio.toFixed(8)}
          </div>
          <div className="text-slate-400 text-xs mt-0.5">
            Error vs φ: {error.toExponential(3)}
          </div>
        </div>
      </Html>

      {/* Label */}
      <Html center position={[0, displayCount * 0.18 + 0.3, 0]}>
        <div className="text-center pointer-events-none">
          <div className="text-white font-semibold text-sm">Fibonacci Ratio</div>
          <div className="text-slate-400 text-xs">n = {fibN} &nbsp;— Click to advance</div>
        </div>
      </Html>
    </group>
  )
}
