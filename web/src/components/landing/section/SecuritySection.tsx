'use client';

import { Shield } from 'lucide-react';
import { motion } from 'framer-motion';

import { useLanguage } from '@/context/LanguageContext';

const fadeInUp = {
  initial: { opacity: 0, y: 60 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.1 }
};

export default function SecuritySection() {
  const { t } = useLanguage();

  return (
    <section className="h-screen w-full snap-start flex items-center justify-center bg-zinc-900 px-4 relative">
      <motion.div
        {...fadeInUp}
        className="max-w-6xl w-full grid md:grid-cols-2 gap-12 items-center z-10"
      >
        <div className="space-y-6">
          <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500">
            <Shield size={32} />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold whitespace-pre-line min-h-[180px] flex items-center">{t.landing.security.title}</h2>
          <p className="text-lg text-gray-400 leading-relaxed min-h-[120px] flex items-start">
            {t.landing.security.description}
          </p>
          <ul className="space-y-3 text-gray-300">
            {t.landing.security.features.map((feature, idx) => (
              <li key={idx} className="flex items-center gap-3 min-h-[1.5em]">
                <div className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <div className="h-[400px] bg-gradient-to-br from-blue-900/20 to-zinc-800 rounded-3xl border border-zinc-700 flex items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
          <Shield size={120} className="text-blue-500/20 group-hover:scale-110 transition-transform duration-700 ease-in-out" />
        </div>
      </motion.div>
    </section>
  );
}
