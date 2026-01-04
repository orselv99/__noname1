'use client';

interface TitleLabelProps {
  title: string;
  subtitle: string;
}

export default function TitleLabel({ title, subtitle }: TitleLabelProps) {
  return (
    <div>
      <h1 className="text-2xl font-bold bg-linear-to-r from-blue-400 to-purple-400 text-transparent bg-clip-text">
        {title}
      </h1>
      <p className="text-gray-400 text-sm mt-1">
        {subtitle}
      </p>
    </div>
  );
}
