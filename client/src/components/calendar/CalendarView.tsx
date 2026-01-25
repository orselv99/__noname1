
import { useState, useEffect } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { createPortal } from 'react-dom';
import { CalendarEventDialog } from '../dialogs/CalendarEventDialog';

export const CalendarView = () => {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Store State
  const selectedDate = useDocumentStore(state => state.calendarSelectedDate);
  const setCalendarSelectedDate = useDocumentStore(state => state.setCalendarSelectedDate);
  const addCalendarEvent = useDocumentStore(state => state.addCalendarEvent);

  // Local state for dragging (transient)
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Dialog State
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [dialogDates, setDialogDates] = useState<{ start: Date, end: Date } | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, date: Date } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const firstDayWeekday = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  // Previous Month Info
  const lastDayOfPrevMonth = new Date(year, month, 0).getDate();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleSelectDate = (date: Date) => {
    if (!isDragging) {
      setCalendarSelectedDate(date);
      setDragStart(null);
      setDragEnd(null);
      setContextMenu(null);
    }
  };

  const handleMouseDown = (date: Date) => {
    setIsDragging(true);
    setDragStart(date);
    setDragEnd(date);
    // don't clear selected date from store yet, maybe?
    // setSelectedDate(null); 
    setContextMenu(null);
  };

  const handleMouseEnter = (date: Date) => {
    if (isDragging) {
      setDragEnd(date);
    }
  };

  const handleMouseUp = () => {
    if (isDragging && dragStart && dragEnd) {
      setIsDragging(false);
      // Determine start and end correctly (drag could be backwards)
      const start = dragStart < dragEnd ? dragStart : dragEnd;
      const end = dragStart < dragEnd ? dragEnd : dragStart;

      setDialogDates({ start, end });
      setShowEventDialog(true);
    } else {
      setIsDragging(false);
    }
  };

  // Global mouse up to catch drag end outside cells
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        if (dragStart && dragEnd) {
          const start = dragStart < dragEnd ? dragStart : dragEnd;
          const end = dragStart < dragEnd ? dragEnd : dragStart;
          setDialogDates({ start, end });
          setShowEventDialog(true);
        }
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, dragStart, dragEnd]);


  const handleContextMenu = (e: React.MouseEvent, date: Date) => {
    e.preventDefault();
    // Don't clear drag selection on context menu if it covers this date? 
    // For simplicity, reset drag
    setDragStart(null);
    setDragEnd(null);
    setCalendarSelectedDate(date);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      date: date
    });
  };

  const handleSaveEvent = (eventData: { title: string; startDate: Date; endDate: Date; description: string }) => {
    console.log("Saving Event:", eventData);
    addCalendarEvent({
      ...eventData,
      startDate: eventData.startDate.toISOString(),
      endDate: eventData.endDate.toISOString()
    });
    setShowEventDialog(false);
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

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

  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  // Create full calendar grid (42 days: 6 weeks)
  const calendarDays: Date[] = [];

  // Previous month filling
  for (let i = firstDayWeekday - 1; i >= 0; i--) {
    calendarDays.push(new Date(year, month, -i)); // Date handles negative/0 automatically
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

  // Sample events
  // Note: Events need to check full date now
  const events = [
    { date: new Date(year, month, 6), title: '프로젝트 미팅', color: 'bg-blue-500' },
    { date: new Date(year, month, 12), title: '마감일', color: 'bg-red-500' },
    { date: new Date(year, month, 18), title: '리뷰', color: 'bg-green-500' },
    { date: new Date(year, month, 25), title: '발표', color: 'bg-purple-500' },
  ];

  const getEventsForDay = (date: Date) => events.filter(e =>
    e.date.getDate() === date.getDate() &&
    e.date.getMonth() === date.getMonth() &&
    e.date.getFullYear() === date.getFullYear()
  );

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white p-4 overflow-y-auto w-full">
      <div className="max-w-5xl mx-auto w-full h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-1 py-3 mb-2 shrink-0">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <CalendarIcon className="text-blue-400" />
            캘린더
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm"
            >
              오늘
            </button>
          </div>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-center gap-6 py-4 shrink-0">
          <button
            onClick={prevMonth}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <span className="text-2xl font-semibold min-w-[160px] text-center">{year}년 {monthNames[month]}</span>
          <button
            onClick={nextMonth}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <ChevronRight size={24} />
          </button>
        </div>

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
        <div className="flex-1 grid grid-cols-7 grid-rows-6 gap-px bg-zinc-800 border border-zinc-800 rounded-lg overflow-hidden min-h-[500px]">
          {calendarDays.map((date, index) => {
            const isCurrent = isCurrentMonth(date);
            const isDayToday = isToday(date);
            const isDaySelected = isSelected(date);
            const dayEvents = getEventsForDay(date);

            return (
              <div
                key={index}
                className={`bg-zinc-950 relative group flex flex-col transition-colors
                    ${!isCurrent ? 'bg-zinc-950/50' : 'bg-zinc-950'}
                    ${isDaySelected ? 'bg-zinc-900 ring-1 ring-inset ring-blue-500 z-10' : 'hover:bg-zinc-900'}
                 `}
                onContextMenu={(e) => handleContextMenu(e, date)}
                onMouseDown={() => handleMouseDown(date)}
                onMouseEnter={() => handleMouseEnter(date)}
              // onClick is handled by mouse down/up flow mostly, but we can keep it for simple click if not drag
              // But dragging logic might conflict with simple click. 
              // Let's rely on MouseDown/Up for selection. 
              // If it was a simple click (start === end), it opens dialog too?
              // Request says "drag to create", likely click should just select.
              // But existing logic was click to select.
              // If start === end on MouseUp, maybe just select?
              // Let's refine handleMouseUp.
              >
                <div className="p-2 flex-1 flex flex-col">
                  <span
                    className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1
                        ${isDayToday
                        ? 'bg-blue-600 text-white font-bold'
                        : !isCurrent
                          ? 'text-zinc-600'
                          : 'text-zinc-300'
                      }
                      `}
                  >
                    {date.getDate()}
                  </span>

                  {/* Event List */}
                  <div className="flex flex-col gap-1 mt-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                    {dayEvents.map((event, i) => (
                      <div key={i} className={`text-xs px-1.5 py-0.5 rounded truncate ${event.color} text-white shadow-sm`}>
                        {event.title}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
              setDialogDates({ start: contextMenu.date, end: contextMenu.date });
              setShowEventDialog(true);
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

      {/* Event Dialog */}
      <CalendarEventDialog
        isOpen={showEventDialog}
        onClose={() => setShowEventDialog(false)}
        startDate={dialogDates?.start || null}
        endDate={dialogDates?.end || null}
        onSave={handleSaveEvent}
      />
    </div>
  );
};
