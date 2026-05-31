import { NextResponse } from "next/server";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "SERVER_ERROR";

export interface ApiErrorBody {
  error: string;
  code: ErrorCode;
}

export function apiError(
  code: ErrorCode,
  message: string,
  status: number,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: message, code }, { status });
}
