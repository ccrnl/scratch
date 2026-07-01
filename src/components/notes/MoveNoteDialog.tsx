import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { buildFolderTree } from "../../lib/folderTree";
import { cleanTitle, cn } from "../../lib/utils";
import * as notesService from "../../services/notes";
import type { FolderNode } from "../../types/note";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
} from "../ui";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
} from "../icons";

interface MoveNoteDialogProps {
  open: boolean;
  noteId: string | null;
  onOpenChange: (open: boolean) => void;
}

function getParentFolder(noteId: string): string {
  const lastSlash = noteId.lastIndexOf("/");
  return lastSlash > 0 ? noteId.substring(0, lastSlash) : "";
}

function getFolderLabel(path: string): string {
  return path || "Notes root";
}

function getAncestorFolders(path: string): string[] {
  if (!path) return [];
  const parts = path.split("/");
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

interface FolderOptionProps {
  folder: FolderNode;
  depth: number;
  selectedFolder: string;
  expandedFolders: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}

function FolderOption({
  folder,
  depth,
  selectedFolder,
  expandedFolders,
  onSelect,
  onToggle,
}: FolderOptionProps) {
  const isExpanded = expandedFolders.has(folder.path);
  const isSelected = selectedFolder === folder.path;
  const hasChildren = folder.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-1"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        <button
          type="button"
          className={cn(
            "h-7 w-7 flex items-center justify-center rounded-md shrink-0",
            hasChildren
              ? "text-text-muted hover:bg-bg-muted hover:text-text"
              : "text-text-muted/30",
          )}
          disabled={!hasChildren}
          aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
          onClick={() => onToggle(folder.path)}
        >
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4 stroke-[1.6]" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 stroke-[1.6]" />
          )}
        </button>

        <button
          type="button"
          className={cn(
            "min-w-0 h-8 flex-1 flex items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
            isSelected
              ? "bg-bg-muted text-text"
              : "text-text-muted hover:bg-bg-muted hover:text-text",
          )}
          onClick={() => onSelect(folder.path)}
        >
          <FolderIcon className="w-4 h-4 stroke-[1.6] shrink-0" />
          <span className="truncate">{folder.name}</span>
        </button>
      </div>

      {isExpanded &&
        folder.children.map((child) => (
          <FolderOption
            key={child.path}
            folder={child}
            depth={depth + 1}
            selectedFolder={selectedFolder}
            expandedFolders={expandedFolders}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
    </div>
  );
}

export function MoveNoteDialog({
  open,
  noteId,
  onOpenChange,
}: MoveNoteDialogProps) {
  const { notes, moveNote, createFolder } = useNotes();
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const [newFolderName, setNewFolderName] = useState("");
  const [isMoving, setIsMoving] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const note = useMemo(
    () => notes.find((item) => item.id === noteId) ?? null,
    [noteId, notes],
  );
  const currentFolder = noteId ? getParentFolder(noteId) : "";

  const tree = useMemo(
    () => buildFolderTree(notes, new Set(), knownFolders),
    [knownFolders, notes],
  );

  const selectedFolderLabel = getFolderLabel(selectedFolder);
  const canMove = !!noteId && selectedFolder !== currentFolder && !isMoving;
  const canCreateFolder = newFolderName.trim().length > 0 && !isCreatingFolder;

  useEffect(() => {
    if (!open) return;

    let isActive = true;
    const initialFolder = noteId ? getParentFolder(noteId) : "";
    setSelectedFolder(initialFolder);
    setExpandedFolders(new Set(getAncestorFolders(initialFolder)));
    setNewFolderName("");

    notesService
      .listFolders()
      .then((folders) => {
        if (isActive) setKnownFolders(folders);
      })
      .catch((error) => {
        console.error("Failed to list folders:", error);
        if (isActive) setKnownFolders([]);
      });

    return () => {
      isActive = false;
    };
  }, [noteId, open]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const selectFolder = useCallback((path: string) => {
    setSelectedFolder(path);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      for (const ancestor of getAncestorFolders(path)) {
        next.add(ancestor);
      }
      return next;
    });
  }, []);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || isCreatingFolder) return;

    const newPath = selectedFolder ? `${selectedFolder}/${name}` : name;
    setIsCreatingFolder(true);
    try {
      await createFolder(selectedFolder, name);
      setKnownFolders((prev) =>
        prev.includes(newPath) ? prev : [...prev, newPath].sort(),
      );
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        for (const ancestor of getAncestorFolders(newPath)) {
          next.add(ancestor);
        }
        return next;
      });
      setSelectedFolder(newPath);
      setNewFolderName("");
    } catch (error) {
      console.error("Failed to create folder:", error);
      toast.error("Failed to create folder");
    } finally {
      setIsCreatingFolder(false);
    }
  }, [createFolder, isCreatingFolder, newFolderName, selectedFolder]);

  const handleMove = useCallback(async () => {
    if (!noteId || !canMove) return;

    setIsMoving(true);
    try {
      await moveNote(noteId, selectedFolder);
      window.dispatchEvent(
        new CustomEvent("expand-folder", { detail: selectedFolder }),
      );
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to move note:", error);
      toast.error("Failed to move note");
    } finally {
      setIsMoving(false);
    }
  }, [canMove, moveNote, noteId, onOpenChange, selectedFolder]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Move to...</AlertDialogTitle>
          <AlertDialogDescription className="-mt-1">
            {note ? cleanTitle(note.title) : "Choose a destination folder."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-md border border-border bg-bg-secondary/50 p-1">
          <button
            type="button"
            className={cn(
              "h-8 w-full flex items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
              selectedFolder === ""
                ? "bg-bg-muted text-text"
                : "text-text-muted hover:bg-bg-muted hover:text-text",
            )}
            onClick={() => selectFolder("")}
          >
            <FolderIcon className="w-4 h-4 stroke-[1.6] shrink-0" />
            <span className="truncate">Notes root</span>
          </button>

          <div className="mt-1 max-h-64 overflow-y-auto pr-1">
            {tree.folders.length > 0 ? (
              tree.folders.map((folder) => (
                <FolderOption
                  key={folder.path}
                  folder={folder}
                  depth={0}
                  selectedFolder={selectedFolder}
                  expandedFolders={expandedFolders}
                  onSelect={selectFolder}
                  onToggle={toggleFolder}
                />
              ))
            ) : (
              <div className="px-2 py-6 text-center text-sm text-text-muted">
                No folders yet
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleCreateFolder();
              }
            }}
            placeholder={`New folder in ${selectedFolderLabel}`}
            className="h-8 text-sm"
          />
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={!canCreateFolder}
            onClick={handleCreateFolder}
          >
            <FolderPlusIcon className="w-4 h-4 stroke-[1.6] mr-1.5" />
            Create
          </Button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isMoving || isCreatingFolder}>
            Cancel
          </AlertDialogCancel>
          <Button disabled={!canMove || isCreatingFolder} onClick={handleMove}>
            {isMoving ? "Moving..." : "Move"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
