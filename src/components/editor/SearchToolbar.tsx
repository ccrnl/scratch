import { useEffect, type KeyboardEvent, type RefObject } from "react";
import { Input, IconButton, Button } from "../ui";
import { ArrowUpIcon, ArrowDownIcon, XIcon } from "../icons";
import { shift } from "../../lib/platform";
import { cn } from "../../lib/utils";

export interface SearchOptions {
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

interface SearchToolbarProps {
  query: string;
  replaceQuery: string;
  onChange: (query: string) => void;
  onReplaceChange: (query: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
  options: SearchOptions;
  onOptionsChange: (options: SearchOptions) => void;
  currentMatch: number;
  totalMatches: number;
  error: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function SearchToolbar({
  query,
  replaceQuery,
  onChange,
  onReplaceChange,
  onNext,
  onPrevious,
  onReplace,
  onReplaceAll,
  onClose,
  options,
  onOptionsChange,
  currentMatch,
  totalMatches,
  error,
  inputRef,
}: SearchToolbarProps) {
  // Auto-focus input on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [inputRef]);

  const canReplace = totalMatches > 0 && !error;

  const updateOption = (key: keyof SearchOptions) => {
    onOptionsChange({
      ...options,
      [key]: !options[key],
    });
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        onPrevious();
      } else {
        onNext();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab") {
      // Allow tab navigation within toolbar
      e.stopPropagation();
    }
  };

  const handleReplaceKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onReplace();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab") {
      e.stopPropagation();
    }
  };

  return (
    <div className="w-[34rem] max-w-[calc(100vw-1rem)] bg-bg border border-border rounded-lg shadow-lg p-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Find in note..."
          className="min-w-0 flex-1 h-8 text-sm"
          onKeyDown={handleSearchKeyDown}
        />

        <span className="text-xs text-text-muted whitespace-nowrap px-1 min-w-18 text-center">
          {error
            ? "Invalid"
            : totalMatches > 0
              ? `${currentMatch}/${totalMatches}`
              : "Not found"}
        </span>

        <IconButton
          onClick={onPrevious}
          disabled={totalMatches === 0 || !!error}
          title={`Previous match (${shift}↵)`}
        >
          <ArrowUpIcon className="w-4.5 h-4.5 stroke-[1.5]" />
        </IconButton>

        <IconButton
          onClick={onNext}
          disabled={totalMatches === 0 || !!error}
          title="Next match (↵)"
        >
          <ArrowDownIcon className="w-4.5 h-4.5 stroke-[1.5]" />
        </IconButton>

        <IconButton onClick={onClose} title="Close (Esc)">
          <XIcon className="w-4.5 h-4.5 stroke-[1.5]" />
        </IconButton>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <Input
          type="text"
          value={replaceQuery}
          onChange={(e) => onReplaceChange(e.target.value)}
          placeholder="Replace..."
          className="min-w-0 flex-1 h-8 text-sm"
          onKeyDown={handleReplaceKeyDown}
        />

        <Button
          size="sm"
          variant="default"
          onClick={onReplace}
          disabled={!canReplace}
        >
          Replace
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={onReplaceAll}
          disabled={!canReplace}
        >
          All
        </Button>

        <div className="flex items-center gap-px ml-1 border-l border-border pl-1">
          <SearchOptionButton
            active={options.matchCase}
            title="Match case"
            onClick={() => updateOption("matchCase")}
          >
            Aa
          </SearchOptionButton>
          <SearchOptionButton
            active={options.wholeWord}
            title="Whole word"
            onClick={() => updateOption("wholeWord")}
          >
            W
          </SearchOptionButton>
          <SearchOptionButton
            active={options.useRegex}
            title="Use regular expression"
            onClick={() => updateOption("useRegex")}
          >
            .*
          </SearchOptionButton>
        </div>
      </div>

      {error && (
        <div className="px-2 pt-1 text-xs text-text-muted truncate">
          {error}
        </div>
      )}
    </div>
  );
}

interface SearchOptionButtonProps {
  active: boolean;
  title: string;
  onClick: () => void;
  children: string;
}

function SearchOptionButton({
  active,
  title,
  onClick,
  children,
}: SearchOptionButtonProps) {
  return (
    <button
      type="button"
      aria-label={title}
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={cn(
        "h-7 w-7 rounded-md text-xs font-medium transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
        active
          ? "bg-accent text-text-inverse"
          : "text-text-muted hover:bg-bg-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}
