export interface AdminAuthRequest {
  headers: Record<string, string | undefined>;
}

export type AdminAuthResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: 401 | 403;
      code: "admin_auth_required" | "admin_forbidden";
      message: string;
    };

export interface AdminAuthorizer {
  authorize(request: AdminAuthRequest): AdminAuthResult;
}

export function createStaticAdminAuthorizer(token: string): AdminAuthorizer {
  return {
    authorize(request): AdminAuthResult {
      const credential = extractBearerToken(request.headers.authorization);

      if (!credential) {
        return {
          ok: false,
          status: 401,
          code: "admin_auth_required",
          message: "Admin authorization is required.",
        };
      }

      if (!constantTimeEqual(credential, token)) {
        return {
          ok: false,
          status: 403,
          code: "admin_forbidden",
          message: "Admin authorization failed.",
        };
      }

      return { ok: true };
    },
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function extractBearerToken(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/.exec(value.trim());

  return match?.[1];
}
import { timingSafeEqual } from "node:crypto";
