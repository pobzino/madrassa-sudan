import {
  MessageSquare,
  CircleCheck,
  Scale,
  PenLine,
  Hash,
  Link2,
  ArrowUpDown,
  FolderInput,
  Target,
  type LucideIcon,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  'message-square': MessageSquare,
  'circle-check': CircleCheck,
  scale: Scale,
  'pen-line': PenLine,
  hash: Hash,
  'link-2': Link2,
  'arrow-up-down': ArrowUpDown,
  'folder-input': FolderInput,
  target: Target,
}

export default function ActivityTypeIcon({
  name,
  className = 'w-5 h-5',
}: {
  name: string
  className?: string
}) {
  const Icon = ICON_MAP[name] ?? Target
  return <Icon className={className} />
}
