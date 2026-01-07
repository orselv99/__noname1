'use client';

import { useState } from 'react';
import { X, Loader2, Upload, FileType, Users, User, Save, AlertCircle, Plus } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';
import { MotionDiv } from '../ui/Motion';
import UserPickerPanel, { UserData } from '../ui/UserPickerPanel';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}



export default function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

  // Single Create States
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultVisibility, setDefaultVisibility] = useState(1);
  const [ownerId, setOwnerId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [members, setMembers] = useState<UserData[]>([]);

  // Picker States
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  // Bulk Create States
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Common
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const tenantId = typeof window !== 'undefined' ? window.location.hostname.split('.')[0] : '';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : ''}`,
    'X-Tenant-ID': tenantId
  };

  // Lookup user by email or username
  const lookupUser = async (identifier: string): Promise<string | undefined> => {
    if (!identifier?.trim()) return undefined;
    try {
      const res = await fetch(`/api/v1/users?search=${encodeURIComponent(identifier.trim())}&page_size=1`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.users && data.users.length > 0) {
          return data.users[0].id;
        }
      }
    } catch (e) {
      console.error('Failed to lookup user:', identifier, e);
    }
    return undefined;
  };

  // Lookup multiple users
  const lookupUsers = async (identifiers: string[]): Promise<string[]> => {
    const results: string[] = [];
    for (const id of identifiers) {
      const userId = await lookupUser(id);
      if (userId) results.push(userId);
    }
    return results;
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await createProject({
        name,
        description,
        default_visibility_level: Number(defaultVisibility),
        owner_id: ownerId || undefined,
        member_ids: memberIds.length > 0 ? memberIds : undefined
      });

      onSuccess();
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkSubmit = async () => {
    if (!csvPreview.length) return;
    setIsLoading(true);
    setError('');

    try {
      // Transform CSV Data with user lookup
      const requests = [];
      for (const row of csvPreview) {
        const rowName = row.name || row.Name;
        if (!rowName) continue;

        // Lookup owner by email/username
        const ownerIdentifier = row.owner || row.Owner || '';
        const resolvedOwnerId = await lookupUser(ownerIdentifier);

        // Parse and lookup members
        const membersRaw = row.members || row.Members || '';
        const memberIdentifiers = membersRaw
          .split(/[|;]/)
          .map((id: string) => id.trim())
          .filter((id: string) => id !== '');
        const resolvedMemberIds = await lookupUsers(memberIdentifiers);

        requests.push({
          name: rowName,
          description: row.description || row.Description || '',
          owner_id: resolvedOwnerId,
          member_ids: resolvedMemberIds.length > 0 ? resolvedMemberIds : undefined,
          default_visibility_level: 1
        });
      }

      if (requests.length === 0) {
        setError('No valid data found in CSV.');
        setIsLoading(false);
        return;
      }

      await batchCreateProjects(requests);

      onSuccess();
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const batchCreateProjects = async (items: any[]) => {
    const res = await fetch('/api/v1/projects/batch', {
      method: 'POST',
      headers,
      body: JSON.stringify(items),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to batch create projects');
    }

    if (data.failure_count > 0) {
      throw new Error(`Batch failed: ${data.failure_reasons?.join(', ')}`);
    }

    return data;
  };

  const createProject = async (payload: any) => {
    const res = await fetch('/api/v1/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create project');
    }
    return data;
  };

  const processFile = (file: File) => {
    setCsvFile(file);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvPreview(results.data);
        setError('');
      },
      error: (err) => {
        setError('Failed to parse CSV: ' + err.message);
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setDefaultVisibility(1);
    setOwnerId('');
    setOwnerName('');
    setMemberIds([]);
    setMembers([]);
    setShowOwnerPicker(false);
    setShowMemberPicker(false);
    setCsvFile(null);
    setCsvPreview([]);
    setActiveTab('single');
    setError('');
  };

  const downloadTemplate = () => {
    const csvContent = "name,description,owner,members\nProject Alpha,Description here,user@email.com,member1@email.com|member2@email.com\nProject Beta,Another description,john.doe,jane.doe;bob.smith\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "project_import_template.csv";
    link.click();
  };

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
            {/* Owner Picker Panel - overlays modal */}
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

            {/* Member Picker Panel - overlays modal */}
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
                <Plus className="w-5 h-5 text-blue-500" />
                Create Project
              </h2>
              <button
                onClick={() => { onClose(); resetForm(); }}
                className="p-2 text-gray-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-800 px-6 shrink-0">
              <button
                onClick={() => setActiveTab('single')}
                className={`py-3 px-4 text-sm font-medium transition-colors relative ${activeTab === 'single' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
                  }`}
              >
                Single Create
                {activeTab === 'single' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400" />}
              </button>
              <button
                onClick={() => setActiveTab('bulk')}
                className={`py-3 px-4 text-sm font-medium transition-colors relative ${activeTab === 'bulk' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
                  }`}
              >
                Bulk Import (CSV)
                {activeTab === 'bulk' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400" />}
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

              {activeTab === 'single' ? (
                <form onSubmit={handleSingleSubmit} className="space-y-4">
                  {/* Name */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="Project name"
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
                      placeholder="Project description..."
                    />
                  </div>

                  {/* Visibility Level */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Default Visibility Level</label>
                    <select
                      value={defaultVisibility}
                      onChange={(e) => setDefaultVisibility(Number(e.target.value))}
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

                  {/* Submit Button */}
                  <div className="flex justify-end pt-4 border-t border-zinc-800 gap-3 mt-4">
                    <button
                      type="button"
                      onClick={() => { onClose(); resetForm(); }}
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
                      Create Project
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* Download Template */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <FileType size={14} />
                      Download Template
                    </button>
                  </div>

                  {/* Drag & Drop Zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) processFile(file);
                    }}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                  >
                    <Upload className="mx-auto mb-3 text-gray-500" size={40} />
                    <p className="text-gray-400 mb-2">Drag & drop CSV file here</p>
                    <p className="text-gray-500 text-sm mb-4">or</p>
                    <label className="cursor-pointer inline-block">
                      <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                      <span className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg transition-colors text-sm">
                        Browse Files
                      </span>
                    </label>
                    {csvFile && (
                      <p className="mt-4 text-sm text-blue-400">{csvFile.name} ({csvPreview.length} rows)</p>
                    )}
                  </div>

                  {/* CSV Info */}
                  <div className="text-xs text-gray-500 bg-zinc-800/50 rounded-lg p-3">
                    <p className="font-medium text-gray-400 mb-1">CSV Format:</p>
                    <code className="text-blue-400">name,description,owner,members</code>
                    <p className="mt-2">• <strong>owner</strong>: User email or username (will be looked up)</p>
                    <p>• <strong>members</strong>: Multiple emails/usernames separated by <code>|</code> or <code>;</code></p>
                  </div>

                  {/* Preview */}
                  {csvPreview.length > 0 && (
                    <div className="border border-zinc-800 rounded-lg overflow-hidden">
                      <div className="bg-zinc-800/50 px-4 py-2 text-sm text-gray-400 font-medium">
                        Preview ({csvPreview.length} rows)
                      </div>
                      <div className="max-h-40 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-zinc-800/30">
                            <tr>
                              <th className="text-left px-4 py-2 text-gray-500">Name</th>
                              <th className="text-left px-4 py-2 text-gray-500">Owner</th>
                              <th className="text-left px-4 py-2 text-gray-500">Members</th>
                            </tr>
                          </thead>
                          <tbody>
                            {csvPreview.slice(0, 5).map((row, i) => (
                              <tr key={i} className="border-t border-zinc-800">
                                <td className="px-4 py-2 text-gray-300">{row.name || row.Name}</td>
                                <td className="px-4 py-2 text-gray-400">{row.owner || row.Owner || '-'}</td>
                                <td className="px-4 py-2 text-gray-400">{row.members || row.Members || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="flex justify-end pt-4 border-t border-zinc-800 gap-3">
                    <button
                      type="button"
                      onClick={() => { onClose(); resetForm(); }}
                      className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBulkSubmit}
                      disabled={isLoading || csvPreview.length === 0}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {isLoading && <Loader2 className="animate-spin" size={16} />}
                      Import {csvPreview.length} Projects
                    </button>
                  </div>
                </div>
              )}
            </div>
          </MotionDiv>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}
