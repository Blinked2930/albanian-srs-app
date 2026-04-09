import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { word, context } = await req.json();

    if (!word) {
      return NextResponse.json({ error: "Word required" }, { status: 400 });
    }

    const prompt = `
      You are an Albanian-English dictionary API.
      Provide the English translation and the part of speech for the Albanian word "${word}" based on this context: "${context}".
      
      Respond STRICTLY in JSON format with no markdown formatting outside the JSON block.
      The "type" field must be exactly one of the following: Noun (M), Noun (F), Verb, Adjective, Adverb, Preposition, Phrase, Command, Unknown.

      {
        "english": "translation",
        "type": "Noun (M)" 
      }
    `;

    // Using the exact string from your API dump for maximum speed
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt);
    let text = await result.response.text();
    
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const defData = JSON.parse(text);

    return NextResponse.json(defData);
  } catch (error: any) {
    console.error("Quick Define Error:", error);
    return NextResponse.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
  }
}