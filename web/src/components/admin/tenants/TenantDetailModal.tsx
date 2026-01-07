'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, User, CreditCard, Calendar, Phone, Mail, ShieldCheck } from 'lucide-react';
import { MotionDiv } from '../ui/Motion';

interface TenantDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: any; // Using any for flexibility with API response structure
}

export default function TenantDetailModal({ isOpen, onClose, tenant }: TenantDetailModalProps) {
  if (!tenant) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <MotionDiv
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <MotionDiv
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-800/50 sticky top-0 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Building2 className="text-blue-500" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{tenant.tenant?.name || 'Unknown Company'}</h2>
                  <p className="text-sm text-gray-400">{tenant.tenant?.domain}.lvh.me</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg text-gray-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-8">
              {/* Admin Information */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="text-green-500" size={20} />
                  <h3 className="text-lg font-semibold text-white">Administrator Information</h3>
                </div>
                <div className="bg-black/40 border border-zinc-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500 flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                      <User size={12} /> Username / Name
                    </div>
                    <div className="text-gray-200 font-medium">{tenant.admin_user?.username || 'Not Assigned'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500 flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                      <Mail size={12} /> Email Address
                    </div>
                    <div className="text-gray-200 break-all">{tenant.admin_user?.email || '-'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500 flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                      <Phone size={12} /> Contact
                    </div>
                    <div className="text-gray-200">{tenant.admin_user?.contact || 'No contact info'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500 flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                      <Calendar size={12} /> Joined Date
                    </div>
                    <div className="text-gray-400 text-sm">{tenant.admin_user?.created_at ? new Date(tenant.admin_user.created_at).toLocaleDateString() : '-'}</div>
                  </div>
                </div>
              </section>

              {/* Subscription & Plan */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className="text-purple-500" size={20} />
                  <h3 className="text-lg font-semibold text-white">Subscription & Billing</h3>
                  {tenant.subscription?.status === 'active' && (
                    <span className="bg-green-500/10 text-green-400 text-xs px-2 py-0.5 rounded-full font-medium border border-green-500/20">Active</span>
                  )}
                </div>

                <div className="bg-gradient-to-br from-purple-500/5 to-blue-500/5 border border-zinc-800 rounded-xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -translate-y-16 translate-x-16" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                    <div>
                      <div className="text-xs text-purple-400 uppercase tracking-wider font-bold mb-1">Current Plan</div>
                      <div className="text-3xl font-bold text-white mb-1">{tenant.subscription?.plan_name || 'Free Plan'}</div>
                      <div className="text-sm text-gray-500">
                        {tenant.subscription?.plan_name === 'Enterprise' ? 'Unlimited access & priority support' : 'Standard features included'}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center pb-3 border-b border-zinc-800/50">
                        <span className="text-sm text-gray-400">Payment Method</span>
                        <span className="text-sm text-white font-medium flex items-center gap-2">
                          {tenant.subscription?.payment_method || 'None'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-zinc-800/50">
                        <span className="text-sm text-gray-400">Next Billing Date</span>
                        <span className="text-sm text-white font-medium">
                          {tenant.subscription?.next_billing_date || '-'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">Billing Cycle</span>
                        <span className="text-sm text-white font-medium">Monthly</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Actions Footer - Optional */}
              {/* <div className="flex justify-end pt-4">
                <button className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                  Edit Details ->
                </button>
              </div> */}
            </div>
          </MotionDiv>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}
