import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SafeFrame } from '@/lib/video/layout';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500); // Cards arrange into deck
    const t2 = setTimeout(() => setPhase(2), 1500); // Stats slide in
    const t3 = setTimeout(() => setPhase(3), 2200); // AI suggestion pops up
    const t4 = setTimeout(() => setPhase(4), 3200); // Exit
    
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
        className="absolute top-[10vh] w-full px-[8vw] text-right z-30"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <h2 className="text-[9vw] font-bold leading-tight text-white mb-2">
          Build<br/>Unbeatable<br/>Decks.
        </h2>
      </motion.div>

      {/* Deck Grid */}
      <div className="absolute top-[30vh] w-full h-[40vh] flex flex-wrap justify-center content-start gap-[2vw] px-[6vw] preserve-3d">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="w-[26vw] h-[36.4vw] rounded-[2vw] overflow-hidden shadow-lg border border-white/20"
            initial={{ opacity: 0, scale: 0, rotateY: 90 }}
            animate={{ 
              opacity: phase >= 4 ? 0 : phase >= 1 ? 1 : 0, 
              scale: phase >= 4 ? 0.8 : phase >= 1 ? 1 : 0,
              rotateY: phase >= 4 ? -90 : phase >= 1 ? 0 : 90,
              y: phase >= 4 ? 50 : 0
            }}
            transition={{ 
              duration: 0.6, 
              delay: phase >= 4 ? i * 0.05 : 0.4 + (i * 0.1),
              type: 'spring',
              bounce: 0.3
            }}
          >
            <img 
              src={`${import.meta.env.BASE_URL}${i % 3 === 0 ? 'electric' : i % 3 === 1 ? 'fire' : 'water'}-card.jpg`} 
              className="w-full h-full object-cover"
            />
          </motion.div>
        ))}
      </div>

      {/* Deck Stats UI */}
      <motion.div 
        className="absolute bottom-[28vh] w-[80vw] bg-[#0F172A]/80 backdrop-blur-md border border-white/10 rounded-[4vw] p-[4vw] flex justify-around shadow-2xl z-20"
        initial={{ scale: 0.8, opacity: 0, y: 50 }}
        animate={{ 
          scale: phase >= 4 ? 0.8 : phase >= 2 ? 1 : 0.8, 
          opacity: phase >= 4 ? 0 : phase >= 2 ? 1 : 0,
          y: phase >= 4 ? 50 : phase >= 2 ? 0 : 50
        }}
        transition={{ duration: 0.5, type: 'spring' }}
      >
        <div className="text-center">
          <div className="text-[3vw] text-slate-400 font-semibold mb-1">ENERGY</div>
          <div className="text-[5vw] text-yellow-400 font-bold">18</div>
        </div>
        <div className="w-[1px] bg-white/10" />
        <div className="text-center">
          <div className="text-[3vw] text-slate-400 font-semibold mb-1">MONSTERS</div>
          <div className="text-[5vw] text-blue-400 font-bold">24</div>
        </div>
        <div className="w-[1px] bg-white/10" />
        <div className="text-center">
          <div className="text-[3vw] text-slate-400 font-semibold mb-1">SPELLS</div>
          <div className="text-[5vw] text-red-400 font-bold">18</div>
        </div>
      </motion.div>

      {/* AI Suggestion Chip */}
      <motion.div
        className="absolute bottom-[14vh] bg-gradient-to-r from-blue-600 to-blue-400 text-white px-[5vw] py-[3vw] rounded-full font-semibold text-[4vw] shadow-[0_0_30px_rgba(37,99,235,0.5)] z-40 flex items-center gap-[2vw]"
        initial={{ y: 50, scale: 0.5, opacity: 0 }}
        animate={{ 
          y: phase >= 4 ? 50 : phase >= 3 ? 0 : 50,
          scale: phase >= 4 ? 0.5 : phase >= 3 ? 1 : 0.5,
          opacity: phase >= 4 ? 0 : phase >= 3 ? 1 : 0
        }}
        transition={{ duration: 0.5, type: 'spring', bounce: 0.5 }}
      >
        <span>✨</span> AI Suggests: Add 2x Water Dragons
      </motion.div>

    </SafeFrame>
  );
}
