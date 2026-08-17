'use client';

import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stars, Float, MeshDistortMaterial, Sphere } from '@react-three/drei';
import { useTheme } from './theme-provider';

function AnimatedSphere({ color }: { color: string }) {
  const { reducedMotion } = useTheme();

  return (
    <Float
      speed={reducedMotion ? 0 : 1.5}
      rotationIntensity={reducedMotion ? 0 : 0.5}
      floatIntensity={reducedMotion ? 0 : 0.5}
    >
      <Sphere args={[1, 64, 64]} scale={2.5}>
        <MeshDistortMaterial
          color={color}
          attach="material"
          distort={0.3}
          speed={reducedMotion ? 0 : 2}
          roughness={0.4}
          metalness={0.8}
        />
      </Sphere>
    </Float>
  );
}

function ParticleField() {
  const { reducedMotion } = useTheme();
  const count = reducedMotion ? 100 : 500;

  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      temp.push({
        position: [
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
        ] as [number, number, number],
        size: Math.random() * 0.03 + 0.01,
      });
    }
    return temp;
  }, [count]);

  return (
    <group>
      {particles.map((p, i) => (
        <mesh key={i} position={p.position}>
          <sphereGeometry args={[p.size, 8, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Scene() {
  const { timeOfDay } = useTheme();

  const sphereColor = useMemo(() => {
    switch (timeOfDay) {
      case 'morning': return '#3b82f6';
      case 'afternoon': return '#60a5fa';
      case 'golden-hour': return '#f59e0b';
      case 'sunset': return '#ea580c';
      case 'dusk': return '#7c3aed';
      case 'night': return '#4338ca';
      default: return '#3b82f6';
    }
  }, [timeOfDay]);

  const starCount = timeOfDay === 'night' || timeOfDay === 'dusk' ? 2000 : 500;

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 10, 5]} intensity={0.5} />
      <pointLight position={[-10, -10, -10]} color={sphereColor} intensity={0.5} />

      <AnimatedSphere color={sphereColor} />

      <Stars
        radius={50}
        depth={50}
        count={starCount}
        factor={4}
        saturation={0.5}
        fade
        speed={0.5}
      />

      <ParticleField />

      <fog attach="fog" args={[sphereColor, 10, 25]} />
    </>
  );
}

export function ThreeBackground() {
  const { reducedMotion } = useTheme();

  return (
    <div className="fixed inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        dpr={reducedMotion ? [1, 1.5] : [1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
