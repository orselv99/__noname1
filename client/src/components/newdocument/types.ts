/**
 * ==========================================================================
 * types.ts - 새 문서 만들기 다이얼로그 타입 및 상수 정의
 * ==========================================================================
 * 
 * NewDocumentDialog 및 하위 컴포넌트들에서 사용되는
 * 공통 인터페이스와 상수들을 정의합니다.
 * ==========================================================================
 */

import { FileText, PenLine, Table, FileCode, Presentation, BookOpen, ClipboardList, LucideIcon } from 'lucide-react';

/**
 * 폴더 아이템 인터페이스
 * - 트리 구조의 폴더 정보를 나타냅니다.
 */
export interface FolderItem {
  /** 폴더 고유 ID */
  id: string;
  /** 폴더 이름 */
  name: string;
  /** 폴더 확장 여부 (UI 상태) */
  expanded: boolean;
  /** 하위 폴더 목록 */
  children?: FolderItem[];
}

/**
 * 그룹 정보 인터페이스
 * - 부서(department) 또는 프로젝트(project) 그룹 정보를 나타냅니다.
 */
export interface GroupItem {
  id: string;
  name: string;
  type: 'department' | 'project';
  expanded: boolean;
  folders: FolderItem[];
}

/**
 * 웹 검색 결과 인터페이스
 * - UI 표시를 위한 검색 결과 포맷
 */
export interface WebSearchResult {
  /** 문서 ID 또는 URL */
  id: string;
  /** 문서 제목 */
  title: string;
  /** 내용 요약 또는 스니핏 */
  snippet: string;
  /** 원본 URL */
  url: string;
  /** 선택 여부 */
  selected: boolean;
  /** 유사도 점수 (0-100) */
  score?: number;
  /** 출처 (로컬, 서버 등) */
  source?: 'local' | 'server';
}

/**
 * RAG 검색 결과 인터페이스 (백엔드 응답)
 */
export interface RagSearchResult {
  document_id: string;
  distance: number;
  similarity: number;
  content: string;
  summary: string | null;
  title: string | null;
  tags: string[];
  group_name?: string;
}

/**
 * 템플릿 정보 인터페이스
 */
export interface TemplateInfo {
  id: string;
  name: string;
  icon: LucideIcon;
  description?: string;
}

/** 자주 사용하는 템플릿 목록 */
export const frequentTemplates: TemplateInfo[] = [
  { id: 'blank', name: 'Blank', icon: FileText },
  { id: 'note', name: 'Note', icon: PenLine },
  { id: 'meeting', name: 'Meeting', icon: Table },
  { id: 'code', name: 'Code', icon: FileCode },
  { id: 'presentation', name: 'Presentation', icon: Presentation },
];

/** 전체 템플릿 목록 (검색용 상세 설명 포함) */
export const allTemplates: TemplateInfo[] = [
  { id: 'blank', name: 'Blank', icon: FileText, description: '빈 문서' },
  { id: 'note', name: 'Note', icon: PenLine, description: '간단한 메모' },
  { id: 'meeting', name: 'Meeting', icon: Table, description: '회의록 템플릿' },
  { id: 'code', name: 'Code', icon: FileCode, description: '코드 문서' },
  { id: 'presentation', name: 'Presentation', icon: Presentation, description: '프레젠테이션' },
  { id: 'wiki', name: 'Wiki', icon: BookOpen, description: '위키 문서' },
  { id: 'checklist', name: 'Checklist', icon: ClipboardList, description: '체크리스트' },
];
