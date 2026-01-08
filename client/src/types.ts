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

// 고정 그룹 ID (서버 UUID와 충돌 방지를 위해 접두사 사용)
export const FIXED_GROUP_IDS = {
  PRIVATE: '__fixed_private__',
  RECYCLE_BIN: '__fixed_recycle_bin__',
} as const;

// 정렬 옵션
export type SortOption = 'date' | 'name' | 'state';


export interface DocumentTag {
  tag: string;
  evidence?: string;
}

export interface Document {
  id: string;
  user_id: string;
  title: string;
  content: string; // HTML content or JSON string
  document_state: DocumentState;
  visibility_level: VisibilityLevel;
  group_type: GroupType;
  group_id?: string;
  summary?: string;
  created_at?: string;
  updated_at?: string;
  accessed_at?: string;
  size?: string;
  is_favorite?: boolean;
  tags?: DocumentTag[];
}

export interface SaveDocumentRequest {
  id?: string;
  title: string;
  content: string;
  summary?: string;
  group_type: number;
  group_id?: string;
  document_state: number;
  visibility_level: number;
  is_favorite?: boolean;
  tags?: DocumentTag[];
}
