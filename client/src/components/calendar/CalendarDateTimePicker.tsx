
import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { createPortal } from 'react-dom';

/**
 * ==========================================================================
 * CalendarDateTimePicker.tsx
 * ==========================================================================
 * 
 * 날짜와 시간을 동시에 선택할 수 있는 사용자 정의 컴포넌트입니다.
 * 왼쪽에는 달력(Calendar), 오른쪽에는 시간 목록(Time List)을 표시합니다.
 * 
 * 주요 기능:
 * - 날짜 선택 (월 이동, 일 선택)
 * - 시간 선택 (30분 단위 목록)
 * - 오늘(Today), 현재(Now) 버튼 제공
 * - 팝업 형태로 표시 (Portal 사용)
 */

interface CalendarDateTimePickerProps {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minDate?: Date; // 선택 가능한 최소 날짜 (종료일 선택 시 시작일보다 이전 선택 방지용)
}

export const CalendarDateTimePicker = ({ label, value, onChange, minDate }: CalendarDateTimePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // 팝업 위치 제어를 위한 Ref
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // 달력 표시를 위한 현재 보고 있는 연/월 상태
  const [viewDate, setViewDate] = useState(value);

  // 팝업 열기/닫기 토글
  const toggleOpen = () => {
    if (!isOpen) {
      setViewDate(value); // 열 때 현재 선택된 날짜로 뷰 초기화

      // 위치 계산 (화면 아래쪽 공간이 부족하면 위로 띄우는 로직 등을 추가할 수 있음)
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPosition({
          top: rect.bottom + window.scrollY + 8, // 버튼 8px 아래
          left: rect.left + window.scrollX
        });
      }
    }
    setIsOpen(!isOpen);
  };

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // 팝업 내부나 버튼을 클릭했으면 닫지 않음
      const target = e.target as HTMLElement;
      if (containerRef.current?.contains(target)) return;

      const popup = document.getElementById('datetime-picker-popup');
      if (popup?.contains(target)) return;

      setIsOpen(false);
    };

    if (isOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 날짜 포맷팅 함수 (YYYY-MM-DD HH:mm AM/PM)
  const formatDateTime = (date: Date) => {
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // ==========================================================================
  // 달력 로직 (Calendar Logic)
  // ==========================================================================

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // 달력 그리드 생성
  const renderCalendarDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const daysInMonth = getDaysInMonth(year, month);
    const startDay = getFirstDayOfMonth(year, month); // 0: Sun, 1: Mon...

    const days = [];

    // 빈 칸 (지난 달)
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-8 w-8"></div>);
    }

    // 날짜 채우기
    for (let d = 1; d <= daysInMonth; d++) {
      const currentDate = new Date(year, month, d);
      const isSelected = currentDate.toDateString() === value.toDateString(); // 년월일만 비교
      const isToday = currentDate.toDateString() === new Date().toDateString();

      // minDate보다 이전인지 확인 (시간 제외하고 날짜만 비교)
      let isDisabled = false;
      if (minDate) {
        const min = new Date(minDate);
        min.setHours(0, 0, 0, 0);
        if (currentDate < min) isDisabled = true;
      }

      days.push(
        <button
          key={d}
          onClick={() => {
            if (isDisabled) return;
            // 날짜만 변경하고 시간은 유지
            const newDate = new Date(value);
            newDate.setFullYear(year);
            newDate.setMonth(month);
            newDate.setDate(d);
            onChange(newDate);
          }}
          disabled={isDisabled}
          className={`
            h-8 w-8 text-xs rounded-full flex items-center justify-center transition-colors
            ${isDisabled ? 'text-zinc-600 cursor-not-allowed' : 'hover:bg-zinc-700 text-zinc-300'}
            ${isSelected ? '!bg-blue-600 !text-white font-bold' : ''}
            ${!isSelected && isToday ? 'border border-blue-500/50 text-blue-400' : ''}
          `}
        >
          {d}
        </button>
      );
    }
    return days;
  };

  // ==========================================================================
  // 시간 목록 로직 (Time List Logic)
  // ==========================================================================

  // 30분 단위 시간 목록 생성
  const times = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const timeDate = new Date();
      timeDate.setHours(h, m, 0, 0);
      const timeString = timeDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      times.push({ h, m, label: timeString });
    }
  }

  // 현재 선택된 시간으로 스크롤 이동 (팝업 열릴 때)
  useEffect(() => {
    if (isOpen) {
      const selectedTimeBtn = document.getElementById('selected-time-btn');
      selectedTimeBtn?.scrollIntoView({ block: 'center' });
    }
  }, [isOpen]);

  // ==========================================================================
  // 렌더링 (Rendering)
  // ==========================================================================

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* 라벨 */}
      <label className="block text-xs font-medium text-zinc-400 mb-1 flex items-center gap-1">
        {label === 'Start' ? <CalendarIcon size={12} /> : <Clock size={12} />}
        {label}
      </label>

      {/* 입력창 (클릭 시 팝업 오픈) */}
      <div
        onClick={toggleOpen}
        className="
          flex items-center justify-between
          w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 
          text-sm text-white cursor-pointer hover:border-zinc-500 transition-colors
        "
      >
        <span>{formatDateTime(value)}</span>
        <CalendarIcon size={14} className="text-zinc-500" />
      </div>

      {/* 팝업 (Portal로 렌더링하여 overflow 문제 해결) */}
      {isOpen && createPortal(
        <div
          id="datetime-picker-popup"
          className="fixed z-[10001] flex flex-col bg-white dark:bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          style={{ top: position.top, left: position.left }}
        >
          {/* 상단 현재 선택 값 표시 (옵션) */}
          {/* <div className="bg-zinc-800 px-4 py-2 text-sm text-center border-b border-zinc-700">
            {formatDateTime(value)}
          </div> */}

          <div className="flex h-[280px]">
            {/* 왼쪽: 달력 영역 */}
            <div className="w-64 p-4 border-r border-zinc-700 flex flex-col">
              {/* 달력 헤더 (월 이동) */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white">
                  <ChevronLeft size={16} />
                </button>
                <div className="text-sm font-semibold text-white">
                  {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </div>
                <button onClick={nextMonth} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white">
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-[10px] text-zinc-500 uppercase font-medium">
                    {day}
                  </div>
                ))}
              </div>

              {/* 날짜 그리드 */}
              <div className="grid grid-cols-7 gap-1 place-items-center flex-1 content-start">
                {renderCalendarDays()}
              </div>
            </div>

            {/* 오른쪽: 시간 목록 영역 */}
            <div className="w-32 flex flex-col">
              <div className="px-3 py-2 bg-blue-600 text-white text-xs font-semibold text-center shrink-0">
                Time
              </div>
              <div className="overflow-y-auto custom-scrollbar flex-1 bg-zinc-950">
                {times.map((t, i) => {
                  const isSelected = value.getHours() === t.h && (value.getMinutes() >= t.m && value.getMinutes() < t.m + 30);

                  return (
                    <button
                      key={i}
                      id={isSelected ? 'selected-time-btn' : undefined}
                      onClick={() => {
                        const newDate = new Date(value);
                        newDate.setHours(t.h);
                        newDate.setMinutes(t.m);
                        onChange(newDate);
                      }}
                      className={`
                        w-full text-left px-4 py-2 text-xs transition-colors border-l-2
                        ${isSelected
                          ? 'bg-blue-600/20 text-blue-400 border-blue-500 font-medium'
                          : 'text-zinc-400 hover:bg-zinc-900 border-transparent hover:text-zinc-200'
                        }
                      `}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 하단 버튼 영역 */}
          <div className="flex items-center justify-between p-2 bg-zinc-800/50 border-t border-zinc-700">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const today = new Date();
                  // 시간은 유지하고 날짜만 오늘로
                  const newDate = new Date(value);
                  newDate.setFullYear(today.getFullYear());
                  newDate.setMonth(today.getMonth());
                  newDate.setDate(today.getDate());
                  onChange(newDate);
                  setViewDate(today);
                }}
                className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded text-zinc-300 transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => {
                  const now = new Date();
                  onChange(now);
                  setViewDate(now);
                }}
                className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded text-zinc-300 transition-colors"
              >
                Now
              </button>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-1 text-xs bg-white text-black hover:bg-zinc-200 font-medium rounded transition-colors"
            >
              Done
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
