/**
 * CasRes SMS Opt-In API Handler
 * 
 * This handles form submissions and integrates with:
 * - Twilio for SMS
 * - Your database (Supabase, Airtable, etc.)
 * - Email notifications
 * 
 * Deploy to: Vercel, Netlify Functions, Railway, etc.
 */

// Example using Vercel Serverless Functions + Supabase

import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

// Initialize Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { firstName, lastName, phone, consent, timestamp } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !phone || !consent) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }

    // Validate phone number format
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10 && cleanPhone.length !== 11) {
      return res.status(400).json({ 
        error: 'Invalid phone number format' 
      });
    }

    // Format phone number for Twilio (E.164 format)
    const formattedPhone = cleanPhone.length === 10 
      ? `+1${cleanPhone}` 
      : `+${cleanPhone}`;

    // Save to database
    const { data: subscriber, error: dbError } = await supabase
      .from('subscribers')
      .insert([
        {
          first_name: firstName,
          last_name: lastName,
          phone: formattedPhone,
          consent_given: true,
          consent_timestamp: timestamp || new Date().toISOString(),
          consent_ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          status: 'active',
          source: 'web_optin'
        }
      ])
      .select()
      .single();

    if (dbError) {
      // Check for duplicate phone number
      if (dbError.code === '23505') {
        return res.status(400).json({ 
          error: 'This phone number is already registered' 
        });
      }
      throw dbError;
    }

    // Send welcome SMS via Twilio
    try {
      await twilioClient.messages.create({
        to: formattedPhone,
        from: process.env.TWILIO_PHONE_NUMBER,
        body: `Welcome to CasRes, ${firstName}! You've successfully signed up for healthcare text reminders. Reply STOP to unsubscribe or HELP for assistance.`
      });
    } catch (twilioError) {
      console.error('Twilio error:', twilioError);
      // Continue even if SMS fails - we have the subscription
    }

    // Optional: Send email notification to admin
    // await sendAdminNotification(subscriber);

    // Success response
    return res.status(200).json({
      success: true,
      message: 'Successfully subscribed',
      subscriber: {
        id: subscriber.id,
        phone: formattedPhone
      }
    });

  } catch (error) {
    console.error('Error processing opt-in:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Database schema for Supabase:
/*

CREATE TABLE subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  consent_given BOOLEAN DEFAULT true,
  consent_timestamp TIMESTAMPTZ NOT NULL,
  consent_ip TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced')),
  source TEXT DEFAULT 'web_optin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_sent TIMESTAMPTZ,
  total_messages_sent INTEGER DEFAULT 0
);

-- Index for phone lookups
CREATE INDEX idx_subscribers_phone ON subscribers(phone);

-- Index for active subscribers
CREATE INDEX idx_subscribers_status ON subscribers(status) WHERE status = 'active';

*/
