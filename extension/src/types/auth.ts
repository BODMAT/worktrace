export interface StoredAuth {
  jwt: string;
  jwtExpiresAt: number; // Unix ms
}

export type AuthMessage =
  | { type: "AUTH_LOGIN" }
  | { type: "AUTH_LOGOUT" }
  | { type: "AUTH_GET_STATUS" };

export type AuthResponse =
  | { success: true; jwt: string }
  | { success: true; isAuthenticated: boolean }
  | { success: true }
  | { success: false; error: string };
