import { motion } from 'framer-motion';

export function PersistentBackground({ currentScene }: { currentScene: number }) {
  // We'll move some large glowing orbs around based on the scene.
  
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Base dark background */}
      <motion.div 
        className="absolute inset-0 bg-[#0F172A]"
        animate={{
          backgroundColor: currentScene === 4 ? '#2563EB' : '#0F172A'
        }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Primary Blue Glow */}
      <motion.div
        className="absolute rounded-full blur-[100px] opacity-60 mix-blend-screen"
        style={{ width: '80vw', height: '80vw', background: '#2563EB' }}
        animate={{
          x: currentScene === 0 ? '-20vw' : currentScene === 1 ? '40vw' : currentScene === 2 ? '-30vw' : currentScene === 3 ? '10vw' : '50vw',
          y: currentScene === 0 ? '-10vh' : currentScene === 1 ? '-20vh' : currentScene === 2 ? '60vh' : currentScene === 3 ? '80vh' : '-20vh',
          scale: currentScene === 4 ? 0 : 1,
        }}
        transition={{ duration: 2, ease: "easeInOut" }}
      />
      
      {/* Accent Yellow Glow */}
      <motion.div
        className="absolute rounded-full blur-[120px] opacity-40 mix-blend-screen"
        style={{ width: '90vw', height: '90vw', background: '#FACC15' }}
        animate={{
          x: currentScene === 0 ? '50vw' : currentScene === 1 ? '-40vw' : currentScene === 2 ? '50vw' : currentScene === 3 ? '-10vw' : '-50vw',
          y: currentScene === 0 ? '60vh' : currentScene === 1 ? '50vh' : currentScene === 2 ? '-10vh' : currentScene === 3 ? '20vh' : '100vh',
          scale: currentScene === 4 ? 0 : 1,
        }}
        transition={{ duration: 2.5, ease: "easeInOut" }}
      />
      
      {/* Red Accent Glow */}
      <motion.div
        className="absolute rounded-full blur-[100px] opacity-30 mix-blend-screen"
        style={{ width: '70vw', height: '70vw', background: '#EF4444' }}
        animate={{
          x: currentScene === 0 ? '10vw' : currentScene === 1 ? '20vw' : currentScene === 2 ? '10vw' : currentScene === 3 ? '40vw' : '20vw',
          y: currentScene === 0 ? '80vh' : currentScene === 1 ? '90vh' : currentScene === 2 ? '40vh' : currentScene === 3 ? '-10vh' : '40vh',
          scale: currentScene === 4 ? 0 : 1,
        }}
        transition={{ duration: 3, ease: "easeInOut" }}
      />

      {/* Grid Pattern Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] z-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`,
          backgroundSize: '4vw 4vw'
        }}
      />
      
      {/* Subtle Noise */}
      <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none z-0">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <filter id="noiseFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#noiseFilter)" />
        </svg>
      </div>
    </div>
  );
}
