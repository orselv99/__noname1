'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/context/LanguageContext';
import { Eye, EyeOff, FileText, Globe, ChevronDown } from 'lucide-react';

export interface VisibilityLevelConfig {
  value: number;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  color: string;
  hoverColor: string;
}

interface VisibilityDropdownProps {
  currentLevel: number;
  onLevelChange: (level: number) => void;
  className?: string;
}

export function useVisibilityLevels(): VisibilityLevelConfig[] {
  const { t } = useLanguage();

  return [
    { value: 1, label: t.admin.departments.visibility.level_1, icon: EyeOff, color: 'bg-gray-700 text-gray-300', hoverColor: 'hover:bg-gray-600' },
    { value: 2, label: t.admin.departments.visibility.level_2, icon: FileText, color: 'bg-blue-900/50 text-blue-300', hoverColor: 'hover:bg-blue-800/50' },
    { value: 3, label: t.admin.departments.visibility.level_3, icon: Eye, color: 'bg-amber-900/50 text-amber-300', hoverColor: 'hover:bg-amber-800/50' },
    { value: 4, label: t.admin.departments.visibility.level_4, icon: Globe, color: 'bg-green-900/50 text-green-300', hoverColor: 'hover:bg-green-800/50' },
  ];
}

export function VisibilityDropdown({ currentLevel, onLevelChange, className = '' }: VisibilityDropdownProps) {
  const VISIBILITY_LEVELS = useVisibilityLevels();
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showDropdown && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const height = 150;
      const openUpwards = spaceBelow < height;

      setDropdownPosition({
        top: openUpwards ? rect.top - height + 15 : rect.bottom + 4,
        left: Math.max(10, rect.right - 140),
      });
    }
    setShowDropdown(!showDropdown);
  };

  // Close dropdown on scroll
  useEffect(() => {
    if (showDropdown) {
      const handleScroll = () => setShowDropdown(false);
      window.addEventListener('scroll', handleScroll, true);
      return () => window.removeEventListener('scroll', handleScroll, true);
    }
  }, [showDropdown]);

  // Close dropdown on outside click
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

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const currentConfig = VISIBILITY_LEVELS.find(v => v.value === currentLevel) || VISIBILITY_LEVELS[3];
  const Icon = currentConfig.icon;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        onClick={toggleDropdown}
        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-all ${currentConfig.color} ${currentConfig.hoverColor} cursor-pointer`}
      >
        <Icon size={12} />
        {currentConfig.label}
        <ChevronDown size={10} className="opacity-50" />
      </button>

      {showDropdown && isMounted && createPortal(
        <div
          ref={contentRef}
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: '140px',
            zIndex: 99999,
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
}

// Simple badge display (non-interactive)
export function VisibilityBadge({ level, className = '' }: { level: number; className?: string }) {
  const VISIBILITY_LEVELS = useVisibilityLevels();
  const config = VISIBILITY_LEVELS.find(v => v.value === level) || VISIBILITY_LEVELS[3];
  const Icon = config.icon;

  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${config.color} ${className}`}>
      <Icon size={12} />
      {config.label}
    </span>
  );
}
