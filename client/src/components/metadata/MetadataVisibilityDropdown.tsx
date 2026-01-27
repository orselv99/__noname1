/**
 * ==========================================================================
 * MetadataVisibilityDropdown.tsx - 가시성 레벨 드롭다운 컴포넌트
 * ==========================================================================
 * 
 * 문서의 가시성 레벨(Hidden, Snippet, Public)을 선택할 수 있는 드롭다운입니다.
 * 포털을 사용하여 body에 렌더링되므로 overflow 문제가 없습니다.
 * ==========================================================================
 */

import { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff, Eye, Globe, ChevronDown as ChevronDownIcon, FileText } from 'lucide-react';
import { VisibilityLevel } from '../../types';

/**
 * 가시성 레벨 설정 목록
 */
export const VISIBILITY_LEVELS = [
  {
    value: VisibilityLevel.Hidden,
    label: 'Hidden',  // 숨김
    icon: EyeOff,
    color: 'bg-zinc-700 text-zinc-300',
    hoverColor: 'hover:bg-zinc-600'
  },
  {
    value: VisibilityLevel.Metadata,
    label: 'Metadata',  // 메타데이터만 공개
    icon: FileText,
    color: 'bg-blue-900/50 text-blue-300',
    hoverColor: 'hover:bg-blue-800/50'
  },
  {
    value: VisibilityLevel.Snippet,
    label: 'Snippet',  // 요약만 공개
    icon: Eye,
    color: 'bg-amber-900/50 text-amber-300',
    hoverColor: 'hover:bg-amber-800/50'
  },
  {
    value: VisibilityLevel.Public,
    label: 'Public',  // 전체 공개
    icon: Globe,
    color: 'bg-green-900/50 text-green-300',
    hoverColor: 'hover:bg-green-800/50'
  },
];

/**
 * VisibilityDropdown Props
 */
interface MetadataVisibilityDropdownProps {
  /** 현재 가시성 레벨 */
  currentLevel: VisibilityLevel;
  /** 레벨 변경 핸들러 */
  onLevelChange: (level: VisibilityLevel) => void;
}

/**
 * 가시성 레벨 드롭다운 컴포넌트
 * 
 * - 현재 레벨을 뱃지로 표시
 * - 클릭 시 드롭다운 메뉴 표시
 */
export const MetadataVisibilityDropdown = memo(({
  currentLevel,
  onLevelChange
}: MetadataVisibilityDropdownProps) => {
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

  // 현재 레벨 설정 찾기
  const currentConfig = VISIBILITY_LEVELS.find(v => v.value === currentLevel) || VISIBILITY_LEVELS[0];
  const Icon = currentConfig.icon;

  return (
    <div className="relative flex-1">
      {/* 트리거 버튼 */}
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
          {VISIBILITY_LEVELS.map((level) => {
            const LevelIcon = level.icon;
            const isSelected = currentLevel === level.value;
            return (
              <button
                key={level.value}
                onClick={(e) => {
                  e.stopPropagation();
                  onLevelChange(level.value);
                  setShowDropdown(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${isSelected ? level.color : 'text-gray-300 hover:bg-zinc-700'
                  }`}
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

MetadataVisibilityDropdown.displayName = 'MetadataVisibilityDropdown';
