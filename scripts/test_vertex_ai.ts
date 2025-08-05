// Test Vertex AI connection
import { VertexAI } from '@google-cloud/vertexai';

const projectId = process.env.GOOGLE_PROJECT_ID || 'ria-hunter-backend';
const location = 'us-central1';

console.log('Testing Vertex AI connection...');
console.log('Project ID:', projectId);
console.log('Location:', location);
console.log('Credentials file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);

try {
  const vertex = new VertexAI({ 
    project: projectId,
    location: location 
  });

  const model = 'gemini-1.5-flash';
  
  console.log('\nInitializing model:', model);
  
  const generativeModel = vertex.preview.getGenerativeModel({
    model: model,
    generationConfig: {
      maxOutputTokens: 256,
      temperature: 0.7,
    },
  });

  console.log('\nSending test prompt...');
  
  const request = {
    contents: [{ role: 'user', parts: [{ text: 'Say "Hello, Vertex AI is working!"' }] }],
  };

  generativeModel.generateContent(request)
    .then(result => {
      const response = result.response;
      
      if (response.candidates && response.candidates[0].content.parts[0].text) {
        console.log('\n✅ Success! Response:', response.candidates[0].content.parts[0].text);
      } else {
        console.log('\n❌ No response received');
      }
    })
    .catch(error => {
      console.error('\n❌ Error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    });
  
} catch (error: any) {
  console.error('\n❌ Setup Error:', error.message);
}