'use client';

import { motion } from 'framer-motion';

import { useLanguage } from '@/context/LanguageContext';

export default function CtaSection() {
  const { t } = useLanguage();

  return (
    <section className="h-screen w-full snap-start flex flex-col items-center justify-center bg-black text-white relative px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8 }}
        className="text-center z-10"
      >
        <h2 className="text-5xl md:text-7xl font-bold mb-8 text-center min-h-[160px] flex items-center justify-center">{t.landing.cta.title}</h2>
        <div className="flex gap-6 justify-center">
          <button className="px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-all transform hover:scale-105 shadow-xl min-w-[200px]">
            {t.landing.cta.sales}
          </button>
          <button className="px-8 py-4 border border-zinc-700 text-white font-bold rounded-full hover:bg-zinc-900 transition-all min-w-[200px]">
            {t.landing.cta.docs}
          </button>
        </div>
        <div className="mt-16 text-gray-500">
          <p>{t.landing.cta.copyright}</p>
        </div>
      </motion.div>
    </section>
  );
}
