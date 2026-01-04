'use client';

import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import {
  FileText,
  Plus,
  Search,
  MoreVertical,
  Shield,
  Eye,
  Lock
} from 'lucide-react';

interface DocumentMetadata {
  id: string;
  title: string;
  search_visibility_level: number;
  is_private: boolean;
  approval_status: string;
  created_at: string;
}

export default function DocumentsPage() {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  // Mock data for demo since ListDocuments RPC is not implemented fully yet (We have GetDocumentMetadata)
  // Actually we don't have ListDocuments in Auth Service (it's in Index Service usually)
  // But for this UI, we can mock or use a dummy list if backend returns nothing.

  // Implemented Modal states would go here (CreateDocument, ChangeVisibility)

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 text-transparent bg-clip-text">
            Documents
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage knowledge base documents and visibility.
          </p>
        </div>
        <button
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
          onClick={() => alert('Create Document Modal - To Be Implemented')}
        >
          <Plus size={18} />
          Create Document
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden backdrop-blur-sm relative flex flex-col">
        {/* Empty State / Placeholder */}
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
          <FileText size={48} className="mb-4 opacity-50" />
          <p>No documents found (List API pending).</p>
          <p className="text-sm mt-2">Use Create to add a new document and test visibility.</p>
        </div>
      </div>
    </div>
  );
}
