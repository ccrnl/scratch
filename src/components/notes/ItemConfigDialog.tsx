import { useState, useCallback, useEffect, useRef } from "react";
import { HexColorPicker } from "react-colorful";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../ui";
import type { ItemColorConfig } from "../../types/note";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#6366f1", "#8b5cf6", "#a855f7", "#ec4899",
];

const POPULAR_EMOJIS = [
  "📁", "📂", "📝", "📌", "⭐", "🔥", "💡", "🎯",
  "🚀", "✅", "❌", "⚠️", "🔒", "📊", "🏷️", "💼",
];

interface ItemConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemPath: string;
  itemName: string;
  itemType: "folder" | "note";
  currentConfig: ItemColorConfig | null;
  onSave: (path: string, config: ItemColorConfig | null) => void;
  onRename?: (oldPath: string, newName: string) => Promise<void>;
}

export function ItemConfigDialog({
  open,
  onOpenChange,
  itemName,
  itemPath,
  itemType,
  currentConfig,
  onSave,
  onRename,
}: ItemConfigDialogProps) {
  const [name, setName] = useState(itemName);
  const [color, setColor] = useState("#3b82f6");
  const [applyToChildren, setApplyToChildren] = useState(true);
  const [hasColor, setHasColor] = useState(false);
  const [hexDraft, setHexDraft] = useState("");
  const [bold, setBold] = useState(false);
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const iconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(itemName);
      if (currentConfig) {
        if (currentConfig.color) {
          setColor(currentConfig.color);
          setHasColor(true);
          setHexDraft(currentConfig.color.slice(1).toUpperCase());
        } else {
          setColor("#3b82f6");
          setHasColor(false);
          setHexDraft("3B82F6");
        }
        setApplyToChildren(currentConfig.applyToChildren);
        setBold(currentConfig.bold ?? false);
        setIcon(currentConfig.icon ?? "");
        setDescription(currentConfig.description ?? "");
      } else {
        setColor("#3b82f6");
        setApplyToChildren(true);
        setHasColor(false);
        setHexDraft("3B82F6");
        setBold(false);
        setIcon("");
        setDescription("");
      }
    }
  }, [open, currentConfig, itemName]);

  const handlePickerChange = useCallback((hex: string) => {
    setColor(hex);
    setHasColor(true);
    setHexDraft(hex.slice(1).toUpperCase());
  }, []);

  const handlePresetClick = useCallback((hex: string) => {
    setColor(hex);
    setHasColor(true);
    setHexDraft(hex.slice(1).toUpperCase());
  }, []);

  const handleHexInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
      setHexDraft(raw.toUpperCase());
      if (raw.length === 6) {
        setColor(`#${raw.toLowerCase()}`);
        setHasColor(true);
      }
    },
    [],
  );

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (trimmedName && trimmedName !== itemName && onRename) {
      try {
        await onRename(itemPath, trimmedName);
      } catch (err) {
        console.error("Failed to rename:", err);
      }
    }
    const hasAnyConfig = hasColor || bold || icon || description;
    if (hasAnyConfig) {
      onSave(itemPath, {
        color: hasColor ? color : undefined,
        applyToChildren,
        bold: bold || undefined,
        icon: icon || undefined,
        description: description || undefined,
      });
    } else {
      onSave(itemPath, null);
    }
    onOpenChange(false);
  }, [name, itemName, hasColor, color, applyToChildren, bold, icon, description, itemPath, onSave, onOpenChange, onRename]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Configure</AlertDialogTitle>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-8 rounded-md border border-border bg-bg px-2 text-sm text-text focus:outline-none focus:border-accent"
              spellCheck={false}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text">Icon</label>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setIcon("")}
                  className={`w-7 h-7 rounded-md cursor-pointer transition-all border border-border relative text-xs ${
                    !icon
                      ? "ring-2 ring-text ring-offset-1 ring-offset-bg scale-110"
                      : "hover:scale-110"
                  }`}
                  title="Default icon"
                >
                  <span className="absolute inset-0 flex items-center justify-center text-text-muted">—</span>
                </button>
                {POPULAR_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setIcon(emoji)}
                    className={`w-7 h-7 rounded-md cursor-pointer transition-all text-sm ${
                      icon === emoji
                        ? "ring-2 ring-text ring-offset-1 ring-offset-bg scale-110"
                        : "hover:scale-110"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">Custom:</span>
              <input
                ref={iconInputRef}
                type="text"
                value={icon}
                onChange={(e) => {
                  const val = e.target.value;
                  const chars = [...val];
                  setIcon(chars.length > 0 ? chars[chars.length - 1] : "");
                }}
                className="w-12 h-8 rounded-md border border-border bg-bg px-1 text-center text-sm focus:outline-none focus:border-accent"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text">Color</label>

            <div className="flex gap-1.5">
              <button
                onClick={() => setHasColor(false)}
                className={`w-6 h-6 rounded-md cursor-pointer transition-all border border-border relative ${
                  !hasColor
                    ? "ring-2 ring-text ring-offset-1 ring-offset-bg scale-110"
                    : "hover:scale-110"
                }`}
                style={{ backgroundColor: "var(--color-bg)" }}
                title="No color"
              >
                <span className="absolute inset-0 flex items-center justify-center text-red-500 text-xs font-bold">✕</span>
              </button>
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handlePresetClick(preset)}
                  className={`w-6 h-6 rounded-md cursor-pointer transition-all ${
                    hasColor && color === preset
                      ? "ring-2 ring-text ring-offset-1 ring-offset-bg scale-110"
                      : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: preset }}
                />
              ))}
            </div>

            <div className="[&_.react-colorful]:!w-full [&_.react-colorful]:!h-36">
              <HexColorPicker color={color} onChange={handlePickerChange} />
            </div>

            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-md border border-border shrink-0"
                style={{
                  backgroundColor: hasColor ? color : "transparent",
                }}
              />
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-text-muted font-mono">
                  #
                </span>
                <input
                  type="text"
                  value={hexDraft}
                  onChange={handleHexInput}
                  className="w-full h-8 rounded-md border border-border bg-bg pl-5 pr-2 text-sm text-text font-mono uppercase focus:outline-none focus:border-accent"
                  maxLength={6}
                  spellCheck={false}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text">Options</label>
            <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-md hover:bg-bg-muted">
              <input
                type="checkbox"
                checked={bold}
                onChange={(e) => setBold(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-sm text-text font-bold">Bold title</span>
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description..."
              className="w-full h-8 rounded-md border border-border bg-bg px-2 text-sm text-text focus:outline-none focus:border-accent"
              spellCheck={false}
            />
          </div>

          {itemType === "folder" && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text">
                Application
              </label>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-md hover:bg-bg-muted">
                  <input
                    type="radio"
                    name="applyMode"
                    checked={!applyToChildren}
                    onChange={() => setApplyToChildren(false)}
                    className="accent-accent"
                  />
                  <span className="text-sm text-text">This item only</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-md hover:bg-bg-muted">
                  <input
                    type="radio"
                    name="applyMode"
                    checked={applyToChildren}
                    onChange={() => setApplyToChildren(true)}
                    className="accent-accent"
                  />
                  <span className="text-sm text-text">Entire subtree</span>
                </label>
              </div>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            Save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
