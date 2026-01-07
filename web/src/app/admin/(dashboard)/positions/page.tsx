'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/components/admin/Toast';
import TitleLabel from '@/components/admin/ui/TitleLabel';
import AddButton from '@/components/admin/ui/AddButton';
import { Layers, Trash2, Edit, GripVertical } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CreatePositionModal from '@/components/admin/positions/CreatePositionModal';

// Types
interface Position {
  id: string;
  name: string;
  order: number;
  tenant_id: string;
}

// Sortable List Item Component
function SortablePositionItem({ pos, onDelete, onEdit }: { pos: Position; onDelete: (id: string) => void; onEdit: (pos: Position) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: pos.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: 'relative',
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-800/50 rounded-lg group transition-all ${isDragging ? 'shadow-lg ring-1 ring-blue-500/50 bg-zinc-800' : 'hover:bg-zinc-800/50 hover:border-zinc-700/50'}`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 p-1 transition-colors"
      >
        <GripVertical size={16} />
      </button>

      {/* Icon */}
      <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
        <Layers size={16} />
      </div>

      {/* Name */}
      <span className="flex-1 font-medium text-gray-200">{pos.name}</span>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(pos)}
          className="p-1.5 hover:bg-blue-500/20 text-zinc-500 hover:text-blue-400 rounded-md transition-colors"
        >
          <Edit size={14} />
        </button>
        <button
          onClick={() => onDelete(pos.id)}
          className="p-1.5 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 rounded-md transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function PositionsPage() {
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [positions, setPositions] = useState<Position[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const fetchPositions = async (tid: string) => {
    try {
      const res = await fetch('/api/v1/positions', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': tid
        }
      });
      if (res.ok) {
        const data = await res.json();
        // Server sends order based on SortOrder ASC
        setPositions(data.positions || []);
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
    }
  };

  useEffect(() => {
    const hostname = window.location.hostname;
    const subdomain = hostname.split('.')[0];

    // Simple verification (same as users page)
    if (subdomain !== 'localhost' && subdomain !== 'lvh' && subdomain !== 'www') {
      setTenantId(subdomain);
      setIsLoading(true);
      fetchPositions(subdomain).finally(() => setIsLoading(false));
    } else {
      // For development
    }
  }, []);

  const handleCreate = () => {
    if (!tenantId) {
      showToast('Tenant ID missing (dev env?)', 'error');
      return;
    }
    setIsCreateModalOpen(true);
  };

  const handleEdit = async (pos: Position) => {
    if (!tenantId) return;

    const newName = prompt(t.admin.settings.positions.position.modal.name, pos.name);
    if (!newName || newName === pos.name) return;

    try {
      const res = await fetch(`/api/v1/positions/${pos.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({ name: newName }),
      });

      if (res.ok) {
        showToast('Updated successfully');
        fetchPositions(tenantId); // Refresh list
      } else {
        showToast('Failed to update', 'error');
      }
    } catch (err) {
      showToast('Network error', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.admin.settings.positions.common.delete_confirm)) return;

    if (!tenantId) return;

    try {
      const res = await fetch(`/api/v1/positions/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': tenantId,
        }
      });

      if (res.ok) {
        showToast('Deleted successfully');
        fetchPositions(tenantId);
      } else {
        showToast('Failed to delete', 'error');
      }
    } catch (err) {
      showToast('Network error', 'error');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPositions((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        // Send new order to server (async)
        const updates = newItems.map((item, index) => ({
          id: item.id,
          order: index
        }));

        fetch('/api/v1/positions/reorder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
            'X-Tenant-ID': tenantId
          },
          body: JSON.stringify({ tenant_id: tenantId, items: updates })
        }).then(res => {
          if (!res.ok) {
            console.error("Failed to save reorder");
            showToast("Failed to save order", 'error');
          }
        });

        return newItems;
      });
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <TitleLabel
          title={t.admin.settings.positions.position.title}
          subtitle={t.admin.settings.positions.position.description}
        />
        <AddButton
          onClick={handleCreate}
        // label={t.admin.settings.positions.position.add_button}
        />
      </div>

      {/* Content */}
      <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden backdrop-blur-sm relative flex flex-col">
        <div className="overflow-y-auto custom-scrollbar flex-1 p-6">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={positions}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {positions.map(pos => (
                    <SortablePositionItem key={pos.id} pos={pos} onDelete={handleDelete} onEdit={handleEdit} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <CreatePositionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(options) => {
          fetchPositions(tenantId);
          if (options?.bulkCount) {
            showToast(t.admin.settings.positions.position.create.bulk.success.replace('{count}', options.bulkCount.toString()), 'success');
          }
        }}
      />
    </div>
  );
}
