/*
 * Module-level channel for programmatic page scrolls.
 *
 * Ownership: PageView populates the handler on mount and clears it on unmount.
 * Consumers (store actions, thumbnails, keyboard, find) call `scrollToPage`
 * to request a smooth scroll to a given page in the continuous-scroll stack.
 * When PageView is unmounted (e.g. pre-load), calls are no-ops.
 */

export type ScrollBlock = 'start' | 'center';

type ScrollHandler = (pageIndex: number, block: ScrollBlock) => void;

let handlerRef: ScrollHandler | null = null;

export function setScrollController(handler: ScrollHandler | null): void {
  handlerRef = handler;
}

export function scrollToPage(pageIndex: number, block: ScrollBlock): void {
  handlerRef?.(pageIndex, block);
}
