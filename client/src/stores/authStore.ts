import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserInfo, LoginResponse, CrewMember, ListUsersResponse } from '../types';
import { invoke } from '@tauri-apps/api/core';

interface AuthState {
  user: UserInfo | null;
  isAuthenticated: boolean;

  // Name & Visibility Mappings (ID -> { name, visibility })
  tenants: Record<string, string>;
  departments: Record<string, { name: string; visibility: number }>;
  positions: Record<string, string>;
  projects: Record<string, { name: string; visibility: number }>;

  // Crew List
  crew: CrewMember[];
  onlineUsers: Record<string, boolean>; // Presence Source of Truth
  fetchCrew: (includeAllRoles?: boolean) => Promise<void>;
  updateCrewPresence: (userId: string, isOnline: boolean) => void;

  // Actions
  setUser: (user: UserInfo | LoginResponse) => void;
  refreshToken: () => Promise<void>;
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
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      tenants: {},
      departments: {},
      positions: {},
      projects: {},
      crew: [],
      onlineUsers: {},

      setUser: (user) => set((state) => {
        console.log('resp', user, 'state', state);


        // Auto-populate mappings from user info if available
        const newDepts = { ...state.departments };
        if ('department' in user && user.department) {
          newDepts[user.department.id] = {
            name: user.department.name,
            visibility: user.department.default_visibility_level
          };
        }

        const newPositions = { ...state.positions };
        if (user.position_id && user.position_name) {
          newPositions[user.position_id] = user.position_name;
        }

        const newProjects = { ...state.projects };
        if ('joined_projects' in user && user.joined_projects) {
          user.joined_projects.forEach((p) => {
            newProjects[p.id] = {
              name: p.name,
              visibility: p.default_visibility_level || 2
            };
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
        projects: {},
        onlineUsers: {}
      }),

      updateTenantName: (id, name) => set((state) => ({ tenants: { ...state.tenants, [id]: name } })),
      updateDepartmentName: (id, name) => set((state) => ({
        departments: {
          ...state.departments,
          [id]: { ...state.departments[id], name }
        }
      })),
      updatePositionName: (id, name) => set((state) => ({ positions: { ...state.positions, [id]: name } })),
      updateProjectName: (id, name) => set((state) => ({
        projects: {
          ...state.projects,
          [id]: { ...state.projects[id], name }
        }
      })),

      setTenantNames: (map) => set((state) => ({ tenants: { ...state.tenants, ...map } })),

      refreshToken: async () => {
        const { user, setUser, logout } = get();
        // @ts-ignore
        if (!user?.refresh_token) {
          return;
        }

        try {
          // @ts-ignore
          const res = await invoke<LoginResponse>('refresh_token', { refreshToken: user.refresh_token });

          // Merge new tokens into existing user object
          // @ts-ignore
          const newUser = { ...user, ...res };
          setUser(newUser);
        } catch (error) {
          console.error('Failed to refresh token:', error);
          logout();
        }
      },

      fetchCrew: async (includeAllRoles = true) => {
        try {
          const res = await invoke<ListUsersResponse>('list_users', {
            page: 1,
            pageSize: 1000,
            includeAllRoles
          });

          // Merge with current online state
          const currentOnlineUsers = get().onlineUsers;
          const mergedCrew = res.users.map(u => ({
            ...u,
            is_online: currentOnlineUsers[u.id] ?? u.is_online
          }));

          set({ crew: mergedCrew });
          console.log('Fetched crew:', mergedCrew);
        } catch (error) {
          console.error('Failed to fetch crew:', error);
        }
      },

      updateCrewPresence: (userId, isOnline) => set((state) => {
        const newOnlineUsers = { ...state.onlineUsers, [userId]: isOnline };

        return {
          onlineUsers: newOnlineUsers,
          crew: state.crew.map(member =>
            member.id === userId
              ? { ...member, is_online: isOnline }
              : member
          )
        };
      }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
