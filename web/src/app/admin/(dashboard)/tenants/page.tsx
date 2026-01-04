'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Building2, MoreHorizontal, User, Globe, Activity } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import CreateTenantModal from '@/components/admin/tenants/CreateTenantModal';
import TenantDetailModal from '@/components/admin/tenants/TenantDetailModal';

interface Tenant {
  id: string;
  domain: string;
  name: string;
  status: string;
  user_count: number;
  created_at: string;
}

export default function TenantsPage() {
  const { t } = useLanguage();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<any>(null); // Full details
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTenants = async () => {
    try {
      const res = await fetch('/api/v1/tenants', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants || []);
      }
    } catch (error) {
      console.error('Failed to fetch tenants', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTenantClick = async (domain: string) => {
    try {
      // Optimistically open modal or show loading inside modal?
      // Let's fetch first then open
      const res = await fetch(`/api/v1/tenants/${domain}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedTenant(data);
        setIsDetailModalOpen(true);
      } else {
        console.error('Failed to fetch tenant details');
      }
    } catch (error) {
      console.error('Error fetching tenant details:', error);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const filteredTenants = tenants.filter(
    (tenant) =>
      tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Building2 className="text-blue-500" />
            Tenants
          </h1>
          <p className="text-gray-400 mt-1">Manage customer workspaces and subscriptions</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-lg shadow-blue-900/20"
        >
          <Plus size={20} />
          Add Tenant
        </button>
      </div>

      {/* Stats Cards (Optional Summary) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400"><Building2 size={20} /></div>
            <span className="text-gray-400 text-sm">Total Tenants</span>
          </div>
          <div className="text-2xl font-bold text-white ml-1">{tenants.length}</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-green-500/20 rounded-lg text-green-400"><Activity size={20} /></div>
            <span className="text-gray-400 text-sm">Active Tenants</span>
          </div>
          <div className="text-2xl font-bold text-white ml-1">{tenants.filter(t => t.status === 'active').length}</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400"><User size={20} /></div>
            <span className="text-gray-400 text-sm">Total Users</span>
          </div>
          <div className="text-2xl font-bold text-white ml-1">
            {tenants.reduce((acc, curr) => acc + (curr.user_count || 0), 0)}
          </div>
        </div>
      </div>


      {/* Search & Toolbar */}
      <div className="flex items-center gap-4 bg-zinc-900/30 p-2 rounded-xl border border-zinc-800/50">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
          <input
            type="text"
            placeholder="Search tenants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-none text-white placeholder-gray-500 focus:outline-none focus:ring-0 pl-10"
          />
        </div>
      </div>

      {/* Tenants Grid/List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="h-40 bg-zinc-900/50 border border-zinc-800 rounded-xl animate-pulse" />
            ))
          ) : (
            filteredTenants.map((tenant) => (
              <motion.div
                key={tenant.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => handleTenantClick(tenant.domain)}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 p-5 rounded-xl transition-all group hover:shadow-xl hover:shadow-black/50 cursor-pointer"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center border border-zinc-700 text-lg font-bold text-gray-300">
                      {tenant.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors">{tenant.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Globe size={12} />
                        <span>{tenant.domain}.lvh.me</span>
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border ${tenant.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                    {tenant.status}
                  </span>
                </div>

                <div className="border-t border-zinc-800 pt-4 mt-4 flex items-center justify-between text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-gray-500" />
                    <span>{tenant.user_count} Users</span>
                  </div>
                  <span className="text-xs text-gray-600">
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      <CreateTenantModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchTenants}
      />

      <TenantDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        tenant={selectedTenant}
      />
    </div>
  );
}
