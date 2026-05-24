export interface ApiErrorDetail {
  field: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}

export type ApiResponse<TData> =
  | {
      success: true;
      data: TData;
    }
  | {
      success: false;
      error: ApiErrorBody;
    };

export interface HttpResponse<TData> {
  status: number;
  body: ApiResponse<TData>;
  headers?: Record<string, string>;
}

export function ok<TData>(data: TData): HttpResponse<TData> {
  return {
    status: 200,
    body: {
      success: true,
      data,
    },
  };
}

export function created<TData>(data: TData, location?: string): HttpResponse<TData> {
  return {
    status: 201,
    body: {
      success: true,
      data,
    },
    headers: location ? { Location: location } : undefined,
  };
}

export function apiError<TData = never>(
  status: number,
  code: string,
  message: string,
  details?: ApiErrorDetail[],
): HttpResponse<TData> {
  return {
    status,
    body: {
      success: false,
      error: {
        code,
        message,
        details,
      },
    },
  };
}
