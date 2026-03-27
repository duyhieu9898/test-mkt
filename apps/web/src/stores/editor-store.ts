/**
 * Landing Page Editor Store
 *
 * Zustand store for managing visual editor state
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { BlockType, BlockData, BlockContent } from '@1person/workflow/landing-pages/blocks';
import { blockDefinitions, createDefaultBlock } from '@1person/workflow/landing-pages/blocks';

// =============================================================================
// TYPES
// =============================================================================

export interface PageData {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor?: string;
  status: string;
}

export interface EditorBlock {
  id: string;
  type: BlockType;
  content: BlockContent;
  order: number;
  isVisible: boolean;
  backgroundColor?: string;
  customStyles?: Record<string, string>;
}

export interface HistoryEntry {
  blocks: EditorBlock[];
  selectedBlockId: string | null;
  timestamp: number;
}

export interface EditorState {
  // Page data
  page: PageData | null;
  blocks: EditorBlock[];

  // Selection
  selectedBlockId: string | null;
  selectedFieldPath: string[] | null;

  // Editor modes
  isEditing: boolean;
  isPreviewing: boolean;
  previewDevice: 'desktop' | 'tablet' | 'mobile';

  // History (undo/redo)
  history: HistoryEntry[];
  historyIndex: number;
  maxHistoryLength: number;

  // Dirty state
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;

  // Drag state
  isDragging: boolean;
  draggedBlockId: string | null;
}

export interface EditorActions {
  // Initialization
  initialize: (page: PageData, blocks: EditorBlock[]) => void;
  reset: () => void;

  // Block selection
  selectBlock: (blockId: string | null) => void;
  selectField: (blockId: string, fieldPath: string[]) => void;
  clearSelection: () => void;

  // Block CRUD
  addBlock: (type: BlockType, position?: number) => void;
  removeBlock: (blockId: string) => void;
  duplicateBlock: (blockId: string) => void;
  updateBlockContent: (blockId: string, content: Partial<BlockContent>) => void;
  updateBlockVisibility: (blockId: string, isVisible: boolean) => void;
  updateBlockStyles: (blockId: string, styles: { backgroundColor?: string; customStyles?: Record<string, string> }) => void;

  // Block ordering
  moveBlock: (fromIndex: number, toIndex: number) => void;
  moveBlockUp: (blockId: string) => void;
  moveBlockDown: (blockId: string) => void;

  // Page settings
  updatePageSettings: (settings: Partial<PageData>) => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Editor modes
  setEditing: (isEditing: boolean) => void;
  setPreviewing: (isPreviewing: boolean) => void;
  setPreviewDevice: (device: 'desktop' | 'tablet' | 'mobile') => void;

  // Drag state
  setDragging: (isDragging: boolean, blockId?: string | null) => void;

  // Save state
  markDirty: () => void;
  markSaved: () => void;
  setSaving: (isSaving: boolean) => void;

  // Helpers
  getBlockById: (blockId: string) => EditorBlock | undefined;
  getBlockIndex: (blockId: string) => number;
  getSortedBlocks: () => EditorBlock[];
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: EditorState = {
  page: null,
  blocks: [],
  selectedBlockId: null,
  selectedFieldPath: null,
  isEditing: true,
  isPreviewing: false,
  previewDevice: 'desktop',
  history: [],
  historyIndex: -1,
  maxHistoryLength: 50,
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  isDragging: false,
  draggedBlockId: null,
};

// =============================================================================
// HELPERS
// =============================================================================

function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createHistoryEntry(blocks: EditorBlock[], selectedBlockId: string | null): HistoryEntry {
  return {
    blocks: JSON.parse(JSON.stringify(blocks)),
    selectedBlockId,
    timestamp: Date.now(),
  };
}

// =============================================================================
// STORE
// =============================================================================

export const useEditorStore = create<EditorState & EditorActions>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...initialState,

        // Initialization
        initialize: (page, blocks) => {
          set((state) => {
            state.page = page;
            state.blocks = blocks;
            state.selectedBlockId = null;
            state.selectedFieldPath = null;
            state.history = [createHistoryEntry(blocks, null)];
            state.historyIndex = 0;
            state.isDirty = false;
            state.lastSavedAt = new Date();
          });
        },

        reset: () => {
          set(initialState);
        },

        // Block selection
        selectBlock: (blockId) => {
          set((state) => {
            state.selectedBlockId = blockId;
            state.selectedFieldPath = null;
          });
        },

        selectField: (blockId, fieldPath) => {
          set((state) => {
            state.selectedBlockId = blockId;
            state.selectedFieldPath = fieldPath;
          });
        },

        clearSelection: () => {
          set((state) => {
            state.selectedBlockId = null;
            state.selectedFieldPath = null;
          });
        },

        // Block CRUD
        addBlock: (type, position) => {
          const id = generateBlockId();
          const { blocks } = get();
          const insertPosition = position ?? blocks.length;
          const defaultBlock = createDefaultBlock(type, insertPosition);

          set((state) => {
            // Update order of blocks after insert position
            state.blocks.forEach((block) => {
              if (block.order >= insertPosition) {
                block.order += 1;
              }
            });

            // Add new block
            state.blocks.push({
              id,
              type,
              content: defaultBlock.content as BlockContent,
              order: insertPosition,
              isVisible: true,
            });

            // Select the new block
            state.selectedBlockId = id;
            state.selectedFieldPath = null;
            state.isDirty = true;

            // Add to history
            const entry = createHistoryEntry(state.blocks, id);
            state.history = state.history.slice(0, state.historyIndex + 1);
            state.history.push(entry);
            if (state.history.length > state.maxHistoryLength) {
              state.history.shift();
            } else {
              state.historyIndex += 1;
            }
          });
        },

        removeBlock: (blockId) => {
          set((state) => {
            const index = state.blocks.findIndex((b) => b.id === blockId);
            if (index === -1) return;

            const removedOrder = state.blocks[index].order;
            state.blocks.splice(index, 1);

            // Update order of remaining blocks
            state.blocks.forEach((block) => {
              if (block.order > removedOrder) {
                block.order -= 1;
              }
            });

            // Clear selection if removed block was selected
            if (state.selectedBlockId === blockId) {
              state.selectedBlockId = null;
              state.selectedFieldPath = null;
            }

            state.isDirty = true;

            // Add to history
            const entry = createHistoryEntry(state.blocks, state.selectedBlockId);
            state.history = state.history.slice(0, state.historyIndex + 1);
            state.history.push(entry);
            if (state.history.length > state.maxHistoryLength) {
              state.history.shift();
            } else {
              state.historyIndex += 1;
            }
          });
        },

        duplicateBlock: (blockId) => {
          const { blocks } = get();
          const block = blocks.find((b) => b.id === blockId);
          if (!block) return;

          const newId = generateBlockId();
          const newOrder = block.order + 1;

          set((state) => {
            // Update order of blocks after duplicate position
            state.blocks.forEach((b) => {
              if (b.order >= newOrder) {
                b.order += 1;
              }
            });

            // Add duplicated block
            state.blocks.push({
              ...JSON.parse(JSON.stringify(block)),
              id: newId,
              order: newOrder,
            });

            state.selectedBlockId = newId;
            state.selectedFieldPath = null;
            state.isDirty = true;

            // Add to history
            const entry = createHistoryEntry(state.blocks, newId);
            state.history = state.history.slice(0, state.historyIndex + 1);
            state.history.push(entry);
            if (state.history.length > state.maxHistoryLength) {
              state.history.shift();
            } else {
              state.historyIndex += 1;
            }
          });
        },

        updateBlockContent: (blockId, content) => {
          set((state) => {
            const block = state.blocks.find((b) => b.id === blockId);
            if (!block) return;

            block.content = { ...block.content, ...content } as BlockContent;
            state.isDirty = true;

            // Add to history (debounced in real usage)
            const entry = createHistoryEntry(state.blocks, state.selectedBlockId);
            state.history = state.history.slice(0, state.historyIndex + 1);
            state.history.push(entry);
            if (state.history.length > state.maxHistoryLength) {
              state.history.shift();
            } else {
              state.historyIndex += 1;
            }
          });
        },

        updateBlockVisibility: (blockId, isVisible) => {
          set((state) => {
            const block = state.blocks.find((b) => b.id === blockId);
            if (block) {
              block.isVisible = isVisible;
              state.isDirty = true;
            }
          });
        },

        updateBlockStyles: (blockId, styles) => {
          set((state) => {
            const block = state.blocks.find((b) => b.id === blockId);
            if (block) {
              if (styles.backgroundColor !== undefined) {
                block.backgroundColor = styles.backgroundColor;
              }
              if (styles.customStyles !== undefined) {
                block.customStyles = styles.customStyles;
              }
              state.isDirty = true;
            }
          });
        },

        // Block ordering
        moveBlock: (fromIndex, toIndex) => {
          set((state) => {
            const sortedBlocks = [...state.blocks].sort((a, b) => a.order - b.order);
            const [movedBlock] = sortedBlocks.splice(fromIndex, 1);
            sortedBlocks.splice(toIndex, 0, movedBlock);

            // Update orders
            sortedBlocks.forEach((block, index) => {
              const stateBlock = state.blocks.find((b) => b.id === block.id);
              if (stateBlock) {
                stateBlock.order = index;
              }
            });

            state.isDirty = true;

            // Add to history
            const entry = createHistoryEntry(state.blocks, state.selectedBlockId);
            state.history = state.history.slice(0, state.historyIndex + 1);
            state.history.push(entry);
            if (state.history.length > state.maxHistoryLength) {
              state.history.shift();
            } else {
              state.historyIndex += 1;
            }
          });
        },

        moveBlockUp: (blockId) => {
          const { blocks, getBlockIndex, moveBlock } = get();
          const index = getBlockIndex(blockId);
          if (index > 0) {
            moveBlock(index, index - 1);
          }
        },

        moveBlockDown: (blockId) => {
          const { blocks, getBlockIndex, moveBlock } = get();
          const index = getBlockIndex(blockId);
          const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);
          if (index < sortedBlocks.length - 1) {
            moveBlock(index, index + 1);
          }
        },

        // Page settings
        updatePageSettings: (settings) => {
          set((state) => {
            if (state.page) {
              Object.assign(state.page, settings);
              state.isDirty = true;
            }
          });
        },

        // History
        undo: () => {
          const { historyIndex, history } = get();
          if (historyIndex > 0) {
            set((state) => {
              state.historyIndex -= 1;
              const entry = history[state.historyIndex];
              state.blocks = JSON.parse(JSON.stringify(entry.blocks));
              state.selectedBlockId = entry.selectedBlockId;
              state.selectedFieldPath = null;
              state.isDirty = true;
            });
          }
        },

        redo: () => {
          const { historyIndex, history } = get();
          if (historyIndex < history.length - 1) {
            set((state) => {
              state.historyIndex += 1;
              const entry = history[state.historyIndex];
              state.blocks = JSON.parse(JSON.stringify(entry.blocks));
              state.selectedBlockId = entry.selectedBlockId;
              state.selectedFieldPath = null;
              state.isDirty = true;
            });
          }
        },

        canUndo: () => get().historyIndex > 0,
        canRedo: () => get().historyIndex < get().history.length - 1,

        // Editor modes
        setEditing: (isEditing) => {
          set((state) => {
            state.isEditing = isEditing;
          });
        },

        setPreviewing: (isPreviewing) => {
          set((state) => {
            state.isPreviewing = isPreviewing;
            if (isPreviewing) {
              state.selectedBlockId = null;
              state.selectedFieldPath = null;
            }
          });
        },

        setPreviewDevice: (device) => {
          set((state) => {
            state.previewDevice = device;
          });
        },

        // Drag state
        setDragging: (isDragging, blockId = null) => {
          set((state) => {
            state.isDragging = isDragging;
            state.draggedBlockId = blockId;
          });
        },

        // Save state
        markDirty: () => {
          set((state) => {
            state.isDirty = true;
          });
        },

        markSaved: () => {
          set((state) => {
            state.isDirty = false;
            state.lastSavedAt = new Date();
          });
        },

        setSaving: (isSaving) => {
          set((state) => {
            state.isSaving = isSaving;
          });
        },

        // Helpers
        getBlockById: (blockId) => {
          return get().blocks.find((b) => b.id === blockId);
        },

        getBlockIndex: (blockId) => {
          const sortedBlocks = [...get().blocks].sort((a, b) => a.order - b.order);
          return sortedBlocks.findIndex((b) => b.id === blockId);
        },

        getSortedBlocks: () => {
          return [...get().blocks].sort((a, b) => a.order - b.order);
        },
      }))
    ),
    { name: 'editor-store' }
  )
);

// =============================================================================
// SELECTORS
// =============================================================================

export const selectPage = (state: EditorState) => state.page;
export const selectBlocks = (state: EditorState) => state.blocks;
export const selectSortedBlocks = (state: EditorState) =>
  [...state.blocks].sort((a, b) => a.order - b.order);
export const selectSelectedBlock = (state: EditorState) =>
  state.blocks.find((b) => b.id === state.selectedBlockId);
export const selectSelectedBlockId = (state: EditorState) => state.selectedBlockId;
export const selectIsDirty = (state: EditorState) => state.isDirty;
export const selectIsSaving = (state: EditorState) => state.isSaving;
export const selectIsEditing = (state: EditorState) => state.isEditing;
export const selectIsPreviewing = (state: EditorState) => state.isPreviewing;
export const selectPreviewDevice = (state: EditorState) => state.previewDevice;
