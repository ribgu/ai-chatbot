'use client'

import { useRouter } from 'next/navigation'
import { useWindowSize } from 'usehooks-ts'
import { ModelSelector } from '@/components/model-selector'
import { SidebarToggle } from '@/components/sidebar-toggle'
import { Button } from '@/components/ui/button'
import { PlusIcon } from './icons'
import { useSidebar } from './ui/sidebar'
import { memo } from 'react'

function PureChatHeader({
  selectedModelId,
  isReadonly,
}: {
  chatId: string
  selectedModelId: string
  selectedVisibilityType?: string
  isReadonly: boolean
}) {
  const router = useRouter()
  const { open } = useSidebar()

  const { width: windowWidth } = useWindowSize()

  return (
    <header className="flex sticky top-0 bg-background py-1.5 items-center px-2 md:px-2 gap-2">
      <SidebarToggle />

      {(!open || windowWidth < 768) && (
        <Button
          variant="outline"
          className="order-2 md:order-1 md:px-2 px-2 md:h-fit ml-auto md:ml-0"
          onClick={() => {
            router.push('/')
            router.refresh()
          }}
        >
          <PlusIcon />
          <span className="md:sr-only">New Chat</span>
        </Button>
      )}

      {!isReadonly && (
        <ModelSelector
          selectedModelId={selectedModelId}
          className="order-1 md:order-2 ml-auto md:ml-0"
        />
      )}
    </header>
  )
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return prevProps.selectedModelId === nextProps.selectedModelId
})
