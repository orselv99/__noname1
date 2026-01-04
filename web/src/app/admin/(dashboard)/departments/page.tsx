'use client';

import {
  useState,
  useEffect,
  useRef
} from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/context/LanguageContext';
import {
  Search,
  Trash2,
  ChevronRight,
  ChevronDown,
  FolderTree,
  GripVertical,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Layers
} from 'lucide-react';
import CreateDepartmentModal from '@/components/admin/departments/CreateDepartmentModal';
import { useToast } from '@/components/admin/Toast';
import AddButton from '@/components/admin/ui/AddButton';
import {
  motion,
  AnimatePresence
} from 'framer-motion';
import {
  DndContext,
  DragEndEvent,
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
import TitleLabel from '@/components/admin/ui/TitleLabel';

interface Department {
  id: string;
  name: string;
  description?: string; // Optional for backward compatibility
  parent_department_id?: string;
  default_visibility_level?: number;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

interface DepartmentNode extends Department {
  children: DepartmentNode[];
}

// Build tree structure from flat list
function buildTree(departments: Department[]): DepartmentNode[] {
  const map = new Map<string, DepartmentNode>();
  const roots: DepartmentNode[] = [];

  // Sort by sort_order first
  const sorted = [...departments].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // Create nodes
  sorted.forEach(dept => {
    map.set(dept.id, { ...dept, children: [] });
  });

  // Build tree
  sorted.forEach(dept => {
    const node = map.get(dept.id)!;
    if (dept.parent_department_id && map.has(dept.parent_department_id)) {
      map.get(dept.parent_department_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

// Get flattened IDs for SortableContext (respecting expansion state)
function getFlattenedIds(nodes: DepartmentNode[], expandedIds: Set<string>): string[] {
  let ids: string[] = [];
  nodes.forEach(node => {
    ids.push(node.id);
    if (node.children.length > 0 && expandedIds.has(node.id)) {
      ids.push(...getFlattenedIds(node.children, expandedIds));
    }
  });
  return ids;
}

// Sortable tree item component
function SortableDepartmentItem({
  node,
  level = 0,
  onDelete,
  onVisibilityChange,
  expandedIds,
  toggleExpand,
  highlightedId
}: {
  node: DepartmentNode;
  level?: number;
  onDelete: (id: string) => void;
  onVisibilityChange: (id: string, level: number) => void;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  highlightedId?: string | null;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isHighlighted = highlightedId === node.id;
  const [showVisibilityDropdown, setShowVisibilityDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const dropdownContentRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showVisibilityDropdown && dropdownTriggerRef.current) {
      const rect = dropdownTriggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const height = 150; // Increased safety margin
      const openUpwards = spaceBelow < height;

      setDropdownPosition({
        top: openUpwards ? rect.top - height + 15 /* padding 추가 */ : rect.bottom + 4,
        left: Math.max(10, rect.right - 140), // Prevent going off-screen left
      });
    }
    setShowVisibilityDropdown(!showVisibilityDropdown);
  };


  // Close dropdown on scroll
  useEffect(() => {
    if (showVisibilityDropdown) {
      const handleScroll = () => setShowVisibilityDropdown(false);
      window.addEventListener('scroll', handleScroll, true);
      return () => window.removeEventListener('scroll', handleScroll, true);
    }
  }, [showVisibilityDropdown]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownTriggerRef.current && !dropdownTriggerRef.current.contains(target) &&
        dropdownContentRef.current && !dropdownContentRef.current.contains(target)
      ) {
        setShowVisibilityDropdown(false);
      }
    };

    if (showVisibilityDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showVisibilityDropdown]);

  const { t } = useLanguage();

  const VISIBILITY_LEVELS = [
    { value: 1, label: t.admin.departments.visibility.level_1, icon: EyeOff, color: 'bg-gray-700 text-gray-300', hoverColor: 'hover:bg-gray-600' },
    { value: 2, label: t.admin.departments.visibility.level_2, icon: FileText, color: 'bg-blue-900/50 text-blue-300', hoverColor: 'hover:bg-blue-800/50' },
    { value: 3, label: t.admin.departments.visibility.level_3, icon: Eye, color: 'bg-amber-900/50 text-amber-300', hoverColor: 'hover:bg-amber-800/50' },
    { value: 4, label: t.admin.departments.visibility.level_4, icon: Globe, color: 'bg-green-900/50 text-green-300', hoverColor: 'hover:bg-green-800/50' },
  ];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };


  return (
    <>
      <div ref={setNodeRef} style={style}>
        <div
          className={`flex items-center gap-2 py-2.5 px-4 hover:bg-white/5 transition-all group border-b border-zinc-800/50 ${isDragging ? 'bg-blue-500/10' : ''} ${isHighlighted ? 'bg-blue-300/20 animate-pulse ring-1 ring-blue-300/50' : ''}`}
          style={{ paddingLeft: `${level * 24 + 16}px` }}
        >
          {/* Drag Handle */}
          <button
            {...attributes}
            {...listeners}
            className="w-6 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300"
          >
            <GripVertical size={16} />
          </button>

          {/* Expand/Collapse Button */}
          <button
            onClick={() => toggleExpand(node.id)}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${hasChildren ? 'hover:bg-white/10 text-gray-400' : 'text-transparent cursor-default'}`}
            disabled={!hasChildren}
          >
            {hasChildren && (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
          </button>

          {/* Icon */}
          {/* <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasChildren ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}> */}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/10 text-blue-400">
            {/* {hasChildren ? <FolderTree size={16} /> : <Building size={16} />} */}
            <Layers size={16} />
          </div>

          {/* Name */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{node.name || '(Unnamed)'}</span>
              {hasChildren && (
                <span className="text-xs text-gray-500 bg-zinc-800 px-1.5 py-0.5 rounded-full">
                  {node.children.length}
                </span>
              )}
            </div>
            {node.description && (
              <p className="text-xs text-gray-500 truncate">{node.description}</p>
            )}
          </div>

          {/* Visibility Level Badge with Dropdown */}
          <div className="relative">
            {(() => {
              const currentLevel = VISIBILITY_LEVELS.find(v => v.value === (node.default_visibility_level || 4)) || VISIBILITY_LEVELS[3];
              const Icon = currentLevel.icon;
              return (
                <button
                  ref={dropdownTriggerRef}
                  onClick={toggleDropdown}
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-all ${currentLevel.color} ${currentLevel.hoverColor} cursor-pointer`}
                >
                  <Icon size={12} />
                  {currentLevel.label}
                  <ChevronDown size={10} className="opacity-50" />
                </button>
              );
            })()}

            {showVisibilityDropdown && isMounted && createPortal(
              <div
                ref={dropdownContentRef}
                style={{
                  position: 'fixed',
                  top: dropdownPosition.top,
                  left: dropdownPosition.left,
                  width: '140px',
                  zIndex: 99999,
                }}
                className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden"
              >
                {VISIBILITY_LEVELS.map((level) => {
                  const Icon = level.icon;
                  const isSelected = (node.default_visibility_level || 4) === level.value;
                  return (
                    <button
                      key={level.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        onVisibilityChange(node.id, level.value);
                        setShowVisibilityDropdown(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${isSelected ? level.color : 'text-gray-300 hover:bg-zinc-700'
                        }`}
                    >
                      <Icon size={14} />
                      {level.label}
                    </button>
                  );
                })}
              </div>,
              document.body
            )}
          </div>

          {/* Actions - Delete only */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
              onClick={() => onDelete(node.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Children - rendered OUTSIDE the sortable container */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {node.children.map(child => (
              <SortableDepartmentItem
                key={child.id}
                node={child}
                level={level + 1}
                onDelete={onDelete}
                onVisibilityChange={onVisibilityChange}
                expandedIds={expandedIds}
                toggleExpand={toggleExpand}
                highlightedId={highlightedId}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function DepartmentsPage() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [highlightedDeptId, setHighlightedDeptId] = useState<string | null>(null);

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const hasInitializedExpansion = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Build tree from flat list
  const tree = buildTree(departments);
  const visibleIds = getFlattenedIds(tree, expandedIds);

  useEffect(() => {
    fetchDepartments();
  }, [searchQuery]);

  // Expand all by default (only on initial load)
  useEffect(() => {
    if (departments.length > 0 && !hasInitializedExpansion.current) {
      const ids = new Set(departments.filter(d => departments.some(c => c.parent_department_id === d.id)).map(d => d.id));
      setExpandedIds(ids);
      hasInitializedExpansion.current = true;
    }
  }, [departments]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const fetchDepartments = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (searchQuery) queryParams.append('query', searchQuery);

      const res = await fetch(`/api/v1/departments?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        }
      });

      if (res.ok) {
        const data = await res.json();
        setDepartments(data.departments || []);
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.admin.departments.delete_confirm)) return;

    // Optimistic update - remove from local state immediately
    const previousDepartments = departments;
    setDepartments(prev => prev.filter(d => d.id !== id));

    // Also remove from expandedIds if it was a parent
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    try {
      const res = await fetch(`/api/v1/departments/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        }
      });

      if (!res.ok) {
        // Revert on failure
        setDepartments(previousDepartments);
        alert(t.admin.departments.delete_error);
      }
    } catch (error) {
      // Revert on error
      setDepartments(previousDepartments);
      console.error(error);
    }
  };

  const handleVisibilityChange = async (id: string, level: number) => {
    // Optimistic update
    setDepartments(prev => prev.map(d =>
      d.id === id ? { ...d, default_visibility_level: level } : d
    ));

    try {
      const res = await fetch(`/api/v1/departments/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        },
        body: JSON.stringify({ default_visibility_level: level })
      });

      if (!res.ok) {
        fetchDepartments(); // Revert on failure
      }
    } catch (error) {
      console.error('Failed to update visibility:', error);
      fetchDepartments(); // Revert on failure
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeDept = departments.find(d => d.id === activeId);
    const overDept = departments.find(d => d.id === overId);

    if (!activeDept || !overDept) return;

    // Logic: Adopt the parent of the drop target (sibling logic)
    const newParentId = overDept.parent_department_id;

    // Optimistic Update
    let newDepts = departments.map(d =>
      d.id === activeId ? { ...d, parent_department_id: newParentId } : d
    );

    // Find all siblings of the TARGET
    const targetSiblings = newDepts.filter(d => d.parent_department_id === newParentId && d.id !== activeId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // Where is the target in this list?
    const targetIndex = targetSiblings.findIndex(d => d.id === overId);

    const flatIds = getFlattenedIds(tree, expandedIds);
    const oldFlatIndex = flatIds.indexOf(activeId);
    const newFlatIndex = flatIds.indexOf(overId);

    let insertIndex = targetIndex;
    if (oldFlatIndex < newFlatIndex) {
      insertIndex = targetIndex + 1;
    }

    targetSiblings.splice(insertIndex, 0, { ...activeDept, parent_department_id: newParentId });

    // Re-assign sort_orders
    targetSiblings.forEach((d, idx) => {
      const found = newDepts.find(x => x.id === d.id);
      if (found) found.sort_order = idx;
    });

    setDepartments(newDepts);

    // Send to server
    const items = newDepts.map(d => ({
      id: d.id,
      parent_department_id: d.parent_department_id || '',
      sort_order: d.sort_order || 0
    }));

    try {
      const res = await fetch('/api/v1/departments/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        },
        body: JSON.stringify(items)
      });
      if (!res.ok) fetchDepartments();
    } catch (error) {
      console.error('Failed to reorder:', error);
      fetchDepartments();
    }
  };

  // For search, show flat list filtered
  const filteredDepartments = searchQuery
    ? departments.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="h-14 flex items-center justify-between shrink-0">
        <TitleLabel title={t.admin.departments.title} subtitle={t.admin.departments.subtitle} />
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
            placeholder={t.admin.departments.search_placeholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Tree View */}
      <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden backdrop-blur-sm relative flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-y-auto custom-scrollbar flex-1 pb-40">
            {departments.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-gray-500">
                <FolderTree size={48} className="mb-4 opacity-50" />
                <p>No departments found.</p>
                <p className="text-sm">Create your first department to get started.</p>
              </div>
            ) : filteredDepartments ? (
              // Flat search results (no drag)
              <div>
                <div className="px-4 py-2 bg-zinc-800/50 text-xs text-gray-500 border-b border-zinc-800">
                  Search results: {filteredDepartments.length} departments
                </div>
                {filteredDepartments.map(dept => (
                  <div
                    key={dept.id}
                    className="flex items-center gap-3 py-3 px-4 hover:bg-white/5 transition-colors group border-b border-zinc-800/50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                      <Layers size={16} />
                    </div>
                    <div className="flex-1">
                      <span className="font-medium text-white">{dept.name}</span>
                      {dept.description && (
                        <p className="text-xs text-gray-500">{dept.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
                        onClick={() => handleDelete(dept.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Tree view with drag-drop
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
                  <div>
                    {tree.map(node => (
                      <SortableDepartmentItem
                        key={node.id}
                        node={node}
                        onDelete={handleDelete}
                        onVisibilityChange={handleVisibilityChange}
                        expandedIds={expandedIds}
                        toggleExpand={toggleExpand}
                        highlightedId={highlightedDeptId}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        )}
      </div>

      <CreateDepartmentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={async (options) => {
          await fetchDepartments(true);

          // Expand parent if exists
          if (options?.parentId) {
            setExpandedIds(prev => {
              const next = new Set(prev);
              next.add(options.parentId!);
              return next;
            });
          }

          // Highlight newly added department
          if (options?.newDeptId) {
            setHighlightedDeptId(options.newDeptId);
            // Remove highlight after animation
            setTimeout(() => setHighlightedDeptId(null), 2000);
          }

          // Show toast for bulk import
          showToast(t.admin.departments.create.bulk.success.replace(
            '{count}',
            (options?.bulkCount) ? options.bulkCount.toString() : '1'));
        }}
      />
    </div>
  );
}
