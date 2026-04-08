import { mockVocab, mockSentences, mockReviewLogs, mockGrammarMetrics } from './mockData';

// 1. Initialize the Local Database
export const initDemoDB = () => {
  if (typeof window === 'undefined') return;
  if (!localStorage.getItem('demo_vocab')) localStorage.setItem('demo_vocab', JSON.stringify(mockVocab));
  if (!localStorage.getItem('demo_sentences')) localStorage.setItem('demo_sentences', JSON.stringify(mockSentences));
  if (!localStorage.getItem('demo_review_logs')) localStorage.setItem('demo_review_logs', JSON.stringify(mockReviewLogs));
  if (!localStorage.getItem('demo_grammar_metrics')) localStorage.setItem('demo_grammar_metrics', JSON.stringify(mockGrammarMetrics));
  if (!localStorage.getItem('demo_cram_groups')) localStorage.setItem('demo_cram_groups', JSON.stringify([]));
  if (!localStorage.getItem('demo_app_settings')) localStorage.setItem('demo_app_settings', JSON.stringify([]));
  if (!localStorage.getItem('demo_grammar_mastery')) localStorage.setItem('demo_grammar_mastery', JSON.stringify([]));
};

// 2. The Mock Query Builder
class MockQueryBuilder implements PromiseLike<any> {
  private table: string;
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | null = null;
  private payload: any = null;
  private filters: Array<{ type: string; col: string; val: any }> = [];
  private orderConfig: { col: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private returnSingle = false;
  private returnMaybeSingle = false;

  constructor(table: string) {
    this.table = `demo_${table}`;
  }

  // --- Operations ---
  select(cols?: string) { this.operation = 'select'; return this; }
  insert(data: any) { this.operation = 'insert'; this.payload = data; return this; }
  update(data: any) { this.operation = 'update'; this.payload = data; return this; }
  delete() { this.operation = 'delete'; return this; }
  upsert(data: any, options?: any) { this.operation = 'upsert'; this.payload = data; return this; }

  // --- Modifiers ---
  eq(col: string, val: any) { this.filters.push({ type: 'eq', col, val }); return this; }
  in(col: string, vals: any[]) { this.filters.push({ type: 'in', col, val: vals }); return this; }
  gte(col: string, val: any) { this.filters.push({ type: 'gte', col, val }); return this; }
  order(col: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orderConfig = { col, ascending: options.ascending !== false };
    return this;
  }
  limit(count: number) { this.limitCount = count; return this; }
  single() { this.returnSingle = true; return this; }
  maybeSingle() { this.returnMaybeSingle = true; return this; }

  // --- Execution (Wrapped in a strict Promise to satisfy TypeScript) ---
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): PromiseLike<TResult1 | TResult2> {
    return new Promise<any>((resolve) => {
      try {
        let data = JSON.parse(localStorage.getItem(this.table) || '[]');
        let result: any = null;

        if (this.operation === 'insert') {
          const newRecords = Array.isArray(this.payload) ? this.payload : [this.payload];
          newRecords.forEach(r => { if (!r.id) r.id = Math.random().toString(36).substring(2, 15); });
          data = [...newRecords, ...data];
          localStorage.setItem(this.table, JSON.stringify(data));
          result = newRecords;
        } 
        else if (this.operation === 'update') {
          data = data.map((row: any) => {
            const match = this.filters.every(f => row[f.col] === f.val);
            return match ? { ...row, ...this.payload } : row;
          });
          localStorage.setItem(this.table, JSON.stringify(data));
          result = data.filter((row: any) => this.filters.every(f => row[f.col] === f.val));
        } 
        else if (this.operation === 'delete') {
          data = data.filter((row: any) => !this.filters.every(f => row[f.col] === f.val));
          localStorage.setItem(this.table, JSON.stringify(data));
          result = null; 
        }
        else if (this.operation === 'upsert') {
          const record = Array.isArray(this.payload) ? this.payload[0] : this.payload;
          const conflictCol = record.key ? 'key' : 'id';
          const existingIdx = data.findIndex((r: any) => r[conflictCol] === record[conflictCol]);
          
          if (existingIdx >= 0) {
            data[existingIdx] = { ...data[existingIdx], ...record };
          } else {
            if (!record.id) record.id = Math.random().toString(36).substring(2, 15);
            data.unshift(record);
          }
          localStorage.setItem(this.table, JSON.stringify(data));
          result = [record];
        } 
        else if (this.operation === 'select') {
          result = [...data];
          this.filters.forEach(f => {
            if (f.type === 'eq') result = result.filter((r: any) => r[f.col] === f.val);
            if (f.type === 'in') result = result.filter((r: any) => f.val.includes(r[f.col]));
            if (f.type === 'gte') result = result.filter((r: any) => new Date(r[f.col]) >= new Date(f.val));
          });
          if (this.orderConfig) {
            const { col, ascending } = this.orderConfig;
            result.sort((a: any, b: any) => {
              if (a[col] < b[col]) return ascending ? -1 : 1;
              if (a[col] > b[col]) return ascending ? 1 : -1;
              return 0;
            });
          }
          if (this.limitCount) result = result.slice(0, this.limitCount);
          if (this.returnSingle) result = result[0] || null;
          if (this.returnMaybeSingle) result = result.length > 0 ? result[0] : null;
        }

        resolve({ data: result, error: null });
      } catch (err: any) {
        resolve({ data: null, error: { message: err.message } });
      }
    }).then(onfulfilled, onrejected);
  }
}

// 3. Exported as 'any' to stop TypeScript from policing the mock methods
export const mockSupabase: any = {
  from: (table: string) => new MockQueryBuilder(table)
};