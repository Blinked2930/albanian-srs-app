export async function GET() {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      
      // Ping the v1beta models endpoint directly
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Log the array of model objects to your terminal
      console.log("AVAILABLE MODELS:", JSON.stringify(data.models, null, 2));
  
      // Return it to the browser so you can read it easily
      return new Response(JSON.stringify(data.models, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
  
    } catch (error) {
      console.error("Failed to fetch models:", error);
      return new Response("Error fetching models", { status: 500 });
    }
  }