// Tiny event bus so any surface (command palette, sidebar, keyboard shortcut)
// can open the Spaces overlay without owning its React state.
const SPACES_OPEN_EVENT = "t3code:open-spaces";

export function openSpaces(): void {
  window.dispatchEvent(new CustomEvent(SPACES_OPEN_EVENT));
}

export function onOpenSpaces(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(SPACES_OPEN_EVENT, handler);
  return () => window.removeEventListener(SPACES_OPEN_EVENT, handler);
}
