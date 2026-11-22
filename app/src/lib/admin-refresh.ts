type Surface = { window: EventTarget; document: EventTarget & {visibilityState: string}; online: () => boolean }
/** Periodic reads while visible; no claim of server push or phone-draft visibility. */
export function watchAdminRefresh(refresh: () => void, clock: (at: number) => void, surface: Surface = {window, document, online: () => navigator.onLine}) {
  const resume = () => { if (surface.online() && surface.document.visibilityState === 'visible') refresh() }
  const timer = setInterval(() => { clock(Date.now()); resume() }, 30000)
  surface.window.addEventListener('focus', resume)
  surface.window.addEventListener('online', resume)
  surface.document.addEventListener('visibilitychange', resume)
  return () => {
    clearInterval(timer)
    surface.window.removeEventListener('focus', resume)
    surface.window.removeEventListener('online', resume)
    surface.document.removeEventListener('visibilitychange', resume)
  }
}
