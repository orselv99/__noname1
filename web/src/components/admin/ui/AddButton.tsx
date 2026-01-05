'use client';

import { Plus } from 'lucide-react';

interface AddButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export default function AddButton({ onClick, label, className = '' }: AddButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-9 h-9 cursor-pointer bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center justify-center transition-colors font-medium text-sm shadow-lg shadow-blue-500/20 ${label ? 'px-4 py-2 gap-2' : 'p-2'
        } ${className}`}
      title={label ? undefined : 'Add New'}
    >
      <Plus size={18} />
      {label && <span>{label}</span>}
    </button>
  );
}
