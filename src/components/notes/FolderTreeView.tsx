import { useCallback, useMemo, useState, useEffect, useRef, memo } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { useNotes } from "../../context/NotesContext";
import {
  buildFolderTree,
  countNotesInFolder,
  getVisibleItems,
  type TreeItem,
} from "../../lib/folderTree";
import { FolderNameDialog } from "./FolderNameDialog";
import { ItemConfigDialog } from "./ItemConfigDialog";
import { cleanTitle } from "../../lib/utils";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  AddNoteIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
  NoteIcon,
  PinIcon,
  CopyIcon,
  ArrowUpIcon,
  SettingsIcon,
} from "../icons";
import * as notesService from "../../services/notes";
import { resolveItemColor } from "../../lib/itemColor";
import { onRevealNote } from "../../lib/revealNote";
import type { FolderNode, NoteMetadata, Settings, ItemColorConfig } from "../../types/note";

const STORAGE_KEY = "scratch:collapsedFolders";

const menuItemClass =
  "px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2 rounded-sm";

const menuSeparatorClass = "h-px bg-border my-1";

function loadCollapsedFolders(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsedFolders(folders: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...folders]));
  } catch {
    // Ignore localStorage errors
  }
}

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? "#1a1a1a" : "#ffffff";
}

// Notes get a lighter treatment than folders: an accent bar placed just before the icon
// (so it follows the indentation) and a gradient fading to the theme background
function getNoteColorStyle(hex: string, contentOffset: number): React.CSSProperties {
  const barX = Math.max(contentOffset - 7, 0);
  return {
    backgroundImage: `linear-gradient(${hex}, ${hex}), linear-gradient(to right, ${hex}66 0%, ${hex}1f 55%, ${hex}00 100%)`,
    backgroundSize: `3px 100%, calc(100% - ${barX}px) 100%`,
    backgroundPosition: `${barX}px 0, ${barX}px 0`,
    backgroundRepeat: "no-repeat",
  };
}

// Folders keep a solid look; the vertical fade only covers 30% of the range used by notes
function getFolderColorStyle(hex: string): React.CSSProperties {
  return { backgroundImage: `linear-gradient(to bottom, ${hex}, ${hex}b3)` };
}

// Compact file item for folder tree (VS Code / Obsidian style)
interface FileItemProps {
  note: NoteMetadata;
  depth: number;
  isSelected: boolean;
  isMultiSelected: boolean;
  isPinned: boolean;
  onNoteClick: (id: string, event: React.MouseEvent) => void;
  onPin: (id: string) => Promise<void>;
  onUnpin: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onDelete: (id: string) => void;
  onMove: (id: string) => void;
  onMoveToParent?: (id: string, targetFolder: string) => void;
  focusedItemKey?: string | null;
  itemColor?: string | null;
  itemConfig?: ItemColorConfig | null;
  onConfigure: (path: string, name: string, type: "folder" | "note") => void;
}

const FileItem = memo(function FileItem({
  note,
  depth,
  isSelected,
  isMultiSelected,
  isPinned,
  onNoteClick,
  onPin,
  onUnpin,
  onDuplicate,
  onDelete,
  onMove,
  onMoveToParent,
  focusedItemKey,
  itemColor,
  itemConfig,
  onConfigure,
}: FileItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const handleClick = useCallback(
    (e: React.MouseEvent) => onNoteClick(note.id, e),
    [onNoteClick, note.id],
  );

  // The parent folder for this note (empty string = root)
  const noteParentFolder = useMemo(() => {
    const lastSlash = note.id.lastIndexOf("/");
    return lastSlash > 0 ? note.id.substring(0, lastSlash) : "";
  }, [note.id]);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `note:${note.id}`,
    data: { type: "note", id: note.id },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-note:${note.id}`,
    data: { type: "folder", path: noteParentFolder },
  });

  useEffect(() => {
    if (isSelected) {
      itemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isSelected]);

  const noteColorStyle = useMemo(
    () => (itemColor ? getNoteColorStyle(itemColor, depth * 12 + 8) : null),
    [itemColor, depth],
  );
  const isColored = !!itemColor;

  const handlePin = useCallback(async () => {
    try {
      await (isPinned ? onUnpin(note.id) : onPin(note.id));
    } catch (error) {
      console.error("Failed to pin/unpin note:", error);
    }
  }, [note.id, isPinned, onPin, onUnpin]);

  const handleCopyFilepath = useCallback(async () => {
    try {
      const folder = await notesService.getNotesFolder();
      if (folder) {
        await invoke("copy_to_clipboard", { text: `${folder}/${note.id}.md` });
      }
    } catch (error) {
      console.error("Failed to copy filepath:", error);
    }
  }, [note.id]);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={(el) => {
            setDragRef(el);
            setDropRef(el);
            (itemRef as React.MutableRefObject<HTMLDivElement | null>).current =
              el;
          }}
          {...attributes}
          {...listeners}
          data-note-id={note.id}
          className={`flex items-center gap-1.5 py-1.5 cursor-pointer rounded-md select-none transition-colors ${
            isDragging
              ? "opacity-40"
              : isOver
                ? "bg-accent/10 ring-1 ring-accent"
                : isColored
                  ? isSelected && (!focusedItemKey || focusedItemKey === `note:${note.id}`)
                    ? "ring-2 ring-text/30"
                    : isMultiSelected
                      ? "ring-1 ring-text/20"
                      : "hover:bg-bg-muted"
                  : isSelected &&
                      (!focusedItemKey || focusedItemKey === `note:${note.id}`)
                    ? "bg-bg-muted group-focus/notelist:ring-1 group-focus/notelist:ring-text-muted"
                    : isMultiSelected
                      ? "bg-bg-muted"
                      : "hover:bg-bg-muted"
          }`}
          style={{
            paddingLeft: `${depth * 12 + 8}px`,
            paddingRight: "8px",
            ...noteColorStyle,
          }}
          onClick={handleClick}
          role="button"
          tabIndex={-1}
        >
          {itemConfig?.icon ? (
            <span className="text-sm shrink-0 leading-none">{itemConfig.icon}</span>
          ) : isPinned ? (
            <PinIcon className="w-4 h-4 stroke-[1.6] fill-current shrink-0 text-text-muted" />
          ) : (
            <NoteIcon className="w-4 h-4 stroke-[1.6] shrink-0 opacity-50" />
          )}
          <div className="flex flex-col min-w-0">
            <span className={`text-sm truncate text-text ${itemConfig?.bold ? "font-bold" : ""}`}>
              {cleanTitle(note.title)}
            </span>
            {itemConfig?.description && (
              <span className="text-xs truncate text-text-muted">
                {itemConfig.description}
              </span>
            )}
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-44 bg-bg border border-border rounded-md shadow-lg py-1 z-50">
          <ContextMenu.Item className={menuItemClass} onSelect={handlePin}>
            <PinIcon className="w-4 h-4 stroke-[1.6]" />
            {isPinned ? "Unpin" : "Pin"}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() =>
              void onDuplicate(note.id).catch((err) =>
                toast.error(`Failed to duplicate: ${err?.message || err}`),
              )
            }
          >
            <CopyIcon className="w-4 h-4 stroke-[1.6]" />
            Duplicate
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={handleCopyFilepath}
          >
            <CopyIcon className="w-4 h-4 stroke-[1.6]" />
            Copy Filepath
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => onMove(note.id)}
          >
            <FolderIcon className="w-4 h-4 stroke-[1.6]" />
            Move to...
          </ContextMenu.Item>
          {noteParentFolder && onMoveToParent && (
            <>
              <ContextMenu.Separator className={menuSeparatorClass} />
              <ContextMenu.Item
                className={menuItemClass}
                onSelect={() => {
                  const parentOfParent = noteParentFolder.includes("/")
                    ? noteParentFolder.substring(
                        0,
                        noteParentFolder.lastIndexOf("/"),
                      )
                    : "";
                  void Promise.resolve(
                    onMoveToParent(note.id, parentOfParent),
                  ).catch((err) =>
                    toast.error(`Failed to move: ${err?.message || err}`),
                  );
                }}
              >
                <ArrowUpIcon className="w-4 h-4 stroke-[1.6]" />
                Move to Parent Folder
              </ContextMenu.Item>
            </>
          )}
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() =>
              onConfigure(note.id, cleanTitle(note.title), "note")
            }
          >
            <SettingsIcon className="w-4 h-4 stroke-[1.6]" />
            Configure
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={
              menuItemClass +
              " text-red-500 hover:text-red-500 focus:text-red-500"
            }
            onSelect={() => onDelete(note.id)}
          >
            <TrashIcon className="w-4 h-4 stroke-[1.6]" />
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

interface FolderItemProps {
  folder: FolderNode;
  depth: number;
  collapsedFolders: Set<string>;
  onToggleCollapse: (path: string) => void;
  selectedNoteId: string | null;
  pinnedIds: Set<string>;
  multiSelectedNoteIds: Set<string>;
  onNoteClick: (id: string, event: React.MouseEvent) => void;
  focusedItemKey: string | null;
  onCreateNoteHere: (path: string) => void;
  onNewSubfolder: (parentPath: string) => void;
  onRenameFolder: (path: string, currentName: string) => void;
  onDeleteFolder: (path: string) => void;
  onPinNote: (id: string) => Promise<void>;
  onUnpinNote: (id: string) => Promise<void>;
  onDuplicateNote: (id: string) => Promise<void>;
  onDeleteNote: (id: string) => void;
  onMoveNote: (id: string) => void;
  onMoveNoteToParent: (id: string, targetFolder: string) => void;
  onMoveFolderToParent: (path: string, targetParent: string) => void;
  itemColors: Record<string, ItemColorConfig>;
  onConfigure: (path: string, name: string, type: "folder" | "note") => void;
}

const FolderItemComponent = memo(function FolderItem({
  folder,
  depth,
  collapsedFolders,
  onToggleCollapse,
  selectedNoteId,
  pinnedIds,
  multiSelectedNoteIds,
  onNoteClick,
  focusedItemKey,
  onCreateNoteHere,
  onNewSubfolder,
  onRenameFolder,
  onDeleteFolder,
  onPinNote,
  onUnpinNote,
  onDuplicateNote,
  onDeleteNote,
  onMoveNote,
  onMoveNoteToParent,
  onMoveFolderToParent,
  itemColors,
  onConfigure,
}: FolderItemProps) {
  const isCollapsed = collapsedFolders.has(folder.path);
  const noteCount = countNotesInFolder(folder);
  const isEmpty = noteCount === 0 && folder.children.length === 0;
  const isFocused = focusedItemKey === `folder:${folder.path}`;

  const folderConfig = itemColors[folder.path] ?? null;

  const folderColor = useMemo(
    () => resolveItemColor(itemColors, folder.path),
    [folder.path, itemColors],
  );

  const contrastColor = useMemo(
    () => (folderColor ? getContrastColor(folderColor) : null),
    [folderColor],
  );
  const isColored = !!folderColor;

  const getColorForNote = useCallback(
    (noteId: string) => resolveItemColor(itemColors, noteId),
    [itemColors],
  );

  const handleClick = useCallback(() => {
    onToggleCollapse(folder.path);
  }, [onToggleCollapse, folder.path]);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `folder:${folder.path}`,
    data: { type: "folder", path: folder.path },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-folder:${folder.path}`,
    data: { type: "folder", path: folder.path },
  });

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={setDragRef}
          {...attributes}
          {...listeners}
          className={isDragging ? "opacity-40" : ""}
        >
          <div
            ref={setDropRef}
            className={`flex items-center gap-1.5 py-1.5 cursor-pointer rounded-md select-none transition-colors ${
              isOver
                ? "bg-accent/10 ring-1 ring-accent"
                : isColored
                  ? isFocused
                    ? "ring-1 ring-text/30"
                    : "hover:opacity-80"
                  : isFocused
                    ? "bg-bg-muted/50 ring-1 ring-text-muted/30"
                    : "hover:bg-bg-muted"
            }`}
            style={
              isColored
                ? {
                    marginLeft: `${depth * 12}px`,
                    paddingLeft: "8px",
                    paddingRight: "8px",
                    ...getFolderColorStyle(folderColor!),
                    color: contrastColor!,
                  }
                : {
                    paddingLeft: `${depth * 12 + 8}px`,
                    paddingRight: "8px",
                  }
            }
            onClick={handleClick}
            role="button"
            tabIndex={-1}
          >
            {isCollapsed ? (
              <ChevronRightIcon className={`w-4 h-4 stroke-[1.6] shrink-0 ${isColored ? "opacity-70" : "text-text-muted/60"}`} />
            ) : (
              <ChevronDownIcon className={`w-4 h-4 stroke-[1.6] shrink-0 ${isColored ? "opacity-70" : "text-text-muted/60"}`} />
            )}
            {folderConfig?.icon && (
              <span className="text-sm shrink-0 leading-none">{folderConfig.icon}</span>
            )}
            <div className="flex flex-col min-w-0">
              <span className={`text-sm truncate ${isColored ? "" : "text-text-muted"} ${folderConfig?.bold ? "font-bold" : ""}`}>
                {folder.name}
              </span>
              {folderConfig?.description && (
                <span className={`text-xs truncate ${isColored ? "opacity-70" : "text-text-muted"}`}>
                  {folderConfig.description}
                </span>
              )}
            </div>
          </div>

          {!isCollapsed && (
            <div className="flex flex-col gap-0.5">
              {folder.children.map((child) => (
                <FolderItemComponent
                  key={child.path}
                  folder={child}
                  depth={depth + 1}
                  collapsedFolders={collapsedFolders}
                  onToggleCollapse={onToggleCollapse}
                  selectedNoteId={selectedNoteId}
                  focusedItemKey={focusedItemKey}
                  pinnedIds={pinnedIds}
                  multiSelectedNoteIds={multiSelectedNoteIds}
                  onNoteClick={onNoteClick}
                  onCreateNoteHere={onCreateNoteHere}
                  onNewSubfolder={onNewSubfolder}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onPinNote={onPinNote}
                  onUnpinNote={onUnpinNote}
                  onDuplicateNote={onDuplicateNote}
                  onDeleteNote={onDeleteNote}
                  onMoveNote={onMoveNote}
                  onMoveNoteToParent={onMoveNoteToParent}
                  onMoveFolderToParent={onMoveFolderToParent}
                  itemColors={itemColors}
                  onConfigure={onConfigure}
                />
              ))}
              {folder.notes.map((note) => (
                <FileItem
                  key={note.id}
                  note={note}
                  depth={depth + 1}
                  isSelected={selectedNoteId === note.id}
                  isMultiSelected={multiSelectedNoteIds.has(note.id)}
                  isPinned={pinnedIds.has(note.id)}
                  onNoteClick={onNoteClick}
                  onPin={onPinNote}
                  onUnpin={onUnpinNote}
                  onDuplicate={onDuplicateNote}
                  onDelete={onDeleteNote}
                  onMove={onMoveNote}
                  onMoveToParent={onMoveNoteToParent}
                  focusedItemKey={focusedItemKey}
                  itemColor={getColorForNote(note.id)}
                  itemConfig={itemColors[note.id] ?? null}
                  onConfigure={onConfigure}
                />
              ))}
              {isEmpty && (
                <div
                  className="text-sm text-text-muted/50 py-1 select-none"
                  style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
                >
                  Empty
                </div>
              )}
            </div>
          )}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-44 bg-bg border border-border rounded-md shadow-lg py-1 z-50">
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => onCreateNoteHere(folder.path)}
          >
            <AddNoteIcon className="w-4 h-4 stroke-[1.6]" />
            New Note
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => onNewSubfolder(folder.path)}
          >
            <FolderPlusIcon className="w-4 h-4 stroke-[1.6]" />
            New Subfolder
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => {
              const parts = folder.path.split("/");
              onRenameFolder(folder.path, parts[parts.length - 1]);
            }}
          >
            <PencilIcon className="w-4 h-4 stroke-[1.6]" />
            Rename
          </ContextMenu.Item>
          {folder.path.includes("/") && (
            <>
              <ContextMenu.Separator className={menuSeparatorClass} />
              <ContextMenu.Item
                className={menuItemClass}
                onSelect={() => {
                  const parentOfParent = folder.path.includes("/")
                    ? folder.path.substring(0, folder.path.lastIndexOf("/"))
                    : "";
                  const grandparent = parentOfParent.includes("/")
                    ? parentOfParent.substring(
                        0,
                        parentOfParent.lastIndexOf("/"),
                      )
                    : "";
                  void Promise.resolve(
                    onMoveFolderToParent(folder.path, grandparent),
                  ).catch((err) =>
                    toast.error(`Failed to move: ${err?.message || err}`),
                  );
                }}
              >
                <ArrowUpIcon className="w-4 h-4 stroke-[1.6]" />
                Move to Parent Folder
              </ContextMenu.Item>
            </>
          )}
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() =>
              onConfigure(folder.path, folder.name, "folder")
            }
          >
            <SettingsIcon className="w-4 h-4 stroke-[1.6]" />
            Configure
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={
              menuItemClass +
              " text-red-500 hover:text-red-500 focus:text-red-500"
            }
            onSelect={() => onDeleteFolder(folder.path)}
          >
            <TrashIcon className="w-4 h-4 stroke-[1.6]" />
            Delete Folder
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

interface FolderTreeViewProps {
  pinnedIds: Set<string>;
  settings: Settings | null;
  multiSelectedNoteIds: Set<string>;
  setMultiSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  lastClickedNoteId: string | null;
  setLastClickedNoteId: React.Dispatch<React.SetStateAction<string | null>>;
  onMoveNote: (id: string) => void;
  onSettingsChange: (settings: Settings) => void;
}

export function FolderTreeView({
  pinnedIds,
  settings: _settings,
  multiSelectedNoteIds,
  setMultiSelectedNoteIds,
  lastClickedNoteId,
  setLastClickedNoteId,
  onMoveNote,
  onSettingsChange,
}: FolderTreeViewProps) {
  const {
    notes,
    selectedNoteId,
    selectNote,
    createNoteInFolder,
    createFolder,
    deleteFolder,
    renameFolder,
    pinNote,
    unpinNote,
    duplicateNote,
    deleteNote,
    moveNote,
    moveFolder,
  } = useNotes();

  const [collapsedFolders, setCollapsedFolders] =
    useState<Set<string>>(loadCollapsedFolders);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<string | null>(null);
  const [renameDefaultValue, setRenameDefaultValue] = useState("");
  const [subfolderDialogOpen, setSubfolderDialogOpen] = useState(false);
  const [subfolderParent, setSubfolderParent] = useState("");
  const [noteDeleteDialogOpen, setNoteDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configItemPath, setConfigItemPath] = useState("");
  const [configItemName, setConfigItemName] = useState("");
  const [configItemType, setConfigItemType] = useState<"folder" | "note">("folder");
  const containerRef = useRef<HTMLDivElement>(null);

  const itemColors = useMemo(
    () => _settings?.itemColors ?? {},
    [_settings?.itemColors],
  );

  const handleOpenConfigure = useCallback(
    (path: string, name: string, type: "folder" | "note") => {
      setConfigItemPath(path);
      setConfigItemName(name);
      setConfigItemType(type);
      setConfigDialogOpen(true);
    },
    [],
  );

  const handleSaveItemColor = useCallback(
    (path: string, config: ItemColorConfig | null) => {
      if (!_settings) return;
      const newItemColors = { ...(_settings.itemColors ?? {}) };
      if (config) {
        newItemColors[path] = config;
      } else {
        delete newItemColors[path];
      }
      const newSettings = {
        ..._settings,
        itemColors: Object.keys(newItemColors).length > 0 ? newItemColors : undefined,
      };
      notesService.updateSettings(newSettings).then(() => {
        onSettingsChange(newSettings);
      });
    },
    [_settings, onSettingsChange],
  );

  const handleRenameItem = useCallback(
    async (oldPath: string, newName: string) => {
      if (configItemType === "folder") {
        await renameFolder(oldPath, newName);
      } else {
        const newId = await notesService.renameNote(oldPath, newName);
        if (selectedNoteId === oldPath) {
          selectNote(newId);
        }
      }
    },
    [configItemType, renameFolder, selectedNoteId, selectNote],
  );

  // Load known folders from disk (includes empty folders)
  useEffect(() => {
    notesService
      .listFolders()
      .then(setKnownFolders)
      .catch(() => setKnownFolders([]));
  }, [notes]);

  // Persist collapsed state
  useEffect(() => {
    saveCollapsedFolders(collapsedFolders);
  }, [collapsedFolders]);

  const tree = useMemo(
    () => buildFolderTree(notes, pinnedIds, knownFolders),
    [notes, pinnedIds, knownFolders],
  );

  const handleToggleCollapse = useCallback((path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Expand a folder and all its ancestors
  const expandFolder = useCallback((folderPath: string) => {
    if (!folderPath) return;
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      // Expand this folder and every ancestor
      const parts = folderPath.split("/");
      for (let i = 1; i <= parts.length; i++) {
        next.delete(parts.slice(0, i).join("/"));
      }
      return next;
    });
  }, []);

  // Listen for expand-folder events (from drag-drop in Sidebar, or search navigation)
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (path) expandFolder(path);
    };
    window.addEventListener("expand-folder", handler);
    return () => window.removeEventListener("expand-folder", handler);
  }, [expandFolder]);

  // Expand the folders containing a note that the editor asks to reveal
  useEffect(
    () =>
      onRevealNote((noteId) => {
        const lastSlash = noteId.lastIndexOf("/");
        if (lastSlash > 0) expandFolder(noteId.substring(0, lastSlash));
      }),
    [expandFolder],
  );

  const handleNewSubfolder = useCallback((parentPath: string) => {
    setSubfolderParent(parentPath);
    setSubfolderDialogOpen(true);
  }, []);

  const handleRenameFolder = useCallback(
    (path: string, currentName: string) => {
      setFolderToRename(path);
      setRenameDefaultValue(currentName);
      setRenameDialogOpen(true);
    },
    [],
  );

  const handleDeleteFolder = useCallback((path: string) => {
    setFolderToDelete(path);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (folderToDelete && !isDeleting) {
      setIsDeleting(true);
      try {
        await deleteFolder(folderToDelete);
        setFolderToDelete(null);
        setDeleteDialogOpen(false);
      } catch (error) {
        console.error("Failed to delete folder:", error);
        toast.error("Failed to delete folder");
      } finally {
        setIsDeleting(false);
      }
    }
  }, [folderToDelete, deleteFolder, isDeleting]);

  const openDeleteNoteDialog = useCallback((noteId: string) => {
    setNoteToDelete(noteId);
    setNoteDeleteDialogOpen(true);
  }, []);

  const handleNoteDeleteConfirm = useCallback(async () => {
    if (noteToDelete && !isDeleting) {
      setIsDeleting(true);
      try {
        await deleteNote(noteToDelete);
        setNoteToDelete(null);
        setNoteDeleteDialogOpen(false);
      } catch (error) {
        console.error("Failed to delete note:", error);
        toast.error("Failed to delete note");
      } finally {
        setIsDeleting(false);
      }
    }
  }, [noteToDelete, deleteNote, isDeleting]);

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      if (folderToRename) {
        try {
          await renameFolder(folderToRename, newName);
          setFolderToRename(null);
          setRenameDialogOpen(false);
        } catch (error) {
          console.error("Failed to rename folder:", error);
          toast.error("Failed to rename folder");
        }
      }
    },
    [folderToRename, renameFolder],
  );

  const handleSubfolderConfirm = useCallback(
    async (name: string) => {
      try {
        await createFolder(subfolderParent, name);
        expandFolder(subfolderParent);
        setSubfolderDialogOpen(false);
      } catch (error) {
        console.error("Failed to create subfolder:", error);
        toast.error("Failed to create subfolder");
      }
    },
    [subfolderParent, createFolder, expandFolder],
  );

  // Flat list of visible items for keyboard navigation
  const visibleItems = useMemo(
    () => getVisibleItems(tree, pinnedIds, collapsedFolders),
    [tree, pinnedIds, collapsedFolders],
  );

  // Visible note IDs in order (for Shift+Click range computation)
  const visibleNoteIds = useMemo(
    () =>
      visibleItems
        .filter(
          (item): item is { type: "note"; id: string } => item.type === "note",
        )
        .map((item) => item.id),
    [visibleItems],
  );

  const handleNoteClick = useCallback(
    (noteId: string, event: React.MouseEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;
      const isShift = event.shiftKey;

      if (isShift) {
        // Range select from anchor to target
        const anchor = lastClickedNoteId ?? selectedNoteId;
        if (anchor) {
          let anchorIdx = visibleNoteIds.indexOf(anchor);
          // Fallback to selectedNoteId if anchor is no longer visible
          if (anchorIdx === -1 && selectedNoteId) {
            anchorIdx = visibleNoteIds.indexOf(selectedNoteId);
          }
          const targetIdx = visibleNoteIds.indexOf(noteId);
          if (anchorIdx !== -1 && targetIdx !== -1) {
            const start = Math.min(anchorIdx, targetIdx);
            const end = Math.max(anchorIdx, targetIdx);
            const range = new Set(visibleNoteIds.slice(start, end + 1));
            // Ensure the active note is part of the selection
            if (selectedNoteId) range.add(selectedNoteId);
            setMultiSelectedNoteIds(range);
          }
        }
        // Don't change editor note on Shift+Click
      } else if (isMeta) {
        // Toggle individual note in selection
        setMultiSelectedNoteIds((prev) => {
          const next = new Set(prev);
          // Ensure the active note joins the selection
          if (selectedNoteId && !next.has(selectedNoteId)) {
            next.add(selectedNoteId);
          }
          if (next.has(noteId)) {
            next.delete(noteId);
          } else {
            next.add(noteId);
          }
          return next;
        });
        setLastClickedNoteId(noteId);
        // Don't change editor note on Cmd+Click
      } else {
        // Plain click: reset selection, open in editor
        setMultiSelectedNoteIds(new Set([noteId]));
        setLastClickedNoteId(noteId);
        selectNote(noteId);
      }
    },
    [
      lastClickedNoteId,
      visibleNoteIds,
      selectedNoteId,
      setMultiSelectedNoteIds,
      setLastClickedNoteId,
      selectNote,
    ],
  );

  // Track which item is focused for keyboard nav (separate from note selection)
  const [focusedItemKey, setFocusedItemKey] = useState<string | null>(null);

  // Sync focused item when note selection changes
  useEffect(() => {
    if (selectedNoteId) {
      setFocusedItemKey(`note:${selectedNoteId}`);
    }
  }, [selectedNoteId]);

  const itemKey = (item: TreeItem) =>
    item.type === "note" ? `note:${item.id}` : `folder:${item.path}`;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (
        e.key !== "ArrowDown" &&
        e.key !== "ArrowUp" &&
        e.key !== "Enter" &&
        e.key !== "Escape"
      ) {
        return;
      }

      if (e.key === "Escape") {
        if (multiSelectedNoteIds.size > 1) {
          // First Escape: clear multi-selection and reset range anchor
          setMultiSelectedNoteIds(new Set());
          setLastClickedNoteId(null);
        } else {
          // Second Escape: blur and let App.tsx handle
          containerRef.current?.blur();
        }
        return;
      }

      if (visibleItems.length === 0) return;
      e.preventDefault();
      e.stopPropagation();

      const currentIndex = visibleItems.findIndex(
        (item) => itemKey(item) === focusedItemKey,
      );

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        let newIndex: number;
        if (e.key === "ArrowDown") {
          newIndex =
            currentIndex < visibleItems.length - 1 ? currentIndex + 1 : 0;
        } else {
          newIndex =
            currentIndex > 0 ? currentIndex - 1 : visibleItems.length - 1;
        }
        const item = visibleItems[newIndex];
        setFocusedItemKey(itemKey(item));
        if (item.type === "note") {
          selectNote(item.id);
        }
      } else if (e.key === "Enter") {
        if (currentIndex < 0) return;
        const item = visibleItems[currentIndex];
        if (item.type === "folder") {
          handleToggleCollapse(item.path);
        } else {
          // Focus the editor
          const editor = document.querySelector(".ProseMirror") as HTMLElement;
          if (editor) editor.focus();
        }
      }
    },
    [
      visibleItems,
      focusedItemKey,
      selectNote,
      handleToggleCollapse,
      multiSelectedNoteIds,
      setMultiSelectedNoteIds,
      setLastClickedNoteId,
    ],
  );

  // Listen for focus requests
  useEffect(() => {
    const handleFocus = () => {
      containerRef.current?.focus();
      // If nothing focused yet, focus the selected note or first item
      if (!focusedItemKey && visibleItems.length > 0) {
        const selected = visibleItems.find(
          (item) => item.type === "note" && item.id === selectedNoteId,
        );
        setFocusedItemKey(
          selected ? itemKey(selected) : itemKey(visibleItems[0]),
        );
      }
    };
    window.addEventListener("focus-note-list", handleFocus);
    return () => window.removeEventListener("focus-note-list", handleFocus);
  }, [focusedItemKey, visibleItems, selectedNoteId]);

  // Separate pinned and unpinned root notes
  const pinnedRootNotes = useMemo(
    () => tree.rootNotes.filter((n) => pinnedIds.has(n.id)),
    [tree.rootNotes, pinnedIds],
  );
  const unpinnedRootNotes = useMemo(
    () => tree.rootNotes.filter((n) => !pinnedIds.has(n.id)),
    [tree.rootNotes, pinnedIds],
  );

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
        data-note-list
        data-folder-tree
        className="group/notelist flex flex-col gap-0.5 p-1.5 outline-none"
        onKeyDown={handleKeyDown}
      >
        {/* Pinned root notes */}
        {pinnedRootNotes.map((note) => (
          <FileItem
            key={note.id}
            note={note}
            depth={0}
            isSelected={selectedNoteId === note.id}
            isMultiSelected={multiSelectedNoteIds.has(note.id)}
            isPinned={true}
            onNoteClick={handleNoteClick}
            onPin={pinNote}
            onUnpin={unpinNote}
            onDuplicate={duplicateNote}
            onDelete={openDeleteNoteDialog}
            onMove={onMoveNote}
            focusedItemKey={focusedItemKey}
            itemColor={itemColors[note.id]?.color ?? null}
            itemConfig={itemColors[note.id] ?? null}
            onConfigure={handleOpenConfigure}
          />
        ))}

        {/* Folders */}
        {tree.folders.map((folder) => (
          <FolderItemComponent
            key={folder.path}
            folder={folder}
            depth={0}
            collapsedFolders={collapsedFolders}
            onToggleCollapse={handleToggleCollapse}
            selectedNoteId={selectedNoteId}
            focusedItemKey={focusedItemKey}
            pinnedIds={pinnedIds}
            multiSelectedNoteIds={multiSelectedNoteIds}
            onNoteClick={handleNoteClick}
            onCreateNoteHere={createNoteInFolder}
            onNewSubfolder={handleNewSubfolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onPinNote={pinNote}
            onUnpinNote={unpinNote}
            onDuplicateNote={duplicateNote}
            onDeleteNote={openDeleteNoteDialog}
            onMoveNote={onMoveNote}
            onMoveNoteToParent={moveNote}
            onMoveFolderToParent={moveFolder}
            itemColors={itemColors}
            onConfigure={handleOpenConfigure}
          />
        ))}

        {/* Unpinned root notes */}
        {unpinnedRootNotes.map((note) => (
          <FileItem
            key={note.id}
            note={note}
            depth={0}
            isSelected={selectedNoteId === note.id}
            isMultiSelected={multiSelectedNoteIds.has(note.id)}
            isPinned={false}
            onNoteClick={handleNoteClick}
            onPin={pinNote}
            onUnpin={unpinNote}
            onDuplicate={duplicateNote}
            onDelete={openDeleteNoteDialog}
            onMove={onMoveNote}
            focusedItemKey={focusedItemKey}
            itemColor={itemColors[note.id]?.color ?? null}
            itemConfig={itemColors[note.id] ?? null}
            onConfigure={handleOpenConfigure}
          />
        ))}
      </div>

      {/* Delete folder confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the folder and all notes inside it.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename folder dialog */}
      <FolderNameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        onConfirm={handleRenameConfirm}
        title="Rename Folder"
        description="Enter a new name for the folder"
        confirmLabel="Rename"
        defaultValue={renameDefaultValue}
      />

      {/* New subfolder dialog */}
      <FolderNameDialog
        open={subfolderDialogOpen}
        onOpenChange={setSubfolderDialogOpen}
        onConfirm={handleSubfolderConfirm}
        title="Create new subfolder"
        description="Enter a name for your new subfolder"
        confirmLabel="Create"
      />

      {/* Delete note confirmation dialog */}
      <AlertDialog
        open={noteDeleteDialogOpen}
        onOpenChange={setNoteDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the note and all its content. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                handleNoteDeleteConfirm();
              }}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Item config dialog */}
      <ItemConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        itemPath={configItemPath}
        itemName={configItemName}
        itemType={configItemType}
        currentConfig={itemColors[configItemPath] ?? null}
        onSave={handleSaveItemColor}
        onRename={handleRenameItem}
      />
    </>
  );
}
