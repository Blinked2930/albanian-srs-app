import { createClient } from '@supabase/supabase-js';

// The VIP switch for Ghost Mode
export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// This creates ONE single instance of the client that survives page navigations
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, 
    autoRefreshToken: true, 
    detectSessionInUrl: true,
    // explicitly tell iOS to use localStorage
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // custom key so iOS doesn't accidentally wipe a generic 'supabase.auth.token'
    storageKey: 'albanian-srs-pwa-token', 
  },
});

export interface FetchAllRowsOptions {
  orderColumn?: string;
  ascending?: boolean;
  nullsFirst?: boolean;
  filter?: (query: any) => any;
}

/**
 * Fetches ALL rows from a Supabase table by automatically paginating through PostgREST 1000-row limits.
 */
export async function fetchAllRows<T = any>(
  tableName: string,
  selectClause: string = '*',
  options?: FetchAllRowsOptions,
  customSupabaseClient?: any
): Promise<{ data: T[] | null; error: any }> {
  const client = customSupabaseClient || supabase;
  let allData: T[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = client.from(tableName).select(selectClause).range(from, to);

    if (options?.filter) {
      query = options.filter(query);
    }

    if (options?.orderColumn) {
      query = query.order(options.orderColumn, {
        ascending: options.ascending ?? true,
        nullsFirst: options.nullsFirst,
      });
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error };
    }

    if (data && data.length > 0) {
      allData = allData.concat(data as T[]);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  return { data: allData, error: null };
}