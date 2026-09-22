import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SafeFrame } from '@/lib/video/layout';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300); // Cards appear opposite sides
    const t2 = setTimeout(() => setPhase(2), 1000); // Trade arrows appear
    const t3 = setTimeout(() => setPhase(3), 1600); // Cards swap places (trade)
    const t4 = setTimeout(() => setPhase(4), 2200); // Success badge
    const t5 = setTimeout(() => setPhase(5), 3200); // Exit
    
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, []);

  return (
    <SafeFrame className="flex flex-col items-center justify-center z-10 perspective-1000">
      
      {/* Title */}
      <motion.div 
        className="absolute top-[12vh] w-full text-center z-30"
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <h2 className="text-[12vw] font-bold text-white mb-2 tracking-tighter">
          Trade up.
        </h2>
        <p className="text-[5vw] text-blue-300 font-semibold">
          Find missing pieces.
        </p>
      </motion.div>

      <div className="absolute top-[35vh] w-full flex justify-between items-center px-[8vw] z-20">
        
        {/* Left Card (User's card) */}
        <motion.div 
          className="w-[35vw] h-[49vw] rounded-[2.5vw] overflow-hidden shadow-2xl relative"
          initial={{ x: '-50vw', rotateY: 90 }}
          animate={{ 
            x: phase >= 5 ? '-50vw' : phase >= 3 ? '49vw' : phase >= 1 ? 0 : '-50vw',
            rotateY: phase >= 5 ? 90 : phase >= 3 ? 360 : phase >= 1 ? 0 : 90,
            scale: phase >= 5 ? 0.5 : 1,
            zIndex: phase >= 3 ? 10 : 20
          }}
          transition={{ duration: 0.8, type: 'spring', bounce: phase >= 3 ? 0.2 : 0.4 }}
        >
          <img src={`${import.meta.env.BASE_URL}electric-card.jpg`} className="w-full h-full object-cover" />
          <div className="absolute top-[2vw] left-[2vw] bg-white/90 text-[#0F172A] text-[2.5vw] font-bold px-[2vw] py-[0.5vw] rounded-full">
            YOU HAVE
          </div>
        </motion.div>

        {/* Trade Arrows Icon */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 w-[12vw] h-[12vw] bg-yellow-400 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(250,204,21,0.5)] z-30"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: phase >= 5 ? 0 : phase >= 2 ? 1 : 0,
            opacity: phase >= 5 ? 0 : phase >= 2 ? 1 : 0,
            rotate: phase >= 3 ? 180 : 0
          }}
          transition={{ duration: 0.5, type: 'spring' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[6vw] h-[6vw]">
            <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"/>
          </svg>
        </motion.div>

        {/* Right Card (Target card) */}
        <motion.div 
          className="w-[35vw] h-[49vw] rounded-[2.5vw] overflow-hidden shadow-2xl relative"
          initial={{ x: '50vw', rotateY: -90 }}
          animate={{ 
            x: phase >= 5 ? '50vw' : phase >= 3 ? '-49vw' : phase >= 1 ? 0 : '50vw',
            rotateY: phase >= 5 ? -90 : phase >= 3 ? -360 : phase >= 1 ? 0 : -90,
            scale: phase >= 5 ? 0.5 : 1,
            zIndex: phase >= 3 ? 20 : 10
          }}
          transition={{ duration: 0.8, type: 'spring', bounce: phase >= 3 ? 0.2 : 0.4 }}
        >
          <img src={`${import.meta.env.BASE_URL}fire-card.jpg`} className="w-full h-full object-cover" />
          <div className="absolute top-[2vw] right-[2vw] bg-blue-600/90 text-white text-[2.5vw] font-bold px-[2vw] py-[0.5vw] rounded-full">
            YOU WANT
          </div>
        </motion.div>

      </div>

      {/* Success Badge */}
      <motion.div
        className="absolute bottom-[20vh] bg-green-500 text-white px-[8vw] py-[4vw] rounded-[4vw] text-[6vw] font-bold shadow-[0_10px_30px_rgba(34,197,94,0.4)] z-40 border-2 border-white/20"
        initial={{ y: 50, scale: 0.5, opacity: 0 }}
        animate={{ 
          y: phase >= 5 ? 50 : phase >= 4 ? 0 : 50,
          scale: phase >= 5 ? 0.5 : phase >= 4 ? 1 : 0.5,
          opacity: phase >= 5 ? 0 : phase >= 4 ? 1 : 0
        }}
        transition={{ duration: 0.5, type: 'spring', bounce: 0.5 }}
      >
        Trade Accepted! 🎉
      </motion.div>

    </SafeFrame>
  );
}
