'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Save, AlertCircle, User, Users } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { MotionDiv } from '../ui/Motion';
import UserPickerPanel, { UserData } from '../ui/UserPickerPanel';

interface Project {
  id: string;
  name: string;
  description: string;
  default_visibility_level?: number;
  owner_id?: string;
  owner_name?: string;
  member_ids?: string[];
}

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  project: Project | null;
}

export default function EditProjectModal({ isOpen, onClose, onSuccess, project }: EditProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibilityLevel, setVisibilityLevel] = useState(1);
  const [ownerId, setOwnerId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [members, setMembers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Picker states
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  useEffect(() => {
    if (project && isOpen) {
      setName(project.name);
      setDescription(project.description || '');
      setVisibilityLevel(project.default_visibility_level || 1);
      setOwnerId(project.owner_id || '');
      setOwnerName(project.owner_name || '');
      const uniqueMemberIds = Array.from(new Set(project.member_ids || []));
      setMemberIds(uniqueMemberIds);

      // Fetch details for existing members
      if (uniqueMemberIds.length > 0) {
        // Use the new IDs filter (requires backend update)
        const fetchMembers = async () => {
          try {
            const token = localStorage.getItem('accessToken');
            const tenantId = window.location.hostname.split('.')[0];
            const res = await fetch(`/api/v1/users?ids=${uniqueMemberIds.join(',')}&page_size=1000`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'X-Tenant-ID': tenantId
              }
            });
            if (res.ok) {
              const data = await res.json();
              setMembers(data.users || []);
            }
          } catch (e) {
            console.error("Failed to fetch project members", e);
          }
        };
        fetchMembers();
      } else {
        setMembers([]);
      }
    }
  }, [project, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/v1/projects/${project.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        },
        body: JSON.stringify({
          name,
          description,
          default_visibility_level: visibilityLevel,
          owner_id: ownerId || undefined,
          member_ids: memberIds.length > 0 ? memberIds : undefined
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update project');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!project) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <MotionDiv
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <MotionDiv
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Owner Picker Panel */}
            <UserPickerPanel
              isOpen={showOwnerPicker}
              onClose={() => setShowOwnerPicker(false)}
              mode="single"
              selectedId={ownerId}
              onSelect={(id, username) => {
                setOwnerId(id);
                setOwnerName(username || id.slice(0, 8) + '...');
              }}
              title="Select Owner"
              renderInline
            />

            {/* Member Picker Panel */}
            <UserPickerPanel
              isOpen={showMemberPicker}
              onClose={() => setShowMemberPicker(false)}
              mode="multi"
              selectedIds={memberIds}
              selectedUsers={members}
              onSelect={() => { }}
              onMultiSelect={(ids, users) => {
                setMemberIds(ids);
                setMembers(users);
              }}
              title="Select Members"
              excludeIds={ownerId ? [ownerId] : []}
              renderInline
            />

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Save className="w-5 h-5 text-blue-500" />
                Edit Project
                <span className="text-sm font-normal text-gray-500 ml-2">({project.name})</span>
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {error && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 text-sm text-red-400">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                    required
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors h-20 resize-none"
                  />
                </div>

                {/* Visibility Level */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Visibility Level</label>
                  <select
                    value={visibilityLevel}
                    onChange={(e) => setVisibilityLevel(Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value={1}>Hidden</option>
                    <option value={2}>Metadata</option>
                    <option value={3}>Snippet</option>
                    <option value={4}>Public</option>
                  </select>
                </div>

                {/* Owner & Members */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Owner */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Owner</label>
                    <button
                      type="button"
                      onClick={() => setShowOwnerPicker(true)}
                      className={`w-full px-4 py-2.5 rounded-lg border flex items-center gap-3 transition-colors text-left ${ownerId
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                        }`}
                    >
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${ownerId ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-700 text-gray-500'
                        }`}>
                        <User size={14} />
                      </div>
                      <span className={`text-sm truncate ${ownerId ? 'text-blue-300' : 'text-gray-400'}`}>
                        {ownerId ? ownerName : 'Select Owner...'}
                      </span>
                    </button>
                  </div>

                  {/* Members */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">
                      Members
                      {/* {memberIds.length > 0 && (
                        <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                          {memberIds.length}
                        </span>
                      )} */}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowMemberPicker(true)}
                      disabled={!ownerId}
                      className={`w-full px-4 py-2.5 rounded-lg border flex items-center gap-3 transition-colors text-left ${!ownerId
                        ? 'bg-zinc-900 border-zinc-800 opacity-50 cursor-not-allowed'
                        : memberIds.length > 0
                          ? 'bg-green-500/10 border-green-500/30'
                          : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                        }`}
                    >
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${!ownerId ? 'bg-zinc-800 text-gray-600' :
                        memberIds.length > 0 ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-gray-500'
                        }`}>
                        <Users size={14} />
                      </div>
                      <span className={`text-sm truncate ${!ownerId ? 'text-gray-600' :
                        memberIds.length > 0 ? 'text-green-300' : 'text-gray-400'
                        }`}>
                        {!ownerId ? 'Select Owner First' :
                          memberIds.length > 0 ? `${memberIds.length} members selected` : 'Select Members...'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end pt-4 border-t border-zinc-800 gap-3 mt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isLoading && <Loader2 className="animate-spin" size={16} />}
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </MotionDiv>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}
