'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, ArrowRight, Settings, Loader2 } from 'lucide-react';
import { useCompanies } from '@/lib/api/hooks';

export default function CompaniesPage() {
  const { data: companies, isLoading } = useCompanies();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const companyList = companies || [];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your Companies</h1>
          <p className="text-muted-foreground">Manage your AI-powered businesses</p>
        </div>
        <Link href="/welcome">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Company
          </Button>
        </Link>
      </div>

      {/* Companies Grid */}
      <div className="grid gap-6">
        {companyList.map((company, i) => (
          <motion.div
            key={company.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="overflow-hidden hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row">
                  {/* Company Info */}
                  <div className="flex-1 p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-7 h-7 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h2 className="text-xl font-semibold">{company.name}</h2>
                          <Badge
                            variant={company.status === 'active' ? 'success' : 'secondary'}
                            className="capitalize"
                          >
                            {company.status}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-sm mt-1">{company.industry || 'No industry set'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex md:flex-col items-center justify-center gap-2 p-4 md:p-6 border-t md:border-t-0 md:border-l bg-muted/30">
                    {company.status === 'active' ? (
                      <>
                        <Link href={`/${company.id}`} className="flex-1 md:w-full">
                          <Button className="w-full gap-2">
                            Dashboard
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Link href={`/${company.id}/settings`}>
                          <Button variant="outline" size="icon">
                            <Settings className="w-4 h-4" />
                          </Button>
                        </Link>
                      </>
                    ) : (
                      <Link href={`/${company.id}`}>
                        <Button className="gap-2">
                          {company.status === 'setup' ? 'Complete Setup' : 'Open'}
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {/* Empty state */}
        {companyList.length === 0 && (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No companies yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first AI-powered company to get started
            </p>
            <Link href="/welcome">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Create Company
              </Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
