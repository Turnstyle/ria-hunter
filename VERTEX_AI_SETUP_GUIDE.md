# Complete Vertex AI Setup Guide for RIA Hunter

## Overview

This guide provides step-by-step instructions for setting up and enabling Vertex AI for the RIA Hunter project. We'll use the existing service account `docs-ai-service-account` which is already configured with the necessary permissions.

## Prerequisites

- Google Cloud account with billing enabled
- Access to the `ria-hunter-backend` project
- Basic familiarity with Google Cloud Console

## Step 1: Enable the Vertex AI API

1. **Go to the API Library**: https://console.cloud.google.com/apis/library?project=ria-hunter-backend
2. **Search for "Vertex AI"**
3. **Click "Enable"** (or "Manage" if already enabled)
4. Wait for the API to be enabled (can take 1-2 minutes)

## Step 2: Enable Access to Gemini Models

1. **Go to Vertex AI Model Garden**: https://console.cloud.google.com/vertex-ai/model-garden?project=ria-hunter-backend
2. **Search for "Gemini"**
3. **Select "Gemini Pro"** (gemini-pro)
4. If not already enabled, click "Enable" or "Get Access"
5. Accept any terms and conditions that appear

## Step 3: Verify Service Account Access

The existing `docs-ai-service-account` should already have the necessary permissions. To verify:

1. **Go to IAM & Admin**: https://console.cloud.google.com/iam-admin/iam?project=ria-hunter-backend
2. **Find the service account** named `docs-ai-service-account`
3. **Verify it has** at least the following roles:
   - Vertex AI User
   - Service Account Token Creator

If these roles are missing, click the edit button (pencil icon) and add them.

## Step 4: Update Environment Variables

1. Ensure your `.env` file contains these variables:
   ```
   # AI Provider Configuration
   AI_PROVIDER=vertex
   GOOGLE_CLOUD_PROJECT=ria-hunter-backend
   GOOGLE_PROJECT_ID=ria-hunter-backend
   GOOGLE_APPLICATION_CREDENTIALS=./gcp-key.json
   ```

2. Ensure the `gcp-key.json` file is in the project root directory and has the service account credentials.

## Step 5: Update Model Names in Code

Our code has been updated to use the correct model names. If you're creating new code, use these model names:

```javascript
// For text generation
generativeModel: vertexAI.getGenerativeModel({ 
  model: 'gemini-pro',  // This is the newer model name format
  generationConfig: {
    temperature: 0.3,
    topP: 0.8,
    maxOutputTokens: 300
  }
})

// For embeddings
textEmbedding: vertexAI.getGenerativeModel({ 
  model: 'textembedding-gecko',  // This is the correct model name
  dimensions: 768
})
```

## Step 6: Test Vertex AI Access

Run the following command to test Vertex AI access:

```bash
node scripts/etl_narrative_generator.js
```

If successful, you should see:
```
✅ Vertex AI initialized successfully with Gemini 1.0 Pro
```

## Troubleshooting

### Model Not Found Error

If you see errors like:
```
Publisher Model `projects/ria-hunter-backend/locations/us-central1/publishers/google/models/gemini-pro` was not found or your project does not have access to it.
```

Possible solutions:
1. Try enabling the model in Vertex AI Model Garden
2. Verify the model name is correct - try both `gemini-pro` and `gemini-1.0-pro-001` formats
3. Ensure billing is enabled for the project

### Authentication Errors

If you see errors about authentication:
1. Verify the `GOOGLE_APPLICATION_CREDENTIALS` path is correct
2. Check the service account has the proper roles
3. Regenerate the service account key if needed

## API Documentation

For more details on using the Vertex AI API:
- [Vertex AI documentation](https://cloud.google.com/vertex-ai/docs)
- [Gemini API reference](https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini)
- [Text embeddings documentation](https://cloud.google.com/vertex-ai/docs/generative-ai/embeddings/get-text-embeddings)

## Switching Between OpenAI and Vertex AI

The system is designed to use either OpenAI or Vertex AI based on the `AI_PROVIDER` environment variable:

- To use Vertex AI: `AI_PROVIDER=vertex`
- To use OpenAI: `AI_PROVIDER=openai` (requires `OPENAI_API_KEY` to be set)

When using Vertex AI, the system will automatically fall back to OpenAI if there's an issue with Vertex AI access.

## Cost Considerations

- Gemini Pro pricing: https://cloud.google.com/vertex-ai/pricing#generative_ai_models
- Embedding model pricing: https://cloud.google.com/vertex-ai/pricing#embeddings

Most operations fall within the free tier limits for both models, but be aware of potential costs for high-volume usage.
