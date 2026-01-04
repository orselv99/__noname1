'use client';

import { useLanguage } from '@/context/LanguageContext';

export default function PositionsPage() {
  const { t } = useLanguage();
  return (
    <div className="text-white">
      <h1 className="text-2xl font-bold mb-4 text-blue-400">{t.admin.sidebar.positions}</h1>
      <div className="p-8 border border-zinc-800 rounded-xl bg-zinc-900/50 flex flex-col items-center justify-center h-[60vh] text-gray-400">
        <p className="text-lg">Coming Soon...</p>
        <p className="text-sm mt-2">Positions/Job Titles management module is under development.</p>
      </div>
    </div>
  );
}
