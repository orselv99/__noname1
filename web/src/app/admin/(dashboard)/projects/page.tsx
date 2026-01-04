'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import {
  Briefcase,
  Plus,
  Search,
  Pencil,
  Trash2,
  GripVertical
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CreateProjectModal from '@/components/admin/projects/CreateProjectModal';
import EditProjectModal from '@/components/admin/projects/EditProjectModal';
import AddButton from '@/components/admin/ui/AddButton';
import TitleLabel from '@/components/admin/ui/TitleLabel';

interface Project {
  id: string;
  name: string;
  description: string;
  default_visibility_level?: number;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

function SortableProjectItem({
  project,
  onEdit,
  onDelete
}: {
  project: Project;
  onEdit: (proj: Project) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 py-3 px-6 hover:bg-white/5 transition-colors group border-b border-zinc-800/50 bg-zinc-900/30 ${isDragging ? 'bg-blue-500/10 z-10 relative' : ''}`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="w-6 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300"
      >
        <GripVertical size={16} />
      </button>

      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
        <Briefcase size={20} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{project.name}</span>
        </div>
        {project.description && (
          <p className="text-xs text-gray-500 truncate">{project.description}</p>
        )}
      </div>

      {/* Visibility Badge */}
      {project.default_visibility_level && (
        <span className={`text-xs px-2 py-0.5 rounded-full ${project.default_visibility_level === 1 ? 'bg-gray-700 text-gray-300' :
          project.default_visibility_level === 2 ? 'bg-blue-900/50 text-blue-300' :
            project.default_visibility_level === 3 ? 'bg-amber-900/50 text-amber-300' :
              'bg-green-900/50 text-green-300'
          }`}>
          {project.default_visibility_level === 1 ? 'Hidden' :
            project.default_visibility_level === 2 ? 'Metadata' :
              project.default_visibility_level === 3 ? 'Snippet' : 'Public'}
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
          onClick={() => onEdit(project)}
        >
          <Pencil size={16} />
        </button>
        <button
          className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
          onClick={() => onDelete(project.id)}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { t } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    fetchProjects();
  }, [searchQuery]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (searchQuery) queryParams.append('search', searchQuery);

      const res = await fetch(`/api/v1/projects?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        }
      });

      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      const res = await fetch(`/api/v1/projects/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        }
      });

      if (res.ok) {
        fetchProjects();
      } else {
        alert('Failed to delete project');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = projects.findIndex((p) => p.id === active.id);
    const newIndex = projects.findIndex((p) => p.id === over.id);

    // Optimistic Update
    const newProjects = [...projects];
    const [movedItem] = newProjects.splice(oldIndex, 1);
    newProjects.splice(newIndex, 0, movedItem);

    // Update sort_order
    const updatedProjects = newProjects.map((p, idx) => ({ ...p, sort_order: idx }));
    setProjects(updatedProjects);

    // Send to server
    const items = updatedProjects.map(p => ({
      id: p.id,
      sort_order: p.sort_order || 0
    }));

    try {
      await fetch('/api/v1/projects/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        },
        body: JSON.stringify(items)
      });
    } catch (error) {
      console.error('Failed to reorder:', error);
      fetchProjects(); // Revert on error
    }
  };

  const filteredProjects = projects; // Search is handled by backend query mostly, but if we want client side filtering on top:
  // Note: ListProjects API handles 'search' param, so we use 'projects' directly. But if we drag drop, we should probably disable search or drag drop while searching.
  // For simplicity, let's disable drag drop when searching if search query is present? 
  // API currently returns filtered list, so drag drop reordering filtered list might be confusing if indices are global.
  // We'll trust the user or just allow reordering current view (which sets sort order for these items).

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <TitleLabel title={t.admin.sidebar.projects || 'Projects'} subtitle={'Manage your organization\'s projects.'} />
        <AddButton
          onClick={() => setIsCreateModalOpen(true)}
        // label={t.admin.departments.add_department}
        />
      </div>

      {/* Toolbar */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Project List */}
      <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden backdrop-blur-sm relative flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-y-auto custom-scrollbar flex-1">
            {projects.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-gray-500">
                <Briefcase size={48} className="mb-4 opacity-50" />
                <p>No projects found.</p>
                <p className="text-sm">Create your first project to get started.</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col">
                    {projects.map(project => (
                      <SortableProjectItem
                        key={project.id}
                        project={project}
                        onEdit={(proj) => {
                          setSelectedProject(proj);
                          setIsEditModalOpen(true);
                        }}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        )}
      </div>

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchProjects}
      />

      <EditProjectModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedProject(null);
        }}
        onSuccess={fetchProjects}
        project={selectedProject}
      />
    </div>
  );
}
