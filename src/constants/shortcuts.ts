export type ShortcutCategory = 'tools' | 'canvas' | 'history' | 'sidebar' | 'export' | 'general';

export interface ShortcutDefinition {
  id: string;
  title: string;
  description: string;
  category: ShortcutCategory;
  keys: string[]; // Generic keys
  macKeys: string[]; // Mac formatted keys
  winKeys: string[]; // Windows / Linux formatted keys
  keywords?: string[]; // Extra search terms
}

export interface CategoryMeta {
  id: ShortcutCategory;
  name: string;
  description: string;
  iconName: string;
}

export const SHORTCUT_CATEGORIES: CategoryMeta[] = [
  { id: 'tools', name: 'Annotation Tools', description: 'Switch active vector tools and panning modes', iconName: 'MousePointer2' },
  { id: 'canvas', name: 'Canvas & Viewport', description: 'Zoom, pan, and viewport framing controls', iconName: 'Maximize2' },
  { id: 'history', name: 'History & Edit', description: 'Undo, redo, selection, and deletion actions', iconName: 'Undo2' },
  { id: 'sidebar', name: 'Sidebar & Notes', description: 'Notes editing, markdown formatting, and reordering', iconName: 'FileText' },
  { id: 'export', name: 'Export & Ingestion', description: 'Clipboard ingestion and high-fidelity exports', iconName: 'Download' },
];

export const CATEGORIZED_SHORTCUTS: ShortcutDefinition[] = [
  // --- Tools ---
  {
    id: 'tool-select',
    title: 'Select & Transform',
    description: 'Select, move, resize, and edit annotations on canvas',
    category: 'tools',
    keys: ['V'],
    macKeys: ['V'],
    winKeys: ['V'],
    keywords: ['pointer', 'cursor', 'drag', 'resize'],
  },
  {
    id: 'tool-box',
    title: 'Bounding Box',
    description: 'Draw rectangular bounding box with stroke & fill',
    category: 'tools',
    keys: ['B', 'or', 'R'],
    macKeys: ['B', 'or', 'R'],
    winKeys: ['B', 'or', 'R'],
    keywords: ['rectangle', 'square', 'highlight'],
  },
  {
    id: 'tool-ellipse',
    title: 'Ellipse / Circle',
    description: 'Draw circular or oval vector annotation',
    category: 'tools',
    keys: ['C', 'or', 'O'],
    macKeys: ['C', 'or', 'O'],
    winKeys: ['C', 'or', 'O'],
    keywords: ['circle', 'oval', 'round'],
  },
  {
    id: 'tool-arrow',
    title: 'Directional Arrow',
    description: 'Draw vector pointer arrow with 30° wings',
    category: 'tools',
    keys: ['A'],
    macKeys: ['A'],
    winKeys: ['A'],
    keywords: ['pointer', 'line', 'direction'],
  },
  {
    id: 'tool-pin',
    title: 'Numbered Callout Pin',
    description: 'Place auto-incrementing sequential pinpoint badge',
    category: 'tools',
    keys: ['P'],
    macKeys: ['P'],
    winKeys: ['P'],
    keywords: ['badge', 'marker', 'callout', 'point'],
  },
  {
    id: 'tool-pan',
    title: 'Pan Tool',
    description: 'Activate viewport panning tool',
    category: 'tools',
    keys: ['H'],
    macKeys: ['H'],
    winKeys: ['H'],
    keywords: ['hand', 'drag', 'move', 'canvas'],
  },
  {
    id: 'tool-pan-space',
    title: 'Quick Pan (Hold Space)',
    description: 'Hold spacebar and drag anywhere on canvas to pan',
    category: 'tools',
    keys: ['Space', '+', 'Drag'],
    macKeys: ['Space', '+', 'Drag'],
    winKeys: ['Space', '+', 'Drag'],
    keywords: ['spacebar', 'drag', 'pan', 'move'],
  },

  // --- Canvas & Viewport ---
  {
    id: 'canvas-zoom-in',
    title: 'Zoom In',
    description: 'Enlarge canvas view centered on viewport',
    category: 'canvas',
    keys: ['+'],
    macKeys: ['+'],
    winKeys: ['+'],
    keywords: ['plus', 'magnify', 'scale'],
  },
  {
    id: 'canvas-zoom-out',
    title: 'Zoom Out',
    description: 'Reduce canvas view scale',
    category: 'canvas',
    keys: ['-'],
    macKeys: ['-'],
    winKeys: ['-'],
    keywords: ['minus', 'shrink'],
  },
  {
    id: 'canvas-zoom-wheel',
    title: 'Mouse Wheel / Pinch Zoom',
    description: 'Smooth focal-point zoom centered at cursor position',
    category: 'canvas',
    keys: ['Scroll', 'or', 'Pinch'],
    macKeys: ['Scroll', 'or', 'Pinch'],
    winKeys: ['Scroll', 'or', 'Pinch'],
    keywords: ['wheel', 'trackpad', 'gesture', 'focal'],
  },
  {
    id: 'canvas-fit-screen',
    title: 'Fit to Screen',
    description: 'Fit screenshot to viewport with comfortable padding',
    category: 'canvas',
    keys: ['0'],
    macKeys: ['0'],
    winKeys: ['0'],
    keywords: ['zero', 'fit', 'reset', 'frame'],
  },
  {
    id: 'canvas-actual-size',
    title: 'Actual Size (100% / 1:1)',
    description: 'Reset zoom to native 1:1 unscaled pixel resolution',
    category: 'canvas',
    keys: ['1'],
    macKeys: ['1'],
    winKeys: ['1'],
    keywords: ['one', '100%', 'native', 'actual'],
  },
  {
    id: 'canvas-pan-middle',
    title: 'Middle Click Pan',
    description: 'Press middle mouse button and drag to pan',
    category: 'canvas',
    keys: ['Middle Click', '+', 'Drag'],
    macKeys: ['Middle Click', '+', 'Drag'],
    winKeys: ['Middle Click', '+', 'Drag'],
    keywords: ['middle', 'mouse', 'pan'],
  },

  // --- History & Edit ---
  {
    id: 'history-undo',
    title: 'Undo',
    description: 'Revert last annotation stroke or transformation',
    category: 'history',
    keys: ['Cmd/Ctrl', '+', 'Z'],
    macKeys: ['⌘', 'Z'],
    winKeys: ['Ctrl', '+', 'Z'],
    keywords: ['revert', 'back', 'step'],
  },
  {
    id: 'history-redo',
    title: 'Redo',
    description: 'Replay previously undone action',
    category: 'history',
    keys: ['Cmd/Ctrl', '+', 'Shift', '+', 'Z'],
    macKeys: ['⌘', '⇧', 'Z'],
    winKeys: ['Ctrl', '+', 'Y'],
    keywords: ['forward', 'replay'],
  },
  {
    id: 'edit-delete',
    title: 'Delete Selected',
    description: 'Delete selected annotation and re-index badges (1..N)',
    category: 'history',
    keys: ['Backspace', 'or', 'Delete'],
    macKeys: ['⌫', 'or', 'Delete'],
    winKeys: ['Backspace', 'or', 'Del'],
    keywords: ['remove', 'trash', 'clear'],
  },
  {
    id: 'edit-deselect',
    title: 'Deselect / Cancel',
    description: 'Clear active selection or cancel in-progress drawing',
    category: 'history',
    keys: ['Escape'],
    macKeys: ['Esc'],
    winKeys: ['Esc'],
    keywords: ['cancel', 'blur', 'clear'],
  },

  // --- Sidebar & Notes ---
  {
    id: 'note-bold',
    title: 'Bold Markdown',
    description: 'Format selected text with bold (**text**)',
    category: 'sidebar',
    keys: ['Cmd/Ctrl', '+', 'B'],
    macKeys: ['⌘', 'B'],
    winKeys: ['Ctrl', '+', 'B'],
    keywords: ['strong', 'markdown', 'format'],
  },
  {
    id: 'note-italic',
    title: 'Italic Markdown',
    description: 'Format selected text with italics (*text*)',
    category: 'sidebar',
    keys: ['Cmd/Ctrl', '+', 'I'],
    macKeys: ['⌘', 'I'],
    winKeys: ['Ctrl', '+', 'I'],
    keywords: ['emphasis', 'markdown', 'format'],
  },
  {
    id: 'note-indent',
    title: 'Indent / Outdent',
    description: 'Insert 2-space indentation or unindent in note editor',
    category: 'sidebar',
    keys: ['Tab', 'or', 'Shift+Tab'],
    macKeys: ['Tab', 'or', '⇧Tab'],
    winKeys: ['Tab', 'or', 'Shift+Tab'],
    keywords: ['spaces', 'tab', 'indent'],
  },
  {
    id: 'note-commit',
    title: 'Commit Note',
    description: 'Save and blur markdown note editor',
    category: 'sidebar',
    keys: ['Cmd/Ctrl', '+', 'Enter'],
    macKeys: ['⌘', '↵'],
    winKeys: ['Ctrl', '+', 'Enter'],
    keywords: ['save', 'submit', 'done'],
  },
  {
    id: 'sidebar-reorder',
    title: 'Reorder Annotations',
    description: 'Move cards up/down in sidebar to re-index all badges 1..N',
    category: 'sidebar',
    keys: ['Alt', '+', '↑/↓'],
    macKeys: ['⌥', '↑/↓'],
    winKeys: ['Alt', '+', '↑/↓'],
    keywords: ['reorder', 'index', 'move', 'sort'],
  },

  // --- Export & Ingestion ---
  {
    id: 'export-copy-image',
    title: 'Copy Composite Image',
    description: 'Render 1:1 pixel-perfect PNG and copy to clipboard',
    category: 'export',
    keys: ['Cmd/Ctrl', '+', 'C'],
    macKeys: ['⌘', 'C'],
    winKeys: ['Ctrl', '+', 'C'],
    keywords: ['image', 'png', 'clipboard', 'share'],
  },
  {
    id: 'export-copy-notes',
    title: 'Copy Markdown Notes',
    description: 'Serialize numbered annotations list as markdown to clipboard',
    category: 'export',
    keys: ['Cmd/Ctrl', '+', 'Shift', '+', 'C'],
    macKeys: ['⌘', '⇧', 'C'],
    winKeys: ['Ctrl', '+', 'Shift', '+', 'C'],
    keywords: ['notes', 'markdown', 'copy', 'text'],
  },
  {
    id: 'ingest-paste',
    title: 'Paste Image from Clipboard',
    description: 'Ingest screenshot directly from system clipboard',
    category: 'export',
    keys: ['Cmd/Ctrl', '+', 'V'],
    macKeys: ['⌘', 'V'],
    winKeys: ['Ctrl', '+', 'V'],
    keywords: ['paste', 'image', 'screenshot', 'upload'],
  },
  {
    id: 'ingest-drop',
    title: 'Drag & Drop File',
    description: 'Drop PNG, JPEG, or WebP file onto canvas',
    category: 'export',
    keys: ['Drag & Drop'],
    macKeys: ['Drag & Drop'],
    winKeys: ['Drag & Drop'],
    keywords: ['drop', 'upload', 'file'],
  },

  // --- General ---
  {
    id: 'general-shortcuts',
    title: 'Keyboard Shortcuts Cheat-Sheet',
    description: 'Open this interactive shortcuts reference guide',
    category: 'general',
    keys: ['?'],
    macKeys: ['?'],
    winKeys: ['?'],
    keywords: ['help', 'guide', 'cheat-sheet', 'modal'],
  },
  {
    id: 'general-close',
    title: 'Close Modal / Dialog',
    description: 'Dismiss any open modal dialog or overlay',
    category: 'general',
    keys: ['Escape'],
    macKeys: ['Esc'],
    winKeys: ['Esc'],
    keywords: ['close', 'dismiss', 'exit'],
  },
];

// Backwards compatibility export
export interface KeyboardShortcut {
  key: string;
  label: string;
  description: string;
  category: 'tools' | 'actions' | 'navigation';
}

export const SHORTCUTS: KeyboardShortcut[] = [
  { key: 'V', label: 'V', description: 'Select / Move tool', category: 'tools' },
  { key: 'H', label: 'H', description: 'Pan tool (or hold Space)', category: 'tools' },
  { key: 'R', label: 'R', description: 'Rectangle / Box tool', category: 'tools' },
  { key: 'O', label: 'O', description: 'Circle / Ellipse tool', category: 'tools' },
  { key: 'A', label: 'A', description: 'Arrow pointer tool', category: 'tools' },
  { key: 'P', label: 'P', description: 'Numbered callout pin tool', category: 'tools' },
  { key: 'Cmd+V / Ctrl+V', label: '⌘V', description: 'Paste screenshot from clipboard', category: 'actions' },
  { key: 'Cmd+C / Ctrl+C', label: '⌘C', description: 'Copy composite annotated image to clipboard', category: 'actions' },
  { key: 'Cmd+Shift+C', label: '⌘⇧C', description: 'Copy structured markdown notes', category: 'actions' },
  { key: 'Cmd+Z / Ctrl+Z', label: '⌘Z', description: 'Undo last action', category: 'actions' },
  { key: 'Cmd+Shift+Z / Ctrl+Y', label: '⌘⇧Z', description: 'Redo last undone action', category: 'actions' },
  { key: 'Backspace / Delete', label: '⌫', description: 'Delete selected annotation', category: 'actions' },
  { key: 'Escape', label: 'Esc', description: 'Deselect annotation / Cancel drawing', category: 'actions' },
  { key: '0', label: '0', description: 'Fit image to viewport', category: 'navigation' },
  { key: '1', label: '1', description: 'Reset zoom to 100% (1:1)', category: 'navigation' },
  { key: '+', label: '+', description: 'Zoom in', category: 'navigation' },
  { key: '-', label: '-', description: 'Zoom out', category: 'navigation' },
  { key: '?', label: '?', description: 'Open keyboard shortcuts cheat-sheet', category: 'navigation' },
];
