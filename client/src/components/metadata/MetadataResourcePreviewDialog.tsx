/**
 * ==========================================================================
 * MetadataResourcePreviewDialog.tsx - 리소스 미리보기 다이얼로그
 * ==========================================================================
 * 
 * 이미지, 비디오, 오디오 리소스를 미리보기 할 수 있는 모달 다이얼로그입니다.
 * ResourceList에서 리소스 클릭 시 표시됩니다.
 * ==========================================================================
 */

import { createPortal } from 'react-dom';
import { Image, Video, Music } from 'lucide-react';

/**
 * 리소스 아이템 인터페이스
 */
export interface MetadataResourceItem {
  /** 리소스 유형 */
  type: 'image' | 'video' | 'audio';
  /** 소스 URL (data URL 또는 외부 URL) */
  src: string;
  /** 대체 텍스트 (이미지용) */
  alt?: string;
  /** 크기 (바이트) */
  size?: number;
}

/**
 * MetadataResourcePreviewDialog Props
 */
interface MetadataResourcePreviewDialogProps {
  /** 미리보기할 리소스 */
  resource: MetadataResourceItem;
  /** 닫기 핸들러 */
  onClose: () => void;
}

/**
 * 리소스 미리보기 다이얼로그 컴포넌트
 * 
 * - body에 포털로 렌더링
 * - 배경 클릭 시 닫힘
 * - 이미지: 실제 이미지 표시
 * - 비디오/오디오: 플레이스홀더 표시 (향후 플레이어 추가 예정)
 */
export const MetadataResourcePreviewDialog = ({
  resource,
  onClose
}: MetadataResourcePreviewDialogProps) => {
  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl max-w-[600px] max-h-[500px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-3 border-b border-zinc-700">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            {resource.type === 'image' && <Image size={16} className="text-emerald-400" />}
            {resource.type === 'video' && <Video size={16} className="text-purple-400" />}
            {resource.type === 'audio' && <Music size={16} className="text-amber-400" />}
            <span className="truncate max-w-[400px]">
              {resource.alt || resource.src.split('/').pop()}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors text-xl"
          >
            ×
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="p-4 flex items-center justify-center min-h-[200px]">
          {/* 이미지 미리보기 */}
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

          {/* 비디오 플레이스홀더 */}
          {resource.type === 'video' && (
            <div className="text-center text-zinc-500">
              <Video size={48} className="mx-auto mb-3 text-purple-400" />
              <p className="text-sm">Video Preview</p>
              <p className="text-xs text-zinc-600 mt-1 break-all max-w-md">{resource.src}</p>
              <p className="text-xs text-zinc-700 mt-2 italic">(비디오 플레이어 준비 중)</p>
            </div>
          )}

          {/* 오디오 플레이스홀더 */}
          {resource.type === 'audio' && (
            <div className="text-center text-zinc-500">
              <Music size={48} className="mx-auto mb-3 text-amber-400" />
              <p className="text-sm">Audio Preview</p>
              <p className="text-xs text-zinc-600 mt-1 break-all max-w-md">{resource.src}</p>
              <p className="text-xs text-zinc-700 mt-2 italic">(오디오 플레이어 준비 중)</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
