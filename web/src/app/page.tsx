'use client';

import HeroSection from '@/components/landing/section/HeroSection';
import SecuritySection from '@/components/landing/section/SecuritySection';
import AiSection from '@/components/landing/section/AiSection';
import SyncSection from '@/components/landing/section/SyncSection';
import CtaSection from '@/components/landing/section/CtaSection';

import FloatingNav from '@/components/landing/FloatingNav';

export default function Home() {
  return (
    <main className="h-screen w-full bg-black text-white overflow-y-scroll snap-y snap-mandatory scroll-smooth">
      <FloatingNav />
      <HeroSection />
      <SecuritySection />
      <AiSection />
      <SyncSection />
      <CtaSection />
    </main>
  );
}
