export type AuthUserProfile = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthSessionState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; userId: string; email: string }
  | { status: "unconfigured"; reason: string };
