import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SafeFrame } from '@/lib/video/layout';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 400); // Cards start cascading in
    const t2 = setTimeout(() => setPhase(2), 1600); // UI overlay appears
    const t3 = setTimeout(() => setPhase(3), 2400); // Stat counters bump up
    const t4 = setTimeout(() => setPhase(4), 3200); // Exit animation starts
    
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
        className="absolute top-[12vh] w-full px-[8vw] z-20"
        initial={{ x: '-100vw', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100vw', opacity: 0 }}
        transition={{ duration: 0.8, type: 'spring', bounce: 0.3 }}
      >
        <h2 className="text-[12vw] font-bold leading-tight tracking-tighter text-white">
          See your<br/>entire<br/><span className="text-gradient-yellow">collection.</span>
        </h2>
      </motion.div>

      {/* Card Cascade */}
      <div className="absolute top-[45vh] w-full h-[50vh] flex justify-center items-center preserve-3d">
        
        {/* Back Card (Electric) */}
        <motion.div 
          className="absolute w-[45vw] h-[63vw] rounded-[3vw] overflow-hidden shadow-2xl z-10"
          initial={{ y: '50vh', x: '20vw', rotateZ: 45, opacity: 0 }}
          animate={{ 
            y: phase >= 4 ? '60vh' : phase >= 1 ? '-5vh' : '50vh', 
            x: phase >= 4 ? '50vw' : phase >= 1 ? '15vw' : '20vw', 
            rotateZ: phase >= 4 ? 60 : phase >= 1 ? 15 : 45, 
            opacity: phase >= 4 ? 0 : 1 
          }}
          transition={{ duration: 1, type: 'spring', bounce: 0.4, delay: 0.2 }}
        >
          <img src={`${import.meta.env.BASE_URL}electric-card.jpg`} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40" />
        </motion.div>

        {/* Middle Card (Water) */}
        <motion.div 
          className="absolute w-[50vw] h-[70vw] rounded-[3.5vw] overflow-hidden shadow-2xl z-20"
          initial={{ y: '50vh', x: '-20vw', rotateZ: -45, opacity: 0 }}
          animate={{ 
            y: phase >= 4 ? '60vh' : phase >= 1 ? '0vh' : '50vh', 
            x: phase >= 4 ? '-50vw' : phase >= 1 ? '-15vw' : '-20vw', 
            rotateZ: phase >= 4 ? -60 : phase >= 1 ? -10 : -45, 
            opacity: phase >= 4 ? 0 : 1 
          }}
          transition={{ duration: 0.9, type: 'spring', bounce: 0.4, delay: 0.1 }}
        >
          <img src={`${import.meta.env.BASE_URL}water-card.jpg`} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/20" />
        </motion.div>

        {/* Front Card (Fire) */}
        <motion.div 
          className="absolute w-[55vw] h-[77vw] rounded-[4vw] overflow-hidden shadow-2xl z-30"
          initial={{ y: '50vh', scale: 0.5, rotateY: 90, opacity: 0 }}
          animate={{ 
            y: phase >= 4 ? '10vh' : phase >= 1 ? '5vh' : '50vh',
            scale: phase >= 4 ? 2 : phase >= 1 ? 1 : 0.5,
            rotateY: phase >= 4 ? -90 : phase >= 1 ? 0 : 90,
            opacity: phase >= 4 ? 0 : 1
          }}
          transition={{ duration: 0.8, type: 'spring', bounce: 0.5 }}
        >
          <img src={`${import.meta.env.BASE_URL}fire-card.jpg`} className="w-full h-full object-cover" />
        </motion.div>

      </div>

      {/* UI Stat Overlay */}
      <motion.div 
        className="absolute bottom-[10vh] left-[5vw] right-[5vw] bg-white/10 backdrop-blur-xl border border-white/20 rounded-[5vw] p-[6vw] flex justify-between items-center z-40"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: phase >= 2 && phase < 4 ? 0 : 100, opacity: phase >= 2 && phase < 4 ? 1 : 0 }}
        transition={{ duration: 0.6, type: 'spring' }}
      >
        <div className="flex flex-col">
          <span className="text-[3.5vw] text-slate-300 font-semibold uppercase tracking-wider">Total Value</span>
          <motion.span 
            className="text-[8vw] font-bold text-white font-mono"
            initial={{ scale: 1 }}
            animate={{ scale: phase >= 3 ? [1, 1.2, 1] : 1, color: phase >= 3 ? ['#fff', '#FACC15', '#fff'] : '#fff' }}
            transition={{ duration: 0.4 }}
          >
            $1,240
          </motion.span>
        </div>
        <div className="h-[10vw] w-[1px] bg-white/20" />
        <div className="flex flex-col text-right">
          <span className="text-[3.5vw] text-slate-300 font-semibold uppercase tracking-wider">Cards</span>
          <motion.span 
            className="text-[8vw] font-bold text-white font-mono"
            initial={{ scale: 1 }}
            animate={{ scale: phase >= 3 ? [1, 1.2, 1] : 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            342
          </motion.span>
        </div>
      </motion.div>

    </SafeFrame>
  );
}
