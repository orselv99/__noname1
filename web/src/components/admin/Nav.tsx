'use client';

import { LogOut } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useRouter } from 'next/navigation';

export default function Nav({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { language, setLanguage } = useLanguage();
  const router = useRouter();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ko' : 'en');
  };

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    router.push('/admin/login');
  };

  return (
    // Top Right Navigation (Non-floating, Static)
    <div className="flex justify-end items-center gap-3 p-4 shrink-0">
      <button
        onClick={toggleLanguage}
        className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-colors flex items-center justify-center w-10 h-10 font-bold"
        aria-label="Change Language"
      >
        {language === 'en' ? 'KO' : 'EN'}
      </button>
      {
        isAuthenticated &&
        <button
          onClick={handleLogout}
          className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-colors flex items-center gap-2"
          aria-label="Admin Console Logout"
        >
          <LogOut size={24} />
        </button>
      }
    </div>
  );
}
