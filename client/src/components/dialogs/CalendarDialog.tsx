import { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDate?: (date: Date) => void;
}

export const CalendarDialog = ({ isOpen, onClose, onSelectDate }: CalendarDialogProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const firstDayWeekday = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleSelectDate = (day: number) => {
    const date = new Date(year, month, day);
    setSelectedDate(date);
    onSelectDate?.(date);
  };

  const isToday = (day: number) => {
    const today = new Date();
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };

  const isSelected = (day: number) => {
    if (!selectedDate) return false;
    return day === selectedDate.getDate() && month === selectedDate.getMonth() && year === selectedDate.getFullYear();
  };

  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  // Create calendar grid
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDayWeekday; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  // Sample events for the month
  const events = [
    { day: 6, title: '프로젝트 미팅', color: 'bg-blue-500' },
    { day: 12, title: '마감일', color: 'bg-red-500' },
    { day: 18, title: '리뷰', color: 'bg-green-500' },
    { day: 25, title: '발표', color: 'bg-purple-500' },
  ];

  const getEventsForDay = (day: number) => events.filter(e => e.day === day);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">캘린더</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={prevMonth}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-white font-medium">{year}년 {monthNames[month]}</span>
          <button
            onClick={nextMonth}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day Names */}
        <div className="grid grid-cols-7 px-4">
          {dayNames.map(day => (
            <div key={day} className="text-center text-xs text-zinc-500 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 px-4 pb-4">
          {calendarDays.map((day, index) => (
            <div key={index} className="aspect-square">
              {day !== null && (
                <button
                  onClick={() => handleSelectDate(day)}
                  className={`w-full h-full flex flex-col items-center justify-start pt-1 rounded-lg transition-colors text-sm relative ${isSelected(day)
                      ? 'bg-blue-600 text-white'
                      : isToday(day)
                        ? 'bg-zinc-800 text-blue-400 ring-1 ring-blue-500'
                        : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                >
                  <span>{day}</span>
                  {/* Event dots */}
                  <div className="flex gap-0.5 mt-0.5">
                    {getEventsForDay(day).map((event, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${event.color}`} />
                    ))}
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Events List */}
        <div className="border-t border-zinc-800 px-4 py-3 max-h-[150px] overflow-y-auto">
          <h3 className="text-xs text-zinc-500 mb-2">이번 달 일정</h3>
          <div className="space-y-2">
            {events.map((event, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${event.color}`} />
                <span className="text-zinc-400">{month + 1}월 {event.day}일</span>
                <span className="text-zinc-300">{event.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-4 py-3 border-t border-zinc-800">
          <button
            onClick={() => setCurrentDate(new Date())}
            className="flex-1 py-2 px-4 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm"
          >
            오늘
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
