"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sparkles } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

function Sculpture() {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = state.clock.elapsedTime * 0.17;
    group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.22) * 0.18;
  });
  const material = <MeshDistortMaterial color="#f46a3d" metalness={0.7} roughness={0.17} distort={0.22} speed={1.4} />;
  return <group ref={group}>
    <mesh rotation={[0.8, 0.25, 0.2]}>{/* three interlocking loops */}<torusGeometry args={[1.25, 0.19, 30, 160]} />{material}</mesh>
    <mesh rotation={[-0.7, 0.45, 1.65]}><torusGeometry args={[1.25, 0.19, 30, 160]} /><MeshDistortMaterial color="#ffc878" metalness={0.8} roughness={0.13} distort={0.2} speed={1.1} /></mesh>
    <mesh rotation={[1.45, 0.7, 2.7]}><torusGeometry args={[1.25, 0.19, 30, 160]} /><MeshDistortMaterial color="#d94525" metalness={0.72} roughness={0.16} distort={0.27} speed={1.6} /></mesh>
    <mesh><sphereGeometry args={[0.16, 32, 32]} /><meshBasicMaterial color="#fff2c8" /></mesh>
  </group>;
}
export default function HeroScene(){return <div className="three-scene"><Canvas camera={{position:[0,0,5.2],fov:43}} dpr={[1,1.5]}><ambientLight intensity={1.5}/><pointLight position={[3,3,3]} intensity={38} color="#ffd39a"/><pointLight position={[-3,-2,2]} intensity={24} color="#f14f2b"/><Float speed={1.6} rotationIntensity={.35} floatIntensity={.55}><Sculpture/></Float><Sparkles count={95} scale={5.2} size={2.2} speed={.25} color="#ffd49a"/></Canvas></div>}
