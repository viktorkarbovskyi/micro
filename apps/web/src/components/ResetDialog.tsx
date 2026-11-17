import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Api } from '@/lib/api'
import { showError } from '@/lib/notify'

interface ResetDialogProps {
  api: Api
  /** Called after a successful reset (the success toast is already shown). */
  onDone: () => void
  onClose: () => void
}

/** ui.md §11: confirmation for the admin reset. On error a red toast and the dialog stays open. */
export function ResetDialog({ api, onDone, onClose }: ResetDialogProps) {
  const [busy, setBusy] = useState(false)

  async function reset() {
    setBusy(true)
    try {
      await api.adminReset()
      toast.success('All data deleted')
      onDone()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset data</DialogTitle>
          <DialogDescription>This will permanently delete all reports and history. Continue?</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void reset()}>
            Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
