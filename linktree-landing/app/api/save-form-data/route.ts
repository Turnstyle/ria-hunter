import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define the path to the submissions file
const submissionsFilePath = path.join(process.cwd(), 'form_submissions.txt');

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Add a timestamp to the data
    const timestamp = new Date().toISOString();
    const entry = `Timestamp: ${timestamp}\nData: ${JSON.stringify(data)}\n---\n`;

    // Append data to the file
    fs.appendFileSync(submissionsFilePath, entry);

    return NextResponse.json({ message: 'Data saved successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error saving form data:', error);
    return NextResponse.json({ message: 'Error saving data', error: (error as Error).message }, { status: 500 });
  }
} 