import React from 'react';
import {
  MousePointer2,
  Square,
  Circle,
  ArrowUpRight,
  MapPin,
  Highlighter,
  EyeOff,
  Hand,
  LucideIcon,
} from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { ToolType } from '../../types';

export interface ToolItem {
  id: ToolType;
  label: string;
  shortcut: string;
  icon: LucideIcon;
  description: string;
}

export const TOOL_ITEMS: ToolItem[] = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2, description: 'Select / Move tool' },
  { id: 'box', label: 'Box', shortcut: 'B', icon: Square, description: 'Rectangle / Box tool' },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'C', icon: Circle, description: 'Circle / Ellipse tool' },
  { id: 'arrow', label: 'Arrow', shortcut: 'A', icon: ArrowUpRight, description: 'Arrow pointer tool' },
  { id: 'pin', label: 'Pin', shortcut: 'P', icon: MapPin, description: 'Numbered callout pin tool' },
  { id: 'highlight', label: 'Highlight', shortcut: 'L', icon: Highlighter, description: 'Spotlight highlight focus tool' },
  { id: 'blur', label: 'Blur / Redact', shortcut: 'B', icon: EyeOff, description: 'Blur / Redact tool' },
  { id: 'pan', label: 'Pan', shortcut: 'H', icon: Hand, description: 'Pan canvas tool (or hold Space)' },
];

export interface MainToolbarProps {
  className?: string;
  activeTool?: ToolType;
  onSelectTool?: (tool: ToolType) => void;
  disabled?: boolean;
}

export const MainToolbar: React.FC<MainToolbarProps> = ({
  className = '',
  activeTool,
  onSelectTool,
  disabled = false,
}) => {
  let appState = null;
  let appDispatch = null;
  try {
    const app = useApp();
    appState = app.state;
    appDispatch = app.dispatch;
  } catch {
    // Rendered outside AppProvider in isolated unit tests
  }

  const currentTool = activeTool ?? appState?.activeTool ?? 'select';

  const handleToolClick = (toolId: ToolType) => {
    if (disabled) return;
    if (onSelectTool) {
      onSelectTool(toolId);
    } else if (appDispatch) {
      appDispatch({ type: 'SET_ACTIVE_TOOL', payload: toolId });
    }
  };

  return (
    <div
      className={`flex items-center gap-1 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 rounded-lg p-1 text-slate-700 dark:text-slate-200 shadow-sm select-none ${className}`}
      role="toolbar"
      aria-label="Annotation tools"
      data-testid="main-toolbar"
    >
      {TOOL_ITEMS.map((tool) => {
        const Icon = tool.icon;
        const isActive = currentTool === tool.id;

        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => handleToolClick(tool.id)}
            disabled={disabled}
            className={`relative flex items-center justify-center p-2 rounded-md transition-all duration-150 active:scale-95 cursor-pointer ${
              isActive
                ? 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/50 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent'
            } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
            title={`${tool.label} (${tool.shortcut})`}
            aria-label={`${tool.label} tool (${tool.shortcut})`}
            aria-pressed={isActive}
            data-testid={`tool-btn-${tool.id}`}
          >
            <Icon className="w-4 h-4" />
            {/* Active Indicator Dot */}
            {isActive && (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500 dark:bg-amber-400" />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default MainToolbar;
