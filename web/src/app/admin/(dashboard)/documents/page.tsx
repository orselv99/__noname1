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
import AddButton from '@/components/admin/ui/AddButton';
import TitleLabel from '@/components/admin/ui/TitleLabel';

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
      <div className="h-14 flex items-center justify-between shrink-0">
        <TitleLabel title={'Documents'} subtitle={'Manage knowledge base documents and visibility.'} />
        <AddButton
          onClick={() => { }}
        // onClick={() => setIsCreateModalOpen(true)}
        // label={t.admin.departments.add_department}
        />
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
