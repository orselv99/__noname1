'use client';

import { motion } from 'framer-motion';
import { Activity, Users, Database, Server } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { MotionDiv } from '@/components/admin/ui/Motion';

export default function AdminDashboard() {
  const { t } = useLanguage();

  const stats = [
    { label: t.admin.dashboard.stats.users, value: '1,234', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: t.admin.dashboard.stats.active, value: '42', icon: Activity, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: t.admin.dashboard.stats.storage, value: '2.4 TB', icon: Database, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: t.admin.dashboard.stats.health, value: 'Healthy', icon: Server, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white mb-2">{t.admin.dashboard.title}</h1>
        <p className="text-gray-400">{t.admin.dashboard.welcome}</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <MotionDiv
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                <stat.icon size={24} />
              </div>
              <span className="text-zinc-500 text-sm">Now</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-1">{stat.value}</h3>
            <p className="text-gray-400 text-sm">{stat.label}</p>
          </MotionDiv>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MotionDiv
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 h-[300px] flex items-center justify-center text-gray-500"
        >
          Activity Chart Placeholder
        </MotionDiv>
        <MotionDiv
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 h-[300px] flex items-center justify-center text-gray-500"
        >
          Recent Logs Placeholder
        </MotionDiv>
      </div>
    </div>
  );
}
