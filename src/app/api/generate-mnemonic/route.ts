import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: Request) {
    try {
        const { albanian, english } = await request.json();

        if (!albanian || !english) {
            return NextResponse.json({ error: "Missing words for mnemonic generation." }, { status: 400 });
        }

        const prompt = `
      You are an expert memory coach utilizing the "Keyword Method" and advanced visual memory techniques. 
      Your goal is to help an English speaker memorize the Albanian word "${albanian}" which means "${english}".

      Create a vivid, bizarre, and highly memorable visual mnemonic. 
      
      Follow these exact steps:
      1. Sound-Alike (Keyword): Find an English word or phrase that sounds similar to the Albanian word "${albanian}".
      2. The Visual Link: Create a crazy, action-packed, or emotionally charged mental scene that forcibly links the sound-alike to the English meaning ("${english}"). 
      
      Keep it short, punchy, and highly visual. Do not explain the science, just give the memory trick.

      Format the output beautifully using markdown. For example:
      **Sound-Alike:** [English sounding words]
      **The Scene:** [The vivid 1-2 sentence story]
    `;

        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
        const result = await model.generateContent(prompt);

        return NextResponse.json({ mnemonic: result.response.text() });
    } catch (error: any) {
        console.error("Mnemonic Generation API Error:", error);
        return NextResponse.json({ 
            error: "Failed to generate mnemonic. There was an error with the AI API.",
            details: error.message 
        }, { status: 500 });
    }
}