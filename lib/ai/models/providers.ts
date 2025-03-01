import { FC } from 'react'
import { Github, Sparkles, Globe } from 'lucide-react'
import { BrandGithubCopilot } from '@/components/icons'

/**
 * Provider information for the model selector UI
 */

export interface ProviderInfo {
  id: string
  name: string
  description: string
  icon: FC
}

export const providers: ProviderInfo[] = [
  {
    id: 'github',
    name: 'GitHub Models',
    description: 'Models powered by GitHub',
    icon: Github
  },
  {
    id: 'copilot',
    name: 'Copilot',
    description: 'Models optimized for code generation',
    icon: BrandGithubCopilot
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Specialized models with custom system prompts',
    icon: Sparkles
  },
  {
    id: 'openrouter',
    name: 'Open Router',
    description: 'Access to various open models via OpenRouter',
    icon: Globe
  }
]

// Map category names to provider IDs
export const categoryToProviderId: Record<string, string> = {
  'GitHub Models': 'github',
  'Copilot': 'copilot',
  'Custom': 'custom',
  'Open Router': 'openrouter'
}