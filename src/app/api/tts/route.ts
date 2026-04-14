import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
    const AZURE_REGION = process.env.AZURE_SPEECH_REGION;

    if (!AZURE_KEY || !AZURE_REGION) {
      return NextResponse.json({ error: 'Azure credentials missing' }, { status: 500 });
    }

    // Microsoft's Speech Synthesis Markup Language (SSML)
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="sq-AL">
        <voice name="sq-AL-IlirNeural">
          <prosody rate="0.9">
            ${text}
          </prosody>
        </voice>
      </speak>
    `;

    const response = await fetch(`https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'AlbanianSRSApp'
      },
      body: ssml,
    });

    if (!response.ok) {
      throw new Error(`Azure TTS returned ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('TTS Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}