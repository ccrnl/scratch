import type { ItemColorConfig } from "../types/note";

// An item's own color wins; otherwise the nearest ancestor folder flagged applyToChildren provides it.
export function resolveItemColor(
  itemColors: Record<string, ItemColorConfig>,
  itemPath: string,
): string | null {
  const own = itemColors[itemPath]?.color;
  if (own) return own;
  const parts = itemPath.split("/");
  for (let i = parts.length - 1; i >= 1; i--) {
    const config = itemColors[parts.slice(0, i).join("/")];
    if (config?.applyToChildren && config.color) return config.color;
  }
  return null;
}
