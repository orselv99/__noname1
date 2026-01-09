import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserInfo, LoginResponse } from '../types';

interface AuthState {
  user: UserInfo | null;
  isAuthenticated: boolean;

  // Name Mappings (ID -> Name)
  tenants: Record<string, string>;
  departments: Record<string, string>;
  positions: Record<string, string>;
  projects: Record<string, string>;

  // Actions
  setUser: (user: UserInfo | LoginResponse) => void;
  logout: () => void;

  updateTenantName: (id: string, name: string) => void;
  updateDepartmentName: (id: string, name: string) => void;
  updatePositionName: (id: string, name: string) => void;
  updateProjectName: (id: string, name: string) => void;

  // Bulk update helpers
  setTenantNames: (map: Record<string, string>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      tenants: {},
      departments: {},
      positions: {},
      projects: {},

      setUser: (user) => set((state) => {
        // Auto-populate mappings from user info if available
        const newDepts = { ...state.departments };
        if (user.department_id && user.department_name) {
          newDepts[user.department_id] = user.department_name;
        }

        const newPositions = { ...state.positions };
        if (user.position_id && user.position_name) {
          newPositions[user.position_id] = user.position_name;
        }

        const newProjects = { ...state.projects };
        if ('joined_projects' in user && user.joined_projects) {
          user.joined_projects.forEach((p) => {
            newProjects[p.id] = p.name;
          });
        }

        return {
          user,
          isAuthenticated: true,
          departments: newDepts,
          positions: newPositions,
          projects: newProjects,
        };
      }),

      logout: () => set({
        user: null,
        isAuthenticated: false,
        tenants: {},
        departments: {},
        positions: {},
        projects: {}
      }),

      updateTenantName: (id, name) => set((state) => ({ tenants: { ...state.tenants, [id]: name } })),
      updateDepartmentName: (id, name) => set((state) => ({ departments: { ...state.departments, [id]: name } })),
      updatePositionName: (id, name) => set((state) => ({ positions: { ...state.positions, [id]: name } })),
      updateProjectName: (id, name) => set((state) => ({ projects: { ...state.projects, [id]: name } })),

      setTenantNames: (map) => set((state) => ({ tenants: { ...state.tenants, ...map } })),
    }),
    {
      name: 'auth-storage',
    }
  )
);
