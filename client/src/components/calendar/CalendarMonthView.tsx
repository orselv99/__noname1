
import { useState, useEffect } from 'react';
import { useContentStore } from '../../stores/contentStore';
import { CalendarEvent } from '../../stores/contentStore';
import { Plus, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';

interface CalendarMonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onSelectDate: (date: Date) => void;
  onRangeSelect: (start: Date, end: Date) => void;
  onEventClick: (eventId: string) => void;
}

export const CalendarMonthView = ({
  currentDate,
  events,
  onSelectDate,
  onRangeSelect,
  onEventClick }: CalendarMonthViewProps) => {
  // Store State for selection highlighting (global)
  const selectedDate = useContentStore(state => state.calendarSelectedDate);
  const selectedEventId = useContentStore(state => state.calendarSelectedEventId);

  // Local state for dragging (transient)
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, date: Date } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const firstDayWeekday = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  // Create full calendar grid (42 days: 6 weeks)
  const calendarDays: Date[] = [];
  // Previous month filling
  for (let i = firstDayWeekday - 1; i >= 0; i--) {
    calendarDays.push(new Date(year, month, -i));
  }
  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(new Date(year, month, day));
  }
  // Next month filling
  const remainingDays = 42 - calendarDays.length;
  for (let i = 1; i <= remainingDays; i++) {
    calendarDays.push(new Date(year, month + 1, i));
  }

  // Helper functions
  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const isSelected = (date: Date) => {
    if (dragStart && dragEnd) {
      const start = dragStart < dragEnd ? dragStart : dragEnd;
      const end = dragStart < dragEnd ? dragEnd : dragStart;
      return date >= start && date <= end;
    }
    if (!selectedDate) return false;
    return date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear();
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === month;
  };

  const isDateInRange = (date: Date, start: Date, end: Date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
    return d >= s && d <= e;
  };

  // Group events by week
  const getEventSlotsForWeek = (weekStart: Date, weekDays: Date[]) => {
    const weekEnd = weekDays[6];
    const weekEvents = events.filter(e => {
      const s = new Date(e.startDate);
      const end = new Date(e.endDate);
      return s <= weekEnd && end >= weekStart;
    });

    weekEvents.sort((a, b) => {
      const pMap = { High: 3, Medium: 2, Low: 1, undefined: 0 };
      const pA = pMap[a.priority as keyof typeof pMap] || 0;
      const pB = pMap[b.priority as keyof typeof pMap] || 0;
      if (pA !== pB) return pB - pA;

      const sA = new Date(a.startDate).getTime();
      const sB = new Date(b.startDate).getTime();
      if (sA !== sB) return sA - sB;
      const durA = new Date(a.endDate).getTime() - sA;
      const durB = new Date(b.endDate).getTime() - sB;
      return durB - durA;
    });

    const slots: Record<string, number> = {};
    const daySlots: string[][] = Array(7).fill(null).map(() => []);

    weekEvents.forEach(e => {
      let slotIndex = 0;
      const s = new Date(e.startDate);
      const end = new Date(e.endDate);
      const coveredIndices = [];
      for (let i = 0; i < 7; i++) {
        if (isDateInRange(weekDays[i], s, end)) {
          coveredIndices.push(i);
        }
      }
      if (coveredIndices.length === 0) return;

      while (true) {
        let isAvailable = true;
        for (const dayIdx of coveredIndices) {
          if (daySlots[dayIdx][slotIndex]) {
            isAvailable = false;
            break;
          }
        }
        if (isAvailable) break;
        slotIndex++;
      }

      slots[e.id] = slotIndex;
      for (const dayIdx of coveredIndices) {
        daySlots[dayIdx][slotIndex] = e.id;
      }
    });

    return { slots, maxSlot: Math.max(...Object.values(slots), -1), weekEvents };
  };

  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  // Handlers
  const handleMouseDown = (date: Date) => {
    setIsDragging(true);
    setDragStart(date);
    setDragEnd(date);
    setContextMenu(null);
  };

  const handleMouseEnter = (date: Date) => {
    if (isDragging) {
      setDragEnd(date);
    }
  };

  const handleGlobalMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      if (dragStart && dragEnd) {
        const start = dragStart < dragEnd ? dragStart : dragEnd;
        const end = dragStart < dragEnd ? dragEnd : dragStart;

        const isStartSameAsEnd = start.getFullYear() === end.getFullYear() &&
          start.getMonth() === end.getMonth() &&
          start.getDate() === end.getDate();

        if (!isStartSameAsEnd) {
          onRangeSelect(start, end);
        } else {
          onSelectDate(start);
        }
      }
    }
  };

  useEffect(() => {
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, dragStart, dragEnd]);

  const handleContextMenu = (e: React.MouseEvent, date: Date) => {
    e.preventDefault();
    setDragStart(null);
    setDragEnd(null);
    onSelectDate(date);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      date: date
    });
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);


  return (
    <>
      {/* Day Names */}
      <div className="grid grid-cols-7 mb-2 shrink-0 border-b border-zinc-800 pb-2">
        {dayNames.map((day, idx) => (
          <div key={day} className={`text-center text-sm font-semibold py-1 ${idx === 0 ? 'text-red-400' : idx === 6 ? 'text-blue-400' : 'text-zinc-500'
            }`}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 flex flex-col bg-zinc-800 border-t border-l border-zinc-800 rounded-lg overflow-hidden min-h-[500px] select-none">
        {weeks.map((weekDays, weekIndex) => {
          const { slots, weekEvents } = getEventSlotsForWeek(weekDays[0], weekDays);
          const MAX_VISIBLE_EVENTS = 3;

          return (
            <div key={weekIndex} className="flex-1 relative flex flex-col border-b border-zinc-800 min-h-[100px]">
              {/* Grid Background */}
              <div className="absolute inset-0 grid grid-cols-7">
                {weekDays.map((date, dayIdx) => {
                  const isCurrent = isCurrentMonth(date);
                  const isDayToday = isToday(date);
                  const isDaySelected = isSelected(date);
                  const dayEventsCount = weekEvents.filter(e => {
                    const s = new Date(e.startDate);
                    const end = new Date(e.endDate);
                    return isDateInRange(date, s, end);
                  }).length;

                  return (
                    <div
                      key={dayIdx}
                      className={`bg-zinc-950 relative group flex flex-col border-r border-zinc-800 transition-colors
                              ${!isCurrent ? 'bg-zinc-950/50' : 'bg-zinc-950'}
                              ${isDaySelected ? 'bg-zinc-900 ring-1 ring-inset ring-blue-500 z-10' : 'hover:bg-zinc-900'}
                          `}
                      onContextMenu={(e) => handleContextMenu(e, date)}
                      onMouseDown={() => handleMouseDown(date)}
                      onMouseEnter={() => handleMouseEnter(date)}
                    >
                      <div className="p-1 flex-1 flex flex-col">
                        <span
                          className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ml-auto
                                  ${isDayToday
                              ? 'bg-blue-600 text-white font-bold'
                              : !isCurrent
                                ? 'text-zinc-600'
                                : 'text-zinc-400'
                            }
                                `}
                        >
                          {date.getDate()}
                        </span>
                        {dayEventsCount > MAX_VISIBLE_EVENTS && (
                          <div className="mt-auto text-[10px] text-zinc-500 font-medium px-1 pb-1">
                            +{dayEventsCount - MAX_VISIBLE_EVENTS}개 일정
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Event Overlay Layer */}
              <div className="absolute inset-x-0 top-8 bottom-0 pointer-events-none z-20">
                {weekEvents.map(event => {
                  const slotIndex = slots[event.id] ?? 0;
                  if (slotIndex >= MAX_VISIBLE_EVENTS) return null;

                  const startDate = new Date(event.startDate);
                  const endDate = new Date(event.endDate);
                  const weekStart = weekDays[0];
                  const weekEnd = weekDays[6];

                  let startIndex = 0;
                  if (startDate >= weekStart) startIndex = startDate.getDay();
                  let endIndex = 6;
                  if (endDate <= weekEnd) endIndex = endDate.getDay();

                  const span = endIndex - startIndex + 1;
                  const widthPercent = (span / 7) * 100;
                  const leftPercent = (startIndex / 7) * 100;

                  const isStartActual = startDate >= weekStart;
                  const isEndActual = endDate <= weekEnd;

                  return (
                    <div
                      key={event.id}
                      className={`absolute h-5 ${event.color || 'bg-blue-500'} text-[10px] text-white
                                    flex items-center px-1 truncate cursor-pointer hover:brightness-110 pointer-events-auto shadow-sm
                                    ${isStartActual ? 'rounded-l-md ml-1' : '-ml-px'} 
                                    ${isEndActual ? 'rounded-r-md mr-1' : '-mr-px'}
                                `}
                      style={{
                        left: `${leftPercent}%`,
                        width: `calc(${widthPercent}% - 8px)`,
                        top: `${slotIndex * 24}px`
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event.id);
                      }}
                    >
                      <span className="truncate w-full font-medium mx-0.5">
                        {event.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && createPortal(
        <div
          className="fixed bg-zinc-800 border border-zinc-700 rounded-md shadow-xl py-1 z-[9999] min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs font-semibold text-zinc-400 border-b border-zinc-700 mb-1">
            {contextMenu.date.getMonth() + 1}월 {contextMenu.date.getDate()}일
          </div>
          <button
            className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center gap-2"
            onClick={() => {
              onRangeSelect(contextMenu.date, contextMenu.date);
              setContextMenu(null);
            }}
          >
            <Plus size={14} />
            일정 추가
          </button>
          <button
            className="w-full text-left px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200 flex items-center gap-2"
            onClick={() => {
              console.log("Delete Events");
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} />
            일정 삭제
          </button>
        </div>,
        document.body
      )}
    </>
  );
};
