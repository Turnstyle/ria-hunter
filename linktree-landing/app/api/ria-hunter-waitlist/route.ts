import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.json();

    // **IMPORTANT**: In a real application, you would:
    // 1. Validate the formData (e.g., using Zod).
    // 2. Save the data to your database (e.g., Supabase).
    // 3. Send an email notification to yourself (e.g., turnerpeters@gmail.com)
    //    using a service like Nodemailer, Resend, SendGrid, or Vercel Email.

    // For now, we'll just log it to the console for demonstration.
    console.log("RIA Hunter Waitlist Submission:", formData);

    // Constructing a specific subject line for emails
    const emailSubject = `New RIA Hunter Waitlist Request: ${formData.name} - ${formData.email}`;
    console.log("Email Subject Line would be:", emailSubject);
    // When sending email, use `emailSubject`

    // Simulate success
    return NextResponse.json({ message: "Successfully added to waitlist!" }, { status: 200 });

  } catch (error) {
    console.error("Waitlist API Error:", error);
    let errorMessage = "An unexpected error occurred.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ message: "Error submitting to waitlist.", error: errorMessage }, { status: 500 });
  }
} 