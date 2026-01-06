'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Settings,
  LogOut,
  Menu,
  ChevronLeft,
  Users,
  Building,
  Building2,
  Layers,
  Shield,
  Network,
  FileText,
  Briefcase,
  Award,
  Brain,
  ChevronRight,
  Database,
  Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/context/LanguageContext';
import Nav from '@/components/admin/Nav';
import { ToastProvider } from '@/components/admin/Toast';
import { MotionAside, MotionDiv, MotionSpan } from '@/components/admin/ui/Motion';


// Menu Item Interface
interface MenuItem {
  icon: any;
  label: string;
  href: string;
  children?: MenuItem[];
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['/admin/ai/models']); // Default expand for demo

  // Language Context
  const { t, language, setLanguage } = useLanguage();

  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    // Check auth and role
    const auth = localStorage.getItem('isAuthenticated');
    if (!auth) {
      router.push('/admin/login');
    }

    // Decode JWT/Check LocalStorage for Role (Temporary: Assume 'super' for testing if authenticated)
    const storedRole = localStorage.getItem('userRole'); // We need to store this during login
    if (storedRole) setUserRole(storedRole);

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [router]);


  const toggleMenu = (href: string) => {
    if (expandedMenus.includes(href)) {
      setExpandedMenus(expandedMenus.filter(item => item !== href));
    } else {
      setExpandedMenus([...expandedMenus, href]);
    }
    if (!isSidebarOpen) setIsSidebarOpen(true);
  };

  const menuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: t.admin.sidebar.dashboard, href: '/admin/dashboard' },
  ];

  // super tenant는 tenants 메뉴만 표시, 일반 tenant는 부서/사용자/문서/접근요청 표시
  if (userRole === 'super') {
    menuItems.push(
      { icon: Building2, label: t.admin.sidebar.tenants, href: '/admin/tenants' },
      {
        icon: Brain,
        label: t.admin.sidebar.aiSettings || 'AI Settings',
        href: '/admin/ai',
      }
    );
  } else {
    menuItems.push(
      { icon: Network, label: t.admin.sidebar.departments, href: '/admin/departments' },
      { icon: Layers, label: t.admin.sidebar.positions || 'Positions', href: '/admin/positions' },
      { icon: Users, label: t.admin.sidebar.users, href: '/admin/users' },
      { icon: Briefcase, label: t.admin.sidebar.projects || 'Projects', href: '/admin/projects' },
      { icon: FileText, label: 'Documents', href: '/admin/documents' },
      { icon: Shield, label: t.admin.sidebar.accessRequests, href: '/admin/access-requests' },
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-black text-gray-100 flex">
        {/* Sidebar */}
        <MotionAside
          initial={false}
          animate={{ width: isSidebarOpen ? 240 : 80 }}
          className="fixed md:relative z-40 h-screen border-r border-zinc-800 bg-zinc-900/50 backdrop-blur-xl flex flex-col transition-all duration-300 overflow-hidden"
        >
          <div className={`flex items-center h-16 transition-all duration-300 ${isSidebarOpen ? 'justify-between px-6' : 'justify-center px-2'}`}>
            <AnimatePresence mode="wait">
              {isSidebarOpen && (
                <MotionSpan
                  key="sidebar-title"
                  initial={{ opacity: 0, width: 0 } as any}
                  animate={{ opacity: 1, width: 'auto' } as any}
                  exit={{ opacity: 0, width: 0 } as any}
                  className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 text-transparent bg-clip-text whitespace-nowrap overflow-hidden"
                >
                  {t.admin.sidebar.title}
                </MotionSpan>
              )}
            </AnimatePresence>

            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400"
            >
              {isSidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
            </button>
          </div>

          <nav className="flex-1 px-3 py-6 space-y-2 flex flex-col overflow-y-auto hidden-scrollbar">
            {menuItems.map((item) => {
              const isActive = pathname === item.href || (item.children && item.children.some(child => pathname === child.href));
              const isExpanded = expandedMenus.includes(item.href);
              const hasChildren = item.children && item.children.length > 0;

              return (
                <div key={item.href}>
                  {/* Main Menu Item */}
                  {hasChildren ? (
                    <button
                      onClick={() => toggleMenu(item.href)}
                      className={`flex items-center transition-all group overflow-hidden rounded-xl w-full text-left
                          ${isSidebarOpen
                          ? 'gap-3 px-3 py-3'
                          : 'justify-center h-10 w-10 mx-auto p-0'} 
                          ${isActive
                          ? 'text-blue-400'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                      title={!isSidebarOpen ? item.label : ''}
                    >
                      <div className={`${isSidebarOpen ? 'min-w-[22px]' : ''} flex justify-center items-center`}>
                        <item.icon size={22} className={`${isActive ? 'text-blue-400' : ''}`} />
                      </div>

                      <AnimatePresence>
                        {isSidebarOpen && (
                          <>
                            <MotionSpan
                              initial={{ opacity: 0, width: 0 } as any}
                              animate={{ opacity: 1, width: 'auto' } as any}
                              exit={{ opacity: 0, width: 0 } as any}
                              className="whitespace-nowrap overflow-hidden flex-1"
                            >
                              {item.label}
                            </MotionSpan>
                            <MotionDiv
                              animate={{ rotate: isExpanded ? 90 : 0 } as any}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronRight size={16} />
                            </MotionDiv>
                          </>
                        )}
                      </AnimatePresence>
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      className={`flex items-center transition-all group overflow-hidden rounded-xl
                        ${isSidebarOpen
                          ? 'gap-3 px-3 py-3 w-full'
                          : 'justify-center w-10 h-10 mx-auto p-0'} 
                        ${isActive
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'hover:bg-white/5 text-gray-400 hover:text-white'
                        }`}
                      title={!isSidebarOpen ? item.label : ''}
                    >
                      <div className={`${isSidebarOpen ? 'min-w-[22px]' : ''} flex justify-center items-center`}>
                        <item.icon size={22} className={`${isActive ? 'text-blue-400' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {isSidebarOpen && (
                          <MotionSpan
                            key="label"
                            initial={{ opacity: 0, width: 0 } as any}
                            animate={{ opacity: 1, width: 'auto' } as any}
                            exit={{ opacity: 0, width: 0 } as any}
                            className="whitespace-nowrap overflow-hidden"
                          >
                            {item.label}
                          </MotionSpan>
                        )}
                      </AnimatePresence>
                    </Link>
                  )}

                  {/* Children Item (Nested) */}
                  <AnimatePresence>
                    {hasChildren && isExpanded && isSidebarOpen && (
                      <MotionDiv
                        initial={{ height: 0, opacity: 0 } as any}
                        animate={{ height: 'auto', opacity: 1 } as any}
                        exit={{ height: 0, opacity: 0 } as any}
                        className="overflow-hidden ml-4 pl-4 border-l border-zinc-800 space-y-1 mt-1"
                      >
                        {item.children!.map((child) => {
                          const isChildActive = pathname === child.href;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                                  ${isChildActive
                                  ? 'text-blue-400 bg-blue-600/10'
                                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                }`}
                            >
                              <child.icon size={16} />
                              <span>{child.label}</span>
                            </Link>
                          )
                        })}
                      </MotionDiv>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>
        </MotionAside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto h-screen relative flex flex-col">
          <Nav isAuthenticated={true} />
          <div className="flex-1 p-8 pt-0">
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
