
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useContentStore } from '../../stores/contentStore';

interface SmallCalendarProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

export const SmallCalendar = ({ currentDate, onDateChange }: SmallCalendarProps) => {
  const selectedDate = useContentStore(state => state.calendarSelectedDate);
  const setCalendarSelectedDate = useContentStore(state => state.setCalendarSelectedDate);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const firstDayWeekday = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  const prevMonth = () => {
    onDateChange(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    onDateChange(new Date(year, month + 1, 1));
  };

  const calendarDays: Date[] = [];
  for (let i = firstDayWeekday - 1; i >= 0; i--) {
    calendarDays.push(new Date(year, month, -i));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(new Date(year, month, day));
  }
  const remainingDays = 42 - calendarDays.length;
  for (let i = 1; i <= remainingDays; i++) {
    calendarDays.push(new Date(year, month + 1, i));
  }

  return (
    <div className="w-60 shrink-0 p-4 border-r border-zinc-800 flex flex-col h-full bg-zinc-950">
      <div className="flex items-center justify-between mb-4">
        <span className="font-semibold text-sm pl-1">{year}년 {month + 1}월</span>
        <div className="flex">
          <button onClick={prevMonth} className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white">
            <ChevronLeft size={16} />
          </button>
          <button onClick={nextMonth} className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-2 text-center text-xs text-zinc-500">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div key={d} className={i === 0 ? 'text-red-900' : i === 6 ? 'text-blue-900' : ''}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {calendarDays.map((date, idx) => {
          const isCurrent = date.getMonth() === month;
          const isToday = date.getDate() === new Date().getDate() && date.getMonth() === new Date().getMonth() && date.getFullYear() === new Date().getFullYear();
          const isSelected = selectedDate && date.getDate() === selectedDate.getDate() && date.getMonth() === selectedDate.getMonth() && date.getFullYear() === selectedDate.getFullYear();

          return (
            <button
              key={idx}
              onClick={() => {
                setCalendarSelectedDate(date);
                onDateChange(date);
              }}
              className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center text-xs
                    ${!isCurrent ? 'text-zinc-700' : 'text-zinc-300'}
                    ${isToday ? 'bg-blue-600 text-white font-bold' : ''}
                    ${isSelected && !isToday ? 'bg-blue-900/50 text-blue-100 ring-1 ring-blue-500' : ''}
                    ${!isSelected && !isToday && isCurrent ? 'hover:bg-zinc-800' : ''}
                `}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};
