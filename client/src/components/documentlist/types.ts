/**
 * ==========================================================================
 * types.ts - 문서 목록 타입 정의
 * ==========================================================================
 * 
 * 문서 목록(사이드바) 컴포넌트들에서 공유하는 타입 정의입니다.
 * ==========================================================================
 */

/**
 * 사이드바 모드
 * - folder: 폴더/파일 트리 보기
 * - star: 즐겨찾기 목록 보기
 */
export type DocumentListSidebarMode = 'folder' | 'star';

/**
 * 드롭 위치 (Drag and Drop)
 */
export type DocumentListDropPosition = 'top' | 'bottom' | 'inside';

/**
 * 문서 목록 아이템 (단일 파일/폴더)
 */
export interface DocumentListItemType {
  /** 문서 ID */
  id: string;
  /** 문서 제목 */
  title: string;
  /** 문서 경로 (미사용 가능성 있음) */
  path: string;
  /** 즐겨찾기 여부 */
  isFavorite?: boolean;
  /** 하위 문서 목록 */
  children?: DocumentListItemType[];
  /** 확장 여부 (UI 상태) */
  expanded?: boolean;
  /** 가시성 수준 */
  visibility_level?: number;
}

/**
 * 문서 목록 그룹 (부서, 프로젝트 등)
 */
export interface DocumentListGroupType {
  /** 그룹 ID */
  id: string;
  /** 그룹 이름 */
  name: string;
  /** 그룹 유형 */
  type: 'department' | 'project' | 'private';
  /** 포함된 문서 아이템 목록 */
  items: DocumentListItemType[];
  /** 그룹 확장 여부 */
  expanded: boolean;
}
