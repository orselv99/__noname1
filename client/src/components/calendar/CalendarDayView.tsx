import { useEffect, useRef, useState, useMemo } from 'react';
import { CalendarEvent } from '../../stores/contentStore';
import { SmallCalendar } from './CalendarSmallCalendar';

interface CalendarDayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDateChange: (date: Date) => void;
  onRangeSelect: (start: Date, end: Date) => void;
  onEventClick: (eventId: string) => void;
}

export const CalendarDayView = ({
  currentDate,
  events,
  onDateChange,
  onRangeSelect,
  onEventClick }: CalendarDayViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // 드래그 상태
  const [dragStart, setDragStart] = useState<number | null>(null); // Y 위치
  const [dragCurrent, setDragCurrent] = useState<number | null>(null); // Y 위치
  const [isDragging, setIsDragging] = useState(false);
  // 오전 9시로 스크롤 이동 -> 0시로 변경 (User Request)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, []);

  // Y 좌표를 시간으로 변환하는 도움 함수
  const getTimeFromY = (y: number) => {
    const minutes = Math.floor(y); // 1px = 1분
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return { h: Math.min(23, Math.max(0, h)), m: Math.min(59, Math.max(0, m)) };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // 텍스트 선택 방지
    const rect = e.currentTarget.getBoundingClientRect();
    const rawY = e.clientY - rect.top + e.currentTarget.scrollTop;
    const snappedY = Math.round(rawY / 30) * 30;

    setDragStart(snappedY);
    setDragCurrent(snappedY);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && dragStart !== null) {
      const rect = e.currentTarget.getBoundingClientRect();
      const rawY = e.clientY - rect.top + e.currentTarget.scrollTop;
      // 30분 단위 스냅 (30px)
      const snappedY = Math.round(rawY / 30) * 30;
      setDragCurrent(snappedY);
    }
  };

  const handleMouseUp = () => {
    if (isDragging && dragStart !== null && dragCurrent !== null) {
      const startY = Math.min(dragStart, dragCurrent);
      const endY = Math.max(dragStart, dragCurrent);

      const start = getTimeFromY(startY);
      const end = getTimeFromY(endY);

      // 30분 단위 스냅
      const snapTo30 = (m: number) => Math.round(m / 30) * 30;

      let startH = start.h;
      let startM = snapTo30(start.m);
      if (startM === 60) { startH++; startM = 0; }

      let endH = end.h;
      let endM = snapTo30(end.m);
      if (endM === 60) { endH++; endM = 0; }

      const newStartDate = new Date(currentDate);
      newStartDate.setHours(startH, startM, 0);

      const newEndDate = new Date(currentDate);
      newEndDate.setHours(endH, endM, 0);

      // 클릭 시 최소 30분 보장
      if (newEndDate <= newStartDate) {
        newEndDate.setMinutes(newEndDate.getMinutes() + 30);
      }

      onRangeSelect(newStartDate, newEndDate);
    }
    setIsDragging(false);
    setDragStart(null);
    setDragCurrent(null);
    setDragCurrent(null);
  };
  // 전역 마우스 업 핸들러
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };

    if (isDragging) {
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, dragStart, dragCurrent]);

  const dateEvents = useMemo(() => {
    return events.filter(e => {
      const s = new Date(e.startDate);
      const end = new Date(e.endDate);
      const dayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 0, 0, 0);
      const dayEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59);
      return s < dayEnd && end > dayStart;
    });
  }, [events, currentDate]);

  const getEventsForDate = (date: Date) => {
    // Re-use memoized if date matches? CalendarDayView is single date.
    // Simplify: just use dateEvents directly in render
    return dateEvents;
  };

  const getEventStyle = (event: CalendarEvent, date: Date) => {
    const s = new Date(event.startDate);
    const e = new Date(event.endDate);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);

    let startMinutes = (s.getTime() - dayStart.getTime()) / (1000 * 60);
    if (startMinutes < 0) startMinutes = 0;

    let endMinutes = (e.getTime() - dayStart.getTime()) / (1000 * 60);
    if (endMinutes > 24 * 60) endMinutes = 24 * 60;

    const duration = endMinutes - startMinutes;

    return {
      top: `${startMinutes}px`,
      height: `${Math.max(duration, 20)}px`,
      left: '10px',
      right: '10px'
    };
  };

  const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  return (
    <div className="flex h-full bg-zinc-950 text-white overflow-hidden">
      <SmallCalendar currentDate={currentDate} onDateChange={onDateChange} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* 헤더 */}
        <div className="flex border-b border-zinc-800 shrink-0 pr-4 py-4 items-center pl-14">
          <div>
            <div className="text-2xl font-bold flex items-baseline gap-2">
              <span className="text-zinc-100">{currentDate.getDate()}일</span>
              <span className="text-zinc-400 text-lg">{dayNames[currentDate.getDay()]}</span>
            </div>
            <div className="text-sm text-zinc-500 mt-0.5">
              {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
            </div>
          </div>
        </div>

        {/* 시간 그리드 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto relative flex">
          {/* 시간 축 */}
          <div className="w-14 shrink-0 border-r border-zinc-800 bg-zinc-900/30 text-xs text-zinc-500 text-right select-none">
            {hours.map(h => (
              <div key={h} className="h-[60px] pr-2 relative border-b border-transparent">
                <span className="block absolute right-2 -translate-y-1/2 top-0 bg-zinc-950 px-1 z-10 text-zinc-400">
                  {h === 0 ? '0:00' : `${h}:00`}
                </span>
              </div>
            ))}
          </div>

          {/* 그리드 컬럼 */}
          <div className="flex-1 flex relative h-[1440px] max-h-[1440px]">
            {/* 가로선 배경 */}
            <div className="absolute inset-0 pointer-events-none z-0">
              {hours.map(h => (
                <div key={h} className="h-[60px] border-b border-zinc-800/50 box-border w-full"></div>
              ))}
            </div>

            {/* 요일 컬럼 */}
            <div className="flex-1 border-r border-zinc-800/50 relative group h-[1440px]" // 고정 높이
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
            >
              {getEventsForDate(currentDate).map(event => {
                // Parse color
                let colorHex = '#3b82f6'; // Default blue
                if (event.color?.startsWith('bg-[#') && event.color?.endsWith(']')) {
                  colorHex = event.color.replace('bg-[', '').replace(']', '');
                }

                return (
                  <div
                    key={event.id}
                    className={`absolute p-2 text-xs overflow-hidden cursor-pointer hover:brightness-95 hover:z-50 rounded-r-md transition-all shadow-sm`}
                    style={{
                      ...getEventStyle(event, currentDate),
                      borderLeft: `4px solid ${colorHex}`,
                      backgroundColor: `${colorHex}26`, // ~15% opacity
                      color: colorHex
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event.id);
                    }}
                    onMouseDown={(e) => e.stopPropagation()} // 이벤트 클릭 시 드래그 시작 방지
                  >
                    <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100" style={{ color: colorHex }}>
                      {event.title}
                    </div>
                    <div className="opacity-90 mt-1 flex gap-2">
                      <span className="font-medium">
                        {new Date(event.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(event.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {event.priority && <span className="font-bold">{event.priority === 'High' ? '!!!' : event.priority === 'Medium' ? '!!' : '!'}</span>}
                    </div>
                    {event.description && <div className="mt-2 opacity-80 line-clamp-2">{event.description}</div>}
                  </div>
                );
              })}

              {/* 드래그 미리보기 */}
              {isDragging && dragStart !== null && dragCurrent !== null && (
                <div className="absolute bg-blue-500/30 border border-blue-500 rounded z-10 pointer-events-none"
                  style={{
                    top: Math.min(dragStart, dragCurrent),
                    height: Math.abs(dragCurrent - dragStart),
                    left: 0,
                    right: 0
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div >
  );
};
