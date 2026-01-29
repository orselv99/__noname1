/**
 * ==========================================================================
 * DocumentList.tsx - 문서 목록 메인 컴포넌트
 * ==========================================================================
 * 
 * 사이드바의 문서 목록을 표시하고 관리합니다.
 * - 그룹 및 문서 트리 구조 렌더링
 * - 드래그 앤 드롭을 통한 문서 이동 및 순서 변경
 * - 컨텍스트 메뉴 (삭제, 이름 변경 등)
 * - 정렬 옵션 관리
 * ==========================================================================
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useContentStore } from '../../stores/contentStore';
import { GroupType, SortOption, PRIVATE_GROUP_ID } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useConfirm } from '../common/ConfirmProvider';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { DocumentListSidebarMode, DocumentListItemType, DocumentListGroupType, DocumentListDropPosition } from './types';
import { ChevronsUpDown, Edit2, FilePlus, FileText, Search, Share2, Star, Trash2 } from 'lucide-react';
import { DocumentListGroup } from './DocumentListGroup';
import { createPortal } from 'react-dom';
import { NewDocumentDialog } from '../newdocument/NewDocumentDialog';
import { GroupLinkDialog } from '../dialogs/GroupLinkDialog';

// Constants
const PRIVATE_GROUP_UI_ID = 'private_group';

export interface DocumentListProps {
  /** 문서 선택 핸들러 */
  onSelectDocument?: (id: string) => void;
  /** 사이드바 모드 (폴더/즐겨찾기) */
  mode?: DocumentListSidebarMode;
}

/**
 * 트리를 검색하는 헬퍼 함수
 */
const findItem = (items: DocumentListItemType[], id: string): DocumentListItemType | undefined => {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findItem(item.children, id);
      if (found) return found;
    }
  }
  return undefined;
};

/**
 * 아이템 확장 상태 재귀 업데이트 헬퍼
 */
const updateItemsExpansion = (items: DocumentListItemType[], expandedSet: Set<string>): DocumentListItemType[] => {
  return items.map(item => ({
    ...item,
    expanded: expandedSet.has(item.id),
    children: item.children ? updateItemsExpansion(item.children, expandedSet) : undefined
  }));
};

/**
 * 문서 목록 컴포넌트
 */
export const DocumentList = memo(({ onSelectDocument, mode = 'folder' }: DocumentListProps) => {
  // --- 상태 관리 ---
  // Optimized Selectors
  const documents = useContentStore(state => state.documents);
  const activeTabId = useContentStore(state => state.activeTabId);
  const tabs = useContentStore(state => state.tabs);
  const currentUser = useContentStore(state => state.currentUser);
  const newDocTrigger = useContentStore(state => state.newDocTrigger);

  // Actions (stable)
  const createDocument = useContentStore(state => state.createDocument);
  const renameDocument = useContentStore(state => state.renameDocument);
  const deleteDocument = useContentStore(state => state.deleteDocument);
  const fetchDocuments = useContentStore(state => state.fetchDocuments);
  const moveDocument = useContentStore(state => state.moveDocument);

  const { departments, projects } = useAuthStore();
  const { confirm } = useConfirm();

  // 그룹별 정렬 옵션 관리
  const [groupSortOptions, setGroupSortOptions] = useState<Record<string, SortOption>>({});
  const handleSortChange = useCallback((groupId: string, sort: SortOption) => {
    setGroupSortOptions(prev => ({ ...prev, [groupId]: sort }));
  }, []);

  const [isFavoriteFilter, setIsFavoriteFilter] = useState(false);

  // 확장 상태 지속성을 위한 Refs
  const expandedIdsRef = useRef<Set<string>>(new Set());
  const expandedGroupsRef = useRef<Set<string>>(new Set()); // 기본 확장 그룹 없음

  // 컨텍스트 메뉴 상태
  const [contextMenu, setContextMenu] = useState<{ id: string, x: number, y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // UI 다이얼로그 상태
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  const [showGroupLinkDialog, setShowGroupLinkDialog] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Drag and Drop 상태
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DocumentListDropPosition | null>(null);
  const [dragItem, setDragItem] = useState<DocumentListItemType | null>(null);

  // Handlers


  // DnD 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px 이상 이동 시 드래그 시작 (클릭과 구분)
      },
    })
  );

  // --- Effect Hooks ---

  // 외부 클릭 시 컨텍스트 메뉴 닫기
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Force update helper
  const [, forceUpdate] = useState(0);

  // Auto-expand paths for ALL open tabs
  useEffect(() => {
    if (tabs.length === 0) return;

    let changed = false;

    // Collect all document IDs from open tabs
    const openDocIds = tabs
      .filter(t => t.type === 'document')
      .map(t => t.id);

    // Also include activeTabId if it's not in the list for some reason (though it should be)
    if (activeTabId && !openDocIds.includes(activeTabId)) {
      openDocIds.push(activeTabId);
    }

    openDocIds.forEach(docId => {
      const doc = documents.find(d => d.id === docId);
      if (!doc) return;

      // 1. Expand parent folders
      let curr = doc;
      while (curr.parent_id) {
        if (!expandedIdsRef.current.has(curr.parent_id)) {
          expandedIdsRef.current.add(curr.parent_id);
          changed = true;
        }
        const parent = documents.find(d => d.id === curr.parent_id);
        if (!parent) break;
        curr = parent;
      }

      // 2. Expand Group
      let groupIdToExpand: string | undefined;
      if (doc.group_type === GroupType.Private) {
        groupIdToExpand = PRIVATE_GROUP_UI_ID;
      } else if (doc.group_type === GroupType.Department && doc.group_id) {
        groupIdToExpand = doc.group_id;
      } else if (doc.group_type === GroupType.Project && doc.group_id) {
        groupIdToExpand = doc.group_id;
      }

      if (groupIdToExpand && !expandedGroupsRef.current.has(groupIdToExpand)) {
        expandedGroupsRef.current.add(groupIdToExpand);
        changed = true;
      }
    });

    if (changed) {
      forceUpdate(n => n + 1);
    }
  }, [tabs, activeTabId, documents]); // Re-run when tabs or docs change
  // 모드 변경에 따라 필터 업데이트
  useEffect(() => {
    setIsFavoriteFilter(mode === 'star');
  }, [mode]);

  // 새 문서 트리거 감지
  useEffect(() => {
    if (newDocTrigger > 0) {
      setShowNewDocDialog(true);
    }
  }, [newDocTrigger]);

  // 초기 문서 로드
  useEffect(() => {
    fetchDocuments();
  }, []);

  // --- 이벤트 핸들러 ---

  // --- 이벤트 핸들러 ---

  const handleMenuClick = useCallback((e: React.MouseEvent, id: string) => {
    const button = e.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    setContextMenu({
      id,
      x: rect.right + 4,
      y: rect.top
    });
  }, []);

  const handleRename = useCallback((id: string) => {
    setRenamingId(id);
    setContextMenu(null);
  }, []);

  const handleRenameSubmit = useCallback(async (id: string, newTitle: string) => {
    if (newTitle.trim()) {
      await renameDocument(id, newTitle);
    }
    setRenamingId(null);
  }, [renameDocument]);

  const handleDelete = useCallback(async (id: string) => {
    setContextMenu(null);

    // 하위 문서 존재 여부 확인
    // documents is a dependency. If documents change, this recreates.
    // It's unavoidable unless we pass documents to handleDelete, or use getState().
    // Using getState() inside callback is better for memoization stability if documents change often.
    // But honestly, documents changing implies list re-rendering anyway, so dependency on documents is fine.
    // BUT wait, documents changes A LOT.
    // Let's use documents from closure for now, but be aware.
    // Optimally: useContentStore.getState().documents

    const currentDocuments = useContentStore.getState().documents;
    const hasChildren = currentDocuments.some(d => d.parent_id === id && !d.deleted_at);

    const message = hasChildren
      ? '이 문서를 삭제하시겠습니까?\n포함된 하위 문서들도 모두 함께 삭제됩니다.'
      : '이 문서를 삭제하시겠습니까?';

    if (await confirm({
      title: '문서 삭제',
      message: message,
      confirmText: '삭제',
      variant: 'danger'
    })) {
      await deleteDocument(id);
    }
  }, [confirm, deleteDocument]);

  // --- 그룹 및 트리 구성 로직 ---

  const [groups, setGroups] = useState<DocumentListGroupType[]>([]);

  // Toggle All Groups Handler
  const toggleAllGroups = useCallback(() => {
    const isAnyItemCollapsed = (items: DocumentListItemType[]): boolean => {
      for (const item of items) {
        if (item.children && item.children.length > 0) {
          if (!item.expanded) return true;
          if (isAnyItemCollapsed(item.children)) return true;
        }
      }
      return false;
    };

    const anyCollapsed = groups.some(g => !g.expanded || isAnyItemCollapsed(g.items));

    const setAllExpanded = (items: DocumentListItemType[], expanded: boolean): DocumentListItemType[] => {
      return items.map(item => {
        if (item.children && item.children.length > 0) {
          if (expanded) expandedIdsRef.current.add(item.id);
          else expandedIdsRef.current.delete(item.id);
        }

        return {
          ...item,
          expanded: expanded,
          children: item.children ? setAllExpanded(item.children, expanded) : undefined
        };
      });
    };

    setGroups(prev => prev.map(g => {
      const newExpanded = anyCollapsed;
      if (newExpanded) expandedGroupsRef.current.add(g.id);
      else expandedGroupsRef.current.delete(g.id);

      return {
        ...g,
        expanded: newExpanded,
        items: setAllExpanded(g.items, newExpanded)
      }
    }));
  }, [groups]);

  useEffect(() => {
    // 1. 활성 문서 필터링
    let activeDocs = documents.filter(d => !d.deleted_at);

    // Search Filtering
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      activeDocs = activeDocs.filter(d => d.title.toLowerCase().includes(query));
      // Note: If we want to show tree structure for search results, it's more complex.
      // Usually search flattens the list or expands path. 
      // For simplicity here, we might just filter. 
      // However, tree builder relies on parent_id. If parent is filtered out, child is orphaned.
      // So simple filter might hide children if parent doesn't match.
      // Better approach for tree search: Keep items if they OR their children match.
      // But let's stick to simple text match for now or just filter flat list if searching?
      // Let's keep it simple: Filter logic.
      // If parent is missing, `buildTree` puts them at root level because `find(parent)` fails? 
      // No, `buildTree` filters by `parent_id`.
      // If parent is not in `docs`, `!d.parent_id` check handles root.
      // But children of filtered-out parents won't appear if passed `parentId`.
    }

    // 즐겨찾기 모드일 경우 평면 리스트로 구성
    if (isFavoriteFilter) {
      const favs = activeDocs.filter(d => d.is_favorite);
      favs.sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));

      const flatItems: DocumentListItemType[] = favs.map(d => ({
        id: d.id,
        title: d.title,
        path: '',
        expanded: false,
      }));

      setGroups([{
        id: 'favorites',
        name: 'Favorites',
        type: 'project',
        expanded: true,
        items: flatItems
      }]);
      return;
    }

    const effectiveDocuments = activeDocs;
    const expandedIds = expandedIdsRef.current;

    // 재귀적 트리 빌더 + 정렬
    const buildTree = (docs: typeof documents, sortOpt: SortOption = SortOption.NameAsc, parentId?: string): DocumentListItemType[] => {
      const comparator = (a: any, b: any) => { // TODO: Fix any type
        switch (sortOpt) {
          case SortOption.NameAsc: return a.title.localeCompare(b.title);
          case SortOption.NameDesc: return b.title.localeCompare(a.title);
          case SortOption.DateNewest: return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '');
          case SortOption.DateOldest: return (a.updated_at || a.created_at || '').localeCompare(b.updated_at || b.created_at || '');
          default: return 0;
        }
      };

      return docs
        .filter(d => {
          if (parentId) return d.parent_id === parentId;
          return !d.parent_id;
        })
        .sort(comparator)
        .map(d => ({
          id: d.id,
          title: d.title,
          path: '',
          expanded: expandedIds.has(d.id),
          children: buildTree(docs, sortOpt, d.id)
        }));
    };

    const newGroups: DocumentListGroupType[] = [];
    // 1. 개인 그룹 (Private)
    const privateDocs = effectiveDocuments.filter(
      d => d.group_type === GroupType.Private && (!d.group_id || d.group_id === PRIVATE_GROUP_ID)
    );

    newGroups.push({
      id: PRIVATE_GROUP_UI_ID,
      name: 'Private',
      type: 'private',
      expanded: expandedGroupsRef.current.has(PRIVATE_GROUP_UI_ID),
      items: buildTree(privateDocs, groupSortOptions[PRIVATE_GROUP_UI_ID])
    });

    // 2. 부서 그룹 (Department)
    const deptDocs = effectiveDocuments.filter(d => d.group_type === GroupType.Department && d.group_id);
    const deptGroups: Record<string, typeof documents> = {};

    if (currentUser?.department) {
      deptGroups[currentUser.department.id] = [];
    }

    deptDocs.forEach(d => {
      if (!d.group_id) return;
      if (!deptGroups[d.group_id]) deptGroups[d.group_id] = [];
      deptGroups[d.group_id].push(d);
    });

    const myDeptId = currentUser?.department?.id;
    const sortedDeptIds = Object.keys(deptGroups).sort((a, b) => {
      if (a === myDeptId) return -1;
      if (b === myDeptId) return 1;
      return a.localeCompare(b);
    });

    sortedDeptIds.forEach((groupId) => {
      const items = deptGroups[groupId];
      let groupName = `Department ${groupId.substring(0, 8)}...`;
      if (groupId === myDeptId) {
        groupName = currentUser?.department?.name?.trim() || 'My Department';
      } else if (departments[groupId]) {
        groupName = departments[groupId].name;
      }

      newGroups.push({
        id: groupId,
        name: groupName,
        type: 'department',
        expanded: expandedGroupsRef.current.has(groupId),
        items: buildTree(items, groupSortOptions[groupId])
      });
    });

    // 3. 프로젝트 그룹 (Project)
    const projGroups: Record<string, typeof documents> = {};
    Object.keys(projects).forEach(pid => {
      projGroups[pid] = [];
    });

    const projDocs = effectiveDocuments.filter(d => d.group_type === GroupType.Project && d.group_id);
    projDocs.forEach(d => {
      if (!d.group_id) return;
      if (!projGroups[d.group_id]) projGroups[d.group_id] = [];
      projGroups[d.group_id].push(d);
    });

    const sortedProjIds = Object.keys(projGroups).sort((a, b) => {
      const nameA = projects[a]?.name || a;
      const nameB = projects[b]?.name || b;
      return nameA.localeCompare(nameB);
    });

    sortedProjIds.forEach(groupId => {
      const items = projGroups[groupId];
      newGroups.push({
        id: groupId,
        name: projects[groupId]?.name || `Project ${groupId.substring(0, 8)}...`,
        type: 'project',
        expanded: expandedGroupsRef.current.has(groupId),
        items: buildTree(items, groupSortOptions[groupId])
      });
    });

    setGroups(newGroups);
  }, [documents, currentUser, groupSortOptions, isFavoriteFilter, departments, projects]);

  // 활성 탭에 따른 자동 확장
  useEffect(() => {
    if (!activeTabId) return;

    const selectedDoc = documents.find(d => d.id === activeTabId);
    if (!selectedDoc) return;

    const parentIds: string[] = [];
    let currentParentId = selectedDoc.parent_id;
    let safety = 0;
    while (currentParentId && safety < 100) {
      parentIds.push(currentParentId);
      expandedIdsRef.current.add(currentParentId); // Ref 업데이트
      const parentDoc = documents.find(d => d.id === currentParentId);
      currentParentId = parentDoc?.parent_id;
      safety++;
    }

    // 그룹 찾아서 확장 Ref 업데이트
    const group = groups.find(g => {
      // 이 그룹에 문서가 있는지 확인하는 재귀 함수 필요하지만
      // 여기서는 생략하고 documents store 기반으로 그룹 ID 유추 가능
      const targetGroupType = selectedDoc.group_type;
      const targetGroupId = selectedDoc.group_id;

      if (g.type === 'department' && targetGroupType === GroupType.Department && g.id === targetGroupId) return true;
      if (g.type === 'project' && targetGroupType === GroupType.Project && g.id === targetGroupId) return true;
      if (g.type === 'department' && targetGroupType === GroupType.Private && g.id === 'private_group') return true;
      return false;
    });

    if (group) {
      expandedGroupsRef.current.add(group.id);
    }

    // 강제 리렌더링을 위해 groups 상태 업데이트 (필요 시)
    // 현재는 useEffect 의존성에 의해 다음 렌더링 사이클/fetchDocuments 시 반영됨.
    // 즉각 반영을 원하면 setGroups(...) 를 호출하여 expanded 상태만 업데이트 할 수 있음.
    setGroups(prev => prev.map(g => ({
      ...g,
      expanded: expandedGroupsRef.current.has(g.id),
      items: updateItemsExpansion(g.items, expandedIdsRef.current)
    })));

  }, [activeTabId]);



  // --- 토글 핸들러 ---

  // --- 토글 핸들러 ---

  const handleToggleExpandInfo = useCallback((groupId: string, itemId: string) => {
    if (expandedIdsRef.current.has(itemId)) {
      expandedIdsRef.current.delete(itemId);
    } else {
      expandedIdsRef.current.add(itemId);
    }

    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        items: updateItemsExpansion(g.items, expandedIdsRef.current)
      };
    }));
  }, []); // updateItemsExpansion is stable (declared outside or... wait it was helper inside)

  // updateItemsExpansion uses no external state, so it can be moved outside or memoized.
  // It is defined at line 444 as `const updateItemsExpansion = ...` inside component.
  // It should be memoized or moved out. Moving out is best.


  const handleToggleGroup = useCallback((groupId: string) => {
    if (expandedGroupsRef.current.has(groupId)) {
      expandedGroupsRef.current.delete(groupId);
    } else {
      expandedGroupsRef.current.add(groupId);
    }

    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, expanded: expandedGroupsRef.current.has(groupId) };
    }));
  }, []);


  // --- Drag and Drop 핸들러 ---

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    setOverId(null);
    setDropPosition(null);

    // 드래그 중인 아이템 데이터 찾기 (미리보기용)
    const findDragItem = (items: DocumentListItemType[]): DocumentListItemType | undefined => {
      for (const item of items) {
        if (item.id === active.id) return item;
        if (item.children) {
          const found = findDragItem(item.children);
          if (found) return found;
        }
      }
      return undefined;
    };

    // 모든 그룹에서 검색
    // We need 'groups' state here. So if groups change, this changes.
    // But 'groups' IS the main thing being rendered.
    // We can use functional update or refs if we want to avoid re-creating this callback,
    // but drag start is rare event. Re-creating this on groups change is fine.
    // However, for pure performance, maybe better to use ref for groups?
    // No, groups change leads to re-render anyway.

    // Actually, finding drag item can be done based on internal state logic or using a ref if we want perfect stability.
    // But let's just depend on groups for now.



    // Instead of using 'groups' from closure, we can just use the latest groups from state updater?
    // No, we need it here.
    // Optimization: Since we are inside 'DocumentList', and 'DocumentList' re-renders when groups change,
    // passing a new 'handleDragStart' to DndContext is fine.

    // Wait, DndContext is at top level of DocumentList.
    // But 'handleDragStart' is NOT passed to 'DocumentListItem'.
    // 'DocumentListItem' receives 'dragState'.
    // 'handleDragStart' is passed to 'DndContext'.
    // So this is fine.

    // The issue is 'handleItemMouseMove' which IS passed to Item.

    // For finding item:
    setGroups(currentGroups => {
      for (const group of currentGroups) {
        const found = findDragItem(group.items);
        if (found) {
          setDragItem(found);
          break;
        }
      }
      return currentGroups; // No change
    });

  }, []);



  // 마우스 이동으로 드랍 위치(Top/Bottom/Inside) 정밀 계산
  const handleItemMouseMove = useCallback((e: React.MouseEvent, item: DocumentListItemType) => {
    // This uses activeId from state.
    // If activeId changes, this recreates.
    // setActiveId causes re-render anyway.

    // We can use a Ref for activeId to avoid recreating this callback if we want perfect stability,
    // but activeId only changes on DragStart/End.
    // During drag, activeId is stable.

    // However, we need to access 'activeId'.
    // Check if we can use closure or if we need dependency.
    // If we depend on [activeId], it updates only when drag starts/ends.
    // This is good.

    // But wait, we need 'activeId' current value.
    if (!activeId || activeId === item.id) return; // This check needs activeId

    // To make it truly stable even across renders (if other things update),
    // we can check activeId inside setOverId functional update? No.
    // Pass activeId as ref?

    const rect = e.currentTarget.getBoundingClientRect();
    const clientY = e.clientY;
    const height = rect.height;
    const relativeY = clientY - rect.top;

    const threshold = height * 0.25; // 상/하 25% 영역

    let newPos: DocumentListDropPosition = 'inside';
    if (relativeY < threshold) newPos = 'top';
    else if (relativeY > height - threshold) newPos = 'bottom';

    setOverId(item.id);
    setDropPosition(newPos);
  }, [activeId]);

  const handleItemMouseLeave = useCallback(() => {
    setOverId(null);
    setDropPosition(null);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active } = event;

    // We need current overId and dropPosition.
    // These satisfy dependency chain.
    if (!overId || !dropPosition || active.id === overId) {
      setActiveId(null);
      setOverId(null);
      setDropPosition(null);
      setDragItem(null);
      return;
    }

    console.log(`Move ${active.id} to ${overId} at ${dropPosition}`);

    try {
      await moveDocument(active.id as string, overId, dropPosition);
    } catch (err) {
      console.error("Failed to move document", err);
    }

    setActiveId(null);
    setOverId(null);
    setDropPosition(null);
    setDragItem(null);
  }, [overId, dropPosition, moveDocument]);

  // --- 렌더링 ---

  return (
    <div className="flex flex-col h-full bg-zinc-950 select-none">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-2 shrink-0">
        <div className="flex items-center gap-1">
          <button
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:bg-zinc-800 rounded"
            onClick={() => setShowGroupLinkDialog(true)}
            title="Link Settings"
          >
            <Share2 size={18} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {/* <button
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${isFavoriteFilter ? 'text-zinc-500 hover:text-white hover:bg-zinc-800' : 'text-zinc-500 hover:text-yellow-400 hover:bg-zinc-800'}`}
            onClick={() => setIsFavoriteFilter(!isFavoriteFilter)}
            title={isFavoriteFilter ? "Show All Documents" : "Show Favorites Only"}
          >
            {isFavoriteFilter ? (
              <FileText size={18} />
            ) : (
              <Star size={18} />
            )}
          </button> */}

          <button
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:bg-zinc-800 rounded"
            onClick={toggleAllGroups}
            title="Expand/Collapse All"
          >
            <ChevronsUpDown size={18} />
          </button>
          <button
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:bg-zinc-800 rounded"
            onClick={() => setShowNewDocDialog(true)}
            title="New Document"
          >
            <FilePlus size={18} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-3 shrink-0">
        <div className="relative group">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-4 py-1.5 bg-zinc-900/50 border border-zinc-800 rounded-md text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 focus:bg-zinc-900 transition-colors"
          />
        </div>
      </div>

      {/* 문서 목록 트리 영역 */}
      <div className="flex-1 overflow-y-auto px-2 pb-10 custom-scrollbar">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        // onDragOver 는 Custom Mouse Event 로 대체하여 정밀 제어
        >
          <div className="flex flex-col gap-2">
            {groups.map(group => (
              <DocumentListGroup
                key={group.id}
                group={group}
                onToggle={handleToggleGroup}
                onSelectDocument={onSelectDocument}
                selectedDocumentId={activeTabId || undefined}
                onToggleExpandInfo={handleToggleExpandInfo}
                onAddSubPage={(gId, pId) => {
                  // Quick Create implementation
                  const gType = group.type === 'project' ? GroupType.Project :
                    (group.type === 'private' || (group.type === 'department' && group.id === 'private_group')) ? GroupType.Private : GroupType.Department;

                  // Private 그룹일 경우 groupId를 undefined로 설정하여 서버가 올바르게 처리하도록 함
                  const actualGroupId = gType === GroupType.Private ? undefined : gId;

                  createDocument("제목 없음", actualGroupId, gType, pId);
                }}
                dragState={{ activeId, overId, position: dropPosition }}
                onItemMouseMove={handleItemMouseMove}
                onItemMouseLeave={handleItemMouseLeave}
                sortBy={groupSortOptions[group.id] || SortOption.NameAsc}
                onSortChange={handleSortChange}
                onMenuClick={handleMenuClick}
                renamingId={renamingId}
                onRenameSubmit={handleRenameSubmit}
              />
            ))}
          </div>

          <DragOverlay>
            {dragItem ? (
              <div className="bg-zinc-800 p-2 rounded shadow-lg opacity-80 border border-zinc-600 w-48 truncate text-sm text-white">
                {dragItem.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* 컨텍스트 메뉴 */}
      {contextMenu && createPortal(
        <div
          className="fixed bg-zinc-800 border border-zinc-700 rounded-md shadow-xl py-1 z-50 min-w-[140px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleRename(contextMenu.id)}
            className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center gap-2"
          >
            <Edit2 size={12} />
            이름 변경
          </button>
          <div className="h-px bg-zinc-700 my-1" />
          <button
            onClick={() => handleDelete(contextMenu.id)}
            className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
          >
            <Trash2 size={12} />
            삭제
          </button>
        </div>,
        document.body
      )}

      {/* 다이얼로그들 */}
      <NewDocumentDialog
        isOpen={showNewDocDialog}
        onClose={() => setShowNewDocDialog(false)}
        onCreate={(data) => {
          let gType = GroupType.Project;
          if (data.groupType === 'department') gType = GroupType.Department;
          else if (data.groupType === 'private') gType = GroupType.Private;

          const tagArray = data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined;

          // Private 그룹은 ID가 없어야 함 (undefined)
          const finalGroupId = gType === GroupType.Private ? undefined : data.groupId;

          createDocument(data.title, finalGroupId, gType, data.folderId, undefined, data.content, tagArray, data.summary);
        }}
        onToggleGroup={handleToggleGroup}
        onToggleFolder={handleToggleExpandInfo}
        // Initialize group/folder selection for New Document Dialog
        // Note: NewDocumentDialog currently expects a recursive FolderItem structure.
        // We map our flat DocumentListItemType to the expected structure.
        groups={
          groups.map(g => {
            const mapToFolderItem = (item: DocumentListItemType): any => ({
              id: item.id,
              name: item.title,
              expanded: item.expanded || false,
              children: item.children ? item.children.map(mapToFolderItem) : []
            });

            return {
              id: g.id,
              name: g.name,
              type: g.type,
              expanded: g.expanded,
              folders: g.items.map(mapToFolderItem)
            };
          })
        }
      />

      {/* Group Link Dialog (Hidden usually) */}
      <GroupLinkDialog
        isOpen={showGroupLinkDialog}
        onClose={() => setShowGroupLinkDialog(false)}
      />

      {/* Group Info Dialog - Unused for now
      <GroupInfoDialog
        isOpen={showGroupInfoDialog}
        onClose={() => setShowGroupInfoDialog(false)}
        {...(() => {
            const group = groups.find(g => g.id === selectedGroupIdForInfo);
            return group ? { groupName: group.name, groupType: group.type } : {};
        })()}
      />
      */}
    </div>
  );
});

DocumentList.displayName = 'DocumentList';
