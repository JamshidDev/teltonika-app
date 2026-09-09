import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermissions';

// Bir nechta kalit berilsa — istalgan bittasi yetarli (OR).
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
