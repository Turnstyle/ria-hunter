#!/usr/bin/env python3
"""
Generate embeddings for narrative text using Vertex AI or another embeddings API.
This script is a simplified version for demo purposes that uses a mock embedding
generator when the real AI provider isn't available.
"""

import os
import sys
import json
import numpy as np
import time
from pathlib import Path
from supabase import create_client, Client
from rich.console import Console
from rich.progress import track
from dotenv import load_dotenv

console = Console()

# Set Supabase configuration directly - would be from environment in production
SUPABASE_URL = 'https://llusjnpltqxhokycwzry.supabase.co'
SUPABASE_SERVICE_KEY = None  # Will be provided via command line

if len(sys.argv) > 1 and sys.argv[1].startswith('eyJ'):
    SUPABASE_SERVICE_KEY = sys.argv[1]
    # Remove the key from sys.argv to not interfere with other arguments
    sys.argv.pop(1)
elif 'SUPABASE_SERVICE_ROLE_KEY' in os.environ:
    SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_SERVICE_KEY:
    console.print("[red]Error: Missing Supabase service role key. Please provide it as the first argument.[/red]")
    console.print("[yellow]Usage: python embed_narratives_sample.py <SERVICE_KEY> [batch_size][/yellow]")
    sys.exit(1)

# Create Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Determine which embedding service to use
AI_PROVIDER = os.environ.get('AI_PROVIDER', 'mock')

class MockEmbeddingGenerator:
    """
    Mock embedding generator for demonstration purposes.
    In a real system, this would be replaced with calls to OpenAI or Vertex AI.
    """
    def __init__(self, dimensions=384):
        self.dimensions = dimensions
        console.print("[yellow]Using mock embedding generator with random vectors.[/yellow]")
        console.print("[yellow]For production, set AI_PROVIDER to 'vertex' or 'openai' and configure API keys.[/yellow]")
    
    def generate_embeddings(self, texts):
        """Generate random unit vectors as mock embeddings."""
        embeddings = []
        for _ in texts:
            # Create a random vector
            vec = np.random.normal(0, 1, self.dimensions)
            # Normalize to unit length for cosine similarity
            vec = vec / np.linalg.norm(vec)
            embeddings.append(vec.tolist())
        return embeddings

class VertexEmbeddingGenerator:
    """Generate embeddings using Vertex AI API."""
    def __init__(self):
        try:
            from google.cloud import aiplatform
            from vertexai.language_models import TextEmbeddingModel
            
            # Initialize Vertex AI
            project_id = os.environ.get('GOOGLE_PROJECT_ID')
            if not project_id:
                raise ValueError("GOOGLE_PROJECT_ID environment variable not set")
            
            # Initialize the model
            aiplatform.init(project=project_id)
            self.model = TextEmbeddingModel.from_pretrained("textembedding-gecko@003")
            console.print("[green]Initialized Vertex AI embedding model.[/green]")
            
        except ImportError:
            console.print("[red]Error: google-cloud-aiplatform and/or vertexai packages not installed.[/red]")
            console.print("[yellow]Run: pip install google-cloud-aiplatform vertexai[/yellow]")
            sys.exit(1)
        except Exception as e:
            console.print(f"[red]Error initializing Vertex AI: {e}[/red]")
            sys.exit(1)
    
    def generate_embeddings(self, texts):
        """Generate embeddings using Vertex AI."""
        embeddings = []
        
        for text in texts:
            try:
                # Get the embedding
                response = self.model.get_embeddings([text])
                embeddings.append(response[0].values)
            except Exception as e:
                console.print(f"[red]Error generating embedding: {e}[/red]")
                # Return a zero vector as a fallback
                embeddings.append([0.0] * 384)
        
        return embeddings

class OpenAIEmbeddingGenerator:
    """Generate embeddings using OpenAI API."""
    def __init__(self):
        try:
            from openai import OpenAI
            
            api_key = os.environ.get('OPENAI_API_KEY')
            if not api_key:
                raise ValueError("OPENAI_API_KEY environment variable not set")
            
            self.client = OpenAI(api_key=api_key)
            self.model = "text-embedding-3-small"  # 1536 dimensions
            console.print("[green]Initialized OpenAI embedding model.[/green]")
            
        except ImportError:
            console.print("[red]Error: openai package not installed.[/red]")
            console.print("[yellow]Run: pip install openai[/yellow]")
            sys.exit(1)
        except Exception as e:
            console.print(f"[red]Error initializing OpenAI: {e}[/red]")
            sys.exit(1)
    
    def generate_embeddings(self, texts):
        """Generate embeddings using OpenAI."""
        embeddings = []
        
        try:
            # Get embeddings for all texts at once
            response = self.client.embeddings.create(
                model=self.model,
                input=texts
            )
            embeddings = [item.embedding for item in response.data]
            
        except Exception as e:
            console.print(f"[red]Error generating OpenAI embeddings: {e}[/red]")
            # Return zero vectors as fallback
            embeddings = [[0.0] * 1536 for _ in texts]
        
        return embeddings

def create_embedding_generator():
    """Create the appropriate embedding generator based on AI_PROVIDER."""
    if AI_PROVIDER.lower() == 'vertex':
        return VertexEmbeddingGenerator()
    elif AI_PROVIDER.lower() == 'openai':
        return OpenAIEmbeddingGenerator()
    else:
        return MockEmbeddingGenerator()

def get_narratives_without_embeddings(batch_size=50):
    """Get narratives that don't have embeddings yet."""
    try:
        response = supabase.table('narratives').select('id, narrative_text').is_('embedding', 'null').limit(batch_size).execute()
        return response.data
    except Exception as e:
        console.print(f"[red]Error fetching narratives: {e}[/red]")
        return []

def update_narrative_embedding(narrative_id, embedding):
    """Update a narrative with its embedding."""
    try:
        supabase.table('narratives').update({'embedding': embedding}).eq('id', narrative_id).execute()
        return True
    except Exception as e:
        console.print(f"[red]Error updating narrative {narrative_id}: {e}[/red]")
        return False

def generate_and_store_embeddings(generator, batch_size=50, max_batches=None):
    """
    Generate embeddings for narratives and store them in the database.
    
    Args:
        generator: The embedding generator to use
        batch_size: Number of narratives to process in each batch
        max_batches: Maximum number of batches to process (None for all)
    """
    console.print(f"[blue]Generating embeddings for narratives (batch size: {batch_size})...[/blue]")
    
    batch_count = 0
    success_count = 0
    error_count = 0
    
    while True:
        # Check if we've reached the maximum number of batches
        if max_batches is not None and batch_count >= max_batches:
            break
        
        # Get narratives without embeddings
        narratives = get_narratives_without_embeddings(batch_size)
        if not narratives:
            console.print("[green]No more narratives without embeddings.[/green]")
            break
        
        batch_count += 1
        console.print(f"[blue]Processing batch {batch_count} ({len(narratives)} narratives)...[/blue]")
        
        # Extract narrative texts and IDs
        narrative_texts = [n['narrative_text'] for n in narratives]
        narrative_ids = [n['id'] for n in narratives]
        
        # Generate embeddings
        embeddings = generator.generate_embeddings(narrative_texts)
        
        # Update narratives with embeddings
        for narrative_id, embedding in zip(narrative_ids, embeddings):
            if update_narrative_embedding(narrative_id, embedding):
                success_count += 1
            else:
                error_count += 1
        
        # Introduce a small delay to avoid rate limiting
        time.sleep(0.5)
    
    # Final summary
    console.print("\n[bold green]Embedding generation complete![/bold green]")
    console.print(f"Processed {batch_count} batches")
    console.print(f"Successfully updated {success_count} narratives")
    console.print(f"Errors: {error_count}")

def main():
    """Main function to generate and store embeddings."""
    console.print("[bold blue]Starting narrative embedding generation...[/bold blue]")
    
    # Get batch size from command line
    batch_size = 50
    if len(sys.argv) > 1:
        try:
            batch_size = int(sys.argv[1])
        except ValueError:
            console.print("[yellow]Invalid batch size, using default of 50[/yellow]")
    
    # Create embedding generator
    generator = create_embedding_generator()
    
    # Generate and store embeddings
    generate_and_store_embeddings(generator, batch_size)

if __name__ == "__main__":
    main()
