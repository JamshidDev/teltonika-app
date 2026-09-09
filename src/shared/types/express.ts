declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        roleId?: number;
        roleName?: string;
        permissions?: string[];
        isSuperAdmin?: boolean;
      };
    }
  }
}

export {};
