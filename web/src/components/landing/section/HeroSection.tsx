'use client';

import { ArrowDown } from 'lucide-react';
import { motion } from 'framer-motion';

import { useLanguage } from '@/context/LanguageContext';

export default function HeroSection() {
  const { t } = useLanguage();

  return (
    <section className="h-screen w-full snap-start flex flex-col items-center justify-center relative px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1 }}
        className="text-center space-y-6 z-10"
      >
        <h1 className="text-6xl md:text-8xl font-black tracking-tighter bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text drop-shadow-[0_0_15px_rgba(168,85,247,0.5)] min-h-[120px] flex items-center justify-center">
          {t.landing.hero.title}
        </h1>
        <p className="text-xl md:text-2xl text-gray-400 font-light max-w-2xl mx-auto whitespace-pre-line min-h-[100px] flex items-center justify-center">
          {t.landing.hero.subtitle}
        </p>
        <div className="pt-8">
          <button className="px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-all transform hover:scale-105 shadow-[0_0_30px_rgba(255,255,255,0.3)] min-w-[200px]">
            {t.landing.hero.getStarted}
          </button>
        </div>
      </motion.div>

      {/* Background Gradient Blob */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 1, repeat: Infinity, repeatType: "reverse" }}
        className="absolute bottom-10 text-gray-500"
      >
        <ArrowDown size={32} />
      </motion.div>
    </section>
  );
}
