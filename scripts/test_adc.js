import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

async function testADC() {
    console.error('[ODIN]: "Testing ADC Handshake..."');
    try {
        const ai = new GoogleGenAI({});
        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: 'Test connection. Respond with "ACK".'
        });
        console.log('Response:', result.text);
    } catch (error) {
        console.error('[CRITICAL]: ADC Handshake Failed.');
        console.error(error);
    }
}

testADC();
