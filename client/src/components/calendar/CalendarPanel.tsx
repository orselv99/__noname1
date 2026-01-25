
import { useDocumentStore } from '../../stores/documentStore';
import { Calendar, Clock, Plus } from 'lucide-react';

export const CalendarPanel = () => {
  const selectedDate = useDocumentStore(state => state.calendarSelectedDate);
  const events = useDocumentStore(state => state.calendarEvents);

  if (!selectedDate) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 p-4 text-center">
        <Calendar size={48} className="mb-4 opacity-20" />
        <p>날짜를 선택하여<br />일정을 확인하세요</p>
      </div>
    );
  }

  const dateEvents = events.filter(e => {
    const d = new Date(e.startDate);
    return d.getDate() === selectedDate.getDate() &&
      d.getMonth() === selectedDate.getMonth() &&
      d.getFullYear() === selectedDate.getFullYear();
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

      <div className="flex-1 overflow-y-auto p-4">
        {dateEvents.length === 0 ? (
          <div className="text-center text-zinc-500 py-8 text-sm">
            등록된 일정이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {dateEvents.map((event, idx) => (
              <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <div className={`text-xs font-bold mb-1 ${event.color || 'text-blue-400'}`}>
                  {event.title}
                </div>
                {event.description && (
                  <div className="text-xs text-zinc-400 mb-2 whitespace-pre-wrap">{event.description}</div>
                )}
                <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <Clock size={10} />
                  <span>{new Date(event.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(event.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-zinc-800">
        <button
          className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-xs flex items-center justify-center gap-2 transition-colors"
          onClick={() => console.log("Open Add Dialog via Store or Event")}
        >
          <Plus size={14} /> 일정 추가
        </button>
      </div>
    </div>
  );
};
