'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Edit3, Globe, Users, Target, Package, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DetectedInfo, WebsiteAnalysis } from '@/lib/ftux/types';

interface BusinessConfirmationViewProps {
  detectedInfo: DetectedInfo;
  websiteAnalysis: WebsiteAnalysis | null;
  companyName: string;
  onConfirm: () => void;
  onBack: () => void;
}

export function BusinessConfirmationView({
  detectedInfo,
  websiteAnalysis,
  companyName,
  onConfirm,
  onBack,
}: BusinessConfirmationViewProps) {
  const [isEditing, setIsEditing] = useState(false);

  const businessInfo = websiteAnalysis?.businessInfo;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-4"
          >
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          </motion.div>
          <h2 className="text-2xl font-bold mb-2">We understand your business</h2>
          <p className="text-muted-foreground">
            Confirm these details so we can build the perfect AI team
          </p>
        </div>

        {/* Business Summary */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="mb-6">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold">{businessInfo?.companyName || companyName}</h3>
                  {websiteAnalysis && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-medium text-muted-foreground">AI Confidence:</span>
                      <span className={`text-xs font-bold ${
                        (websiteAnalysis as any).businessInfo?.confidence >= 0.7 ? 'text-green-600' :
                        (websiteAnalysis as any).businessInfo?.confidence >= 0.4 ? 'text-amber-600' :
                        'text-red-600'
                      }`}>
                        {Math.round(((websiteAnalysis as any).businessInfo?.confidence || 0) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                  className="gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  Edit
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Target className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Market</p>
                    <p className="font-medium">{businessInfo?.market || detectedInfo.market}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Package className="w-5 h-5 text-purple-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Business Model</p>
                    <p className="font-medium">{businessInfo?.model || detectedInfo.model}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Target Audience</p>
                    <p className="font-medium">{businessInfo?.audience || 'General audience'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Strategy</p>
                    <p className="font-medium">{businessInfo?.strategy || detectedInfo.strategy}</p>
                  </div>
                </div>
              </div>

              {/* Offerings */}
              {businessInfo?.offerings && businessInfo.offerings.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Core Offerings</p>
                  <div className="flex flex-wrap gap-2">
                    {businessInfo.offerings.map((offering, i) => (
                      <Badge key={i} variant="secondary">{offering}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* SEO Score (if website was analyzed) */}
        {websiteAnalysis?.seoAudit && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-500" />
                    <h3 className="font-semibold">Website SEO Score</h3>
                  </div>
                  <div className={`text-2xl font-bold ${
                    websiteAnalysis.seoAudit.score >= 80 ? 'text-green-600' :
                    websiteAnalysis.seoAudit.score >= 50 ? 'text-amber-600' :
                    'text-red-600'
                  }`}>
                    {websiteAnalysis.seoAudit.score}/100
                  </div>
                </div>

                {websiteAnalysis.seoAudit.missingElements.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-red-600">Issues Found:</p>
                    {websiteAnalysis.seoAudit.missingElements.slice(0, 3).map((issue, i) => (
                      <p key={i} className="text-sm text-muted-foreground">• {issue}</p>
                    ))}
                    {websiteAnalysis.seoAudit.missingElements.length > 3 && (
                      <p className="text-sm text-muted-foreground">
                        +{websiteAnalysis.seoAudit.missingElements.length - 3} more issues
                      </p>
                    )}
                  </div>
                )}

                {/* Social Profiles */}
                {websiteAnalysis.socialProfiles.some(s => s.detected) && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Social Profiles Detected</p>
                    <div className="flex gap-2">
                      {websiteAnalysis.socialProfiles.filter(s => s.detected).map((profile, i) => (
                        <Badge key={i} variant="outline">{profile.platform}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex gap-3 justify-center"
        >
          <Button variant="outline" onClick={onBack}>
            Start Over
          </Button>
          <Button
            onClick={onConfirm}
            size="lg"
            className="gap-2 bg-gradient-to-r from-primary to-purple-500"
          >
            <CheckCircle2 className="w-4 h-4" />
            Confirm & Build My Team
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
