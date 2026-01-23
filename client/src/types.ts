export enum DocumentState {
  Draft = 1,
  Feedback = 2,
  Published = 3,
}

export enum VisibilityLevel {
  Hidden = 1,
  Metadata = 2,
  Snippet = 3,
  Public = 4,
}

export enum GroupType {
  Department = 0,
  Project = 1,
  Private = 2,
}

export const RECYCLE_BIN_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
export const PRIVATE_GROUP_ID = '00000000-0000-0000-0000-000000000000';



// 정렬 옵션
export enum SortOption {
  NameAsc = 'name_asc',
  NameDesc = 'name_desc',
  DateNewest = 'date_newest',
  DateOldest = 'date_oldest',
}


export interface DocumentTag {
  tag: string;
  evidence?: string;
}

export interface Document {
  id: string;
  user_id: string;
  creator_name?: string; // Added from backend
  title: string;
  content: string; // HTML content or JSON string
  document_state: DocumentState;
  visibility_level: VisibilityLevel;
  group_type: GroupType;
  group_id?: string;
  parent_id?: string; // Added for hierarchy
  summary?: string;
  created_at?: string;
  updated_at?: string;
  last_synced_at?: number; // Renamed from updated_at_ts
  accessed_at?: string;
  size?: string;
  is_favorite?: boolean;
  tags?: DocumentTag[];
  deleted_at?: string;
  version: number;
  media_size?: string; // Added for persistence
}

export interface SaveDocumentRequest {
  id?: string;
  title: string;
  content: string;
  summary?: string;
  group_type: GroupType;
  group_id?: string;
  parent_id?: string;
  document_state: DocumentState;
  visibility_level: number;
  is_favorite?: boolean;
  tags?: DocumentTag[];
  creator_name?: string;
  version?: number;
}

export interface ListDocumentsResponse {
  docs: Document[];
  last_synced_at: number;
}

export interface UserInfo {
  user_id: string;
  username: string;
  position_id?: string;
  position_name?: string;
  role: string;
  tenant_id: string;
  department?: DepartmentInfo;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface LoginResponse extends UserInfo {
  access_token: string;
  force_change_password: boolean;
  is_offline: boolean;
  phone_numbers: string[];
  contact?: string;
  birthday?: string;
  created_at?: string;
  updated_at?: string;
  joined_projects?: ProjectInfo[];
}

export interface DepartmentInfo {
  id: string;
  name: string;
  default_visibility_level: number;
}

export interface ProjectInfo {
  id: string;
  name: string;
  description?: string;
  default_visibility_level: number;
}
