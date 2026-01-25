
import { useContentStore } from '../../stores/contentStore';
import { Calendar, Clock, Plus, ArrowDownAZ, ArrowUpAZ, Flag, Trash2 } from 'lucide-react';
import { useState } from 'react';

export const CalendarPanel = () => {
  const selectedDate = useContentStore(state => state.calendarSelectedDate);
  const selectedEventId = useContentStore(state => state.calendarSelectedEventId);
  const events = useContentStore(state => state.calendarEvents);

  if (!selectedDate) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 p-4 text-center">
        <Calendar size={48} className="mb-4 opacity-20" />
        <p>날짜를 선택하여<br />일정을 확인하세요</p>
      </div>
    );
  }

  const dateEvents = events.filter(e => {
    const start = new Date(e.startDate);
    const end = new Date(e.endDate);

    // Normalize time to compare dates only
    const selectedTime = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime();
    const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();

    return selectedTime >= startTime && selectedTime <= endTime;
  });

  const [sortBy, setSortBy] = useState<'name' | 'priority'>('name');

  const sortedEvents = [...dateEvents].sort((a, b) => {
    if (sortBy === 'priority') {
      const pMap = { High: 3, Medium: 2, Low: 1, undefined: 0 };
      const pA = pMap[a.priority as keyof typeof pMap] || 0;
      const pB = pMap[b.priority as keyof typeof pMap] || 0;
      if (pA !== pB) return pB - pA; // Descending Priority
    }
    return a.title.localeCompare(b.title);
  });

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-200">
          {selectedDate.getFullYear()}년 {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일
        </h3>
        <p className="text-xs text-zinc-500 mt-1">
          {['일', '월', '화', '수', '목', '금', '토'][selectedDate.getDay()]}요일
        </p>
      </div>

      {/* Sort Controls */}
      <div className="px-4 py-2 border-b border-zinc-800 flex justify-end gap-2">
        <button
          onClick={() => setSortBy('name')}
          className={`p-1.5 rounded hover:bg-zinc-800 text-zinc-400 ${sortBy === 'name' ? 'text-white bg-zinc-800' : ''}`}
          title="이름순"
        >
          <ArrowDownAZ size={14} />
        </button>
        <button
          onClick={() => setSortBy('priority')}
          className={`p-1.5 rounded hover:bg-zinc-800 text-zinc-400 ${sortBy === 'priority' ? 'text-white bg-zinc-800' : ''}`}
          title="중요도순"
        >
          <Flag size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {dateEvents.length === 0 ? (
          <div className="text-center text-zinc-500 py-8 text-sm">
            등록된 일정이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedEvents.map((event, idx) => {
              const isSelected = event.id === selectedEventId;
              const colorHex = event.color ? event.color.replace('bg-[', '').replace(']', '') : '#3b82f6'; // Default blue-500 hex approx

              return (
                <div
                  key={event.id || idx}
                  className={`bg-zinc-900 border rounded-lg p-3 transition-all relative group
                    ${isSelected ? 'bg-zinc-800' : 'border-zinc-800 hover:border-zinc-700'}
                  `}
                  style={{
                    borderColor: isSelected ? colorHex : undefined,
                    boxShadow: isSelected ? `0 0 0 1px ${colorHex}` : undefined
                  }}
                  onClick={() => useContentStore.getState().setCalendarSelectedEventId(event.id)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div
                      className="text-xs font-bold"
                      style={{ color: colorHex }}
                    >
                      {event.title}
                    </div>
                    {event.priority && (
                      <div className={`text-[10px] px-1.5 rounded border 
                             ${event.priority === 'High' ? 'text-red-400 border-red-900 bg-red-900/20' :
                          event.priority === 'Medium' ? 'text-yellow-400 border-yellow-900 bg-yellow-900/20' :
                            'text-blue-400 border-blue-900 bg-blue-900/20'}
                         `}>
                        {event.priority === 'High' ? '높음' : event.priority === 'Medium' ? '중간' : '낮음'}
                      </div>
                    )}
                  </div>
                  {event.description && (
                    <div className="text-xs text-zinc-400 mb-2 whitespace-pre-wrap">{event.description}</div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                      <Clock size={10} />
                      <span>{new Date(event.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(event.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {/* Delete Button */}
                    <button
                      className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('이 일정을 삭제하시겠습니까?')) {
                          useContentStore.getState().deleteCalendarEvent(event.id);
                        }
                      }}
                      title="일정 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
