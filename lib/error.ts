/**
 * Centralized error handling utilities for API routes
 */
import { NextResponse } from 'next/server';

export type ApiErrorCode = 
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'PAYMENT_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ENDPOINT_DEPRECATED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export interface ApiErrorResponse {
  error: string;
  code: ApiErrorCode;
  detail?: any;
}

/**
 * Generate a standardized API error response
 * 
 * @param status HTTP status code
 * @param message User-friendly error message
 * @param code Error code for programmatic handling
 * @param detail Optional detailed error information (not exposed in production)
 * @returns NextResponse with JSON error body
 */
export function apiError(
  status: number, 
  message: string, 
  code: ApiErrorCode,
  detail?: any
): NextResponse {
  // Log the error for server-side visibility
  console.error(`API Error [${status} ${code}]:`, message, detail ? `\nDetails: ${JSON.stringify(detail, null, 2)}` : '');
  
  // In production, strip sensitive details from the response
  const isProd = process.env.NODE_ENV === 'production';
  const errorBody: ApiErrorResponse = {
    error: message,
    code: code,
    ...(isProd ? {} : { detail })
  };

  return NextResponse.json(errorBody, { status });
}

/**
 * Bad Request (400) error constructor
 */
export function badRequest(message: string, detail?: any): NextResponse {
  return apiError(400, message, 'BAD_REQUEST', detail);
}

/**
 * Unauthorized (401) error constructor
 */
export function unauthorized(message: string = 'Authentication required', detail?: any): NextResponse {
  return apiError(401, message, 'UNAUTHORIZED', detail);
}

/**
 * Payment Required (402) error constructor
 */
export function paymentRequired(message: string, remaining: number, isSubscriber: boolean): NextResponse {
  return apiError(402, message, 'PAYMENT_REQUIRED', { 
    remaining,
    isSubscriber,
    upgradeRequired: true 
  });
}

/**
 * Forbidden (403) error constructor
 */
export function forbidden(message: string = 'Access denied', detail?: any): NextResponse {
  return apiError(403, message, 'FORBIDDEN', detail);
}

/**
 * Not Found (404) error constructor
 */
export function notFound(message: string = 'Resource not found', detail?: any): NextResponse {
  return apiError(404, message, 'NOT_FOUND', detail);
}

/**
 * Gone (410) error constructor for deprecated endpoints
 */
export function deprecated(message: string, alternatives: { endpoint: string, description: string }[]): NextResponse {
  return apiError(410, message, 'ENDPOINT_DEPRECATED', { alternatives });
}

/**
 * Internal Server Error (500) error constructor
 */
export function internalError(message: string = 'An internal error occurred', error?: Error): NextResponse {
  let detail: any = undefined;
  
  // Extract useful error information without exposing sensitive details
  if (error) {
    detail = {
      message: error.message,
      name: error.name,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    };
  }
  
  return apiError(500, message, 'INTERNAL_ERROR', detail);
}

/**
 * Service Unavailable (503) error constructor
 */
export function serviceUnavailable(message: string = 'Service temporarily unavailable', detail?: any): NextResponse {
  return apiError(503, message, 'SERVICE_UNAVAILABLE', detail);
}
