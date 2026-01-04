'use client';

import { LogIn } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

import { useLanguage } from '@/context/LanguageContext';

export default function FloatingNav() {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ko' : 'en');
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="fixed top-6 right-6 z-50 flex items-center justify-end gap-4 min-w-[200px]"
    >
      <div className="flex items-center gap-2 px-2 py-2 rounded-full">
        <button
          onClick={toggleLanguage}
          className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-colors flex items-center justify-center w-10 h-10 font-bold"
          aria-label="Change Language"
        >
          {language === 'en' ? 'KO' : 'EN'}
        </button>
        <Link
          href="/admin/login"
          className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-colors flex items-center gap-2"
          aria-label="Admin Console Login"
        >
          <LogIn size={24} />
        </Link>
      </div>
    </motion.nav>
  );
}
