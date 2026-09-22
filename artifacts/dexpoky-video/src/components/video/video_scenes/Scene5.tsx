import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SafeFrame } from '@/lib/video/layout';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500); // Logo reveals
    const t2 = setTimeout(() => setPhase(2), 1200); // Taglines stagger in
    const t3 = setTimeout(() => setPhase(3), 1800); // Cards float up in background
    const t4 = setTimeout(() => setPhase(4), 3500); // Final exit to loop
    
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  return (
    <SafeFrame className="flex flex-col items-center justify-center z-10 perspective-1000 bg-[#2563EB]">
      
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div 
          className="absolute w-[80vw] h-[112vw] rounded-[4vw] shadow-2xl opacity-20"
          style={{ top: '10vh', left: '-20vw', rotate: -15 }}
          initial={{ y: '100vh' }}
          animate={{ y: phase >= 3 ? '-20vh' : '100vh' }}
          transition={{ duration: 3, ease: "easeOut" }}
        >
          <img src={`${import.meta.env.BASE_URL}fire-card.jpg`} className="w-full h-full object-cover rounded-[4vw]" />
        </motion.div>
        
        <motion.div 
          className="absolute w-[70vw] h-[98vw] rounded-[3.5vw] shadow-2xl opacity-20"
          style={{ top: '20vh', right: '-10vw', rotate: 25 }}
          initial={{ y: '100vh' }}
          animate={{ y: phase >= 3 ? '10vh' : '100vh' }}
          transition={{ duration: 2.5, ease: "easeOut", delay: 0.2 }}
        >
          <img src={`${import.meta.env.BASE_URL}water-card.jpg`} className="w-full h-full object-cover rounded-[3.5vw]" />
        </motion.div>
      </div>

      {/* Main Lockup */}
      <div className="flex flex-col items-center z-20">
        
        {/* DexPoky Logo */}
        <motion.div
          className="w-[70vw] mb-[8vh]"
          initial={{ scale: 0.5, y: 50, opacity: 0, filter: 'blur(10px)' }}
          animate={{ 
            scale: phase >= 4 ? 1.5 : phase >= 1 ? 1 : 0.5,
            y: phase >= 4 ? -50 : phase >= 1 ? 0 : 50,
            opacity: phase >= 4 ? 0 : phase >= 1 ? 1 : 0,
            filter: phase >= 4 ? 'blur(20px)' : phase >= 1 ? 'blur(0px)' : 'blur(10px)'
          }}
          transition={{ duration: 0.8, type: 'spring', bounce: 0.3 }}
        >
          <img src={`${import.meta.env.BASE_URL}dexpoky-logo.png`} alt="DexPoky Logo" className="w-full drop-shadow-2xl" />
        </motion.div>

        {/* Taglines */}
        <div className="flex flex-col gap-[3vh] items-center text-center">
          {['Track every pull.', 'Build better decks.', 'Trade like a pro.'].map((text, i) => (
            <motion.div
              key={i}
              className="bg-white/10 backdrop-blur-md px-[6vw] py-[2.5vw] rounded-full border border-white/20 shadow-lg"
              initial={{ x: i % 2 === 0 ? -50 : 50, opacity: 0 }}
              animate={{ 
                x: phase >= 4 ? (i % 2 === 0 ? -100 : 100) : phase >= 2 ? 0 : (i % 2 === 0 ? -50 : 50),
                opacity: phase >= 4 ? 0 : phase >= 2 ? 1 : 0 
              }}
              transition={{ duration: 0.6, delay: phase >= 4 ? 0 : (i * 0.15) + 0.2, type: 'spring' }}
            >
              <span className="text-[5vw] font-bold text-white tracking-wide">
                {text}
              </span>
            </motion.div>
          ))}
        </div>

        {/* CTA URL */}
        <motion.div
          className="absolute bottom-[10vh]"
          initial={{ y: 50, opacity: 0 }}
          animate={{ 
            y: phase >= 4 ? 50 : phase >= 2 ? 0 : 50,
            opacity: phase >= 4 ? 0 : phase >= 2 ? 1 : 0 
          }}
          transition={{ duration: 0.6, delay: phase >= 4 ? 0 : 0.8 }}
        >
          <span className="text-[4.5vw] font-semibold text-yellow-300 tracking-widest uppercase">
            dexpoky.com
          </span>
        </motion.div>

      </div>

    </SafeFrame>
  );
}
