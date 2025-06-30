import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Brain, Zap, Shield, Code } from 'lucide-react'

export default function AppFoundationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            App Foundation
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Enterprise AI/ML infrastructure platform powering next-generation applications 
            with advanced search, analysis, and intelligence capabilities.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <Card className="text-center">
            <CardHeader>
              <Brain className="h-12 w-12 mx-auto text-purple-600 mb-4" />
              <CardTitle>AI/ML Engine</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Advanced machine learning models for intelligent data processing and insights
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Zap className="h-12 w-12 mx-auto text-yellow-600 mb-4" />
              <CardTitle>High Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Lightning-fast processing with scalable cloud infrastructure
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Shield className="h-12 w-12 mx-auto text-green-600 mb-4" />
              <CardTitle>Enterprise Security</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Bank-grade security with compliance and data protection built-in
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Code className="h-12 w-12 mx-auto text-blue-600 mb-4" />
              <CardTitle>Developer APIs</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                RESTful APIs and SDKs for seamless integration with your applications
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-3xl">Enterprise Ready</CardTitle>
              <CardDescription className="text-lg">
                App Foundation provides the AI/ML infrastructure that powers RIA Hunter and other 
                intelligent applications. Contact us to learn about enterprise licensing and custom solutions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/">
                  <Button size="lg" className="w-full sm:w-auto">
                    Contact Sales
                  </Button>
                </Link>
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  View Documentation
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
} 