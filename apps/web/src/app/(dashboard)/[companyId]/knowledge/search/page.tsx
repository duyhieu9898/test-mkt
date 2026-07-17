'use client';

/**
 * Knowledge → Search tab (doc 10 §7).
 *
 * Unified RAG search across approved company knowledge, including approved
 * document facts and meeting transcripts.
 */

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Sparkles, BookOpen, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { friendlyError } from '@/lib/friendly-errors';
import { KnowledgeTabs } from '@/components/knowledge/knowledge-tabs';

interface QueryResponse {
  answer: string;
  sources: Array<{
    documentId?: string;
    documentName?: string;
    chunkText?: string;
    score?: number;
  }>;
  traceId?: string;
}

export default function KnowledgeSearchPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((s) => s.token);

  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);

  const onAsk = async () => {
    if (!token || question.trim().length < 3) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post<QueryResponse>(
        `/knowledge/company/${companyId}/query`,
        { question: question.trim() },
        { token },
      );
      setResult(res);
    } catch (err) {
      toast.error(
        friendlyError(err, "We couldn't search your knowledge right now. Try again."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <KnowledgeTabs />

      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Search className="w-6 h-6 text-indigo-500" /> Ask your knowledge
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Ask questions across approved documents and meetings. The AI answers in
          plain language and shows which approved sources support the answer.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onAsk()}
              placeholder="What did we decide about pricing in last month's team meeting?"
              className="flex-1"
            />
            <Button
              onClick={onAsk}
              disabled={loading || question.trim().length < 3}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Ask
            </Button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Tips: ask specific questions. "How do we handle the pricing objection?" works
            better than "sales".
          </p>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card className="border-indigo-200 bg-indigo-50/30">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-indigo-600 font-semibold mb-2">
                <BookOpen className="w-3.5 h-3.5" /> Answer
              </div>
              <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {result.answer}
              </div>
            </CardContent>
          </Card>

          {result.sources.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
                Sources ({result.sources.length})
              </div>
              <div className="space-y-2">
                {result.sources.map((s, i) => (
                  <Card key={i} className="border-slate-200">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          <FileText className="w-3 h-3 text-slate-400" />
                          {s.documentName || 'Source'}
                        </div>
                        {typeof s.score === 'number' && (
                          <Badge variant="outline" className="text-[10px]">
                            {(s.score * 100).toFixed(0)}% match
                          </Badge>
                        )}
                      </div>
                      {s.chunkText && (
                        <div className="text-[11px] text-slate-600 line-clamp-3 leading-relaxed">
                          {s.chunkText}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
