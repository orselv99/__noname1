import { useState, useEffect } from 'react';
import { X, Calendar, Clock, AlignLeft, Palette, Flag, Users } from 'lucide-react';
import { createPortal } from 'react-dom';
import { CalendarDateTimePicker } from './CalendarDateTimePicker';

interface CalendarEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  startDate: Date | null;
  endDate: Date | null;
  onSave: (event: { title: string; startDate: Date; endDate: Date; description: string; color: string; priority: 'High' | 'Medium' | 'Low'; attendees: string }) => void;
}

const COLORS = [
  'bg-[#ed8796]', 'bg-[#ee99a0]', 'bg-[#f5a97f]', 'bg-[#eed49f]',
  'bg-[#a6da95]', 'bg-[#91d7e3]', 'bg-[#7dc4e4]', 'bg-[#8aadf4]'
];

export const CalendarEventDialog = ({ isOpen, onClose, startDate, endDate, onSave }: CalendarEventDialogProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attendees, setAttendees] = useState('');

  // Date 객체 상태 관리 (기존 문자열 상태 대체)
  const [startDateState, setStartDateState] = useState<Date>(new Date());
  const [endDateState, setEndDateState] = useState<Date>(new Date());

  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');

  useEffect(() => {
    if (isOpen && startDate && endDate) {
      setStartDateState(startDate);
      setEndDateState(endDate);
      setTitle('');
      setDescription('');
      setAttendees('');
      setSelectedColor(COLORS[0]);
      setPriority('Medium');
    }
  }, [isOpen, startDate, endDate]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!title.trim()) return;

    onSave({
      title,
      startDate: startDateState,
      endDate: endDateState,
      description,
      color: selectedColor,
      priority,
      attendees
    });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-10000" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">일정 추가</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 제목 */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">제목</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="일정 제목을 입력하세요"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 시작 날짜 및 시간 선택 섹션 */}
            <div>
              <CalendarDateTimePicker
                label="Start"
                value={startDateState}
                onChange={setStartDateState}
              />
            </div>

            {/* 종료 날짜 및 시간 선택 섹션 */}
            <div>
              <CalendarDateTimePicker
                label="End"
                value={endDateState}
                onChange={setEndDateState}
                minDate={startDateState}
              />
            </div>
          </div>

          {/* 색상 선택기 */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1">
              <Palette size={12} /> 색상
            </label>
            <div className="flex gap-2">
              {COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`w-6 h-6 rounded-full ${color} transition-transform ${selectedColor === color ? 'ring-2 ring-white scale-110' : 'hover:scale-105'}`}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </div>
          </div>

          {/* 중요도 */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1">
              <Flag size={12} /> 중요도
            </label>
            <div className="flex gap-2">
              {(['High', 'Medium', 'Low'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  className={`px-3 py-1 text-xs rounded-full border transition-colors
                            ${priority === p
                      ? (p === 'High' ? 'bg-red-500/20 border-red-500 text-red-400' :
                        p === 'Medium' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' :
                          'bg-blue-500/20 border-blue-500 text-blue-400')
                      : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'
                    }
                        `}
                  onClick={() => setPriority(p)}
                >
                  {p === 'High' ? '높음' : p === 'Medium' ? '중간' : '낮음'}
                </button>
              ))}
            </div>
          </div>

          {/* 참석자 */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1 flex items-center gap-1">
              <Users size={12} /> 참석자
            </label>
            <input
              type="text"
              value={attendees}
              onChange={e => setAttendees(e.target.value)}
              placeholder="참석자를 입력하세요 (예: 홍길동, 김철수)"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* 설명 */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1 flex items-center gap-1">
              <AlignLeft size={12} /> 설명 (선택)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="상세 내용을 입력하세요"
              rows={3}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 px-4 py-3 border-t border-zinc-800">
          <div className="flex-1"></div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-sm"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-900/20"
          >
            저장
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
