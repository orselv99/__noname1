/**
 * ==========================================================================
 * MetadataResourceList.tsx - 첨부 리소스 목록 컴포넌트
 * ==========================================================================
 * 
 * 문서 콘텐츠에서 미디어 리소스(이미지, 비디오, 오디오)를 추출하여 표시합니다.
 * 리소스 클릭 시 미리보기 다이얼로그가 열립니다.
 * ==========================================================================
 */

import { useState, useEffect, useMemo, memo } from 'react';
import { Paperclip, Image, Video, Music, ChevronUp, ChevronDown } from 'lucide-react';
import { MetadataResourcePreviewDialog, MetadataResourceItem } from './MetadataResourcePreviewDialog';
import { formatBytes, getDataUrlSize } from '../../utils/formatters';

/**
 * MetadataResourceList Props
 */
interface MetadataResourceListProps {
  /** 저장된 문서 콘텐츠 (HTML) */
  content: string;
  /** 실시간 편집 중인 콘텐츠 (있으면 우선 사용) */
  liveContent?: string | null;
  /** 외부에서 강제로 펼침 상태 제어 */
  forceExpanded?: boolean;
}

/**
 * 첨부 리소스 목록 컴포넌트
 * 
 * - 문서 콘텐츠에서 img, video, audio 태그 추출
 * - 접을 수 있는 섹션으로 표시
 * - 클릭 시 미리보기 다이얼로그 표시
 */
export const MetadataResourceList = memo(({
  content,
  liveContent,
  forceExpanded }: MetadataResourceListProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedResource, setSelectedResource] = useState<MetadataResourceItem | null>(null);

  // 외부에서 강제로 펼침 상태를 변경할 때 동기화
  useEffect(() => {
    if (forceExpanded !== undefined) {
      setIsExpanded(forceExpanded);
    }
  }, [forceExpanded]);

  // 실시간 콘텐츠가 있으면 그것을 사용, 없으면 저장된 콘텐츠 사용
  const effectiveContent = liveContent ?? content;

  // HTML에서 리소스 파싱
  const resources = useMemo((): MetadataResourceItem[] => {
    const items: MetadataResourceItem[] = [];

    if (effectiveContent) {
      try {
        const doc = new DOMParser().parseFromString(effectiveContent, 'text/html');

        // 이미지 추출
        const images = Array.from(doc.getElementsByTagName('img'));
        images.forEach(img => {
          const src = img.getAttribute('src');
          if (src) {
            const size = getDataUrlSize(src);
            items.push({
              type: 'image',
              src,
              alt: img.getAttribute('alt') || undefined,
              size: size || undefined
            });
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
        Array.from(doc.getElementsByTagName('audio')).forEach(audio => {
          let src = audio.getAttribute('src');
          if (!src) {
            const source = audio.querySelector('source');
            if (source) src = source.getAttribute('src');
          }

          if (src) {
            const size = getDataUrlSize(src);
            items.push({ type: 'audio', src, size: size || undefined });
          }
        });
      } catch (e) {
        // 파싱 오류 무시
      }
    }

    return items;
  }, [effectiveContent]);

  // 리소스가 없으면 렌더링하지 않음
  if (resources.length === 0) return null;

  /**
   * 리소스 유형별 아이콘 반환
   */
  const getIcon = (type: MetadataResourceItem['type']) => {
    switch (type) {
      case 'image': return <Image size={12} />;
      case 'video': return <Video size={12} />;
      case 'audio': return <Music size={12} />;
    }
  };

  /**
   * 리소스 유형별 라벨 반환
   */
  const getTypeLabel = (type: MetadataResourceItem['type']) => {
    switch (type) {
      case 'image': return 'Image';
      case 'video': return 'Video';
      case 'audio': return 'Audio';
    }
  };

  /**
   * URL에서 파일명 추출
   */
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
      {/* 섹션 헤더 */}
      <div
        className="flex items-center gap-2 mb-2 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Paperclip size={12} />
        <h3 className="text-xs font-medium flex-1">Attached Resources ({resources.length})</h3>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>

      {/* 리소스 목록 */}
      {isExpanded && (
        <div className="space-y-1 pl-1">
          {resources.map((resource, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs bg-zinc-900/50 p-2 rounded border border-zinc-800 text-zinc-400 hover:bg-zinc-900 transition-colors cursor-pointer"
              onClick={() => setSelectedResource(resource)}
            >
              {/* 리소스 유형 아이콘 */}
              <span className={`shrink-0 ${resource.type === 'image' ? 'text-emerald-400' :
                resource.type === 'video' ? 'text-purple-400' :
                  'text-amber-400'
                }`}>
                {getIcon(resource.type)}
              </span>

              {/* 리소스 정보 */}
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">
                  {resource.alt || getFileName(resource.src)}
                </span>
                <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                  <span>{getTypeLabel(resource.type)}</span>
                  {resource.size && <span>· {formatBytes(resource.size)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 미리보기 다이얼로그 */}
      {selectedResource && (
        <MetadataResourcePreviewDialog
          resource={selectedResource}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </div>
  );
});

MetadataResourceList.displayName = 'MetadataResourceList';
