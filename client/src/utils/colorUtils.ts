export const getEventColorHex = (colorString?: string): string => {
  if (!colorString) return '#3b82f6'; // Default blue
  if (colorString.startsWith('bg-[#') && colorString.endsWith(']')) {
    return colorString.replace('bg-[', '').replace(']', '');
  }
  // Handle tailwind class maps if necessary, but current system seems to rely on bg-[#hex]
  // Fallback map for basic tailwind colors if they are ever used without JIT values
  const colorMap: Record<string, string> = {
    'bg-blue-500': '#3b82f6',
    'bg-red-500': '#ef4444',
    'bg-green-500': '#22c55e',
    'bg-yellow-500': '#eab308',
    'bg-purple-500': '#a855f7',
    'bg-pink-500': '#ec4899',
    'bg-indigo-500': '#6366f1',
    'bg-gray-500': '#6b7280',
    'bg-zinc-500': '#71717a',
  };
  return colorMap[colorString] || '#3b82f6';
};

export const getDarkVariant = (hex: string, opacity: number = 0.2): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  // Mix with a dark background (e.g. Zinc-900 #18181b = 24, 24, 27)
  // or just reduce brightness heavily.
  // Strategy: Reduce brightness to 20% of original, or mix with Black.
  // Let's mix with Black to keep it truly dark.

  const R = (num >> 16);
  const G = (num >> 8 & 0x00FF);
  const B = (num & 0x0000FF);

  // Mix: Result = Color * opacity + Black * (1-opacity)
  // Black is 0. So just Color * opacity.

  const newR = Math.round(R * opacity);
  const newG = Math.round(G * opacity);
  const newB = Math.round(B * opacity);

  return '#' + (0x1000000 + (newR < 255 ? newR < 1 ? 0 : newR : 255) * 0x10000 + (newG < 255 ? newG < 1 ? 0 : newG : 255) * 0x100 + (newB < 255 ? newB < 1 ? 0 : newB : 255)).toString(16).slice(1);
};

