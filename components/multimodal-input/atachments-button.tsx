import { PaperclipIcon } from "lucide-react"
import { memo } from "react"
import { Button } from "../ui/button"

function PureAttachmentsButton({
  fileInputRef,
  isLoading,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>
  isLoading: boolean
}) {
  return (
    <Button
      className="rounded-md rounded-bl-lg p-[7px] h-fit dark:border-zinc-700 hover:dark:bg-zinc-900 hover:bg-zinc-200"
      onClick={(event) => {
        event.preventDefault()
        fileInputRef.current?.click()
      }}
      disabled={isLoading}
      variant="ghost"
    >
      <PaperclipIcon size={14} />
    </Button>
  )
}

export const AttachmentsButton = memo(PureAttachmentsButton)