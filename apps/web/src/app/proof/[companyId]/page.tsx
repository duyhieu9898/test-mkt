'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Shield, ShieldCheck, ShieldAlert, Loader2, CheckCircle2,
  FileText, Search, Clock, Lock, ExternalLink,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';

export default function PublicProofPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_URL}/tenant-ai/public/proof/${companyId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError('Could not load proof data'); setLoading(false); });
  }, [companyId]);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await fetch(`${API_URL}/tenant-ai/public/proof/${companyId}/verify`);
      const result = await res.json();
      setVerifyResult(result);
    } catch {
      setVerifyResult({ valid: false, error: 'Verification failed' });
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-50 to-white">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <Card className="max-w-md p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Proof Not Available</h2>
          <p className="text-muted-foreground text-sm">{error || 'This company has not enabled data transparency.'}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50/50 to-white">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-green-600" />
            <span className="font-bold text-lg">Data Proof</span>
          </div>
          <Badge variant="outline" className="text-xs">Powered by 1Person</Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        {/* Title */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <Lock className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{data.companyName}</h1>
          <p className="text-muted-foreground">
            This page proves that {data.companyName}'s AI data is stored securely
            and has not been tampered with.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-5 text-center">
              <FileText className="w-6 h-6 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{data.documentCount || 0}</p>
              <p className="text-xs text-muted-foreground">Documents Stored</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-5 text-center">
              <Search className="w-6 h-6 text-purple-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{data.queryCount || 0}</p>
              <p className="text-xs text-muted-foreground">AI Queries Made</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-5 text-center">
              <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{data.auditEntryCount || 0}</p>
              <p className="text-xs text-muted-foreground">Verified Actions</p>
            </CardContent>
          </Card>
        </div>

        {/* Data Isolation Statement */}
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-900">Data Isolation Guaranteed</p>
                <ul className="mt-2 space-y-1.5 text-sm text-green-800">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    All documents are stored in an isolated namespace
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    No data is shared with other companies
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Every action is logged with a chain-linked verification code
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Records cannot be modified without breaking the verification chain
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live Verification */}
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold">Live Verification</p>
                <p className="text-sm text-muted-foreground">
                  Check data integrity right now — verify that no records have been tampered with
                </p>
              </div>
              <Button onClick={handleVerify} disabled={verifying} className="gap-2 bg-green-600 hover:bg-green-700">
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {verifying ? 'Checking...' : 'Run Verification'}
              </Button>
            </div>

            {verifyResult && (
              <div className={`p-4 rounded-lg ${verifyResult.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-center gap-3">
                  {verifyResult.valid ? (
                    <ShieldCheck className="w-10 h-10 text-green-600" />
                  ) : (
                    <ShieldAlert className="w-10 h-10 text-red-600" />
                  )}
                  <div>
                    <p className={`font-bold text-lg ${verifyResult.valid ? 'text-green-900' : 'text-red-900'}`}>
                      {verifyResult.valid ? 'All Data Verified' : 'Integrity Issue Detected'}
                    </p>
                    <p className={`text-sm ${verifyResult.valid ? 'text-green-700' : 'text-red-700'}`}>
                      {verifyResult.entriesChecked || 0} records checked
                      {' / '}
                      {verifyResult.documentsChecked || 0} documents verified
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Verified at {new Date().toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* How it works */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="pt-5 pb-5">
            <p className="font-semibold mb-3">How Verification Works</p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0 text-xs font-bold text-green-700">1</div>
                <p className="text-sm text-muted-foreground">Every action (upload, query, change) is recorded with a unique verification code</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0 text-xs font-bold text-green-700">2</div>
                <p className="text-sm text-muted-foreground">Each record is linked to the previous one — creating an unbreakable chain</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0 text-xs font-bold text-green-700">3</div>
                <p className="text-sm text-muted-foreground">If anyone modifies a past record, the chain breaks — making tampering instantly detectable</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0 text-xs font-bold text-green-700">4</div>
                <p className="text-sm text-muted-foreground">Document files are verified by comparing their original fingerprint with the current file</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center pt-4 pb-8">
          <p className="text-xs text-muted-foreground">
            This proof page is publicly accessible. No login required.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Data transparency powered by <a href="/" className="text-primary hover:underline">1Person AI</a>
          </p>
        </div>
      </div>
    </div>
  );
}
