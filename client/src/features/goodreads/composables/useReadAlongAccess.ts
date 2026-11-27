import { computed } from 'vue'
import { Permission } from '@bookorbit/types'
import { usePermissions } from '@/features/auth/composables/usePermissions'

export interface ReadAlongAccess {
  /** "Download both" files self-serve requests, so it needs the right to fetch books directly. */
  allowed: boolean
  /** A moderator may also send releases for requests that are not self-serve. */
  canManage: boolean
}

export function useReadAlongAccess() {
  const { hasPermission, isDemoRestrictedAccount } = usePermissions()
  return computed<ReadAlongAccess>(() => ({
    allowed: hasPermission(Permission.BookRequestAccess) && hasPermission(Permission.BookRequestSelfFulfill) && !isDemoRestrictedAccount.value,
    canManage: hasPermission(Permission.ManageBookRequests),
  }))
}
