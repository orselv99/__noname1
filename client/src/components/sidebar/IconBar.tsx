import { Search, Calendar, ListTodo, Settings } from 'lucide-react';

interface IconBarProps {
  onSearchClick?: () => void;
  onCalendarClick?: () => void;
  onTodoClick?: () => void;
  onSettingsClick?: () => void;
}

export const IconBar = ({
  onSearchClick,
  onCalendarClick,
  onTodoClick,
  onSettingsClick
}: IconBarProps) => {
  const buttonClass = "w-8 h-8 flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white rounded-md transition-colors";

  return (
    <div className="w-12 border-r border-zinc-800 flex flex-col items-center py-2 shrink-0">
      <button
        className={`${buttonClass} mb-1`}
        title="Search"
        onClick={onSearchClick}
      >
        <Search size={18} />
      </button>
      <button
        className={`${buttonClass} mb-1`}
        title="Calendar"
        onClick={onCalendarClick}
      >
        <Calendar size={18} />
      </button>
      <button
        className={`${buttonClass} mb-1`}
        title="TODO"
        onClick={onTodoClick}
      >
        <ListTodo size={18} />
      </button>
      <div className="flex-1" />
      <button
        className={buttonClass}
        title="Settings"
        onClick={onSettingsClick}
      >
        <Settings size={18} />
      </button>
    </div>
  );
};
