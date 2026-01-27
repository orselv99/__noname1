
import { useState } from 'react';
import { useContentStore } from '../../stores/contentStore';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { CalendarEventDialog } from './CalendarEventDialog';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarWeekView } from './CalendarWeekView';
import { CalendarDayView } from './CalendarDayView';

type ViewType = 'month' | 'week' | 'day';

export const CalendarView = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>('month');

  // Store Actions
  const setCalendarSelectedDate = useContentStore(state => state.setCalendarSelectedDate);
  const setCalendarSelectedEventId = useContentStore(state => state.setCalendarSelectedEventId);
  const addCalendarEvent = useContentStore(state => state.addCalendarEvent);
  const events = useContentStore(state => state.calendarEvents);

  // Dialog State (Global for all views)
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [dialogDates, setDialogDates] = useState<{ start: Date, end: Date } | null>(null);

  // Navigation Logic
  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
      newDate.setDate(1); // Reset to 1st to avoid overflow issues (e.g. Mar 31 -> Feb 28)
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
      newDate.setDate(1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  // Header Title Logic
  const getHeaderTitle = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    if (view === 'month') {
      return `${year}년 ${month}월`;
    } else if (view === 'week') {
      // Show range? "Jan 2024" or "Jan 7 - 13, 2024"
      const start = new Date(currentDate);
      start.setDate(currentDate.getDate() - currentDate.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      const startMonth = start.getMonth() + 1;
      const endMonth = end.getMonth() + 1;

      if (startMonth === endMonth) {
        return `${year}년 ${startMonth}월`;
      } else {
        // Cross month
        if (start.getFullYear() !== end.getFullYear()) {
          return `${start.getFullYear()}년 ${startMonth}월 - ${end.getFullYear()}년 ${endMonth}월`;
        }
        return `${year}년 ${startMonth}월 - ${endMonth}월`;
      }
    } else {
      return `${year}년 ${month}월 ${currentDate.getDate()}일`;
    }
  };

  // Event Handling
  const handleRangeSelect = (start: Date, end: Date) => {
    setDialogDates({ start, end });
    setShowEventDialog(true);
  };

  const handleSelectDate = (date: Date) => {
    setCalendarSelectedDate(date);
    setCalendarSelectedEventId(null);

    // If in Month view, clicking a date *could* switch to Day view if desired?
    // For now just update selection.
    setCurrentDate(date);
  };

  const handleEventClick = (eventId: string) => {
    setCalendarSelectedEventId(eventId);
    // Maybe verify if event date is in view? already should be.
  };

  const handleSaveEvent = (eventData: { title: string; startDate: Date; endDate: Date; description: string; color?: string; priority?: 'High' | 'Medium' | 'Low'; attendees?: string }) => {
    addCalendarEvent({
      ...eventData,
      id: crypto.randomUUID(),
      startDate: eventData.startDate.toISOString(),
      endDate: eventData.endDate.toISOString(),
      color: eventData.color || 'bg-blue-500',
      priority: eventData.priority || 'Medium',
      attendees: eventData.attendees
    });
    setShowEventDialog(false);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white p-4 overflow-hidden w-full">
      <div className="max-w-7xl mx-auto w-full h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-1 py-3 mb-2 shrink-0">
          <div className="flex items-center gap-6">
            <h2 className="text-2xl font-bold flex items-center gap-2 min-w-[200px]">
              <CalendarIcon className="text-blue-400" />
              {getHeaderTitle()}
            </h2>

            <div className="flex items-center gap-2">
              <button onClick={handlePrev} className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                <ChevronLeft size={24} />
              </button>
              <button onClick={handleNext} className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                <ChevronRight size={24} />
              </button>
            </div>
          </div>

          <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${view === 'month' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              월간
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${view === 'week' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              주간
            </button>
            <button
              onClick={() => setView('day')}
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${view === 'day' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              일간
            </button>
          </div>
        </div>

        {/* View Content */}
        <div className="flex-1 overflow-hidden rounded-lg bg-zinc-800/30 border border-zinc-800/50">
          {view === 'month' && (
            <div className="h-full flex flex-col p-4 bg-zinc-800 rounded-lg overflow-hidden">
              <CalendarMonthView
                currentDate={currentDate}
                events={events}
                onSelectDate={handleSelectDate}
                onRangeSelect={handleRangeSelect}
                onEventClick={handleEventClick}
              />
            </div>
          )}
          {view === 'week' && (
            <CalendarWeekView
              currentDate={currentDate}
              events={events}
              onDateChange={setCurrentDate}
              onRangeSelect={handleRangeSelect}
              onEventClick={handleEventClick}
            />
          )}
          {view === 'day' && (
            <CalendarDayView
              currentDate={currentDate}
              events={events}
              onDateChange={setCurrentDate}
              onRangeSelect={handleRangeSelect}
              onEventClick={handleEventClick}
            />
          )}
        </div>
      </div>

      {/* Global Dialog */}
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
