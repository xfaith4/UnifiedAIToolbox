import { Suspense } from 'react'
import { Scene } from './components/scene/Scene'
import { InfoPanel } from './components/ui/InfoPanel'
import { Controls } from './components/ui/Controls'
import { GuidedTour } from './components/ui/GuidedTour'

export default function App() {
  return (
    <>
      {/* 3D canvas fills the whole viewport */}
      <div className="phi-canvas">
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </div>

      {/* UI overlay — pointer-events handled per-child */}
      <div className="phi-ui">
        {/* Top-left: title */}
        <div className="absolute top-4 left-4 select-none">
          <h1 className="text-white text-xl font-bold tracking-wide opacity-90">
            φ Phi Playground
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Golden Ratio — Interactive 3D Explorer
          </p>
        </div>

        {/* Bottom-right: scene controls */}
        <div className="absolute bottom-4 right-4">
          <Controls />
        </div>

        {/* Bottom-left: guided tour trigger */}
        <div className="absolute bottom-4 left-4">
          <GuidedTour />
        </div>

        {/* Info panel — appears when an exhibit is selected */}
        <InfoPanel />
      </div>
    </>
  )
}
