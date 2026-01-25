import { useEffect, useRef, useState } from 'react';
import { CalendarEvent, useDocumentStore } from '../../stores/documentStore';
import { SmallCalendar } from './CalendarSmallCalendar';

interface CalendarWeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDateChange: (date: Date) => void;
  onRangeSelect: (start: Date, end: Date) => void;
  onEventClick: (eventId: string) => void;
}

export const CalendarWeekView = ({
  currentDate,
  events,
  onDateChange,
  onRangeSelect,
  onEventClick }: CalendarWeekViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 주간 날짜 계산
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay()); // 일요일 시작

  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    weekDays.push(d);
  }

  // 시간 목록
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // 오전 9시로 스크롤 이동
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 9 * 60;
    }
  }, []);

  // 드래그 상태
  const [dragStart, setDragStart] = useState<{ dayIndex: number, y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null); // Y 위치
  const [isDragging, setIsDragging] = useState(false);

  // Y 좌표를 시간으로 변환하는 도움 함수
  const getTimeFromY = (y: number) => {
    const minutes = Math.floor(y); // 1px = 1분
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return { h: Math.min(23, Math.max(0, h)), m: Math.min(59, Math.max(0, m)) };
  };

  const handleMouseDown = (e: React.MouseEvent, dayIndex: number) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const rawY = e.clientY - rect.top + e.currentTarget.scrollTop;
    const snappedY = Math.round(rawY / 30) * 30;

    setDragStart({ dayIndex, y: snappedY });
    setDragCurrent(snappedY);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && dragStart !== null) {
      const rect = e.currentTarget.getBoundingClientRect(); // Target is the specific day column
      const rawY = e.clientY - rect.top + e.currentTarget.scrollTop;

      // Snap to 30 minutes (30px)
      const snappedY = Math.round(rawY / 30) * 30;

      setDragCurrent(snappedY);
    }
  };

  const handleMouseUp = () => {
    if (isDragging && dragStart !== null && dragCurrent !== null) {
      const startY = Math.min(dragStart.y, dragCurrent);
      const endY = Math.max(dragStart.y, dragCurrent);

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

      const targetDate = weekDays[dragStart.dayIndex];
      const newStartDate = new Date(targetDate);
      newStartDate.setHours(startH, startM, 0);

      const newEndDate = new Date(targetDate);
      newEndDate.setHours(endH, endM, 0);

      if (newEndDate <= newStartDate) {
        newEndDate.setMinutes(newEndDate.getMinutes() + 30);
      }

      onRangeSelect(newStartDate, newEndDate);
    }
    setIsDragging(false);
    setDragStart(null);
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
  }, [isDragging, dragStart, dragCurrent]); // 상태 변경 시 최신 값을 캡처하기 위해 다시 바인딩

  // 요일 이름
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  // 특정 날짜에 해당하는 일정 필터링 도움 함수
  const getEventsForDate = (date: Date) => {
    return events.filter(e => {
      const s = new Date(e.startDate);
      const end = new Date(e.endDate);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

      return s < dayEnd && end > dayStart;
    });
  };

  const getEventStyle = (event: CalendarEvent, date: Date) => {
    const s = new Date(event.startDate);
    const e = new Date(event.endDate);

    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);

    // 시작 시간을 하루 시작 기준으로 분 단위 계산
    let startMinutes = (s.getTime() - dayStart.getTime()) / (1000 * 60);
    if (startMinutes < 0) startMinutes = 0; // 하루 시작으로 제한

    // 종료 시간 계산
    let endMinutes = (e.getTime() - dayStart.getTime()) / (1000 * 60);
    if (endMinutes > 24 * 60) endMinutes = 24 * 60; // 하루 끝으로 제한

    const duration = endMinutes - startMinutes;

    return {
      top: `${startMinutes}px`, // 1분당 1px
      height: `${Math.max(duration, 20)}px`, // 최소 높이 20px
      left: '2px',
      right: '2px'
    };
  };

  return (
    <div className="flex h-full bg-zinc-950 text-white overflow-hidden">
      <SmallCalendar currentDate={currentDate} onDateChange={onDateChange} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* 헤더 (요일 이름) */}
        <div className="flex border-b border-zinc-800 shrink-0 pr-4"> {/* 스크롤바 보정용 pr-4 */}
          <div className="w-14 shrink-0 border-r border-zinc-800 bg-zinc-900/50"></div> {/* 시간 축 헤더 */}
          {weekDays.map((date, i) => {
            const isToday = date.getDate() === new Date().getDate() && date.getMonth() === new Date().getMonth();
            return (
              <div key={i} className="flex-1 py-3 text-center border-r border-zinc-800 last:border-r-0">
                <div className={`text-xs mb-1 font-semibold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-zinc-500'}`}>{dayNames[i]}</div>
                <div className={`text-xl font-bold ${isToday ? 'bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center mx-auto' : 'text-zinc-300'}`}>
                  {date.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {/* 시간 그리드 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto relative flex">
          {/* 시간 축 */}
          <div className="w-14 shrink-0 border-r border-zinc-800 bg-zinc-900/30 text-xs text-zinc-500 text-right select-none">
            {hours.map(h => (
              <div key={h} className="h-[60px] pr-2 relative border-b border-transparent">
                {/* 라벨을 해당 시간의 시작 선에 맞춤 (상단 정렬) */}
                {/* 12:00 라벨이 12-1시 블록의 상단에 오도록 -50% Y축 이동하여 선 중앙에 배치 */}
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
            {weekDays.map((date, i) => {
              const dayEvents = getEventsForDate(date);

              return (
                <div key={i} className="flex-1 border-r border-zinc-800/50 relative group h-[1440px]"
                  onMouseDown={(e) => handleMouseDown(e, i)}
                  onMouseMove={handleMouseMove}
                >
                  {dayEvents.map(event => (
                    <div
                      key={event.id}
                      className={`absolute p-1 border-l-2 text-[10px] overflow-hidden cursor-pointer hover:brightness-110 hover:z-50 shadow-sm
                                       ${event.color || 'bg-blue-500/20'} 
                                       border-${event.color?.replace('bg-', '') || 'blue-500'}
                                       text-white bg-opacity-80
                                   `}
                      style={{
                        ...getEventStyle(event, date),
                        backgroundColor: 'var(--tw-bg-opacity)'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event.id);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="font-semibold">{event.title}</div>
                      <div className="opacity-75">{new Date(event.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  ))}

                  {/* 드래그 미리보기 */}
                  {isDragging && dragStart !== null && dragStart.dayIndex === i && dragCurrent !== null && (
                    <div className="absolute bg-blue-500/30 border border-blue-500 rounded z-10 pointer-events-none"
                      style={{
                        top: Math.min(dragStart.y, dragCurrent),
                        height: Math.abs(dragCurrent - dragStart.y),
                        left: 0,
                        right: 0
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
