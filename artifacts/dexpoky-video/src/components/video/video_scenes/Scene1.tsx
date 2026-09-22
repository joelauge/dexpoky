import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SafeFrame } from '@/lib/video/layout';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500); // Reticle appears
    const t2 = setTimeout(() => setPhase(2), 1200); // Scan line sweeps
    const t3 = setTimeout(() => setPhase(3), 2000); // Card recognized
    const t4 = setTimeout(() => setPhase(4), 2800); // Exit prep
    
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  return (
    <SafeFrame className="flex flex-col items-center justify-center z-10 perspective-1000">
      
      {/* Title */}
      <motion.div 
        className="absolute top-[15vh] w-full text-center px-[8vw]"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.h1 
          className="text-[10vw] font-bold leading-tight tracking-tight text-white mb-2"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Snap a photo.
        </motion.h1>
        <motion.p 
          className="text-[5vw] text-slate-300 font-semibold"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 20 }}
          transition={{ duration: 0.6 }}
        >
          Track your collection.
        </motion.p>
      </motion.div>

      {/* Card & Scanner */}
      <motion.div 
        className="relative w-[60vw] h-[84vw] mt-[10vh]"
        initial={{ scale: 0, rotateX: 30 }}
        animate={{ 
          scale: phase >= 4 ? 1.5 : 1, 
          rotateX: phase >= 4 ? 0 : phase >= 1 ? 0 : 30,
          y: phase >= 4 ? '20vh' : 0,
          opacity: phase >= 4 ? 0 : 1
        }}
        exit={{ scale: 2, opacity: 0, transition: { duration: 0.8 } }}
        transition={{ duration: 0.8, type: 'spring', bounce: 0.4 }}
      >
        {/* Card Asset */}
        <motion.div 
          className="absolute inset-0 rounded-[4vw] overflow-hidden shadow-2xl"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 50 }}
          transition={{ duration: 0.6, type: 'spring' }}
          style={{ boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.4)' }}
        >
          <img 
            src={`${import.meta.env.BASE_URL}fire-card.jpg`}
            alt="Fire Card"
            className="w-full h-full object-cover"
          />
        </motion.div>

        {/* Camera Reticle */}
        <motion.div 
          className="absolute -inset-[4vw] border-2 border-white/30 rounded-[6vw]"
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: phase >= 1 && phase < 4 ? 1 : 0, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-[8vw] h-[8vw] border-t-4 border-l-4 border-white rounded-tl-[6vw]" />
          <div className="absolute top-0 right-0 w-[8vw] h-[8vw] border-t-4 border-r-4 border-white rounded-tr-[6vw]" />
          <div className="absolute bottom-0 left-0 w-[8vw] h-[8vw] border-b-4 border-l-4 border-white rounded-bl-[6vw]" />
          <div className="absolute bottom-0 right-0 w-[8vw] h-[8vw] border-b-4 border-r-4 border-white rounded-br-[6vw]" />
        </motion.div>

        {/* Scan Line */}
        <motion.div
          className="absolute left-0 right-0 h-[2vw] bg-white rounded-full shadow-[0_0_20px_10px_rgba(255,255,255,0.5)] z-20"
          initial={{ top: '-10%', opacity: 0 }}
          animate={{ 
            top: phase >= 2 && phase < 3 ? '110%' : '-10%', 
            opacity: phase >= 2 && phase < 3 ? 1 : 0 
          }}
          transition={{ duration: 1, ease: "linear" }}
        />
        
        {/* Success Overlay */}
        <motion.div 
          className="absolute inset-0 bg-white/20 z-10 mix-blend-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 3 ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        />
      </motion.div>

    </SafeFrame>
  );
}
