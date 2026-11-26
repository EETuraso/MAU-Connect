'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label="Toggle light and dark theme"
      title="Toggle light and dark theme"
    >
      <Sun className="theme-icon-sun" size={17} />
      <Moon className="theme-icon-moon" size={17} />
    </button>
  );
}
