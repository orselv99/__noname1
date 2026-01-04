'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Network, Users, ChevronRight, Hash } from 'lucide-react';

interface User {
  id: string;
  department_id?: string;
  // ... other fields not needed for counting
}

interface OrganizationSidebarProps {
  users: User[];
  selectedDepartment: string | null;
  onSelectDepartment: (deptId: string | null) => void;
}

export default function OrganizationSidebar({ users, selectedDepartment, onSelectDepartment }: OrganizationSidebarProps) {
  // Extract unique departments and count users
  const departments = useMemo(() => {
    const deptMap = new Map<string, number>();
    let noDeptCount = 0;

    users.forEach(user => {
      const dept = user.department_id;
      if (dept) {
        deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
      } else {
        noDeptCount++;
      }
    });

    const sortedDepts = Array.from(deptMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { sortedDepts, noDeptCount };
  }, [users]);

  return (
    <div className="w-full h-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 backdrop-blur-sm flex flex-col gap-4">
      <div className="flex items-center gap-2 pb-4 border-b border-zinc-800">
        <Network className="text-blue-500" size={20} />
        <h2 className="text-lg font-bold text-white">Organization</h2>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto pr-2 custom-scrollbar">
        {/* All Users */}
        <button
          onClick={() => onSelectDepartment(null)}
          className={`group flex items-center justify-between p-3 rounded-lg transition-all ${selectedDepartment === null
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
              : 'hover:bg-zinc-800 text-gray-400 hover:text-white'
            }`}
        >
          <div className="flex items-center gap-3">
            <Users size={16} className={selectedDepartment === null ? 'text-white' : 'text-gray-500 group-hover:text-white'} />
            <span className="font-medium">All Users</span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${selectedDepartment === null ? 'bg-white/20' : 'bg-zinc-800 group-hover:bg-zinc-700'
            }`}>
            {users.length}
          </span>
        </button>

        <div className="h-px bg-zinc-800 my-1" />
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-1">Departments</div>

        {/* Dynamic Departments */}
        {departments.sortedDepts.map((dept) => (
          <button
            key={dept.name}
            onClick={() => onSelectDepartment(dept.name)}
            className={`group flex items-center justify-between p-2.5 rounded-lg transition-all ${selectedDepartment === dept.name
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-gray-400 hover:bg-zinc-800/50 hover:text-white'
              }`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className={`p-1.5 rounded-md ${selectedDepartment === dept.name ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-800 text-gray-500 group-hover:text-gray-300'}`}>
                <Hash size={14} />
              </div>
              <span className="font-medium truncate">{dept.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">{dept.count}</span>
              {selectedDepartment === dept.name && <ChevronRight size={14} className="text-blue-500" />}
            </div>
          </button>
        ))}

        {/* No Department */}
        {departments.noDeptCount > 0 && (
          <button
            onClick={() => onSelectDepartment('Unassigned')}
            className={`group flex items-center justify-between p-2.5 rounded-lg transition-all ${selectedDepartment === 'Unassigned'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-gray-400 hover:bg-zinc-800/50 hover:text-white'
              }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-zinc-800 text-gray-500">
                <Hash size={14} />
              </div>
              <span className="font-medium italic">Unassigned</span>
            </div>
            <span className="text-xs text-gray-600">{departments.noDeptCount}</span>
          </button>
        )}

        {departments.sortedDepts.length === 0 && departments.noDeptCount === 0 && (
          <div className="text-center py-4 text-xs text-gray-600">
            No departments found
          </div>
        )}
      </div>
    </div>
  );
}
