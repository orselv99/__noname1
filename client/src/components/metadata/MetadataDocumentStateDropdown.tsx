/**
 * ==========================================================================
 * MetadataDocumentStateDropdown.tsx - 문서 상태 드롭다운 컴포넌트
 * ==========================================================================
 * 
 * 문서의 상태(Draft, Feedback, Published)를 선택할 수 있는 드롭다운입니다.
 * 포털을 사용하여 body에 렌더링되므로 overflow 문제가 없습니다.
 * ==========================================================================
 */

import { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { Edit3, Send, Globe, ChevronDown as ChevronDownIcon, Loader2 } from 'lucide-react';
import { DocumentState } from '../../types';

/**
 * 문서 상태 설정 목록
 */
export const DOCUMENT_STATES = [
  {
    value: DocumentState.Draft,
    label: 'Draft',  // 초안
    icon: Edit3,
    color: 'bg-gray-700 text-gray-300',
    hoverColor: 'hover:bg-gray-600'
  },
  {
    value: DocumentState.Feedback,
    label: 'Feedback',  // 피드백 요청
    icon: Send,
    color: 'bg-amber-900/50 text-amber-300',
    hoverColor: 'hover:bg-amber-800/50'
  },
  {
    value: DocumentState.Published,
    label: 'Published',  // 게시됨
    icon: Globe,
    color: 'bg-green-900/50 text-green-300',
    hoverColor: 'hover:bg-green-800/50'
  },
];

/**
 * DocumentStateDropdown Props
 */
interface MetadataDocumentStateDropdownProps {
  /** 현재 문서 상태 */
  currentState: DocumentState;
  /** 상태 변경 핸들러 */
  onStateChange: (state: DocumentState) => void;
  /** 개인(Private) 문서 여부 (Published 옵션 숨김) */
  isPrivate?: boolean;
  /** 로딩 중 여부 */
  isLoading?: boolean;
  /** 비활성화 여부 */
  disabled?: boolean;
}

/**
 * 문서 상태 드롭다운 컴포넌트
 * 
 * - 현재 상태를 뱃지로 표시
 * - 클릭 시 드롭다운 메뉴 표시
 * - Private 문서는 Published 옵션 제외
 */
export const MetadataDocumentStateDropdown = memo(({
  currentState,
  onStateChange,
  isPrivate,
  isLoading,
  disabled
}: MetadataDocumentStateDropdownProps) => {
  // 드롭다운 열림 상태
  const [showDropdown, setShowDropdown] = useState(false);
  // 드롭다운 위치
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  // Refs
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /**
   * 드롭다운 토글 핸들러
   */
  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLoading || disabled) return;

    if (!showDropdown && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    setShowDropdown(!showDropdown);
  };

  /**
   * 외부 클릭 감지
   */
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

  // 현재 상태 설정 찾기
  const currentConfig = DOCUMENT_STATES.find(s => s.value === currentState) || DOCUMENT_STATES[0];
  const Icon = currentConfig.icon;

  // Private 문서는 Published 제외
  const availableStates = isPrivate
    ? DOCUMENT_STATES.filter(s => s.value !== DocumentState.Published)
    : DOCUMENT_STATES;

  return (
    <div className="relative flex-1">
      {/* 트리거 버튼 */}
      <button
        ref={triggerRef}
        onClick={toggleDropdown}
        disabled={isLoading || disabled}
        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-all ${currentConfig.color} ${currentConfig.hoverColor} ${(isLoading || disabled) ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="flex items-center gap-1.5">
          {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
          {isLoading
            ? (currentState === DocumentState.Published ? 'Publishing...' : 'Saving...')
            : currentConfig.label}
        </span>
        {!isLoading && <ChevronDownIcon size={12} className="opacity-50" />}
      </button>

      {/* 포털로 렌더링되는 드롭다운 */}
      {showDropdown && createPortal(
        <div
          ref={contentRef}
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: '120px',
            zIndex: 99999
          }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden"
        >
          {availableStates.map((state) => {
            const StateIcon = state.icon;
            const isSelected = currentState === state.value;
            return (
              <button
                key={state.value}
                onClick={(e) => {
                  e.stopPropagation();
                  onStateChange(state.value);
                  setShowDropdown(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${isSelected ? state.color : 'text-gray-300 hover:bg-zinc-700'
                  }`}
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

MetadataDocumentStateDropdown.displayName = 'MetadataDocumentStateDropdown';
