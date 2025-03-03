'use client'

import type { User } from 'next-auth'
import { useRouter } from 'next/navigation'

import { PlusIcon } from '@/components/icons'
import { SidebarHistory } from '@/components/sidebar-history'
import { SidebarUserNav } from '@/components/sidebar-user-nav'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar'
import Link from 'next/link'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { useTheme } from 'next-themes'

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter()
  const { setOpenMobile } = useSidebar()
  const { resolvedTheme } = useTheme()
  const logoPath = resolvedTheme === 'light' ? '/logo-title/light.svg' : '/logo-title/dark.svg'

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row justify-between items-center py-6">
            <Link
              href="/"
              onClick={() => {
                setOpenMobile(false)
              }}
              className="flex flex-row gap-3 items-center"
            >
              <img 
                src={logoPath} 
                alt="logo" 
                className='w-32'
              />
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  type="button"
                  className="p-2 h-fit"
                  onClick={() => {
                    setOpenMobile(false)
                    router.push('/')
                    router.refresh()
                  }}
                >
                  <PlusIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent align="end">New Chat</TooltipContent>
            </Tooltip>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarHistory user={user} />
      </SidebarContent>
      <SidebarFooter>{user && <SidebarUserNav user={user} />}</SidebarFooter>
    </Sidebar>
  )
}
