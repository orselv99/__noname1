import { useState, useRef, useEffect, useCallback, memo, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { Tag, Calendar, User, FileText, ChevronUp, ChevronDown, Link as LinkIcon, ExternalLink, Eye, EyeOff, Globe, Edit3, Send, ChevronDown as ChevronDownIcon, Image, Video, Music, Paperclip, ChevronsUpDown, AlignLeft, History, Activity } from 'lucide-react';
import { useMemo } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { DocumentState, VisibilityLevel, GroupType, Document } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useConfirm } from '../ConfirmProvider';


// VISIBILITY_LEVELS constant needs to be available at module level for memo components
const VISIBILITY_LEVELS = [
  { value: VisibilityLevel.Hidden, label: 'Hidden', icon: EyeOff, color: 'bg-gray-700 text-gray-300', hoverColor: 'hover:bg-gray-600' },
  { value: VisibilityLevel.Metadata, label: 'Metadata', icon: FileText, color: 'bg-blue-900/50 text-blue-300', hoverColor: 'hover:bg-blue-800/50' },
  { value: VisibilityLevel.Snippet, label: 'Snippet', icon: Eye, color: 'bg-amber-900/50 text-amber-300', hoverColor: 'hover:bg-amber-800/50' },
  { value: VisibilityLevel.Public, label: 'Public', icon: Globe, color: 'bg-green-900/50 text-green-300', hoverColor: 'hover:bg-green-800/50' },
];

const LinkList = memo(({ content, liveContent, forceExpanded }: { content: string; liveContent?: string | null; forceExpanded?: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // 외부에서 강제로 펼침 상태를 변경할 때 동기화
  useEffect(() => {
    if (forceExpanded !== undefined) {
      setIsExpanded(forceExpanded);
    }
  }, [forceExpanded]);

  // liveContent가 있으면 그것을 사용, 없으면 저장된 content 사용
  const effectiveContent = liveContent ?? content;

  const links = useMemo(() => {
    if (!effectiveContent) return [];
    try {
      const doc = new DOMParser().parseFromString(effectiveContent, 'text/html');
      const anchors = Array.from(doc.getElementsByTagName('a'));
      return anchors.map(a => ({
        text: a.textContent || a.href,
        href: a.getAttribute('href') || ''
      })).filter(l => l.href);
    } catch (e) {
      return [];
    }
  }, [effectiveContent]);

  if (links.length === 0) return null;

  return (
    <div className="mb-6">
      <div
        className="flex items-center gap-2 mb-2 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <LinkIcon size={12} />
        <h3 className="text-xs font-medium flex-1">Linked Mentions ({links.length})</h3>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>

      {isExpanded && (
        <div className="space-y-1 pl-1">
          {/* TODO: 현재는 content 의 href 만 보여주는데, 여기를 grouping (RAG, href) 하던지 새 컴포넌트로 만들던지 하자 */}
          {links.map((link, i) => (
            <a
              key={i}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col gap-0.5 text-xs bg-zinc-900/50 p-2 rounded border border-zinc-800 text-blue-400 hover:bg-zinc-900 transition-colors group"
            >
              <span className="font-medium truncate flex items-center gap-1">
                {link.text}
                <ExternalLink size={10} className="opacity-50" />
              </span>
              <span className="text-[10px] text-zinc-600 truncate">{link.href}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
});

// Resource List Component (이미지, 영상, 음성)
interface ResourceItem {
  type: 'image' | 'video' | 'audio';
  src: string;
  alt?: string;
  size?: number; // Size in bytes
}

// Format bytes to human readable string
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Calculate size from data URL or external URL hint
const getDataUrlSize = (src: string): number => {
  if (src.startsWith('data:')) {
    // base64 data URL: size = base64 length * 3/4
    const base64Part = src.split(',')[1];
    if (base64Part) {
      return Math.floor(base64Part.length * 0.75);
    }
  }
  return 0; // External URL - size unknown without fetch
};

// 리소스 미리보기 다이얼로그
const ResourcePreviewDialog = ({
  resource,
  onClose
}: {
  resource: ResourceItem;
  onClose: () => void;
}) => {
  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl max-w-[600px] max-h-[500px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-zinc-700">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            {resource.type === 'image' && <Image size={16} className="text-emerald-400" />}
            {resource.type === 'video' && <Video size={16} className="text-purple-400" />}
            {resource.type === 'audio' && <Music size={16} className="text-amber-400" />}
            <span className="truncate max-w-[400px]">{resource.alt || resource.src.split('/').pop()}</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors text-xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex items-center justify-center min-h-[200px]">
          {resource.type === 'image' && (
            <img
              src={resource.src}
              alt={resource.alt || ''}
              className="max-w-full max-h-[400px] object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" fill="%23333"><rect width="200" height="150"/><text x="50%" y="50%" fill="%23666" text-anchor="middle" dy=".3em">Image not found</text></svg>';
              }}
            />
          )}
          {resource.type === 'video' && (
            <div className="text-center text-zinc-500">
              <Video size={48} className="mx-auto mb-3 text-purple-400" />
              <p className="text-sm">Video Preview</p>
              <p className="text-xs text-zinc-600 mt-1 break-all max-w-md">{resource.src}</p>
              <p className="text-xs text-zinc-700 mt-2 italic">(Video player coming soon)</p>
            </div>
          )}
          {resource.type === 'audio' && (
            <div className="text-center text-zinc-500">
              <Music size={48} className="mx-auto mb-3 text-amber-400" />
              <p className="text-sm">Audio Preview</p>
              <p className="text-xs text-zinc-600 mt-1 break-all max-w-md">{resource.src}</p>
              <p className="text-xs text-zinc-700 mt-2 italic">(Audio player coming soon)</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// MOCK_RESOURCES 제거됨 - 실제 콘텐츠만 표시

const ResourceList = memo(({ content, liveContent, forceExpanded }: { content: string; liveContent?: string | null; forceExpanded?: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedResource, setSelectedResource] = useState<ResourceItem | null>(null);

  // 외부에서 강제로 펼침 상태를 변경할 때 동기화
  useEffect(() => {
    if (forceExpanded !== undefined) {
      setIsExpanded(forceExpanded);
    }
  }, [forceExpanded]);

  const effectiveContent = liveContent ?? content;

  const resources = useMemo(() => {
    const items: ResourceItem[] = [];

    if (effectiveContent) {
      try {
        const doc = new DOMParser().parseFromString(effectiveContent, 'text/html');

        // 이미지 추출
        const images = Array.from(doc.getElementsByTagName('img'));
        images.forEach(img => {
          const src = img.getAttribute('src');
          if (src) {
            const size = getDataUrlSize(src);
            items.push({ type: 'image', src, alt: img.getAttribute('alt') || undefined, size: size || undefined });
          }
        });

        // 비디오 추출
        const videos = Array.from(doc.getElementsByTagName('video'));
        videos.forEach(video => {
          const src = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src');
          if (src) {
            const size = getDataUrlSize(src);
            items.push({ type: 'video', src, size: size || undefined });
          }
        });

        // 오디오 추출
        const audios = Array.from(doc.getElementsByTagName('audio'));
        audios.forEach(audio => {
          const src = audio.getAttribute('src') || audio.querySelector('source')?.getAttribute('src');
          if (src) {
            const size = getDataUrlSize(src);
            items.push({ type: 'audio', src, size: size || undefined });
          }
        });
      } catch (e) {
        // ignore
      }
    }

    return items;
  }, [effectiveContent]);

  if (resources.length === 0) return null;

  const getIcon = (type: ResourceItem['type']) => {
    switch (type) {
      case 'image': return <Image size={12} />;
      case 'video': return <Video size={12} />;
      case 'audio': return <Music size={12} />;
    }
  };

  const getTypeLabel = (type: ResourceItem['type']) => {
    switch (type) {
      case 'image': return 'Image';
      case 'video': return 'Video';
      case 'audio': return 'Audio';
    }
  };

  const getFileName = (src: string) => {
    try {
      const url = new URL(src, 'http://dummy.com');
      return url.pathname.split('/').pop() || src;
    } catch {
      return src.split('/').pop() || src;
    }
  };

  return (
    <div className="mb-6">
      <div
        className="flex items-center gap-2 mb-2 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Paperclip size={12} />
        <h3 className="text-xs font-medium flex-1">Attached Resources ({resources.length})</h3>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>

      {isExpanded && (
        <div className="space-y-1 pl-1">
          {resources.map((resource, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs bg-zinc-900/50 p-2 rounded border border-zinc-800 text-zinc-400 hover:bg-zinc-900 transition-colors cursor-pointer"
              onClick={() => setSelectedResource(resource)}
            >
              <span className={`shrink-0 ${resource.type === 'image' ? 'text-emerald-400' : resource.type === 'video' ? 'text-purple-400' : 'text-amber-400'}`}>
                {getIcon(resource.type)}
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{resource.alt || getFileName(resource.src)}</span>
                <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                  <span>{getTypeLabel(resource.type)}</span>
                  {resource.size && <span>· {formatBytes(resource.size)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      {selectedResource && (
        <ResourcePreviewDialog
          resource={selectedResource}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </div>
  );
});

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// Document State Dropdown
const DOCUMENT_STATES = [
  { value: DocumentState.Draft, label: 'Draft', icon: Edit3, color: 'bg-gray-700 text-gray-300', hoverColor: 'hover:bg-gray-600' },
  { value: DocumentState.Feedback, label: 'Feedback', icon: Send, color: 'bg-amber-900/50 text-amber-300', hoverColor: 'hover:bg-amber-800/50' },
  { value: DocumentState.Published, label: 'Published', icon: Globe, color: 'bg-green-900/50 text-green-300', hoverColor: 'hover:bg-green-800/50' },
];

const DocumentStateDropdown = memo(({ currentState, onStateChange }: { currentState: DocumentState; onStateChange: (state: DocumentState) => void }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showDropdown && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    setShowDropdown(!showDropdown);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        contentRef.current && !contentRef.current.contains(target)
      ) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const currentConfig = DOCUMENT_STATES.find(s => s.value === currentState) || DOCUMENT_STATES[0];
  const Icon = currentConfig.icon;

  return (
    <div className="relative flex-1">
      <button
        ref={triggerRef}
        onClick={toggleDropdown}
        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-all ${currentConfig.color} ${currentConfig.hoverColor} cursor-pointer`}
      >
        <span className="flex items-center gap-1.5">
          <Icon size={12} />
          {currentConfig.label}
        </span>
        <ChevronDownIcon size={12} className="opacity-50" />
      </button>
      {showDropdown && createPortal(
        <div
          ref={contentRef}
          style={{ position: 'fixed', top: dropdownPosition.top, left: dropdownPosition.left, width: '120px', zIndex: 99999 }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden"
        >
          {DOCUMENT_STATES.map((state) => {
            const StateIcon = state.icon;
            const isSelected = currentState === state.value;
            return (
              <button
                key={state.value}
                onClick={(e) => { e.stopPropagation(); onStateChange(state.value); setShowDropdown(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${isSelected ? state.color : 'text-gray-300 hover:bg-zinc-700'}`}
              >
                <StateIcon size={14} />
                {state.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
});

// Visibility Level Dropdown - using the constant defined at module level

const VisibilityDropdown = memo(({ currentLevel, onLevelChange }: { currentLevel: VisibilityLevel; onLevelChange: (level: VisibilityLevel) => void }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showDropdown && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    setShowDropdown(!showDropdown);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        contentRef.current && !contentRef.current.contains(target)
      ) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const currentConfig = VISIBILITY_LEVELS.find(v => v.value === currentLevel) || VISIBILITY_LEVELS[0];
  const Icon = currentConfig.icon;

  return (
    <div className="relative flex-1">
      <button
        ref={triggerRef}
        onClick={toggleDropdown}
        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-all ${currentConfig.color} ${currentConfig.hoverColor} cursor-pointer`}
      >
        <span className="flex items-center gap-1.5">
          <Icon size={12} />
          {currentConfig.label}
        </span>
        <ChevronDownIcon size={12} className="opacity-50" />
      </button>
      {showDropdown && createPortal(
        <div
          ref={contentRef}
          style={{ position: 'fixed', top: dropdownPosition.top, left: dropdownPosition.left, width: '120px', zIndex: 99999 }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden"
        >
          {VISIBILITY_LEVELS.map((level) => {
            const LevelIcon = level.icon;
            const isSelected = currentLevel === level.value;
            return (
              <button
                key={level.value}
                onClick={(e) => { e.stopPropagation(); onLevelChange(level.value); setShowDropdown(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${isSelected ? level.color : 'text-gray-300 hover:bg-zinc-700'}`}
              >
                <LevelIcon size={14} />
                {level.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
});

export const MetadataPanel = () => {
  // Optimized selector: only re-render when activeDoc changes, not entire documents array
  const activeDocImmediate = useDocumentStore(
    useCallback((state) => state.documents.find((d: Document) => d.id === state.activeTabId), [])
  );
  // Use deferred value to allow tab switch to complete first before updating metadata
  const activeDoc = useDeferredValue(activeDocImmediate);

  const liveEditorContent = useDocumentStore(state => state.liveEditorContent);
  const saveDocument = useDocumentStore(state => state.saveDocument);
  const { confirm } = useConfirm();

  // Calculate total media size from content
  const { binary: totalMediaSize, encoded: totalEncodedMediaSize } = useMemo(() => {
    let binary = 0;
    let encoded = 0;
    const content = liveEditorContent ?? activeDocImmediate?.content;
    if (!content) return { binary: 0, encoded: 0 };

    try {
      const doc = new DOMParser().parseFromString(content, 'text/html');

      // Helper to process elements
      const processElement = (el: Element) => {
        // Try src attribute first
        let src = el.getAttribute('src');

        // For video/audio, check source children if src is missing
        if (!src && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')) {
          src = el.querySelector('source')?.getAttribute('src');
        }

        if (src?.startsWith('data:')) {
          const parts = src.split(',');
          const base64Part = parts[1];
          // Add metadata part length (e.g. "data:image/png;base64,") to encoded size as well
          const metaPart = parts[0] + ',';

          if (base64Part) {
            binary += Math.floor(base64Part.length * 0.75);
            encoded += (base64Part.length + metaPart.length);
          }
        }
      };

      Array.from(doc.getElementsByTagName('img')).forEach(processElement);
      Array.from(doc.getElementsByTagName('video')).forEach(processElement);
      Array.from(doc.getElementsByTagName('audio')).forEach(processElement);

    } catch (e) {
      // ignore
    }
    return { binary, encoded };
  }, [liveEditorContent, activeDocImmediate?.content]);

  // 섹션 펼침 상태 (Hooks는 조건부 return 전에 호출해야 함)
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [isTagsExpanded, setIsTagsExpanded] = useState(true);
  const [isLinksExpanded, setIsLinksExpanded] = useState(true);
  const [isResourcesExpanded, setIsResourcesExpanded] = useState(true);
  const [isMentionsExpanded, setIsMentionsExpanded] = useState(true);

  // Revision 펼침 상태 (상단 모두펼치기에 영향 안받음)
  const [isRevisionExpanded, setIsRevisionExpanded] = useState(false);

  // 모두 펼치기/접기
  const toggleAllSections = () => {
    const anyCollapsed = !isSummaryExpanded || !isTagsExpanded || !isLinksExpanded || !isResourcesExpanded || !isMentionsExpanded;
    setIsSummaryExpanded(anyCollapsed);
    setIsTagsExpanded(anyCollapsed);
    setIsLinksExpanded(anyCollapsed);
    setIsResourcesExpanded(anyCollapsed);
    setIsMentionsExpanded(anyCollapsed);
  };

  if (!activeDoc) {
    return (
      <div className="w-full h-full bg-zinc-950 flex flex-col items-center justify-center text-zinc-500 text-xs">
        Select a document
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-zinc-950 flex flex-col text-white relative">
      {/* Header */}
      <div className="h-12 p-3 border-b border-zinc-800 font-medium text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-2">
        <FileText size={14} />
        <span className="flex-1">Metadata</span>
        <button
          className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white transition-colors"
          onClick={toggleAllSections}
          title="Expand/Collapse All"
        >
          <ChevronsUpDown size={14} />
        </button>
      </div>

      {/* Content - 평소에는 스크롤바 숨김, hover 시 표시 */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6 custom-scrollbar hover:overflow-y-scroll"
        style={{ scrollbarGutter: 'stable' }}
      >

        {/* Status & Visibility Section - TOP (한 줄) */}
        <div className="flex gap-2">
          <div className="flex-1">
            <h3 className="text-xs text-zinc-500 font-medium mb-1 flex items-center gap-1">
              <Activity size={12} />
              Status
            </h3>
            <DocumentStateDropdown
              currentState={activeDoc.document_state}
              onStateChange={async (state) => {
                // If changing TO Published
                if (state === DocumentState.Published && activeDoc.document_state !== DocumentState.Published) {
                  const nextVersion = (activeDoc.version || 0) + 1;
                  if (await confirm({
                    title: '문서 게시',
                    message: `이 문서를 게시하시겠습니까?\n\n버전이 v${nextVersion}로 올라갑니다.`,
                    confirmText: '게시',
                    variant: 'primary'
                  })) {
                    saveDocument({ ...activeDoc, document_state: state, version: nextVersion });
                  }
                } else if (activeDoc.document_state === DocumentState.Published && state !== DocumentState.Published) {
                  // User manually reverting to Draft/Feedback
                  saveDocument({ ...activeDoc, document_state: state });
                } else {
                  saveDocument({ ...activeDoc, document_state: state });
                }
              }}
            />
          </div>
          <div className="flex-1">
            <h3 className="text-xs text-zinc-500 font-medium mb-1 flex items-center gap-1">
              <Eye size={12} />
              Visibility
            </h3>
            <VisibilityDropdown
              currentLevel={activeDoc.visibility_level}
              onLevelChange={async (level) => {
                // Check against group default visibility
                let defaultVisibility = VisibilityLevel.Hidden;
                const { departments, projects, user } = useAuthStore.getState();

                if (activeDoc.group_type === GroupType.Department) {
                  if (activeDoc.group_id && departments[activeDoc.group_id]) {
                    defaultVisibility = departments[activeDoc.group_id].visibility;
                  } else if (user?.department && user.department.id === activeDoc.group_id) {
                    defaultVisibility = user.department.default_visibility_level;
                  } else {
                    // Fallback or possibly 'My Department' logic if group_id is missing but implicit?
                    // Assuming data is consistent. If not found, default to Hidden is safe or keeping current might be better,
                    // but let's stick to strict check or maybe 2 (Metadata) as reasonable default?
                    // Actually, if we can't find group, maybe we shouldn't warn?
                    // Let's assume Hidden as base.
                  }
                } else if (activeDoc.group_type === GroupType.Project) {
                  if (activeDoc.group_id && projects[activeDoc.group_id]) {
                    defaultVisibility = projects[activeDoc.group_id].visibility;
                  }
                }

                // If switching TO a non-default visibility, warn.
                // Or simply if New Level != Default Level?
                // User request: "If changing to a visibility DIFFERENT from group default"
                // User request: "If changing to a visibility DIFFERENT from group default"
                if (level !== defaultVisibility) {
                  if (await confirm({
                    title: '가시성 변경 확인',
                    message: `선택한 가시성(${VISIBILITY_LEVELS.find(v => v.value === level)?.label})이 그룹 기본값(${VISIBILITY_LEVELS.find(v => v.value === defaultVisibility)?.label})과 다릅니다.\n\n정말 변경하시겠습니까?`,
                    confirmText: '변경',
                    variant: 'primary'
                  })) {
                    saveDocument({ ...activeDoc, visibility_level: level });
                  }
                } else {
                  saveDocument({ ...activeDoc, visibility_level: level });
                }
              }}
            />
          </div>
        </div>

        {/* Summary Section */}
        <div className="mb-6">
          <div
            className="flex items-center gap-2 mb-2 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none"
            onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
          >
            <AlignLeft size={12} />
            <h3 className="text-xs font-medium flex-1">Summary</h3>
            {isSummaryExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </div>
          {isSummaryExpanded && (
            <p className="text-xs text-zinc-400 leading-relaxed wrap-break-word">
              {activeDoc.summary || <span className="text-zinc-600 italic">No summary</span>}
            </p>
          )}
        </div>

        {/* Tags Section */}
        <div className="mb-6">
          <div
            className="flex items-center gap-2 mb-2 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none"
            onClick={() => setIsTagsExpanded(!isTagsExpanded)}
          >
            <Tag size={12} />
            <h3 className="text-xs font-medium flex-1">Tags ({activeDoc.tags?.length || 0})</h3>
            {isTagsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </div>
          {isTagsExpanded && (
            <>
              <div className="relative flex flex-wrap gap-2 mb-3">
                {(!activeDoc.tags || activeDoc.tags.length === 0) && (
                  <span className="text-xs text-zinc-600 italic block">No tags</span>
                )}
                {activeDoc.tags && activeDoc.tags.map((t, i) => (
                  <div key={i} className="group">

                    <span
                      onMouseEnter={() => {
                        // Hover only shows tooltip, maybe partial highlight?
                        // For now keep existing behavior but consider separate "preview" vs "navigate"
                        // useDocumentStore.getState().setHighlightedEvidence(t.evidence || null)
                      }}
                      onMouseLeave={() => {
                        // useDocumentStore.getState().setHighlightedEvidence(null)
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const current = useDocumentStore.getState().highlightedEvidence;
                        // Search for tag name itself instead of evidence (which may be incorrect)
                        const searchText = t.tag;
                        useDocumentStore.getState().setHighlightedEvidence(current === searchText ? null : searchText);
                      }}
                      className={`peer cursor-pointer px-2 py-1 border rounded text-xs transition-colors inline-flex items-center gap-1 max-w-full ${useDocumentStore.getState().highlightedEvidence === t.tag
                        ? 'bg-blue-900/40 border-blue-500 text-blue-300'
                        : 'bg-zinc-900 border-zinc-700 text-blue-400 hover:border-blue-500 hover:bg-zinc-800'
                        }`}
                    >
                      <span className="truncate">#{t.tag}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          useDocumentStore.getState().removeTagFromDocument(activeDoc.id, i);
                        }}
                        className="ml-1 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                        title="Remove tag"
                      >
                        ×
                      </button>
                    </span>

                    {/* Tooltip positioned below the tag */}
                    {t.evidence && (
                      <div className="hidden peer-hover:block absolute top-full left-0 mt-2 z-[9999] w-64 bg-zinc-950/95 backdrop-blur border border-zinc-700 rounded-lg shadow-xl p-3 animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
                        <div className="font-bold mb-1 text-zinc-400 text-[10px] uppercase tracking-wider">Evidence</div>
                        <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
                          {t.evidence}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Tag Form (일단 사용자 추가는 받지 않음) */}
              {/* <AddTagForm docId={activeDoc.id} /> */}
            </>
          )}
        </div>

        {/* 고민중: Footnotes */}
        {/* <LinkList content={activeDoc.content} liveContent={liveEditorContent} forceExpanded={isLinksExpanded} /> */}

        {/* Linked Mentions */}
        <LinkList content={activeDoc.content} liveContent={liveEditorContent} forceExpanded={isLinksExpanded} />

        {/* Attached Resources */}
        <ResourceList content={activeDoc.content} liveContent={liveEditorContent} forceExpanded={isResourcesExpanded} />
      </div>

      {/* Revision Section - 독립적인 접기/펼치기 */}
      <div className="border-t border-zinc-800 shrink-0 bg-zinc-950">
        <div
          className="flex items-center gap-2 px-4 py-3 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none"
          onClick={() => setIsRevisionExpanded(!isRevisionExpanded)}
        >
          <History size={12} />
          <h3 className="text-xs font-medium flex-1">Revisions</h3>
          {isRevisionExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${isRevisionExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
            }`}
        >
          <div className="px-4 pb-3 overflow-y-auto custom-scrollbar max-h-48">
            {/* Git Graph Style Revisions */}
            <div className="relative pl-5">
              {/* Vertical Line */}
              <div className="absolute left-[7px] top-3 bottom-3 w-px bg-zinc-700" />

              {/* Revision Items */}
              <div className="space-y-2">
                {/* Current - 파란색 큰 점 */}
                <div className="relative flex items-start gap-3 cursor-pointer hover:bg-zinc-900/50 -ml-5 pl-5 pr-2 py-1.5 rounded">
                  <div className="absolute left-[3px] top-2.5 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-zinc-950" />
                  <div className="flex-1 min-w-0 ml-1">
                    <div className="text-xs text-zinc-200 truncate">v5. <span className="text-zinc-400">Real Real Final review</span> <span className="text-zinc-500">· orseL</span></div>
                    <div className="text-[10px] text-zinc-600">2025-01-11 15:17</div>
                  </div>
                </div>

                {/* v4 - 회색 작은 점 */}
                <div className="relative flex items-start gap-3 cursor-pointer hover:bg-zinc-900/50 -ml-5 pl-5 pr-2 py-1 rounded opacity-70 hover:opacity-100 transition-opacity">
                  <div className="absolute left-[5px] top-2.5 w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  <div className="flex-1 min-w-0 ml-1">
                    <div className="text-xs text-zinc-500 truncate">v4. <span className="text-zinc-600">Real Final review</span> <span className="text-zinc-600">· Someone</span></div>
                    <div className="text-[10px] text-zinc-700">2025-01-10 12:45</div>
                  </div>
                </div>

                {/* v3 - 회색 작은 점 */}
                <div className="relative flex items-start gap-3 cursor-pointer hover:bg-zinc-900/50 -ml-5 pl-5 pr-2 py-1 rounded opacity-70 hover:opacity-100 transition-opacity">
                  <div className="absolute left-[5px] top-2.5 w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  <div className="flex-1 min-w-0 ml-1">
                    <div className="text-xs text-zinc-500 truncate">v3. <span className="text-zinc-600">Final review</span> <span className="text-zinc-600">· IDK</span></div>
                    <div className="text-[10px] text-zinc-700">2025-01-09 10:30</div>
                  </div>
                </div>

                {/* v2 - 회색 작은 점 */}
                <div className="relative flex items-start gap-3 cursor-pointer hover:bg-zinc-900/50 -ml-5 pl-5 pr-2 py-1 rounded opacity-70 hover:opacity-100 transition-opacity">
                  <div className="absolute left-[5px] top-2.5 w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  <div className="flex-1 min-w-0 ml-1">
                    <div className="text-xs text-zinc-500 truncate">v2. <span className="text-zinc-600">Added summary section</span> <span className="text-zinc-600">· Jane</span></div>
                    <div className="text-[10px] text-zinc-700">2025-01-08 15:22</div>
                  </div>
                </div>

                {/* v1 - 회색 작은 점 */}
                <div className="relative flex items-start gap-3 cursor-pointer hover:bg-zinc-900/50 -ml-5 pl-5 pr-2 py-1 rounded opacity-70 hover:opacity-100 transition-opacity">
                  <div className="absolute left-[5px] top-2.5 w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  <div className="flex-1 min-w-0 ml-1">
                    <div className="text-xs text-zinc-500 truncate">v1. <span className="text-zinc-600">Initial draft</span> <span className="text-zinc-600">· John</span></div>
                    <div className="text-[10px] text-zinc-700">2025-01-07 09:15</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info - Pinned to Bottom */}
      <div className="p-4 border-t border-zinc-800 space-y-2 text-xs text-zinc-500 shrink-0 bg-zinc-950">
        <div className="flex justify-between">
          <span className="flex items-center gap-1"><User size={12} /> Creator</span>
          <span>{activeDoc.creator_name || (activeDoc.user_id === 'user1' ? 'User' : 'Unknown')}</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1"><Calendar size={12} /> Created</span>
          <span>{formatDate(activeDoc.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1"><Calendar size={12} /> Updated</span>
          <span>{formatDate(activeDoc.updated_at)}</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1"><FileText size={12} /> Size</span>
          <span>
            {(() => {
              const totalSize = parseInt(activeDoc.size || '0', 10);
              const textSize = Math.max(0, totalSize - totalEncodedMediaSize);

              if (totalMediaSize > 0) {
                return `${formatBytes(totalSize)} (${formatBytes(textSize)} text + ${formatBytes(totalMediaSize)} media)`;
              }
              return formatBytes(totalSize);
            })()}
          </span>
        </div>
      </div>

    </div >
  );
};
