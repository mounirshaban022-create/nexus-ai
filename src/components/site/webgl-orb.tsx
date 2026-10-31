'use client'

/**
 * NEXUS Official Site — WebGL hero centerpiece.
 *
 * Built on the most-starred 3D stack on Earth: Three.js (~105k★) via
 * React Three Fiber (~28k★) + drei (~8k★). A living plasma orb —
 * distorted icosahedron core, wireframe shell, orbiting sparks — that
 * reacts to the pointer. Dynamically imported (ssr:false) by the hero.
 */

import { useRef, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, MeshDistortMaterial, Sparkles } from '@react-three/drei'
import type { Group, Mesh } from 'three'
import { useReducedMotion } from 'framer-motion'

/* ---------------- Plasma core + wireframe shell ---------------- */

function PlasmaCore() {
  const core = useRef<Mesh | null>(null)
  const shell = useRef<Mesh | null>(null)
  const reduce = useReducedMotion()

  useFrame((state, delta) => {
    if (reduce) return
    // Pointer parallax — the whole system leans toward the cursor.
    const px = state.pointer.x
    const py = state.pointer.y
    if (core.current) {
      core.current.rotation.y += delta * 0.22
      core.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.28) * 0.18
      core.current.rotation.y += px * delta * 0.35
    }
    if (shell.current) {
      shell.current.rotation.y -= delta * 0.12
      shell.current.rotation.z += delta * 0.05
      shell.current.rotation.x = -py * 0.22
    }
  })

  return (
    <group>
      {/* Volumetric core — vertex-displaced sphere with plasma shading */}
      <mesh ref={core}>
        <icosahedronGeometry args={[1.28, 48]} />
        <MeshDistortMaterial
          color="#ff4d52"
          emissive="#ff2a68"
          emissiveIntensity={0.34}
          roughness={0.22}
          metalness={0.8}
          distort={0.36}
          speed={2.1}
        />
      </mesh>

      {/* Geodesic wireframe shell — the "AI lattice" */}
      <mesh ref={shell} scale={1.58}>
        <icosahedronGeometry args={[1.28, 1]} />
        <meshBasicMaterial color="#ff8a8d" wireframe transparent opacity={0.12} />
      </mesh>

      {/* Inner amber glow sprite */}
      <mesh scale={1.2}>
        <sphereGeometry args={[1.28, 32, 32]} />
        <meshBasicMaterial color="#f5a623" transparent opacity={0.045} />
      </mesh>

      {/* Orbiting sparks — GPU points, basically free */}
      <Sparkles count={90} scale={7} size={2} speed={0.32} color="#ffb37c" opacity={0.4} />
      <Sparkles count={40} scale={4.6} size={3} speed={0.2} color="#ff5a95" opacity={0.35} />
    </group>
  )
}

function Rig({ children }: { children: ReactNode }) {
  const group = useRef<Group | null>(null)
  const reduce = useReducedMotion()
  useFrame((state, delta) => {
    if (reduce || !group.current) return
    // Gentle float + lean into the pointer.
    group.current.rotation.y += (state.pointer.x * 0.24 - group.current.rotation.y) * Math.min(1, delta * 2.4)
    group.current.rotation.x += (-state.pointer.y * 0.16 - group.current.rotation.x) * Math.min(1, delta * 2.4)
  })
  return <group ref={group}>{children}</group>
}

export default function WebglOrb({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 7.6], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        {/* Tri-light rig — brand plasma palette */}
        <ambientLight intensity={0.35} />
        <pointLight position={[6, 4, 6]} intensity={90} color="#ff5a5f" distance={30} />
        <pointLight position={[-7, -3, 4]} intensity={70} color="#ff2a68" distance={30} />
        <pointLight position={[0, 6, -6]} intensity={55} color="#f5a623" distance={30} />
        <Float speed={1.6} rotationIntensity={0.35} floatIntensity={0.9}>
          <Rig>
            <PlasmaCore />
          </Rig>
        </Float>
      </Canvas>
    </div>
  )
}
