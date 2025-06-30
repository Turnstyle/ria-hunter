import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Search, TrendingUp, Users, Database } from 'lucide-react'

export default function RIAHunterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            RIA Hunter
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Advanced search and analysis platform for Registered Investment Advisors. 
            Find, analyze, and connect with RIAs using AI-powered insights.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <Card className="text-center">
            <CardHeader>
              <Search className="h-12 w-12 mx-auto text-blue-600 mb-4" />
              <CardTitle>Smart Search</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                AI-powered search across comprehensive RIA database with advanced filtering
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <TrendingUp className="h-12 w-12 mx-auto text-green-600 mb-4" />
              <CardTitle>Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Deep insights into AUM, growth trends, and investment strategies
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Users className="h-12 w-12 mx-auto text-purple-600 mb-4" />
              <CardTitle>Team Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Analyze team composition, experience, and key personnel
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Database className="h-12 w-12 mx-auto text-orange-600 mb-4" />
              <CardTitle>Comprehensive Data</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Real-time data from SEC filings, regulatory updates, and market sources
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-3xl">Coming Soon</CardTitle>
              <CardDescription className="text-lg">
                RIA Hunter is currently in development. Join our waitlist to be the first to access 
                our powerful RIA search and analysis platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/">
                  <Button size="lg" className="w-full sm:w-auto">
                    Join Waitlist
                  </Button>
                </Link>
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Learn More
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
} 