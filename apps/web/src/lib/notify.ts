import { toast } from 'sonner'

/** Red toast for any failure: `ApiProblem` messages are already `<status> <code> — <detail>` (ui.md §12). */
export function showError(e: unknown) {
  toast.error(e instanceof Error ? e.message : String(e))
}
