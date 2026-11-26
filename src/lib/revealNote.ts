const REVEAL_NOTE_EVENT = "reveal-note";
const LAYOUT_SETTLE_MS = 100;

export function requestRevealNote(noteId: string) {
  window.dispatchEvent(new CustomEvent<string>(REVEAL_NOTE_EVENT, { detail: noteId }));
}

// Calls back with the note id once a reveal is requested; returns the unsubscribe function.
export function onRevealNote(handler: (noteId: string) => void) {
  const listener = (e: Event) => {
    const noteId = (e as CustomEvent<string>).detail;
    if (noteId) handler(noteId);
  };
  window.addEventListener(REVEAL_NOTE_EVENT, listener);
  return () => window.removeEventListener(REVEAL_NOTE_EVENT, listener);
}

// Waits for folder expansion to render, then centers the note's row in the sidebar.
export function scrollNoteIntoView(noteId: string) {
  window.setTimeout(() => {
    document
      .querySelector(`[data-note-id="${CSS.escape(noteId)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, LAYOUT_SETTLE_MS);
}
