import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

interface ModalProps {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}

/**
 * Bottom sheet on phones, centred dialog from `sm` up.
 * Radix handles focus trapping, Escape, scroll lock and aria wiring.
 */
export function Modal({ title, description, onClose, children }: ModalProps) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-in fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className="sheet-in fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-b-0 border-line bg-panel shadow-2xl sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[85dvh] sm:max-w-md sm:rounded-xl sm:border-b"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-sm text-ink-2">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-field hover:text-ink"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
