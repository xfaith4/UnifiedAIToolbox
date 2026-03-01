import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { usePhiStore } from '../../state/store'
import { PHI_DERIVATION_STEPS } from '../../math/phi'

interface Props {
  position: [number, number, number]
}

export function FormulaExhibit({ position }: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const [pulse, setPulse] = useState(0)

  const { selectedExhibit, setSelectedExhibit, formulaStep, cycleFormulaStep } = usePhiStore()
  const isSelected = selectedExhibit === 'formula'

  useFrame((_, delta) => {
    if (!groupRef.current) return
    groupRef.current.position.y = Math.sin(Date.now() * 0.00085 + 3.8) * 0.13
    groupRef.current.rotation.y = Math.sin(Date.now() * 0.0004) * 0.15
    if (pulse > 0) setPulse((p) => Math.max(0, p - delta * 4))
  })

  function handleClick() {
    setSelectedExhibit('formula')
    cycleFormulaStep()
    setPulse(1)
  }

  const step = PHI_DERIVATION_STEPS[formulaStep]
  const progress = `${formulaStep + 1} / ${PHI_DERIVATION_STEPS.length}`

  return (
    <group ref={groupRef} position={position} scale={1 + pulse * 0.07}>
      {/* Tablet body */}
      <RoundedBox
        args={[2.4, 3.2, 0.18]}
        radius={0.12}
        smoothness={4}
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={isSelected ? '#0d2d1e' : hovered ? '#142b1f' : '#101e18'}
          roughness={0.4}
          metalness={0.3}
          emissive={isSelected ? '#063018' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : 0}
        />
      </RoundedBox>

      {/* Glowing phi symbol */}
      <Html center position={[0, 0.6, 0.1]}>
        <div
          className="text-center pointer-events-none select-none"
          style={{ userSelect: 'none' }}
        >
          <div
            className="font-bold"
            style={{
              fontSize: '3rem',
              color: '#10a660',
              textShadow: '0 0 20px #10a660, 0 0 40px #10a66088',
              lineHeight: 1,
            }}
          >
            φ
          </div>

          <div className="text-phi-500 font-mono text-xs mt-1" style={{ maxWidth: 200 }}>
            {step.value}
          </div>

          <div className="text-slate-300 text-xs mt-2" style={{ maxWidth: 200, lineHeight: 1.5 }}>
            {step.body}
          </div>

          <div className="text-slate-500 text-xs mt-2">
            {progress}
          </div>
        </div>
      </Html>

      {/* Border glow when selected */}
      {isSelected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(2.4, 3.2, 0.18)]} />
          <lineBasicMaterial color="#10a660" transparent opacity={0.6} />
        </lineSegments>
      )}

      {/* Hover hint */}
      {hovered && !isSelected && (
        <Html center position={[0, -2, 0]}>
          <div className="text-xs text-phi-500 bg-slate-900/80 px-2 py-0.5 rounded pointer-events-none whitespace-nowrap">
            Click to cycle derivation
          </div>
        </Html>
      )}

      {/* Label */}
      <Html center position={[0, 2.0, 0]}>
        <div className="text-center pointer-events-none">
          <div className="text-white font-semibold text-sm">{step.title}</div>
        </div>
      </Html>
    </group>
  )
}
