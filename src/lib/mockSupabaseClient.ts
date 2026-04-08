import { mockVocab, mockSentences, mockReviewLogs, mockGrammarMetrics } from '@/lib/mockData';

export const initDemoDB = () => {
  if (typeof window === 'undefined') return;
  try {
    if (!localStorage.getItem('demo_vocab')) localStorage.setItem('demo_vocab', JSON.stringify(mockVocab));
    if (!localStorage.getItem('demo_sentences')) localStorage.setItem('demo_sentences', JSON.stringify(mockSentences));
    if (!localStorage.getItem('demo_review_logs')) localStorage.setItem('demo_review_logs', JSON.stringify(mockReviewLogs));
    if (!localStorage.getItem('demo_grammar_metrics')) localStorage.setItem('demo_grammar_metrics', JSON.stringify(mockGrammarMetrics));
    if (!localStorage.getItem('demo_cram_groups')) localStorage.setItem('demo_cram_groups', JSON.stringify([]));
  } catch (e) {
    console.error("Local Storage is full or disabled", e);
  }
};

class MockQueryBuilder {
  private table: string;
  private filters: any[] = [];
  constructor(table: string) { this.table = `demo_${table}`; }
  select() { return this; }
  insert(data: any) { return this; }
  update(data: any) { return this; }
  delete() { return this; }
  eq() { return this; }
  in() { return this; }
  gte() { return this; }
  order() { return this; }
  limit() { return this; }
  single() { return this; }
  async then(resolve: any) {
    const data = JSON.parse(localStorage.getItem(this.table) || '[]');
    resolve({ data, error: null });
  }
}

export const mockSupabase = {
  from: (table: string) => new MockQueryBuilder(table)
};