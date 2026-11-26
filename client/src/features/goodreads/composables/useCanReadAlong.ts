import { computed } from 'vue'
import { Permission } from '@bookorbit/types'
import { usePermissions } from '@/features/auth/composables/usePermissions'

/** "Download both" files self-serve requests, so it needs the right to fetch books directly. */
export function useCanReadAlong() {
  const { hasPermission, isDemoRestrictedAccount } = usePermissions()
  return computed(
    () => hasPermission(Permission.BookRequestAccess) && hasPermission(Permission.BookRequestSelfFulfill) && !isDemoRestrictedAccount.value,
  )
}
