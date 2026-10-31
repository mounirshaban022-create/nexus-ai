'use client'

/**
 * Hero WebGL — the NEXUS core.
 *
 * Three.js (105k★) + @react-three/fiber (29k★) + drei (9k★).
 *
 * A dark liquid-metal core (MeshDistortMaterial) wearing a hairline
 * icosahedron cage, circled by two tilted ember/violet rings and a
 * field of drifting brand sparks. Pointer parallax tilts the whole
 * group; everything is masked by the parent container so the orb
 * fades into the canvas edge (no hard circle, no blob-behind-text).
 */

import { Canvas, useFrame } from '@react-three/fiber'
import { Float, MeshDistortMaterial, Sparkles } from '@react-three/drei'
import { useMemo, useRef, type ReactNode } from 'react'
import type { Group, Mesh } from 'three'

const EMBER = '#ff8a4c'
const CORAL = '#ff5a5f'
const MAGENTA = '#ff2a68'
const VIOLET = '#8b5cf6'

function Core() {
  const cage = useRef<Mesh>(null)
  useFrame((_, delta) => {
    if (cage.current) {
      cage.current.rotation.y -= delta * 0.08
      cage.current.rotation.x += delta * 0.03
    }
  })
  return (
    <group>
      {/* Liquid metal heart — dielectric-dominant so lights shape it
          (a pure metal with no env-map reads as a black ball) */}
      <mesh>
        <sphereGeometry args={[1.55, 96, 96]} />
        <MeshDistortMaterial
          color="#2b2b36"
          metalness={0.42}
          roughness={0.3}
          distort={0.38}
          speed={1.7}
        />
      </mesh>
      {/* Hairline geodesic cage */}
      <mesh ref={cage}>
        <icosahedronGeometry args={[2.16, 1]} />
        <meshBasicMaterial color={CORAL} wireframe transparent opacity={0.13} />
      </mesh>
    </group>
  )
}

function Rings() {
  const a = useRef<Mesh>(null)
  const b = useRef<Mesh>(null)
  useFrame((state, delta) => {
    if (a.current) a.current.rotation.z += delta * 0.22
    if (b.current) b.current.rotation.z -= delta * 0.16
    if (a.current) a.current.rotation.x = 1.15 + Math.sin(state.clock.elapsedTime * 0.3) * 0.08
    if (b.current) b.current.rotation.x = -0.9 + Math.cos(state.clock.elapsedTime * 0.24) * 0.08
  })
  return (
    <group>
      <mesh ref={a} rotation={[1.15, 0.2, 0]}>
        <torusGeometry args={[2.95, 0.012, 12, 200]} />
        <meshBasicMaterial color={EMBER} transparent opacity={0.65} />
      </mesh>
      <mesh ref={b} rotation={[-0.9, 0.4, 0.4]}>
        <torusGeometry args={[3.35, 0.009, 12, 200]} />
        <meshBasicMaterial color={VIOLET} transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

function Rig({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null)
  useFrame((state, delta) => {
    if (!group.current) return
    // Gentle idle spin + pointer parallax (lerped, never snappy).
    group.current.rotation.y += delta * 0.1
    const tx = state.pointer.y * 0.16
    const ty = state.pointer.x * 0.22
    group.current.rotation.x += (tx - group.current.rotation.x) * 0.045
    group.current.rotation.z += (ty * 0.35 - group.current.rotation.z) * 0.045
  })
  return <group ref={group}>{children}</group>
}

export default function OrbField({ className }: { className?: string }) {
  const sparkColors = useMemo(() => [EMBER, CORAL, MAGENTA, VIOLET] as const, [])
  return (
    <div className={className} aria-hidden>
      <Canvas
        camera={{ position: [0, 0, 7.6], fov: 42 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.32} />
        <directionalLight position={[5, 4, 4]} intensity={3.2} color={EMBER} />
        <directionalLight position={[-5, -3, 3]} intensity={2.2} color={VIOLET} />
        <directionalLight position={[0, 5, -4]} intensity={1.3} color={CORAL} />
        <pointLight position={[0, 0, 5]} intensity={18} color={CORAL} distance={14} decay={1.6} />
        <Rig>
          <Float speed={1.4} rotationIntensity={0.22} floatIntensity={0.85}>
            <Core />
          </Float>
          <Rings />
          <Sparkles
            count={110}
            scale={[8.5, 5.5, 4]}
            size={2.4}
            speed={0.32}
            opacity={0.55}
            color={sparkColors[0]}
          />
        </Rig>
      </Canvas>
    </div>
  )
}
