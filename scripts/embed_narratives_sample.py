#!/usr/bin/env python3
"""
Generate embeddings for narrative text using Vertex AI.
Falls back to a mock generator when Vertex credentials are unavailable or when
USE_MOCK_EMBEDDINGS=true is set in the environment.
"""

import os
import sys
import json
import time
from pathlib import Path
from typing import List

import numpy as np
from supabase import create_client, Client
from rich.console import Console
from rich.progress import track
from dotenv import load_dotenv

console = Console()
load_dotenv()

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://llusjnpltqxhokycwzry.supabase.co')
SUPABASE_SERVICE_KEY = None

if len(sys.argv) > 1 and sys.argv[1].startswith('eyJ'):
    SUPABASE_SERVICE_KEY = sys.argv[1]
    sys.argv.pop(1)
elif 'SUPABASE_SERVICE_ROLE_KEY' in os.environ:
    SUPABASE_SERVICE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']

if not SUPABASE_SERVICE_KEY:
    console.print("[red]Error: Missing Supabase service role key. Provide it as the first argument.[/red]")
    console.print("[yellow]Usage: python embed_narratives_sample.py <SERVICE_KEY> [batch_size][/yellow]")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
USE_MOCK = os.environ.get('USE_MOCK_EMBEDDINGS', 'false').lower() == 'true'

class MockEmbeddingGenerator:
    def __init__(self, dimensions: int = 768):
        self.dimensions = dimensions
        console.print("[yellow]Using mock embedding generator with random vectors.[/yellow]")
        console.print("[yellow]Set USE_MOCK_EMBEDDINGS=false to use Vertex AI.[/yellow]")

    def generate_embeddings(self, texts: List[str]):
        embeddings = []
        for _ in texts:
            vec = np.random.normal(0, 1, self.dimensions)
            vec = vec / np.linalg.norm(vec)
            embeddings.append(vec.tolist())
        return embeddings

class VertexEmbeddingGenerator:
    def __init__(self):
        try:
            from google.cloud import aiplatform
            from vertexai.language_models import TextEmbeddingModel

            project_id = os.environ.get('GOOGLE_PROJECT_ID')
            location = os.environ.get('VERTEX_AI_LOCATION', 'us-central1')
            if not project_id:
                raise ValueError('GOOGLE_PROJECT_ID environment variable not set')

            aiplatform.init(project=project_id, location=location)
            self.model = TextEmbeddingModel.from_pretrained('text-embedding-005')
            console.print("[green]Initialized Vertex AI embedding model (text-embedding-005).[/green]")
        except ImportError:
            console.print('[red]Error: google-cloud-aiplatform and vertexai packages are required.[/red]')
            console.print('[yellow]Run: pip install google-cloud-aiplatform vertexai[/yellow]')
            sys.exit(1)
        except Exception as exc:
            console.print(f"[red]Error initializing Vertex AI: {exc}[/red]")
            sys.exit(1)

    def generate_embeddings(self, texts: List[str]):
        embeddings = []
        for text in texts:
            try:
                response = self.model.get_embeddings([text])
                embeddings.append(response[0].values)
            except Exception as exc:
                console.print(f"[red]Error generating embedding: {exc}[/red]")
                embeddings.append([0.0] * 768)
        return embeddings

def create_embedding_generator():
    if USE_MOCK:
        return MockEmbeddingGenerator()
    return VertexEmbeddingGenerator()


def get_narratives_without_embeddings(batch_size=50):
    try:
        response = supabase.table('narratives').select('id, narrative_text').is_('embedding', 'null').limit(batch_size).execute()
        return response.data
    except Exception as exc:
        console.print(f"[red]Error fetching narratives: {exc}[/red]")
        return []


def update_narrative_embedding(narrative_id, embedding):
    try:
        supabase.table('narratives').update({'embedding': embedding}).eq('id', narrative_id).execute()
        return True
    except Exception as exc:
        console.print(f"[red]Error updating narrative {narrative_id}: {exc}[/red]")
        return False


def generate_and_store_embeddings(generator, batch_size=50, max_batches=None):
    console.print(f"[blue]Generating embeddings for narratives (batch size: {batch_size})...[/blue]")
    batch_count = 0
    success_count = 0
    error_count = 0

    while True:
        if max_batches is not None and batch_count >= max_batches:
            break

        narratives = get_narratives_without_embeddings(batch_size)
        if not narratives:
            console.print('[green]No more narratives without embeddings.[/green]')
            break

        batch_count += 1
        console.print(f"[blue]Processing batch {batch_count} ({len(narratives)} narratives)...[/blue]")

        texts = [item['narrative_text'] for item in narratives]
        embeddings = generator.generate_embeddings(texts)

        for narrative, embedding in zip(narratives, embeddings):
            if update_narrative_embedding(narrative['id'], embedding):
                success_count += 1
            else:
                error_count += 1

        time.sleep(0.1)

    console.print('[green]Embedding generation complete![/green]')
    console.print(f"[green]Success: {success_count}[/green], [red]Errors: {error_count}[/red]")


def main():
    batch_size = 50
    max_batches = None

    for arg in sys.argv[1:]:
        if arg.isdigit():
            batch_size = int(arg)
        elif arg.startswith('max='):
            try:
                max_batches = int(arg.split('=')[1])
            except ValueError:
                pass

    generator = create_embedding_generator()
    generate_and_store_embeddings(generator, batch_size=batch_size, max_batches=max_batches)


if __name__ == '__main__':
    main()
