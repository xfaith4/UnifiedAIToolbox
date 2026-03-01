import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { usePhiStore } from '../../state/store'
import { PHI } from '../../math/phi'

interface Props {
  position: [number, number, number]
}

/** Recursively drawn golden-rectangle subdivisions */
function RectLines({
  x, y, w, h, depth, maxDepth,
}: {
  x: number; y: number; w: number; h: number; depth: number; maxDepth: number
}) {
  if (depth > maxDepth || w < 0.005 || h < 0.005) return null

  // The square occupies min(w, h) on the longer side
  const isWide = w >= h
  const sq = isWide ? h : w

  // Points for the dividing line (square/remainder boundary)
  const points = isWide
    ? [new THREE.Vector3(x + sq, y, 0.01), new THREE.Vector3(x + sq, y + h, 0.01)]
    : [new THREE.Vector3(x, y + sq, 0.01), new THREE.Vector3(x + w, y + sq, 0.01)]

  const geo = new THREE.BufferGeometry().setFromPoints(points)
  const alpha = Math.max(0.15, 1 - depth * 0.18)

  return (
    <>
      <primitive object={geo} attach={undefined} />
      <line geometry={geo}>
        <lineBasicMaterial color="#10a660" transparent opacity={alpha} />
      </line>
      {/* Recurse into the remainder rectangle */}
      {depth < maxDepth && (
        isWide
          ? <RectLines x={x + sq} y={y} w={w - sq} h={h} depth={depth + 1} maxDepth={maxDepth} />
          : <RectLines x={x} y={y + sq} w={w} h={h - sq} depth={depth + 1} maxDepth={maxDepth} />
      )}
    </>
  )
}

export function GoldenRectangleExhibit({ position }: Props) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const [pulse, setPulse] = useState(0)

  const { selectedExhibit, setSelectedExhibit, subdivisionDepth, incrementSubdivision } =
    usePhiStore()

  const isSelected = selectedExhibit === 'golden-rect'

  // Float animation
  useFrame((_, delta) => {
    if (!meshRef.current) return
    meshRef.current.position.y = Math.sin(Date.now() * 0.0008) * 0.15
    if (pulse > 0) setPulse((p) => Math.max(0, p - delta * 4))
  })

  function handleClick() {
    setSelectedExhibit('golden-rect')
    incrementSubdivision()
    setPulse(1)
  }

  // Golden rectangle: width = PHI, height = 1 (in world units × 2)
  const W = PHI * 2
  const H = 2
  const ratio = W / H

  return (
    <group position={position}>
      {/* Floating golden rectangle face */}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={1 + pulse * 0.08}
      >
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          color={hovered || isSelected ? '#1a3a2a' : '#111c29'}
          transparent
          opacity={0.85}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Outer frame */}
      <lineSegments>
        <edgesGeometry
          args={[new THREE.PlaneGeometry(W, H)]}
        />
        <lineBasicMaterial
          color={isSelected ? '#10a660' : hovered ? '#3dd68c' : '#1e5038'}
          linewidth={2}
        />
      </lineSegments>

      {/* Subdivision lines drawn inside the rect */}
      <group position={[-W / 2, -H / 2, 0.005]}>
        <RectLines x={0} y={0} w={W} h={H} depth={0} maxDepth={subdivisionDepth} />
      </group>

      {/* Hover hint label */}
      {hovered && !isSelected && (
        <Html center position={[0, -H / 2 - 0.3, 0]}>
          <div className="text-xs text-phi-500 bg-slate-900/80 px-2 py-0.5 rounded pointer-events-none whitespace-nowrap">
            Click to subdivide
          </div>
        </Html>
      )}

      {/* Exhibit label */}
      <Html center position={[0, H / 2 + 0.35, 0]}>
        <div className="text-center pointer-events-none">
          <div className="text-white font-semibold text-sm">Golden Rectangle</div>
          <div className="text-slate-400 text-xs">
            Depth: {subdivisionDepth} &nbsp;|&nbsp; Ratio: {ratio.toFixed(6)}
          </div>
        </div>
      </Html>
    </group>
  )
}
