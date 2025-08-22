# Deployment and Verification Guide

This guide provides steps to deploy the RIA Hunter backend with the latest changes and verify that everything is working correctly.

## Deployment Steps

1. **Commit all changes to the repository**:
   ```bash
   git add .
   git commit -m "Backend enhancements: API improvements, error handling, CORS, auth, and documentation"
   git push origin main
   ```

2. **Deploy to Vercel**:
   - Deploy the application to Vercel either through the Vercel dashboard or using the Vercel CLI:
   ```bash
   vercel --prod
   ```

3. **Set Required Environment Variables**:
   Ensure all required environment variables are set in the Vercel dashboard:

   - Database:
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   - AI Provider:
     - `AI_PROVIDER` (set to 'openai' or 'vertex')
     - `OPENAI_API_KEY` (if using OpenAI)
     - `GOOGLE_CLOUD_PROJECT` (if using Vertex AI)

   - CORS:
     - `CORS_ORIGINS=https://ria-hunter.app,https://www.ria-hunter.app,https://ria-hunter-app.vercel.app`
     - `ALLOW_ALL_ORIGINS=false` (set to 'true' only for development)

   - Authentication:
     - `JWT_SECRET`
     - `NEXTAUTH_URL`
     - `NEXTAUTH_SECRET`

   - Stripe (if applicable):
     - `STRIPE_SECRET_KEY`
     - `STRIPE_WEBHOOK_SECRET`
     - `STRIPE_PRICE_ID`

   - Other:
     - `FRONTEND_URL`

## Verification Steps

After deployment, follow these steps to verify the changes:

### 1. Test CORS Configuration

Test that CORS is correctly configured by making requests from different origins:

```bash
# Should succeed (authorized origin)
curl -X OPTIONS -H "Origin: https://ria-hunter.app" -H "Access-Control-Request-Method: POST" https://api.ria-hunter.app/api/ask

# Should fail (unauthorized origin)
curl -X OPTIONS -H "Origin: https://example.com" -H "Access-Control-Request-Method: POST" https://api.ria-hunter.app/api/ask
```

### 2. Test /api/ask Endpoint with New Parameters

Test the `/api/ask` endpoint with the new `maxResults` and `includeDetails` parameters:

```bash
# Test with maxResults=5 and includeDetails=false
curl -X POST -H "Content-Type: application/json" -d '{"query":"Top investment advisors in California", "maxResults": 5, "includeDetails": false}' https://api.ria-hunter.app/api/ask

# Test with maxResults=2 and includeDetails=true
curl -X POST -H "Content-Type: application/json" -d '{"query":"Top investment advisors in New York", "maxResults": 2, "includeDetails": true}' https://api.ria-hunter.app/api/ask
```

### 3. Test Deprecated Endpoint

Verify that the deprecated endpoint returns a 410 Gone status with appropriate information:

```bash
curl -X GET https://api.ria-hunter.app/api/v1/ria/query?query=test
```

### 4. Test Error Handling

Test that errors are returned in the standardized format:

```bash
# Test bad request (missing query)
curl -X POST -H "Content-Type: application/json" -d '{}' https://api.ria-hunter.app/api/ask

# Test rate limiting (anonymous user, after 2 requests)
# (Make 3 requests and the 3rd should fail)
```

### 5. Test Authentication and Rate Limiting

- Use a test account to make multiple queries and verify rate limiting works as expected
- Test with a subscriber account to ensure unlimited queries work
- Test with anonymous user to verify the 2-query limit

### 6. Browser Testing

Test all endpoints in a browser environment with the actual frontend application:

1. Navigate to `https://ria-hunter.app` (or your staging environment)
2. Use the search functionality to test queries
3. Check browser console for any CORS errors
4. Verify the application functions correctly with the updated backend

### 7. Check Logs

After testing, check the Vercel logs for any errors or warnings that might indicate issues with the deployment.

## Rollback Plan

If any issues are discovered during verification:

1. **Fix and redeploy**: If issues are minor, fix them and redeploy
2. **Rollback**: If issues are critical, rollback to the previous version:
   ```bash
   vercel rollback
   ```

## Contact

If you encounter any issues with the deployment, contact the development team:
- Email: [team@ria-hunter.app](mailto:team@ria-hunter.app)
- GitHub Issues: [ria-hunter repository](https://github.com/turnstyle/ria-hunter/issues)
