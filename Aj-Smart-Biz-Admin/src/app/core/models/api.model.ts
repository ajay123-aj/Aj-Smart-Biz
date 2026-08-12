/** Envelope every Aj Smart Biz endpoint responds with. */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: PageMeta;
  errors?: FieldError[];
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
}

export interface FieldError {
  field: string;
  message: string;
  in?: 'body' | 'query' | 'params';
}

/** Result of a paginated list call, already unwrapped from the envelope. */
export interface PagedResult<T> {
  items: T[];
  meta: PageMeta;
}

export interface ListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: string | number | boolean | undefined;
}

export const EMPTY_META: PageMeta = { total: 0, page: 1, limit: 10, totalPages: 0, hasNext: false };
