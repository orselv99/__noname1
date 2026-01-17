
interface Heading {
  level: number;
  text: string;
  pos: number;
}

interface EditorTOCProps {
  headings: Heading[];
  scrollToHeading: (pos: number) => void;
}

export const EditorTOC = ({ headings, scrollToHeading }: EditorTOCProps) => {
  if (headings.length === 0) return null;

  return (
    <div className="absolute top-40 right-6 w-40 shrink-0 flex flex-col max-h-[calc(100%-13rem)] z-40 pointer-events-none">
      <div className="flex-1 overflow-y-auto py-4 custom-scrollbar pointer-events-auto">
        {headings.map((heading, idx) => (
          <button
            key={idx}
            onClick={() => scrollToHeading(heading.pos)}
            className={`block w-full text-right pr-3 py-1.5 text-[11px] truncate hover:text-white cursor-pointer transition-colors border-r-2 ${heading.level === 1 ? 'text-zinc-200 font-medium border-red-500' :
              heading.level === 2 ? 'text-zinc-400 border-transparent hover:border-zinc-600' :
                'text-zinc-500 border-transparent hover:border-zinc-700'
              }`}
            title={heading.text}
          >
            {heading.text || '(empty)'}
          </button>
        ))}
      </div>
    </div>
  );
};
