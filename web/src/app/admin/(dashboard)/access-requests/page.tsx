'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  FileText,
  User
} from 'lucide-react';
import TitleLabel from '@/components/admin/ui/TitleLabel';

interface AccessRequest {
  id: string;
  requester_id: string;
  document_id: string;
  requested_level: number; // 1: Summary, 2: Partial, 3: Full
  status: number; // 1: Pending, 2: Approved, 3: Rejected
  owner_id: string;
  created_at: string;
  requester?: {
    id: string;
    email: string;
    username: string;
  };
}

interface VisibilityApproval {
  id: string;
  document_id: string;
  requester_id: string;
  approver_id: string;
  requested_level: number;
  status: string; // pending, approved, rejected
  created_at: string;
  requester?: {
    username: string;
  };
}

export default function AccessRequestsPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'my-requests' | 'to-review' | 'visibility-approvals'>('to-review');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [approvals, setApprovals] = useState<VisibilityApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (activeTab === 'visibility-approvals') {
      fetchApprovals();
    } else {
      fetchRequests();
    }
  }, [activeTab]);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const isReviewer = activeTab === 'to-review';
      const queryParams = new URLSearchParams({
        as_reviewer: isReviewer ? 'true' : 'false',
      });

      const res = await fetch(`/api/v1/access/requests?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        }
      });

      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchApprovals = async () => {
    setIsLoading(true);
    try {
      // Ideally fetch "Where I am approver". 
      // For MVP, we assume backend filters by "approver_id" if passed, 
      // but we need my ID. Let's rely on backend filtering by token or passing nothing?
      // Handler `ListVisibilityApprovals` uses query `approver_id`.
      // We don't have user ID in frontend context easily yet. 
      // Let's TRY calling without params, maybe backend lists all pending for ADMIN role?
      // Or we need to store UserID in localStorage at login.

      // Temporarily for demo: Fetch All Pending (if backend allows empty params)
      const res = await fetch(`/api/v1/access/approvals`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        }
      });

      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGrant = async (requestId: string, status: number, grantedLevel: number) => {
    try {
      const res = await fetch('/api/v1/access/grant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        },
        body: JSON.stringify({
          request_id: requestId,
          status: status,
          granted_level: grantedLevel,
          // reviewer_id: ... 
        })
      });

      if (res.ok) {
        fetchRequests();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleApprovalReview = async (approvalId: string, status: 'approved' | 'rejected') => {
    try {
      const res = await fetch('/api/v1/access/approvals/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        },
        body: JSON.stringify({
          approval_id: approvalId,
          status: status,
          // approver_id: ... 
        })
      });

      if (res.ok) {
        fetchApprovals();
      }
    } catch (e) {
      console.error(e);
    }
  }

  const statusColors = {
    1: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', // Pending
    2: 'text-green-400 bg-green-400/10 border-green-400/20',   // Approved
    3: 'text-red-400 bg-red-400/10 border-red-400/20',         // Rejected
    'pending': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    'approved': 'text-green-400 bg-green-400/10 border-green-400/20',
    'rejected': 'text-red-400 bg-red-400/10 border-red-400/20',
  };

  const statusLabels: Record<string | number, string> = {
    1: 'Pending',
    2: 'Approved',
    3: 'Rejected',
    'pending': 'Pending',
    'approved': 'Approved',
    'rejected': 'Rejected'
  };

  const levelLabels: Record<number, string> = {
    0: 'Hidden',
    1: 'Metadata',
    2: 'Snippet',
    3: 'Public'
  };

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <TitleLabel title='Access Requests' subtitle='Manage document access permissions and requests.' />

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('to-review')}
          className={`px-6 py-3 text-sm font-medium transition-colors relative ${activeTab === 'to-review' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
        >
          {t.admin.access_requests.tabs.to_review}
          {activeTab === 'to-review' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('visibility-approvals')}
          className={`px-6 py-3 text-sm font-medium transition-colors relative ${activeTab === 'visibility-approvals' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
        >
          {t.admin.access_requests.tabs.visibility_approvals}
          {activeTab === 'visibility-approvals' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-500 rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('my-requests')}
          className={`px-6 py-3 text-sm font-medium transition-colors relative ${activeTab === 'my-requests' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
        >
          {t.admin.access_requests.tabs.my_requests}
          {activeTab === 'my-requests' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 rounded-t-full" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden backdrop-blur-sm relative flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-y-auto custom-scrollbar flex-1">
            <table className="w-full text-left text-gray-400">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-gray-200 font-medium sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4">Document</th>
                  <th className="px-6 py-4">
                    {activeTab === 'visibility-approvals' ? 'Requester' : (activeTab === 'to-review' ? 'Requester' : 'Owner')}
                  </th>
                  <th className="px-6 py-4">Requested Level</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                  {(activeTab === 'to-review' || activeTab === 'visibility-approvals') && <th className="px-6 py-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {activeTab === 'visibility-approvals' ? (
                  approvals.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">No pending approvals.</td></tr>
                  ) : (
                    approvals.map(approval => (
                      <tr key={approval.id} className="hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileText size={18} className="text-purple-500" />
                            <span className="font-mono text-sm text-gray-300">{approval.document_id.substring(0, 8)}...</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <User size={16} className="text-gray-500" />
                            <span>{approval.requester_id.substring(0, 8)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-300 font-medium">{levelLabels[approval.requested_level]}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusColors[approval.status as keyof typeof statusColors]}`}>
                            {statusLabels[approval.status]}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-sm">{new Date(approval.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-right">
                          {approval.status === 'pending' && (
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleApprovalReview(approval.id, 'approved')} className="p-1.5 hover:bg-green-500/20 rounded-lg text-green-400 transition-colors">
                                <CheckCircle2 size={18} />
                              </button>
                              <button onClick={() => handleApprovalReview(approval.id, 'rejected')} className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors">
                                <XCircle size={18} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )
                ) : (
                  requests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        No requests found.
                      </td>
                    </tr>
                  ) : (
                    requests.map((req) => (
                      <tr key={req.id} className="hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileText size={18} className="text-gray-500" />
                            <span className="font-mono text-sm text-gray-300">{req.id.substring(0, 8)}...</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <User size={16} className="text-gray-500" />
                            <span>{req.requester?.username || req.requester_id.substring(0, 8)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-300 font-medium">{levelLabels[req.requested_level]}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusColors[req.status as keyof typeof statusColors]}`}>
                            {statusLabels[req.status as keyof typeof statusLabels]}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-sm">
                          {new Date(req.created_at).toLocaleDateString()}
                        </td>
                        {activeTab === 'to-review' && (
                          <td className="px-6 py-4 text-right">
                            {req.status === 1 && (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleGrant(req.id, 2, req.requested_level)}
                                  className="p-1.5 hover:bg-green-500/20 rounded-lg text-green-400 transition-colors"
                                  title="Approve"
                                >
                                  <CheckCircle2 size={18} />
                                </button>
                                <button
                                  onClick={() => handleGrant(req.id, 3, 0)}
                                  className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                                  title="Reject"
                                >
                                  <XCircle size={18} />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
